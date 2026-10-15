import {describe, expect, test} from "vitest";
import {
    dosingErrors,
    durationNeedsValue,
    eyeKey,
    frequencyNeedsValue,
    hasDosingInstructions,
    isDosingEmpty,
    mergeDosing,
    normalizeDosing,
    normalizeStep,
    otherEye,
    sameDosing,
    type Dosing,
    type TaperStep,
} from "./types.ts";

// Rules: docs/features/dosing/business.md "القواعد التشغيلية", dosing/tech.md, tapering/business.md + tech.md.

const step = (fields: TaperStep = {}): TaperStep =>
    ({frequency: "daily", frequencyValue: 4, durationUnit: "weeks", durationValue: 1, ...fields});
const steps = (count: number, last: TaperStep = {}) =>
    Array.from({length: count}, (_, i) => (i === count - 1 ? step(last) : step()));

describe("dosingErrors: dose @area:catalog", () => {
    test("amount 0 or -1 with a unit is invalid @DOSE-043", () => {
        expect(dosingErrors({doseUnit: "drop", doseAmount: 0})).toEqual(["doseAmount"]);
        expect(dosingErrors({doseUnit: "drop", doseAmount: -1})).toEqual(["doseAmount"]);
    });

    test("amount 0.001, 0.5, 1000 with a unit is valid @DOSE-044", () => {
        for (const doseAmount of [0.001, 0.5, 1000]) expect(dosingErrors({doseUnit: "tablet", doseAmount})).toEqual([]);
    });

    test("amount 1000.5 or 1001 is invalid @DOSE-045", () => {
        expect(dosingErrors({doseUnit: "tablet", doseAmount: 1000.5})).toEqual(["doseAmount"]);
        expect(dosingErrors({doseUnit: "tablet", doseAmount: 1001})).toEqual(["doseAmount"]);
    });

    test("an amount without a unit is invalid: the unit is marked @DOSE-046", () => {
        expect(dosingErrors({doseAmount: 2})).toEqual(["doseUnit"]);
        expect(dosingErrors({doseAmount: 2, doseUnit: null})).toEqual(["doseUnit"]);
    });

    test("a unit without an amount is valid @DOSE-047", () => {
        expect(dosingErrors({doseUnit: "drop"})).toEqual([]);
        expect(dosingErrors({doseUnit: "drop", doseAmount: null})).toEqual([]);
    });
});

