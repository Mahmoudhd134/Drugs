# Shared drug catalog and categories: technical

## Summary
The platform ships a **shared drug catalog** (23,414 drugs of the Egyptian market) classified in two levels of
**categories**, written only by the super admin and used by every clinic as if it were its own (design
[m1.7-shared-catalog](../../design/m1.7-shared-catalog.md), D1–D8, D11–D12; contract
[m1.7b-contract](../../design/m1.7b-contract.md)). Built in M1.7b: the schema, the save-interceptor guards, the search
columns filled by the app, the clinic API changes ([drugs](../drugs/tech.md), [protocols](../protocols/tech.md)), the
admin API and screens below, provisioning and the dev seed. M1.7c adds `GET /drugs/tree`, `DrugTree` and the drugs-page
filters. Business rules: [business.md](business.md).

## Data model
- **`Drugs`**: one table for own and shared drugs, `ClinicId` null = shared (`IClinicOrShared`); columns, filter and
  FKs in [drugs § Data model](../drugs/tech.md). A shared drug has no default dosing; `IsWithdrawn` /
  `WithdrawnAt` only on shared drugs; `NameAr` is the imported Arabic name, internal, search only.
- **`Categories`** (`Domain/Catalog/Category.cs`): `Id`, `NameEn`, `NameAr` (≤ 100, required), timestamps. Platform
  rows: no `ClinicId`, no query filter.
- **`SubCategories`**: `Id`, `CategoryId` (FK restrict), `NameEn`, `NameAr`, timestamps; alternate key
  `(Id, CategoryId)`, the target of the drugs' composite FK `(SubCategoryId, CategoryId)`, so a subcategory never moves
  to another category and a drug's subcategory always belongs to its category. No unique name index (D5: checked in
  the handler).
- **Fixed ids** (`CategoryIds`, `SubCategoryIds`): the import inserts categories 1–23 and subcategories 1–182 in
  `taxonomy.py`'s order (by code: `eye` → 17, `eye.glaucoma` → 138, `other` → 23, `other.unclassified` → 182) and sets
  the sequences past them. «أخرى» (23) and «غير مصنف» (182) are `pinnedLast` by id.
- Migration `AddSharedCatalog` (M1.7b): schema only (tables, columns, FKs, indexes, the four `SearchName` columns
  turned into ordinary columns, `SearchOther`), on an empty `Drugs` table; no rows, no trigger, no check constraint.
  Down fails (and rolls back) while shared drugs exist.

## Write guards (design D2, D4)
- `IClinicScope.UseSharedCatalog()` opens shared-catalog writing for a block (`IClinicContext.WritingSharedCatalog`);
  only the admin shared-drug handlers call it, around their save. The save interceptor
  (`ClinicAndTimestampsInterceptor`, [clinic scoping](../clinic-scoping/tech.md)) refuses a shared row added or changed
  outside it, any change of a shared row in a clinic, any delete of a shared row, an owner change, a dosing on a shared
  drug and a withdrawn own drug.
- Clinic handlers find a shared drug through the filter and answer 409 `sharedDrugReadOnly` on update/delete (§ 7
  order). Protocol handlers look every line's drug up through the filter (`drugNotFound` for another clinic's).
- Categories are written only by the admin handlers (`PlatformAdmin` policy). No `ExecuteUpdate`/`ExecuteDelete` or raw
  SQL writes `Drugs`, `Categories` or `SubCategories` outside `Features/Platform/SharedDrugs/`,
  `Features/Platform/DrugCategories/`, migrations and the test harness (architecture test).

## Search (design D7)
`SearchName` (= `SearchText.Fold(Name)`) and `SearchOther` (= `SearchText.OtherText(NameAr, ActiveIngredients)`) are
ordinary columns filled by the save interceptor; the term is folded by the same `SearchText`. `DrugQueries.ListedAsync`
(visible + not withdrawn + `source` + category filters + search over both columns and the folded category and
subcategory names, folded in memory) and `InListOrder` (own first; with a search `StartsWith` first, then `Name`, then
`Id`; without one own newest first, then shared by `Name`, `Id`) serve the clinic list, the admin list (from its status
filter, through `DrugQueries.FilteredAsync`) and M1.7c's tree. Details in [drugs § Backend](../drugs/tech.md).

