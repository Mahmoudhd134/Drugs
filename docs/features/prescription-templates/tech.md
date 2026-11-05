# Prescription print templates: technical

## Summary
Steps 1 and 2 of the [design](../../design/prescription-templates.md) (§ 7; decisions D1–D16): each clinic has at most one print layout, stored as JSON, the super admin designs it with number fields on the clinic page's **Print template** tab, and staff print from the [prescription page](../prescription/tech.md) through the browser. **Built:** the table, the admin API with its validation, the designer with its unsaved-changes guard, the data router, the sheet's self-hosted font (step 1); the clinic read route, Print buttons, pop-up, function values, cleaning, pagination, the print root (step 2). **Not built:** drag, handles and undo (step 3); the guide image and calibration (step 4). No server PDF (D1). It touches the platform admin ([tab and routes](../platform-admin/tech.md)), the app's router (every page), the app bar's logout and the prescription page.

**Not verified:** alignment on real paper and the real print dialog: no printer is available for now. TPL-190, TPL-191 and TPL-347 stay manual cases for the [dress rehearsal](../../testing/dress-rehearsal.md), not a gate for merging; TPL-334 (a page larger than the paper) only records what the browser does. **What CI proves:** the PDF's page size, each item's position in it, and every drug present once across the pages.

## Data model
Migration **`AddPrescriptionTemplates`** (a new empty table; no data step). Tested up → down → up.

**PrescriptionTemplates** (`ClinicHub.Domain/Prescriptions/PrescriptionTemplate`, `IClinicOwned`, `IHasTimestamps`)

| Column | Type | Rules |
|---|---|---|
| Id | int PK | |
| ClinicId | int | FK restrict, clinic query filter; **unique** (D4: one template per clinic) |
| Layout | text | The layout below, written only by `PrescriptionLayoutRules.Serialize` from the normalized DTO (D2: no PostgreSQL-only piece) |
| CreatedAt, UpdatedAt | timestamptz | |

Limits (`PrescriptionTemplateLimits`, mirrored by `constants.ts`): 50 items; name 60; static text 1000; font 6–36, default 11; width ≥ 5; height ≥ 4; prescription text height ≥ 20; custom page 50–420 × 50–600; A5 148 × 210; A4 210 × 297; schema version 1; item id ≤ 40.

```jsonc
{
  "schemaVersion": 1,
  "page": { "size": "A5", "widthMm": 148, "heightMm": 210 },
  "items": [
    { "id": "i1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 },
    { "id": "i2", "kind": "manualInput", "name": "الاسم", "xMm": 58, "yMm": 46, "wMm": 72, "hMm": 8, "fontSizePt": 11 },
    { "id": "i3", "kind": "function", "function": "fullDate", "name": "التاريخ", "xMm": 14, "yMm": 46, "wMm": 30, "hMm": 8, "fontSizePt": 11 },
    { "id": "i4", "kind": "staticText", "text": "يُصرف مرة واحدة\nسطر ثان", "xMm": 14, "yMm": 175, "wMm": 60, "hMm": 8, "fontSizePt": 10 }
  ]
}
```

Millimetres from the sheet's top-left corner, whatever the language; one decimal. `function`, `name` and `text` are left out when null, in the column and in answers. A new clinic starts with none: provisioning is untouched (D6).

## API
Under `/api/v1`, `Api/Features/Platform/AdminPrescriptionTemplateController`, `PlatformAdmin` + `[AdminClinic]`.

| Method | Route | Request | Response | Errors (codes) |
|---|---|---|---|---|
| GET | `/admin/clinics/{clinicId}/prescription-template` | | 200 `PrescriptionTemplateDto`, or 204 when none | 401, 403 `forbidden`, 404 `notFound` |
| PUT | same | the layout itself | 200 `PrescriptionTemplateDto`: creates or replaces (last write wins) | 400 below; 401, 403, 404 |
| DELETE | same | | 204, also when there is none | 401, 403, 404 |

The clinic's own read, `Api/Features/Prescriptions/PrescriptionTemplateController`, `[Authorize(Policy = AuthPolicies.ClinicContext)]`:

| Method | Route | Permission | Response | Errors (codes) |
|---|---|---|---|---|
| GET | `/prescription-template` | `prescriptions.create` | 200 `PrescriptionTemplateDto`, or 204 when the clinic has none | 401; 403 `forbidden` (no permission, a no-context or platform token), `noAccess` (deactivated or removed staff, a deleted clinic), `clinicSuspended` |

It sends step 1's `GetPrescriptionTemplateQuery`, which takes no clinic id, and neither does the route: the clinic query filter decides. The super admin in the template clinic's context gets 204: the template clinic can never hold one.

