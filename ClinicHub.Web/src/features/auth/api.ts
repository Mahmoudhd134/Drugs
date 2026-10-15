import {useQuery} from "@tanstack/react-query";
import {api} from "../../api/client.ts";
import type {AuthResult, Context, Me, OtpRequestResult} from "./types.ts";

export const authKeys = {
    otpMode: ["auth", "otpMode"] as const,
    contexts: ["auth", "contexts"] as const,
    /** Every context's /me (to reload permissions) */
    allMe: ["me"] as const,
    /** Per context, so a switch never shows the previous context's answer */
    me: (contextKey: string) => [...authKeys.allMe, contextKey] as const,
};

export const requestOtp = (phone: string) =>
    api.post<OtpRequestResult>("/auth/otp/request", {phone}).then(r => r.data);

export const verifyOtp = (phone: string, code: string) =>
    api.post<AuthResult>("/auth/otp/verify", {phone, code}).then(r => r.data);

/** "Display" (development: the code is shown on screen) or "Sms". */
export const useOtpMode = () => useQuery({
    queryKey: authKeys.otpMode,
    queryFn: () => api.get<{ mode: string }>("/auth/otp/mode").then(r => r.data.mode),
    staleTime: Infinity,
});

/**
 * The caller's user, staff name and permissions in the current context. Loaded again whenever the tab gets the
 * focus back (even when fresh), so permissions or access changed by an admin meanwhile show then.
 */
export const useMeQuery = (contextKey: string, enabled: boolean) => useQuery({
    queryKey: authKeys.me(contextKey),
    queryFn: () => api.get<Me>("/me").then(r => r.data),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: "always",
});

/** The contexts the user can enter now (the picker: never the ones lost since the last login or refresh). */
export const useContextsQuery = () => useQuery({
    queryKey: authKeys.contexts,
    queryFn: () => api.get<Context[]>("/auth/contexts").then(r => r.data),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
});
