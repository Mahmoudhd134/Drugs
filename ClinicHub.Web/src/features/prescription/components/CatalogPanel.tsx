import {useState} from "react";
import {Box, Paper, Tab, Tabs, Typography} from "@mui/material";
import CategoryIcon from "@mui/icons-material/Category";
import MedicationIcon from "@mui/icons-material/Medication";
import {useTranslation} from "react-i18next";
import {ProtocolPicker} from "../../protocols/components/ProtocolPicker.tsx";
import {DrugTree} from "../../drugs/components/DrugTree.tsx";
import type {Protocol} from "../../protocols/types.ts";
import type {Drug} from "../../drugs/types.ts";
import {PERMISSIONS} from "../../access/permissions.ts";
import {usePermissions} from "../../access/usePermissions.ts";

type CatalogTab = "protocols" | "drugs";

type Props = {
    selectedIds: ReadonlySet<number>;
    onSelectProtocol: (protocol: Protocol) => void;
    onSelectDrug: (drug: Drug) => void;
};

/**
 * Search protocols or browse the drug tree to add to the prescription. Protocols are the default tab. Each tab
 * needs its list permission; a tab the user can't use is neither shown nor loaded.
 */
export const CatalogPanel = ({selectedIds, onSelectProtocol, onSelectDrug}: Props) => {
    const {t} = useTranslation();
    const {can} = usePermissions();
    const canProtocols = can(PERMISSIONS.protocols.list);
    const canDrugs = can(PERMISSIONS.drugs.list);
    const [chosenTab, setTab] = useState<CatalogTab>("protocols");
    const tab: CatalogTab = chosenTab === "protocols" && !canProtocols ? "drugs" : chosenTab === "drugs" && !canDrugs ? "protocols" : chosenTab;

    return (
        <Paper variant="outlined" sx={{p: 2.5}}>
            <Typography variant="subtitle1" sx={{fontWeight: 700}}>{t("prescription.catalog")}</Typography>
            {!canProtocols && !canDrugs ? (
                <Typography variant="body2" color="text.secondary" sx={{mt: 2}}>{t("access.nothingToPick")}</Typography>
            ) : (
                <>
                    <Tabs
                        value={tab}
                        onChange={(_, value: CatalogTab) => setTab(value)}
                        variant="fullWidth"
                        sx={{mb: 2, borderBottom: 1, borderColor: "divider"}}
                    >
                        {canProtocols && <Tab value="protocols" icon={<CategoryIcon fontSize="small"/>} iconPosition="start" label={t("prescription.tabProtocols")}/>}
                        {canDrugs && <Tab value="drugs" icon={<MedicationIcon fontSize="small"/>} iconPosition="start" label={t("prescription.tabDrugs")}/>}
                    </Tabs>
                    {/* Keep both mounted so each tab remembers its search (the tree: also its open nodes and scroll, CAT-124) */}
                    <Box hidden={tab !== "protocols"}>
                        <ProtocolPicker onSelect={onSelectProtocol} autoFocus={tab === "protocols"} maxHeight="58vh" enabled={canProtocols}/>
                    </Box>
                    <Box hidden={tab !== "drugs"}>
                        <DrugTree onSelect={onSelectDrug} selectedIds={selectedIds} autoFocus={tab === "drugs"} maxHeight="58vh" enabled={canDrugs}/>
                    </Box>
                </>
            )}
        </Paper>
    );
};
