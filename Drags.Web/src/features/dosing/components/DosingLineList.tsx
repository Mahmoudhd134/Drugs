import type {ReactNode} from "react";
import {Avatar, IconButton, Stack, Tooltip, Typography} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/EditOutlined";
import AddToEyeIcon from "@mui/icons-material/AddCircleOutline";
import {useTranslation} from "react-i18next";
import {SortableList} from "../../../components/common/SortableList.tsx";
import type {Drug} from "../../drugs/types.ts";

type Line = { key: string; drug: Drug };

type Props<T extends Line> = {
    lines: T[];
    onReorder: (lines: T[]) => void;
    onEdit: (line: T) => void;
    onRemove: (line: T) => void;
    /** What to show under the drug name (dosing sentence, note, badges…) */
    renderDetails: (line: T) => ReactNode;
    canAddOtherEye?: (line: T) => boolean;
    onAddOtherEye?: (line: T) => void;
};

/**
 * Numbered, drag-to-reorder list of drug lines with edit / add-for-other-eye / remove actions.
 * Used for prescription lines and group lines.
 */
export const DosingLineList = <T extends Line>(props: Props<T>) => {
    const {lines, onReorder, onEdit, onRemove, renderDetails, canAddOtherEye, onAddOtherEye} = props;
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
                    <Stack sx={{flex: 1, minWidth: 0, cursor: "pointer"}} onClick={() => onEdit(line)}>
                        <Typography sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{line.drug.name}</Typography>
                        {renderDetails(line)}
                    </Stack>
                    <Stack direction="row">
                        <Tooltip title={t("prescription.editLine")}>
                            <IconButton size="small" onClick={() => onEdit(line)} aria-label={t("prescription.editLine")}>
                                <EditIcon fontSize="small"/>
                            </IconButton>
                        </Tooltip>
                        {canAddOtherEye?.(line) && onAddOtherEye && (
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
