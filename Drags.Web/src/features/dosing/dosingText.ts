import i18n from "../../i18n";
import {durationNeedsValue, frequencyNeedsValue, normalizeDosing, type Dosing} from "./types.ts";

// Prescriptions are written in Arabic whatever the interface language (strings in rxTextAr.ts)
const OUTPUT_LANGUAGE = "ar";

/**
 * The dosing as one Arabic sentence, e.g. "نقطة واحدة في العين اليمنى 4 مرات يوميًا لمدة أسبوعين".
 * Missing parts are left out; returns "" when nothing is set.
 */
export const dosingToText = (dosing: Dosing | null | undefined): string => {
    const d = normalizeDosing(dosing);
    const t = i18n.getFixedT(OUTPUT_LANGUAGE);
    const parts: string[] = [];

    if (d.doseUnit) {
        parts.push(d.doseAmount === 0.5
            ? t(`rxText.halfDose.${d.doseUnit}`)
            : t(`rxText.dose.${d.doseUnit}`, {count: d.doseAmount ?? 1}));
    }

    if (d.eye) parts.push(t(`rxText.eye.${d.eye}`));

    if (d.frequency === "custom") parts.push(d.frequencyText ?? "");
    else if (frequencyNeedsValue(d.frequency) && d.frequencyValue != null) parts.push(t(`rxText.frequency.${d.frequency}`, {count: d.frequencyValue}));
    else if (d.frequency === "bedtime" || d.frequency === "asNeeded") parts.push(t(`rxText.frequency.${d.frequency}`));

    if (durationNeedsValue(d.durationUnit) && d.durationValue != null) parts.push(t(`rxText.duration.${d.durationUnit}`, {count: d.durationValue}));
    else if (d.durationUnit === "continuous" || d.durationUnit === "untilNextVisit") parts.push(t(`rxText.duration.${d.durationUnit}`));

    return parts.filter(Boolean).join(" ");
};
