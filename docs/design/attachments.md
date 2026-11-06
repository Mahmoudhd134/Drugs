# Attachments: design

Status: **approved** (user, T0, 2026-11-06). Part 1 (the backend) and part 2 (§ 12, the components) are built ([tech](../features/attachments/tech.md)); no feature mounts the components yet.
Companion files: [business (Arabic)](../features/attachments/business.md) and [test cases](attachments.test-cases.md). When all is built, this
moves into `docs/features/attachments/`, the overviews and the [test catalog](../testing/test-catalog.md).

Builds on: [tech overview](../tech/overview.md), [backend architecture](architecture.md),
[clinic scoping](../features/clinic-scoping/tech.md), [access](../features/access/tech.md),
[shared catalog](../features/shared-catalog/tech.md) (the clinic-or-shared rows this reuses).

---

## 1. Goal

A generic module that stores files for any feature: one clinic can never read, list, replace or delete another clinic's
files, and platform files (no clinic) are possible too. It ships the backend and **reusable frontend components**, but **no
real route and no screen that mounts them**: the first feature to use it brings those. The first planned use is the clinic's
paper image in print templates step 4.

**Done when (backend):** through a test-only controller on the real pipeline, a file is uploaded, listed, downloaded, replaced
and deleted in clinic A; clinic B gets 404 for each of them with the right ID; the allowed types and the size limit come from
config per module; a file whose content doesn't match its extension is refused; and after a delete or a replace the old file is
still on disk.

**Done when (components):** given an adapter, a user can select files, see them, remove some, add more and upload them with
progress; see the list, download one, preview an image, a PDF or a text file, and delete one; a feature can replace any part of
the look without forking the component; all of it in Arabic, English and at phone width.

## 2. Decisions (user, 2026-11-05)

| # | Decision |
|---|---|
| A1 | **Generic**: any attachment for any feature, not only the paper image |
| A2 | **No real route and no screen**: features add those. Reusable components ship with this module (A12) |
| A3 | **Files live on the server's disk** for now, metadata in a table. Assumes one server |
| A15 | **Out of scope by the user's decision:** encryption at rest, backups and restore, per-clinic quotas, virus scanning, upload rate limits. None is built or planned by this feature |
| A4 | **`IAttachmentService` wraps `IAttachmentFileProvider`**. The physical provider is the only one now; S3 or another bucket can be added later beside it |
| A5 | **Each feature exposes its own routes** with its own permission. There is no generic `/attachments/{id}` route |
| A6 | **Accepted types and max size per file come from config**, global with per-module overrides that can only narrow them |
| A7 | **A wide type list**: most images and documents, old Office formats included (§ 5) |
| A8 | **No file is ever hard deleted for now.** Delete and replace only mark the row; the file stays on disk. No purge job, so disk use only grows |
| A9 | **Platform-owned files are supported** (no clinic), for later features such as a super admin's profile picture or announcement files. Those features aren't built here |
| A10 | **Files are streamed through the API**, never by a public or signed URL. A signed URL stays possible for a later cloud provider (§ 7) |
| A11 | **Print templates step 4 uses this module** instead of its own table, so this feature merges before step 4. The user or the design session amends D3 there; this feature doesn't edit it |
| A12 | **Frontend components**: select and upload, preview, add or remove before upload, list, download one or many, delete (§ 12) |
| A13 | **The UI can be customized** by each feature, through render props and a headless hook (§ 12) |
| A14 | **The table keeps the user's file name** (`OriginalFileName`), and the file on disk is named by its GUID, never by that name |

## 3. Interfaces

In `ClinicHub.Application/Features/Attachments/Files/` (provider implementation in Infrastructure). Features call the
service from their own commands and queries, so a feature's record check and the attachment row share one transaction.

