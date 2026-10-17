import {type ComponentType, forwardRef, type Ref} from "react";
import {useTranslation} from "react-i18next";
import {TapTooltip} from "../../components/common/TapTooltip.tsx";
import type {PermissionRule} from "./permissions.ts";
import {usePermissions} from "./usePermissions.ts";

export type PermissionProps = PermissionRule & {
    /** What to do without permission: render nothing (default) or a disabled control with a tooltip. */
    whenDenied?: "hide" | "disable";
};

/**
 * Adds `permission` / `anyOf` / `allOf` and `whenDenied` to a component that takes `disabled`
 * (MUI buttons, menu items…). Refs and other props pass through, so it can sit inside a `Tooltip`.
 */
export const withPermission = <P extends { disabled?: boolean }>(Component: ComponentType<P>) => {
    const Wrapped = forwardRef<unknown, P & PermissionProps>((props, ref) => {
        const {permission, anyOf, allOf, whenDenied = "hide", ...rest} = props as P & PermissionProps;
        const {t} = useTranslation();
        const {allows} = usePermissions();
        if (allows({permission, anyOf, allOf})) return <Component {...({...rest, ref} as unknown as P)}/>;
        if (whenDenied === "hide") return null;
        // A disabled control gets no mouse events, so the tooltip (and any outer Tooltip's ref) sits
        // on a wrapper; the outer tooltip's own title is replaced by "no permission". A tap shows it too
        return (
            <TapTooltip title={t("access.noPermissionTooltip")}>
                <span ref={ref as Ref<HTMLSpanElement>} style={{display: "inline-flex"}}>
                    <Component {...(rest as unknown as P)} disabled/>
                </span>
            </TapTooltip>
        );
    });
    Wrapped.displayName = `withPermission(${Component.displayName ?? Component.name ?? "Component"})`;
    return Wrapped;
};