describe("dosingErrors: frequency and duration @area:catalog", () => {
    test("daily 0 / 1 / 24 / 25 times: invalid / valid / valid / invalid @DOSE-048", () => {
        const daily = (frequencyValue: number) => dosingErrors({frequency: "daily", frequencyValue});
        expect(daily(0)).toEqual(["frequencyValue"]);
        expect(daily(1)).toEqual([]);
        expect(daily(24)).toEqual([]);
        expect(daily(25)).toEqual(["frequencyValue"]);
    });

    test("daily without a number is invalid @DOSE-049", () => {
        expect(dosingErrors({frequency: "daily"})).toEqual(["frequencyValue"]);
        expect(dosingErrors({frequency: "daily", frequencyValue: null})).toEqual(["frequencyValue"]);
    });

    test("every 0 / 1 / 72 / 73 hours: invalid / valid / valid / invalid; no number invalid @DOSE-050", () => {
        const every = (frequencyValue: number | null) => dosingErrors({frequency: "everyHours", frequencyValue});
        expect(every(0)).toEqual(["frequencyValue"]);
        expect(every(1)).toEqual([]);
        expect(every(72)).toEqual([]);
        expect(every(73)).toEqual(["frequencyValue"]);
        expect(every(null)).toEqual(["frequencyValue"]);
    });

    test("custom without text, or only spaces, is invalid @DOSE-051", () => {
        expect(dosingErrors({frequency: "custom"})).toEqual(["frequencyText"]);
        expect(dosingErrors({frequency: "custom", frequencyText: ""})).toEqual(["frequencyText"]);
        expect(dosingErrors({frequency: "custom", frequencyText: "   "})).toEqual(["frequencyText"]);
        expect(dosingErrors({frequency: "custom", frequencyText: "بعد الأكل"})).toEqual([]);
    });

    test("days / weeks / months 0 / 1 / 365 / 366, and without a number @DOSE-055", () => {
        for (const durationUnit of ["days", "weeks", "months"] as const) {
            const duration = (durationValue: number | null) => dosingErrors({durationUnit, durationValue});
            expect(duration(0)).toEqual(["durationValue"]);
            expect(duration(1)).toEqual([]);
            expect(duration(365)).toEqual([]);
            expect(duration(366)).toEqual(["durationValue"]);
            expect(duration(null)).toEqual(["durationValue"]);
        }
    });

    test("bedtime, as needed, continuous and until next visit need no number", () => {
        expect(dosingErrors({frequency: "bedtime", durationUnit: "continuous"})).toEqual([]);
        expect(dosingErrors({frequency: "asNeeded", durationUnit: "untilNextVisit"})).toEqual([]);
    });

    test("an empty dosing is valid and empty @DOSE-059", () => {
        expect(dosingErrors({})).toEqual([]);
        expect(isDosingEmpty({})).toBe(true);
        expect(isDosingEmpty(null)).toBe(true);
        expect(isDosingEmpty(undefined)).toBe(true);
        expect(isDosingEmpty({doseAmount: null, frequencyValue: 3, frequencyText: "x", durationValue: 2})).toBe(true);
        expect(isDosingEmpty({eye: "none"})).toBe(false);
        expect(isDosingEmpty({doseAmount: 1})).toBe(false);
        expect(isDosingEmpty({doseUnit: "drop"})).toBe(false);
        expect(isDosingEmpty({frequency: "bedtime"})).toBe(false);
        expect(isDosingEmpty({durationUnit: "continuous"})).toBe(false);
        expect(isDosingEmpty({taperSteps: [step(), step()]})).toBe(false);
    });

    test("every error found at once", () => {
        expect(dosingErrors({
            doseAmount: 0, frequency: "daily", frequencyValue: 30, durationUnit: "days", durationValue: 0,
        })).toEqual(["doseAmount", "doseUnit", "frequencyValue", "durationValue"]);
    });
});

describe("normalizeDosing @area:catalog", () => {
    test("bedtime, as needed and custom drop the frequency value @DOSE-061", () => {
        for (const frequency of ["bedtime", "asNeeded", "custom"] as const)
            expect(normalizeDosing({frequency, frequencyValue: 3, frequencyText: "x"}).frequencyValue).toBeNull();
        expect(normalizeDosing({frequency: "daily", frequencyValue: 3}).frequencyValue).toBe(3);
        expect(normalizeDosing({frequency: "everyHours", frequencyValue: 8}).frequencyValue).toBe(8);
    });

    test("a non-custom frequency drops the text; custom text is trimmed @DOSE-062", () => {
        for (const frequency of ["daily", "everyHours", "bedtime", "asNeeded"] as const)
            expect(normalizeDosing({frequency, frequencyValue: 2, frequencyText: "بعد الأكل"}).frequencyText).toBeNull();
        expect(normalizeDosing({frequency: "custom", frequencyText: "  بعد الأكل  "}).frequencyText).toBe("بعد الأكل");
        expect(normalizeDosing({frequency: "custom", frequencyText: "   "}).frequencyText).toBeNull();
    });

    test("continuous and until next visit drop the duration value @DOSE-063", () => {
        expect(normalizeDosing({durationUnit: "continuous", durationValue: 4}).durationValue).toBeNull();
        expect(normalizeDosing({durationUnit: "untilNextVisit", durationValue: 4}).durationValue).toBeNull();
        for (const durationUnit of ["days", "weeks", "months"] as const)
            expect(normalizeDosing({durationUnit, durationValue: 4}).durationValue).toBe(4);
    });

    test("every field, null when not set", () => {
        expect(normalizeDosing(null)).toEqual({});
        expect(normalizeDosing({})).toEqual({
            doseAmount: null, doseUnit: null, frequency: null, frequencyValue: null, frequencyText: null,
            durationValue: null, durationUnit: null, eye: null, taperSteps: null,
        });
        expect(normalizeDosing({doseUnit: null, frequency: null, eye: undefined})).toMatchObject({doseUnit: null, frequency: null, eye: null});
    });

    test("normalizeStep drops values that don't apply and keeps the rest", () => {
        expect(normalizeStep(undefined)).toEqual({doseAmount: null, frequency: null, frequencyValue: null, durationValue: null, durationUnit: null});
        expect(normalizeStep({doseAmount: 2, frequency: "everyHours", frequencyValue: 6, durationUnit: "days", durationValue: 3}))
            .toEqual({doseAmount: 2, frequency: "everyHours", frequencyValue: 6, durationValue: 3, durationUnit: "days"});
        expect(frequencyNeedsValue("daily") && frequencyNeedsValue("everyHours") && !frequencyNeedsValue("custom")).toBe(true);
        expect(durationNeedsValue("months") && !durationNeedsValue("continuous") && !durationNeedsValue(null)).toBe(true);
    });
});

