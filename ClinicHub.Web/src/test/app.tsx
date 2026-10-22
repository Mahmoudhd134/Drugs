import {render, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect, vi} from "vitest";
import {http, HttpResponse} from "msw";
import type {LanguageCode} from "../i18n/languages.ts";
import type {AuthResult, Context, Me} from "../features/auth/types.ts";
import {type ClipboardOptions, stubClipboard} from "./clipboard.ts";
import {aClinicContext, aMe, anAccessToken, anAuthResult} from "./data.ts";
import {api} from "./msw.ts";

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
    /** A stubbed async clipboard and execCommand (see stubClipboard), returned as `clipboard` */
    clipboard?: ClipboardOptions;
};

/**
 * The pages App.tsx (and the clinic tabs) load lazily. startApp loads them with the app, so that on a busy machine a
 * test's waits are not spent loading a page's modules (they stay lazy routes: React.lazy finds them loaded).
 */
const LAZY_PAGES = [
    () => import("../features/auth/pages/LoginPage.tsx"),
    () => import("../features/auth/pages/SelectClinicPage.tsx"),
    () => import("../features/admin/pages/ClinicsPage.tsx"),
    () => import("../features/admin/pages/CreateClinicPage.tsx"),
    () => import("../features/admin/pages/ClinicPage.tsx"),
    () => import("../features/admin/components/ClinicRolesTab.tsx"),
    () => import("../features/admin/components/ClinicStaffTab.tsx"),
    () => import("../features/prescription/pages/PrescriptionPage.tsx"),
    () => import("../features/drugs/pages/DrugsPage.tsx"),
    () => import("../features/protocols/pages/ProtocolsPage.tsx"),
    () => import("../features/protocols/pages/ProtocolEditorPage.tsx"),
];

/**
 * Loads the app at `route` in `lang`. The page load restores the session with `POST /auth/refresh`: give its answer
 * with `server.use(...)` first (e.g. `refreshSequence(...).handler`). Returns Testing Library's result plus `user`
 * (userEvent), `path()` (where the app is now), `session` and `client` (the store and API client modules of this load).
 */
export const startApp = async ({route = "/", lang = "en", clipboard}: StartAppOptions = {}) => {
    vi.resetModules();
    window.history.replaceState(null, "", route);
    // The stored language choice is read when i18n starts (the language detector)
    localStorage.setItem("language", lang);
    const i18n = (await import("../i18n/index.ts")).default;
    await i18n.changeLanguage(lang);
    const session = await import("../features/auth/session.ts");
    const client = await import("../api/client.ts");
    const {App} = await import("../app/App.tsx");
    await Promise.all(LAZY_PAGES.map(load => load()));
    const result = render(<App/>);
    const user = userEvent.setup({delay: null});
    return {
        ...result,
        user,
        /** The stubbed clipboard (`clipboard` option; installed after userEvent.setup(), which installs its own) */
        clipboard: clipboard ? stubClipboard(clipboard) : undefined,
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
    // A platform context belongs to a super admin (the app treats anything else as a lost platform context)
    user: {isSuperAdmin: context === "platform"},
})) => http.get(api("/me"), ({request}) => HttpResponse.json(me(contextOfRequest(request))));

/** Waits for the app to be at `path`. */
export const expectPath = async (path: string) => waitFor(() => expect(window.location.pathname).toBe(path));

/**
 * Records every path the app navigates to from now on (`history.pushState` / `replaceState`, as the router does), in
 * order: for "never opens X", even when a guard sends the app on before X's page mounts.
 */
export const recordPaths = () => {
    const paths: string[] = [];
    for (const method of ["pushState", "replaceState"] as const) {
        const original = window.history[method].bind(window.history);
        vi.spyOn(window.history, method).mockImplementation((data: unknown, unused: string, url?: string | URL | null) => {
            if (url !== undefined && url !== null) paths.push(new URL(String(url), window.location.href).pathname);
            original(data, unused, url);
        });
    }
    return paths;
};
