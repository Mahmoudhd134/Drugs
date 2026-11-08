# Dynamic forms: design

Status: **approved** (user, T0, 2026-11-09). Nothing is built yet. Attachments part 2 is on `main` (D19).
Companion: [business (Arabic)](../features/dynamic-forms/business.md). Each feature's contract and test cases are added when its sub session starts. When all is built, this moves into `docs/features/dynamic-forms/`, the overviews and the [test catalog](../testing/test-catalog.md).

Builds on: [tech overview](../tech/overview.md), [backend architecture](architecture.md), [platform admin](../features/platform-admin/tech.md), [testing README](../testing/README.md). Starting point, not code to copy: the POC at `C:\Users\mahmoud.nasser\Projects\SideProjects\POCs\DynamicFormBuilderUsingReact`.

---

## 1. Goal

A separate module where the super admin builds forms by dragging controls into layouts, saves them on the server and previews them. Later every كشف (exam or encounter, in any specialty) will have its own form, so the controls are generic or repeat across many exams, and the module ships **no medical content**.

**Done when:** the super admin creates a form, drags controls from the categorized palette into nested layouts, saves it, reopens it on another computer and previews it (expressions running, rules checked), in Arabic and English. The form has exactly one active version, and the versioning path is proved by tests even though nothing uses it yet.

## 2. Decisions (user, 2026-11-06)

| # | Decision |
|---|---|
| D1 | **A separate module**: no interaction with any other module for now |
| D2 | **Layouts only, no canvas**: the POC's free canvas and everything that exists only for it are dropped |
| D3 | **Expressions execute functions** through `new Function`, as in the POC. **An accepted decision**: only the super admin writes definitions, and this isn't raised again |
| D4 | **No backend validation of form content.** The server checks only the outer shell (§ 4.3) |
| D5 | **Definitions are saved on the server**, in a form module with versioning. No browser storage |
| D6 | **Versioning:** when a form is used or has a submission, saving makes a new version. There is no consumer yet, so the check exists and always answers "no new version needed" |
| D7 | **Exactly one active version per form**, never more and never fewer |
| D8 | **Soft delete only**: a deleted form's rows stay, marked by both `IsDeleted` and `DeletedAt`. No restore for now |
| D9 | **Super admin only**, in the admin area. Forms are the platform's, not a clinic's; a link to clinics may come later |
| D10 | **No fill screen and no saved entries** for now, but **Preview looks exactly like the fill screen**: the same renderer the fill screen will use (§ 5.5) |
| D11 | **Images go through the attachments module** (§ 7), the one exception to D1. Forms never hold a file inline |
| D12 | **Generic controls, no medical content**: no specialty presets, clinical option lists, normal ranges or exam templates. Whoever builds a form supplies that content |
| D13 | **Palette:** controls are in categories, all listed in the side panel, each collapsible. Only the first, Basics, is open by default |
| D14 | **Four features on a feature branch**: `dynamic-forms`, with this session as orchestrator (§ 9) |
| D19 | **Everything waited for attachments part 2**: no contract, code or feature session before it reached `main`. Met: it merged in PR #12 |

Proposed by the design session and not objected to:

