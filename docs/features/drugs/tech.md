# Drug catalog: technical

## Summary
CRUD for drugs (name + optional description + optional **default dosing**). Drugs are referenced by groups and selected into
prescriptions. Content is stored once, as typed (not translated).

## Data model
`Drugs` (`Models/Drug.cs`)

| Column | Type | Rules |
|---|---|---|
| Id | int PK, autoincrement | |
| Name | TEXT | required, max 256 (`AppDbContext.NameMaxLength`) |
| Description | TEXT | nullable; free text, may be multi-line |
| DefaultDosing_* | 8 columns | owned `Dosing`, nullable; see [dosing](../dosing/tech.md) |

Relationship: `Drug.GroupItems` → `DrugGroupItems.DrugId` with **cascade delete** (deleting a drug
removes it from all groups).

## API (`Features/Drugs/DrugsController.cs`, route `api/v1/drugs`)

| Method | Route | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/drugs?search=&page=1&pageSize=20` | query | `PagedResult<DrugDto>` | |
| GET | `/drugs/{id}` | | `DrugDto` | 404 |
| POST | `/drugs` | `SaveDrugRequest { name, description, defaultDosing }` | 201 `DrugDto` | 400 `nameRequired`, `nameTooLong`, `invalidDosing` |
| PUT | `/drugs/{id}` | `SaveDrugRequest` | `DrugDto` | 400 (as above), 404 |
| GET | `/drugs/{id}/groups` | | `string[]` group names using the drug | |
| DELETE | `/drugs/{id}` | | 204 | 404 |

`DrugDto = { id, name, description, defaultDosing }` (`defaultDosing` is null when not set).

## Backend
- Validation: `SaveDrugRequest.Validate()`: `ErrorCodes.ValidateName` (required, ≤ 256 after trim),
  then `DosingRules.Validate(DosingRules.Normalize(defaultDosing))`.
- `DrugMappings.Apply` trims name and description; blank description → `null`; dosing is normalized
  (an all-empty dosing is stored as `null`).
- List: optional search = case-insensitive `Contains` on `Name`. Ordering:
  - no search: by `Name`, then `Id`
  - search: names starting with the term first, then `Name`, then `Id`
- Page size clamped to 1–100 (`NormalizePaging`).
- Dev seed (`Program.cs`, Development only, empty DB): 10,000 drugs "Drug number N".

## Frontend (`src/features/drugs/`)
- **Page** `pages/DrugsPage.tsx` at `/drugs`: search (debounced 300 ms, resets to page 0),
  MUI table (column: name + 2-line description; actions: edit, delete), `TablePagination`
  (10/20/50, default 20), empty state with "Add drug", confirm before delete
  (`useConfirm`). Clicking a row opens edit.
- **Dialog** `components/DrugFormDialog.tsx`: create/edit with Name (required), Description
  (multiline) and a "Default dosing" section (`DosingFields`); save is blocked while
  `dosingErrors` is not empty. Inputs use `dir="auto"`. Remounts on each open (state starts from the given drug).
  Full-screen on small screens.
- **Reusable components** (used by other features):
  - `DrugPicker`: `SearchableList` over `useDrugPicker` (infinite, 30/page). Optional
    `selectedIds` shows an "Added" chip. Clears search after selecting.
  - `DrugText`: name (bold), optional dosing sentence (`showDosing`), description (`pre-line`,
    optional line clamp). The table and the picker show the dosing sentence.
- **`api.ts`**: `drugKeys` (`all`, `list`, `picker`); hooks `useDrugs`, `useDrugPicker`,
  `useSaveDrug` (POST/PUT by `id === null`), `useDeleteDrug`. Both mutations invalidate
  `drugKeys.all` **and** `drugGroupKeys.all` (groups embed drug data).
- Delete confirmation first calls `fetchDrugGroupNames` and lists the groups that will lose the
  drug (`drugs.usedInGroups`); if the lookup fails the dialog still opens.
- i18n namespace: `drugs.*` (+ `dosing.*`, `errors.nameRequired`, `errors.nameTooLong`, `errors.invalidDosing`).

## Edge cases & limitations
- Deleting the last row on a page steps back one page.
- Deleting a drug does not touch prescriptions already stored in a browser (`prescription.lines`).
- Name ordering is SQLite binary collation (uppercase before lowercase, Latin before Arabic).
- No duplicate-name check: two drugs may share a name.

## Testing notes
Verified via API calls (create with Arabic text, search Arabic, prefix ranking, blank name → 400,
update, delete, default dosing save/normalize/validate) and in the browser (dialog fields,
`dir=auto`, dosing section, sentence in table and picker).
