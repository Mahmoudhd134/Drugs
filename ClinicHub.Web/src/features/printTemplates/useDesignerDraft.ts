import {useState} from "react";
import {MAX_CUSTOM_HEIGHT_MM, MAX_CUSTOM_WIDTH_MM, MIN_CUSTOM_HEIGHT_MM, MIN_CUSTOM_WIDTH_MM} from "./constants.ts";
import {type Box, nudgeBox} from "./dragGeometry.ts";
import {addItem, applyPageSize, normalizeLayout, pageOfSize, parseMmInput, removeItem, sameLayout, toTenths, updateItem} from "./layout.ts";
import {canRedo, canUndo, EMPTY_HISTORY, endRun, type LayoutChange, type LayoutHistory, recordNudge, recordStep, redoStep, type TimeTravel, undoStep} from "./layoutHistory.ts";
import type {AddableItem, ItemAlign, PageSize, PrintLayout, TemplateItem} from "./types.ts";

/** The number fields of an item, in the settings' order. */
export type BoxField = "xMm" | "yMm" | "wMm" | "hMm" | "fontSizePt";

/** The sheet's measures, which commit at blur or Enter. */
export type PageMeasure = "widthMm" | "heightMm";

/** X or Y of the printer's correction. */
export type CalibrationField = "xMm" | "yMm";

/** The designer's local state (contract § 3.6). Keys of `rawInputs` and `touched`: `<itemId>.<field>`, `page.widthMm`, `calibration.xMm`… */
export type Draft = {
    layout: PrintLayout;
    /** What the screen compares with: the template as loaded or as last sent; null: a new sheet, never saved */
    baseline: PrintLayout | null;
    /** Text typed in a number field that the layout couldn't take */
    rawInputs: Record<string, string>;
    /** Text typed in a sheet measure, not committed yet, that differs from the committed number: unsaved, nothing moves */
    typedPage: Partial<Record<PageMeasure, string>>;
    selectedId: string | null;
    /** The item just added, whose box is scrolled into view */
    revealId: string | null;
    /** Fields changed since the load, or with a problem when Save was pressed: only these show the rules' messages */
    touched: ReadonlySet<string>;
    /** The server's messages by its field (`items[2].name`), until the next edit */
    serverErrors: Record<string, string>;
    /** Lives and dies with the draft: removed with the template, gone when the page is left, untouched by a refetch (TPL-570) */
    history: LayoutHistory;
    /** A field typed in and not committed yet: the step it will be, and the layout before its first change (step 4 contract § 4.7) */
    openField: { change: LayoutChange; before: PrintLayout } | null;
    /** Goes up when the page changed, so the screen re-fits; the zoom itself is the screen's, never the draft's */
    fitRequests: number;
};

/** Both seeded through `normalizeLayout`, so a template saved before the correction existed isn't dirty when it opens (TPL-612). */
export const startDraft = (layout: PrintLayout, baseline: PrintLayout | null): Draft => ({
    layout: normalizeLayout(layout),
    baseline: baseline && normalizeLayout(baseline),
    rawInputs: {},
    typedPage: {},
    selectedId: null,
    revealId: null,
    touched: new Set(),
    serverErrors: {},
    history: EMPTY_HISTORY,
    openField: null,
    fitRequests: 0,
});

/** The field that shows a size's "outside the sheet" error (`validateLayout` names X or Y), so typing the size marks it too. */
const START_OF_SIZE: Partial<Record<BoxField, BoxField>> = {wMm: "xMm", hMm: "yMm"};

/** What a drag or a nudge decides, so a field's raw text about them can't outlast them (TPL-582). */
const PLACE_FIELDS: BoxField[] = ["xMm", "yMm", "wMm", "hMm"];

const without = <T, >(entries: Record<string, T>, key: string) => {
    const copy = {...entries};
    delete copy[key];
    return copy;
};

