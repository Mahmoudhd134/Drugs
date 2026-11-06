import {type ChangeEvent, type DragEvent, useEffect, useRef, useState} from "react";
import {Alert, Box, Button, LinearProgress, List, ListItem, Stack, Typography} from "@mui/material";
import CancelIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import PreviewIcon from "@mui/icons-material/VisibilityOutlined";
import RetryIcon from "@mui/icons-material/Refresh";
import UploadFileIcon from "@mui/icons-material/UploadFileOutlined";
import {useTranslation} from "react-i18next";
import {formatFileSize, previewKind} from "../functions.ts";
import type {AttachmentPickerProps, AttachmentTriggerProps, SelectedFile, SelectedFileActions, UseAttachments} from "../types.ts";
import {FileIconButton, FileName} from "./FileRowParts.tsx";

const VISUALLY_HIDDEN = {
    position: "absolute", width: "1px", height: "1px", m: "-1px", p: 0, border: 0,
    overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
} as const;

/** A selected image's thumbnail: its object URL is created only when its row enters the view, and revoked with the row. */
const Thumbnail = ({file}: { file: File }) => {
    const box = useRef<HTMLDivElement>(null);
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let created: string | null = null;
        const show = () => {
            created = URL.createObjectURL(file);
            setUrl(created);
        };
        let observer: IntersectionObserver | undefined;
        if (typeof IntersectionObserver === "undefined") {
            show();
        } else {
            observer = new IntersectionObserver(entries => {
                if (!entries.some(entry => entry.isIntersecting)) return;
                observer?.disconnect();
                show();
            });
            if (box.current) observer.observe(box.current);
        }
        return () => {
            observer?.disconnect();
            if (created) URL.revokeObjectURL(created);
        };
    }, [file]);

    return (
        <Box ref={box} sx={{width: 48, height: 48, flexShrink: 0, borderRadius: 1, overflow: "hidden", bgcolor: "action.hover"}}>
            {url && <Box component="img" src={url} alt="" sx={{display: "block", width: "100%", height: "100%", objectFit: "cover"}}/>}
        </Box>
    );
};

const SelectedRow = ({item, actions}: { item: SelectedFile; actions: SelectedFileActions }) => {
    const {t} = useTranslation();
    const name = item.file.name;
    return (
        <>
            {previewKind({name}) === "image" && <Thumbnail file={item.file}/>}
            <Box sx={{flex: "1 1 12rem", minWidth: 0}}>
                <FileName name={name}/>
                <Typography variant="body2" color="text.secondary">{formatFileSize(item.file.size)}</Typography>
                {item.status === "failed" && <Typography variant="body2" color="error" sx={{overflowWrap: "anywhere"}}>{item.error}</Typography>}
                {item.status === "uploading" && (
                    <LinearProgress
                        variant="determinate"
                        value={item.percent}
                        aria-label={t("attachments.uploadingFile", {name})}
                        sx={{mt: 0.5}}
                    />
                )}
            </Box>
            <Stack direction="row" sx={{flexShrink: 0, marginInlineStart: "auto"}}>
                <FileIconButton label={t("attachments.previewFile", {name})} onClick={actions.preview}>
                    <PreviewIcon fontSize="small"/>
                </FileIconButton>
                {item.status === "failed" && (
                    <FileIconButton label={t("attachments.retryFile", {name})} onClick={actions.retry}>
                        <RetryIcon fontSize="small"/>
                    </FileIconButton>
                )}
                {(item.status === "uploading" || item.status === "queued") && (
                    <FileIconButton label={t("attachments.cancelFile", {name})} onClick={actions.cancel}>
                        <CancelIcon fontSize="small"/>
                    </FileIconButton>
                )}
                {item.status !== "uploading" && (
                    <FileIconButton label={t("attachments.removeFile", {name})} onClick={actions.remove}>
                        <DeleteIcon fontSize="small"/>
                    </FileIconButton>
                )}
            </Stack>
        </>
    );
};

const actionsOf = (files: UseAttachments, item: SelectedFile): SelectedFileActions => ({
    remove: () => files.removeSelected(item.key),
    cancel: () => files.cancel(item.key),
    retry: () => files.retry(item.key),
    preview: () => files.openPreview(item),
});

