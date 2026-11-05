import {beforeEach, describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {http, HttpResponse} from "msw";
import {
    aClinicContext,
    aClinicDetails,
    aDrug,
    adminClinicsHandlers,
    aMe,
    aPage,
    api,
    aPrintLayout,
    aPrintTemplate,
    aTemplateItem,
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
    printTemplateHandlers,
    problem,
    recordRequests,
    refreshSequence,
    server,
    sessionIn,
    startApp,
} from "../test";
import {installIntersectionObserver} from "../test/intersection.ts";
import type {Context} from "../features/auth/types.ts";

/*
 * The designer's exits that need the real session: contract § 3.8 (forced moves are never blocked, a confirmed exit doesn't
 * ask twice) and the router of § 3.8 under the whole app. The texts are written out: `startApp` loads its own i18n.
 */

const clinic = aClinicDetails({name: "Demo clinic"});
const template = aClinicContext({clinicId: 99, clinicName: "Template", isTemplate: true});
const otherClinic = aClinicContext({clinicId: 7, clinicName: "Other clinic"});
const url = api(`/admin/clinics/${clinic.id}/prescription-template`);
const tab = `/admin/clinics/${clinic.id}/print-template`;

const QUESTION = "You have unsaved changes. Do you want to leave?";

const saved = () => aPrintTemplate({
    layout: aPrintLayout({items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m"})]}),
});

const sessionOfSuperAdmin = (contexts: Context[] = [PLATFORM_CONTEXT, template]) => sessionIn(PLATFORM_CONTEXT, contexts);

const sheet = () => screen.findByRole("region", {name: "Sheet preview"});

/** The whole app at the tab, a saved template on the sheet, its manual input's X changed to 20. */
const dirtyDesigner = async (refreshAnswers: Parameters<typeof refreshSequence> = [sessionOfSuperAdmin()]) => {
    const refresh = refreshSequence(...refreshAnswers);
    server.use(refresh.handler, meByContext(), ...adminClinicsHandlers([clinic]), ...printTemplateHandlers(clinic.id, {template: saved()}));
    const app = await startApp({route: tab});
    const box = await within(await sheet()).findByRole("button", {name: "الاسم"});
    await app.user.click(box);
    const x = within(screen.getByRole("region", {name: "Settings"})).getByRole("textbox", {name: "X: from the left (mm)"});
    await app.user.clear(x);
    await app.user.type(x, "20");
    return {...app, refresh};
};

const save = (user: UserEvent) => user.click(screen.getByRole("button", {name: "Save"}));

const openMenu = async (user: UserEvent) => {
    await user.click(screen.getByRole("button", {name: "Account"}));
    await screen.findByRole("menu");
};

const answer = async (user: UserEvent, choice: "Cancel" | "Leave") => {
    const question = await screen.findByRole("dialog", {name: QUESTION});
    await user.click(within(question).getByRole("button", {name: choice}));
    // MUI hides the page from the accessibility tree until a closing dialog's exit transition ends
    await waitFor(() => expect(document.querySelector(".MuiDialog-root, .MuiMenu-root")).toBeNull());
};

beforeEach(() => void server.use(
    http.get(api("/auth/otp/mode"), () => HttpResponse.json({mode: "Sms"})),
    contextsHandler([otherClinic, template]),
    drugCategoriesHandler(),
));

const noQuestion = () => expect(screen.queryByRole("dialog", {name: QUESTION})).not.toBeInTheDocument();

describe("print template: a forced move is never blocked @area:admin", () => {
    test("the session lost (the refresh answers 401): the login page opens, with no question @TPL-249", async () => {
        const app = await dirtyDesigner([sessionOfSuperAdmin(), problem(401, "unauthorized")]);
        server.use(http.put(url, () => problem(401, "unauthorized")));
        await save(app.user);

        await expectPath("/login");
        expect(await screen.findByRole("button", {name: "Send code"})).toBeInTheDocument();
        noQuestion();
        expect(app.session.getSession()).toEqual({status: "anonymous"});
    });

    test("the context lost, no other left: the move's own message and the login page, no question @TPL-249", async () => {
        const app = await dirtyDesigner([sessionOfSuperAdmin(), problem(401, "noContexts")]);
        server.use(http.put(url, () => problem(401, "unauthorized")));
        await save(app.user);

        await expectPath("/login");
        await expectToasts(`You no longer have access to “${isolate("Platform admin")}” or to any other clinic.`);
        noQuestion();
    });

    test("the context lost, several left: the move's own message and the picker, no question @TPL-249", async () => {
        const app = await dirtyDesigner([sessionOfSuperAdmin(), sessionIn(null, [otherClinic, template])]);
        server.use(http.put(url, () => problem(401, "unauthorized")));
        await save(app.user);

        await expectPath("/select-clinic");
        await expectToasts(`You no longer have access to “${isolate("Platform admin")}”. Choose where to continue.`);
        noQuestion();
    });

    test("the context lost, one left: AuthProvider's own navigation opens that clinic, the message says so, no question @TPL-249", async () => {
        installIntersectionObserver();
        server.use(
            drugTreeHandler([]),
            http.get(api("/protocols"), () => HttpResponse.json(aPage([]))),
            http.get(api("/drugs"), () => HttpResponse.json(aPage([aDrug()]))),
        );
        const app = await dirtyDesigner([sessionOfSuperAdmin(), sessionIn(otherClinic, [otherClinic])]);
        server.use(http.put(url, () => problem(401, "unauthorized")));
        await save(app.user);

        await expectPath("/");
        await expectToasts(`You no longer have access to “${isolate("Platform admin")}”. You are now in “${isolate("Other clinic")}”.`);
        noQuestion();
        expect(screen.queryByRole("region", {name: "Sheet preview"})).not.toBeInTheDocument();
    });

    test("no longer a super admin (/me sees it after a 403): the move's own message, no question @TPL-249", async () => {
        let demoted = false;
        const app = await dirtyDesigner([sessionOfSuperAdmin(), problem(401, "unauthorized")]);
        server.use(
            http.put(url, () => {
                demoted = true;
                return problem(403, "forbidden");
            }),
            http.get(api("/me"), ({request}) => HttpResponse.json(demoted
                ? aMe({context: null, user: {isSuperAdmin: false}})
                : aMe({context: contextOfRequest(request) === "platform" ? PLATFORM_CONTEXT : null, user: {isSuperAdmin: true}}))),
        );
        await save(app.user);

        await expectPath("/login");
        await expectToasts(`You no longer have access to “${isolate("Platform admin")}”. Log in again to continue.`);
        noQuestion();
    });

    test("the same page without a forced move still asks: the session is the real one here @TPL-249 @TPL-232", async () => {
        const app = await dirtyDesigner();
        await app.user.click(screen.getByRole("tab", {name: "Overview"}));

        expect(await screen.findByRole("dialog", {name: QUESTION})).toBeInTheDocument();
        expect(app.path()).toBe(tab);
    });
});

describe("print template: leaving from the user menu, for real @area:admin", () => {
    test("logging out, staying: no logout request, still logged in, the edits stay @TPL-248", async () => {
        const app = await dirtyDesigner();
        const recorded = recordRequests();
        await openMenu(app.user);
        await app.user.click(screen.getByRole("menuitem", {name: "Log out"}));
        await answer(app.user, "Cancel");

        expect(recorded.requests.filter(r => r.path === "/auth/logout")).toEqual([]);
        expect(app.session.getSession().status).toBe("authenticated");
        expect(app.path()).toBe(tab);
        expect(screen.getByRole("textbox", {name: "X: from the left (mm)"})).toHaveValue("20");
    });

    test("logging out, leaving: the logout request, the login page, and no second question @TPL-248", async () => {
        const app = await dirtyDesigner();
        const recorded = recordRequests();
        server.use(http.post(api("/auth/logout"), () => new HttpResponse(null, {status: 204})));
        await openMenu(app.user);
        await app.user.click(screen.getByRole("menuitem", {name: "Log out"}));
        await answer(app.user, "Leave");

        await expectPath("/login");
        expect(await screen.findByRole("button", {name: "Send code"})).toBeInTheDocument();
        noQuestion();
        expect(recorded.requests.filter(r => r.path === "/auth/logout")).toHaveLength(1);
    });

    test("a logout that fails changes nothing: the screen stays unsaved and the next exit asks again @TPL-248", async () => {
        const app = await dirtyDesigner();
        server.use(http.post(api("/auth/logout"), () => networkError()));
        await openMenu(app.user);
        await app.user.click(screen.getByRole("menuitem", {name: "Log out"}));
        await answer(app.user, "Leave");

        await expectToasts("Can't reach the server. Check your connection.");
        expect(app.path()).toBe(tab);
        expect(screen.getByRole("textbox", {name: "X: from the left (mm)"})).toHaveValue("20");

        await app.user.click(screen.getByRole("tab", {name: "Overview"}));
        expect(await screen.findByRole("dialog", {name: QUESTION})).toBeInTheDocument();
    });

    test("switching clinic, leaving: the picker opens, and no second question @TPL-248", async () => {
        const app = await dirtyDesigner();
        await openMenu(app.user);
        await app.user.click(screen.getByRole("menuitem", {name: "Switch clinic"}));
        await answer(app.user, "Leave");

        await expectPath("/select-clinic");
        noQuestion();
    });

    test("nothing unsaved: logging out asks nothing @TPL-248", async () => {
        const refresh = refreshSequence(sessionOfSuperAdmin());
        server.use(
            refresh.handler, meByContext(), ...adminClinicsHandlers([clinic]), ...printTemplateHandlers(clinic.id, {template: saved()}),
            http.post(api("/auth/logout"), () => new HttpResponse(null, {status: 204})),
        );
        const app = await startApp({route: tab});
        await sheet();
        await openMenu(app.user);
        await app.user.click(screen.getByRole("menuitem", {name: "Log out"}));

        await expectPath("/login");
        noQuestion();
    });
});

describe("print template: «تعديل العيادة النموذجية», for real @area:admin", () => {
    test("staying: no switch, the edits stay @TPL-248", async () => {
        const app = await dirtyDesigner();
        const recorded = recordRequests();
        await app.user.click(screen.getByRole("button", {name: "Edit template clinic"}));
        await answer(app.user, "Cancel");

        expect(recorded.requests.filter(r => r.path === "/auth/context")).toEqual([]);
        expect(app.path()).toBe(tab);
        expect(screen.getByRole("textbox", {name: "X: from the left (mm)"})).toHaveValue("20");
    });

    test("leaving: the switch, then the template clinic's drugs, and no second question @TPL-248", async () => {
        const app = await dirtyDesigner();
        const recorded = recordRequests();
        server.use(
            http.post(api("/auth/context"), () => HttpResponse.json(sessionIn(template, [PLATFORM_CONTEXT, template]))),
            http.get(api("/drugs"), () => HttpResponse.json(aPage([aDrug({name: "Tobradex"})]))),
            // The session changes first: the routes may pass by the home page on their way
            http.get(api("/protocols"), () => HttpResponse.json(aPage([]))),
            drugTreeHandler([aDrug({name: "Tobradex"})]),
        );
        installIntersectionObserver();
        await app.user.click(screen.getByRole("button", {name: "Edit template clinic"}));
        await answer(app.user, "Leave");

        await expectPath("/drugs");
        noQuestion();
        expect(recorded.requests.filter(r => r.path === "/auth/context")).toHaveLength(1);
    });
});

describe("the data router under the whole app @area:admin", () => {
    test("each page load reads its own URL, also a second one in the same document @TPL-250", async () => {
        server.use(refreshSequence(sessionOfSuperAdmin()).handler, meByContext(), ...adminClinicsHandlers([clinic]), ...printTemplateHandlers(clinic.id, {template: saved()}));
        const first = await startApp({route: tab});
        await sheet();
        expect(first.path()).toBe(tab);
        first.unmount();

        const second = await startApp({route: `/admin/clinics/${clinic.id}`});
        expect(await screen.findByRole("tab", {name: "Overview", selected: true})).toBeInTheDocument();
        expect(second.path()).toBe(`/admin/clinics/${clinic.id}`);
    });
});
