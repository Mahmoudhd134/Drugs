import {type ReactNode, Suspense, useState} from "react";
import {Link as RouterLink, NavLink, Outlet} from "react-router-dom";
import {
    Alert,
    AppBar,
    Box,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Tooltip,
    Typography,
} from "@mui/material";
import {alpha} from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CategoryIcon from "@mui/icons-material/Category";
import MedicationIcon from "@mui/icons-material/Medication";
import {useTranslation} from "react-i18next";
import {LanguageMenu} from "./LanguageMenu.tsx";
import {UserMenu} from "../../features/auth/components/UserMenu.tsx";
import {useClinic} from "../../features/auth/useAuth.ts";
import {FullPageSpinner} from "../common/FullPageSpinner.tsx";

const DRAWER_WIDTH = 232;

type NavItem = { to: string; labelKey: string; icon: ReactNode; end?: boolean };

// Add new modules of the clinic system here
const NAV_ITEMS: NavItem[] = [
    {to: "/", labelKey: "nav.prescription", icon: <ReceiptLongIcon/>, end: true},
    {to: "/groups", labelKey: "nav.groups", icon: <CategoryIcon/>},
    {to: "/drugs", labelKey: "nav.drugs", icon: <MedicationIcon/>},
];

export const AppLayout = () => {
    const {t} = useTranslation();
    const clinic = useClinic();
    const [mobileOpen, setMobileOpen] = useState(false);

    const navigation = (
        <List sx={{px: 1.5, py: 2}}>
            {NAV_ITEMS.map(item => (
                <ListItemButton
                    key={item.to}
                    component={NavLink}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileOpen(false)}
                    sx={(theme) => ({
                        borderRadius: 2,
                        mb: 0.5,
                        color: "text.secondary",
                        "& .MuiListItemIcon-root": {color: "inherit", minWidth: 40},
                        "&.active": {
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            color: "primary.main",
                            fontWeight: 600,
                        },
                    })}
                >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={t(item.labelKey)} slotProps={{primary: {fontWeight: "inherit"}}}/>
                </ListItemButton>
            ))}
        </List>
    );

    return (
        <Box sx={{display: "flex", minHeight: "100vh"}}>
            <AppBar
                position="fixed"
                color="inherit"
                elevation={0}
                sx={{zIndex: (theme) => theme.zIndex.drawer + 1, borderBottom: 1, borderColor: "divider"}}
            >
                <Toolbar>
                    <Tooltip title={t("nav.openMenu")}>
                        <IconButton
                            edge="start"
                            onClick={() => setMobileOpen(true)}
                            aria-label={t("nav.openMenu")}
                            sx={{marginInlineEnd: 1, display: {md: "none"}}}
                        >
                            <MenuIcon/>
                        </IconButton>
                    </Tooltip>
                    {/* Logo + name go to the main page (prescription) */}
                    <Tooltip title={t("nav.home")}>
                        <Box
                            component={RouterLink}
                            to="/"
                            aria-label={t("nav.home")}
                            sx={{display: "flex", alignItems: "center", minWidth: 0, textDecoration: "none", borderRadius: 1}}
                        >
                            <Box component="img" src="/drug.png" alt="" sx={{width: 28, height: 28, marginInlineEnd: 1.5}}/>
                            <Typography variant="h6" noWrap sx={{color: "primary.main", display: {xs: "none", sm: "block"}}}>
                                {t("app.name")}
                            </Typography>
                        </Box>
                    </Tooltip>
                    {/* The clinic everything on screen belongs to */}
                    <Typography
                        noWrap
                        title={clinic.clinicName}
                        sx={{
                            marginInlineStart: {xs: 1, sm: 2},
                            paddingInlineStart: {sm: 2},
                            borderInlineStart: {sm: "1px solid"},
                            borderColor: {sm: "divider"},
                            fontWeight: 600,
                            minWidth: 0,
                        }}
                    >
                        {/* dir="auto" only on the name: on the Typography it would flip the spacing side */}
                        <span dir="auto">{clinic.clinicName}</span>
                    </Typography>
                    <Box sx={{flexGrow: 1}}/>
                    <LanguageMenu/>
                    <UserMenu/>
                </Toolbar>
            </AppBar>

            {/* Temporary drawer on small screens, permanent on desktop */}
            <Drawer
                variant="temporary"
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                ModalProps={{keepMounted: true}}
                sx={{display: {xs: "block", md: "none"}, "& .MuiDrawer-paper": {width: DRAWER_WIDTH}}}
            >
                <Toolbar/>
                {navigation}
            </Drawer>
            <Drawer
                variant="permanent"
                sx={{
                    display: {xs: "none", md: "block"},
                    width: DRAWER_WIDTH,
                    flexShrink: 0,
                    "& .MuiDrawer-paper": {width: DRAWER_WIDTH, boxSizing: "border-box"},
                }}
            >
                <Toolbar/>
                {navigation}
            </Drawer>

            <Box component="main" sx={{flexGrow: 1, minWidth: 0}}>
                <Toolbar/>
                {clinic.isTemplate && (
                    <Alert severity="warning" square sx={{borderBottom: 1, borderColor: "divider"}}>
                        {t("auth.templateBanner")}
                    </Alert>
                )}
                <Box sx={{p: {xs: 2, md: 3}, maxWidth: 1400, mx: "auto"}}>
                    <Suspense fallback={<FullPageSpinner/>}>
                        <Outlet/>
                    </Suspense>
                </Box>
            </Box>
        </Box>
    );
};
