import {beforeEach, describe, expect, test} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aClinicContext,
    aDrug,
    aMe,
    aPage,
    api,
    contextOfRequest,
    meByContext,
    networkError,
    problem,
    recordRequests,
    refreshSequence,
    server,
    sessionIn,
    startApp,
    toastTexts,
    drugCategoriesHandler,
} from "../test";
import {installIntersectionObserver} from "../test/intersection.ts";

// Permissions and errors in the running app: docs/features/access/tech.md "Frontend" (RequirePermission, 403
// handling in AppProviders, usePermissions), docs/tech/overview.md "Data fetching" (retries).

const clinicA = aClinicContext({clinicId: 1, clinicName: "A"});
const clinicB = aClinicContext({clinicId: 2, clinicName: "B"});

const drugsOk = () => http.get(api("/drugs"), () => HttpResponse.json(aPage([aDrug({name: "Tobradex"})])));

// The drugs page reads the categories for its filters (M1.7c): answered here, as the tests answer /drugs themselves
beforeEach(() => void server.use(drugCategoriesHandler()));

describe("permissions in the app @area:access", () => {
    /** /drugs while /me fails; `retry()` makes /me answer (held until `release()`) and presses «إعادة المحاولة». */
    const meFailsThenRecovers = async () => {
        let meAnswer: "fail" | "hold" = "fail";
        let release!: () => void;
        const held = new Promise<void>(resolve => (release = resolve));
        server.use(
            refreshSequence(sessionIn(clinicA)).handler,
            drugsOk(),
            http.get(api("/me"), async () => {
                if (meAnswer === "fail") return networkError();
                await held;
                return HttpResponse.json(aMe({context: clinicA}));
            }),
        );
        const app = await startApp({route: "/drugs?view=list", lang: "ar"});
        expect(await screen.findByText("تعذّر تحميل البيانات.")).toBeInTheDocument();
        expect(screen.queryByText("لا توجد صلاحية")).not.toBeInTheDocument();
        const button = screen.getByRole("button", {name: "إعادة المحاولة"});
        const retry = async () => {
            meAnswer = "hold";
            await app.user.click(button);
        };
        return {button, retry, release};
    };

    test("/me fails: the load error with «إعادة المحاولة», not the no-permission page; Retry loads it again and recovers @ACC-072", async () => {
        const {retry, release} = await meFailsThenRecovers();
        await retry();
        expect(await screen.findByRole("progressbar")).toBeInTheDocument();
        expect(screen.queryByText("لا توجد صلاحية")).not.toBeInTheDocument();
        release();
        expect(await screen.findByText("Tobradex")).toBeInTheDocument();
        expect(screen.queryByText("تعذّر تحميل البيانات.")).not.toBeInTheDocument();
    });

    test("Retry shows its own progress: the load error stays, its «إعادة المحاولة» loading, until /me answers @ACC-072", async () => {
        const {button, retry, release} = await meFailsThenRecovers();
        await retry();
        // The load error stays, its «إعادة المحاولة» showing progress (MUI loading button: disabled, a spinner inside).
        // The answer is held, so the state is stable: a short wait is enough.
        await waitFor(() => expect(button).toBeDisabled(), {timeout: 3000});
        expect(within(button).getByRole("progressbar")).toBeInTheDocument();
        expect(screen.getByText("تعذّر تحميل البيانات.")).toBeInTheDocument();
        release();
        expect(await screen.findByText("Tobradex")).toBeInTheDocument();
    });

    test("several queries answering 403 forbidden at once show one toast, and /me is reloaded @ACC-077", async () => {
        server.use(
            refreshSequence(sessionIn(clinicA)).handler,
            meByContext(),
            http.get(api("/drugs/tree"), () => problem(403, "forbidden")),
            http.get(api("/protocols"), () => problem(403, "forbidden")),
        );
        const requests = recordRequests();
        installIntersectionObserver();
        await startApp({route: "/", lang: "ar"});

        await waitFor(() => expect(toastTexts()).toEqual(["غير مسموح لك بهذا الإجراء."]));
        await waitFor(() => expect(requests.requests.filter(r => r.path === "/me").length).toBeGreaterThanOrEqual(2));
        // The drug tree and the protocol picker failed, still one toast
        expect(requests.requests.filter(r => r.path === "/drugs/tree")).toHaveLength(1);
        expect(requests.requests.filter(r => r.path === "/protocols")).toHaveLength(1);
        await act(() => new Promise(resolve => setTimeout(resolve, 20)));
        expect(toastTexts()).toHaveLength(1);
    });

    test("on a context switch the permissions are the new context's /me, none of the old clinic's @ACC-078", async () => {
        server.use(
            refreshSequence(sessionIn(clinicA, [clinicA, clinicB])).handler,
            drugsOk(),
            meByContext(context => context === "clinic2"
                ? aMe({context: clinicB, permissions: ["drugs.list"]})
                : aMe({context: clinicA})),
        );
        const app = await startApp({route: "/drugs?view=list", lang: "ar"});
        await screen.findByText("Tobradex");
        const nav = () => within(screen.getAllByRole("navigation", {name: "القائمة الرئيسية"})[0]);
        expect(nav().getAllByRole("link").map(link => link.textContent)).toEqual(["الروشتة", "البروتوكولات", "الأدوية"]);
        expect(screen.getByRole("button", {name: "إضافة دواء"})).toBeInTheDocument();

        act(() => app.session.setSession(sessionIn(clinicB, [clinicA, clinicB])));

        await waitFor(() => expect(nav().getAllByRole("link").map(link => link.textContent)).toEqual(["الأدوية"]));
        expect(await screen.findByText("Tobradex")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "إضافة دواء"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "حذف"})).not.toBeInTheDocument();
    });
});

describe("query retries @area:errors", () => {
    /** Loads /drugs with the list answering `answer`; returns how many times it was asked. */
    const loadDrugs = async (answer: () => Response) => {
        let calls = 0;
        server.use(
            refreshSequence(sessionIn(clinicA)).handler,
            meByContext(),
            http.get(api("/drugs"), ({request}) => {
                if (contextOfRequest(request) === "clinic1") calls++;
                return answer();
            }),
        );
        await startApp({route: "/drugs?view=list", lang: "ar"});
        await screen.findByText("تعذّر تحميل البيانات.");
        return calls;
    };

    test("a network error is retried once @ERR-032", async () => {
        expect(await loadDrugs(() => networkError())).toBe(2);
    });

    test("a 5xx is retried once @ERR-032", async () => {
        expect(await loadDrugs(() => problem(500, "unexpected"))).toBe(2);
    });

    test("a 4xx is not retried @ERR-032", async () => {
        expect(await loadDrugs(() => problem(404, "notFound"))).toBe(1);
    });
});
