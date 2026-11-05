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

    test.each(rounding.map(row => [row.value, row.rounded] as const))("%d rounds to %d @TPL-048", (value, rounded) => {
        expect(roundTenth(value)).toBe(rounded);
    });
});
