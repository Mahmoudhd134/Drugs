import type {ReactNode} from "react";
import type {DataScope} from "../../api/dataScope.ts";

/** A stored file, as the API's `AttachmentDto` answers it. */
export type Attachment = {
    id: string;
    originalFileName: string;
    /** The checked type: `png`, `jpeg`, `pdf`, `xlsx`… */
    typeKey: string;
    contentType: string;
    sizeBytes: number;
    /** ISO 8601 */
    createdAt: string;
};

/** What the module's config allows, as the API's `AttachmentRulesDto` answers it. */
export type AttachmentRules = {
    maxFileSizeBytes: number;
    /** Lower case with their dot: `.png` */
    extensions: string[];
};

export type UploadOptions = {
    /** 0 to 100, whole numbers. */
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
};

/**
 * A feature's routes, as `RoleAdapter` and `StaffAdapter` do it: the components hold no URL and no permission key.
 * `attachmentRequests(base)` builds all of it but `rules`, `scope`, `affects` and `container`.
 */
export type AttachmentsAdapter = DataScope & {
    rules: () => Promise<AttachmentRules>;
    list: () => Promise<Attachment[]>;
    upload: (file: File, options: UploadOptions) => Promise<Attachment>;
    replace?: (id: string, file: File, options: UploadOptions) => Promise<Attachment>;
    delete?: (id: string) => Promise<void>;
    download: (id: string, signal?: AbortSignal) => Promise<Blob>;
};

export type UseAttachmentsOptions = {
    adapter: AttachmentsAdapter;
    /** Default true. False: the input takes one file, and a new pick replaces the selection. */
    multiple?: boolean;
    /** The most files the record may hold: stored + selected. The feature's rule: the backend has no count. */
    maxFiles?: number;
    /** With `multiple` false and a stored file, Upload sends the selected file through `adapter.replace`. Default false. */
    canReplace?: boolean;
};

/**
 * waiting: picked, not sent. queued: sent by the current run when its turn comes. uploading: its request is running.
 * failed: refused or broken, with `error` and Retry. cancelled: stopped by the user, no error, sent again by Upload.
 * A file that succeeded leaves the selection.
 */
export type SelectedStatus = "waiting" | "queued" | "uploading" | "failed" | "cancelled";

export type SelectedFile = {
    /** `fileKey(file)`: name, size and last modified */
    key: string;
    file: File;
    status: SelectedStatus;
    /** 0 to 100; meaningful while uploading */
    percent: number;
    /** The translated reason, only when failed */
    error: string | null;
};

/**
 * A file refused on the client, or a folder or a count refused: it never enters the selection. The one exception is a
 * file already selected when the list fills `maxFiles`: it stays selected, and its line leaves with it.
 */
export type PickRefusal = {
    /** Unique within the list */
    key: string;
    /** Translated, the file's name included (bidi isolated) */
    message: string;
};

export type PreviewKind = "image" | "pdf" | "text" | "none";

/** What the preview dialog shows; also what `renderPreview` receives. */
export type AttachmentPreviewState = {
    name: string;
    sizeBytes: number;
    kind: PreviewKind;
    /** none → always "ready"; loading: a stored file's bytes are on their way; failed: can't be shown (name, size, Download) */
    status: "loading" | "ready" | "failed";
    /** The object URL, for "image" and "pdf" once ready. Revoked on close and unmount */
    url: string | null;
    /** The decoded text, for "text" once ready. Never markup: render it as text */
    text: string | null;
    /** The text is only the first 1 MB */
    textCut: boolean;
    /** Saves this file. A stored one is fetched again unless its bytes are already here */
    download: () => void;
    /** An image that failed to decode tells the state (`<img onError>`) */
    reportFailed: () => void;
};