`PrescriptionTemplateDto` is `{ layout, updatedAt }`. On the admin routes: no token → 401 `unauthorized`; any token but a current super admin's platform token → 403 `forbidden`, checked first; a missing, deleted or template clinic → 404 `notFound`, before the body is read (a malformed body still answers 404); a suspended clinic is managed. A 400 is `ProblemDetails` listing every failure, each with `code`, `description` and `field`; `code` is the first.

The PUT binds `PrescriptionLayoutDto` directly (no request record). JSON numbers may come back with their scale (`148.0`); clients read numbers, never strings.

| Body | Answer |
|---|---|
| Malformed JSON, empty body, `null` | 400 `invalidRequest` (binding) |
| A wrong type (`fontSizePt: "big"`, `items: "x"`, `schemaVersion: 1.5`, `kind: 5`, a number out of `decimal`'s range) | 400 `invalidRequest`, `field` = the JSON path without `$.`. The rest of the body isn't validated |
| A number as a string that parses (`"12"`) | Accepted (ASP.NET Core's web defaults) |
| A missing or `null` number | 400 `invalidRequest` naming it, never 0 |
| Missing `schemaVersion` | `templateLayoutInvalid` |
| Missing `page` | `invalidRequest` (`page`) |
| Missing `page.size`, `kind`, `id`, or `function` on a function | The rule of each below |
| Missing `items`, `[]` | `templateTextCount` (`items`) |
| An unknown property, another kind's field | Ignored and not stored: binding drops the first, `Normalize` the second |

## Backend
`ClinicHub.Application/Features/Prescriptions/Templates/`; nothing in the folder takes a clinic id (D5).

| Piece | Role |
|---|---|
| `PrescriptionLayoutRules` (internal) | `Round` (one decimal, `MidpointRounding.AwayFromZero`; null stays null), `Normalize` (numbers rounded; `Name` trimmed, kept on manual inputs and functions; `Text` as typed, kept on static text; `Function` kept on functions), `Fits(start, length, sheet)` (`start >= 0`, then with `length = max(length ?? 0, 0)`: `length <= sheet && start <= sheet - length`), `NameKey` (`Trim().ToLowerInvariant()`), `Serialize` / `Deserialize` (`JsonSerializerDefaults.Web`) |
| `SavePrescriptionTemplateCommand.From(layout)` | Normalizes, so **validation sees rounded values** |
| `SavePrescriptionTemplateCommandValidator` | The rules below |
| `Queries/GetPrescriptionTemplate` | The clinic's row (query filter); none: `Result<PrescriptionTemplateDto>.Success(null)`, which MVC answers with 204 |
| `Commands/SavePrescriptionTemplate` | Adds or replaces. An existing row: `db.Touch(row)`, so `UpdatedAt` moves even when the JSON is the same; `Id` and `CreatedAt` stay. Answers the layout saved and `row.UpdatedAt` |
| `Commands/DeletePrescriptionTemplate` | Removes when found; success either way |
| `PrescriptionTemplateErrors` | The 10 `template*` codes |

**Validation**, every failure returned, in this order; all 400. `layout.ts` `validateLayout` holds the same list, and `tests/fixtures/print-layout-cases.json` holds it as data for both sides.

| # | Applies when | Rule | Code | `field` |
|---|---|---|---|---|
| 1 | always | `SchemaVersion` is 1 | `templateLayoutInvalid` | `schemaVersion` |
| 2 | always | `Page` not null | `invalidRequest` | `page` |
| 3 | page present | `Size` is `A5`, `A4` or `custom` (case-sensitive); else only this page error | `templatePageInvalid` | `page.size` |
| 4 | known size | `WidthMm` not null, `HeightMm` not null | `invalidRequest` | `page.widthMm`, `page.heightMm` |
| 5 | known size, number present | A5: 148 × 210; A4: 210 × 297; custom: 50–420 × 50–600 (width first, then height) | `templatePageInvalid` | `page.widthMm`, `page.heightMm` |
| 6 | always | At most 50 items. Over: only this error for `items`; rules 7–8 are skipped | `templateTooManyItems` | `items` |
| 7 | ≤ 50 | Exactly one item with kind `prescriptionText` (null items → none) | `templateTextCount` | `items` |
| 8 | ≤ 50 | Each item in order, 8a–8j. A null element: `templateLayoutInvalid` on `items[i]`, nothing else for it | | |
| 8a | | `Id` matches `^[A-Za-z0-9_-]{1,40}$` and no earlier item has it (ordinal; the later one is refused) | `templateLayoutInvalid` | `items[i].id` |
| 8b | | `Kind` is known (`internalData`, `expression` are unknown). Unknown: 8c–8j are skipped for this item | `templateLayoutInvalid` | `items[i].kind` |
| 8c | function | `Function` is one of the six | `templateLayoutInvalid` | `items[i].function` |
| 8d | manual input, function | `ValidName(60)`: `nameRequired`, `nameInvalid`, `nameTooLong` | those | `items[i].name` |
| 8e | manual input, function; name not blank | `NameKey` differs from every earlier manual input's and function's (static text isn't a name) | `templateItemNameTaken` | `items[i].name` |
| 8f | static text | Not blank (`ValidationExtensions.IsBlank`: only spaces or invisible format characters) | `templateStaticTextRequired` | `items[i].text` |
| 8g | static text | `ValidMultilineText()`: control characters, U+2028, U+2029, bidi overrides and isolates refused; `\n`, `\r`, `\t` allowed | `invalidText` | `items[i].text` |
| 8h | static text | At most 1000 characters **as typed** (no trim; `\r\n` counts 2) | `templateStaticTextTooLong` | `items[i].text` |
| 8i | | X, then Y: not null (`invalidRequest`); when the page passed rules 2–5, `Fits(x, w, page width)` / `Fits(y, h, page height)` | `templateItemOutsidePage` | `items[i].xMm`, `items[i].yMm` |
| 8j | | Width, height, font, in that order: not null (`invalidRequest`); `wMm >= 5`; `hMm >= 4` (prescription text `>= 20`); `fontSizePt` in 6–36 | `templateItemSizeInvalid`, `templateItemSizeInvalid`, `templateFontSizeInvalid` | `items[i].wMm`, `items[i].hMm`, `items[i].fontSizePt` |

Items may overlap: the topmost (the later in the list) takes the mouse press, and a covered item is reached with Tab then Enter. "Outside" names X or Y, also for an item too big for the sheet; a negative length counts as a size error only.

## Frontend
**Route:** `/admin/clinics/:id/print-template`, `ClinicPrintTemplateTab` (lazy, a `CLINIC_TABS` row after Staff), which passes `adminPrintTemplateApi(id)` to the reusable `TemplateDesigner` (D5).

| Piece (`features/printTemplates/`) | Role |
|---|---|
| `types.ts`, `constants.ts` | The API's JSON; the limits mirroring the server, default boxes, `PRINT_FONT_FAMILY` |
| `api.ts` | `readTemplate` (`data \|\| null`: axios gives `""` for a 204), `usePrintTemplate(adapter)` (key `adapter.scope`, `staleTime: 0`, through `loadInScope`), `useSavePrintTemplate` (`setQueryData` on success; `refreshScope` after a stale-data refusal), `useDeletePrintTemplate` (cancels reads in flight, `setQueryData(scope, null)`) |
| `layout.ts` | The pure rules, StrykerJS-mutated: `roundTenth`, `toTenths`, `parseMmInput`, `formatMm`, `normalizeLayout`, `validateLayout`, `itemIndexOfField`, `newLayout`, `canAddItem`, `addItem`, `removeItem`, `updateItem`, `pageOfSize`, `applyPageSize`, `sameLayout` |
| `unsavedGuard.ts` | `registerLeaveCheck`, `confirmLeave`, `blocksExit`. Its own small file: the app bar's chunk imports it |
| `useUnsavedGuard.ts` | `useUnsavedGuard(dirty): {dialog}`, below |
| `components/TemplateSheet.tsx` | One renderer for the designer and for printing: `dir="ltr"`, 1 mm = 1 CSS mm, its own font, line height `PRINT_LINE_HEIGHT` (1.4) on every item, cut at the sheet's edge. **Position always inline, never `sx`** (the RTL style cache flips `left` and `right`). In the designer (`data-testid="template-sheet"`) each item is a native `<button aria-pressed data-item-id>`; the content is a `<span dir="auto">` out of the button's flow, since a button centers its content: it starts at the box's top, wraps, and shows past the box, unclipped. A selected box has a heavier inset `boxShadow`, never a border, so it stays exactly its size, and no inline `outline`, so the browser's focus ring shows. The mm grid shows only with `onSelect`. With `print`: see Printing below |
| `components/TemplateDesigner.tsx` | The states, the draft, Save and Delete |
| `components/TemplateSidePanel.tsx` | What can be placed: manual input, the six functions, static text; internal data and JavaScript expression dimmed and disabled, with hints. A click whose `event.detail > 1` is ignored; Enter and Space add (`detail` 0). A new item's box is scrolled into view (`block` and `inline` `nearest`), the focus stays on the entry. Full at 50: entries disabled, with a message |
| `components/TemplateSettings.tsx` | The sheet's size and measures, then the selected item's fields. An item's type is text, not a control |
| `components/MmField.tsx` | A number field: `type="text"`, `inputMode: "decimal"`, `dir="ltr"` in both languages, never `type="number"` (Arabic digits). It shows what is typed while typing, `formatMm(value)` on blur |
| `printFont.css`, `public/fonts/print/` | Family `ClinicHub Print`: IBM Plex Sans Arabic 5.3.0 from `@fontsource`, Arabic and Latin subsets, regular and bold, woff2, with its SIL OFL `LICENSE`. No new dependency |
| `printSheet.css` | The `.print-text` rules, the same on the sheet and in the hidden box, none from the app or the editor's CSS, so the page count doesn't depend on what was opened before. Headings at the template's size, bold, no margins. The marker's room is on the `li`, on its own side (Quill puts `dir` on the `li`, not on its list), so a number stays in the box |
| `clinicTemplate.ts` | `useClinicPrintTemplate(clinicId)` (`staleTime` 0, read when the page opens), `readTemplateAtPrint` |
| `functions.ts` | `functionValue`, `itemValue`, `isLeftToRightValue`, StrykerJS-mutated |
| `printHtml.ts` | `cleanPrintHtml`, `hasPrintableText`, `singleLine`, StrykerJS-mutated |
| `pagination.ts` | `paginate(cleanHtml, fits)`, StrykerJS-mutated |
| `printMeasure.ts` | `createTextMeasurer`, `printTextStyle`, `loadPrintFont` (e2e only: jsdom has no layout, so `fits` there is always true) |
| `usePrintPrescription.tsx` | `{available, print(html), element}`, below |
| `components/PrintDialog.tsx`, `components/PrintRoot.tsx` | The pop-up; the element under `body` and its rules |

**States, first that applies:** below 900 px the `desktopOnly` message, whatever is loaded (the GET still runs); a draft: the designer; a failed read: `common.loadFailed` + Retry, no «إنشاء قالب»; no answer since mount: progress; else the empty state. A 404 on the read goes to the clinic page through `container`: "Clinic not found".

**Numbers.** `roundTenth(v) = Math.sign(v) * Math.round(Number((Math.abs(v) * 10).toPrecision(12))) / 10`, so 12.35 rounds as on the server; `toTenths(v) = Math.round(roundTenth(v) * 10)`: every comparison and sum is on whole numbers. `parseMmInput` reads `12.5`, `12,5`, `١٢٫٥`, Persian digits, one leading `-`; `null` for anything else. `formatMm` writes plain digits for huge values, never an exponent.

**Editing.** Item numbers: `parseMmInput` on every change; a number → `updateItem` at once, never corrected (a negative or off-sheet value is applied, then refused by the rules); null → the layout keeps its last number, the text stays in `rawInputs`, with `numberRequired`. Page width and height commit on blur or Enter, never per keystroke: within the rules → `applyPageSize`; else nothing moves, the text stays in `rawInputs`, with `numberRequired` or `errors.templatePageInvalid`. Until the commit, a text that differs from the committed number is held in `typedPage`: no message, nothing moves, but the screen counts as unsaved; typed back to the committed number, it and that measure's `rawInputs` go, so the screen is clean again. The size select commits at once. `applyPageSize`, per axis in tenths: `length = max(min(length, sheet), min(length, minimum))`, `start = clamp(start, 0, sheet - length)`; items inside are unchanged, going back doesn't restore. `addItem`: first free id `i<n>`, `xMm = (5 + 6n) % (floor(page.widthMm - wMm) + 1)`, `yMm` likewise, a distinct name in the UI language at that moment («التاريخ الكامل 2»); static text starts empty.

**Messages.** `validateLayout` runs on every render of the draft. A field shows its first error once it has been changed since the load; typing a width or a height also marks X or Y, where the rules put that size's "outside" error; Save pressed marks the fields with a problem, so a new static text doesn't start red. `rawInputs` keys: `<itemId>.<field>`, `page.widthMm`, `page.heightMm`.

**Remove item.** At once, no confirm; the selection clears and the focus goes to the sheet's region, since the pressed button leaves with the item.

**Save** (`useSingleFlight`; disabled when not dirty or while saving): a measure still in `typedPage` commits first, so one press sends one PUT with the new size (the field's blur on mouse-down or Tab has usually done it; Save does it when no blur came, the window narrowed and widened while typing). Then any `rawInputs` or `validateLayout` error: nothing is sent, the messages show, the first problem's item becomes selected, an error no field shows (`items`, `schemaVersion`, `items[i].id`, `items[i].kind`, `items[i].function`) is toasted. Else `sent = normalizeLayout(draft)`, PUT; success: `baseline = sent`, the draft isn't replaced, so an edit made while the request is in flight stays and keeps the screen dirty. Failure: a toast, `getFieldErrors` on the named fields until the next edit, the named item selected, edits kept. A 404 reloads the clinic through `affects`.

**Draft** (`TemplateDesigner`'s local state, above the desktop switch, so narrowing the window keeps it): `{layout, baseline, rawInputs, typedPage, selectedId, revealId, touched, serverErrors}`. Seeded once, from the first answer since mount (`isFetchedAfterMount && isSuccess`, as `ProtocolEditorPage`): a cached copy is never shown, later answers are ignored while a draft exists. **Dirty** = `baseline === null || !sameLayout(layout, baseline) || rawInputs not empty || typedPage not empty`. `ClinicPage` keys its `PageBoundary` by the clinic, so nothing of A's draft shows under B.

**Unsaved changes (D16).** `useUnsavedGuard` is called once, above the desktop switch.

| Exit | Guarded by |
|---|---|
| Clinic tabs, header Back, sidebar, logo, browser Back and Forward, switch clinic | `useBlocker`, through `blocksExit` |
| Logout (`UserMenu`), "Edit template clinic" (`AdminLayout`): they change the session first | `await confirmLeave()` first |
| Close, reload | `beforeunload` |
| Session or context lost (`RequireAuth`'s `Navigate`, `AuthProvider`'s `navigate`) | **Never blocked**: `blocksExit` compares `currentContextKey()` with its value at mount; the move's own toast says why |

One question at a time: `useConfirm`'s second call would overwrite the first, so the guard keeps the open promise and hands it to any later ask; only the latest blocked navigation is answered. A same-path navigation (query, hash) isn't an exit.

**The router** (`app/App.tsx`): `createBrowserRouter([{path: "*", element: <AppProviders><AppRoutes/></AppProviders>}])`, created once inside `App` with `useState`, so each `startApp` reads its own URL. `AppRoutes` is the existing `<Routes>`, unchanged, so they are descendants of a splat route; links are absolute. `useBlocker` throws under `MemoryRouter`: component tests use `renderWithProviders(ui, {dataRouter: true})`.

**i18n:** `printTemplates.*`, `admin.clinic.tabs.printTemplate`, the 10 `errors.template*`, `prescription.print`, `rxText.printValues.*` (Arabic in both locale files). Reused: `common.save`, `delete`, `cancel`, `copy`, `close`, `loading`, `loadFailed`, `retry`.

## Printing
Browser print, on the front end (D1). The buttons are on the prescription page ([tech](../prescription/tech.md)): `printer.available` decides whether they exist.

**Data.** `clinicTemplateKeys.current(clinicId)` is the page's read; `.atPrint(clinicId)` is the read at a click: `fetchQuery` (`staleTime` 0, `gcTime` 0, `retry: false`), then `setQueryData` of its answer on `current`. Through the query cache, so a 403 toasts once and reloads `/me`; on its own key, so a failed click doesn't put the page's query in error. **Print shows when `query.isSuccess && query.data`:** hidden after a failed read when the page opened, kept after a failed click, gone after a click answering 204. The page's read happens when the page opens and only then (`refetchOnReconnect: false`; the app already turns off the window-focus one): a failed read after a reconnect would otherwise hide Print on an open page. A 204 reaches axios as `""`: `readTemplate` makes it null.

**The flow** (`usePrintPrescription`, inside one `useSingleFlight`: a click while any of it runs does nothing, and the button is never stuck):

1. `readTemplateAtPrint`. Failure: a 403 says nothing here (the cache toasted it); anything else `toast.error(getErrorMessage(error))`; nothing prints. A refused token goes through the client's refresh and replay as any request.
2. `null`: `toast.error(t("printTemplates.print.gone"))`, nothing prints; `setQueryData` already hid Print everywhere; the editor stays open.
3. Manual inputs in the template's order: the pop-up, awaited; Cancel or Esc stops here. None: no pop-up.
4. `now = new Date()`, here, at the confirm: every sheet shows this value.
5. `loadPrintFont()`; `createTextMeasurer(textItem)`; `chunks = paginate(cleanPrintHtml(htmlForPaste(html)), measurer.fits)`; `dispose()`, also on an exception.
6. `setJob({layout, chunks, manualValues, now})`, replacing any earlier job, so there's one root and one `@page` rule.
7. A `useLayoutEffect` on the job adds the `afterprint` listener, then calls `window.print()` once per job: a desktop browser fires `afterprint` inside `window.print`, so the listener has to be there first. `afterprint` clears the job. Nothing removes it otherwise but the next print and the page's unmount, since `window.print` may return at once on a phone.

A ref says the page is gone; after every `await`, a flow on an unmounted page stops: no pop-up, no job, no `window.print`. An open pop-up unmounts with the page and answers null. Nothing is written to storage or sent but the read. No success toast: the browser's dialog is the feedback.

**The pop-up** (`PrintDialog`, `items` null: closed): `fullWidth maxWidth="xs"`, full screen below `sm`, `DialogForm`, so only the content scrolls and the buttons stay. The hint first, then one `TextField` per item: the label **above** the field, a `<label htmlFor>` that wraps, since MUI's floating label cuts a long one and a name may be 60 characters, its text in a `<bdi>`; `dir="auto"`, `maxLength` `MANUAL_VALUE_MAX_LENGTH` (200), empty, focus on the first. `onChange` through `singleLine`; `onPaste` applies `singleLine` and inserts at the selection within the limit, since an `<input>` would delete the line break; the value goes through React state (`flushSync`, then the caret), never `setRangeText`, which React's value tracker doesn't see, so what the field shows is always what prints. Enter or the submit button confirm, with every value trimmed; the flow's resolver answers once, so a second confirm does nothing. A click outside does nothing; Esc and Cancel close only the pop-up, and MUI puts the focus back on Print. Fields are empty per opening (`useOpeningKey`); the closing dialog keeps its fields until it has faded out.

**Function values** (`functionValue(fn, {now, page, pages})`): the computer's local time, never `Intl`; words from `i18n.getFixedT("ar")("rxText.printValues.…")`.

| Function | Value | Examples |
|---|---|---|
| `fullDate` | `<day> <month> <year>`, no padding | `5 نوفمبر 2026` |
| `time` | `<h12>:<mm> <ص or م>`; 12 at midnight and noon, minutes padded, one plain space | `2:30 م`, `12:01 ص`, `12:00 م` |
| `dayOfWeek` | `day0` (Sunday) … `day6` | `الخميس`, `الجمعة` |
| `dayOfMonth` | no padding | `5` |
| `isoDateTime` | `YYYY-MM-DDTHH:mm`, 24 h, padded, no zone | `2026-11-05T14:30` |
| `pageNumber` | `<page>/<pages>`; `""` when `pages` is 1 | `2/3`, `10/120` |

`itemValue(item, context)`: manual input: `manualValues[id] ?? ""`; function: `functionValue`; static text: as typed; prescription text: `""`.

**Cleaning** (`cleanPrintHtml`). Its input is `htmlForPaste(html)`, so printed and copied text match. It parses with `DOMParser` and builds a new tree, never touching the page's DOM: nothing loads, nothing runs.

- **Kept:** `p br strong em u ol ul li h1 h2 h3 span`.
- **Removed with their content:** `script style iframe object embed svg math template noscript head title link meta` and comments.
- **Become `p`:** `div blockquote pre h4 h5 h6 address section article` (Quill's paste keeps some of them; merging them into one line would lose the layout). In `pre`, a `\n` becomes `<br>`.
- **Any other tag:** dropped, its children kept in place (`a`, `b`, `i`, `font`; `img` has no children, so it's simply gone and never requested).
- **Attributes:** only `dir` with `ltr`, `rtl` or `auto`, and `style` filtered property by property: `text-align` with `left right center justify start end`; `margin-top`, `margin-bottom`, `margin-left`, `margin-right`, `margin-inline-start`, `margin-inline-end` with a number that isn't negative and `em`, `px`, `pt`, `mm` or none. The `margin` shorthand goes. A side margin above `6em` (deep Tab indents; other units compared at `1em` = 16 px) is written as `min(<value>, 50%)`, so it can't push text off the sheet, where `fits`, which measures height only, wouldn't see it. No style left: no attribute.
- **A line with no right-to-left letter reads left to right, at its own alignment** (the user's rule): a `p`, `li` or heading with `dir="rtl"` holding no right-to-left letter (`RTL_LETTER`, exported by `prescriptionText.ts`), or no letter at all, gets `dir="ltr"`; with no `text-align` in its `style` it gains `text-align:right`, so it stays where it was. Quill drops the name's `dir="ltr"` on load, and without this `5-FU 1%` prints `FU 1%-5`. A flipped `li` also gets `list-style-position:inside`, so its number stays beside its text at the right, not at the box's far side; `paginate`'s `list-style:none` comes after it on a cut item's second part, so it wins. U+FEFF (Quill's cursor) doesn't count as a right-to-left letter. **A line counts at its `<br>`s too:** in a block with `dir="rtl"` that holds right-to-left letters and so doesn't flip (`linesToHtml`'s drug paragraph holds the name, the dosing and the note), a line with no right-to-left letter and at least one letter or digit is wrapped in `<span dir="ltr">`, unless it's already one element with its own `dir`, such as the name. So a note `5-FU 1%` prints the same beside Copy as from the editor, where Quill makes each line its own paragraph. The lines are the runs of the block's direct children between its `<br>`s and any block in it; `paginate` closes and reopens the span at a cut as any inline tag. A single-line block has only the flip rule. A line holding both scripts doesn't change, nor does a blank line, which has nothing to reorder. Print only: `htmlForPaste`, the editor's screen and Copy don't change.
- Text outside any block at the top level is wrapped in a `p`.
- A block left inside a `p`, a heading or an inline tag moves out, the text around it keeping its tags, and a list holds only `li`s, so the HTML parses back to the same tree with no empty paragraph added.

`hasPrintableText(html)`: after removing the elements above, the text holds something other than white space, U+00A0, U+FEFF (Quill's cursor), U+200B–U+200F, U+061C. `htmlToPlainText` isn't used for it: it gives `1.` for one empty list item. **Print's check only:** the editor's Copy stays as it is. Manual values and static text are set as text, never as HTML.

**Pagination: measure and move** (`paginate`). One HTML string per sheet, at least one (`[""]` for nothing). CSS columns were rejected: their clipped offsets could hide a column no page shows.

1. **Blocks.** The top-level elements in order; a list counts each `li` as a block, remembering its list's tag, attributes and number. A **blank** is a `p` or heading with no printable text. A **run** is the blocks between blanks: Quill makes each line its own paragraph, so a drug is a run; `linesToHtml`'s one-paragraph drugs are a run of one.
2. **Blanks** at the start and end of the text and at the top of a sheet are dropped; between two runs on the same sheet they stay as typed.
3. **A run** goes on the current sheet (with the blanks before it) if the result fits. Else, if the sheet isn't empty and the run fits an empty sheet, on a new sheet whole. Else (taller than a box) it fills the current sheet block by block and carries on through the next ones.
4. **A block that doesn't fit** in step 3's last case is cut: the most words that fit stay, the rest starts the next sheet. `<br>` and spaces are cut points; a cut at a `<br>` drops that `<br>` and any right after it, so a sheet never starts with a blank line. On a non-empty sheet with no word fitting, the block starts a new sheet. On an empty sheet with no word fitting, it's cut between characters (code points). Not even one character fitting: one character is placed anyway, so the loop always ends and nothing is lost.
5. **A cut keeps the format:** both parts keep the block's tag, `dir` and `style`, and every inline tag open at the cut is closed and reopened. Concatenating the sheets' text gives the input's text, words whole, with the dropped blanks and `<br>`s aside.
6. **Lists.** Consecutive `li`s of one list on a sheet stay in one `ol`/`ul`. A sheet's `ol` starting after the first item has `start="<n>"`, so numbers continue. The second part of a cut `li` has `style="list-style:none"` and its list starts at that item's own number, so the next item still gets the next number. `start` and `list-style` are written here, after the cleaning: they aren't on the allow list, which guards the editor's HTML.

**Measuring.** `createTextMeasurer(item)`: a `div` under `body` with `position: fixed; left: -100000px; top: 0; visibility: hidden; dir="ltr"; aria-hidden`, width `item.wMm` mm (fixed, so it makes no scroll in RTL); inside it a `div.print-text` with `printTextStyle(fontSizePt)`, the helper the sheet uses too. `fits(html)` sets its `innerHTML` and compares its height with `item.hMm` in px (a second hidden element of that height, so the mm-to-px conversion is the browser's), allowing 0.01 px. `loadPrintFont()`: `document.fonts.load` for `400` and `700` at `16px "ClinicHub Print"`, with a sample holding an Arabic and a Latin letter, so `unicode-range` loads all four files (`document.fonts.ready` doesn't load an unused font); `Promise.allSettled`, raced with `FONT_LOAD_TIMEOUT_MS` (10 s). It never rejects: on a failure printing carries on with the fallback font. No `document.fonts` (jsdom): resolves at once. Each sheet renders its own chunk unclipped, so if print wraps a line differently the text overflows visibly rather than disappearing.

**The print root** (`PrintRoot`): `createPortal` to `document.body` of `<div id="clinichub-print-root" style="display: none">`, holding a `<style>` and one `<div class="print-page">` + `TemplateSheet` per chunk, with `print.values` from `itemValue` for `page` = index + 1, `pages` = the chunks' count. Not focusable, nothing on screen, no scroll. The `<style>`, so it lives and dies with the root and Ctrl+P elsewhere prints the app as it does today:

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

`!important` beats the inline scroll lock MUI puts on `body` while the editor is open.

**`TemplateSheet`'s print mode:** root `data-testid="print-sheet"`, no grid. Each item a plain `<div data-item-id>` at the same inline geometry, no `aria-pressed`, no handler, no shadow. Prescription text: `<div class="print-text" dangerouslySetInnerHTML>` with `printTextStyle(fontSizePt)` (`lineHeight` 1.4, `overflowWrap: "anywhere"`, `textAlign: "start"`), always `paginate`'s output of `cleanPrintHtml`. Short items: the same inner `span`, set as **text**, `dir="auto"`, `dir="ltr"` for the ISO value and the page number. An empty value: nothing inside. A name never prints. The root's `overflow: hidden` cuts at the sheet's edge, so a value can't make a page.

## Edge cases & limitations
- Last write wins: two windows may overwrite each other, accepted (one super admin). Two first saves in one instant hit the unique index: one 500, accepted.
- Name comparison: `ToLowerInvariant` / `toLowerCase` differ on a few letters such as Turkish `İ`: accepted, the server decides.
- `currentContextKey()` holds no user, so another super admin signing in from another tab keeps the key `platform` and the question can show on that forced move. Near impossible and harmless: it asks once. Not tested.
- Item ids are `i<n>`, reused after a removal; never shown.
- The font covers Arabic and Latin only; other scripts use the fallback.
- **Known limits, accepted by the user, as Copy or the editor have them:** Arabic lines pasted as plain text print as the editor shows them, on the left. An indented numbered item prints 1, 2, 3, 4 where the editor shows 1, a, b, 2. A slow read of the template at a click gives no feedback on the button, and a list cleared during it still prints the text taken at the click. Plain table cells glue together.
- **Known limit of print only, rare:** an indented list item in a narrow box at the sheet's edge can leave the sheet, since a side margin of `6em` or less isn't capped and `fits` measures height only. Capping every margin would break the printed text's equality with Copy (TPL-328).
- A rule that spans fields shows on the field the server names: a width too large for the sheet is "outside" on X, a height on Y, seen as soon as the size is typed.
- Alignment on real paper and the real print dialog are not verified (Summary). `@page` size in other browsers and `window.print` timing and `afterprint` on phones aren't either: Chromium is the tested browser, and the print root survives a missing `afterprint`.
- While a job stays because `afterprint` never fired, Ctrl+P prints that job: the next print or leaving the page ends it.
- A template saved while the page is open shows Print only when the page is opened again (`staleTime` 0 reads on mount, no refetch on focus).

## Testing notes
Catalog area TPL ([test catalog](../../testing/test-catalog.md)), step 1: TPL-001…058, TPL-200…253; step 2: TPL-100…153, TPL-190, TPL-191, TPL-300…348. Shared rule rows: `tests/fixtures/print-layout-cases.json`, run by both sides.

| Level | Tests |
|---|---|
| unit | `tests/ClinicHub.UnitTests/Prescriptions/Templates/`; Vitest `src/features/printTemplates/layout.test.ts`, `layout.parity.test.ts`, `functions.test.ts`, `printHtml.test.ts`, `pagination.test.ts` |
| api | `tests/ClinicHub.IntegrationTests/Admin/PrescriptionTemplates/` (includes the migration up → down → up and the clinic read) |
| ui | `src/features/printTemplates/**/*.test.tsx` (the print flow: `PrintFlow*.test.tsx`), `src/features/prescription/**/*.test.tsx`, `src/features/admin/components/ClinicPrintTemplateTab*.test.tsx`, `src/features/auth/components/UserMenu.test.tsx`, `src/app/App.*.test.tsx` |
| e2e | `e2e/admin/print-template.spec.ts` and friends; `e2e/prescription/print*.spec.ts` (`print-proof.spec.ts`: a real template and 40 drugs through the real API, the PDF read with `pdfjs-dist`); `e2e/support/ux.ts`'s cut-text check leaves out the sheet |
| manual | TPL-190, TPL-191, TPL-347 in the dress rehearsal, TPL-334: a real printer, a real phone, real Chrome's dialog. Not a gate for merging; never reported as passed |

Mutation: `layout.ts`, `unsavedGuard.ts`, `functions.ts`, `printHtml.ts`, `pagination.ts` (StrykerJS); `PrescriptionLayoutRules.cs`, the validator and the three handlers (Stryker.NET).
