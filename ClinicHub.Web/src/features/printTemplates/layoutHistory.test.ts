import {describe, expect, test} from "vitest";
import {HISTORY_LIMIT, NUDGE_RUN_MS} from "./constants.ts";
import {applyPageSize, removeItem, updateItem} from "./layout.ts";
import {
    canRedo,
    canUndo,
    EMPTY_HISTORY,
    endRun,
    isDirty,
    type LayoutChange,
    type LayoutHistory,
    recordNudge,
    recordStep,
    redoStep,
    undoStep,
} from "./layoutHistory.ts";
import type {ManualInputItem, PrintLayout} from "./types.ts";

/*
 * The designer's undo stack, from step 3's design (§ 3 "Undo and redo", "Settled by the T0 reviews") and contract § 2.2 with the
 * comments of layoutHistory.ts. StrykerJS mutates layoutHistory.ts against this file.
 */

const manual = (id: string, fields: Partial<ManualInputItem> = {}): ManualInputItem =>
    ({id, kind: "manualInput", name: id, xMm: 20, yMm: 30, wMm: 40, hMm: 8, fontSizePt: 11, ...fields});

const LAYOUT: PrintLayout = {
    schemaVersion: 1,
    calibration: {xMm: 0, yMm: 0},
    page: {size: "A4", widthMm: 210, heightMm: 297},
    items: [
        {id: "t", kind: "prescriptionText", xMm: 14, yMm: 80, wMm: 120, hMm: 90, fontSizePt: 11},
        manual("a", {xMm: 12.3, name: "الاسم"}),
        manual("b", {xMm: 60, name: "السن"}),
    ],
};

/** The layout with `a` at this X. */
const at = (xMm: number): PrintLayout => updateItem(LAYOUT, "a", {xMm});
const ids = (layout: PrintLayout) => layout.items.map(item => item.id);
/** The layout with this printer correction. */
const calibrated = (xMm: number, yMm: number): PrintLayout => ({...LAYOUT, calibration: {xMm, yMm}});

const change: LayoutChange = {kind: "item", itemId: "a"};
/** The layouts at X = 1, 2, … n, each one step after the one before, from X = 0. */
const steps = (n: number, from: LayoutHistory = EMPTY_HISTORY) => {
    let history = from;
    for (let x = 1; x <= n; x++) history = recordStep(history, at(x - 1), at(x), change);
    return history;
};

const undone = (history: LayoutHistory, selectedId: string | null = null) => {
    const answer = undoStep(history, selectedId);
    if (!answer) throw new Error("Nothing to undo");
    return answer;
};
const redone = (history: LayoutHistory, selectedId: string | null = null) => {
    const answer = redoStep(history, selectedId);
    if (!answer) throw new Error("Nothing to redo");
    return answer;
};

