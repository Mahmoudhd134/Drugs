# Drug catalog: technical

## Summary
CRUD for drugs (name + optional description + optional **default dosing**). Drugs are referenced by protocols and selected into
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

Relationship: `Drug.ProtocolItems` → `ProtocolItems.DrugId` with **cascade delete** (deleting a drug
removes it from all protocols).

## API (`ClinicHub.Api/Features/Drugs/DrugsController.cs`, route `api/v1/drugs`)

Thin controller: each action sends one use case (below) and maps its `Result`. Errors are
[ProblemDetails](../../tech/overview.md#errors-problemdetails); the table lists their `code`.

| Method | Route | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/drugs?search=&page=1&pageSize=20` | query | `PagedResult<DrugDto>` | |
| GET | `/drugs/{id}` | | `DrugDto` | 404 `notFound` |
| POST | `/drugs` | `SaveDrugRequest { name, description, defaultDosing }` | 201 `DrugDto` (+ `Location`) | 400 `nameRequired`, `nameInvalid`, `nameTooLong`, `invalidText`, `invalidDosing` (all that apply, in this order) |
| PUT | `/drugs/{id}` | `SaveDrugRequest` | `DrugDto` | 400 (as above, checked first), 404 `notFound` |
| GET | `/drugs/{id}/protocols` | | `string[]` protocol names using the drug (empty for an unknown drug) | |
| DELETE | `/drugs/{id}` | | 204 | 404 `notFound` |

`DrugDto = { id, name, description, defaultDosing }` (`defaultDosing` is null when not set).

Every action needs a clinic token (`ClinicContext` policy) and its permission: `drugs.list` (`GET /drugs`),
`drugs.details` (`GET /drugs/{id}`, `GET /drugs/{id}/protocols`), `drugs.create` / `drugs.update` / `drugs.delete`;
else 401 / 403 ([access](../access/tech.md#api)).

## Backend (`ClinicHub.Application/Features/Catalog/Drugs/`)

| Use case | Folder | Notes |
|---|---|---|
| `GetDrugsQuery(search, page, pageSize)` | `Queries/GetDrugs` | → `PagedResult<DrugDto>` |
| `GetDrugQuery(id)` | `Queries/GetDrug` | → `DrugDto` or `DrugErrors.NotFound` |
| `GetDrugProtocolNamesQuery(drugId)` | `Queries/GetDrugProtocolNames` | → `List<string>` (distinct, by name) |
| `CreateDrugCommand(name, description, defaultDosing)` | `Commands/CreateDrug` | + validator → `DrugDto` |
| `UpdateDrugCommand(id, name, description, defaultDosing)` | `Commands/UpdateDrug` | + validator → `DrugDto` or `NotFound` |
| `DeleteDrugCommand(id)` | `Commands/DeleteDrug` | → `NotFound` or success (cascade removes its protocol lines) |

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
  MUI table (column: name + 2-line description and the row chip «مشترك» / "Shared" or «خاص بالعيادة» / "Clinic",
  `drugs.chip.*`; actions: edit, delete), `TablePagination` (10/20/50, default 20; numbers grouped, «1–20 من 23,414»),
  empty state with "Add drug", confirm before delete (`useConfirm`). Clicking an own row opens edit (read-only details
  without `drugs.update`). **Shared rows** (M1.7b) have no edit or delete button at all; with `drugs.details` a click or
  Enter/Space opens the read-only details (also for a user with `drugs.update`), without it the row doesn't open; the
  delete's `GET /drugs/{id}/protocols` is never called for them. The toggle, filters and category column are M1.7c.
- **Dialog** `components/DrugFormDialog.tsx`: create/edit an own drug through `DrugEditForm` (shared with the admin's
  `SharedDrugDialog`): Name (required), Active ingredients (`dir="auto"`, one line, ≤ 1,000), Category (required
  select) and Subcategory (optional select of the chosen category's subcategories, first option «بدون تصنيف فرعي»;
  changing the category clears it) from `CategoryFields`, Description (multiline) and a "Default dosing" section
  (`DosingFields`; the admin form has none); save is blocked while the name or the category is empty
  (`errors.categoryRequired` on the field, no request) or `dosingErrors` is not empty. API errors show on their inputs
  (`splitFormErrors` with `name`, `activeIngredients`, `description`, `categoryId`, `subCategoryId`, `defaultDosing`; the
  rest is toasted); `categoryNotFound` / `subCategoryNotFound` also reload the categories. The categories are fetched
  again on each opening (`useDrugCategories({refetchOnMount: "always"})`, so a category created a moment ago is
  listed). Names in the UI language, sorted by `sortCategories` (`Intl.Collator`, pinned rows last). Name inputs use
  `dir="auto"`. Remounts on each open (`useOpeningKey`: state starts from the given drug, also when reopened during the
  closing animation). Saves through `useDialogSave`: one save at a time, and once saved Save stays disabled (Enter
  ignored) while the dialog fades out; a failed save unlocks at once. Not closable while saving (`FormDialog`: Esc and a
  backdrop click do nothing, Cancel disabled). On open the name field has the focus (new: «دواء جديد» with empty
  fields). `maxWidth="md"` (room for tapering steps); full-screen on small screens.
- **Read-only details** (`DrugDetails`, title `drugs.details`, one button «إغلاق»): name, «المادة الفعالة: …»,
  «التصنيف: العيون › المياه الزرقاء» (`drugs.categoryLine` + `categoryPath`; the category alone without a subcategory),
  description, and an own drug's default dosing; empty rows are left out, long text wraps. Always used for a shared
  drug (`DrugFormDialog` shows it whenever `drug.isShared`).
- **`WithdrawnChip`** (`components/WithdrawnChip.tsx`): the one «معطّل من الإدارة» mark (protocol editor lines,
  protocol cards with `count`, prescription lines, admin rows). A focusable chip whose `TapTooltip` (hover, focus, tap
  at once, ~5 s, Esc) shows `drugs.withdrawn.tooltip`; that text is also its accessible description at all times (a
  hidden element named by `aria-describedby`). Inside a control that is itself focusable (the prescription's protocol
  picker option) `WithdrawnChipInsideControl` makes it no Tab stop of its own (nested interactive ARIA); the tooltip
  still opens on hover and tap there.
- **Reusable components** (used by other features):
  - `DrugPicker`: `SearchableList` over `useDrugPicker` (infinite, 30/page). Optional
    `selectedIds` shows an "Added" chip. Clears search after selecting.
  - `DrugText`: name (bold), optional dosing sentence (`showDosing`), description (`pre-line`,
    optional line clamp). The table and the picker show the dosing sentence; the description is always shown here
    (also when the default dosing has only an eye: the sentence is then just the eye part). Prescription and protocol
    lines follow another rule (`LineDetails`, [prescription](../prescription/tech.md#text-formats-prescriptiontextts)).
- **`api.ts`**: `drugKeys` (`all`, `list`, `picker`, `categories`); hooks `useDrugs`, `useDrugPicker`,
  `useDrugCategories` (`GET /drug-categories`, `staleTime` 30 s), `useSaveDrug` (POST/PUT by `id === null`),
  `useDeleteDrug`. Both mutations invalidate `drugKeys.all` **and** `protocolKeys.all` (protocols embed drug data).
- **`categories.ts`**: `categoryName` (the UI language's name), `sortCategories`, `categoryPath` («… › …»).
- **Admin screens** (`src/features/admin/drugs`, `src/features/admin/categories`, super admin, M1.7b):
  `/admin/drugs` (`AdminDrugsPage`: search, status «مفعّل» / «معطّل» / «الكل» default «مفعّل», category and subcategory
  filters, page and page size, all in the URL; a category or subcategory in the URL that no longer exists falls back to
  «الكل»; a page past the end shows the last page; columns name, ingredients, category › subcategory (stacked under the
  name on a phone); a withdrawn row carries `WithdrawnChip`; ✎ opens `SharedDrugDialog`, «تعطيل الدواء» asks first
  (destructive confirm, focus on «إلغاء»), «تفعيل الدواء» doesn't; one request per click burst (`useSingleFlight`);
  «معطّل» with no row → «لا توجد أدوية معطّلة.») and `/admin/categories` (`AdminCategoriesPage`: each category with its
  subcategories, sorted with the pinned rows last, then a «بدون تصنيف فرعي» row when `noSubCategoryDrugCount > 0`;
  «الأدوية: N» on every row; add / rename through `CategoryNameDialog` (English name LTR, Arabic name RTL, both required,
  `categoryNameTaken` / `subCategoryNameTaken` on the field the API names); delete after a destructive confirm, or, when
  `drugCount > 0`, a delete button that stays focusable with `aria-disabled` and the tooltip and description
  `errors.<code>_counted` (+ «من عيادات محذوفة: N»); a 409 still toasts the counted message and the list reloads).
  The admin dialogs read `useAdminCategories` (the clinic route needs a clinic context).
- Every count goes through `formatCount` (`{{count, count}}` in the locales, `ListPagination`): grouped Latin digits.
- Delete confirmation first calls `fetchDrugProtocolNames` and lists the protocols that will lose the
  drug (`drugs.usedInProtocols`), joined with the Arabic comma «، » in both languages (protocol names are content, often
  Arabic; kept by choice, M1.6.1, Q5); if the lookup fails the dialog still opens.
- i18n namespace: `drugs.*` (+ `dosing.*`, `errors.nameRequired`, `errors.nameInvalid`, `errors.nameTooLong`, `errors.invalidText`,
  `errors.invalidDosing`, `errors.textTooLong`, `errors.categoryRequired`, `errors.categoryNotFound`,
  `errors.subCategoryNotFound`, `errors.sharedDrugReadOnly`); admin: `adminDrugs.*`, `adminCategories.*`.

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
