import {
    MAX_TAPER_STEPS,
    TAPER_DEFAULT_TIMES_PER_DAY,
    TAPER_STEP_DURATIONS,
    TAPER_STEP_FREQUENCIES,
} from "./taperConfig.ts";
import {durationNeedsValue, type Dosing, type DurationUnit, type TaperStep} from "./types.ts";

const DEFAULT_PERIOD: Pick<TaperStep, "durationValue" | "durationUnit"> = {durationValue: 1, durationUnit: "weeks"};

const isOpenEnded = (step: TaperStep | undefined) =>
    !!step?.durationUnit && !durationNeedsValue(step.durationUnit);

/** A step built from a plain frequency + duration (options a step can't use get defaults). */
export const scheduleToStep = (d: Dosing): TaperStep => ({
    ...(d.frequency && TAPER_STEP_FREQUENCIES.includes(d.frequency) && d.frequencyValue != null
        ? {frequency: d.frequency, frequencyValue: d.frequencyValue}
        : {frequency: "daily", frequencyValue: TAPER_DEFAULT_TIMES_PER_DAY}),
    ...(d.durationUnit && TAPER_STEP_DURATIONS.includes(d.durationUnit)
        ? {durationValue: d.durationValue, durationUnit: d.durationUnit}
        : DEFAULT_PERIOD),
});

/** The step after `step`: same period, one time a day less (down to once a day). */
const stepAfter = (step: TaperStep): TaperStep => ({
    ...step,
    frequencyValue: step.frequency === "daily" && (step.frequencyValue ?? 0) > 1
        ? (step.frequencyValue ?? 0) - 1
        : step.frequencyValue,
});

/** The first two steps of a new schedule, starting from the current frequency + duration. */
export const startSchedule = (d: Dosing): TaperStep[] => {
    const first = scheduleToStep(d);
    return [first, stepAfter(first)];
};

/**
 * Adds a step at the end. An open-ended last step ("continuous", "until next visit") stays last,
 * so the new step goes just before it.
 */
export const addStep = (steps: TaperStep[]): TaperStep[] => {
    const last = steps[steps.length - 1];
    if (!last) return [scheduleToStep({})];
    if (!isOpenEnded(last)) return [...steps, stepAfter(last)];

    const previous = steps[steps.length - 2];
    const inserted = stepAfter({...(previous ?? last), ...(previous ? {} : DEFAULT_PERIOD)});
    return [...steps.slice(0, -1), inserted, last];
};

const DAYS_PER_UNIT: Partial<Record<DurationUnit, number>> = {days: 1, weeks: 7, months: 30};

/** Total length of the fixed-length steps in days, and the open-ended period after them, if any. */
export const taperTotal = (steps: TaperStep[]) => ({
    days: steps.reduce((sum, s) => sum + (s.durationValue ?? 0) * (DAYS_PER_UNIT[s.durationUnit ?? "days"] ?? 0), 0),
    openEnded: isOpenEnded(steps[steps.length - 1]) ? steps[steps.length - 1].durationUnit ?? null : null,
});

export type TaperPlan = {
    /** Times a day in the first step */
    start: number;
    /** Times a day fewer in each next step */
    reduceBy: number;
    /** Times a day in the last step */
    downTo: number;
    /** Length of every step */
    every: number;
    unit: DurationUnit;
};

/** Steps from start down to downTo; null when the plan is invalid or needs too many steps. */
export const generateTaper = ({start, reduceBy, downTo, every, unit}: TaperPlan): TaperStep[] | null => {
    const valid = Number.isInteger(start) && start >= 1 && start <= 24
        && Number.isInteger(reduceBy) && reduceBy >= 1
        && Number.isInteger(downTo) && downTo >= 1 && downTo <= start
        && Number.isInteger(every) && every >= 1 && every <= 365
        && TAPER_STEP_DURATIONS.includes(unit);
    if (!valid) return null;

    // e.g. start 6, reduce by 2, down to 1 → 6, 4, 2, 1 (the last step is always "down to")
    const times: number[] = [];
    for (let t = start; t > downTo; t -= reduceBy) times.push(t);
    times.push(downTo);
    if (times.length > MAX_TAPER_STEPS) return null;
    return times.map(t => ({frequency: "daily", frequencyValue: t, durationValue: every, durationUnit: unit}));
};
