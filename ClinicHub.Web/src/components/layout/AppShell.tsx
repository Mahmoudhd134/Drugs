import {type ReactNode, useState} from "react";
import {Link as RouterLink, Outlet, useLocation} from "react-router-dom";
import {
    AppBar,
    Box,
    Divider,
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
import MenuIcon from "@mui/icons-material/Menu";
import {useTranslation} from "react-i18next";
import {LanguageMenu} from "./LanguageMenu.tsx";
import {UserMenu} from "../../features/auth/components/UserMenu.tsx";
import {PageBoundary} from "../common/PageBoundary.tsx";
import type {ShellNavItem} from "../../app/navigation.tsx";
import {navButtonSx} from "./navButtonSx.ts";

const DRAWER_WIDTH = 232;

const isUnder = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

const isActive = (item: ShellNavItem, pathname: string) =>
    (item.end ? pathname === item.to : isUnder(pathname, item.to))
    || (item.activeFor ?? []).some(path => isUnder(pathname, path));

type Props = {
    /** Where the logo and the app name lead, and their tooltip */
    homeTo: string;
    homeLabel: string;
    /** Next to the app name: what everything on screen belongs to (the clinic, the platform admin) */
    contextLabel: ReactNode;
    /** Plain text of `contextLabel` (tooltip when it is cut off) */
    contextTitle: string;
    navItems: ShellNavItem[];
    /** Below the sidebar entries, after a divider (e.g. a link to another context) */
    navFooter?: ReactNode;
    /** Above the page, below the app bar (e.g. the template warning) */
    banner?: ReactNode;
};

/** The app frame: fixed app bar, sidebar (permanent ≥ md, drawer below), banner and the page. */
export const AppShell = ({homeTo, homeLabel, contextLabel, contextTitle, navItems, navFooter, banner}: Props) => {
    const {t} = useTranslation();
    const {pathname} = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);

    const navigation = (
        <Box component="nav" aria-label={t("nav.main")} sx={{px: 1.5, py: 2}}>
            <List disablePadding>
                {navItems.map(item => {
                    const active = isActive(item, pathname);
                    return (
                        <ListItemButton
                            key={item.to}
                            component={RouterLink}
                            to={item.to}
                            className={active ? "active" : undefined}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setMobileOpen(false)}
                            sx={navButtonSx}
                        >
                            <ListItemIcon>{item.icon}</ListItemIcon>
                            <ListItemText primary={t(item.labelKey)} slotProps={{primary: {fontWeight: "inherit"}}}/>
                        </ListItemButton>
                    );
                })}
            </List>
            {navFooter && (
                <>
                    <Divider sx={{my: 1.5}}/>
                    {navFooter}
                </>
            )}
        </Box>
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
                    {/* Logo + name go to the context's main page */}
                    <Tooltip title={homeLabel}>
                        <Box
                            component={RouterLink}
                            to={homeTo}
                            aria-label={homeLabel}
                            sx={{display: "flex", alignItems: "center", minWidth: 0, textDecoration: "none", borderRadius: 1}}
                        >
                            <Box component="img" src="/drug.png" alt="" sx={{width: 28, height: 28, marginInlineEnd: 1.5}}/>
                            <Typography variant="h6" noWrap sx={{color: "primary.main", display: {xs: "none", sm: "block"}}}>
                                {t("app.name")}
                            </Typography>
                        </Box>
                    </Tooltip>
                    <Typography
                        noWrap
                        title={contextTitle}
                        sx={{
                            marginInlineStart: {xs: 1, sm: 2},
                            paddingInlineStart: {sm: 2},
                            borderInlineStart: {sm: "1px solid"},
                            borderColor: {sm: "divider"},
                            fontWeight: 600,
                            minWidth: 0,
                        }}
                    >
                        {contextLabel}
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
                {banner}
                <Box sx={{p: {xs: 2, md: 3}, maxWidth: 1400, mx: "auto"}}>
                    <PageBoundary><Outlet/></PageBoundary>
                </Box>
            </Box>
        </Box>
    );
};
