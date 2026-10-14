import {useNavigate} from "react-router-dom";
import {Alert, Button, Card, CardContent, Stack, Typography} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import LogoutIcon from "@mui/icons-material/Logout";
import {useTranslation} from "react-i18next";
import {useAuth} from "../useAuth.ts";

/** TEMPORARY placeholder for the platform context; the admin area (clinics, staff, roles) is M1.5. */
export const PlatformPage = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const {logout} = useAuth();

    return (
        <Card variant="outlined">
            <CardContent sx={{p: {xs: 2.5, sm: 4}}}>
                <Typography variant="h5" component="h1" gutterBottom>{t("auth.platformTitle")}</Typography>
                <Typography color="text.secondary" sx={{mb: 2}}>{t("auth.platformComingSoon")}</Typography>
                <Alert severity="info" sx={{mb: 3}}>{t("auth.platformTemplateTip")}</Alert>
                <Stack direction={{xs: "column", sm: "row"}} sx={{gap: 1}}>
                    <Button variant="contained" startIcon={<SwapHorizIcon/>} onClick={() => navigate("/select-clinic")}>
                        {t("auth.switchContext")}
                    </Button>
                    <Button
                        startIcon={<LogoutIcon/>}
                        onClick={() => void logout()}
                    >
                        {t("auth.logout")}
                    </Button>
                </Stack>
            </CardContent>
        </Card>
    );
};
