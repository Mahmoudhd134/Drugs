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

/** The printer's correction, X and Y, from minus this to this, in steps of 0.1 (step 4 design A5). */
export const MAX_CALIBRATION_MM = 20;

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

/** 1 mm in CSS px at 100% zoom. */
export const CSS_PX_PER_MM = 96 / 25.4;

/** Drag (step 3 contract § 2.3): a movement counts past this many px, in a straight line. */
export const DRAG_THRESHOLD_PX = 4;
/** A guide line sticks within this many mm, inclusive. */
export const GUIDE_REACH_MM = 1;
/** A handle's target on screen, at any zoom. */
export const HANDLE_SIZE_PX = 8;
/** Corners only when both sides are below this many px on screen. */
export const SMALL_BOX_PX = 36;

/** Zoom, in percent: minus and plus stay in `ZOOM_MIN`–`ZOOM_MAX`, by `ZOOM_STEP`; Fit alone may go down to `FIT_MIN_ZOOM`. */
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 25;
export const FIT_MIN_ZOOM = 25;

/** A drag within this many px of the area's edge scrolls it, by `AUTO_SCROLL_PX_PER_FRAME` each animation frame. */
export const AUTO_SCROLL_BAND_PX = 24;
export const AUTO_SCROLL_PX_PER_FRAME = 8;

/** Undo: the last steps kept, and the pause that ends a run of nudges. */
export const HISTORY_LIMIT = 50;
export const NUDGE_RUN_MS = 1000;

/** The sheet area's padding on each side, and what it keeps from the window's bottom, in px: the page's bottom padding from 900 px up (`AppShell`), so the page gets no scrollbar of its own (TPL-592). */
export const AREA_PADDING_PX = 16;
export const AREA_BOTTOM_GAP_PX = 24;
/** The area never gets shorter than this, on a window too low for the page's header. */
export const AREA_MIN_HEIGHT_PX = 240;

/**
 * Test print's rulers (step 4 design § 3, P4), in mm: a line this far in from the top edge and from the left, across the whole sheet. A tick
 * every `RULER_TICK_EVERY_MM`, longer every `RULER_LONG_TICK_EVERY_MM`, a Latin number every `RULER_LABEL_EVERY_MM`. Ticks grow from the line
 * away from the edge.
 */
export const RULER_INSET_MM = 6;
export const RULER_TICK_EVERY_MM = 1;
export const RULER_LONG_TICK_EVERY_MM = 5;
export const RULER_LABEL_EVERY_MM = 10;
export const RULER_TICK_LENGTH_MM = 1.5;
export const RULER_LONG_TICK_LENGTH_MM = 3;
export const RULER_STROKE_MM = 0.2;
export const RULER_LABEL_SIZE_MM = 2.5;
/** Test print's frame around each box: a real border, on an empty child, so the box's text doesn't move (step 4 design § 3). */
export const TEST_PRINT_FRAME_BORDER = "0.2mm solid #000";
/** What a page number prints on the test page (P3), whatever its one sheet. */
export const TEST_PRINT_PAGE = 2;
export const TEST_PRINT_PAGES = 3;
/** The prescription text's fixed sample on the test page (P3): both directions, real-looking widths, the same in both UI languages. */
export const TEST_PRINT_SAMPLE_LINES = [
    "Augmentin 1 g tablets",
    "قرص كل 12 ساعة لمدة 5 أيام",
    "Panadol 500 mg tablets",
    "قرص عند اللزوم، بحد أقصى 4 أقراص في اليوم",
    "Vigamox 0.5% eye drops",
    "نقطة في العين اليمنى 4 مرات يوميًا",
] as const;

/** The paper image's opacity in percent (step 4 design A11, § 3): screen only, never saved, back to the default each opening. */
export const PAPER_OPACITY_DEFAULT = 50;
export const PAPER_OPACITY_MIN = 10;
export const PAPER_OPACITY_MAX = 100;
export const PAPER_OPACITY_STEP = 10;
