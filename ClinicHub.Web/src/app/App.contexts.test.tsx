import {describe, expect, test} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aClinicContext,
    adminClinicsHandlers,
    aDrug,
    aMe,
    aPage,
    api,
    contextOfRequest,
    contextsHandler,
    protocolsHandlers,
    expectPath,
    isolate,
    meByContext,
    PLATFORM_CONTEXT,
    problem,
    recordPaths,
    recordRequests,
    refreshSequence,
    server,
    sessionIn,
    startApp,
    toastTexts,
    drugTreeHandler,
} from "../test";
import {installIntersectionObserver} from "../test/intersection.ts";
import type {AuthResult, Context} from "../features/auth/types.ts";

// Switching context: docs/features/auth/tech.md "Frontend" (SelectClinicPage, session.ts: switchSessionContext and the
// other user signed in from another tab), business.md «الرسائل التي تظهر للمستخدم».

const clinicA = aClinicContext({clinicId: 1, clinicName: "A"});
const clinicB = aClinicContext({clinicId: 2, clinicName: "B"});
const clinicU2 = aClinicContext({clinicId: 7, clinicName: "U2 clinic"});
const template = aClinicContext({clinicId: 9, clinicName: "Template", isTemplate: true, roles: []});
const otherUser = "سجّل مستخدم آخر الدخول من تبويب آخر، وهذا التبويب يستخدم حسابه الآن.";

/** `GET /me` of user 1 ("U1 name") or 2 ("U2 name"), by the request's token. */
const meOfUsers = () => http.get(api("/me"), ({request}) => {
    const token = request.headers.get("Authorization") ?? "";
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { sub: string };
    const ctx = contextOfRequest(request);
    const context: Context | null = ctx === "platform" ? PLATFORM_CONTEXT
        : ctx?.startsWith("clinic") ? aClinicContext({clinicId: Number(ctx.slice(6))}) : null;
    const id = Number(payload.sub);
    return HttpResponse.json(aMe({
        context,
        user: {id, phone: id === 1 ? "+201000000001" : "+201000000002", isSuperAdmin: ctx === "platform"},
        staff: context?.type === "clinic" ? {id, fullName: id === 1 ? "U1 name" : "U2 name"} : null,
    }));
});

/** The picker of user 1 with `contexts`, the switch answering `answer`. */
const openPicker = async (contexts: Context[], answer: () => Response) => {
    server.use(
        refreshSequence(sessionIn(null, contexts)).handler,
        meOfUsers(),
        contextsHandler(contexts),
        http.post(api("/auth/context"), answer),
    );
    const app = await startApp({route: "/select-clinic", lang: "ar"});
    const pick = async (name: string) => app.user.click(await screen.findByRole("button", {name: new RegExp(name)}));
    return {...app, pick};
};

describe("picking a clinic that can't be entered any more @area:auth", () => {
    test("suspended meanwhile: «العيادة «A» موقوفة.» and the user stays on the picker @AUTH-129", async () => {
        const app = await openPicker([clinicA, clinicB], () => problem(403, "clinicSuspended", {clinicNames: ["A"]}));
        await app.pick("^A$");
        await waitFor(() => expect(toastTexts()).toEqual([`العيادة «${isolate("A")}» موقوفة.`]));
        expect(app.path()).toBe("/select-clinic");
        expect(screen.getByRole("button", {name: /^A$/})).toBeEnabled();
    });

    test("deleted (or the user removed) meanwhile: «هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.» @AUTH-130", async () => {
        const app = await openPicker([clinicA, clinicB], () => problem(403, "noAccess"));
        await app.pick("^A$");
        await waitFor(() => expect(toastTexts()).toEqual(["هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك."]));
        expect(app.path()).toBe("/select-clinic");
    });

    test("deactivated in A meanwhile: «تم إيقاف حسابك في «A». تواصل مع مالك العيادة.» and the user stays on the picker @AUTH-131", async () => {
        const app = await openPicker([clinicA, clinicB], () => problem(403, "staffInactive", {clinicNames: ["A"]}));
        await app.pick("^A$");
        await waitFor(() => expect(toastTexts()).toEqual([`تم إيقاف حسابك في «${isolate("A")}». تواصل مع مالك العيادة.`]));
        expect(app.path()).toBe("/select-clinic");
    });
});

