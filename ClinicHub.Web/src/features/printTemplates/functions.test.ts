import {describe, expect, test, vi} from "vitest";
import i18n from "../../i18n";
import {aTemplateItem} from "../../test";
import {functionValue, isLeftToRightValue, itemValue, type PrintContext} from "./functions.ts";
import {TEMPLATE_FUNCTIONS} from "./constants.ts";
import type {TemplateFunction} from "./types.ts";

// Function values: contract § 2.2 and the business file's items table: the computer's local time, Arabic with Latin digits,
// whatever the UI language or the browser's locale, character for character.

const at = (year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0) =>
    new Date(year, month - 1, day, hours, minutes, seconds);

/** 5 November 2026, a Thursday, at 14:30: the business file's examples. */
const THE_EXAMPLE = at(2026, 11, 5, 14, 30);

const value = (fn: TemplateFunction, now: Date, page = 1, pages = 1) => functionValue(fn, {now, page, pages});

const context = (fields: Partial<PrintContext> = {}): PrintContext => ({manualValues: {}, now: THE_EXAMPLE, page: 1, pages: 1, ...fields});

describe("function values @area:prescription", () => {
    test("the business file's examples @TPL-127 @smoke", () => {
        expect(value("fullDate", THE_EXAMPLE)).toBe("5 نوفمبر 2026");
        expect(value("time", THE_EXAMPLE)).toBe("2:30 م");
        expect(value("dayOfWeek", THE_EXAMPLE)).toBe("الخميس");
        expect(value("dayOfMonth", THE_EXAMPLE)).toBe("5");
        expect(value("isoDateTime", THE_EXAMPLE)).toBe("2026-11-05T14:30");
        expect(value("pageNumber", THE_EXAMPLE, 2, 3)).toBe("2/3");
    });

    test.each([
        [1, "يناير"], [2, "فبراير"], [3, "مارس"], [4, "أبريل"], [5, "مايو"], [6, "يونيو"],
        [7, "يوليو"], [8, "أغسطس"], [9, "سبتمبر"], [10, "أكتوبر"], [11, "نوفمبر"], [12, "ديسمبر"],
    ])("the full date of month %i: «%s» @TPL-127", (month, name) => {
        expect(value("fullDate", at(2027, month, 15))).toBe(`15 ${name} 2027`);
    });

    test("the full date: a one-digit day has no padding @TPL-127", () => {
        expect(value("fullDate", at(2026, 1, 1))).toBe("1 يناير 2026");
        expect(value("fullDate", at(2026, 12, 31))).toBe("31 ديسمبر 2026");
    });

    test.each([
        [0, 0, "12:00 ص"],
        [0, 1, "12:01 ص"],
        [1, 0, "1:00 ص"],
        [9, 5, "9:05 ص"],
        [11, 59, "11:59 ص"],
        [12, 0, "12:00 م"],
        [12, 30, "12:30 م"],
        [13, 0, "1:00 م"],
        [14, 30, "2:30 م"],
        [23, 59, "11:59 م"],
    ])("the time at %i:%i: «%s», 12 at midnight and noon, minutes padded, one plain space @TPL-127", (hours, minutes, expected) => {
        expect(value("time", at(2026, 11, 5, hours, minutes))).toBe(expected);
    });

    test.each([
        [1, "الأحد"], [2, "الاثنين"], [3, "الثلاثاء"], [4, "الأربعاء"], [5, "الخميس"], [6, "الجمعة"], [7, "السبت"],
    ])("the day of the week on November %i, 2026: «%s» @TPL-127", (day, name) => {
        expect(value("dayOfWeek", at(2026, 11, day))).toBe(name);
    });

    test.each([[1, "1"], [5, "5"], [10, "10"], [31, "31"]])("the day of the month %i has no padding @TPL-127", (day, expected) => {
        expect(value("dayOfMonth", at(2026, 12, day))).toBe(expected);
    });

    test.each([
        [at(2026, 11, 5, 14, 30), "2026-11-05T14:30"],
        [at(2026, 1, 2, 3, 4), "2026-01-02T03:04"],
        [at(2026, 12, 31, 23, 59), "2026-12-31T23:59"],
        [at(2026, 11, 5, 0, 0), "2026-11-05T00:00"],
        [at(2026, 11, 5, 12, 0), "2026-11-05T12:00"],
        [at(2026, 10, 10, 10, 10), "2026-10-10T10:10"],
    ])("the ISO value of %s: 24 hours, padded, no seconds, no zone @TPL-127", (now, expected) => {
        expect(value("isoDateTime", now)).toBe(expected);
    });

    test("the ISO value leaves the seconds out @TPL-127", () => {
        expect(value("isoDateTime", at(2026, 11, 5, 14, 30, 59))).toBe("2026-11-05T14:30");
    });

    test.each([
        [1, 1, ""],
        [1, 2, "1/2"],
        [2, 2, "2/2"],
        [2, 3, "2/3"],
        [10, 120, "10/120"],
        [120, 120, "120/120"],
    ])("page %i of %i: «%s»; nothing when the prescription is one page @TPL-127", (page, pages, expected) => {
        expect(value("pageNumber", THE_EXAMPLE, page, pages)).toBe(expected);
    });

    test("the computer's local time: nothing reads the UTC fields @TPL-127", () => {
        const now = at(2026, 11, 5, 14, 30);
        for (const getter of ["getUTCFullYear", "getUTCMonth", "getUTCDate", "getUTCDay", "getUTCHours", "getUTCMinutes", "toISOString", "toJSON"] as const) {
            Object.defineProperty(now, getter, {
                value: () => {
                    throw new Error(`${getter} is not the local time`);
                },
            });
        }
        expect(TEMPLATE_FUNCTIONS.map(fn => value(fn, now, 2, 3)))
            .toEqual(["5 نوفمبر 2026", "2:30 م", "الخميس", "5", "2026-11-05T14:30", "2/3"]);
    });
});

