import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip} from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import LogoutIcon from "@mui/icons-material/Logout";
import {useTranslation} from "react-i18next";
import {useAuth} from "../useAuth.ts";

/** App bar account menu: who is logged in, switch clinic (when there are several contexts), log out. */
export const UserMenu = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const {me, contexts, logout} = useAuth();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);

    const close = () => setAnchor(null);

    return (
        <>
            <Tooltip title={t("auth.account")}>
                <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label={t("auth.account")} edge="end">
                    <AccountCircleIcon/>
                </IconButton>
            </Tooltip>
            <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
                {me && (
                    <ListItemText
                        sx={{px: 2, pb: 1}}
                        // Phones stay left to right in Arabic (else the "+" moves to the end)
                        primary={me.staff?.fullName ?? <span dir="ltr">{me.user.phone}</span>}
                        secondary={me.staff ? <span dir="ltr">{me.user.phone}</span> : undefined}
                    />
                )}
                {me && <Divider/>}
                {contexts.length > 1 && (
                    <MenuItem onClick={() => {
                        close();
                        navigate("/select-clinic");
                    }}>
                        <ListItemIcon><SwapHorizIcon fontSize="small"/></ListItemIcon>
                        <ListItemText>{t("auth.switchContext")}</ListItemText>
                    </MenuItem>
                )}
                <MenuItem onClick={() => {
                    close();
                    void logout();
                }}>
                    <ListItemIcon><LogoutIcon fontSize="small"/></ListItemIcon>
                    <ListItemText>{t("auth.logout")}</ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
};
