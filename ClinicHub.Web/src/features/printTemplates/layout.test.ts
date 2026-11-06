import {describe, expect, test} from "vitest";
import {
    addItem,
    applyPageSize,
    canAddItem,
    formatMm,
    itemIndexOfField,
    newLayout,
    normalizeLayout,
    pageOfSize,
    parseMmInput,
    removeItem,
    roundTenth,
    sameLayout,
    toTenths,
    updateItem,
    validateLayout,
} from "./layout.ts";
import type {AddableItem, FunctionItem, ManualInputItem, PrescriptionTextItem, PrintLayout, StaticTextItem, TemplateFunction, TemplateItem, TemplatePage} from "./types.ts";

/*
 * The designer's pure rules, from contract § 1.3, § 1.4, § 2.2 and § 3.5. StrykerJS mutates layout.ts against this file, so
 * it carries its own rows (the shared fixture's run, layout.parity.test.ts, reads a file outside ClinicHub.Web).
 */

const A5: TemplatePage = {size: "A5", widthMm: 148, heightMm: 210};
const A4: TemplatePage = {size: "A4", widthMm: 210, heightMm: 297};
const custom = (widthMm: number, heightMm: number): TemplatePage => ({size: "custom", widthMm, heightMm});

const text = (fields: Partial<PrescriptionTextItem> = {}): PrescriptionTextItem =>
    ({id: "t", kind: "prescriptionText", xMm: 14, yMm: 80, wMm: 120, hMm: 90, fontSizePt: 11, ...fields});
const manual = (fields: Partial<ManualInputItem> = {}): ManualInputItem =>
    ({id: "m", kind: "manualInput", name: "الاسم", xMm: 58, yMm: 46, wMm: 72, hMm: 8, fontSizePt: 11, ...fields});
const fn = (fields: Partial<FunctionItem> = {}): FunctionItem =>
    ({id: "f", kind: "function", function: "fullDate", name: "التاريخ", xMm: 14, yMm: 46, wMm: 30, hMm: 8, fontSizePt: 11, ...fields});
const stat = (fields: Partial<StaticTextItem> = {}): StaticTextItem =>
    ({id: "s", kind: "staticText", text: "يُصرف مرة واحدة", xMm: 14, yMm: 175, wMm: 60, hMm: 8, fontSizePt: 10, ...fields});

const layoutOf = (...items: TemplateItem[]): PrintLayout => ({schemaVersion: 1, page: A5, items, calibration: {xMm: 0, yMm: 0}});
const onPage = (page: TemplatePage, ...items: TemplateItem[]): PrintLayout => ({schemaVersion: 1, page, items, calibration: {xMm: 0, yMm: 0}});
/** Something the API could hold but the types don't: validation takes it at run time (contract § 1.2, § 1.4). */
const raw = (layout: unknown) => layout as PrintLayout;
/** `count` valid items: the prescription text and manual inputs of distinct names. */
const manyItems = (count: number): TemplateItem[] => [
    text({id: "i1"}),
    ...Array.from({length: count - 1}, (_, n) => manual({id: `i${n + 2}`, name: `Field ${n}`})),
];

const repeat = (length: number) => "ن".repeat(length);

describe("roundTenth: one decimal, midpoint away from zero @area:admin", () => {
    test.each([
        [12.34, 12.3],
        [12.35, 12.4],
        [-12.35, -12.4],
        [-12.34, -12.3],
        [0.05, 0.1],
        [0.04, 0],
        [148, 148],
        [209.95, 210],
        [1.45, 1.5],
        [36.05, 36.1],
        [36.04, 36],
        [4.95, 5],
        [4.94, 4.9],
        [28.05, 28.1],
    ])("%d is %d, the same as the server's rounding @TPL-209", (value, rounded) => {
        expect(roundTenth(value)).toBe(rounded);
    });

    test("the result is written with one decimal in the request: 12.35 is 12.4, not 12.400000000000002 @TPL-209", () => {
        expect(JSON.stringify({xMm: roundTenth(12.35)})).toBe('{"xMm":12.4}');
        expect(JSON.stringify({xMm: roundTenth(209.84)})).toBe('{"xMm":209.8}');
    });
});

describe("toTenths: comparisons and sums in whole tenths @area:admin", () => {
    test.each([
        [12.34, 123],
        [12.35, 124],
        [0.3, 3],
        [209.8, 2098],
        [210.1, 2101],
        [-12.35, -124],
        [148, 1480],
    ])("%d is %d tenths @TPL-210", (value, tenths) => {
        expect(toTenths(value)).toBe(tenths);
    });

    test("0.3 + 209.8, past 210.1 as doubles, is exactly 210.1 in tenths @TPL-210", () => {
        expect(0.3 + 209.8).toBeGreaterThan(210.1);
        expect(toTenths(0.3) + toTenths(209.8)).toBe(toTenths(210.1));
    });
});

describe("parseMmInput: what a number field holds @area:admin", () => {
    test.each([
        ["12.5", 12.5],
        ["12,5", 12.5],
        ["١٢٫٥", 12.5],
        ["١٢,٥", 12.5],
        ["١٢.٥", 12.5],
        ["12٫5", 12.5],
        ["۱۲٫۵", 12.5],
        ["٠", 0],
        ["٩", 9],
        ["۰", 0],
        ["۹", 9],
        ["0", 0],
        ["12", 12],
        ["148", 148],
        [".5", 0.5],
        ["5.", 5],
        ["٫٥", 0.5],
        ["5٫", 5],
        ["-3", -3],
        ["-٣", -3],
        ["-1.5", -1.5],
        ["-.5", -0.5],
        ["  12.5  ", 12.5],
        ["‎12.5‏", 12.5],
        ["؜12.5", 12.5],
        ["12.5؜", 12.5],
        ["‏  ١٢٫٥ ‎", 12.5],
    ])("%j is %d, never 125 or 0 @TPL-225", (input, value) => {
        expect(parseMmInput(input)).toBe(value);
    });

    test.each([
        ["12.34", 12.3],
        ["12.35", 12.4],
        ["١٢٫٣٤", 12.3],
        ["-12.35", -12.4],
    ])("%j is rounded to %d @TPL-209", (input, value) => {
        expect(parseMmInput(input)).toBe(value);
    });

    test.each([
        [""],
        ["   "],
        ["‎"],
        ["abc"],
        ["12a"],
        ["a12"],
        ["1.2.3"],
        ["1,2,3"],
        ["1.2,3"],
        ["١٫٢٫٣"],
        ["1e3"],
        ["٫"],
        ["."],
        [","],
        ["-"],
        ["--1"],
        ["1-"],
        ["+1"],
        ["-."],
    ])("%j is not a number @TPL-224 @TPL-225", input => {
        expect(parseMmInput(input)).toBeNull();
    });
});

