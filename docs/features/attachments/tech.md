# Attachments: technical

## Summary
A generic module that stores files for any feature: metadata in the `Attachments` table, bytes on the server's disk, reached only through
`IAttachmentService`. One clinic can never read, list, replace or delete another clinic's file, and platform files (no clinic) are possible
too. Accepted types and the size limit per file come from config per module, and the content must prove the type its extension picked. No file
is ever removed by a delete or a replace.

This is **part 1, the backend**. It adds **no route and no screen**: each feature exposes its own routes with its own permission
(`[AttachmentUpload(module)]`, `ToFile()`). Part 2 (reusable components) and the reasons behind each decision:
[the design](../../design/attachments.md).

## Data model
**`Attachments`** (`ClinicHub.Domain/Attachments/Attachment.cs`; `IClinicOrShared`, `IHasTimestamps`), migration `AddAttachments`: a new empty
table, so no data step.

| Column | Type | Rules |
|---|---|---|
| Id | uuid PK | `Guid.NewGuid()` in the service: the file is written before the row exists |
| ClinicId | int null | FK restrict; null = a platform file |
| Module | varchar(50) | Required |
| RefId | varchar(64) | The owning record's key as text. No database link: it can be in any table |
| OriginalFileName | varchar(256) | The last path segment of what the client sent, trimmed. For display and download; never in a path, never logged |
| TypeKey | varchar(20) | The checked type (`png`, `xlsx`…) |
| SizeBytes | bigint | The stream's real length, not what the client declared |
| StorageKey | varchar(200) | Unique: `clinics/<clinicId>/<Id>` or `platform/<Id>`, the GUID in `D` format, no extension. Stored, so reads never build a path from a request |
| CreatedByUserId | int | FK `Users` restrict. A user ID, because a super admin has no staff row |
| DeletedAt | timestamptz null | Set = deleted: every read answers as if it didn't exist |
| DeletedByUserId | int null | FK `Users` restrict |
| CreatedAt, UpdatedAt | timestamptz | |

Index `(ClinicId, Module, RefId)`. Clinic FK and filter come from `AppDbContext` (any `IClinicOrShared`); the save interceptor's guards apply as they
do to a drug, without any code change ([clinic scoping](../clinic-scoping/tech.md)).

## API
No route of its own. A feature's route, for example:

```csharp
[HttpPut, AttachmentUpload(AttachmentModules.ClinicPaper)]
public async Task<ActionResult> Upload(IFormFile file, CancellationToken ct) =>
    (await sender.Send(new UploadPaperImageCommand(file.ToAttachmentUpload()), ct)).ToOk();
```

| Answer | When |
|---|---|
| 400 `attachmentEmpty` | A zero-byte file, a request with no file part, or a wrong field name |
| 400 `attachmentTooLarge` | Over the module's limit: by `Content-Length` (body unread), while reading the form, or by the stream's real length |
| 400 `attachmentTypeNotAllowed` | No name or extension, an extension unknown or not allowed for the module, or content that doesn't prove it |
| 400 `nameInvalid`, `nameTooLong` | The same characters as `ValidName`; over 256 characters |
| 400 `invalidRequest` | Not multipart, no boundary or closing boundary, a header past the multipart limit, or more than one file part |
| 404 `notFound` (`AttachmentErrors.NotFound`) | A missing or deleted file, another owner's, another clinic's, or a platform file a clinic tries to change |
| 500 `unexpected` | Written with no clinic and outside `UseSharedCatalog()` (a programmer error), or a disk write that failed, also while the upload filter buffers the form (logged) |

A download (`Result<AttachmentContent>.ToFile()`) is a `FileStreamResult`, streamed, with the checked `Content-Type`, always
`Content-Disposition: attachment` (the framework writes `filename*`, so Arabic names work), `X-Content-Type-Options: nosniff` and
`Cache-Control: private, no-store`. A failure is the usual ProblemDetails, without those headers. There is no static route to the folder and no URL with
the key.

## Backend
**Folders:** `Application/Features/Attachments/` (`AttachmentErrors`), `Files/` (`IAttachmentService`, `AttachmentService`, `IAttachmentFileProvider`,
`AttachmentRecords`, `AttachmentModules`, `AttachmentFileName`, `AttachmentSettingsValidation`), `FileTypes/` (`AttachmentType`, `AttachmentTypes`, `AttachmentContentCheck`);
`Application/Common/Settings/` (`AttachmentSettings`, `AttachmentRootRule`); `Infrastructure/Attachments/PhysicalAttachmentFileProvider`;
`Api/Features/Attachments/` (`[AttachmentUpload]`, `AttachmentUploadFilter`, `ToAttachmentUpload()`); `Api/Errors/ResultHttpExtensions.ToFile()`.

**`IAttachmentService`** (scoped): called from a feature's own commands and queries, so its record check and the row share one transaction. The service
holds every rule, the row and the key; **`IAttachmentFileProvider`** (singleton) only moves bytes, and a cloud bucket can sit beside the physical one later.

