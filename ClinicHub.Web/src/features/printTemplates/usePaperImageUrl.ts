import {type RefObject, useEffect, useRef, useState} from "react";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import type {Attachment, AttachmentsAdapter} from "../attachments/types.ts";
import {useLatest} from "./useLatest.ts";

export type PaperImageUrl = {
    /** The object URL of the file's bytes; null while loading, after a failure, or with no file */
    url: string | null;
    /** The read failed, or the `img` reported it can't decode them (`reportBroken`): `printTemplates.paper.loadFailed` shows, and was toasted once */
    failed: boolean;
    /** Reads the bytes again, clearing `failed` */
    retry: () => void;
    /** The `img`'s `error` event: revokes the URL, `failed` becomes true */
    reportBroken: () => void;
};

/** What a read of this file gave; `read` names the file and the attempt, so another read's answer is never shown. */
type Outcome = { read: string; url: string | null; failed: boolean };

const revokeLive = (live: RefObject<string | null>) => {
    if (live.current) URL.revokeObjectURL(live.current);
    live.current = null;
};

/**
 * The picture's bytes as an object URL (step 4 design § 3, § 5): part 2 gives one only to its preview dialog. `adapter.download(file.id, signal)` for
 * the given file, the newest row (`files[0]`): once per opening of the designer and after an upload, a plain call, never the query cache. A new id fetches again. On a new id, on
 * no file, and on unmount it aborts the read and revokes the URL. `file` null: no request. Each failure also toasts once, since the section's message can sit below the
 * window while the blank sheet shows (step 4 contract § 10.26, TPL-727); an aborted read is no failure.
 */
export const usePaperImageUrl = (adapter: AttachmentsAdapter, file: Attachment | null): PaperImageUrl => {
    const id = file?.id ?? null;
    const [attempt, setAttempt] = useState(0);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    /** The live object URL, to revoke */
    const live = useRef<string | null>(null);
    const {t} = useTranslation();
    /** Called where a failure happens, never from a render or an effect on `failed`: a language change isn't a failure */
    const announceFailure = useLatest(() => toast.error(t("printTemplates.paper.loadFailed")));

    const read = `${id}#${attempt}`;

    useEffect(() => {
        if (id === null) return;
        const controller = new AbortController();
        void (async () => {
            try {
                const blob = await adapter.download(id, controller.signal);
                if (controller.signal.aborted) return;
                live.current = URL.createObjectURL(blob);
                setOutcome({read, url: live.current, failed: false});
            } catch {
                if (controller.signal.aborted) return;
                setOutcome({read, url: null, failed: true});
                announceFailure.current();
            }
        })();
        return () => {
            controller.abort();
            revokeLive(live);
            setOutcome(null);
        };
    }, [adapter, id, read, announceFailure]);

    // Compared with this read, so a revoked URL is never rendered, not even in the render before the effect's clean-up runs
    const current = outcome?.read === read ? outcome : null;
    return {
        url: current?.url ?? null,
        failed: current?.failed ?? false,
        retry: () => setAttempt(count => count + 1),
        reportBroken: () => {
            revokeLive(live);
            setOutcome({read, url: null, failed: true});
            announceFailure.current();
        },
    };
};