```csharp
public interface IAttachmentService
{
    Task<Result<AttachmentDto>> AddAsync(AttachmentOwner owner, AttachmentUpload file, CancellationToken ct = default);
    Task<Result<AttachmentDto>> ReplaceAsync(AttachmentOwner owner, Guid id, AttachmentUpload file, CancellationToken ct = default);
    Task<Result> DeleteAsync(AttachmentOwner owner, Guid id, CancellationToken ct = default);   // marks the row only
    Task DeleteAllAsync(AttachmentOwner owner, CancellationToken ct = default);                  // the owner's record is being deleted
    Task<IReadOnlyList<AttachmentDto>> ListAsync(AttachmentOwner owner, CancellationToken ct = default);
    Task<Result<AttachmentContent>> OpenAsync(AttachmentOwner owner, Guid id, CancellationToken ct = default);
    AttachmentRulesDto GetRules(string module);   // what the module's config allows, for a screen (§ 12)
}

public sealed record AttachmentOwner(string Module, string RefId);
public sealed record AttachmentUpload(string OriginalFileName, Func<Stream> OpenRead);   // re-openable, seekable; its Length is the size
public sealed record AttachmentContent(Stream Content, string OriginalFileName, string ContentType);
public sealed record AttachmentDto(Guid Id, string OriginalFileName, string TypeKey, string ContentType, long SizeBytes, DateTime CreatedAt);
public sealed record AttachmentRulesDto(long MaxFileSizeBytes, IReadOnlyList<string> Extensions);

/// Only moves bytes: knows nothing about clinics, modules, types or permissions.
public interface IAttachmentFileProvider
{
    Task SaveAsync(string key, Stream content, CancellationToken ct = default);          // all or nothing
    Task<Stream> OpenReadAsync(string key, CancellationToken ct = default);              // null when missing
    Task DeleteAsync(string key, CancellationToken ct = default);                        // failed uploads only (§ 6)
}
```

| Job | Service | Provider |
|---|---|---|
| Size, type, name and config rules | ✓ | |
| The row, the clinic filter, marking deleted | ✓ | |
| Building the key (`clinics/12/<guid>`, `platform/<guid>`) | ✓ | |
| Writing and opening bytes | | ✓ |

