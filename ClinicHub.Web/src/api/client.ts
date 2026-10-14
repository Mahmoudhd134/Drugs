import axios, {type InternalAxiosRequestConfig} from "axios";

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

api.interceptors.request.use(config => {
    const token = authHandlers?.getAccessToken();
    if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
    // The context the request was meant for
    (config as RetriableConfig)._contextKey ??= authHandlers?.getContextKey();
    return config;
});

// 401 = missing or expired access token: refresh once and retry. If the session is gone the store
// becomes anonymous and the routes send the user to /login.
api.interceptors.response.use(undefined, async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config || !authHandlers) throw error;
    const config = error.config as RetriableConfig;
    if (config._retried || skipsRefresh(config.url)) throw error;

    const token = await authHandlers.refresh();
    // The session moved to another clinic meanwhile (e.g. switched in another tab): replaying
    // would act in the wrong clinic, so the request fails (the pages re-mount in the new clinic)
    if (!token || authHandlers.getContextKey() !== config._contextKey) throw error;
    config._retried = true;
    config.headers.Authorization = `Bearer ${token}`;
    return api(config);
});