/** Without the entries of a key prefix (a removed item's). */
const withoutPrefix = <T, >(entries: Record<string, T>, prefix: string) =>
    Object.fromEntries(Object.entries(entries).filter(([key]) => !key.startsWith(prefix)));

const withoutPlaceOf = (rawInputs: Record<string, string>, itemId: string) =>
    PLACE_FIELDS.reduce((rest, field) => without(rest, `${itemId}.${field}`), rawInputs);

/**
 * The open field recorded as a step, a no-op with no real change (TPL-563). Anything that records a step, and undo and redo,
 * goes through this first: a field unmounted below 900 px gets no blur.
 */
const withFieldCommitted = (draft: Draft): Draft => draft.openField
    ? {
        ...draft,
        history: recordStep(draft.history, draft.openField.before, draft.layout, draft.openField.change),
        openField: null,
    }
    : draft;

const sameChange = (a: LayoutChange | undefined, b: LayoutChange) =>
    a?.kind === b.kind && (a.kind !== "item" || b.kind !== "item" || a.itemId === b.itemId);

/** The first typed change of a field opens it; another item's open field, or the correction's, is committed first. */
const withFieldOpen = (draft: Draft, change: LayoutChange): Draft => {
    const current = sameChange(draft.openField?.change, change) ? draft : withFieldCommitted(draft);
    return {...current, openField: current.openField ?? {change, before: current.layout}};
};

/** The layout on another page, as one page step: re-fits only when something changed (TPL-579). */
const withPageStep = (draft: Draft, layout: PrintLayout): Draft => ({
    ...draft,
    layout,
    history: recordStep(draft.history, draft.layout, layout, {kind: "page"}),
    fitRequests: draft.fitRequests + (sameLayout(draft.layout, layout) ? 0 : 1),
});

/** A custom measure committed: within the rules it applies, as one page step; anything else moves nothing and stays as typed. */
const withMeasureCommitted = (draftNow: Draft, field: PageMeasure, text: string): Draft => {
    const current = withFieldCommitted(draftNow);
    const key = `page.${field}`;
    const value = parseMmInput(text);
    const touched = new Set(current.touched).add(key);
    const typedPage = without(current.typedPage, field);
    const [min, max] = field === "widthMm" ? [MIN_CUSTOM_WIDTH_MM, MAX_CUSTOM_WIDTH_MM] : [MIN_CUSTOM_HEIGHT_MM, MAX_CUSTOM_HEIGHT_MM];
    if (value === null || toTenths(value) < toTenths(min) || toTenths(value) > toTenths(max)) {
        return {...current, touched, typedPage, rawInputs: {...current.rawInputs, [key]: text}};
    }
    return {
        ...withPageStep(current, applyPageSize(current.layout, {...current.layout.page, [field]: value})),
        touched,
        typedPage,
        rawInputs: without(current.rawInputs, key),
    };
};

/** The draft with every measure still typed committed: Save's, when no blur came (the window narrowed and widened while typing). */
export const withTypedPageCommitted = (current: Draft) =>
    (Object.entries(current.typedPage) as [PageMeasure, string][])
        .reduce((committed, [field, text]) => withMeasureCommitted(committed, field, text), current);

/**
 * The draft and every change to it (contract § 3.6): what's a step and what isn't lives here, the screen only calls these.
 * Above the desktop switch, so narrowing the window keeps the edits and the history (TPL-229, TPL-574).
 */
