import {Box} from "@mui/material";
import {useTranslation} from "react-i18next";
import type {Drug} from "../types.ts";

type Props = {
    /** A drug row clicked (or Enter on it); a double click adds once */
    onSelect: (drug: Drug) => void;
    /** Drugs already chosen: their rows carry «مُضاف» */
    selectedIds?: ReadonlySet<number>;
    autoFocus?: boolean;
    /** The scroll panel's max height (the page scrolls past it); default "58vh" */
    maxHeight?: number | string;
    /** False: never loads (no `drugs.list`: no request to `/drugs/tree` or `/drugs`) */
    enabled?: boolean;
};

/**
 * The drug catalog as a tree (design M1.7 D7, D9): search + source toggle + «النتائج: N» + categories → subcategories →
 * drugs, 30 at a time while scrolling. Replaces `DrugPicker` in the prescription page and the protocol editor (same
 * props). Structure, keyboard and accessible names: docs/design/m1.7c-contract.md § 3.3. M1.7c contract stub (track web).
 */
export const DrugTree = ({onSelect, selectedIds, autoFocus, maxHeight = "58vh", enabled = true}: Props) => {
    const {t} = useTranslation();
    void onSelect;
    void selectedIds;
    void autoFocus;
    void enabled;
    return <Box role="tree" aria-label={t("drugTree.label")} sx={{maxHeight, overflowY: "auto"}}/>;
};
