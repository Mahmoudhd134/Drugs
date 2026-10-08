import {useCallback, useEffect, useMemo, useState} from "react";
import type {Drug} from "../drugs/types.ts";

const STORAGE_KEY = "prescription.selection";

const load = (): Drug[] => {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        return Array.isArray(stored) ? stored : [];
    } catch {
        return [];
    }
};

/**
 * The drugs picked for the current prescription. Survives page reloads
 * (localStorage). Each drug appears at most once.
 */
export const usePrescriptionSelection = () => {
    const [drugs, setDrugs] = useState<Drug[]>(load);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(drugs));
        } catch {
            // Storage unavailable (private mode / quota) — the selection just won't persist
        }
    }, [drugs]);

    const selectedIds = useMemo(() => new Set(drugs.map(d => d.id)), [drugs]);

    /** Appends the drugs that aren't selected yet; returns how many were added and skipped. */
    const add = useCallback((toAdd: Drug[]) => {
        const fresh = toAdd.filter((d, i) => !selectedIds.has(d.id) && toAdd.findIndex(x => x.id === d.id) === i);
        if (fresh.length) setDrugs(current => [...current, ...fresh]);
        return {added: fresh.length, skipped: toAdd.length - fresh.length};
    }, [selectedIds]);

    const remove = useCallback((drug: Drug) => setDrugs(current => current.filter(d => d.id !== drug.id)), []);

    /** Clears the selection and returns a function that restores it. */
    const clear = useCallback(() => {
        const previous = drugs;
        setDrugs([]);
        return () => setDrugs(previous);
    }, [drugs]);

    return {drugs, selectedIds, add, remove, reorder: setDrugs, clear};
};