`PhysicalAttachmentFileProvider` (`ClinicHub.Infrastructure/Attachments`): creates the file at its key without overwriting, so an
existing key throws, keeping the first file; a failed or cancelled write removes what it wrote. There are no temp files of our own: a
half-written file can't be reached anyway, because every read starts from a row, and the row is saved only after the write. Before any `Path` call it refuses a key by a whitelist that behaves the same on every OS (lower-case letters, digits, `-`
and `/`, no `..`, no empty segment), because CI runs on Linux, where `..\` and `C:` are ordinary characters. The `Attachment` prefix avoids a clash with
Microsoft's `IFileProvider` and `PhysicalFileProvider`. A later provider must pass the same contract tests (ATT cases at
level `unit`, § 10).

**Why this shape** (alternatives discussed with the user): writing to disk inside the service would make S3 a rewrite;
Microsoft's `IFileProvider` is read only; a storage library is a dependency for three methods (it can still sit behind this
interface later); validation as a provider wrapper doesn't fit, since it needs config and the database.

## 4. Data

**`Attachments`** (`ClinicHub.Domain/Attachments/Attachment.cs`; `IClinicOrShared`, `IHasTimestamps`), migration
`AddAttachments`, a new empty table, so no data step; tested up → down → up.

| Column | Type | Rules |
|---|---|---|
| Id | uuid PK | Generated by the service. Not sequential: guessing fails, and it doesn't reveal how much other clinics upload |
| ClinicId | int null | FK restrict; null = a platform file |
| Module | varchar(50) | From `AttachmentModules`, required |
| RefId | varchar(64) | The owning record's key as text, so any key type fits, required |
| OriginalFileName | varchar(256) | The user's file name (its last path segment, trimmed). For display and download only, never used in a path |
| TypeKey | varchar(20) | The checked type (`png`, `xlsx`…) |
| SizeBytes | bigint | |
| StorageKey | varchar(200) | Unique: `clinics/<clinicId>/<Id>` or `platform/<Id>`, so the file on disk is named by the row's GUID, with no extension. Stored, so reads never build a path from the request and a move to S3 keeps the keys |
| CreatedByUserId | int | FK `Users` restrict. A user ID, because a super admin has no staff row |
| DeletedAt | timestamptz null | Set = deleted: every read answers as if it didn't exist |
| DeletedByUserId | int null | FK `Users` restrict |
| CreatedAt, UpdatedAt | timestamptz | |

Index `(ClinicId, Module, RefId)`. There's no database link to the owning record, because it can be in any table (§ 6).

**`IClinicOrShared` needs no code change.** `AppDbContext` already configures any such type generically (FK, filter), and
`ClinicAndTimestampsInterceptor.GuardClinicOrShared` already gives the rules needed; its `Drug` checks apply only to `Drug`:

| Row | Clinic in context | No clinic |
|---|---|---|
| Added, no `ClinicId` | Stamped with the clinic | Stays a platform file only inside `IClinicScope.UseSharedCatalog()`, else throws |
| Own row changed | Same clinic only | Throws |
| Platform row changed | Throws | Only inside `UseSharedCatalog()` |
| `ClinicId` changed | Throws | Throws |

- **The clinic filter** gives a clinic its own rows plus the platform's, and a platform request only the platform's. Because
  a clinic sees platform rows, **every read also matches module and ref ID**: an ID alone never reaches a file, and the
  feature's route decides who gets in.
- **A clinic can't change a platform row**: `ReplaceAsync` and `DeleteAsync` answer 404 for one, and `DeleteAllAsync` in a clinic
  marks only that clinic's rows (a check in the service, so it never reaches the interceptor's throw, which would roll back the
  feature's whole command).
- **A forgotten clinic must not write a platform file**: with no clinic and outside `UseSharedCatalog()`, every write method throws
  before touching anything. The feature's handler opens the block itself; the service never does.
- **Deleted rows:** EF 9 allows one query filter per entity and the clinic filter holds it, so the service excludes them
  with a `NotDeleted()` check in one place, as `Clinics` does. All access goes through the service.
- `UseSharedCatalog()` keeps its name: renaming touches shipped handlers, tests and docs for no behavior. Its docs and
  `IClinicOrShared`'s ("only `Drug`") are updated.

**`AttachmentModules`** (`Features/Attachments/Files/`): constants, like `Permissions`. A `Modules` key in config that isn't one
stops the app at startup (compared exactly, with the same comparer as the lookup, so a wrong-case key fails loudly). It ships with
`ClinicPaper = "clinicPaper"` only. At run time the service takes any module string of 1–50 characters and uses the global limits
when it has no entry; a blank or longer one, or a blank or over-64 ref ID, throws as a programmer error.

## 5. Validation

**Order** (first failure answers; nothing is written for a refused upload): empty → size → file name → extension known and
allowed for the module → the content matches that extension's type.

**The extension picks the type, then the content must prove it.** The declared content type is ignored. A PNG named `.jpg`
fails the JPEG check. This avoids guessing from the content, where a text file starting with `BM` would look like a BMP.

| Key | Extensions | Check | Content type |
|---|---|---|---|
| `png` | .png | Signature `89 50 4E 47 0D 0A 1A 0A` | image/png |
| `jpeg` | .jpg, .jpeg | `FF D8 FF` | image/jpeg |
| `webp` | .webp | `RIFF` + `WEBP` at byte 8 | image/webp |
| `gif` | .gif | `GIF87a` or `GIF89a` | image/gif |
| `bmp` | .bmp | `BM` | image/bmp |
| `avif` | .avif | `ftyp` at byte 4, brand `avif` or `avis` | image/avif |
| `tiff` | .tif, .tiff | `II*\0` or `MM\0*` | image/tiff |
| `heic` | .heic, .heif | `ftyp` at byte 4, a HEIF brand (`heic`, `heix`, `hevc`, `mif1`, `msf1`) | image/heic |
| `pdf` | .pdf | `%PDF-` | application/pdf |
| `docx` | .docx | ZIP holding `[Content_Types].xml` and `word/document.xml`, no `vbaProject.bin` | Office type |
| `xlsx` | .xlsx | ZIP holding `[Content_Types].xml` and `xl/workbook.xml`, no `vbaProject.bin` | Office type |
| `pptx` | .pptx | ZIP holding `[Content_Types].xml` and `ppt/presentation.xml`, no `vbaProject.bin` | Office type |
| `doc`, `xls`, `ppt` | .doc, .xls, .ppt | The Office compound signature `D0 CF 11 E0 A1 B1 1A E1` | Office type |
| `txt`, `csv` | .txt, .csv | No NUL or C0 control character except tab, CR, LF and form feed; or a UTF-16 byte-order mark | text/plain, text/csv |

- **ZIP check:** the file must start with `PK\x03\x04`, because the ZIP reader works from the end and would otherwise accept an
  executable with a ZIP appended. Then only the list of entries is read (`System.IO.Compression`, no new package), nothing is
  extracted, so a zip bomb costs nothing. A corrupt ZIP is refused.
- **Text check:** not "valid UTF-8", because Excel on an Arabic Windows PC often saves CSV as Windows-1256 or UTF-16.
- **Always refused:** any other extension (SVG, HTML, executables, archives, `.docm`, `.xlsm`).

**Known limits, accepted:** the check proves the type, not that a file is safe (A15). Old `.doc`, `.xls`, `.ppt` share one signature, so the extension picks
which, macros can't be detected, and other files with that signature (a renamed `.msi`) pass; they're stored and downloaded as an
Office file. A text file holding HTML or SVG is stored as text, which is harmless since it downloads as text. CSV cells can hold
formulas that run in Excel; the file is kept as uploaded. An encrypted Office file is a compound file, so it passes as `.doc`
and fails as `.docx`.

**File name:** the last path segment of what the client sent (both `/` and `\`), trimmed; the same characters refused as
`ValidName`, up to 256. Errors reuse `nameInvalid` and `nameTooLong`. No name, no extension, or only an extension (`.png`) answers
`attachmentTypeNotAllowed`. Only the last extension counts (`a.exe.png` is judged as PNG). The original name is stored and shown, but
**never logged**, because it can hold a patient's name: logs use the attachment's ID.

**Config** (`AttachmentSettings`, section `Attachments`; `Application/Common/Settings`, bound and validated by `AppSettings`):

```json
"Attachments": {
  "MaxFileSizeMb": 20,
  "AllowedTypes": "png,jpeg,webp,gif,bmp,avif,tiff,heic,pdf,docx,xlsx,pptx,doc,xls,ppt,txt,csv",
  "Physical": { "RootPath": "" },
  "Modules": {
    "clinicPaper": { "MaxFileSizeMb": 10, "AllowedTypes": "png,jpeg" }
  }
}
```

- **A comma-separated string, not a JSON array:** .NET merges config arrays by index, so a shorter list in a later source would
  silently keep the extra types from the base file. One string is replaced whole, also by an environment variable.
- **A module with no entry** uses the global values; an entry may set either or both. A module's value can only narrow: a bigger
  size or a type outside the global list stops the app. An empty string accepts nothing.
- **Config chooses among types the code knows.** A brand-new type needs a small code change, because content can't be checked
  without a checker.
- **1 MB = 1,048,576 bytes.**
- **The app stops at startup** on: an unknown type key, a module key not in `AttachmentModules`, a size below 1, a relative
  `RootPath` or one equal to or inside the content root or web root (compared with full paths, case-insensitively on Windows, so
  `C:\inetpub\ClinicHubFiles` isn't "inside" `C:\inetpub\ClinicHub`), or a root it can't create and write to.
- **`AppSettings.Validate` gains inputs:** the content root and the web root, which **can be null** (the CI backend job builds no
  SPA, so there's no `wwwroot`); a null web root is skipped. The path rule is a pure function taking the separator and case rule, so
  it's tested for Windows on Linux CI.
- **`RootPath` empty:** in Development it means `Environment.GetFolderPath(LocalApplicationData)` + `ClinicHub/attachments`; anywhere
  else it stops the app. `ClinicHubFactory` sets a default per factory, because cases such as AUTH-005 test startup failures and must
  still fail for their own reason; e2e sets one too.
- `clinicPaper`'s 10 MB is [print templates step 4's P2](prescription-templates.step4.md#2-decisions-user-2026-11-06), up from D3's 2 MB, which
  was set for the database. On disk that reason is gone, and a phone photo is often 3–8 MB.

**Oversized requests:** `[AttachmentUpload(module)]`, a shared resource filter in the Api, runs before model binding (as
`[AdminClinic]` does). Left alone, a read past the limit becomes a model error and answers `invalidRequest`, so the filter owns the form
read:
1. Sets the server's body limit to the module's limit plus 64 KB for the multipart framing, where the server has that feature (TestServer doesn't).
2. Refuses a larger `Content-Length` with 400 `attachmentTooLarge`, without reading the body.
3. Installs its own form limit (the default caps at 128 MB) and reads the form itself, turning the over-limit errors of a body with no
   `Content-Length` into `attachmentTooLarge`.

The service still checks the file's real size. A missing file part reaches it as an empty upload (`file.ToAttachmentUpload()` handles
null) and answers `attachmentEmpty`. **IIS answers first:** a body over its own 30,000,000-byte limit gets IIS's HTML 404.13, whatever the
module's limit, and any limit above about 28 MB needs `web.config`. `DEPLOY.md` says so; the client's own check (§ 12) covers the common case.

**New codes** (`AttachmentErrors`, both locale files): `attachmentTypeNotAllowed`, `attachmentTooLarge`, `attachmentEmpty` (all
400, `ErrorType.Validation`). A missing, deleted or other clinic's file answers the usual `notFound`.
`ErrorCodeTextsTests.DocumentedClasses` and the overview's error classes gain `AttachmentErrors`.

## 6. Flows

**Add:** rules (§ 5) → write the file → add the row and save, with the cleanup queued in a `finally` around the save. The size stored is
the stream's real length. An exception from the save goes on to the feature's command, which rolls back; handlers don't catch it.

**Cleanup** (`IPostCommitActions`, which runs when the outermost transaction ends, committed or rolled back, and at once outside a
transaction): if no row has this ID, remove the file. It's what keeps a failed save, a rolled-back command, a failed savepoint or a cancelled
request from leaving a stray file. It takes no request token, so it still runs after a cancel.
**This is the only time a file is ever removed**, and that file never became an attachment, so A8 holds. It's the only caller of
`IAttachmentFileProvider.DeleteAsync`.
- It looks the row up by ID with `IgnoreQueryFilters()`, read only, a documented exception: with no clinic in context the filter would
  show no rows and it would delete a committed file (e.g. after a `Use(clinicId)` block ended). A source test names this call as the only
  one in the module.
- Deciding by lookup, not by the save's result, matters: a commit can reach the server and then lose the connection, so a failed save
  doesn't prove there's no row.
- If the lookup fails (database down), it throws, is logged, and the file stays: the safe side.
- EF retries aren't enabled today (`UseNpgsql` has no `EnableRetryOnFailure`), but the flow stays right if they are: each attempt
  has its own ID, and `OpenRead` gives a fresh stream.

**Replace:** find the old row (404 if not found, deleted, or another owner's) → rules on the new file → write it → add the new row
and mark the old one in one save, with the same cleanup. A refused new file leaves the old one untouched. No version history; the old
file stays on disk unreachable.

**Delete:** set `DeletedAt` and `DeletedByUserId`. The file stays. A second delete is 404.

**Owner's record deleted:** there's no database cascade, so the feature calls `DeleteAllAsync` in its own transaction (each
feature's tests cover it). It loads and marks rows, with no `ExecuteUpdate`, so the save interceptor runs. A soft-deleted clinic keeps everything, like the rest of its data. Attachments aren't copied from the
template clinic to a new one.

**Open:** row by ID, module and ref ID, not deleted (else 404) → `OpenReadAsync` → a missing file logs an error and answers 404.

**List:** the owner's rows, not deleted, newest first (`CreatedAt`, then `Id`).

**Stray files:** a crash during the write or before the save, or a failed cleanup, leaves a file (perhaps partial) with no row. Nothing can reach it,
because every read starts from a row. Accepted and documented, with no cleanup job.

**Races, accepted** (near-impossible while only the super admin uploads, as elsewhere in the app): two replaces of one file at the same
moment leave two live rows, and a replace racing a delete can leave the new file live. There's no concurrency token. No file is ever lost.
Revisit before clinic staff upload.

## 7. Serving

`Result<AttachmentContent>.ToFile()` in `ResultHttpExtensions`, for features' download routes: the file is streamed, not loaded,
with the checked `Content-Type`, always `Content-Disposition: attachment` (the framework writes the `filename*` form, so Arabic
names work), `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`. These headers are new to the API, on these
responses only. Failures are the usual ProblemDetails. There's no static file route to the folder and no URL with the key.

**Cost of streaming** (estimates): about 64–100 KB of memory per download; the real limit is the server's upload line. **Later, with
a cloud provider:** add `GetDownloadUrlAsync(key, expiresIn)`, null when unsupported, and choose per module. A signed URL is checked
once when issued: anyone holding it can download until it expires, and it can't be revoked. It can't be a plain redirect (the browser
drops the login header across sites, and S3 refuses both), so the API returns it as JSON.

**A feature's route, for example** (step 4 decides its own):

```csharp
[Route("api/v1/admin/clinics/{clinicId:int}/paper-image")]
[Authorize(Policy = AuthPolicies.PlatformAdmin), AdminClinic]   // [AdminClinic] is class-level
public class ClinicPaperController(ISender sender) : BaseApiController
{
    [HttpPut, AttachmentUpload(AttachmentModules.ClinicPaper)]
    public async Task<ActionResult> Upload(IFormFile file, CancellationToken ct) =>
        (await sender.Send(new UploadPaperImageCommand(file.ToAttachmentUpload()), ct)).ToOk();
}
```

**The super admin:** on `/admin/clinics/{clinicId}/…`, `[AdminClinic]` enters the route's clinic and everything works as above. In the
template clinic's own context the template owns the file. On a plain platform route, only platform files, inside `UseSharedCatalog()`.

## 8. Testing without real routes

**Test-only controllers**, one per context (clinic with `[HasPermission]`, `[AdminClinic]`, platform), added only in the integration test
host through `AddApplicationPart`, with their test commands registered there, since MediatR scans only the Application assembly. They use
the real pipeline: authorization, filter, model binding, service, provider, database, disk. A test proves the real host has no endpoint
with `[AttachmentUpload]`.

**Limits of the test host:**
- **TestServer enforces no body limit**, so a case proving the over-limit path needs a small real Kestrel host, new to this repo.
- **CI runs on Linux, production on Windows:** the Windows path rules are proved as pure functions, and the real IIS behavior is a `manual`
  case for the dress rehearsal.
- **Respawn doesn't reset the disk:** "nothing written" compares a clinic's own folder before and after.

The host sets its own `Attachments:Physical:RootPath` per factory, in a temp folder removed afterwards. New area **ATT**, trait `attachments`,
added to the traceability script, the runner's area mapping and the testing README. `ErrorCodeTextsTests.DocumentedClasses` and
`locales.test.ts`'s list gain the new class and codes; ERR-030's text doesn't change.

**Mutation:** `AttachmentService`, the type checks, `AttachmentSettings` validation, the provider and the upload filter, by `-Mutate`.
`ClinicAndTimestampsInterceptor` doesn't change, but its existing mutation run must stay at 85%.

**The components** are tested at level `ui` (Vitest + MSW, a fake adapter), plus a real browser harness (§ 12).

**The workflow's T5 and T6 can't apply as written, since no real screen exists (needs the user's OK):**

| Workflow step | Part 1, backend | Part 2, components |
|---|---|---|
| Levels | `unit`, `api` | `unit`, `ui`, `e2e` on the harness page |
| T5 acceptance agent | An **adversarial API agent**: from this doc and the business file only, it tries to reach another clinic's file through the test controller | On the harness page, in Arabic, English and at phone width |
| T6 walkthrough, gallery | The ready report only: numbers, and the isolation and "file still on disk" results | The user opens the harness page; screenshots from it |
| `full`, `release`, coverage, Stryker | Unchanged | Unchanged (StrykerJS on the new pure logic, `functions.ts`, as the [testing guide](../testing/README.md#mutation-testing) says) |

## 9. The split

Backend and components together are over the workflow's 150 cases, so **two features**, each mergeable alone, both before step 4:

| Part | Contains | Migration | Tracks |
|---|---|---|---|
| **1. Backend** | §§ 3–8: table, service, provider, config, filter, `ToFile()`, test controller | `AddAttachments` | Backend coder; unit test writer; integration test writer |
| **2. Components** | § 12: adapter type, hook, components, blob error handling, harness page | None | Frontend coder; component test writer; e2e test writer |

Part 2 starts after part 1 merges, since it has no backend of its own to wait on beyond the shapes. Before each part's T1, its sub session
commits the **compiled contract**, per the workflow. **Implementation runs in sub sessions after the user's approval.**

## 10. Docs and existing behavior touched

- New: `docs/features/attachments/` (`tech.md`, `business.md`).
- [tech overview](../tech/overview.md): layout, data model, conventions (attachments, error classes, the new `IgnoreQueryFilters` exception), config.
- [business overview](../business/overview.md): one line, an internal capability.
- [clinic scoping](../features/clinic-scoping/tech.md): `IClinicOrShared` is no longer `Drug` only; who calls `UseSharedCatalog()`.
- `DEPLOY.md`: the folder (`Attachments__Physical__RootPath`, outside the site, the app pool's Modify permission), the IIS limit above 28 MB; its "data lives in PostgreSQL, not the folder" line changes.
- [testing README](../testing/README.md), [test catalog](../testing/test-catalog.md): area ATT.
- **Not edited here:** `docs/design/prescription-templates.md` D3, § 5 and § 7 (A11).

## 11. Risks and open points

| Point | Handling |
|---|---|
| One server only | Disk breaks with several servers or a host whose disk doesn't persist. Hosting is open in the HLD; the provider interface is the way out |
| Disk filling up | Disk only grows (A8, A15); a full disk answers 500 `unexpected` and writes no row |
| Deferred by the user | IIS's time limits for a large file on a slow connection (unchecked); a record of who viewed a file; really erasing a patient's file. Not in this feature |
| A hostile ZIP with very many entries | Its entry list is read into memory, bounded by the size limit. Accepted while uploads are super admin only |
| `attachmentTooLarge` doesn't say the limit | Add a field when a screen needs it |
| Clinic staff's profile pictures | One user, several clinics: that feature decides, since a clinic token can't write a platform row |

## 12. Frontend components

In `ClinicHub.Web/src/features/attachments/`. They hold no URLs and no permission keys: each feature passes an **adapter** over its own
routes (A5, M1.5 D9), as the role, staff and print template components already do. Nothing mounts them yet.

```ts
export type AttachmentsAdapter = DataScope & {
    rules: () => Promise<AttachmentRules>;              // { maxFileSizeBytes, extensions[] }, from the module's config
    list: () => Promise<Attachment[]>;
    upload: (file: File, options: UploadOptions) => Promise<Attachment>;   // { onProgress, signal }
    replace?: (id: string, file: File, options: UploadOptions) => Promise<Attachment>;
    delete?: (id: string) => Promise<void>;
    download: (id: string, signal?: AbortSignal) => Promise<Blob>;
};
```

| Piece | Does |
|---|---|
| `useAttachments({adapter, multiple, maxFiles})` | **The headless hook**: the list, selected files, progress, errors and every action. No markup |
| `AttachmentPicker` | Select with a button or by dropping files; shows the selected files with a local preview; add more, remove one; Upload, with per-file progress |
| `AttachmentList` | The stored files: name, type, size, date; download one, Download all, preview, replace, delete (with `useConfirm`, as a destructive action) |
| `attachmentRequests(base)` | Builds an adapter's upload, list and download calls for a feature's routes, so no feature repeats the multipart and blob details |
| `AttachmentPreview` | A dialog for one file, stored or selected (below) |
| `AttachmentManager` | Picker and list together, the common case |
| `downloadBlob`, `previewKind`, `formatFileSize` | Pure helpers |

**Customizing (A13), three levels:**

```tsx
<AttachmentManager adapter={adapter} canUpload canDelete />                         // 1. as is