| # | Decision |
|---|---|
| D15 | RJSF stays, as the HLD says: `@rjsf/core`, `@rjsf/utils`, `@rjsf/validator-ajv8` and `@rjsf/mui` 6.11 (its peers accept React 19 and MUI 7), loaded only with the forms pages. Widgets are ours, on MUI |
| D16 | The builder is computer only (below 900 px, the print designer's `desktopOnly` message); the list and Preview work on a phone |
| D17 | Explicit Save with the print designer's unsaved-changes guard. No undo in the first version |
| D18 | Each form has a direction setting (RTL or LTR), starting from the UI language. Form content is stored as typed and isn't translated; the builder and validation messages follow the UI language |

## 3. POC pieces

| Piece | Goes in | Feature |
|---|---|---|
| Tree operations, registries, `buildForm`, layout template, drag and drop, properties panel | Yes, rewritten on MUI with i18n | 2 |
| Box, Section, Columns, Table, Heading, Paragraph, Divider | Yes | 2 |
| Style panel (span, phone span, width, look, hide on phone or desktop) | Yes | 2 |
| Expressions, computed values, the editor | Yes | 2 |
| OD/OS block | Yes, generalized to a paired block with typed labels and no default measurements | 3 |
| Drawing | Yes, built-in backgrounds only | 3 |
| Free canvas (`FreeCanvas`, `CanvasPage`, `templates/canvas`, `rect`, `page`, `mode`, zoom) | No | |
| Shape | No: only the canvas templates use it | |
| Image, uploaded backgrounds | Yes, through attachments instead of the POC's inline data URLs (D11) | 4 |
| Eye exam and fundus templates, clinical lists | No (D12) | |
| The JSON tab | No: a developer tool | |

## 4. Feature 1: backend

### 4.1 Tables

Platform rows, like drug categories: no `ClinicId`, and every route is `PlatformAdmin`.

```
Forms (Forms)
- Id (int PK), Name (<=256), SearchName (filled by the app), ActiveVersionNumber (int NOT NULL),
  IsDeleted (bool NOT NULL DEFAULT false), DeletedAt (timestamptz null), CreatedAt, UpdatedAt
  (soft delete sets IsDeleted and DeletedAt together, in the one place that deletes)
FormVersions
- FormId (FK Forms, restrict), VersionNumber (int, from 1), PK (FormId, VersionNumber),
  Definition (text: the form's JSON; nothing queries inside it), CreatedAt, UpdatedAt
```

**One active version (D7):** a required column holds one value, so a form can't have zero or two active versions. A composite foreign key `(Id, ActiveVersionNumber)` to `FormVersions`, `DEFERRABLE INITIALLY DEFERRED` and added by raw SQL in the migration, proves that the version exists. It is checked at commit, because the form and its first version are inserted together.

The migration `AddForms` adds two empty tables and touches no existing row. Down drops the raw foreign key first (the cycle blocks either `DROP TABLE`), then the tables. The two tables join the exclusions of the migration tests that compare the schema across a down and up (`AttachmentMigrationTests`, `TemplateMigrationTests`).

### 4.2 Versioning

```csharp
public interface IFormUsage
{
    Task<bool> IsUsedAsync(int formId, CancellationToken ct = default);   // NoFormUsage: always false, until a consumer exists
}
```

Saving a form, in one transaction. "Unchanged" means `JsonElement.DeepEquals`, so key order and whitespace never make a version:
- **The definition is unchanged:** only the name changes, and no version does.
- **It changed, form not used** (always, for now): the active version's definition is replaced, and the number stays.
- **It changed, form used** (never, for now): a new version takes the next number and becomes active. The old one stays as it was.

Every PUT calls `db.Touch(form)`, so the list's "last edited" moves even when only `FormVersions` changed (an unchanged row isn't stamped). Both paths are built, and the "used" path is proved by replacing `IFormUsage` in integration tests. Two saves racing on the "used" path are a documented near-impossible case: the second answers 500 `unexpected`, as the print template documents for its own race. Otherwise the last write wins.

Not built, since every form stays on version 1 until a consumer exists: a version history screen, a list-versions route, and a route to switch the active version.

### 4.3 API (`/api/v1/admin/forms`)

