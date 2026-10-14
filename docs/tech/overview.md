# Technical overview

Clinic Drugs is a small web app for a clinic. It keeps a **drug catalog**, groups drugs into
reusable **groups** (treatment templates), and lets staff build a **prescription** and copy it
(plain or formatted for Word). The interface is in **English and Arabic** (right-to-left).
Drug and group **content is not translated**: it is stored once, as typed.

> `ClinicHub` is the neutral code name of the code base (solution, projects, namespaces). It was
> renamed from `Drags` (an old typo) on 2026-10-14; the commercial brand will only touch UI strings,
> the logo and the domain. Legacy names kept on purpose: the PostgreSQL database and user `drags`, and
> the Docker Compose project `drags` (container `drags-postgres`, volume `drags_drags-pgdata`), so
> existing data is kept. The migration designer files and snapshot keep their old CLR name strings
> (`Drags.Api.Models.*`). The new JWT issuer/audience and refresh cookie name (`clinichub_refresh`)
> logged out every session once; an old `drags_refresh` cookie is ignored until it expires.

## Stack

| Layer | Tech |
|---|---|
| Backend | ASP.NET Core 9 (controllers), EF Core 9, PostgreSQL (Npgsql), JWT bearer auth, HybridCache, libphonenumber-csharp |
| Frontend | React 18, TypeScript 5.8, Vite 6, MUI 7 (+ icons), TanStack Query 5, React Router 6 |
| i18n | i18next + react-i18next + browser language detector; MUI RTL via emotion + `@mui/stylis-plugin-rtl` |
| Other UI libs | dnd-kit (drag-to-reorder), react-quill (rich-text editor), react-hot-toast |
| Hosting | One IIS site: the API serves the built SPA from `wwwroot` (see `DEPLOY.md`) |

## Repository layout

