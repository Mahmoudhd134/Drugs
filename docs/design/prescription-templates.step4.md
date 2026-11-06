# Prescription print templates, step 4: paper alignment

Status: **approved by the user on 2026-11-06** (T0). Nothing is built. Builds on the [design](prescription-templates.md), steps 1–3 on `main`
([tech](../features/prescription-templates/tech.md)) and [attachments](attachments.md). **The build starts after attachments part 1 and part 2 are merged**
(user, 2026-11-06): step 4's upload screen uses part 2's components. This draft was checked against part 2's branch `claude/attachments-components-1bc9f3` at `733a57e`, still in T4; the sub session rechecks it against what lands on `main`.

## 1. Goal

The super admin lines a clinic's template up with its real pre-printed paper: places boxes over a picture of the paper, prints a test page, reads how far off the
printer is, and types a correction that applies to every print.

**Done when:** the super admin uploads a picture of the paper, sees it behind the boxes at 50%, changes its opacity and hides it; presses Test print and gets one page with every
box outlined and mm rulers, without the picture; types X = 2, Y = −1.5 and saves; a real prescription then prints with every item exactly 2 mm right and 1.5 mm up of its designed place,
in Arabic and English; the designer's numbers haven't changed; a staff member never sees the picture.

**Not provable on CI:** that the paper itself lines up. The PDF's positions are proved; real paper, a real printer and the real print dialog stay manual cases for the dress rehearsal.

## 2. Decisions (user, 2026-11-06)

| # | Decision |
|---|---|
| A1 | **The picture is stored through attachments** (module `clinicPaper`), not in its own table. Replaces D3's table and the `AddPrescriptionTemplateGuides` migration |
| A2 | **The upload screen uses attachments part 2's components**, so the build waits for part 2 |
| A3 | **Calibration:** X (left/right) and Y (up/down) in mm, one pair per clinic, saved with the template. Super admin only |
| A4 | **What moves:** all boxes together, on real prints and test prints only. The designer's positions don't change |
| A5 | **Limits:** −20 to +20 mm, 0.1 mm steps, default 0 |
| A6 | **A box pushed off the paper:** Save still works, with a warning that its text may be cut |
| A7 | **Test print:** a button in the designer, super admin only: one page, every box outlined with sample text, the values on screen even if not saved, saves nothing |
| A8 | **Test print's rulers:** mm rulers along the top and left edges |
| A9 | **Test print** applies calibration, doesn't print the picture, shows the same "print at 100%" hint |
| A10 | **The picture:** one per clinic, PNG or JPEG, up to 10 MB (P2), stretched to fill the whole sheet, behind the boxes and grid |
| A11 | **Show/hide and opacity:** default shown at 50%, screen only, never saved |
| A12 | **Upload, replace, remove apply at once**, need no Save, and undo and the unsaved-changes warning don't cover them. A removed picture is only marked deleted (attachments A8) |
| A13 | **Only the super admin sees the picture**, in the designer. It never prints |
| A14 | **If the picture fails to load:** a short message, and the designer keeps working on the blank sheet |

**Proposed in this draft and approved by the user on 2026-11-06:**

| # | Proposal | Why |
|---|---|---|
| P1 | **Deleting the template keeps the picture.** It belongs to the clinic's paper, not to a layout; it shows again when a new template is created. Calibration goes with the template | The printed paper hasn't changed, and uploading again would be busywork |
| P2 | **The size limit is 10 MB:** `Attachments:Modules:clinicPaper:MaxFileSizeMb` goes from 2 to 10 in `appsettings.json` | 2 MB was set for the database. On disk that reason is gone, and a phone photo is often 3–8 MB |
| P3 | **Test print's sample values:** a manual input prints its name; a function its real value now, the page number `2/3`; static text as typed; prescription text a few fixed lines | Real-looking widths show whether a value fits its box |
| P4 | **Rulers sit 6 mm in from the edges.** The top ruler's ticks move with X and the left ruler's with Y, and each line stays 6 mm in | Printers can't print at the very edge, so rulers at 0 would be lost. A ruler moved across its own axis could leave the paper (Y = −6 and beyond) |
| P5 | **Undo covers calibration**, and it counts as unsaved, like any layout change | It's part of the layout |
| P6 | **One way to upload and replace:** pick a file, see it, press Upload. The row has no Replace icon | The rule the user set for single-file replace in part 2. A refused file stays with its reason and Retry; a row's Replace only toasts |
| P7 | **The row keeps part 2's Preview and Download.** The section also shows type, size and date | They come free with the default row, and a custom row would be more code to test |
| P8 | **Part 2 hides "Download all" with `multiple={false}`**, a small change on its own branch while it's in T4 | The list shows it whenever a file exists and no prop turns it off; on a single picture it repeats the row's Download |

## 3. Behaviour

