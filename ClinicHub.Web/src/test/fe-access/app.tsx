import {configure, getConfig, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect, onTestFinished, vi} from "vitest";
import {http, HttpResponse} from "msw";
import type {LanguageCode} from "../../i18n/languages.ts";
import type {AuthResult, Context, Me} from "../../features/auth/types.ts";
import {aClinicContext, aMe, anAccessToken, anAuthResult} from "../data.ts";
import {api} from "../msw.ts";

/*
 * The whole app (App.tsx: BrowserRouter, AppProviders with its real QueryClient and 403 handling, AuthProvider, the
 * session store, the API client and its refresh interceptor) on a fresh copy of its modules, as on a page load. For the
 * session, lost-clinic and error-handling cases that a page rendered alone with a mocked `useAuth()` can't show.
 */

export type StartAppOptions = {
    /** The URL the page loads at (default "/") */
    route?: string;
    /** The UI language (default "en") */
    lang?: LanguageCode;
};

/**
 * Loads the app at `route` in `lang`. The page load restores the session with `POST /auth/refresh`: give its answer
 * with `server.use(...)` first (e.g. `sessionHandlers(...)`). Returns Testing Library's result plus `user`
 * (userEvent), `path()` (where the app is now) and `session` (the store module of this load).
 */
export const startApp = async ({route = "/", lang = "en"}: StartAppOptions = {}) => {
    vi.resetModules();
    // The first visit of a lazy page compiles its chunk: wait longer than Testing Library's 1 s for it
    const {asyncUtilTimeout} = getConfig();
    configure({asyncUtilTimeout: 10_000});
    onTestFinished(() => configure({asyncUtilTimeout}));
    window.history.replaceState(null, "", route);
    // The stored language choice is read when i18n starts (the language detector)
    localStorage.setItem("language", lang);
    const i18n = (await import("../../i18n/index.ts")).default;
    await i18n.changeLanguage(lang);
    const session = await import("../../features/auth/session.ts");
    const client = await import("../../api/client.ts");
    const {App} = await import("../../app/App.tsx");
    const result = render(<App/>);
    return {
        ...result,
        user: userEvent.setup({delay: null}),
        session,
        client,
        path: () => window.location.pathname,
    };
};

/** An access token of `userId` in a context (a different token per context, so a handler can tell them apart). */
export const tokenFor = (context: Context | null, userId = 1) =>
    anAccessToken(userId).replace("signature", `sig-${context === null ? "none" : context.type === "clinic" ? `clinic${context.clinicId}` : "platform"}`);

/** The `AuthResult` of `userId` in `context` with `contexts`, its token telling the context. */
export const sessionIn = (context: Context | null, contexts: Context[] = context ? [context] : [], userId = 1): AuthResult =>
    anAuthResult({userId, context, contexts, accessToken: tokenFor(context, userId)});

/** The context a request was sent in, from its token (see {@link tokenFor}): "clinic1", "platform", "none" or null. */
export const contextOfRequest = (request: Request) =>
    request.headers.get("Authorization")?.match(/sig-(\w+)$/)?.[1] ?? null;

/**
 * `POST /auth/refresh` answering `answers` one after another (the last one again after that): an `AuthResult`, or a
 * Response (e.g. `problem(401, "noContexts")`, `networkError()`).
 */
export const refreshSequence = (...answers: (AuthResult | Response | (() => Response))[]) => {
    let calls = 0;
    const handler = http.post(api("/auth/refresh"), () => {
        const answer = answers[Math.min(calls, answers.length - 1)];
        calls++;
        if (typeof answer === "function") return answer();
        return answer instanceof Response ? answer.clone() : HttpResponse.json(answer);
    });
    return {handler, calls: () => calls};
};

/** `GET /me` answering for the context of each request's token (`me(context)`), Owner of every clinic by default. */
export const meByContext = (me: (context: string | null) => Me = context => aMe({
    context: context?.startsWith("clinic") ? aClinicContext({clinicId: Number(context.slice(6))}) : context === "platform" ? {type: "platform"} : null,
})) => http.get(api("/me"), ({request}) => HttpResponse.json(me(contextOfRequest(request))));

/** Waits for the app to be at `path`. */
export const expectPath = async (path: string) => waitFor(() => expect(window.location.pathname).toBe(path));

/** Waits until a toast with exactly `text` shows. */
export const findToastText = async (text: string) => {
    await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
};

