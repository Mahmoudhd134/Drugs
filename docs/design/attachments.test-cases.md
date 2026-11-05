# Attachments: test cases

Status: **approved** (user, T0, 2026-11-06). Same format and rules as the [test catalog](../testing/test-catalog.md). New area **ATT**. Sources:
the [design](attachments.md) (§ / An) and the [business file](../features/attachments/business.md) («…»). Moved into the catalog with the feature.

Two parts (§ 9). **Part 1, backend:** levels `unit` and `api`; `api` cases run on the test-only controller. **Part 2, components:** levels `unit`,
`ui` and `e2e` on the harness page (§ 12). Examples: clinics A and B; M = `clinicPaper` with its override (PNG and JPEG, 2 MB); G = any other
module string, with no entry (global list, 20 MB); owner O = (M, "1"). "Nothing written" means a clinic's own folder is unchanged: Respawn doesn't
reset the disk.

## Isolation

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-001 | Given a file in A, when B lists the same owner, then B's list is empty | P0 | api | «كل ملف يتبع عيادة واحدة» |
| ATT-002 | Given a file in A, when B opens it with the right ID, module and ref ID, then 404 `notFound` | P0 | api | «كل ملف يتبع عيادة واحدة» |
| ATT-003 | Given a file in A, when B replaces it, then 404, A's file and row are unchanged and no new row or file exists | P0 | api | § 4, A5 |
| ATT-004 | Given a file in A, when B deletes it, then 404 and A can still open it | P0 | api | § 4 |
| ATT-005 | Given a file in A, when A opens it with its ID but a different ref ID or module, then 404 | P0 | api | § 4 |
| ATT-006 | Given files in A and B with the same owner, when each lists and opens, then each gets only its own, with the right bytes | P0 | api | «كل ملف يتبع عيادة واحدة» |
| ATT-007 | Given a random GUID, when anyone opens it, then 404, the same answer as ATT-002 | P1 | api | § 4 |
| ATT-008 | Given a saved file, then its `Id` isn't sequential and its `StorageKey` holds the clinic and the ID, never the client's name | P1 | api | § 4 |
| ATT-009 | Given no token, when any test route is called, then 401 | P0 | api | A5 |
| ATT-010 | Given a clinic route with `[HasPermission]` and a role without it, when called, then 403 `forbidden`; a filter unit test with a throwing body proves the body isn't read | P0 | api+unit | A5 |
| ATT-011 | Given a suspended or deleted clinic, when its staff call a route, then 403 `clinicSuspended` or `noAccess` | P1 | api | access |
| ATT-012 | Given the real host with no test part added, when its endpoints are listed, then none carries `[AttachmentUpload]`: production has no attachment route | P0 | api | A2 |
| ATT-013 | Given a request carrying a `clinicId` in the body or query on a clinic route, then it's ignored: the row belongs to the token's clinic | P0 | api | § 4, clinic scoping |
| ATT-014 | Given A's file, when A replaces or deletes with a wrong ref ID or module, then 404 and it's unchanged | P0 | api | § 4 |

## Super admin and platform files

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-020 | Given the super admin on an `[AdminClinic]` route for A, when uploading, then the row and folder belong to A and A's staff can reach it through a clinic route | P0 | api | § 7 |
| ATT-021 | Given the super admin on `[AdminClinic]` for B, when opening A's file, then 404 | P0 | api | § 7 |
| ATT-022 | Given a clinic token on an admin route, then 403 `forbidden`; a missing, deleted or template clinic ID, then 404 | P1 | api | § 7 |
| ATT-023 | Given the super admin in the template clinic's context, when uploading, then it belongs to the template | P2 | api | § 7 |
| ATT-024 | Given a platform route inside `UseSharedCatalog()`, when uploading, then `ClinicId` is null and the key starts with `platform/` | P0 | api | A9 |
| ATT-025 | Given a platform route **outside** `UseSharedCatalog()`, when uploading, then it throws (500) and no file or row exists | P0 | api | § 4 |
| ATT-026 | Given a platform file, when a clinic route for that owner lists or opens it, then the clinic gets it | P1 | api | § 4, A9 |
| ATT-027 | Given a platform file, when a clinic replaces or deletes it, then 404 and it's unchanged | P0 | api | § 4 |
| ATT-028 | Given a clinic file, when a platform route lists, opens, replaces or deletes it, then none or 404 | P0 | api | § 4 |
| ATT-029 | Given a platform file, when opened through a clinic route of a different module, then 404 | P0 | api | § 4 |
| ATT-030 | Given the super admin uploads, then `CreatedByUserId` is their user ID though they have no staff row; deleting sets `DeletedByUserId` | P1 | api | § 4 |
| ATT-031 | Given a platform file, no clinic and outside `UseSharedCatalog()`, when replaced or deleted, then it throws before anything is written: the row is unchanged and there's no new file | P0 | api | § 4 |
| ATT-032 | Given an `Attachment` through EF, when `ClinicId` changes, or a platform row changes in a clinic, then the save throws | P1 | api | § 4 |
| ATT-033 | Given a clinic token on a platform route, then 403, no row or file | P0 | api | «لا يكتبها إلا مدير المنصة» |
| ATT-034 | Given owner O with a platform file and A's file, when A runs `DeleteAllAsync`, then only A's is marked and nothing throws | P0 | api | § 4 |

