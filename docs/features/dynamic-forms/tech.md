# Dynamic forms: technical

## Summary
A separate module where the super admin keeps forms on the server: a form's name and its definition (a JSON object the server never reads inside, D4), with versioning and soft delete. This is feature 1, the backend: tables, five `/api/v1/admin/forms` routes, and the "used" check that decides whether a save makes a new version. The builder, Preview, extra controls and images are features 2 to 4. The decisions behind it: [the design](../../design/dynamic-forms.md); the precise rules and cases: [the backend contract](../../design/dynamic-forms.backend.contract.md). Business rules: [business (Arabic)](business.md).

## Data model
Platform rows, like drug categories: no `ClinicId`, and every route is `PlatformAdmin`. Entities in `ClinicHub.Domain/Forms` (`Form`, `FormVersion`, both `IHasTimestamps`), one configuration each in `Database/Configurations/Forms/`.

**`Forms`**

| Column | Type | Rules |
|---|---|---|
| Id | int PK | |
| Name | varchar(256) | Stored trimmed; may repeat |
| SearchName | text | Filled by the save interceptor (`HasSearchName(nameof(Form.Name))`) |
| ActiveVersionNumber | int not null | The one active version |
| IsDeleted | boolean not null, default false | Set with `DeletedAt` in the one place that deletes, `Form.Delete(now)` |
| DeletedAt | timestamptz null | |
| CreatedAt, UpdatedAt | timestamptz | |

**`FormVersions`**

| Column | Type | Rules |
|---|---|---|
| FormId | int | FK `Forms.Id`, restrict |
| VersionNumber | int | From 1. PK (`FormId`, `VersionNumber`) |
| Definition | text | `GetRawText()` of the definition as sent; nothing queries inside it. A JSON string's `\u0000` escape stays an escape in the text column, so it stores and reads back |
| CreatedAt, UpdatedAt | timestamptz | |

**One active version (D7):** a required column holds one value, so a form can't have zero or two active versions. A composite foreign key `FK_Forms_FormVersions_Active`, (`Forms.Id`, `Forms.ActiveVersionNumber`) to `FormVersions` (`FormId`, `VersionNumber`), `DEFERRABLE INITIALLY DEFERRED`, proves that the version exists. It is checked at commit, because the form and its first version are inserted together. EF knows only `FormVersions.FormId` → `Forms.Id`; this one is raw SQL in the migration.

**Migration `AddForms`:** the two tables and, by raw SQL after them, that constraint. It touches no existing row, so no data step. Down drops the constraint first (the cycle blocks either `DROP TABLE`), then the tables.

## API
Base `/api/v1/admin/forms`, policy `PlatformAdmin`, no permission keys. `AdminFormsController` in `ClinicHub.Api/Features/Forms/`.

| Method | Route | Request | Response | Errors (codes) |
|---|---|---|---|---|
| GET | `?search=&page=1&pageSize=20` | | `PagedResult<FormSummary>` (`id`, `name`, `activeVersionNumber`, `updatedAt`) | |
| GET | `/{id}` | | `FormDetails`: the summary plus `definition`, the active version's JSON | 404 `notFound` |
| POST | `/` | `{ name, definition }` | 201, `Location: /api/v1/admin/forms/{id}`, `FormDetails` with `activeVersionNumber` 1 | 400 (below) |
| PUT | `/{id}` | `{ name, definition }` | 200, `FormDetails` | 400 (below), 404 `notFound` |
| DELETE | `/{id}` | | 204, soft delete | 404 `notFound` |

