import {Box, CircularProgress} from "@mui/material";
import {useTranslation} from "react-i18next";

/** Centered spinner for a page (or lazy chunk) that is loading. */
export const FullPageSpinner = () => {
    const {t} = useTranslation();
    return (
        <Box sx={{display: "flex", justifyContent: "center", alignItems: "center", minHeight: "40vh"}}>
            <CircularProgress aria-label={t("common.loading")}/>
        </Box>
    );
};
