import {useState} from "react";
import {DrugTree} from "../../features/drugs/components/DrugTree.tsx";
import type {Drug} from "../../features/drugs/types.ts";

/** The tree with its selection kept like the pages keep it: a selected drug gets «مُضاف». */
export const DrugTreeHarness = ({onSelect, initial, ...props}: {
    onSelect: (drug: Drug) => void;
    initial: number[];
    autoFocus?: boolean;
    enabled?: boolean;
    maxHeight?: number | string;
}) => {
    const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set(initial));
    return (
        <DrugTree
            {...props}
            selectedIds={selected}
            onSelect={drug => {
                onSelect(drug);
                setSelected(ids => new Set([...ids, drug.id]));
            }}
        />
    );
};