/** The headless hook's result: everything but markup. Level 3 of customizing (design § 12). */
export type UseAttachments = {
    // Rules
    rules: AttachmentRules | null;
    rulesFailed: boolean;
    retryRules: () => void;
    /** The `accept` attribute: exactly the rules' extensions, comma separated; "" with no rules */
    accept: string;
    /** Rules are loaded, so files can be picked */
    canPick: boolean;
    multiple: boolean;
    /** The adapter has this call: a control needs it as well as the permission */
    hasReplace: boolean;
    hasDelete: boolean;

    // The stored files
    files: Attachment[];
    isListLoading: boolean;
    listFailed: boolean;
    retryList: () => void;

    // The selection
    selected: SelectedFile[];
    /** The refusals of the last pick, which the next pick clears, and the selected files the list left no room for */
    refusals: PickRefusal[];
    clearRefusals: () => void;
    /** Adds the allowed files (the same file twice counts once) and refuses the rest with `refusals`. No request */
    pick: (files: Iterable<File>) => void;
    /** `pick` for a drop: a dropped folder is refused */
    drop: (data: DataTransfer) => void;
    /** Not while uploading: Cancel that one first */
    removeSelected: (key: string) => void;
    /**
     * Sends every waiting and cancelled file, one request at a time. Files picked meanwhile wait for the next Upload.
     * Sends nothing while the count of stored files matters and the list hasn't answered, or with too many selected
     */
    upload: () => Promise<void>;
    /** `upload` has something to send now */
    canSend: boolean;
    /** Aborts an uploading file (it becomes cancelled; the run goes on) or takes a queued one back to waiting */
    cancel: (key: string) => void;
    /** A failed file again: joins the current run, or starts one. Never ignored */
    retry: (key: string) => void;
    /** A run is in progress */
    isUploading: boolean;
    /** The last finish or failure as a sentence, for an `aria-live` region */
    announcement: string;

    // Actions on a stored file. Failures are toasted; a 404 also reloads the list. None asks for a confirmation
    download: (file: Attachment) => Promise<void>;
    /** Saves each file in turn */
    downloadAll: () => Promise<void>;
    isDownloadingAll: boolean;
    /** Without a confirmation: `actions.delete` of `renderItem`, and the list's button, add it */
    delete: (file: Attachment) => Promise<void>;
    /** Checks the rules, then sends it at once through `adapter.replace`. Answers the new file; a refusal keeps the old one and answers null */
    replace: (file: Attachment, newFile: File) => Promise<Attachment | null>;
    /** The row replace running now: one at a time */
    replacing: { id: string; percent: number } | null;
    /** Aborts the row replace running now: the old file stays, no error shows and the list reloads */
    cancelReplace: () => void;

    // Preview: one at a time
    preview: AttachmentPreviewState | null;
    /** Fetches a stored file only now (one request, whatever the clicks); a selected file makes no request */
    openPreview: (target: Attachment | SelectedFile) => void;
    closePreview: () => void;
};

/** `renderTrigger`'s props. Spread `dropProps` on the drop area; `open` opens the browser's file choice. */
export type AttachmentTriggerProps = {
    open: () => void;
    dropProps: {
        onDragEnter: (event: React.DragEvent) => void;
        onDragOver: (event: React.DragEvent) => void;
        onDragLeave: (event: React.DragEvent) => void;
        onDrop: (event: React.DragEvent) => void;
    };
    isDragActive: boolean;
    disabled: boolean;
};

export type SelectedFileActions = {
    remove: () => void;
    cancel: () => void;
    retry: () => void;
    preview: () => void;
};

/** `renderItem`'s actions. `replace` and `delete` exist only with `canReplace` and `canDelete` and the adapter's call, `cancelReplace` only while this row's replace runs. */
export type AttachmentItemActions = {
    download: () => void;
    preview: () => void;
    /** Opens the browser's file choice for one file, then replaces */
    replace?: () => void;
    cancelReplace?: () => void;
    /** Includes the confirmation */
    delete?: () => void;
};

export type AttachmentPickerProps = {
    files: UseAttachments;
    /** Default false: no trigger and no Upload */
    canUpload?: boolean;
    /**
     * Default false. With `multiple` false, a stored file and `adapter.replace`, it also shows the trigger and Upload: they
     * replace that file. A row's Replace needs the rules too, so with nothing else to show, their failure shows here
     */
    canReplace?: boolean;
    renderTrigger?: (props: AttachmentTriggerProps) => ReactNode;
    renderSelectedItem?: (item: SelectedFile, actions: SelectedFileActions) => ReactNode;
};

export type AttachmentListProps = {
    files: UseAttachments;
    /** Default false. Needs `adapter.replace` too */
    canReplace?: boolean;
    /** Default false. Needs `adapter.delete` too */
    canDelete?: boolean;
    renderItem?: (file: Attachment, actions: AttachmentItemActions) => ReactNode;
    renderEmpty?: () => ReactNode;
};

/** One dialog per hook, rendered once by whoever composes the pieces (`AttachmentManager` does). */
export type AttachmentPreviewProps = {
    files: Pick<UseAttachments, "preview" | "closePreview">;
    /** Replaces the dialog's content only: its focus trap and name stay */
    renderPreview?: (preview: AttachmentPreviewState) => ReactNode;
};

export type AttachmentManagerProps = UseAttachmentsOptions
    & Omit<AttachmentPickerProps, "files">
    & Omit<AttachmentListProps, "files">
    & Pick<AttachmentPreviewProps, "renderPreview">;
