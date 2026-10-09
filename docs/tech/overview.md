# Technical overview

Clinic Drugs is a small web app for a clinic. It keeps a **drug catalog**, groups drugs into
reusable **groups** (treatment templates), and lets staff build a **prescription** and copy it
(plain or formatted for Word). The interface is in **English and Arabic** (right-to-left).
Drug and group **content is not translated**: it is stored once, as typed.

> The code base and solution are still named `Drags` (an old typo). The domain, API and UI use
> **Drug**. Don't rename the projects/solution: deploy scripts and IIS setup depend on them.

## Stack

| Layer | Tech |
|---|---|
| Backend | ASP.NET Core 9 (controllers), EF Core 9, SQLite |
| Frontend | React 18, TypeScript 5.8, Vite 6, MUI 7 (+ icons), TanStack Query 5, React Router 6 |
| i18n | i18next + react-i18next + browser language detector; MUI RTL via emotion + `@mui/stylis-plugin-rtl` |
| Other UI libs | dnd-kit (drag-to-reorder), react-quill (rich-text editor), react-hot-toast |
| Hosting | One IIS site: the API serves the built SPA from `wwwroot` (see `DEPLOY.md`) |

## Repository layout

```
Drags.sln
Drags.Api/                     ASP.NET Core API (+ serves the SPA in production)
  Controllers/BaseApiController.cs
  Features/<Feature>/          controller + DTOs per feature
  Models/                      EF entities
  Database/AppDbContext.cs     EF model configuration
  Migrations/                  EF Core migrations (applied automatically on startup)
  Shared/                      AppSettings, ErrorCodes, PagedResult
  Program.cs                   DI, middleware, migrate-on-startup, dev seed
Drags.Web/                     React SPA (Vite); builds into Drags.Api/wwwroot
  src/app/                     App (routes), AppProviders, theme
  src/api/                     axios client, error → message, shared API types
  src/components/common/       reusable UI (SearchField, SearchableList, SortableList, …)
  src/components/layout/       AppLayout (app bar + sidebar), LanguageMenu
  src/features/<feature>/      api.ts, types.ts, components/, pages/
  src/hooks/                   useLanguage, useDebouncedValue
  src/i18n/                    languages.ts, locales/en.ts, locales/ar.ts
  src/utils/                   clipboard
docs/                          this documentation
deploy.ps1, DEPLOY.md          production build + IIS guide
```

## Runtime architecture

- **Production:** one origin. The API serves `wwwroot` (SPA) and `/api/v1/*`. The SPA calls the
  API with the relative base URL `/api/v1`. `MapFallbackToFile("index.html")` serves client routes.
- **Development:** Vite dev server on `http://localhost:5173`; API on `http://localhost:5000`
  (launch profile `http`, usually run from Rider). `Drags.Web/.env.development` sets
  `VITE_API_BASE_URL=http://localhost:5000/api/v1`; the API allows the Vite origin via
  `AllowedOrigins` (CORS) in `appsettings.json`.
- **Database:** SQLite file `database.db` next to the app (`ConnectionStrings:DefaultConnection`).
  `Program.cs` runs `Database.MigrateAsync()` on every startup. In Development an empty DB is
  seeded with 10,000 sample drugs.

## Backend

### Conventions

- One folder per feature under `Features/` with a controller and a `*Dtos.cs` file
  (records + mapping extension methods). Controllers inherit `BaseApiController`:
  - route `api/v1/[controller]` (override with `[Route]` for kebab-case, e.g. `api/v1/drug-groups`)
  - `ApiError(code)` returns a `ProblemDetails` with a `code` extension
  - `NormalizePaging(page, pageSize)`: page ≥ 1, pageSize 1–100
- Entities never leave the API; always return DTOs (avoids JSON cycles and over-posting).
- Lists return `PagedResult<T>` = `{ items, totalCount, page, pageSize }` (page is 1-based).
- Search is case-insensitive `Contains` on the name (`ToLower`). Drug search ranks names that
  **start with** the term first.
- Validation errors return **400** with a machine-readable code. The frontend translates codes.
  Codes live in `Shared/ErrorCodes.cs`: `nameRequired`, `nameTooLong`, `drugsRequired`, `drugNotFound`,
  `invalidDosing`, `duplicateGroupItem`.
  Add new codes there **and** under `errors.*` in both locale files.
- `Nullable` is disabled in the csproj. Unhandled exceptions return ProblemDetails (`UseExceptionHandler`).

### Data model

```
Drugs                       DrugGroups
- Id (PK)                   - Id (PK)
- Name (≤256, required)     - Name (≤256, required)
- Description (nullable)
- DefaultDosing_* (owned Dosing, nullable: dose, frequency, duration, eye, TaperSteps JSON)
        ▲                           ▲
        │ DrugId (cascade)          │ DrugGroupId (cascade)
        └────── DrugGroupItems ─────┘
                - Id (PK)
                - Order (int, 0-based position in the group)
                - Dosing_* (owned Dosing, nullable: group override; eye may be "ask")
```