describe("formatMm: a number as its field shows it @area:admin", () => {
    test.each([
        [12.5, "12.5"],
        [148, "148"],
        [12.34, "12.3"],
        [12.35, "12.4"],
        [209.95, "210"],
        [0, "0"],
        [-3, "-3"],
        [0.1, "0.1"],
    ])("%d shows as %s: Latin digits, a dot, at most one decimal @TPL-225", (value, shown) => {
        expect(formatMm(value)).toBe(shown);
    });

    test.each([
        [1e21, /^\d{22}$/],
        [1e26, /^\d{27}$/],
        [-1e26, /^-\d{27}$/],
    ])("%d is written in plain digits, never an exponent, and reads back as the same number @TPL-252", (value, shown) => {
        expect(formatMm(value)).toMatch(shown);
        expect(parseMmInput(formatMm(value))).toBe(value);
    });
});

describe("normalizeLayout: what is validated, compared and sent @area:admin", () => {
    test("every number rounded, names trimmed, a static text as typed, the order kept @TPL-209", () => {
        const layout: PrintLayout = onPage(custom(210.14, 148.05),
            stat({id: "s", text: "  سطر\r\nثان  ", xMm: 1.04, yMm: 2.05, wMm: 40.04, hMm: 8.05, fontSizePt: 10.04}),
            manual({id: "m", name: "  الاسم \t", xMm: 12.34, yMm: 12.35, wMm: 50.15, hMm: 8.25, fontSizePt: 11.05}),
            text({id: "t", xMm: 14.04, yMm: 80.05, wMm: 120.04, hMm: 90.05, fontSizePt: 11.04}),
            fn({id: "f", name: " التاريخ ", function: "time", xMm: 0.05, yMm: 0.04, wMm: 30, hMm: 8, fontSizePt: 11}));

        expect(normalizeLayout(layout)).toEqual(onPage(custom(210.1, 148.1),
            stat({id: "s", text: "  سطر\r\nثان  ", xMm: 1, yMm: 2.1, wMm: 40, hMm: 8.1, fontSizePt: 10}),
            manual({id: "m", name: "الاسم", xMm: 12.3, yMm: 12.4, wMm: 50.2, hMm: 8.3, fontSizePt: 11.1}),
            text({id: "t", xMm: 14, yMm: 80.1, wMm: 120, hMm: 90.1, fontSizePt: 11}),
            fn({id: "f", name: "التاريخ", function: "time", xMm: 0.1, yMm: 0, wMm: 30, hMm: 8, fontSizePt: 11})));
    });

    test("the layout given isn't changed (it is the screen's draft) @TPL-242", () => {
        const layout = layoutOf(text(), manual({name: " الاسم ", xMm: 12.34}));
        normalizeLayout(layout);
        expect(layout.items[1]).toEqual(manual({name: " الاسم ", xMm: 12.34}));
    });
});

