import type {AddableItem, LayoutError, PageSize, PrintLayout, TemplateItem, TemplatePage} from "./types.ts";

/*
 * The designer's pure rules (contract § 2.2), mirroring the server's validator and `PrescriptionLayoutRules`. StrykerJS
 * mutates this file (PURE_LOGIC). Contract stubs: track print-templates/frontend writes the bodies.
 */

const stub = (): never => {
    throw new Error("contract stub");
};

/**
 * One decimal, midpoint away from zero, as `Math.Round(value, 1, MidpointRounding.AwayFromZero)` on the server:
 * 12.34 → 12.3, 12.35 → 12.4, -12.35 → -12.4, 0.05 → 0.1. Doubles can't hold 12.35, so the scaled value drops its noise
 * before rounding: `Math.sign(v) * Math.round(Number((Math.abs(v) * 10).toPrecision(12))) / 10`.
 */
export const roundTenth: (value: number) => number = stub;

/** Whole tenths of a mm, for every comparison and sum (0.3 + 209.8 → 3 + 2098 = 2101 = 210.1 → 2101: TPL-210). */
export const toTenths: (value: number) => number = stub;

/**
 * What a typed number field holds: `12.5`, `12,5` and `١٢٫٥` are all 12.5, rounded by {@link roundTenth}; spaces around it
 * and the invisible marks U+200E, U+200F, U+061C are ignored; Arabic-Indic (٠–٩) and Persian (۰–۹) digits are read; a
 * leading `-` is kept (the rules then refuse it, it is never corrected silently). null: empty or anything else
 * (`abc`, `1.2.3`, `1e3`, `٫`, `-`).
 */
export const parseMmInput: (text: string) => number | null = stub;

/** A number as its field shows it: Latin digits, a dot, at most one decimal (`12.5`, `148`). */
export const formatMm: (value: number) => string = stub;

/**
 * What is validated, compared and sent (the server's `Normalize`): every number rounded, a name trimmed; a static text as
 * typed. The order of the items is kept.
 */
export const normalizeLayout: (layout: PrintLayout) => PrintLayout = stub;

/**
 * Every broken rule of `normalizeLayout(layout)`, in the server's order with the server's fields and codes (contract § 1.4;
 * the shared cases: tests/fixtures/print-layout-cases.json). Empty: valid. Takes what the API could hold, so unknown kinds
 * and functions are checked at run time too.
 */
export const validateLayout: (layout: PrintLayout) => LayoutError[] = stub;

/** The item index a field names: `items[2].name` → 2; `page.widthMm`, `items` → null. */
export const itemIndexOfField: (field: string) => number | null = stub;

/** A new A5 sheet holding only the prescription text (`DEFAULT_TEXT_BOX`, font 11, id `i1`). */
export const newLayout: () => PrintLayout = stub;

/** True while another item fits (fewer than `MAX_ITEMS`). */
export const canAddItem: (layout: PrintLayout) => boolean = stub;

/**
 * The layout with the panel's item added last, and that item; null at `MAX_ITEMS` (no 51st). The id is the first free
 * `i<n>`. Font `DEFAULT_FONT_SIZE_PT`, size `DEFAULT_ITEM_SIZES`, with n = the items already there:
 * `xMm = (CASCADE_START_MM + CASCADE_STEP_MM * n) % (floor(page.widthMm - wMm) + 1)`, and `yMm` likewise with the height,
 * so it is always inside (a 50 × 50 mm page too). Manual input and function: the name is `defaultName` (the kind's label
 * in the UI language), or `defaultName 2`, `defaultName 3`… the first not taken (trimmed, ignoring case). Static text:
 * empty text, no name.
 */
export const addItem: (layout: PrintLayout, addable: AddableItem, defaultName: string) => { layout: PrintLayout; item: TemplateItem } | null = stub;

/** The layout without the item; the prescription text is never removed (the layout comes back unchanged). */
export const removeItem: (layout: PrintLayout, id: string) => PrintLayout = stub;

/** The layout with the item's fields changed, exactly as given (no moving, no correcting: TPL-224). */
export const updateItem: (layout: PrintLayout, id: string, changes: Partial<TemplateItem>) => PrintLayout = stub;

/** The measures of a size: A5 and A4 theirs, custom the current ones (`current` unchanged, only `size` differs). */
export const pageOfSize: (size: PageSize, current: TemplatePage) => TemplatePage = stub;

/**
 * The layout on a new page (design § 3): items keep their mm. On each axis, length = `min(length, sheet)` unless that goes
 * below the item's minimum (a sheet is never smaller than a minimum, so only an item already below it keeps its length);
 * then start = clamped to `[0, sheet - length]`. Items already inside don't change (TPL-222, TPL-223). Works in tenths.
 */
export const applyPageSize: (layout: PrintLayout, page: TemplatePage) => PrintLayout = stub;

/** Same normalized layout: the same page and the same items, fields and order (TPL-233). */
export const sameLayout: (a: PrintLayout, b: PrintLayout) => boolean = stub;
