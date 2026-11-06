import type {UseAttachments, UseAttachmentsOptions} from "./types.ts";

/** The headless hook (design § 12): the list, the selection, progress, errors and every action. No markup. */
export const useAttachments = (options: UseAttachmentsOptions): UseAttachments => {
    throw new Error(`Attachments contract stub, built in T1 (scope ${String(options.adapter.scope)})`);
};
