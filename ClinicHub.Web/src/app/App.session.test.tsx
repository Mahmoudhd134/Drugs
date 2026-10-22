import {describe, expect, test} from "vitest";
import {act, screen, waitFor} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {pickCategory} from "../test/pages/drugDialog.ts";
import {
    aClinicContext,
    aDrug,
    aProtocol,
    anAccessToken,
    aPage,
    api,
    drugCategoriesHandler,
    expectPath,
    expectToasts,
    meByContext,
    networkError,
    problem,
    recordRequests,
    refreshSequence,
    server,
    sessionIn,
    startApp,
    toastTexts,
} from "../test";

// The session in the running app: docs/features/auth/tech.md "Frontend" (session.ts, api/client.ts, AuthProvider,
// RequireAuth), docs/tech/overview.md "Data fetching".

const clinicA = aClinicContext({clinicId: 1, clinicName: "Clinic A"});

describe("staying logged in @area:auth", () => {
    test("an expired access token: the request answering 401 is refreshed once and retried, the user sees the data @AUTH-163 @smoke", async () => {
        const stale = sessionIn(clinicA);
        const fresh = {...stale, accessToken: anAccessToken(1).replace("signature", "fresh")};
        const refresh = refreshSequence(stale, fresh);
        let drugCalls = 0;
        server.use(
            refresh.handler,
            meByContext(),
            http.get(api("/drugs"), ({request}) => {
                drugCalls++;
                return request.headers.get("Authorization") === `Bearer ${fresh.accessToken}`
                    ? HttpResponse.json(aPage([aDrug({name: "Tobradex"})]))
                    : problem(401, "unauthorized");
            }),
        );
        await startApp({route: "/drugs"});

        expect(await screen.findByText("Tobradex")).toBeInTheDocument();
        // Page load + the one refresh of the 401
        expect(refresh.calls()).toBe(2);
        expect(drugCalls).toBe(2);
        expect(window.location.pathname).toBe("/drugs");
    });

    test("several requests answering 401 at once share one refresh, and each is retried once @AUTH-164", async () => {
        const stale = sessionIn(clinicA);
        const fresh = {...stale, accessToken: anAccessToken(1).replace("signature", "fresh")};
        const refresh = refreshSequence(stale, fresh);
        const isFresh = (request: Request) => request.headers.get("Authorization") === `Bearer ${fresh.accessToken}`;
        // The prescription page loads both pickers at once
        server.use(
            refresh.handler,
            meByContext(),
            http.get(api("/drugs"), ({request}) =>
                (isFresh(request) ? HttpResponse.json(aPage([aDrug({name: "Tobradex"})])) : problem(401, "unauthorized"))),
            http.get(api("/protocols"), ({request}) =>
                (isFresh(request) ? HttpResponse.json(aPage([aProtocol({name: "Post cataract"})])) : problem(401, "unauthorized"))),
        );
        const requests = recordRequests();
        await startApp({route: "/"});

        expect(await screen.findByText("Post cataract")).toBeInTheDocument();
        await waitFor(() => expect(requests.requests.filter(r => r.path === "/drugs")).toHaveLength(2));
        expect(refresh.calls()).toBe(2);
        expect(requests.requests.filter(r => r.path === "/protocols")).toHaveLength(2);
    });

    test("the refresh answers 5xx at page load: the offline screen, not the login page, and the session is kept @AUTH-175", async () => {
        const refresh = refreshSequence(problem(500, "unexpected"));
        server.use(refresh.handler);
        const requests = recordRequests();
        const app = await startApp({route: "/drugs", lang: "ar"});

        expect(await screen.findByText("تعذّر الاتصال بالخادم. تحقّق من الاتصال.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "إعادة المحاولة"})).toBeInTheDocument();
        expect(app.path()).toBe("/drugs");
        expect(screen.queryByRole("button", {name: "إرسال الكود"})).not.toBeInTheDocument();
        // Nothing ended the session (the cookie is only cleared by a 401 refresh or a logout)
        expect(requests.requests.map(r => r.path)).toEqual(["/auth/refresh"]);
        expect(app.session.getSession()).toEqual({status: "offline"});
    });

    test("the API unreachable mid-session: the action shows its own error and the user stays logged in @AUTH-176", async () => {
        server.use(
            refreshSequence(sessionIn(clinicA)).handler,
            meByContext(),
            http.get(api("/drugs"), () => HttpResponse.json(aPage([aDrug({name: "Tobradex"})]))),
            http.post(api("/drugs"), () => networkError()),
            drugCategoriesHandler(),
        );
        const app = await startApp({route: "/drugs", lang: "ar"});
        await screen.findByText("Tobradex");

        await app.user.click(screen.getByRole("button", {name: "إضافة دواء"}));
        await app.user.click(await screen.findByRole("textbox", {name: /^الاسم/}));
        await app.user.paste("Vigamox");
        // A new drug needs a category (design M1.7 D3)
        await pickCategory(app.user, {scope: screen.getByRole("dialog")});
        await app.user.click(screen.getByRole("button", {name: "حفظ"}));

        await expectToasts("تعذّر الاتصال بالخادم. تحقّق من الاتصال.");
        expect(app.session.getSession().status).toBe("authenticated");
        expect(app.path()).toBe("/drugs");
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
});

describe("logging out @area:auth", () => {
    test("logged out in another tab: this tab works until its next refresh mid-session, which opens /login with no message @AUTH-159", async () => {
        // The page load's refresh works; the other tab's logout ends the session, so the next refresh answers 401
        const refresh = refreshSequence(sessionIn(clinicA), problem(401, "unauthorized"));
        server.use(
            refresh.handler,
            meByContext(),
            http.get(api("/drugs"), () => HttpResponse.json(aPage([aDrug({name: "Tobradex"})]))),
            http.get(api("/protocols"), () => problem(401, "unauthorized")),
            http.get(api("/auth/otp/mode"), () => HttpResponse.json({mode: "Sms"})),
        );
        const app = await startApp({route: "/drugs", lang: "ar"});
        expect(await screen.findByText("Tobradex")).toBeInTheDocument();

        // The next call answers 401 (the access token gone stale): the in-session refresh, not a page load
        await app.user.click(screen.getAllByRole("link", {name: "البروتوكولات"})[0]);

        await expectPath("/login");
        expect(refresh.calls()).toBe(2);
        expect(await screen.findByRole("button", {name: "إرسال الكود"})).toBeInTheDocument();
        expect(app.session.getSession()).toEqual({status: "anonymous"});
        // No message: neither a toast (the clinic-loss toasts are shown in a later task) nor an alert on the login page
        await act(() => new Promise(resolve => setTimeout(resolve, 100)));
        expect(toastTexts()).toEqual([]);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test("the API unreachable: the user stays logged in and sees an error @AUTH-157", async () => {
        server.use(
            refreshSequence(sessionIn(clinicA)).handler,
            meByContext(),
            http.get(api("/drugs"), () => HttpResponse.json(aPage([aDrug({name: "Tobradex"})]))),
            http.post(api("/auth/logout"), () => networkError()),
        );
        const app = await startApp({route: "/drugs", lang: "ar"});
        await screen.findByText("Tobradex");

        await app.user.click(screen.getByRole("button", {name: "الحساب"}));
        await app.user.click(await screen.findByRole("menuitem", {name: "تسجيل الخروج"}));

        await expectToasts("تعذّر الاتصال بالخادم. تحقّق من الاتصال.");
        expect(app.session.getSession().status).toBe("authenticated");
        await expectPath("/drugs");
        expect(screen.getByText("Tobradex")).toBeInTheDocument();
    });
});