describe("print template undo: one step each @area:admin", () => {
    const added = {...LAYOUT, items: [...LAYOUT.items, manual("c")]};
    const onA5 = applyPageSize({...LAYOUT, items: [...LAYOUT.items, manual("c", {xMm: 180, wMm: 25})]}, {size: "A5", widthMm: 148, heightMm: 210});

    test.each<[string, PrintLayout, PrintLayout, LayoutChange, boolean]>([
        ["an add", LAYOUT, added, {kind: "add", itemId: "c"}, false],
        ["a remove", LAYOUT, removeItem(LAYOUT, "a"), {kind: "remove", itemId: "a"}, false],
        ["a drag", LAYOUT, updateItem(LAYOUT, "a", {xMm: 50, yMm: 60}), {kind: "item", itemId: "a"}, false],
        ["a resize", LAYOUT, updateItem(LAYOUT, "a", {xMm: 11, wMm: 41.3}), {kind: "item", itemId: "a"}, false],
        ["a committed field", LAYOUT, updateItem(LAYOUT, "a", {name: "جديد"}), {kind: "item", itemId: "a"}, false],
        ["a page-size change with the items it moved", {...LAYOUT, items: [...LAYOUT.items, manual("c", {xMm: 180, wMm: 25})]}, onA5, {kind: "page"}, true],
        ["a calibration change", LAYOUT, calibrated(2, -1.5), {kind: "calibration"}, false],
    ])("%s: undone and redone, the layout is exactly as before, one step each @TPL-450", (_name, before, after, step, refit) => {
        const history = recordStep(EMPTY_HISTORY, before, after, step);
        expect(history.past).toEqual([{before, after, change: step}]);
        expect(canUndo(history)).toBe(true);
        expect(canRedo(history)).toBe(false);

        const back = undone(history);
        expect(back.layout).toEqual(before);
        expect(back.refit).toBe(refit);
        expect(back.history.past).toEqual([]);
        expect(back.history.future).toEqual([{before, after, change: step}]);
        expect(canUndo(back.history)).toBe(false);
        expect(canRedo(back.history)).toBe(true);

        const forth = redone(back.history);
        expect(forth.layout).toEqual(after);
        expect(forth.refit).toBe(refit);
        expect(forth.history.past).toEqual([{before, after, change: step}]);
        expect(forth.history.future).toEqual([]);
        expect(canUndo(forth.history)).toBe(true);
        expect(canRedo(forth.history)).toBe(false);
    });

    test("an empty history: nothing to undo or redo @TPL-450", () => {
        expect(EMPTY_HISTORY).toEqual({past: [], future: [], run: null});
        expect(canUndo(EMPTY_HISTORY)).toBe(false);
        expect(canRedo(EMPTY_HISTORY)).toBe(false);
        expect(undoStep(EMPTY_HISTORY, "a")).toBeNull();
        expect(redoStep(EMPTY_HISTORY, "a")).toBeNull();
    });

    test("several steps go back and forth in their order; redo brings the next one first @TPL-450", () => {
        const history = steps(3);
        const one = undone(history);
        const two = undone(one.history);
        const three = undone(two.history);
        expect([one, two, three].map(answer => answer.layout)).toEqual([at(2), at(1), at(0)]);
        expect(undoStep(three.history, null)).toBeNull();
        expect(three.history.future.map(step => step.after)).toEqual([at(1), at(2), at(3)]);

        const forth = redone(three.history);
        const further = redone(forth.history);
        const last = redone(further.history);
        expect([forth, further, last].map(answer => answer.layout)).toEqual([at(1), at(2), at(3)]);
        expect(redoStep(last.history, null)).toBeNull();
        expect(last.history.past.map(step => step.after)).toEqual([at(1), at(2), at(3)]);
    });

    test("no real change is no step, and keeps redo @TPL-450", () => {
        const history = undone(steps(2)).history;
        const same = recordStep(history, at(1), at(1), change);
        expect(same).toEqual(history);
        expect(canRedo(same)).toBe(true);

        // Compared as the save compares: rounded and with the name trimmed
        const typed = recordStep(EMPTY_HISTORY, at(12.3), updateItem(at(12.34), "a", {name: " الاسم "}), change);
        expect(typed).toEqual(EMPTY_HISTORY);
        expect(canUndo(typed)).toBe(false);
    });

    test("a step leaves the history it came from as it was @TPL-450", () => {
        const history = steps(1);
        const next = recordStep(history, at(1), at(2), change);
        expect(history.past).toHaveLength(1);
        expect(next.past).toHaveLength(2);
        const back = undone(next);
        expect(next.past).toHaveLength(2);
        expect(next.future).toEqual([]);
        expect(back.history.past).toHaveLength(1);
    });
});

