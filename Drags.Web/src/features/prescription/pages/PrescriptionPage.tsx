import {useState} from "react";
import {Button, Grid} from "@mui/material";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {copyText} from "../../../utils/clipboard.ts";
import {CatalogPanel} from "../components/CatalogPanel.tsx";
import {SelectionPanel} from "../components/SelectionPanel.tsx";
import {EditorDialog} from "../components/EditorDialog.tsx";
import {usePrescriptionSelection} from "../usePrescriptionSelection.ts";
import {drugsToPlainText} from "../prescriptionText.ts";
import type {DrugGroup} from "../../drugGroups/types.ts";
import type {Drug} from "../../drugs/types.ts";

export const PrescriptionPage = () => {
    const {t} = useTranslation();
    const selection = usePrescriptionSelection();
    const [editorOpen, setEditorOpen] = useState(false);

    const addGroup = (group: DrugGroup) => {
        const {added, skipped} = selection.add(group.drugs);
        const message = [
            t("prescription.groupAdded", {name: group.name, count: added}),
            skipped ? t("prescription.groupSkipped", {count: skipped}) : null,
        ].filter(Boolean).join("\n");
        if (added) toast.success(message);
        else toast(message);
    };

    const addDrug = (drug: Drug) => {
        if (!selection.add([drug]).added) toast(t("prescription.alreadyAdded", {name: drug.name}));
    };

    const clear = () => {
        const restore = selection.clear();
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
        if (await copyText(drugsToPlainText(selection.drugs))) toast.success(t("common.copied"));
        else toast.error(t("errors.copyFailed"));
    };

    return (
        <>
            <PageHeader title={t("prescription.title")} subtitle={t("prescription.subtitle")}/>
            <Grid container spacing={2} sx={{alignItems: "flex-start"}}>
                <Grid size={{xs: 12, md: 5}}>
                    <CatalogPanel
                        selectedIds={selection.selectedIds}
                        onSelectGroup={addGroup}
                        onSelectDrug={addDrug}
                    />
                </Grid>
                <Grid size={{xs: 12, md: 7}}>
                    <SelectionPanel
                        drugs={selection.drugs}
                        onReorder={selection.reorder}
                        onRemove={selection.remove}
                        onClear={clear}
                        onEdit={() => setEditorOpen(true)}
                        onQuickCopy={() => void quickCopy()}
                    />
                </Grid>
            </Grid>
            <EditorDialog open={editorOpen} drugs={selection.drugs} onClose={() => setEditorOpen(false)}/>
        </>
    );
};