describe("sameDosing, eyeKey, otherEye, hasDosingInstructions @area:catalog", () => {
    test("dosings that differ only in fields that don't apply are the same @DOSE-067", () => {
        expect(sameDosing({frequency: "bedtime", frequencyValue: 3}, {frequency: "bedtime"})).toBe(true);
        expect(sameDosing({durationUnit: "continuous", durationValue: 4}, {durationUnit: "continuous", durationValue: null})).toBe(true);
        expect(sameDosing({frequency: "daily", frequencyValue: 2, frequencyText: "x"}, {frequency: "daily", frequencyValue: 2})).toBe(true);
        expect(sameDosing({frequency: "custom", frequencyText: " a "}, {frequency: "custom", frequencyText: "a"})).toBe(true);
        expect(sameDosing({frequency: "daily", frequencyValue: 2}, {frequency: "daily", frequencyValue: 3})).toBe(false);
        expect(sameDosing({doseUnit: "drop"}, {doseUnit: "tablet"})).toBe(false);
        expect(sameDosing({taperSteps: [step(), step({frequencyValue: 3})]}, {taperSteps: [step(), step({frequencyValue: 2})]})).toBe(false);
    });

    test("an unset eye equals no eye (both write no eye); other eyes differ", () => {
        expect(sameDosing({}, {eye: "none"})).toBe(true);
        expect(sameDosing({eye: null}, {eye: "none"})).toBe(true);
        expect(sameDosing({eye: "right"}, {eye: "none"})).toBe(false);
        expect(sameDosing({eye: "right"}, {})).toBe(false);
    });

    test("eyeKey is none without an eye; otherEye swaps right and left only @DOSE-068", () => {
        expect(eyeKey({})).toBe("none");
        expect(eyeKey(null)).toBe("none");
        expect(eyeKey({eye: null})).toBe("none");
        expect(eyeKey({eye: "left"})).toBe("left");
        expect(eyeKey({eye: "ask"})).toBe("ask");
        expect(otherEye("right")).toBe("left");
        expect(otherEye("left")).toBe("right");
        for (const eye of ["both", "none", "ask", null, undefined] as const) expect(otherEye(eye)).toBeNull();
    });

    test("only a dose unit, a frequency, a duration or steps are instructions; an eye alone is not @DOSE-088", () => {
        expect(hasDosingInstructions(null)).toBe(false);
        expect(hasDosingInstructions({})).toBe(false);
        for (const eye of ["right", "left", "both", "none", "ask"] as const) expect(hasDosingInstructions({eye})).toBe(false);
        expect(hasDosingInstructions({doseAmount: 2})).toBe(false);
        expect(hasDosingInstructions({doseUnit: "drop"})).toBe(true);
        expect(hasDosingInstructions({frequency: "asNeeded"})).toBe(true);
        expect(hasDosingInstructions({durationUnit: "continuous"})).toBe(true);
        expect(hasDosingInstructions({taperSteps: [step(), step()]})).toBe(true);
    });
});

