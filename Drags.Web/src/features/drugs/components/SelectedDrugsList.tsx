import {Avatar, IconButton, Stack, Tooltip} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {useTranslation} from "react-i18next";
import {SortableList} from "../../../components/common/SortableList.tsx";
import {DrugText} from "./DrugText.tsx";
import type {Drug} from "../types.ts";

type Props = {
    drugs: Drug[];
    onReorder: (drugs: Drug[]) => void;
    onRemove: (drug: Drug) => void;
};

/** Numbered, drag-to-reorder list of drugs with a remove button on each row. */
export const SelectedDrugsList = ({drugs, onReorder, onRemove}: Props) => {
    const {t} = useTranslation();

    return (
        <SortableList
            items={drugs}
            getId={d => d.id}
            onReorder={onReorder}
            renderItem={(drug, index) => (
                <Stack direction="row" sx={{gap: 1.5, alignItems: "flex-start"}}>
                    <Avatar sx={{width: 26, height: 26, fontSize: 13, bgcolor: "primary.main", mt: 0.25}}>
                        {index + 1}
                    </Avatar>
                    <Stack sx={{flex: 1, minWidth: 0}}>
                        <DrugText drug={drug}/>
                    </Stack>
                    <Tooltip title={t("common.remove")}>
                        <IconButton size="small" onClick={() => onRemove(drug)} aria-label={t("common.remove")}>
                            <CloseIcon fontSize="small"/>
                        </IconButton>
                    </Tooltip>
                </Stack>
            )}
        />
    );
};
