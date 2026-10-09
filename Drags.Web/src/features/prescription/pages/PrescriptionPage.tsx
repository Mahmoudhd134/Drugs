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
import {lineIdentity, newLine, usePrescriptionLines} from "../usePrescriptionLines.ts";
import {useGroupAddDialogs} from "../components/useGroupAddDialogs.tsx";
import {ASK_EYE, mergeDosing, sameDosing} from "../../dosing/types.ts";
import {htmlForPaste, linesToHtml, linesToPlainText} from "../prescriptionText.ts";
import type {PrescriptionLine} from "../types.ts";
import type {DrugGroup} from "../../drugGroups/types.ts";
import type {Drug} from "../../drugs/types.ts";

export const PrescriptionPage = () => {
    const {t} = useTranslation();
    const prescription = usePrescriptionLines();
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingLine, setEditingLine] = useState<PrescriptionLine | null>(null);
    const groupDialogs = useGroupAddDialogs();

    /**
     * Adds a group's lines: each drug's default dosing with the group's override on top.
     * Asks once for the eye when lines use "ask", then asks about each line that clashes with
     * one already in the prescription (same drug and eye, different dosing).
     */
    const addGroup = async (group: DrugGroup) => {
        let candidates = group.items.map(item => ({
            drug: item.drug,
            dosing: mergeDosing(item.drug.defaultDosing, item.dosing),
        }));

        if (candidates.some(c => c.dosing.eye === ASK_EYE)) {
            const eye = await groupDialogs.askEye(group.name);
            if (!eye) return;
            candidates = candidates.map(c => (c.dosing.eye === ASK_EYE ? {...c, dosing: {...c.dosing, eye}} : c));
        }

        const fresh: PrescriptionLine[] = [];
        const conflicts: { existing: PrescriptionLine; incoming: (typeof candidates)[number] }[] = [];
        const seen = new Set<string>();
        let unchanged = 0;
        for (const candidate of candidates) {
            const id = lineIdentity(candidate.drug.id, candidate.dosing);
            if (seen.has(id)) continue;
            seen.add(id);
            const existing = prescription.findLine(candidate.drug.id, candidate.dosing);
            if (!existing) fresh.push(newLine(candidate.drug, candidate.dosing));
            else if (sameDosing(existing.dosing, candidate.dosing)) unchanged++;
            else conflicts.push({existing, incoming: candidate});
        }

        let replaced = 0;
        let kept = 0;
        let decision: boolean | null = null;
        for (const [index, {existing, incoming}] of conflicts.entries()) {
            let replace = decision;
            if (replace === null) {
                const answer = await groupDialogs.askConflict({
                    drugName: incoming.drug.name,
                    current: existing.dosing,
                    incoming: incoming.dosing,
                    remaining: conflicts.length - index - 1,
                });
                replace = answer.replace;
                if (answer.applyToRemaining) decision = answer.replace;
            }
            if (replace) {
                prescription.setLineDosing(existing.key, incoming.dosing);
                replaced++;
            } else {
                kept++;
            }
        }
        prescription.addLines(fresh);

        const message = [
            t("prescription.groupAdded", {name: group.name, count: fresh.length}),
            replaced ? t("prescription.groupReplaced", {count: replaced}) : null,
            kept ? t("prescription.groupKept", {count: kept}) : null,
            unchanged ? t("prescription.groupSkipped", {count: unchanged}) : null,
        ].filter(Boolean).join("\n");
        if (fresh.length || replaced) toast.success(message);
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
                        onSelectGroup={(group) => void addGroup(group)}
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
            {groupDialogs.dialogs}
        </>
    );
};