export const useDesignerDraft = () => {
    const [draft, setDraft] = useState<Draft | null>(null);

    /** An edit: what it changes, and the server's messages go. */
    const edit = (change: (current: Draft) => Draft) =>
        setDraft(current => current && {...change(current), serverErrors: {}});

    const add = (addable: AddableItem, defaultName: string) => edit(current => {
        const base = withFieldCommitted(current);
        const added = addItem(base.layout, addable, defaultName);
        if (!added) return base;
        return {
            ...base,
            layout: added.layout,
            selectedId: added.item.id,
            revealId: added.item.id,
            history: recordStep(base.history, base.layout, added.layout, {kind: "add", itemId: added.item.id}),
        };
    });

    /** A drop from the panel, as one step: the new item's id, null at 50 items. */
    const dropNew = (addable: AddableItem, defaultName: string, box: Box) => {
        if (!draft) return null;
        const base = withFieldCommitted(draft);
        const added = addItem(base.layout, addable, defaultName);
        if (!added) return null;
        const layout = updateItem(added.layout, added.item.id, box);
        setDraft({
            ...base,
            layout,
            selectedId: added.item.id,
            serverErrors: {},
            history: recordStep(base.history, base.layout, layout, {kind: "add", itemId: added.item.id}),
        });
        return added.item.id;
    };

    /** The end of a drag on a box: one step, or nothing at all when the layout is the same (TPL-542). */
    const commitBox = (itemId: string, box: Box) => setDraft(current => {
        if (!current) return current;
        const base = withFieldCommitted(current);
        const layout = updateItem(base.layout, itemId, box);
        if (sameLayout(base.layout, layout)) return base;
        return {
            ...base,
            layout,
            rawInputs: withoutPlaceOf(base.rawInputs, itemId),
            serverErrors: {},
            history: recordStep(base.history, base.layout, layout, {kind: "item", itemId}),
        };
    });

    /** One arrow key: joins the run of nudges; at the sheet's edge nothing changes, and no step (TPL-540). */
    const nudge = (item: TemplateItem, dxMm: number, dyMm: number, now: number) => setDraft(current => {
        if (!current) return current;
        const base = withFieldCommitted(current);
        const layout = updateItem(base.layout, item.id, nudgeBox(item, dxMm, dyMm, base.layout.page));
        if (sameLayout(base.layout, layout)) return base;
        return {
            ...base,
            layout,
            rawInputs: withoutPlaceOf(base.rawInputs, item.id),
            serverErrors: {},
            history: recordNudge(base.history, base.layout, layout, item.id, now),
        };
    });

    const changeItemNumber = (item: TemplateItem, field: BoxField, text: string) => edit(draftNow => {
        const current = withFieldOpen(draftNow, {kind: "item", itemId: item.id});
        const key = `${item.id}.${field}`;
        const value = parseMmInput(text);
        const touched = new Set(current.touched).add(key);
        const startField = START_OF_SIZE[field];
        if (startField) touched.add(`${item.id}.${startField}`);
        return value === null
            ? {...current, touched, rawInputs: {...current.rawInputs, [key]: text}}
            : {...current, touched, rawInputs: without(current.rawInputs, key), layout: updateItem(current.layout, item.id, {[field]: value})};
    });

    /** X or Y of the correction, as an item's number: touched at once, so out of range shows at once; the selection stays (step 4 contract § 4.7). */
    const changeCalibration = (field: CalibrationField, text: string) => edit(draftNow => {
        const current = withFieldOpen(draftNow, {kind: "calibration"});
        const key = `calibration.${field}`;
        const value = parseMmInput(text);
        const touched = new Set(current.touched).add(key);
        return value === null
            ? {...current, touched, rawInputs: {...current.rawInputs, [key]: text}}
            : {
                ...current,
                touched,
                rawInputs: without(current.rawInputs, key),
                layout: {...current.layout, calibration: {...current.layout.calibration, [field]: value}},
            };
    });

    const changeItemText = (item: TemplateItem, field: "name" | "text", value: string) => edit(draftNow => {
        const current = withFieldOpen(draftNow, {kind: "item", itemId: item.id});
        return {
            ...current,
            touched: new Set(current.touched).add(`${item.id}.${field}`),
            layout: updateItem(current.layout, item.id, {[field]: value}),
        };
    });

    /** The item's alignment: one step each press, never a field left open. */
    const changeItemAlign = (item: TemplateItem, align: ItemAlign) => edit(draftNow => {
        const current = withFieldCommitted(draftNow);
        const layout = updateItem(current.layout, item.id, {align});
        return {...current, layout, history: recordStep(current.history, current.layout, layout, {kind: "item", itemId: item.id})};
    });

    /** A field's commit: blur or Enter; static text, blur only (TPL-564). */
    const commitField = () => setDraft(current => current && withFieldCommitted(current));

    const removeSelected = (item: TemplateItem) => edit(draftNow => {
        const current = withFieldCommitted(draftNow);
        const layout = removeItem(current.layout, item.id);
        return {
            ...current,
            layout,
            selectedId: null,
            // An id is reused after a removal: the next item with this one is new again
            revealId: null,
            rawInputs: withoutPrefix(current.rawInputs, `${item.id}.`),
            touched: new Set([...current.touched].filter(key => !key.startsWith(`${item.id}.`))),
            history: recordStep(current.history, current.layout, layout, {kind: "remove", itemId: item.id}),
        };
    });

    const changePageSize = (size: PageSize) => edit(draftNow => {
        const current = withFieldCommitted(draftNow);
        return {
            ...withPageStep(current, applyPageSize(current.layout, pageOfSize(size, current.layout.page))),
            rawInputs: without(without(current.rawInputs, "page.widthMm"), "page.heightMm"),
            typedPage: {},
        };
    });

    /** A measure's keystroke: it moves nothing and counts as unsaved; typed back to the committed number, it is clean again. */
    const typePageMeasure = (field: PageMeasure, text: string) => edit(current => {
        const value = parseMmInput(text);
        return value !== null && toTenths(value) === toTenths(current.layout.page[field])
            ? {...current, typedPage: without(current.typedPage, field), rawInputs: without(current.rawInputs, `page.${field}`)}
            : {...current, typedPage: {...current.typedPage, [field]: text}};
    });

    /** A custom measure, at blur or Enter. */
    const commitPageMeasure = (field: PageMeasure, text: string) => edit(current => withMeasureCommitted(current, field, text));

    /** Selecting is no step, but it ends a run of nudges (TPL-558). */
    const select = (id: string | null) =>
        setDraft(current => current && {...current, selectedId: id, history: endRun(current.history)});

    /** Undo or redo (contract § 3.6): the answer, null when there was nothing to do. `baseline` never changes here. */
    const travel = (move: typeof undoStep): TimeTravel | null => {
        if (!draft) return null;
        const current = withFieldCommitted(draft);
        const answer = move(current.history, current.selectedId);
        setDraft(answer
            ? {
                ...current,
                layout: answer.layout,
                selectedId: answer.selectedId,
                history: answer.history,
                rawInputs: {},
                typedPage: {},
                // An undone add's id comes back with the next add: that item is new again
                revealId: null,
                serverErrors: {},
                fitRequests: current.fitRequests + (answer.refit ? 1 : 0),
            }
            : current);
        return answer;
    };

    return {
        draft,
        setDraft,
        /** Undo's on state: a step to undo, or an open field with a real change (contract § 6.19), so it can be pressed while typing (TPL-581) */
        canUndoNow: draft !== null && (canUndo(draft.history)
            || (draft.openField !== null && !sameLayout(draft.openField.before, draft.layout))),
        canRedoNow: draft !== null && canRedo(draft.history),
        ops: {
            add,
            dropNew,
            commitBox,
            nudge,
            changeItemNumber,
            changeItemText,
            changeItemAlign,
            changeCalibration,
            commitField,
            removeSelected,
            changePageSize,
            typePageMeasure,
            commitPageMeasure,
            select,
            undo: () => travel(undoStep),
            redo: () => travel(redoStep),
        },
    };
};

export type DraftOps = ReturnType<typeof useDesignerDraft>["ops"];