describe("function values, whatever the language or locale @area:prescription", () => {
    /** Every value of a frozen clock, with a Friday, midnight and a one-digit day. */
    const everyValue = () => {
        const friday = at(2026, 11, 6, 0, 1);
        return TEMPLATE_FUNCTIONS.map(fn => value(fn, friday, 2, 3));
    };
    const EXPECTED = ["6 نوفمبر 2026", "12:01 ص", "الجمعة", "6", "2026-11-06T00:01", "2/3"];

    test.each(["ar", "en"])("the UI in %s gives the same Arabic with Latin digits @TPL-127", async lang => {
        await i18n.changeLanguage(lang);
        expect(everyValue()).toEqual(EXPECTED);
    });

    /** The browser's locale, as `Intl` and `toLocale…` would use it by default. */
    const inBrowserLocale = (locale: string) => {
        vi.spyOn(navigator, "language", "get").mockReturnValue(locale);
        vi.spyOn(navigator, "languages", "get").mockReturnValue([locale]);
        const dateTimeFormat = vi.spyOn(Intl, "DateTimeFormat");
        const {toLocaleDateString, toLocaleTimeString, toLocaleString} = Date.prototype;
        const toLocale = [
            vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (this: Date, _locales, options) {
                return toLocaleDateString.call(this, locale, options);
            }),
            vi.spyOn(Date.prototype, "toLocaleTimeString").mockImplementation(function (this: Date, _locales, options) {
                return toLocaleTimeString.call(this, locale, options);
            }),
            vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (this: Date, _locales, options) {
                return toLocaleString.call(this, locale, options);
            }),
        ];
        return {dateTimeFormat, toLocale};
    };

    test.each(["en-US", "fr-FR", "ar-SA"])("the browser in %s: Gregorian, Latin digits, each string as the design's, never `Intl` @TPL-317", locale => {
        const {dateTimeFormat, toLocale} = inBrowserLocale(locale);

        expect(everyValue()).toEqual(EXPECTED);

        expect(dateTimeFormat).not.toHaveBeenCalled();
        for (const spy of toLocale) expect(spy).not.toHaveBeenCalled();
    });

    test("no invisible mark and no Arabic-Indic digit in any value @TPL-317", () => {
        for (const text of everyValue()) {
            expect(text, text).not.toMatch(/[\u200E\u200F\u202F\u00A0\u061C\u0660-\u0669\u06F0-\u06F9]/u);
        }
    });

    test("the time holds one plain space (U+0020) before the ص or م @TPL-317", () => {
        expect([...value("time", at(2026, 11, 5, 14, 30))].map(c => c.codePointAt(0)))
            .toEqual([0x32, 0x3A, 0x33, 0x30, 0x20, 0x645]);
        expect([...value("time", at(2026, 11, 5, 0, 1))].map(c => c.codePointAt(0)))
            .toEqual([0x31, 0x32, 0x3A, 0x30, 0x31, 0x20, 0x635]);
    });
});

describe("what a short item prints @area:prescription", () => {
    test("a manual input: its value; empty or missing: blank @TPL-127", () => {
        const item = aTemplateItem("manualInput", {id: "m1"});
        expect(itemValue(item, context({manualValues: {m1: "أحمد"}}))).toBe("أحمد");
        expect(itemValue(item, context({manualValues: {m1: ""}}))).toBe("");
        expect(itemValue(item, context({manualValues: {other: "أحمد"}}))).toBe("");
    });

    test("a manual input's value isn't altered here: HTML stays as text @TPL-127", () => {
        const item = aTemplateItem("manualInput", {id: "m1"});
        expect(itemValue(item, context({manualValues: {m1: "<b>x</b>"}}))).toBe("<b>x</b>");
    });

    test("a function: its value on this sheet, never its name @TPL-127", () => {
        const date = aTemplateItem("function", {function: "fullDate", name: "اسم الدالة"});
        const pageNumber = aTemplateItem("function", {function: "pageNumber", name: "اسم الرقم"});
        expect(itemValue(date, context())).toBe("5 نوفمبر 2026");
        expect(itemValue(pageNumber, context({page: 3, pages: 4}))).toBe("3/4");
        expect(itemValue(pageNumber, context({page: 1, pages: 1}))).toBe("");
    });

    test("static text: as typed, line breaks and spaces kept @TPL-127", () => {
        const item = aTemplateItem("staticText", {text: " سطر أول\nسطر ثان "});
        expect(itemValue(item, context())).toBe(" سطر أول\nسطر ثان ");
    });

    test("the prescription text has no value here @TPL-127", () => {
        expect(itemValue(aTemplateItem("prescriptionText"), context())).toBe("");
    });

    test.each([
        ["fullDate", false], ["time", false], ["dayOfWeek", false], ["dayOfMonth", false], ["isoDateTime", true], ["pageNumber", true],
    ] as const)("%s reads left to right: %s @TPL-127", (fn, expected) => {
        expect(isLeftToRightValue(fn)).toBe(expected);
    });
});