## Types (content checked)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-040 | Given a real sample of each of the 17 types with its extension(s), upper case too, then it passes and `TypeKey` is right | P0 | unit | § 5 |
| ATT-041 | Given each signature type's bytes one byte short or one byte wrong, then it fails | P1 | unit | § 5 |
| ATT-042 | Given a PNG named `.jpg`, or a JPEG named `.png`, then `attachmentTypeNotAllowed` | P0 | unit+api | «يتحقق النظام من محتوى الملف» |
| ATT-043 | Given an executable named `.png` or `.pdf`, then `attachmentTypeNotAllowed` and nothing is written | P0 | unit+api | «يتحقق النظام من محتوى الملف» |
| ATT-044 | Given a declared content type of `image/png` on a `.exe`, or a PDF declared as `text/html`, then the declared type changes nothing | P0 | api | § 5 |
| ATT-045 | Given `.svg`, `.html`, `.exe`, `.zip`, `.docm`, `.xlsm`, a name with no extension and a name ending in `.`, then `attachmentTypeNotAllowed` | P0 | unit | § 5 |
| ATT-046 | Given a `.docx`, `.xlsx` or `.pptx` holding `vbaProject.bin`, in any case and folder, then refused | P0 | unit | § 5 |
| ATT-047 | Given a plain ZIP named `.xlsx`, a `.docx` that is really a workbook, or a ZIP lacking `[Content_Types].xml`, then refused | P1 | unit | § 5 |
| ATT-048 | Given a corrupt or truncated ZIP named `.xlsx`, then refused, not an exception | P1 | unit | § 5 |
| ATT-049 | Given a `.docx` whose compressed entries are corrupt, then it still passes: proof that nothing is extracted | P2 | unit | § 5 |
| ATT-050 | Given compound-file bytes named `.doc`, `.xls`, `.ppt`, then accepted as that type; named `.docx`, then refused | P1 | unit | § 5 |
| ATT-051 | Given text in UTF-8, Windows-1256 and UTF-16 with a mark, as `.txt` and `.csv`, then accepted | P1 | unit | § 5 |
| ATT-052 | Given a `.txt` holding a NUL or a control character, or `MZ` bytes, then refused; tab, CR, LF and form feed pass | P1 | unit | § 5 |
| ATT-053 | Given a `.txt` starting with `BM`, then accepted: the extension picks the type | P2 | unit | § 5 |
| ATT-054 | Given a file shorter than a signature, then refused, not an exception | P1 | unit | § 5 |
| ATT-055 | Given an allowed type refused by M (a PDF), then `attachmentTypeNotAllowed` in M and accepted in G | P0 | api | A6 |
| ATT-056 | Given an executable with a valid `.docx` ZIP appended, named `.docx`, then refused | P0 | unit | «برنامج غُيّر اسمه» |
| ATT-057 | Given a `.txt` whose last byte is NUL, past the first MB, then refused: the whole file is checked | P1 | unit | § 5 |

