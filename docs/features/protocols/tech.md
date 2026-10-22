# Protocols: technical

## Summary
A protocol is a named, **ordered** list of lines (a treatment template). Each line is a drug plus
an optional **dosing override** for this protocol (Feature 2). Protocols are managed on their own pages
and added to a prescription in one click; adding a protocol can ask for the eye and for each
conflict with lines already in the prescription. Called "drug groups" until M1.7a (renamed, behavior unchanged:
[design D10](../../design/m1.7-shared-catalog.md#d10-rename-groups--protocols)).

Dosing flows: drug default → **protocol override** → prescription line (see [dosing](../dosing/tech.md)).

## Data model
- `Protocols` (`ClinicHub.Domain/Catalog/Protocol.cs`): `Id`, `Name` (required, max 256), `SearchName` (stored
  generated column: the name lower-cased and Arabic-folded, only searched; M1.6.1, [search](../../tech/overview.md#conventions)).
- `ProtocolItems`: `Id`, `ProtocolId` (FK, cascade), `DrugId` (FK, cascade), `Order` (0-based),
  `Dosing_*` (owned `Dosing`, nullable) = the protocol override.
- Both tables also have `ClinicId` (FK → `Clinics`, restrict; an item's FKs to its protocol and drug
  are composite with `ClinicId`, so the DB rejects cross-clinic lines) and
  `CreatedAt`/`UpdatedAt` (UTC); index `(ClinicId, Name)` on `Protocols`. Everything is scoped
  to the current clinic ([clinic scoping](../clinic-scoping/tech.md)): another clinic's protocol is
  404, and another clinic's drug in `items` is `drugNotFound`.
- Override semantics (applied by the frontend, `mergeDosing`): each part left empty is taken from
  the drug's **current** default: dose (amount + unit), frequency (+ value/text), duration
  (+ value), eye. So editing a drug's default updates every protocol that didn't override that part.
- A line's eye may be `"ask"` (`DosingCodes.AskEye`): chosen when the protocol is added to a
  prescription. Only protocol lines accept it.
- A drug may appear more than once in a protocol only with **different effective eyes** (the line's own eye, else the
  drug's current default eye; no eye = "none"; `ask` is an eye of its own). Since M1.6.0 (review CAT-D13) the server
  checks the effective eye: a protocol saved before a drug's default eye changed can hold a clash, which the editor
  marks and the API refuses to save until it is fixed.
- Deleting a protocol deletes its lines, not the drugs. Deleting a drug deletes its lines in every
  protocol, which can leave a protocol with zero lines (it shows "Drugs: 0" and can't be saved empty).
- Migrations: the tables were created in `Initial` as `DrugGroups`/`DrugGroupItems` and renamed in place by
  `RenameGroupsToProtocols` (M1.7a: tables, `DrugGroupId` → `ProtocolId`, keys, indexes and identity sequences; the
  stored `groups.*` permission keys become `protocols.*`; data and ids kept). Earlier history: introduced as
  `Combos`/`ComboDrags` (`AddCombos`), renamed in `RenameToDrugs`, override columns added in `AddGroupItemDosing`
  (nullable; existing lines = no override); those SQLite migrations were folded into the single PostgreSQL `Initial`
  ([migrations](../../tech/overview.md#migrations)).

## API (`ClinicHub.Api/Features/Protocols/ProtocolsController.cs`, route `api/v1/protocols`)

Thin controller: each action sends one use case (below) and maps its `Result`. Errors are
[ProblemDetails](../../tech/overview.md#errors-problemdetails); the table lists their `code`.

| Method | Route | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/protocols?search=&page=1&pageSize=20` | query | `PagedResult<ProtocolDto>` | |
| GET | `/protocols/{id}` | | `ProtocolDto` | 404 `notFound` |
| POST | `/protocols` | `SaveProtocolRequest` | 201 `ProtocolDto` (+ `Location`) | 400 `nameRequired`, `nameInvalid`, `nameTooLong`, `drugsRequired`, `invalidRequest` (> 1000 items), `invalidDosing`, then (handler) `drugNotFound`, `duplicateProtocolItem` |
| PUT | `/protocols/{id}` | `SaveProtocolRequest` | `ProtocolDto` | 400 (as above, checked first), 404 `notFound` |
| DELETE | `/protocols/{id}` | | 204 | 404 `notFound` |

- `ProtocolDto = { id, name, items: [{ drug: DrugDto, dosing: Dosing | null }] }`, items in `Order`.
  `drug` includes its `defaultDosing`, so the client can merge.
- `SaveProtocolRequest = { name, items: [{ drugId, dosing }] }`; list position becomes `Order`.
- Every action needs a clinic token (`ClinicContext` policy) and its permission: `protocols.list` (`GET /protocols`),
  `protocols.details` (`GET /protocols/{id}`), `protocols.create` / `protocols.update` / `protocols.delete`; else 401 / 403
  ([access](../access/tech.md#api)).
- The old routes `/drug-groups…` and `/drugs/{id}/groups` have no alias: like any unknown `/api` path they answer
  GET 404 `notFound` and POST/PUT/DELETE/PATCH 405 `methodNotAllowed` (M1.7a, GRP-101).

## Backend (`ClinicHub.Application/Features/Catalog/Protocols/`)

| Use case | Folder | Notes |
|---|---|---|
| `GetProtocolsQuery(search, page, pageSize)` | `Queries/GetProtocols` | → `PagedResult<ProtocolDto>` |
| `GetProtocolQuery(id)` | `Queries/GetProtocol` | → `ProtocolDto` or `ProtocolErrors.NotFound` |
| `CreateProtocolCommand(name, items)` | `Commands/CreateProtocol` | + validator → `ProtocolDto` |
| `UpdateProtocolCommand(id, name, items)` | `Commands/UpdateProtocol` | + validator → `ProtocolDto` or `NotFound` |
| `DeleteProtocolCommand(id)` | `Commands/DeleteProtocol` | → `NotFound` or success |

- Feature root: `ProtocolDto`/`ProtocolItemDto` (+ `ToDto()`, `WithItems()` = `Include/ThenInclude` items → drug),
  `ProtocolErrors` (`NotFound` = `notFound`, `DrugsRequired`, `InvalidDosing`, `DuplicateItem` =
  `duplicateProtocolItem`, `DrugNotFound`), `SaveProtocolItem(drugId, dosing)` with `Normalize(items)` (drops null
  items, normalizes each dosing, keeps the order), used by the validators and the handlers.
- Validators (create and update, one each), in report order: name (`ValidName()`) → at least one non-null item
  (`drugsRequired`, field `items`) → at most `SaveProtocolItem.MaxItems` (1000) items (`invalidRequest`, field
  `items`; beyond it the item rules are skipped, so a huge list can't build a huge answer) → each item's dosing valid with `allowAskEye: true` (`invalidDosing`, field
  `items[i].dosing`; a custom frequency text with a NUL is invalid). All failures are returned.
- The handlers then read the drugs' default eyes: every drug must exist in the clinic (`drugNotFound`, 400), then no
  two lines may give the same drug for the same **effective** eye (`SaveProtocolItem.HasDuplicate`:
  `duplicateProtocolItem`, 400, field `items`; moved from the validators in M1.6.0). Both are only reported when the
  request is otherwise valid, and (update) before an unknown protocol's 404.
- Update **replaces** all lines (remove + insert) and the name, and touches the protocol's `UpdatedAt`.
  Create and update reload the protocol with its drugs for the response. Each command is one transaction.
- List/detail include items → drug; ordered by `Name` (the database's default collation: case-insensitive first, Latin
  before Arabic, [tech overview](../../tech/overview.md#known-limitations--tech-debt)), then `Id`. Search: the term
  folded by `SearchText.Term` `Contains` in `SearchName` (Arabic-normalized, case-insensitive, M1.6.1; no prefix
  ranking for protocols).
- `GET /drugs/{id}/protocols` (drugs controller, `GetDrugProtocolNamesQuery`) lists the protocols using a drug, for the
  delete warning.

## Frontend (`src/features/protocols/`)
- `types.ts`: `Protocol { id, name, items: ProtocolItem[] }`, `ProtocolItem { drug, dosing }`,
  `SaveProtocolItem { drugId, dosing }`.
- `editorItem.ts`: editor line model `EditorItem { key, drug, dosing }` and helpers:
  `effectiveDosing` (= `mergeDosing(drug.defaultDosing, dosing)`), `itemIdentity` (drug + effective
  eye), `toSaveItems` (empty override → `null`), `itemsSignature` (unsaved-changes check).
- **List page** `pages/ProtocolsPage.tsx` (`/protocols`): search, card grid (12/page), each card shows
  the protocol name, the line count and the first 4 drug names. A long name (protocol or drug, even one unbroken 256-character
  word) wraps inside the card, never cut with "…" (the user's decision, 2026-10-16): the title and the drug names
  have no `noWrap`, they break with `overflowWrap: "anywhere"` (as `DrugText`); the line count chip stays at the
  title's first line. The grid stretches the cards of one row to the same height.
- **Editor page** `pages/ProtocolEditorPage.tsx` (`/protocols/new`, `/protocols/:id`): a new protocol opens with the focus in
  the name field and the empty state «لا توجد أدوية في هذا البروتوكول» / "No drugs in this protocol".
  - Opening `/protocols/:id` **always fetches the protocol again** (`useProtocol`: `staleTime: 0`, `refetchOnMount:
    "always"`) and shows the page spinner until that answer arrives (`isFetchedAfterMount`): a copy cached earlier (e.g.
    before one of its drugs was renamed or got a new default dosing) is never shown. A failed fetch shows the error with
    «إعادة المحاولة» (`common.retry`) instead of the form, even when a cached copy exists. The first fresh answer is kept
    while the editor shows that protocol: a later refetch of it (e.g. the invalidation of a save or delete, just before
    leaving) neither resets the form nor moves the unsaved-changes baseline. Showing another protocol drops it, so coming
    back to the first one waits for a fresh answer again.
  - Lines use the shared `DosingLineList`: number, drug, `LineDetails` with the **effective** dosing (its
    sentence; or the drug description when it has no dose, frequency, duration or tapering, followed by the eye part
    if any: [prescription](../prescription/tech.md#text-formats-prescriptiontextts); an `ask`-only line shows the
    description, M1.6.1), chips "Protocol dosing" (override set) and "Eye is chosen
    when the protocol is added" (`ask`). Chips wrap on narrow screens. Actions: ✎ edit, ⊕ add for the
    other eye (when the effective eye is right/left and the other is free), ✕ remove; drag to reorder.
  - Adding a drug from `DrugPicker` creates a line with an empty override; adding a drug+eye pair
    already in the protocol shows `protocols.alreadyInProtocolForEye`.
  - `components/ProtocolItemDialog.tsx`: `DosingFields` in **inherit mode** (`inheritFrom` = drug
    default: empty fields display "Drug default", preview shows the merged result) with
    `allowAskEye`, plus a "Use drug default" button that clears the override. The drug name under its title wraps
    (`overflow-wrap: anywhere`), so a long unbroken name is never cut.
  - Save validates name and ≥ 1 line on the client. Unsaved-changes guard on Back/Cancel and
    `beforeunload`: it compares the **trimmed** name with the saved one and `itemsSignature` (the lines as they would be
    saved: drug, override, order) with the loaded lines, so a change undone by hand (a line dragged away and back, an
    override set then reset, the name edited back, only spaces added at the end) leaves without asking.
  - Lines whose effective eyes clash (`clashingItemKeys` in `editorItem.ts`: same `itemIdentity`; possible after a
    drug's default eye changed) get an error chip `protocols.eyeClash` ("Same drug and eye as another line"); editors see
    an alert `protocols.eyeClashSave` above the lines, and Save is blocked with the same message as a toast until a line
    is removed or its eye changed (M1.6.0).
- The old SPA routes `/groups`, `/groups/new`, `/groups/:id` redirect (replace) to the same `/protocols…` route, keeping
  the id, the query string and the hash (M1.7a, GRP-100).
- **`ProtocolPicker`** (prescription page): name, line count («الأدوية: N»), the drug names joined with " · " (at most
  2 lines). A long unbroken name wraps (`overflow-wrap: anywhere`), never cut.
- **`api.ts`**: `protocolKeys`; `useProtocols`, `useProtocolPicker`, `useProtocol`,
  `useSaveProtocol` (`{ id, name, items }`), `useDeleteProtocol`.
- Adding a protocol to a prescription (eye question, conflicts): see [prescription tech](../prescription/tech.md).
- i18n: `protocols.*`, `dosing.inherit*`, `dosing.askEye*`, `dosing.resetToDefault`,
  `errors.duplicateProtocolItem`. Arabic says «بروتوكول» (masculine: «هذا البروتوكول»; plural «البروتوكولات»).

## Edge cases & limitations
- Sidebar navigation with unsaved changes discards them without asking (BrowserRouter has no blocker).
- An open editor is not updated live: a drug edited in another tab (or a protocol saved elsewhere) while the editor is open
  shows up the next time the editor is opened (accepted; each open fetches the protocol again).
- No "duplicate protocol" action; no per-line note in protocols.
- Overrides are stored per part; there is no way to override only the dose amount while inheriting
  the unit (dose amount + unit are one part).

## Testing notes
Automated since M1.6 ([testing README](../../testing/README.md)): catalog area
[GRP](../../testing/test-catalog.md#grp--protocols); a change here adds or fixes its cases and tests.

| Level | Tests |
|---|---|
| unit | `tests/ClinicHub.UnitTests/Catalog/Protocols/` (validators, `SaveProtocolItem`); Vitest `ClinicHub.Web/src/features/protocols/editorItem.test.ts` |
| api | `tests/ClinicHub.IntegrationTests/Catalog/Protocols/` (`./test.ps1 -Area catalog`) |
| ui | `ClinicHub.Web/src/features/protocols/` (the editor page: lines, save, limits; the list, the picker, the line dialog) |
| e2e | `ClinicHub.Web/e2e/catalog/protocol-editor.spec.ts`, `protocol-guard.spec.ts` (unsaved-changes guard), `protocols-list.spec.ts`, `inheritance.spec.ts` |
