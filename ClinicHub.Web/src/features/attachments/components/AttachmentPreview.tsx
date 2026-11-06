import {useId} from "react";
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Typography,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import {useTranslation} from "react-i18next";
import {formatFileSize} from "../functions.ts";
import type {AttachmentPreviewProps, AttachmentPreviewState} from "../types.ts";

/** What shows instead of the file: its name and size, and why. Download is in the dialog's actions. */
const NoViewer = ({preview, note}: { preview: AttachmentPreviewState; note: string }) => (
    <Stack sx={{gap: 1}}>
        <Box component="span" dir="auto" sx={{fontWeight: 500, overflowWrap: "anywhere"}}>{preview.name}</Box>
        <Typography variant="body2" color="text.secondary">{formatFileSize(preview.sizeBytes)}</Typography>
        <Typography>{note}</Typography>
    </Stack>
);

const PreviewBody = ({preview}: { preview: AttachmentPreviewState }) => {
    const {t} = useTranslation();
    const label = t("attachments.previewOf", {name: preview.name});

    if (preview.kind === "none") return <NoViewer preview={preview} note={t("attachments.noPreview")}/>;
    if (preview.status === "failed") return <NoViewer preview={preview} note={t("attachments.cantShow")}/>;
    if (preview.status === "loading") {
        return (
            <Stack sx={{alignItems: "center", py: 4}}>
                <CircularProgress aria-label={t("common.loading")}/>
            </Stack>
        );
    }
    if (preview.kind === "image") {
        return (
            <Box
                component="img"
                src={preview.url ?? undefined}
                alt={label}
                onError={preview.reportFailed}
                sx={{display: "block", maxWidth: "100%", maxHeight: "70vh", mx: "auto", objectFit: "contain"}}
            />
        );
    }
    // No `sandbox`: it blocks the browser's viewer. Safe because the blob is always re-wrapped as application/pdf
    if (preview.kind === "pdf") {
        return (
            <Box
                component="iframe"
                src={preview.url ?? undefined}
                title={label}
                sx={{display: "block", width: "100%", height: "70vh", border: 0}}
            />
        );
    }
    return (
        <Stack sx={{gap: 1}}>
            {preview.textCut && <Typography variant="body2" color="text.secondary">{t("attachments.textCut")}</Typography>}
            {/* As text, never as markup */}
            <Box component="pre" dir="auto" sx={{m: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "monospace"}}>
                {preview.text}
            </Box>
        </Stack>
    );
};

/** A dialog for one file, stored or selected. One per hook, rendered once by whoever composes the pieces. */
export const AttachmentPreview = ({files: {preview, closePreview}, renderPreview}: AttachmentPreviewProps) => {
    const {t} = useTranslation();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));
    const titleId = useId();
    return (
        // No exit fade: the object URL goes as it closes, so the content has nothing left to show
        <Dialog
            open={!!preview}
            onClose={closePreview}
            fullWidth
            maxWidth="md"
            fullScreen={fullScreen}
            aria-labelledby={titleId}
            transitionDuration={{enter: 225, exit: 0}}
        >
            {preview && (
                <>
                    <DialogTitle id={titleId} sx={{overflowWrap: "anywhere"}}>{t("attachments.previewOf", {name: preview.name})}</DialogTitle>
                    {/* Focusable: a long text scrolls, also by keyboard */}
                    <DialogContent tabIndex={0}>
                        {renderPreview ? renderPreview(preview) : <PreviewBody preview={preview}/>}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={closePreview}>{t("common.close")}</Button>
                        <Button variant="contained" onClick={preview.download}>{t("attachments.download")}</Button>
                    </DialogActions>
                </>
            )}
        </Dialog>
    );
};
