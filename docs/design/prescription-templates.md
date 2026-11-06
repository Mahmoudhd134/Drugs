# Prescription print templates: design

Status: **approved** (user, 2026-11-05), including the proposed limits and font. Nothing is built yet. Companion files:
[business (Arabic)](prescription-templates.business.md) and [test cases](prescription-templates.test-cases.md). When a
step is built, its part of these files moves into `docs/features/prescription-templates/`, the overviews and the
[test catalog](../testing/test-catalog.md).

Builds on: [tech overview](../tech/overview.md), [backend architecture](architecture.md), the feature docs of
[prescription](../features/prescription/tech.md), [clinic scoping](../features/clinic-scoping/tech.md),
[access](../features/access/tech.md) and [platform admin](../features/platform-admin/tech.md). Input: the research and the
prototype artifacts of 2026-10-22; where they differ from this repo, the repo wins (§ 9).

---

## 1. Goal

Each clinic prints its prescriptions on its own paper. The super admin designs one layout per clinic, aligned to that
clinic's pre-printed sheet; staff print from the prescription page through the browser.

**Done when:** the super admin opens a clinic, adds the prescription text, a «الاسم» manual input, a full date and a
static line, saves; a doctor in that clinic adds two drugs, changes a word in «تعديل ونسخ», presses Print, types the name
in the pop-up, and the browser's print dialog shows the sheet at the template's size with every item in its place and
the edited text; a prescription too long for its box continues on a second sheet that repeats the other items; a clinic
with no template sees no Print button and Copy works as before.

## 2. Decisions (user, 2026-11-05)

| # | Decision |
|---|---|
| D1 | **Browser print, on the front end.** No server PDF and no Chromium on the server. The server only stores the template |
| D2 | The layout is **JSON in a `text` column** (like `TaperSteps`). `jsonb` has no real benefit here: nothing queries inside it, and the save validator covers validity. Keeps the M1.7 D4 rule (no PostgreSQL-only piece) |
| D3 | The **picture of the clinic's paper** is stored through [attachments](attachments.md) (module `clinicPaper`), in step 4, with no table of its own: PNG or JPEG, up to 10 MB, one per clinic. No SVG. It never prints. Steps 1–3 use a blank sheet with a mm grid. *(Amended by [step 4](prescription-templates.step4.md) A1, P2: this first said the database, in its own table, about 2 MB.)* |
| D4 | **One template per clinic** for now. Moving to several later is one additive migration (drop the unique index, add a name and a default flag); the routes and screen would then change |
| D5 | **Only the super admin edits templates**, from a tab on the clinic's admin page. No new clinic permission. **Future (out of scope):** a per-clinic feature flag and clinic-owned editing; the adapter pattern and clinic-free use cases keep the door open |
| D6 | **A clinic without a template sees no Print button.** Nothing else changes for it. New clinics start with none: the template clinic is not copied |
| D7 | **The drugs item prints the prescription's final text.** Print beside Copy prints the text generated from the lines; Print inside «تعديل ونسخ» prints the edited text. Edits stay unsaved, as today |
| D8 | **The designer uses a side panel** (prototype option B). An item's type is fixed when it is added and shown as information |
| D9 | **Static text** is in scope: one line or several. Its setting is the text itself |
| D10 | **Empty pop-up fields are allowed**: the space prints blank |
| D11 | Date and time print in Arabic with **Latin digits** |
| D12 | The **designer page is desktop only**: below 900 px it shows a message. **Print shows on phones too**; alignment there is not promised until a real device passes (TPL manual case) |
| D13 | Page sizes: **A5 (default), A4, custom** in mm |
| D14 | **A continuation page repeats every item** in the same positions. A **page number** function prints only when there is more than one page |
| D15 | **Font size per item**, set in the builder. The doctor can't change it. One fixed font, shipped with the app |
| D16 | **Unsaved changes warn on every exit**: clinic tabs, Back, sidebar, logo, the browser's Back and Forward, switching clinic, logging out, closing or reloading the page |

## 3. The items

The side panel lists what can be placed:

| Group | Item | Settings | Value at print |
|---|---|---|---|
| Fixed | **Prescription text** | Font size | The final text (D7). Exactly one per template |
| Manual | **Manual input** | Name, font size | What the doctor types in the pop-up; the name is the field's label |
| Functions | **Full date** | Name, font size | `5 نوفمبر 2026` |
| | **Time** | Name, font size | `2:30 م` |
| | **Day of week** | Name, font size | `الخميس` |
| | **Day of month** | Name, font size | `5` |
| | **ISO date and time** | Name, font size | `2026-11-05T14:30` (the computer's local time, no zone) |
| | **Page number** | Name, font size | `2/3`; prints nothing on a one-page prescription (D14) |
| Static | **Static text** | Text, font size | The text as typed, with its line breaks |
| Later (dimmed) | **Internal data** (patient name, age, visit date) | | Not selectable. Comes after M2.2 |
| Last (dimmed) | **JS expression** | | Not selectable (§ 8) |

Every item also has a position and size in mm: X and Y from the sheet's top-left corner whatever the language, width,
height. Functions take their value once, when the doctor confirms Print; every page shows the same value (except the page
number). A function's name shows only in the designer. Name and age are ordinary manual inputs for now.

**Proposed limits (not settled by the user; change freely at approval):**

| What | Limit |
|---|---|
| Items per template | 50 |
| Name | Required on manual inputs and functions, one line, up to 60 characters, unique within the template (ignoring case and the spaces around it) |
| Static text | Required, up to 1,000 characters, line breaks allowed |
| Pop-up value | One line, up to 200 characters |
| Font size | 6–36 pt, default 11 |
| Item | Width ≥ 5 mm, height ≥ 4 mm, fully inside the sheet; items may overlap |
| Prescription text box | Height ≥ 20 mm, so a line always fits |
| Custom page | Width 50–420 mm, height 50–600 mm |

**Numbers.** Positions, sizes and font sizes keep one decimal: the screen and the server both round to it, and both compare
in whole tenths of a mm, so 28.1 + 119.9 fits a 148 mm sheet (doubles would refuse it). The mm fields stay left to right and
accept a comma and Arabic digits (`12,5`, `١٢٫٥` = 12.5).

**Designer behaviour.** The sheet shows 1 mm = 1 CSS mm at 100% and scrolls inside its own area. Item positions are inline styles,
never `sx`, because the RTL style cache flips `left` and `right`. Boxes show the name for functions and manual inputs, the text
for static text and sample text for the prescription text. A new item gets a distinct name («التاريخ الكامل 2»). An invalid item that
isn't selected gets selected on Save, because the config shows one item at a time.

**Changing the page size** runs when the value is committed (blur or Enter), not per keystroke. Items keep their mm and those
past the edge move back in. An item bigger than the new sheet shrinks only as far as needed, never below the minimums.

**Text kept as typed.** Static text may hold line breaks and tabs and is counted as typed. Pop-up values are trimmed, and a
line break pasted into one becomes a space.

## 4. Printing

1. **Print** shows only when the clinic has a template, beside Copy and inside the editor. Beside Copy it's disabled with
   no lines, like Copy. In the editor it's disabled when `htmlToPlainText(html)` is empty; the editor's own Copy stays as it
   is today. The template is read when the page opens (`staleTime` 0). If that read fails, Print stays hidden until the page
   is opened again.
2. A click re-reads the template, so a template changed or removed meanwhile is never printed from an old copy. If it's
   gone, a message says so and the button disappears. If the request fails, the usual error message shows and nothing prints.
3. With manual inputs, the **pop-up** asks for them, in the template's order. Enter confirms; Esc or Cancel prints nothing and,
   from the editor, leaves the editor open with its edits; a click outside does nothing. Values aren't saved; the pop-up
   starts empty each time. With no manual input there is no pop-up. Function values are taken at this confirm.
4. **Order:** load the font (`document.fonts.load` for regular and bold, since `document.fonts.ready` doesn't load an unused font; if
   it fails, carry on with the fallback font), measure off screen, render the sheets, then call `window.print()`.
5. **Print root:** one element directly under `body`. A `@page` rule of the template's size and no margin, and the rules that hide
   the root's siblings (which include MUI dialogs, backdrops and toasts), exist only while printing. They go on `afterprint`,
   or at the next print where a browser doesn't fire it (`window.print` may return at once on phones, so nothing is removed
   before that). So Ctrl+P elsewhere prints the app as it does today.
6. **Nothing is lost.** The prescription text continues on further sheets (D14): each drug is a run of paragraphs between blank
   paragraphs, kept whole when it fits a box. A run taller than the box splits between words. Blank paragraphs are dropped at the
   end and at the top of a page. Long unbroken names wrap (`overflow-wrap: anywhere`).