describe("validateLayout: rule by rule, in the server's order @area:admin", () => {
    const valid = () => layoutOf(text(), manual(), fn(), stat());

    test("layout L and every kind together are valid @TPL-048", () => {
        expect(validateLayout(valid())).toEqual([]);
    });

    describe("rule 1: the schema version", () => {
        test.each([[2], [0], [undefined], [null]])("%s is refused with templateLayoutInvalid @TPL-021", schemaVersion => {
            expect(validateLayout(raw({...valid(), schemaVersion}))).toEqual([{field: "schemaVersion", code: "templateLayoutInvalid"}]);
        });
    });

    describe("rules 2-5: the page", () => {
        test("no page: invalidRequest, and nothing can be outside it @TPL-023", () => {
            expect(validateLayout(raw({schemaVersion: 1, page: null, items: [text({xMm: 9999})]})))
                .toEqual([{field: "page", code: "invalidRequest"}]);
        });

        test.each([["A3"], ["a5"], ["Custom"], [""], [null]])("the size %j: only templatePageInvalid on the size @TPL-023", size => {
            expect(validateLayout(raw({schemaVersion: 1, page: {size, widthMm: null, heightMm: 1}, items: [text()]})))
                .toEqual([{field: "page.size", code: "templatePageInvalid"}]);
        });

        test.each([
            [A5],
            [A4],
            [custom(50, 50)],
            [custom(420, 600)],
            [custom(50, 600)],
            [custom(420, 50)],
            [custom(123.4, 321.5)],
        ])("%j passes @TPL-023", page => {
            expect(validateLayout(onPage(page, text({xMm: 0, yMm: 0, wMm: 50, hMm: 50})))).toEqual([]);
        });

        test.each([
            ["A5 149 wide", {size: "A5", widthMm: 149, heightMm: 210}, ["page.widthMm"]],
            ["A5 147.9 wide", {size: "A5", widthMm: 147.9, heightMm: 210}, ["page.widthMm"]],
            ["A5 211 high", {size: "A5", widthMm: 148, heightMm: 211}, ["page.heightMm"]],
            ["A5 209.9 high", {size: "A5", widthMm: 148, heightMm: 209.9}, ["page.heightMm"]],
            ["A5 on its side", {size: "A5", widthMm: 210, heightMm: 148}, ["page.widthMm", "page.heightMm"]],
            ["A4 with A5's measures", {size: "A4", widthMm: 148, heightMm: 210}, ["page.widthMm", "page.heightMm"]],
            ["A4 211 wide", {size: "A4", widthMm: 211, heightMm: 297}, ["page.widthMm"]],
            ["A4 298 high", {size: "A4", widthMm: 210, heightMm: 298}, ["page.heightMm"]],
            ["custom 49.9 wide", custom(49.9, 100), ["page.widthMm"]],
            ["custom 420.1 wide", custom(420.1, 100), ["page.widthMm"]],
            ["custom 49.9 high", custom(100, 49.9), ["page.heightMm"]],
            ["custom 600.1 high", custom(100, 600.1), ["page.heightMm"]],
            ["custom, both out", custom(49, 601), ["page.widthMm", "page.heightMm"]],
        ])("%s: templatePageInvalid, width first @TPL-023", (_name, page, fields) => {
            expect(validateLayout(raw({schemaVersion: 1, page, items: [text({xMm: 0, yMm: 0, wMm: 5, hMm: 20})]})))
                .toEqual(fields.map(field => ({field, code: "templatePageInvalid"})));
        });

        test("the page is rounded first: A5 148.04 wide passes, 148.05 is 148.1 and doesn't @TPL-209", () => {
            expect(validateLayout(onPage({...A5, widthMm: 148.04}, text()))).toEqual([]);
            expect(validateLayout(onPage({...A5, widthMm: 148.05}, text()))).toEqual([{field: "page.widthMm", code: "templatePageInvalid"}]);
        });

        test.each([
            [{size: "A5", widthMm: null, heightMm: 210}, ["page.widthMm"]],
            [{size: "A5", widthMm: 148, heightMm: null}, ["page.heightMm"]],
            [{size: "custom", widthMm: null, heightMm: null}, ["page.widthMm", "page.heightMm"]],
        ])("a missing measure of %j: invalidRequest naming it, never 0 @TPL-023", (page, fields) => {
            expect(validateLayout(raw({schemaVersion: 1, page, items: [text({xMm: 0, yMm: 0, wMm: 5, hMm: 20})]})))
                .toEqual(fields.map(field => ({field, code: "invalidRequest"})));
        });

        test("a page that fails skips the outside checks, not the sizes or fonts @TPL-023", () => {
            expect(validateLayout(onPage({...A5, widthMm: 149}, text({xMm: 9999, wMm: 4, fontSizePt: 5})))).toEqual([
                {field: "page.widthMm", code: "templatePageInvalid"},
                {field: "items[0].wMm", code: "templateItemSizeInvalid"},
                {field: "items[0].fontSizePt", code: "templateFontSizeInvalid"},
            ]);
        });
    });

    describe("rule 6: at most 50 items", () => {
        test("50 pass @TPL-031", () => {
            expect(validateLayout(layoutOf(...manyItems(50)))).toEqual([]);
        });

        test("51: only templateTooManyItems, no item rule and no text count @TPL-031", () => {
            const items = manyItems(51).map(item => ({...item, xMm: -1}));
            expect(validateLayout(layoutOf(...items))).toEqual([{field: "items", code: "templateTooManyItems"}]);
            const noText = Array.from({length: 51}, (_, n) => manual({id: `i${n}`, name: `Field ${n}`}));
            expect(validateLayout(layoutOf(...noText))).toEqual([{field: "items", code: "templateTooManyItems"}]);
        });

        test("51 still reports the schema version and the page first @TPL-031", () => {
            expect(validateLayout(raw({schemaVersion: 2, page: {...A5, heightMm: 1}, items: manyItems(51)}))).toEqual([
                {field: "schemaVersion", code: "templateLayoutInvalid"},
                {field: "page.heightMm", code: "templatePageInvalid"},
                {field: "items", code: "templateTooManyItems"},
            ]);
        });
    });

    describe("rule 7: the prescription text exactly once", () => {
        test("none: templateTextCount @TPL-020", () => {
            expect(validateLayout(layoutOf(manual()))).toEqual([{field: "items", code: "templateTextCount"}]);
        });

        test("two: templateTextCount, and each is still checked @TPL-020", () => {
            expect(validateLayout(layoutOf(text({id: "a"}), text({id: "b", hMm: 19.9})))).toEqual([
                {field: "items", code: "templateTextCount"},
                {field: "items[1].hMm", code: "templateItemSizeInvalid"},
            ]);
        });

        test.each([[[]], [null], [undefined]])("items %j: templateTextCount @TPL-214", items => {
            expect(validateLayout(raw({schemaVersion: 1, page: A5, items}))).toEqual([{field: "items", code: "templateTextCount"}]);
        });
    });

    describe("rule 8: a null element", () => {
        test("templateLayoutInvalid on it, nothing else for it @TPL-021", () => {
            expect(validateLayout(raw({schemaVersion: 1, page: A5, items: [text(), null, manual()]})))
                .toEqual([{field: "items[1]", code: "templateLayoutInvalid"}]);
        });

        test("it isn't a prescription text @TPL-020", () => {
            expect(validateLayout(raw({schemaVersion: 1, page: A5, items: [null]}))).toEqual([
                {field: "items", code: "templateTextCount"},
                {field: "items[0]", code: "templateLayoutInvalid"},
            ]);
        });
    });

    describe("rule 8a: the id", () => {
        test.each([
            ["a letter", "a"],
            ["letters, digits, _ and -", "aZ_9-b"],
            ["40 characters", "i".repeat(40)],
        ])("%s passes @TPL-214", (_name, id) => {
            expect(validateLayout(layoutOf(text({id})))).toEqual([]);
        });

        test.each([
            ["empty", ""],
            ["missing", undefined],
            ["41 characters", "i".repeat(41)],
            ["a space", "a b"],
            ["an Arabic letter", "ع"],
            ["a dot", "a.b"],
            ["a space around it", " a"],
        ])("%s: templateLayoutInvalid @TPL-214", (_name, id) => {
            expect(validateLayout(raw(layoutOf(text({id: id as string}))))).toEqual([{field: "items[0].id", code: "templateLayoutInvalid"}]);
        });

        test("a repeated id refuses the later item; ids are case-sensitive @TPL-021", () => {
            expect(validateLayout(layoutOf(text({id: "a"}), manual({id: "b"}), stat({id: "a"}), fn({id: "b"})))).toEqual([
                {field: "items[2].id", code: "templateLayoutInvalid"},
                {field: "items[3].id", code: "templateLayoutInvalid"},
            ]);
            expect(validateLayout(layoutOf(text({id: "a"}), manual({id: "A"})))).toEqual([]);
        });
    });

    describe("rule 8b: the kind", () => {
        test.each([["internalData"], ["expression"], ["PrescriptionText"], [""], [undefined], ["script"]])(
            "%j is unknown: templateLayoutInvalid, the item's other rules skipped @TPL-021 @TPL-022", kind => {
                const unknown = {id: "u", kind, xMm: -5, yMm: 9999, wMm: 1, hMm: 1, fontSizePt: 1, name: "", text: ""};
                expect(validateLayout(raw({schemaVersion: 1, page: A5, items: [text(), unknown]})))
                    .toEqual([{field: "items[1].kind", code: "templateLayoutInvalid"}]);
            });

        test("the id comes first, on an unknown kind too @TPL-021", () => {
            expect(validateLayout(raw({schemaVersion: 1, page: A5, items: [text(), {id: "", kind: "expression"}]}))).toEqual([
                {field: "items[1].id", code: "templateLayoutInvalid"},
                {field: "items[1].kind", code: "templateLayoutInvalid"},
            ]);
        });
    });

    describe("rule 8c: the function", () => {
        test.each<[TemplateFunction]>([["fullDate"], ["time"], ["dayOfWeek"], ["dayOfMonth"], ["isoDateTime"], ["pageNumber"]])("%s is known @TPL-021", code => {
            expect(validateLayout(layoutOf(text(), fn({function: code})))).toEqual([]);
        });

        test.each([["FullDate"], ["date"], [""], [null], [undefined]])("%j is refused with templateLayoutInvalid @TPL-021", code => {
            expect(validateLayout(raw(layoutOf(text(), fn({function: code as TemplateFunction})))))
                .toEqual([{field: "items[1].function", code: "templateLayoutInvalid"}]);
        });
    });

    describe.each([
        ["manual input", (name: unknown) => manual({name: name as string})],
        ["function", (name: unknown) => fn({name: name as string})],
    ])("rule 8d: the name of a %s", (_kind, withName) => {
        const errorsOf = (name: unknown) => validateLayout(raw(layoutOf(text(), withName(name))));

        test.each([
            ["empty", ""],
            ["missing", undefined],
            ["null", null],
            ["only spaces", "   "],
            ["a tab and a line break", "\t\n"],
            ["U+0085", "\u0085"],
            ["a zero-width space", "​"],
            ["format characters and spaces", " ‌‍﻿ "],
        ])("%s: nameRequired @TPL-027 @TPL-211", (_name, name) => {
            expect(errorsOf(name)).toEqual([{field: "items[1].name", code: "nameRequired"}]);
        });

        test.each([
            ["U+200E", "a‎b"],
            ["U+200F", "a‏b"],
            ["U+061C", "a؜b"],
            ["ZWNJ", "a‌b"],
            ["ZWJ", "a‍b"],
        ])("%s inside passes (pasted Arabic) @TPL-211", (_name, name) => {
            expect(errorsOf(name)).toEqual([]);
        });

        test.each([
            ["U+0000", "a\u0000b"],
            ["U+0001", "a\u0001b"],
            ["a tab inside", "a\tb"],
            ["a line break inside", "a\nb"],
            ["U+0085 inside", "a\u0085b"],
            ["U+2028", "a b"],
            ["U+2029", "a b"],
            ["U+202A", "a‪b"],
            ["U+202B", "a‫b"],
            ["U+202C", "a‬b"],
            ["U+202D", "a‭b"],
            ["U+202E", "a‮b"],
            ["U+2066", "a⁦b"],
            ["U+2067", "a⁧b"],
            ["U+2068", "a⁨b"],
            ["U+2069", "a⁩b"],
        ])("%s: nameInvalid @TPL-032 @TPL-211", (_name, name) => {
            expect(errorsOf(name)).toEqual([{field: "items[1].name", code: "nameInvalid"}]);
        });

        test("60 characters pass, 61 are nameTooLong @TPL-028", () => {
            expect(errorsOf(repeat(60))).toEqual([]);
            expect(errorsOf(repeat(61))).toEqual([{field: "items[1].name", code: "nameTooLong"}]);
        });

        test("the length is of the trimmed name @TPL-213", () => {
            expect(errorsOf(`  ${repeat(60)}  `)).toEqual([]);
        });

        test("the length counts UTF-16 units, as the server: 30 emoji pass, 31 don't @TPL-028", () => {
            expect(errorsOf("😀".repeat(30))).toEqual([]);
            expect(errorsOf("😀".repeat(31))).toEqual([{field: "items[1].name", code: "nameTooLong"}]);
        });
    });

    describe("rule 8e: a name is used once", () => {
        test.each([
            ["«الاسم» and « الاسم »", manual({id: "a", name: "الاسم"}), manual({id: "b", name: " الاسم "})],
            ["Age and age", manual({id: "a", name: "Age"}), manual({id: "b", name: "age"})],
            ["Age and AGE", manual({id: "a", name: "Age"}), manual({id: "b", name: " AGE"})],
            ["a manual input and a function", manual({id: "a", name: "Date"}), fn({id: "b", name: "date"})],
            ["a function and a manual input", fn({id: "a", name: "Date"}), manual({id: "b", name: "date"})],
            ["two functions", fn({id: "a", name: "Date"}), fn({id: "b", function: "time", name: "date"})],
        ])("%s: the later one is refused with templateItemNameTaken @TPL-029", (_name, first, second) => {
            expect(validateLayout(layoutOf(text(), first, second))).toEqual([{field: "items[2].name", code: "templateItemNameTaken"}]);
        });

        test("every later repeat is refused @TPL-029", () => {
            expect(validateLayout(layoutOf(text(), manual({id: "a", name: "x"}), manual({id: "b", name: "x"}), manual({id: "c", name: "X"})))).toEqual([
                {field: "items[2].name", code: "templateItemNameTaken"},
                {field: "items[3].name", code: "templateItemNameTaken"},
            ]);
        });

        test("a static text may read like a name @TPL-029", () => {
            expect(validateLayout(layoutOf(text(), manual({name: "x"}), stat({text: "x"})))).toEqual([]);
            expect(validateLayout(layoutOf(text(), stat({text: "x"}), manual({name: "x"})))).toEqual([]);
        });

        test("two blank names are required, not taken @TPL-027", () => {
            expect(validateLayout(layoutOf(text(), manual({id: "a", name: ""}), manual({id: "b", name: " "})))).toEqual([
                {field: "items[1].name", code: "nameRequired"},
                {field: "items[2].name", code: "nameRequired"},
            ]);
        });

        test("different names pass @TPL-029", () => {
            expect(validateLayout(layoutOf(text(), manual({id: "a", name: "x"}), manual({id: "b", name: "y"})))).toEqual([]);
        });

        test("a kind without a name doesn't take part, whatever it carries @TPL-029", () => {
            const carrying = {...stat(), name: "x"} as StaticTextItem;
            expect(validateLayout(layoutOf(text(), carrying, manual({name: "x"})))).toEqual([]);
        });
    });

    describe("rules 8f-8h: the static text", () => {
        test.each([
            ["empty", ""],
            ["missing", undefined],
            ["null", null],
            ["only spaces", "   "],
            ["only line breaks and tabs", "\r\n\t"],
            ["a zero-width space", "​"],
        ])("%s: templateStaticTextRequired @TPL-030", (_name, value) => {
            expect(validateLayout(raw(layoutOf(text(), stat({text: value as string})))))
                .toEqual([{field: "items[1].text", code: "templateStaticTextRequired"}]);
        });

        test.each([
            ["line breaks", "سطر\nسطر"],
            ["\\r\\n", "سطر\r\nسطر"],
            ["a tab", "a\tb"],
            ["spaces around it", "  a  "],
        ])("%s pass @TPL-030 @TPL-212", (_name, value) => {
            expect(validateLayout(layoutOf(text(), stat({text: value})))).toEqual([]);
        });

        test.each([
            ["U+0000", "a\u0000b"],
            ["U+0001", "a\u0001b"],
            ["U+0085", "a\u0085b"],
            ["U+2028", "a b"],
            ["U+2029", "a b"],
            ["U+202A", "a‪b"],
            ["U+202E", "a‮b"],
            ["U+2066", "a⁦b"],
            ["U+2069", "a⁩b"],
        ])("%s: invalidText @TPL-032", (_name, value) => {
            expect(validateLayout(layoutOf(text(), stat({text: value})))).toEqual([{field: "items[1].text", code: "invalidText"}]);
        });

        test("1000 characters pass, 1001 are templateStaticTextTooLong @TPL-030", () => {
            expect(validateLayout(layoutOf(text(), stat({text: repeat(1000)})))).toEqual([]);
            expect(validateLayout(layoutOf(text(), stat({text: repeat(1001)})))).toEqual([{field: "items[1].text", code: "templateStaticTextTooLong"}]);
        });

        test("the length is as typed: no trim, and \\r\\n counts 2 @TPL-030 @TPL-212", () => {
            expect(validateLayout(layoutOf(text(), stat({text: `${repeat(998)}\r\n`})))).toEqual([]);
            expect(validateLayout(layoutOf(text(), stat({text: `${repeat(999)}\r\n`})))).toEqual([{field: "items[1].text", code: "templateStaticTextTooLong"}]);
            expect(validateLayout(layoutOf(text(), stat({text: ` ${repeat(1000)}`})))).toEqual([{field: "items[1].text", code: "templateStaticTextTooLong"}]);
        });
    });

    describe("rule 8i: inside the sheet", () => {
        test("an item ending exactly on the right and bottom edges passes @TPL-024", () => {
            expect(validateLayout(layoutOf(text(), manual({xMm: 76, wMm: 72, yMm: 202, hMm: 8})))).toEqual([]);
        });

        test("at the top-left corner passes @TPL-024", () => {
            expect(validateLayout(layoutOf(text(), manual({xMm: 0, yMm: 0})))).toEqual([]);
        });

        test.each([
            ["0.1 past the right edge", {xMm: 76.1, wMm: 72}, "items[1].xMm"],
            ["0.1 past the bottom edge", {yMm: 202.1, hMm: 8}, "items[1].yMm"],
            ["a negative X", {xMm: -0.1}, "items[1].xMm"],
            ["a negative Y", {yMm: -0.1}, "items[1].yMm"],
            ["wider than the sheet, at 0", {xMm: 0, wMm: 148.1}, "items[1].xMm"],
            ["taller than the sheet, at 0", {yMm: 0, hMm: 210.1}, "items[1].yMm"],
        ])("%s: templateItemOutsidePage, on X or Y @TPL-024", (_name, fields, field) => {
            expect(validateLayout(layoutOf(text(), manual(fields)))).toEqual([{field, code: "templateItemOutsidePage"}]);
        });

        test("X, then Y @TPL-024", () => {
            expect(validateLayout(layoutOf(text(), manual({xMm: -1, yMm: -1})))).toEqual([
                {field: "items[1].xMm", code: "templateItemOutsidePage"},
                {field: "items[1].yMm", code: "templateItemOutsidePage"},
            ]);
        });

        test("a negative length is a size error only @TPL-025", () => {
            expect(validateLayout(layoutOf(text(), manual({wMm: -5})))).toEqual([{field: "items[1].wMm", code: "templateItemSizeInvalid"}]);
            expect(validateLayout(layoutOf(text(), manual({hMm: -5})))).toEqual([{field: "items[1].hMm", code: "templateItemSizeInvalid"}]);
        });

        test("a huge length or start is outside, not a broken sum @TPL-024", () => {
            expect(validateLayout(layoutOf(text(), manual({xMm: 1e300, wMm: 1e300})))).toEqual([{field: "items[1].xMm", code: "templateItemOutsidePage"}]);
        });

        test("on a custom page 210.1 wide, X 0.3 + width 209.8 fits, X 0.4 doesn't @TPL-210", () => {
            const page = custom(210.1, 148);
            const box = {yMm: 0, wMm: 209.8, hMm: 20};
            expect(validateLayout(onPage(page, text({...box, xMm: 0.3})))).toEqual([]);
            expect(validateLayout(onPage(page, text({...box, xMm: 0.4})))).toEqual([{field: "items[0].xMm", code: "templateItemOutsidePage"}]);
        });

        test("the same on the height: Y 0.3 + height 209.8 fits 210.1 @TPL-210", () => {
            const page = custom(148, 210.1);
            const box = {xMm: 0, wMm: 148, hMm: 209.8};
            expect(validateLayout(onPage(page, text({...box, yMm: 0.3})))).toEqual([]);
            expect(validateLayout(onPage(page, text({...box, yMm: 0.4})))).toEqual([{field: "items[0].yMm", code: "templateItemOutsidePage"}]);
        });

        test("X 28.04 rounds to 28 and fits a 120 wide box; 28.05 rounds to 28.1 and doesn't @TPL-209", () => {
            expect(validateLayout(layoutOf(text({xMm: 28.04})))).toEqual([]);
            expect(validateLayout(layoutOf(text({xMm: 28.05})))).toEqual([{field: "items[0].xMm", code: "templateItemOutsidePage"}]);
        });

        test.each([
            ["X", {xMm: null}, "items[0].xMm"],
            ["Y", {yMm: null}, "items[0].yMm"],
            ["X, missing", {xMm: undefined}, "items[0].xMm"],
        ])("no %s: invalidRequest naming it, never 0 @TPL-024", (_name, fields, field) => {
            expect(validateLayout(raw({schemaVersion: 1, page: A5, items: [{...text(), ...fields}]}))).toEqual([{field, code: "invalidRequest"}]);
        });
    });

    describe("rule 8j: width, height, font", () => {
        test.each([
            ["width 4.9", manual({wMm: 4.9}), "items[1].wMm", "templateItemSizeInvalid"],
            ["height 3.9", manual({hMm: 3.9}), "items[1].hMm", "templateItemSizeInvalid"],
            ["a function's width 4.9", fn({wMm: 4.9}), "items[1].wMm", "templateItemSizeInvalid"],
            ["a static text's height 3.9", stat({hMm: 3.9}), "items[1].hMm", "templateItemSizeInvalid"],
            ["font 5.9", manual({fontSizePt: 5.9}), "items[1].fontSizePt", "templateFontSizeInvalid"],
            ["font 36.1", manual({fontSizePt: 36.1}), "items[1].fontSizePt", "templateFontSizeInvalid"],
        ])("%s is refused @TPL-025 @TPL-026", (_name, item, field, code) => {
            expect(validateLayout(layoutOf(text(), item))).toEqual([{field, code}]);
        });

        test.each([
            ["width 5", manual({wMm: 5})],
            ["height 4", manual({hMm: 4})],
            ["font 6", manual({fontSizePt: 6})],
            ["font 36", manual({fontSizePt: 36})],
        ])("%s passes @TPL-025 @TPL-026", (_name, item) => {
            expect(validateLayout(layoutOf(text(), item))).toEqual([]);
        });

        test("the prescription text's height: 19.9 and 4 are refused, 20 passes @TPL-025", () => {
            expect(validateLayout(layoutOf(text({hMm: 19.9})))).toEqual([{field: "items[0].hMm", code: "templateItemSizeInvalid"}]);
            expect(validateLayout(layoutOf(text({hMm: 20})))).toEqual([]);
            expect(validateLayout(layoutOf(text({hMm: 4})))).toEqual([{field: "items[0].hMm", code: "templateItemSizeInvalid"}]);
        });

        test("the prescription text's width and font have the common limits @TPL-025 @TPL-026", () => {
            expect(validateLayout(layoutOf(text({wMm: 4.9})))).toEqual([{field: "items[0].wMm", code: "templateItemSizeInvalid"}]);
            expect(validateLayout(layoutOf(text({wMm: 5})))).toEqual([]);
            expect(validateLayout(layoutOf(text({fontSizePt: 36.1})))).toEqual([{field: "items[0].fontSizePt", code: "templateFontSizeInvalid"}]);
        });

        test("values are rounded first: width 4.95 is 5, 4.94 is 4.9; font 36.04 is 36, 36.05 is 36.1 @TPL-209", () => {
            expect(validateLayout(layoutOf(text(), manual({wMm: 4.95})))).toEqual([]);
            expect(validateLayout(layoutOf(text(), manual({wMm: 4.94})))).toEqual([{field: "items[1].wMm", code: "templateItemSizeInvalid"}]);
            expect(validateLayout(layoutOf(text({fontSizePt: 36.04})))).toEqual([]);
            expect(validateLayout(layoutOf(text({fontSizePt: 36.05})))).toEqual([{field: "items[0].fontSizePt", code: "templateFontSizeInvalid"}]);
        });

        test.each([
            ["width", {wMm: null}, "items[0].wMm"],
            ["height", {hMm: null}, "items[0].hMm"],
            ["font", {fontSizePt: null}, "items[0].fontSizePt"],
        ])("no %s: invalidRequest naming it, never 0 @TPL-025", (_name, fields, field) => {
            expect(validateLayout(raw({schemaVersion: 1, page: A5, items: [{...text(), ...fields}]}))).toEqual([{field, code: "invalidRequest"}]);
        });
    });

    test("two items with the same box both stay valid @TPL-208", () => {
        expect(validateLayout(layoutOf(text(), manual({id: "a", name: "a"}), manual({id: "b", name: "b"})))).toEqual([]);
    });

    test("every failure, in order: schema, page, text count, then each item's id, function, name, X, Y, width, height, font @TPL-048", () => {
        const broken = {id: "", kind: "function", function: "x", name: "", xMm: null, yMm: null, wMm: 4, hMm: 3, fontSizePt: 5};
        const brokenStatic = {id: "s", kind: "staticText", text: "", xMm: 0, yMm: 0, wMm: 5, hMm: 4, fontSizePt: 6};
        expect(validateLayout(raw({schemaVersion: 2, page: {...A5, widthMm: 1}, items: [broken, brokenStatic]}))).toEqual([
            {field: "schemaVersion", code: "templateLayoutInvalid"},
            {field: "page.widthMm", code: "templatePageInvalid"},
            {field: "items", code: "templateTextCount"},
            {field: "items[0].id", code: "templateLayoutInvalid"},
            {field: "items[0].function", code: "templateLayoutInvalid"},
            {field: "items[0].name", code: "nameRequired"},
            {field: "items[0].xMm", code: "invalidRequest"},
            {field: "items[0].yMm", code: "invalidRequest"},
            {field: "items[0].wMm", code: "templateItemSizeInvalid"},
            {field: "items[0].hMm", code: "templateItemSizeInvalid"},
            {field: "items[0].fontSizePt", code: "templateFontSizeInvalid"},
            {field: "items[1].text", code: "templateStaticTextRequired"},
        ]);
    });

    test("another kind's field is ignored: a name on a prescription text, a text on a manual input @TPL-048", () => {
        const carrying = [{...text(), name: "‮"}, {...manual(), text: "‮"}];
        expect(validateLayout(raw({schemaVersion: 1, page: A5, items: carrying}))).toEqual([]);
    });
});

