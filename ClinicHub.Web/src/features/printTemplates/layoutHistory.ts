import {HISTORY_LIMIT, NUDGE_RUN_MS} from "./constants.ts";
import {sameLayout} from "./layout.ts";
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
    | { kind: "page" }
    /** X or Y of the printer's correction (step 4 design § 5): the selection stays, nothing re-fits */
    | { kind: "calibration" };

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
export const recordStep = (history: LayoutHistory, before: PrintLayout, after: PrintLayout, change: LayoutChange): LayoutHistory => {
    if (sameLayout(before, after)) return history;
    return {past: [...history.past, {before, after, change}].slice(-HISTORY_LIMIT), future: [], run: null};
};

/**
 * One nudge at `now` (ms). Within the run (the same item, less than `NUDGE_RUN_MS` since the last nudge: 999 joins, 1000 starts
 * a new step): the last step's `after` is replaced and the run's clock moves. A run back to where it began (net zero) leaves no
 * step and no run. No real change: the history comes back unchanged. Else as {@link recordStep}, with a new run.
 */
export const recordNudge = (history: LayoutHistory, before: PrintLayout, after: PrintLayout, itemId: string, now: number): LayoutHistory => {
    if (sameLayout(before, after)) return history;
    const {past, run} = history;
    const last = past[past.length - 1];
    if (!last || !run || run.itemId !== itemId || now - run.at >= NUDGE_RUN_MS) {
        return {...recordStep(history, before, after, {kind: "item", itemId}), run: {itemId, at: now}};
    }
    const earlier = past.slice(0, -1);
    return sameLayout(last.before, after)
        ? {...history, past: earlier, run: null}
        : {...history, past: [...earlier, {...last, after}], run: {itemId, at: now}};
};

/** Another action happened (a selection, a Save): the next nudge starts a new step. Past and future stay. */
export const endRun = (history: LayoutHistory): LayoutHistory => ({...history, run: null});

export const canUndo = (history: LayoutHistory): boolean => history.past.length > 0;

export const canRedo = (history: LayoutHistory): boolean => history.future.length > 0;

/** A page step's selection: kept if that item is in the layout now shown. */
const keptSelection = (layout: PrintLayout, selectedId: string | null) =>
    layout.items.some(item => item.id === selectedId) ? selectedId : null;

/** What undo or redo gives: the new history, the layout to show, the selection, and whether the sheet re-fits (a page step). */
export type TimeTravel = { history: LayoutHistory; layout: PrintLayout; selectedId: string | null; refit: boolean };

/**
 * The last step undone, or null with none; the run ends. The selection: an add clears; a remove selects the item; an item
 * change selects that item; a page step keeps `selectedId` if that item exists in the restored layout, else clears.
 */
export const undoStep = (history: LayoutHistory, selectedId: string | null): TimeTravel | null => {
    const step = history.past[history.past.length - 1];
    if (!step) return null;
    const {change, before: layout} = step;
    let selected: string | null;
    if (change.kind === "calibration") selected = selectedId;
    else if (change.kind === "page") selected = keptSelection(layout, selectedId);
    else selected = change.kind === "add" ? null : change.itemId;
    return {
        history: {past: history.past.slice(0, -1), future: [step, ...history.future], run: null},
        layout,
        selectedId: selected,
        refit: change.kind === "page",
    };
};

/**
 * The next step redone, or null with none; the run ends. The selection: an add selects the item; a remove clears; an item
 * change selects that item; a page step as {@link undoStep}.
 */
export const redoStep = (history: LayoutHistory, selectedId: string | null): TimeTravel | null => {
    const step = history.future[0];
    if (!step) return null;
    const {change, after: layout} = step;
    let selected: string | null;
    if (change.kind === "calibration") selected = selectedId;
    else if (change.kind === "page") selected = keptSelection(layout, selectedId);
    else selected = change.kind === "remove" ? null : change.itemId;
    return {
        history: {past: [...history.past, step], future: history.future.slice(1), run: null},
        layout,
        selectedId: selected,
        refit: change.kind === "page",
    };
};

/**
 * Unsaved changes (D16): a new sheet never saved (`baseline` null), or a layout other than the saved one (`sameLayout`), or raw
 * text in a field.
 */
export const isDirty = (layout: PrintLayout, baseline: PrintLayout | null, rawInputs: Readonly<Record<string, string>>): boolean =>
    baseline === null || !sameLayout(layout, baseline) || Object.keys(rawInputs).length > 0;
