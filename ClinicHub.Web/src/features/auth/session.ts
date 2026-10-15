import {api, setAuthHandlers} from "../../api/client.ts";
import {toApiError} from "../../api/errors.ts";
import {type AuthResult, type ClinicContext, type Context, contextKey} from "./types.ts";

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

const status = (error: unknown) => toApiError(error)?.status;

/** Calls made while holding the cross-tab lock must not hang forever on a stalled API. */
const AUTH_TIMEOUT = {timeout: 15_000};

/**
 * Every refresh re-checks the context (design D7): a clinic lost meanwhile is cleared (several contexts left), replaced
 * by the only one left, or ends the session (none left). `reportsLoss` tells {@link onClinicLost} when the clinic the
 * session was in is no longer one of the user's contexts (not when another tab merely switched). Off for the retry
 * inside a context switch; nothing to report on page load (no clinic before).
 */
const callRefresh = async (reportsLoss = true): Promise<string | null> => {
    const before = state;
    for (let attempt = 0; ; attempt++) {
        try {
            const {data} = await api.post<AuthResult>("/auth/refresh", null, AUTH_TIMEOUT);
            setSession(data);
            if (reportsLoss) reportClinicLoss(before);
            return data.accessToken;
        } catch (error) {
            // 409: another tab rotated the cookie at the same moment; the browser now has its new one
            if (status(error) === 409 && attempt === 0) continue;
            if (status(error) === 401) {
                setSession(null);
                // Only `noContexts` says the clinics are gone; any other 401 (logged out in another tab, session
                // expired) is a plain logout
                if (reportsLoss && toApiError(error)?.code === "noContexts") reportClinicLoss(before);
            }
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
    refreshing ??= exclusive(() => callRefresh()).finally(() => {
        refreshing = null;
    });
    return refreshing;
};

/**
 * `/me` no longer sees the current context (a lost clinic, or a super admin no longer one): a refresh re-checks it.
 * The loss is already known, so a refresh ending the session with another 401 than `noContexts` (e.g. the demoted
 * super admin's sessions were revoked) is told to {@link onClinicLost} too, as `signedOut`.
 */
export const recheckLostContext = async () => {
    const before = state;
    await refreshSession();
    if (state.status !== "anonymous" || before.status !== "authenticated" || before.auth.context === null
        || lastReported === before) return;
    const loss: ClinicLoss = {from: before.auth.context, outcome: "signedOut"};
    setTimeout(() => clinicLostHandler?.(loss));
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
            else if (status(error) === 401 && await callRefresh(false)) response = await post();
            else throw error;
        }
        setSession(response.data);
        return response.data;
    });

/**
 * How a lost clinic (or a lost platform admin: the user is no longer a super admin) ended (see {@link callRefresh}):
 * the context was cleared (several contexts left: the picker), replaced by the only one left (`to`), or the session
 * ended (none left: login).
 */
export type ClinicLoss =
    | { from: Context; outcome: "cleared" | "ended" | "signedOut" }
    | { from: Context; outcome: "moved"; to: ClinicContext };

let clinicLostHandler: ((loss: ClinicLoss) => void) | null = null;
/** The session state of the last loss told (by its state before the refresh), not to tell it twice. */
let lastReported: SessionState | null = null;

/** Runs after a lost clinic (or platform) changed the session (the provider tells the user and opens the new clinic's home). */
export const onClinicLost = (handler: (loss: ClinicLoss) => void) => {
    clinicLostHandler = handler;
};

/**
 * After a refresh: tells {@link onClinicLost} if the session was in a context (a clinic, or the platform) that is no
 * longer one of the user's contexts (`ended`: the refresh answered 401 `noContexts`). Told in a later task, after the
 * failed request's own error handling (e.g. a page's error toast, which the provider's message replaces).
 */
const reportClinicLoss = (before: SessionState) => {
    if (before.status !== "authenticated" || before.auth.context === null) return;
    const from = before.auth.context;
    const now: SessionState = state;
    let loss: ClinicLoss;
    if (now.status === "anonymous") loss = {from, outcome: "ended"};
    else if (now.status === "authenticated" && !now.auth.contexts.some(c => contextKey(c) === contextKey(from))) {
        const to = now.auth.context;
        loss = to?.type === "clinic" ? {from, outcome: "moved", to} : {from, outcome: "cleared"};
    } else return;
    lastReported = before;
    setTimeout(() => clinicLostHandler?.(loss));
};

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