describe("a stale tab after another sign-in @area:auth", () => {
    test("same user logged out and in from tab 2: the switch is retried after the refresh and succeeds, no other-user toast @AUTH-202", async () => {
        const sameUser = sessionIn(null, [clinicA, clinicB]);
        let switches = 0;
        const app = await openPicker([clinicA, clinicB], () => {
            switches++;
            return switches === 1 ? problem(401, "unauthorized") : HttpResponse.json(sessionIn(clinicB, [clinicA, clinicB]));
        });
        server.use(
            refreshSequence(sessionIn(null, [clinicA, clinicB]), {...sameUser, accessToken: sameUser.accessToken.replace("sig-", "sig9-")}).handler,
            http.get(api("/drugs"), () => HttpResponse.json(aPage([aDrug()]))),
            drugTreeHandler([aDrug()]),
            http.get(api("/protocols"), () => HttpResponse.json(aPage([]))),
        );
        installIntersectionObserver();
        await app.pick("^B$");

        await expectPath("/");
        expect(switches).toBe(2);
        expect(await screen.findByTitle("B")).toBeInTheDocument();
        expect(screen.queryByText(otherUser)).not.toBeInTheDocument();
        expect(toastTexts()).toEqual([]);
    });

    /** User 1 (super admin) in the template, whose cookie now belongs to user 2 (signed in from another tab). */
    const staleTemplateTab = async (u2: AuthResult) => {
        const u1 = sessionIn(template, [PLATFORM_CONTEXT, template]);
        server.use(
            refreshSequence(u1, u2).handler,
            meOfUsers(),
            contextsHandler(u2.contexts),
            http.post(api("/auth/context"), () => problem(401, "unauthorized")),
            http.get(api("/drugs"), () => HttpResponse.json(aPage([aDrug({name: "Template drug"})]))),
        );
        const app = await startApp({route: "/drugs", lang: "ar"});
        await screen.findByText("Template drug");
        return app;
    };

    test("«العودة إلى إدارة المنصة»: the other-user toast and U2's home; the button opens no /admin and shows no error @AUTH-200", async () => {
        const requests = recordRequests();
        const app = await staleTemplateTab(sessionIn(null, [clinicU2, clinicB], 2));
        const paths = recordPaths();
        await app.user.click(screen.getByRole("button", {name: "العودة إلى إدارة المنصة"}));

        await expectPath("/select-clinic");
        await waitFor(() => expect(toastTexts()).toEqual([otherUser]));
        expect(requests.requests.filter(r => r.path === "/auth/context")).toHaveLength(1);
        expect(requests.requests.some(r => r.path.startsWith("/admin"))).toBe(false);
        // The button's own navigation is skipped: /admin is never opened, not even for the guard to move on from it
        expect(paths).toContain("/select-clinic");
        expect(paths.filter(path => path.startsWith("/admin"))).toEqual([]);
    });

    test("«تعديل العيادة النموذجية»: the other-user toast and U2's home, not /drugs, no error @AUTH-200", async () => {
        server.use(
            refreshSequence(sessionIn(PLATFORM_CONTEXT, [PLATFORM_CONTEXT, template]), sessionIn(null, [clinicU2, clinicB], 2)).handler,
            meOfUsers(),
            contextsHandler([clinicU2, clinicB]),
            ...adminClinicsHandlers([]),
            http.post(api("/auth/context"), () => problem(401, "unauthorized")),
        );
        const requests = recordRequests();
        const app = await startApp({route: "/admin", lang: "ar"});
        const button = await screen.findByRole("button", {name: "تعديل العيادة النموذجية"});
        const paths = recordPaths();
        await app.user.click(button);

        await expectPath("/select-clinic");
        await waitFor(() => expect(toastTexts()).toEqual([otherUser]));
        expect(requests.requests.filter(r => r.path === "/auth/context")).toHaveLength(1);
        expect(requests.requests.some(r => r.path === "/drugs")).toBe(false);
        // The button's own navigation is skipped: /drugs is never opened, not even for the guard to move on from it
        expect(paths).toContain("/select-clinic");
        expect(paths.filter(path => path.startsWith("/drugs"))).toEqual([]);
    });

    test("once the tab follows U2, U1's /me (name) never shows: /me is loaded again for U2 @AUTH-201", async () => {
        const requests = recordRequests();
        // U2 lands in a clinic with the same id as U1's template: only the change of user tells the cached /me apart
        const u2 = sessionIn(template, [template], 2);
        // U2's home is the prescription page, whose protocol picker loads the protocols and drug tree its tree
        server.use(...protocolsHandlers([]), drugTreeHandler([]));
        installIntersectionObserver();
        const app = await staleTemplateTab(u2);
        await app.user.click(screen.getByRole("button", {name: "الحساب"}));
        expect(within(await screen.findByRole("menu")).getByText("U1 name")).toBeInTheDocument();
        await app.user.keyboard("{Escape}");

        await app.user.click(screen.getByRole("button", {name: "العودة إلى إدارة المنصة"}));
        await waitFor(() => expect(toastTexts()).toEqual([otherUser]));
        await waitFor(() => expect(requests.requests.filter(r => r.path === "/me")).toHaveLength(2));
        await app.user.click(screen.getByRole("button", {name: "الحساب"}));
        const menu = await screen.findByRole("menu");
        expect(await within(menu).findByText("U2 name")).toBeInTheDocument();
        expect(screen.queryByText("U1 name")).not.toBeInTheDocument();
    });
});

describe("a page across a context switch @area:auth", () => {
    test("the drugs page with a search typed: after the switch to B it re-mounts, the search empty and B's list loaded @AUTH-179", async () => {
        server.use(
            refreshSequence(sessionIn(clinicA, [clinicA, clinicB])).handler,
            meByContext(),
            http.get(api("/drugs"), ({request}) => HttpResponse.json(aPage([
                aDrug({name: contextOfRequest(request) === "clinic2" ? "B drug" : "A drug"}),
            ]))),
        );
        const app = await startApp({route: "/drugs", lang: "ar"});
        await screen.findByText("A drug");
        const search = screen.getByPlaceholderText("ابحث عن دواء بالاسم…");
        await app.user.type(search, "Tob");
        expect(search).toHaveValue("Tob");

        act(() => app.session.setSession(sessionIn(clinicB, [clinicA, clinicB])));

        expect(await screen.findByText("B drug")).toBeInTheDocument();
        const remounted = screen.getByPlaceholderText("ابحث عن دواء بالاسم…");
        expect(remounted).not.toBe(search);
        expect(search).not.toBeInTheDocument();
        expect(remounted).toHaveValue("");
        expect(app.path()).toBe("/drugs");
    });
});
