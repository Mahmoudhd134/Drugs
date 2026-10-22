import {useId, useState} from "react";
import {useNavigate} from "react-router-dom";
import {CircularProgress, ListItemButton, ListItemIcon, ListItemText} from "@mui/material";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {AppShell} from "../../../components/layout/AppShell.tsx";
import {navButtonSx} from "../../../components/layout/navButtonSx.ts";
import {ADMIN_NAV_ITEMS} from "../../../app/navigation.tsx";
import {getErrorMessage} from "../../../api/errors.ts";
import {useAuth} from "../../auth/useAuth.ts";
import {OtherUserSignedInError} from "../../auth/session.ts";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";

/** The platform admin's frame (super admin, platform context): its sections and a way into the template. */
export const AdminLayout = () => {
    const {t} = useTranslation();
    return (
        <AppShell
            homeTo="/admin"
            homeLabel={t("admin.home")}
            contextLabel={t("admin.title")}
            contextTitle={t("admin.title")}
            navItems={ADMIN_NAV_ITEMS}
            navFooter={<EditTemplateButton/>}
        />
    );
};

/** Switches to the template clinic (its drugs and protocols are copied into new clinics) and opens its drugs. */
const EditTemplateButton = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const {contexts, switchContext} = useAuth();
    const once = useSingleFlight();
    const [pending, setPending] = useState(false);
    const hintId = useId();
    const template = contexts.find(c => c.type === "clinic" && c.isTemplate);
    if (!template) return null;

    const open = () => once(async () => {
        setPending(true);
        try {
            await switchContext(template);
            navigate("/drugs", {replace: true});
        } catch (error) {
            // Another user signed in from another tab: the provider already opens that session's home
            if (!(error instanceof OtherUserSignedInError)) toast.error(getErrorMessage(error));
            setPending(false);
        }
    });

    return (
        // Named by its title, described by its hint (not one long name)
        <ListItemButton
            onClick={() => void open()}
            disabled={pending}
            aria-label={t("admin.editTemplate")}
            aria-describedby={hintId}
            sx={navButtonSx}
        >
            <ListItemIcon>{pending ? <CircularProgress size={20} aria-label={t("common.loading")}/> : <Inventory2Icon/>}</ListItemIcon>
            <ListItemText
                primary={t("admin.editTemplate")}
                secondary={t("admin.editTemplateHint")}
                slotProps={{primary: {fontWeight: "inherit"}, secondary: {id: hintId}}}
            />
        </ListItemButton>
    );
};
