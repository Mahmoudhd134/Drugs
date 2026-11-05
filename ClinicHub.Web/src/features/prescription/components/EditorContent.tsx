import {useEffect, useRef, useState} from "react";
import {Box, Button, DialogActions, DialogContent, DialogTitle, Tooltip, Typography} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import PrintIcon from "@mui/icons-material/Print";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {copyRichText} from "../../../utils/clipboard.ts";
import {hasPrintableText} from "../../printTemplates/printHtml.ts";
import {htmlForPaste, htmlToPlainText, linesToHtml} from "../prescriptionText.ts";
import type {PrescriptionLine} from "../types.ts";
import {QuillEditor, type QuillEditorHandle} from "./QuillEditor.tsx";

const QUILL_MODULES = {
    toolbar: [
        ["bold", "italic", "underline"],
        [{list: "ordered"}, {list: "bullet"}],
        [{direction: "rtl"}, {align: []}],
        ["clean"],
    ],
};

/** Quill's toolbar controls (built by Quill, without names) and the key of each one's accessible name. */
const TOOLBAR_NAMES: [selector: string, key: string][] = [
    ["button.ql-bold", "bold"],
    ["button.ql-italic", "italic"],
    ["button.ql-underline", "underline"],
    ["button.ql-list[value=ordered]", "numberedList"],
    ["button.ql-list[value=bullet]", "bulletedList"],
    ["button.ql-direction", "direction"],
    [".ql-align .ql-picker-label", "align"],
    [".ql-align .ql-picker-item:not([data-value])", "alignStart"],
    [".ql-align .ql-picker-item[data-value=center]", "alignCenter"],
    [".ql-align .ql-picker-item[data-value=right]", "alignRight"],
    [".ql-align .ql-picker-item[data-value=justify]", "alignJustify"],
    ["button.ql-clean", "clean"],
];

type Props = {
    lines: PrescriptionLine[];
    onClose: () => void;
    /** Print with the edited HTML; absent when the clinic has no template. The editor stays open with its edits */
    onPrint?: (html: string) => void;
};

const EditorContent = ({lines, onClose, onPrint}: Props) => {
    const {t} = useTranslation();
    const [html, setHtml] = useState(() => linesToHtml(lines));
    const quillRef = useRef<QuillEditorHandle>(null);

    // Names the toolbar's icon buttons and alignment picker for screen readers (in the UI language)
    useEffect(() => {
        const toolbar = (quillRef.current?.getEditor().getModule("toolbar") as { container?: HTMLElement } | undefined)?.container;
        for (const [selector, key] of TOOLBAR_NAMES) {
            toolbar?.querySelectorAll(selector).forEach(control => control.setAttribute("aria-label", t(`prescription.toolbar.${key}`)));
        }
    }, [t]);

    const handleCopy = async () => {
        if (await copyRichText(htmlForPaste(html), htmlToPlainText(html))) toast.success(t("common.copied"));
        else toast.error(t("errors.copyFailed"));
    };

    const printable = hasPrintableText(html);

    return (
        <>
            <DialogTitle>{t("prescription.editorTitle")}</DialogTitle>
            <DialogContent sx={{pb: 1}}>
                <Typography variant="body2" color="text.secondary" sx={{mb: 1.5}}>
                    {t("prescription.editorHint")}
                </Typography>
                <Box
                    sx={{
                        "& .ql-toolbar": {borderRadius: "10px 10px 0 0", borderColor: "divider"},
                        "& .ql-container": {
                            borderRadius: "0 0 10px 10px",
                            borderColor: "divider",
                            fontFamily: "inherit",
                            fontSize: 15,
                            height: {xs: "calc(100vh - 260px)", sm: 380},
                        },
                    }}
                >
                    <QuillEditor ref={quillRef} theme="snow" value={html} onChange={setHtml} modules={QUILL_MODULES}/>
                </Box>
            </DialogContent>
            {/* The gap instead of MUI's spacing, which leaves a wrapped button out of line on a phone */}
            <DialogActions disableSpacing sx={{px: 3, pb: 2, gap: 1, flexWrap: "wrap"}}>
                <Button onClick={onClose}>{t("common.close")}</Button>
                {onPrint && (
                    <Tooltip title={printable ? t("printTemplates.print.hint") : ""}>
                        <span>
                            <Button variant="outlined" startIcon={<PrintIcon/>} disabled={!printable} onClick={() => onPrint(html)}>
                                {t("prescription.print")}
                            </Button>
                        </span>
                    </Tooltip>
                )}
                <Button variant="contained" startIcon={<ContentCopyIcon/>} onClick={() => void handleCopy()}>
                    {t("common.copy")}
                </Button>
            </DialogActions>
        </>
    );
};

export default EditorContent;
