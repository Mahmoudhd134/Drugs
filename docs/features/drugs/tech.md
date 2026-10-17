# Drug catalog: technical

## Summary
CRUD for drugs (name + optional description + optional **default dosing**). Drugs are referenced by groups and selected into
prescriptions. Content is stored once, as typed (not translated).

## Data model
`Drugs` (`ClinicHub.Domain/Catalog/Drug.cs`)

| Column | Type | Rules |
|---|---|---|
| Id | integer PK, identity | |
| Name | varchar(256) | required, max 256 (`FieldLimits.NameMaxLength`) |
| Description | text | nullable; free text, may be multi-line |
| DefaultDosing_* | 9 columns (8 + `TaperSteps` JSON text) | owned `Dosing`, nullable; see [dosing](../dosing/tech.md) |
| ClinicId | int FK → `Clinics` (restrict) | owning clinic; filled on insert; index `(ClinicId, Name)` |
| SearchName | text | stored generated column: `Name` lower-cased and Arabic-folded, only searched (M1.6.1, `AddSearchNames`; [search](../../tech/overview.md#conventions)) |
| CreatedAt, UpdatedAt | timestamptz | UTC, filled on save |

Every query is scoped to the current clinic: another clinic's drug is 404 (see
[clinic scoping](../clinic-scoping/tech.md)).

Relationship: `Drug.GroupItems` → `DrugGroupItems.DrugId` with **cascade delete** (deleting a drug
removes it from all groups).

## API (`ClinicHub.Api/Features/Drugs/DrugsController.cs`, route `api/v1/drugs`)

Thin controller: each action sends one use case (below) and maps its `Result`. Errors are
[ProblemDetails](../../tech/overview.md#errors-problemdetails); the table lists their `code`.

| Method | Route | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/drugs?search=&page=1&pageSize=20` | query | `PagedResult<DrugDto>` | |
| GET | `/drugs/{id}` | | `DrugDto` | 404 `notFound` |
| POST | `/drugs` | `SaveDrugRequest { name, description, defaultDosing }` | 201 `DrugDto` (+ `Location`) | 400 `nameRequired`, `nameInvalid`, `nameTooLong`, `invalidText`, `invalidDosing` (all that apply, in this order) |
| PUT | `/drugs/{id}` | `SaveDrugRequest` | `DrugDto` | 400 (as above, checked first), 404 `notFound` |
| GET | `/drugs/{id}/groups` | | `string[]` group names using the drug (empty for an unknown drug) | |
| DELETE | `/drugs/{id}` | | 204 | 404 `notFound` |

`DrugDto = { id, name, description, defaultDosing }` (`defaultDosing` is null when not set).

Every action needs a clinic token (`ClinicContext` policy) and its permission: `drugs.list` (`GET /drugs`),
`drugs.details` (`GET /drugs/{id}`, `GET /drugs/{id}/groups`), `drugs.create` / `drugs.update` / `drugs.delete`;
else 401 / 403 ([access](../access/tech.md#api)).

## Backend (`ClinicHub.Application/Features/Catalog/Drugs/`)

| Use case | Folder | Notes |
|---|---|---|
| `GetDrugsQuery(search, page, pageSize)` | `Queries/GetDrugs` | → `PagedResult<DrugDto>` |
| `GetDrugQuery(id)` | `Queries/GetDrug` | → `DrugDto` or `DrugErrors.NotFound` |
| `GetDrugGroupNamesQuery(drugId)` | `Queries/GetDrugGroupNames` | → `List<string>` (distinct, by name) |
| `CreateDrugCommand(name, description, defaultDosing)` | `Commands/CreateDrug` | + validator → `DrugDto` |
| `UpdateDrugCommand(id, name, description, defaultDosing)` | `Commands/UpdateDrug` | + validator → `DrugDto` or `NotFound` |
| `DeleteDrugCommand(id)` | `Commands/DeleteDrug` | → `NotFound` or success (cascade removes its group lines) |

- `DrugDto` (+ `ToDto()`) and `DrugErrors` (`NotFound` = `notFound`, `InvalidDosing`) at the feature root;
  `nameRequired`/`nameInvalid`/`nameTooLong` (shared `ValidName()` rule) and `invalidText` (`ValidText()`) are
  `CommonErrors`.
- Validators (create and update, one each): `ValidName()` (required: not only spaces or invisible format
  characters; no control characters such as a NUL, line/paragraph separators nor bidi overrides or isolates → `nameInvalid`; ≤ 256 after
  trim), then `ValidText()` on the description (a NUL → `invalidText`, field `description`; line breaks and tabs are
  fine), then `DosingRules.IsValid(DosingRules.Normalize(defaultDosing))` (false → `invalidDosing`, field
  `defaultDosing`; a custom frequency text with a NUL is invalid too).
  Every failing rule is returned; the first is the response's `code`.
- The handlers trim name and description (blank description → `null`) and normalize the dosing (an
  all-empty dosing is stored as `null`). Commands run in one transaction (`TransactionBehavior`).
- List: optional search = case-insensitive, **Arabic-normalized** `Contains` (M1.6.1): the term folded by
  `SearchText.Term` (أ إ آ ٱ and the superscript alef → ا, ى → ي, ة → ه, ؤ → و, ئ → ي; tatweel and diacritics
  U+064B–U+065F removed; lower case) is looked for in `SearchName`, the name folded the same way by the database
  ([search](../../tech/overview.md#conventions)). Ordering:
  - no search: by `Name`, then `Id`
  - search: names whose `SearchName` starts with the term first, then `Name`, then `Id` (display and ordering use the
    name as stored)
- Page size clamped to 1–100 (`Paging.Normalize`).
- Dev seed (`ClinicHub.Infrastructure/Platform/StartupSeeder`, Development only, empty DB): 10,000 drugs "Drug number N" in "Demo clinic", next to the 2 drugs copied from the template (10,002).

## Frontend (`src/features/drugs/`)
- **Page** `pages/DrugsPage.tsx` at `/drugs`: search (debounced 300 ms, resets to page 0),
  MUI table (column: name + 2-line description; actions: edit, delete), `TablePagination`
  (10/20/50, default 20), empty state with "Add drug", confirm before delete
  (`useConfirm`). Clicking a row opens edit.
- **Dialog** `components/DrugFormDialog.tsx`: create/edit with Name (required), Description
  (multiline) and a "Default dosing" section (`DosingFields`); save is blocked while
  `dosingErrors` is not empty. Inputs use `dir="auto"`. Remounts on each open (`useOpeningKey`: state starts from the
  given drug, also when reopened during the closing animation). Saves through `useDialogSave`: one save at a time, and
  once saved Save stays disabled (Enter ignored) while the dialog fades out; a failed save unlocks at once.
  Not closable while saving (`FormDialog`: Esc and a backdrop click do nothing, Cancel disabled).
  On open the name field has the focus (new: «دواء جديد» with empty fields).
  `maxWidth="md"` (room for tapering steps); full-screen on small screens.
- **Reusable components** (used by other features):
  - `DrugPicker`: `SearchableList` over `useDrugPicker` (infinite, 30/page). Optional
    `selectedIds` shows an "Added" chip. Clears search after selecting.
  - `DrugText`: name (bold), optional dosing sentence (`showDosing`), description (`pre-line`,
    optional line clamp). The table and the picker show the dosing sentence; the description is always shown here
    (also when the default dosing has only an eye: the sentence is then just the eye part). Prescription and group
    lines follow another rule (`LineDetails`, [prescription](../prescription/tech.md#text-formats-prescriptiontextts)).
- **`api.ts`**: `drugKeys` (`all`, `list`, `picker`); hooks `useDrugs`, `useDrugPicker`,
  `useSaveDrug` (POST/PUT by `id === null`), `useDeleteDrug`. Both mutations invalidate
  `drugKeys.all` **and** `drugGroupKeys.all` (groups embed drug data).
- Delete confirmation first calls `fetchDrugGroupNames` and lists the groups that will lose the
  drug (`drugs.usedInGroups`), joined with the Arabic comma «، » in both languages (group names are content, often
  Arabic; kept by choice, M1.6.1, Q5); if the lookup fails the dialog still opens.
- i18n namespace: `drugs.*` (+ `dosing.*`, `errors.nameRequired`, `errors.nameInvalid`, `errors.nameTooLong`, `errors.invalidText`,
  `errors.invalidDosing`).

## Edge cases & limitations
- Deleting the last row on a page steps back one page.
- Deleting a drug does not touch prescriptions already stored in a browser (`prescription.lines.<clinicId>`).
- Name ordering follows the database's default collation.
- No duplicate-name check: two drugs may share a name.

## Testing notes
Automated since M1.6 ([testing README](../../testing/README.md)): catalog area
[DRUG](../../testing/test-catalog.md#drug--drug-catalog) (incl. the Arabic-normalized search, DRUG-088 to DRUG-102); a
change here adds or fixes its cases and tests.

| Level | Tests |
|---|---|
| unit | `tests/ClinicHub.UnitTests/Catalog/Drugs/` (validators), `Common/Search/` (`SearchText` folding), `Common/Validation/` |
| api | `tests/ClinicHub.IntegrationTests/Catalog/Drugs/` (CRUD, validation, list, search), `Catalog/Migrations/` (`AddSearchNames` up → down → up with data, DRUG-101) (`./test.ps1 -Area catalog`) |
| ui | `ClinicHub.Web/src/features/drugs/` (`DrugFormDialog`, `DrugPicker`, `DrugsPage`) |
| e2e | `ClinicHub.Web/e2e/catalog/drugs-crud.spec.ts`, `drugs-list.spec.ts`, `inheritance.spec.ts` |
