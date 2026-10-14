/** A context the user can act in (HLD 8.1). */
export type ClinicContext = {
    type: "clinic";
    clinicId: number;
    clinicName: string;
    isTemplate: boolean;
    roles: string[];
};
export type PlatformContext = { type: "platform" };
export type Context = ClinicContext | PlatformContext;

export type AuthResult = {
    accessToken: string;
    /** ISO UTC */
    expiresAt: string;
    /** null → the user must pick one of `contexts` */
    context: Context | null;
    contexts: Context[];
};

export type OtpRequestResult = {
    expiresInSeconds: number;
    resendAfterSeconds: number;
    /** Only in OTP display mode (development) */
    devCode?: string;
};

export type Me = {
    user: { id: number; phone: string; isSuperAdmin: boolean };
    context: Context | null;
    staff: { id: number; fullName: string } | null;
    /** Expanded permission keys in a clinic context (see features/access/permissions.ts); [] otherwise */
    permissions: string[];
};

/** Stable identity of a context, e.g. "clinic:3" or "platform". */
export const contextKey = (context: Context | null) =>
    context === null ? "none" : context.type === "clinic" ? `clinic:${context.clinicId}` : "platform";