```
ClinicHub.sln                  Domain ← Application ← Infrastructure ← Api (backend architecture:
                               docs/design/architecture.md; Phase 3.5 step 1 done)
ClinicHub.Domain/              entities and pure rules; no references (no EF Core, no ASP.NET)
  Common/                      IClinicOwned, IHasTimestamps, FieldLimits (column lengths)
  Catalog/                     Drug, DrugGroup (+ DrugGroupItem), Dosing (+ TaperStep, DosingCodes),
                               DosingRules
  Identity/                    User, OtpCode, Session (+ ContextTypes)
  Access/                      Staff, Role (+ RolePermission, StaffRole)
  Platform/                    Clinic (+ ClinicStatus)
ClinicHub.Application/         → Domain. Abstractions implemented elsewhere (use cases come in steps 2-3)
  Common/Abstractions/         IAppDbContext, IClinicContext (+ ClinicContext)
  DependencyInjection.cs       AddApplication()
ClinicHub.Infrastructure/      → Application, Domain. EF Core + PostgreSQL
  Database/AppDbContext.cs     DbSets, IAppDbContext, clinic FK + query filter for every IClinicOwned
  Database/Configurations/<Module>/   one IEntityTypeConfiguration<T> per entity (+ DosingConfiguration)
  Database/ClinicAndTimestampsInterceptor.cs   fills ClinicId + CreatedAt/UpdatedAt on save
  Migrations/                  EF Core migrations (applied automatically on startup)
  DependencyInjection.cs       AddInfrastructure(configuration): DbContext + interceptor
ClinicHub.Api/                 → Application, Infrastructure. ASP.NET Core API (+ serves the SPA in
                               production)
  Controllers/BaseApiController.cs
  Features/<Feature>/          controller + DTOs per feature
  Features/Identity/           login: AuthController, MeController, OtpService, SessionService,
                               TokenService, PhoneNormalizer, IOtpSender, CurrentUser, IdentitySeeder,
                               IdentitySetup (DI + middleware)
  Features/Access/             permissions: Permissions + PermissionCatalog, DefaultRoles, AccessCache
                               (HybridCache), PermissionService, [HasPermission] + handlers,
                               PermissionsController, MembershipService, AccessSetup (DI)
  Features/Platform/           StartupSeeder (startup seed: template, super admins, dev data)
  Shared/                      AppSettings (+ startup validation), ErrorCodes, PagedResult, ICurrentUser
  Program.cs                   DI, middleware, migrate-on-startup, seeding
ClinicHub.Web/                 React SPA (Vite); builds into ClinicHub.Api/wwwroot
  src/app/                     App (routes), AppProviders, theme
  src/api/                     axios client, error → message, shared API types
  src/components/common/       reusable UI (SearchField, SearchableList, SortableList, …)
  src/components/layout/       AppLayout (clinic app: app bar + sidebar), SimpleLayout (login etc.), LanguageMenu
  src/app/navigation.tsx       NAV_ITEMS (sidebar) with the permission each page needs
  src/features/<feature>/      api.ts, types.ts, components/, pages/
  src/features/access/         permissions.ts, usePermissions, withPermission, <Can>, Permission* controls,
                               <RequirePermission>
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
  (launch profile `http`, usually run from Rider). Vite **proxies `/api`** to the API
  (`vite.config.ts`) and `ClinicHub.Web/.env.development` sets `VITE_API_BASE_URL=/api/v1`, so the SPA
  and API share one origin, as in production (the refresh cookie is `SameSite=Strict`).
  `AllowedOrigins` (CORS) in `appsettings.json` is no longer needed by the SPA.
- **Database:** PostgreSQL (`ConnectionStrings:DefaultConnection`). In Development it is the Docker
  container from `docker-compose.yml` (set in `appsettings.Development.json`); production must set
  the connection string (e.g. env var `ConnectionStrings__DefaultConnection`).
  `Program.cs` validates the settings (missing/short secrets, `Otp:Mode = Sms` (no sender yet), or an
  invalid seeded phone stop the app; OTP display mode outside Development only logs a warning; sections `Auth`, `Otp`,
  `Platform`: see [login § Configuration](../features/auth/tech.md#configuration)), then runs `Database.MigrateAsync()` and the startup seeding on every startup: the
  template clinic and the super admins from `Platform:SuperAdminPhones`; in Development, an empty DB
  also gets "Demo clinic" (10,000 sample drugs) and "Second demo clinic" (3 drugs + 1 group), with
  the default roles in both, the `Platform:DevOwnerPhone` user as staff "Dev Owner" (Owner) in both, and
  `Platform:DevAssistantPhone` as "Dev Assistant" (Assistant in the first, read-only "Viewer" in the second).
- **Login:** phone + one-time code; a JWT access token per context (a clinic, or the platform for a
  super admin) and a rotating refresh token in an HttpOnly cookie ([login](../features/auth/tech.md)).
- **Clinic scoping:** every catalog row belongs to a clinic and every query is filtered to the
  request's clinic automatically ([clinic scoping](../features/clinic-scoping/tech.md)). The clinic
  comes only from the access token's `clinic_id` (`UseClinicFromToken`); no token = no clinic.
- **Permissions:** roles per clinic, one permission per action, checked on every catalog endpoint
  (`[HasPermission]`) and in the UI; never in the token: cached per staff/role on the server, read from
  `/me` in the SPA ([access](../features/access/tech.md)).

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
  `invalidDosing`, `duplicateGroupItem`, and for login `invalidPhone`, `invalidCode`, `codeExpired`,
  `tooManyAttempts`, `tooManyRequests` (429), `noAccess` (403), `clinicSuspended` (403), `forbidden` (403).
  401 = missing/expired access token (no code; the SPA refreshes and retries once).
  Add new codes there **and** under `errors.*` in both locale files.
- `Nullable` is disabled in every csproj. Unhandled exceptions return ProblemDetails (`UseExceptionHandler`).
- **Clinic-owned data:** a clinic's entity implements `IClinicOwned` (and `IHasTimestamps`); the
  query filter, the `ClinicId` FK (restrict) and filling on insert are then automatic. Look rows up
  with `FirstOrDefaultAsync(x => x.Id == id)`, never `FindAsync` (it can skip the filter). Never
  take a `clinicId` from the client in clinic routes. Only Platform code (and the Access module's
  membership queries and access-cache loads by id, read-only) may `IgnoreQueryFilters()`.
- **Auth:** clinic controllers carry `[Authorize(Policy = AuthPolicies.ClinicContext)]` (a clinic-context
  token whose staff member and clinic are still active; platform tokens get 403). Read the caller from
  `ICurrentUser` (claims), never from the body.
- **Permissions:** every clinic action carries `[HasPermission(Permissions.X.Y)]` (implies the clinic
  policy); checks inside code use `IPermissionService.EnsureAsync`. Adding a permission is one constant in
  `Features/Access/Permissions.cs` (+ the SPA mirror and labels). Changes to staff, roles, clinics or
  users must call the `IAccessCache.Invalidate*` method from the
  [invalidation table](../features/access/tech.md#cache-accesscache).

### Data model

```
Clinics (Platform)
- Id (PK), Name (≤256), Status ("active" | "suspended"), IsTemplate (only one: partial unique index)

