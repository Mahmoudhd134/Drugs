import type {PageSize, TemplateFunction, TemplateItemKind} from "./types.ts";

/** The limits of a template, mirroring the server's `PrescriptionTemplateLimits` (design § 3). */
export const SCHEMA_VERSION = 1;
export const MAX_ITEMS = 50;
export const ITEM_ID_MAX_LENGTH = 40;
export const NAME_MAX_LENGTH = 60;
export const STATIC_TEXT_MAX_LENGTH = 1000;

export const MIN_FONT_SIZE_PT = 6;
export const MAX_FONT_SIZE_PT = 36;
export const DEFAULT_FONT_SIZE_PT = 11;

export const MIN_ITEM_WIDTH_MM = 5;
export const MIN_ITEM_HEIGHT_MM = 4;
/** The prescription text's box, so a line always fits. */
export const MIN_TEXT_HEIGHT_MM = 20;

export const MIN_CUSTOM_WIDTH_MM = 50;
export const MAX_CUSTOM_WIDTH_MM = 420;
export const MIN_CUSTOM_HEIGHT_MM = 50;
export const MAX_CUSTOM_HEIGHT_MM = 600;

/** A5 (the default) and A4 in mm. */
export const PAGE_SIZES: Record<Exclude<PageSize, "custom">, { widthMm: number; heightMm: number }> = {
    A5: {widthMm: 148, heightMm: 210},
    A4: {widthMm: 210, heightMm: 297},
};

export const PAGE_SIZE_OPTIONS: PageSize[] = ["A5", "A4", "custom"];

export const TEMPLATE_FUNCTIONS: TemplateFunction[] = ["fullDate", "time", "dayOfWeek", "dayOfMonth", "isoDateTime", "pageNumber"];

export const TEMPLATE_KINDS: TemplateItemKind[] = ["prescriptionText", "manualInput", "function", "staticText"];

/**
 * A new item's size and, for the prescription text, its place (contract § 3.5). Every size fits the smallest custom
 * page (50 × 50 mm) and passes the minimums (TPL-216, TPL-217); `addItem` places the other kinds in a cascade.
 */
export const DEFAULT_TEXT_BOX = {xMm: 14, yMm: 80, wMm: 120, hMm: 90};
export const DEFAULT_ITEM_SIZES: Record<Exclude<TemplateItemKind, "prescriptionText">, { wMm: number; hMm: number }> = {
    manualInput: {wMm: 40, hMm: 8},
    function: {wMm: 30, hMm: 8},
    staticText: {wMm: 40, hMm: 8},
};
/** The cascade of `addItem`: the first position and the step between two new items, in mm. */
export const CASCADE_START_MM = 5;
export const CASCADE_STEP_MM = 6;

/**
 * The sheet's own font (design § 6, D15): IBM Plex Sans Arabic self-hosted under its own family name, so neither the
 * theme's font order nor Google Fonts decides what prints. Declared by `printFont.css`.
 */
export const PRINT_FONT_FAMILY = '"ClinicHub Print", sans-serif';

/** The print root, directly under `body` (design § 4.5). */
export const PRINT_ROOT_ID = "clinichub-print-root";
/** Line height of everything on a sheet, in the designer and in print: fixed, so 36 pt fits the 20 mm minimum box in any font (TPL-336). */
export const PRINT_LINE_HEIGHT = 1.4;
/** A pop-up value (design § 3). */
export const MANUAL_VALUE_MAX_LENGTH = 200;
/** How long printing waits for the print font; after that it carries on with the fallback font (design § 4.4, TPL-331). */
export const FONT_LOAD_TIMEOUT_MS = 10_000;
