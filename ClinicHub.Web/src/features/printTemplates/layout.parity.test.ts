import {describe, expect, test} from "vitest";
import fixtureText from "../../../../tests/fixtures/print-layout-cases.json?raw";
import {roundTenth, validateLayout} from "./layout.ts";
import type {LayoutError, PrintLayout} from "./types.ts";

/*
 * TPL-048: the shared rule cases (contract § 4.2; schema: tests/fixtures/README.md) against the TypeScript rules. The C# side
 * runs the same file (tests/ClinicHub.UnitTests/Prescriptions/Templates). Stryker leaves this file out: it reads a file outside
 * ClinicHub.Web; layout.test.ts carries its own rows.
 */

type LayoutCase = { ids: string[]; name: string; valid: boolean; layout: PrintLayout; errors: LayoutError[] };

const {rounding, cases} = JSON.parse(fixtureText) as { rounding: { value: number; rounded: number }[]; cases: LayoutCase[] };

describe("the shared print layout cases @area:admin", () => {
    test("the file holds its rows", () => {
        expect(cases.length).toBeGreaterThanOrEqual(96);
        expect(rounding.length).toBeGreaterThanOrEqual(10);
    });

    test.each(cases.map(row => [row.name, row] as const))("%s: the same errors, in the same order @TPL-048", (_name, row) => {
        expect(validateLayout(row.layout)).toEqual(row.errors);
        expect(row.errors.length === 0).toBe(row.valid);
    });

    const rowsOf = (id: string) => cases.filter(row => row.ids.includes(id)).map(row => [row.name, row] as const);

    test.each(rowsOf("TPL-610"))("%s: server and client agree on the correction @TPL-610", (_name, row) => {
        expect(validateLayout(row.layout)).toEqual(row.errors);
    });

    test.each(rowsOf("TPL-607"))("%s: the limits, on the shared row @TPL-607", (_name, row) => {
        expect(validateLayout(row.layout)).toEqual(row.errors);
    });

    test.each(rowsOf("TPL-705"))("%s: calibration excuses no box, on the shared row @TPL-705", (_name, row) => {
        expect(validateLayout(row.layout)).toEqual(row.errors);
    });

    test.each(rowsOf("TPL-724"))("%s: over 50 items, the same errors @TPL-724", (_name, row) => {
        expect(row.layout.items.length).toBeGreaterThan(50);
        expect(validateLayout(row.layout)).toEqual(row.errors);
    });

    test("the rows that hold a null and a range say the null first @TPL-610", () => {
        const named = (name: string) => cases.find(row => row.name === name)!.errors;
        expect(named("calibration X out of range and Y null: the null first")).toEqual([
            {field: "calibration.yMm", code: "invalidRequest"},
            {field: "calibration.xMm", code: "templateCalibrationInvalid"},
        ]);
        expect(named("calibration X null and Y out of range: the null first")).toEqual([
            {field: "calibration.xMm", code: "invalidRequest"},
            {field: "calibration.yMm", code: "templateCalibrationInvalid"},
        ]);
    });

    test.each(rounding.map(row => [row.value, row.rounded] as const))("%d rounds to %d @TPL-048", (value, rounded) => {
        expect(roundTenth(value)).toBe(rounded);
    });
});