7. **Short items** (manual input, function, static text) wrap in their box and may show past it rather than be clipped, but they
   are **cut at the sheet's edge**, so a long value at the bottom can't create an extra page. Each uses `dir="auto"` and aligns to
   its text's start. The page number and the ISO value stay left to right.
8. A hint says to print at 100%, without "Fit to page": in the pop-up, and as Print's tooltip.

**Same text as Copy:** the HTML goes through `htmlForPaste` (`prescriptionText.ts`), which already turns Quill's classes
into inline styles, so printed and copied text match. It is then **cleaned with an allow list** before it reaches the print
root: tags `p`, `br`, `strong`, `em`, `u`, `ol`, `ul`, `li`, `h1`–`h3`, `span`; attribute `dir`; and `style` with `text-align` and
`margin-*` only. Images, links, colors, fonts and sizes are dropped, keeping their text. Manual values and static text are set
as text, never as HTML. `linesToHtml` already escapes names and notes.

**Pagination: measure and move** (proved on 2026-11-05, § 8). Add runs one by one to a hidden box of the true size, off screen
(not `display: none`), and start a new sheet when one doesn't fit. Each sheet then renders its own chunk, unclipped, so if print
wraps a line differently the text overflows visibly rather than disappearing. CSS columns were rejected: their clipped offsets could
hide a column no page shows.

## 5. Data and API

**`PrescriptionTemplates`** (`IClinicOwned`, `IHasTimestamps`; new module `ClinicHub.Domain/Prescriptions`):

| Column | Type | Rules |
|---|---|---|
| Id | int PK | |
| ClinicId | int | FK restrict, clinic query filter; **unique** (D4) |
| Layout | text | The JSON below, written only from the validated DTO |
| CreatedAt, UpdatedAt | timestamptz | |

Migration `AddPrescriptionTemplates`: a new empty table, so no data step; tested up → down → up. Step 4 adds no migration
([step 4](prescription-templates.step4.md) § 4): the picture lives in `Attachments`, the printer's correction in the layout's JSON.

```json
{
  "schemaVersion": 1,
  "page": { "size": "A5", "widthMm": 148, "heightMm": 210 },
  "items": [
    { "id": "t1", "kind": "prescriptionText", "xMm": 14, "yMm": 80, "wMm": 120, "hMm": 90, "fontSizePt": 11 },
    { "id": "m1", "kind": "manualInput", "name": "الاسم", "xMm": 58, "yMm": 46, "wMm": 72, "hMm": 8, "fontSizePt": 11 },
    { "id": "f1", "kind": "function", "function": "fullDate", "name": "التاريخ", "xMm": 14, "yMm": 46, "wMm": 30, "hMm": 8, "fontSizePt": 11 },
    { "id": "s1", "kind": "staticText", "text": "يُصرف مرة واحدة", "xMm": 14, "yMm": 175, "wMm": 60, "hMm": 8, "fontSizePt": 10 }
  ]
}
```

Positions keep one decimal. `schemaVersion` lets a later feature read older layouts.

| Method | Route | Auth | Answer |
|---|---|---|---|
| GET | `/prescription-template` | `prescriptions.create` | 200 `PrescriptionTemplateDto`, or 204 when the clinic has none |
| GET | `/admin/clinics/{clinicId}/prescription-template` | `PlatformAdmin`, `[AdminClinic]` | The same |
| PUT | `/admin/clinics/{clinicId}/prescription-template` | same | Creates or replaces; 200 + the DTO |
| DELETE | `/admin/clinics/{clinicId}/prescription-template` | same | 204, also when there is none (Print disappears) |

`[AdminClinic]` already answers 404 `notFound` for a missing, deleted or template clinic and allows a suspended one.
Use cases live under `ClinicHub.Application/Features/Prescriptions/Templates/` and take no clinic id, so a clinic-side
endpoint can send the same commands later (D5). Save is last write wins: only the super admin edits, so a concurrent edit
is accepted, not locked. Two first saves in the same instant hit the unique index and one answers 500; accepted, like the
near-impossible races elsewhere. The query returns `Result<T>.Success(null)` for no template, which MVC answers with 204; axios
then gives `""`, so `api.ts` returns `data || null`. The DTO is `{ layout, updatedAt }`, and an item's error names its field
(`items[2].name`).

