import {describe, expect, test, vi} from "vitest";
import {TEMPLATE_FUNCTIONS, TEST_PRINT_SAMPLE_LINES} from "./constants.ts";
import {rulerTicks, testPrintChunk, testPrintValues} from "./testPrintSample.ts";
import type {FunctionItem, ManualInputItem, PrescriptionTextItem, PrintLayout, StaticTextItem, TemplateFunction, TemplateItem} from "./types.ts";

/*
 * The test page's sample and its rulers' numbers: step 4 design § 3, P3, P4 and contract § 3.4 with the comments of testPrintSample.ts. StrykerJS mutates
 * testPrintSample.ts against this file.
 */

const box = {xMm: 10, yMm: 10, wMm: 40, hMm: 8, fontSizePt: 11};
const text = (id = "t"): PrescriptionTextItem => ({id, kind: "prescriptionText", xMm: 14, yMm: 80, wMm: 120, hMm: 90, fontSizePt: 11});
const manual = (id: string, name: string): ManualInputItem => ({id, kind: "manualInput", name, ...box});
const fn = (id: string, fnCode: TemplateFunction, name = "اسم الوظيفة"): FunctionItem => ({id, kind: "function", function: fnCode, name, ...box});
const stat = (id: string, value: string): StaticTextItem => ({id, kind: "staticText", text: value, ...box});

const layoutOf = (...items: TemplateItem[]): PrintLayout => ({
    schemaVersion: 1,
    page: {size: "A5", widthMm: 148, heightMm: 210},
    items,
    calibration: {xMm: 0, yMm: 0},
});

/** 5 November 2026, a Thursday, at 14:30: the business file's examples. */
const THE_EXAMPLE = new Date(2026, 10, 5, 14, 30);

describe("testPrintValues: the sample of each kind @area:admin", () => {
    test("a manual input prints its name @TPL-638", () => {
        expect(testPrintValues(layoutOf(text(), manual("m", "اسم المريض")), THE_EXAMPLE).m).toBe("اسم المريض");
    });

    test.each<[TemplateFunction, string]>([
        ["fullDate", "5 نوفمبر 2026"],
        ["time", "2:30 م"],
        ["dayOfWeek", "الخميس"],
        ["dayOfMonth", "5"],
        ["isoDateTime", "2026-11-05T14:30"],
        ["pageNumber", "2/3"],
    ])("the function %s prints its real value at that time: %s, never its name @TPL-638", (code, value) => {
        expect(testPrintValues(layoutOf(text(), fn("f", code)), THE_EXAMPLE).f).toBe(value);
    });

    test("the values follow the given time @TPL-638", () => {
        const other = new Date(2027, 0, 2, 9, 5);
        const values = testPrintValues(layoutOf(text(), fn("d", "dayOfMonth"), fn("i", "isoDateTime")), other);
        expect(values.d).toBe("2");
        expect(values.i).toBe("2027-01-02T09:05");
    });

    test("no function's value is empty because of the one sheet @TPL-638", () => {
        const layout = layoutOf(text(), ...TEMPLATE_FUNCTIONS.map(code => fn(code, code)));
        const values = testPrintValues(layout, THE_EXAMPLE);
        for (const code of TEMPLATE_FUNCTIONS) expect(values[code], code).not.toBe("");
    });

    test("a static text prints as typed, line breaks and spaces kept @TPL-638", () => {
        expect(testPrintValues(layoutOf(text(), stat("s", "  سطر أول\nسطر ثان ")), THE_EXAMPLE).s).toBe("  سطر أول\nسطر ثان ");
    });

    test("the prescription text is empty here: its text is the chunk @TPL-638", () => {
        expect(testPrintValues(layoutOf(text("t1")), THE_EXAMPLE).t1).toBe("");
    });

    test("one value per item, by its id, every kind together @TPL-638", () => {
        const layout = layoutOf(text("t1"), manual("m1", "السن"), fn("f1", "pageNumber"), stat("s1", "نص ثابت"));
        expect(testPrintValues(layout, THE_EXAMPLE)).toEqual({t1: "", m1: "السن", f1: "2/3", s1: "نص ثابت"});
    });

    test("no items, no values @TPL-638", () => {
        expect(testPrintValues(layoutOf(), THE_EXAMPLE)).toEqual({});
    });
});

describe("testPrintChunk: the fixed lines, first sheet only @area:admin", () => {
    const paragraphs = (html: string) =>
        Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll("p")).map(p => p.textContent);
    const countOf = (html: string) => (html.match(/<\/p>/g) ?? []).length;

    test("the sheet holds them all: every fixed line, one paragraph each, in order @TPL-637 @TPL-638", () => {
        expect(paragraphs(testPrintChunk(() => true))).toEqual([...TEST_PRINT_SAMPLE_LINES]);
    });

    test("the fixed lines are few, and hold both directions @TPL-637 @TPL-638", () => {
        expect(TEST_PRINT_SAMPLE_LINES.length).toBeGreaterThan(1);
        expect(TEST_PRINT_SAMPLE_LINES.some(line => /[A-Za-z]/.test(line))).toBe(true);
        expect(TEST_PRINT_SAMPLE_LINES.some(line => /[؀-ۿ]/.test(line))).toBe(true);
    });

    test.each([[1], [2], [3], [5]])("a box that holds %i line(s): only the first sheet's, from the first line @TPL-637", limit => {
        const chunk = testPrintChunk(html => countOf(html) <= limit);
        expect(paragraphs(chunk)).toEqual(TEST_PRINT_SAMPLE_LINES.slice(0, limit));
    });

    test("it asks the given box, with the sample's HTML @TPL-637", () => {
        const fits = vi.fn<(html: string) => boolean>(() => true);
        testPrintChunk(fits);
        expect(fits).toHaveBeenCalled();
        expect(fits.mock.calls[0][0]).toContain(TEST_PRINT_SAMPLE_LINES[0]);
    });

    test("a box too small for one word still gets something: never an empty sheet @TPL-637", () => {
        const chunk = testPrintChunk(() => false);
        expect(chunk).not.toBe("");
        expect(TEST_PRINT_SAMPLE_LINES[0].startsWith(paragraphs(chunk)[0] ?? "\0")).toBe(true);
    });
});

