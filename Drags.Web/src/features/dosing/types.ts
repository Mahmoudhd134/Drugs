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
}

export const MAX_FREQUENCY_TEXT_LENGTH = 200;

export const frequencyNeedsValue = (f?: Frequency | null) => f === "daily" || f === "everyHours";
export const durationNeedsValue = (u?: DurationUnit | null) => u === "days" || u === "weeks" || u === "months";

/** Drops fields that don't apply to the chosen options (same rules as the API). */
export const normalizeDosing = (d: Dosing | null | undefined): Dosing => {
    if (!d) return {};
    return {
        doseAmount: d.doseAmount ?? null,
        doseUnit: d.doseUnit || null,
        frequency: d.frequency || null,
        frequencyValue: frequencyNeedsValue(d.frequency) ? d.frequencyValue ?? null : null,
        frequencyText: d.frequency === "custom" ? d.frequencyText?.trim() || null : null,
        durationValue: durationNeedsValue(d.durationUnit) ? d.durationValue ?? null : null,
        durationUnit: d.durationUnit || null,
        eye: d.eye || null,
    };
};

export const isDosingEmpty = (d: Dosing | null | undefined) => {
    const n = normalizeDosing(d);
    return n.doseAmount == null && !n.doseUnit && !n.frequency && !n.durationUnit && !n.eye;
};

export type DosingField = "doseAmount" | "doseUnit" | "frequencyValue" | "frequencyText" | "durationValue";

/** Fields that are missing or out of range (same limits as the API). Empty list = valid. */
export const dosingErrors = (d: Dosing): DosingField[] => {
    const n = normalizeDosing(d);
    const errors: DosingField[] = [];
    if (n.doseAmount != null && !(n.doseAmount > 0 && n.doseAmount <= 1000)) errors.push("doseAmount");
    if (n.doseAmount != null && !n.doseUnit) errors.push("doseUnit");
    if (n.frequency === "daily" && !(n.frequencyValue != null && n.frequencyValue >= 1 && n.frequencyValue <= 24)) errors.push("frequencyValue");
    if (n.frequency === "everyHours" && !(n.frequencyValue != null && n.frequencyValue >= 1 && n.frequencyValue <= 72)) errors.push("frequencyValue");
    if (n.frequency === "custom" && !n.frequencyText) errors.push("frequencyText");
    if (durationNeedsValue(n.durationUnit) && !(n.durationValue != null && n.durationValue >= 1 && n.durationValue <= 365)) errors.push("durationValue");
    return errors;
};

/** A drug can appear once per eye in a prescription or group; this is the eye part of that key. */
export const eyeKey = (d: Dosing | null | undefined): DosingEye => d?.eye ?? "none";

export const otherEye = (eye: DosingEye | null | undefined): Eye | null =>
    eye === "right" ? "left" : eye === "left" ? "right" : null;

/**
 * Layers an override on top of a base dosing. Each part is inherited as a whole when the
 * override leaves it empty: dose (amount + unit), frequency (+ value/text), duration (+ value), eye.
 */
export const mergeDosing = (base: Dosing | null | undefined, override: Dosing | null | undefined): Dosing => {
    const b = normalizeDosing(base);
    const o = normalizeDosing(override);
    const dose = o.doseUnit || o.doseAmount != null ? o : b;
    const frequency = o.frequency ? o : b;
    const duration = o.durationUnit ? o : b;
    return normalizeDosing({
        doseAmount: dose.doseAmount,
        doseUnit: dose.doseUnit,
        frequency: frequency.frequency,
        frequencyValue: frequency.frequencyValue,
        frequencyText: frequency.frequencyText,
        durationValue: duration.durationValue,
        durationUnit: duration.durationUnit,
        eye: o.eye ?? b.eye,
    });
};

export const sameDosing = (a: Dosing | null | undefined, b: Dosing | null | undefined) =>
    JSON.stringify(normalizeDosing(a)) === JSON.stringify(normalizeDosing(b));