describe("itemIndexOfField @area:admin", () => {
    test.each([
        ["items[2].name", 2],
        ["items[0].xMm", 0],
        ["items[12].fontSizePt", 12],
        ["items[1]", 1],
    ])("%s is item %d @TPL-238", (field, index) => {
        expect(itemIndexOfField(field)).toBe(index);
    });

    test.each([["page.widthMm"], ["page"], ["items"], ["schemaVersion"], [""], ["items[a].name"]])("%s names no item @TPL-238", field => {
        expect(itemIndexOfField(field)).toBeNull();
    });
});

describe("newLayout @area:admin", () => {
    test("A5, schema version 1, only the prescription text: id i1, the default box, font 11 @TPL-041", () => {
        expect(newLayout()).toEqual({
            schemaVersion: 1,
            page: {size: "A5", widthMm: 148, heightMm: 210},
            items: [{id: "i1", kind: "prescriptionText", xMm: 14, yMm: 80, wMm: 120, hMm: 90, fontSizePt: 11}],
        });
    });

    test("passes the rules as it is @TPL-216", () => {
        expect(validateLayout(newLayout())).toEqual([]);
    });
});

describe("canAddItem and addItem @area:admin", () => {
    test("another item fits below 50, not at 50 @TPL-237", () => {
        expect(canAddItem(layoutOf(...manyItems(49)))).toBe(true);
        expect(canAddItem(layoutOf(...manyItems(50)))).toBe(false);
        expect(canAddItem(layoutOf(...manyItems(51)))).toBe(false);
        expect(canAddItem(newLayout())).toBe(true);
    });

    test("at 50 there is no 51st @TPL-237", () => {
        expect(addItem(layoutOf(...manyItems(50)), {kind: "manualInput"}, "Manual input")).toBeNull();
    });

    test("the 50th can still be added @TPL-237", () => {
        const added = addItem(layoutOf(...manyItems(49)), {kind: "manualInput"}, "Manual input");
        expect(added?.layout.items).toHaveLength(50);
    });

    test.each<[string, AddableItem, Partial<TemplateItem>]>([
        ["a manual input", {kind: "manualInput"}, {kind: "manualInput", name: "Label", wMm: 40, hMm: 8} as Partial<ManualInputItem>],
        ["a function", {kind: "function", function: "time"}, {kind: "function", function: "time", name: "Label", wMm: 30, hMm: 8} as Partial<FunctionItem>],
        ["a static text", {kind: "staticText"}, {kind: "staticText", text: "", wMm: 40, hMm: 8} as Partial<StaticTextItem>],
    ])("%s comes last with its default box, font 11, the first free id and the cascade's place @TPL-216", (_name, addable, fields) => {
        const before = newLayout();
        const added = addItem(before, addable, "Label");
        const expected = {id: "i2", xMm: 11, yMm: 11, fontSizePt: 11, ...fields};
        expect(added?.item).toEqual(expected);
        expect(added?.layout.items).toEqual([before.items[0], expected]);
        expect(added?.layout.page).toEqual(before.page);
        expect(added?.layout.schemaVersion).toBe(1);
    });

    test("the layout given isn't changed @TPL-216", () => {
        const before = newLayout();
        addItem(before, {kind: "manualInput"}, "Label");
        expect(before).toEqual(newLayout());
    });

    test("a static text has no name @TPL-220", () => {
        expect(addItem(newLayout(), {kind: "staticText"}, "Label")?.item).not.toHaveProperty("name");
    });

    test("a manual input has no function and no text @TPL-220", () => {
        const item = addItem(newLayout(), {kind: "manualInput"}, "Label")?.item;
        expect(item).not.toHaveProperty("function");
        expect(item).not.toHaveProperty("text");
    });

    test("the id is the first free i<n> @TPL-216", () => {
        expect(addItem(layoutOf(text({id: "i1"}), manual({id: "i3"})), {kind: "staticText"}, "x")?.item.id).toBe("i2");
        expect(addItem(layoutOf(text({id: "i2"})), {kind: "staticText"}, "x")?.item.id).toBe("i1");
        expect(addItem(layoutOf(text({id: "i1"}), manual({id: "i2"})), {kind: "staticText"}, "x")?.item.id).toBe("i3");
        expect(addItem(layoutOf(text({id: "abc"})), {kind: "staticText"}, "x")?.item.id).toBe("i1");
    });

    test.each<[string, TemplatePage, number, AddableItem, number, number]>([
        // x = (5 + 6n) % (floor(width - w) + 1), y likewise (contract § 3.5)
        ["A5, the first", A5, 1, {kind: "manualInput"}, 11, 11],
        ["A5, the second", A5, 2, {kind: "manualInput"}, 17, 17],
        ["A5, past the width: wraps", A5, 20, {kind: "manualInput"}, 16, 125],
        ["A5, a function is narrower", A5, 20, {kind: "function", function: "fullDate"}, 6, 125],
        ["A5, past the height: wraps", A5, 40, {kind: "staticText"}, 27, 42],
        ["A4", A4, 30, {kind: "manualInput"}, 14, 185],
        ["50 x 50, a manual input", custom(50, 50), 1, {kind: "manualInput"}, 0, 11],
        ["50 x 50, a function", custom(50, 50), 1, {kind: "function", function: "fullDate"}, 11, 11],
        ["50 x 50, on", custom(50, 50), 5, {kind: "manualInput"}, 2, 35],
        ["50.5 wide: the floor", custom(50.5, 50), 1, {kind: "manualInput"}, 0, 11],
        ["50.9 x 58.5", custom(50.9, 58.5), 2, {kind: "manualInput"}, 6, 17],
    ])("%s: n items there, the cascade's place @TPL-216 @TPL-217", (_name, page, n, addable, x, y) => {
        const items = Array.from({length: n}, (_, i) => (i === 0 ? text({id: "i1", xMm: 0, yMm: 0, wMm: 5, hMm: 20}) : manual({id: `i${i + 1}`, name: `F${i}`, xMm: 0, yMm: 0, wMm: 5, hMm: 4})));
        const added = addItem(onPage(page, ...items), addable, "Label");
        expect(added?.item.xMm).toBe(x);
        expect(added?.item.yMm).toBe(y);
    });

    const everyKind: AddableItem[] = [{kind: "manualInput"}, {kind: "function", function: "pageNumber"}];

    test.each([
        ["A5", A5],
        ["A4", A4],
        ["50 x 50", custom(50, 50)],
        ["50.5 x 50.5", custom(50.5, 50.5)],
        ["420 x 600", custom(420, 600)],
    ])("on %s each new box stays inside, up to 50 items, with no edit @TPL-216 @TPL-217", (_name, page) => {
        let layout = applyPageSize(newLayout(), page);
        expect(validateLayout(layout)).toEqual([]);
        for (let n = 1; n < 50; n++) {
            const added = addItem(layout, everyKind[n % everyKind.length], "Label");
            if (!added) throw new Error(`no item ${n}`);
            layout = added.layout;
            expect(validateLayout(layout)).toEqual([]);
        }
        expect(layout.items).toHaveLength(50);
    });

    test("new boxes don't land on each other on A5 @TPL-216", () => {
        let layout = newLayout();
        for (let n = 0; n < 5; n++) layout = addItem(layout, {kind: "manualInput"}, "Label")!.layout;
        const places = layout.items.slice(1).map(item => `${item.xMm},${item.yMm}`);
        expect(new Set(places).size).toBe(5);
    });

    describe("a distinct name", () => {
        const nameOf = (layout: PrintLayout, addable: AddableItem = {kind: "manualInput"}) => {
            const item = addItem(layout, addable, "Label")?.item as ManualInputItem;
            return item.name;
        };

        test.each<[string, TemplateItem[], string]>([
            ["free", [], "Label"],
            ["taken", [manual({id: "a", name: "Label"})], "Label 2"],
            ["taken twice", [manual({id: "a", name: "Label"}), manual({id: "b", name: "Label 2"})], "Label 3"],
            ["a gap", [manual({id: "a", name: "Label"}), manual({id: "b", name: "Label 3"})], "Label 2"],
            ["only the numbered one taken", [manual({id: "a", name: "Label 2"})], "Label"],
            ["taken, other case", [manual({id: "a", name: "LABEL"})], "Label 2"],
            ["taken, spaces around it", [manual({id: "a", name: "  label "})], "Label 2"],
            ["the numbered one, other case", [manual({id: "a", name: "label"}), manual({id: "b", name: " LABEL 2 "})], "Label 3"],
            ["taken by a function", [fn({id: "a", name: "Label"})], "Label 2"],
            ["a static text isn't a name", [stat({id: "a", text: "Label"})], "Label"],
        ])("%s @TPL-218", (_name, items, expected) => {
            expect(nameOf(layoutOf(text({id: "t"}), ...items))).toBe(expected);
        });

        test("a function too: «التاريخ الكامل» twice in a row @TPL-218", () => {
            const addable: AddableItem = {kind: "function", function: "fullDate"};
            const first = addItem(newLayout(), addable, "التاريخ الكامل");
            const second = addItem(first!.layout, addable, "التاريخ الكامل");
            expect((first?.item as FunctionItem).name).toBe("التاريخ الكامل");
            expect((second?.item as FunctionItem).name).toBe("التاريخ الكامل 2");
            expect(validateLayout(second!.layout)).toEqual([]);
        });
    });
});

