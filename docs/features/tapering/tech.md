# Tapering schedules (Feature 3): technical

## Summary
A [dosing](../dosing/tech.md) can hold an optional **tapering schedule**: 2–10 steps, each with
its own frequency and duration and, optionally, its own dose. It turns into one Arabic sentence,
e.g. «نقطتين في العين اليمنى 4 مرات يوميًا لمدة أسبوع، ثم نقطة واحدة 3 مرات يوميًا لمدة أسبوع، ثم يتوقف».
Because it lives on the shared `Dosing` value, it works everywhere dosing does: drug defaults,
group overrides and prescription lines, with the same inheritance and conflict rules.

## Data model
- `TaperStep` (`ClinicHub.Domain/Catalog/Dosing.cs`): `DoseAmount decimal?`, `Frequency`, `FrequencyValue int?`,
  `DurationValue int?`, `DurationUnit`.
- `Dosing.TaperSteps` (`List<TaperStep>`, nullable) is stored as **one JSON text column** on the
  owner table (`Drugs.DefaultDosing_TaperSteps`, `DrugGroupItems.Dosing_TaperSteps`), via an EF
  value converter + value comparer in `DosingConfiguration.Configure` (camelCase, nulls omitted).
- Why JSON and not a child table: steps are always read and written with their dosing, never
  queried on their own; a JSON column keeps the owned type flat, needs only one nullable column
  per owner, and new step fields (like the per-step dose) need no migration.
