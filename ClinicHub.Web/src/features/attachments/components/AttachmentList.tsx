import {type ChangeEvent, useEffect, useRef} from "react";
import {Alert, Box, Button, LinearProgress, List, ListItem, Stack, Typography} from "@mui/material";
import CancelIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/DownloadOutlined";
import PreviewIcon from "@mui/icons-material/VisibilityOutlined";
import ReplaceIcon from "@mui/icons-material/SwapHorizOutlined";
import {useTranslation} from "react-i18next";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useFormatDate} from "../../../hooks/useFormatDate.ts";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {formatFileSize, typeLabel} from "../functions.ts";
import type {Attachment, AttachmentItemActions, AttachmentListProps} from "../types.ts";
import {FileIconButton, FileName} from "./FileRowParts.tsx";

const MetaText = ({children}: { children: string }) => (
    <Typography component="span" variant="body2" color="text.secondary">{children}</Typography>
);

const StoredRow = ({file, actions, replacePercent, replaceLocked}: {
    file: Attachment;
    actions: AttachmentItemActions;
    /** This row's Replace is running: its percent; else null */
    replacePercent: number | null;
    /** A Replace can't start now */
    replaceLocked: boolean;
}) => {
    const {t} = useTranslation();
    const formatDate = useFormatDate();
    const name = file.originalFileName;
    return (
        <>
            <Box sx={{flex: "1 1 12rem", minWidth: 0}}>
                <FileName name={name}/>
                <Stack direction="row" sx={{flexWrap: "wrap", columnGap: 1.5}}>
                    <MetaText>{typeLabel(file.typeKey)}</MetaText>
                    <MetaText>{formatFileSize(file.sizeBytes)}</MetaText>
                    <MetaText>{formatDate(file.createdAt)}</MetaText>
                </Stack>
                {replacePercent !== null && (
                    <LinearProgress
                        variant="determinate"
                        value={replacePercent}
                        aria-label={t("attachments.uploadingFile", {name})}
                        sx={{mt: 0.5}}
                    />
                )}
            </Box>
            <Stack direction="row" sx={{flexShrink: 0, marginInlineStart: "auto"}}>
                <FileIconButton label={t("attachments.previewFile", {name})} onClick={actions.preview}>
                    <PreviewIcon fontSize="small"/>
                </FileIconButton>
                <FileIconButton label={t("attachments.downloadFile", {name})} onClick={actions.download}>
                    <DownloadIcon fontSize="small"/>
                </FileIconButton>
                {actions.replace && (
                    <FileIconButton label={t("attachments.replaceFile", {name})} onClick={actions.replace} disabled={replaceLocked} action="replace">
                        <ReplaceIcon fontSize="small"/>
                    </FileIconButton>
                )}
                {actions.cancelReplace && (
                    <FileIconButton label={t("attachments.cancelFile", {name})} onClick={actions.cancelReplace}>
                        <CancelIcon fontSize="small"/>
                    </FileIconButton>
                )}
                {actions.delete && (
                    <FileIconButton
                        label={t("attachments.deleteFile", {name})}
                        onClick={actions.delete}
                        disabled={replacePercent !== null}
                        color="error"
                    >
                        <DeleteIcon fontSize="small"/>
                    </FileIconButton>
                )}
            </Stack>
        </>
    );
};

