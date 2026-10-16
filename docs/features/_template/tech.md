# <Feature name>: technical

## Summary
One paragraph: what the feature does technically and which parts of the system it touches.

## Data model
New/changed entities, columns, relationships, delete behavior, migration name.
Note how existing data is migrated.

## API
| Method | Route | Request | Response | Errors (codes) |
|---|---|---|---|---|

## Backend
Folder, controller, DTOs, validation rules, ordering/search rules, side effects.

## Frontend
- Routes / pages
- Components (and which shared components they reuse)
- `api.ts`: query keys, hooks, what each mutation invalidates
- State kept in the browser (localStorage keys), if any
- i18n keys added (namespace)

## Edge cases & limitations
What happens on delete/concurrent edits/empty states; known gaps.

## Testing notes
The feature's catalog area and case IDs ([test catalog](../../testing/test-catalog.md)) and where its tests are, per
level (unit, api, ui, e2e: [testing README § Adding a test](../../testing/README.md#adding-a-test)); the `manual` cases
left for the dress rehearsal; anything checked by hand that no case covers (e.g. a migration up → down → up on real
data).
