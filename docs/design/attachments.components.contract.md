# Attachments part 2: compiled contract and work split

Written at the end of T0, before T1. The approved rules stay in [the design](attachments.md) (§§ 8, 9, 12), [the business file](../features/attachments/business.md) and [the test cases](attachments.test-cases.md); this file only adds what they leave to implementation. Part 2 = design § 12, cases ATT-200 to ATT-284 (85 cases).

## 1. What the contract commit holds

Compiled code, real unless marked **stub**. A stub's body throws, except the four components, which render nothing.

| File (under `ClinicHub.Web/` unless it says otherwise) | Holds |
|---|---|
| `src/features/attachments/types.ts` | Real: the adapter, the hook's result, every component's props |
| `src/features/attachments/functions.ts` | **Stubs**: `fileKey`, `extensionOf`, `acceptOf`, `checkFile`, `previewKind`, `formatFileSize`, `typeLabel`, `decodeText`, `readTextPreview`, `asPdf`, `downloadBlob`, `splitDropped`. Real: `TEXT_PREVIEW_BYTES` |
| `src/features/attachments/attachmentRequests.ts` | **Stub**, with its table of requests |
| `src/features/attachments/useAttachments.ts` | **Stub** |
| `src/features/attachments/components/` | **Stubs**: `AttachmentPicker`, `AttachmentList`, `AttachmentPreview`, `AttachmentManager` |
| `src/api/errors.ts` | Real: `isRequestCancelled`. `getErrorMessage` is unchanged: T1 changes it |
| `src/i18n/locales/en.ts`, `ar.ts` | Real: the `attachments` block |
| `src/test/setup.ts` | Real: `Blob.prototype.text` and `arrayBuffer` for jsdom (§ 2, "In the tests") |
| `src/test/pages/attachments.tsx` | Real: `aStoredFile`, `aFile`, `ALL_RULES`, `apiRefusal`, `fakeAdapter` (with `holdUploads`), `aDataTransfer`, `stubObjectUrls`, `renderManager`, `startManager`, `testFilesHandlers` |
| `e2e/support/attachmentsDrop.ts` | Real: `dropFiles`, `dropOutside` |
| `e2e/harness/attachments/` | Real: `index.html`, `main.tsx`, `vite.config.ts`, `memoryAdapter.ts` (§ 3). It works once the stubs are built |
| `tsconfig.harness.json`, `tsconfig.json`, `e2e/tsconfig.json` | Real: the harness has its own project; `e2e` excludes it |
| `package.json`, `eslint.config.js`, root `.gitignore` | Real: `build:harness`; `dist-harness` ignored |
| `e2e/global-setup.ts`, `.github/workflows/ci.yml` | Real: build the harness and copy it into the run's web root copy |
| `docs/design/attachments.md`, `attachments.test-cases.md`, `docs/testing/README.md` | The user's decisions below: §§ 8 and 12, ATT-210, ATT-245, the new ATT-259; the Blob line of the Vitest set-up |

There is no barrel file: a feature imports each piece by its path, as for roles and staff. There is no backend change.

## 2. Details the design leaves open

### Replacing and counting (the user's decisions)

- **Single-file replace happens after Upload.** With `multiple={false}`, `canReplace` and a stored file, a pick fills the selection as usual: the user sees it and presses Upload, and only then `adapter.replace` runs, on the newest stored file. A refusal stays selected with its reason and Retry, and the old file stays.
- **`maxFiles` counts stored + selected files.** A replacing pick takes the stored file's place, so it doesn't count.
- **A row's Replace** picks one file, checks the rules and sends it at once. The row shows its progress and a Cancel. Success toasts `replaced`. A refused pick or a failure is a toast, with no Retry.
- **Cancelling a row's Replace** (`cancelReplace`, `actions.cancelReplace`) aborts the request and keeps the old file. It shows no error and reloads the list, like an upload's cancel.
- **One row's Replace runs at a time** (`replacing`). While it runs, every row's Replace is disabled, and its own row's Delete.
- **While the list is loading or failed, Upload is disabled** in single-replace mode (`multiple={false}` + `canReplace`) and with `maxFiles`, because until the list answers, no one knows which file Upload would replace or how many are stored. A reload counts as loading: after a send, the next Upload waits for the list's new answer. Files can still be picked. The hook's `upload` sends nothing then, for a feature with its own markup. Multi-file uploads with no `maxFiles` aren't affected: the list's failure doesn't stop them. Neither is `multiple={false}` with neither `canReplace` nor `maxFiles` (ATT-260).
- **A file picked while the list is loading, when the list then fills `maxFiles`:** Upload stays off while stored + selected exceeds `maxFiles`, the `tooMany` message shows for the excess, the last picked, and nothing is sent. The excess stays selected until it's removed, and removing it turns Upload back on (ATT-260). A replacing pick still takes the stored file's place, so it isn't an excess. **A row's Retry obeys the same hold:** while a file is over `maxFiles`, Retry sends nothing either, on any row, until the excess is removed.
- **The picker alone (`showListState`, default true):** when the list failed and Upload is held, the picker shows `listFailed` and a `common.retry` button, because a feature using it with no list would otherwise have Upload off with no reason. `AttachmentManager` passes false, because its list shows them; so does whoever composes both pieces (ATT-284).
- **Upload-replace racing the same file's row Replace or Delete** isn't locked: one user would need two clicks in the same moment, and it ends in a 404 at worst. Accepted.