describe("mergeDosing (drug default → group override) @area:catalog", () => {
    const base: Dosing = {
        doseAmount: 2, doseUnit: "drop", eye: "right", frequency: "daily", frequencyValue: 4,
        durationUnit: "weeks", durationValue: 2,
    };

    test("an empty override gives the base @DOSE-069", () => {
        expect(mergeDosing(base, {})).toEqual(normalizeDosing(base));
        expect(mergeDosing(base, null)).toEqual(normalizeDosing(base));
        expect(mergeDosing(base, undefined)).toEqual(normalizeDosing(base));
    });

    test("an override with only a dose: the dose from the override, the rest from the base @DOSE-070", () => {
        expect(mergeDosing(base, {doseAmount: 1, doseUnit: "tablet"})).toEqual(normalizeDosing({...base, doseAmount: 1, doseUnit: "tablet"}));
    });

    test("an override amount without a unit replaces the whole dose (amount + unit)", () => {
        expect(mergeDosing(base, {doseAmount: 3})).toMatchObject({doseAmount: 3, doseUnit: null, frequencyValue: 4});
    });

    test("an override unit without amount over 2 drops: the unit alone (reads as one) @DOSE-071", () => {
        const merged = mergeDosing(base, {doseUnit: "drop"});
        expect(merged.doseUnit).toBe("drop");
        expect(merged.doseAmount).toBeNull();
    });

    test("an override frequency takes its value or text from the override only @DOSE-072", () => {
        const override: Dosing = {frequency: "daily", frequencyValue: 6};
        for (const baseFrequency of [
            {frequency: "daily", frequencyValue: 4},
            {frequency: "everyHours", frequencyValue: 8},
            {frequency: "custom", frequencyText: "بعد الأكل"},
        ] as const) {
            const merged = mergeDosing({...base, ...baseFrequency}, override);
            expect(merged).toMatchObject({frequency: "daily", frequencyValue: 6, frequencyText: null});
        }
        // A bedtime override has no value: the base's 4 is not carried over
        expect(mergeDosing(base, {frequency: "bedtime"})).toMatchObject({frequency: "bedtime", frequencyValue: null});
    });

    test("an override duration takes its value from the override @DOSE-073", () => {
        expect(mergeDosing(base, {durationUnit: "days", durationValue: 5})).toMatchObject({durationUnit: "days", durationValue: 5});
        expect(mergeDosing(base, {durationUnit: "continuous"})).toMatchObject({durationUnit: "continuous", durationValue: null});
    });

    test("the override eye wins, also none and ask; no override eye keeps the base's @DOSE-074", () => {
        for (const eye of ["left", "both", "none", "ask"] as const) expect(mergeDosing(base, {eye}).eye).toBe(eye);
        expect(mergeDosing(base, {doseUnit: "tablet"}).eye).toBe("right");
    });

    test("a null base gives the normalized override @DOSE-075", () => {
        const override: Dosing = {doseAmount: 1, doseUnit: "drop", frequency: "custom", frequencyText: " x ", frequencyValue: 3, eye: "left"};
        expect(mergeDosing(null, override)).toEqual(normalizeDosing(override));
        expect(mergeDosing(undefined, override)).toEqual(normalizeDosing(override));
    });

    test("an override with steps replaces the base frequency and duration @TAPER-020", () => {
        const taperSteps = [step(), step({frequencyValue: 3})];
        const merged = mergeDosing(base, {taperSteps});
        expect(merged.taperSteps).toEqual(normalizeDosing({taperSteps}).taperSteps);
        expect(merged).toMatchObject({frequency: null, frequencyValue: null, durationUnit: null, durationValue: null});
        expect(merged).toMatchObject({doseAmount: 2, doseUnit: "drop", eye: "right"});
    });

    test("an override frequency or duration replaces the base's steps @TAPER-021", () => {
        const withSteps: Dosing = {doseUnit: "drop", taperSteps: [step(), step({frequencyValue: 3})]};
        expect(mergeDosing(withSteps, {frequency: "daily", frequencyValue: 2}))
            .toMatchObject({taperSteps: null, frequency: "daily", frequencyValue: 2, durationUnit: null});
        expect(mergeDosing(withSteps, {durationUnit: "days", durationValue: 5}))
            .toMatchObject({taperSteps: null, frequency: null, durationUnit: "days", durationValue: 5});
    });

    test("an override with only a dose or an eye keeps the base's steps @TAPER-022", () => {
        const withSteps: Dosing = {doseUnit: "drop", doseAmount: 2, taperSteps: [step(), step({frequencyValue: 3})]};
        const expected = normalizeDosing(withSteps).taperSteps;
        expect(mergeDosing(withSteps, {doseAmount: 1, doseUnit: "drop"}).taperSteps).toEqual(expected);
        expect(mergeDosing(withSteps, {eye: "left"}).taperSteps).toEqual(expected);
    });
});

