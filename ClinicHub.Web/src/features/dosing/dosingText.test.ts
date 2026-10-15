import {describe, expect, test} from "vitest";
import i18n from "../../i18n";
import {dosingToText} from "./dosingText.ts";
import type {Dosing, DoseUnit} from "./types.ts";

// Expected sentences: docs/testing/test-catalog.md (DOSE, TAPER "Sentence"), from docs/features/dosing + tapering.

const dose = (doseUnit: DoseUnit, doseAmount?: number | null) => dosingToText({doseUnit, doseAmount});

describe("dosingToText: dose and unit @area:catalog", () => {
    test("drop with no amount, 1 and 2 reads one / two @DOSE-001 @smoke", () => {
        expect(dose("drop")).toBe("نقطة واحدة");
        expect(dose("drop", null)).toBe("نقطة واحدة");
        expect(dose("drop", 1)).toBe("نقطة واحدة");
        expect(dose("drop", 2)).toBe("نقطتين");
    });

    test("drop 3 and 10 (few) @DOSE-002", () => {
        expect(dose("drop", 3)).toBe("3 نقاط");
        expect(dose("drop", 10)).toBe("10 نقاط");
    });

    test("drop 11 and 99 (many) @DOSE-003", () => {
        expect(dose("drop", 11)).toBe("11 نقطة");
        expect(dose("drop", 99)).toBe("99 نقطة");
    });

    test("drop 100, 101, 102, 1000 (other) @DOSE-004", () => {
        expect(dose("drop", 100)).toBe("100 نقطة");
        expect(dose("drop", 101)).toBe("101 نقطة");
        expect(dose("drop", 102)).toBe("102 نقطة");
        expect(dose("drop", 1000)).toBe("1000 نقطة");
    });

    test("drop 103 (few) and 111 (many) @DOSE-005", () => {
        expect(dose("drop", 103)).toBe("103 نقاط");
        expect(dose("drop", 111)).toBe("111 نقطة");
    });

    test("drop 0.5 reads half a drop @DOSE-006", () => {
        expect(dose("drop", 0.5)).toBe("نصف نقطة");
    });

    test("drop 1.5 and 0.25 @DOSE-007", () => {
        expect(dose("drop", 1.5)).toBe("1.5 نقطة");
        expect(dose("drop", 0.25)).toBe("0.25 نقطة");
    });

    test("tablet with no amount, 1, 2, 3, 10 @DOSE-008", () => {
        expect(dose("tablet")).toBe("قرص واحد");
        expect(dose("tablet", 1)).toBe("قرص واحد");
        expect(dose("tablet", 2)).toBe("قرصين");
        expect(dose("tablet", 3)).toBe("3 أقراص");
        expect(dose("tablet", 10)).toBe("10 أقراص");
    });

    test("tablet 11, 99, 100, 103, 111 @DOSE-009", () => {
        expect(dose("tablet", 11)).toBe("11 قرصًا");
        expect(dose("tablet", 99)).toBe("99 قرصًا");
        expect(dose("tablet", 100)).toBe("100 قرص");
        expect(dose("tablet", 103)).toBe("103 أقراص");
        expect(dose("tablet", 111)).toBe("111 قرصًا");
    });

    test("tablet 0.5 and 1.5 @DOSE-010", () => {
        expect(dose("tablet", 0.5)).toBe("نصف قرص");
        expect(dose("tablet", 1.5)).toBe("1.5 قرص");
    });

    test("capsule with no amount, 1, 2, 3, 10 @DOSE-011", () => {
        expect(dose("capsule")).toBe("كبسولة واحدة");
        expect(dose("capsule", 1)).toBe("كبسولة واحدة");
        expect(dose("capsule", 2)).toBe("كبسولتين");
        expect(dose("capsule", 3)).toBe("3 كبسولات");
        expect(dose("capsule", 10)).toBe("10 كبسولات");
    });

    test("capsule 11, 100, 0.5, 1.5 @DOSE-012", () => {
        expect(dose("capsule", 11)).toBe("11 كبسولة");
        expect(dose("capsule", 100)).toBe("100 كبسولة");
        expect(dose("capsule", 0.5)).toBe("نصف كبسولة");
        expect(dose("capsule", 1.5)).toBe("1.5 كبسولة");
    });

    test("ml with no amount, 1, 2, 5, 11, 100 @DOSE-013", () => {
        expect(dose("ml")).toBe("1 مل");
        expect(dose("ml", 1)).toBe("1 مل");
        expect(dose("ml", 2)).toBe("2 مل");
        expect(dose("ml", 5)).toBe("5 مل");
        expect(dose("ml", 11)).toBe("11 مل");
        expect(dose("ml", 100)).toBe("100 مل");
    });

    test("ml 0.5 and 2.5 @DOSE-014", () => {
        expect(dose("ml", 0.5)).toBe("نصف مل");
        expect(dose("ml", 2.5)).toBe("2.5 مل");
    });

    test("ointment (application) always reads a thin layer @DOSE-015", () => {
        for (const amount of [undefined, 1, 2, 3, 11, 100, 0.5, 1.5]) expect(dose("application", amount)).toBe("طبقة رقيقة");
    });

    test("no unit and no amount: no dose part @DOSE-016", () => {
        expect(dosingToText({eye: "right", frequency: "bedtime"})).toBe("في العين اليمنى قبل النوم");
        expect(dosingToText({frequency: "asNeeded"})).toBe("عند اللزوم");
    });
});

