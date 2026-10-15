import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {
    Button,
    Card,
    Chip,
    CircularProgress,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Stack,
    Typography,
} from "@mui/material";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {getErrorMessage} from "../../../api/errors.ts";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {homeOf, useAuth} from "../useAuth.ts";
import {OtherUserSignedInError} from "../session.ts";
import {type Context, contextKey} from "../types.ts";
import {useContextsQuery} from "../api.ts";
import {useContextLabel} from "../useContextLabel.ts";

/**
 * Picks the context after login (several clinics, or super admin), and from "Switch clinic". The list is loaded
 * fresh on opening (a clinic lost or given since the last login or refresh shows as it is now); if that fails,
 * the session's list.
 */
export const SelectClinicPage = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const {context: current, contexts: sessionContexts, switchContext, logout} = useAuth();
    const contextsQuery = useContextsQuery();
    // The platform admin first, then the clinics in the API's order
    const contexts = [...(contextsQuery.data ?? sessionContexts)]
        .sort((a, b) => Number(b.type === "platform") - Number(a.type === "platform"));
    const [pending, setPending] = useState<string | null>(null);
    const label = useContextLabel();

    const choose = async (context: Context) => {
        if (pending) return;
        if (contextKey(context) === contextKey(current)) {
            navigate(homeOf(current));
            return;
        }
        setPending(contextKey(context));
        try {
            const auth = await switchContext(context);
            navigate(homeOf(auth.context), {replace: true});
        } catch (e) {
            // Another user signed in from another tab: the provider already opens that session's home
            if (!(e instanceof OtherUserSignedInError)) toast.error(getErrorMessage(e));
            setPending(null);
        }
    };

    const hint = (context: Context) => context.type === "platform" ? t("auth.platformHint")
        : context.isTemplate ? t("auth.templateHint") : null;
    const icon = (context: Context) => context.type === "platform" ? <AdminPanelSettingsIcon/>
        : context.isTemplate ? <Inventory2Icon/> : <LocalHospitalIcon/>;

    return (
        <Stack sx={{gap: 2}}>
            <div>
                <Typography variant="h5" component="h1">{t("auth.selectTitle")}</Typography>
                <Typography variant="body2" color="text.secondary">{t("auth.selectSubtitle")}</Typography>
            </div>
            <Card variant="outlined">
                {contextsQuery.isPending ? (
                    <Stack sx={{alignItems: "center", py: 4}}><CircularProgress/></Stack>
                ) : contexts.length === 0 ? (
                    <EmptyState icon={<LocalHospitalIcon/>} title={t("auth.noContexts")}/>
                ) : (
                    <List disablePadding>
                        {contexts.map(context => {
                            const key = contextKey(context);
                            return (
                                <ListItemButton
                                    key={key}
                                    divider
                                    selected={key === contextKey(current)}
                                    disabled={pending !== null && pending !== key}
                                    onClick={() => void choose(context)}
                                    sx={{py: 1.5}}
                                >
                                    <ListItemIcon>{icon(context)}</ListItemIcon>
                                    <ListItemText primary={label(context)} secondary={hint(context)}/>
                                    {pending === key && <CircularProgress size={20}/>}
                                    {key === contextKey(current) && pending === null &&
                                        <Chip size="small" label={t("auth.current")}/>}
                                </ListItemButton>
                            );
                        })}
                    </List>
                )}
            </Card>
            <Stack direction="row" sx={{justifyContent: "flex-end", gap: 1}}>
                {current && <Button onClick={() => navigate(homeOf(current))}>{t("common.back")}</Button>}
                <Button onClick={() => void logout()}>
                    {t("auth.logout")}
                </Button>
            </Stack>
        </Stack>
    );
};