- A missing or deleted id answers 404 `notFound` on GET, PUT and DELETE, also on a second DELETE. An id that isn't a number never reaches a route (404 `notFound`).
- No token: 401 `unauthorized`. A clinic token: 403 on all five routes, before the body is read.
- Names may repeat, also among forms not deleted. A deleted form's name can be used again.
- A body that isn't JSON, or nests deeper than ASP.NET's reader allows (32 levels from the body's root; not configured here): 400 `invalidRequest` from the model binder, never 500.

## Backend
**Folders:** `Application/Features/Forms/Definitions/`: `FormDto` (`FormSummary`, `FormDetails`), `FormErrors`, `FormLimits`, `FormQueries` (`NotDeleted`), `FormDefinitionJson` (the shell's checks, both validators use it, and reading the stored text back), `IFormUsage` + `NoFormUsage`; `Commands/` (`CreateForm`, `SaveForm`, `DeleteForm`), `Queries/` (`GetForms`, `GetForm`).

**The list:** forms not deleted, ordered by name, then id. With a search term: names containing it (`SearchName`, folded with the app's `SearchText`, so أ/ا match), names starting with it first, then by name, then id. Page and size go through `Paging.Normalize`. A blank search lists everything.

**The outer shell (D4).** A validator per command; the pipeline runs validation before the handler, so on `PUT` an invalid body answers 400 even for a missing id. Rules in this order:

| # | Rule |
|---|---|
| V1 | `name`: `ValidName()`, so `nameRequired`, `nameInvalid`, `nameTooLong` (256 once trimmed), with `field: "name"` |
| V2 | `definition` missing, JSON `null`, or anything but a JSON object (string, number, boolean, array): 400 `formDefinitionInvalid`, `field: "definition"`. Only that error, whatever its size |
| V2b | An object the server could not read back: a lone surrogate escape in a key or value (`"\ud800"`), a raw byte that isn't UTF-8 inside a string, or a number with an exponent too large to compare (`1e99999999999`): 400 `formDefinitionInvalid`, `field: "definition"`. This isn't a check of the content (D4): without it the row would be written and then every GET and PUT of it would answer 500 |
| V3 | `definition`, once an object, longer than `FormLimits.DefinitionMaxBytes` (1,048,576) UTF-8 bytes of its JSON text as sent (`JsonElement.GetRawText()`, whitespace inside and each `\uXXXX` escape counted as written): 400 `formDefinitionTooLarge`, `field: "definition"`. Exactly the limit passes |
| V4 | Errors of `name` and `definition` are reported together in `errors`; `name`'s come first, so `code` is the first of them |
| V5 | Nothing inside the object is read: `{}`, no `nodes`, an unknown or newer `schemaVersion`, any key or value are all accepted and given back |

**Saving (D5, D6).** One transaction (`TransactionBehavior`). The stored text is `GetRawText()` of the definition as sent.

| # | Rule |
|---|---|
| S1 | **Unchanged** means `JsonElement.DeepEquals` between the stored definition (the active version's) and the sent one: key order, whitespace and number spelling (`1` and `1.0`) make no version |
| S2 | Unchanged: only the name is written. The active version's row isn't touched (its text and `UpdatedAt` stay) |
| S3 | Changed, `IFormUsage.IsUsedAsync` false: the active version's definition is replaced; `ActiveVersionNumber` stays |
| S4 | Changed, `IsUsedAsync` true: a new `FormVersions` row with the highest existing number plus 1 becomes active. The old row stays as it was |
| S5 | Every successful `PUT` calls `db.Touch(form)`, so `Forms.UpdatedAt` and the answer's `updatedAt` move, even when nothing changed |
| S7 | `NoFormUsage`, the registered `IFormUsage`, always answers false. It is scoped, behind the interface, and tests replace it through DI. The first consumer of a form (M2.2) makes it real |

**Soft delete (D8).** The one place that deletes is `Form.Delete(now)`: it sets `IsDeleted = true` and `DeletedAt = now` (`TimeProvider`) together. Rows of `Forms` and `FormVersions` stay. Deleted forms are excluded by `db.Forms.NotDeleted()` (on `IsDeleted`); no query filter. No restore.

## Frontend
None yet: the screens come with the builder (feature 2). The compiled contract's TypeScript types and MSW handlers are ready for it, and the `errors.*` texts of the two definition codes are in both locales.

## Edge cases & limitations
- Two saves racing on the "used" path: the second answers 500 `unexpected` (the primary key refuses the same number). A documented near-impossible case, as print templates document theirs. Not tested. Otherwise the last write wins.
- Every form stays on version 1 until a consumer exists. Not built: a version history screen, a list-versions route, a route to switch the active version.
- No restore for a deleted form.
- The stored spelling of an unchanged definition stays the first one sent (S1, S2).

## Testing notes
Area `forms`, case IDs `FRM-` ([test catalog](../../testing/test-catalog.md)). `api` tests in `tests/ClinicHub.IntegrationTests/Forms/` (the "used" path replaces `IFormUsage` through `FormsAppFixture`), `unit` tests of the validators and `Form.Delete` in `tests/ClinicHub.UnitTests/Forms/`. No `manual` cases. The migration's up, down and up are cases of the area (FRM-116, FRM-117).
