# Structured dosing (Feature 1): technical

## Summary
A reusable **Dosing** value (dose + unit, frequency, duration, eye) that turns into one Arabic
prescription sentence. Today it is used as a drug's **default dosing** and on each **prescription
line**, and as a **group line override** (Feature 2). Saved prescriptions (Phase 2) can reuse it.

Dosing flows down three levels, each pre-filling the next:
drug default → group override (empty parts inherit) → prescription line (edited per patient).

## Data model
`ClinicHub.Domain/Catalog/Dosing.cs`: an EF **owned type**, stored as columns on the owner's table, prefixed
with the navigation name (e.g. `Drugs.DefaultDosing_Frequency`). All fields optional.

| Field | Type | Allowed values / rules |
|---|---|---|
| DoseAmount | decimal? | > 0 and ≤ 1000; requires DoseUnit |
| DoseUnit | string(20) | `drop`, `tablet`, `capsule`, `ml`, `application` |
| Frequency | string(20) | `daily`, `everyHours`, `bedtime`, `asNeeded`, `custom` |
| FrequencyValue | int? | times/day for `daily` (1–24); hours for `everyHours` (1–72) |
| FrequencyText | string(200) | required for `custom` |
| DurationValue | int? | 1–365, for `days`/`weeks`/`months` |
| DurationUnit | string(20) | `days`, `weeks`, `months`, `continuous`, `untilNextVisit` |
| Eye | string(10) | `right`, `left`, `both`, `none` (null = not set); group lines also `ask` |
| TaperSteps | JSON text | optional tapering schedule (2–10 steps); replaces Frequency/Duration. See [tapering](../tapering/tech.md) |

- Codes live in `DosingCodes`; the frontend mirrors them in `features/dosing/types.ts`. **Keep both in sync.**
- `Drug.DefaultDosing` (nullable). An all-null dosing is stored as null.
- Migrations: `AddDrugDefaultDosing` (8 nullable columns on `Drugs`) and `AddGroupItemDosing`
  (8 nullable columns on `DrugGroupItems`), `AddTaperSteps` (1 nullable JSON column on each); no data changes.
- EF logs a startup warning that `Dosing` is an "optional dependent without a required property".
  That is expected: an all-null dosing reads back as `null`.

## Backend
- `ClinicHub.Domain/Catalog/DosingRules.cs` (pure, no dependencies)
  - `Normalize`: trims, drops fields that don't apply (value for non-numeric frequency/duration,
    text for non-custom), returns null when empty.
  - `IsValid(dosing, allowAskEye)`: true when valid (or null); the validators map false to
    `invalidDosing` (`DrugErrors.InvalidDosing`, `DrugGroupErrors.InvalidDosing`).
    `allowAskEye` accepts the `ask` eye (`DosingCodes.GroupEyes`); only group lines pass `true`.
- Drugs API accepts/returns `defaultDosing` (see [drugs tech](../drugs/tech.md)). `CreateDrugCommandValidator` /
  `UpdateDrugCommandValidator` check the name, then the normalized dosing.
- Configuration helper `DosingConfiguration.Configure` (in
  `ClinicHub.Infrastructure/Database/Configurations/Catalog/`) sets column lengths for any owned Dosing; reuse it
  for future owners
  (`OwnsOne(x => x.SomeDosing, DosingConfiguration.Configure)`).

## Frontend (`src/features/dosing/`)
- `types.ts`: code lists, `Dosing` type, and helpers that match the API rules:
  `normalizeDosing`, `isDosingEmpty`, `dosingErrors` (list of invalid fields), `eyeKey`
  (`eye ?? "none"`), `otherEye` (right ↔ left), `mergeDosing(base, override)` (each empty part of
  the override is taken from the base: dose, frequency, duration, eye; a tapering schedule counts
  as frequency + duration together), `sameDosing` (compare normalized values), `ASK_EYE`.
- `dosingText.ts` → `dosingToText(dosing)`: builds the sentence **always in Arabic**, using
  `i18n.getFixedT("ar")`. Order: dose → eye → frequency → duration; missing parts are skipped.
  `0.5` uses the "half" wording (نصف قرص). Example: «نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين».
- `components/DosingFields.tsx`: the form (dose + unit, frequency + times/hours or custom text,
  period + duration, eye toggle) with a live preview. `onChange` is a **state setter**
  (`Dispatch<SetStateAction<Dosing>>`) so quick successive edits merge into the latest value.
  `showErrors` highlights fields from `dosingErrors`. Rows put the dropdown first, then the number.
  **Inherit mode** (`inheritFrom={drugDefault}`): empty selects display "Drug default" and the
  preview shows the merged result. `allowAskEye` adds the "Ask when adding" eye.
- `components/DosingLineList.tsx`: shared numbered, drag-to-reorder list of `{ key, drug }` lines
  with ✎ / ⊕ (other eye) / ✕ actions and a `renderDetails` slot. Used by prescription lines and
  group lines.
- `components/DosingText.tsx`: renders the sentence (`dir="rtl"`, aligned with the interface direction).

### i18n
- UI labels: `dosing.*` in `en.ts` and `ar.ts` (normal translations).
- Prescription wording: `i18n/locales/rxTextAr.ts`, plugged into **both** locales as `rxText`.
  The output is Arabic in every interface language (business decision). It uses Arabic plural
  suffixes `_zero/_one/_two/_few/_many/_other` (few = 3–10, many = 11–99).
- Numbers are Western digits (1, 2, 3).

## Edge cases & limitations
- No dosing set → prescription output falls back to the drug's description (pre-Feature 1 behavior).
- `application` (ointment) renders as «طبقة رقيقة» regardless of amount.
- Decimal amounts other than 0.5 use the `_other` form (e.g. «1.5 قرص»).
- Code lists are fixed in code (MVP). Changing a code requires a data migration for stored values.

## Testing notes
- API: valid dosing saved; non-applicable fields cleared; bad unit/frequency/eye, amount without
  unit, missing counts, missing custom text, negative amount → 400 `invalidDosing`; empty → null.
- Browser (desktop + 375px, Arabic + English): form prefill, live preview, custom frequency,
  validation highlight, Arabic sentence alignment in both directions.
