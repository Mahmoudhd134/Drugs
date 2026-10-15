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
    refreshSession,
    setSession,
    startSession,
    subscribeSession,
    switchSessionContext,
} from "./session.ts";
import {useMeQuery} from "./api.ts";
import {AuthContext, type AuthValue} from "./useAuth.ts";
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
    useEffect(() => {
        onClinicLost((loss: ClinicLoss) => {
            // Replaces the page's own error toast for the failed action
            toast.dismiss();
            const from = loss.from.clinicName;
            const message = loss.outcome === "moved"
                ? t("auth.clinicLostMoved", {from, to: loss.to.clinicName})
                : t(loss.outcome === "cleared" ? "auth.clinicLostChoose" : "auth.clinicLostEnded", {from});
            toast(message, {id: "clinicLost", duration: 8000});
            if (loss.outcome === "moved") navigate("/", {replace: true});
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
    // Failed (after its retry): pages show a load error with Retry, not "no permission"
    const meFailed = auth !== null && me === undefined && meQuery.isError;
    const meReady = auth !== null && me !== undefined;
    const meRetrying = meFailed && meQuery.isFetching;
    const refetchMe = meQuery.refetch;
    const retryMe = useCallback(() => void refetchMe(), [refetchMe]);

    // /me no longer sees the current clinic (e.g. checked again when the tab gets the focus back): as a 403 noAccess,
    // a refresh re-checks the context (design D7); still the same clinic after it (e.g. access given back meanwhile):
    // /me again, with the new token
    const meLostClinic = auth?.context?.type === "clinic" && me !== undefined && me.context === null;
    useEffect(() => {
        if (!meLostClinic) return;
        const before = currentContextKey();
        void refreshSession().then(() => {
            if (currentContextKey() === before) void refetchMe();
        });
    }, [meLostClinic, refetchMe]);

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