### Defaults

- `canReplace` alone shows the trigger and Upload with `multiple={false}` and a stored file.
- **A control shows only with the permission and the adapter's call:** `canDelete` needs `adapter.delete`, `canReplace` needs `adapter.replace`, for the row's button and for `renderItem`'s action alike. In single-file mode with no replace call, Upload isn't a replace: `canReplace` alone shows no picker, and with `canUpload` Upload adds the file, which counts toward `maxFiles` (ATT-264).
- A screen showing another record mounts a new component, by `key`: a selection belongs to one record.
- **Download all shows only when `multiple` is true:** with `multiple={false}`, `AttachmentList` doesn't show its button, whatever is stored. The hook's `downloadAll` stays (ATT-269).
- Upload skips failed files: they go only by Retry.
- No success toast for an upload. The file moves to the list, and `announcement` goes to an `aria-live` region.
- A failed preview fetch toasts and closes the dialog.
- Of several files dropped in single mode, the first is kept and the rest get `onlyOne`.

### Selecting and uploading

- **Status flow:** waiting → queued → uploading → gone, failed or cancelled. Failed → queued by Retry. Cancelled → queued by Upload. A file that succeeded leaves the selection.
- **Upload** sends the waiting and cancelled files.
- **During a run:** files picked stay waiting for the next Upload. Retry joins the run.
- **The Upload button** is disabled during a run, or with nothing to send.
- **Remove** works in every state but uploading.
- **Cancel** shows on uploading and queued. A queued file goes back to waiting.
- **The second click of a double click does nothing** on Remove and Cancel (`event.detail > 1`): the next row moves under the pointer, or Remove takes Cancel's place. A key press has a `detail` of 0, so it always acts (ATT-271).
- **Client refusals never enter the selection**, but for a file already selected when the list fills `maxFiles` ("Replacing and counting"). An inline `role="alert"` area in the picker lists each one. The next pick, Upload or Remove clears it (ATT-275); an excess of `maxFiles` stays listed for as long as it's selected. The check order is the server's: empty, size, extension.
- **`multiple={false}`:** a new pick replaces every selected file that isn't uploading. A refused pick keeps the selection as it was.
- **If the rules fail to load, picking is off:** the trigger's button is disabled and a drop is ignored. `rulesFailed` and a `common.retry` button show in the picker, in a `role="alert"`. The list still works. A user whose only control that needs the rules is a row's Replace gets the same alert and Retry, with no trigger and no Upload. With no such control, nothing shows (ATT-216).
- **A repeated result is announced again:** the announcement clears when Upload or Retry starts, not per file, so a Retry failing with the same reason, or a same-named file uploaded again by a later Upload, is heard again (ATT-243). Two same-named files with the same result within one run are heard once: accepted.
- **Progress** is whole percents, 0 to 100.
- **Thumbnails:** a selected image creates its object URL only when its row enters the view (`IntersectionObserver`; at once when there is none).
- **`useAttachments` holds the window `dragover` and `drop` guard** while mounted: both are `preventDefault`ed.

### Actions on a stored file