| Method | Route | Purpose |
|---|---|---|
| GET | `?search=&page=1&pageSize=20` | Paged `FormSummary { id, name, activeVersionNumber, updatedAt }`, not deleted, by name (prefix matches first when searching) |
| GET | `/{id}` | `FormDetails`: the summary + `definition` (the active version's JSON) |
| POST | `/` | `{ name, definition }` → 201 + `FormDetails`, version 1 active |
| PUT | `/{id}` | `{ name, definition }` → `FormDetails` (§ 4.2) |
| DELETE | `/{id}` | Soft delete → 204 |

- Duplicate is a POST from the screen with the active definition and a new name.
- A missing or deleted id → 404 `notFound`, also on a second DELETE. A deleted form's name can be used again, and names may repeat.
- A clinic token → 403 (`PlatformAdmin`). No permission keys.
- **Outer shell only (D4):** `ValidName()`; `definition` present and a JSON object (`formDefinitionInvalid`); at most 1 MB of JSON text (`formDefinitionTooLarge`, `FormLimits`: about 170 times the POC's eye exam). `schemaVersion`, controls and field names inside it are never read.
- Deleted forms are excluded by `db.Forms.NotDeleted()` (on `IsDeleted`) with no query filter, as clinics do.

### 4.4 Where it lives

Domain `Forms/` (`Form`, `FormVersion`); Application `Features/Forms/Definitions/` (`FormDto`s, `FormErrors`, `FormLimits`, `IFormUsage` + `NoFormUsage`, `Commands/` CreateForm, SaveForm, DeleteForm, `Queries/` GetForms, GetForm); `Database/Configurations/Forms/`; Api `Features/Forms/AdminFormsController`. New test area `forms` (`Forms/` in the integration tests, `Data.Form()`; in `test.ps1`, `$allAreas` and `$areaMap` with a `Database/Configurations/Forms/` entry), and the case IDs `FRM-`.

## 5. Feature 2: builder

### 5.1 Screens

Under a new "Forms" / «النماذج» entry in `ADMIN_NAV_ITEMS`.

| Route | Screen |
|---|---|
| `/admin/forms` | Paged list with search (kept in the URL): name, last edited; New (hidden below 900 px), Duplicate, Delete (`useConfirm`, destructive) |
| `/admin/forms/new` | The builder on an unsaved draft; the first Save creates the form and replaces the URL. Below 900 px: the `forms.desktopOnly` message |
| `/admin/forms/:id` | Builder and Preview tabs. Below 900 px: Preview of the saved form only, with `forms.desktopOnly` as a note |

**Duplicate** stays on the list: it reads the form, then creates a copy named from `forms.copyName` («نسخة من الاسم», cut to 256 characters). A form gone by then shows `notFound` and refreshes the list.

**The unsaved-changes guard** moves from `features/printTemplates` to shared code, since forms mustn't depend on print templates. The first Save navigates only after the saved state is in place, so a successful save never asks.

### 5.2 Definition

The JSON the server stores. The name lives on the form, not in here.

```ts
interface FormDefinition { schemaVersion: 1; dir: "ltr" | "rtl"; nodes: FormNode[] }
type FormNode = FieldNode | ElementNode;
interface NodeBase { id: string; style?: NodeStyle; hidden?: boolean; expressions?: Record<string, string> }
interface FieldNode extends NodeBase { kind: "field"; type: string; name: string; label: string; required: boolean; hideLabel?: boolean; disabled?: boolean; config: unknown }
interface ElementNode extends NodeBase { kind: "element"; type: string; config: unknown; slots: FormNode[][] }
```

- Layout never changes the data's shape: `{ [name]: value }`, flat.
- **Field names:** `^[A-Za-z_]\w*$` (an expression must be able to read `model.name`), not `__proto__`, `constructor` or `prototype`, unique in the form, filled automatically (`text_1`). An invalid or repeated name shows red and refuses Save with a message.
- **A type the registry doesn't know** never crashes: the builder shows a "not available" card that keeps the node as it is, and Preview skips it.
- **A definition this build can't read** (no `nodes`, or a newer `schemaVersion`; the server doesn't check, D4) opens as a "can't open this form" state with Save disabled, so it's never rewritten as version 1. The form can still be deleted.
- **Direction:** the form's content gets its own `CacheProvider` and `ThemeProvider` for `dir`, since the app's are for the UI's direction and flip MUI's `left` and `right`: an LTR form in the Arabic UI must not stay mirrored.

### 5.3 Palette

- `PALETTE_CATEGORIES` is an ordered list; each control and element names its category. Categories in this feature: **Basics, Layout, Content**. Feature 3 adds its own with one line each.
- An accordion with several panels allowed open at once. On opening the builder, only the first is open.
- A search box above it filters by label, with the app's search rules (أ/ا and so on); matching categories open while searching, and clearing it restores what was open.
- **Without a mouse:** Enter or a click on a palette item adds it after the selected node or into the selected container, and a selected node has move up, move down and delete buttons. Deleting a container that holds anything asks first; a field goes at once.

### 5.4 Controls and elements

| Category | Items |
|---|---|
| **Basics** | Short text, long text, number, dropdown, radio, checkboxes, yes/no, date, time |
| **Layout** | Box (stack, row, grid), Section (collapsible option), Columns, Table, Tabs |
| **Content** | Heading, paragraph, divider, note box |

The control contract comes from the POC (`defaultConfig`, `ConfigEditor`, `Builder`, `Widget`, `toSchema`, `validate`), with a `labelKey`, an icon and a category added. It also keeps the POC's `fields` generator. **Feature 2's contract must prove, with a test control, that a generated group of flat fields and an array of objects both reach Check's data**, because feature 3's paired block, blood pressure, repeating rows and drawing rest on them. RJSF's `omitExtraData` empties an object with no declared properties, so an item schema declares its `properties` or `additionalProperties: true`.

Control logic with rules (BMI, a scored total) sits in a `logic.ts` beside its control. `PURE_LOGIC` and the StrykerJS list name files, not folders, so each one is added to both.

Rules:
- When a Table or Tabs shrinks, the children of removed slots move to the last remaining slot; nothing is lost. Table keeps a child's row and column where it can.
- A hidden tab or collapsed Section stays mounted. When Preview's check finds an error inside one, it opens it and goes to the first error.
- **"Hide on phone or desktop" is offered on Content elements only.** It's a display class, so a required field hidden that way would block Check with an error nobody can see.

### 5.5 Preview

Preview is the fill screen without saving (D10). One component, `FormRenderer` (a definition, the values, a submit handler), draws the form with its title and a submit button, with no builder look at all; the fill screen will reuse it and only add saving. Around it sits a thin Preview bar, apart from the form, holding Check, Clear and the device widths.

The form is the current draft's, with expressions running. **Check** is the renderer's submit: it runs the rules and shows the errors, or the resulting data read only, below the form. **Clear** empties it. Nothing is saved, and values go when the page does. Device width buttons (full, 768, 390 px) appear from 900 px up. RJSF's validator messages are English, so `transformErrors` maps each keyword to `forms.validation.*` in both locales.

### 5.6 Expressions (D3)

As in the POC: any path on a node (`label`, `required`, `hidden`, `disabled`, `config.*`, `style.*`) bound to a JavaScript expression that sees `model`, `field` and `formState`, in order; `model.<name>` writes computed data, re-run until it stops changing, at most 5 passes. A failed expression is skipped and shows its error in the editor.

**A node hidden by `hidden`** is out of the data everywhere: Check's result (`omitExtraData`) and what expressions read, so a computed total never counts a field Check drops (`omitExtraData` alone runs only at submit, so the model passed to expressions is filtered too). Its typed value is kept while Preview is open, and it comes back if the node is shown again.

The editor suggests paths, shows the live result against Preview's data, and warns on an unknown field. An expression that never returns hangs the tab: accepted with D3.

### 5.7 Where it lives

`src/features/forms/`: `api.ts`, `types.ts` (repo convention), `definition/` (tree, nodes, `buildForm`, expressions, style: pure logic, added to `PURE_LOGIC` and the StrykerJS list), `controls/<control>/`, `elements/<element>/`, `components/` (palette, canvas, properties, preview, drag), `pages/`. Strings under `forms.*`, `admin.nav.forms`, `errors.formDefinition*`.

## 6. Feature 3: extensions

Only more controls; each is a folder plus one registry line, so tracks run in parallel by category.

| Category | Items |
|---|---|
| **Advanced inputs** | Date and time, date range, duration, number with unit, slider, rating, searchable dropdown, multi-select chips, free tags, rich text (the app's `QuillEditor`) |
| **Scales and scores** | Number scale (chosen range), labeled scale, scored list with automatic total |
| **Measurements** | Blood pressure, height/weight with BMI; shortcuts for temperature, pulse, respiratory rate, SpO2 and glucose (a number with a label and a unit). No normal ranges built in: the author sets any out-of-range flag |
| **Paired and repeating** | Paired block (typed measurements and side labels, Right/Left by default), right/left/both picker, repeating rows |
| **Diagrams and drawing** | Drawing on a built-in background (blank, body front and back, face outline, the POC's fundus and anterior diagrams: schematic SVGs, not medically exact), numbered pins with a note on each, signature |

## 7. Feature 4: images

A palette category **Images**, on attachments part 2's components ([attachments](attachments.md) § 12).

| Item | What it does |
|---|---|
| **Image element** | A picture shown in the form, such as a logo or a diagram; the super admin uploads it while building |
| **Custom drawing background** | The same upload, used behind feature 3's drawing control |
| **Image upload field** | Whoever fills the form attaches a photo. With no fill yet (D10), Preview shows the picked photo locally and uploads nothing |

- **Files:** platform files (no clinic, inside `UseSharedCatalog()`), module `forms` (`AttachmentModules` + a `Modules` config entry for its types and size), with the form's ID as `RefId`.
- **Routes:** forms' own, under `/admin/forms/{id}/images`, `PlatformAdmin`, since attachments has no generic route. Print templates' paper image is the model to follow (`AdminPaperImageController`, `usePaperImageUrl`), except that its files belong to a clinic and these to the platform.
- **In the definition:** the attachment's ID, never the file. `<img>` can't send the token, so the screen fetches the blob through the adapter.
- **A new form must be saved once** before an image can be added: its files need a form ID.
- **To settle at this feature's T0:** Duplicate copies a definition whose images belong to the source form, and attachment reads match module and `RefId`, so a duplicate must copy the files too. It also decides what deleting a form does to its files (`DeleteAllAsync`, which only marks rows).

## 8. Out of scope

Filling forms and saved entries; a link to any other module but attachments (patients, drugs, diagnoses); specialty presets and exam templates; a restore for deleted forms; version history, comparing and switching; clinic-owned forms; form content validation on the server; undo in the builder; printing a form; export and import.

**M2.2 note:** the patient file expects its data from a dynamic form, so it needs filling and saved entries first, and its first consumer is what turns `IFormUsage` real.

## 9. Delivery

Branch `dynamic-forms`, from `origin/main`, up to date with attachments part 2 and print templates step 4 (27e6f94). This session designs with the user and orchestrates; each feature's contract and T1–T6 run in its own sub session, in its own worktree. Git can't hold both `dynamic-forms` and `dynamic-forms/x`, so branches are `dynamic-forms-backend`, `dynamic-forms-builder`, `dynamic-forms-extensions`, `dynamic-forms-images` and their tracks `dynamic-forms-builder/<track>`. Scratch databases are `drags_forms_<track>`.

| # | Feature | Depends on | Into `dynamic-forms` |
|---|---|---|---|
| 0 | **API contract**: DTOs, route stubs, error codes and their i18n, TypeScript types, MSW handlers, builders | This design | A commit, before 1 and 2 |
| 1 | **Backend** | 0 | Pull request, `full` green |
| 2 | **Builder** | 0; 1 merged before its T2 report run | Pull request, `full` green, after a rebase on 1 |
| 3 | **Extensions** | 2 merged | Pull request, `full` green |
| 4 | **Images** | 2 and 3 merged (the drawing control) | Pull request, `full` green |
| | `dynamic-forms` → `main` | All | Pull request, `release` green, the user's walkthrough and merge OK |

- **Parallel:** 1 and 2 meet only at the contract, and the definition is opaque to the backend. Feature 2's component tests run on MSW; its e2e tests need the real API, which is why 1 merges first.
- **Rebase:** any work merged to `main` meanwhile is rebased in at the end (T6).
- **Size:** features 2 and 3 will likely pass the workflow's cap of about 150 cases, by the user's choice of split. Each reports its count at its T0; a count far past the cap goes back to the user.
- **Tests:** feature 1 at `unit` and `api`; features 2 and 3 at `unit`, `ui` and `e2e`; feature 4 at all of them. E2E signs in as the super admin. Mutation on all new logic (`./ci.ps1 -Mutate` for backend code, the StrykerJS list for frontend logic).

## 10. Documents to update

With the code, in each feature's commits: both overviews (routes, tables, API, pages, `forms` area), `docs/testing/README.md`, the test catalog, and `docs/features/platform-admin/tech.md` (its "M2.1's default form" seeder example no longer holds). Already updated by this design: the HLD (FR-15, "Dynamic forms", M2.1).
