import {createContext, useContext} from "react";
import type {AuthResult, ClinicContext, Context, Me} from "./types.ts";
import type {SessionState} from "./session.ts";

export type AuthValue = {
    status: SessionState["status"];
    /** The current context; null when none is chosen yet (or logged out). */
    context: Context | null;
    contexts: Context[];
    /** The user, staff name and permissions (null while loading or logged out). */
    me: Me | null;
    /** `/me` answered for the current context: permissions are known. */
    meReady: boolean;
    /** `/me` failed (network/server error): permissions are unknown. */
    meFailed: boolean;
    /** The failed `/me` is being loaded again. */
    meRetrying: boolean;
    /** Loads `/me` again after a failure. */
    retryMe: () => void;
    /** After a verified code. */
    signIn: (auth: AuthResult) => void;
    switchContext: (context: Context) => Promise<AuthResult>;
    /** Logs out and opens /login (shows an error and stays logged in if the API can't be reached). */
    logout: () => Promise<void>;
    /** Tries again to restore the session (status "offline"). */
    retry: () => void;
};

export const AuthContext = createContext<AuthValue | null>(null);

export const useAuth = () => {
    const value = useContext(AuthContext);
    if (!value) throw new Error("useAuth must be used inside AuthProvider");
    return value;
};

/** The current clinic; only call it inside the clinic app (RequireAuth context="clinic"). */
export const useClinic = (): ClinicContext => {
    const {context} = useAuth();
    if (context?.type !== "clinic") throw new Error("useClinic needs a clinic context");
    return context;
};

/** Where a context's app starts. */
export const homeOf = (context: Context | null) =>
    context === null ? "/select-clinic" : context.type === "platform" ? "/admin" : "/";