Users (Identity)       Phone (E.164, unique), IsSuperAdmin, LastLoginAt
OtpCodes (Identity)    Phone, CodeHash (HMAC), ExpiresAt, Attempts, ConsumedAt; index (Phone, CreatedAt)
Sessions (Identity)    Id (uuid), UserId (cascade), RefreshTokenHash (unique), ContextType, ClinicId,
                       ExpiresAt (sliding), LastUsedAt, RevokedAt
Staff (Access)         ClinicId (clinic-owned), UserId (restrict), FullName, IsActive; unique (ClinicId, UserId)
Roles (Access)         ClinicId (clinic-owned), Name (<=100, unique per clinic), IsOwner (one per clinic)
RolePermissions        RoleId (cascade) + Permission (<=100), PK (RoleId, Permission); none for Owner
StaffRoles             StaffId, RoleId, ClinicId (clinic-owned); PK (StaffId, RoleId); composite FKs
                       (StaffId, ClinicId) -> Staff and (RoleId, ClinicId) -> Roles (cascade)
```

Details: [login tech](../features/auth/tech.md), [access tech](../features/access/tech.md).

Every table has `CreatedAt`/`UpdatedAt` (`timestamptz`, UTC, set on save). `Drugs`, `DrugGroups`
and `DrugGroupItems` have `ClinicId` (FK → `Clinics`, restrict); indexes `(ClinicId, Name)` on
`Drugs` and `DrugGroups`. Group items reference their group and drug with composite FKs
`(DrugGroupId, ClinicId)` / `(DrugId, ClinicId)`, so the database rejects cross-clinic lines.

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
- `Dosing` is an EF **owned type** (`ClinicHub.Domain/Catalog/Dosing.cs`), reusable on any entity via
  `OwnsOne(..., DosingConfiguration.Configure)`. Codes and rules: [dosing tech](../features/dosing/tech.md).

### API (`/api/v1`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/auth/otp/mode` | `{ mode }` (`Display` → the login page shows its banner). Anonymous |
| POST | `/auth/otp/request` | `{ phone }` → code created (`devCode` in display mode). Anonymous |
| POST | `/auth/otp/verify` | `{ phone, code }` → `AuthResult` + refresh cookie. Anonymous |
| POST | `/auth/refresh` | Refresh cookie → new `AuthResult`, cookie rotated |
| POST | `/auth/context` | `{ type, clinicId? }` → `AuthResult` for that context |
| GET | `/auth/contexts` | Contexts the user can pick |
| POST | `/auth/logout` | Revokes the session, clears the cookie → 204 |
| GET | `/me` | User, context, staff, permissions (expanded keys in a clinic context) |
| GET | `/permissions` | The permission catalog `[{ key, resource, action, requires }]` (any access token) |
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

