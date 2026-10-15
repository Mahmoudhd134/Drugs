# Drug groups (protocols): technical

## Summary
A drug group is a named, **ordered** list of lines (a treatment protocol). Each line is a drug plus
an optional **dosing override** for this group (Feature 2). Groups are managed on their own pages
and added to a prescription in one click; adding a group can ask for the eye and for each
conflict with lines already in the prescription.

Dosing flows: drug default → **group override** → prescription line (see [dosing](../dosing/tech.md)).

## Data model
- `DrugGroups` (`ClinicHub.Domain/Catalog/DrugGroup.cs`): `Id`, `Name` (required, max 256).
- `DrugGroupItems`: `Id`, `DrugGroupId` (FK, cascade), `DrugId` (FK, cascade), `Order` (0-based),
  `Dosing_*` (owned `Dosing`, nullable) = the group override.
- Both tables also have `ClinicId` (FK → `Clinics`, restrict; an item's FKs to its group and drug
  are composite with `ClinicId`, so the DB rejects cross-clinic lines) and
  `CreatedAt`/`UpdatedAt` (UTC); index `(ClinicId, Name)` on `DrugGroups`. Everything is scoped
  to the current clinic ([clinic scoping](../clinic-scoping/tech.md)): another clinic's group is
  404, and another clinic's drug in `items` is `drugNotFound`.
- Override semantics (applied by the frontend, `mergeDosing`): each part left empty is taken from
  the drug's **current** default: dose (amount + unit), frequency (+ value/text), duration
  (+ value), eye. So editing a drug's default updates every group that didn't override that part.
- A line's eye may be `"ask"` (`DosingCodes.AskEye`): chosen when the group is added to a
  prescription. Only group lines accept it.