describe("dosingToText: eye, frequency, duration, order @area:catalog", () => {
    test("eye right, left, both @DOSE-017", () => {
        expect(dosingToText({eye: "right"})).toBe("في العين اليمنى");
        expect(dosingToText({eye: "left"})).toBe("في العين اليسرى");
        expect(dosingToText({eye: "both"})).toBe("في العينين");
    });

    test("eye none, not set or ask: no eye part and no double space @DOSE-018", () => {
        const base: Dosing = {doseUnit: "drop", doseAmount: 2, frequency: "daily", frequencyValue: 3};
        for (const eye of ["none", null, undefined, "ask"] as const) {
            const text = dosingToText({...base, eye});
            expect(text).toBe("نقطتين 3 مرات يوميًا");
            expect(text).not.toMatch(/ {2}/);
        }
    });

    test("daily 1, 2, 3, 10 @DOSE-019", () => {
        const daily = (frequencyValue: number) => dosingToText({frequency: "daily", frequencyValue});
        expect(daily(1)).toBe("مرة واحدة يوميًا");
        expect(daily(2)).toBe("مرتين يوميًا");
        expect(daily(3)).toBe("3 مرات يوميًا");
        expect(daily(10)).toBe("10 مرات يوميًا");
    });

    test("daily 11 and 24 @DOSE-020", () => {
        expect(dosingToText({frequency: "daily", frequencyValue: 11})).toBe("11 مرة يوميًا");
        expect(dosingToText({frequency: "daily", frequencyValue: 24})).toBe("24 مرة يوميًا");
    });

    test("every 1, 2, 3, 8, 10 hours @DOSE-021", () => {
        const every = (frequencyValue: number) => dosingToText({frequency: "everyHours", frequencyValue});
        expect(every(1)).toBe("كل ساعة");
        expect(every(2)).toBe("كل ساعتين");
        expect(every(3)).toBe("كل 3 ساعات");
        expect(every(8)).toBe("كل 8 ساعات");
        expect(every(10)).toBe("كل 10 ساعات");
    });

    test("every 11, 12, 72 hours @DOSE-022", () => {
        const every = (frequencyValue: number) => dosingToText({frequency: "everyHours", frequencyValue});
        expect(every(11)).toBe("كل 11 ساعة");
        expect(every(12)).toBe("كل 12 ساعة");
        expect(every(72)).toBe("كل 72 ساعة");
    });

    test("bedtime and as needed @DOSE-023", () => {
        expect(dosingToText({frequency: "bedtime"})).toBe("قبل النوم");
        expect(dosingToText({frequency: "asNeeded"})).toBe("عند اللزوم");
    });

    test("custom frequency is written as typed, trimmed @DOSE-024", () => {
        expect(dosingToText({frequency: "custom", frequencyText: "  صباحًا ومساءً  "})).toBe("صباحًا ومساءً");
        expect(dosingToText({doseUnit: "drop", frequency: "custom", frequencyText: "  صباحًا ومساءً  ", durationUnit: "weeks", durationValue: 1}))
            .toBe("نقطة واحدة صباحًا ومساءً لمدة أسبوع");
    });

    test("daily or every-hours without a number: no frequency part @DOSE-025", () => {
        expect(dosingToText({doseUnit: "drop", frequency: "daily"})).toBe("نقطة واحدة");
        expect(dosingToText({doseUnit: "drop", frequency: "everyHours", frequencyValue: null})).toBe("نقطة واحدة");
    });

    test("days 1, 2, 3, 10 @DOSE-026", () => {
        const days = (durationValue: number) => dosingToText({durationUnit: "days", durationValue});
        expect(days(1)).toBe("لمدة يوم واحد");
        expect(days(2)).toBe("لمدة يومين");
        expect(days(3)).toBe("لمدة 3 أيام");
        expect(days(10)).toBe("لمدة 10 أيام");
    });

    test("days 11, 99, 100, 101, 103, 111, 365 @DOSE-027", () => {
        const days = (durationValue: number) => dosingToText({durationUnit: "days", durationValue});
        expect(days(11)).toBe("لمدة 11 يومًا");
        expect(days(99)).toBe("لمدة 99 يومًا");
        expect(days(100)).toBe("لمدة 100 يوم");
        expect(days(101)).toBe("لمدة 101 يوم");
        expect(days(103)).toBe("لمدة 103 أيام");
        expect(days(111)).toBe("لمدة 111 يومًا");
        expect(days(365)).toBe("لمدة 365 يومًا");
    });

    test("weeks 1, 2, 3, 10 @DOSE-028", () => {
        const weeks = (durationValue: number) => dosingToText({durationUnit: "weeks", durationValue});
        expect(weeks(1)).toBe("لمدة أسبوع");
        expect(weeks(2)).toBe("لمدة أسبوعين");
        expect(weeks(3)).toBe("لمدة 3 أسابيع");
        expect(weeks(10)).toBe("لمدة 10 أسابيع");
    });

    test("weeks 11, 52, 100 @DOSE-029", () => {
        const weeks = (durationValue: number) => dosingToText({durationUnit: "weeks", durationValue});
        expect(weeks(11)).toBe("لمدة 11 أسبوعًا");
        expect(weeks(52)).toBe("لمدة 52 أسبوعًا");
        expect(weeks(100)).toBe("لمدة 100 أسبوع");
    });

    test("months 1, 2, 3, 6, 10 @DOSE-030", () => {
        const months = (durationValue: number) => dosingToText({durationUnit: "months", durationValue});
        expect(months(1)).toBe("لمدة شهر");
        expect(months(2)).toBe("لمدة شهرين");
        expect(months(3)).toBe("لمدة 3 أشهر");
        expect(months(6)).toBe("لمدة 6 أشهر");
        expect(months(10)).toBe("لمدة 10 أشهر");
    });

    test("months 11, 12, 100 @DOSE-031", () => {
        const months = (durationValue: number) => dosingToText({durationUnit: "months", durationValue});
        expect(months(11)).toBe("لمدة 11 شهرًا");
        expect(months(12)).toBe("لمدة 12 شهرًا");
        expect(months(100)).toBe("لمدة 100 شهر");
    });

    test("continuous and until next visit @DOSE-032", () => {
        expect(dosingToText({durationUnit: "continuous"})).toBe("بصفة مستمرة");
        expect(dosingToText({durationUnit: "untilNextVisit"})).toBe("حتى الزيارة القادمة");
    });

    test("days, weeks or months without a number: no duration part @DOSE-033", () => {
        for (const durationUnit of ["days", "weeks", "months"] as const)
            expect(dosingToText({doseUnit: "tablet", durationUnit})).toBe("قرص واحد");
    });

    test("order dose, eye, frequency, duration with single spaces @DOSE-034 @smoke", () => {
        expect(dosingToText({
            doseAmount: 2, doseUnit: "drop", eye: "left", frequency: "daily", frequencyValue: 6,
            durationUnit: "weeks", durationValue: 2,
        })).toBe("نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين");
    });

    test("1 tablet every 8 hours for 5 days, no eye @DOSE-035", () => {
        expect(dosingToText({
            doseAmount: 1, doseUnit: "tablet", frequency: "everyHours", frequencyValue: 8, durationUnit: "days", durationValue: 5,
        })).toBe("قرص واحد كل 8 ساعات لمدة 5 أيام");
    });

    test("ointment, both eyes, bedtime, until next visit @DOSE-036", () => {
        expect(dosingToText({doseUnit: "application", eye: "both", frequency: "bedtime", durationUnit: "untilNextVisit"}))
            .toBe("طبقة رقيقة في العينين قبل النوم حتى الزيارة القادمة");
    });

    test("only an eye, only a duration, only a frequency @DOSE-037", () => {
        expect(dosingToText({eye: "right"})).toBe("في العين اليمنى");
        expect(dosingToText({durationUnit: "weeks", durationValue: 1})).toBe("لمدة أسبوع");
        expect(dosingToText({frequency: "asNeeded"})).toBe("عند اللزوم");
    });

    test("1 drop, right eye, custom text, continuous @DOSE-038", () => {
        expect(dosingToText({doseAmount: 1, doseUnit: "drop", eye: "right", frequency: "custom", frequencyText: "بعد الأكل", durationUnit: "continuous"}))
            .toBe("نقطة واحدة في العين اليمنى بعد الأكل بصفة مستمرة");
    });

    test("an empty dosing, null or undefined gives an empty string @DOSE-039", () => {
        expect(dosingToText({})).toBe("");
        expect(dosingToText(null)).toBe("");
        expect(dosingToText(undefined)).toBe("");
        expect(dosingToText({eye: "none"})).toBe("");
    });

    test("the sentence is Arabic whatever the interface language @DOSE-040", async () => {
        const dosing: Dosing = {doseAmount: 2, doseUnit: "drop", eye: "left", frequency: "daily", frequencyValue: 6, durationUnit: "weeks", durationValue: 2};
        await i18n.changeLanguage("en");
        const inEnglish = dosingToText(dosing);
        await i18n.changeLanguage("ar");
        const inArabic = dosingToText(dosing);
        expect(inEnglish).toBe("نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين");
        expect(inArabic).toBe(inEnglish);
    });

    test("numbers are Western digits, never Arabic-Indic @DOSE-041", async () => {
        const dosings: Dosing[] = [
            {doseAmount: 3, doseUnit: "drop", frequency: "daily", frequencyValue: 4, durationUnit: "days", durationValue: 10},
            {doseAmount: 1.5, doseUnit: "tablet", frequency: "everyHours", frequencyValue: 12, durationUnit: "months", durationValue: 3},
            {doseAmount: 250, doseUnit: "ml", durationUnit: "weeks", durationValue: 11},
            {doseAmount: 2, doseUnit: "drop", taperSteps: [
                {frequency: "daily", frequencyValue: 6, durationUnit: "days", durationValue: 5},
                {doseAmount: 3, frequency: "everyHours", frequencyValue: 8, durationUnit: "weeks", durationValue: 3},
            ]},
        ];
        for (const language of ["en", "ar"]) {
            await i18n.changeLanguage(language);
            for (const dosing of dosings) {
                const text = dosingToText(dosing);
                expect(text).toMatch(/[0-9]/);
                expect(text).not.toMatch(/[٠-٩۰-۹]/);
            }
        }
        expect(dosingToText(dosings[0])).toBe("3 نقاط 4 مرات يوميًا لمدة 10 أيام");
    });

    test("fields that don't apply are ignored @DOSE-042", () => {
        expect(dosingToText({frequency: "bedtime", frequencyValue: 3})).toBe("قبل النوم");
        expect(dosingToText({durationUnit: "continuous", durationValue: 4})).toBe("بصفة مستمرة");
        expect(dosingToText({frequency: "daily", frequencyValue: 2, frequencyText: "بعد الأكل"})).toBe("مرتين يوميًا");
    });
});

