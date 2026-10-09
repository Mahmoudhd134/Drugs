import {MAX_TAPER_STEPS, TAPER_LAST_STEP_DURATIONS, TAPER_STEP_DURATIONS, TAPER_STEP_FREQUENCIES} from "./taperConfig.ts";

// Mirrors Drags.Api/Models/Dosing.cs (DosingCodes) and Shared/DosingRules.cs.
export const DOSE_UNITS = ["drop", "tablet", "capsule", "ml", "application"] as const;
export const FREQUENCIES = ["daily", "everyHours", "bedtime", "asNeeded", "custom"] as const;
export const DURATION_UNITS = ["days", "weeks", "months", "continuous", "untilNextVisit"] as const;
export const EYES = ["right", "left", "both", "none"] as const;
/** Group lines only: the eye is chosen when the group is added to a prescription. */
export const ASK_EYE = "ask";

export type DoseUnit = (typeof DOSE_UNITS)[number];
export type Frequency = (typeof FREQUENCIES)[number];
export type DurationUnit = (typeof DURATION_UNITS)[number];
export type Eye = (typeof EYES)[number];
export type DosingEye = Eye | typeof ASK_EYE;

/** How a drug is taken. Every field is optional. */
export interface Dosing {
    doseAmount?: number | null;
    doseUnit?: DoseUnit | null;
    frequency?: Frequency | null;
    /** Times per day for "daily", hours for "everyHours" */
    frequencyValue?: number | null;
    /** Free text for "custom" */
    frequencyText?: string | null;
    durationValue?: number | null;
    durationUnit?: DurationUnit | null;
    eye?: DosingEye | null;
    /**
     * Optional tapering schedule (2+ steps, limits in taperConfig.ts). When set, it replaces
     * frequency and duration; a one-step schedule is normalized into a plain frequency + duration.
     */
    taperSteps?: TaperStep[] | null;
}

/** One step of a tapering schedule, e.g. "1 drop 4 times a day for 1 week". Unit and eye stay on the dosing. */
export interface TaperStep {
    /** Optional dose for this step, in the dosing's unit; empty = the dosing's dose */
    doseAmount?: number | null;
    frequency?: Frequency | null;
    frequencyValue?: number | null;
    durationValue?: number | null;
    durationUnit?: DurationUnit | null;
}

export const MAX_FREQUENCY_TEXT_LENGTH = 200;

export const frequencyNeedsValue = (f?: Frequency | null) => f === "daily" || f === "everyHours";
export const durationNeedsValue = (u?: DurationUnit | null) => u === "days" || u === "weeks" || u === "months";

export const normalizeStep = (s: TaperStep | null | undefined): TaperStep => ({
    doseAmount: s?.doseAmount ?? null,
    frequency: s?.frequency || null,
    frequencyValue: frequencyNeedsValue(s?.frequency) ? s?.frequencyValue ?? null : null,
    durationValue: durationNeedsValue(s?.durationUnit) ? s?.durationValue ?? null : null,
    durationUnit: s?.durationUnit || null,
});

/**
 * Drops fields that don't apply to the chosen options (same rules as the API). A tapering
 * schedule clears frequency and duration; a one-step schedule becomes a plain frequency + duration.
 */
export const normalizeDosing = (d: Dosing | null | undefined): Dosing => {
    if (!d) return {};
    let steps = d.taperSteps?.length ? d.taperSteps.map(normalizeStep) : null;
    let doseAmount = d.doseAmount ?? null;
    let schedule: Dosing = d;
    if (steps) {
        // The first step's dose is the dosing's dose; a step dose equal to it is just "the same dose"
        doseAmount = steps[0].doseAmount ?? doseAmount;
        steps = steps.map((s, i) => (i === 0 || s.doseAmount === doseAmount ? {...s, doseAmount: null} : s));
        schedule = steps.length === 1 ? steps[0] : {};
        if (steps.length === 1) steps = null;
    }
    return {
        doseAmount,
        doseUnit: d.doseUnit || null,
        frequency: schedule.frequency || null,
        frequencyValue: frequencyNeedsValue(schedule.frequency) ? schedule.frequencyValue ?? null : null,
        frequencyText: schedule.frequency === "custom" ? schedule.frequencyText?.trim() || null : null,
        durationValue: durationNeedsValue(schedule.durationUnit) ? schedule.durationValue ?? null : null,
        durationUnit: schedule.durationUnit || null,
        eye: d.eye || null,
        taperSteps: steps,
    };
};

export const isDosingEmpty = (d: Dosing | null | undefined) => {
    const n = normalizeDosing(d);
    return n.doseAmount == null && !n.doseUnit && !n.frequency && !n.durationUnit && !n.eye && !n.taperSteps;
};

