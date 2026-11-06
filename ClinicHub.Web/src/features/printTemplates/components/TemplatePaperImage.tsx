import {type ReactNode, useId, useState} from "react";
import {Alert, Box, Button, FormControlLabel, Slider, Switch, Typography} from "@mui/material";
import {useTranslation} from "react-i18next";
import {AttachmentList} from "../../attachments/components/AttachmentList.tsx";
import {AttachmentPicker} from "../../attachments/components/AttachmentPicker.tsx";
import {AttachmentPreview} from "../../attachments/components/AttachmentPreview.tsx";
import {formatFileSize} from "../../attachments/functions.ts";
import type {AttachmentRules, AttachmentsAdapter, UseAttachments} from "../../attachments/types.ts";
import {useAttachments} from "../../attachments/useAttachments.ts";
import {PAPER_OPACITY_DEFAULT, PAPER_OPACITY_MAX, PAPER_OPACITY_MIN, PAPER_OPACITY_STEP} from "../constants.ts";
import {usePaperImageUrl} from "../usePaperImageUrl.ts";
import type {SheetPaper} from "./TemplateSheet.tsx";

/** What the picture gives the workspace: the sheet's `paper` prop and the settings' section. */
export type PaperImageView = {
    /** The newest row's picture while shown and loaded; else null: the blank sheet (A14) */
    sheetPaper: SheetPaper | null;
    /** The settings' "Paper image" section, with part 2's preview dialog */
    section: ReactNode;
};

/** The rules' types for people: in order, upper case with no dot, `.jpg` as `JPEG` and repeats gone: `PNG / JPEG` (step 4 contract § 4.1). */
const typeNames = ({extensions}: AttachmentRules) => {
    const names = extensions.map(extension => extension.replace(".", "").toUpperCase().replace(/^JPG$/, "JPEG"));
    return [...new Set(names)].join(" / ");
};

type SectionProps = {
    files: UseAttachments;
    /** The picture's bytes won't load or decode (A14) */
    failed: boolean;
    onRetry: () => void;
    shown: boolean;
    onShown: (shown: boolean) => void;
    opacity: number;
    onOpacity: (percent: number) => void;
};

/**
 * The "Paper image" section's markup (step 4 contract § 4.5): `AttachmentPicker` (`canUpload`, `canReplace`), the rules line, the load failure, `AttachmentList` (`canDelete`,
 * `renderEmpty` answering null, no `canReplace`), the switch and the slider with a picture, and `AttachmentPreview`, once.
 */
export const TemplatePaperImage = ({files, failed, onRetry, shown, onShown, opacity, onOpacity}: SectionProps) => {
    const {t} = useTranslation();
    const titleId = useId();
    const {rules} = files;

    return (
        <Box component="section" aria-labelledby={titleId} sx={{mt: 2.5, display: "flex", flexDirection: "column", gap: 1.5}}>
            <Typography id={titleId} component="h3" variant="subtitle2" sx={{fontWeight: 700}}>{t("printTemplates.paper.title")}</Typography>
            <AttachmentPicker files={files} canUpload canReplace/>
            {rules && (
                <Typography data-testid="template-paper-rules" variant="caption" color="text.secondary" component="div">
                    {t("printTemplates.paper.rules", {types: typeNames(rules), size: formatFileSize(rules.maxFileSizeBytes)})}
                </Typography>
            )}
            {failed && (
                <Alert
                    severity="error"
                    data-testid="template-paper-load-failed"
                    action={<Button color="inherit" size="small" onClick={onRetry}>{t("common.retry")}</Button>}
                >
                    {t("printTemplates.paper.loadFailed")}
                </Alert>
            )}
            <AttachmentList files={files} canDelete renderEmpty={() => null}/>
            {files.files.length > 0 && (
                <>
                    <FormControlLabel
                        label={t("printTemplates.paper.show")}
                        control={<Switch checked={shown} onChange={(event) => onShown(event.target.checked)}/>}
                    />
                    <Box>
                        <Typography variant="caption" color="text.secondary" component="div">{t("printTemplates.paper.opacity")}</Typography>
                        <Slider
                            aria-label={t("printTemplates.paper.opacity")}
                            min={PAPER_OPACITY_MIN}
                            max={PAPER_OPACITY_MAX}
                            step={PAPER_OPACITY_STEP}
                            value={opacity}
                            onChange={(_event, value) => onOpacity(value)}
                            getAriaValueText={(value) => `${value}%`}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(value) => `${value}%`}
                        />
                    </Box>
                </>
            )}
            <AttachmentPreview files={files}/>
        </Box>
    );
};

/**
 * Owns one `useAttachments({adapter, multiple: false, canReplace: true})`, `usePaperImageUrl(adapter, files[0] ?? null)` and the screen-only show and
 * opacity (`PAPER_OPACITY_DEFAULT`, shown): the hook sits here, not in `AttachmentManager`, because the sheet needs the stored file (step 4 design § 5). `TemplateWorkspace`
 * mounts it only with a paper adapter and only at >= 900 px on screen, so narrowing unmounts it (an upload aborts) and widening is a new opening (TPL-677); a print isn't one (TPL-726).
 */
export const PaperImageScope = ({adapter, children}: { adapter: AttachmentsAdapter; children: (view: PaperImageView) => ReactNode }) => {
    const files = useAttachments({adapter, multiple: false, canReplace: true});
    const image = usePaperImageUrl(adapter, files.files[0] ?? null);
    const [shown, setShown] = useState(true);
    const [opacity, setOpacity] = useState(PAPER_OPACITY_DEFAULT);

    return children({
        sheetPaper: image.url && shown ? {url: image.url, opacityPercent: opacity, onError: image.reportBroken} : null,
        section: (
            <TemplatePaperImage
                files={files}
                failed={image.failed}
                onRetry={() => {
                    // Also the list, so a picture removed elsewhere leaves instead of failing again (contract § 10.10)
                    image.retry();
                    files.retryList();
                }}
                shown={shown}
                onShown={setShown}
                opacity={opacity}
                onOpacity={setOpacity}
            />
        ),
    });
};
