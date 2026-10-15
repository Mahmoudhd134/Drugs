import {screen} from "@testing-library/react";
import type {Dosing} from "../../features/dosing/types.ts";

/** The value the harness holds now. */
export const harnessValue = (): Dosing => JSON.parse(screen.getByTestId("dosing-value").textContent ?? "{}");

/** The «نص الروشتة» preview line of the dosing fields (`label` = the caption in the UI language). */
export const dosingPreview = (label = "نص الروشتة") => screen.getByText(label).nextElementSibling as HTMLElement;

/** The row of tapering step `number` (1-based), found by its «المرحلة N» badge. */
export const stepRow = (number: number, label = `المرحلة ${number}`) =>
    screen.getByLabelText(label).parentElement as HTMLElement;