**Calibration.** A "Printer correction" section in the settings, above the selected item's fields: two `MmField`s, X and Y, `dir="ltr"` in both languages. +X moves right and +Y moves down on the paper, whatever
the language. Editing works as an item's numbers do: applied on each change, one undo step per commit, typed text that isn't a number keeps the last value with `numberRequired`. `+2` and the `−` character (U+2212, as the helper line prints it) are read as signs: `parseMmInput` refuses both today. Out of range shows
`templateCalibrationInvalid` at once on the field, with no toast, and Save refuses it. A helper line says what to type: if the print landed 2 mm too low, Y = −2. The section stays in view at 1280 × 800 when Save refuses an item: its message is scrolled to.

**The cut warning.** Shown under the fields while any box, moved by X and Y, leaves the sheet on any side (compared in whole tenths; exactly at the edge doesn't count). It's a warning only: Save and printing still work.
Item rules don't change: the box itself must still fit the sheet without calibration.

**What prints.** `TemplateSheet`'s print mode moves each item by X and Y with an inline `transform` (T4: through `left` and `top` the PDF's text lands on whole CSS px, missing 0.1 mm). Nothing else changes: box sizes, pagination, the `@page` size and the prescription text's measuring stay the same, so the page count
doesn't depend on calibration. The sheet's `overflow: hidden` cuts what leaves the paper, so it can't make a new page. It applies to staff's prints too: the clinic read route already answers the layout, calibration included.

**Test print.** A button beside Save, with the 100% hint as its tooltip (the hint is also in the calibration section's helper line). The press does what Save does before it sends: a measure still being typed commits first; any raw text
or rule error shows its messages, selects the first problem, and nothing prints. A calibration out of range is such an error. Otherwise it prints through the same print root, with the draft as it is: no API request is sent, the screen stays as dirty or clean as it was, no toast, and beyond a typed measure's own commit (a page step that re-fits) no undo step and no zoom or selection change. One page always, also when pressed again with a job left behind (the job is replaced, as any print's).

| On the page | What it is |
|---|---|
| Each box | An empty child with `position: absolute; inset: 0; border: 0.2mm solid #000` (a real border: browsers skip backgrounds and may skip shadows unless "Background graphics" is on; a border on the box itself would move its text 0.2 mm and wrap it differently from a real print), with the sample value of P3 |
| Prescription text | The fixed sample, through `paginate`, first sheet only |
| Rulers | An inline SVG: a line 6 mm in from the top edge and one 6 mm in from the left, across the whole sheet, ticks every 1 mm, longer every 5, Latin numbers every 10, counted from the sheet's corner. The top ruler's ticks shift by X and the left's by Y (P4) |
| The picture | Never. The print rules hide it under Ctrl+P too, when no job exists |

**The picture.** A "Paper image" section in the settings, always with part 2's picker (choose or drop one file, then Upload) and a line naming the rules (from `rules()`). With a picture, also its row (name, type, size, date, Preview, Download, Remove), a show/hide switch and an opacity slider from 10% to 100% in steps of 10. Picking again and pressing Upload replaces it (P6). Shown in the sheet at `left: 0; top: 0; width: 100%; height: 100%; object-fit: fill`, `pointer-events: none`, `draggable={false}`, empty `alt` and `aria-hidden`. **The grid moves** from the sheet's CSS background to its own absolute, `pointer-events: none` child after the `<img>`, because a child paints above its parent's background and the grid would vanish at 100%. A new sheet size re-stretches it. It's fetched as a blob once per opening of the designer and after an upload; never cached by the query cache, and its object URL is revoked on replace, removal and unmount. Show/hide and opacity reset each opening; widening from below 900 px counts as an opening, since `TemplateWorkspace` mounts only then. With two live rows from a race, the newest shows, and removing it brings the older back (accepted).

| Case | What happens |
|---|---|
| Upload or replace refused (type, size, empty) | Refused in the browser: part 2's alert in the picker. Refused by the server: the file stays selected with its reason and Retry. The old picture stays either way |
| Remove | Part 2's confirm, then gone at once |
| Picture won't load or decode | `printTemplates.paper.loadFailed` with Retry; the blank sheet works; print is unaffected |
| Upload, replace or remove while the layout is unsaved | Applies at once; Save stays on, and undo can't bring a picture back |
| A clinic with no saved template | Upload works once the draft exists (after «إنشاء قالب»): the picture doesn't need a template row |
| The window below 900 px | The designer's `desktopOnly` message; an upload in flight aborts with its component |
| Clinic switch or leaving the page | Part 2 aborts the upload and stops the queue; nothing of clinic A shows under clinic B |

## 4. Data and API

**No migration.** The picture lives in `Attachments` (part 1); calibration lives in the layout's JSON. D3's table and `AddPrescriptionTemplateGuides` are retired.

```jsonc
{ "schemaVersion": 1, "page": { … }, "items": [ … ], "calibration": { "xMm": 2, "yMm": -1.5 } }
```

