import type {ReactNode} from "react";
import {Box, Stack, Typography} from "@mui/material";

type Props = {
    title: ReactNode;
    /**
     * Plain text of a title that may be long (e.g. a clinic's name): the title is then cut after 3 lines, with this
     * text as its tooltip.
     */
    titleText?: string;
    /** Below the title; a block (it may hold e.g. a chip) */
    subtitle?: ReactNode;
    /** Rendered before the title, e.g. a back button */
    leading?: ReactNode;
    actions?: ReactNode;
};

export const PageHeader = ({title, titleText, subtitle, leading, actions}: Props) => (
    <Stack
        direction="row"
        sx={{mb: 3, gap: 2, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap"}}
    >
        {/* Top-aligned: a long title wraps below, the back button stays next to its first line */}
        <Stack direction="row" sx={{alignItems: "flex-start", gap: 1, minWidth: 0}}>
            {leading}
            <Box sx={{minWidth: 0}}>
                <Typography
                    variant="h5"
                    component="h1"
                    title={titleText}
                    sx={titleText ? {
                        overflowWrap: "anywhere",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    } : undefined}
                >
                    {title}
                </Typography>
                {subtitle && <Typography variant="body2" component="div" color="text.secondary">{subtitle}</Typography>}
            </Box>
        </Stack>
        {actions && <Stack direction="row" sx={{gap: 1, flexWrap: "wrap"}}>{actions}</Stack>}
    </Stack>
);