## API
Clinic routes: [drugs § API](../drugs/tech.md) (`source`, category
filters, `GET /drug-categories`, 409 on shared drugs) and [protocols § API](../protocols/tech.md) (`ProtocolDrugDto`,
`drugWithdrawn`).

### Drug tree (`GET /drugs/tree`, design D7, D8; M1.7c)
`GET /api/v1/drugs/tree?search=&source=` → `DrugsController.GetTree`, policy `ClinicContext`, permission `drugs.list`
(missing → 403 `forbidden`; a platform token → 403). `GetDrugTreeQueryValidator`: `source` must pass `DrugSource.IsValid`
→ 400 `invalidRequest` (field `source`), as `GET /drugs`. No new error.

- **Handler** (`Catalog/Drugs/Queries/GetDrugTree/GetDrugTreeQueryHandler`): loads `Categories` / `SubCategories` once
  (≤ ~205 rows, untracked), then `DrugQueries.ListedAsync(db, new DrugListFilter(search, source, null, null),
  new CatalogNames(categories, subCategories))` (the one composition: visible + not withdrawn + source + search incl.
  category names, matched against the rows passed in instead of loading them again; `GET /drugs` keeps the overload
  without them), then **one** aggregate query `GroupBy(CategoryId, SubCategoryId)` with `Count()`; joined in memory
  with the same rows. `pinnedLast` = `CategoryIds.IsPinnedLast(id)` /
  `SubCategoryIds.IsPinnedLast(id)`; the bucket (null subcategory, «بدون تصنيف فرعي») has `pinnedLast: false` and null
  names.
- **Answer** (`DrugTreeDto`): only rows with `count > 0` (without a search too). Categories by `id`; their subcategories
  by `id`, the bucket last; a category's `count` = the sum of its subcategories' counts. No match →
  `{ "categories": [] }`. The SPA sorts for display (D5). JSON: `{ categories: [{ id, nameEn, nameAr, pinnedLast, count,
  subCategories: [{ id | null, nameEn | null, nameAr | null, pinnedLast, count }] }] }`.
- **Invariant with `GET /drugs`**: for any search and source, a bucket's `count` = `GET /drugs?categoryId=&subCategoryId=<id>|none`
  (same search and source) `totalCount`, and the sum over categories = `GET /drugs` `totalCount`: both go through
  `ListedAsync`.
