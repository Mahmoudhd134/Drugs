import {useCallback, useEffect, useMemo, useState} from "react";
import type {Drug} from "../drugs/types.ts";
import {eyeKey, otherEye, type Dosing} from "../dosing/types.ts";
import type {PrescriptionLine} from "./types.ts";

const STORAGE_KEY = "prescription.lines";
/** Before structured dosing the selection was stored as a plain list of drugs */
const LEGACY_STORAGE_KEY = "prescription.selection";

// crypto.randomUUID needs HTTPS, and the app is opened over plain http on the clinic LAN
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const lineFromDrug = (drug: Drug): PrescriptionLine =>
    ({key: newKey(), drug, dosing: {...(drug.defaultDosing ?? {})}, note: ""});

/** A drug can appear once per eye. */
const identity = (drugId: number, dosing: Dosing) => `${drugId}:${eyeKey(dosing)}`;

const load = (): PrescriptionLine[] => {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
        if (Array.isArray(stored)) return stored;

        const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? "null");
        if (Array.isArray(legacy)) {
            const migrated = (legacy as Drug[]).map(lineFromDrug);
            // Save under the new key before dropping the old one, so a repeated load
            // (React may call this initializer twice) still finds the lines
            localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            return migrated;
        }
    } catch {
        // Corrupt or unavailable storage: start empty
    }
    return [];
};

/**
 * The lines of the current prescription. Survives page reloads (localStorage).
 * Each drug appears at most once per eye.
 */
export const usePrescriptionLines = () => {
    const [lines, setLines] = useState<PrescriptionLine[]>(load);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
        } catch {
            // Storage unavailable (private mode / quota): the prescription just won't persist
        }
    }, [lines]);

    /** Drugs that have at least one line, for "Added" markers. */
    const drugIds = useMemo(() => new Set(lines.map(l => l.drug.id)), [lines]);

    /** Adds a line per drug (with its default dosing), skipping drug+eye pairs already present. */
    const addDrugs = useCallback((drugs: Drug[]) => {
        const taken = new Set(lines.map(l => identity(l.drug.id, l.dosing)));
        const fresh: PrescriptionLine[] = [];
        for (const drug of drugs) {
            const line = lineFromDrug(drug);
            const id = identity(drug.id, line.dosing);
            if (taken.has(id)) continue;
            taken.add(id);
            fresh.push(line);
        }
        if (fresh.length) setLines(current => [...current, ...fresh]);
        return {added: fresh.length, skipped: drugs.length - fresh.length};
    }, [lines]);

    /** Returns false (and changes nothing) if the new eye clashes with another line of the same drug. */
    const updateLine = useCallback((key: string, changes: Pick<PrescriptionLine, "dosing" | "note">) => {
        const line = lines.find(l => l.key === key);
        if (!line) return false;
        const id = identity(line.drug.id, changes.dosing);
        if (lines.some(l => l.key !== key && identity(l.drug.id, l.dosing) === id)) return false;
        setLines(current => current.map(l => (l.key === key ? {...l, ...changes} : l)));
        return true;
    }, [lines]);

    /** For a right/left line whose opposite eye is free: inserts a copy for the other eye right after it. */
    const canAddOtherEye = useCallback((line: PrescriptionLine) => {
        const eye = otherEye(line.dosing.eye);
        return eye !== null && !lines.some(l => l.drug.id === line.drug.id && eyeKey(l.dosing) === eye);
    }, [lines]);

    const addOtherEye = useCallback((line: PrescriptionLine) => {
        const eye = otherEye(line.dosing.eye);
        if (!eye || !canAddOtherEye(line)) return;
        const copy: PrescriptionLine = {...line, key: newKey(), dosing: {...line.dosing, eye}};
        setLines(current => {
            const index = current.findIndex(l => l.key === line.key);
            return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
        });
    }, [canAddOtherEye]);

    const removeLine = useCallback((key: string) => setLines(current => current.filter(l => l.key !== key)), []);

    /** Clears the prescription and returns a function that restores it. */
    const clear = useCallback(() => {
        const previous = lines;
        setLines([]);
        return () => setLines(previous);
    }, [lines]);

    return {lines, drugIds, addDrugs, updateLine, canAddOtherEye, addOtherEye, removeLine, reorder: setLines, clear};
};