describe("dosingToText: tapering schedule @area:catalog", () => {
    const week = {durationUnit: "weeks", durationValue: 1} as const;

    test("dose, eye, then the steps joined with «، ثم» and «ثم يتوقف» @TAPER-025 @smoke", () => {
        expect(dosingToText({
            doseAmount: 2, doseUnit: "drop", eye: "right",
            taperSteps: [{frequency: "daily", frequencyValue: 4, ...week}, {doseAmount: 1, frequency: "daily", frequencyValue: 3, ...week}],
        })).toBe("نقطتين في العين اليمنى 4 مرات يوميًا لمدة أسبوع، ثم نقطة واحدة 3 مرات يوميًا لمدة أسبوع، ثم يتوقف");
    });

    test("steps without their own dose: the dose is written once @TAPER-026", () => {
        expect(dosingToText({
            doseAmount: 1, doseUnit: "drop",
            taperSteps: [{frequency: "daily", frequencyValue: 4, ...week}, {frequency: "daily", frequencyValue: 3, ...week}],
        })).toBe("نقطة واحدة 4 مرات يوميًا لمدة أسبوع، ثم 3 مرات يوميًا لمدة أسبوع، ثم يتوقف");
    });

    test("an empty step dose is the dose above, written again when it changed back @TAPER-027", () => {
        expect(dosingToText({
            doseAmount: 2, doseUnit: "drop",
            taperSteps: [
                {frequency: "daily", frequencyValue: 4, ...week},
                {doseAmount: 1, frequency: "daily", frequencyValue: 3, ...week},
                {frequency: "daily", frequencyValue: 2, ...week},
            ],
        })).toBe("نقطتين 4 مرات يوميًا لمدة أسبوع، ثم نقطة واحدة 3 مرات يوميًا لمدة أسبوع، ثم نقطتين مرتين يوميًا لمدة أسبوع، ثم يتوقف");
    });

    test("a unit without amount reads as one: step dose 1 is not written, 2 is @TAPER-028", () => {
        const steps = (second: number) => dosingToText({
            doseUnit: "drop",
            taperSteps: [{frequency: "daily", frequencyValue: 4, ...week}, {doseAmount: second, frequency: "daily", frequencyValue: 3, ...week}],
        });
        expect(steps(1)).toBe("نقطة واحدة 4 مرات يوميًا لمدة أسبوع، ثم 3 مرات يوميًا لمدة أسبوع، ثم يتوقف");
        expect(steps(2)).toBe("نقطة واحدة 4 مرات يوميًا لمدة أسبوع، ثم نقطتين 3 مرات يوميًا لمدة أسبوع، ثم يتوقف");
    });

    test("a step dose 0.5 reads half a drop @TAPER-029", () => {
        expect(dosingToText({
            doseAmount: 1, doseUnit: "drop",
            taperSteps: [{frequency: "daily", frequencyValue: 4, ...week}, {doseAmount: 0.5, frequency: "daily", frequencyValue: 3, ...week}],
        })).toBe("نقطة واحدة 4 مرات يوميًا لمدة أسبوع، ثم نصف نقطة 3 مرات يوميًا لمدة أسبوع، ثم يتوقف");
    });

    test("step doses without a unit on the dosing are not written @TAPER-030", () => {
        expect(dosingToText({
            taperSteps: [{doseAmount: 2, frequency: "daily", frequencyValue: 4, ...week}, {doseAmount: 1, frequency: "daily", frequencyValue: 3, ...week}],
        })).toBe("4 مرات يوميًا لمدة أسبوع، ثم 3 مرات يوميًا لمدة أسبوع، ثم يتوقف");
    });

    test("a continuous last step ends the sentence without «ثم يتوقف» @TAPER-031", () => {
        const text = dosingToText({
            doseUnit: "drop",
            taperSteps: [{frequency: "daily", frequencyValue: 2, ...week}, {frequency: "daily", frequencyValue: 1, durationUnit: "continuous"}],
        });
        expect(text).toBe("نقطة واحدة مرتين يوميًا لمدة أسبوع، ثم مرة واحدة يوميًا بصفة مستمرة");
        expect(text).not.toContain("يتوقف");
    });

    test("an until-next-visit last step ends the sentence without «ثم يتوقف» @TAPER-032", () => {
        const text = dosingToText({
            taperSteps: [{frequency: "daily", frequencyValue: 2, ...week}, {frequency: "daily", frequencyValue: 1, durationUnit: "untilNextVisit"}],
        });
        expect(text).toBe("مرتين يوميًا لمدة أسبوع، ثم مرة واحدة يوميًا حتى الزيارة القادمة");
        expect(text).not.toContain("يتوقف");
    });

    test("every-hours steps @TAPER-033", () => {
        expect(dosingToText({
            taperSteps: [
                {frequency: "everyHours", frequencyValue: 6, durationUnit: "days", durationValue: 3},
                {frequency: "everyHours", frequencyValue: 8, durationUnit: "days", durationValue: 3},
            ],
        })).toBe("كل 6 ساعات لمدة 3 أيام، ثم كل 8 ساعات لمدة 3 أيام، ثم يتوقف");
    });

    test("the eye is written once, before the first step @TAPER-034", () => {
        const text = dosingToText({
            doseAmount: 2, doseUnit: "drop", eye: "left",
            taperSteps: [{frequency: "daily", frequencyValue: 4, ...week}, {frequency: "daily", frequencyValue: 3, ...week}],
        });
        expect(text).toBe("نقطتين في العين اليسرى 4 مرات يوميًا لمدة أسبوع، ثم 3 مرات يوميًا لمدة أسبوع، ثم يتوقف");
        expect(text.match(/العين/g)).toHaveLength(1);
    });

    test("10 steps make one sentence with 9 joins plus «، ثم يتوقف», no line break @TAPER-035", () => {
        const taperSteps = Array.from({length: 10}, (_, i) => ({frequency: "daily" as const, frequencyValue: 10 - i, ...week}));
        const text = dosingToText({doseUnit: "drop", taperSteps});
        expect(text.split("، ثم ")).toHaveLength(11);
        expect(text.endsWith("، ثم يتوقف")).toBe(true);
        expect(text).not.toMatch(/[\r\n]/);
        expect(text.startsWith("نقطة واحدة 10 مرات يوميًا لمدة أسبوع، ثم 9 مرات يوميًا لمدة أسبوع")).toBe(true);
    });

    test("ointment with a changed step dose still reads a thin layer @TAPER-036", () => {
        expect(dosingToText({
            doseAmount: 1, doseUnit: "application",
            taperSteps: [{frequency: "daily", frequencyValue: 2, ...week}, {doseAmount: 2, frequency: "daily", frequencyValue: 1, ...week}],
        })).toBe("طبقة رقيقة مرتين يوميًا لمدة أسبوع، ثم طبقة رقيقة مرة واحدة يوميًا لمدة أسبوع، ثم يتوقف");
    });

    test("the separator is the Arabic comma «، ثم » (U+060C) @TAPER-037", () => {
        const text = dosingToText({
            taperSteps: [{frequency: "daily", frequencyValue: 2, ...week}, {frequency: "daily", frequencyValue: 1, ...week}],
        });
        expect(text).toContain("، ثم ");
        expect(text).not.toContain(", ");
    });
});
