import type {FormEvent, ReactNode} from "react";
import {Box} from "@mui/material";

/**
 * The form of a dialog, around its DialogContent and DialogActions: only the content scrolls, so Save and Cancel stay
 * on screen (also in a full-screen dialog on a phone).
 */
export const DialogForm = ({onSubmit, children}: { onSubmit: (e: FormEvent) => void; children: ReactNode }) => (
    <Box
        component="form"
        onSubmit={onSubmit}
        noValidate
        sx={{display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, overflow: "hidden"}}
    >
        {children}
    </Box>
);