`schemaVersion` stays 1: the field is an addition. **Missing or `null` `calibration`** (every row saved so far) reads as 0, 0, filled in `PrescriptionLayoutRules.Deserialize`, so answers always hold it and old rows need no data step. `PrescriptionLayoutDto` gains `Calibration` as its last parameter, typed `(decimal? XMm, decimal? YMm)`; **`SavePrescriptionTemplateCommand`, `From` and the handler gain it too**, since they rebuild the DTO field by field and a defaulted parameter would silently drop it. `Normalize` rounds both numbers (`−0` becomes 0). A Save from a tab opened before this deploy sends no calibration and resets it to 0: last write wins, accepted with one super admin.

| New rule, after 8j | Rule | Code | `field` |
|---|---|---|---|
| 9 | `calibration` present: X, then Y, not null | `invalidRequest` | `calibration.xMm`, `calibration.yMm` |
| 10 | Each number, after rounding, within −20 to 20 | `templateCalibrationInvalid` | the same |

Both run whatever the item count. `validateLayout` holds the same rules, also on its early exit over 50 items, and `print-layout-cases.json` gains the rows, one of them over 50 items. `PrescriptionTemplateLimits` and `constants.ts` gain `MaxCalibrationMm`. A wrong type answers `invalidRequest`, as any number does.

**The picture's routes**, `Api/Features/Platform/AdminPaperImageController`, `PlatformAdmin` + `[AdminClinic]`, so no clinic id reaches the use cases (D5). Owner: `AttachmentOwner(AttachmentModules.ClinicPaper, "current")`: one per clinic, and the clinic filter separates clinics.

