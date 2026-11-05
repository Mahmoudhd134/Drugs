/* eslint-disable @typescript-eslint/no-unused-vars -- the contract's stubs; the coder removes this line */
import type {PrintLayout} from "./types.ts";

/*
 * The designer's undo stack (step 3 contract § 2.2): whole layouts, grouping and the comparison with the saved layout, with
 * the clock passed in. Pure. StrykerJS mutates this file (PURE_LOGIC).
 */

/** What a step changed, which decides the selection after undo and redo (contract § 2.2). */
export type LayoutChange =
    | { kind: "add"; itemId: string }
    | { kind: "remove"; itemId: string }
    | { kind: "item"; itemId: string }
    | { kind: "page" };

export type HistoryStep = { before: PrintLayout; after: PrintLayout; change: LayoutChange };

export type LayoutHistory = {
    /** Oldest first; at most `HISTORY_LIMIT` */
    past: readonly HistoryStep[];
    /** What redo brings back, the next one first */
    future: readonly HistoryStep[];
    /** The run of nudges the last step belongs to, while it's open */
    run: { itemId: string; at: number } | null;
};

export const EMPTY_HISTORY: LayoutHistory = {past: [], future: [], run: null};

/**
 * A finished change, one step. No real change (`sameLayout(before, after)`): the history comes back unchanged, redo kept. Else
 * redo is dropped, the run ends, and the oldest step goes past `HISTORY_LIMIT`.
 */
export const recordStep = (_history: LayoutHistory, _before: PrintLayout, _after: PrintLayout, _change: LayoutChange): LayoutHistory => {
    throw new Error("not implemented");
};

/**
 * One nudge at `now` (ms). Within the run (the same item, less than `NUDGE_RUN_MS` since the last nudge: 999 joins, 1000 starts
 * a new step): the last step's `after` is replaced and the run's clock moves. A run back to where it began (net zero) leaves no
 * step and no run. No real change: the history comes back unchanged. Else as {@link recordStep}, with a new run.
 */
export const recordNudge = (_history: LayoutHistory, _before: PrintLayout, _after: PrintLayout, _itemId: string, _now: number): LayoutHistory => {
    throw new Error("not implemented");
};

/** Another action happened (a selection, a Save): the next nudge starts a new step. Past and future stay. */
export const endRun = (_history: LayoutHistory): LayoutHistory => {
    throw new Error("not implemented");
};

export const canUndo = (_history: LayoutHistory): boolean => {
    throw new Error("not implemented");
};

export const canRedo = (_history: LayoutHistory): boolean => {
    throw new Error("not implemented");
};

/** What undo or redo gives: the new history, the layout to show, the selection, and whether the sheet re-fits (a page step). */
export type TimeTravel = { history: LayoutHistory; layout: PrintLayout; selectedId: string | null; refit: boolean };

/**
 * The last step undone, or null with none; the run ends. The selection: an add clears; a remove selects the item; an item
 * change selects that item; a page step keeps `selectedId` if that item exists in the restored layout, else clears.
 */
export const undoStep = (_history: LayoutHistory, _selectedId: string | null): TimeTravel | null => {
    throw new Error("not implemented");
};

/**
 * The next step redone, or null with none; the run ends. The selection: an add selects the item; a remove clears; an item
 * change selects that item; a page step as {@link undoStep}.
 */
export const redoStep = (_history: LayoutHistory, _selectedId: string | null): TimeTravel | null => {
    throw new Error("not implemented");
};

/**
 * Unsaved changes (D16): a new sheet never saved (`baseline` null), or a layout other than the saved one (`sameLayout`), or raw
 * text in a field.
 */
export const isDirty = (_layout: PrintLayout, _baseline: PrintLayout | null, _rawInputs: Readonly<Record<string, string>>): boolean => {
    throw new Error("not implemented");
};
