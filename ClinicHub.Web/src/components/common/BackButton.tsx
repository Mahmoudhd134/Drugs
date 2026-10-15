import {IconButton, Tooltip} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {useTranslation} from "react-i18next";
import {useLanguage} from "../../hooks/useLanguage.ts";

/** The "Back" icon button of a page header (`PageHeader` leading); the arrow points the reading way back. */
export const BackButton = ({onClick}: { onClick: () => void }) => {
    const {t} = useTranslation();
    const {dir} = useLanguage();
    return (
        <Tooltip title={t("common.back")}>
            <IconButton onClick={onClick} aria-label={t("common.back")}>
                <ArrowBackIcon sx={{transform: dir === "rtl" ? "scaleX(-1)" : undefined}}/>
            </IconButton>
        </Tooltip>
    );
};
