import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {Alert, Button} from "@mui/material";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {AppShell} from "./AppShell.tsx";
import {useAuth, useClinic} from "../../features/auth/useAuth.ts";
import {useContextLabel} from "../../features/auth/useContextLabel.ts";
import {NAV_ITEMS} from "../../app/navigation.tsx";
import {usePermissions} from "../../features/access/usePermissions.ts";
import {getErrorMessage} from "../../api/errors.ts";
import {useSingleFlight} from "../../hooks/useSingleFlight.ts";

/** The clinic app's frame: the clinic name in the app bar, the pages the user may open, a banner in the template. */
export const AppLayout = () => {
    const {t} = useTranslation();
    const clinic = useClinic();
    const {can} = usePermissions();
    const label = useContextLabel()(clinic);

    return (
        <AppShell
            homeTo="/"
            homeLabel={t("nav.home")}
            // dir="auto" only on the name: on the Typography it would flip the spacing side
            contextLabel={<span dir="auto">{label}</span>}
            contextTitle={label}
            navItems={NAV_ITEMS.filter(item => can(item.permission))}
            banner={clinic.isTemplate && (
                <Alert
                    severity="warning"
                    square
                    action={<BackToAdminButton/>}
                    // On a phone the action goes below the text instead of squeezing it
                    sx={{borderBottom: 1, borderColor: "divider", flexWrap: "wrap", "& .MuiAlert-message": {flex: "1 1 200px"}}}
                >
                    {t("auth.templateBanner")}
                </Alert>
            )}
        />
    );
};

/** In the template, for the super admin (who has the platform context): back to the platform admin's clinics. */
const BackToAdminButton = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const {contexts, switchContext} = useAuth();
    const once = useSingleFlight();
    const [pending, setPending] = useState(false);
    const platform = contexts.find(c => c.type === "platform");
    if (!platform) return null;

    const open = () => once(async () => {
        setPending(true);
        try {
            await switchContext(platform);
            navigate("/admin", {replace: true});
        } catch (error) {
            toast.error(getErrorMessage(error));
            setPending(false);
        }
    });

    return (
        <Button color="inherit" size="small" onClick={() => void open()} disabled={pending} sx={{whiteSpace: "nowrap"}}>
            {t("admin.backToAdmin")}
        </Button>
    );
};