describe("print template undo: a run of nudges @area:admin", () => {
    const START = 1_000_000;

    test("several nudges in a row: one undo step, from where the run began to where it is @TPL-451", () => {
        let history = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);
        expect(history.run).toEqual({itemId: "a", at: START});
        history = recordNudge(history, at(11), at(12), "a", START + 100);
        history = recordNudge(history, at(12), at(13), "a", START + 200);

        expect(history.past).toEqual([{before: at(10), after: at(13), change: {kind: "item", itemId: "a"}}]);
        expect(history.run).toEqual({itemId: "a", at: START + 200});
        const back = undone(history);
        expect(back.layout).toEqual(at(10));
        expect(canUndo(back.history)).toBe(false);
    });

    test("999 ms after the last nudge joins it; 1000 ms starts a new step @TPL-451", () => {
        const first = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);

        const joined = recordNudge(first, at(11), at(12), "a", START + NUDGE_RUN_MS - 1);
        expect(joined.past).toHaveLength(1);
        expect(joined.past[0].after).toEqual(at(12));

        const fresh = recordNudge(first, at(11), at(12), "a", START + NUDGE_RUN_MS);
        expect(fresh.past).toEqual([
            {before: at(10), after: at(11), change: {kind: "item", itemId: "a"}},
            {before: at(11), after: at(12), change: {kind: "item", itemId: "a"}},
        ]);
        expect(fresh.run).toEqual({itemId: "a", at: START + NUDGE_RUN_MS});
    });

    test("the run's clock moves with each nudge: the second counts from the last one, not from the first @TPL-451", () => {
        let history = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);
        history = recordNudge(history, at(11), at(12), "a", START + 900);
        history = recordNudge(history, at(12), at(13), "a", START + 1800);
        expect(history.past).toHaveLength(1);
        history = recordNudge(history, at(13), at(14), "a", START + 2800);
        expect(history.past).toHaveLength(2);
    });

    test("another item's nudge within the second is a new step @TPL-451", () => {
        const other = (xMm: number) => updateItem(at(11), "b", {xMm});
        const first = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);
        const next = recordNudge(first, other(60), other(61), "b", START + 10);
        expect(next.past.map(step => step.change)).toEqual([{kind: "item", itemId: "a"}, {kind: "item", itemId: "b"}]);
        expect(next.run).toEqual({itemId: "b", at: START + 10});
    });

    test("another action ends the run: the next nudge is a new step @TPL-451", () => {
        const first = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);
        const other = recordStep(first, at(11), updateItem(at(11), "b", {xMm: 70}), {kind: "item", itemId: "b"});
        expect(other.run).toBeNull();

        const next = recordNudge(other, updateItem(at(11), "b", {xMm: 70}), updateItem(at(12), "b", {xMm: 70}), "a", START + 10);
        expect(next.past).toHaveLength(3);
    });

    test("selecting another item or a Save (endRun): past and future stay, the next nudge is a new step @TPL-558", () => {
        const open = {...undone(steps(2)).history, run: {itemId: "a", at: START}};
        const ended = endRun(open);
        expect(ended.run).toBeNull();
        expect(ended.past).toEqual(open.past);
        expect(ended.future).toEqual(open.future);

        const first = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);
        const next = recordNudge(endRun(first), at(11), at(12), "a", START + 10);
        expect(next.past).toHaveLength(2);
    });

    test("an undo within the second ends the run: the next nudge is a new step, and redo is gone @TPL-558", () => {
        let history = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);
        history = recordNudge(history, at(11), at(12), "a", START + 10);
        history = recordNudge(endRun(history), at(12), at(13), "a", START + 20);
        expect(history.past).toHaveLength(2);

        const back = undone(history);
        expect(back.history.run).toBeNull();

        const next = recordNudge(back.history, at(12), at(20), "a", START + 30);
        expect(next.past).toHaveLength(2);
        expect(next.past[1]).toEqual({before: at(12), after: at(20), change: {kind: "item", itemId: "a"}});
        expect(next.future).toEqual([]);
    });

    test("a redo ends the run too @TPL-558", () => {
        const history = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);
        const back = undone(history);
        const forth = redone({...back.history, run: {itemId: "a", at: START}});
        expect(forth.history.run).toBeNull();

        const next = recordNudge(forth.history, at(11), at(12), "a", START + 10);
        expect(next.past).toHaveLength(2);
    });

    test("right then left within a run, net zero: no step left, no run @TPL-558", () => {
        let history = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);
        history = recordNudge(history, at(11), at(10), "a", START + 10);

        expect(history.past).toEqual([]);
        expect(history.run).toBeNull();
        expect(canUndo(history)).toBe(false);
    });

    test("net zero leaves the steps before the run alone, and the next nudge opens a new one @TPL-558", () => {
        const before = steps(2);
        let history = recordNudge(endRun(before), at(2), at(3), "a", START);
        history = recordNudge(history, at(3), at(2), "a", START + 10);
        expect(history.past).toEqual(before.past);
        expect(history.run).toBeNull();

        const next = recordNudge(history, at(2), at(3), "a", START + 20);
        expect(next.past).toHaveLength(3);
        expect(next.run).toEqual({itemId: "a", at: START + 20});
    });

    test("a run that went away and came back only at its end: back to where it began is still net zero @TPL-558", () => {
        let history = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);
        history = recordNudge(history, at(11), at(12), "a", START + 10);
        history = recordNudge(history, at(12), at(11), "a", START + 20);
        expect(history.past).toEqual([{before: at(10), after: at(11), change: {kind: "item", itemId: "a"}}]);
        history = recordNudge(history, at(11), at(10), "a", START + 30);
        expect(history.past).toEqual([]);
    });

    test("no real change (the sheet's edge): the history comes back unchanged, its clock not moved, redo kept @TPL-540", () => {
        const first = recordNudge(EMPTY_HISTORY, at(10), at(11), "a", START);
        const atEdge = recordNudge(first, at(11), at(11), "a", START + 500);
        expect(atEdge).toEqual(first);
        // The 1000 ms still count from the last real nudge
        expect(recordNudge(atEdge, at(11), at(12), "a", START + NUDGE_RUN_MS).past).toHaveLength(2);

        const withRedo = undone(steps(2)).history;
        expect(recordNudge(withRedo, at(1), at(1), "a", START)).toEqual(withRedo);
        expect(canRedo(recordNudge(withRedo, at(1), at(1), "a", START))).toBe(true);
    });

    test("nudges over the limit drop the oldest step too @TPL-452", () => {
        let history = endRun(steps(HISTORY_LIMIT));
        expect(history.past).toHaveLength(HISTORY_LIMIT);
        history = recordNudge(history, at(HISTORY_LIMIT), at(HISTORY_LIMIT + 1), "a", START);
        expect(history.past).toHaveLength(HISTORY_LIMIT);
        expect(history.past[0].before).toEqual(at(1));
    });
});

