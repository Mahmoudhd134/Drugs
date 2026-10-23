import {beforeEach, describe, expect, test, vi} from "vitest";
import {act, screen, waitFor} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import toast from "react-hot-toast";
import {pickCategory} from "../test/pages/drugDialog.ts";
import {
    aClinicContext,
    aDrug,
    aMe,
    aPage,
    api,
    contextOfRequest,
    contextsHandler,
    drugCategoriesHandler,
    drugTreeHandler,
    expectPath,
    expectToasts,
    isolate,
    meByContext,
    networkError,
    PLATFORM_CONTEXT,
    problem,
    recordRequests,
    refreshSequence,
    server,
    sessionIn,
    startApp,
    toastTexts,
} from "../test";
import {installIntersectionObserver} from "../test/intersection.ts";
import type {Context} from "../features/auth/types.ts";

// Losing the clinic mid-session (design D7): docs/features/auth/tech.md "Frontend" (Lost clinic, api/client.ts),
// docs/features/access/tech.md "Frontend" (403 handling), business.md «الرسائل التي تظهر للمستخدم».

const clinicA = aClinicContext({clinicId: 1, clinicName: "A"});
const clinicB = aClinicContext({clinicId: 2, clinicName: "B"});
const clinicC = aClinicContext({clinicId: 3, clinicName: "C"});

const lostChoose = `لم تعد لديك صلاحية دخول «${isolate("A")}». اختر أين تريد المتابعة.`;
const lostMoved = `لم تعد لديك صلاحية دخول «${isolate("A")}». أنت الآن في «${isolate("B")}».`;
const lostEnded = `لم تعد لديك صلاحية دخول «${isolate("A")}» ولا أي عيادة أخرى.`;

/** The drugs of each clinic, by the context of the request's token. */
const drugsByClinic = (names: Record<string, string>) =>
    http.get(api("/drugs"), ({request}) => HttpResponse.json(aPage([aDrug({name: names[contextOfRequest(request) ?? ""] ?? "?"})])));

/**
 * A user working on /drugs in clinic A (with `contexts`), whose next refresh answers `afterLoss`. Returns the app and
 * `addDrug()`, which saves a new drug (the action that meets the loss).
 */
const workInA = async (contexts: Context[], afterLoss: Parameters<typeof refreshSequence>[0], saveAnswer: () => Response) => {
    const refresh = refreshSequence(sessionIn(clinicA, contexts), afterLoss);
    server.use(
        refresh.handler,
        meByContext(),
        drugsByClinic({clinic1: "A drug", clinic2: "B drug", clinic3: "C drug"}),
        contextsHandler(contexts.filter(c => c !== clinicA)),
        http.post(api("/drugs"), saveAnswer),
        drugCategoriesHandler(),
        http.get(api("/protocols"), () => HttpResponse.json(aPage([]))),
        // The start page (the prescription) after a move to another clinic shows the drug tree
        drugTreeHandler([]),
    );
    installIntersectionObserver();
    const app = await startApp({route: "/drugs", lang: "ar"});
    await screen.findByText("A drug");
    const addDrug = async () => {
        await app.user.click(screen.getByRole("button", {name: "إضافة دواء"}));
        await app.user.click(await screen.findByRole("textbox", {name: /^الاسم/}));
        await app.user.paste("Vigamox");
        // A new drug needs a category (design M1.7 D3)
        await pickCategory(app.user, {scope: screen.getByRole("dialog")});
        await app.user.click(screen.getByRole("button", {name: "حفظ"}));
    };
    return {...app, refresh, addDrug};
};

// The drugs page reads the categories for its filters (M1.7c): answered here, as the tests answer /drugs themselves
beforeEach(() => void server.use(drugCategoriesHandler()));

