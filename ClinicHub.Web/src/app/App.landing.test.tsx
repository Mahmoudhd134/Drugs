import {describe, expect, test} from "vitest";
import {screen} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aClinicContext,
    adminClinicsHandlers,
    api,
    contextsHandler,
    drugGroupsHandlers,
    drugsHandlers,
    expectPath,
    meByContext,
    PLATFORM_CONTEXT,
    problem,
    recordPaths,
    refreshSequence,
    server,
    sessionIn,
    startApp,
} from "../test";
import type {AuthResult, Context} from "../features/auth/types.ts";

// Where the login lands: docs/features/auth/tech.md "Frontend" (LoginPage: a logged-in user is sent to the context's
// home; after login it reopens the page the user came from only when the login lands in a clinic context and the page
// is inside the clinic app; RequireAuth). The e2e twins run the same flows in a browser.

const clinicA = aClinicContext({clinicId: 1, clinicName: "Clinic A"});
const clinicB = aClinicContext({clinicId: 2, clinicName: "Clinic B"});

/** The handlers every home page needs: the prescription page's pickers, the clinics list, the picker's contexts. */
const homePages = (contexts: Context[]) => [
    meByContext(),
    ...drugsHandlers([]),
    ...drugGroupsHandlers([]),
    ...adminClinicsHandlers([]),
    contextsHandler(contexts),
];

/**
 * An anonymous visitor opening `route` (sent to /login) who logs in (display mode: the shown code is submitted by
 * itself) as `auth`. Returns every path the app opened from the moment the code was asked for.
 */
const logInFrom = async (route: string, auth: AuthResult) => {
    server.use(
        refreshSequence(problem(401, "unauthorized")).handler,
        http.get(api("/auth/otp/mode"), () => HttpResponse.json({mode: "Display"})),
        http.post(api("/auth/otp/request"), () => HttpResponse.json({expiresInSeconds: 300, resendAfterSeconds: 60, devCode: "123456"})),
        http.post(api("/auth/otp/verify"), () => HttpResponse.json(auth)),
        ...homePages(auth.contexts),
    );
    const app = await startApp({route, lang: "ar"});
    await expectPath("/login");
    await app.user.type(await screen.findByRole("textbox", {name: /رقم الموبايل/}), "01001234567");
    const paths = recordPaths();
    await app.user.click(screen.getByRole("button", {name: "إرسال الكود"}));
    return {app, paths};
};

describe("where the login lands @area:auth", () => {
    test("opened /drugs?q=amox, the login lands in a clinic: /drugs?q=amox opens, the home / never opened @AUTH-169", async () => {
        const {paths} = await logInFrom("/drugs?q=amox", sessionIn(clinicA));

        expect(await screen.findByRole("heading", {name: "الأدوية"})).toBeInTheDocument();
        await expectPath("/drugs");
        expect(window.location.search).toBe("?q=amox");
        expect(paths).not.toContain("/");
    });

    test("opened /drugs, the login lands on the picker (several clinics): /select-clinic, /drugs never reopened @AUTH-170", async () => {
        const {app, paths} = await logInFrom("/drugs", sessionIn(null, [clinicA, clinicB]));

        await expectPath("/select-clinic");
        expect(await screen.findByRole("button", {name: /Clinic B/})).toBeInTheDocument();
        expect(app.session.getSession().status).toBe("authenticated");
        expect(paths.filter(path => path.startsWith("/drugs"))).toEqual([]);
    });

    test("opened /admin/clinics/5, the login lands in a clinic: its home /, the admin page never reopened @AUTH-170", async () => {
        const {paths} = await logInFrom("/admin/clinics/5", sessionIn(clinicA));

        await expectPath("/");
        expect(paths.filter(path => path.startsWith("/admin"))).toEqual([]);
    });

    test("opened /admin/clinics/5, a super admin lands in the platform: its home /admin, not the remembered page @AUTH-170", async () => {
        const {paths} = await logInFrom("/admin/clinics/5", sessionIn(PLATFORM_CONTEXT, [PLATFORM_CONTEXT]));

        await expectPath("/admin");
        expect(paths.filter(path => path.startsWith("/admin/clinics"))).toEqual([]);
    });
});

describe("/login when logged in @area:auth", () => {
    test.each([
        ["a clinic", "/", sessionIn(clinicA)],
        ["the platform", "/admin", sessionIn(PLATFORM_CONTEXT, [PLATFORM_CONTEXT])],
        ["no context yet", "/select-clinic", sessionIn(null, [clinicA, clinicB])],
    ] as const)("in %s: /login opens the context's home %s, no login form @AUTH-172", async (_name, home, auth) => {
        server.use(
            refreshSequence(auth).handler,
            http.get(api("/auth/otp/mode"), () => HttpResponse.json({mode: "Sms"})),
            ...homePages(auth.contexts),
        );
        const app = await startApp({route: "/login", lang: "ar"});

        await expectPath(home);
        expect(app.session.getSession().status).toBe("authenticated");
        expect(screen.queryByRole("button", {name: "إرسال الكود"})).not.toBeInTheDocument();
    });
});
