import {Outlet} from "react-router-dom";
import {AppBar, Box, Container, Toolbar, Typography} from "@mui/material";
import {useTranslation} from "react-i18next";
import {LanguageMenu} from "./LanguageMenu.tsx";
import {UserMenu} from "../../features/auth/components/UserMenu.tsx";
import {useAuth} from "../../features/auth/useAuth.ts";
import {PageBoundary} from "../common/PageBoundary.tsx";

/** Shell for pages outside the clinic app (login, choosing a clinic, platform): app bar + centered content. */
export const SimpleLayout = () => {
    const {t} = useTranslation();
    const {status} = useAuth();

    return (
        <Box sx={{minHeight: "100vh", bgcolor: "background.default"}}>
            <AppBar position="static" color="inherit" elevation={0} sx={{borderBottom: 1, borderColor: "divider"}}>
                <Toolbar>
                    <Box component="img" src="/drug.png" alt="" sx={{width: 28, height: 28, marginInlineEnd: 1.5}}/>
                    <Typography variant="h6" noWrap sx={{color: "primary.main"}}>{t("app.name")}</Typography>
                    <Box sx={{flexGrow: 1}}/>
                    <LanguageMenu/>
                    {status === "authenticated" && <UserMenu/>}
                </Toolbar>
            </AppBar>
            <Container maxWidth="sm" sx={{py: {xs: 3, sm: 6}}}>
                <PageBoundary><Outlet/></PageBoundary>
            </Container>
        </Box>
    );
};