- Migration: the two nullable TEXT columns are part of `Initial` today. History: they came in `AddTaperSteps` (no data
  changes; tested up → down → up on a copy of the dev DB, row counts unchanged), later folded into the single PostgreSQL
  `Initial` ([migrations](../../tech/overview.md#migrations)).

## API
No new endpoints. `defaultDosing` (drugs) and `items[].dosing` (groups) accept and return
`taperSteps: [{ doseAmount, frequency, frequencyValue, durationValue, durationUnit }] | null`.
Invalid schedules return 400 `invalidDosing`.

## Backend (`ClinicHub.Domain/Catalog/DosingRules.cs`)
- Limits (mirrored in `taperConfig.ts`): `MaxTaperSteps = 10`, `TaperFrequencies = daily, everyHours`,
  `TaperDurationUnits = days, weeks`, `TaperLastDurationUnits` adds `continuous, untilNextVisit`.
- `Normalize`:
  - empty list → null; steps are cleaned like a dosing (values that don't apply are dropped);
  - when steps exist, the dosing's own frequency/duration are cleared;
  - the first step's dose becomes the dosing's dose; a step dose equal to the dosing's dose is cleared;
  - a **one-step** schedule becomes a plain frequency + duration (one canonical form).
- `IsValid`: 2–10 steps; every step needs an allowed frequency with its value (1–24 times /
  1–72 hours) and an allowed period with its value (1–365); open-ended periods only on the
  **last** step; step dose 0 < x ≤ 1000; no dosing-level frequency/duration next to steps.
  A step dose **from step 2 on** does not require the dosing's own unit, because a group line may
  inherit the unit from the drug. Step 1's dose becomes the dosing's dose (above), so it needs the
  unit like any dose (`invalidDosing` without it); the UI locks step 1's dose to the dose above.

## Frontend (`src/features/dosing/`)
- `taperConfig.ts`: the business switches, one line each: `MAX_TAPER_STEPS`,
  `TAPER_STEP_FREQUENCIES`, `TAPER_STEP_DURATIONS`, `TAPER_LAST_STEP_DURATIONS`,
  `SAY_STOP_AFTER_LAST_STEP` («ثم يتوقف»), `ALLOW_STEP_DOSE`, `ENABLE_TAPER_GENERATOR`,
  `TAPER_DEFAULT_TIMES_PER_DAY`. Keep the limits in sync with `DosingRules`.
- `types.ts`: `TaperStep`, `Dosing.taperSteps`, `normalizeStep`; `normalizeDosing`,
  `isDosingEmpty`, `dosingErrors` (step errors as `taperSteps.<i>.<field>`, checked before a
  single step is folded), `mergeDosing` (the **schedule** is one part: an override's steps replace
  the base's frequency/duration, and an override's frequency or duration replaces the base's
  steps), `sameDosing` (compares steps through `normalizeDosing`).
- `taper.ts`: `startSchedule` (2 steps from the current frequency/duration), `addStep` (copies
  the last step with one time a day less; an open-ended last step stays last), `taperTotal`,
  `generateTaper` (start, reduce by, down to, step length → steps; always ends at "down to").
- `dosingText.ts`: steps joined with «، ثم »; a step's dose is written only when it differs from
  the step before; a fixed-length last step ends with «، ثم يتوقف». Wording in `rxTextAr.ts`
  (`rxText.taper.then`, `rxText.taper.stop`).
- `components/DosingFields.tsx`: «تقليل تدريجي» switch (+ ⓘ). On: frequency/duration rows are
  replaced by `TaperStepsEditor`, pre-filled from the current (or, in inherit mode, the inherited)
  schedule. Off: the first step becomes the frequency/duration. In inherit mode, a caption says
  when the drug default is a taper.
- `components/TaperStepsEditor.tsx`: one row per step: dose (step 1 shows the dose above,
  locked; disabled without a unit), frequency + value, period + value, remove; "Add step",
  `TaperGenerator`, total-duration chip, and a hint when an open-ended period is not last.
  Grid uses 14 columns on ≥ sm; on phones each step wraps onto 2–3 lines with a divider.
- `components/TaperGenerator.tsx`: "Generate…" button + popover; shows the step count or an error.
- Dosing dialogs (drug form, group line, prescription line) are `maxWidth="md"` so a step row fits.
- Shared `components/common/InfoTip.tsx`: ⓘ icon with a tooltip (tap-friendly).
- i18n: `dosing.taper.*`, `dosing.amountInfo`, `dosing.askEyeInfo`, `dosing.inheritInfo`,
  `prescription.quickCopyInfo/editAndCopyInfo/clearAllInfo`, `groups.customDosingInfo`.
- Tooltips were added across the app: dose field, "Ask when adding" eye, group chips, copy and
  clear buttons, search clear button, mobile menu button.

## Edge cases & limitations
- A one-step schedule is saved as a normal dosing (switch is off when reopened).
- Accepted difference between the API and the SPA (user decision, M1.6): a one-step schedule whose step breaks the
  step rules (a period in months, «قبل النوم», «عند اللزوم», custom text) is folded first by the API (`Normalize`) and
  accepted when the resulting plain dosing is valid; the SPA checks the step rules before folding (`dosingErrors`) and
  refuses it. The SPA never sends such a schedule. Parity fixture rows: `apiOnly`
  ([tests/fixtures](../../../tests/fixtures/README.md)).
- Prescription lines in `localStorage` from before this feature have no `taperSteps` and load as before.
- Steps are inherited as a whole (no per-step inheritance from the drug default).
- Step frequencies are limited to "times a day" and "every N hours"; periods to days/weeks
  (plus open-ended on the last step). Change `taperConfig.ts` + `DosingRules` to widen.
- The generator only produces "times a day" steps without step doses; it replaces existing steps.
- A long schedule stays one sentence (one paragraph when copied).

## Testing notes
- API (scripted, 27 checks): save/read/update/remove a taper, one-step folding, taper-only
  dosing, 8 invalid schedules and 3 invalid step doses rejected, 10 steps accepted, open-ended
  last step, group override with taper and with step dose (unit inherited), first-step dose moved
  to the dosing.
- Browser (Arabic + English, desktop + 375px): switch on/off pre-fill, generator, open-ended last
  step + "Add step", step dose sentence, inherit-mode hint and copying the drug's steps, add group
  with "ask" eye, conflict dialog with both schedules, identical taper skipped on re-add,
  validation highlight, Edit & copy output, no horizontal overflow, tooltips.
