import {alpha, type Theme} from "@mui/material/styles";

/** Sidebar entry style (`AppShell`), also for actions placed below the entries (its `navFooter`). */
export const navButtonSx = (theme: Theme) => ({
    borderRadius: 2,
    mb: 0.5,
    color: "text.secondary",
    "& .MuiListItemIcon-root": {color: "inherit", minWidth: 40},
    "&.active": {
        bgcolor: alpha(theme.palette.primary.main, 0.1),
        color: "primary.main",
        fontWeight: 600,
    },
});
