import type {Attachment, AttachmentsAdapter} from "../attachments/types.ts";

export type PaperImageUrl = {
    /** The object URL of the file's bytes; null while loading, after a failure, or with no file */
    url: string | null;
    /** The read failed, or the `img` reported it can't decode them (`reportBroken`): `printTemplates.paper.loadFailed` shows */
    failed: boolean;
    /** Reads the bytes again, clearing `failed` */
    retry: () => void;
    /** The `img`'s `error` event: revokes the URL, `failed` becomes true */
    reportBroken: () => void;
};

/**
 * **Stub (T1: frontend).** The picture's bytes as an object URL (step 4 design § 3, § 5): part 2 gives one only to its preview dialog. `adapter.download(file.id, signal)` for
 * the given file, the newest row (`files[0]`): once per opening of the designer and after an upload, a plain call, never the query cache. A new id fetches again. On a new id, on
 * no file, and on unmount it aborts the read and revokes the URL. `file` null: no request.
 */
export const usePaperImageUrl: (adapter: AttachmentsAdapter, file: Attachment | null) => PaperImageUrl = () =>
    ({url: null, failed: false, retry: () => undefined, reportBroken: () => undefined});
