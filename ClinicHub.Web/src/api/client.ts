import axios, {type InternalAxiosRequestConfig} from "axios";
import {toApiError} from "./errors.ts";

// The SPA and the API share one origin: in production the API serves the SPA (wwwroot); in
// development Vite proxies /api to the API (vite.config.ts). Same origin keeps the refresh cookie
// (SameSite=Strict, HttpOnly) working.
const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export const api = axios.create({
    baseURL,
    headers: {"Content-Type": "application/json"},
});

type AuthHandlers = {
    /** The in-memory access token, if any. */
    getAccessToken: () => string | null;
    /** The current context ("clinic:3", "platform"…), to notice a refresh that changed it. */
    getContextKey: () => string;
    /** Gets a new access token with the refresh cookie (one shared call); null when that fails. */
    refresh: () => Promise<string | null>;
};

let authHandlers: AuthHandlers | null = null;

/** Called once by the auth session store (avoids an import cycle). */
export const setAuthHandlers = (handlers: AuthHandlers) => {
    authHandlers = handlers;
};

// These answer 401 for their own reasons, or refresh themselves (/auth/context), so the
// interceptor must not refresh and retry them
const NO_REFRESH = new Set(["/auth/refresh", "/auth/logout", "/auth/context"]);
const skipsRefresh = (url = "") => NO_REFRESH.has(url) || url.startsWith("/auth/otp/");

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; _contextKey?: string };

/** The context a failed request was sent in ("clinic:3"…), to ignore answers about a context already left. */
export const requestContextKey = (error: unknown) =>
    axios.isAxiosError(error) ? (error.config as RetriableConfig | undefined)?._contextKey : undefined;

api.interceptors.request.use(config => {
    const token = authHandlers?.getAccessToken();
    if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
    // The context the request was meant for
    (config as RetriableConfig)._contextKey ??= authHandlers?.getContextKey();
    return config;
});

/** 403 codes saying the clinic itself can't be entered any more (staff deactivated or removed, clinic suspended or deleted). */
const CLINIC_LOST_CODES = new Set(["noAccess", "clinicSuspended"]);

/**
 * 401 = missing or expired access token. A 403 `noAccess`/`clinicSuspended` in a clinic = the clinic may be lost
 * (design D7), or the token is out of date (e.g. re-added under a new staff record). Either way: refresh once (one
 * shared call, which also re-checks the context) and replay. If the session is gone the store becomes anonymous and
 * the routes send the user to /login; a 403 that persists after the replay is handled as any other 403.
 */
const needsRefresh = (error: unknown, config: RetriableConfig) => {
    const apiError = toApiError(error);
    return apiError?.status === 401 || (apiError?.status === 403 && CLINIC_LOST_CODES.has(apiError.code ?? "")
        && config._contextKey?.startsWith("clinic:") === true);
};

api.interceptors.response.use(undefined, async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config || !authHandlers) throw error;
    const config = error.config as RetriableConfig;
    if (config._retried || skipsRefresh(config.url) || !needsRefresh(error, config)) throw error;

    const token = await authHandlers.refresh();
    // The session moved to another clinic meanwhile (switched in another tab, or this one was lost:
    // the session store tells the user): replaying would act in the wrong clinic, so the request
    // fails (the pages re-mount in the new clinic)
    if (!token || authHandlers.getContextKey() !== config._contextKey) throw error;
    config._retried = true;
    config.headers.Authorization = `Bearer ${token}`;
    return api(config);
});