- **Guards:** `AddAsync`, `ReplaceAsync`, `DeleteAsync` and `DeleteAllAsync` first throw `InvalidOperationException` with no clinic and outside
  `IClinicScope.UseSharedCatalog()`, so a forgotten clinic can't write a platform file. The feature's handler opens that block, never the service. Every method
  then throws `ArgumentException` for a blank or over-long module (50) or ref ID (64). At run time any module string is accepted; one with no config entry uses
  the global limits.
- **Reads** match ID + module + ref ID + not deleted, because a clinic also sees platform rows through the filter: an ID alone never reaches a file. `NotDeleted`
  is one private check, since the clinic filter holds EF's one query filter. **Writes** also match the row's clinic with the current one, so a platform row
  in a clinic is simply not found, and `DeleteAllAsync` in a clinic marks only that clinic's rows: the interceptor's throw, which would roll back the feature's whole
  command, is never reached.
- **List:** `CreatedAt` newest first, ties by `Id` ascending.
- **Validation order** (first failure answers, nothing written): empty → size → name → extension known and allowed for the module → content. `ReplaceAsync` finds
  the old row first. Each read (length, content check, write) opens a fresh stream through `AttachmentUpload.OpenRead` and disposes it.
- **Add and replace:** write the file → add the row (replace also marks the old one, in the same save) and save, with the cleanup queued in a `finally` around the
  save. An exception from the save goes on to the feature's command.
