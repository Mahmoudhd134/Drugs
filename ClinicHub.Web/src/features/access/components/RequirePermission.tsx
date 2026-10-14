import type {ReactNode} from "react";
import {Button} from "@mui/material";
import LockIcon from "@mui/icons-material/LockOutlined";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import {Link as RouterLink} from "react-router-dom";
import {useTranslation} from "react-i18next";
import type {PermissionRule} from "../permissions.ts";
import {usePermissions} from "../usePermissions.ts";
import {useAuth} from "../../auth/useAuth.ts";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {FullPageSpinner} from "../../../components/common/FullPageSpinner.tsx";

type Props = PermissionRule & {
    children: ReactNode;
    /** Shown when not allowed (default: the "no permission" page) */
    fallback?: ReactNode;
};

/** Route guard: the page only when allowed; a spinner while permissions load, Retry if they failed. */
export const RequirePermission = ({children, fallback, ...rule}: Props) => {
    const {allows, ready, failed} = usePermissions();
    if (failed) return <PermissionsLoadError/>;
    if (!ready) return <FullPageSpinner/>;
    return allows(rule) ? children : fallback ?? <NoPermissionPage/>;
};

/** `/me` failed: the permissions are unknown, so offer a retry instead of "no permission". */
export const PermissionsLoadError = () => {
    const {t} = useTranslation();
    const {retry} = usePermissions();
    const {meRetrying} = useAuth();
    return (
        <EmptyState
            icon={<CloudOffIcon/>}
            title={t("common.loadFailed")}
            action={<Button variant="contained" onClick={retry} loading={meRetrying}>{t("common.retry")}</Button>}
        />
    );
};

export const NoPermissionPage = ({showHome = true}: { showHome?: boolean }) => {
    const {t} = useTranslation();
    return (
        <EmptyState
            icon={<LockIcon/>}
            title={t("access.noPermissionTitle")}
            description={t("access.noPermissionDescription")}
            action={showHome && <Button variant="outlined" component={RouterLink} to="/">{t("access.goHome")}</Button>}
        />
    );
};
