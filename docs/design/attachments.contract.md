# Attachments part 1: compiled contract and work split

Written at the end of T0, before T1. The approved rules stay in [the design](attachments.md), [the business file](../features/attachments/business.md) and [the test cases](attachments.test-cases.md); this file only adds what they leave to implementation. Part 1 = design §§ 3-8, cases ATT-001 to ATT-186.

## 1. What the contract commit holds

Compiled code, real unless marked **stub** (bodies throw `NotImplementedException`, or do nothing for `AttachmentSettingsValidation.Validate`):

| File | Holds |
|---|---|
| `ClinicHub.Domain/Attachments/Attachment.cs`, `Domain/Common/FieldLimits.cs` | Entity and column limits |
| `Infrastructure/Database/Configurations/Attachments/AttachmentConfiguration.cs`, migration `AddAttachments`, `IAppDbContext.Attachments` | The table |
| `Application/Features/Attachments/AttachmentErrors.cs` | The three codes and `NotFound` |
| `Application/Features/Attachments/Files/` | `IAttachmentService`, `IAttachmentFileProvider`, `AttachmentRecords.cs`, `AttachmentModules`, **stubs** `AttachmentService` (its constructor is fixed), `AttachmentFileName`, `AttachmentSettingsValidation` (T4: the extension method `Validate(this AttachmentSettings settings, bool isDevelopment, string contentRoot, string webRoot)`, moved out of `Common`, which never references `Features`; same behavior and call syntax) |
| `Application/Features/Attachments/FileTypes/` | `AttachmentType`, **stubs** `AttachmentTypes`, `AttachmentContentCheck` |
| `Application/Common/Settings/` | `AttachmentSettings` (**stub** `RulesFor`, `DefaultedRoot`), **stub** `AttachmentRootRule` |
| `Infrastructure/Attachments/PhysicalAttachmentFileProvider.cs` | **Stub**; its constructor takes `AttachmentSettings` |
| `Api/Features/Attachments/` | `[AttachmentUpload]`, **stub** `AttachmentUploadFilter`, `ToAttachmentUpload()` |
| `Api/Errors/ResultHttpExtensions.cs` | **Stub** `ToFile()` |
| `Api/Shared/AppSettings.cs`, `Program.cs`, both `DependencyInjection.cs`, `appsettings.json` | Wiring and config |
| `ClinicHub.Web/src/i18n/locales/en.ts`, `ar.ts` | `errors.attachmentTypeNotAllowed`, `errors.attachmentTooLarge`, `errors.attachmentEmpty` |

## 2. Details the design leaves open

- **Codes for ATT-094:** a non-multipart body, a multipart body with no boundary or closing boundary, a header past the multipart limit, and two file parts all answer 400 `invalidRequest`. A wrong field name binds no file, so it answers `attachmentEmpty`. Only one file part is ever read: § 12 sends one request per file.
- **Server failures aren't `invalidRequest` (ATT-185):** while reading the form, any other `BadHttpRequestException` from the server stays 400 `invalidRequest`, as does the framework's plain `IOException` for a missing closing boundary ("Unexpected end of Stream…"). Any other `IOException`, such as a full disk while buffering, goes on to the unexpected handler: logged, 500 `unexpected`.
- **Only the filter's own limit is `attachmentTooLarge` (ATT-186):** the framework's "Multipart body length limit N exceeded" counts only when N is the limit the filter installed. A wrong boundary with a preamble over 16 KB throws the same words with the reader's 16384, and answers `invalidRequest`.
- **415 becomes 400:** `[ApiController]` adds `[Consumes("multipart/form-data")]` to an `IFormFile` parameter, which answers 415 before the filter runs. `AddApi` sets `SuppressConsumesConstraintForFormFileParameters = true`, and the filter answers instead. No other action takes a file.
- **Extensions** are lower case with their dot (`.png`) everywhere: `AttachmentRulesDto`, `AttachmentType`, `AttachmentFileName.ExtensionOf`.
- **ZIP entry names** are compared case-insensitively, for the required entries as well as `vbaProject.bin`, which matches in any folder.
- **Keys** are `clinics/<clinicId>/<id>` or `platform/<id>`, with the GUID in the `D` format (lower case).
- **`RootPath` rule order:** `Attachments.Validate` (the extension method) runs last in `AppSettings.Validate`, so existing startup cases fail for their own reason.
- **English texts** (ATT-181; the business file holds only the Arabic): "This file type isn't allowed.", "This file is larger than allowed.", "This file is empty."
- **`GetRules`** answers for any valid module string, like the service; a blank or over-50 module throws.

## 3. Work split

Three tracks, each on its own worktree and branch, at most one scratch database `drags_attachments_<track>`.

| Track | Owns | Never edits |
|---|---|---|
| **code** | Every stub above; `ValidationExtensions` helpers for the name rule; `AddApi`'s flag; `ClinicHub.Web/e2e/global-setup.ts`'s `Attachments__Physical__RootPath`; docs of design § 10 except the testing ones | Anything under `tests/` |
| **unit-tests** | `tests/ClinicHub.UnitTests/Attachments/`, `ErrorCodeTextsTests.DocumentedClasses`, `locales.test.ts` | Production code, the catalog |
| **api-tests** | `tests/ClinicHub.IntegrationTests/Attachments/` (test controllers, commands, fixture, Kestrel host, tests), `ClinicHubFactory`'s default `RootPath`, area ATT in `test.ps1` and the traceability script, `docs/testing/README.md`, the catalog's ATT rows and summary, the dress rehearsal row for ATT-098 | Production code |

**Case assignment:** `unit-tests` proves every case's `unit` level, `api-tests` every case's `api` level; a `unit+api` case is tagged by both. ATT-181 is a Vitest row in `locales.test.ts`. ATT-098 is `manual`: a catalog row and a dress rehearsal line, no test.