describe("tapering rules (client side of the API rules) @area:catalog", () => {
    test("10 steps are accepted @TAPER-002", () => {
        expect(dosingErrors({doseUnit: "drop", taperSteps: steps(10)})).toEqual([]);
    });

    test("11 steps are refused: the client marks taperSteps @TAPER-003", () => {
        expect(dosingErrors({doseUnit: "drop", taperSteps: steps(11)})).toEqual(["taperSteps"]);
    });

    test("one step is stored as a plain dosing @TAPER-004", () => {
        const normalized = normalizeDosing({doseUnit: "drop", taperSteps: [step({frequencyValue: 4})]});
        expect(normalized).toMatchObject({taperSteps: null, frequency: "daily", frequencyValue: 4, durationUnit: "weeks", durationValue: 1});
        expect(dosingErrors({doseUnit: "drop", taperSteps: [step()]})).toEqual([]);
    });

    test("one step with dose 2 over a dosing dose 1: the dose becomes 2 @TAPER-005", () => {
        expect(normalizeDosing({doseUnit: "drop", doseAmount: 1, taperSteps: [step({doseAmount: 2})]}))
            .toMatchObject({doseAmount: 2, taperSteps: null, frequency: "daily"});
    });

    test("an empty list is no schedule @TAPER-006", () => {
        const dosing: Dosing = {doseUnit: "drop", frequency: "daily", frequencyValue: 2, taperSteps: []};
        expect(normalizeDosing(dosing)).toMatchObject({taperSteps: null, frequency: "daily", frequencyValue: 2});
        expect(dosingErrors(dosing)).toEqual([]);
    });

    test("steps with a dosing-level frequency and duration: the steps are kept, the rest cleared @TAPER-007", () => {
        const normalized = normalizeDosing({
            doseUnit: "drop", frequency: "custom", frequencyText: "x", durationUnit: "months", durationValue: 3,
            taperSteps: [step(), step({frequencyValue: 3})],
        });
        expect(normalized.taperSteps).toHaveLength(2);
        expect(normalized).toMatchObject({frequency: null, frequencyValue: null, frequencyText: null, durationUnit: null, durationValue: null});
    });

    test("a step with bedtime, as needed, custom or no frequency is invalid @TAPER-008", () => {
        for (const frequency of ["bedtime", "asNeeded", "custom", null] as const)
            expect(dosingErrors({taperSteps: [step({frequency}), step()]})).toEqual(["taperSteps.0.frequency"]);
    });

    test("step frequency values: daily 0/1/24/25 and every-hours 0/1/72/73 @TAPER-009", () => {
        const check = (frequency: "daily" | "everyHours", frequencyValue: number) =>
            dosingErrors({taperSteps: [step(), step({frequency, frequencyValue})]});
        expect(check("daily", 0)).toEqual(["taperSteps.1.frequencyValue"]);
        expect(check("daily", 1)).toEqual([]);
        expect(check("daily", 24)).toEqual([]);
        expect(check("daily", 25)).toEqual(["taperSteps.1.frequencyValue"]);
        expect(check("everyHours", 0)).toEqual(["taperSteps.1.frequencyValue"]);
        expect(check("everyHours", 1)).toEqual([]);
        expect(check("everyHours", 72)).toEqual([]);
        expect(check("everyHours", 73)).toEqual(["taperSteps.1.frequencyValue"]);
        expect(dosingErrors({taperSteps: [step({frequencyValue: null}), step()]})).toEqual(["taperSteps.0.frequencyValue"]);
    });

    test("a step in months is invalid, also the last @TAPER-010", () => {
        expect(dosingErrors({taperSteps: [step({durationUnit: "months", durationValue: 1}), step()]})).toEqual(["taperSteps.0.durationUnit"]);
        expect(dosingErrors({taperSteps: [step(), step({durationUnit: "months", durationValue: 1})]})).toEqual(["taperSteps.1.durationUnit"]);
    });

    test("step days/weeks 0/1/365/366 and without a number @TAPER-011", () => {
        for (const durationUnit of ["days", "weeks"] as const) {
            const check = (durationValue: number | null) => dosingErrors({taperSteps: [step({durationUnit, durationValue}), step()]});
            expect(check(0)).toEqual(["taperSteps.0.durationValue"]);
            expect(check(1)).toEqual([]);
            expect(check(365)).toEqual([]);
            expect(check(366)).toEqual(["taperSteps.0.durationValue"]);
            expect(check(null)).toEqual(["taperSteps.0.durationValue"]);
        }
    });

    test("a step without a period is invalid @TAPER-012", () => {
        expect(dosingErrors({taperSteps: [step(), step({durationUnit: null, durationValue: null})]})).toEqual(["taperSteps.1.durationUnit"]);
    });

    test("a continuous or until-next-visit last step is valid @TAPER-013", () => {
        expect(dosingErrors({taperSteps: [step(), step({durationUnit: "continuous", durationValue: null})]})).toEqual([]);
        expect(dosingErrors({taperSteps: [step(), step({durationUnit: "untilNextVisit", durationValue: null})]})).toEqual([]);
    });

    test("a continuous or until-next-visit step that is not last is invalid @TAPER-014", () => {
        for (const durationUnit of ["continuous", "untilNextVisit"] as const)
            expect(dosingErrors({taperSteps: [step({durationUnit}), step(), step()]})).toEqual(["taperSteps.0.durationUnit"]);
    });

    test("a step dose 0 / -1 / 1000.5 is invalid; 0.5 / 1000 valid @TAPER-015", () => {
        for (const doseAmount of [0, -1, 1000.5])
            expect(dosingErrors({doseUnit: "drop", taperSteps: [step(), step({doseAmount})]})).toEqual(["taperSteps.1.doseAmount"]);
        for (const doseAmount of [0.5, 1000])
            expect(dosingErrors({doseUnit: "drop", taperSteps: [step(), step({doseAmount})]})).toEqual([]);
    });

    test("the first step's dose becomes the dosing's dose and is cleared on the step @TAPER-017", () => {
        const normalized = normalizeDosing({doseUnit: "drop", doseAmount: 1, taperSteps: [step({doseAmount: 2}), step({doseAmount: 3})]});
        expect(normalized.doseAmount).toBe(2);
        expect(normalized.taperSteps?.[0].doseAmount).toBeNull();
        expect(normalized.taperSteps?.[1].doseAmount).toBe(3);
    });

    test("a later step dose equal to the dosing's dose is cleared @TAPER-018", () => {
        const normalized = normalizeDosing({doseUnit: "drop", doseAmount: 2, taperSteps: [step(), step({doseAmount: 1}), step({doseAmount: 2})]});
        expect(normalized.taperSteps?.map(s => s.doseAmount)).toEqual([null, 1, null]);
    });

    test("step values that don't apply are dropped @TAPER-019", () => {
        const normalized = normalizeDosing({
            taperSteps: [
                step({frequency: "everyHours", frequencyValue: 6, durationUnit: "days", durationValue: 3}),
                step({durationUnit: "continuous", durationValue: 5}),
            ],
        });
        expect(normalized.taperSteps?.[1]).toEqual({doseAmount: null, frequency: "daily", frequencyValue: 4, durationValue: null, durationUnit: "continuous"});
    });
});
