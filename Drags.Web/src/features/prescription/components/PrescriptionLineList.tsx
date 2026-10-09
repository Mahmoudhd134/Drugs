import {Avatar, IconButton, Stack, Tooltip, Typography} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/EditOutlined";
import AddToEyeIcon from "@mui/icons-material/AddCircleOutline";
import {useTranslation} from "react-i18next";
import {SortableList} from "../../../components/common/SortableList.tsx";
import {DosingText} from "../../dosing/components/DosingText.tsx";
import {isDosingEmpty} from "../../dosing/types.ts";
import type {PrescriptionLine} from "../types.ts";

type Props = {
    lines: PrescriptionLine[];
    onReorder: (lines: PrescriptionLine[]) => void;
    onEdit: (line: PrescriptionLine) => void;
    onRemove: (line: PrescriptionLine) => void;
    canAddOtherEye: (line: PrescriptionLine) => boolean;
    onAddOtherEye: (line: PrescriptionLine) => void;
};

/** Numbered, drag-to-reorder prescription lines: drug, dosing sentence, note. */
export const PrescriptionLineList = ({lines, onReorder, onEdit, onRemove, canAddOtherEye, onAddOtherEye}: Props) => {
    const {t} = useTranslation();

    return (
        <SortableList
            items={lines}
            getId={l => l.key}
            onReorder={onReorder}
            renderItem={(line, index) => (
                <Stack direction="row" sx={{gap: 1.5, alignItems: "flex-start"}}>
                    <Avatar sx={{width: 26, height: 26, fontSize: 13, bgcolor: "primary.main", mt: 0.25}}>
                        {index + 1}
                    </Avatar>
                    <Stack
                        sx={{flex: 1, minWidth: 0, cursor: "pointer"}}
                        onClick={() => onEdit(line)}
                    >
                        <Typography sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{line.drug.name}</Typography>
                        {isDosingEmpty(line.dosing) ? (
                            // No structured dosing: the drug's description is used instead
                            line.drug.description && (
                                <Typography variant="body2" color="text.secondary" sx={{whiteSpace: "pre-line"}}>
                                    {line.drug.description}
                                </Typography>
                            )
                        ) : (
                            <DosingText dosing={line.dosing}/>
                        )}
                        {line.note && (
                            <Typography variant="body2" color="text.secondary" dir="auto" sx={{fontStyle: "italic"}}>
                                {line.note}
                            </Typography>
                        )}
                    </Stack>
                    <Stack direction="row">
                        <Tooltip title={t("prescription.editLine")}>
                            <IconButton size="small" onClick={() => onEdit(line)} aria-label={t("prescription.editLine")}>
                                <EditIcon fontSize="small"/>
                            </IconButton>
                        </Tooltip>
                        {canAddOtherEye(line) && (
                            <Tooltip title={t("prescription.addOtherEye")}>
                                <IconButton size="small" onClick={() => onAddOtherEye(line)} aria-label={t("prescription.addOtherEye")}>
                                    <AddToEyeIcon fontSize="small"/>
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title={t("common.remove")}>
                            <IconButton size="small" onClick={() => onRemove(line)} aria-label={t("common.remove")}>
                                <CloseIcon fontSize="small"/>
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Stack>
            )}
        />
    );
};