- **A failure is a toast** through `getErrorMessage`. A 404 also reloads the list (`showsStaleData`, `refreshScope`) and says `errors.notFound`. The same message toasts once, however many rows fail with it, and a row Replace's refusal repeated doesn't stack; a different message gets its own (ATT-279).
- **Download all is disabled while it runs, and a file already downloading isn't started again**, by a second click on its Download or by Download all (ATT-272).
- **A failed reload:** when a reload of a list that already has rows fails, the rows stay and their actions still work, and `listFailed` with its `common.retry` button shows above them. Upload stays off in the modes of "While the list is loading or failed" until Retry succeeds. A first load that fails shows the alert alone (ATT-222, ATT-270).
- **A cancel is silent.** It's detected by the controller's `signal.aborted`, whatever error the adapter throws. Then the list reloads.
- **`getErrorMessage` on a cancel** (`isRequestCancelled`) answers `errors.generic`, never `errors.network`. The components don't show it: this is the safe answer for anyone who asks.
- **A download's or a preview's `mutationFn`** saves or stores the blob itself and returns nothing, so no cache holds a Blob.
- **Delete** toasts `deleted`. The hook's `delete` has no confirmation; the list's button and `actions.delete` add it.
- **Unmount** aborts every controller, with no state change, no toast and no reload.

### Preview

- With `navigator.pdfViewerEnabled` false when the preview opens, a PDF's preview state has kind `none`: no fetch, `noPreview`, the name, the size and Download (ATT-249).
- An image that fails to decode shows the name, the size, `cantShow` and Download.
- Download always shows, for selected files too.
- **The second click of the double click that opened a preview doesn't close it:** it lands on the backdrop (`event.detail > 1`). A single click there still closes it. Delete's confirmation stays as it is: closing it is the safe side (ATT-280).
- **A double click on the preview's Close doesn't reach what's beneath it:** the dialog closes on the first click, and the second, landing on the page, previews or downloads no file (ATT-281).
- With no viewer, the name follows the UI's start, as the size and the note do, with `dir="auto"` on an inner span (ATT-276).
- The dialog renders once per hook. `AttachmentManager` renders it; whoever composes the pieces alone renders `AttachmentPreview` once.

### Screen structure and names

Texts are `attachments.*` unless they name another block. NAME is the file's name.

| Where | What | Accessible name or text |
|---|---|---|
| Picker | Button that opens the file choice | `pick`; with `multiple={false}`, `pickOne` |
| Picker | Hint in the drop area; while dragging over it. Hidden on touch devices (no precise pointer, `pointer: coarse`), where dropping doesn't exist: the button stays (ATT-263) | `dropHint` or `dropHintOne`; `dropNow` |
| Picker | The drop area | `data-testid="attachment-drop-area"` |
| Picker | The hidden `input[type=file]`, with `accept` and `multiple` | `data-testid="attachment-input"` |
| Picker | Refusals, in the `role="alert"` area, each on its own line | `refused`, `tooMany`, `onlyOne`, `folderRefused`; `reason` is `errors.<code>` |
| Picker | Rules failed, in a `role="alert"` | `rulesFailed`, with a `common.retry` button |
| Picker | List failed and Upload held, with `showListState`, in a `role="alert"` | `listFailed`, with a `common.retry` button |
| Picker | The selection, a list | `selectedLabel` |
| Selected row | Name (`dir="auto"`), size; an image's thumbnail, `alt=""`; for any other file, a file icon in the thumbnail's place (ATT-277), and for an image the browser can't decode too, in place of the broken image (ATT-283) | |
| Selected row | Icon buttons | `previewFile`, `removeFile`, `cancelFile`, `retryFile` |
| Selected row | Progress bar, `role="progressbar"` with its percent | `uploadingFile` |
| Selected row | A failed file's reason, shown as text | The translated reason |
| Picker | Upload button | `upload` |
| Picker | The `aria-live="polite"` region | `uploadedFile`, `failedFile` |
| List | The stored files, a list | `storedLabel` |
| List | Download all button, only when `multiple` is true | `downloadAll` |
| List | The hidden `input[type=file]` of a row's Replace | `data-testid="attachment-replace-input"` |
| List | Loading | Progress bar named `common.loading` |
| List | Failed | `listFailed`, with a `common.retry` button: alone on a first load, above the rows on a reload |
| List | No files | `empty` |
| Stored row | Name (`dir="auto"`), `typeLabel`, `formatFileSize`, the date (`useFormatDate`) | |
| Stored row | Icon buttons | `previewFile`, `downloadFile`, `replaceFile`, `deleteFile` |
| Stored row | During its Replace: progress bar and Cancel icon button, both with the row's name | `uploadingFile`, `cancelFile` |
| Confirmation | `useConfirm`, destructive | Title `deleteTitle`, message `deleteMessage`, `common.cancel`, `common.delete` |
| Preview | The dialog, and a PDF's `iframe` `title`, and an image's `alt` | `previewOf` |
| Preview | Close and Download buttons | `common.close`, `download` |
| Preview | Notes | `noPreview`, `cantShow`, `textCut` |