describe("print template undo: the last 50 steps @area:admin", () => {
    test("exactly 50 changes: all kept @TPL-452", () => {
        const history = steps(50);
        expect(history.past).toHaveLength(50);
        expect(history.past[0].before).toEqual(at(0));
    });

    test("51 changes: 50 can be undone, and then nothing is left to undo @TPL-452", () => {
        let history = steps(51);
        expect(history.past).toHaveLength(50);

        for (let undoes = 0; undoes < 50; undoes++) {
            expect(canUndo(history)).toBe(true);
            history = undone(history).history;
        }
        expect(canUndo(history)).toBe(false);
        expect(undoStep(history, null)).toBeNull();
        expect(history.future).toHaveLength(50);
    });

    test("the oldest goes: the 50th undo stops at the first change's result, not before it @TPL-452", () => {
        let history = steps(51);
        let layout = at(51);
        for (let undoes = 0; undoes < 50; undoes++) {
            const answer = undone(history);
            history = answer.history;
            layout = answer.layout;
        }
        expect(layout).toEqual(at(1));
    });

    test("more than 50 changes since the load, all 50 undone: the saved layout is out of reach, so it stays unsaved @TPL-578", () => {
        const saved = at(0);
        let history = steps(51);
        let layout = at(51);
        while (canUndo(history)) {
            const answer = undone(history);
            history = answer.history;
            layout = answer.layout;
        }
        expect(isDirty(layout, saved, {})).toBe(true);
    });
});

describe("print template undo: a new change after an undo @area:admin", () => {
    test("redo is empty, and the undone step is gone for good @TPL-453", () => {
        const back = undone(steps(2));
        expect(canRedo(back.history)).toBe(true);

        const next = recordStep(back.history, at(1), at(9), change);
        expect(canRedo(next)).toBe(false);
        expect(next.future).toEqual([]);
        expect(redoStep(next, null)).toBeNull();
        expect(next.past.map(step => step.after)).toEqual([at(1), at(9)]);
    });

    test("a nudge after an undo drops redo too @TPL-453", () => {
        const back = undone(steps(2));
        const next = recordNudge(back.history, at(1), at(9), "a", 0);
        expect(canRedo(next)).toBe(false);
        expect(next.future).toEqual([]);
    });
});

describe("print template undo: an item brought back @area:admin", () => {
    const removed = removeItem(LAYOUT, "a");
    const history = recordStep(EMPTY_HISTORY, LAYOUT, removed, {kind: "remove", itemId: "a"});

    test("the same id, name and place, and it's selected @TPL-457", () => {
        const back = undone(history);
        const item = back.layout.items.find(candidate => candidate.id === "a");
        expect(item).toEqual(LAYOUT.items[1]);
        expect(back.selectedId).toBe("a");
    });

    test("at its old index, so its paint order is the same @TPL-576", () => {
        expect(ids(LAYOUT)).toEqual(["t", "a", "b"]);
        expect(ids(undone(history).layout)).toEqual(["t", "a", "b"]);
    });

    test("with nothing else changed, there's nothing to save @TPL-576", () => {
        expect(isDirty(removed, LAYOUT, {})).toBe(true);
        expect(isDirty(undone(history).layout, LAYOUT, {})).toBe(false);
    });
});

