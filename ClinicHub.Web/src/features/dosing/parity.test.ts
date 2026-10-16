import {describe, expect, test} from "vitest";
import fixtureText from "../../../../tests/fixtures/dosing-cases.json?raw";
import {dosingErrors, isDosingEmpty, normalizeDosing, type Dosing} from "./types.ts";

/*
 * DOSE-066 (M1.6 design D6): the parity fixture against the TypeScript rules (`normalizeDosing`, `dosingErrors`, the
 * limits of taperConfig.ts). The C# side runs the same file (tests/ClinicHub.UnitTests/Catalog/Parity). Schema and
 * the meaning of `apiOnly`: tests/fixtures/README.md (both sides check `normalized`; only C# checks `valid` of an
 * `apiOnly` row). The optional `ar` sentence is not checked here.
 */

interface DosingCase {
    ids: string[];
    name: string;
    owner: "drugDefault" | "groupLine";
    input: Record<string, unknown>;
    valid: boolean;
    normalized?: Record<string, unknown> | null;
    errors?: { field: string; code: string }[];
    apiOnly?: boolean;
}

const cases = (JSON.parse(fixtureText) as { cases: DosingCase[] }).cases;

/**
 * BUG-590 (docs/testing/known-bugs.md): `normalizeDosing` keeps a whitespace-only code (`" "`), which the API's
 * `Normalize` turns into null (DOSE-064), and `dosingErrors` then counts `" "` as a unit (a dose amount with a blank
 * unit passes, the API refuses it). The SPA's selects never produce one (the rows are `apiOnly`), so these rows are
 * checked in full (`valid` too) as expected failures.
 */
const BLANK_CODE_ROWS = [
    "blank strings for codes normalize to null",
    "blank unit next to a set eye: only the eye stays",
    "dose amount with a blank unit",
];

/**
 * An `apiOnly` row the API refuses has nothing to check on this side (the TypeScript side skips `valid` of `apiOnly`
 * rows and `normalized` of invalid ones): the C# side runs it, here it is left out instead of passing with no assertion.
 */
const nothingToCheck = (row: DosingCase) => row.apiOnly === true && !row.valid;

/** Only the set fields: null and absent fields left out, also inside `taperSteps` (as the fixture writes them). */
const setFields = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(setFields);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, setFields(v)]));
};

const checkRow = (row: DosingCase, {checkValid = !row.apiOnly} = {}) => {
    expect.hasAssertions();
    // The JSON holds the API's code strings: the SPA's Dosing type, as the API would receive it
    const input = row.input as Dosing;

    if (checkValid) {
        const errors = dosingErrors(input);
        expect(errors.length === 0, `valid (dosingErrors: ${errors.join(", ") || "none"})`).toBe(row.valid);
    }

    if (row.valid) {
        if (row.normalized === null) {
            expect(isDosingEmpty(input), "no dosing at all").toBe(true);
        } else {
            expect(isDosingEmpty(input), "a dosing").toBe(false);
            expect(setFields(normalizeDosing(input)), "normalizeDosing, set fields only").toEqual(row.normalized);
        }
    }
};

const rows = (keep: (row: DosingCase) => boolean) =>
    cases.filter(keep).map(c => [c.name, c] as const);

const isBlankCodeRow = (row: DosingCase) => BLANK_CODE_ROWS.includes(row.name);

describe("Dosing rule parity: tests/fixtures/dosing-cases.json against types.ts @area:catalog", () => {
    test("the fixture has rows, each with a unique name, and the known-bug rows exist @DOSE-066", () => {
        expect(cases.length).toBeGreaterThanOrEqual(60);
        expect(new Set(cases.map(c => c.name)).size).toBe(cases.length);
        expect(cases.map(c => c.name)).toEqual(expect.arrayContaining(BLANK_CODE_ROWS));
    });

    test.each(rows(row => !isBlankCodeRow(row) && !nothingToCheck(row)))("%s @DOSE-066", (_name, row) => checkRow(row));

    test.fails.each(rows(isBlankCodeRow))(
        "BUG-590: normalizeDosing and dosingErrors keep a whitespace-only code that the API normalizes to null: %s @DOSE-064",
        (_name, row) => checkRow(row, {checkValid: true}));
});
