# Drug catalog: technical

## Summary
A clinic's drug list is its **own drugs** plus the platform's **shared drugs** (M1.7b, design
[m1.7-shared-catalog](../../design/m1.7-shared-catalog.md) D1–D8; shared catalog, categories and the admin side:
[shared catalog](../shared-catalog/tech.md)). Own drugs: CRUD with name, optional active ingredients, a required
category, an optional subcategory, optional description and **default dosing**. Shared drugs are read-only in a clinic
(409 `sharedDrugReadOnly`), have no default dosing, and a withdrawn one («معطّل من الإدارة») is hidden from the lists and
search but still answers by id. Drugs are referenced by protocols and selected into prescriptions. Content is stored
once, as typed (not translated).

## Data model
`Drugs` (`ClinicHub.Domain/Catalog/Drug.cs`, `IClinicOrShared`)

| Column | Type | Rules |
|---|---|---|
| Id | integer PK, identity | globally unique (own and shared share the sequence) |
| ClinicId | int **nullable** FK → `Clinics` (restrict) | owning clinic; **null = shared**; stamped on insert; never changes (save interceptor); index `(ClinicId, Name)` |
| Name | varchar(256) | required, max 256 (`FieldLimits.NameMaxLength`); not unique |
| NameAr | varchar(256) | internal, search only: the imported shared drug's Arabic name, written only by `load_catalog.py`; null for own and admin-created drugs; in no DTO, request or screen; an admin rename clears it |
| ActiveIngredients | varchar(1000) | nullable; one line (`SingleLineText`) |
| Description | text | nullable; free text, may be multi-line |
| DefaultDosing_* | 9 columns (8 + `TaperSteps` JSON text) | owned `Dosing`, nullable; **always null on a shared drug** (interceptor); see [dosing](../dosing/tech.md) |
| CategoryId | int FK → `Categories` (restrict) | required; index `(CategoryId, SubCategoryId)` |
| SubCategoryId | int nullable | composite FK `(SubCategoryId, CategoryId)` → `SubCategories(Id, CategoryId)` (restrict): a drug's subcategory always belongs to its category |
| IsWithdrawn, WithdrawnAt | bool, timestamptz | shared drugs only (`Drug.Withdraw(at)` / `Restore()`); an own drug is never withdrawn (interceptor) |
| SearchName | text NOT NULL DEFAULT '' | ordinary column, `SearchText.Fold(Name)`, filled by the save interceptor (M1.7 D7) |
| SearchOther | text NOT NULL DEFAULT '' | ordinary column, `SearchText.OtherText(NameAr, ActiveIngredients)`, filled by the save interceptor |
| CreatedAt, UpdatedAt | timestamptz | UTC, filled on save |

Query filter: `ClinicId == null || ClinicId == <current clinic>` (a clinic sees the shared drugs + its own; a platform
request only the shared ones). Another clinic's own drug is 404 (see [clinic scoping](../clinic-scoping/tech.md)).
Migration `AddSharedCatalog` (M1.7b): schema only, on an empty `Drugs` table.

Relationship: `ProtocolItems.DrugId` → `Drugs.Id`, simple FK with **cascade delete** (deleting an own drug removes it
from all protocols; shared drugs are never deleted).

## API (`ClinicHub.Api/Features/Drugs/`, routes under `api/v1`)

