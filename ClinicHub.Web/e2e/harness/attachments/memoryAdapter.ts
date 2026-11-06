import {AxiosError, AxiosHeaders, CanceledError} from "axios";
import type {Attachment, AttachmentRules, AttachmentsAdapter, UploadOptions} from "../../../src/features/attachments/types.ts";

/*
 * The harness page's adapter in memory (docs/design/attachments.components.contract.md § 3). A file named `fail-*` is
 * refused through a real AxiosError, `slow-*` reports its progress slowly, and `removeStored` makes a row stale.
 */

declare global {
    interface Window {
        __attachmentsHarness?: {
            /** The file leaves the store but stays on the screen: the next action on its row answers 404 */
            removeStored: (id: string) => void;
        };
    }
}

const OFFICE = "application/vnd.openxmlformats-officedocument";

/** Extension → the type it picks, as design § 5's table has them. */
const TYPES: Readonly<Record<string, { typeKey: string; contentType: string }>> = {
    ".png": {typeKey: "png", contentType: "image/png"},
    ".jpg": {typeKey: "jpeg", contentType: "image/jpeg"},
    ".jpeg": {typeKey: "jpeg", contentType: "image/jpeg"},
    ".webp": {typeKey: "webp", contentType: "image/webp"},
    ".gif": {typeKey: "gif", contentType: "image/gif"},
    ".bmp": {typeKey: "bmp", contentType: "image/bmp"},
    ".avif": {typeKey: "avif", contentType: "image/avif"},
    ".tif": {typeKey: "tiff", contentType: "image/tiff"},
    ".tiff": {typeKey: "tiff", contentType: "image/tiff"},
    ".heic": {typeKey: "heic", contentType: "image/heic"},
    ".heif": {typeKey: "heic", contentType: "image/heic"},
    ".pdf": {typeKey: "pdf", contentType: "application/pdf"},
    ".docx": {typeKey: "docx", contentType: `${OFFICE}.wordprocessingml.document`},
    ".xlsx": {typeKey: "xlsx", contentType: `${OFFICE}.spreadsheetml.sheet`},
    ".pptx": {typeKey: "pptx", contentType: `${OFFICE}.presentationml.presentation`},
    ".doc": {typeKey: "doc", contentType: "application/msword"},
    ".xls": {typeKey: "xls", contentType: "application/vnd.ms-excel"},
    ".ppt": {typeKey: "ppt", contentType: "application/vnd.ms-powerpoint"},
    ".txt": {typeKey: "txt", contentType: "text/plain"},
    ".csv": {typeKey: "csv", contentType: "text/csv"},
};

const DEFAULT_MAX_BYTES = 20 * 1_048_576;

/** A slow upload: this many percent, every `SLOW_STEP_MS`, so about 8 s, long enough to cancel. */
const SLOW_STEP_PERCENT = 5;
const SLOW_STEP_MS = 400;

const refusal = (status: number, code: string) => {
    const config = {headers: new AxiosHeaders()};
    return new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", config, null, {
        status, statusText: "", headers: {}, config,
        data: {status, code, errors: [{code, description: code}], traceId: "harness"},
    });
};

/** A real 64 × 64 PNG, one color. */
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsGtiRMsZ0Ai+hcEKLNXzWgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgtUGSEt26/VwAAAAABJRU5ErkJggg==";
const pngBytes = () => Uint8Array.from(atob(PNG_BASE64), char => char.charCodeAt(0));

/** A one-page PDF that the browser's viewer opens. */
const PDF_TEXT = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    + "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

/** A ZIP's signature only: downloaded, never opened. */
const XLSX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);

const SAMPLE_TEXT = "سطر عربي\nAn English line\n";

const LONG_ARABIC_NAME = "تقرير الفحص الطبي الشامل للمريض بعد العملية الجراحية للعين اليمنى مع نتائج التحاليل والأشعة والمتابعة الدورية خلال ستة أشهر.png";

type Stored = { attachment: Attachment; blob: Blob };

/** The file's type by its extension, or null: an unknown one is refused, as the server does. */
const typeOf = (name: string) => {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? TYPES[name.slice(dot).toLowerCase()] ?? null : null;
};

const stored = (id: string, name: string, createdAt: string, parts: BlobPart): Stored => {
    const {typeKey, contentType} = typeOf(name)!;
    const blob = new Blob([parts], {type: contentType});
    return {attachment: {id, originalFileName: name, typeKey, contentType, sizeBytes: blob.size, createdAt}, blob};
};

/** Newest first, as the API lists them. Their IDs are fixed: a spec names them. */
const samples = (): Stored[] => [
    stored("sample-png", "scan.png", "2026-11-05T10:00:00Z", pngBytes()),
    stored("sample-pdf", "report.pdf", "2026-11-04T10:00:00Z", PDF_TEXT),
    stored("sample-txt", "notes.txt", "2026-11-03T10:00:00Z", SAMPLE_TEXT),
    stored("sample-xlsx", "results.xlsx", "2026-11-02T10:00:00Z", XLSX_BYTES),
    stored("sample-arabic", LONG_ARABIC_NAME, "2026-11-01T10:00:00Z", pngBytes()),
];

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type MemoryAdapterOptions = {
    /** Starts with the five samples */
    seed: boolean;
    /** The rules' limit (default 20 MB) */
    maxFileSizeBytes?: number;
};

/** An adapter that keeps its files in this page. Installs `window.__attachmentsHarness`. */
export const memoryAdapter = ({seed, maxFileSizeBytes = DEFAULT_MAX_BYTES}: MemoryAdapterOptions): AttachmentsAdapter => {
    let files = seed ? samples() : [];
    let lastId = 0;

    window.__attachmentsHarness = {
        removeStored: id => {
            files = files.filter(file => file.attachment.id !== id);
        },
    };

    const find = (id: string) => {
        const file = files.find(entry => entry.attachment.id === id);
        if (!file) throw refusal(404, "notFound");
        return file;
    };

    /** The bytes on their way: reports progress until finished, or rejects with axios's cancel error on abort. */
    const send = async (file: File, {onProgress, signal}: UploadOptions): Promise<Stored> => {
        const stop = () => {
            if (signal?.aborted) throw new CanceledError();
        };
        stop();
        if (file.name.startsWith("fail-") || !typeOf(file.name)) throw refusal(400, "attachmentTypeNotAllowed");
        if (file.name.startsWith("slow-")) {
            const aborted = new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(new CanceledError()), {once: true}));
            for (let percent = 0; percent < 100; percent += SLOW_STEP_PERCENT) {
                onProgress?.(percent);
                await Promise.race([wait(SLOW_STEP_MS), aborted]);
            }
        }
        stop();
        onProgress?.(100);
        return stored(`file-${++lastId}`, file.name, new Date().toISOString(), file);
    };

    return {
        scope: ["attachments-harness"],
        rules: async (): Promise<AttachmentRules> => ({maxFileSizeBytes, extensions: Object.keys(TYPES)}),
        list: async () => files.map(file => file.attachment),
        upload: async (file, options) => {
            const saved = await send(file, options);
            files = [saved, ...files];
            return saved.attachment;
        },
        replace: async (id, file, options) => {
            find(id);
            const saved = await send(file, options);
            files = [saved, ...files.filter(entry => entry.attachment.id !== id)];
            return saved.attachment;
        },
        delete: async id => {
            find(id);
            files = files.filter(entry => entry.attachment.id !== id);
        },
        download: async (id, signal) => {
            if (signal?.aborted) throw new CanceledError();
            return find(id).blob;
        },
    };
};
