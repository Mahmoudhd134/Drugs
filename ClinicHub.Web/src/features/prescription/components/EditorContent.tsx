import {useEffect, useRef, useState} from "react";
import {Box, Button, DialogActions, DialogContent, DialogTitle, Typography} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {copyRichText} from "../../../utils/clipboard.ts";
import {htmlForPaste, htmlToPlainText, linesToHtml} from "../prescriptionText.ts";
import type {PrescriptionLine} from "../types.ts";

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

const EditorContent = ({lines, onClose}: { lines: PrescriptionLine[]; onClose: () => void }) => {
    const {t} = useTranslation();
    const [html, setHtml] = useState(() => linesToHtml(lines));
    const quillRef = useRef<ReactQuill>(null);

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
                    <ReactQuill ref={quillRef} theme="snow" value={html} onChange={setHtml} modules={QUILL_MODULES}/>
                </Box>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onClose}>{t("common.close")}</Button>
                <Button variant="contained" startIcon={<ContentCopyIcon/>} onClick={() => void handleCopy()}>
                    {t("common.copy")}
                </Button>
            </DialogActions>
        </>
    );
};

export default EditorContent;
