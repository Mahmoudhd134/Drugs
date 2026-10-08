import {type ReactNode, Suspense, useState} from "react";
import {NavLink, Outlet} from "react-router-dom";
import {
    AppBar,
    Box,
    CircularProgress,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Toolbar,
    Typography,
} from "@mui/material";
import {alpha} from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CategoryIcon from "@mui/icons-material/Category";
import MedicationIcon from "@mui/icons-material/Medication";
import {useTranslation} from "react-i18next";
import {LanguageMenu} from "./LanguageMenu.tsx";

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
                    <IconButton
                        edge="start"
                        onClick={() => setMobileOpen(true)}
                        aria-label={t("nav.openMenu")}
                        sx={{me: 1, display: {md: "none"}}}
                    >
                        <MenuIcon/>
                    </IconButton>
                    <Box component="img" src="/drug.png" alt="" sx={{width: 28, height: 28, me: 1.5}}/>
                    <Typography variant="h6" noWrap sx={{flexGrow: 1, color: "primary.main"}}>
                        {t("app.name")}
                    </Typography>
                    <LanguageMenu/>
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
                <Box sx={{p: {xs: 2, md: 3}, maxWidth: 1400, mx: "auto"}}>
                    <Suspense fallback={<Box sx={{display: "flex", justifyContent: "center", py: 8}}><CircularProgress/></Box>}>
                        <Outlet/>
                    </Suspense>
                </Box>
            </Box>
        </Box>
    );
};
