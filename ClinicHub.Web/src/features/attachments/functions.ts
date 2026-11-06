import i18n from "../../i18n";
import type {AttachmentRules, PreviewKind} from "./types.ts";

/** The first 1 MB of a text file is what a preview shows. */
export const TEXT_PREVIEW_BYTES = 1_048_576;

/** How long a download's object URL lives after the click: the browser has started reading it by then. */
const DOWNLOAD_URL_LIFETIME_MS = 1_000;

const BIDI_CONTROLS = /[‪-‮⁦-⁩‎‏؜]/g;

/**
 * A file's name as it's shown, also in messages: with no bidi control characters, because an override can show a false
 * extension (`y<U+202E>exe.txt` reads `ytxt.exe`). What's sent, and a download's name, stay the original.
 */
export const displayName = (fileName: string): string => fileName.replace(BIDI_CONTROLS, "");

/** What identifies a picked file: name, size and last modified. */
export const fileKey = (file: File): string => `${file.name}/${file.size}/${file.lastModified}`;

/** The last extension, lower case with its dot; null with none, a trailing dot, or only an extension (`.png`). */
export const extensionOf = (fileName: string): string | null => {
    const dot = fileName.lastIndexOf(".");
    return dot > 0 && dot < fileName.length - 1 ? fileName.slice(dot).toLowerCase() : null;
};

/** The `accept` attribute: exactly the rules' extensions, comma separated. */
export const acceptOf = (rules: AttachmentRules): string => rules.extensions.join(",");

/**
 * The code a file is refused with on the client, or null. The server's order: empty, then size, then extension. A
 * size exactly at the limit passes; `IMG.JPG` matches `.jpg`.
 */
export const checkFile = (file: Pick<File, "name" | "size">, rules: AttachmentRules):
    "attachmentEmpty" | "attachmentTooLarge" | "attachmentTypeNotAllowed" | null => {
    if (file.size === 0) return "attachmentEmpty";
    if (file.size > rules.maxFileSizeBytes) return "attachmentTooLarge";
    const extension = extensionOf(file.name);
    return extension !== null && rules.extensions.includes(extension) ? null : "attachmentTypeNotAllowed";
};

const IMAGE_TYPES: ReadonlySet<string> = new Set(["png", "jpeg", "webp", "gif", "bmp", "avif"]);
const TEXT_TYPES: ReadonlySet<string> = new Set(["txt", "csv"]);

const kindOfType = (typeKey: string): PreviewKind => {
    if (IMAGE_TYPES.has(typeKey)) return "image";
    if (typeKey === "pdf") return "pdf";
    return TEXT_TYPES.has(typeKey) ? "text" : "none";
};

/**
 * The preview's kind, from a stored file's `typeKey` or a selected file's name, never from a response's or a `File`'s
 * type. image: png, jpeg, webp, gif, bmp, avif. pdf. text: txt, csv. Anything else (tiff, heic, Office, unknown): none.
 */
export const previewKind = (source: { typeKey: string } | { name: string }): PreviewKind => {
    if ("typeKey" in source) return kindOfType(source.typeKey);
    const extension = extensionOf(source.name)?.slice(1);
    if (!extension) return "none";
    return kindOfType(extension === "jpg" ? "jpeg" : extension);
};

const SIZE_UNITS = ["sizeB", "sizeKb", "sizeMb", "sizeGb"] as const;
const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

/**
 * Latin digits in both languages, at most one decimal, in the UI language's units; 1 KB = 1024 B, 1 MB = 1024 KB:
 * `0 B`, `1023 B`, `1 KB`, `1.5 KB`, `20 MB`.
 */
export const formatFileSize = (bytes: number): string => {
    let value = bytes;
    let unit = 0;
    // By the rounded value: 1,048,575 bytes are `1 MB`, not `1024 KB`
    while (roundToOneDecimal(value) >= 1024 && unit < SIZE_UNITS.length - 1) {
        value /= 1024;
        unit++;
    }
    return i18n.t(`attachments.${SIZE_UNITS[unit]}`, {value: String(roundToOneDecimal(value))});
};

/** The type as a row shows it: the type key in capitals (`PNG`). */
export const typeLabel = (typeKey: string): string => typeKey.toUpperCase();

const byteOrderMark = (bytes: Uint8Array) => {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
    return null;
};

/**
 * The text of `bytes`: a byte-order mark decides first (UTF-8, UTF-16 LE or BE; not shown), then valid UTF-8, else
 * Windows-1256. `cut` says the bytes were cut at the preview's limit, so an unfinished character at the end doesn't
 * make them invalid.
 */
export const decodeText = (bytes: Uint8Array, cut: boolean): string => {
    // `stream` holds back an unfinished last character instead of treating it as an error
    const mark = byteOrderMark(bytes);
    if (mark) return new TextDecoder(mark).decode(bytes, {stream: cut});
    try {
        return new TextDecoder("utf-8", {fatal: true}).decode(bytes, {stream: cut});
    } catch {
        return new TextDecoder("windows-1256").decode(bytes);
    }
};

/** Reads the first {@link TEXT_PREVIEW_BYTES} of `blob`, decoded; `cut` when there was more. */
export const readTextPreview = async (blob: Blob): Promise<{ text: string; cut: boolean }> => {
    const cut = blob.size > TEXT_PREVIEW_BYTES;
    const bytes = new Uint8Array(await blob.slice(0, TEXT_PREVIEW_BYTES).arrayBuffer());
    return {text: decodeText(bytes, cut), cut};
};

/** `blob` with the hard-coded type `application/pdf`, whatever it arrived with. */
export const asPdf = (blob: Blob): Blob => new Blob([blob], {type: "application/pdf"});

/** The browser saves `blob` as `fileName`; its object URL is revoked shortly after the click. */
export const downloadBlob = (blob: Blob, fileName: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
};

/**
 * Splits a drop: its files, and the names of its folders, which are refused. Reads only `data.items`, those of `kind`
 * "file": an item whose `webkitGetAsEntry()` says `isDirectory` is a folder, by the entry's `name`; any other, also one
 * answering null (a `DataTransfer` a script builds), is a file, its `getAsFile()`.
 */
export const splitDropped = (data: DataTransfer): { files: File[]; folders: string[] } => {
    const files: File[] = [];
    const folders: string[] = [];
    for (const item of Array.from(data.items)) {
        if (item.kind !== "file") continue;
        const entry = item.webkitGetAsEntry();
        if (entry?.isDirectory) {
            folders.push(entry.name);
        } else {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    return {files, folders};
};
