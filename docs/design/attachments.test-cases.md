# Attachments: test cases

Status: **approved** (user, T0, 2026-11-06). Same format and rules as the [test catalog](../testing/test-catalog.md). New area **ATT**. Sources:
the [design](attachments.md) (§ / An) and the [business file](../features/attachments/business.md) («…»). Moved into the catalog with the feature.

Two parts (§ 9). **Part 1, backend:** levels `unit` and `api`; `api` cases run on the test-only controller. **Part 2, components:** levels `unit`,
`ui` and `e2e` on the harness page (§ 12). Examples: clinics A and B; M = `clinicPaper` with its override (PNG and JPEG, 2 MB); G = any other
module string, with no entry (global list, 20 MB); owner O = (M, "1"). "Nothing written" means a clinic's own folder is unchanged: Respawn doesn't
reset the disk.

**Part 1's rows (ATT-001 to ATT-184) moved** to the [test catalog](../testing/test-catalog.md#att--attachments), section ATT, with the feature; this file keeps part 2's until it's built.

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
