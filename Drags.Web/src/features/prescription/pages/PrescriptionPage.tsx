import {useState} from "react";
import {Button, Grid} from "@mui/material";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {copyRichText} from "../../../utils/clipboard.ts";
import {CatalogPanel} from "../components/CatalogPanel.tsx";
import {SelectionPanel} from "../components/SelectionPanel.tsx";
import {EditorDialog} from "../components/EditorDialog.tsx";
import {LineEditDialog} from "../components/LineEditDialog.tsx";
import {usePrescriptionLines} from "../usePrescriptionLines.ts";
import {htmlForPaste, linesToHtml, linesToPlainText} from "../prescriptionText.ts";
import type {PrescriptionLine} from "../types.ts";
import type {DrugGroup} from "../../drugGroups/types.ts";
import type {Drug} from "../../drugs/types.ts";

export const PrescriptionPage = () => {
    const {t} = useTranslation();
    const prescription = usePrescriptionLines();
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingLine, setEditingLine] = useState<PrescriptionLine | null>(null);

    const addGroup = (group: DrugGroup) => {
        const {added, skipped} = prescription.addDrugs(group.drugs);
        const message = [
            t("prescription.groupAdded", {name: group.name, count: added}),
            skipped ? t("prescription.groupSkipped", {count: skipped}) : null,
        ].filter(Boolean).join("\n");
        if (added) toast.success(message);
        else toast(message);
    };

    const addDrug = (drug: Drug) => {
        if (!prescription.addDrugs([drug]).added) toast(t("prescription.alreadyAdded", {name: drug.name}));
    };

    const clear = () => {
        const restore = prescription.clear();
        toast((toastItem) => (
            <span style={{display: "flex", alignItems: "center", gap: 12}}>
                {t("prescription.cleared")}
                <Button
                    size="small"
                    onClick={() => {
                        restore();
                        toast.dismiss(toastItem.id);
                    }}
                >
                    {t("common.undo")}
                </Button>
            </span>
        ), {duration: 6000});
    };

    const quickCopy = async () => {
        const {lines} = prescription;
        if (await copyRichText(htmlForPaste(linesToHtml(lines)), linesToPlainText(lines))) toast.success(t("common.copied"));
        else toast.error(t("errors.copyFailed"));
    };

    return (
        <>
            <PageHeader title={t("prescription.title")} subtitle={t("prescription.subtitle")}/>
            <Grid container spacing={2} sx={{alignItems: "flex-start"}}>
                <Grid size={{xs: 12, md: 5}}>
                    <CatalogPanel
                        selectedIds={prescription.drugIds}
                        onSelectGroup={addGroup}
                        onSelectDrug={addDrug}
                    />
                </Grid>
                <Grid size={{xs: 12, md: 7}}>
                    <SelectionPanel
                        lines={prescription.lines}
                        onReorder={prescription.reorder}
                        onEditLine={setEditingLine}
                        onRemove={(line) => prescription.removeLine(line.key)}
                        canAddOtherEye={prescription.canAddOtherEye}
                        onAddOtherEye={prescription.addOtherEye}
                        onClear={clear}
                        onEdit={() => setEditorOpen(true)}
                        onQuickCopy={() => void quickCopy()}
                    />
                </Grid>
            </Grid>
            <LineEditDialog line={editingLine} onClose={() => setEditingLine(null)} onSave={prescription.updateLine}/>
            <EditorDialog open={editorOpen} lines={prescription.lines} onClose={() => setEditorOpen(false)}/>
        </>
    );
};
