import type {ReactNode} from "react";
import type {PermissionRule} from "../permissions.ts";
import {usePermissions} from "../usePermissions.ts";

type Props = PermissionRule & {
    children: ReactNode;
    /** Shown instead when not allowed (default: nothing) */
    fallback?: ReactNode;
};

/** Renders its children only when the caller has the permission(s): `<Can permission={PERMISSIONS.drugs.create}>`. */
export const Can = ({children, fallback = null, ...rule}: Props) =>
    usePermissions().allows(rule) ? children : fallback;
