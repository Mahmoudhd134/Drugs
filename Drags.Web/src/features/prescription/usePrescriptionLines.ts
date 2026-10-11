import {useCallback, useEffect, useMemo, useState} from "react";
import type {Drug} from "../drugs/types.ts";
import {eyeKey, otherEye, type Dosing} from "../dosing/types.ts";
import type {PrescriptionLine} from "./types.ts";

/** One prescription per clinic, so clinics never mix */
const storageKey = (clinicId: number) => `prescription.lines.${clinicId}`;
/** Before clinics (login) the lines were stored for the whole browser */
const UNSCOPED_STORAGE_KEY = "prescription.lines";
/** Before structured dosing the selection was stored as a plain list of drugs */
const LEGACY_STORAGE_KEY = "prescription.selection";

// crypto.randomUUID needs HTTPS, and the app is opened over plain http on the clinic LAN
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** A new line for the drug with the given dosing (the drug's default when omitted). */
export const newLine = (drug: Drug, dosing: Dosing = drug.defaultDosing ?? {}): PrescriptionLine =>
    ({key: newKey(), drug, dosing: {...dosing}, note: ""});

const lineFromDrug = (drug: Drug) => newLine(drug);

/** A drug can appear once per eye. */
export const lineIdentity = (drugId: number, dosing: Dosing) => `${drugId}:${eyeKey(dosing)}`;
const identity = lineIdentity;

const load = (clinicId: number): PrescriptionLine[] => {
    const key = storageKey(clinicId);
    try {
        const stored = JSON.parse(localStorage.getItem(key) ?? "null");
        if (Array.isArray(stored)) return stored;

        // Older storage goes to the first clinic opened. Saved under the new key before the old one
        // is dropped, so a repeated load (React may call this initializer twice) still finds the lines
        const unscoped = JSON.parse(localStorage.getItem(UNSCOPED_STORAGE_KEY) ?? "null");
        if (Array.isArray(unscoped)) {
            localStorage.setItem(key, JSON.stringify(unscoped));
            localStorage.removeItem(UNSCOPED_STORAGE_KEY);
            return unscoped;
        }

        const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? "null");
        if (Array.isArray(legacy)) {
            const migrated = (legacy as Drug[]).map(lineFromDrug);
            localStorage.setItem(key, JSON.stringify(migrated));
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            return migrated;
        }
    } catch {
        // Corrupt or unavailable storage: start empty
    }
    return [];
};

/**
 * The lines of the clinic's current prescription. Survives page reloads (localStorage, one key per
 * clinic). Each drug appears at most once per eye. The page is re-mounted when the clinic changes.
 */
export const usePrescriptionLines = (clinicId: number) => {
    const [lines, setLines] = useState<PrescriptionLine[]>(() => load(clinicId));

    useEffect(() => {
        try {
            localStorage.setItem(storageKey(clinicId), JSON.stringify(lines));
        } catch {
            // Storage unavailable (private mode / quota): the prescription just won't persist
        }
    }, [clinicId, lines]);

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

    /** The line of this drug for the dosing's eye, if any. */
    const findLine = useCallback((drugId: number, dosing: Dosing) =>
        lines.find(l => identity(l.drug.id, l.dosing) === identity(drugId, dosing)), [lines]);

    /** Appends prepared lines as they are (callers check for clashes). */
    const addLines = useCallback((toAdd: PrescriptionLine[]) => {
        if (toAdd.length) setLines(current => [...current, ...toAdd]);
    }, []);

    /** Replaces a line's dosing, keeping its position and note. */
    const setLineDosing = useCallback((key: string, dosing: Dosing) =>
        setLines(current => current.map(l => (l.key === key ? {...l, dosing} : l))), []);

    const removeLine = useCallback((key: string) => setLines(current => current.filter(l => l.key !== key)), []);

    /** Clears the prescription and returns a function that restores it. */
    const clear = useCallback(() => {
        const previous = lines;
        setLines([]);
        return () => setLines(previous);
    }, [lines]);

    return {
        lines, drugIds, addDrugs, findLine, addLines, setLineDosing, updateLine,
        canAddOtherEye, addOtherEye, removeLine, reorder: setLines, clear,
    };
};