- A long name wraps, with the full name in a tooltip. An icon button has a tooltip with its name. Row icon buttons are 36 px on a phone too, with a small gap between them (ATT-278): the only 44 px rule is the prescription tree.
- **A displayed name has its bidi control characters removed** (U+202A to U+202E, U+2066 to U+2069, U+200E, U+200F, U+061C), in every place it's shown and in messages, because an override can show a false extension. The download name and what's sent stay the original. The isolates a message puts around the name stay (ATT-244, ATT-273).
- **Focus:** a closed preview returns it to the button that opened it. After a delete it moves to the next row's first button; with no next row, to the list (`tabIndex={-1}`). After a row's Replace finishes, it moves to the new row's Replace button; after one is cancelled or fails, the old row stays and focus returns to that row's Replace button (ATT-261). After Remove on a selected row, it moves to the next row's first button; with no next row, to the Choose files button (`pick`, or `pickOne` with `multiple={false}`). After Cancel on a selected row, whose row stays, it moves to that row's first button (ATT-262; this narrows the user's U2 wording). If any other action leaves focus on the body, or on a button it disabled, then in the picker it moves to the Choose files button (Upload, Retry, a focused row finishing), and in the list to the list (a stale row's Preview or Download). A preview closed after the row that opened it has finished also moves focus to the Choose files button. A Retry on a failed first load unmounts its alert and button: for the rules, focus goes to the Choose files button once it's enabled; for the list, to the list; with neither there yet, it follows when they appear. If the Retry fails again, the alert comes back and its Retry takes the focus. Focus the user moved elsewhere stays (ATT-274). With a custom `renderTrigger`, the feature owns the focus that would go to Choose files. **Moving focus never scrolls the page:** Retry and Upload by pointer on a long list keep the scroll position, and a failed row whose reason wraps over two lines doesn't shrink when Retry starts, so the page doesn't move (ATT-282).
- **Accepted:** Enter pressed twice on Upload or Retry opens the file choice, since focus has moved to Choose files; a double click on a row's Delete opens and closes its confirmation, the safe side; a name made only of bidi controls shows empty; a custom slot's buttons are the feature's own, double clicks included; a focus moved by code opens its button's tooltip.

### Sizes and texts

- `formatFileSize` uses `sizeB`, `sizeKb`, `sizeMb`, `sizeGb`. The file's own comment gives the examples.
- Extensions are lower case with their dot, as in part 1.
- `tooMany`'s `{{count, count}}` is `maxFiles`.

### In the tests

- **jsdom's Blob:** jsdom 26.1's `Blob`, which Vitest uses as the global one, has only `slice`. `src/test/setup.ts` adds `text()` and `arrayBuffer()` through `FileReader`, for `File` too. Production code uses the normal Blob methods.
- **`renderManager`** is the component on a plain test client and a `fakeAdapter`, for most `ui` cases.
- **`startManager`** is the same on `attachmentRequests("/test-files")` in the whole app, in `startApp`'s style: fresh modules, the real session store, API client and `AppProviders`. It takes the drugs page's place in the app's routes, on `/drugs`. ATT-225 (the clinic-lost flow), ATT-257 (a 403 reloading `/me`), ATT-239 (refresh and replay) and ATT-224's `ui` half use it.
- **`aDataTransfer`** is a drop's data for jsdom, which has none, with `files`, `folders` and `noEntries`. `splitDropped`'s comment says what it reads. ATT-218 uses it.
- **Multipart in jsdom:** a `File` doesn't survive a multipart body there: the part arrives named `blob`, and `request.formData()` throws. So `testFilesHandlers` only checks that a part named `file` came. Name and bytes are ATT-210's, in the browser.
- **MSW's order:** within one `server.use` call the first handler wins; a later call wins over an earlier one. A test's own `/test-files/:id` answer goes in its own later call.

