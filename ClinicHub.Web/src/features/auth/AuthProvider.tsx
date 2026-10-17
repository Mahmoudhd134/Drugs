import {type ReactNode, useCallback, useEffect, useMemo, useSyncExternalStore} from "react";
import {useNavigate} from "react-router-dom";
import {useQueryClient} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {getErrorMessage} from "../../api/errors.ts";
import {
    type ClinicLoss,
    currentContextKey,
    endSession,
    getSession,
    onClinicLost,
    onContextChanged,
    onOtherUserSignedIn,
    recheckLostContext,
    setSession,
    startSession,
    subscribeSession,
    switchSessionContext,
} from "./session.ts";
import {useMeQuery} from "./api.ts";
import {useContextLabel} from "./useContextLabel.ts";
import {AuthContext, type AuthValue, homeOf} from "./useAuth.ts";
import {type AuthResult, type Context, contextKey} from "./types.ts";

/** Restores the session on page load (refresh cookie) and exposes it with `useAuth()`. Inside the router. */
export const AuthProvider = ({children}: { children: ReactNode }) => {
    const {t} = useTranslation();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const session = useSyncExternalStore(subscribeSession, getSession);

    useEffect(() => {
        onContextChanged(() => {
            // In-flight answers from the old context are dropped, then everything cached is
            void queryClient.cancelQueries();
            queryClient.clear();
        });
        startSession();
    }, [queryClient]);

    // The routes already follow the new session (picker, login); this says why, and opens the other clinic's home
    const contextLabel = useContextLabel();
    useEffect(() => {
        onClinicLost((loss: ClinicLoss) => {
            // Replaces the page's own error toast for the failed action
            toast.dismiss();
            const from = contextLabel(loss.from);
            const message = loss.outcome === "moved"
                ? t("auth.clinicLostMoved", {from, to: contextLabel(loss.to)})
                : t({cleared: "auth.clinicLostChoose", ended: "auth.clinicLostEnded", signedOut: "auth.clinicLostSignedOut"}[loss.outcome], {from});
            toast(message, {id: "clinicLost", duration: 8000});
            if (loss.outcome === "moved") navigate("/", {replace: true});
        });
    }, [t, navigate, contextLabel]);

    // A stale tab's switch found another user signed in from another tab: it follows that session (no switch sent)
    useEffect(() => {
        onOtherUserSignedIn((auth: AuthResult) => {
            toast.dismiss();
            toast(t("auth.otherUserSignedIn"), {id: "otherUser", duration: 8000});
            navigate(homeOf(auth.context), {replace: true});
        });
    }, [t, navigate]);

    const signIn = useCallback((auth: AuthResult) => setSession(auth), []);

    const switchContext = useCallback((context: Context) =>
        switchSessionContext(context.type, context.type === "clinic" ? context.clinicId : undefined), []);

    const logout = useCallback(async () => {
        try {
            await endSession();
            navigate("/login", {replace: true});
        } catch (error) {
            // Still logged in: the session couldn't be revoked
            toast.error(getErrorMessage(error));
        }
    }, [navigate]);

    const retry = useCallback(() => startSession(true), []);

    const auth = session.status === "authenticated" ? session.auth : null;
    const meQuery = useMeQuery(contextKey(auth?.context ?? null), auth !== null);
    const me = meQuery.data;
    // Failed (after its retry): pages show a load error with Retry, not "no permission". It stays failed while Retry
    // loads it again: TanStack Query puts a query without data back to `pending` (error cleared) when it fetches, but
    // keeps its error count, so "fetching after an error" is the retry in progress (the load error, Retry loading)
    const meRetrying = auth !== null && me === undefined && meQuery.isFetching && meQuery.errorUpdateCount > 0;
    const meFailed = auth !== null && me === undefined && (meQuery.isError || meRetrying);
    const meReady = auth !== null && me !== undefined;
    const refetchMe = meQuery.refetch;
    const retryMe = useCallback(() => void refetchMe(), [refetchMe]);

    // /me no longer sees the current context (e.g. checked again when the tab gets the focus back, or after a 403): a
    // clinic lost, or the platform admin of a user who is no longer a super admin. As for a 403 noAccess, a refresh
    // re-checks the context (design D7); still the same context after it (e.g. access given back meanwhile): /me
    // again, with the new token
    const meLostContext = auth?.context != null && me !== undefined
        && (me.context === null || (auth.context.type === "platform" && !me.user.isSuperAdmin));
    useEffect(() => {
        if (!meLostContext) return;
        const before = currentContextKey();
        void recheckLostContext().then(() => {
            if (currentContextKey() === before) void refetchMe();
        });
    }, [meLostContext, refetchMe]);

    const value = useMemo<AuthValue>(() => ({
        status: session.status,
        context: auth?.context ?? null,
        contexts: auth?.contexts ?? [],
        me: auth ? me ?? null : null,
        meReady,
        meFailed,
        meRetrying,
        retryMe,
        signIn,
        switchContext,
        logout,
        retry,
    }), [session.status, auth, me, meReady, meFailed, meRetrying, retryMe, signIn, switchContext, logout, retry]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
