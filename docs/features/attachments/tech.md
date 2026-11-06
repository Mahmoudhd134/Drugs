# Attachments: technical

## Summary
A generic module that stores files for any feature: metadata in the `Attachments` table, bytes on the server's disk, reached only through
`IAttachmentService`. One clinic can never read, list, replace or delete another clinic's file, and platform files (no clinic) are possible
too. Accepted types and the size limit per file come from config per module, and the content must prove the type its extension picked. No file
is ever removed by a delete or a replace.

It has two parts: the backend and reusable React components ([Frontend](#frontend)). It adds **no route and no screen**: each feature exposes its own routes with its own permission
(`[AttachmentUpload(module)]`, `ToFile()`) and mounts the components with an adapter over them. The reasons behind each decision:
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

The service still checks the file's real size. After the over-limit answer Kestrel closes the connection (`Connection: close`), so a client still writing a big body, chunked or refused on its `Content-Length`, may see the
reset before it reads the answer; the browser's check ([Frontend](#frontend)) covers the common case.

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
In `ClinicHub.Web/src/features/attachments/`, with no barrel file (a feature imports each piece by its path). Nothing mounts it yet: the first feature to use it brings the route and the screen. It holds no URL and no permission key: a feature passes an **adapter** over its own routes, and `canUpload`, `canReplace`, `canDelete` from its own permissions, all false by default.

| Piece | Does |
|---|---|
| `types.ts` | The adapter (`AttachmentsAdapter`, a `DataScope` plus `rules`, `list`, `upload`, `replace?`, `delete?`, `download`), the hook's result, every component's props |
| `useAttachments({adapter, multiple, maxFiles, canReplace})` | **The headless hook**: the list, the selection, progress, errors and every action. No markup |
| `components/AttachmentPicker` | Button or drop, the selection with local thumbnails, Upload with progress per file. `FileRowParts` holds the named icon button and the file name |
| `components/AttachmentList` | The stored files: name, type, size, date; preview, download one or all, replace, delete with `useConfirm` |
| `components/AttachmentPreview` | The dialog for one file, stored or selected. One per hook, rendered once by whoever composes the pieces |
| `components/AttachmentManager` | Picker, list and preview on one hook: the common case |
| `attachmentRequests(base)` | `list`, `upload`, `replace`, `delete`, `download` on a feature's routes, so no feature repeats the multipart and blob details. The feature adds `rules`, `scope`, `affects`, `container` |
| `functions.ts` | Pure helpers: `fileKey`, `extensionOf`, `acceptOf`, `checkFile`, `previewKind`, `formatFileSize`, `typeLabel`, `decodeText`, `readTextPreview`, `asPdf`, `downloadBlob`, `splitDropped` |

**Customizing, three levels:** the manager as it is; a slot (`renderTrigger`, `renderSelectedItem`, `renderItem`, `renderEmpty`, `renderPreview`), which replaces one part and receives its actions; or the hook alone with markup of your own. `renderPreview` replaces the dialog's content only, so its focus trap and name stay, and `actions.delete` includes the confirmation. Custom UI means React elements: no raw HTML string anywhere, because a file name is user data.

**Data:** query keys are `[...scope, "list"]` and `[...scope, "rules"]`, wrapped in `loadInScope`; a change reloads with `refreshScope`. Every request runs through one `useMutation`, so a 403 still reloads `/me` (`AppProviders`). Its function saves or stores a blob itself and returns nothing, and it's dropped a second after it ends: no cache holds a `File` or a `Blob`. It runs offline too (`networkMode: "always"`), failing instead of pausing the queue.

**Selecting and uploading:**
- Status flow: waiting → queued → uploading → gone, failed or cancelled. Failed → queued by Retry; cancelled → queued by Upload. A file that succeeded leaves the selection.
- Upload sends the waiting and cancelled files, one request at a time. Failed files go only by Retry, which joins the run or starts one. Files picked during a run wait for the next Upload. The button is disabled during a run or with nothing to send; `useSingleFlight` stops a double click.
- While the list is loading or failed, Upload is disabled in single-replace mode (`multiple={false}`, `canReplace` and `adapter.replace`) and with `maxFiles`: until the list answers, no one knows which file Upload would replace or how many are stored. A reload counts as loading, so after a send the next Upload waits for the list's new answer, and a reload that fails counts as failed, so the list shows `listFailed` and its Retry. Files can still be picked, and the hook's `upload` sends nothing then (`canSend` tells a feature with its own markup). Other uploads aren't affected: the list's failure doesn't stop them.
- A file picked while the list is loading, when the list then fills `maxFiles`: Upload stays off while stored + selected exceeds it, `tooMany` shows for the excess (the last picked) and nothing is sent. The excess stays selected until it's removed, which takes its line away and turns Upload back on. A replacing pick takes the stored file's place, so it isn't an excess.
- Remove works in every state but uploading. Cancel shows on uploading and queued: an uploading file's request is aborted, a queued file goes back to waiting.
- The same file (name, size, last modified) is added once; a removed file can be picked again. `maxFiles` counts stored + selected files. The rules' check runs in the server's order: empty, size, extension.
- A client refusal never enters the selection, but for a file already selected when the list fills `maxFiles` (above): an inline `role="alert"` lists each one, and the next pick clears it. A dropped folder is refused. If the rules fail to load, picking is off and the list still works. A user whose only control that needs the rules is a row's Replace gets the same alert and Retry, with no trigger and no Upload; with no such control, nothing shows.
- `multiple={false}`: a new pick replaces every selected file that isn't uploading; of several dropped, the first is kept and the rest are refused. A refused pick leaves the selection as it was.
- The drop hint is hidden on touch devices (`@media (pointer: coarse)`), where dropping doesn't exist: the button stays.
- A selected image's object URL is created only when its row enters the view (`IntersectionObserver`; at once where there's none), and revoked with its row.
- No success toast for an upload: the file moves to the list, and `announcement` goes to an `aria-live` region. Upload and Retry clear it first, so a Retry failing with the same reason, or a same-named file uploaded again, is heard again. It isn't cleared per file: the next file of a run starts in the same tick as the last result, which would never render. So two same-named files with the same result, one after the other in one run, are heard once.
- **Unmounting aborts every request and stops the queue, with no state change, toast or reload.** A clinic switch unmounts the page, and a surviving queue would send the next file with the new clinic's token, storing it in the wrong clinic. For the same reason a screen that shows another record mounts a new component (`key`), so a selection never moves between records.
- While mounted, the hook prevents window `dragover` and `drop`, so a file dropped outside the area doesn't navigate the tab.

**Replacing:**
- A row's Replace picks one file, checks the rules and sends it at once, with progress and Cancel on the row. Success toasts `replaced`; a refused pick or a failure is a toast, with no Retry. One runs at a time: every row's Replace is disabled, and its own row's Delete. Replace is also disabled with no rules.
- With `multiple={false}`, `canReplace` and a stored file, a pick is only selected; Upload sends it through `adapter.replace` on the newest stored file (the list's first). A refusal stays selected with its reason and Retry, and the old file stays. Such a pick doesn't count for `maxFiles`.
- `canReplace` alone shows the trigger and Upload in that mode.
- **A control shows only with the permission and the adapter's call:** `canDelete` needs `adapter.delete`, `canReplace` needs `adapter.replace`, for the row's button and for `renderItem`'s action alike. In single-file mode with no replace call, Upload isn't a replace: `canReplace` alone shows no picker, and with `canUpload` Upload adds the file, which counts toward `maxFiles`.
- Upload-replace racing the same file's row Replace or Delete isn't locked: one user would need two clicks in the same moment, and it ends in a 404 at worst.

**Actions on a stored file:** a failure is a toast through `getErrorMessage`; a 404 also reloads the list (`showsStaleData`). A cancel is silent, detected by the controller's `signal.aborted` whatever error the adapter throws, and the list reloads, since the server may have saved the file. The hook's `delete` has no confirmation; the list's button and `actions.delete` add it. Focus: a closed preview returns it to the button that opened it; after a delete it moves to the next row's first button, with no next row to the list (`tabIndex={-1}`, so the list stays in the page when it's empty); after a row's Replace finishes, to the new row's Replace button, once the list has reloaded; after one is cancelled or fails, the old row stays and focus returns to its Replace button. As for a delete, only when the focus went with the row or the Cancel: the user may have moved on meanwhile. After Remove or Cancel on a selected row it moves to the next row's first button, with no next row to the Choose files button; with a custom `renderTrigger`, the feature owns that last focus.

**Preview:**

| Type | Preview | Note |
|---|---|---|
| PNG, JPEG, WebP, GIF, BMP, AVIF | `<img>` from a blob | An image that fails to decode shows name, size, `cantShow` and Download |
| PDF | The browser's viewer, in an `<iframe>` with a `title`, only when `navigator.pdfViewerEnabled`; else name, size, Download with no fetch | No `sandbox`: it blocks Chrome's viewer. The blob is always re-wrapped with a hard-coded `application/pdf` (`asPdf`), because HTML sniffed in that same-origin frame could call the API with the user's login |
| TXT, CSV | Text in a `<pre dir="auto">`, set as text, first 1 MB | A byte-order mark decides first, then UTF-8, else Windows-1256; a cut inside a character doesn't count as invalid |
| TIFF, HEIC, Office | Name, size, Download | |

- The kind comes from the file's `typeKey` or extension, never from a response's or a `File`'s type.
- A stored file is fetched only when its preview opens (one request, whatever the clicks); a selected file previews from the `File`, with no request. The list has no server thumbnails. A failed fetch toasts and closes the dialog. Closing while it loads aborts it, and a late answer is ignored.
- Every object URL is revoked on close or unmount; a download's a second after the click. Download always shows; a stored file already fetched isn't fetched again.
- The exit has no fade: the URL goes as the dialog closes, so there's nothing to fade.

**Download all** saves each file in turn, with no ZIP on the server; a browser may ask once to allow several downloads. A failure toasts and the next file goes on.

**Outside the feature:** `api/client.ts` has a response interceptor, registered before the refresh interceptor, that parses a Blob error body whose type contains `json` back into an object, so `toApiError` sees its code and a 403 `noAccess` on a download follows the clinic-lost flow; if parsing fails, the original error goes on. `getErrorMessage` answers `errors.generic` on a cancel (`isRequestCancelled`), never `errors.network`. Uploads send `FormData` with `Content-Type: multipart/form-data`, which axios strips so the browser adds the boundary; a refreshed token's replay re-sends the same `FormData`.

**Texts:** `attachments.*` and the error codes `errors.attachmentTypeNotAllowed`, `errors.attachmentTooLarge`, `errors.attachmentEmpty`, in `en.ts` and `ar.ts`. File names use `dir="auto"` and the bidi isolates in messages; long names wrap, with the full name in a tooltip. Sizes use Latin digits, like dates. Every icon button has a tooltip and a name holding the file's name.

**The harness page** (`ClinicHub.Web/e2e/harness/attachments/`, `npm run build:harness`) only wires these components, for Playwright and the walkthrough: `/__harness/attachments/index.html` on an e2e run's own API, `/e2e/harness/attachments/index.html` on the main Vite, always with `index.html`, because the API's SPA fallback answers the folder URL first. It's never in `ClinicHub.Api/wwwroot`.

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
Catalog area **ATT**, cases ATT-001 to ATT-186 for the backend and ATT-200 to ATT-268 for the components ([test catalog](../../testing/test-catalog.md)); trait `attachments`. The components are tested with Vitest next to the code on a fake adapter (`src/test/pages/attachments.tsx`), and in a real browser on the harness page (`e2e/attachments/`); StrykerJS covers `functions.ts`. Backend unit tests: `tests/ClinicHub.UnitTests/Attachments/`. API tests:
`tests/ClinicHub.IntegrationTests/Attachments/`, through test-only controllers on the real pipeline (real Kestrel for the over-limit paths, since TestServer enforces no body limit). ATT-098 (the real IIS
limit) is a `manual` case for the dress rehearsal. Mutation by `-Mutate`: `AttachmentService`, the type checks, `AttachmentSettings`, `AttachmentSettingsValidation`, the provider and the upload filter.