- **Isolation**: the clinic query filter (another clinic's own drugs are never counted); withdrawn drugs are never
  counted.

### Performance measure (design D7; M1.7c)
Budget: < 100 ms per tree or list request, warm, median of 20 requests on the dev machine. Measured by the integration
test `tests/ClinicHub.IntegrationTests/Catalog/Tree/TreePerformanceTests`, which **reports and never fails on time**: it
writes `artifacts/performance/m1.7c-tree.md` (one row per request: route, query, median, p90, max, ms) for
`GET /drugs/tree` and `GET /drugs` with no search, "a" and «ا» (page 1 and the last page), on the loaded catalog and on
a clinic with 5,000 own drugs added (inserted through the app's `DbContext` in that clinic's scope, so the interceptor
fills the search columns). If the budget fails, the fix is decided with the user (D7; a trigram index would be a
PostgreSQL-only piece, D4).

### Admin routes
Admin routes (`ClinicHub.Api/Features/Platform/AdminDrugsController.cs`, `AdminCategoriesController.cs`; `PlatformAdmin`
policy; a platform request sees only shared drugs, so an own drug's id is 404):

| Method | Route | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/admin/drugs?search=&status=&categoryId=&subCategoryId=&page=&pageSize=` | query | `PagedResult<AdminDrugDto>` | 400 `invalidRequest` (`status` not `active`/`withdrawn`/`all`; `subCategoryId` as on the clinic list) |
| GET | `/admin/drugs/{id}` | | `AdminDrugDto` (withdrawn too) | 404 `notFound` («The shared drug does not exist.»): unknown or own |
| POST | `/admin/drugs` | `SaveSharedDrugRequest { name, activeIngredients, description, categoryId, subCategoryId }` | 201 `AdminDrugDto` | 400 as the clinic create without dosing (`nameRequired`… `textTooLong`, `invalidText`, `categoryRequired`; then `categoryNotFound`, `subCategoryNotFound`) |
| PUT | `/admin/drugs/{id}` | same | `AdminDrugDto` | as POST, then 404 |
| POST | `/admin/drugs/{id}/withdraw`, `/restore` | | 204 (idempotent) | 404 |
| GET | `/admin/drug-categories` | | `AdminCategoryDto[]` | |
| POST | `/admin/drug-categories` | `SaveCategoryRequest { nameEn, nameAr }` | 201 `CategoryDto` (`Location`: the list) | 400 name rules (`nameEn`, `nameAr`), 409 `categoryNameTaken` |
| PUT | `/admin/drug-categories/{id}` | same | `CategoryDto` | 400, 409 `categoryNameTaken`, then 404 |
| DELETE | `/admin/drug-categories/{id}` | | 204 | 404, then 409 `categoryInUse` + `drugCount` |
| POST | `/admin/drug-categories/{id}/subcategories` | same | 201 `SubCategoryDto` | 400, 404 (category), then 409 `subCategoryNameTaken` |
| PUT | `/admin/drug-subcategories/{id}` | same (a `categoryId` is ignored) | `SubCategoryDto` | 400, 404, then 409 `subCategoryNameTaken` |
| DELETE | `/admin/drug-subcategories/{id}` | | 204 | 404, then 409 `subCategoryInUse` + `drugCount` |

- `AdminDrugDto = { id, name, activeIngredients, description, withdrawn, withdrawnAt, category, subCategory }` (no
  dosing, no `isShared`, never the Arabic name; an unknown `defaultDosing` or `nameAr` property is ignored).
- `AdminCategoryDto = { id, nameEn, nameAr, pinnedLast, drugCount, deletedClinicsDrugCount, noSubCategoryDrugCount,
  subCategories: [{ id, nameEn, nameAr, pinnedLast, drugCount, deletedClinicsDrugCount }] }`; counts cover shared
  drugs (withdrawn too) and every clinic's own, deleted clinics included.
- `categoryInUse` / `subCategoryInUse` travel as a `CountError`: the ProblemDetails gets `drugCount`.

## Backend
`ClinicHub.Application/Features/Platform/SharedDrugs/` and `Platform/DrugCategories/` (+ `Catalog/Categories/`):

| Use case | Notes |
|---|---|
| `GetSharedDrugsQuery` (+ validator) | status filter (default active), then `DrugQueries.FilteredAsync` and `InListOrder` |
| `GetSharedDrugQuery` | `ClinicId == null` only |
| `CreateSharedDrugCommand` / `UpdateSharedDrugCommand` (+ validators) | name → ingredients → description → `categoryRequired`; handler `categoryNotFound` → `subCategoryNotFound` → 404 (update); saved inside `UseSharedCatalog()`. Update: a name differing from the stored one (ordinal, trimmed) clears `NameAr` (the interceptor refolds `SearchOther`); a withdrawn drug stays withdrawn |
| `WithdrawSharedDrugCommand` / `RestoreSharedDrugCommand` | `Drug.Withdraw(TimeProvider now)` keeps the first time; `Restore()` clears both; 204 also when nothing changes |
| `CreateCategoryCommand` / `RenameCategoryCommand` (+ validators) | `ValidName(100)` on both names; name taken per language among the other categories (`CategoryRules.NameTaken`: trimmed + `SearchText.Fold`, in memory; field `nameEn` checked first) → then 404 (rename) |
| `CreateSubCategoryCommand` / `RenameSubCategoryCommand` (+ validators) | 404 (category / subcategory) → name taken within the category; added or renamed without loading the category row (its `UpdatedAt` never moves) |
| `DeleteCategoryCommand` / `DeleteSubCategoryCommand` | 404 → in use (`Drugs.IgnoreQueryFilters()` count) → real delete; a category's (empty) subcategories are deleted with it |
| `GetAdminCategoriesQuery` | categories with subcategories by id + two grouped counts over every drug (all, and those of deleted clinics) summed in memory |
| `GetCategoriesQuery` (clinic) | every category with all its subcategories, by id |
| `GetDrugTreeQuery` (clinic, + validator, `Catalog/Drugs/Queries/GetDrugTree/`) | see [Drug tree](#drug-tree-get-drugstree-design-d7-d8-m17c) |

**Provisioning** (`Platform/Provisioning/Seeders/TemplateCatalogSeeder`, step 30): copies the template's **own** drugs
(`IgnoreQueryFilters().Where(ClinicId == template)`: name, active ingredients, description, dosing, category,
subcategory), then every template protocol, even when the template has no own drug. A line keeps a shared drug's id
(withdrawn too), points a template own drug's line to its copy, and any other id throws `KeyNotFoundException` (500,
rolled back; only in the accepted race).

**Dev seed** (`Infrastructure/Platform/StartupSeeder`, Development, empty database): the template sample is skipped when
the template has own drugs (`AnyAsync(d => d.ClinicId != null)`). When the catalog isn't loaded (no «العيون» category or
no "VIGAMOX 0.5% EYE DROPS 5 ML") the dev seed stores nothing (no demo clinic either) and warns naming
`data/drug-catalog/tools/load_catalog.py`, so the first start after the load seeds everything (CAT-230). Else: two own drugs in «العيون» and the protocol "After cataract surgery" = VIGAMOX (line
dosing) + the own steroid (taper, eye asked). The demo clinics get no bulk drugs.

**Import** (design D11): `data/drug-catalog/tools/load_catalog.py --connection "<conninfo>"`, once per database, in one
transaction (categories and subcategories with their fixed ids, 23,414 shared drugs with both search columns, the
sequences set past the fixed ids). The integration harness and the e2e setup run it ([testing README](../../testing/README.md)).

## Frontend
Admin screens `/admin/drugs` (`features/admin/drugs/`) and `/admin/categories` (`features/admin/categories/`), the
withdrawn chip and the clinic-side changes: see the contract § 3 and the [prescription](../prescription/tech.md) and
[drugs](../drugs/tech.md) docs (web track).

## Edge cases & limitations
- Two creates of the same category name at once: two rows or a 500 (no unique index; accepted, D5).
- A (sub)category used only by a deleted clinic's drugs stays blocked; the admin screen shows that share.
- A subcategory deleted between the check and a drug insert: the FK refuses it (500, nothing saved; accepted).
- A drug withdrawn between a protocol save's check and its insert: the line is saved (accepted race).
- Direct SQL edits of the database are not guarded (design § 6).

## Testing notes
Catalog area CAT (CAT-001 to CAT-229, M1.7b and M1.7c), with ISO-044–046, ADM-293–295 and the changed DRUG, GRP, ISO, ADM
cases ([test catalog](../../testing/test-catalog.md)). Integration tests under `tests/ClinicHub.IntegrationTests/Catalog/`
(`SharedCatalog/`, `Withdrawn/`, `SharedProtocols/`) and `Admin/` (`SharedDrugs/`, `Categories/`, `Provisioning/`); they
use their own shared drugs and categories (`Data.SharedDrug()`, `Data.Category()`, `Data.SubCategory()`), never imported
rows (the reset's baseline check).
