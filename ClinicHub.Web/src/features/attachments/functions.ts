import type {AttachmentRules, PreviewKind} from "./types.ts";

// T0 contract: signatures fixed, bodies come in T1. Rules: docs/design/attachments.components.contract.md § 2.
const notBuilt = (...args: unknown[]): never => {
    throw new Error(`Attachments contract stub, built in T1 (called with ${args.length} arguments)`);
};

/** The first 1 MB of a text file is what a preview shows. */
export const TEXT_PREVIEW_BYTES = 1_048_576;

/** What identifies a picked file: name, size and last modified. */
export const fileKey = (file: File): string => notBuilt(file);

/** The last extension, lower case with its dot; null with none, a trailing dot, or only an extension (`.png`). */
export const extensionOf = (fileName: string): string | null => notBuilt(fileName);

/** The `accept` attribute: exactly the rules' extensions, comma separated. */
export const acceptOf = (rules: AttachmentRules): string => notBuilt(rules);

/**
 * The code a file is refused with on the client, or null. The server's order: empty, then size, then extension. A
 * size exactly at the limit passes; `IMG.JPG` matches `.jpg`.
 */
export const checkFile = (file: Pick<File, "name" | "size">, rules: AttachmentRules):
    "attachmentEmpty" | "attachmentTooLarge" | "attachmentTypeNotAllowed" | null => notBuilt(file, rules);

/**
 * The preview's kind, from a stored file's `typeKey` or a selected file's name, never from a response's or a `File`'s
 * type. image: png, jpeg, webp, gif, bmp, avif. pdf. text: txt, csv. Anything else (tiff, heic, Office, unknown): none.
 */
export const previewKind = (source: { typeKey: string } | { name: string }): PreviewKind => notBuilt(source);

/**
 * Latin digits in both languages, at most one decimal, in the UI language's units; 1 KB = 1024 B, 1 MB = 1024 KB:
 * `0 B`, `1023 B`, `1 KB`, `1.5 KB`, `20 MB`.
 */
export const formatFileSize = (bytes: number): string => notBuilt(bytes);

/** The type as a row shows it: the type key in capitals (`PNG`). */
export const typeLabel = (typeKey: string): string => notBuilt(typeKey);

/**
 * The text of `bytes`: a byte-order mark decides first (UTF-8, UTF-16 LE or BE; not shown), then valid UTF-8, else
 * Windows-1256. `cut` says the bytes were cut at the preview's limit, so an unfinished character at the end doesn't
 * make them invalid.
 */
export const decodeText = (bytes: Uint8Array, cut: boolean): string => notBuilt(bytes, cut);

/** Reads the first {@link TEXT_PREVIEW_BYTES} of `blob`, decoded; `cut` when there was more. */
export const readTextPreview = (blob: Blob): Promise<{ text: string; cut: boolean }> => notBuilt(blob);

/** `blob` with the hard-coded type `application/pdf`, whatever it arrived with. */
export const asPdf = (blob: Blob): Blob => notBuilt(blob);

/** The browser saves `blob` as `fileName`; its object URL is revoked shortly after the click. */
export const downloadBlob = (blob: Blob, fileName: string): void => notBuilt(blob, fileName);

/**
 * Splits a drop: its files, and the names of its folders, which are refused. Reads only `data.items`, those of `kind`
 * "file": an item whose `webkitGetAsEntry()` says `isDirectory` is a folder, by the entry's `name`; any other, also one
 * answering null (a `DataTransfer` a script builds), is a file, its `getAsFile()`.
 */
export const splitDropped = (data: DataTransfer): { files: File[]; folders: string[] } => notBuilt(data);