describe("removeItem @area:admin", () => {
    const layout = layoutOf(text(), manual(), fn());

    test("the item leaves, the others keep their order @TPL-046", () => {
        expect(removeItem(layout, "m")).toEqual(layoutOf(text(), fn()));
    });

    test("never the prescription text @TPL-045", () => {
        expect(removeItem(layout, "t")).toEqual(layout);
    });

    test("an unknown id changes nothing @TPL-046", () => {
        expect(removeItem(layout, "nope")).toEqual(layout);
    });

    test("the layout given isn't changed @TPL-046", () => {
        const before = layoutOf(text(), manual());
        removeItem(before, "m");
        expect(before.items).toHaveLength(2);
    });
});

describe("updateItem: as given, no moving, no correcting @area:admin", () => {
    test.each<[string, Partial<TemplateItem>]>([
        ["a negative X", {xMm: -5}],
        ["an off-sheet Y", {yMm: 9999}],
        ["a width below the minimum", {wMm: 1}],
        ["a font out of range", {fontSizePt: 99}],
        ["several at once", {xMm: 1, yMm: 2, wMm: 3, hMm: 4, fontSizePt: 5}],
    ])("%s is applied @TPL-224", (_name, changes) => {
        const updated = updateItem(layoutOf(text(), manual()), "m", changes);
        expect(updated.items[1]).toEqual({...manual(), ...changes});
        expect(updated.items[0]).toEqual(text());
    });

    test("a name is kept as typed, spaces too @TPL-219", () => {
        const updated = updateItem(layoutOf(manual()), "m", {name: " new "} as Partial<ManualInputItem>);
        expect((updated.items[0] as ManualInputItem).name).toBe(" new ");
    });

    test("an unknown id changes nothing, the page stays @TPL-224", () => {
        const layout = onPage(A4, text());
        expect(updateItem(layout, "nope", {xMm: 1})).toEqual(layout);
    });

    test("the layout given isn't changed @TPL-224", () => {
        const before = layoutOf(manual());
        updateItem(before, "m", {xMm: 1});
        expect(before.items[0].xMm).toBe(58);
    });
});

