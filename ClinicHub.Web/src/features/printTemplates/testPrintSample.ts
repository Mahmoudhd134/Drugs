import type {PrintLayout} from "./types.ts";

/*
 * The test page's sample and its rulers' numbers (step 4 design § 3, P3, P4). Pure. StrykerJS mutates this file (PURE_LOGIC).
 * **Stubs (T1: frontend)**: the signatures and rules below are the contract's.
 */

/**
 * Each short item's value on the test page, by item id, for `PrintJob.test.values` (P3, TPL-638, TPL-707): a manual input its name; a function
 * its real value at `now`, through `functionValue` with `page: TEST_PRINT_PAGE`, `pages: TEST_PRINT_PAGES`, so a page number is `2/3`, whatever the job's
 * one sheet; a static text as typed; the prescription text `""` (its text is the chunk). No value is ever empty because of the single sheet.
 */
export const testPrintValues: (layout: PrintLayout, now: Date) => Readonly<Record<string, string>> = () => ({});

/**
 * The prescription text's sample for one sheet (design § 3, TPL-637): `TEST_PRINT_SAMPLE_LINES`, one paragraph each, through `cleanPrintHtml` and
 * `paginate` with `fits`, and only the first sheet's chunk. So a 20 mm box at 36 pt still prints one page.
 */
export const testPrintChunk: (fits: (html: string) => boolean) => string = () => "";

/** One tick of a ruler. */
export type RulerTick = {
    /** Its number counted from the sheet's corner with no correction: a whole mm, 0 and up */
    mm: number;
    /** Where it's drawn along the ruler, in mm from the sheet's corner: `mm` + the shift, by whole tenths */
    atMm: number;
    /** Every `RULER_LONG_TICK_EVERY_MM`, 0 included */
    long: boolean;
    /** Latin digits every `RULER_LABEL_EVERY_MM`: `"10"`, `"20"`…; null on the others and on 0, the corner */
    label: string | null;
};

/**
 * A ruler's ticks (P4, TPL-640), in order: every whole `mm` >= 0 whose `atMm` = `mm` + `shiftMm` lies in [0, `lengthMm`], so they run to the sheet's end
 * whatever the shift. `lengthMm` is the sheet's width with X as the shift for the top ruler, its height with Y for the left one.
 */
export const rulerTicks: (lengthMm: number, shiftMm: number) => RulerTick[] = () => [];