/** The stored files: name, type, size, date; download one or all, preview, replace, delete. Opening it fetches no file. */
export const AttachmentList = ({files, canReplace = false, canDelete = false, renderItem, renderEmpty}: AttachmentListProps) => {
    const {t} = useTranslation();
    const {confirm, dialog: confirmDialog} = useConfirm();
    const onceDelete = useSingleFlight();
    const replaces = canReplace && files.hasReplace;
    const deletes = canDelete && files.hasDelete;

    const list = useRef<HTMLUListElement>(null);
    const rows = useRef(new Map<string, HTMLLIElement>());
    const focusAfterDelete = useRef<{ deletedId: string; nextId: string | null } | null>(null);

    // The row is gone once the list has reloaded. Only when the focus went with it: the user may have moved on meanwhile
    useEffect(() => {
        const pending = focusAfterDelete.current;
        if (!pending || files.files.some(file => file.id === pending.deletedId)) return;
        focusAfterDelete.current = null;
        if (document.activeElement && document.activeElement !== document.body) return;
        const nextRow = pending.nextId === null ? undefined : rows.current.get(pending.nextId);
        (nextRow?.querySelector("button") ?? list.current)?.focus();
    }, [files.files]);

    const handleDelete = (file: Attachment) => onceDelete(async () => {
        const confirmed = await confirm({
            title: t("attachments.deleteTitle", {name: file.originalFileName}),
            message: t("attachments.deleteMessage"),
            destructive: true,
        });
        if (!confirmed) return;
        const index = files.files.findIndex(row => row.id === file.id);
        focusAfterDelete.current = {deletedId: file.id, nextId: files.files[index + 1]?.id ?? null};
        await files.delete(file);
    });

    const replaceInput = useRef<HTMLInputElement>(null);
    const replaceTarget = useRef<Attachment | null>(null);
    // The row whose Replace button takes the focus once it's there and on again: the new row, once the list has reloaded
    const focusAfterReplace = useRef<string | null>(null);

    // Only when the focus went with the old row or the Cancel, as for a delete
    const moveFocusAfterReplace = () => {
        const id = focusAfterReplace.current;
        const button = id === null ? null : rows.current.get(id)?.querySelector<HTMLButtonElement>('button[data-action="replace"]');
        if (!button || button.disabled) return;
        focusAfterReplace.current = null;
        if (!document.activeElement || document.activeElement === document.body) button.focus();
    };
    useEffect(moveFocusAfterReplace);

    const onReplacePicked = (event: ChangeEvent<HTMLInputElement>) => {
        const newFile = event.target.files?.[0];
        // So the same file can be picked again
        event.target.value = "";
        const target = replaceTarget.current;
        if (!newFile || !target) return;
        void files.replace(target, newFile).then(replaced => {
            focusAfterReplace.current = replaced?.id ?? target.id;
            moveFocusAfterReplace();
        });
    };

    const actionsOf = (file: Attachment): AttachmentItemActions => ({
        download: () => void files.download(file),
        preview: () => files.openPreview(file),
        ...(replaces ? {
            replace: () => {
                if (files.replacing || !files.canPick) return;
                replaceTarget.current = file;
                replaceInput.current?.click();
            },
        } : {}),
        ...(files.replacing?.id === file.id ? {cancelReplace: files.cancelReplace} : {}),
        ...(deletes ? {delete: () => void handleDelete(file)} : {}),
    });

    if (files.isListLoading) return <LinearProgress aria-label={t("common.loading")}/>;
    if (files.listFailed) {
        return (
            <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={files.retryList}>{t("common.retry")}</Button>}
            >
                {t("attachments.listFailed")}
            </Alert>
        );
    }

    return (
        <Stack sx={{gap: 1}}>
            {replaces && (
                <input
                    ref={replaceInput}
                    type="file"
                    hidden
                    data-testid="attachment-replace-input"
                    accept={files.accept}
                    onChange={onReplacePicked}
                />
            )}
            {files.files.length > 0 && (
                <Stack direction="row" sx={{justifyContent: "flex-end"}}>
                    <Button
                        size="small"
                        startIcon={<DownloadIcon/>}
                        onClick={() => void files.downloadAll()}
                        disabled={files.isDownloadingAll}
                    >
                        {t("attachments.downloadAll")}
                    </Button>
                </Stack>
            )}
            {/* Stays when it's empty: it's where the focus goes after the last row is deleted */}
            <List ref={list} tabIndex={-1} aria-label={t("attachments.storedLabel")} disablePadding sx={{"&:focus": {outline: "none"}}}>
                {files.files.map(file => (
                    <ListItem
                        key={file.id}
                        ref={(element: HTMLLIElement | null) => {
                            if (element) rows.current.set(file.id, element);
                            else rows.current.delete(file.id);
                        }}
                        divider
                        disableGutters
                        sx={{flexWrap: "wrap", gap: 1}}
                    >
                        {renderItem ? renderItem(file, actionsOf(file)) : (
                            <StoredRow
                                file={file}
                                actions={actionsOf(file)}
                                replacePercent={files.replacing?.id === file.id ? files.replacing.percent : null}
                                replaceLocked={!!files.replacing || !files.canPick}
                            />
                        )}
                    </ListItem>
                ))}
            </List>
            {files.files.length === 0 && (renderEmpty
                ? renderEmpty()
                : <Typography color="text.secondary" sx={{py: 2, textAlign: "center"}}>{t("attachments.empty")}</Typography>)}
            {confirmDialog}
        </Stack>
    );
};
