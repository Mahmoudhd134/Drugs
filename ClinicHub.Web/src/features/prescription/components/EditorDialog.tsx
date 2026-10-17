import {lazy, Suspense} from "react";
import {Box, CircularProgress, Dialog, useMediaQuery} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import {useTranslation} from "react-i18next";
import type {PrescriptionLine} from "../types.ts";

// The rich-text editor is large, so it's only downloaded when first opened
const EditorContent = lazy(() => import("./EditorContent.tsx"));

type Props = {
    open: boolean;
    lines: PrescriptionLine[];
    onClose: () => void;
};

export const EditorDialog = ({open, lines, onClose}: Props) => {
    const {t} = useTranslation();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
            {/* The dialog unmounts this after closing, so it's rebuilt from the current selection on each open */}
            <Suspense fallback={<Box sx={{display: "flex", justifyContent: "center", py: 8}}><CircularProgress aria-label={t("common.loading")}/></Box>}>
                <EditorContent lines={lines} onClose={onClose}/>
            </Suspense>
        </Dialog>
    );
};