describe("pageOfSize @area:admin", () => {
    test.each<[TemplatePage["size"], TemplatePage, TemplatePage]>([
        ["A5", A4, A5],
        ["A4", A5, A4],
        ["A4", custom(100, 100), A4],
        ["custom", A5, custom(148, 210)],
        ["custom", A4, custom(210, 297)],
        ["custom", custom(77.5, 88.5), custom(77.5, 88.5)],
    ])("%s from %j @TPL-047", (size, current, page) => {
        expect(pageOfSize(size, current)).toEqual(page);
    });
});

describe("applyPageSize: items keep their mm, what falls off comes back @area:admin", () => {
    test("A4, an item at X 140, width 20, to A5: X 128, the width stays @TPL-223", () => {
        const moved = applyPageSize(onPage(A4, text({xMm: 10, yMm: 10}), manual({xMm: 140, wMm: 20})), A5);
        expect(moved.page).toEqual(A5);
        expect(moved.items[1]).toEqual(manual({xMm: 128, wMm: 20}));
    });

    test("items already inside don't move @TPL-223", () => {
        const items = [text(), manual(), fn(), stat()];
        expect(applyPageSize(onPage(A4, ...items), A5).items).toEqual(items);
        expect(applyPageSize(onPage(A5, ...items), A4).items).toEqual(items);
    });

    test("an item exactly on the new edge doesn't move @TPL-223", () => {
        const item = manual({xMm: 108, wMm: 40, yMm: 202, hMm: 8});
        expect(applyPageSize(onPage(A4, item), A5).items[0]).toEqual(item);
    });

    test("going back to A4 doesn't restore the old X @TPL-223", () => {
        const onA5 = applyPageSize(onPage(A4, manual({xMm: 140, wMm: 20})), A5);
        expect(applyPageSize(onA5, A4).items[0].xMm).toBe(128);
    });

    test("a 180 mm box on A4, to A5: only as far as needed: width 148, X 0 @TPL-222", () => {
        const moved = applyPageSize(onPage(A4, text({xMm: 15, wMm: 180})), A5);
        expect(moved.items[0]).toEqual(text({xMm: 0, wMm: 148}));
        expect(validateLayout(moved)).toEqual([]);
    });

    test("too tall: height 210, Y 0, on its own axis @TPL-222", () => {
        const moved = applyPageSize(onPage(A4, text({yMm: 40, hMm: 250})), A5);
        expect(moved.items[0]).toEqual(text({yMm: 0, hMm: 210}));
        expect(validateLayout(moved)).toEqual([]);
    });

    test("both axes at once @TPL-222", () => {
        const moved = applyPageSize(onPage(custom(420, 600), text({xMm: 300, yMm: 500, wMm: 400, hMm: 100})), custom(100, 50));
        expect(moved.items[0]).toEqual(text({xMm: 0, yMm: 0, wMm: 100, hMm: 50}));
    });

    test("on 50 x 50 the prescription text fits, its height 20 at least @TPL-217 @TPL-222", () => {
        const moved = applyPageSize(newLayout(), custom(50, 50));
        expect(moved.items[0]).toMatchObject({xMm: 0, yMm: 0, wMm: 50, hMm: 50});
        expect(validateLayout(moved)).toEqual([]);
    });

    test.each([
        ["a width below its minimum keeps its length", manual({xMm: 0, wMm: 3}), {wMm: 3}],
        ["a height below its minimum keeps its length", manual({yMm: 0, hMm: 2}), {hMm: 2}],
        ["a prescription text below its 20 keeps its height", text({xMm: 0, yMm: 0, wMm: 50, hMm: 15}), {hMm: 15}],
    ])("%s: never made bigger @TPL-222", (_name, item, expected) => {
        expect(applyPageSize(onPage(A4, item), custom(50, 50)).items[0]).toMatchObject(expected);
    });

    test("in tenths: X 100.3 + width 60.4 on 148.5 wide is X 88.1 exactly @TPL-222", () => {
        const moved = applyPageSize(onPage(A4, manual({xMm: 100.3, wMm: 60.4, yMm: 0})), custom(148.5, 210));
        expect(moved.items[0].xMm).toBe(88.1);
        expect(moved.items[0].wMm).toBe(60.4);
    });

    test("in tenths: Y 150.7 + height 60.6 on 210.1 high is Y 149.5 exactly @TPL-222", () => {
        const moved = applyPageSize(onPage(A4, manual({xMm: 0, yMm: 150.7, hMm: 60.6})), custom(148, 210.1));
        expect(moved.items[0].yMm).toBe(149.5);
        expect(moved.items[0].hMm).toBe(60.6);
    });

    test("a negative start comes back to 0 @TPL-222", () => {
        expect(applyPageSize(onPage(A4, manual({xMm: -5, yMm: -7})), A5).items[0]).toMatchObject({xMm: 0, yMm: 0});
    });

    test("names, fonts, ids and the order stay @TPL-047", () => {
        const items = [stat({text: "x", fontSizePt: 20}), text(), fn({name: "y", function: "time"})];
        const moved = applyPageSize(onPage(A4, ...items), A5);
        expect(moved.items).toEqual(items);
        expect(moved.schemaVersion).toBe(1);
    });

    test("the layout given isn't changed @TPL-047", () => {
        const before = onPage(A4, manual({xMm: 140, wMm: 20}));
        applyPageSize(before, A5);
        expect(before).toEqual(onPage(A4, manual({xMm: 140, wMm: 20})));
    });
});