- `TaperSteps` is an optional tapering schedule stored as one JSON text column
  ([tapering tech](../features/tapering/tech.md)).

- Deleting a drug removes it from every group (cascade). Deleting a group keeps its drugs.
- A drug appears at most once per group **per eye** (`duplicateGroupItem`).
- `Dosing` is an EF **owned type** (`Models/Dosing.cs`), reusable on any entity via
  `OwnsOne(..., AppDbContext.ConfigureDosing)`. Codes and rules: [dosing tech](../features/dosing/tech.md).

### API (`/api/v1`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/drugs?search=&page=1&pageSize=20` | Paged drugs, ordered by name (prefix matches first when searching) |
| GET | `/drugs/{id}` | One drug |
| POST | `/drugs` | Create `{ name, description, defaultDosing }` → 201 + drug |
| PUT | `/drugs/{id}` | Update `{ name, description, defaultDosing }` → drug |
| GET | `/drugs/{id}/groups` | Names of groups using the drug |
| DELETE | `/drugs/{id}` | Delete → 204 |
| GET | `/drug-groups?search=&page=1&pageSize=20` | Paged groups (each with its items: drug + override, in order), ordered by name |
| GET | `/drug-groups/{id}` | One group with its items |
| POST | `/drug-groups` | Create `{ name, items: [{ drugId, dosing }] }` → 201 + group |
| PUT | `/drug-groups/{id}` | Replace name and items (order + overrides) → group |
| DELETE | `/drug-groups/{id}` | Delete → 204 |

Swagger UI is available in Development at `/swagger`.

### Migrations

- Tool: `dotnet-ef` 9.0.0. If `dotnet tool install` fails with **401**, a private NuGet feed is
  configured on the machine; install from nuget.org only with a config that `<clear/>`s sources:
  `dotnet tool install dotnet-ef --version 9.0.0 --tool-path <dir> --configfile <nuget.org-only config>`.
- If the API is running from Rider, the Debug `bin` is locked: run EF commands with
  `--configuration Release`.
- **Production has real data.** Review every generated migration. Renames/restructures must copy
  data (create new tables → `INSERT … SELECT` keeping ids → drop old), never drop-and-recreate.
  Test `database update` up, down to the previous migration, and up again on a copy of a real DB.
- History: `Initial` → `AddCombos` → `RenameToDrugs` (renamed `Drags/Combos/ComboDrags` to
  `Drugs/DrugGroups/DrugGroupItems`, data preserved) → `AddDrugDefaultDosing` → `AddGroupItemDosing` → `AddTaperSteps` (nullable columns).

## Frontend

### App shell

- `main.tsx` imports `./i18n` (initializes i18next) and renders `App`.
- `AppProviders`: TanStack `QueryClient` (staleTime 30 s, retry 1, no refetch on focus),
  emotion cache per direction (`rtl` cache adds the stylis RTL plugin), MUI theme from
  `createAppTheme(direction)`, `CssBaseline`, `Toaster`.
- Routes (`app/App.tsx`), each page lazy-loaded as its own chunk inside `AppLayout` (`Suspense`):

| Path | Page |
|---|---|
| `/` | `PrescriptionPage` |
| `/groups` | `DrugGroupsPage` |
| `/groups/new`, `/groups/:id` | `DrugGroupEditorPage` |
| `/drugs` | `DrugsPage` |
| `/manage` | redirects to `/drugs` (old URL) |
| `*` | redirects to `/` |

- `AppLayout`: fixed app bar (logo + app name, a link to `/`; `LanguageMenu`), sidebar navigation
  (`NAV_ITEMS`; permanent ≥ md, drawer on mobile). Add new modules to `NAV_ITEMS`.

### Internationalization (UI text only)

- Languages are declared once in `src/i18n/languages.ts` (`code`, `label`, `dir`). Default `en`.
- Strings: `src/i18n/locales/en.ts` is the source; `ar.ts` is typed `Translations` (= `typeof en`),
  so **a missing Arabic key fails the build**. Always add keys to both files.
- UI counts are written as `"Label: {{count}}"`, not plural forms, to stay correct in Arabic.
- **Prescription output is Arabic in every UI language.** Its wording lives in
  `locales/rxTextAr.ts`, plugged into both locales as `rxText`, and is rendered with
  `i18n.getFixedT("ar")` using Arabic plural suffixes (`_zero/_one/_two/_few/_many/_other`).
- The chosen language persists in `localStorage["language"]`; `<html lang/dir>` follows it.
- `useLanguage()` returns `{ language, dir, setLanguage }`.
- RTL: use MUI logical spacing in `sx` (`ms`, `me`, `ps`, `pe`) instead of left/right.
  Directional icons (e.g. back arrow) must be flipped manually when `dir === "rtl"`.
