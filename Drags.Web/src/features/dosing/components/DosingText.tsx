import {Typography} from "@mui/material";
import {dosingToText} from "../dosingText.ts";
import {useLanguage} from "../../../hooks/useLanguage.ts";
import type {Dosing} from "../types.ts";

/** The dosing as its Arabic prescription sentence (renders nothing when no dosing is set). */
export const DosingText = ({dosing}: { dosing: Dosing | null | undefined }) => {
    const {dir} = useLanguage();
    const text = dosingToText(dosing);
    if (!text) return null;

    // Arabic text, but aligned with the interface so it sits under the drug name
    return (
        <Typography
            variant="body2"
            dir="rtl"
            lang="ar"
            color="primary.dark"
            sx={{fontWeight: 500, textAlign: dir === "rtl" ? "right" : "left"}}
        >
            {text}
        </Typography>
    );
};
