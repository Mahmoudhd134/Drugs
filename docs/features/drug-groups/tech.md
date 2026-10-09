# Drug groups: technical

## Summary
A drug group is a named, **ordered** list of drugs (a treatment template). Groups are managed on
their own pages and added to a prescription in one click.

## Data model
- `DrugGroups` (`Models/DrugGroup.cs`): `Id`, `Name` (required, max 256).
- `DrugGroupItems`: `Id`, `DrugGroupId` (FK, cascade), `DrugId` (FK, cascade), `Order` (0-based).
- Deleting a group deletes its items, not the drugs. Deleting a drug deletes its items in every group.
- A group could become empty if all its drugs are deleted; the API only enforces "≥ 1 drug" on save.
- Migration history: introduced as `Combos`/`ComboDrags` (`AddCombos`), renamed in `RenameToDrugs`.

## API (`Features/DrugGroups/DrugGroupsController.cs`, route `api/v1/drug-groups`)

| Method | Route | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/drug-groups?search=&page=1&pageSize=20` | query | `PagedResult<DrugGroupDto>` | |
| GET | `/drug-groups/{id}` | | `DrugGroupDto` | 404 |
| POST | `/drug-groups` | `{ name, drugIds: int[] }` | 201 `DrugGroupDto` | 400 `nameRequired`, `nameTooLong`, `drugsRequired`, `drugNotFound` |
| PUT | `/drug-groups/{id}` | `{ name, drugIds }` | `DrugGroupDto` | 400 (as above), 404 |
| DELETE | `/drug-groups/{id}` | | 204 | 404 |

`DrugGroupDto = { id, name, drugs: DrugDto[] }`, drugs sorted by `Order`. Each drug includes its
`defaultDosing`; adding a group to a prescription uses those defaults (group-specific doses are Feature 2).

## Backend
- `drugIds` are de-duplicated (first occurrence wins) and their list position becomes `Order`.
- Validation order: name → at least one drug → all drug ids exist.
- Update **replaces** the item list (remove all items, insert new ones) and the name.
- List: search = case-insensitive `Contains` on `Name`; ordered by `Name`, then `Id`; each group
  includes items → drug (`Include/ThenInclude`).

## Frontend (`src/features/drugGroups/`)
- **List page** `pages/DrugGroupsPage.tsx` at `/groups`: search (debounced), responsive card grid
  (12 per page, MUI `Pagination`). Each card: name, drug-count chip, first 4 drug names,
  "+N more", edit/delete actions. Card click → editor. Empty state with "New group".
- **Editor page** `pages/DrugGroupEditorPage.tsx` at `/groups/new` and `/groups/:id`:
  - Loads the group with `useDrugGroup(id)` (staleTime 0), then mounts `GroupEditor` keyed by id.
    Invalid id → redirect to `/groups`.
  - Left: name field (`dir="auto"`) and the group's drugs (`SelectedDrugsList`, drag to reorder,
    remove). Right (sticky on desktop): `DrugPicker` with `selectedIds` marking drugs already
    added. Adding a duplicate shows a toast and is ignored.
  - Save validates name and ≥ 1 drug on the client, calls `useSaveDrugGroup`, then navigates to
    `/groups`. Delete asks for confirmation, then navigates back.
  - Unsaved-changes guard: Back/Cancel ask before discarding; `beforeunload` warns when closing
    the tab. Router navigation via the sidebar is **not** guarded (BrowserRouter has no blocker).
- **`GroupPicker`** (used by the prescription page): `SearchableList` over `useDrugGroupPicker`
  (infinite, 30/page); shows name, count chip and drug names.
- **`api.ts`**: `drugGroupKeys` (`all`, `list`, `picker`, `detail`); hooks `useDrugGroups`,
  `useDrugGroupPicker`, `useDrugGroup`, `useSaveDrugGroup`, `useDeleteDrugGroup` (mutations
  invalidate `drugGroupKeys.all`).
- i18n namespace: `groups.*`.

## Edge cases & limitations
- The back arrow icon is mirrored manually in RTL.
- Sidebar navigation while the editor has unsaved changes discards them without asking.
- No "duplicate group" action; no per-drug notes inside a group (the drug's own description is used).

## Testing notes
Verified via API (create with duplicate ids → de-duplicated, empty list → `drugsRequired`, unknown
id → `drugNotFound`, update, delete) and in the browser (list, editor load, picker "Added" marker).
