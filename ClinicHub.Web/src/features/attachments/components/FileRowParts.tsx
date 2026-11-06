import type {MouseEvent, ReactNode} from "react";
import {Box, IconButton, Tooltip} from "@mui/material";

/**
 * An icon button with a tooltip and its name. The span keeps the tooltip on a disabled button, and keeps the button
 * mounted when it becomes disabled.
 */
export const FileIconButton = ({label, onClick, disabled, color, action, children}: {
    label: string;
    onClick: (event: MouseEvent) => void;
    disabled?: boolean;
    color?: "error";
    /** `data-action`, for a row to find this button when the focus should come back to it */
    action?: string;
    children: ReactNode;
}) => (
    <Tooltip title={label} describeChild>
        <span>
            <IconButton aria-label={label} onClick={onClick} disabled={disabled} color={color} data-action={action}>{children}</IconButton>
        </span>
    </Tooltip>
);

/** A file's name: user data, so it sets its own direction and is isolated from its row; it wraps, the tooltip holds it whole. */
export const FileName = ({name}: { name: string }) => (
    <Tooltip title={name} describeChild>
        <Box component="span" dir="auto" sx={{fontWeight: 500, overflowWrap: "anywhere"}}>{name}</Box>
    </Tooltip>
);
