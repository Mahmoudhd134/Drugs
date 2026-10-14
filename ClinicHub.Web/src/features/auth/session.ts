import axios from "axios";
import {api, setAuthHandlers} from "../../api/client.ts";
import {type AuthResult, contextKey} from "./types.ts";

/**
 * The login session, outside React so the axios interceptor can use it. The access token lives
 * only here, in memory (never localStorage); the refresh token is an HttpOnly cookie the browser
 * sends to /api/v1/auth/* only.
 * - `offline`: the session could not be restored because the API was unreachable (not a logout).
 */
export type SessionState =
    | { status: "loading" }
    | { status: "offline" }
    | { status: "anonymous" }
    | { status: "authenticated"; auth: AuthResult };

let state: SessionState = {status: "loading"};
const listeners = new Set<() => void>();
let contextChangedHandler: (() => void) | null = null;

export const getSession = () => state;

export const subscribeSession = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** Runs before listeners whenever the context changes (the provider clears the query cache there). */
export const onContextChanged = (handler: () => void) => {
    contextChangedHandler = handler;
};

const keyOf = (s: SessionState) => (s.status === "authenticated" ? contextKey(s.auth.context) : "none");

/** The current context's key ("none" when logged out or not chosen). */
export const currentContextKey = () => keyOf(state);

const setState = (next: SessionState) => {
    // Another clinic's (or nobody's) data must never show: drop cached queries before rendering
    if (keyOf(state) !== keyOf(next)) contextChangedHandler?.();
    state = next;
    listeners.forEach(listener => listener());
};

/** Sets the session from an auth response (null = logged out). */
export const setSession = (auth: AuthResult | null) =>
    setState(auth ? {status: "authenticated", auth} : {status: "anonymous"});

/**
 * Every call that rotates the refresh cookie (refresh, context switch, logout) runs one at a time,
 * in this tab and across tabs (Web Locks, only where the browser provides them: HTTPS/localhost),
 * so each one sends the latest cookie.
 */
let queue: Promise<unknown> = Promise.resolve();
const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const run = () => (navigator.locks ? navigator.locks.request("clinichub-auth", work) : work());
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
};

const status = (error: unknown) => (axios.isAxiosError(error) ? error.response?.status : undefined);

/** Calls made while holding the cross-tab lock must not hang forever on a stalled API. */
const AUTH_TIMEOUT = {timeout: 15_000};

const callRefresh = async (): Promise<string | null> => {
    for (let attempt = 0; ; attempt++) {
        try {
            const {data} = await api.post<AuthResult>("/auth/refresh", null, AUTH_TIMEOUT);
            setSession(data);
            return data.accessToken;
        } catch (error) {
            // 409: another tab rotated the cookie at the same moment; the browser now has its new one
            if (status(error) === 409 && attempt === 0) continue;
            if (status(error) === 401) setSession(null);
            // API unreachable or failing: keep the session (the request fails with its own error),
            // except on page load, where there is nothing to keep
            else if (state.status === "loading") setState({status: "offline"});
            return null;
        }
    }
};

let refreshing: Promise<string | null> | null = null;

/** Gets a new access token with the refresh cookie; concurrent callers share one call. Null when it fails. */
export const refreshSession = (): Promise<string | null> => {
    refreshing ??= exclusive(callRefresh).finally(() => {
        refreshing = null;
    });
    return refreshing;
};

/** Restores the session from the refresh cookie (on page load, and "retry" when offline). */
let started = false;
export const startSession = (force = false) => {
    if (started && !force) return;
    started = true;
    if (state.status === "offline") setState({status: "loading"});
    void refreshSession();
};

/**
 * POST /auth/context, in the same queue as refreshes (it rotates the cookie too). The interceptor
 * doesn't refresh this call (that refresh would wait behind it in the queue), so it is retried here
 * once: after a refresh on 401 (expired token, or a cookie of another session), or as is on 409
 * (another tab rotated the cookie at the same moment).
 */
export const switchSessionContext = (type: "clinic" | "platform", clinicId?: number) =>
    exclusive(async () => {
        const post = () => api.post<AuthResult>("/auth/context", {type, clinicId}, AUTH_TIMEOUT);
        let response;
        try {
            response = await post();
        } catch (error) {
            if (status(error) === 409) response = await post();
            else if (status(error) === 401 && await callRefresh()) response = await post();
            else throw error;
        }
        setSession(response.data);
        return response.data;
    });

/**
 * Revokes the session after any refresh in flight (whose result would otherwise log the user back
 * in). If the API can't be reached the session stays (the cookie would still log the user back in
 * on the next load) and the error is thrown.
 */
export const endSession = () =>
    exclusive(async () => {
        await api.post("/auth/logout", null, AUTH_TIMEOUT);
        setSession(null);
    });

setAuthHandlers({
    getAccessToken: () => (state.status === "authenticated" ? state.auth.accessToken : null),
    getContextKey: currentContextKey,
    refresh: refreshSession,
});
