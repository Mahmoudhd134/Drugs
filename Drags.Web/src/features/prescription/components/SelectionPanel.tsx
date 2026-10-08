import {Button, Chip, Divider, Paper, Stack, Typography} from "@mui/material";
import EditNoteIcon from "@mui/icons-material/EditNote";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import {useTranslation} from "react-i18next";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {SelectedDrugsList} from "../../drugs/components/SelectedDrugsList.tsx";
import type {Drug} from "../../drugs/types.ts";

type Props = {
    drugs: Drug[];
    onReorder: (drugs: Drug[]) => void;
    onRemove: (drug: Drug) => void;
    onClear: () => void;
    onEdit: () => void;
    onQuickCopy: () => void;
};

export const SelectionPanel = ({drugs, onReorder, onRemove, onClear, onEdit, onQuickCopy}: Props) => {
    const {t} = useTranslation();
    const isEmpty = drugs.length === 0;

    return (
        <Paper variant="outlined" sx={{p: 2.5}}>
            <Stack direction="row" sx={{alignItems: "center", gap: 1, mb: 2}}>
                <Typography variant="subtitle1" sx={{fontWeight: 700}}>{t("prescription.selected")}</Typography>
                <Chip size="small" color={isEmpty ? "default" : "primary"} label={drugs.length}/>
                <Stack sx={{flex: 1}}/>
                <Button size="small" color="inherit" startIcon={<ClearAllIcon/>} onClick={onClear} disabled={isEmpty}>
                    {t("prescription.clearAll")}
                </Button>
            </Stack>

            {isEmpty ? (
                <EmptyState
                    icon={<ReceiptLongIcon/>}
                    title={t("prescription.emptyTitle")}
                    description={t("prescription.emptyDescription")}
                />
            ) : (
                <SelectedDrugsList drugs={drugs} onReorder={onReorder} onRemove={onRemove}/>
            )}

            <Divider sx={{my: 2}}/>
            <Stack direction={{xs: "column", sm: "row"}} sx={{gap: 1, justifyContent: "flex-end"}}>
                <Button variant="outlined" startIcon={<ContentCopyIcon/>} onClick={onQuickCopy} disabled={isEmpty}>
                    {t("prescription.quickCopy")}
                </Button>
                <Button variant="contained" startIcon={<EditNoteIcon/>} onClick={onEdit} disabled={isEmpty}>
                    {t("prescription.editAndCopy")}
                </Button>
            </Stack>
        </Paper>
    );
};