describe("sameLayout @area:admin", () => {
    const layout = () => layoutOf(text(), manual(), fn(), stat());

    test("the same layout @TPL-233", () => {
        expect(sameLayout(layout(), layout())).toBe(true);
    });

    test("a value typed back is the same; so is what rounds to the same, or differs by a name's spaces @TPL-233", () => {
        expect(sameLayout(layoutOf(manual({xMm: 12.3})), layoutOf(manual({xMm: 12.34})))).toBe(true);
        expect(sameLayout(layoutOf(manual({name: "x"})), layoutOf(manual({name: " x "})))).toBe(true);
    });

    test.each<[string, PrintLayout]>([
        ["X", layoutOf(text(), manual({xMm: 1}), fn(), stat())],
        ["Y", layoutOf(text(), manual({yMm: 1}), fn(), stat())],
        ["width", layoutOf(text(), manual({wMm: 10}), fn(), stat())],
        ["height", layoutOf(text(), manual({hMm: 10}), fn(), stat())],
        ["font", layoutOf(text(), manual({fontSizePt: 12}), fn(), stat())],
        ["a name", layoutOf(text(), manual({name: "x"}), fn(), stat())],
        ["a function", layoutOf(text(), manual(), fn({function: "time"}), stat())],
        ["a static text", layoutOf(text(), manual(), fn(), stat({text: "x"}))],
        ["a static text's spaces", layoutOf(text(), manual(), fn(), stat({text: "يُصرف مرة واحدة "}))],
        ["the order", layoutOf(manual(), text(), fn(), stat())],
        ["a missing item", layoutOf(text(), manual(), fn())],
        ["the page's size", onPage({...A5, size: "custom"}, text(), manual(), fn(), stat())],
        ["the page's width", onPage({...A5, widthMm: 149}, text(), manual(), fn(), stat())],
        ["the page's height", onPage({...A5, heightMm: 211}, text(), manual(), fn(), stat())],
    ])("another %s isn't the same @TPL-233", (_name, other) => {
        expect(sameLayout(layout(), other)).toBe(false);
        expect(sameLayout(other, layout())).toBe(false);
    });
});
