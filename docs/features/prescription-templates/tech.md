# Prescription print templates: technical

## Summary
Step 1 of the [design](../../design/prescription-templates.md) (§ 7; decisions D1–D16): each clinic has at most one print layout, stored as JSON, and the super admin designs it with number fields on the clinic page's **Print template** tab. **Built:** the table, the admin API with its validation, the designer with its unsaved-changes guard, the data router, the sheet's self-hosted font. **Not built:** the clinic read route, Print buttons, pop-up, printing and pagination (step 2); drag, handles and undo (step 3); the guide image and calibration (step 4). Nothing in a clinic's own screens changes yet. It touches the platform admin ([tab and routes](../platform-admin/tech.md)), the app's router (every page) and the app bar's logout.

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

`PrescriptionTemplateDto` is `{ layout, updatedAt }`. No token → 401 `unauthorized`; any token but a current super admin's platform token → 403 `forbidden`, checked first; a missing, deleted or template clinic → 404 `notFound`, before the body is read (a malformed body still answers 404); a suspended clinic is managed. A 400 is `ProblemDetails` listing every failure, each with `code`, `description` and `field`; `code` is the first.

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

Items may overlap. "Outside" names X or Y, also for an item too big for the sheet; a negative length counts as a size error only.

## Frontend
**Route:** `/admin/clinics/:id/print-template`, `ClinicPrintTemplateTab` (lazy, a `CLINIC_TABS` row after Staff), which passes `adminPrintTemplateApi(id)` to the reusable `TemplateDesigner` (D5).

| Piece (`features/printTemplates/`) | Role |
|---|---|
| `types.ts`, `constants.ts` | The API's JSON; the limits mirroring the server, default boxes, `PRINT_FONT_FAMILY` |
| `api.ts` | `readTemplate` (`data \|\| null`: axios gives `""` for a 204), `usePrintTemplate(adapter)` (key `adapter.scope`, `staleTime: 0`, through `loadInScope`), `useSavePrintTemplate` (`setQueryData` on success; `refreshScope` after a stale-data refusal), `useDeletePrintTemplate` (cancels reads in flight, `setQueryData(scope, null)`) |
| `layout.ts` | The pure rules, StrykerJS-mutated: `roundTenth`, `toTenths`, `parseMmInput`, `formatMm`, `normalizeLayout`, `validateLayout`, `itemIndexOfField`, `newLayout`, `canAddItem`, `addItem`, `removeItem`, `updateItem`, `pageOfSize`, `applyPageSize`, `sameLayout` |
| `unsavedGuard.ts` | `registerLeaveCheck`, `confirmLeave`, `blocksExit`. Its own small file: the app bar's chunk imports it |
| `useUnsavedGuard.ts` | `useUnsavedGuard(dirty): {dialog}`, below |
| `components/TemplateSheet.tsx` | One renderer for the designer and for printing (step 2): `dir="ltr"`, 1 mm = 1 CSS mm, its own font, cut at the sheet's edge. Each item is a native `<button aria-pressed data-item-id>`; **position always inline, never `sx`** (the RTL style cache flips `left` and `right`). The content is a `<span dir="auto">` out of the button's flow, since a button centers its content: it starts at the box's top, wraps, and shows past the box, unclipped. A selected box has a heavier inset `boxShadow`, never a border, so it stays exactly its size, and no inline `outline`, so the browser's focus ring shows. The mm grid shows only with `onSelect` (the designer) |
| `components/TemplateDesigner.tsx` | The states, the draft, Save and Delete |
| `components/TemplateSidePanel.tsx` | What can be placed: manual input, the six functions, static text; internal data and JavaScript expression dimmed and disabled, with hints. A click whose `event.detail > 1` is ignored; Enter and Space add (`detail` 0). Full at 50: entries disabled, with a message |
| `components/TemplateSettings.tsx` | The sheet's size and measures, then the selected item's fields. An item's type is text, not a control |
| `components/MmField.tsx` | A number field: `type="text"`, `inputMode: "decimal"`, `dir="ltr"` in both languages, never `type="number"` (Arabic digits). It shows what is typed while typing, `formatMm(value)` on blur |
| `printFont.css`, `public/fonts/print/` | Family `ClinicHub Print`: IBM Plex Sans Arabic 5.3.0 from `@fontsource`, Arabic and Latin subsets, regular and bold, woff2, with its SIL OFL `LICENSE`. No new dependency |

**States, first that applies:** below 900 px the `desktopOnly` message, whatever is loaded (the GET still runs); a draft: the designer; a failed read: `common.loadFailed` + Retry, no «إنشاء قالب»; no answer since mount: progress; else the empty state. A 404 on the read goes to the clinic page through `container`: "Clinic not found".

**Numbers.** `roundTenth(v) = Math.sign(v) * Math.round(Number((Math.abs(v) * 10).toPrecision(12))) / 10`, so 12.35 rounds as on the server; `toTenths(v) = Math.round(roundTenth(v) * 10)`: every comparison and sum is on whole numbers. `parseMmInput` reads `12.5`, `12,5`, `١٢٫٥`, Persian digits, one leading `-`; `null` for anything else.

