import {useState} from "react";
import {Box, Paper, Tab, Tabs, Typography} from "@mui/material";
import CategoryIcon from "@mui/icons-material/Category";
import MedicationIcon from "@mui/icons-material/Medication";
import {useTranslation} from "react-i18next";
import {GroupPicker} from "../../drugGroups/components/GroupPicker.tsx";
import {DrugPicker} from "../../drugs/components/DrugPicker.tsx";
import type {DrugGroup} from "../../drugGroups/types.ts";
import type {Drug} from "../../drugs/types.ts";

type CatalogTab = "groups" | "drugs";

type Props = {
    selectedIds: ReadonlySet<number>;
    onSelectGroup: (group: DrugGroup) => void;
    onSelectDrug: (drug: Drug) => void;
};

/** Search groups or single drugs to add to the prescription. Groups are the default tab. */
export const CatalogPanel = ({selectedIds, onSelectGroup, onSelectDrug}: Props) => {
    const {t} = useTranslation();
    const [tab, setTab] = useState<CatalogTab>("groups");

    return (
        <Paper variant="outlined" sx={{p: 2.5}}>
            <Typography variant="subtitle1" sx={{fontWeight: 700}}>{t("prescription.catalog")}</Typography>
            <Tabs
                value={tab}
                onChange={(_, value: CatalogTab) => setTab(value)}
                variant="fullWidth"
                sx={{mb: 2, borderBottom: 1, borderColor: "divider"}}
            >
                <Tab value="groups" icon={<CategoryIcon fontSize="small"/>} iconPosition="start" label={t("prescription.tabGroups")}/>
                <Tab value="drugs" icon={<MedicationIcon fontSize="small"/>} iconPosition="start" label={t("prescription.tabDrugs")}/>
            </Tabs>
            {/* Keep both mounted so each tab remembers its search */}
            <Box hidden={tab !== "groups"}>
                <GroupPicker onSelect={onSelectGroup} autoFocus maxHeight="58vh"/>
            </Box>
            <Box hidden={tab !== "drugs"}>
                <DrugPicker onSelect={onSelectDrug} selectedIds={selectedIds} maxHeight="58vh"/>
            </Box>
        </Paper>
    );
};
