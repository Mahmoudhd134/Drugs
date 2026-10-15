import {Chip} from "@mui/material";
import {useTranslation} from "react-i18next";
import type {ClinicStatus} from "../types.ts";
import {disabledChipSx} from "./disabledTone.ts";

export const ClinicStatusChip = ({status}: { status: ClinicStatus }) => {
    const {t} = useTranslation();
    return status === "active" ? (
        <Chip size="small" variant="outlined" color="success" label={t("admin.status.active")}/>
    ) : (
        <Chip size="small" variant="outlined" label={t("admin.status.suspended")} sx={disabledChipSx}/>
    );
};
