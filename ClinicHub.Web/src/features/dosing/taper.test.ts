import {describe, expect, test} from "vitest";
import {addStep, generateTaper, scheduleToStep, startSchedule, taperTotal, type TaperPlan} from "./taper.ts";
import type {TaperStep} from "./types.ts";

// Rules: docs/features/tapering/business.md "سيناريوهات الاستخدام", tapering/tech.md "Frontend".

const daily = (frequencyValue: number, durationValue = 1, durationUnit: TaperStep["durationUnit"] = "weeks"): TaperStep =>
    ({frequency: "daily", frequencyValue, durationValue, durationUnit});

describe("startSchedule @area:catalog", () => {
    test("daily 4 for 1 week starts [daily 4, 1 week], [daily 3, 1 week] @TAPER-038 @smoke", () => {
        expect(startSchedule({frequency: "daily", frequencyValue: 4, durationUnit: "weeks", durationValue: 1}))
            .toEqual([daily(4), daily(3)]);
    });

    test("an empty dosing starts [daily 4, 1 week], [daily 3, 1 week] @TAPER-039", () => {
        expect(startSchedule({})).toEqual([daily(4), daily(3)]);
    });

    test("daily 1: both steps daily 1, never below 1 @TAPER-040", () => {
        expect(startSchedule({frequency: "daily", frequencyValue: 1, durationUnit: "days", durationValue: 3}))
            .toEqual([daily(1, 3, "days"), daily(1, 3, "days")]);
    });

    test("every 6 hours for 5 days: both steps every 6 hours, 5 days @TAPER-041", () => {
        const step: TaperStep = {frequency: "everyHours", frequencyValue: 6, durationValue: 5, durationUnit: "days"};
        expect(startSchedule({frequency: "everyHours", frequencyValue: 6, durationUnit: "days", durationValue: 5})).toEqual([step, step]);
    });

    test("options a step can't use start from daily 4 and/or 1 week @TAPER-042", () => {
        for (const frequency of ["bedtime", "asNeeded", "custom"] as const)
            expect(startSchedule({frequency, frequencyText: "x", durationUnit: "days", durationValue: 5}))
                .toEqual([daily(4, 5, "days"), daily(3, 5, "days")]);
        for (const durationUnit of ["months", "continuous", "untilNextVisit"] as const)
            expect(startSchedule({frequency: "daily", frequencyValue: 6, durationUnit, durationValue: 2}))
                .toEqual([daily(6), daily(5)]);
        // A leftover number on a frequency a step can't use changes nothing
        expect(scheduleToStep({frequency: "bedtime", frequencyValue: 3})).toEqual(daily(4));
        // A daily frequency without its number can't be a step either
        expect(scheduleToStep({frequency: "daily"})).toEqual(daily(4));
    });
});

describe("addStep @area:catalog", () => {
    test("after [daily 3, 1 week] adds [daily 2, 1 week] @TAPER-043", () => {
        expect(addStep([daily(4), daily(3)])).toEqual([daily(4), daily(3), daily(2)]);
    });

    test("after daily 1 the new step stays daily 1 @TAPER-044", () => {
        expect(addStep([daily(2), daily(1)])).toEqual([daily(2), daily(1), daily(1)]);
    });

    test("an open-ended last step stays last: the new step goes before it @TAPER-045", () => {
        const open: TaperStep = {frequency: "daily", frequencyValue: 2, durationUnit: "continuous", durationValue: null};
        expect(addStep([daily(4), open])).toEqual([daily(4), daily(3), open]);
        const untilVisit: TaperStep = {...open, durationUnit: "untilNextVisit"};
        expect(addStep([daily(4), daily(3), untilVisit])).toEqual([daily(4), daily(3), daily(2), untilVisit]);
    });

    test("an open-ended only step: the new step takes its frequency and 1 week", () => {
        const open: TaperStep = {frequency: "daily", frequencyValue: 3, durationUnit: "continuous", durationValue: null};
        expect(addStep([open])).toEqual([daily(2), open]);
    });

    test("no steps yet: a default step", () => {
        expect(addStep([])).toEqual([daily(4)]);
    });

    test("every-hours steps are copied as they are", () => {
        const step: TaperStep = {frequency: "everyHours", frequencyValue: 6, durationValue: 3, durationUnit: "days"};
        expect(addStep([step])).toEqual([step, step]);
    });
});