export type TaperStepField = "doseAmount" | "frequency" | "frequencyValue" | "durationUnit" | "durationValue";
export type DosingField =
    | "doseAmount" | "doseUnit" | "frequencyValue" | "frequencyText" | "durationValue"
    /** Too many steps */
    | "taperSteps"
    | `taperSteps.${number}.${TaperStepField}`;

const doseValid = (amount: number | null | undefined) => amount == null || (amount > 0 && amount <= 1000);
const inRange = (value: number | null | undefined, min: number, max: number) => value != null && value >= min && value <= max;
const frequencyValueValid = (f: Frequency | null | undefined, value: number | null | undefined) =>
    f === "daily" ? inRange(value, 1, 24) : f === "everyHours" ? inRange(value, 1, 72) : true;
const durationValueValid = (u: DurationUnit | null | undefined, value: number | null | undefined) =>
    durationNeedsValue(u) ? inRange(value, 1, 365) : true;

/** Fields that are missing or out of range (same limits as the API). Empty list = valid. */
export const dosingErrors = (d: Dosing): DosingField[] => {
    const n = normalizeDosing(d);
    const errors: DosingField[] = [];
    if (!doseValid(n.doseAmount)) errors.push("doseAmount");
    if (n.doseAmount != null && !n.doseUnit) errors.push("doseUnit");

    // Steps are checked as edited (before a single step is folded into frequency + duration)
    const steps = d.taperSteps?.length ? d.taperSteps.map(normalizeStep) : null;
    if (steps) {
        if (steps.length > MAX_TAPER_STEPS) errors.push("taperSteps");
        steps.forEach((s, i) => {
            const units = i === steps.length - 1 ? TAPER_LAST_STEP_DURATIONS : TAPER_STEP_DURATIONS;
            if (!doseValid(s.doseAmount)) errors.push(`taperSteps.${i}.doseAmount`);
            if (!s.frequency || !TAPER_STEP_FREQUENCIES.includes(s.frequency)) errors.push(`taperSteps.${i}.frequency`);
            else if (!frequencyValueValid(s.frequency, s.frequencyValue)) errors.push(`taperSteps.${i}.frequencyValue`);
            if (!s.durationUnit || !units.includes(s.durationUnit)) errors.push(`taperSteps.${i}.durationUnit`);
            else if (!durationValueValid(s.durationUnit, s.durationValue)) errors.push(`taperSteps.${i}.durationValue`);
        });
        return errors;
    }

    if (!frequencyValueValid(n.frequency, n.frequencyValue)) errors.push("frequencyValue");
    if (n.frequency === "custom" && !n.frequencyText) errors.push("frequencyText");
    if (!durationValueValid(n.durationUnit, n.durationValue)) errors.push("durationValue");
    return errors;
};

/** A drug can appear once per eye in a prescription or group; this is the eye part of that key. */
export const eyeKey = (d: Dosing | null | undefined): DosingEye => d?.eye ?? "none";

export const otherEye = (eye: DosingEye | null | undefined): Eye | null =>
    eye === "right" ? "left" : eye === "left" ? "right" : null;

/**
 * Layers an override on top of a base dosing. Each part is inherited as a whole when the
 * override leaves it empty: dose (amount + unit), frequency (+ value/text), duration (+ value), eye.
 * A tapering schedule counts as frequency + duration together: an override's schedule replaces
 * the base's frequency and duration, and an override's frequency or duration replaces the base's schedule.
 */
export const mergeDosing = (base: Dosing | null | undefined, override: Dosing | null | undefined): Dosing => {
    const b = normalizeDosing(base);
    const o = normalizeDosing(override);
    const dose = o.doseUnit || o.doseAmount != null ? o : b;
    const overridesSchedule = !!(o.taperSteps || o.frequency || o.durationUnit);
    const taperSteps = o.taperSteps ?? (overridesSchedule ? null : b.taperSteps);
    const frequency = o.frequency ? o : b;
    const duration = o.durationUnit ? o : b;
    return normalizeDosing({
        doseAmount: dose.doseAmount,
        doseUnit: dose.doseUnit,
        frequency: taperSteps ? null : frequency.frequency,
        frequencyValue: frequency.frequencyValue,
        frequencyText: frequency.frequencyText,
        durationValue: duration.durationValue,
        durationUnit: taperSteps ? null : duration.durationUnit,
        eye: o.eye ?? b.eye,
        taperSteps,
    });
};

export const sameDosing = (a: Dosing | null | undefined, b: Dosing | null | undefined) =>
    JSON.stringify(normalizeDosing(a)) === JSON.stringify(normalizeDosing(b));