**Error codes** (400, new in `PrescriptionTemplateErrors` and both locale files): `templateLayoutInvalid` (unknown kind or
function, unknown schema version, duplicate or missing id), `templateTextCount` (not exactly one prescription text),
`templatePageInvalid`, `templateItemOutsidePage`, `templateItemSizeInvalid`, `templateFontSizeInvalid`, `templateItemNameTaken`,
`templateStaticTextRequired`, `templateStaticTextTooLong`, `templateTooManyItems`. Names reuse the shared `ValidName(60)`:
`nameRequired`, `nameInvalid` (control, separator, bidi override or isolate characters), `nameTooLong`. Static text gets a new
multi-line rule answering `invalidText`: the same characters refused, line breaks and tabs allowed.

## 6. Frontend

- **Tab:** `CLINIC_TABS` gets `{path: "print-template", labelKey: "admin.clinic.tabs.printTemplate"}`; `ClinicPrintTemplateTab` passes an adapter
  (`adminPrintTemplateApi(id)`) to the reusable `TemplateDesigner` (D5, M1.5 D9).
- **`src/features/printTemplates/`:** `types.ts`, `api.ts`, `layout.ts` (pure rules, mirroring the server's), `functions.ts`
  (function values), `TemplateSheet` (one renderer for designer preview and print, so what's designed is what prints),
  `TemplateDesigner` (side panel, sheet, config panel), `PrintDialog`, `usePrintPrescription`.
- **Prescription page:** a Print button in `SelectionPanel` and in `EditorContent`, shown when `useClinicPrintTemplate` has a template.
- **Designer below 900 px** (MUI `md`): the tab shows `printTemplates.desktopOnly` instead of the designer. The API is unchanged.
- **Empty clinic:** an empty state with «إنشاء قالب»; it starts a new A5 layout holding only the prescription text.
- **Unsaved changes (D16):** a hand-written guard can't catch the browser's Back, so the app moves from `BrowserRouter` to a data router, which
  is what `useBlocker` needs: `createBrowserRouter([{path: "*", element: <AppProviders><AppRoutes/></AppProviders>}])`, created once inside `App`
  so each test's URL is read. The existing `<Routes>` stay as they are under that splat route, so it's one small change in `App.tsx`, but every page
  runs on it: `full` on CI is the check. `useUnsavedGuard(dirty)` holds the blocker and `beforeunload`, and registers a check that the user menu's switch
  clinic and logout call first. Forced moves (session or clinic lost) never ask: they already have their own message. Component tests of the designer
  render in a data router (a `render.tsx` option), since `useBlocker` throws under `MemoryRouter`.
- **Editor wording:** its title and hint say copy only, so they change to «للنسخ أو الطباعة».
- **Drag (step 3):** own pointer handlers, as in the prototype; no new dependency (§ 9). Number fields stay in the config panel,
  so keyboard users can place everything. @dnd-kit stays for lists.
- **Font:** one Arabic and Latin font, self-hosted in `public/` under its own family name (`index.html` already declares IBM Plex
  from Google), set by the sheet itself (the theme puts Inter first in English). **Proposed:** IBM Plex Sans Arabic, because drug
  names are mostly Latin and it needs no second font. Regular and bold printed correctly with Arabic and Latin text in the test of § 8.
- **i18n:** `printTemplates.*`, `admin.clinic.tabs.printTemplate`, `errors.template*`. Printed values use `getFixedT("ar")` like `rxText`.

## 7. The split

Each step is one feature: its own T1–T6, mergeable to `main` alone. Days are estimates; the research's 26–40 days covered
QR codes, form readings, versioning and server PDF, which aren't here.

| Step | Feature | Contains | Migration | ≈ |
|---|---|---|---|---|
| 1 | **Template designer, no drag** | Table, admin API, validation, tab, side panel (click to add), sheet preview with the print font, config panel with number fields, desktop-only message, remove template | `AddPrescriptionTemplates` | 1 day |
| 2 | **Printing** | Clinic read route, Print buttons, pop-up, function values, print rendering, continuation pages, page number, cleaning | none | 1 day |
| 3 | **Drag** | Drag from the panel, move, resize, snap to 1 mm, keyboard nudging, undo | none | 1 day |
| 4 | **Paper alignment** ([design](prescription-templates.step4.md)) | The paper's picture (through attachments), X/Y calibration per clinic, test print | none | 1 day |
| — | **Later, if needed** | Internal data after M2.2 (with a "change source" action that keeps the position), JS expressions in a sandbox, several templates, shrink text to fit, feature flag and clinic ownership | | |

Steps 1 and 2 give a working result: after step 2 a clinic can print, with positions typed in mm. Test cases are drafted for
these two now; steps 3 and 4 get theirs at their own T0.

**Cases:** step 1 has about 90, step 2 about 90, both under the workflow's 150. Each step's size is an estimate; step 2 is the one
most likely to run over, because print behaviour can only be checked in the browser.

**Tracks.** Step 1: backend coder, frontend coder, backend test writer, frontend test writer. Step 2: backend coder (the one read
route), frontend coder, backend and component test writer, e2e test writer. Each in its own worktree and scratch database, from
the contract committed at the end of T0.

## 8. Risks and open points

**Print test, 2026-11-05.** A throwaway page, not in the repo, printed to PDF by headless Chrome 157 with the measure-and-move loop:
40 drugs, including a 256-character unbroken name and a note of 120 repeated phrases, in a 120 × 90 mm box. **Result:** 9 sheets and 9
PDF pages with no blank extra page, page size 420 × 595 pt (A5), no box overflowing, all 40 drugs and all 120 phrases present,
IBM Plex regular and bold embedded, mixed Arabic and Latin lines shaped and ordered correctly, and an item's box at exactly its 58.00 mm. **It did
not cover** `window.print()`, the print dialog, paper, phones, a self-hosted font (it used Google Fonts) or the editor's HTML.

| Point | Status | Handling |
|---|---|---|
| The router change for D16 | Touches every page | Kept to `App.tsx`; `full` on CI runs the whole e2e suite on it |
| Alignment on real paper | **Not verified** | Can't be proved on CI. Manual cases on a real printer and a real phone, run once by the clinic or the user; the rest of the workflow still automates |
| The browser's print dialog (scale, margins, headers) | **Not verified** | The 100% hint in step 2; X/Y calibration in step 4. CI checks print layout and PDF page size through Playwright (`emulateMedia`, `page.pdf` with `preferCSSPageSize`). A manual case on real Chrome |
| `@page` size in other browsers, `window.print` timing and `afterprint` on phones | **Not verified** | Chromium is the tested browser, as for the app. Phones are a manual case (D12). The print root survives a missing `afterprint` (§ 4) |
| A long unbroken name or a paragraph taller than the box | Proved in the test above | Cases TPL-141, TPL-144, TPL-340; pagination and `layout.ts` are on the mutation list |
| **JS expressions** | **Security risk** | A template's code would run in each staff member's browser with their login and could call the API as them. Tolerable while only the super admin writes, a real risk once clinics own templates. It stays dimmed and last, as its own feature, in a sandbox, never plain `eval`. Built-in functions cover the known needs |
| The editor's HTML on the print element | Designed | Allow-list cleaning before rendering (§ 4) |

## 9. Where the research does not apply

| Research | This repo |
|---|---|
| `tenant_id`, uuid keys | `IClinicOwned`, int keys, the clinic query filter and save interceptor |
| `jsonb` | `text` (D2) |
| Server PDF through Playwright or PuppeteerSharp in a Linux container | Browser print (D1); production is IIS on Windows (`DEPLOY.md`) |
| Immutable template versions, stored with each printed prescription | Not built: prescriptions aren't saved, so reprints don't exist. `schemaVersion` covers format changes; revisit when prescriptions are saved |
| `react-moveable` | Not used. The registry shows 0.56.0, no declared peer dependencies, no change since December 2023; **not run on React 19**. With few items and no rotation or multi-select, own pointer handlers suffice (the prototype does this). If step 3 needs more, test it then |
| Shrink, then continue (down to 8.5 pt) | Continue only (D14). The font size is a designer's choice (D15); shrinking is a later option |
| QR code, form readings, `visit.date`, letterhead at T0 | Out of scope, or later (§ 7) |
| 26–40 days | Four features of about a day each (§ 7) |

## 10. Docs and existing behavior touched

- [business overview](../business/overview.md) and [prescription business](../features/prescription/business.md): "printing with the clinic's
  letterhead" leaves the unsupported lists (step 2; the overview's line also covers saving past prescriptions, which stays, so it is
  split); the prescription page gains Print; the editor's hint and title change.
- [tech overview](../tech/overview.md): API table, data model, routes, modules.
- [platform admin](../features/platform-admin/tech.md): the new tab and routes.
- New feature docs: `docs/features/prescription-templates/`.
- Existing cases that change are listed in the [test cases](prescription-templates.test-cases.md#existing-cases-changed).
