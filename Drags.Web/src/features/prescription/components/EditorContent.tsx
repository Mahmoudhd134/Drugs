import {useState} from "react";
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

const EditorContent = ({lines, onClose}: { lines: PrescriptionLine[]; onClose: () => void }) => {
    const {t} = useTranslation();
    const [html, setHtml] = useState(() => linesToHtml(lines));

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
                    <ReactQuill theme="snow" value={html} onChange={setHtml} modules={QUILL_MODULES}/>
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