**Editing.** Item numbers: `parseMmInput` on every change; a number → `updateItem` at once, never corrected (a negative or off-sheet value is applied, then refused by the rules); null → the layout keeps its last number, the text stays in `rawInputs`, with `numberRequired`. Page width and height commit on blur or Enter, never per keystroke: within the rules → `applyPageSize`; else nothing moves, the text stays in `rawInputs`, with `numberRequired` or `errors.templatePageInvalid`. The size select commits at once. `applyPageSize`, per axis in tenths: `length = max(min(length, sheet), min(length, minimum))`, `start = clamp(start, 0, sheet - length)`; items inside are unchanged, going back doesn't restore. `addItem`: first free id `i<n>`, `xMm = (5 + 6n) % (floor(page.widthMm - wMm) + 1)`, `yMm` likewise, a distinct name in the UI language at that moment («التاريخ الكامل 2»); static text starts empty.

**Messages.** `validateLayout` runs on every render of the draft. A field shows its first error once it has been changed since the load; typing a width or a height also marks X or Y, where the rules put that size's "outside" error; Save pressed marks the fields with a problem, so a new static text doesn't start red. `rawInputs` keys: `<itemId>.<field>`, `page.widthMm`, `page.heightMm`.

**Remove item.** At once, no confirm; the selection clears and the focus goes to the sheet's region, since the pressed button leaves with the item.

**Save** (`useSingleFlight`; disabled when not dirty or while saving): any `rawInputs` or `validateLayout` error: nothing is sent, the messages show, the first problem's item becomes selected, an error no field shows (`items`, `schemaVersion`, `items[i].id`, `items[i].kind`, `items[i].function`) is toasted. Else `sent = normalizeLayout(draft)`, PUT; success: `baseline = sent`, the draft isn't replaced, so an edit made while the request is in flight stays and keeps the screen dirty. Failure: a toast, `getFieldErrors` on the named fields until the next edit, the named item selected, edits kept. A 404 reloads the clinic through `affects`.

**Draft** (`TemplateDesigner`'s local state, above the desktop switch, so narrowing the window keeps it): `{layout, baseline, rawInputs, selectedId, touched, serverErrors}`. Seeded once, from the first answer since mount (`isFetchedAfterMount && isSuccess`, as `ProtocolEditorPage`): a cached copy is never shown, later answers are ignored while a draft exists. **Dirty** = `baseline === null || !sameLayout(layout, baseline) || rawInputs not empty`. `ClinicPage` keys its `PageBoundary` by the clinic, so nothing of A's draft shows under B.

**Unsaved changes (D16).** `useUnsavedGuard` is called once, above the desktop switch.

| Exit | Guarded by |
|---|---|
| Clinic tabs, header Back, sidebar, logo, browser Back and Forward, switch clinic | `useBlocker`, through `blocksExit` |
| Logout (`UserMenu`), "Edit template clinic" (`AdminLayout`): they change the session first | `await confirmLeave()` first |
| Close, reload | `beforeunload` |
| Session or context lost (`RequireAuth`'s `Navigate`, `AuthProvider`'s `navigate`) | **Never blocked**: `blocksExit` compares `currentContextKey()` with its value at mount; the move's own toast says why |

One question at a time: `useConfirm`'s second call would overwrite the first, so the guard keeps the open promise and hands it to any later ask; only the latest blocked navigation is answered. A same-path navigation (query, hash) isn't an exit.

**The router** (`app/App.tsx`): `createBrowserRouter([{path: "*", element: <AppProviders><AppRoutes/></AppProviders>}])`, created once inside `App` with `useState`, so each `startApp` reads its own URL. `AppRoutes` is the existing `<Routes>`, unchanged, so they are descendants of a splat route; links are absolute. `useBlocker` throws under `MemoryRouter`: component tests use `renderWithProviders(ui, {dataRouter: true})`.

**i18n:** `printTemplates.*`, `admin.clinic.tabs.printTemplate`, the 10 `errors.template*`. Reused: `common.save`, `delete`, `cancel`, `loading`, `loadFailed`, `retry`.

## Edge cases & limitations
- Last write wins: two windows may overwrite each other, accepted (one super admin). Two first saves in one instant hit the unique index: one 500, accepted.
- Name comparison: `ToLowerInvariant` / `toLowerCase` differ on a few letters such as Turkish `İ`: accepted, the server decides.
- `currentContextKey()` holds no user, so another super admin signing in from another tab keeps the key `platform` and the question can show on that forced move. Near impossible and harmless: it asks once. Not tested.
- Item ids are `i<n>`, reused after a removal; never shown.
- The font covers Arabic and Latin only; other scripts use the fallback.
- A rule that spans fields shows on the field the server names: a width too large for the sheet is "outside" on X, a height on Y, seen as soon as the size is typed.

## Testing notes
Catalog area TPL ([test catalog](../../testing/test-catalog.md)), step 1: TPL-001…058, TPL-200…250. Shared rule rows: `tests/fixtures/print-layout-cases.json`, run by both sides.

| Level | Tests |
|---|---|
| unit | `tests/ClinicHub.UnitTests/Prescriptions/Templates/`; Vitest `src/features/printTemplates/layout.test.ts`, `layout.parity.test.ts` |
| api | `tests/ClinicHub.IntegrationTests/Admin/PrescriptionTemplates/` (includes the migration up → down → up) |
| ui | `src/features/printTemplates/**/*.test.tsx`, `src/features/admin/components/ClinicPrintTemplateTab*.test.tsx`, `src/features/auth/components/UserMenu.test.tsx`, `src/app/App.*.test.tsx` |
| e2e | `e2e/admin/print-template.spec.ts` and friends; `e2e/support/ux.ts`'s cut-text check leaves out the sheet |

Mutation: `layout.ts`, `unsavedGuard.ts` (StrykerJS); `PrescriptionLayoutRules.cs`, the validator and the three handlers (Stryker.NET).