describe("taperTotal @area:catalog", () => {
    test("fixed steps add up in days; days, weeks and months", () => {
        expect(taperTotal([daily(4), daily(3)])).toEqual({days: 14, openEnded: null});
        expect(taperTotal([daily(4, 3, "days"), daily(3, 1, "weeks")])).toEqual({days: 10, openEnded: null});
        expect(taperTotal([daily(4, 1, "months")])).toEqual({days: 30, openEnded: null});
    });

    test("an open-ended last step is told apart", () => {
        expect(taperTotal([daily(4), {frequency: "daily", frequencyValue: 2, durationUnit: "continuous"}]))
            .toEqual({days: 7, openEnded: "continuous"});
        expect(taperTotal([daily(4), {frequency: "daily", frequencyValue: 2, durationUnit: "untilNextVisit"}]))
            .toEqual({days: 7, openEnded: "untilNextVisit"});
    });

    test("steps without a duration count as 0", () => {
        expect(taperTotal([{frequency: "daily", frequencyValue: 4}, {frequency: "daily", frequencyValue: 3, durationUnit: "weeks"}]))
            .toEqual({days: 0, openEnded: null});
        expect(taperTotal([])).toEqual({days: 0, openEnded: null});
    });
});

describe("generateTaper @area:catalog", () => {
    const plan = (fields: Partial<TaperPlan>): TaperPlan => ({start: 6, reduceBy: 2, downTo: 1, every: 1, unit: "weeks", ...fields});
    const times = (steps: TaperStep[] | null) => steps?.map(s => s.frequencyValue);

    test("start 6, reduce by 2, down to 1, 1 week each: 6, 4, 2, 1 @TAPER-051", () => {
        expect(generateTaper(plan({}))).toEqual([daily(6), daily(4), daily(2), daily(1)]);
    });

    test("start 4, reduce 1, down to 1, 3 days: 4, 3, 2, 1 for 3 days each @TAPER-052", () => {
        expect(generateTaper(plan({start: 4, reduceBy: 1, every: 3, unit: "days"})))
            .toEqual([daily(4, 3, "days"), daily(3, 3, "days"), daily(2, 3, "days"), daily(1, 3, "days")]);
    });

    test("start 6, reduce 4, down to 1: 6, 2, 1 (always ends at down to) @TAPER-053", () => {
        expect(times(generateTaper(plan({reduceBy: 4})))).toEqual([6, 2, 1]);
        expect(times(generateTaper(plan({start: 8, reduceBy: 3, downTo: 2})))).toEqual([8, 5, 2]);
    });

    test("start 10, reduce 1, down to 1: 10 steps @TAPER-054", () => {
        expect(times(generateTaper(plan({start: 10, reduceBy: 1})))).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    });

    test("start 11, reduce 1, down to 1 (11 steps): no result @TAPER-055", () => {
        expect(generateTaper(plan({start: 11, reduceBy: 1}))).toBeNull();
    });

    test("numbers out of range, not whole or empty: no result @TAPER-056", () => {
        for (const bad of [
            {start: 0}, {start: 25}, {start: 25, reduceBy: 24}, {reduceBy: 0}, {downTo: 0}, {downTo: 7}, {every: 0}, {every: 366},
            {start: 2.5}, {reduceBy: 1.5}, {downTo: 0.5}, {every: 1.5},
            {start: Number("")}, {start: NaN}, {reduceBy: NaN}, {downTo: NaN}, {every: NaN},
        ]) expect(generateTaper(plan(bad))).toBeNull();
        expect(generateTaper(plan({unit: "months"}))).toBeNull();
        expect(generateTaper(plan({unit: "continuous"}))).toBeNull();
    });

    test("the limits themselves are allowed: start 24, 365 days, reduce 3: 24, 21, …, 3, 1 @TAPER-057", () => {
        const steps = generateTaper(plan({start: 24, reduceBy: 3, every: 365, unit: "days"}));
        expect(times(steps)).toEqual([24, 21, 18, 15, 12, 9, 6, 3, 1]);
        expect(steps?.every(s => s.durationValue === 365 && s.durationUnit === "days")).toBe(true);
        expect(times(generateTaper(plan({start: 1, reduceBy: 1, downTo: 1})))).toEqual([1]);
        expect(times(generateTaper(plan({start: 24, reduceBy: 24, downTo: 1, every: 1})))).toEqual([24, 1]);
    });
});
