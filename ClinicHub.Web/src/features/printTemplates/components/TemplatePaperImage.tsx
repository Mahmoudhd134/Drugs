import type {ReactNode} from "react";
import type {AttachmentsAdapter} from "../../attachments/types.ts";
import type {SheetPaper} from "./TemplateSheet.tsx";

/** What the picture gives the workspace: the sheet's `paper` prop and the settings' section. */
export type PaperImageView = {
    /** The newest row's picture while shown and loaded; else null: the blank sheet (A14) */
    sheetPaper: SheetPaper | null;
    /** The settings' "Paper image" section, with part 2's preview dialog */
    section: ReactNode;
};

/**
 * **Stub (T1: frontend).** Owns one `useAttachments({adapter, multiple: false, canReplace: true})`, `usePaperImageUrl(adapter, files[0] ?? null)` and the screen-only show and
 * opacity (`PAPER_OPACITY_DEFAULT`, shown): the hook sits here, not in `AttachmentManager`, because the sheet needs the stored file (step 4 design § 5). `TemplateWorkspace`
 * mounts it only with a paper adapter and only at >= 900 px, so narrowing unmounts it (an upload aborts) and widening is a new opening (TPL-677).
 */
export const PaperImageScope = ({children}: { adapter: AttachmentsAdapter; children: (view: PaperImageView) => ReactNode }) =>
    children({sheetPaper: null, section: null});

/**
 * **Stub (T1: frontend).** The "Paper image" section's markup (step 4 contract § 4.5): `AttachmentPicker` (`canUpload`, `canReplace`), the rules line, `AttachmentList` (`canDelete`,
 * `renderEmpty` answering null, no `canReplace`), the switch and the slider with a picture, the load failure, and `AttachmentPreview`, once.
 */
export const TemplatePaperImage = () => null;