## Config

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-060 | Given an unknown type key in the global list or a module's, then the app won't start and the message names it | P0 | unit+api | § 5 |
| ATT-061 | Given a `Modules` key not in `AttachmentModules`, then the app won't start | P0 | unit | § 5 |
| ATT-062 | Given `MaxFileSizeMb` 0 or negative, global or module, then the app won't start | P1 | unit | § 5 |
| ATT-063 | Given a module's size above the global, or a type outside the global list, then the app won't start; the size equal to the global starts | P0 | unit | A6 |
| ATT-064 | Given a module with only a size, or only types, then the other value comes from the global | P1 | unit | § 5 |
| ATT-065 | Given a module with no entry, then the global values apply | P0 | unit+api | § 5 |
| ATT-066 | Given an empty `AllowedTypes`, global or module, then every upload is refused | P1 | unit | § 5 |
| ATT-067 | Given type keys with spaces or different case (`" PNG , jpeg "`), then they work | P2 | unit | § 5 |
| ATT-068 | Given a later config source with a shorter list, then only that list applies, nothing kept from the base | P1 | api | § 5 |
| ATT-069 | Given a relative `RootPath`, or one inside the content root or web root, then the app won't start | P0 | unit | § 5 |
| ATT-070 | Given the pure path rule with Windows separators and case rule, `C:\inetpub\ClinicHubFiles` under the content root `C:\inetpub\ClinicHub` passes: only a real parent counts; `..` and case are resolved first | P1 | unit | § 5 |
| ATT-071 | Given an empty `RootPath`, then Development uses the default folder and any other environment won't start | P0 | unit | § 5 |
| ATT-072 | Given a root that is really a file, so it can't be created or written to, then the app won't start | P1 | api | § 5 |
| ATT-073 | Given a root equal to the content root, then the app won't start; given a trailing slash, or no web root (null), then it's judged correctly | P1 | unit | § 5 |
| ATT-074 | Given 1 MB in config, then the limit is 1,048,576 bytes | P1 | unit | § 5 |
| ATT-075 | Given a `Modules` key in the wrong case, then the app won't start | P2 | unit | § 4 |