- **Cleanup** (`IPostCommitActions`, when the outermost transaction ends, committed or rolled back; at once outside a transaction): looks the row up by ID across every
  clinic, read only (`IgnoreQueryFilters().AsNoTracking()`; the module's only `IgnoreQueryFilters()`), and removes the file only if no row has this ID. It's the only
  caller of `IAttachmentFileProvider.DeleteAsync`. It decides by lookup, not by the save's result, because a commit can reach the server and then lose the
  connection. It takes no request token, so it runs after a cancel. A failed lookup throws, `TransactionRunner` logs it, and the file stays.
- **Delete** sets `DeletedAt` and `DeletedByUserId`; the file stays. A second delete is 404. **`DeleteAllAsync`** loads and marks rows, with no `ExecuteUpdate`, so the
  save interceptor runs; the feature calls it when its record is deleted.
- **Open:** a row with no file logs an error by the attachment's ID and answers 404.
- **Logs** use the attachment's ID, never the original name, which can hold a patient's name. `AddApi` keeps the framework's `FileStreamResultExecutor` at Warning,
  because at Information it logs the download name.

**Content check** (`AttachmentContentCheck.Matches`): the extension picks the type, then the content must prove it; the declared content type is ignored.

| Key | Extensions | Check | Content type |
|---|---|---|---|
| `png` | .png | Signature `89 50 4E 47 0D 0A 1A 0A` | image/png |
| `jpeg` | .jpg, .jpeg | `FF D8 FF` | image/jpeg |
| `webp` | .webp | `RIFF` + `WEBP` at byte 8 | image/webp |
| `gif` | .gif | `GIF87a` or `GIF89a` | image/gif |
| `bmp` | .bmp | `BM` | image/bmp |
| `avif` | .avif | `ftyp` at byte 4, brand `avif` or `avis` | image/avif |
| `tiff` | .tif, .tiff | `II*\0` or `MM\0*` | image/tiff |
| `heic` | .heic, .heif | `ftyp` at byte 4, brand `heic`, `heix`, `hevc`, `mif1` or `msf1` | image/heic |
| `pdf` | .pdf | `%PDF-` | application/pdf |
| `docx`, `xlsx`, `pptx` | same | Starts with `PK\x03\x04`; the ZIP's entry list holds `[Content_Types].xml` and `word/document.xml`, `xl/workbook.xml` or `ppt/presentation.xml`, and no `vbaProject.bin` in any folder; names compared ignoring case; nothing extracted | Office types |
| `doc`, `xls`, `ppt` | same | `D0 CF 11 E0 A1 B1 1A E1` | application/msword, application/vnd.ms-excel, application/vnd.ms-powerpoint |
| `txt`, `csv` | same | The whole file has no NUL or C0 control except tab, CR, LF and form feed; or it starts with a UTF-16 byte-order mark | text/plain, text/csv |

**File name** (`AttachmentFileName`, no `Path` call): the last segment after `/` or `\`, trimmed. Blank → `attachmentTypeNotAllowed`; the characters `ValidName` refuses
(`ValidationExtensions.HasInvalidNameCharacter`) → `nameInvalid`; over 256 → `nameTooLong`. Only the last extension counts, lower-cased; none, a trailing dot or only an
extension (`.png`) is not allowed.

**Physical provider:** `FileMode.CreateNew`, so an existing key throws and keeps the first file; a failed or cancelled write removes what it wrote; no temp files of our
own. `FileShare.Read`, so several downloads can read at once. Every method refuses a key by a whitelist before any `Path` call (lower-case ASCII letters, digits, `-` and `/`, no
empty segment), because CI runs on Linux, where `..\` and `C:` are ordinary characters.

**Upload filter** (`[AttachmentUpload(module)]`, a resource filter: after authorization and `[AdminClinic]`, before model binding):
1. Sets the server's body limit to the module's limit plus 64 KB for the framing, where the server has that feature and it isn't read only. That also raises Kestrel's 30 MB default.
2. Refuses a larger `Content-Length` with `attachmentTooLarge`, unread.
3. Refuses a body that isn't `multipart/form-data` with `invalidRequest`. `AddApi` sets `SuppressConsumesConstraintForFormFileParameters`, or `[ApiController]` would answer 415 first.
4. Installs its own `FormFeature` with `MultipartBodyLengthLimit` at the same limit (the default caps at 128 MB) and reads the form. `BadHttpRequestException` with status 413 or the
   limit this filter installed answers `attachmentTooLarge`, compared by its number, because the reader's own 16 KB limit (a wrong boundary with a long preamble) throws the same words. Any other
   `InvalidDataException` or `BadHttpRequestException`, and the plain `IOException` of a missing closing boundary ("Unexpected end of Stream…"), answers `invalidRequest`. Any other `IOException`
   is a server failure, such as a full disk while buffering the form: it goes on, so the unexpected handler logs it and answers 500 `unexpected`. A request the client aborted is never answered: its
   error goes on too. More than one file part answers `invalidRequest`.

The service still checks the file's real size. After the over-limit answer Kestrel closes the connection (`Connection: close`), so a client still writing a big chunked body may see the
reset before it reads the answer; the browser's check in part 2 covers the common case.

**Config** (`AttachmentSettings`, section `Attachments`; validated last in `AppSettings.Validate`, so other startup failures keep their own reason). The check is the extension method
`AttachmentSettingsValidation.Validate` in `Features/Attachments/Files/`, not on the settings class, because it needs `AttachmentModules` and `AttachmentTypes` and `Common` never references `Features`:

| Key | Rules |
|---|---|
| `MaxFileSizeMb` | At least 1; 1 MB = 1,048,576 bytes |
| `AllowedTypes` | Comma-separated type keys, ignoring spaces and case. A string, because .NET merges arrays by index and a later source replaces a string whole. Empty accepts nothing |
| `Physical:RootPath` | Absolute, outside the content root and the web root (by whole segments, case-insensitively on Windows: `AttachmentRootRule`, a pure function). Empty: in Development `LocalApplicationData/ClinicHub/attachments`, anywhere else the app won't start. Created and proved writable at startup with a probe file, then replaced by its full path |
| `Modules:<module>` | The key must be in `AttachmentModules.All`, in the same case. `MaxFileSizeMb` and `AllowedTypes` are each optional and can only narrow |

Any other value stops the app at startup, and the message names it. Env var: `Attachments__Physical__RootPath` ([DEPLOY.md](../../../DEPLOY.md)).

## Frontend
Nothing mounted yet. Only the error texts, in `en.ts` and `ar.ts`: `errors.attachmentTypeNotAllowed`, `errors.attachmentTooLarge`, `errors.attachmentEmpty`. The components come in part 2.

## Edge cases & limitations
- **No file is ever removed** by a delete or a replace, and there's no purge job, so disk use only grows. A full disk answers 500 `unexpected` and writes no row.
- **One server:** files on disk break with several servers or a host whose disk doesn't persist; the provider interface is the way out.
- **Stray files:** a crash during the write or before the save, or a failed cleanup, leaves a file (perhaps partial) with no row. Nothing can reach it, because every read starts from a row.
  Accepted, with no cleanup job.
- **Races, accepted** while only the super admin uploads: two replaces of one file at the same moment leave two live rows, and a replace racing a delete can leave the new file live. No
  concurrency token. No file is lost. Revisit before clinic staff upload.
- **The check proves the type, not that a file is safe.** Old `.doc`, `.xls`, `.ppt` share one signature, so the extension picks which, macros can't be detected, and other files with that signature
  (a renamed `.msi`) pass. A text file holding HTML is stored as text and downloads as text. CSV cells can hold formulas. An encrypted Office file passes as `.doc` and fails as `.docx`.
- **A part with `filename=""`** isn't a file for the framework, so it answers `attachmentEmpty`; a blank name that reaches the service answers `attachmentTypeNotAllowed`.
- **IIS answers first:** a body over its own 30,000,000-byte limit gets IIS's HTML 404.13, whatever the module's limit ([DEPLOY.md](../../../DEPLOY.md)).
- A soft-deleted clinic keeps its rows and files. Attachments aren't copied from the template clinic to a new one.

## Testing notes
Catalog area **ATT**, cases ATT-001 to ATT-186 ([test catalog](../../testing/test-catalog.md)); trait `attachments`. Unit tests: `tests/ClinicHub.UnitTests/Attachments/`. API tests:
`tests/ClinicHub.IntegrationTests/Attachments/`, through test-only controllers on the real pipeline (real Kestrel for the over-limit paths, since TestServer enforces no body limit). ATT-098 (the real IIS
limit) is a `manual` case for the dress rehearsal. Mutation by `-Mutate`: `AttachmentService`, the type checks, `AttachmentSettings`, `AttachmentSettingsValidation`, the provider and the upload filter.
