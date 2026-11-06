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

/** Remove and Cancel, when they do something, take the focus off their row first: `moveFocus`. */
const actionsOf = (files: UseAttachments, item: SelectedFile, moveFocus: () => void): SelectedFileActions => ({
    remove: () => {
        if (item.status === "uploading") return;
        moveFocus();
        files.removeSelected(item.key);
    },
    cancel: () => {
        if (item.status !== "uploading" && item.status !== "queued") return;
        moveFocus();
        files.cancel(item.key);
    },
    retry: () => files.retry(item.key),
    preview: () => files.openPreview(item),
});

/**
 * Select with a button or by dropping files, see and change the selection, then Upload with progress per file. With
 * `multiple` false, `canReplace`, the adapter's call and a stored file, Upload replaces that file.
 */
export const AttachmentPicker = ({files, canUpload = false, canReplace = false, renderTrigger, renderSelectedItem}: AttachmentPickerProps) => {
    const {t} = useTranslation();
    const input = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    // Moving over a child element fires a leave on its parent: only the outermost leave ends the drag
    const dragDepth = useRef(0);
    const pickButton = useRef<HTMLButtonElement>(null);
    const rows = useRef(new Map<string, HTMLLIElement>());

    const replaces = canReplace && files.hasReplace;
    const replacesStored = replaces && !files.multiple && files.files.length > 0;
    const rulesAlert = files.rulesFailed && (
        <Alert
            severity="error"
            action={<Button color="inherit" size="small" onClick={files.retryRules}>{t("common.retry")}</Button>}
        >
            {t("attachments.rulesFailed")}
        </Alert>
    );
    // A row's Replace needs the rules too: with nothing else here, its user still gets their failure and Retry
    if (!canUpload && !replacesStored) return replaces && files.files.length > 0 ? rulesAlert : null;

    /** To the next row's first button, or with no next row to Choose files. A custom trigger's focus is the feature's. */
    const focusPast = (item: SelectedFile) => () => {
        const next = files.selected[files.selected.findIndex(row => row.key === item.key) + 1];
        const nextButton = next && rows.current.get(next.key)?.querySelector("button");
        (nextButton ?? pickButton.current)?.focus();
    };

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
                    <Button ref={pickButton} variant="outlined" startIcon={<UploadFileIcon/>} onClick={trigger.open} disabled={trigger.disabled}>
                        {files.multiple ? t("attachments.pick") : t("attachments.pickOne")}
                    </Button>
                    {/* A touch device has no dropping: only the button */}
                    <Typography variant="body2" color="text.secondary" sx={{"@media (pointer: coarse)": {display: "none"}}}>
                        {trigger.isDragActive ? t("attachments.dropNow") : hint}
                    </Typography>
                </Box>
            )}

            {rulesAlert}
            {files.refusals.length > 0 && (
                <Alert severity="error">
                    {files.refusals.map(refusal => (
                        <Box key={refusal.key} sx={{overflowWrap: "anywhere"}}>{refusal.message}</Box>
                    ))}
                </Alert>
            )}

            {files.selected.length > 0 && (
                <List aria-label={t("attachments.selectedLabel")} disablePadding>
                    {files.selected.map(item => {
                        const actions = actionsOf(files, item, focusPast(item));
                        return (
                            <ListItem
                                key={item.key}
                                ref={(element: HTMLLIElement | null) => {
                                    if (element) rows.current.set(item.key, element);
                                    else rows.current.delete(item.key);
                                }}
                                divider
                                disableGutters
                                sx={{flexWrap: "wrap", gap: 1}}
                            >
                                {renderSelectedItem ? renderSelectedItem(item, actions) : <SelectedRow item={item} actions={actions}/>}
                            </ListItem>
                        );
                    })}
                </List>
            )}

            <Box>
                <Button variant="contained" onClick={() => void files.upload()} disabled={files.isUploading || !files.canSend}>
                    {t("attachments.upload")}
                </Button>
            </Box>
            <Box aria-live="polite" sx={VISUALLY_HIDDEN}>{files.announcement}</Box>
        </Stack>
    );
};
