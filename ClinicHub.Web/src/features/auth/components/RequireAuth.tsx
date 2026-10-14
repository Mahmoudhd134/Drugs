import {Fragment} from "react";
import {Navigate, Outlet, useLocation} from "react-router-dom";
import {Button} from "@mui/material";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import {useTranslation} from "react-i18next";
import {homeOf, useAuth} from "../useAuth.ts";
import {contextKey} from "../types.ts";
import {FullPageSpinner} from "../../../components/common/FullPageSpinner.tsx";
import {EmptyState} from "../../../components/common/EmptyState.tsx";

type Props = {
    /** The context these routes need; omit for routes that only need a login (e.g. picking a context). */
    context?: "clinic" | "platform";
};

/**
 * Guards a group of routes: not logged in → /login (coming back afterwards); no context yet →
 * /select-clinic; another context → that context's home. The routes are re-mounted when the
 * context changes, so no page keeps the previous clinic's state.
 */
export const RequireAuth = ({context}: Props) => {
    const {t} = useTranslation();
    const {status, context: current, retry} = useAuth();
    const location = useLocation();

    if (status === "loading") return <FullPageSpinner/>;
    // The API was unreachable on page load: the user may still be logged in
    if (status === "offline") return (
        <EmptyState
            icon={<CloudOffIcon/>}
            title={t("errors.network")}
            action={<Button variant="contained" onClick={retry}>{t("common.retry")}</Button>}
        />
    );
    if (status === "anonymous") return <Navigate to="/login" replace state={{from: location}}/>;
    if (context && current?.type !== context) return <Navigate to={homeOf(current)} replace/>;

    return <Fragment key={contextKey(current)}><Outlet/></Fragment>;
};