describe("print template undo: the selection after undo and redo @area:admin", () => {
    const added = {...LAYOUT, items: [...LAYOUT.items, manual("c")]};

    test.each<[string, LayoutChange, PrintLayout, PrintLayout, string | null, string | null, string | null]>([
        ["an add", {kind: "add", itemId: "c"}, LAYOUT, added, "b", null, "c"],
        ["an add, nothing selected", {kind: "add", itemId: "c"}, LAYOUT, added, null, null, "c"],
        ["a remove", {kind: "remove", itemId: "a"}, LAYOUT, removeItem(LAYOUT, "a"), "b", "a", null],
        ["a remove, nothing selected", {kind: "remove", itemId: "a"}, LAYOUT, removeItem(LAYOUT, "a"), null, "a", null],
        ["a change to a, with b selected", {kind: "item", itemId: "a"}, LAYOUT, at(50), "b", "a", "a"],
        ["a change to a, nothing selected", {kind: "item", itemId: "a"}, LAYOUT, at(50), null, "a", "a"],
        ["a calibration change, with b selected", {kind: "calibration"}, LAYOUT, calibrated(2, 0), "b", "b", "b"],
        ["a calibration change, nothing selected", {kind: "calibration"}, LAYOUT, calibrated(2, 0), null, null, null],
    ])("%s: undo selects, redo selects, as the table says @TPL-577", (_name, step, before, after, selected, afterUndo, afterRedo) => {
        const history = recordStep(EMPTY_HISTORY, before, after, step);
        const back = undone(history, selected);
        expect(back.selectedId).toBe(afterUndo);
        const forth = redone(back.history, selected);
        expect(forth.selectedId).toBe(afterRedo);
    });

    describe("a page size", () => {
        const onA5 = {...LAYOUT, page: {size: "A5", widthMm: 148, heightMm: 210}} as PrintLayout;
        const history = recordStep(EMPTY_HISTORY, LAYOUT, onA5, {kind: "page"});

        test("the selection is kept if the item exists, on undo and on redo @TPL-577", () => {
            const back = undone(history, "b");
            expect(back.selectedId).toBe("b");
            expect(redone(back.history, "a").selectedId).toBe("a");
        });

        test("nothing selected stays nothing @TPL-577", () => {
            const back = undone(history, null);
            expect(back.selectedId).toBeNull();
            expect(redone(back.history, null).selectedId).toBeNull();
        });

        test("an item that isn't in that layout clears, on undo and on redo @TPL-577", () => {
            const back = undone(history, "gone");
            expect(back.selectedId).toBeNull();
            expect(redone(back.history, "gone").selectedId).toBeNull();
        });

        test("only in the layout it brings: an item of the other layout alone clears @TPL-577", () => {
            const before = LAYOUT;
            const after = {...removeItem(LAYOUT, "b"), page: onA5.page};
            const pageStep = recordStep(EMPTY_HISTORY, before, after, {kind: "page"});
            // b is in the layout undo brings back
            const back = undone(pageStep, "b");
            expect(back.selectedId).toBe("b");
            // … and not in the one redo brings
            expect(redone(back.history, "b").selectedId).toBeNull();
        });

        test("it re-fits, and no other step does @TPL-577", () => {
            const back = undone(history, null);
            expect(back.refit).toBe(true);
            expect(redone(back.history, null).refit).toBe(true);
            const itemStep = recordStep(EMPTY_HISTORY, at(1), at(2), change);
            const backItem = undone(itemStep, null);
            expect(backItem.refit).toBe(false);
            expect(redone(backItem.history, null).refit).toBe(false);
        });
    });
});

describe("print template undo: unsaved changes follow the layout @area:admin", () => {
    test.each<[string, PrintLayout, PrintLayout | null, Record<string, string>, boolean]>([
        ["the saved layout", LAYOUT, LAYOUT, {}, false],
        ["the same, in another form (rounded, trimmed)", updateItem(at(12.34), "a", {name: " الاسم "}), LAYOUT, {}, false],
        ["another layout", at(13), LAYOUT, {}, true],
        ["a new sheet never saved", LAYOUT, null, {}, true],
        ["raw text in a field, on the saved layout", LAYOUT, LAYOUT, {"a.xMm": "abc"}, true],
        ["raw text in a sheet measure, on the saved layout", LAYOUT, LAYOUT, {"page.widthMm": "500"}, true],
    ])("%s @TPL-578", (_name, layout, baseline, rawInputs, dirty) => {
        expect(isDirty(layout, baseline, rawInputs)).toBe(dirty);
    });

    test("an item off the sheet, undone back to its off-sheet place: exactly that value @TPL-544", () => {
        const off = updateItem(LAYOUT, "a", {xMm: 240});
        const inside = updateItem(LAYOUT, "a", {xMm: 170});
        const history = recordStep(EMPTY_HISTORY, off, inside, change);
        expect(undone(history).layout.items[1].xMm).toBe(240);
    });
});

