# Prescription print templates, step 1 (template designer, no drag): contract (T0)

Scope: [design § 7](prescription-templates.md#7-the-split) row 1 (D1–D16 approved, not reopened), the
[business file](prescription-templates.business.md) and the step 1 cases of the [test cases](prescription-templates.test-cases.md):
TPL-001…058, TPL-200…250 (94 cases, split in § [Cases per test track](#cases-per-test-track)) and the existing cases that
change in step 1. **Out of scope:** the clinic read route, Print buttons, pop-up, printing, pagination, `functions.ts`,
`PrintDialog`, `usePrintPrescription`, the editor wording (step 2: RX-075, UX-004, UX-014 stay as they are); drag, handles,
undo (step 3); guide image, calibration (step 4).

This contract **is compiled code**: the solution builds with 0 warnings, `npx tsc -b` and `npx eslint src e2e` are clean.
Handlers, the validator, `PrescriptionLayoutRules`, `layout.ts`, `useUnsavedGuard` and the two components are stubs
(`NotImplementedException` / `throw new Error("contract stub")` / `null`); everything else named below is done. Every name,
signature, route, code, key, text and accessible name here is final: a track that needs to change one goes through the
session (both sides). Migration `AddPrescriptionTemplates` is **not** in the contract (track `backend`): until it exists
EF reports pending model changes, so no test tier runs on the contract commit.

---

## 1. Backend

### 1.1 Data

`ClinicHub.Domain/Prescriptions/`: `PrescriptionTemplate` (`IClinicOwned`, `IHasTimestamps`: `Id`, `ClinicId`, `Layout` string,
`CreatedAt`, `UpdatedAt`), `PrescriptionTemplateLimits`, `PrescriptionTemplateCodes` (kinds, functions, page sizes).
`Infrastructure/Database/Configurations/Prescriptions/PrescriptionTemplateConfiguration`: `Layout` required (a string with no
length is `text`, no PostgreSQL-only piece), unique index on `ClinicId`; the FK (restrict) and clinic filter come from
`IClinicOwned`. `PrescriptionTemplates` in `AppDbContext` and `IAppDbContext`. Stored JSON: the layout below, written only by
`PrescriptionLayoutRules.Serialize` from the normalized DTO.

Limits (`PrescriptionTemplateLimits`, mirrored by `constants.ts`): 50 items; name 60; static text 1000; font 6–36, default 11;
width ≥ 5; height ≥ 4; prescription text height ≥ 20; custom page 50–420 × 50–600; A5 148 × 210; A4 210 × 297; schema version 1;
item id ≤ 40.

### 1.2 Routes

`Api/Features/Platform/AdminPrescriptionTemplateController` (done), `PlatformAdmin` + `[AdminClinic]`:

| Method | Route (`/api/v1`) | Body | Answer |
|---|---|---|---|
| GET | `/admin/clinics/{clinicId}/prescription-template` | | 200 `PrescriptionTemplateDto`, or 204 when none (`Result<T>.Success(null)` through `ToOk`: MVC's null → 204) |
| PUT | same | the layout itself | 200 `PrescriptionTemplateDto`: creates or replaces (last write wins) |
| DELETE | same | | 204, also when there is none |

No token → 401 `unauthorized`; any token but a current super admin's platform token → 403 `forbidden`, checked first; a missing,
deleted or template clinic → 404 `notFound`, before the body is read (`AdminClinicFilter`: a malformed body still answers 404,
TPL-205); a suspended clinic is managed. Use cases take no clinic id (D5).

Request and answer:

```jsonc
// PUT body (PrescriptionLayoutDto); the DTO also carries it as `layout`
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
// 200 (PrescriptionTemplateDto)
{ "layout": { "schemaVersion": 1, "page": { … }, "items": [ … ] }, "updatedAt": "2026-11-05T10:00:00.000Z" }
// 400 (ProblemDetails, every failure listed; `code` = the first)
{ "status": 400, "code": "nameRequired", "detail": "The name is required.",
  "errors": [ { "code": "nameRequired", "description": "The name is required.", "field": "items[1].name" },
              { "code": "templateItemOutsidePage", "description": "The item is outside the page.", "field": "items[2].xMm" } ] }
```

JSON numbers may come back with their scale (`148.0`); clients read numbers, never strings. `function`, `name` and `text` are
left out when null (`JsonIgnore(WhenWritingNull)` on `PrescriptionItemDto`), in the column and in answers.

**Types and binding.** `PrescriptionLayoutDto(int? SchemaVersion, PrescriptionPageDto Page, List<PrescriptionItemDto> Items)`,
`PrescriptionPageDto(string Size, decimal? WidthMm, decimal? HeightMm)`, `PrescriptionItemDto(string Id, string Kind, string
Function, string Name, string Text, decimal? XMm, decimal? YMm, decimal? WMm, decimal? HMm, decimal? FontSizePt)`; the PUT binds the
DTO directly (no request record: it would be the same fields). So:

| Body | Answer |
|---|---|
| Malformed JSON, empty body, `null` | 400 `invalidRequest` (binding) |
| A wrong type: `fontSizePt: "big"`, `xMm: "a"`, `items: "x"`, `page.widthMm: "a"`, `schemaVersion: 1.5`, `kind: 5`, a number out of `decimal`'s range | 400 `invalidRequest`, `field` = the JSON path without `$.`: `items[0].fontSizePt`, `items[1].xMm`, `items`, `page.widthMm`, `schemaVersion`, `items[0].kind` (checked with `System.Text.Json` on these records). The rest of the body isn't validated |
| A number as a string that parses (`"12"`) | Accepted: ASP.NET Core's web defaults read it. It is a number from then on |
| **A missing number** (`xMm`, `yMm`, `wMm`, `hMm`, `fontSizePt`, `page.widthMm`, `page.heightMm`) or `null` | Validator: 400 `invalidRequest` naming it (never 0). Deterministic, in the rule order below |
| Missing `schemaVersion` | `templateLayoutInvalid` (`schemaVersion`) |
| Missing `page` | `invalidRequest` (`page`), TPL-033 |
| Missing `page.size`, `kind`, `id`, or `function` on a function | The rule of each below (`templatePageInvalid`, `templateLayoutInvalid`) |
| Missing `items`, `[]` | `templateTextCount` (`items`), TPL-214 |
| An unknown property (`"script": "x"`), another kind's field (`text` on a prescription text, `name` on a static text) | Ignored and not stored (TPL-203): binding drops the first, `Normalize` the second |

### 1.3 Rounding and comparison

`decimal` on the server, so the sums are exact (TPL-210). `PrescriptionLayoutRules` (internal, **stub**):

- `Round(decimal?)`: `Math.Round(value, 1, MidpointRounding.AwayFromZero)`; null stays null. 12.34 → 12.3, 12.35 → 12.4, −12.35 → −12.4,
  0.05 → 0.1.
- `Normalize(layout)`: every number rounded; `Name` trimmed (`Trim()`), kept only on `manualInput` and `function`; `Text` kept **as
  typed**, only on `staticText`; `Function` only on `function`. Null page, items or elements stay null.
- `Fits(start, length, sheet)`: `start >= 0`, then with `length` = `max(length ?? 0, 0)`: `length <= sheet && start <= sheet - length`
  (no addition, so a huge value can't overflow `decimal`).
- `NameKey(name)`: `name.Trim().ToLowerInvariant()`.
- `Serialize` / `Deserialize`: `JsonSerializerDefaults.Web`.

`SavePrescriptionTemplateCommand.From(layout)` (done) normalizes, so **validation sees rounded values**: the controller sends
`From(layout)`, and so do the unit tests. Unit tests that build the command directly check the validator alone.

On the screen (`layout.ts`): `roundTenth(v) = Math.sign(v) * Math.round(Number((Math.abs(v) * 10).toPrecision(12))) / 10` (the double
12.35 × 10 is 123.50000000000001 or below: `toPrecision(12)` drops the noise, so both sides round the same; dividing a whole number by 10
gives the closest double, so `JSON.stringify` writes `12.4`). `toTenths(v) = Math.round(roundTenth(v) * 10)`: every comparison and sum is on
whole numbers (`toTenths(x) + toTenths(w) <= toTenths(W)`). The shared rows: `rounding` in `tests/fixtures/print-layout-cases.json`.

### 1.4 Validation (rule order, codes, fields)

`SavePrescriptionTemplateCommandValidator` (**stub**; a plain `AbstractValidator`, `RuleForEach` + `.SetValidator((command, item) => …)` or
`ChildRules` gives the fields below through the usual camelCase of `Items[2].WMm`). Every failure is returned, in this order; the first is
`code`. All 400. The same list is `validateLayout`'s in `layout.ts`, and `tests/fixtures/print-layout-cases.json` holds it as data for both.

| # | Applies when | Rule | Code | `field` |
|---|---|---|---|---|
| 1 | always | `SchemaVersion` is 1 | `templateLayoutInvalid` | `schemaVersion` |
| 2 | always | `Page` not null | `invalidRequest` | `page` |
| 3 | page present | `Size` is `A5`, `A4` or `custom` (case-sensitive); else only this page error | `templatePageInvalid` | `page.size` |
| 4 | known size | `WidthMm` not null, `HeightMm` not null | `invalidRequest` | `page.widthMm`, `page.heightMm` |
| 5 | known size, number present | A5: 148 × 210; A4: 210 × 297; custom: 50–420 × 50–600 (width first, then height) | `templatePageInvalid` | `page.widthMm`, `page.heightMm` |
| 6 | always | At most 50 items. **Over: only this error for `items`; rules 7–8 are skipped** (no huge answer) | `templateTooManyItems` | `items` |
| 7 | ≤ 50 | Exactly one item with `Kind == "prescriptionText"` (null items → none) | `templateTextCount` | `items` |
| 8 | ≤ 50 | Each item in order, rules 8a–8j. A null element: `templateLayoutInvalid` on `items[i]`, nothing else for it | | |
| 8a | | `Id` matches `^[A-Za-z0-9_-]{1,40}$` and no earlier item has it (ordinal; the later one is refused). Missing, empty, malformed or repeated | `templateLayoutInvalid` | `items[i].id` |
| 8b | | `Kind` is known (`prescriptionText`, `manualInput`, `function`, `staticText`; `internalData`, `expression` are unknown, TPL-022). **Unknown: 8c–8j are skipped for this item** | `templateLayoutInvalid` | `items[i].kind` |
| 8c | function | `Function` is one of the six | `templateLayoutInvalid` | `items[i].function` |
| 8d | manual input, function | `ValidName(60)`: `nameRequired`, `nameInvalid`, `nameTooLong` (the shared rule, chained as it is) | those | `items[i].name` |
| 8e | manual input, function; name not blank | `NameKey` differs from every earlier manual input's and function's (the later one is refused; static text isn't a name) | `templateItemNameTaken` | `items[i].name` |
| 8f | static text | Not blank (only spaces or invisible format characters count as blank, as `ValidName`) | `templateStaticTextRequired` | `items[i].text` |
| 8g | static text | `ValidMultilineText()` (done): control characters, U+2028, U+2029, bidi overrides and isolates refused; `\n`, `\r`, `\t` allowed | `invalidText` | `items[i].text` |
| 8h | static text | At most 1000 characters **as typed** (`Length`, no trim; `\r\n` counts 2) | `templateStaticTextTooLong` | `items[i].text` |
| 8i | | X, then Y: not null (`invalidRequest`); when the page passed rules 2–5, `Fits(x, w, page width)` / `Fits(y, h, page height)` | `templateItemOutsidePage` | `items[i].xMm`, `items[i].yMm` |
| 8j | | Width, height, font, in that order: not null (`invalidRequest`); `wMm >= 5`; `hMm >= 4` (prescription text `>= 20`); `fontSizePt` in 6–36 | `templateItemSizeInvalid`, `templateItemSizeInvalid`, `templateFontSizeInvalid` | `items[i].wMm`, `items[i].hMm`, `items[i].fontSizePt` |

Items may overlap (TPL-208). `PrescriptionTemplateErrors` (done): `LayoutInvalid`, `TextCount`, `PageInvalid`, `ItemOutsidePage`,
`ItemSizeInvalid`, `FontSizeInvalid`, `ItemNameTaken`, `StaticTextRequired`, `StaticTextTooLong`, `TooManyItems`: the 10 `template*` codes.
Add `PrescriptionTemplateErrors` to the error classes named in `docs/tech/overview.md` § Conventions.

### 1.5 Handlers (stubs; track `backend`)

Under `Application/Features/Prescriptions/Templates/`, nothing else in the folder may take a clinic id:

| Use case | Contract |
|---|---|
| `Queries/GetPrescriptionTemplate` | `db.PrescriptionTemplates.AsNoTracking().FirstOrDefaultAsync` (clinic filter). None: `Result<PrescriptionTemplateDto>.Success(null)`. Else `new(Deserialize(row.Layout), row.UpdatedAt)` |
| `Commands/SavePrescriptionTemplate` | Find the row (tracked). None: add one. `Layout = Serialize(new PrescriptionLayoutDto(command.SchemaVersion, command.Page, command.Items))`. An existing row: `db.Touch(row)`, so `UpdatedAt` moves even when the JSON is the same (TPL-201; `Id` and `CreatedAt` stay). `SaveChangesAsync`; answer the layout saved and `row.UpdatedAt`. Two first saves in one instant hit the unique index: one 500, accepted (design § 5) |
| `Commands/DeletePrescriptionTemplate` | Find; remove when found; success either way |

Provisioning is untouched: a new clinic starts with none (D6, TPL-010).

---

## 2. SPA: data layer

### 2.1 Types and API (done)

`src/features/printTemplates/types.ts`: `PageSize`, `TemplatePage`, `TemplateFunction` (`fullDate | time | dayOfWeek | dayOfMonth | isoDateTime |
pageNumber`), `ItemBox`, `PrescriptionTextItem`, `ManualInputItem`, `FunctionItem`, `StaticTextItem`, `TemplateItem`, `TemplateItemKind`,
`PrintLayout`, `PrintTemplate` (`{layout, updatedAt}`), `AddableItem`, `LayoutError` (`{field, code}`), and
`PrintTemplateAdapter = DataScope & {get(): Promise<PrintTemplate | null>; save(layout): Promise<PrintTemplate>; remove(): Promise<void>}`.

`constants.ts`: the limits mirroring the server, `PAGE_SIZES`, `PAGE_SIZE_OPTIONS`, `TEMPLATE_FUNCTIONS`, `TEMPLATE_KINDS`, `DEFAULT_TEXT_BOX`,
`DEFAULT_ITEM_SIZES`, `CASCADE_START_MM`, `CASCADE_STEP_MM`, `PRINT_FONT_FAMILY`.

`api.ts`: `readTemplate(data)` (`data || null`: axios gives `""` for a 204), `usePrintTemplate(adapter)` (key `adapter.scope`, `staleTime: 0`,
through `loadInScope`), `useSavePrintTemplate(adapter)` (`setQueryData` on success; `refreshScope` after a stale-data refusal),
`useDeletePrintTemplate(adapter)` (cancels reads in flight, `setQueryData(scope, null)`).

`features/admin/adapters.ts` `adminPrintTemplateApi(clinicId)`: `/admin/clinics/{clinicId}/prescription-template`; scope
`[...adminClinicKeys.detail(id), "printTemplate"]`, `affects` and `container` the clinic's details (a 404 → the page's "Clinic not found", TPL-235).
`features/admin/components/ClinicPrintTemplateTab.tsx` (lazy) and the `CLINIC_TABS` row after Staff (`path: "print-template"`,
`admin.clinic.tabs.printTemplate`): done.

### 2.2 Pure logic (`layout.ts`, **stubs**, track `frontend`; StrykerJS-mutated)

| Export | Contract |
|---|---|
| `roundTenth(value)`, `toTenths(value)` | § 1.3 |
| `parseMmInput(text)` | `12.5`, `12,5`, `١٢٫٥` (U+066B) → 12.5, rounded by `roundTenth`, never 125 or 0 (TPL-225). Trims spaces and U+200E, U+200F, U+061C; reads Arabic-Indic (٠–٩) and Persian (۰–۹) digits; one optional leading `-`; one optional decimal separator (`.`, `,`, `٫`); `.5` and `5.` read. null: empty, `abc`, `1.2.3`, `1e3`, `٫`, `-` |
| `formatMm(value)` | Latin digits, a dot, at most one decimal: `String(roundTenth(value))` |
| `normalizeLayout(layout)` | Numbers rounded, names trimmed, static text as typed, order kept |
| `validateLayout(layout)` | `LayoutError[]` of § 1.4 on `normalizeLayout(layout)`: same order, fields, codes. Blank name or text: nothing but white space (`\s`, U+0085) and `\p{Cf}`. Refused in names: `\p{Cc}`, `\p{Zl}`, `\p{Zp}`, U+202A–U+202E, U+2066–U+2069 on the trimmed name; in static text the same but `\n`, `\r`, `\t`. Name key: `trim().toLowerCase()`. Lengths in UTF-16 units, as the server |
| `itemIndexOfField(field)` | `items[2].name` → 2; `page.widthMm`, `items`, `schemaVersion` → null |
| `newLayout()` | `schemaVersion` 1, A5, one prescription text: id `i1`, `DEFAULT_TEXT_BOX`, font 11 |
| `canAddItem(layout)`, `addItem(layout, addable, defaultName)` | § 3.5 |
| `removeItem(layout, id)` | Never the prescription text |
| `updateItem(layout, id, changes)` | As given: no moving, no correcting (TPL-224) |
| `pageOfSize(size, current)` | A5, A4: theirs; custom: `current`'s measures with `size: "custom"` |
| `applyPageSize(layout, page)` | The page replaced. For each item on each axis, in tenths: `length = max(min(length, sheet), min(length, minimum))` (shrinks only as far as needed; a sheet is never smaller than a minimum, so only an item already below the minimum keeps its length); `start = clamp(start, 0, sheet - length)`. Items already inside are unchanged; going back doesn't restore (TPL-222, TPL-223) |
| `sameLayout(a, b)` | `normalizeLayout` of both deep equal, order included (TPL-233) |

`unsavedGuard.ts` (done; small file, the app bar's chunk imports it): `registerLeaveCheck(check)`, `confirmLeave()`, `blocksExit({dirty, contextAtMount,
contextNow, fromPath, toPath})`.

---

## 3. SPA: the screen (track `frontend`)

### 3.1 i18n (done, final; `en.ts` / `ar.ts`)

Errors, `errors.<code>`:

| Code | en | ar |
|---|---|---|
| `templateLayoutInvalid` | The template's data isn't valid. | بيانات القالب غير صحيحة. |
| `templateTextCount` | The template must hold the prescription text exactly once. | يجب أن يحتوي القالب على نص الروشتة مرة واحدة. |
| `templatePageInvalid` | The sheet size isn't valid. | مقاس الورقة غير صحيح. |
| `templateItemOutsidePage` | The item is outside the sheet. | العنصر خارج حدود الورقة. |
| `templateItemSizeInvalid` | The item is smaller than the allowed size. | مقاس العنصر أصغر من الحد المسموح. |
| `templateFontSizeInvalid` | The font size must be between 6 and 36. | حجم الخط يجب أن يكون بين 6 و36. |
| `templateItemNameTaken` | Another item already uses this name. | هذا الاسم مستخدم في عنصر آخر. |
| `templateStaticTextRequired` | Enter the text. | اكتب النص. |
| `templateStaticTextTooLong` | The text is longer than 1000 characters. | النص أطول من 1000 حرف. |
| `templateTooManyItems` | A template can't have more than 50 items. | لا يمكن إضافة أكثر من 50 عنصرًا. |
| (reused) `nameRequired`, `nameTooLong`, `nameInvalid`, `invalidText` | as they are | «الاسم مطلوب.», «الاسم طويل جدًا.», «الاسم يحتوي على رموز غير مسموح بها.», «النص يحتوي على رموز غير مسموح بها.» |

Screen texts: `admin.clinic.tabs.printTemplate` and `printTemplates.*`:

| Key | en | ar |
|---|---|---|
| `admin.clinic.tabs.printTemplate` | Print template | قالب الطباعة |
| `desktopOnly` | Open this page on a computer. | افتح هذه الصفحة من جهاز كمبيوتر. |
| `empty` | This clinic has no print template. | لا يوجد قالب طباعة لهذه العيادة. |
| `create` | Create template | إنشاء قالب |
| `saved` | Template saved | تم حفظ القالب |
| `deleted` | Template deleted | تم حذف القالب |
| `deleteConfirm` | Delete the print template? The Print button will disappear from this clinic, and this can't be undone. | حذف قالب الطباعة؟ سيختفي زر «طباعة» من العيادة، ولا يمكن التراجع عن ذلك. |
| `unsavedMessage` | You have unsaved changes. Do you want to leave? | لديك تغييرات لم تُحفظ. هل تريد الخروج؟ |
| `leave` | Leave | خروج |
| `numberRequired` | Enter a number. | أدخل رقمًا. |
| `kinds.prescriptionText` / `manualInput` / `staticText` | Prescription text / Manual input / Static text | نص الروشتة / حقل يدوي / نص ثابت |
| `kinds.internalData` / `expression` | Internal data / JavaScript expression | بيانات داخلية / تعبير JavaScript |
| `functions.fullDate` / `time` / `dayOfWeek` | Full date / Time / Day of week | التاريخ الكامل / الوقت / يوم الأسبوع |
| `functions.dayOfMonth` / `isoDateTime` / `pageNumber` | Day of month / ISO date and time / Page number | يوم الشهر / التاريخ والوقت بصيغة ISO / رقم الصفحة |
| `panel.label` | Add to the sheet | إضافة إلى الورقة |
| `panel.manual` / `functions` / `static` / `later` | Manual / Functions / Static / Later | يدوي / دوال / ثابت / لاحقًا |
| `panel.internalDataHint` | Comes after patient files are added. | يأتي بعد إضافة ملفات المرضى. |
| `panel.expressionHint` | The last to be added. | آخر ما سيُضاف. |
| `sheet.label` | Sheet preview | معاينة الورقة |
| `sheet.sampleText` | The prescription text appears here | يظهر نص الروشتة هنا |
| `page.title` / `size` | Sheet / Paper size | الورقة / مقاس الورق |
| `page.sizes.A5` / `A4` / `custom` | A5 / A4 / Custom | A5 / A4 / مخصص |
| `page.width` / `height` | Sheet width (mm) / Sheet height (mm) | عرض الورقة (مم) / ارتفاع الورقة (مم) |
| `config.label` | Settings | الإعدادات |
| `config.noSelection` | Select an item on the sheet to see its settings. | اختر عنصرًا على الورقة لتظهر إعداداته. |
| `config.type` / `name` / `text` | Type / Name / Text | النوع / الاسم / النص |
| `config.functionNameHint` | Shows in the designer only; it doesn't print. | يظهر في المصمم فقط ولا يُطبع. |
| `config.x` / `y` | X: from the left (mm) / Y: from the top (mm) | X: من اليسار (مم) / Y: من الأعلى (مم) |
| `config.width` / `height` / `fontSize` | Width (mm) / Height (mm) / Font size (pt) | العرض (مم) / الارتفاع (مم) / حجم الخط (نقطة) |
| `config.remove` | Remove item | حذف العنصر |

Reused: `common.save`, `common.delete`, `common.cancel`, `common.loading`, `common.loadFailed`, `common.retry`. Any other text goes through the session.

### 3.2 States, top to bottom (`TemplateDesigner`; props `{adapter}`; the tab's URL `/admin/clinics/{id}/print-template`)

Below the clinic page's header and tabs. Which state shows (first that applies):

| # | When | Shows | Accessible names |
|---|---|---|---|
| 1 | Width < 900 px (`useMediaQuery(theme.breakpoints.up("md"), {noSsr: true})` false), whatever is loaded | `Alert severity="info"`: `printTemplates.desktopOnly`, wrapping; nothing else | |
| 2 | First load (no answer since mount) | `CircularProgress`, no empty state (TPL-215) | `common.loading` |
| 3 | The read failed, no draft | `Alert severity="error"`: `common.loadFailed` + `Button` `common.retry`; no «إنشاء قالب» (TPL-215) | button `common.retry` |
| 4 | No template, no draft | `EmptyState`: title `printTemplates.empty`, action `Button` `printTemplates.create` | button `printTemplates.create` |
| 5 | A draft | The designer (§ 3.3) | |

A 404 on the read goes to the clinic page through `container`: "Clinic not found".

### 3.3 The designer

Grid: ≥ `lg` three columns (`200px minmax(0, 1fr) 280px`); `md` to `lg` two (`200px minmax(0, 1fr)`) with the settings below them, full width.
The page never scrolls sideways (TPL-227).

1. **Toolbar** (a row, the buttons at the end):
   - `Button variant="contained"` `common.save` («حفظ»): `disabled` when not dirty or while saving.
   - `Button color="error" variant="outlined"` `common.delete` («حذف»): only when a saved template exists (`baseline` not null, TPL-231).
2. **Side panel**: `<section aria-label={t("printTemplates.panel.label")}>` (role `region`), heading `printTemplates.panel.label`. When full (50 items), an `Alert severity="info"` above the lists: `errors.templateTooManyItems`, and every addable entry disabled (TPL-237). Groups, each a `List` with `aria-label` = the group's label, its entries `ListItem disablePadding` > `ListItemButton` with `aria-label` = the entry's label:
   - `printTemplates.panel.manual`: `kinds.manualInput`.
   - `printTemplates.panel.functions`: `functions.fullDate`, `time`, `dayOfWeek`, `dayOfMonth`, `isoDateTime`, `pageNumber`.
   - `printTemplates.panel.static`: `kinds.staticText`.
   - `printTemplates.panel.later`, dimmed, `disabled`, in this order: `kinds.internalData` (visible hint `panel.internalDataHint`, its `aria-describedby`), `kinds.expression` (`panel.expressionHint`, last, D8 § 3).
   - The prescription text is not listed: every layout has it and it can't be added or removed.
   - A click whose `event.detail > 1` is ignored (TPL-240); Enter and Space add (a keyboard click's `detail` is 0). The new item is selected; the focus stays on the entry.
3. **Sheet area**: `Box` with `role="region"`, `aria-label={t("printTemplates.sheet.label")}`, `tabIndex={0}` (a scrollable region needs focus, axe), `overflow: auto`, `maxHeight: "calc(100vh - 200px)"`, holding `TemplateSheet` (§ 3.4). Never `dir="rtl"` inside.
4. **Settings**: `<section aria-label={t("printTemplates.config.label")}>` (role `region`), top to bottom:
   - Heading `printTemplates.page.title`; `TextField select` label `printTemplates.page.size` (role `combobox`), options `page.sizes.A5`, `A4`, `custom`; number fields `page.width`, `page.height` (`disabled` unless custom).
   - Nothing selected: `printTemplates.config.noSelection`.
   - An item selected: per-kind fields (§ 3.5) in this order: `config.type` as **text, not a control** (TPL-043): a label and the kind's label (a function's: its function's label); name or text; `config.x`; `config.y`; `config.width`; `config.height`; `config.fontSize`; `Button` `config.remove` (not on the prescription text, TPL-045).

**Number fields** (position, size, font, page width and height): `TextField type="text"`, `slotProps.htmlInput: {inputMode: "decimal", dir: "ltr"}`, never `type="number"` (Arabic digits, TPL-225); left to right in both languages (TPL-226). `parseMmInput` on every change. Items: a number → `updateItem` at once, the sheet follows (TPL-044); null → the layout keeps its last number, the text is kept in the draft's `rawInputs` and shows `printTemplates.numberRequired` (TPL-224). On blur a valid field shows `formatMm(value)`.

**Page width and height** commit on blur or Enter, never per keystroke (TPL-221): a number within the rules → `applyPageSize`; anything else → nothing moves, the text stays in `rawInputs`, with `numberRequired` (not a number) or `errors.templatePageInvalid` (out of range). The size select commits at once (`pageOfSize` + `applyPageSize`).

**Messages on fields.** `validateLayout` runs on every render of the draft. A field shows its first error (`errors.<code>`, `helperText` + `error`) once it has been changed since the last load, or after a Save pressed. `rawInputs` keys: `<itemId>.<field>`, `page.widthMm`, `page.heightMm`.

**Save** (`useSingleFlight`; `useSavePrintTemplate`):
1. Any `rawInputs`, or `validateLayout(draft)` not empty: nothing is sent. All messages show; the first problem's item becomes selected (TPL-238); an error no field shows (`items`, `schemaVersion`, `items[i].id`, `items[i].kind`, `items[i].function`) is toasted.
2. Else `sent = normalizeLayout(draft)`, PUT. Success: `toast.success(printTemplates.saved)`, `baseline = sent`; the draft isn't replaced (TPL-242).
3. Failure: `toast.error(getErrorMessage(error))`; `getFieldErrors(error)` shown on the named fields until the next edit, the named item selected (TPL-236); edits stay, Save works again (TPL-058). A 404 reloads the clinic through `affects` (TPL-235).

**Delete**: `useConfirm` `{title: t("printTemplates.deleteConfirm"), destructive: true}` (focus on Cancel; confirm `common.delete`), once. Success: draft cleared, `toast.success(printTemplates.deleted)`, the empty state. Failure: `toast.error`, nothing changes.

**«إنشاء قالب»**: `event.detail > 1` ignored; draft = `newLayout()`, `baseline = null`, no selection.

**Remove item**: at once, no confirm (the unsaved guard covers it); the selection clears (TPL-046).

**Selection**: a click, Enter or Space on a box selects it; a click on the bare sheet changes nothing. Nothing is selected when a template loads.

### 3.4 `TemplateSheet` (props `{layout, selectedId?, onSelect?, sampleText}`)

One renderer for the designer and for printing (step 2):
- Root: `div` `data-testid="template-sheet"`, `dir="ltr"`, inline `style` `{position: "relative", width: "<W>mm", height: "<H>mm", fontFamily: PRINT_FONT_FAMILY, overflow: "hidden"}` (cut at the sheet's edge, § 4.7), white, with a 1 mm grid as a background image (designer only). It imports `printFont.css`.
- Each item: native `<button type="button">`, `aria-pressed={id === selectedId}`, `data-item-id={id}`, inline `style` `{position: "absolute", left: "<x>mm", top: "<y>mm", width: "<w>mm", height: "<h>mm", fontSize: "<pt>pt", boxSizing: "border-box", overflow: "visible"}`; **position always inline, never `sx`**: the RTL style cache flips `left` and `right`. A selected box has an `outline` (never a border: it stays exactly its size, TPL-228).
- Content in an inner `<span dir="auto">` aligned to its start, `white-space: pre-wrap`, `overflow-wrap: anywhere`, never clipped by the box (TPL-239):
  - prescription text: `sampleText`; the button's `aria-label` = `kinds.prescriptionText`.
  - manual input, function: the name; empty: the kind's label, dimmed.
  - static text: the text with its line breaks; empty: `kinds.staticText`, dimmed.
- Accessible name: the prescription text's `aria-label`, otherwise the content.

### 3.5 Each kind

| Kind | New box | Font | Name or text | Settings (after the type) |
|---|---|---|---|---|
| Prescription text | `DEFAULT_TEXT_BOX`: x 14, y 80, w 120, h 90 (only in `newLayout`) | 11 | none | X, Y, width, height, font; no name, no remove |
| Manual input | w 40, h 8, cascade | 11 | name = `kinds.manualInput` in the UI language, made distinct | name (`dir="auto"`), X, Y, width, height, font, remove |
| Function | w 30, h 8, cascade | 11 | name = `functions.<function>` in the UI language, made distinct | name + hint `config.functionNameHint`, X, Y, width, height, font, remove |
| Static text | w 40, h 8, cascade | 11 | text empty (Save asks for it) | text (`multiline`, `minRows: 3`, `dir="auto"`, Enter adds a line, TPL-220), X, Y, width, height, font, remove |

`addItem(layout, addable, defaultName)` returns `{layout, item}` or null at 50: id = first free `i<n>`; with `n` = the items already there,
`xMm = (5 + 6n) % (floor(page.widthMm - wMm) + 1)`, `yMm = (5 + 6n) % (floor(page.heightMm - hMm) + 1)`, so new boxes don't land on each other and stay inside any
page, 50 × 50 mm too (TPL-216, TPL-217: on 50 × 50 the prescription text gets there through `applyPageSize`). Distinct name: `defaultName`, else `defaultName 2`, `defaultName 3`…,
the first whose trimmed, lower-cased form isn't taken (TPL-218). No `maxLength` on name and text: the rules show the message (TPL-028, TPL-030). Name and text fields: `slotProps.htmlInput.dir: "auto"`.

### 3.6 Draft and dirty (all in `TemplateDesigner`'s local state)

- **The draft lives above the desktop-only switch**: `{layout, baseline, rawInputs, selectedId, touched, serverErrors}` is state of the component that also decides state 1 of § 3.2, so narrowing the window and widening it keeps edits, selection and dirty (TPL-229). Only the display switches. The guard (§ 3.8) stays mounted below 900 px too.
- **A background refetch never overwrites the draft**: the draft is seeded once, from the first answer made since mount (`isFetchedAfterMount && isSuccess`, as `ProtocolEditorPage`): a cached copy is never shown, and later answers are ignored while a draft exists. Without a draft (no template, or just deleted) the screen follows the query.
- **Dirty** = `baseline === null || !sameLayout(layout, baseline) || rawInputs not empty`.
- **The new sheet counts as unsaved** (`baseline === null`), TPL-230, until its first save.
- **After a save the baseline is what was sent**, `normalizeLayout(draft)` at the moment of Save, not the answer and not the current draft: an edit made while the request is in flight stays and keeps the screen dirty (TPL-242).
- **The tab remounts per clinic**: `ClinicPage` keys its `PageBoundary` by the clinic id, so nothing of A's draft, selection or edits shows under B (TPL-245). Nothing to add.
- A language change touches no state: edits stay, the sheet doesn't mirror (TPL-234).

### 3.7 Font

Family **`ClinicHub Print`** (`PRINT_FONT_FAMILY = '"ClinicHub Print", sans-serif'`), `src/features/printTemplates/printFont.css` (done: four `@font-face`, `unicode-range` as the package declares). Track `frontend` copies these from `@fontsource/ibm-plex-sans-arabic` **5.3.0** (`npm pack` into a fresh empty scratch directory, `tar xzf`; no new dependency, nothing runs) into `ClinicHub.Web/public/fonts/print/`:

| From the package | To `public/fonts/print/` | Bytes |
|---|---|---|
| `files/ibm-plex-sans-arabic-arabic-400-normal.woff2` | same name | 42,848 |
| `files/ibm-plex-sans-arabic-arabic-700-normal.woff2` | same name | 44,280 |
| `files/ibm-plex-sans-arabic-latin-400-normal.woff2` | same name | 19,164 |
| `files/ibm-plex-sans-arabic-latin-700-normal.woff2` | same name | 19,504 |
| `LICENSE` (SIL OFL 1.1) | `LICENSE` | |

The sheet's text doesn't use the theme's font or `index.html`'s Google Fonts link (which stays as it is).

### 3.8 Unsaved changes (D16)

`useUnsavedGuard(dirty): {dialog}` (**stub**; called once in `TemplateDesigner`, above the desktop switch; render `dialog`):

```ts
const contextAtMount = useRef(currentContextKey());            // features/auth/session.ts
const blocker = useBlocker(({currentLocation, nextLocation}) => blocksExit({
    dirty, contextAtMount: contextAtMount.current, contextNow: currentContextKey(),
    fromPath: currentLocation.pathname, toPath: nextLocation.pathname,
}));
// blocked → ask → blocker.proceed() or blocker.reset()
// dirty → window "beforeunload" listener calling preventDefault(), as ProtocolEditorPage
// registerLeaveCheck(() => dirty ? ask() : Promise.resolve(true)), read through a ref
```

The question: `useConfirm` `{title: t("printTemplates.unsavedMessage"), confirmText: t("printTemplates.leave"), destructive: true}`: buttons `common.cancel` (stays, the focus starts here; Esc too) and `printTemplates.leave`.

| Exit (D16) | How it leaves | Guarded by | Staying |
|---|---|---|---|
| Clinic tabs | `RouterLink` (`replace`) | `useBlocker` | URL, screen, edits kept |
| Header Back | `navigate(listPath)` | `useBlocker` | same |
| Sidebar entries (permanent and drawer) | `RouterLink` | `useBlocker` | same |
| Logo | `RouterLink` | `useBlocker` | same |
| Browser Back, Forward | POP | `useBlocker`: the router undoes the POP first | URL restored, same (TPL-247) |
| Switch clinic (user menu) | `navigate("/select-clinic")` | `useBlocker` | same (TPL-248). `UserMenu` needs no change for it |
| Logout (user menu) | `logout()` changes the session first | `UserMenu` awaits `confirmLeave()` first, then `logout()` | no logout (TPL-248) |
| "Edit template clinic" (sidebar footer, `AdminLayout`) | `switchContext()` changes the session first | `EditTemplateButton` awaits `confirmLeave()` first, inside its `once` | no switch |
| Close, reload | Browser | `beforeunload` (the browser's own prompt) | |
| Session lost (refresh 401, logout in another tab) | `RequireAuth`'s `<Navigate to="/login">` | **Never blocked** | |
| Context lost (clinic or platform access gone, another tab's switch, another user) | `RequireAuth`'s `<Navigate>`, `AuthProvider`'s `navigate` | **Never blocked** | |

- **A forced move is told apart by the session**: `blocksExit` compares `currentContextKey()` (`"none"` when logged out) with its value when the guard mounted. Every forced move changes it before navigating, and the move's own toast already says why. Usually the designer has unmounted by then as well (`RequireAuth` stops rendering the outlet, and effect clean-ups run before the `Navigate`'s effect); the check covers `AuthProvider`'s direct `navigate`, which runs before React re-renders (TPL-249).
- **A confirmed exit doesn't ask twice**: `blocker.proceed()` navigates with the blocker in `proceeding`, which the router doesn't consult. Logout and "Edit template clinic" ask through `confirmLeave()`; their later `navigate` happens with the session changed, so `blocksExit` is false. A logout or switch that **fails** changes nothing: the screen stays dirty and the next exit asks again.
- **`Navigate` redirects**: none renders inside the designer. The ones above it (`RequireAuth`) are forced moves. A same-path navigation (query, hash, the current tab pressed again) isn't an exit.
- **Under `renderWithProviders`** the session store is never started: `currentContextKey()` stays `"none"`, so the guard blocks, as it should. Forced moves need the real session: `startApp` (TPL-249). The same goes for the second half of logging out and "Edit template clinic".
- Clean-ups: the blocker on unmount, the `beforeunload` listener when not dirty, the registered check on unmount.

**The router** (`App.tsx`, track `frontend`, § 6 of the design): extract `AppRoutes` (the existing `<Routes>`, unchanged), and inside `App`: `const [router] = useState(() => createBrowserRouter([{path: "*", element: <AppProviders><AppRoutes/></AppProviders>}]))` + `<RouterProvider router={router}/>`, so each `startApp` reads its own URL. The `path: "*"` parent makes the `<Routes>` descendants; links here are absolute, and `AuthProvider`'s `useNavigate` works under the data route. No `dispose`: an old router left in a test only hears `popstate` and has no subscriber or blocker. `full` on CI is the check (TPL-250).

---

## 4. Test support (done)

### 4.1 `src/test`

- `render.tsx`: `renderWithProviders(ui, {dataRouter: true})`: `createMemoryRouter` with the same providers and the same result, plus `router` (`router.navigate(-1)` is the browser's Back). Default stays `MemoryRouter`. `renderAdmin` passes the option through.
- `data.ts`: `aTemplateItem(kind, fields?)` (the design's example box per kind; id `i<nextId>`), `aPrintLayout(fields?)` (layout L: A5, prescription text, manual input «الاسم», full date), `aPrintTemplate(fields?)`.
- `msw.ts`: `printTemplateHandlers(clinicId, {template = null, stateful = false})`: GET answers `template` or 204, PUT answers the body as saved, DELETE 204; `stateful` makes writes change what GET answers. Errors per test: `http.put(api(…), () => problem(400, "templatePageInvalid", {errors: [{code, field}]}))`, registered after.
- `app.tsx`: `LAZY_PAGES` holds `ClinicPrintTemplateTab`. It needs no other change: `startApp` sets the URL, then imports `App` on fresh modules, and `App` creates its router at mount. `setup.ts` needs none either.
- `pages/AdminRoutes.tsx` imports the tab. **`pages/printTemplate.tsx`** (new): `renderPrintTemplateTab({clinic, template, stateful = true, layout, lang…})` (the admin routes at the tab's URL on a data router, API answered; returns `clinic`, `router`, `user`…), `sidePanel()`, `sheetArea()`, `settingsPanel()`, `panelEntry(label)`, `sheetItem(name)`, `settingsField(label)`, `typeInField(user, field, value)`.

### 4.2 Shared rule cases: `tests/fixtures/print-layout-cases.json` (done, 96 rows + 10 rounding rows)

Expected values from § 1.4, schema in `tests/fixtures/README.md`: `{ids, name, valid, layout, errors: [{field, code}]}`; `errors` is the exact, ordered list. **C#**: `SavePrescriptionTemplateCommand.From(layout)` + the validator; `PrescriptionLayoutRules.Round` on `rounding`. **TypeScript**: `validateLayout(layout)`; `roundTenth` on `rounding`. A row changes through the session (both sides).

### 4.3 Integration

`tests/ClinicHub.IntegrationTests/Admin/PrescriptionTemplates/LayoutBuilder.cs` (done): `Route(clinicId)`, `A5`, `A4`, `Custom(w, h)`, `L()`, `Layout(page, items…)`, `Text(…)`, `Manual(name, …)`, `Function(function, name, …)`, `FullDate(name)`, `Static(text, …)`, `.With(items…)`, `ManyManual(count)`. Wrong types and missing fields: `ApiClient.SendRawAsync`. Classes carry `[Trait("Area", "admin")]`; new collection `admin-7` in `AdminCollections.cs` (`AdminRoutes.Every`, "the 15 routes" of ADM, is left alone: TPL-007 and TPL-008 list the three template routes themselves).

### 4.4 E2E

`e2e/admin/print-template.spec.ts` and friends, tagged `@area:admin`. Locators by the names of § 3 (`getByRole("region", {name: "إضافة إلى الورقة"})`, `getByTestId("template-sheet")`, `[data-item-id]`); measuring a box: its bounding box against 1 mm = 96 / 25.4 CSS px.

### 4.5 Existing tests that must change

Nothing fails from the contract itself but what this table says; with the code:

| Test | Why |
|---|---|
| `tests/ClinicHub.UnitTests/Errors/ErrorCodeTextsTests.cs` `DocumentedClasses` | The new error class (fails until named there) |
| `src/i18n/locales/locales.test.ts:79-87` (ERR-030) | Add the 10 codes to its list (passes without; the case asks) |
| `src/i18n/locales/docMessages.test.ts` `DOCS` (I18N-013) | The new `business.md` joins it, every row of its table mapped |
| `e2e/admin/layout.spec.ts:113,150` (ADM-282, ADM-283) | Open the new tab. ADM-282's "no English UI string" check exempts the designer's own Latin: X, Y, A5, A4, ISO, JavaScript |
| `src/features/auth/components/UserMenu.test.tsx` ("logs out") | Logout now awaits `confirmLeave()`: assert after a `waitFor` if a microtask late |

`AdminLayout`'s "Edit template clinic" tests await their result already. The integration suite needs the migration (EF refuses to migrate with pending model changes).

---

## 5. Work split

Each track: branch `print-templates/<track>`, its own git worktree, from this contract's commit; scratch database `drags_print_templates_<track>` only if needed (dropped at the end); ports from its block. Never `drags`, Rider (:5000), Vite (:5173). All tests run on CI (`./ci.ps1`, pushing the track's branch is allowed). Test writers read the docs and this contract, never the coders' diff. Commits plain, no AI attribution.

| Track | Role | Ports | Owns (no file has two owners) | Delivers |
|---|---|---|---|---|
| `backend` | coder | 5600–5609 | `ClinicHub.Application/Features/Prescriptions/**`, `ClinicHub.Domain/Prescriptions/**`, `ClinicHub.Infrastructure/Database/Configurations/Prescriptions/**`, `ClinicHub.Infrastructure/Migrations/*AddPrescriptionTemplates*` + the snapshot, `ClinicHub.Api/Features/Platform/AdminPrescriptionTemplateController.cs`; docs `docs/tech/overview.md` (API table, data model, layout, routes, error classes, the data router in App shell, the migration history) | §§ 1.3–1.5, the migration |
| `frontend` | coder | 5610–5619 | `src/features/printTemplates/**` (not tests), `src/features/admin/{adapters.ts,clinicTabs.tsx,components/ClinicPrintTemplateTab.tsx,components/AdminLayout.tsx}`, `src/features/auth/components/UserMenu.tsx`, `src/app/App.tsx`, `public/fonts/print/**`, `src/i18n/locales/{en,ar}.ts` (changes through the session); docs `docs/features/prescription-templates/{tech,business}.md` (from `_template`, moved from the design; only step 1's rules and message rows), `docs/business/overview.md`, `docs/features/platform-admin/{tech,business}.md`, `docs/features/protocols/tech.md:160` (the stale "BrowserRouter has no blocker" reason; behavior unchanged) | §§ 2.2, 3 |
| `tests-backend` | test writer | 5620–5629 | `tests/ClinicHub.UnitTests/Prescriptions/Templates/**`, `tests/ClinicHub.UnitTests/Errors/ErrorCodeTextsTests.cs`, `tests/ClinicHub.UnitTests/ClinicHub.UnitTests.csproj` (fixture link), `tests/ClinicHub.IntegrationTests/Admin/PrescriptionTemplates/**`, `tests/ClinicHub.IntegrationTests/Admin/{AdminCollections.cs,README.md}`, `tests/fixtures/**`; **`docs/testing/test-catalog.md`** (all step 1 rows: new area TPL, the changed ADM, UX, ERR, I18N rows, the summary), **`tests/tools/traceability/traceability.ps1`** (area list) | its cases |
| `tests-frontend` | test writer | 5630–5639 | `src/features/printTemplates/**/*.test.ts(x)`, `src/features/admin/components/ClinicPrintTemplateTab*.test.tsx`, `src/features/auth/components/UserMenu.test.tsx`, `src/app/App.*.test.tsx`, `src/i18n/locales/{locales,docMessages}.test.ts`, `src/test/**`, `e2e/admin/**`, `e2e/ux/pages.spec.ts`, `e2e/support/**`, **`vite.config.ts`** (`PURE_LOGIC`), **`stryker.config.json`**, **`vitest.stryker.config.ts`** | its cases |

Rules: nobody edits another track's files; a rule or contract change goes through the session to both sides. Coders run build (0 warnings), `tsc -b`, `eslint src e2e`, and the backend the EF pending-changes check. The two coders and the two test writers can run in parallel (4 agents). T2: merge all into the feature branch, `./ci.ps1 -Tier full` in report mode, 3 times.

**Stryker (T5):** `./ci.ps1 -Mutate <file> -Area admin`, one job per file: `ClinicHub.Application/Features/Prescriptions/Templates/PrescriptionLayoutRules.cs`, `…/Commands/SavePrescriptionTemplate/SavePrescriptionTemplateCommandValidator.cs`, `…/Commands/SavePrescriptionTemplate/SavePrescriptionTemplateCommandHandler.cs`, `…/Commands/DeletePrescriptionTemplate/DeletePrescriptionTemplateCommandHandler.cs`, `…/Queries/GetPrescriptionTemplate/GetPrescriptionTemplateQueryHandler.cs`. StrykerJS (`PURE_LOGIC`, `stryker.config.json` `mutate`, `vitest.stryker.config.ts`): `src/features/printTemplates/layout.ts`, `src/features/printTemplates/unsavedGuard.ts`. `layout.parity.test.ts` reads a file outside `ClinicHub.Web`, so Stryker leaves it out: `layout.test.ts` carries its own rows.

### Cases per test track

Every step 1 case is in exactly one track, except the halves named. **Shared cases:** the C# half of TPL-020…032 and TPL-208…214 is `tests-backend`'s (unit: the fixture runner + direct validator tests; api where the level says). The `layout.ts` half is `tests-frontend`'s: `layout.parity.test.ts` runs every fixture row, tagged `@TPL-048`, and `layout.test.ts` proves the same rules directly, tagged with the narrower IDs it proves. TPL-209 and TPL-210 are listed on both sides.

#### `tests-backend`: 38 (xUnit)

| ID | P | Level | Note |
|---|---|---|---|
| TPL-001 | P0 | api |  |
| TPL-002 | P0 | api |  |
| TPL-003 | P0 | api |  |
| TPL-004 | P0 | api |  |
| TPL-005 | P2 | api |  |
| TPL-006 | P0 | api |  |
| TPL-007 | P0 | api |  |
| TPL-008 | P0 | api |  |
| TPL-009 | P2 | api |  |
| TPL-010 | P1 | api |  |
| TPL-020 | P0 | unit+api |  |
| TPL-021 | P1 | unit+api |  |
| TPL-022 | P1 | unit |  |
| TPL-023 | P1 | unit |  |
| TPL-024 | P1 | unit |  |
| TPL-025 | P1 | unit |  |
| TPL-026 | P1 | unit |  |
| TPL-027 | P1 | unit |  |
| TPL-028 | P2 | unit |  |
| TPL-029 | P1 | unit |  |
| TPL-030 | P1 | unit |  |
| TPL-031 | P2 | unit |  |
| TPL-032 | P1 | unit |  |
| TPL-033 | P2 | api |  |
| TPL-200 | P1 | api | up → down → up on a database at the previous migration |
| TPL-201 | P2 | api |  |
| TPL-202 | P1 | api |  |
| TPL-203 | P1 | api |  |
| TPL-204 | P2 | api |  |
| TPL-205 | P2 | api |  |
| TPL-206 | P2 | api |  |
| TPL-208 | P1 | unit |  |
| TPL-209 | P1 | unit+ui | C# half: `From` rounds; a body with 12.34 is stored and answered as 12.3 |
| TPL-210 | P2 | unit | C# half (fixture) |
| TPL-211 | P1 | unit |  |
| TPL-212 | P2 | unit |  |
| TPL-213 | P2 | unit |  |
| TPL-214 | P2 | unit |  |

Also ERR-030's C# half (`ErrorCodeTextsTests`), P1, unit, and `Catalog/Migrations`-style kit for TPL-200 inside `Admin/PrescriptionTemplates`.

#### `tests-frontend`: 56 + the halves (Vitest against MSW; Playwright)

| ID | P | Level | Note |
|---|---|---|---|
| TPL-040 | P1 | ui |  |
| TPL-041 | P0 | ui |  |
| TPL-042 | P0 | ui |  |
| TPL-043 | P0 | ui |  |
| TPL-044 | P0 | ui |  |
| TPL-045 | P1 | ui |  |
| TPL-046 | P1 | ui |  |
| TPL-047 | P1 | ui |  |
| TPL-048 | P1 | ui | + `layout.parity.test.ts` over the fixture |
| TPL-049 | P1 | ui |  |
| TPL-050 | P1 | ui |  |
| TPL-051 | P0 | e2e |  |
| TPL-052 | P1 | ui |  |
| TPL-053 | P1 | ui+e2e | both levels: `setViewportWidth(899)` / `(900)`; e2e at 375 and 1280 px |
| TPL-054 | P1 | e2e |  |
| TPL-055 | P2 | ui |  |
| TPL-056 | P1 | e2e |  |
| TPL-057 | P1 | ui |  |
| TPL-058 | P1 | ui |  |
| TPL-207 | P2 | ui |  |
| TPL-209 | P1 | unit+ui | ui half: the request holds 12.3; `layout.ts` |
| TPL-210 | P2 | unit | `layout.ts` half (fixture + direct) |
| TPL-215 | P0 | ui |  |
| TPL-216 | P1 | ui | with `layout.ts` unit tests |
| TPL-217 | P2 | ui | with `layout.ts` unit tests |
| TPL-218 | P1 | ui | with `layout.ts` unit tests |
| TPL-219 | P0 | ui |  |
| TPL-220 | P1 | ui |  |
| TPL-221 | P1 | ui |  |
| TPL-222 | P1 | unit+ui | both levels |
| TPL-223 | P1 | unit | `layout.ts` |
| TPL-224 | P1 | ui |  |
| TPL-225 | P1 | e2e |  |
| TPL-226 | P2 | ui |  |
| TPL-227 | P1 | e2e |  |
| TPL-228 | P1 | e2e |  |
| TPL-229 | P2 | ui |  |
| TPL-230 | P1 | ui |  |
| TPL-231 | P2 | ui |  |
| TPL-232 | P1 | ui+e2e | both levels |
| TPL-247 | P1 | e2e |  |
| TPL-248 | P1 | ui+e2e | both levels; the leaving half through `startApp` |
| TPL-249 | P1 | ui | `startApp`: the real session |
| TPL-250 | P0 | e2e |  |
| TPL-233 | P2 | ui |  |
| TPL-234 | P2 | ui |  |
| TPL-235 | P1 | ui |  |
| TPL-236 | P2 | ui |  |
| TPL-237 | P2 | ui |  |
| TPL-238 | P1 | ui |  |
| TPL-239 | P1 | e2e |  |
| TPL-240 | P1 | ui |  |
| TPL-241 | P2 | ui |  |
| TPL-242 | P2 | ui |  |
| TPL-243 | P1 | ui |  |
| TPL-244 | P1 | unit | `locales.test.ts` |
| TPL-245 | P1 | ui |  |
| TPL-246 | P1 | e2e |  |

Existing cases changed in step 1:

| ID | P | Level | Track | What |
|---|---|---|---|---|
| ADM-098 | P2 | e2e | `tests-frontend` | The row lists «قالب الطباعة» and `/print-template`; no test is tagged today: tag or write one (a reload keeps the tab) |
| ADM-282 | P1 | e2e | `tests-frontend` | `e2e/admin/layout.spec.ts:113` opens the new tab |
| ADM-283 | P1 | e2e | `tests-frontend` | `e2e/admin/layout.spec.ts:150` opens the new tab, the desktop-only message at 375 px |
| UX-036 | P1 | e2e | `tests-frontend` | `e2e/ux/pages.spec.ts` adds the designer (the pop-up is step 2) |
| I18N-006 | P1 | e2e | `tests-frontend` | The same spec adds the designer |
| ERR-030 | P1 | unit | both | `locales.test.ts`'s list (`tests-frontend`); `ErrorCodeTextsTests.DocumentedClasses` (`tests-backend`) |
| I18N-013 | P0 | unit | `tests-frontend` | `docMessages.test.ts` `DOCS` adds `docs/features/prescription-templates/business.md` |
| RX-075, UX-004, UX-014 | | | **step 2** | Left as they are |

---

## 6. Decided in the contract

1. **`nameRequired`, not `templateItemNameRequired`** (TPL-211 vs § 5): `nameRequired`; 10 `template*` codes, not 12. Both lines of the test-case file are corrected.
2. **TPL-243 quotes «الاسم أطول من 60 حرفًا.»**; the system's text is «الاسم طويل جدًا.» (`errors.nameTooLong`, also the clinics', roles', staff's). The business file says names use the usual messages, so the shared text stays and the test expects it. TPL-243's line is corrected to match.
3. Item id: `^[A-Za-z0-9_-]{1,40}$`, else `templateLayoutInvalid`; the SPA makes `i<n>`.
4. Missing number: `invalidRequest` naming it (like `isActive`), never 0. Missing `schemaVersion`: `templateLayoutInvalid`. A numeric string (`"12"`) is accepted (ASP.NET web defaults); `kind: 5` is a wrong type, so `invalidRequest`; an unknown string kind is `templateLayoutInvalid`.
5. The PUT binds `PrescriptionLayoutDto` directly, no request record.
6. A null element in `items`: `templateLayoutInvalid` on `items[i]`.
7. Over 50 items: only `templateTooManyItems`; no text count, no item rules.
8. An unknown kind skips the item's other rules. A page that fails skips the "outside" checks, not the sizes or fonts.
9. Order inside an item: id, kind, function, name, text, X, Y, width, height, font: the settings panel's order, so the first message is the first field.
10. "Outside" names X or Y, also for an item too big for the sheet (`items[i].xMm`); a negative length counts as a size error only.
11. A repeated id or name refuses the later item.
12. U+2028 and U+2029 are refused in static text ("the same characters refused"): line breaks are `\n` and `\r`.
13. Static text counts as typed: `\r\n` is 2; no trim, stored as sent. Blank = only spaces or invisible format characters.
14. Name comparison: `ToLowerInvariant` / `toLowerCase`; they differ on a few letters such as Turkish `İ`: accepted, the server decides.
15. Empty number field: `printTemplates.numberRequired` («أدخل رقمًا.»), also for text that isn't a number; the item keeps its last number meanwhile; Save blocked. An item's negative or off-sheet number **is** applied and refused by the rules, never corrected.
16. Save is disabled while clean and while saving. Delete shows once saved.
17. A field's message shows once the field changed, or after a Save pressed; so a new static text doesn't start red.
18. New static text: empty, box showing the kind's label dimmed. Default names follow the UI language at the moment of adding, through the kind's label, and stay as stored.
19. Cascade: `(5 + 6n) % (floor(sheet - length) + 1)`; default sizes 40 × 8 (manual, static), 30 × 8 (function); ids `i<n>`.
20. The prescription text isn't a panel entry. No selection on load or on a new sheet. A click on the bare sheet keeps the selection. Removing an item asks nothing.
21. Item boxes are native `<button aria-pressed>`; the sheet's scroll area is the `region`, focusable; the panel and settings are `region`s.
22. Below 900 px the message replaces every state, the empty state too; the GET still runs.
23. Panel at 50 items: addable entries disabled + an info `Alert` with `errors.templateTooManyItems`.
24. On a failed Save: always a toast, plus the field's message when one is named; a message from `validateLayout` needs no toast unless no field shows it.
25. **Switching clinic isn't routed through the registered check**: it is a plain navigation, so the blocker asks, with the same dialog and the same result (TPL-248). Only exits that change the session first use `confirmLeave()`: logout and "Edit template clinic". That sidebar-footer button isn't named in D16 but leaves through the sidebar, so it is guarded.
26. The question's buttons: `common.cancel` stays (and Esc), `printTemplates.leave` («خروج») leaves; a destructive dialog, the focus on Cancel.
27. A same-path navigation isn't an exit.
28. Font: Arabic and Latin subsets only, woff2 only, four files; other scripts use the fallback. Family name `ClinicHub Print`.
29. Layout grid: three columns ≥ `lg`; settings below the two others from `md` to `lg`.
30. Labels with no text in the docs (all of `printTemplates.panel.*`, `page.*`, `config.*`, `sheet.*`, `leave`): written here; see § 7 for the messages.

## 7. Open for the design session

These change what users read beyond the business file; the contract holds a proposal so it compiles:

1. **Messages not in the business file's table:** `errors.templateLayoutInvalid` «بيانات القالب غير صحيحة.» (only an old SPA or a hand-made request sees it), `printTemplates.numberRequired` «أدخل رقمًا.», the toast `printTemplates.deleted` «تم حذف القالب». Approve the wording; approved rows join the table of `docs/features/prescription-templates/business.md`, since I18N-013 maps every row.
2. **TPL-243's quote** (§ 6 item 2): the line now says «الاسم طويل جدًا.», per the business file's "usual messages". Tell the session if the user wants a template-specific text instead.
