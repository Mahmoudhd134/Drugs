import type {ReactNode} from "react";
import {Avatar, Box, IconButton, Stack, Tooltip, Typography} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/EditOutlined";
import AddToEyeIcon from "@mui/icons-material/AddCircleOutline";
import {useTranslation} from "react-i18next";
import {SortableList} from "../../../components/common/SortableList.tsx";
import type {DrugSnapshot} from "../../drugs/types.ts";

type Line = { key: string; drug: DrugSnapshot };

type Props<T extends Line> = {
    lines: T[];
    onReorder: (lines: T[]) => void;
    onEdit: (line: T) => void;
    onRemove: (line: T) => void;
    /** What to show under the drug name (dosing sentence, note, badges…) */
    renderDetails: (line: T) => ReactNode;
    canAddOtherEye?: (line: T) => boolean;
    onAddOtherEye?: (line: T) => void;
    /** Just the numbered lines: no reordering, editing or removing (e.g. no edit permission) */
    readOnly?: boolean;
};

/**
 * Numbered, drag-to-reorder list of drug lines with edit / add-for-other-eye / remove actions.
 * Used for prescription lines and protocol lines.
 */
export const DosingLineList = <T extends Line>(props: Props<T>) => {
    const {lines, onReorder, onEdit, onRemove, renderDetails, canAddOtherEye, onAddOtherEye, readOnly} = props;
    const {t} = useTranslation();

    const renderLine = (line: T, index: number) => (
        <Stack direction="row" sx={{gap: 1.5, alignItems: "flex-start"}}>
            <Avatar sx={{width: 26, height: 26, fontSize: 13, bgcolor: "primary.main", mt: 0.25}}>
                {index + 1}
            </Avatar>
            <Stack
                sx={{flex: 1, minWidth: 0, cursor: readOnly ? undefined : "pointer"}}
                onClick={readOnly ? undefined : () => onEdit(line)}
            >
                <Typography sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{line.drug.name}</Typography>
                {renderDetails(line)}
            </Stack>
            {!readOnly && (
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
            )}
        </Stack>
    );

    if (readOnly) return (
        <Stack sx={{gap: 1}}>
            {lines.map((line, index) => (
                <Box key={line.key} sx={{p: 1.5, border: 1, borderColor: "divider", borderRadius: 2}}>
                    {renderLine(line, index)}
                </Box>
            ))}
        </Stack>
    );

    return <SortableList items={lines} getId={l => l.key} onReorder={onReorder} renderItem={renderLine}/>;
};
