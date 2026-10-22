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
import {useProtocolAddDialogs} from "../components/useProtocolAddDialogs.tsx";
import {ASK_EYE, type Dosing, mergeDosing, sameDosing} from "../../dosing/types.ts";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {htmlForPaste, linesToHtml, linesToPlainText} from "../prescriptionText.ts";
import type {PrescriptionLine} from "../types.ts";
import type {Protocol} from "../../protocols/types.ts";
import type {Drug, DrugSnapshot} from "../../drugs/types.ts";
import {useClinic} from "../../auth/useAuth.ts";

export const PrescriptionPage = () => {
    const {t} = useTranslation();
    // The page is re-mounted on a clinic switch (RequireAuth), so the hook never sees clinicId change
    const {clinicId} = useClinic();
    const prescription = usePrescriptionLines(clinicId);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingLine, setEditingLine] = useState<PrescriptionLine | null>(null);
    const protocolDialogs = useProtocolAddDialogs();
    // A protocol is added once per click: a fast double click must not run the flow (and its dialogs) twice
    const once = useSingleFlight();

    /**
     * Adds a protocol's lines: each drug's default dosing with the protocol's override on top.
     * 1. Lines that give the same drug for the same eye as saved (a drug's default eye changed after the protocol was
     *    saved; the API refuses new ones) are added once, the others counted in the summary ("duplicated").
     * 2. Asks once for the eye when lines use "ask".
     * 3. An "ask" line and a line for the eye then chosen (same drug) meet only now: when their dosings differ, the user
     *    picks one (the conflict dialog, protocol variant), so no dosing is dropped unseen; identical ones are added once.
     * 4. Asks about each line that clashes with one already in the prescription (same drug and eye, different dosing).
     */
    const addProtocol = async (protocol: Protocol) => {
        type Candidate = { drug: DrugSnapshot; dosing: Dosing };
        let candidates: Candidate[] = [];
        const seen = new Set<string>();
        let duplicated = 0;
        for (const item of protocol.items) {
            const candidate = {drug: item.drug, dosing: mergeDosing(item.drug.defaultDosing, item.dosing)};
            const id = lineIdentity(candidate.drug.id, candidate.dosing);
            if (seen.has(id)) {
                duplicated++;
                continue;
            }
            seen.add(id);
            candidates.push(candidate);
        }

        if (candidates.some(c => c.dosing.eye === ASK_EYE)) {
            const eye = await protocolDialogs.askEye(protocol.name);
            if (!eye) return;
            candidates = candidates.map(c => (c.dosing.eye === ASK_EYE ? {...c, dosing: {...c.dosing, eye}} : c));

            // An "ask" line and a line for the chosen eye: one line, the dosing the user picks
            const merged: Candidate[] = [];
            const indexById = new Map<string, number>();
            const clashes: { index: number; other: Candidate }[] = [];
            for (const candidate of candidates) {
                const id = lineIdentity(candidate.drug.id, candidate.dosing);
                const index = indexById.get(id);
                if (index === undefined) {
                    indexById.set(id, merged.length);
                    merged.push(candidate);
                } else if (!sameDosing(merged[index].dosing, candidate.dosing)) {
                    clashes.push({index, other: candidate});
                }
            }
            let useOtherForAll: boolean | null = null;
            for (const [position, {index, other}] of clashes.entries()) {
                let useOther = useOtherForAll;
                if (useOther === null) {
                    const answer = await protocolDialogs.askConflict({
                        variant: "protocol",
                        drugName: other.drug.name,
                        current: merged[index].dosing,
                        incoming: other.dosing,
                        remaining: clashes.length - position - 1,
                    });
                    useOther = answer.replace;
                    if (answer.applyToRemaining) useOtherForAll = answer.replace;
                }
                if (useOther) merged[index] = other;
            }
            candidates = merged;
        }

        const fresh: PrescriptionLine[] = [];
        const conflicts: { existing: PrescriptionLine; incoming: Candidate }[] = [];
        let unchanged = 0;
        for (const candidate of candidates) {
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
                const answer = await protocolDialogs.askConflict({
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
            t("prescription.protocolAdded", {name: protocol.name, count: fresh.length}),
            replaced ? t("prescription.protocolReplaced", {count: replaced}) : null,
            kept ? t("prescription.protocolKept", {count: kept}) : null,
            unchanged ? t("prescription.protocolSkipped", {count: unchanged}) : null,
            duplicated ? t("prescription.protocolDuplicated", {count: duplicated}) : null,
        ].filter(Boolean).join("\n");
        if (fresh.length || replaced) toast.success(message);
        else toast(message);

        // Lines of drugs the admin disabled are added too, with a separate warning after the protocol's toast (design
        // M1.7 D6): plain style, ⚠ icon
        const withdrawn = fresh.filter(line => line.drug.withdrawn).length;
        if (withdrawn > 0) toast(t("prescription.protocolWithdrawn", {count: withdrawn}), {icon: "⚠️"});
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
                        onSelectProtocol={(protocol) => void once(() => addProtocol(protocol))}
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
            {protocolDialogs.dialogs}
        </>
    );
};