Catalog routes (`/drugs`, `/drug-groups`) need a clinic-context access token
(`Authorization: Bearer …`): none/expired → 401, platform or no context → 403; and each route's
permission (e.g. `drugs.delete`, [table](../features/access/tech.md#api)), else 403 `forbidden`;
inactive staff → 403 `noAccess`, suspended clinic → 403 `clinicSuspended`. Auth contracts:
[login tech](../features/auth/tech.md).

Swagger UI is available in Development at `/swagger`.

### Migrations

- Tool: `dotnet-ef` 9.0.x. If `dotnet tool install` (or restore) fails with **401**, a private NuGet
  feed is configured on the machine; use a config that `<clear/>`s sources and adds only nuget.org:
  `dotnet tool install dotnet-ef --version 9.0.20 --tool-path <dir> --configfile <nuget.org-only config>`.
- Migrations live in `ClinicHub.Infrastructure`; the startup project (config, connection string) is
  `ClinicHub.Api`. Every EF command takes both:
  `--project ClinicHub.Infrastructure --startup-project ClinicHub.Api` (shown below as `<ef args>`).
- If the API is running from Rider, the Debug `bin` is locked: run EF commands with
  `--configuration Release`.
- **Nothing is in production yet**, so the schema may still be reset. Once deployed, review every
  generated migration: renames/restructures must copy data (create new tables → `INSERT … SELECT`
  keeping ids → drop old), never drop-and-recreate. Test up, down to the previous migration, and
  up again on a copy of a real DB.
- Phase 3.5 moved the migrations from the Api project to `ClinicHub.Infrastructure` (namespace
  `ClinicHub.Infrastructure.Migrations`) with their ids unchanged, so existing databases are unaffected.
- History: the SQLite migrations were replaced by a single PostgreSQL `Initial` when the app moved
  to PostgreSQL; `Initial` was regenerated again for clinic scoping (platform phase 1) and for login
  (phase 2). From phase 3 on, migrations are **added on top** (`AddRoles`), never regenerated.
  To reset a dev DB: `docker compose down -v && docker compose up -d`, then
  `dotnet ef database update <ef args>`.

## Frontend

### App shell

- `main.tsx` imports `./i18n` (initializes i18next) and renders `App`.
- `AppProviders` (inside `BrowserRouter`): TanStack `QueryClient` (staleTime 30 s, retry 1, no
  refetch on focus), emotion cache per direction (`rtl` cache adds the stylis RTL plugin), MUI theme
  from `createAppTheme(direction)`, `CssBaseline`, `AuthProvider` (session restore, `useAuth()`),
  `Toaster`.
- Routes (`app/App.tsx`), each page lazy-loaded as its own chunk (`Suspense`). Login pages use
  `SimpleLayout`; the clinic app is `AppLayout` behind `RequireAuth context="clinic"`
  ([login](../features/auth/tech.md)):

| Path | Page |
|---|---|
| `/login` | `LoginPage` (phone → code) |
| `/select-clinic` | `SelectClinicPage` (logged in) |
| `/platform` | `PlatformPage` (platform context; TEMPORARY placeholder until the admin area) |
| `/` | `PrescriptionPage` (`prescriptions.create`; without it → the first allowed page) |
| `/groups` | `DrugGroupsPage` (`groups.list`) |
| `/groups/new`, `/groups/:id` | `DrugGroupEditorPage` (`groups.create` / `groups.details`; read only without `groups.update`) |
| `/drugs` | `DrugsPage` (`drugs.list`) |
| `/manage` | redirects to `/drugs` (old URL) |
| `*` | redirects to `/` |

- `AppLayout`: fixed app bar (logo + app name, a link to `/`; the clinic name; `LanguageMenu`;
  `UserMenu` with switch clinic and logout), a warning banner in the template clinic, sidebar
  navigation (`NAV_ITEMS` in `app/navigation.tsx`, each with its `permission`; items the user can't open
  are hidden; permanent ≥ md, drawer on mobile). Add new modules to `NAV_ITEMS` and `CLINIC_ROUTES`
  (`app/App.tsx`: each route with its permission, wrapped in `RequirePermission`).
  Pages are re-mounted when the context changes; `useClinic()` gives the current clinic.

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
- RTL: use logical properties in `sx` (`marginInlineStart`, `paddingInlineEnd`, `borderInlineStart`…)
  or left/right (the RTL stylis plugin flips them). Note: the `ms`/`me`/`ps`/`pe` shorthands are
  **not** applied by this MUI version (they render as zero); don't use them. A `dir="auto"` element
  flips its own start/end, so put `dir="auto"` on an inner span, not on the element carrying the spacing.
  Directional icons (e.g. back arrow) must be flipped manually when `dir === "rtl"`.
- User-entered content (drug/group names) can be Arabic or English: inputs use `dir="auto"`.
- Adding a language: add it to `LANGUAGES`, create `locales/<code>.ts` typed `Translations`,
  register it in `i18n/index.ts`.

### Data fetching

- `api/client.ts`: one axios instance (`baseURL` = `VITE_API_BASE_URL` or `/api/v1`). Interceptors add
  `Authorization: Bearer <access token>` and, on a 401, refresh once (shared promise) and retry
  (not if the refresh moved to another clinic); a 401 from the refresh logs out (→ `/login`), a
  network error doesn't. The access token lives only in memory
  (`features/auth/session.ts`), never in storage.
- A context switch or logout cancels in-flight queries and clears the whole query cache.
- Each feature has `api.ts` with a query-key factory (`drugKeys`, `drugGroupKeys`) and hooks:
  `useX` (one page, `keepPreviousData`), `useXPicker` (`useInfiniteQuery`, "load more", 30/page),
  `useSaveX` / `useDeleteX` mutations that invalidate the feature's keys. Query hooks take
  `{enabled}` (`QueryOptions`), so pages never call endpoints the user can't use.
- Queries retry once, and only on network/5xx errors. Any 403 reloads `/me` (permissions may have
  changed); a 403 from a query also toasts the translated reason.
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

Permission pieces (`features/access`, [details](../features/access/tech.md#frontend-srcfeaturesaccess)):

| Piece | Use |
|---|---|
| `usePermissions()` | `{ can, canAll, canAny, allows, ready }` for logic |
| `<Can permission / anyOf / allOf fallback?>` | Render children only when allowed |
| `PermissionButton`, `PermissionIconButton`, `PermissionMenuItem`, `PermissionFab` | Gated MUI controls; `whenDenied="disable"` shows them disabled with a tooltip (default hidden) |
| `withPermission(Component)` | Gate any control that takes `disabled` the same way |
| `<RequirePermission>` | Route guard with the "No permission" page |

### Browser storage

| Key | Content |
|---|---|
| `language` | UI language code |
| `prescription.lines.<clinicId>` | The clinic's current prescription lines (drug snapshot + dosing + note) |
| `prescription.lines` | Legacy (before login): moved to the first clinic opened, then removed |
| `prescription.selection` | Legacy (pre-dosing) list of drugs; migrated the same way, then removed |

Not in storage: the access token (memory only). The refresh token is an `HttpOnly` cookie
(`clinichub_refresh`, path `/api/v1/auth`) that scripts cannot read.

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
# PostgreSQL for local dev (required before starting the API)
docker compose up -d                   # localhost:5432, db/user/password: drags (legacy names, kept)
# API (or run ClinicHub.Api from Rider, profile "http")
dotnet run --project ClinicHub.Api --launch-profile http
# Frontend
cd ClinicHub.Web && npm run dev        # http://localhost:5173
```

Migrations: add **and** apply them with the CLI, even though startup also migrates:

```bash
dotnet ef migrations add <Name> --project ClinicHub.Infrastructure --startup-project ClinicHub.Api
dotnet ef database update --project ClinicHub.Infrastructure --startup-project ClinicHub.Api
dotnet ef migrations list --project ClinicHub.Infrastructure --startup-project ClinicHub.Api
dotnet ef migrations has-pending-model-changes --project ClinicHub.Infrastructure --startup-project ClinicHub.Api
```

Run `database update` **without** `--no-build` (`migrations add` compiles before it writes the files,
so a `--no-build` update would apply nothing); check with `migrations list`. Add
`--configuration Release` when Rider holds the Debug build.

Login in Development: `Otp:Mode` is `Display`, so the code is shown on the login page (and logged
by the API). Seeded phones (`appsettings.Development.json`): `01000000002` = "Dev Owner", Owner in
both demo clinics; `01000000003` = "Dev Assistant", Assistant (no deletes) in "Demo clinic" and
Viewer (read only) in "Second demo clinic"; `01000000001` = super admin (platform + template clinic). Any other valid number
gets a code but no access. API calls need a token:

```bash
curl -s -X POST localhost:5000/api/v1/auth/otp/request -H "Content-Type: application/json" -d '{"phone":"01000000002"}'
curl -s -X POST localhost:5000/api/v1/auth/otp/verify  -H "Content-Type: application/json" -d '{"phone":"01000000002","code":"<devCode>"}'
curl -s -X POST localhost:5000/api/v1/auth/context -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" -d '{"type":"clinic","clinicId":3}'
curl -s localhost:5000/api/v1/drugs -H "Authorization: Bearer <accessToken>"
```

A new code for the same phone needs 60 s (5 per hour); in dev, `DELETE FROM "OtpCodes"` resets it.
Secrets: dev values are in `appsettings.Development.json`; any other environment must set
`Auth__Jwt__SigningKey` and `Otp__HashKey` (≥ 32 bytes) as environment variables, or the app won't start.

Checks before committing:

```bash
cd ClinicHub.Web && npx tsc -b && npx eslint src
dotnet build ClinicHub.sln             # all projects; use -c Release if Rider is running the Debug build
```

There are no automated tests yet. Verify UI changes in the browser at `http://localhost:5173`.

Commits go directly to `main`. Production build and IIS deployment: see `DEPLOY.md` (`deploy.ps1`).

## Known limitations / tech debt

> Planned direction (clinics, staff, roles, phone + OTP login, super admin):
> [platform high-level design](../design/platform-hld.md).

- Users, staff and roles come only from seeding until the admin area (phase 4).
- Permission or active-flag changes made outside the (future) admin endpoints apply within 30 s
  (in-memory access cache) or at the next token refresh; the SPA's `/me` is cached 5 min (reloaded
  on any 403).
- No SMS sender yet: a deployed server must run with `Otp__Mode=Display` (code on screen; anyone can
  log in as any phone), so it suits a demo/staging server only.
- No per-IP limit on OTP requests yet (phase 5): one person can request codes for many numbers
  (costly once SMS is real).
- `AllowedOrigins` (CORS) is no longer used (dev goes through the Vite proxy, production is
  same-origin); it can be removed.
- Access tokens stay valid up to 15 min after **logout** (no per-request session check). Suspension
  and staff deactivation are checked per request through the access cache (within 30 s).
- **HTTPS is now required** outside localhost: the login refresh cookie is `Secure`, so on the
  plain-http LAN setup every reload would ask for a new login. Moving the deployment to HTTPS is a
  prerequisite for phase 2 in production.
- HTTP only on the LAN. The async Clipboard API needs HTTPS, so copying uses an
  `execCommand` fallback (works, but HTTPS is recommended).
- No automated database backups yet.
- Name ordering follows the database's default collation (not tuned for Arabic).
  `ToLower` search is case-insensitive for ASCII only (Arabic has no case, so it is unaffected).
- Prescription lines store a drug snapshot in the browser; later edits to a drug are not
  reflected in an already-built prescription, and deleted drugs stay in it until removed.
- Dosing code lists are fixed in code (`DosingCodes` / `features/dosing/types.ts`), not admin-managed.
- No automated tests.

## Adding a feature: checklist

1. Backend: entity in `ClinicHub.Domain/<Module>/`, its `IEntityTypeConfiguration` in
   `ClinicHub.Infrastructure/Database/Configurations/<Module>/` + a `DbSet` in `AppDbContext` and
   `IAppDbContext`, `Features/<Feature>/` controller + DTOs, error codes in `ErrorCodes`, migration
   (reviewed, data-preserving).
2. Frontend: `src/features/<feature>/` with `types.ts`, `api.ts` (keys + hooks), `components/`,
   `pages/`; lazy route in `App.tsx`; nav item in `AppLayout`; strings in `en.ts` **and** `ar.ts`.
3. Check RTL (switch to Arabic) and mobile width.
4. Run the checks above.
5. Docs: `docs/features/<feature>/tech.md` + `business.md`, and update the overviews.