/**
 * Select with a button or by dropping files, see and change the selection, then Upload with progress per file. With
 * `multiple` false, `canReplace` and a stored file, Upload replaces that file.
 */
export const AttachmentPicker = ({files, canUpload = false, canReplace = false, renderTrigger, renderSelectedItem}: AttachmentPickerProps) => {
    const {t} = useTranslation();
    const input = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    // Moving over a child element fires a leave on its parent: only the outermost leave ends the drag
    const dragDepth = useRef(0);

    const replacesStored = canReplace && !files.multiple && files.files.length > 0;
    if (!canUpload && !replacesStored) return null;

    const onPicked = (event: ChangeEvent<HTMLInputElement>) => {
        const picked = [...(event.target.files ?? [])];
        // So the same file can be picked again after it's removed
        event.target.value = "";
        files.pick(picked);
    };

    const trigger: AttachmentTriggerProps = {
        open: () => input.current?.click(),
        dropProps: {
            onDragEnter: (event: DragEvent) => {
                event.preventDefault();
                dragDepth.current++;
                setDragging(true);
            },
            onDragOver: (event: DragEvent) => event.preventDefault(),
            onDragLeave: () => {
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragging(false);
            },
            onDrop: (event: DragEvent) => {
                event.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                files.drop(event.dataTransfer);
            },
        },
        isDragActive: dragging && files.canPick,
        disabled: !files.canPick,
    };

    const hint = files.multiple ? t("attachments.dropHint") : t("attachments.dropHintOne");
    const canSend = files.selected.some(item => item.status === "waiting" || item.status === "cancelled");

    return (
        <Stack sx={{gap: 1.5}}>
            <input
                ref={input}
                type="file"
                hidden
                data-testid="attachment-input"
                accept={files.accept}
                multiple={files.multiple}
                disabled={!files.canPick}
                onChange={onPicked}
            />
            {renderTrigger ? renderTrigger(trigger) : (
                <Box
                    {...trigger.dropProps}
                    data-testid="attachment-drop-area"
                    sx={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1.5,
                        p: 2,
                        textAlign: "center",
                        border: "2px dashed",
                        borderRadius: 1,
                        borderColor: trigger.isDragActive ? "primary.main" : "divider",
                        bgcolor: trigger.isDragActive ? "action.hover" : "transparent",
                    }}
                >
                    <Button variant="outlined" startIcon={<UploadFileIcon/>} onClick={trigger.open} disabled={trigger.disabled}>
                        {files.multiple ? t("attachments.pick") : t("attachments.pickOne")}
                    </Button>
                    <Typography variant="body2" color="text.secondary">
                        {trigger.isDragActive ? t("attachments.dropNow") : hint}
                    </Typography>
                </Box>
            )}

            {files.rulesFailed && (
                <Alert
                    severity="error"
                    action={<Button color="inherit" size="small" onClick={files.retryRules}>{t("common.retry")}</Button>}
                >
                    {t("attachments.rulesFailed")}
                </Alert>
            )}
            {files.refusals.length > 0 && (
                <Alert severity="error">
                    {files.refusals.map(refusal => (
                        <Box key={refusal.key} sx={{overflowWrap: "anywhere"}}>{refusal.message}</Box>
                    ))}
                </Alert>
            )}

            {files.selected.length > 0 && (
                <List aria-label={t("attachments.selectedLabel")} disablePadding>
                    {files.selected.map(item => (
                        <ListItem key={item.key} divider disableGutters sx={{flexWrap: "wrap", gap: 1}}>
                            {renderSelectedItem
                                ? renderSelectedItem(item, actionsOf(files, item))
                                : <SelectedRow item={item} actions={actionsOf(files, item)}/>}
                        </ListItem>
                    ))}
                </List>
            )}

            <Box>
                <Button variant="contained" onClick={() => void files.upload()} disabled={files.isUploading || !canSend}>
                    {t("attachments.upload")}
                </Button>
            </Box>
            <Box aria-live="polite" sx={VISUALLY_HIDDEN}>{files.announcement}</Box>
        </Stack>
    );
};
