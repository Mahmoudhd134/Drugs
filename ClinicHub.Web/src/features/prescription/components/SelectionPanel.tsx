import {Button, Chip, Divider, Paper, Stack, Tooltip, Typography} from "@mui/material";
import EditNoteIcon from "@mui/icons-material/EditNote";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import {useTranslation} from "react-i18next";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {PrescriptionLineList} from "./PrescriptionLineList.tsx";
import type {PrescriptionLine} from "../types.ts";

type Props = {
    lines: PrescriptionLine[];
    onReorder: (lines: PrescriptionLine[]) => void;
    onEditLine: (line: PrescriptionLine) => void;
    onRemove: (line: PrescriptionLine) => void;
    canAddOtherEye: (line: PrescriptionLine) => boolean;
    onAddOtherEye: (line: PrescriptionLine) => void;
    onClear: () => void;
    onEdit: () => void;
    onQuickCopy: () => void;
};

export const SelectionPanel = (props: Props) => {
    const {lines, onReorder, onEditLine, onRemove, canAddOtherEye, onAddOtherEye, onClear, onEdit, onQuickCopy} = props;
    const {t} = useTranslation();
    const isEmpty = lines.length === 0;

    return (
        <Paper variant="outlined" sx={{p: 2.5}}>
            <Stack direction="row" sx={{alignItems: "center", gap: 1, mb: 2}}>
                <Typography variant="subtitle1" sx={{fontWeight: 700}}>{t("prescription.selected")}</Typography>
                <Chip size="small" color={isEmpty ? "default" : "primary"} label={lines.length}/>
                <Stack sx={{flex: 1}}/>
                <Tooltip title={isEmpty ? "" : t("prescription.clearAllInfo")}>
                    <span>
                        <Button size="small" color="inherit" startIcon={<ClearAllIcon/>} onClick={onClear} disabled={isEmpty}>
                            {t("prescription.clearAll")}
                        </Button>
                    </span>
                </Tooltip>
            </Stack>

            {isEmpty ? (
                <EmptyState
                    icon={<ReceiptLongIcon/>}
                    title={t("prescription.emptyTitle")}
                    description={t("prescription.emptyDescription")}
                />
            ) : (
                <PrescriptionLineList
                    lines={lines}
                    onReorder={onReorder}
                    onEdit={onEditLine}
                    onRemove={onRemove}
                    canAddOtherEye={canAddOtherEye}
                    onAddOtherEye={onAddOtherEye}
                />
            )}

            <Divider sx={{my: 2}}/>
            <Stack direction={{xs: "column", sm: "row"}} sx={{gap: 1, justifyContent: "flex-end"}}>
                <Tooltip title={isEmpty ? "" : t("prescription.quickCopyInfo")}>
                    <span>
                        <Button variant="outlined" fullWidth startIcon={<ContentCopyIcon/>} onClick={onQuickCopy} disabled={isEmpty}>
                            {t("prescription.quickCopy")}
                        </Button>
                    </span>
                </Tooltip>
                <Tooltip title={isEmpty ? "" : t("prescription.editAndCopyInfo")}>
                    <span>
                        <Button variant="contained" fullWidth startIcon={<EditNoteIcon/>} onClick={onEdit} disabled={isEmpty}>
                            {t("prescription.editAndCopy")}
                        </Button>
                    </span>
                </Tooltip>
            </Stack>
        </Paper>
    );
};