| Method | Route under `/admin/clinics/{clinicId}/prescription-template/paper-image` | Answer | Errors |
|---|---|---|---|
| GET | `/rules` | `AttachmentRulesDto` | 401, 403 `forbidden`, 404 |
| GET | (none) | `AttachmentDto[]`, newest first, normally one row | 401, 403, 404 |
| POST | (none), `[AttachmentUpload(ClinicPaper)]`, one file | `AttachmentDto`: adds, or replaces the current one | 400 `attachmentEmpty`, `attachmentTooLarge`, `attachmentTypeNotAllowed`, `nameInvalid`, `nameTooLong`, `invalidRequest` (a body that isn't multipart, two files); 401, 403, 404 |
| PUT | `/{id:guid}`, the same upload | `AttachmentDto`: replaces that picture | The same, and 404 when it's gone |
| GET | `/{id:guid}` | The file, by `ToFile()` | 401, 403, 404 |
| DELETE | `/{id:guid}` | 204 | 401, 403, 404 |

These are the routes `attachmentRequests(base)` calls, so the feature writes only `rules`. POST lists first, then calls `ReplaceAsync` or `AddAsync`, which keeps "one per clinic" when a stale screen thinks there's no picture. Two uploads in one instant can leave two live rows, accepted as in attachments § 6; the screen shows the newest.
**No clinic route:** staff have no way to reach the picture.

## 5. Frontend

- `types.ts`: `PrintLayout` gains `calibration: {xMm, yMm}`. `normalizeLayout` fills 0, 0, and the draft and baseline are seeded through it, so opening an old template isn't dirty. `sameLayout` compares it.
- `layout.ts`: `calibrationCutsItems(layout)`, pure, mutated. `newLayout` holds 0, 0.
- `layoutHistory.ts`: a new step kind `calibration`: selection stays, no re-fit. `useDesignerDraft.ts`: a `changeCalibration` op, and `openField` carries its `LayoutChange` instead of an item id, since `withFieldCommitted` hard-codes `{kind: "item"}`.
- `components/TemplateSheet.tsx`: `print` adds calibration; a `paper` prop renders the picture in designer mode only; `print.test` draws the frames and the rulers; the grid becomes a child (§ 3).
- `components/TemplatePrintRulers.tsx`, `testPrintSample.ts` (pure, mutated): the rulers; the sample values and chunk.
- **`usePrintJob()`**, extracted from `usePrintPrescription` (`measureChunks`, the job, `afterprint`, the root): `usePrintPrescription` calls `useClinic()`, which throws in a platform context, so `useTestPrint` sits on the extraction, not on it. `TemplateDesigner` renders its element: that page has no print root today. `PrintJob` gains `test?: {values}`, because `PrintRoot` computes values with `pages = chunks.length`, and a one-sheet page number is `""`.
- `TemplateDesigner`'s `SHOWN_FIELD` gains `calibration.*`, so Save and Test print don't also toast what shows inline. The name message (§ 6) is added outside `validateLayout`, whose answer the parity fixture fixes.
- `components/TemplatePaperImage.tsx`: the section, composed of part 2's `AttachmentPicker` (`canUpload`, `canReplace`), `AttachmentList` (`canDelete`, `renderEmpty` for the rules line, no "No files yet") and `AttachmentPreview`, on one `useAttachments({adapter, multiple: false, canReplace: true})`. Not `AttachmentManager`: it keeps the hook inside, and the sheet needs the stored file.
- `usePaperImageUrl(adapter, file)`: part 2 gives an object URL only to its preview dialog, so this hook calls `adapter.download(file.id, signal)` for the newest row (`files[0]`) and owns the URL (§ 3). A new id fetches again; it aborts and revokes on change and unmount.
- The designer's picture code mounts with `key={clinicId}`: part 2 ends its selection and queue only on unmount, and a new adapter alone wouldn't clear them.
- `adminPaperImageApi(clinicId)` in `features/admin/adapters.ts`: `attachmentRequests(base)` plus `rules`, `scope` (with the clinic id) and `container` (the clinic's details). Part 2's hook uses no `useClinic()`, so it works in this platform context.
- `TemplateDesigner` takes the adapter as an optional prop: no adapter, no section, ready for a later clinic-side screen.
- i18n: `printTemplates.calibration.*`, `printTemplates.testPrint.*`, `printTemplates.paper.*`, `errors.templateCalibrationInvalid`.

## 6. The leftovers placed here

| From | What | Change |
|---|---|---|
| Triage #4 | From 900 to 1199 px the settings fall below the sheet, so numbers and sheet aren't visible together. Step 4 adds more settings | At that width the side panel and the settings share one 260 px column with its own scroll, beside the sheet; from 1200 px, three columns as today |
| Triage #16 | A duplicate name marks the other, untouched item on Save | The message shows on **both** items with that name. The server's answer doesn't change |
| Triage #17 | `business.md` lost «ولا يُطبع شيء إذا كانت الروشتة صفحة واحدة» | Restored on the page-number row |
| Step 3's report | The e2e gallery's PNGs don't reach CI's merged report, so ready reports have no screenshots | Find why and fix it; T6 needs the gallery |
| Triage #6 | 298 px of header, title and tabs above the sheet at 1280 × 720, so Fit is 33% | **Not in step 4 (user, 2026-11-06):** it's the shared app shell, and a fix touches every clinic tab |

Step 3's manual cases (Windows Alt, a real second monitor) stay in the dress rehearsal.

## 7. Docs to amend (by the sub session)

`prescription-templates.md`: D3, § 5 and § 7's row 4. `docs/features/prescription-templates/{tech,business}.md`: Summary, data model, API, validation, printing, the page-number sentence. Both overviews. `DEPLOY.md` needs nothing new beyond attachments'. The 11th `template*` code joins `ErrorCodeTextsTests`, `locales.test.ts` and `tech.md`'s count; `locales/docMessages.test.ts` ties § 9's messages to their keys.

## 8. Split

Size: about 1 day, no migration. Tracks: backend coder (calibration rules, picture routes); frontend coder; unit and api test writer; component and e2e test writer. The contract is compiled and committed before T1 by the sub session, from `main` once part 2 is in.
Acceptance agent: Arabic and English; desktop only, except a staff print on a phone. Mutation: `layout.ts`, `layoutHistory.ts`, `testPrintSample.ts`, `PrescriptionLayoutRules.cs`, the validator, the upload handler.

## 9. القواعد التشغيلية (لمحاذاة الورق)

- **صورة الورقة:** يرفع مدير المنصة صورة أو مسحًا ضوئيًا لورقة العيادة، PNG أو JPEG، حتى 10 ميجابايت، صورة واحدة لكل عيادة. تظهر خلف العناصر وتملأ الورقة كلها. إذا اختلفت أبعادها عن الورقة ظهرت ممطوطة، وهذا يدل على عدم تطابقهما.
- يمكن إخفاؤها وتغيير شفافيتها من 10% إلى 100%. تبدأ ظاهرة بشفافية 50% كل مرة تُفتح فيها الصفحة، ولا يُحفظ هذا الاختيار.
- للرفع أو الاستبدال يختار الملف أو يسحبه فيراه، ثم يضغط «رفع». ويمكنه معاينة الصورة الحالية أو تنزيلها.
- الرفع والاستبدال والحذف تُنفَّذ فورًا دون «حفظ»، ولا يشملها التراجع ولا تحذير التغييرات غير المحفوظة. الصورة المحذوفة تبقى على الخادم غير متاحة.
- **لا تُطبع الصورة أبدًا**، ولا يراها إلا مدير المنصة. إذا تعذر عرضها تظهر رسالة، ويستمر العمل على ورقة بيضاء.
- حذف القالب لا يحذف الصورة، وتظهر من جديد عند إنشاء قالب جديد. أما تصحيح الطابعة فيُحذف مع القالب.
- **تصحيح الطابعة:** قيمتان بالمليمتر لكل عيادة، X لليمين واليسار (الموجب يمين) وY لأعلى وأسفل (الموجب أسفل)، بأي لغة كانت الواجهة. من −20 إلى +20، بخطوة 0.1، والافتراضي 0. مثال: إذا نزلت الطباعة 2 مم عن مكانها فاكتب Y = −2.
- يحرّك التصحيح كل العناصر معًا عند الطباعة الفعلية والطباعة التجريبية فقط، ولا تتغير الأرقام في المصمم. يُحفظ مع القالب بزر «حفظ»، ويشمله التراجع وتحذير التغييرات غير المحفوظة.
- إذا دفع التصحيح عنصرًا خارج الورقة يظهر تحذير بأن نصه قد يُقص، ويبقى الحفظ والطباعة متاحين.
- **الطباعة التجريبية:** زر في المصمم لمدير المنصة فقط. تطبع صفحة واحدة بالقيم الظاهرة على الشاشة ولو لم تُحفظ، ولا تحفظ شيئًا. كل عنصر محاط بإطار وفيه نص تجريبي، مع مسطرتين بالمليمتر قرب الحافتين العلوية واليسرى. يُطبَّق التصحيح، ولا تُطبع الصورة. إذا كان في المصمم خطأ تظهر رسائله ولا يُطبع شيء.

| الموقف | الرسالة |
|---|---|
| قيمة تصحيح خارج الحدود | يجب أن يكون التصحيح بين −20 و+20 مم. |
| عنصر يخرج عن الورقة بالتصحيح | بهذا التصحيح يخرج عنصر أو أكثر عن الورقة وقد يُقص نصه. |
| تعذر عرض الصورة | تعذر عرض صورة الورقة. |
| تلميح الطباعة التجريبية | اطبع بمقياس 100% دون «ملاءمة للصفحة». |

## 10. Test cases

IDs continue from TPL-596. Levels: unit, api, ui, e2e, manual. **Source** is this doc's section or decision.

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-600 | Given a saved template with X = 2, Y = −1.5, when a staff member prints in Arabic and in English, then every item in the PDF sits 2 mm right and 1.5 mm up of its designed place, within 0.1 mm, the same in both languages | P0 | e2e | A4, § 3 |
| TPL-601 | Given that template, then the designer's item numbers and boxes are unchanged | P0 | e2e | A4 |
| TPL-602 | Given calibration, then the PDF's page size and the page count of a 40-drug prescription equal those with 0, 0 | P0 | e2e | § 3 |
| TPL-605 | Given a raw row saved before this step (no `calibration`), when read by either route, then 0, 0 is answered; the designer and a print show no `NaNmm` | P0 | api, ui | § 4 |
| TPL-606 | Given a PUT with no `calibration` or `null`, then it saves as 0, 0 (an older tab's Save resets it: accepted) | P1 | api | § 4 |
| TPL-607 | Given −20, 20, −20.04 and 20.04, then they save (the last two as ∓20.0); −20.05 and 20.05 answer `templateCalibrationInvalid` naming the field | P0 | unit | A5 |
| TPL-608 | Given 2.345, then 2.3 is stored; given −0.04, then 0 | P1 | unit | § 4 |
| TPL-609 | Given `calibration` with a null or missing number, then `invalidRequest` names it; a string that isn't a number, `5`, `[]`, `{}` or 1e30 answers `invalidRequest`; an extra property is dropped | P1 | api | § 4 |
| TPL-610 | Given the shared fixture's rows, then server and client agree on every calibration case | P0 | unit | § 4 |
| TPL-612 | Given an old template opened, then Save is off and leaving asks nothing | P0 | ui | § 5 |
| TPL-613 | Given X changed, then Save turns on, leaving asks, undo restores the value, and Save off again; saved and reloaded, the field shows it | P0 | ui | P5, § 9 |
| TPL-614 | Given X typed with Arabic digits, a comma or a leading minus, then it's read; `abc` shows `numberRequired` and Save refuses | P1 | ui | § 3 |
| TPL-615 | Given X = 21, then the message shows at once, Save and Test print refuse | P0 | ui | A5 |
| TPL-616 | Given the fields in Arabic, then they're `dir="ltr"` | P1 | ui | § 3 |
| TPL-617 | Given a box 1 mm from the right edge and X = 2, then the cut warning shows; X = 1 exactly: no warning; X = 0: none; the same on all four sides, in whole tenths (a sum like 210.1 doesn't misfire) | P0 | unit | A6 |
| TPL-618 | Given the warning, when Save and when printing, then both still work | P0 | ui | A6 |
| TPL-620 | Given a box pushed off the paper, when printed, then the sheet still clips (`overflow`) and the PDF has no extra page | P1 | e2e | § 3 |
| TPL-621 | Given the template deleted and created again, then calibration is 0, 0 and the picture shows | P1 | e2e | P1 |
| TPL-630 | Given Test print on an unsaved draft, then the print holds the draft's values, no API request is sent, Save stays on | P0 | e2e | A7 |
| TPL-631 | Given Test print with nothing unsaved, then Save stays off | P1 | ui | A7 |
| TPL-632 | Given a rule error or raw text, when Test print, then the messages show, the first problem is selected, nothing prints | P0 | ui | § 3 |
| TPL-633 | Given a sheet width being typed, when Test print, then it commits first and prints the new size | P1 | ui | § 3 |
| TPL-634 | Given a double click, then one print | P1 | ui | § 5 |
| TPL-635 | Given calibration, then the test page's boxes shift by X and Y, the top ruler's ticks by X and the left's by Y, in the PDF, also when designed at 200% zoom | P0 | e2e | A9, P4 |
| TPL-636 | Given a picture shown, then the print root holds no `img` and the test PDF has no image operations (`getOperatorList`) | P0 | e2e | A9 |
| TPL-637 | Given 50 boxes and a 20 mm prescription box at 36 pt, then the test PDF is exactly one page | P0 | e2e | A7 |
| TPL-638 | Given each kind, then the sample is its name, the real value now, `2/3` for the page number, the text as typed, and the fixed lines | P1 | unit | P3 |
| TPL-639 | Given the test page with `printBackground: false`, then frames and ruler lines are drawn: a computed border and path operations in the PDF, without asserting exactly 0.2 mm | P0 | e2e | § 3 |
| TPL-640 | Given the rulers on A4 and a custom 50 × 50, then ticks run to the sheet's end, numbered every 10 from the corner, in Latin digits in Arabic too | P1 | ui | P4 |
| TPL-641 | Given Test print, then the tooltip shows the 100% hint, in both languages | P2 | ui | A9 |
| TPL-643 | Given Test print with nothing being typed and no errors, then after it no undo step and no toast exist, and the zoom and selection are unchanged | P1 | ui | A7, § 3 |
| TPL-644 | Given `TemplateDesigner` with no paper adapter, then no picture section and no request for it | P1 | ui | § 5 |
| TPL-650 | Given a PNG, when picked and Upload is pressed, then it shows behind the boxes, filling the sheet, at 50%, with no Save; its name shows; the `img` has empty `alt` and `aria-hidden` | P0 | e2e | A10 |
| TPL-651 | Given a JPEG, then it's accepted and listed, and the section shows it | P1 | api, ui | A10 |
| TPL-652 | Given a PDF, a WebP or a PNG named `.jpg`, then refused; on screen the translated message shows and the old picture stays | P0 | api, ui | A10 |
| TPL-653 | Given a file at the limit, then accepted; one byte over, `attachmentTooLarge` | P1 | api | A10 |
| TPL-654 | Given a POST while a picture exists, or a PUT on its id, then it replaces: one row listed, the old row marked deleted, its file still on disk | P0 | api | A12 |
| TPL-655 | Given Remove and its confirm, then the picture is gone at once, the row is marked and the file stays; a second delete is 404; Cancel keeps it | P0 | api, ui | A12 |
| TPL-656 | Given unsaved layout changes, when uploading or removing, then the layout's changes stay, Save stays on, undo doesn't touch the picture | P0 | ui | A12 |
| TPL-657 | Given only a picture change, then Save stays off and leaving asks nothing | P0 | ui | A12 |
| TPL-658 | Given the switch off, then the picture is hidden with no new request; on again, it shows | P1 | ui | A11 |
| TPL-659 | Given opacity changed and the page reopened, then 50% and shown | P1 | ui | A11 |
| TPL-660 | Given the slider, then keyboard arrows step 10 within 10–100 and it has a name; RTL doesn't reverse the meaning of more | P2 | ui | A11 |
| TPL-661 | Given a press where the picture shows, then the sheet's press rules hold: an item below it still takes the press, the picture can't be dragged | P0 | e2e | § 3 |
| TPL-662 | Given the page size changed, or a picture of other proportions, then it stretches to fill the sheet exactly | P1 | e2e | A10 |
| TPL-664 | Given zoom at 25%, 100%, 200%, then the picture matches the sheet exactly | P1 | e2e | A10 |
| TPL-665 | Given a failed read or an `img` `error` event, then the message and Retry show, the sheet works, printing is unaffected, and Retry shows it after recovery | P0 | ui | A14 |
| TPL-666 | Given a real print with a picture, then the PDF has no image operations, and a staff member's page makes no `paper-image` request ever | P0 | e2e | A13 |
| TPL-667 | Given clinic A's picture ID on clinic B's route, for read, delete and content, then 404 | P0 | api | A13 |
| TPL-668 | Given a staff token, a clinic owner's token and no token, then 403, 403 and 401 on all six routes | P0 | api | A13 |
| TPL-669 | Given a missing, deleted or template clinic, then 404 on all six routes; a suspended clinic is managed | P1 | api | A13 |
| TPL-670 | Given a clinic with no picture, then the list is empty and the section shows the rules, with no "No files yet" line | P1 | ui | § 3 |
| TPL-671 | Given a draft with no saved template, then upload works and the picture stays after the draft is abandoned | P1 | e2e | § 3 |
| TPL-672 | Given the template deleted, then the picture's row stays; the empty state shows no picture section | P1 | api, ui | P1 |
| TPL-673 | Given a new clinic from the template clinic, then it has no picture | P2 | api | attachments § 6 |
| TPL-674 | Given clinic A's picture open, when switching to clinic B, then A's picture never shows, its URL is revoked, as on replace and removal, and an upload in flight aborts | P0 | ui | § 3 |
| TPL-675 | Given a picture removed in another window, then Remove here gets a 404 that reloads the list and says so; Upload here fails the same way with Retry on the file, and Retry adds a new picture | P1 | ui | § 4 |
| TPL-676 | Given two live rows from a race, then the API answers newest first and the screen shows the newest; removing it brings the older back | P2 | api, ui | § 4 |
| TPL-677 | Given below 900 px, then `desktopOnly` shows and an upload in flight aborts; widening keeps the draft and shows the picture again at 50% | P1 | ui | § 3 |
| TPL-680 | Given 900–1199 px, then panel and settings share a column beside the sheet, each reachable by scroll, and numbers and sheet are visible together | P1 | e2e | § 6 |
| TPL-681 | Given 1200 px and up, then three columns as today | P1 | e2e | § 6 |
| TPL-682 | Given Fit at 1000 px, then it's computed from the new layout and pressing it twice gives the same zoom | P1 | e2e | § 6 |
| TPL-683 | Given two items with one name, when Save, then both show `templateItemNameTaken`, and fixing either clears both | P1 | ui | § 6 |
| TPL-686 | Given Arabic, then all new labels, messages and hints show translated, with no cut text and no axe failure on the designer | P0 | e2e | § 9 |
| TPL-687 | Given real paper and a real printer, when a test print is measured and corrected, then the second print lines up within 1 mm | P0 | manual | § 1 |
| TPL-688 | Given a real browser with "Background graphics" off, then outlines and rulers print | P1 | manual | § 3 |
| TPL-700 | Given `+2` or `−2` (U+2212), then read as numbers | P0 | unit, ui | § 3 |
| TPL-701 | Given 1280 × 800, when Save refuses an item, then its message is in view; X and Y are reachable | P1 | e2e | § 3 |
| TPL-702 | Given A selected, when X is typed over several keys, then one step; undo and redo keep A, no re-fit | P1 | unit, ui | § 5 |
| TPL-703 | Given X open, when a box is dragged, an item field typed, or Undo clicked, then a `calibration` step, not `item`; `abc` is cleared by undo | P1 | ui | § 3, P5 |
| TPL-704 | Given both languages, then the helper line, range, cut warning and load failure read exactly as § 9 | P1 | ui | § 9 |
| TPL-705 | Given x 140, w 20 on A5 and X = −20, then still `templateItemOutsidePage`: calibration doesn't excuse a box | P1 | unit | § 3 |
| TPL-706 | Given only X invalid, then the message is on the field, not toasted, selection unchanged; a server `calibration.xMm` shows there too | P0 | ui | § 3, § 4 |
| TPL-707 | Given a test print, then the print root shows `2/3` and the manual input's name, not empty | P0 | e2e | P3 |
| TPL-708 | Given a second click, `detail` 2, after the first flow ended, then one print | P1 | ui | § 5 |
| TPL-709 | Given a job left (no `afterprint`), when pressed again after a size change, then one root, one `@page`, the new values; later edits don't alter the job; leaving removes it | P1 | ui | § 5 |
| TPL-710 | Given a picture and no job, under print media (Ctrl+P), then the picture isn't printed | P0 | e2e | A13 |
| TPL-711 | Given one template, then each value's position on the test page equals the real print's within 0.1 mm, and it wraps the same | P0 | e2e | § 3 |
| TPL-712 | Given Y ≤ −6 or X ≤ −6, then both rulers are still on the page | P1 | e2e | P4 |
| TPL-713 | Given 100% opacity, then the grid and box marks show above the picture | P0 | e2e | A10 |
| TPL-714 | Given 899, 900, 1199, 1200 px, then message, two-column, two-column, three-column | P1 | e2e | § 6 |
| TPL-715 | Given the shared column scrolled, in Arabic too, when a panel entry is dragged, then it lands under the pointer; a drop over settings adds nothing | P1 | e2e | § 6 |
| TPL-716 | Given the real routes, then `/rules` gives the config's limit and types; `GET /{id}` returns the bytes with `attachment` and `nosniff`; empty, bad-name, non-multipart and two-file uploads are refused | P1 | api | § 4 |
| TPL-717 | Given a landscape 210 × 148 and a custom 50 × 50 with calibration, then items shift and the page size is unchanged | P1 | e2e | § 3 |
| TPL-718 | Given a PNG signature with a corrupt body (passes the server), then `loadFailed` and Retry | P1 | e2e | A14 |
| TPL-719 | Given § 1's whole journey, with staff printing, then every "Done when" holds | P0 | e2e | § 1 |
| TPL-720 | Given a staff print at 375 px with calibration, then PDF items shift, with no horizontal scroll | P1 | e2e | § 8 |
| TPL-721 | Given 20.04 typed: no error; 20.05: error; −0.04: exactly 0 and clean against baseline 0 | P1 | unit | A5 |
| TPL-722 | Given three items sharing a name, then all are marked; fixing one keeps the other two; `validateLayout` still names only the later ones (rule 8e): `items[2]` of two, never the first | P1 | unit, ui | § 6 |
| TPL-723 | Given calibration saved elsewhere, then staff's next print uses it with no reload | P1 | ui | § 3 |
| TPL-724 | Given over 50 items and a bad calibration, then server and client give the same errors | P1 | unit | § 4 |
| TPL-725 | Given a picture stored, then its row has Preview, Download and Remove, no Replace icon and no "Download all"; a new pick shows beside it and replaces it only when Upload is pressed | P1 | ui | P6, P7, P8 |

**Not cases but the T6 checklist:** `business.md`'s page-number sentence is back; the gallery's PNGs are in CI's merged report.

**Added at T5 and at the walkthrough** (contract § 10.25–10.28):

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-729 | Given the settings, then the sheet's section is open at first and at most one is open; pressing the open one closes it, leaving all closed | P1 | ui | contract § 4.3.1 |
| TPL-730 | Given another section open, when a box is pressed, clicked, or entered, or an item is added, also when it was already selected, then the item's section opens; undo, redo, typing and a nudge leave the open section as it is | P0 | ui | contract § 4.3.1 |
| TPL-731 | Given a picked file, a running upload or typed text, when its section closes, then they stay | P1 | ui | contract § 4.3.1 |
| TPL-732 | Given a problem in a closed section, when Save or Test print refuses, then the first problem's section opens and its message is in view; another closed section with an error shows the mark, and fixing it clears the mark | P0 | ui | contract § 4.3.1 |
| TPL-733 | Given the correction's section closed and a box pushed off by it, then the cut warning shows | P0 | ui | A6, contract § 4.3.1 |
| TPL-734 | Given 1280 × 800 and an item selected, in both languages, then all section headers and the sheet are in view with no page scroll; the settings scroll inside themselves; the sheet stays in view while the opacity slider moves | P1 | e2e | contract § 4.3.1 |
| TPL-735 | Given the paired number fields at 1000 and 1280 px, in both languages, then no cut text and no axe failure | P1 | e2e | contract § 4.3.1 |
| TPL-736 | Given another section open, when reopened or widened from below 900 px, then the sheet's section is open | P2 | ui | contract § 4.3.1 |
| TPL-737 | Given a short item, then right is on by default; a press on center or left applies at once on the sheet, is one undo step, turns Save on, and saved and reloaded it stays; an old template's items read right and it isn't dirty | P0 | ui | contract § 4.3.2 |
| TPL-738 | Given `align` on each kind, then a short item keeps it and the prescription text drops it; another value, `Center` included, answers `templateLayoutInvalid` on `items[i].align`; server and client agree through the fixture | P1 | unit | contract § 4.3.2 |
| TPL-739 | Given a PUT with `align`, then it's stored and answered; missing or null saves and reads as right; a bad value or a wrong type is refused by the route | P1 | api | contract § 4.3.2 |
| TPL-740 | Given a static text, a manual input and an ISO value, each at right, center and left, then in the real print's PDF and Test print's, in Arabic and English, its run ends at the box's right edge, centers on it, or starts at its left, within 0.5 mm, the box itself unmoved | P0 | e2e | contract § 4.3.2 |
| TPL-741 | Given both languages, then the buttons read left, center, right from the screen's left, each named, with a tooltip, and reachable by keyboard | P2 | ui | contract § 4.3.2 |
| TPL-742 | Given the prescription text selected, then no alignment control shows | P1 | ui | contract § 4.3.2 |

**Existing cases changed (none retired):**

| ID | Why |
|---|---|
| TPL-002 | Lists the exact stored keys (`TemplateStorageTests.cs:80,375`; `PrescriptionLayoutRulesTests.cs:195`) |
| TPL-041 | Exact `newLayout` and PUT body (`layout.test.ts:709`, `save.test.tsx:139`) |
| TPL-029 | Text stands; both-items marking sits outside `validateLayout` |
| TPL-053 | Text stands; `print-template.spec.ts:425` asserts settings below the area at 900 |
| TPL-132, TPL-145 | "Neither prints" and an empty one-page number hold for real prints only |
| TPL-190 | Add "after calibration" |
| TPL-224, TPL-225 | `+1` is no longer refused |
| TPL-450, TPL-577 | Gain the `calibration` step and its selection |
| TPL-592; gallery spec `:65`, `:94` | New sections may push the fields out of view: re-measure |
| ERR-030 | 10 `template*` codes become 11 |
