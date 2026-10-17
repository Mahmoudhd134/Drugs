# Test fixtures

Data files shared by the backend and frontend tests. Expected values come from the docs (feature `tech.md` /
`business.md` and the [test catalog](../../docs/testing/test-catalog.md)), never from running the app.

## `dosing-cases.json`: dosing and taper rule parity

The dosing and taper rules exist twice: C# `DosingRules` (`ClinicHub.Domain/Catalog/DosingRules.cs`) and TypeScript
`features/dosing/types.ts` + `taperConfig.ts` ([M1.6 design D6](../../docs/design/m1.6-test-foundation.md#d6-rule-parity-between-c-and-typescript)).
Both test suites run every case of this file (`DOSE-066`), so the two can't drift:

- **xUnit** (`tests/ClinicHub.UnitTests/Catalog/Parity`): `DosingRules.Normalize` + `IsValid`, and the drug or group
  validator with the API's error mapping (`errors`).
- **Vitest** (`ClinicHub.Web/src/features/dosing/parity.test.ts`): `dosingErrors` (valid = no errors; not for `apiOnly`
  rows) and `normalizeDosing` / `isDosingEmpty` against `normalized`. An `apiOnly` row the API refuses has nothing to
  check there and is left out of the Vitest rows (the C# side runs it), so no parity test passes with no assertion. It does not check `errors` (the SPA's per-field
  errors are its own) nor `ar`. Stryker leaves it out (`vitest.stryker.config.ts`: it reads a file outside
  `ClinicHub.Web`). Rows where the two sides disagree are known bugs there, run as expected failures
  (`test.fails.each(rows)("BUG-nnn: … %s @DOSE-064", …)`, checked in full, `valid` too), tagged with their narrow case
  only (not `@DOSE-066`, which the other rows keep covered); none today. The whitespace-only code rows («blank strings
  for codes normalize to null», «blank unit next to a set eye: only the eye stays», «dose amount with a blank unit»)
  run the same way (checked in full, `valid` too) as passing tests tagged `@DOSE-064` only.

### Shape

```json
{
  "cases": [
    {
      "ids": ["DOSE-048"],
      "name": "daily 25 times",
      "owner": "drugDefault",
      "input": { "frequency": "daily", "frequencyValue": 25 },
      "valid": false,
      "errors": [{ "field": "defaultDosing", "code": "invalidDosing" }]
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `ids` | yes | Catalog case IDs the row illustrates (`DOSE-…`, `TAPER-…`); `DOSE-066` (the parity case itself) when no narrower case fits |
| `name` | yes | Unique, short, English: what the row checks |
| `owner` | yes | Where the dosing is saved: `drugDefault` (a drug's `defaultDosing`: the `ask` eye is refused) or `groupLine` (a group line's `items[i].dosing`: `ask` allowed) |
| `input` | yes | The dosing exactly as the API takes it (camelCase JSON: `doseAmount`, `doseUnit`, `frequency`, `frequencyValue`, `frequencyText`, `durationValue`, `durationUnit`, `eye`, `taperSteps: [{ doseAmount, frequency, frequencyValue, durationValue, durationUnit }]`). Codes are the API's strings |
| `valid` | yes | Whether the API accepts it (C#: `IsValid(Normalize(input), allowAskEye: owner == "groupLine")`; TS: no `dosingErrors`) |
| `errors` | when `valid` is false | The API's `errors` for this dosing alone: `field` (`defaultDosing`, or `items[0].dosing` when the dosing is the first group line) and `code` (always `invalidDosing`). The SPA's own per-field errors (`doseAmount`, `taperSteps.<i>.durationUnit`…) are not listed |
| `normalized` | when `valid` is true | The normalized dosing with **only its set fields** (null and absent fields left out, also inside `taperSteps`); `null` = no dosing at all (the API stores null; TS: `isDosingEmpty`) |
| `apiOnly` | no | `true` when only the API enforces the row's rule, because the SPA can't produce that input: unknown or mis-cased codes, blank code strings, a NUL or more than 200 characters in the custom text (the field stops at 200), the `ask` eye on a drug default (the form only offers it on group lines), a one-step schedule whose step breaks the step rules (months, bedtime: the API folds it into a plain dosing first, the SPA checks the steps first and refuses it; an accepted difference, [tapering tech](../../docs/features/tapering/tech.md#edge-cases--limitations)). Both sides check `normalized` of valid rows; the TypeScript side skips the `valid` / `dosingErrors` comparison of these rows. The C# side checks every row |
| `ar` | no | The Arabic sentence of a valid dosing (`dosingToText`). Not used yet: no row has it and no test reads it (the sentences are tested in `dosingText.test.ts`) |

Compare `normalized` after dropping null/undefined fields on both sides. Numbers are plain JSON numbers (`2`, `0.5`);
no row relies on number formatting (`2` vs `2.0`).

### Adding a row

Take the expected values from the docs. Mark a row `apiOnly` only when the SPA can't produce its input (the list in
`apiOnly` above); a rule both sides enforce (e.g. TAPER-080, a first step dose without a unit, drug default and group
line) is not `apiOnly`, so the TypeScript side checks it too. When C# and TypeScript disagree on a row, the docs decide which one is wrong
(a known bug, [D9](../../docs/design/m1.6-test-foundation.md#d9-bugs-found-while-writing-tests)); a rule the docs
don't settle is a question for the user, and the row stays out until it is answered.
