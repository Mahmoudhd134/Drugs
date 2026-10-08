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
How it was verified (API calls, browser checks, migration up/down).