## 3. The harness page

`ClinicHub.Web/e2e/harness/attachments/`. It only wires the contract's components, so it stays complete after T1. It has its own small providers: theme and RTL emotion cache as `AppProviders`, i18n, a QueryClient, `AppToaster`, and a `<main>` with an `<h1>` ("Attachments harness").

- **Where:** `/__harness/attachments/index.html` on the run's own API, and `/e2e/harness/attachments/index.html` on the main Vite, for the walkthrough. Always with `index.html`: the API's SPA fallback answers the folder URL first, with the app's own page.
- **Build:** `npm run build:harness`, into `ClinicHub.Web/dist-harness/attachments`, base `/__harness/attachments/`. It's never in `ClinicHub.Api/wwwroot` (ATT-255): only the run's copy of the web root holds it.
- **With `CLINICHUB_E2E_NO_BUILD=1`** global setup needs that build already there, as it does for the SPA. CI's build step makes it.

| URL parameter | Means | Default |
|---|---|---|
| `mode` | `memory` or `real` | `memory` |
| `seed` | `samples` or `none`; memory only | `samples` |
| `multiple=0` | `multiple={false}` | Several files |
| `maxFiles=n` | `maxFiles` | None |
| `maxSize=bytes` | The rules' limit; memory only | 20 MB |
| `canUpload=0`, `canReplace=0`, `canDelete=0` | That control is off | All on here |
| `slots=1` | Custom render slots, all five (buttons named `Custom …`, `data-testid` `custom-trigger`, `custom-selected-item`, `custom-item`, `custom-empty`, `custom-preview`) | Off |
| `lang` | `ar` or `en`, stored as the app stores it | The usual detection |

**Memory mode.** Rules: the limit above and the extensions of design § 5.

| Sample ID | Name | Content |
|---|---|---|
| `sample-png` | `scan.png` | A real 64 × 64 PNG |
| `sample-pdf` | `report.pdf` | A one-page PDF |
| `sample-txt` | `notes.txt` | The lines `سطر عربي` and `An English line` |
| `sample-xlsx` | `results.xlsx` | A ZIP signature only |
| `sample-arabic` | A long Arabic name, ending `.png` | The same PNG |

- A file named `fail-*` answers 400 `attachmentTypeNotAllowed` through a real AxiosError.
- A file named `slow-*` reports 5% every 400 ms, about 8 s, until finished or aborted. An abort rejects with axios's cancel error. This holds for a row's Replace too.
- `window.__attachmentsHarness.removeStored(id)` makes a row stale: the row stays, and the next action on it answers 404.
- Files uploaded here get the IDs `file-1`, `file-2`….

**Real mode.** `attachmentRequests("/test-files")` and `GET /test-files/rules` on the real `api` client (`/api/v1/test-files…`), for Playwright's `page.route` to answer. `setAuthHandlers` holds an in-memory token, first `harness-token`. Its refresh is a plain `POST /api/v1/auth/refresh`, taking `accessToken` from the answer. The context key is `clinic:1`, so a 403 `noAccess` refreshes too.

Specs import nothing from the harness. The expected texts are written out in `e2e/support/`.

### How the specs prove it

Measured in headless Chromium with Playwright 1.64.1, with a throwaway script on a routed page.

**ATT-210, capturing an upload.** Real mode.

- Pick with `setInputFiles(input, {name, mimeType, buffer})`, never a path. A file picked that way, or built in the page, has its bytes in `request.postDataBuffer()` inside `page.route` (tried at 11 bytes and 5 MB). A file picked from a path doesn't: only the part's headers are there, in `postDataBuffer()` and in CDP's `Network.getRequestPostData` alike.
- In the route handler, read `request.postDataBuffer()` and `(await request.allHeaders())["content-type"]`, for the first send and for the replay.
- Chromium makes a new boundary on each send of the same `FormData`. So check, for each send, that the body starts with `--` and that send's header boundary. Then check that the two sends have the same part: `filename="…"`, read as UTF-8 (an Arabic name arrives intact), and the bytes from the part's blank line to `\r\n--<boundary>--`, compared as a `Buffer`, because file bytes aren't text.

