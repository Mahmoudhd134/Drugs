import {screen} from "@testing-library/react";
import type {Dosing} from "../../features/dosing/types.ts";

/** The value the harness holds now. */
export const harnessValue = (): Dosing => JSON.parse(screen.getByTestId("dosing-value").textContent ?? "{}");

/** The «نص الروشتة» preview line of the dosing fields (`label` = the caption in the UI language). */
export const dosingPreview = (label = "نص الروشتة") => screen.getByText(label).nextElementSibling as HTMLElement;

/**
 * The elements whose `aria-label` matches `label` (exactly, or the pattern), in document order. The step badges are
 * found by their aria-label this way, not by getByLabelText: that one works out the labels of every element of the
 * page, seconds per call on a form with ten steps.
 */
const byAriaLabel = (label: string | RegExp) =>
    Array.from(document.body.querySelectorAll<HTMLElement>("[aria-label]"))
        .filter(element => {
            const value = element.getAttribute("aria-label")!;
            return typeof label === "string" ? value === label : label.test(value);
        });

/** The «المرحلة N» badges of the tapering steps, in order (`pattern` for another language). */
export const stepBadges = (pattern = /^المرحلة \d+$/) => byAriaLabel(pattern);

/** The row of tapering step `number` (1-based), found by its «المرحلة N» badge (`label` in another language). */
export const stepRow = (number: number, label = `المرحلة ${number}`) => {
    const badges = byAriaLabel(label);
    if (badges.length !== 1) throw new Error(`${badges.length} step badges "${label}"`);
    return badges[0].parentElement as HTMLElement;
};