- A drug may appear more than once in a group only with **different effective eyes** (the line's own eye, else the
  drug's current default eye; no eye = "none"; `ask` is an eye of its own). Since M1.6.0 (review CAT-D13) the server
  checks the effective eye: a group saved before a drug's default eye changed can hold a clash, which the editor
  marks and the API refuses to save until it is fixed.
- Deleting a group deletes its lines, not the drugs. Deleting a drug deletes its lines in every
  group, which can leave a group with zero lines (it shows "Drugs: 0" and can't be saved empty).
- Migrations: today the tables are part of `Initial`. History: introduced as `Combos`/`ComboDrags` (`AddCombos`),
  renamed in `RenameToDrugs`, override columns added in `AddGroupItemDosing` (nullable; existing lines = no override);
  those SQLite migrations were folded into the single PostgreSQL `Initial` ([migrations](../../tech/overview.md#migrations)).

## API (`ClinicHub.Api/Features/DrugGroups/DrugGroupsController.cs`, route `api/v1/drug-groups`)

Thin controller: each action sends one use case (below) and maps its `Result`. Errors are
[ProblemDetails](../../tech/overview.md#errors-problemdetails); the table lists their `code`.

| Method | Route | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/drug-groups?search=&page=1&pageSize=20` | query | `PagedResult<DrugGroupDto>` | |
| GET | `/drug-groups/{id}` | | `DrugGroupDto` | 404 `notFound` |
| POST | `/drug-groups` | `SaveDrugGroupRequest` | 201 `DrugGroupDto` (+ `Location`) | 400 `nameRequired`, `nameInvalid`, `nameTooLong`, `drugsRequired`, `invalidRequest` (> 1000 items), `invalidDosing`, then (handler) `drugNotFound`, `duplicateGroupItem` |
| PUT | `/drug-groups/{id}` | `SaveDrugGroupRequest` | `DrugGroupDto` | 400 (as above, checked first), 404 `notFound` |
| DELETE | `/drug-groups/{id}` | | 204 | 404 `notFound` |

- `DrugGroupDto = { id, name, items: [{ drug: DrugDto, dosing: Dosing | null }] }`, items in `Order`.
  `drug` includes its `defaultDosing`, so the client can merge.
- `SaveDrugGroupRequest = { name, items: [{ drugId, dosing }] }`; list position becomes `Order`.
- Every action needs a clinic token (`ClinicContext` policy) and its permission: `groups.list` (`GET /drug-groups`),
  `groups.details` (`GET /drug-groups/{id}`), `groups.create` / `groups.update` / `groups.delete`; else 401 / 403
  ([access](../access/tech.md#api)).

## Backend (`ClinicHub.Application/Features/Catalog/DrugGroups/`)

| Use case | Folder | Notes |
|---|---|---|
| `GetDrugGroupsQuery(search, page, pageSize)` | `Queries/GetDrugGroups` | → `PagedResult<DrugGroupDto>` |
| `GetDrugGroupQuery(id)` | `Queries/GetDrugGroup` | → `DrugGroupDto` or `DrugGroupErrors.NotFound` |
| `CreateDrugGroupCommand(name, items)` | `Commands/CreateDrugGroup` | + validator → `DrugGroupDto` |
| `UpdateDrugGroupCommand(id, name, items)` | `Commands/UpdateDrugGroup` | + validator → `DrugGroupDto` or `NotFound` |
| `DeleteDrugGroupCommand(id)` | `Commands/DeleteDrugGroup` | → `NotFound` or success |

- Feature root: `DrugGroupDto`/`DrugGroupItemDto` (+ `ToDto()`, `WithItems()` = `Include/ThenInclude` items → drug),
  `DrugGroupErrors` (`NotFound` = `notFound`, `DrugsRequired`, `InvalidDosing`, `DuplicateItem` =
  `duplicateGroupItem`, `DrugNotFound`), `SaveDrugGroupItem(drugId, dosing)` with `Normalize(items)` (drops null
  items, normalizes each dosing, keeps the order), used by the validators and the handlers.
- Validators (create and update, one each), in report order: name (`ValidName()`) → at least one non-null item
  (`drugsRequired`, field `items`) → at most `SaveDrugGroupItem.MaxItems` (1000) items (`invalidRequest`, field
  `items`; beyond it the item rules are skipped, so a huge list can't build a huge answer) → each item's dosing valid with `allowAskEye: true` (`invalidDosing`, field
  `items[i].dosing`; a custom frequency text with a NUL is invalid). All failures are returned.
- The handlers then read the drugs' default eyes: every drug must exist in the clinic (`drugNotFound`, 400), then no
  two lines may give the same drug for the same **effective** eye (`SaveDrugGroupItem.HasDuplicate`:
  `duplicateGroupItem`, 400, field `items`; moved from the validators in M1.6.0). Both are only reported when the
  request is otherwise valid, and (update) before an unknown group's 404.
- Update **replaces** all lines (remove + insert) and the name, and touches the group's `UpdatedAt`.
  Create and update reload the group with its drugs for the response. Each command is one transaction.
- List/detail include items → drug; ordered by `Name`, then `Id`.
- `GET /drugs/{id}/groups` (drugs controller) lists the groups using a drug, for the delete warning.

## Frontend (`src/features/drugGroups/`)
- `types.ts`: `DrugGroup { id, name, items: DrugGroupItem[] }`, `DrugGroupItem { drug, dosing }`,
  `SaveDrugGroupItem { drugId, dosing }`.
- `editorItem.ts`: editor line model `EditorItem { key, drug, dosing }` and helpers:
  `effectiveDosing` (= `mergeDosing(drug.defaultDosing, dosing)`), `itemIdentity` (drug + effective
  eye), `toSaveItems` (empty override → `null`), `itemsSignature` (unsaved-changes check).
- **List page** `pages/DrugGroupsPage.tsx` (`/groups`): search, card grid (12/page), each card shows
  the line count and first 4 drug names.
- **Editor page** `pages/DrugGroupEditorPage.tsx` (`/groups/new`, `/groups/:id`):
  - Lines use the shared `DosingLineList`: number, drug, **effective** dosing sentence (or the drug
    description when there is no dosing), chips "Group dosing" (override set) and "Eye is chosen
    when the group is added" (`ask`). Chips wrap on narrow screens. Actions: ✎ edit, ⊕ add for the
    other eye (when the effective eye is right/left and the other is free), ✕ remove; drag to reorder.
  - Adding a drug from `DrugPicker` creates a line with an empty override; adding a drug+eye pair
    already in the group shows `groups.alreadyInGroupForEye`.
  - `components/GroupItemDialog.tsx`: `DosingFields` in **inherit mode** (`inheritFrom` = drug
    default: empty fields display "Drug default", preview shows the merged result) with
    `allowAskEye`, plus a "Use drug default" button that clears the override.
  - Save validates name and ≥ 1 line on the client. Unsaved-changes guard on Back/Cancel and
    `beforeunload`.
  - Lines whose effective eyes clash (`clashingItemKeys` in `editorItem.ts`: same `itemIdentity`; possible after a
    drug's default eye changed) get an error chip `groups.eyeClash` ("Same drug and eye as another line"); editors see
    an alert `groups.eyeClashSave` above the lines, and Save is blocked with the same message as a toast until a line
    is removed or its eye changed (M1.6.0).
- **`GroupPicker`** (prescription page): name, line count, drug names.
- **`api.ts`**: `drugGroupKeys`; `useDrugGroups`, `useDrugGroupPicker`, `useDrugGroup`,
  `useSaveDrugGroup` (`{ id, name, items }`), `useDeleteDrugGroup`.
- Adding a group to a prescription (eye question, conflicts): see [prescription tech](../prescription/tech.md).
- i18n: `groups.*`, `dosing.inherit*`, `dosing.askEye*`, `dosing.resetToDefault`,
  `errors.duplicateGroupItem`.

## Edge cases & limitations
- Sidebar navigation with unsaved changes discards them without asking (BrowserRouter has no blocker).
- No "duplicate group" action; no per-line note in groups.
- Overrides are stored per part; there is no way to override only the dose amount while inheriting
  the unit (dose amount + unit are one part).

## Testing notes
API: overrides saved/normalized, `ask` eye accepted only on group lines, duplicates rejected,
unknown drug rejected, invalid dosing rejected, deleting a drug removes its lines.
Browser (:5173, Arabic + English, desktop + 375px): create group with validation, keyboard adding,
drag reorder, overrides with chips, live inheritance after changing a drug default, reset to
default, unsaved-changes guard, chip wrapping.
M1.6.0 (API on a scratch DB): default eye right + lines (no override, override left) → 201; the default changed to
left → GET shows both lines effective left; PUT / POST of those lines → 400 `duplicateGroupItem` (field `items`);
`ask` + an inherited eye → 201; no eye + `none` → 400; an unknown drug is reported before a duplicate, a duplicate
before an unknown group. Browser (EN/AR, 1280/375): both clashing lines marked, alert shown, Save blocked; after
removing one, saved.
