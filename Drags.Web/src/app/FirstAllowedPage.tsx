import {Navigate} from "react-router-dom";
import {NAV_ITEMS} from "./navigation.tsx";
import {usePermissions} from "../features/access/usePermissions.ts";
import {NoPermissionPage, PermissionsLoadError} from "../features/access/components/RequirePermission.tsx";
import {FullPageSpinner} from "../components/common/FullPageSpinner.tsx";

/** For `/` without the prescription permission: the first page the user may open, or "no permission". */
export const FirstAllowedPage = () => {
    const {can, ready, failed} = usePermissions();
    if (failed) return <PermissionsLoadError/>;
    if (!ready) return <FullPageSpinner/>;
    const first = NAV_ITEMS.find(item => item.to !== "/" && can(item.permission));
    return first ? <Navigate to={first.to} replace/> : <NoPermissionPage showHome={false}/>;
};
