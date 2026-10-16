# Test fixtures

Data files shared by the backend and frontend tests. Expected values come from the docs (feature `tech.md` /
`business.md` and the [test catalog](../../docs/testing/test-catalog.md)), never from running the app.

## `dosing-cases.json`: dosing and taper rule parity

The dosing and taper rules exist twice: C# `DosingRules` (`ClinicHub.Domain/Catalog/DosingRules.cs`) and TypeScript
`features/dosing/types.ts` + `taperConfig.ts` ([M1.6 design D6](../../docs/design/m1.6-test-foundation.md#d6-rule-parity-between-c-and-typescript)).
Both test suites are meant to run every case of this file, so the two can't drift:

- **xUnit** (`tests/ClinicHub.UnitTests/Catalog/Parity`): `DosingRules.Normalize` + `IsValid`, and the drug or group
  validator with the API's error mapping (`errors`).
- **Vitest**: `normalizeDosing` + `dosingErrors`, and the Arabic sentence (`ar`). **Not wired yet**: no Vitest test
  reads this file today (the TypeScript rules are tested on their own in `features/dosing/types.test.ts` and
  `taper.test.ts`), so only the C# side runs it.

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
| `ar` | no | The Arabic sentence of a valid dosing (`dosingToText`); to be filled with the Vitest side (no row has it yet) |

Compare `normalized` after dropping null/undefined fields on both sides. Numbers are plain JSON numbers (`2`, `0.5`);
no row relies on number formatting (`2` vs `2.0`).

### Adding a row

Take the expected values from the docs. When C# and TypeScript disagree on a row, the docs decide which one is wrong
(a known bug, [D9](../../docs/design/m1.6-test-foundation.md#d9-bugs-found-while-writing-tests)); a rule the docs
don't settle is a question for the user, and the row stays out until it is answered.
