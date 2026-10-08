import type {ReactNode} from "react";
import {Box, Stack, Typography} from "@mui/material";

type Props = {
    title: ReactNode;
    subtitle?: ReactNode;
    /** Rendered before the title, e.g. a back button */
    leading?: ReactNode;
    actions?: ReactNode;
};

export const PageHeader = ({title, subtitle, leading, actions}: Props) => (
    <Stack
        direction="row"
        sx={{mb: 3, gap: 2, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap"}}
    >
        <Stack direction="row" sx={{alignItems: "center", gap: 1, minWidth: 0}}>
            {leading}
            <Box sx={{minWidth: 0}}>
                <Typography variant="h5" component="h1">{title}</Typography>
                {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
            </Box>
        </Stack>
        {actions && <Stack direction="row" sx={{gap: 1, flexWrap: "wrap"}}>{actions}</Stack>}
    </Stack>
);
