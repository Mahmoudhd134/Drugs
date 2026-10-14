import type {TFunction} from "i18next";
import i18n from "../../i18n";
import {SAY_STOP_AFTER_LAST_STEP} from "./taperConfig.ts";
import {
    type DoseUnit,
    durationNeedsValue,
    frequencyNeedsValue,
    normalizeDosing,
    type Dosing,
    type TaperStep,
} from "./types.ts";

// Prescriptions are written in Arabic whatever the interface language (strings in rxTextAr.ts)
const OUTPUT_LANGUAGE = "ar";

const doseText = (t: TFunction, unit: DoseUnit, amount: number | null | undefined) =>
    amount === 0.5 ? t(`rxText.halfDose.${unit}`) : t(`rxText.dose.${unit}`, {count: amount ?? 1});

const frequencyText = (t: TFunction, d: Dosing | TaperStep) => {
    if (d.frequency === "custom") return "frequencyText" in d ? d.frequencyText ?? "" : "";
    if (frequencyNeedsValue(d.frequency) && d.frequencyValue != null) return t(`rxText.frequency.${d.frequency}`, {count: d.frequencyValue});
    if (d.frequency === "bedtime" || d.frequency === "asNeeded") return t(`rxText.frequency.${d.frequency}`);
    return "";
};

const durationText = (t: TFunction, d: Dosing | TaperStep) => {
    if (durationNeedsValue(d.durationUnit) && d.durationValue != null) return t(`rxText.duration.${d.durationUnit}`, {count: d.durationValue});
    if (d.durationUnit === "continuous" || d.durationUnit === "untilNextVisit") return t(`rxText.duration.${d.durationUnit}`);
    return "";
};

/**
 * "6 مرات يوميًا لمدة أسبوع، ثم نقطة واحدة 4 مرات يوميًا لمدة أسبوع، ثم يتوقف".
 * A step's dose is written only when it differs from the step before (the first step's dose
 * is the dosing's dose, written at the start of the sentence).
 */
const taperText = (t: TFunction, d: Dosing, steps: TaperStep[]) => {
    // An empty amount reads as one ("نقطة واحدة"), so compare it as 1
    let previousDose = d.doseAmount ?? 1;
    const parts = steps.map(s => {
        const dose = s.doseAmount ?? d.doseAmount ?? 1;
        const changed = dose !== previousDose;
        previousDose = dose;
        const doseChange = changed && d.doseUnit ? doseText(t, d.doseUnit, dose) : "";
        return [doseChange, frequencyText(t, s), durationText(t, s)].filter(Boolean).join(" ");
    });
    const last = steps[steps.length - 1];
    if (SAY_STOP_AFTER_LAST_STEP && durationNeedsValue(last?.durationUnit)) parts.push(t("rxText.taper.stop"));
    return parts.filter(Boolean).join(t("rxText.taper.then"));
};

/**
 * The dosing as one Arabic sentence, e.g. "نقطة واحدة في العين اليمنى 4 مرات يوميًا لمدة أسبوعين".
 * Missing parts are left out; returns "" when nothing is set.
 */
export const dosingToText = (dosing: Dosing | null | undefined): string => {
    const d = normalizeDosing(dosing);
    const t = i18n.getFixedT(OUTPUT_LANGUAGE);
    const parts: string[] = [];

    if (d.doseUnit) parts.push(doseText(t, d.doseUnit, d.doseAmount));

    // "ask" is resolved before a group reaches a prescription, so it has no wording
    if (d.eye && d.eye !== "ask") parts.push(t(`rxText.eye.${d.eye}`));

    if (d.taperSteps) {
        parts.push(taperText(t, d, d.taperSteps));
    } else {
        parts.push(frequencyText(t, d));
        parts.push(durationText(t, d));
    }

    return parts.filter(Boolean).join(" ");
};