<AttachmentManager adapter={adapter} canUpload                                      // 2. replace a part
    renderTrigger={({open, dropProps, isDragActive, disabled}) => <MyDropArea {...dropProps} onClick={open} />}
    renderItem={(file, actions) => <MyRow file={file} onDownload={actions.download} />}
    renderEmpty={() => <MyEmpty />} />

const files = useAttachments({adapter});                                            // 3. build it all yourself
```

Slots: `renderTrigger`, `renderItem`, `renderSelectedItem`, `renderEmpty`, `renderPreview`, in the shape `SearchableList` and `SortableList`
already use. `renderPreview` replaces the dialog's content only, so the focus trap and the dialog's name stay; `actions.delete` includes the
confirmation. **Custom UI means React elements, never an HTML string:** there's no `dangerouslySetInnerHTML`. A file name is user data, so a
raw HTML string built with one could run a script with the staff member's login.

**Preview:**

| Type | Preview | Note |
|---|---|---|
| PNG, JPEG, WebP, GIF, BMP, AVIF | `<img>` from a blob | Safe: SVG is refused by the server, so no image here can run a script |
| PDF | The browser's viewer, in an `<iframe>` with a `title`, only when `navigator.pdfViewerEnabled`; else name, size, Download | No new package, no `sandbox` (it blocks Chrome's viewer). Download always shows. The API's response stays `attachment` |
| TXT, CSV | Text in a `<pre dir="auto">`, set as text, first 1 MB | A byte-order mark decides first, then UTF-8, else Windows-1256; decoded so a cut inside an Arabic character doesn't count as invalid |
| TIFF, HEIC, Office | No preview: name, size, Download | Browsers can't show them, and a viewer would be a heavy package or a third-party service |

- **A preview's kind comes from the file's `typeKey` or extension, never from the response or `File` type**, and a PDF's blob is always re-wrapped
  as a hard-coded `application/pdf`. An empty-typed blob would be sniffed, and HTML in that same-origin frame could call the API with the user's
  login. An image that fails to decode shows name, size and Download.
- A file is fetched only when its preview opens, not for every row, so a list costs one request. The list has **no server thumbnails**. A
  selected file previews from the `File` itself, with no request, lazily. Blobs are never kept in the query cache.
- Every object URL is revoked when closed or unmounted (a download's, shortly after the click).

**Download all** saves each file in turn, with no ZIP on the server, and shows only when `multiple` is true; a browser may ask once to allow several downloads.

**Replace:** `canReplace` shows a Replace action on a row, which picks one file and sends it at once, with progress and Cancel on the row. With `multiple={false}`, `canReplace` and a stored file, a new pick,
once Upload is pressed, replaces it through `adapter.replace`; a refusal keeps the old one.

**Rules on the client:** `rules()` gives the `accept` attribute and an instant message for a wrong type or a big file, with no hard-coded
limits. **The server still decides**: a client check is only a convenience.

**Upload:**
- One request per file, one at a time, each with its own progress and Cancel (`AbortController`).
- **Unmounting aborts the current upload and stops the queue.** A clinic switch unmounts the page, and a surviving queue would send the next file
  with the new clinic's token, storing it in the wrong clinic on a clinic-side route.
- A cancelled upload shows no error and the list reloads, since the server may have saved it (`getErrorMessage` must not call a cancel a network error).
- A failed file stays in the selection with its translated reason and a Retry; the others carry on. A file that succeeded leaves it.
- The same file picked twice (same name, size and last-modified) is added once; a removed file can be picked again. `multiple={false}` makes a new
  pick replace the selection; `maxFiles` is the feature's rule, since the backend has no count.
- Dropping outside the area doesn't navigate the tab to the file: window `dragover` and `drop` are prevented while mounted. A dropped folder is refused.
- If `rules()` fails, an error and Retry show, picking is off, and the list still works.
- `useSingleFlight` guards Upload and Delete. A 404 on a stale row reloads the list (`showsStaleData`) and says so.
- Uploads, downloads and deletes run through `useMutation`, so a 403 still reloads `/me` (`AppProviders`). Query keys are `[...scope, "list"]` and
  `[...scope, "rules"]`, wrapped in `loadInScope`.
- `canUpload`, `canReplace`, `canDelete` default to **false**, passed by the feature from its own permissions; a control the user lacks isn't shown.

**Two changes outside the feature:**
- **`api/client.ts`:** with `responseType: "blob"`, an error's body arrives as a Blob, and `toApiError` is synchronous and would see no code. A
  response interceptor registered **before** the refresh interceptor parses a Blob whose type contains `json` (`application/problem+json`; a 401 may have
  an empty body) back into an object, so a 403 `noAccess` on a download still follows the clinic-lost flow. If parsing fails, the original error goes on.
- **Uploads** send `FormData` with `Content-Type: multipart/form-data`, which axios strips so the browser adds the boundary. Left with the client's JSON
  default, the file would be lost and the server would answer `attachmentEmpty`. A refreshed token's replay re-sends the same `FormData`.

**Text and layout:** `attachments.*` in `en.ts` and `ar.ts`. File names use `dir="auto"` and the bidi isolates in messages; long names wrap, with
the full name in a tooltip. Sizes use Latin digits, like dates. Every icon button has a tooltip and a name. Dropping files is an extra: the button
works by keyboard and on a phone, where dropping doesn't exist.

**Real browser proof:** jsdom can't prove a dropped file, an image showing, a real download or real multipart, and no real page mounts the components.
**Proposed:** a **harness page**, `ClinicHub.Web/e2e/harness/attachments/`, with its own small Vite config and providers, outside the production build:
- `global-setup.ts` copies its build into the run's `wwwroot` copy, so the run's own API serves it at `/__harness/attachments/index.html`, same origin, with no
  extra server. CI's and the no-build branch's build steps build it too. Two tsconfig entries cover it.
- Two modes: an in-memory adapter, and the real `api` client with Playwright's `page.route`, which proves the multipart body and file bytes, the 401
  replay and the blob error.
- Playwright runs the usual axe, cut-text and RTL checks on it, in Arabic, English and at phone width. The user opens it on Vite for the walkthrough.
- **What it can't prove:** Playwright's headless browser has no PDF viewer, so the tests check the fallback, and the iframe's type and bytes with the
  viewer flag forced on; a PDF actually rendering is checked by eye in the walkthrough. A real file drop is simulated with a `DataTransfer`.
- Isolation isn't proved here: part 1 does that against the real backend.