describe("print template undo: an item's alignment @area:admin", () => {
    const aligned = (align: "right" | "center" | "left" | null) => updateItem(LAYOUT, "a", {align});

    test("a press is one step, undone back to what it was @TPL-737", () => {
        const history = recordStep(EMPTY_HISTORY, LAYOUT, aligned("center"), change);
        expect(history.past).toHaveLength(1);
        expect(undone(history).layout).toEqual(LAYOUT);
        expect(redone(undone(history).history).layout).toEqual(aligned("center"));
    });

    test("right on an item holding none is no change: it's right already @TPL-737", () => {
        expect(recordStep(EMPTY_HISTORY, LAYOUT, aligned("right"), change)).toBe(EMPTY_HISTORY);
    });

    test.each<[string, PrintLayout, boolean]>([
        ["center on an old template", aligned("center"), true],
        ["left on an old template", aligned("left"), true],
        ["right on an old template", aligned("right"), false],
        ["null on an old template", aligned(null), false],
    ])("%s, for unsaved changes @TPL-737", (_name, layout, dirty) => {
        expect(isDirty(layout, LAYOUT, {})).toBe(dirty);
    });
});

describe("print template undo: the printer correction @area:admin", () => {
    const step: LayoutChange = {kind: "calibration"};

    test("a committed change is one step; undo and redo keep the selected item, and nothing re-fits @TPL-702", () => {
        const history = recordStep(EMPTY_HISTORY, LAYOUT, calibrated(2, 0), step);
        expect(history.past).toEqual([{before: LAYOUT, after: calibrated(2, 0), change: step}]);

        const back = undone(history, "a");
        expect(back.layout).toEqual(LAYOUT);
        expect(back.selectedId).toBe("a");
        expect(back.refit).toBe(false);

        const forth = redone(back.history, "a");
        expect(forth.layout).toEqual(calibrated(2, 0));
        expect(forth.selectedId).toBe("a");
        expect(forth.refit).toBe(false);
    });

    test("the selection is what it is at that moment, whichever item the step began with @TPL-702", () => {
        const history = recordStep(EMPTY_HISTORY, LAYOUT, calibrated(2, 0), step);
        const back = undone(history, "b");
        expect(back.selectedId).toBe("b");
        expect(redone(back.history, "a").selectedId).toBe("a");
        expect(undone(history, null).selectedId).toBeNull();
    });

    test("back to the same number is no step, and keeps redo @TPL-702", () => {
        const history = undone(recordStep(EMPTY_HISTORY, calibrated(1, 0), calibrated(2, 0), step)).history;
        const same = recordStep(history, calibrated(1, 0), calibrated(1, 0), step);
        expect(same).toEqual(history);
        expect(canRedo(same)).toBe(true);
    });

    test("a number that rounds to the same one is no step @TPL-702", () => {
        expect(recordStep(EMPTY_HISTORY, calibrated(2.3, 0), calibrated(2.34, 0), step)).toEqual(EMPTY_HISTORY);
        expect(recordStep(EMPTY_HISTORY, calibrated(0, 0), calibrated(-0.04, 0), step)).toEqual(EMPTY_HISTORY);
    });

    test("it ends a run of nudges, and a new one is a new step @TPL-702", () => {
        const nudged = recordNudge(EMPTY_HISTORY, LAYOUT, at(13), "a", 1_000);
        const history = recordStep(nudged, at(13), {...at(13), calibration: {xMm: 2, yMm: 0}}, step);
        expect(history.run).toBeNull();
        expect(history.past).toHaveLength(2);
    });

    test.each<[string, number, number, boolean]>([
        ["the same as the saved one", 0, 0, false],
        ["another X", 2, 0, true],
        ["another Y", 0, 2, true],
        ["a number rounding to the saved one", -0.04, 0, false],
    ])("unsaved changes: %s @TPL-613 @TPL-721", (_name, xMm, yMm, dirty) => {
        expect(isDirty(calibrated(xMm, yMm), LAYOUT, {})).toBe(dirty);
    });

    test("raw text in a correction field is unsaved, on the saved layout @TPL-613", () => {
        expect(isDirty(LAYOUT, LAYOUT, {"calibration.xMm": "abc"})).toBe(true);
    });
});