## Size and upload

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-080 | Given a file exactly at M's limit, then it passes; one byte over, then 400 `attachmentTooLarge` and nothing is written | P0 | api | A6 |
| ATT-081 | Given a `Content-Length` far past the limit, then `attachmentTooLarge`; a filter unit test with a throwing body proves it's unread | P1 | unit+api | § 5 |
| ATT-082 | Given **real Kestrel** and a chunked body going past the limit, then `attachmentTooLarge`, not `invalidRequest` or 500 | P0 | api | § 5 |
| ATT-095 | Given real Kestrel and a 31 MB file within a raised module and global limit, then it's accepted: the filter really raises the default limits | P0 | api | § 5 |
| ATT-098 | Given a body over IIS's 30,000,000-byte limit behind real IIS, then the documented 404.13 answers | P2 | manual | § 5 |
| ATT-083 | Given a file over M's limit but under G's, then refused in M, accepted in G | P0 | api | A6 |
| ATT-084 | Given a zero-byte file, or a request with no file part, then 400 `attachmentEmpty` | P1 | api | § 5 |
| ATT-085 | Given no permission and a huge body, then 401 or 403 before the size check | P1 | api | § 5 |
| ATT-086 | Given a name with `../`, `..\`, or a full path, then only the last segment is stored and the disk key is unchanged | P0 | api | § 4, § 5 |
| ATT-087 | Given a name with a control character, a line break or a bidi override (`evil\u202Efdp.exe`), then 400 `nameInvalid` | P0 | unit+api | § 5 |
| ATT-088 | Given a name of 256 and of 257 characters, then 257 is 400 `nameTooLong` | P2 | unit | § 5 |
| ATT-089 | Given an Arabic file name, when downloaded, then it comes back correct | P1 | api | § 7 |
| ATT-090 | Given two uploads with the same name, then both are kept, each with its own ID | P1 | api | § 4 |
| ATT-091 | Given a bad module or ref ID from a feature's code (blank, over the column), then it throws: a programmer error | P2 | unit | § 4 |
| ATT-092 | Given an empty `.exe`, an oversized file with a bad name, or a bad name on a `.exe`, then the first failure in § 5's order answers | P1 | unit | § 5 |
| ATT-094 | Given a wrong field name, two `file` parts, a non-multipart body, a name past the multipart header limit, or no closing boundary, then 400 and nothing written | P1 | api | § 5 |
| ATT-096 | Given a blank name, a name ending in a slash, or only `.png`, then `attachmentTypeNotAllowed`; `CON.png`, `a.exe.png` and `a.exe:.png` are judged by the last extension and never touch the path; 256 Arabic characters download intact | P1 | unit+api | § 5, § 7 |
| ATT-097 | Given any upload, then `SizeBytes` is the stream's real length, not what the client declared | P1 | api | § 6 |
| ATT-099 | Given an upload, a refusal and a failed save, then no log line holds the original file name | P1 | api | § 5 |

## Replace, delete, no hard delete

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-100 | Given a file, when deleted, then 204, it leaves the list, opening is 404, and **the file is still on disk** with the row marked | P0 | api | A8 |
| ATT-101 | Given a file, when replaced, then the new one has a new ID, the old ID is 404, the list shows only the new, and **the old file is still on disk** | P0 | api | A8 |
| ATT-102 | Given a replace with a refused file, then the old one still opens and nothing new exists | P0 | api | «عند رفض الملف الجديد» |
| ATT-103 | Given a deleted file, when deleted or replaced again, then 404 | P1 | api | § 6 |
| ATT-104 | Given an owner with three files, when `DeleteAllAsync` runs, then all are marked, others' files are untouched, all stay on disk | P1 | api | § 6 |
| ATT-105 | Given a soft-deleted clinic, then its rows and files remain | P1 | api | «عند حذف عيادة» |
| ATT-106 | Given a new clinic from a template holding attachments, then the new clinic has none | P1 | api | «ولا تُنسخ الملفات» |
| ATT-107 | Given a source scan of the module, then the cleanup is the only caller of `IAttachmentFileProvider.DeleteAsync`, and the only `IgnoreQueryFilters()` | P0 | unit | A8, § 6 |
| ATT-108 | Given a replace whose save throws, then the old row stays live and the new file is removed | P1 | api | § 6 |
| ATT-111 | Given a download in flight, when the file is deleted, then all bytes arrive and the next open is 404 | P2 | api | A8 |

## Failure and cleanup

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-120 | Given a command that adds a file then fails (a failed `Result`), then the row is gone and the file is removed by the cleanup | P0 | api | § 6 |
| ATT-121 | Given a command that adds a file then throws, then the same | P0 | api | § 6 |
| ATT-122 | Given the row's save throws, then the file is removed and the exception goes on | P1 | api | § 6 |
| ATT-123 | Given a command that adds and commits inside a `Use(clinicId)` block that ended before the cleanup runs, then **the file is kept** | P0 | api | § 6 |
| ATT-124 | Given a platform upload that commits, then the cleanup keeps the file | P0 | api | § 6 |
| ATT-125 | Given the cleanup's lookup fails, then it logs and the file stays | P1 | api | § 6 |
| ATT-126 | Given a nested command whose savepoint rolled back while the outer one commits, then that file is removed and the outer's is kept | P1 | api | § 6 |
| ATT-127 | Given a row whose file is missing from disk, when opened, then 404 and an error is logged | P1 | api | § 6 |
| ATT-128 | Given a disk write that fails, then 500 `unexpected` and no row | P1 | api | § 11 |
| ATT-130 | Given an upload, then the content check and the write each read from the start of a fresh stream | P1 | unit | § 6 |
| ATT-131 | Given the service called with no transaction, then the immediate cleanup keeps the committed file | P0 | api | § 6 |
| ATT-132 | Given a save that committed and then lost its connection, then the lookup finds the row and the file stays | P1 | api | § 6 |
| ATT-133 | Given a cancel during the provider's write, then no file or row | P0 | unit | § 3 |
| ATT-134 | Given a cancel during the row's save, then the file is still removed | P0 | api | § 6 |

## Serving

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-140 | Given a download, then the bytes equal the upload, with the checked `Content-Type`, not the declared one | P0 | api | § 7 |
| ATT-141 | Given a download, then `Content-Disposition: attachment`, also for images, `nosniff`, and `Cache-Control: private, no-store` | P0 | api | § 7 |
| ATT-142 | Given a stored file, when its key or folder is requested by URL, then the file's bytes never come back: the fallback may answer the SPA | P0 | api | A10 |
| ATT-143 | Given a failed download, then the usual ProblemDetails, without the file headers | P2 | api | § 7 |
| ATT-144 | Given a list, with the test clock advanced between uploads, then newest first, ties by ID, and no row exposes `StorageKey` | P1 | api | § 3, § 6 |
| ATT-145 | Given two opens at once, then both read; after they're disposed, the file isn't locked | P1 | unit | § 3 |

## Physical provider (the contract any provider must pass)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-160 | Given a save then an open, then the bytes match; folders are created as needed | P0 | unit | § 3 |
| ATT-161 | Given an unknown key, when opened, then null | P1 | unit | § 3 |
| ATT-162 | Given a write that fails midway, then no file remains under the key | P0 | unit | § 3 |
| ATT-163 | Given keys `..\x`, `../x`, `C:x`, `\\s\x`, `x:ads`, `CON`, `x.`, upper case, and empty, then each is refused before touching the disk, the same on every OS | P0 | unit | § 3 |
| ATT-164 | Given a delete of an unknown key, then no error | P2 | unit | § 3 |
| ATT-166 | Given a save to an existing key, then it throws and the first file is kept | P0 | unit | A8 |

## Docs and data

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-180 | `AddAttachments` runs up → down → up and leaves no pending model change | P1 | api | § 4 |
| ATT-181 | Each new error code answers exactly the English and Arabic text of the business file's message table (presence alone is ERR-030) | P1 | unit | Messages |
| ATT-182 | Deleting a user with attachments is restricted by the FK, as designed | P2 | api | § 4 |
| ATT-183 | Given an upload named `تقرير المريض.pdf`, then `OriginalFileName` keeps that name while the file on disk is named by the row's GUID, with no extension | P0 | api | A14 |
| ATT-184 | Given a module with an override and one without, when `GetRules` is called, then each answers its own limit and extensions | P1 | unit | § 3 |

## Part 2: selecting and uploading

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-200 | Given rules, when the picker opens, then its `accept` holds exactly the rules' extensions | P1 | ui | § 12 |
| ATT-201 | Given several files picked, when shown, then each shows its name and size, and a selected image shows a local preview with no request | P0 | ui | § 12 |
| ATT-202 | Given selected files, when one is removed and another added, then the selection holds exactly those | P0 | ui | § 12 |
| ATT-203 | Given the same file picked twice, then it's listed once | P2 | ui | § 12 |
| ATT-204 | Given a wrong type or a file over the limit, when picked (`applyAccept: false`, since the test library otherwise drops it), then an instant translated message shows and no request is sent | P0 | ui | § 12 |
| ATT-205 | Given a file the client accepts and the server refuses, then the server's translated reason shows on that file | P0 | ui | § 12 |
| ATT-206 | Given three files with the second failing, when uploaded, then the first and third succeed, the second stays with its reason and Retry, and Retry can succeed | P0 | ui | § 12 |
| ATT-207 | Given an upload running, when cancelled, then the request is aborted and the file stays selected | P1 | ui | § 12 |
| ATT-208 | Given a double click on Upload, then one upload runs per file | P1 | ui | § 12 |
| ATT-209 | Given `multiple={false}`, when a second file is picked, then it replaces the first; given `maxFiles`, then more are refused with a message | P1 | ui | § 12 |
| ATT-210 | Given an expired token during an upload, on the real client with `page.route`, then the refresh replays it with the same boundary and file bytes | P1 | e2e | § 12 |
| ATT-211 | Given files dropped on the drop area (a simulated `DataTransfer`), then they're selected as if picked | P1 | e2e | § 12 |
| ATT-212 | Given keyboard only, then the pick control is a real button and a file can be picked and uploaded | P1 | ui | § 12 |
| ATT-213 | Given a zero-byte pick, then the "empty" message shows and no request is sent | P1 | ui | Messages |
| ATT-214 | Given `IMG.JPG`, or a size exactly at the limit, then accepted; limit + 1 refused | P1 | unit | § 12 |
| ATT-215 | Given a queue running, when unmounted (a clinic switch), then the current upload aborts, no next request is sent, and no toast shows | P0 | ui | § 12 |
| ATT-216 | Given rules failing to load, then an error and Retry show, picking is off and the list still works | P1 | ui | § 12 |
| ATT-217 | Given a file removed, when picked again, then it's listed again | P1 | ui | § 12 |
| ATT-218 | Given a folder dropped, then a refusal shows and no request is sent | P2 | ui | § 12 |
| ATT-219 | Given a drop outside the area, then the app stays open | P1 | e2e | § 12 |
| ATT-235 | Given a cancel, then no error shows and the list reloads | P1 | ui | § 12 |
| ATT-236 | Given a run in progress, when files are added, then they wait for it; Retry isn't silently ignored | P1 | ui | § 12 |
| ATT-237 | Given 500 files selected, then their previews load lazily and no request is sent | P2 | ui | § 12 |
| ATT-238 | Given an upload finishing after a list refresh, then the file ends in the list once, not in the selection | P1 | ui | § 12 |
| ATT-244 | Given a selected name with a bidi override, then it's isolated and doesn't reorder its row | P2 | ui | § 12 |
| ATT-245 | Given `multiple={false}`, `canReplace` and a stored file, when a new file is picked, then `replace` is called; a refusal keeps the old file | P0 | ui | § 12 |

## Part 2: list, download, preview, delete

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-220 | Given stored files, then each row shows the original name, type, size and date, and opening the list fetches no file | P0 | ui | § 12 |
| ATT-221 | Given no files, then the empty state shows | P1 | ui | § 12 |
| ATT-222 | Given a list that fails to load, then a translated error and Retry show | P1 | ui | § 12 |
| ATT-223 | Given Download, then the browser saves the bytes under the original name, Arabic names too | P0 | e2e | § 12 |
| ATT-224 | Given a download answering `application/problem+json` as a blob, on the real client, then `toApiError` sees its code and the translated message shows; a parse failure keeps the original error | P0 | unit+ui | § 12 |
| ATT-225 | Given a download answering 403 `noAccess`, on the real client, then the clinic-lost flow runs | P0 | ui | § 12 |
| ATT-226 | Given an image and a text file, when previewed, then each really shows | P0 | e2e | § 12 |
| ATT-239 | Given an empty-body 401 on a blob download, then refresh and replay return the blob | P1 | ui | § 12 |
| ATT-240 | Given a double Preview, or a close while loading, then one request, the late answer is ignored, no toast, and the URL is revoked | P1 | ui | § 12 |
| ATT-241 | Given an image failing to decode, then name, size and Download show | P1 | ui | § 12 |
| ATT-242 | Given a preview closed, then focus returns to its button; after a delete, to the next row or the list | P1 | ui | § 12 |
| ATT-243 | Every icon button and progress bar is named with its file; finishing and failing are announced | P1 | ui | § 12 |
| ATT-246 | Given several files and Download all, then each is saved | P1 | e2e | A12 |
| ATT-247 | Given a UTF-16 mark, or a 1 MB cut inside an Arabic character, then the text reads correctly | P1 | unit | § 12 |
| ATT-248 | Given the viewer flag on and a PDF preview, then the iframe has a `title`, no `sandbox`, a hard-coded `application/pdf` type and `%PDF-` bytes | P0 | e2e | § 12 |
| ATT-249 | Given the viewer flag off, then a PDF preview shows name, size and Download | P0 | ui | § 12 |
| ATT-257 | Given a 403 on a download that isn't clinic-lost, then a toast shows and `/me` reloads | P1 | ui | § 12 |
| ATT-258 | Given a PDF actually opening in the browser's viewer on a real desktop and phone | P2 | manual | § 12 |
| ATT-227 | Given TIFF, HEIC and Office files, when previewed, then name, size and Download show, with no viewer | P1 | ui | § 12 |
| ATT-228 | Given a text file holding `<script>` or HTML, when previewed, then it shows as literal text and nothing runs | P0 | ui | § 12 |
| ATT-229 | Given a file name holding HTML, when shown anywhere, then it shows as literal text | P0 | ui | § 12 |
| ATT-230 | Given a text file over 1 MB, when previewed, then the first 1 MB shows with a note; Windows-1256 Arabic reads correctly | P2 | unit | § 12 |
| ATT-231 | Given a preview opened and closed, or the component unmounted, then every object URL is revoked | P1 | ui | § 12 |
| ATT-232 | Given Delete confirmed, then it leaves the list; Cancel changes nothing, and a double click sends one request | P0 | ui | § 12 |
| ATT-233 | Given a row deleted meanwhile, when acted on, then 404 reloads the list and says the item is gone | P1 | ui | § 12 |
| ATT-234 | Given `canUpload` and `canDelete` left out, then those controls aren't shown | P0 | ui | § 12 |

## Part 2: customizing and layout

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ATT-250 | Given each of `renderTrigger`, `renderItem`, `renderSelectedItem`, `renderEmpty`, `renderPreview`, then it replaces its part and the actions it receives work | P0 | ui | A13 |
| ATT-251 | Given `useAttachments` alone with custom markup, then every action works with no component | P0 | ui | A13 |
| ATT-252 | Given the source of the feature's components, then none uses `dangerouslySetInnerHTML` | P1 | unit | § 12 |
| ATT-253 | Given the harness page in Arabic, English and at phone width, then axe, cut-text and RTL checks pass with a long Arabic file name | P0 | e2e | § 12 |
| ATT-254 | Given a phone width, then a file can be picked, uploaded, previewed and deleted; a PDF the browser can't show offers Download | P1 | e2e | § 12 |
| ATT-255 | Given the production build (`ClinicHub.Api/wwwroot`, read from disk: the run's copy holds the harness), then the harness page isn't in it | P1 | e2e | § 12 |
| ATT-256 | Every `attachments.*` key exists in `en.ts` and `ar.ts` | P1 | unit | § 12 |