describe("rulerTicks: a ruler's numbers @area:admin", () => {
    const mms = (lengthMm: number, shiftMm: number) => rulerTicks(lengthMm, shiftMm).map(tick => tick.mm);
    const last = <T>(list: T[]) => list[list.length - 1];

    test("with no shift: a tick on every mm from the corner to the sheet's end @TPL-640", () => {
        const ticks = rulerTicks(50, 0);
        expect(ticks).toHaveLength(51);
        expect(ticks.map(tick => tick.mm)).toEqual(Array.from({length: 51}, (_, mm) => mm));
        expect(ticks.map(tick => tick.atMm)).toEqual(Array.from({length: 51}, (_, mm) => mm));
    });

    test("A4's width and height run to the end @TPL-640", () => {
        expect(last(mms(210, 0))).toBe(210);
        expect(last(mms(297, 0))).toBe(297);
        expect(rulerTicks(210, 0)).toHaveLength(211);
    });

    test("longer every 5, the corner too @TPL-640", () => {
        const ticks = rulerTicks(21, 0);
        expect(ticks.filter(tick => tick.long).map(tick => tick.mm)).toEqual([0, 5, 10, 15, 20]);
    });

    test("numbered every 10 from the corner, in Latin digits; the corner has none @TPL-640", () => {
        const labels = rulerTicks(50, 0).filter(tick => tick.label !== null);
        expect(labels.map(tick => tick.mm)).toEqual([10, 20, 30, 40, 50]);
        expect(labels.map(tick => tick.label)).toEqual(["10", "20", "30", "40", "50"]);
        expect(rulerTicks(50, 0)[0].label).toBeNull();
        expect(rulerTicks(50, 0)[5].label).toBeNull();
        expect(rulerTicks(50, 0)[11].label).toBeNull();
    });

    test("one tick exactly as the type says @TPL-640", () => {
        expect(rulerTicks(50, 2)[10]).toEqual({mm: 10, atMm: 12, long: true, label: "10"});
        expect(rulerTicks(50, 2)[3]).toEqual({mm: 3, atMm: 5, long: false, label: null});
        expect(rulerTicks(50, 2)[5]).toEqual({mm: 5, atMm: 7, long: true, label: null});
    });

    test("a positive shift moves the ticks along, and the last ones past the end go @TPL-640 @TPL-635", () => {
        const ticks = rulerTicks(50, 2);
        expect(ticks[0]).toEqual({mm: 0, atMm: 2, long: true, label: null});
        expect(last(ticks)).toEqual({mm: 48, atMm: 50, long: false, label: null});
        expect(ticks).toHaveLength(49);
    });

    test("a negative shift: the first ticks off the corner go, and they still run to the sheet's end @TPL-640 @TPL-712", () => {
        const ticks = rulerTicks(50, -6);
        expect(ticks[0]).toEqual({mm: 6, atMm: 0, long: false, label: null});
        expect(last(ticks)).toEqual({mm: 56, atMm: 50, long: false, label: null});
        expect(ticks).toHaveLength(51);
        // A number keeps its count from the corner: 10 is drawn at 4
        expect(ticks.find(tick => tick.mm === 10)).toEqual({mm: 10, atMm: 4, long: true, label: "10"});
    });

    test.each([
        [-20, 20],
        [20, 0],
        [-6.5, 7],
    ])("every tick lies on the sheet at a shift of %d @TPL-640 @TPL-712", (shift, firstMm) => {
        const ticks = rulerTicks(148, shift);
        expect(ticks[0].mm).toBe(firstMm);
        for (const tick of ticks) {
            expect(tick.atMm).toBeGreaterThanOrEqual(0);
            expect(tick.atMm).toBeLessThanOrEqual(148);
        }
    });

    test("whole tenths: 1 + 0.3 is 1.3, not 1.3000000000000000x, and 0.1 + 0.2 lands on 0.3 @TPL-640", () => {
        expect(rulerTicks(50, 0.3)[1].atMm).toBe(1.3);
        expect(rulerTicks(50, 1.1)[2].atMm).toBe(3.1);
        expect(rulerTicks(50, 0.7)[3].atMm).toBe(3.7);
        expect(rulerTicks(50, -1.5)[0]).toEqual({mm: 2, atMm: 0.5, long: false, label: null});
    });

    test("the end is compared in whole tenths: on a sheet 210.1 wide, a shift of 1.1 keeps 209 @TPL-640", () => {
        const ticks = rulerTicks(210.1, 1.1);
        expect(last(ticks)).toEqual({mm: 209, atMm: 210.1, long: false, label: null});
    });

    test("a sheet of a fraction stops at the last whole mm on it @TPL-640", () => {
        expect(last(mms(50.5, 0))).toBe(50);
        expect(last(mms(50.5, 0.5))).toBe(50);
        expect(last(mms(50.5, 0.6))).toBe(49);
    });
});
