import {
    RULER_LABEL_EVERY_MM,
    RULER_LONG_TICK_EVERY_MM,
    RULER_TICK_EVERY_MM,
    TEST_PRINT_PAGE,
    TEST_PRINT_PAGES,
    TEST_PRINT_SAMPLE_LINES,
} from "./constants.ts";
import {itemValue} from "./functions.ts";
import {toTenths} from "./layout.ts";
import {paginate} from "./pagination.ts";
import {cleanPrintHtml} from "./printHtml.ts";
import type {PrintLayout} from "./types.ts";

/*
 * The test page's sample and its rulers' numbers (step 4 design § 3, P3, P4). Pure. StrykerJS mutates this file (PURE_LOGIC).
 */

/**
 * Each short item's value on the test page, by item id, for `PrintJob.test.values` (P3, TPL-638, TPL-707): a manual input its name; a function
 * its real value at `now`, through `functionValue` with `page: TEST_PRINT_PAGE`, `pages: TEST_PRINT_PAGES`, so a page number is `2/3`, whatever the job's
 * one sheet; a static text as typed; the prescription text `""` (its text is the chunk). No value is ever empty because of the single sheet.
 */
export const testPrintValues = (layout: PrintLayout, now: Date): Readonly<Record<string, string>> => {
    const context = {manualValues: {}, now, page: TEST_PRINT_PAGE, pages: TEST_PRINT_PAGES};
    return Object.fromEntries(layout.items.map(item =>
        [item.id, item.kind === "manualInput" ? item.name : itemValue(item, context)]));
};

/**
 * The prescription text's sample for one sheet (design § 3, TPL-637): `TEST_PRINT_SAMPLE_LINES`, one paragraph each, through `cleanPrintHtml` and
 * `paginate` with `fits`, and only the first sheet's chunk. So a 20 mm box at 36 pt still prints one page.
 */
export const testPrintChunk = (fits: (html: string) => boolean): string => {
    const sample = TEST_PRINT_SAMPLE_LINES.map(line => `<p>${line}</p>`).join("");
    return paginate(cleanPrintHtml(sample), fits)[0];
};

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
export const rulerTicks = (lengthMm: number, shiftMm: number): RulerTick[] => {
    const length = toTenths(lengthMm);
    const shift = toTenths(shiftMm);
    const ticks: RulerTick[] = [];
    // A negative shift pushes the first ticks past the corner: the first drawn is the first whole mm at or after it
    for (let mm = Math.max(0, Math.ceil(-shift / 10)); mm * 10 + shift <= length; mm += RULER_TICK_EVERY_MM) {
        ticks.push({
            mm,
            atMm: (mm * 10 + shift) / 10,
            long: mm % RULER_LONG_TICK_EVERY_MM === 0,
            label: mm > 0 && mm % RULER_LABEL_EVERY_MM === 0 ? String(mm) : null,
        });
    }
    return ticks;
};
