# Prescription print templates, step 4 (paper alignment): contract (T0)

Scope: [step 4's design](prescription-templates.step4.md) (A1–A14, P1–P8 and §§ 3–10 approved, not reopened), cases TPL-600…725 and the changed cases of § 7. **No migration, no new table, no new library.** **Out of scope:** triage #6 (the shared app shell), a clinic-side picture screen, anything of attachments' own: nothing under `features/attachments` changes.

This contract **is compiled code**: `dotnet build ClinicHub.sln` has 0 warnings, `npx tsc -b` and `npx eslint src e2e` are clean. Every exported name and signature, route, error code, key, text, accessible name and test id here is final: a track that needs to change one goes through the session (both sides). How the coders split the code behind them (internal hooks, helpers, props) is free. Steps 1–3's contracts stay in force but for what § 4.8 changes.

---

## 1. What stays

Item rules (a box must still fit the sheet without calibration, TPL-705), the save and delete flows, the guard, drag, keys, zoom, click to add, typed fields, the desktop-only switch, box sizes, pagination, the `@page` size and the prescription text's measuring: so the page count doesn't depend on calibration. The clinic read route's code: it already answers the layout, calibration included. The migrations: none. `schemaVersion` stays 1. `AttachmentService`, the upload filter and every part 2 file.

---

## 2. Backend

### 2.1 Done in this commit

| Where | What |
|---|---|
| `Application/…/Templates/PrescriptionTemplateDto.cs` | `PrescriptionCalibrationDto(decimal? XMm, decimal? YMm)`; `PrescriptionLayoutDto(int? SchemaVersion, PrescriptionPageDto Page, List<PrescriptionItemDto> Items, PrescriptionCalibrationDto Calibration)`: **last, no default**, so a field-by-field rebuild can't drop it |
| `SavePrescriptionTemplateCommand`, `From`, the handler | Carry `Calibration`, last parameter |
| `PrescriptionTemplateLimits.MaxCalibrationMm` | 20 |
| `PrescriptionTemplateErrors.CalibrationInvalid` | `templateCalibrationInvalid`, 400, the 11th `template*` code; `errors.templateCalibrationInvalid` in `en.ts` and `ar.ts` |
| `Api/Features/Platform/AdminPaperImageController.cs` | The six routes of § 2.3, real: each only sends its use case |
| `Application/…/Templates/PaperImages/` | `PaperImageOwner.Current` (`AttachmentOwner(AttachmentModules.ClinicPaper, "current")`), and the six use cases of § 2.3 with **stub handlers** (they throw) |
| `Api/appsettings.json` | `Attachments:Modules:clinicPaper:MaxFileSizeMb` 2 → 10; the module exists, `AllowedTypes` stays `png,jpeg` |

### 2.2 To write (T1: `backend`)

- **`PrescriptionLayoutRules.Normalize`:** missing or `null` `Calibration` becomes `(0, 0)`; both numbers through `Round`; `-0` becomes `0` (a `decimal` can hold `-0.0`: `Math.Round(-0.04m, 1)` is one); a null number stays null, for the rules.
- **`PrescriptionLayoutRules.Deserialize`:** missing or `null` `calibration` reads as `(0, 0)`, so answers always hold it and old rows need no data step.
- **The validator**, after 8j, whatever the item count, so outside the `When` over 50 items. Rule 9: `Calibration` present (`Normalize` made it so), X then Y not null: `invalidRequest`, fields `calibration.xMm`, `calibration.yMm`. Rule 10: each number within `-MaxCalibrationMm…MaxCalibrationMm`: `templateCalibrationInvalid`, the same fields. A number that is null gets rule 9 only. Item rules don't look at calibration.
- **The six handlers:** their comments say what each calls. `IAttachmentService` is already behind its interface; no new service.

The JSON key order is the record's: `schemaVersion`, `page`, `items`, `calibration`. A wrong type answers `invalidRequest` by binding (`1e30` overflows `decimal`).

### 2.3 Routes

Under `/api/v1/admin/clinics/{clinicId:int}/prescription-template/paper-image`. `[Authorize(Policy = PlatformAdmin)]`, `[AdminClinic]`. No clinic route.

| Method | Route | Action | Sends | Answer |
|---|---|---|---|---|
| GET | `/rules` | `Rules` | `GetPaperImageRulesQuery` | 200 `AttachmentRulesDto` |
| GET | (none) | `List` | `ListPaperImagesQuery` | 200 `AttachmentDto[]`, newest first |
| POST | (none), `[AttachmentUpload(ClinicPaper)]`, `IFormFile file` | `Upload` | `UploadPaperImageCommand(AttachmentUpload File)` | 200 `AttachmentDto` |
| PUT | `/{id:guid}`, the same | `Replace` | `ReplacePaperImageCommand(Guid Id, AttachmentUpload File)` | 200 `AttachmentDto` |
| GET | `/{id:guid}` | `Open` | `OpenPaperImageQuery(Guid Id)` | 200 the file, `ToFile()` |
| DELETE | `/{id:guid}` | `Delete` | `DeletePaperImageCommand(Guid Id)` | 204 |

Errors: design § 4's table. Folders: `PaperImages/Commands/{UploadPaperImage,ReplacePaperImage,DeletePaperImage}/`, `PaperImages/Queries/{GetPaperImageRules,ListPaperImages,OpenPaperImage}/`, one command or query and its handler in each.

---

## 3. Pure logic (frontend)

### 3.1 Types and constants (done)

`types.ts`: `TemplateCalibration = {xMm: number; yMm: number}`; `PrintLayout` gains `calibration`. `constants.ts`: `MAX_CALIBRATION_MM` 20; `RULER_INSET_MM` 6, `RULER_TICK_EVERY_MM` 1, `RULER_LONG_TICK_EVERY_MM` 5, `RULER_LABEL_EVERY_MM` 10, `RULER_TICK_LENGTH_MM` 1.5, `RULER_LONG_TICK_LENGTH_MM` 3, `RULER_STROKE_MM` 0.2, `RULER_LABEL_SIZE_MM` 2.5; `TEST_PRINT_FRAME_BORDER` `0.2mm solid #000`, `TEST_PRINT_PAGE` 2, `TEST_PRINT_PAGES` 3, `TEST_PRINT_SAMPLE_LINES`; `PAPER_OPACITY_DEFAULT` 50, `PAPER_OPACITY_MIN` 10, `PAPER_OPACITY_MAX` 100, `PAPER_OPACITY_STEP` 10.

### 3.2 `layout.ts` (StrykerJS-mutated; the comments are part of this contract)

| Name | State | Rule | Cases |
|---|---|---|---|
| `newLayout` | done | Holds 0, 0 | TPL-041 |
| `normalizeLayout` | T1 | Fills 0, 0 for a missing or null `calibration`; rounds; `-0` is exactly 0; a null number stays | TPL-605, 608, 721 |
| `sameLayout` | T1 | Compares calibration | TPL-612, 613, 721 |
| `validateLayout` | T1 | Rules 9 and 10 after every item's, also on the early exit over 50 items | TPL-607, 610, 721, 724 |
| `parseMmInput` | T1 | One leading `+` or `−` (U+2212) is a sign, once spaces and marks are gone: `+2` is 2, `−2` is -2. Null: `+`, `−`, `+-2`, `−−2`, `- 2`, `2+`, `2−`. For every field, so `+1` stops being refused (TPL-224, 225) | TPL-700 |
| `calibrationCutsItems(layout) → boolean` | stub | Any box, moved by X and Y, off any side, in whole tenths; at the edge doesn't count | TPL-617 |
| `sharedNameErrors(layout) → LayoutError[]` | stub | Every manual input or function sharing a name, in order, `{field: "items[i].name", code: "templateItemNameTaken"}`; outside `validateLayout` | TPL-683, 722 |

### 3.3 `layoutHistory.ts`

`LayoutChange` gains `{kind: "calibration"}` (done, with `undoStep` and `redoStep`: the selection stays, `refit` false; TPL-702).

### 3.4 `testPrintSample.ts` (**stub**, StrykerJS-mutated)

| Function | Rule | Cases |
|---|---|---|
| `testPrintValues(layout, now)` | A manual input its name; a function `functionValue` at `now` with page 2 of 3, so a page number is `2/3`; a static text as typed; the prescription text `""` | TPL-638, 707 |
| `testPrintChunk(fits)` | The sample lines, one paragraph each, through `cleanPrintHtml` and `paginate`, first chunk only | TPL-637 |
| `rulerTicks(lengthMm, shiftMm) → RulerTick[]` | `{mm, atMm, long, label}` for every whole `mm` ≥ 0 with `atMm` = `mm` + shift in [0, length], by tenths; `long` every 5; `label` `"10"`, `"20"`… (none on 0) | TPL-635, 640, 712 |

The file is mutated, so `tests-backend` also unit-tests `rulerTicks`, tagged `@TPL-640`, beside `tests-ui`'s ui half of that case.

---

## 4. The screen

### 4.1 i18n (done, final)

| Key | en | ar |
|---|---|---|
| `errors.templateCalibrationInvalid` | The correction must be between −20 and +20 mm. | يجب أن يكون التصحيح بين −20 و+20 مم. |
| `printTemplates.calibration.title` | Printer correction | تصحيح الطابعة |
| `printTemplates.calibration.x` | X: + moves right (mm) | X: الموجب يمين (مم) |
| `printTemplates.calibration.y` | Y: + moves down (mm) | Y: الموجب أسفل (مم) |
| `printTemplates.calibration.helper` | For example: if the print landed 2 mm too low, type Y = −2. | مثال: إذا نزلت الطباعة 2 مم عن مكانها فاكتب Y = −2. |
| `printTemplates.calibration.cutWarning` | With this correction, one or more items leave the sheet and their text may be cut. | بهذا التصحيح يخرج عنصر أو أكثر عن الورقة وقد يُقص نصه. |
| `printTemplates.testPrint.button` | Test print | طباعة تجريبية |
| `printTemplates.testPrint.hint` | Print at 100%, without "Fit to page". | اطبع بمقياس 100% دون «ملاءمة للصفحة». |
| `printTemplates.paper.title` | Paper image | صورة الورقة |
| `printTemplates.paper.rules` | {{types}}, up to {{size}}. One image per clinic. | {{types}}، حتى {{size}}، صورة واحدة لكل عيادة. |
| `printTemplates.paper.show` | Show the image | إظهار الصورة |
| `printTemplates.paper.opacity` | Image opacity | شفافية الصورة |
| `printTemplates.paper.loadFailed` | Couldn't show the paper image. | تعذر عرض صورة الورقة. |

The four messages of design § 9, and the helper's sentence, are verbatim. `{{types}}`: `rules.extensions` in order, upper case with no dot, `.jpg` as `JPEG` and repeats gone, joined with ` / `: `PNG / JPEG`. `{{size}}`: part 2's `formatFileSize(rules.maxFileSizeBytes)`.

### 4.2 The toolbar row

Save, then **Test print**, then Delete: `Button variant="outlined"`, named `testPrint.button`, wrapped in `Tooltip describeChild title={testPrint.hint}` so its name stays its text. Never off. `onClick` ignores `event.detail > 1` (a keyboard click's is 0), and `useTestPrint` ignores a call while one runs (TPL-634, 708).

**The press** does what Save does before it sends: `withTypedPageCommitted`, then `validateLayout` plus `sharedNameErrors`. A problem or any `rawInputs`: the same branch as a refused Save (messages, the first problem selected, what isn't shown inline toasted), nothing prints. Otherwise `setDraft(committed)` and `testPrint.print(committed.layout)`. No API request, no toast, no zoom or selection change, no `endRun`; beyond a typed measure's own page step, no undo step. `TemplateDesigner` renders `testPrint.element` once.

`SHOWN_FIELD` gains `calibration\.(xMm|yMm)`. `sharedNameErrors` joins the rules' errors in the designer's shown list and in `firstProblemItem`, never in the parity fixture.

**A refused Save or Test print scrolls its message into view** (`block: "nearest"`, the first `aria-invalid="true"` field of the settings, once rendered; TPL-701).

### 4.3 The settings panel

In order: the sheet's fields (as today); **Printer correction**; the selected item's fields (or `noSelection`); **Paper image**, with a paper adapter.

```
Box component="section" aria-labelledby=<h3> (region, named calibration.title)
├ Typography component="h3"  calibration.title
├ the fields' grid
│ ├ MmField calibration.x    key "calibration.xMm"   value, rawInput, error by that key; dir="ltr" through MmField
│ └ MmField calibration.y    key "calibration.yMm"
├ Alert severity="warning" data-testid="template-cut-warning"   only while calibrationCutsItems(layout); calibration.cutWarning
└ Typography (two lines)     calibration.helper; testPrint.hint
```

### 4.4 Printing

- **`print.test`** (`SheetPrintContent.test`, `PrintRoot` passes it when `job.test`, with `job.test.values` for values): each box's **last** child is `div data-testid="test-print-frame"`, empty, `position: absolute; inset: 0; border: TEST_PRINT_FRAME_BORDER`. The sheet's last child is `TemplatePrintRulers`. Last, so `firstElementChild` stays the value.
- **`print` adds X and Y** to each item's inline `left` and `top`, by whole tenths, in both real and test prints. Designer mode never does. The flow's layout goes through `normalizeLayout`, so a missing calibration can't make `NaNmm` (TPL-605).
- **`TemplatePrintRulers`** (its comment holds the structure): `svg data-testid="test-print-rulers" aria-hidden`, `line data-testid="ruler-line-top|left"` that never move, `line data-ruler="top|left" data-mm="<n>"`, `text data-ruler="top|left" data-mm="<n>"` centered on its tick, past the tick's end.
- **`usePrintJob()`** → `{start(job), element}`, plus `measureChunks(html, layout)` moved beside it. `usePrintPrescription` sits on it and its behaviour doesn't change. **`useTestPrint()`** → `{print(layout), element}`.
- **Never the picture:** `.template-paper-image` is `display: none !important` under `@media print` in `printSheet.css` (Ctrl+P with no job, TPL-710), and `PrintedSheet` never renders it.

### 4.5 The sheet and the picture

```
div data-testid="template-sheet"                        no CSS background now
├ img data-testid="template-paper-image" class="template-paper-image"   only with `paper`; SheetPaper's comment holds its styles
├ div data-testid="template-sheet-grid" aria-hidden     designer only; absolute, inset 0, pointer-events none, the GRID background
└ button data-item-id=…                                 as today
```

`SheetPaper = {url, opacityPercent, onError}`. The section:

```
Box component="section" aria-labelledby=<h3> (region, named paper.title)
├ Typography component="h3"  paper.title
├ AttachmentPicker files canUpload canReplace
├ Typography data-testid="template-paper-rules"         paper.rules, once rules answered; always, with or without a picture
├ Alert severity="error" data-testid="template-paper-load-failed"   paper.loadFailed + Button common.retry (reads the bytes again and reloads the list)
├ AttachmentList files canDelete renderEmpty={() => null}    no canReplace: no Replace icon (P6)
├ with a stored file:
│ ├ Switch checked  role="switch", named paper.show
│ └ Slider min 10 max 100 step 10  named paper.opacity, getAriaValueText `${value}%`; MUI's keys and RTL rules stand
└ AttachmentPreview files                               once
```

`PaperImageScope({adapter, children})` owns the hook, `usePaperImageUrl` and the screen-only state, and gives `children` a `PaperImageView {sheetPaper, section}`. `TemplateWorkspace` mounts it only with `paperAdapter`, so no adapter is no section and no request. `TemplateDesigner({adapter, paperAdapter?})` passes it down. `ClinicPrintTemplateTab` memoizes `adminPaperImageApi(id)` and renders `<TemplateDesigner key={id} …/>`: a new clinic mounts everything anew, part 2's selection and queue included. `adminPaperImageApi(clinicId)` is done (`features/admin/adapters.ts`).

### 4.6 Screen structure at each width

| Window | Columns | Side panel, settings | Area |
|---|---|---|---|
| < 900 px | none | `printTemplates.desktopOnly`; `TemplateWorkspace` not mounted (an upload aborts; widening is a new opening) | none |
| 900–1199 px | `260px minmax(0, 1fr)` | **One shared column:** `div data-testid="template-side-column"`, `display: flex; flex-direction: column; gap`, `overflow-y: auto`, the same measured height as the area, holding the panel then the settings | Its current measured height, Fit from its new width |
| ≥ 1200 px | `200px minmax(0, 1fr) 280px`, as today | `template-side-column` is `display: contents`, so both are grid children again: panel first, settings last | As today |

The columns flip with the language, as today; the area stays `dir="ltr"`. `TemplateSettings`' `gridColumn` goes. A panel drag from the scrolled column keeps its rules: it starts from the entry, `dropCounts` looks at the area, so a drop over settings adds nothing.

### 4.7 The draft

`Draft.openField` becomes `{change: LayoutChange; before: PrintLayout} | null`, and `withFieldCommitted` records `openField.change` (it hard-codes `item` today). `ops.changeCalibration(field: "xMm" | "yMm", text)`: as `changeItemNumber` on key `calibration.<field>`, opening `{kind: "calibration"}`, the selection untouched; `touched` gains the key at once, so out of range shows at once. Blur or Enter commits through `commitField`. `startDraft` is seeded through `normalizeLayout`, baseline too (TPL-612). `messageOf` needs no new branch: `keyOfField` keeps `calibration.xMm`.

### 4.8 What changes from steps 1–3

- **Step 1 § 3.3:** the grid is a child, not the sheet's background. The settings no longer fall below the sheet at 900–1199 px.
- **Step 1 `parseMmInput`:** `+1` is read (TPL-224, 225).
- **Step 3 § 3.6:** `openField` as § 4.7.
- **Step 2 § 3.2:** the print job moves to `usePrintJob`.

### 4.9 Accessible names and test ids

| What | Role and name, or test id |
|---|---|
| Correction section, fields | region `calibration.title`; textbox `calibration.x`, `calibration.y` |
| Cut warning | `template-cut-warning` |
| Test print | button `testPrint.button`; tooltip `testPrint.hint` |
| Paper section | region `paper.title` |
| Rules line, load failure | `template-paper-rules`; `template-paper-load-failed`, its button `common.retry` |
| Part 2's parts | `attachment-input`, `attachment-drop-area`, button `attachments.pickOne`, `attachments.upload`; lists `attachments.selectedLabel`, `attachments.storedLabel`; row buttons `previewFile`, `downloadFile`, `deleteFile` |
| Switch, slider | switch `paper.show`; slider `paper.opacity`, `aria-valuetext` `50%` |
| Picture, grid | `template-paper-image` (empty `alt`, `aria-hidden`); `template-sheet-grid` |
| Shared column | `template-side-column` |
| Test sheet | `print-sheet` as today; `test-print-frame`; `test-print-rulers`, `ruler-line-top`, `ruler-line-left`, `[data-ruler][data-mm]` |

---

## 5. The recheck against part 2 (at `dd69052`)

Part 2's public pieces do what the design says, read in the code:

| Design relies on | At `dd69052` |
|---|---|
| Works in a platform context | Yes: no `useClinic()` in the hook or its components |
| `multiple={false}`, `canReplace` replaces on Upload, newest row | Yes: `sendOne` takes `stored[0]`; a stale id's 404 reloads the list, and Retry then POSTs (TPL-675) |
| `AttachmentList` with no `canReplace`: no Replace icon | Yes |
| Download all hidden with `multiple={false}` (P8) | Yes, merged |
| `renderEmpty` | Yes: it replaces "no files" only with an empty, answered list |
| `canUpload`, `canReplace`, `canDelete`, `canSend` | As the design says |
| `attachmentRequests(base)` routes | The design's five, `rules` is the feature's |

**What moved, for the tests:** in this mode Upload is off while the list is loading, reloading or failed (attachments contract § 2), and files can still be picked. So a test picks, then waits for Upload to be on, also right after an upload: its reload holds it off until the list answers. A failed reload keeps the row and needs the list's Retry before Upload works again.

**Reconciled:** design § 5 has `renderEmpty` draw the rules line, but § 3 and TPL-725's section want the line "always". The section draws the line itself and `renderEmpty` answers null (§ 4.5), so neither "No files yet" nor a missing line can appear.

**Not a problem, noted:** `attachmentRequests.ts`' comment says a single paper image "has no list of IDs" and would write its own calls. Step 4's routes do have IDs, so it uses them unchanged. The comment is part 2's: left alone.

---

## 6. Rules the docs need (T1: coders; `tests-backend` for the catalog)

As design § 7: `prescription-templates.md` D3, § 5, § 7's row 4; `tech.md` and `business.md` Summary, data model, API, validation, printing, and the page-number sentence «ولا يُطبع شيء إذا كانت الروشتة صفحة واحدة» back; both overviews; `tech.md`'s count of `template*` codes, 11. `business.md` takes design § 9 as it stands, so `docMessages.test.ts` can tie the messages to their keys.

---

## 7. Existing tests that change

| Case | Why | File | Track |
|---|---|---|---|
| TPL-002 | Exact stored keys gain `calibration` | `TemplateStorageTests.cs:80,375`, `PrescriptionLayoutRulesTests.cs:195` | `tests-backend` |
| TPL-041 | Exact `newLayout` and PUT body | `layout.test.ts:709`; `TemplateDesigner.save.test.tsx:139` | `tests-backend`; `tests-ui` |
| TPL-029 | Text stands: both-items marking is outside `validateLayout` | Catalog note | `tests-backend` |
| TPL-053 | Asserts settings below the area at 900 | `print-template.spec.ts:425` | `tests-ui` |
| TPL-132, TPL-145 | "Neither prints", an empty one-page number: real prints only | Catalog wording | `tests-backend` |
| TPL-190 | Add "after calibration" | Catalog (manual) | `tests-backend` |
| TPL-224, TPL-225 | `+1` is no longer refused | `layout.test.ts:158`; `TemplateDesigner.save.test.tsx`, `print-template.spec.ts` | `tests-backend`; `tests-ui` |
| TPL-450, TPL-577 | The `calibration` step and its selection | `layoutHistory.test.ts` | `tests-backend` |
| TPL-592; gallery `:65`, `:94` | New sections may push fields out of view: re-measure | `print-template.spec.ts`, `print-template-gallery.spec.ts` | `tests-ui` |
| ERR-030 | 10 `template*` codes become 11 | `ErrorCodeTextsTests.cs:66`, `locales.test.ts:88,105`, catalog row | `tests-backend` |
| **Not in the design:** ATT cases pinning M at 2 MB | P2 moves the base config, which these read | `AttachmentUploadRulesTests.cs:20` (`LimitOfM`, and its files of 3 and 5 MB: 183, 188, 228, 240), `AttachmentKestrelTests.cs:26-27`, catalog line 2659 | `tests-backend`: 10 MB, files above it. `AttachmentServiceHarness`' and the settings tests' 2 MB are their own config: no change |
| **Compile only, done here** | `calibration` is required | `LayoutBuilder`, `TemplateLayouts`, `dragGeometry.test.ts`, `layout.test.ts:39,40`, `layoutHistory.test.ts:27`, `TemplatePageAndCountRulesTests.cs`, `PrescriptionLayoutRulesTests.cs`, `TemplateRuleEdgeTests.cs` | Already compiled; behaviour unchanged |

---

## 8. Test support (done)

### 8.1 `src/test/pages/printTemplate.tsx`

`renderPrintTemplateTab` also answers the six routes: `paperImages` (an array changed in place, returned), `paperRules`, `paperStored`. New: `CALIBRATION_LABEL`, `calibrationSection`, `calibrationField("x"|"y")`, `cutWarning`, `testPrintButton`, `paperSection`, `paperSectionShown`, `paperRulesLine`, `paperImage`, `sheetGrid`, `paperShowSwitch`, `paperOpacitySlider`, `paperLoadFailed`, `paperUploadButton`, `paperRow(name)`, `paperRowButton(name, action)`, `pickPaper(file)`, `paperPath`, `paperUrl`, `renderDesignerWithoutPaper(layout)`. A test with a picture calls part 2's `stubObjectUrls()` first (its `revoked` and `live` prove TPL-674), `fireEvent.error(paperImage()!)` is a picture that won't decode. `installPrint` (`src/test/print.ts`) works for test prints as it stands.

### 8.2 Builders and handlers

`data.ts`: `aPrintLayout` holds `NO_CALIBRATION`; `aLayoutBeforeStep4()` has no `calibration` key; `aPaperImage()`; `PAPER_RULES` (10 MB, `.png`, `.jpg`, `.jpeg`). `msw.ts`: `paperImageHandlers(clinicId, files, {rules, stored})`, the six routes, stateful in `files`; `printTemplateHandlers`' PUT fills 0, 0 as the server does. jsdom can't carry a file's name: a row is `stored()`'s.

### 8.3 Backend

`tests/ClinicHub.IntegrationTests/Admin/PrescriptionTemplates/PaperImageApi.cs`: `Route`, `Rules`, `Item`, `LimitBytes`, `RefId`, `RowBeforeStep4`, `EveryRoute(clinicId, id)` (the six, each as a given client), `UploadPaperAsync`, `PaperImagesAsync`, `PaperRowsAsync` (deleted ones too), `SaveRawLayoutAsync`. `LayoutBuilder.WithCalibration`, `TemplateLayouts.WithCalibration`. Bytes: `FileSamples.Png(size)`, `.Jpeg(size)`, `.Pdf`; the disk: `new AttachmentDisk(App.Factory.AttachmentRoot)`. No new harness.

`tests/fixtures/print-layout-cases.json`: **the row format doesn't change.** A row's `layout` may hold `calibration`, which binds to the DTO and passes `PrintLayoutFixture`'s strict options; `errors` names `calibration.xMm`, `calibration.yMm` after the items' errors. `tests-backend` adds the rows (one over 50 items, TPL-724) and a line in `tests/fixtures/README.md`.

### 8.4 E2E

`e2e/support/print-template.ts`: `PT_TEXTS` gains the texts of § 4.1; `designerOf` gains `sideColumn`, `calibration`, `calibrationX`, `calibrationY`, `cutWarning`, `testPrint`, `paperSection`, `paperRules`, `paperInput`, `paperUpload`, `paperStored`, `paperRow(name)`, `paperImage`, `paperLoadFailed`, `paperShow`, `paperOpacity`, `sheetGrid`; `Layout.calibration?`, `paperApiPath`, `putPaper`, `getPapers`, `expectPaperFillsSheet`, `rulersOn(sheet)`. `e2e/support/paper-files.ts`, real images with no library: `solidPng(w, h, rgb)`, `PAPER_JPEG`, `paperPng`, `widePaperPng`, `paperJpeg`, `corruptPng`, `paperPdf`, `paperWebp`, `pngNamedJpg`. `ApiSession.upload(method, url, file)`.

**PDF, image and path operators:** `e2e/support/print.ts`' `pdfDrawing(bytes)` answers `{images, paths, strokes}` per page, from pdf.js's `getOperatorList`; `pdfWithoutBackground(page)` is `page.pdf` with `printBackground: false` (TPL-639). TPL-636 and TPL-666: `images` 0. TPL-639: `paths` and `strokes` above 0, never the line's exact width. `page.pdf` ends the job, as `printedPdf` does: read the DOM first. Latin ruler numbers come out as whole runs: a number's shift is its run's `xPt` (top) or `yPt` (left) against a print at 0, 0.

---

## 9. Work split

Four tracks, per design § 8. Each: branch `print-templates-step4/<track>`, its own git worktree, from this contract's commit; ports from its block, never :5000 or :5173; never `drags`; a scratch database `drags_print_templates_step4_<track>` only if needed, dropped at the end. All tests run on CI (`./ci.ps1`). Test writers read the docs and this contract, never a coder's diff. Commits plain, no AI attribution.

| Track | Role | Ports | Owns (no file has two owners) |
|---|---|---|---|
| `backend` | coder | 5760–5769 | `ClinicHub.Domain/Prescriptions/**`, `ClinicHub.Application/Features/Prescriptions/Templates/**`, `ClinicHub.Api/Features/Platform/AdminPaperImageController.cs`, `ClinicHub.Api/appsettings.json`; docs: `docs/design/attachments.md` (the `clinicPaper` config example and its note) |
| `frontend` | coder | 5770–5779 | `src/features/printTemplates/**` but tests, `src/features/admin/adapters.ts`, `src/features/admin/components/ClinicPrintTemplateTab.tsx`, `src/i18n/locales/{en,ar}.ts`; the leftovers: the 260 px column (§ 4.6), both-items names (`sharedNameErrors`); docs: `docs/design/prescription-templates.md`, `docs/features/prescription-templates/{tech,business}.md` (the backend parts from § 2 and design § 4; the page-number sentence), `docs/tech/overview.md`, `docs/business/overview.md` |
| `tests-backend` | test writer | 5780–5789 | `tests/ClinicHub.UnitTests/**`, `tests/ClinicHub.IntegrationTests/**`, `tests/fixtures/**`, `tests/stryker-config.json`; `src/features/printTemplates/{layout,layoutHistory,dragGeometry,functions,testPrintSample}.test.ts`, `layout.parity.test.ts`, `src/i18n/locales/{locales,docMessages}.test.ts`, `vite.config.ts` (`PURE_LOGIC`), `stryker.config.json`, `vitest.stryker.config.ts`; **`docs/testing/test-catalog.md`** (every step 4 row, the changed ones, the summary, ERR-030) |
| `tests-ui` | test writer | 5790–5799 | `src/features/printTemplates/components/*.test.tsx`, `src/features/printTemplates/PrintFlow.*.test.tsx`, `src/test/**`, `e2e/admin/print-template*.spec.ts`, `e2e/prescription/**` as a case needs, `e2e/support/{print-template,print,paper-files,api}.ts`, `e2e/ux/**`; the leftover: **the gallery's PNGs missing from CI's merged report**: find why and fix it, owning `.github/workflows/ci.yml` and `playwright.config.ts` for that purpose only |

Coders run `dotnet build ClinicHub.sln` (0 warnings), `npx tsc -b`, `npx eslint src e2e`. `backend` runs the EF pending-changes check: no migration. T2: merge all into the feature branch, `./ci.ps1 -Tier full` in report mode, 3 times. Stryker (T5): `layout.ts`, `layoutHistory.ts`, `testPrintSample.ts`, `PrescriptionLayoutRules.cs`, `SavePrescriptionTemplateCommandValidator.cs`, `UploadPaperImageCommandHandler.cs`. T6's checklist: `business.md`'s sentence, the gallery's PNGs. **Screenshots** for the ready report: TPL-719 attaches Arabic and English shots: the picture at 50%, the warning, the test page's root.

### Cases per test track

**Every one of § 10's 92 cases is assigned below; a case with two levels has one half on each track named, both tagging the same ID.**

**`tests-backend`** (26 cases)
- unit (11): TPL-607, 608, 610, 617, 638, 700, 702, 705, 721, 722, 724.
- api (15): TPL-605, 606, 609, 651, 652, 653, 654, 655, 667, 668, 669, 672, 673, 676, 716.

**`tests-ui`** (73 cases)
- ui (41): TPL-605, 612, 613, 614, 615, 616, 618, 631, 632, 633, 634, 640, 641, 643, 644, 651, 652, 655, 656, 657, 658, 659, 660, 665, 670, 672, 674, 675, 676, 677, 683, 700, 702, 703, 704, 706, 708, 709, 722, 723, 725.
- e2e (32): TPL-600, 601, 602, 620, 621, 630, 635, 636, 637, 639, 650, 661, 662, 664, 666, 671, 680, 681, 682, 686, 701, 707, 710, 711, 712, 713, 714, 715, 717, 718, 719, 720.

**Split between both, each its level's half** (9): TPL-605, 651, 652, 655, 672, 676, 700, 702, 722. So 17 cases only on `tests-backend`, 64 only on `tests-ui`, 9 on both, 2 manual: 17 + 64 + 9 + 2 = 92.

**Manual, never reported as passed:** TPL-687, 688: a catalog row and a dress rehearsal line, no test.

**Changed existing cases:** as § 7's table, each on the track named there.

---

## 10. Decided in the contract

1. **The `PrescriptionCalibrationDto` name;** "a record `(decimal? XMm, decimal? YMm)`" named none. Stored last in the JSON, since the record's last.
2. **A required parameter on the DTO too,** not only the command: the compiler finds every rebuild. Test builders default to 0, 0; three rule tests pass `null`, which reads as 0, 0 from T1 on.
3. **`PaperImages/` under `Templates/`,** `Commands/` and `Queries/` inside, as the template's own. `PaperImageOwner.RefId` is `current`, the design's.
4. **POST and PUT answer 200,** as the test routes do; the design says only "`AttachmentDto`". `attachmentRequests` reads the body, whichever.
5. **TPL-668 and TPL-669's "five routes" are all six:** the design's table has six, and a route left out would be a gap.
6. **Settings order:** sheet, correction, item, picture. The picture last, so a picker growing with a selection never moves the item's fields.
7. **Button order:** Save, Test print, Delete; `describeChild` keeps the button's name its text. **Never off**, also during a Save: it sends nothing, so nothing can clash.
8. **No `endRun` on Test print:** it's no action on the layout, unlike Save.
9. **Rules line:** drawn by the section, `renderEmpty` answers null (§ 5). **`.jpg` and `.jpeg` show once, as `JPEG`,** joined with ` / `.
10. **The load failure's Retry also reloads the list,** so a picture removed elsewhere leaves instead of failing again.
11. **Label wording, not in § 9, from its words:** `X: الموجب يمين (مم)`, `Y: الموجب أسفل (مم)`, `إظهار الصورة`, `شفافية الصورة`, `طباعة تجريبية`. English follows.
12. **Sample lines:** six fixed lines, mixed Arabic and Latin, not translated (P3's "few fixed lines"), so widths are the same in both UI languages.
13. **Rulers:** ticks grow away from the edge, 1.5 and 3 mm; numbers past the tick, centered, 2.5 mm high; **no number on 0** (the corner itself); a tick exists only where it lands on the sheet, so a shift doesn't draw past the end.
14. **`rulerTicks` lives in `testPrintSample.ts`,** so the mutated file holds the counting and the component only draws.
15. **The frame is each box's last child,** so `firstElementChild` stays the value and `printSheets` reads a test page like a real one.
16. **`sharedNameErrors` in `layout.ts`,** pure and mutated, and it feeds `firstProblemItem`: with a shared name, the first problem is the lower item. That's "selects the first problem", now that both are problems.
17. **Scroll after a refusal:** the settings' first `aria-invalid` field, `block: "nearest"`, nothing else moves.
18. **`key={id}` on `TemplateDesigner` in the tab,** the one place that knows the clinic id; `PageBoundary`'s key already does the same, so this only makes it explicit.
19. **`template-side-column` is `display: contents` from 1200 px,** so one element tree holds at both widths and the panel and settings stay mounted across the breakpoint.
20. **Test ids over roles** for the warning, the rules line and the load failure: plain text and `Alert`s that a role can't tell from part 2's.
21. **`tests-backend` owns the TS unit tests,** per design § 8's "unit and api test writer", and so `PURE_LOGIC` and the Stryker configs. It writes every catalog row; `tests-ui` only tags.

## 11. Wording

Design § 9 is verbatim. New labels: § 10.11, for the user's eye at the walkthrough. One to look at: § 9 says «شفافية» from 10% to 100%, and the slider's 100% is a solid picture (A11, TPL-713), where «شفافية 100%» can read as fully see-through. Kept as approved.
