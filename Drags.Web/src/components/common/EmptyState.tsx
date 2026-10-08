import type {ReactNode} from "react";
import {Box, Stack, Typography} from "@mui/material";

type Props = {
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    compact?: boolean;
};

export const EmptyState = ({icon, title, description, action, compact}: Props) => (
    <Stack sx={{alignItems: "center", textAlign: "center", gap: 1, py: compact ? 3 : 6, px: 2}}>
        {icon && (
            <Box sx={{color: "primary.main", opacity: 0.7, "& svg": {fontSize: compact ? 36 : 48}}}>{icon}</Box>
        )}
        <Typography variant={compact ? "subtitle1" : "h6"} sx={{fontWeight: 600}}>{title}</Typography>
        {description && (
            <Typography variant="body2" color="text.secondary" sx={{maxWidth: 360}}>{description}</Typography>
        )}
        {action && <Box sx={{mt: 1}}>{action}</Box>}
    </Stack>
);