describe("losing the clinic while working in it @area:auth", () => {
    test("suspended, with other places left: the clinic-lost message and the picker, never «هذه العيادة موقوفة.» / «العيادة «A» موقوفة.» @AUTH-185", async () => {
        const app = await workInA([clinicA, clinicB, clinicC], sessionIn(null, [clinicB, clinicC]), () => problem(403, "clinicSuspended"));
        await app.addDrug();

        await expectPath("/select-clinic");
        await expectToasts(lostChoose);
        expect(screen.queryByText("هذه العيادة موقوفة.")).not.toBeInTheDocument();
        expect(screen.queryByText(`العيادة «${isolate("A")}» موقوفة.`)).not.toBeInTheDocument();
        expect(await screen.findByText("C")).toBeInTheDocument();
    });

    test("deleted, with exactly one other clinic: the clinic-lost message and B's start page @AUTH-186", async () => {
        const app = await workInA([clinicA, clinicB], sessionIn(clinicB, [clinicB]), () => problem(403, "noAccess"));
        await app.addDrug();

        await expectToasts(lostMoved);
        await expectPath("/");
        expect(screen.getByTitle("B")).toBeInTheDocument();
    });

    test("removed, with no other place: the clinic-lost message and /login @AUTH-187", async () => {
        server.use(http.get(api("/auth/otp/mode"), () => HttpResponse.json({mode: "Sms"})));
        const app = await workInA([clinicA], problem(401, "noContexts"), () => problem(403, "noAccess"));
        await app.addDrug();

        await expectPath("/login");
        await expectToasts(lostEnded);
        expect(app.session.getSession()).toEqual({status: "anonymous"});
    });

    test("the failing save's own error toast is dismissed: only the clinic-lost message shows @AUTH-188", async () => {
        const errorToast = vi.spyOn(toast, "error");
        const app = await workInA([clinicA, clinicB, clinicC], sessionIn(null, [clinicB, clinicC]), () => problem(403, "noAccess"));
        await app.addDrug();

        await waitFor(() => expect(errorToast).toHaveBeenCalledWith("هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك."));
        await expectToasts(lostChoose);
    });

    test("a save refused because the clinic is lost is not replayed in the clinic the user is moved to @AUTH-189", async () => {
        const app = await workInA([clinicA, clinicB], sessionIn(clinicB, [clinicB]), () => problem(403, "noAccess"));
        const requests = recordRequests();
        await app.addDrug();

        await expectToasts(lostMoved);
        const posts = requests.requests.filter(r => r.method !== "GET" && !r.path.startsWith("/auth/"));
        expect(posts).toEqual([expect.objectContaining({method: "POST", path: "/drugs"})]);
        expect(app.refresh.calls()).toBe(2);
    });

    test("re-added under a new staff record: the 403 noAccess is refreshed and the save replayed once, silently @AUTH-190", async () => {
        const fresh = {...sessionIn(clinicA, [clinicA, clinicB]), accessToken: sessionIn(clinicA).accessToken.replace("sig-", "sig2-")};
        const authorizations: string[] = [];
        const app = await workInA([clinicA, clinicB], fresh, () => problem(403, "noAccess"));
        server.use(http.post(api("/drugs"), async ({request}) => {
            authorizations.push(request.headers.get("Authorization") ?? "");
            return request.headers.get("Authorization") === `Bearer ${fresh.accessToken}`
                ? HttpResponse.json(aDrug({name: "Vigamox"}), {status: 201})
                : problem(403, "noAccess");
        }));
        await app.addDrug();

        await expectToasts("تمت إضافة الدواء");
        expect(authorizations).toEqual([`Bearer ${sessionIn(clinicA).accessToken}`, `Bearer ${fresh.accessToken}`]);
        expect(app.path()).toBe("/drugs");
        expect(app.session.getSession().status).toBe("authenticated");
    });

    // Handled like `forbidden` (auth tech.md "Frontend", Lost clinic; access tech.md "Frontend", 403 handling): the toast
    // of the error's own code (`errors.noAccess`) and /me reloaded
    const noAccessRefreshFails = async (lang: "ar" | "en") => {
        const requests = recordRequests();
        server.use(
            refreshSequence(sessionIn(clinicA, [clinicA, clinicB]), networkError()).handler,
            meByContext(),
            http.get(api("/drugs"), () => problem(403, "noAccess")),
        );
        const app = await startApp({route: "/drugs", lang});
        return {...app, requests};
    };

    test("a 403 noAccess whose refresh fails (API unreachable): «هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.» once, /me reloaded, still logged in @AUTH-191", async () => {
        const app = await noAccessRefreshFails("ar");

        await expectToasts("هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.");
        await waitFor(() => expect(app.requests.requests.filter(r => r.path === "/me").length).toBeGreaterThanOrEqual(2));
        expect(app.session.getSession().status).toBe("authenticated");
        expect(app.path()).toBe("/drugs");
        expect(toastTexts()).toEqual(["هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك."]);
    });

    test("in English: \"This number has no access. Ask your clinic to add you.\" @AUTH-191", async () => {
        await noAccessRefreshFails("en");
        await expectToasts("This number has no access. Ask your clinic to add you.");
    });

    test("tab 1 switched the session to B: a request of this tab (still on A) that needs a refresh fails, isn't replayed in B, and no clinic-lost message shows @AUTH-194", async () => {
        const app = await workInA([clinicA, clinicB], sessionIn(clinicB, [clinicA, clinicB]), () => problem(401, "unauthorized"));
        const requests = recordRequests();
        await app.addDrug();

        // This tab follows the session into B (its pages re-mount there)
        expect(await screen.findByText("B drug")).toBeInTheDocument();
        expect(requests.requests.filter(r => r.method === "POST" && r.path === "/drugs")).toHaveLength(1);
        expect(screen.queryByText(/لم تعد لديك صلاحية دخول/)).not.toBeInTheDocument();
        expect(toastTexts().some(text => text.includes("لم تعد لديك صلاحية دخول"))).toBe(false);
    });

    test("a 403 about a context already left is ignored: no toast, no navigation @AUTH-195", async () => {
        // While A's list loads, another tab moves the session to B: the 403's refresh brings B (A still listed)
        server.use(
            refreshSequence(sessionIn(clinicA, [clinicA, clinicB]), sessionIn(clinicB, [clinicA, clinicB])).handler,
            meByContext(),
            http.get(api("/drugs"), ({request}) => (contextOfRequest(request) === "clinic1"
                ? problem(403, "noAccess")
                : HttpResponse.json(aPage([aDrug({name: "B drug"})])))),
        );
        const app = await startApp({route: "/drugs", lang: "ar"});

        expect(await screen.findByText("B drug")).toBeInTheDocument();
        expect(app.path()).toBe("/drugs");
        // Let any late handling run
        await act(() => new Promise(resolve => setTimeout(resolve, 20)));
        expect(toastTexts()).toEqual([]);
        expect(app.path()).toBe("/drugs");
    });

    test("a super admin removed from the platform's settings: «…«إدارة المنصة». سجّل الدخول من جديد للمتابعة.» and /login @AUTH-196", async () => {
        let meCalls = 0;
        server.use(
            refreshSequence(sessionIn(PLATFORM_CONTEXT, [PLATFORM_CONTEXT]), problem(401, "unauthorized")).handler,
            http.get(api("/auth/otp/mode"), () => HttpResponse.json({mode: "Sms"})),
            // No longer a super admin (API restarted without the phone): the admin API refuses, /me no longer sees the platform
            http.get(api("/me"), () => HttpResponse.json(++meCalls === 1
                ? aMe({context: PLATFORM_CONTEXT, user: {isSuperAdmin: true}})
                : aMe({context: null, user: {isSuperAdmin: false}}))),
            http.get(api("/admin/clinics"), () => problem(403, "forbidden")),
        );
        const app = await startApp({route: "/admin", lang: "ar"});

        await expectPath("/login");
        await expectToasts(`لم تعد لديك صلاحية دخول «${isolate("إدارة المنصة")}». سجّل الدخول من جديد للمتابعة.`);
        expect(app.session.getSession()).toEqual({status: "anonymous"});
    });
});

