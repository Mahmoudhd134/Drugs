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
  + one own drug); without the shared catalog loaded nothing is seeded (no template sample, no demo clinic) and a
  warning names `data/drug-catalog/tools/load_catalog.py`, so the first start after the load seeds everything. No bulk drugs (paging is checked on the 23K shared drugs).

## Frontend (`src/features/drugs/`)
- **Page** `pages/DrugsPage.tsx` at `/drugs` (design M1.7 D9, M1.7c):
  - **URL state** (`useSearchParams`; pure helpers in `pages/drugListParams.ts`): `search`, `source`
    (`all`/`shared`/`own`), `categoryId`, `subCategoryId` (an id or `none`), `page` (1-based) and `view` (`list`; the
    tree is the default, M1.7 review R1); defaults are left out (`writeDrugListParams`: `view=list` only) and every
    filter update replaces the history entry (`replace: true`, M1.7c C2), so Back leaves the page with its filters kept
    and a link reopens the same list. A **view change** pushes a new entry instead (Back returns to the other view,
    CAT-271), keeps the search, source and categories and resets `page` to 1. Any change other than the page goes to page 1. The
    page size stays local (10/20/50, default 20). `readDrugListParams` drops invalid values silently: an unknown
    `source` (another case too) → «الكل»; a `categoryId` that isn't a positive integer (≤ 2,147,483,647) or, once the
    categories are loaded, isn't one of them → none, with its subcategory; a `subCategoryId` without a valid category,
    `none` alone, malformed, or not of that category → none; a bad `page` → 1; a `view` other than `list` (`TREE`
    too) → the tree. Once the categories are loaded the URL is
    rewritten once without them. While the URL holds a `categoryId` and the categories aren't loaded, the list query
    waits (no request with an unchecked id). A page past the end (an old link, the last rows deleted or filtered away)
    is replaced by the last one (`clampPage`); until that page arrives no rows and no range show (neither an older
    page's rows nor «41–45 من 45» over an empty table: a page beyond the known total, or an empty page of a non-empty
    list, renders nothing under the progress bar, CAT-143). A page sent to the API is capped at 999,999.
  - **Search** (`drugs.searchPlaceholder`): debounced 300 ms, trimmed, then written to the URL (page 1); a search
    changed from outside (Back, a link, «مسح الفلاتر») replaces the typed one. Searches are compared trimmed, so a link's
    `search=amox%20&page=3` is kept as it is (no rewrite, no jump to page 1). The thin progress bar also shows while
    the typed search waits to be sent.
  - **Filter bar** (`components/DrugListFilters.tsx`): the search, then the **source toggle** (MUI `ToggleButtonGroup`
    `exclusive`, `size="small"`, `aria-label` `drugs.source.label`, buttons `drugs.source.all|shared|own`, never
    deselected), the **category select** (`drugs.category`; first `drugs.allCategories`, then `sortCategories` of
    `useDrugCategories`, enabled with `drugs.list`) and the **subcategory select** (`drugs.subCategory`; disabled until
    a category is chosen; `drugs.allSubCategories`, the chosen category's subcategories sorted, then
    `drugs.noSubCategory`; changing the category resets it), then the **view toggle** (`ToggleButtonGroup` `exclusive`,
    `aria-label` `drugs.view.label`, buttons `drugs.view.tree|list`, never deselected). A row from `sm` (wrapping when
    narrow); below `sm` the toggles (full width) and the selects go under the search, one per line. Menu options wrap
    long names. The one filter bar drives both views.
  - **Header**: subtitle `drugs.subtitle` with the list's `totalCount`, or in the tree view the filtered tree's
    `treeTotal` (grouped digits); «إضافة دواء» only with `drugs.create`.
  - **Tree view** (default, M1.7 review R1): `DrugTree` with `filters` (the URL's search, source, category and
    subcategory: it then renders no search box, source toggle, «النتائج: N» or progress bar of its own; the page's
    progress bar and error alert cover it), `rowMode="open"` (no «مُضاف», no ⊕) and `rowActions` (the list's ✎ / 🗑 of
    an own row, same permissions; none on a shared row). A click or Enter on a drug opens what a list row opens
    (`canOpen`; without the permission nothing). The API's tree has no category filter: `filterTree` (in
    `drugTreeModel.ts`) keeps only the chosen category (opened) or the chosen subcategory under it (its count becomes
    the category's; a lone bucket auto-opens and loads its first page). The page reads the same `useDrugTree` query
    (same key: `treeSearchTerm(search)`, source) for the subtitle and the empty states; the list query is disabled
    meanwhile. A save or delete refreshes the tree (`drugKeys.all`).
  - **Table** (list view, MUI, cells top-aligned): name (`DrugText`: name, the own drug's dosing sentence, 2-line
    description; shared drugs have no dosing so no sentence) + «خاص بالعيادة» / "Clinic" (`drugs.chip.own`) on an own
    row; a shared row has no chip (M1.7 review R2); **category** (`drugs.category`, cell `categoryPath` in the UI language: «العيون › المياه
    الزرقاء», the category alone without a subcategory; below `sm` the column and its header aren't rendered and the path goes
    under the name instead: one copy per row, chosen with `useMediaQuery(theme.breakpoints.down("sm"))`, C26); actions (own rows only: edit, delete). Long names and paths wrap (`overflowWrap: "anywhere"`), no sideways
    scroll at 375 px. `TablePagination` (numbers grouped, «1–20 من 23,414»). Confirm before delete (`useConfirm`).
    Clicking an own row opens edit (read-only details without `drugs.update`). **Shared rows** (M1.7b) have no edit or
    delete button at all; with `drugs.details` a click or Enter/Space opens the read-only details (also for a user with
    `drugs.update`), without it the row doesn't open; the delete's `GET /drugs/{id}/protocols` is never called for them.
  - **Empty states** (`drugListEmptyState`, both views: only when the list's answer has `totalCount` 0, or the filtered
    tree has no category): a search typed →
    `drugs.noResults`; «أدوية العيادة» with no category and no search → `drugs.noOwnDrugs` + «إضافة دواء» (with
    `drugs.create`); any other filter, no search → `drugs.noFilterResults` + a `drugs.clearFilters` button (back to the
    defaults, the search emptied, the view kept); nothing filtered → `drugs.emptyTitle` + description + «إضافة دواء».
  - **Saving a new own drug while «المشتركة» is chosen** switches the toggle to «أدوية العيادة», clears the search (the
    typed one too) and goes to page 1, so the new drug shows (CAT-137, M1.7c C35; the view is kept), through `DrugFormDialog`'s `onSaved(drug, created)` (called after a successful save, before
    the toast; `created` true for a new drug).
  - Stale answers: the query key holds the search, page, size and filters, so an older, slower answer never replaces a
    newer one (CAT-144); the old rows (and count) stay as placeholder until the new ones arrive, only while their query
    is still cached (C20's guard, as `useDrugTree`: after a context switch nothing of the other clinic shows).
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
  description, and an own drug's default dosing; empty rows are left out, long text wraps. The name is a block `<bdi>`
  (its own direction) aligned to the interface's start side (M1.7c C37). Always used for a shared
  drug (`DrugFormDialog` shows it whenever `drug.isShared`).
- **`WithdrawnChip`** (`components/WithdrawnChip.tsx`): the one «معطّل من الإدارة» mark (protocol editor lines,
  protocol cards with `count`, prescription lines, admin rows). A focusable chip whose `TapTooltip` (hover, focus, tap
  at once, ~5 s, Esc) shows `drugs.withdrawn.tooltip`; that text is also its accessible description at all times (a
  hidden element named by `aria-describedby`). Inside a control that is itself focusable (the prescription's protocol
  picker option) `WithdrawnChipInsideControl` makes it no Tab stop of its own (nested interactive ARIA); the tooltip
  still opens on hover and tap there.
- **Reusable components** (used by other features):
  - `DrugTree` (M1.7c, replaces `DrugPicker`): search + source toggle + categories → subcategories → drugs, 30 at a
    time per open subcategory, over `useDrugTree` / `useDrugBucket` (`treeApi.ts`, keys `drugTreeKeys`). Optional
    `selectedIds` shows «مُضاف»; selecting keeps the search and the open nodes. The drugs page's tree view passes
    `filters`, `rowMode="open"` and `rowActions` (above). Details:
    [prescription](../prescription/tech.md#the-drug-tree-drugtree).
  - `DrugText`: name (bold), optional dosing sentence (`showDosing`), description (`pre-line`,
    optional line clamp). The table and the picker show the dosing sentence; the description is always shown here
    (also when the default dosing has only an eye: the sentence is then just the eye part). The name sits in a `<bdi>`
    (M1.7b D27). Prescription and protocol
    lines follow another rule (`LineDetails`, [prescription](../prescription/tech.md#text-formats-prescriptiontextts)).
- **`api.ts`**: `drugKeys` (`all`, `list`, `categories`); hooks `useDrugs`,
  `useDrugCategories` (`GET /drug-categories`, `staleTime` 30 s), `useSaveDrug` (POST/PUT by `id === null`),
  `useDeleteDrug`. Both mutations invalidate `drugKeys.all` **and** `protocolKeys.all` (protocols embed drug data).
- **`treeApi.ts`** (M1.7c): `drugTreeKeys` (`tree`, `bucket`, under `drugKeys.all`, so a drug save refreshes them);
  `useDrugTree` (`GET /drugs/tree`), `useDrugBucket` (one open subcategory's drugs, infinite, 30/page).
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
| unit | `ClinicHub.Web/src/features/drugs/pages/drugListParams.test.ts` (the URL helpers; `PURE_LOGIC` gate, StrykerJS) |
| ui | `ClinicHub.Web/src/features/drugs/` (`DrugFormDialog`, `DrugTree`, `DrugsPage`) |
| e2e | `ClinicHub.Web/e2e/catalog/drugs-crud.spec.ts`, `drugs-list.spec.ts`, `inheritance.spec.ts` |