Thin controllers: each action sends one use case (below) and maps its `Result`. Errors are
[ProblemDetails](../../tech/overview.md#errors-problemdetails); the table lists their `code`.

| Method | Route | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/drugs?search=&source=&categoryId=&subCategoryId=&page=1&pageSize=20` | query | `PagedResult<DrugDto>` | 400 `invalidRequest` (`source` not `all`/`shared`/`own`, `subCategoryId` not a positive int or `none`, `subCategoryId` without `categoryId`, a malformed `categoryId`) |
| GET | `/drugs/{id}` | | `DrugDto` (a withdrawn shared drug: 200, `withdrawn: true`) | 404 `notFound` |
| POST | `/drugs` | `SaveDrugRequest { name, activeIngredients, description, defaultDosing, categoryId, subCategoryId }` | 201 `DrugDto` (+ `Location`) | 400 `nameRequired`, `nameInvalid`, `nameTooLong`, `invalidText`/`textTooLong` (`activeIngredients`), `invalidText` (`description`), `invalidDosing`, `categoryRequired` (all that apply, in this order); then 400 `categoryNotFound`, `subCategoryNotFound` |
| PUT | `/drugs/{id}` | `SaveDrugRequest` | `DrugDto` | as POST, then 404 `notFound`, then 409 `sharedDrugReadOnly` |
| GET | `/drugs/{id}/protocols` | | `string[]`: this clinic's protocols using the drug (own or shared; empty for an unknown drug) | |
| DELETE | `/drugs/{id}` | | 204 | 404 `notFound`, then 409 `sharedDrugReadOnly` |
| GET | `/drug-categories` | | `CategoryDto[]` (`DrugCategoriesController`) | |

`DrugDto = { id, name, activeIngredients, description, defaultDosing, isShared, withdrawn, category: {id, nameEn,
nameAr}, subCategory: {…} | null }`. No DTO or request carries a drug's Arabic name (an unknown `nameAr` property is
ignored). `CategoryDto = { id, nameEn, nameAr, pinnedLast, subCategories: [{ id, nameEn, nameAr, pinnedLast }] }`
(by id; `pinnedLast` only for «أخرى» (23) and «غير مصنف» (182), by id).

Every action needs a clinic token (`ClinicContext` policy) and its permission: `drugs.list` (`GET /drugs`,
`GET /drug-categories`), `drugs.details` (`GET /drugs/{id}`, `GET /drugs/{id}/protocols`), `drugs.create` /
`drugs.update` / `drugs.delete`; else 401 / 403 ([access](../access/tech.md#api)).

## Backend (`ClinicHub.Application/Features/Catalog/Drugs/`, `Catalog/Categories/`)

| Use case | Folder | Notes |
|---|---|---|
| `GetDrugsQuery(search, source, categoryId, subCategoryId, page, pageSize)` | `Queries/GetDrugs` | + validator → `PagedResult<DrugDto>` |
| `GetDrugQuery(id)` | `Queries/GetDrug` | → `DrugDto` (own or shared, withdrawn included) or `DrugErrors.NotFound` |
| `GetDrugProtocolNamesQuery(drugId)` | `Queries/GetDrugProtocolNames` | → `List<string>` (this clinic's protocols, distinct, by name) |
| `CreateDrugCommand(name, activeIngredients, description, defaultDosing, categoryId, subCategoryId)` | `Commands/CreateDrug` | + validator → `DrugDto` |
| `UpdateDrugCommand(id, …same…)` | `Commands/UpdateDrug` | + validator → `DrugDto`, `NotFound` or `SharedDrugReadOnly` |
| `DeleteDrugCommand(id)` | `Commands/DeleteDrug` | → `NotFound`, `SharedDrugReadOnly` or success (cascade removes its protocol lines) |
| `GetCategoriesQuery()` | `Catalog/Categories/Queries/GetCategories` | → `List<CategoryDto>` |

- `DrugDto`, `ProtocolDrugDto` (+ `ToDto()`, `ToProtocolDrugDto()`, `WithCategories()`) and `DrugErrors`
  (`NotFound` = `notFound`, `InvalidDosing`, `SharedDrugReadOnly`) at the feature root; `CategoryErrors`
  (`categoryRequired`, `categoryNotFound`, `subCategoryNotFound`…) in `Catalog/Categories`; `nameRequired`/
  `nameInvalid`/`nameTooLong` (`ValidName()`), `invalidText` (`ValidText()`, `SingleLineText()`) and `textTooLong`
  (`SingleLineText()`) are `CommonErrors`.
- Validators (create and update, one each), in this order: `ValidName()` (required: not only spaces or invisible
  format characters; no control characters, line/paragraph separators nor bidi overrides or isolates → `nameInvalid`;
  ≤ 256 after trim), `SingleLineText()` on the active ingredients (any control character, line breaks and tabs
  included → `invalidText`; > 1,000 once trimmed → `textTooLong`; field `activeIngredients`), `ValidText()` on the
  description (a NUL → `invalidText`, field `description`), `DosingRules.IsValid(DosingRules.Normalize(defaultDosing))`
  (→ `invalidDosing`), then `categoryId` not null (→ `categoryRequired`). Every failing rule is returned; the first is
  the response's `code`.
- Handlers (§ 7 order): `categoryNotFound` (unknown `categoryId`) → `subCategoryNotFound` (unknown, or of another
  category) → 404 (update/delete: the drug looked up through the clinic filter, so a shared drug **is found**) →
  `sharedDrugReadOnly` (a shared drug; update and delete). They trim name, ingredients and description (blank → `null`)
  and normalize the dosing (an all-empty dosing is stored as `null`). Commands run in one transaction
  (`TransactionBehavior`). The save interceptor is the last guard (a shared row can't be changed in a clinic).
- **List** (`DrugQueries.ListedAsync` + `InListOrder`, shared with M1.7c's tree): visible (the filter) + not withdrawn
  + `source` (`shared` = `ClinicId` null, `own` = not null, empty/`all` = both) + `categoryId` (+ `subCategoryId`:
  an id, or `none` = without subcategory). Unknown ids or a subcategory of another category → an empty page. Search
  (case-insensitive, **Arabic-normalized** `Contains`): the term folded by `SearchText.Term` is looked for in
  `SearchName`, or (`SearchText.OtherTerm`: `+` and `(` as spaces) in `SearchOther` (the hidden Arabic name and the
  ingredients), or matches the folded English or Arabic name of the drug's category or subcategory (the ≤ ~205 names
  folded in memory, their ids added to the filter). `%`, `_` and `\` match literally. A term made only of `+`/`(`
  skips the `SearchOther` part. Order (D7): **own drugs first, then shared**; with a search, names (`SearchName`)
  starting with the term first, then `Name` (database collation), then `Id`; without one, own drugs newest first
  (`CreatedAt`, `Id` descending), then shared by `Name`, then `Id`.
- Page size clamped to 1–100 (`Paging.Normalize`).
- Dev seed (`ClinicHub.Infrastructure/Platform/StartupSeeder`, Development only, empty DB): the template gets two own
  drugs with categories («العيون») and the protocol "After cataract surgery" (the shared "VIGAMOX 0.5% EYE DROPS 5 ML"
  + one own drug); without the shared catalog loaded the template sample is skipped with a warning naming
  `data/drug-catalog/tools/load_catalog.py`. No bulk drugs (paging is checked on the 23K shared drugs).

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
    (also when the default dosing has only an eye: the sentence is then just the eye part). Prescription and protocol
    lines follow another rule (`LineDetails`, [prescription](../prescription/tech.md#text-formats-prescriptiontextts)).
- **`api.ts`**: `drugKeys` (`all`, `list`, `picker`); hooks `useDrugs`, `useDrugPicker`,
  `useSaveDrug` (POST/PUT by `id === null`), `useDeleteDrug`. Both mutations invalidate
  `drugKeys.all` **and** `protocolKeys.all` (protocols embed drug data).
- Delete confirmation first calls `fetchDrugProtocolNames` and lists the protocols that will lose the
  drug (`drugs.usedInProtocols`), joined with the Arabic comma «، » in both languages (protocol names are content, often
  Arabic; kept by choice, M1.6.1, Q5); if the lookup fails the dialog still opens.
- i18n namespace: `drugs.*` (+ `dosing.*`, `errors.nameRequired`, `errors.nameInvalid`, `errors.nameTooLong`, `errors.invalidText`,
  `errors.invalidDosing`).

## Edge cases & limitations
- Deleting the last row on a page steps back one page.
- Deleting a drug does not touch prescriptions already stored in a browser (`prescription.lines.<clinicId>`).
- Name ordering follows the database's default collation.
- No duplicate-name check: two drugs may share a name (a shared and an own one too: both listed, the own one first).
- A category or subcategory deleted between the check and the insert: the FK refuses it (500, nothing saved; accepted).
- Moving an own drug to another category changes nothing else (protocol and prescription lines point to the drug).

## Testing notes
Automated since M1.6 ([testing README](../../testing/README.md)): catalog areas
[DRUG](../../testing/test-catalog.md#drug--drug-catalog) (incl. the Arabic-normalized search, DRUG-088 to DRUG-102) and
CAT (M1.7b: fields, `source`, filters, search, order, read-only shared drugs); a change here adds or fixes its cases and
tests.

| Level | Tests |
|---|---|
| unit | `tests/ClinicHub.UnitTests/Catalog/Drugs/` (validators), `Common/Search/` (`SearchText` folding), `Common/Validation/` |
| api | `tests/ClinicHub.IntegrationTests/Catalog/Drugs/` (CRUD, validation, list, search), `Catalog/Migrations/` (`AddSearchNames` up → down → up with data, DRUG-101) (`./test.ps1 -Area catalog`) |
| ui | `ClinicHub.Web/src/features/drugs/` (`DrugFormDialog`, `DrugPicker`, `DrugsPage`) |
| e2e | `ClinicHub.Web/e2e/catalog/drugs-crud.spec.ts`, `drugs-list.spec.ts`, `inheritance.spec.ts` |
