import {useMemo} from "react";
import {useAuth} from "../auth/useAuth.ts";
import type {Permission, PermissionRule} from "./permissions.ts";

export type Permissions = {
    can: (permission: Permission) => boolean;
    canAll: (...permissions: Permission[]) => boolean;
    canAny: (...permissions: Permission[]) => boolean;
    /** Checks a `PermissionRule` (`permission` / `anyOf` / `allOf`). */
    allows: (rule: PermissionRule) => boolean;
    /** False until `/me` answered for the current context (everything is denied meanwhile). */
    ready: boolean;
    /** `/me` failed: permissions are unknown (show an error with `retry`, not "no permission"). */
    failed: boolean;
    retry: () => void;
};

/**
 * The caller's permissions in the current context, from `/me` (expanded keys). Re-renders on a
 * context switch, since `/me` is cached per context. The API always enforces them too.
 */
export const usePermissions = (): Permissions => {
    const {me, meReady, meFailed, retryMe} = useAuth();
    const keys = me?.permissions;

    return useMemo(() => {
        const granted = new Set<string>(keys ?? []);
        const can = (permission: Permission) => granted.has(permission);
        return {
            can,
            canAll: (...permissions) => permissions.every(can),
            canAny: (...permissions) => permissions.some(can),
            allows: ({permission, anyOf, allOf}) =>
                (!permission || can(permission))
                && (!anyOf || anyOf.some(can))
                && (!allOf || allOf.every(can)),
            ready: meReady,
            failed: meFailed,
            retry: retryMe,
        };
    }, [keys, meReady, meFailed, retryMe]);
};