describe("isolation across a context switch @area:isolation", () => {
    test("a slow query of clinic A answering after the switch to B never renders in B @ISO-041 @smoke", async () => {
        let answerA!: () => void;
        const aAnswered = new Promise<void>(resolve => (answerA = resolve));
        let aStarted = false;
        server.use(
            refreshSequence(sessionIn(clinicA, [clinicA, clinicB])).handler,
            meByContext(),
            http.get(api("/drugs"), async ({request}) => {
                if (contextOfRequest(request) !== "clinic1") return HttpResponse.json(aPage([aDrug({name: "B drug"})]));
                aStarted = true;
                await aAnswered;
                return HttpResponse.json(aPage([aDrug({name: "A secret drug"})]));
            }),
        );
        const app = await startApp({route: "/drugs", lang: "ar"});
        await waitFor(() => expect(aStarted).toBe(true));

        act(() => app.session.setSession(sessionIn(clinicB, [clinicA, clinicB])));
        expect(await screen.findByText("B drug")).toBeInTheDocument();
        answerA();
        await act(() => new Promise(resolve => setTimeout(resolve, 50)));

        expect(screen.queryByText("A secret drug")).not.toBeInTheDocument();
        expect(screen.getByText("B drug")).toBeInTheDocument();
        expect(screen.getByTitle("B")).toBeInTheDocument();
    });
});
