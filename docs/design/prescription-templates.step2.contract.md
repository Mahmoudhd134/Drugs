# Prescription print templates, step 2 (printing): contract (T0)

Scope: [design § 7](prescription-templates.md#7-the-split) row 2 (D1–D16 approved, not reopened), § 4, the
[business file](prescription-templates.business.md) and the step 2 cases of the [test cases](prescription-templates.test-cases.md):
TPL-100…153, TPL-190, TPL-191, TPL-300…348, and the changed RX-075, UX-004, UX-014, I18N-006, UX-036 (the pop-up half). **Out of scope:**
drag (step 3), guide image and calibration (step 4), anything dimmed in the panel, server PDF. No migration, no new permission.

This contract **is compiled code**: the solution builds with 0 warnings, `npx tsc -b` and `npx eslint src e2e` are clean. `functions.ts`,
`printHtml.ts`, `pagination.ts`, `printMeasure.ts`, `usePrintPrescription.tsx`, `PrintDialog` and `PrintRoot` are stubs; everything else named below is done.
Every name, signature, route, key, text and accessible name here is final: a track that needs to change one goes through the session (both sides). It
builds on step 1, still moving on its own branch: `prescription-templates.contract.md` stays in force.

---

## 1. Backend (done)

`ClinicHub.Api/Features/Prescriptions/PrescriptionTemplateController.cs`, `[Authorize(Policy = AuthPolicies.ClinicContext)]`:

| Method | Route (`/api/v1`) | Permission | Answer |
|---|---|---|---|
| GET | `/prescription-template` | `prescriptions.create` | 200 `PrescriptionTemplateDto` (step 1's `{layout, updatedAt}`), or 204 when the clinic has none |

It sends step 1's `GetPrescriptionTemplateQuery`, which takes no clinic id: the clinic query filter decides. The route takes none either (TPL-102). 401 with no token; 403 per the
access pipeline: `forbidden` (no permission, a no-context or platform token), `noAccess` (deactivated or removed staff, a deleted clinic), `clinicSuspended` (TPL-101, TPL-300). The super admin
in the template clinic's context gets 204: the template clinic can never hold one (TPL-301).

---

## 2. SPA: pure logic

### 2.1 Data (`clinicTemplate.ts`, done)

`clinicTemplateKeys.current(clinicId)` = `["printTemplate", clinicId]`, `.atPrint(clinicId)` = `[…, "atPrint"]`. `useClinicPrintTemplate(clinicId)`: `staleTime` 0, `refetchOnReconnect: false`, read when the page opens and only then (TPL-303).
`readTemplateAtPrint(queryClient, clinicId)`: `fetchQuery` on the `atPrint` key (`staleTime` 0, `gcTime` 0, `retry: false`), then `setQueryData` of its answer on `current`. Through the query cache so a 403 toasts
once and reloads `/me` (TPL-343); on its own key so a failed click doesn't put the page's query in error: **Print shows when `query.isSuccess && query.data`**: hidden after a failed read when the page opened
(TPL-105), kept after a failed click (TPL-344), gone after a click answering 204 (TPL-151, TPL-345).

### 2.2 Function values (`functions.ts`, **stub**, StrykerJS-mutated)

`functionValue(fn, {now, page, pages})`, the computer's local time, never `Intl` (TPL-317), words from `i18n.getFixedT("ar")("rxText.printValues.…")` (done; `rxTextAr.ts`, the same in both locale files):

| Function | Value | Examples |
|---|---|---|
| `fullDate` | `<day> <month> <year>`, no padding | `5 نوفمبر 2026` |
| `time` | `<h12>:<mm> <ص or م>`; 12 at midnight and noon, minutes padded, one plain space | `2:30 م`, `12:01 ص`, `12:00 م` |
| `dayOfWeek` | `day0` (Sunday) … `day6` | `الخميس`, `الجمعة` |
| `dayOfMonth` | no padding | `5` |
| `isoDateTime` | `YYYY-MM-DDTHH:mm`, 24 h, padded, no zone | `2026-11-05T14:30` |
| `pageNumber` | `<page>/<pages>`; `""` when `pages` is 1 | `2/3`, `10/120` |

`itemValue(item, context)`: manual input: `manualValues[id] ?? ""`; function: `functionValue`; static text: as typed; prescription text: `""`. `isLeftToRightValue(fn)` (done): `isoDateTime`, `pageNumber`.

### 2.3 Cleaning (`printHtml.ts`, **stub**, StrykerJS-mutated)

`cleanPrintHtml(html)`: its input is `htmlForPaste(html)` (so printed and copied text match); parses with `DOMParser`, never touching the page's DOM (nothing loads, nothing runs):

- **Kept:** `p br strong em u ol ul li h1 h2 h3 span`.
- **Removed with their content:** `script style iframe object embed svg math template noscript head title link meta` and comments.
- **Become `p`:** `div blockquote pre h4 h5 h6 address section article` (Quill's paste keeps some of them; merging them into one line would lose the layout). In `pre`, a `\n` becomes `<br>`.
- **Any other tag:** dropped, its children kept in place (`a`, `b`, `i`, `font`, `img` has no children so it's simply gone and never requested).
- **Attributes:** only `dir` with `ltr`, `rtl` or `auto`, and `style` filtered property by property: `text-align` with `left right center justify start end`; `margin-top`, `margin-bottom`, `margin-left`, `margin-right`,
  `margin-inline-start`, `margin-inline-end` with a number that isn't negative and `em`, `px`, `pt`, `mm` or none. The `margin` shorthand goes. A side margin above `6em` (deep Tab indents) is written as `min(<value>, 50%)`, so it can't push text off the sheet, where `fits`, which measures height only, wouldn't see it. Everything else goes (`color`, `font-*`, `position`, `background`, `onerror`, `class`, `href`, `src`). No style left: no attribute.
- Text outside any block at the top level is wrapped in a `p`.
- **A line with no right-to-left letter reads left to right, at its own alignment** (user, 2026-11-05; F1, TPL-349): a `p`, `li` or heading with `dir="rtl"` holding no right-to-left letter (the range of `prescriptionText.ts`'s `RTL_LETTER`; no letter at all counts too) gets `dir="ltr"`; with no `text-align` in its `style` it gains `text-align:right`, so it stays where it was. Quill drops the name's `dir="ltr"` on load, and without this `5-FU 1%` prints `FU 1%-5`. **A line counts at its `<br>`s too:** in a block with `dir="rtl"` holding several lines (`linesToHtml`'s drug paragraph holds the name, the dosing and the note), a line with no right-to-left letter and at least one letter or digit is wrapped in `<span dir="ltr">`, unless it's already one element with its own `dir`, such as the name; so `<p dir="rtl"><strong dir="ltr">ALEMOX</strong><br>قرص<br>5-FU 1%</p>` prints `5-FU 1%` beside Copy as it does from the editor. The block itself doesn't flip, since it holds Arabic. A flipped `li` also gets `list-style-position:inside`, so its number stays beside its text at the right, not at the box's far side. A blank line stays as it is, and U+FEFF (Quill's cursor) doesn't count as a right-to-left letter. Lines holding both scripts don't change. The editor's screen and Copy aren't touched: a separate proposed session.
- **The result re-parses to itself** (T1): a block nested in a `p`, a heading or an inline tag is lifted out, around its siblings; a list's child that isn't a `li` is wrapped in one; white space between top-level blocks goes.
- The cap's `6em` compares other units at `1em` = 16 px, 1 pt = 4/3 px, 1 mm = 96/25.4 px, so `margin-left:500px` is capped too. A value with no unit is never capped: the browser ignores it. A leading `+` is allowed.

`hasPrintableText(html)`: after removing the elements above, the text holds something other than white space, U+00A0, U+FEFF (Quill's cursor), U+200B–U+200F, U+061C. `htmlToPlainText` isn't used for it: it gives `1.` for one empty list item (TPL-304). **Print's check only**: the editor's Copy stays as it is.

`singleLine(text)`: every run of `\r` and `\n` becomes one space; nothing else changes (the pop-up trims at the confirm).

### 2.4 Pagination (`pagination.ts`, **stub**, StrykerJS-mutated)

`paginate(cleanHtml, fits)`: one HTML string per sheet, at least one (`[""]` for nothing). `fits(html)` answers whether a whole sheet's HTML fits the box. Unit tests pass a fake `fits`; the real one is § 2.5.

1. **Blocks.** The top-level elements in order; a list counts each `li` as a block, remembering its list's tag, attributes and number. A **blank** is a `p` or heading with no printable text (§ 2.3). A **run** is the blocks between blanks: Quill makes each line its own paragraph, so a drug is a run (TPL-147); `linesToHtml`'s one-paragraph drugs are a run of one.
2. **Blanks** at the start and end of the text and at the top of a sheet are dropped; between two runs on the same sheet they stay as typed (TPL-326).
3. **A run** goes on the current sheet (with the blanks before it) if the result fits. Else, if the sheet isn't empty and the run fits an empty sheet, on a new sheet whole (TPL-143). Else (taller than a box, TPL-144) it fills the current sheet block by block and carries on through the next ones («وإلا ينقسم بين كلمتين»).
4. **A block that doesn't fit** in step 3's last case is cut: the most words that fit stay, the rest starts the next sheet. `<br>` and spaces are cut points; a cut at a `<br>` drops that `<br>` and any right after it, so a sheet never starts with a blank line (TPL-326). On a non-empty sheet with no word fitting, the block starts a new sheet. On an empty sheet with no word fitting, it's cut between characters (code points; TPL-340). Not even one character fitting: one character is placed anyway, so the loop always ends and nothing is lost.
5. **A cut keeps the format:** both parts keep the block's tag, `dir` and `style`, and every inline tag open at the cut is closed and reopened (`<strong>`, `<em>`, `<u>`, `<span>`). Concatenating the sheets' text gives the input's text, words whole, with the dropped blanks and `<br>`s aside.
6. **Lists.** Consecutive `li`s of one list on a sheet stay in one `ol`/`ul`. A sheet's `ol` starting after the first item has `start="<n>"`, so numbers continue (TPL-327). The second part of a cut `li` has `style="list-style:none"` and its list starts at that item's own number, so the next item still gets the next number. `start` and `list-style` are written here, after the cleaning.

### 2.5 Measuring (`printMeasure.ts`, **stub**; e2e only, jsdom has no layout, so `fits` there is always true)

`createTextMeasurer(item)`: a `div` under `body` with `position: fixed; left: -100000px; top: 0; visibility: hidden; dir="ltr"; aria-hidden`, width `item.wMm` mm; inside it a `div` with class `print-text` and the sheet's text styles (§ 3.4: one helper, `printTextStyle(fontSizePt)`, used by both). `fits(html)` sets the inner `div`'s `innerHTML` and compares its `getBoundingClientRect().height` with `item.hMm` in px (a second hidden element of that height, so the mm-to-px conversion is the browser's), allowing 0.01 px. Fixed, so it makes no scroll in RTL. Removed by `dispose()`, also on an exception, before `window.print`.

`loadPrintFont()`: `document.fonts.load` for `400` and `700` at `16px "ClinicHub Print"`, with a sample holding an Arabic and a Latin letter (so `unicode-range` loads all four files); `Promise.allSettled`, raced with `FONT_LOAD_TIMEOUT_MS`. Never rejects. No `document.fonts` (jsdom): resolves at once.

---

## 3. SPA: the screen (track `frontend`)

### 3.1 i18n (done, final; `en.ts` / `ar.ts`)

| Key | en | ar |
|---|---|---|
| `prescription.print` | Print | طباعة |
| `printTemplates.print.title` | Print the prescription | طباعة الروشتة |
| `printTemplates.print.hint` | Print at 100%, without "Fit to page". | اطبع بمقياس 100% دون «ملاءمة للصفحة». |
| `printTemplates.print.gone` | This clinic no longer has a print template. | لم يعد لهذه العيادة قالب طباعة. |
| `prescription.editorTitle` (changed) | Edit before copying or printing | تعديل قبل النسخ أو الطباعة |
| `prescription.editorHint` (changed) | For copying or printing; changes are not saved. | للنسخ أو الطباعة؛ التعديلات لا تُحفظ. |
| `rxText.printValues.*` | Arabic in both (§ 2.2) | |

Reused: `common.cancel`, `common.copy`, `common.close`, `getErrorMessage`.

### 3.2 `usePrintPrescription()` (**stub**)

`useClinic()` gives the clinic; `useClinicPrintTemplate` gives `available`. `print(html)`, inside one `useSingleFlight` (a click while any of it runs does nothing: TPL-307, and the button is never stuck: TPL-344):

1. `readTemplateAtPrint`. Failure: a 403 says nothing here (the cache toasted it, TPL-343); anything else `toast.error(getErrorMessage(error))`; nothing prints. A refused token goes through the client's refresh and replay as any request (TPL-342).
2. `null`: `toast.error(t("printTemplates.print.gone"))`, nothing prints; `setQueryData` already hid Print everywhere; the editor stays open (TPL-151, TPL-345).
3. Manual inputs in the template's order: the pop-up, awaited; Cancel or Esc stops here. None: no pop-up.
4. `now = new Date()`, here, at the confirm (TPL-316).
5. `loadPrintFont()`; `createTextMeasurer(textItem)`; `chunks = paginate(cleanPrintHtml(htmlForPaste(html)), measurer.fits)`; `dispose()`.
6. `setJob({layout, chunks, manualValues, now})`, replacing any earlier job, so there's one root, one `@page` rule (TPL-320).
7. A `useLayoutEffect` on the job calls `window.print()` once per job. `afterprint` (a listener while a job exists) clears the job. Nothing removes it otherwise but the next print and the page's unmount, since `window.print` may return at once on a phone (TPL-322).

**Stale flows:** a ref says the page is gone; after every `await`, a flow on an unmounted page stops: no pop-up, no job, no `window.print` (TPL-341). An open pop-up unmounts with the page. Nothing is written to storage or sent but the read (TPL-115, TPL-319). No success toast. `element`: `<PrintDialog/>` and, with a job, `<PrintRoot job/>`.

### 3.3 `PrintDialog` (**stub**; props `{items, onConfirm, onCancel}`)

MUI `Dialog`, open when `items` is not null, `fullWidth maxWidth="xs"`, `fullScreen` below `sm` like `EditorDialog`, `DialogForm`, so only the content scrolls and the buttons stay (TPL-311):

- `DialogTitle` `printTemplates.print.title`.
- `DialogContent`: `Typography` `printTemplates.print.hint` first (TPL-306), then one `TextField` per item in order: the label **above** the field, a `<label htmlFor>` that wraps, never a floating label (MUI's cuts a long one: a name may be 60 characters, TPL-117), `fullWidth`, `slotProps.htmlInput: {maxLength: MANUAL_VALUE_MAX_LENGTH, dir: "auto"}`, starts empty, `autoFocus` on the first (TPL-110). The label's text in `<bdi>`, so it keeps its own direction (TPL-312). `onChange` through `singleLine`. Pasted text: `onPaste` applies `singleLine` and inserts at the selection within the limit, since an `<input>` would delete the line break (TPL-114); through React state, so what the field shows is always what prints (T3 F1).
- `DialogActions`: `Button` `common.cancel`; `Button type="submit" variant="contained"` `prescription.print`. Enter submits (TPL-310). A second confirm does nothing: the flow's resolver answers once (TPL-116).
- Closing: `onClose` ignores `backdropClick` (TPL-308); `escapeKeyDown` and Cancel call `onCancel`, which closes only the pop-up: the focus returns to Print by MUI's own restore (TPL-309).
- Fields start empty per opening (remount by a key per opening: TPL-115). `onConfirm` gets every value trimmed (TPL-314).

### 3.4 `PrintRoot` and `TemplateSheet`'s print mode (**stubs**)

`PrintRoot({job})`: `createPortal` to `document.body` of `<div id={PRINT_ROOT_ID} style={{display: "none"}}>`, holding a `<style>` and one `<div class="print-page">` + `<TemplateSheet layout print={…} sampleText=""/>` per chunk, with `print.values` from `itemValue` for `page` = index + 1, `pages` = chunks count. Not focusable, nothing on screen, no scroll, axe ignores it (TPL-321). The `<style>`, so it lives and dies with the root (TPL-323):

```css
@media print {
  @page { size: <W>mm <H>mm; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; width: auto !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#clinichub-print-root) { display: none !important; }
  #clinichub-print-root { display: block !important; }
  .print-page { break-after: page; break-inside: avoid; }
  .print-page:last-child { break-after: auto; }
}
```

`!important` beats the inline scroll lock MUI puts on `body` while the editor is open (TPL-325).

`TemplateSheet`, as § 3.4 of step 1 but with `print`:
- Root `data-testid="print-sheet"` (not `template-sheet`), no grid, no hover mark.
- Each item a plain `<div data-item-id={id}>` at the same inline geometry, no `aria-pressed`, no handler, no shadow.
- Prescription text: inside the box, `<div class="print-text" dangerouslySetInnerHTML={{__html: textHtml}}>` with `printTextStyle(fontSizePt)`: `lineHeight: PRINT_LINE_HEIGHT`, `whiteSpace: "pre-wrap"`, `overflowWrap: "anywhere"`, `textAlign: "start"`. `textHtml` is always `paginate`'s output of `cleanPrintHtml`.
- Short items: the same inner `span`, set as **text** (TPL-313), `dir="auto"`, `dir="ltr"` when `isLeftToRightValue` (TPL-318). With `dir="auto"` also `unicodeBidi: "plaintext"`, in both modes, so each line of a static text takes its own language's direction and start («يبدأ النص من اتجاه لغته», F5, TPL-350). An empty value: nothing inside. The name never prints (TPL-132).
- The root's `overflow: hidden` cuts at the sheet's edge, so a value can't make a page (TPL-339).
- **Both modes:** `lineHeight: PRINT_LINE_HEIGHT` on every item (a `button` resets it), so the designer shows what prints. `printSheet.css` is imported here, beside `printFont.css`.

### 3.5 The buttons

`SelectionPanel`, prop `onPrint?: () => void`: absent, no button (TPL-103). In the existing button row, **between** Copy and Edit & copy: `Tooltip title={isEmpty ? "" : t("printTemplates.print.hint")}` > `span` > `Button variant="outlined" fullWidth startIcon={<PrintIcon/>} disabled={isEmpty}`, `prescription.print` (TPL-104, UX-014). The row wraps so three fit at every width (TPL-305): on `sm` and up `flexWrap: "wrap"`.

`EditorDialog` passes `onPrint?: (html: string) => void` to `EditorContent`. Absent, no button. In `DialogActions`, in this order: Close, Print, Copy. Print: `Tooltip` (hint; `""` when disabled) > `span` > `Button variant="outlined" startIcon={<PrintIcon/>} disabled={!hasPrintableText(html)}` with `onClick={() => onPrint(html)}`. Printing leaves the editor open with its edits (TPL-324). On a phone the actions wrap (TPL-305).

`PrescriptionPage`: `const printer = usePrintPrescription()`; `onPrint={printer.available ? () => void printer.print(linesToHtml(prescription.lines)) : undefined}`; `onPrint={printer.available ? (html) => void printer.print(html) : undefined}`; `{printer.element}`. Print beside Copy never uses the editor's edits (TPL-125).

---

## 4. Test support (done)

### 4.1 `src/test`

- `msw.ts`: `clinicPrintTemplateHandler(template = null)`.
- `pages/prescription.tsx`: `renderPrescriptionPage({…, template})`, default null, so existing tests get their 204.
- `print.ts`: `installPrint()` → `{print, finishPrint, printRoot, printRoots, sheets, itemOn}`.
- Step 1's `aPrintTemplate`, `aPrintLayout`, `aTemplateItem`.
- `startApp` tests that open `/` need the default 204 (`App.session.test.tsx`, `App.access.test.tsx`): track `tests-component`.

### 4.2 E2E

`pdfjs-dist` **6.5.438** (devDependency, done) reads the PDFs: `pdfjs-dist/legacy/build/pdf.mjs` in Node. Track `tests-e2e` writes `e2e/support/print.ts`: `stubPrint(page)` (an init script: `window.print` counts calls in `window.__printCalls` and fires no `afterprint`, so the print root stays, like a browser with its dialog open), `printedPdf(page)` (`page.pdf({preferCSSPageSize: true, printBackground: true})`, parsed per page into `{widthPt, heightPt, items: [{text, xPt, yPt}]}`), `printSheets(page)` (`#clinichub-print-root [data-testid=print-sheet]`, measured under `page.emulateMedia({media: "print"})`), `expectOnlySheetPrinted(page)`. Templates through step 1's `putTemplate(data, clinic, layout)`. Everything in print media is checked with `emulateMedia`, then back to `screen`. Real paper and the browser's dialog stay manual (§ 6).

---

## 5. Work split

Each track: branch `print-templates-step2/<track>`, its own git worktree, from this contract's commit; scratch database `drags_print_templates_step2_<track>` only if needed (dropped at the end); ports from its block. Never `drags`, Rider (:5000), Vite (:5173). All tests run on CI (`./ci.ps1`, pushing the track's branch is allowed). Test writers read the docs and this contract, never the coder's diff. Commits plain, no AI attribution. The backend is done here, so design § 7's backend track has only docs: they go to `frontend`.

| Track | Role | Ports | Owns (no file has two owners) | Delivers |
|---|---|---|---|---|
| `frontend` | coder | 5700–5709 | `src/features/printTemplates/{functions,printHtml,pagination,printMeasure}.ts`, `usePrintPrescription.tsx`, `components/{PrintDialog,PrintRoot,TemplateSheet}.tsx`, `src/features/prescription/{pages/PrescriptionPage.tsx,components/SelectionPanel.tsx,components/EditorDialog.tsx,components/EditorContent.tsx}`; docs: `docs/features/prescription-templates/{tech,business}.md`, `docs/features/prescription/{tech,business}.md`, `docs/tech/overview.md`, `docs/business/overview.md`, per design § 10 | §§ 2.2–2.5, 3 |
| `tests-component` | test writer | 5710–5719 | `tests/ClinicHub.IntegrationTests/Admin/PrescriptionTemplates/ClinicTemplateRead*.cs`; `src/features/printTemplates/{functions,printHtml,pagination}.test.ts`, `src/features/prescription/**/*.test.ts(x)` (print ones and fixes), `src/features/printTemplates/PrintFlow*.test.tsx`, `src/app/App.*.test.tsx`, `src/i18n/locales/{locales,docMessages}.test.ts`, `vite.config.ts` (`PURE_LOGIC`), `stryker.config.json`, `vitest.stryker.config.ts`; **`docs/testing/test-catalog.md`** (every step 2 row, RX-075, UX-004, UX-014, I18N-006, the summary) | its cases |
| `tests-e2e` | test writer | 5720–5729 | `e2e/prescription/print*.spec.ts`, `e2e/support/print.ts`, `e2e/support/{texts-rx,texts-ux}.ts`, `e2e/prescription/copy.spec.ts`, `e2e/ux/**` | its cases and the proof below |

Rules: nobody edits another track's files; a rule or contract change goes through the session to both sides. The coder runs build (0 warnings), `tsc -b`, `eslint src e2e`. T2: merge all into the feature branch, `./ci.ps1 -Tier full` in report mode, 3 times. Stryker (T5): StrykerJS on `functions.ts`, `printHtml.ts`, `pagination.ts`; `./ci.ps1 -Mutate` on nothing new on the backend, since the handler is step 1's.

### Cases per test track

**`tests-component`**
- api (xUnit, `[Trait("Area", "admin")]`, collection `admin-7`): TPL-100, 101, 102, 300, 301.
- unit: TPL-127, 317 (`functions.test.ts`, frozen clocks and locales); TPL-328, 329, 330 and the unit half of 123, 133 (`printHtml.test.ts`, with `linesToHtml` and `htmlForPaste` as they are); `pagination.test.ts`, tagged with the unit half of TPL-140–145, 147, 326, 327, 335, 340: every rule of § 2.4 with a fake `fits`.
- ui (Vitest on `renderPrescriptionPage`, `installPrint`): TPL-103, 104, 105, 110–116, 125, 132, 150, 151, 152, 302, 303, 304, 306–316, 319, 320, 322, 324, 341–345. Changed: UX-014 (`SelectionPanel.test.tsx`).

**T5 additions:** TPL-349 P0 unit+e2e and TPL-350 P1 unit+e2e. Given a drug named `5-FU 1%` or `ALEMOX 1 GM 12 F.C.TABS.`, when printed from the editor with no edit, then it reads in that order, at the right of the box (349). Given static text `Dr. Ahmed
دكتور أحمد
Consultant`, then each line starts from its own language's side (350).

TPL-351 P1 ui+e2e: given `a    b` and a tab typed in the editor, when printed, then the spaces and the tab print as typed, on the sheet and in the measuring box alike, and no sheet's text runs past its box.

**`tests-e2e`**
- e2e: TPL-103, 112, 117, 120–124, 126, 128–131, 133, 140–145, 147, 153, 305, 318, 321, 323, 325–327, 331–333, 335–340, 346, 348. Changed: RX-075, UX-004, UX-036, I18N-006.
- **The proof** (`e2e/prescription/print-proof.spec.ts`, tagged TPL-120, 121, 141, 142): a real template and 40 drugs with unique Latin names, through the real API and the real page: `page.pdf` page size, every item's position read from the PDF's text within 1 mm, every drug present exactly once across the pages, the short items on every page, the page number on each. Screenshots and PDFs attached for the ready report (Arabic, English, phone).

**Manual, never reported as passed:** TPL-190, 191, 334, 347: real printer, real phone, real Chrome dialog. The catalog's level says `manual`.

---

## 6. Decided in the contract

1. **The read at a click has its own cache key** (§ 2.1): the only way both TPL-105 (a failed open read hides Print) and TPL-344 (a failed click keeps it) hold.
2. **TPL-304 goes further than design § 4.1:** `hasPrintableText`, not `htmlToPlainText`, because the latter gives `1.` for one empty list item.
3. **The hint beside Print is its tooltip** (design § 4.8), not visible text; disabled buttons have none (TPL-104). TPL-306's "beside Print" means this.
4. **A run taller than a box starts on the current sheet**, not a new one (business: «ينتقل الدواء كله … إن كان يتسع فيها، وإلا ينقسم بين كلمتين»).
5. **Last resort below words:** characters, then one character regardless, so a 256-character name in a 20 mm box at 36 pt ends and loses nothing.
6. **Line height 1.4 everywhere on the sheet**, the designer included: 36 pt × 1.4 = 17.8 mm fits the 20 mm minimum whatever the font (TPL-336).
7. **Headings print at the template's size, bold** (TPL-329: "the size is the template's"); margins none.
8. **Tags outside the allow list that are blocks become `p`**, so a pasted quote doesn't merge with the next line. Their text was to be kept anyway.
9. **The font wait is capped at 10 s**, so a hung request can't hold Print for ever. TPL-332's 2 s delay is well inside it.
10. **`start` and `list-style:none` are written after cleaning** by `paginate`: they aren't on the allow list, which guards the editor's HTML.
11. **No success toast and no change to the lines** after printing: the browser's dialog is the feedback.
12. **Button order:** Copy, Print, Edit & copy; in the editor Close, Print, Copy. Print is `outlined`.
13. **`pdfjs-dist` is a new devDependency**, for e2e only: the task's proof needs text and positions from the PDF, which `page.pdf` alone doesn't give.
14. **The controller is in the contract**: the query exists, so track `backend` has no code. Design § 7's four tracks become three.
15. **`printSheet.css` is always loaded with the sheet**, scoped to `.print-text`. Only `@page` and the hiding rules are print-time.

16. **Margins** (T3): no negatives, no shorthand, deep side margins capped by `min(…, 50%)`. Text pushed past the sheet would be lost with `fits` still true.
17. **`htmlForPaste` also converts `h4 h5 h6 blockquote pre`** (T3), so their direction and alignment reach both Copy and print; those tags weren't handled before. A Copy gains `dir` and `style` on them and loses their `class`, as RX-069 asks of every block.
18. **Print keeps repeated spaces and tabs typed in the editor** (user, 2026-11-05; TPL-351): `printTextStyle` has `whiteSpace: "pre-wrap"`, so the sheet and the hidden box that measures it agree and page breaks stay right. It can differ from Copy's paste, which collapses them in Word.

19. **Numbers-only values start at the box's left** (user, 2026-11-05; F10): digits read left to right, and the box's place is the designer's choice.
20. **Known limits, as Copy or the editor have them** (user, 2026-11-05): Arabic lines pasted as plain text print as the editor shows them, left (F2); an indented numbered item prints 1, 2, 3, 4 where the editor shows 1, a, b, 2 (F4); a slow read gives no feedback on the button, and a list cleared during it still prints the text taken at the click (F7); plain table cells glue together (F9). Also from the last review: an indented list item in a narrow box at the sheet's edge can leave the sheet, since a side margin of `6em` or less isn't capped and `fits` measures height only. Rare, and capping every margin would break TPL-328's equality with Copy.

## 7. Wording approved by the user

Settled: the user approved both labels (2026-11-05, through the design session): the editor's title «تعديل قبل النسخ أو الطباعة» and the pop-up's title «طباعة الروشتة». The business file's one row for the editor, «للنسخ أو الطباعة؛ التعديلات لا تُحفظ.», is the editor's hint.
