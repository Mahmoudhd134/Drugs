import {useEffect, useRef, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {loadInScope, refreshScope, showsStaleData} from "../../api/dataScope.ts";
import {getErrorMessage} from "../../api/errors.ts";
import {useSingleFlight} from "../../hooks/useSingleFlight.ts";
import {acceptOf, asPdf, checkFile, displayName, downloadBlob, fileKey, previewKind, readTextPreview, splitDropped} from "./functions.ts";
import type {
    Attachment,
    AttachmentPreviewState,
    PickRefusal,
    PreviewKind,
    SelectedFile,
    UseAttachments,
    UseAttachmentsOptions,
} from "./types.ts";

const NO_FILES: Attachment[] = [];

/** The open preview. Its bytes and object URL stay here, never in a cache. */
type PreviewSession = { key: string; url: string | null; blob: Blob | null };

// The controllers that have one of their own; every other action gets a numbered one
const PREVIEW_CONTROL = "preview";
const REPLACE_CONTROL = "replace";
const uploadControl = (key: string) => `upload:${key}`;

/**
 * The headless hook (design § 12): the list, the selection, progress, errors and every action. No markup.
 *
 * Unmounting aborts every request and stops the upload queue: a clinic switch unmounts the page, and a surviving queue
 * would send the next file with the new clinic's token, storing it in the wrong clinic.
 */
export const useAttachments = ({adapter, multiple = true, maxFiles, canReplace = false}: UseAttachmentsOptions): UseAttachments => {
    const {t} = useTranslation();
    const queryClient = useQueryClient();

    const rulesQuery = useQuery({
        queryKey: [...adapter.scope, "rules"],
        queryFn: () => loadInScope(queryClient, adapter, () => adapter.rules()),
    });
    const listQuery = useQuery({
        queryKey: [...adapter.scope, "list"],
        queryFn: () => loadInScope(queryClient, adapter, () => adapter.list()),
        staleTime: 0,
    });
    const rules = rulesQuery.data ?? null;
    const files = listQuery.data ?? NO_FILES;

    /*
     * Every request goes through this one mutation, so a 403 still reloads /me (AppProviders). It runs a function and
     * answers nothing, and it's dropped soon after: no cache ever holds a File or a Blob. Offline it still runs and fails,
     * instead of pausing the queue.
     */
    const {mutateAsync: request} = useMutation({
        mutationFn: (run: () => Promise<void>) => run(),
        networkMode: "always",
        gcTime: 1_000,
    });

    // The selection. The ref is what the queue reads between renders; the state only mirrors it
    const [selected, setSelected] = useState<SelectedFile[]>([]);
    const selection = useRef<SelectedFile[]>([]);

    // Upload in this mode replaces the newest stored file
    const replacesByUpload = !multiple && canReplace && !!adapter.replace;
    // Until the list answers, no one knows which file that is or how many are stored. A reload counts: it's a new answer
    const listUnknown = (replacesByUpload || maxFiles !== undefined) && (!listQuery.isSuccess || listQuery.isFetching);
    // A list that answered after the pick can leave no room: the last picked are too many. A replacing pick takes the stored file's place
    const excess = maxFiles === undefined || (replacesByUpload && files.length > 0)
        ? []
        : selected.slice(Math.max(0, maxFiles - files.length));
    const uploadHeld = listUnknown || excess.length > 0;

    // What a queue that started on an earlier render reads now
    const latest = useRef({adapter, multiple, maxFiles, canReplace, rules, files, uploadHeld, t});
    latest.current = {adapter, multiple, maxFiles, canReplace, rules, files, uploadHeld, t};

    const alive = useRef(true);
    const controllers = useRef(new Map<string, AbortController>());
    const actionCount = useRef(0);

    const refresh = () => refreshScope(queryClient, latest.current.adapter);

    /** Starts a request's controller, under `id` to be found again; `release` forgets it when the request ends. */
    const control = (id = `action:${++actionCount.current}`) => {
        const controller = new AbortController();
        controllers.current.set(id, controller);
        return {signal: controller.signal, release: () => controllers.current.delete(id)};
    };

    /** By its text, so the same message doesn't stack: several rows failing alike, a refusal repeated. */
    const toastError = (message: string) => toast.error(message, {id: message});

    /** A failure on a stored file: a toast, a 404 also reloads the list; a cancel is silent and reloads; gone: nothing. */
    const reportFailure = (error: unknown, signal?: AbortSignal) => {
        if (!alive.current) return;
        if (signal?.aborted) {
            refresh();
            return;
        }
        toastError(getErrorMessage(error));
        if (showsStaleData(error)) refresh();
    };

    const changeSelection = (change: (items: SelectedFile[]) => SelectedFile[]) => {
        if (!alive.current) return;
        selection.current = change(selection.current);
        setSelected(selection.current);
    };
    const changeItem = (key: string, fields: Partial<SelectedFile>) =>
        changeSelection(items => items.map(item => (item.key === key ? {...item, ...fields} : item)));

    const [refusals, setRefusals] = useState<PickRefusal[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [announcement, setAnnouncement] = useState("");

    /** Adds what's allowed to the selection and refuses the rest. A folder is only refused. */
    const addFiles = (incoming: File[], folders: string[]) => {
        const {rules: current, multiple: several, maxFiles: most, canReplace: replaces, adapter: {replace}, files: stored, t: translate} = latest.current;
        if (!current) return;
        const messages: string[] = [];
        const refusal = (file: File) => {
            const code = checkFile(file, current);
            return code && translate("attachments.refused", {name: displayName(file.name), reason: translate(`errors.${code}`)});
        };
        const tooMany = (file: File) => translate("attachments.tooMany", {name: displayName(file.name), count: most});
        const hasRoom = (count: number) => most === undefined || count < most;
        const newItem = (file: File): SelectedFile =>
            ({key: fileKey(file), file, status: "waiting", percent: 0, error: null});

        let items = selection.current;
        if (several) {
            for (const file of incoming) {
                if (items.some(item => item.key === fileKey(file))) continue;
                const refused = refusal(file);
                if (refused) messages.push(refused);
                else if (!hasRoom(stored.length + items.length)) messages.push(tooMany(file));
                else items = [...items, newItem(file)];
            }
        } else {
            const [first, ...others] = incoming;
            if (first) {
                const uploading = items.filter(item => item.status === "uploading");
                // A pick that will replace the stored file takes its place, so it doesn't count
                const replacesStored = replaces && !!replace && stored.length > 0;
                const refused = refusal(first);
                if (refused) messages.push(refused);
                else if (uploading.some(item => item.key === fileKey(first))) items = uploading;
                else if (!replacesStored && !hasRoom(stored.length + uploading.length)) messages.push(tooMany(first));
                else items = [...uploading, newItem(first)];
            }
            for (const file of others) messages.push(translate("attachments.onlyOne", {name: displayName(file.name)}));
        }
        for (const name of folders) messages.push(translate("attachments.folderRefused", {name: displayName(name)}));

        setRefusals(messages.map((message, index) => ({key: String(index), message})));
        changeSelection(() => items);
    };

    const pick = (picked: Iterable<File>) => addFiles([...picked], []);
    const drop = (data: DataTransfer) => {
        const {files: dropped, folders} = splitDropped(data);
        addFiles(dropped, folders);
    };

    const removeSelected = (key: string) => {
        if (selection.current.find(item => item.key === key)?.status === "uploading") return;
        setRefusals([]);
        changeSelection(items => items.filter(item => item.key !== key));
    };

    /** One file's request; it ends with the file gone, failed or cancelled. */
    const sendOne = async ({key, file}: SelectedFile) => {
        const {signal, release} = control(uploadControl(key));
        changeItem(key, {status: "uploading", percent: 0, error: null});
        const {adapter: current, multiple: several, canReplace: replaces, files: stored, t: translate} = latest.current;
        const options = {signal, onProgress: (percent: number) => changeItem(key, {percent})};
        // Newest first, as the API lists them
        const replaced = !several && replaces && current.replace ? stored[0] : undefined;
        try {
            await request(async () => {
                if (replaced) await current.replace?.(replaced.id, file, options);
                else await current.upload(file, options);
            });
            if (!alive.current) return;
            changeSelection(items => items.filter(item => item.key !== key));
            setAnnouncement(translate("attachments.uploadedFile", {name: displayName(file.name)}));
            refresh();
        } catch (error) {
            if (!alive.current) return;
            // The server may have saved it: the list reloads
            if (signal.aborted) {
                changeItem(key, {status: "cancelled", percent: 0});
                refresh();
                return;
            }
            const reason = getErrorMessage(error);
            changeItem(key, {status: "failed", percent: 0, error: reason});
            setAnnouncement(translate("attachments.failedFile", {name: displayName(file.name), reason}));
            if (showsStaleData(error)) refresh();
        } finally {
            release();
        }
    };

    /** One request at a time, whatever joins meanwhile. It reads the selection before each file and stops when unmounted. */
    const sendQueued = async () => {
        setIsUploading(true);
        try {
            while (alive.current) {
                const next = selection.current.find(item => item.status === "queued");
                if (!next) return;
                await sendOne(next);
            }
        } finally {
            if (alive.current) setIsUploading(false);
        }
    };

    // One run at a time: a second Upload (a double click) is ignored, and a Retry joins by being queued
    const onceRun = useSingleFlight();
    const upload = async () => {
        if (latest.current.uploadHeld) return;
        await onceRun(async () => {
            // So a repeated result is heard again. Not per file: the next file starts in the same tick as the last result, which would never render
            setAnnouncement("");
            setRefusals([]);
            changeSelection(items => items.map(item => (
                item.status === "waiting" || item.status === "cancelled" ? {...item, status: "queued"} : item
            )));
            await sendQueued();
        });
    };

    const cancel = (key: string) => {
        const status = selection.current.find(item => item.key === key)?.status;
        if (status === "uploading") controllers.current.get(uploadControl(key))?.abort();
        else if (status === "queued") changeItem(key, {status: "waiting"});
    };

    const retry = (key: string) => {
        if (selection.current.find(item => item.key === key)?.status !== "failed") return;
        setAnnouncement("");
        changeItem(key, {status: "queued", error: null});
        void onceRun(sendQueued);
    };

    // Actions on a stored file. A file already downloading isn't started again
    const downloading = useRef(new Set<string>());
    const download = async (file: Attachment) => {
        if (downloading.current.has(file.id)) return;
        downloading.current.add(file.id);
        const {signal, release} = control();
        try {
            await request(async () => {
                const blob = await latest.current.adapter.download(file.id, signal);
                if (!signal.aborted) downloadBlob(blob, file.originalFileName);
            });
        } catch (error) {
            reportFailure(error, signal);
        } finally {
            release();
            downloading.current.delete(file.id);
        }
    };

    const [isDownloadingAll, setIsDownloadingAll] = useState(false);
    const onceDownloadAll = useSingleFlight();
    const downloadAll = async () => {
        await onceDownloadAll(async () => {
            setIsDownloadingAll(true);
            try {
                for (const file of latest.current.files) {
                    if (!alive.current) return;
                    await download(file);
                }
            } finally {
                if (alive.current) setIsDownloadingAll(false);
            }
        });
    };

    const onceDelete = useSingleFlight();
    const deleteFile = async (file: Attachment) => {
        await onceDelete(async () => {
            const {adapter: current, t: translate} = latest.current;
            if (!current.delete) return;
            try {
                await request(async () => {
                    await current.delete?.(file.id);
                });
                if (!alive.current) return;
                toast.success(translate("attachments.deleted"));
                refresh();
            } catch (error) {
                reportFailure(error);
            }
        });
    };

    const [replacing, setReplacing] = useState<UseAttachments["replacing"]>(null);
    const replaceRunning = useRef(false);
    const replace = async (file: Attachment, newFile: File): Promise<Attachment | null> => {
        const {adapter: current, rules: currentRules, t: translate} = latest.current;
        if (replaceRunning.current || !currentRules || !current.replace) return null;
        const code = checkFile(newFile, currentRules);
        if (code) {
            toastError(translate("attachments.refused", {name: displayName(newFile.name), reason: translate(`errors.${code}`)}));
            return null;
        }
        replaceRunning.current = true;
        setReplacing({id: file.id, percent: 0});
        const {signal, release} = control(REPLACE_CONTROL);
        const options = {
            signal,
            onProgress: (percent: number) => {
                if (alive.current) setReplacing({id: file.id, percent});
            },
        };
        try {
            let replaced: Attachment | null = null;
            await request(async () => {
                replaced = await current.replace?.(file.id, newFile, options) ?? null;
            });
            if (!alive.current) return null;
            toast.success(translate("attachments.replaced"));
            refresh();
            return replaced;
        } catch (error) {
            reportFailure(error, signal);
            return null;
        } finally {
            release();
            replaceRunning.current = false;
            if (alive.current) setReplacing(null);
        }
    };
    const cancelReplace = () => controllers.current.get(REPLACE_CONTROL)?.abort();

    // Preview: one at a time
    const [preview, setPreview] = useState<AttachmentPreviewState | null>(null);
    const previewSession = useRef<PreviewSession | null>(null);

    const closePreview = () => {
        const session = previewSession.current;
        if (!session) return;
        previewSession.current = null;
        controllers.current.get(PREVIEW_CONTROL)?.abort();
        controllers.current.delete(PREVIEW_CONTROL);
        if (session.url) URL.revokeObjectURL(session.url);
        session.blob = null;
        setPreview(null);
    };

    /** Only for the session still open: a late answer about a closed one changes nothing. */
    const changePreview = (session: PreviewSession, fields: Partial<AttachmentPreviewState>) => {
        if (previewSession.current === session) setPreview(state => state && {...state, ...fields});
    };

    /** The bytes on the screen. The kind was decided before: a PDF's blob is always re-wrapped with the hard-coded type. */
    const showPreview = async (session: PreviewSession, kind: PreviewKind, blob: Blob) => {
        if (kind === "text") {
            const {text, cut} = await readTextPreview(blob);
            changePreview(session, {status: "ready", text, textCut: cut});
        } else if (previewSession.current === session) {
            session.url = URL.createObjectURL(kind === "pdf" ? asPdf(blob) : blob);
            changePreview(session, {status: "ready", url: session.url});
        }
    };

    const openPreview = (target: Attachment | SelectedFile) => {
        const stored = "file" in target ? null : target;
        const key = "file" in target ? `selected:${target.key}` : `stored:${target.id}`;
        // A double click: one request
        if (previewSession.current?.key === key) return;
        closePreview();

        const originalName = "file" in target ? target.file.name : target.originalFileName;
        const sizeBytes = "file" in target ? target.file.size : target.sizeBytes;
        const sourceKind = previewKind("file" in target ? {name: originalName} : {typeKey: target.typeKey});
        const kind = sourceKind === "pdf" && !navigator.pdfViewerEnabled ? "none" : sourceKind;
        const session: PreviewSession = {key, url: null, blob: "file" in target ? target.file : null};
        previewSession.current = session;

        setPreview({
            name: displayName(originalName),
            sizeBytes,
            kind,
            status: kind === "none" ? "ready" : "loading",
            url: null,
            text: null,
            textCut: false,
            download: () => {
                if (session.blob) downloadBlob(session.blob, originalName);
                else if (stored) void download(stored);
            },
            reportFailed: () => changePreview(session, {status: "failed"}),
        });
        if (kind === "none") return;

        if (!stored) {
            void showPreview(session, kind, session.blob!).catch(() => changePreview(session, {status: "failed"}));
            return;
        }
        const {signal, release} = control(PREVIEW_CONTROL);
        request(async () => {
            const blob = await latest.current.adapter.download(stored.id, signal);
            if (previewSession.current !== session) return;
            session.blob = blob;
            await showPreview(session, kind, blob);
        }).catch((error: unknown) => {
            // Before the close, which aborts: only a close by the user is a cancel
            reportFailure(error, signal);
            if (previewSession.current === session) closePreview();
        }).finally(() => {
            if (controllers.current.get(PREVIEW_CONTROL)?.signal === signal) release();
        });
    };

    useEffect(() => {
        alive.current = true;
        const running = controllers.current;
        // A file dropped outside the drop area must not navigate the tab to it
        const guard = (event: DragEvent) => event.preventDefault();
        window.addEventListener("dragover", guard);
        window.addEventListener("drop", guard);
        return () => {
            alive.current = false;
            window.removeEventListener("dragover", guard);
            window.removeEventListener("drop", guard);
            running.forEach(controller => controller.abort());
            running.clear();
            const session = previewSession.current;
            previewSession.current = null;
            if (session?.url) URL.revokeObjectURL(session.url);
        };
    }, []);

    return {
        rules,
        rulesFailed: rulesQuery.isError && !rulesQuery.data,
        retryRules: () => void rulesQuery.refetch(),
        accept: rules ? acceptOf(rules) : "",
        canPick: !!rules,
        multiple,
        hasReplace: !!adapter.replace,
        hasDelete: !!adapter.delete,

        files,
        isListLoading: listQuery.isPending,
        // A reload that failed too, with the old rows kept: Upload may be waiting for this answer, so its Retry has to show
        listFailed: listQuery.isError && !listQuery.isFetching,
        retryList: () => void listQuery.refetch(),

        selected,
        refusals: [
            ...refusals,
            ...excess.map(item => ({key: `excess:${item.key}`, message: t("attachments.tooMany", {name: displayName(item.file.name), count: maxFiles})})),
        ],
        clearRefusals: () => setRefusals([]),
        pick,
        drop,
        removeSelected,
        upload,
        canSend: !uploadHeld && selected.some(item => item.status === "waiting" || item.status === "cancelled"),
        cancel,
        retry,
        isUploading,
        announcement,

        download,
        downloadAll,
        isDownloadingAll,
        delete: deleteFile,
        replace,
        replacing,
        cancelReplace,

        preview,
        openPreview,
        closePreview,
    };
};