- User-entered content (drug/group names) can be Arabic or English: inputs use `dir="auto"`.
- Adding a language: add it to `LANGUAGES`, create `locales/<code>.ts` typed `Translations`,
  register it in `i18n/index.ts`.

### Data fetching

- `api/client.ts`: one axios instance (`baseURL` = `VITE_API_BASE_URL` or `/api/v1`).
- Each feature has `api.ts` with a query-key factory (`drugKeys`, `drugGroupKeys`) and hooks:
  `useX` (one page, `keepPreviousData`), `useXPicker` (`useInfiniteQuery`, "load more", 30/page),
  `useSaveX` / `useDeleteX` mutations that invalidate the feature's keys.
  Drug mutations also invalidate group queries (groups embed drug names).
- `api/errors.ts` → `getErrorMessage(error)`: maps the API `code` to `errors.<code>`, 404 to
  `errors.notFound`, no response to `errors.network`, else `errors.generic`.

### Shared components (`components/common`)

| Component | Use |
|---|---|
| `PageHeader` | Page title, subtitle, leading (back button), actions |
| `SearchField` | Search input with icon and clear button |
| `SearchableList` | Search + result list with ↑/↓/Enter/Esc keyboard support, loading/error/empty states, "load more" |
| `SortableList` | dnd-kit vertical list; drag handle per row; mouse, touch and keyboard reordering |
| `EmptyState` | Icon + title + description + optional action |
| `useConfirm` | Promise-based confirmation dialog: `if (await confirm({...}))` |
| `InfoTip` | Small ⓘ icon with a tooltip (opens on tap too) to explain a field or option |

### Browser storage

| Key | Content |
|---|---|
| `language` | UI language code |
| `prescription.lines` | Current prescription lines (drug snapshot + dosing + note) |
| `prescription.selection` | Legacy (pre-dosing) list of drugs; migrated to `prescription.lines` on load, then removed |

### Code conventions

- TypeScript `strict`, `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no enums).
- Import local files with the `.ts`/`.tsx` extension (existing style).
- UI built with MUI components + `sx`. Tailwind is installed but not used by current code.
- Components are named exports; pages are lazy-imported in `App.tsx`.
- Heavy, rarely used code (the Quill editor) is lazy-loaded.
- Every icon-only button has a `Tooltip` (and `aria-label`); explain non-obvious fields or options
  with a short `Tooltip` or `InfoTip` (strings in both locales).
- Business switches that the clinic may change live in one config file per feature
  (e.g. `features/dosing/taperConfig.ts`), mirrored by the backend limits.
- Writing `\u` escapes through some AI edit tools produces literal characters; check
  `prescriptionText.ts`-style files for literal non-breaking spaces (ESLint `no-irregular-whitespace`).

## Development workflow

```bash
# API (or run Drags.Api from Rider, profile "http")
dotnet run --project Drags.Api --launch-profile http
# Frontend
cd Drags.Web && npm run dev            # http://localhost:5173
```

Checks before committing:

```bash
cd Drags.Web && npx tsc -b && npx eslint src
dotnet build Drags.Api                 # use -c Release if Rider is running the Debug build
```

There are no automated tests yet. Verify UI changes in the browser at `http://localhost:5173`.

Commits go directly to `main`. Production build and IIS deployment: see `DEPLOY.md` (`deploy.ps1`).

## Known limitations / tech debt

- No authentication or roles: anyone who can reach the site can edit data.
- HTTP only on the LAN. The async Clipboard API needs HTTPS, so copying uses an
  `execCommand` fallback (works, but HTTPS is recommended).
- SQLite single file inside the site folder: no automated backups; redeploys must not overwrite it.
- Name ordering uses SQLite's binary collation (uppercase before lowercase; Latin before Arabic).
  `ToLower` search is case-insensitive for ASCII only (Arabic has no case, so it is unaffected).
- Prescription lines store a drug snapshot in the browser; later edits to a drug are not
  reflected in an already-built prescription, and deleted drugs stay in it until removed.
- Dosing code lists are fixed in code (`DosingCodes` / `features/dosing/types.ts`), not admin-managed.
- No automated tests.

## Adding a feature: checklist

1. Backend: entity in `Models/`, configuration in `AppDbContext`, `Features/<Feature>/` controller +
   DTOs, error codes in `ErrorCodes`, migration (reviewed, data-preserving).
2. Frontend: `src/features/<feature>/` with `types.ts`, `api.ts` (keys + hooks), `components/`,
   `pages/`; lazy route in `App.tsx`; nav item in `AppLayout`; strings in `en.ts` **and** `ar.ts`.
3. Check RTL (switch to Arabic) and mobile width.
4. Run the checks above.
5. Docs: `docs/features/<feature>/tech.md` + `business.md`, and update the overviews.