**ATT-211, a drop.** `dropFiles(locator, files)` from `e2e/support/attachmentsDrop.ts`, on `attachment-drop-area`. It uses the browser's own `DataTransfer`, whose items answer `webkitGetAsEntry()` with null: `splitDropped` counts that as a file.

**ATT-219, a drop outside.** A script's drop never navigates, so staying on the page proves nothing. The test asserts that the window's guard cancelled both events: `dropOutside(page)` answers `{dragover, drop}`, each its event's `defaultPrevented`, and both must be true.

**ATT-223 and ATT-246, a download.** Real mode, with `page.route` answering known bytes. `page.waitForEvent("download")`, then `suggestedFilename()` (an Arabic name arrives intact) and `saveAs` to compare the bytes. Download all gives one event per file.

**ATT-248, a PDF.** Real mode, not memory mode: `memoryAdapter.ts` already types its blob as PDF, so removing `asPdf` would pass there. The route answers a stored `pdf` file's download with `Content-Type: text/html` and a body starting `%PDF-`, so removing `asPdf` fails the test.

- Force the flag before the page loads: `addInitScript(() => Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", {get: () => true}))`.
- Read the iframe's blob in the page: `fetch(iframe.src).then(response => response.blob())` gives its `type` (`application/pdf`) and its first bytes (`%PDF-`). Also check its `title` and that it has no `sandbox`.
- Headless Chromium has no viewer, so with the flag forced the iframe also fires a `download` event, with no console error. The spec ignores that event.

## 4. Work split

Three tracks, each on its own worktree and branch `attachments-components/<track>`. No track needs a database or a server of its own beyond what `./ci.ps1` starts. A rule or contract change goes through the session to every track.

| Track | Owns | Never edits |
|---|---|---|
| **code** | Real bodies of every stub in § 1; the blob interceptor in `src/api/client.ts`; `getErrorMessage` for a cancel; `functions.ts` in `PURE_LOGIC` (`vite.config.ts`), `stryker.config.json` and, for `functions.test.ts`, `vitest.stryker.config.ts`; `docs/features/attachments/tech.md`, `business.md`'s status; both overviews | Tests; `src/test/` |
| **ui-tests** | Every `unit` and `ui` case; extras in `src/test/pages/attachments.tsx`; tests of `isRequestCancelled` and the cancel message in `src/api/errors.test.ts`; moves all 60 rows into `docs/testing/test-catalog.md` and updates its counts and `attachments.test-cases.md` | Production code |
| **e2e-tests** | Every `e2e` case, in `e2e/attachments/`; `e2e/support/` for attachments (texts written out, never imported); `docs/testing/README.md`; the dress rehearsal row for ATT-258 | Production code; the harness page |

**Case assignment.** `unit+ui` is tagged by `ui-tests` in both files. Every case is here once.

| Track | Level | Cases | Count |
|---|---|---|---|
| ui-tests | ui | ATT-200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 212, 213, 215, 216, 217, 218, 220, 221, 222, 225, 227, 228, 229, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 249, 250, 251, 257, 259, 260, 262, 264, 265, 268, 269, 270, 271, 272, 275, 277, 279, 280, 283, 284 | 58 |
| ui-tests | unit | ATT-214, 230, 247, 252, 256, 266, 267 | 7 |
| ui-tests | unit+ui | ATT-224, 273 | 2 |
| ui-tests, e2e-tests | ui+e2e | ATT-261, 274: a real browser moves focus differently (jsdom focuses a disabled button), and component tests missed it | 2 |
| e2e-tests | e2e | ATT-210, 211, 219, 223, 226, 246, 248, 253, 254, 255, 263, 276, 278, 281, 282 | 15 |
| e2e-tests | manual | ATT-258: a catalog row and a dress rehearsal line, no test | 1 |
| | | **Total** | **85** |

T4 added ATT-260 to ATT-270: the user's decisions on the list's state (260), focus (261, 262), the drop hint (263), the adapter's calls (264) and Download all with one file (269), a failed reload (270), and four rules that had tests and no case (265 to 268). T5's acceptance findings added ATT-271 to ATT-284, and corrected Cancel's focus in ATT-262 and ATT-244's names. An e2e case's phone half is proved in `e2e/attachments/phone.spec.ts`.
