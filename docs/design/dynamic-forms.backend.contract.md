# Dynamic forms feature 1 (backend): contract

Status: T0. The rules below add precision to [the design](dynamic-forms.md) § 4 and never change it. Business rules: [business (Arabic)](../features/dynamic-forms/business.md). Coders and test writers work from this file and the compiled contract, and a rule or contract change goes through the feature session to both sides.

## 1. API

Base `/api/v1/admin/forms`, policy `PlatformAdmin`, no permission keys. Compiled in `ClinicHub.Api/Features/Forms/AdminFormsController.cs` and `ClinicHub.Application/Features/Forms/Definitions/`.

| # | Rule |
|---|---|
| A1 | `GET ?search=&page=1&pageSize=20` answers `PagedResult<FormSummary>` (`items`, `totalCount`, `page`, `pageSize`): forms not deleted, ordered by name, then id. With a search term: names containing it (`SearchName`, folded with the app's `SearchText`, so أ/ا match), names starting with it first, then by name, then id. Page and size go through `Paging.Normalize`. A blank search lists everything |
| A2 | `GET /{id}` answers `FormDetails`: the summary plus `definition`, the active version's JSON |
| A3 | `POST /` with `{ name, definition }` answers 201, `Location: /api/v1/admin/forms/{id}`, and `FormDetails` with `activeVersionNumber` 1 |
| A4 | `PUT /{id}` with `{ name, definition }` answers 200 and `FormDetails` after § 3 |
| A5 | `DELETE /{id}` answers 204 and soft deletes (§ 4) |
| A6 | A missing or deleted id answers 404 `notFound` on GET, PUT and DELETE, also on a second DELETE. An id that isn't a number never reaches a route (404 `notFound`) |
| A7 | No token: 401 `unauthorized`. A clinic token: 403 on all five routes, before the body is read |
| A8 | Names may repeat, also among forms not deleted. A deleted form's name can be used again |

## 2. The outer shell (D4)

A validator per command (`CreateFormCommandValidator`, `SaveFormCommandValidator`). The pipeline runs validation before the handler, so on `PUT` an invalid body answers 400 even for a missing id.

| # | Rule |
|---|---|
| V1 | `name`: `ValidName()`, so `nameRequired`, `nameInvalid`, `nameTooLong` (256 once trimmed), with `field: "name"`. The name is stored trimmed |
| V2 | `definition` missing, JSON `null`, or anything but a JSON object (string, number, boolean, array): 400 `formDefinitionInvalid`, `field: "definition"`. Only that error, whatever its size |
| V2b | An object the server could not read back: a lone surrogate escape in a key or value (`"\ud800"`), a raw byte that isn't UTF-8 inside a string, or a number with an exponent too large to compare (`1e99999999999`): 400 `formDefinitionInvalid`, `field: "definition"`. This isn't a check of the content (D4): without it the row would be written and then every GET and PUT of it would answer 500. Both validators run `GetRawText()`, `WriteTo(new Utf8JsonWriter(Stream.Null))` and `JsonElement.DeepEquals(d, d)`, catching `InvalidOperationException` and `ArgumentException` (`JsonException` included where the writer throws it); a throw is this error |
| V3 | `definition`, once an object, longer than `FormLimits.DefinitionMaxBytes` (1,048,576) UTF-8 bytes of its JSON text as sent (`JsonElement.GetRawText()`, whitespace inside and each `\uXXXX` escape counted as written): 400 `formDefinitionTooLarge`, `field: "definition"`. Exactly the limit passes |
| V4 | Errors of `name` and `definition` are reported together in `errors`; `name`'s come first, so `code` is the first of them |
| V5 | Nothing inside the object is read: `{}`, no `nodes`, an unknown or newer `schemaVersion`, any key or value are all accepted and given back |
| V6 | A body that isn't JSON, or nests deeper than ASP.NET's reader allows (32 levels from the body's root; not configured here): 400 `invalidRequest` from the model binder, never 500 |

## 3. Saving

One transaction (`TransactionBehavior`). The stored text is `GetRawText()` of the definition as sent. A JSON string's `\u0000` escape stays an escape in the text column, so it stores and reads back.

| # | Rule |
|---|---|
| S1 | **Unchanged** means `JsonElement.DeepEquals` between the stored definition (the active version's) and the sent one: key order, whitespace and number spelling (`1` and `1.0`) make no version |
| S2 | Unchanged: only the name is written. The active version's row isn't touched (its text and `UpdatedAt` stay) |
| S3 | Changed, `IFormUsage.IsUsedAsync` false: the active version's definition is replaced; `ActiveVersionNumber` stays |
| S4 | Changed, `IsUsedAsync` true: a new `FormVersions` row with the highest existing number plus 1 becomes active. The old row stays as it was |
| S5 | Every successful `PUT` calls `db.Touch(form)`, so `Forms.UpdatedAt` and the answer's `updatedAt` move, even when nothing changed |
| S6 | Two saves racing on the "used" path: the second answers 500 `unexpected` (the primary key refuses the same number). A documented near-impossible case, as print templates document theirs. Not tested. Otherwise the last write wins |
| S7 | `NoFormUsage`, the registered `IFormUsage`, always answers false. It is scoped, behind the interface, and tests replace it through DI |

## 4. Soft delete

The one place that deletes is `Form.Delete(now)`: it sets `IsDeleted = true` and `DeletedAt = now` (`TimeProvider`) together. Rows of `Forms` and `FormVersions` stay. Deleted forms are excluded by `db.Forms.NotDeleted()` (on `IsDeleted`); no query filter. No restore.

## 5. Tables

As [the design](dynamic-forms.md) § 4.1. Entities in `ClinicHub.Domain/Forms` (`Form : IHasTimestamps`, `FormVersion : IHasTimestamps`), one configuration each in `Database/Configurations/Forms/`, `HasSearchName(nameof(Form.Name))`. `FormVersions.FormId` → `Forms.Id` with restrict.

The migration `AddForms` adds the two tables and, by raw SQL after them, `ALTER TABLE "Forms" ADD CONSTRAINT "FK_Forms_FormVersions_Active" FOREIGN KEY ("Id", "ActiveVersionNumber") REFERENCES "FormVersions" ("FormId", "VersionNumber") DEFERRABLE INITIALLY DEFERRED`. Down drops that constraint first, then the tables. The migration touches no existing row.

## 6. Test cases (area `forms`, `FRM-`)

Draft for T1: the writers copy the rows into the catalog (source links relative to it). Level `api` unless said. Every test tagged `[Trait("Area", "forms")]` and `[Trait("Case", "FRM-nnn")]`.

### List

| ID | Case | P | Source |
|---|---|---|---|
| FRM-001 | Given forms named "B" and "A", when the super admin lists, then both are in the answer in name order, each with `id`, `name`, `activeVersionNumber` 1 and `updatedAt`, and no `definition` | P0 | A1 |
| FRM-002 | Given no form, when listing, then `items` is empty and `totalCount` 0 | P1 | A1 |
| FRM-003 | Given a deleted form, when listing, then it isn't in `items` nor counted in `totalCount` | P0 | A1, § 4 |
| FRM-004 | Given 3 forms, when listing with `pageSize=2` and `page=2`, then the last one, `totalCount` 3, `page` 2, `pageSize` 2 | P1 | A1 |
| FRM-005 | Given `page=0` and `pageSize=1000`, when listing, then the answer says page 1 and size 100 | P2 | A1 |
| FRM-006 | Given "Zeta form" and "Form alpha", when searching `form`, then "Form alpha" comes first (starts with it) and both are listed; with a search matching neither, none | P1 | A1 |
| FRM-007 | Given «أشعة», when searching `اشعة`, then it's found (folded, as the app's other lists) | P1 | A1 |
| FRM-008 | Given two forms with the same name, when listing, then they come by id | P2 | A1, A8 |
| FRM-009 | Given a form, when searching only spaces, then every form is listed | P2 | A1 |

### Read

| ID | Case | P | Source |
|---|---|---|---|
| FRM-020 | Given a form, when the super admin GETs it, then 200 with the summary fields and `definition` equal to what was saved | P0 | A2 |
| FRM-021 | Given no such id, when GET, then 404 `notFound` | P0 | A6 |
| FRM-022 | Given a deleted form, when GET, then 404 `notFound` | P0 | A6 |
| FRM-023 | Given a definition with keys in PascalCase and snake_case, when read back, then the keys are exactly as sent (the API's camelCase policy doesn't touch them) | P1 | V5 |

### Create

| ID | Case | P | Source |
|---|---|---|---|
| FRM-030 | Given a valid body, when POST, then 201, `Location` of the new form, `FormDetails` with version 1 active, and a GET answers the same | P0 | A3 |
| FRM-031 | Given a successful POST, then the database has one `FormVersions` row, number 1, holding the definition, and `Forms.ActiveVersionNumber` is 1, `IsDeleted` false, `DeletedAt` null | P0 | A3, § 5 |
| FRM-032 | Given the name of an existing form, when POST, then 201 and both exist | P1 | A8 |
| FRM-033 | Given the name of a deleted form, when POST, then 201 | P1 | A8 |
| FRM-034 | Given `  name  `, when POST, then the name is stored and answered trimmed | P1 | V1 |

### Shell

| ID | Case | P | Source |
|---|---|---|---|
| FRM-040 | Given a missing, empty or blank name, when POST and when PUT, then 400 `nameRequired`, `field: "name"`, and nothing is written | P0 | V1 |
| FRM-041 | Given a name with a control character, when POST and when PUT, then 400 `nameInvalid` | P1 | V1 |
| FRM-042 | Given a name of 256 characters after trimming, then it's accepted; of 257, then 400 `nameTooLong` (POST and PUT) | P1 | V1 |
| FRM-043 | Given `definition` missing, when POST and when PUT, then 400 `formDefinitionInvalid`, `field: "definition"` | P0 | V2 |
| FRM-044 | Given `definition` null, a string, a number, a boolean or an array, when POST and when PUT, then 400 `formDefinitionInvalid` | P0 | V2 |
| FRM-045 | Given a definition of exactly 1,048,576 UTF-8 bytes, then it's accepted; of 1,048,577, then 400 `formDefinitionTooLarge` (POST and PUT) | P0 | V3 |
| FRM-046 | Given a definition of 600,000 Arabic letters (under the limit in characters, over it in bytes), then 400 `formDefinitionTooLarge` | P1 | V3 |
| FRM-047 | Given a blank name and an invalid definition, then 400 with `code` `nameRequired` and both errors in `errors` | P1 | V4 |
| FRM-048 | Given `{}`, a definition without `nodes`, and one with `schemaVersion` 99, when POST, then 201 and it reads back as sent | P0 | V5, D4 |
| FRM-049 | Given a body that isn't JSON, when POST, then 400 `invalidRequest` | P1 | V6 |
| FRM-050 | Given a definition nesting past the reader's depth, when POST, then 400 `invalidRequest`, never 500 | P1 | V6 |
| FRM-051 | Given a definition holding the escape `\u0000` in a string, when POST and GET, then 201 and it reads back | P1 | § 3 |
| FRM-052 | Given an invalid body and a missing id, when PUT, then 400 (validation runs first) | P2 | § 2 |
| `unit` FRM-060 | The create validator: each of V1 to V3's outcomes, with the exact code and field | P1 | § 2 |
| `unit` FRM-061 | The save validator: each of V1 to V3's outcomes, with the exact code and field | P1 | § 2 |

### Save

| ID | Case | P | Source |
|---|---|---|---|
| FRM-070 | Given a form not used, when PUT with another definition and name, then 200, both changed, `activeVersionNumber` 1, and a GET answers the same | P0 | S3 |
| FRM-071 | Given FRM-070, then the database has still one `FormVersions` row, number 1, holding the new definition | P0 | S3 |
| FRM-072 | Given a form not used, when PUT with the same definition and another name, then the name changes and the version row's text and `UpdatedAt` stay | P0 | S2 |
| FRM-073 | Given the same definition with keys reordered and other whitespace, when PUT, then no version row changes: its stored text, read in the database, is still the first spelling | P0 | S1 |
| FRM-074 | Given `1` saved, when PUT with `1.0`, then the definition counts as unchanged | P2 | S1 |
| FRM-075 | Given a form used (`IFormUsage` replaced), when PUT with another definition, then a version 2 is created and active, the answer says 2, and version 1 keeps its text and `UpdatedAt` | P0 | S4, D6 |
| FRM-076 | Given a form used, when PUT with the same definition and another name, then no version is created, the name changes | P0 | S2, S4 |
| FRM-077 | Given a form on version 2 (made while used) and no longer used, when PUT with another definition, then version 2 is replaced, version 1 is untouched, active stays 2 | P1 | S3 |
| FRM-078 | Given a form on version 2 and used, when PUT with another definition, then version 3 is created and active | P1 | S4 |
| FRM-079 | Given a form, when PUT with nothing changed and the clock advanced, then `updatedAt` moved, in the answer and in the list | P0 | S5 |
| FRM-080 | Given a definition change only, when PUT with the clock advanced, then `updatedAt` moved | P0 | S5 |
| FRM-081 | Given no such id or a deleted form, when PUT with a valid body, then 404 `notFound` and nothing is written | P0 | A6 |
| FRM-082 | The registered `IFormUsage` answers false, for any id | P0 | S7, D6 |
| FRM-083 | Given a form with a definition, when two PUTs follow (A then B), then the last one's name and definition stay | P2 | S6 |

### Delete

| ID | Case | P | Source |
|---|---|---|---|
| FRM-090 | Given a form, when DELETE, then 204 and GET answers 404 | P0 | A5 |
| FRM-091 | Given a deleted form, then its `Forms` row has `IsDeleted` true and `DeletedAt` the clock's time, and its `FormVersions` rows are all still there, unchanged | P0 | § 4, D8 |
| FRM-092 | Given a deleted form or no such id, when DELETE, then 404 `notFound` and `DeletedAt` doesn't move | P0 | A6 |
| FRM-093 | Given a form on versions 1 and 2, when DELETE, then both version rows stay | P1 | § 4 |

### Access

| ID | Case | P | Source |
|---|---|---|---|
| FRM-100 | Given no token, when calling each of the five routes, then 401 `unauthorized` | P0 | A7 |
| FRM-101 | Given a clinic token, even the Owner's, when calling each of the five routes, then 403 and nothing is written | P0 | A7, D9 |
| FRM-102 | Given a super admin token in no clinic, when calling the five routes in order, then each works (a full journey) | P0 | D9 |

### Database

| ID | Case | P | Source |
|---|---|---|---|
| FRM-110 | Inserting a `Forms` row whose `ActiveVersionNumber` has no version fails at commit | P0 | D7, § 5 |
| FRM-111 | A `Forms` row and its first `FormVersions` row inserted in one transaction, the form first, commit | P0 | D7, § 5 |
| FRM-112 | `ActiveVersionNumber` can't be null | P0 | D7 |
| FRM-113 | Setting `ActiveVersionNumber` to a number with no version fails at commit | P0 | D7 |
| FRM-114 | The active version's row can't be deleted, and a `Forms` row with versions can't be deleted | P1 | § 5 |
| FRM-115 | `FK_Forms_FormVersions_Active` exists, deferrable and initially deferred | P1 | § 5 |
| FRM-116 | `AddForms` up on the previous migration adds both tables empty; existing tables and their rows are unchanged | P1 | § 5 |
| FRM-117 | `AddForms` down drops the constraint and both tables, and up again gives the same schema | P1 | § 5 |
| FRM-118 | `AddForms` columns: types, nullability, `Name` length 256, `IsDeleted` default false, `Definition` text, no `ClinicId`; primary key `(FormId, VersionNumber)` | P1 | § 5 |
| FRM-119 | A second `FormVersions` row with the same `(FormId, VersionNumber)` is refused | P1 | § 5, S6 |

### Edge cases of T0

| ID | Case | P | Source |
|---|---|---|---|
| FRM-130 | Given a lone surrogate escape in a value or in a key, when POST and when PUT, then 400 `formDefinitionInvalid`, never 500, and no row is written | P0 | V2b |
| FRM-170 | Given a raw 0xFF byte inside a string of the definition, when POST and when PUT, then 400 `formDefinitionInvalid`, never 500, and no row is written | P1 | V2b |
| FRM-171 | Given a number such as `1e99999999999`, when POST and when PUT, then 400 `formDefinitionInvalid`, and no row is written | P1 | V2b |
| FRM-131 | Given an array or a string over 1 MB as `definition`, when POST, then 400 `formDefinitionInvalid` only | P2 | V2 |
| FRM-132 | Given id `abc`, `1.5` or `2147483648`, when GET, PUT and DELETE as the super admin, then 404 `notFound` | P1 | A6 |
| FRM-133 | Given id `0` or `-1`, when GET, PUT and DELETE, then 404 `notFound` | P2 | A6 |
| FRM-134 | Given a malformed body, when POST and PUT with a clinic token, then 403; with no token, then 401 (never 400) | P0 | A7 |
| FRM-135 | Only the five routes exist under `/admin/forms`: nothing lists versions, switches the active one or restores (read from the app's endpoints) | P2 | § 4.2, § 4 |
| FRM-136 | Given a POST to `/{id}` or a PUT to `/`, then 405 `methodNotAllowed` | P2 | A1 to A5 |
| FRM-137 | Given two identical POSTs, then 201 twice, two ids, one version row each | P1 | A3, A8 |
| FRM-138 | Given a form's definition POSTed under another name (Duplicate), then a separate form, and saving one leaves the other as it was | P2 | § 4.3 |
| FRM-139 | Given `pageSize=0`, then size 1; `page=-1`, then page 1 | P2 | A1 |
| FRM-140 | Given a page past the end or `page=2147483647&pageSize=100`, then 200, empty `items`, the right `totalCount` | P2 | A1 |
| FRM-141 | Given `page=abc` or `pageSize=99999999999`, then 400 `invalidRequest` | P2 | A1 |
| FRM-142 | Given a search with `%`, `_` or `\`, then only literal matches | P1 | A1 |
| FRM-143 | Given `search=%00`, then every form; `search=a%00` acts as `a` | P2 | A1 |
| FRM-144 | Given a search of only a tatweel or diacritics, then every form | P2 | A1 |
| FRM-145 | Given 3 matches and a deleted match with `pageSize=2`, then `totalCount` 3 and no deleted form listed or counted | P1 | A1, § 4 |
| FRM-146 | Given «أشعة ب» and «تقرير اشعة», when searching `اشعة`, then «أشعة ب» first; two prefix matches go by name; the same name by id | P1 | A1 |
| FRM-147 | Given a form renamed by PUT, when searching, then it's found by the new name (folded) and not by the old, also when the definition is unchanged | P0 | § 5, S2 |
| FRM-148 | Given an Arabic name of 256 letters with spaces around it, when PUT, then accepted and stored trimmed; 257 refused (characters, not bytes) | P1 | V1 |
| FRM-149 | Given name `null`, then `nameRequired`; a name that is a number or an object, an empty body, or a body `null`, then 400 `invalidRequest` | P1 | V1, V6 |
| FRM-150 | Given a name with U+2028, U+202E or `\u0000`, then `nameInvalid`, never 500 | P2 | V1 |
| FRM-151 | Given a POST, then the stored text equals the sent raw text exactly: whitespace, key order, `\u` escapes and literal Arabic, read in the database | P0 | § 3 |
| FRM-152 | Given exactly the limit in 2-byte Arabic, then accepted and read back; inner whitespace and each `\uXXXX` count as written | P2 | V3 |
| FRM-153 | Given a 5 MB definition, then 400 `formDefinitionTooLarge` | P2 | V3 |
| FRM-154 | Given a definition at the exact limit, when PUT unchanged, then 200 and the version's text and `UpdatedAt` stay | P2 | V3, S2 |
| FRM-155 | Given a definition at the reader's deepest level (the body is 32 levels), then POST 201, GET equal and PUT unchanged writes no version; one level more, then 400 `invalidRequest` | P1 | V6 |
| FRM-156 | Given the same value spelled otherwise (`"أ"` and `"أ"`, an escaped key, `1e2` and `100`, `0` and `-0`), when PUT, then no version row is written | P1 | S1 |
| FRM-157 | Given a changed array order, swapped duplicate keys, two numbers differing at the 22nd decimal, or a key's case, when PUT, then the definition counts as changed | P1 | S1 |
| FRM-158 | Given duplicate keys, `1e400` and a 23-digit integer, when POST and GET, then they read back with the number's text intact | P2 | V5 |
| FRM-159 | Given a stored `\u0000` escape, when PUT unchanged, then no version write | P2 | § 3 |
| FRM-160 | Given a form on version 2 and used, when PUT with version 1's text, then version 3 (compared with the active one, not the first) | P1 | S1 |
| FRM-161 | Given versions 1 and 2 with active set to 1 by SQL, then GET gives version 1, and a changed PUT not used replaces 1 and leaves 2 | P1 | A2, S3 |
| FRM-162 | Given versions 1, 2 and 5 with active 2 and used, when a changed PUT, then the new number is 6 | P2 | S4 |
| FRM-163 | Given a replaced version, then its `UpdatedAt` moves and `CreatedAt` stays; a new version has both at the clock; `Forms.CreatedAt` stays | P2 | S3, S4 |
| FRM-164 | Given usage true for form A only, when each gets a changed PUT, then A makes a version 2 and B is replaced in place | P0 | § 3 |
| FRM-165 | Given `IFormUsage` throwing on a changed PUT, then 500 `unexpected`, and the name, `UpdatedAt` and version stay (one transaction) | P1 | § 3 |
| FRM-166 | `IFormUsage` resolves scoped to `NoFormUsage` | P2 | S7 |
| FRM-167 | Given `IsDeleted` true with `DeletedAt` null (SQL), then excluded; `IsDeleted` false with `DeletedAt` set, then listed (`IsDeleted` decides) | P2 | § 4 |
| `unit` FRM-168 | `Form.Delete(now)` sets both `IsDeleted` and `DeletedAt` | P1 | § 4 |
| FRM-169 | Given a form with `schemaVersion` 99 or `{}`, when DELETE, then 204 | P2 | business.md |

## 7. Work split

The feature session keeps the compiled contract and this file. Each track has its own branch and worktree from the contract commit, and no track touches another's files.

| Track | Branch | Owns |
|---|---|---|
| Code | `dynamic-forms-backend/code` | Configurations, migration `AddForms`, handlers, validators' bodies, `FormQueries`, `IFormUsage` registration, `test.ps1` area and any `ci.yml`/`ci.ps1` wiring, `docs/features/dynamic-forms/tech.md`, both overviews, `docs/testing/README.md`, `docs/features/platform-admin/tech.md` (its "M2.1's default form" seeder example no longer holds), `tests/tools/traceability/traceability.ps1`'s help text |
| Tests A | `dynamic-forms-backend/tests-api` | Catalog rows for every `FRM-` case and the summary counts; under `tests/ClinicHub.IntegrationTests/Forms/`: `FormListTests`, `FormReadTests`, `FormCreateTests`, `FormShellTests`, `FormDeleteTests`, `FormAccessTests`; the validators' and `Form.Delete`'s unit tests in `tests/ClinicHub.UnitTests/Forms/`. FRM-001 to 052, 060, 061, 090 to 102, 130 to 153, 155, 158, 168 to 171 |
| Tests B | `dynamic-forms-backend/tests-save` | Under `tests/ClinicHub.IntegrationTests/Forms/`: `FormSaveTests`, `FormVersioningTests`, `FormDatabaseTests`, `FormUsageRegistrationTests`, `FormMigrationTests`; the exclusions in `AttachmentMigrationTests` and `TemplateMigrationTests`. FRM-070 to 083, 110 to 119, 154, 156, 157, 159 to 167 |

Test writers read this file, the design and the business doc, never the handlers. Neither test track touches the other's files.

## 8. Test seams

The feature session owns these and they are committed before T1. A test track that needs a change asks the session.

- `Data.Form()` (`Named`, `WithDefinition`, `Deleted`), `Harness/Builders/FormBuilder.cs`. It goes through MediatR, so depth, size and exact-spelling cases must POST over HTTP (`FormsApi.PostRawAsync`).
- `Forms/FormsApi.cs`: routes, raw bodies, row readers.
- `Forms/FormsCollections.cs`: `FormsCollection` (a plain `AppFixture`) for everything but the "used" path, including FRM-082 and FRM-166, which must see the real registration; `FormsSavingCollection` (`FormsAppFixture`) for the save and versioning classes.
- `Forms/FormsAppFixture.cs`: `IFormUsage` replaced by a `FormUsageSwitch` singleton (`MarkUsed(id)`, `MarkNotUsed(id)`, `ThrowOnCheck`). A class on it derives `FormSavingTest`, which resets the switch before each test. No `CreateVariant`: it would boot a second app and mix two clocks.
- Rows are read with `App.QueryDbAsync(db => db.Forms...)` and `db.FormVersions`; a raw state (a version set active by SQL, a duplicate row) goes through `App.OutsideTheApp`.
- A class reset (Respawn) meets the `Forms`↔`FormVersions` foreign key cycle: CI's `drags` user is a superuser, so its `DISABLE TRIGGER ALL` works. T2 proves it.
