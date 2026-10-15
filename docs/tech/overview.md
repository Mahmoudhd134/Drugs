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
| Backend | ASP.NET Core 9 (controllers), MediatR 13, FluentValidation 12, EF Core 9, PostgreSQL (Npgsql), JWT bearer auth, HybridCache, libphonenumber-csharp |
| Frontend | React 18, TypeScript 5.8, Vite 6, MUI 7 (+ icons), TanStack Query 5, React Router 6 |
| i18n | i18next + react-i18next + browser language detector; MUI RTL via emotion + `@mui/stylis-plugin-rtl` |
| Other UI libs | dnd-kit (drag-to-reorder), react-quill (rich-text editor), react-hot-toast |
| Hosting | One IIS site: the API serves the built SPA from `wwwroot` (see `DEPLOY.md`) |

## Repository layout

```
ClinicHub.sln                  Domain ← Application ← Infrastructure ← Api (backend architecture:
                               docs/design/architecture.md; M1.4 done)
ClinicHub.Domain/              entities and pure rules; no references (no EF Core, no ASP.NET)
  Common/                      IClinicOwned, IHasTimestamps, FieldLimits (column lengths)
  Catalog/                     Drug, DrugGroup (+ DrugGroupItem), Dosing (+ TaperStep, DosingCodes),
                               DosingRules
  Identity/                    User, OtpCode, Session (+ ContextTypes)
  Access/                      Staff, Role (+ RolePermission, StaffRole)
  Platform/                    Clinic (+ ClinicStatus)
ClinicHub.Application/         → Domain. Use cases (MediatR), validators, DTOs, errors; no ASP.NET
  Common/Abstractions/         IAppDbContext, IClinicContext (+ ClinicContext), ICurrentUser, ITransactionRunner,
                               IPostCommitActions (after-commit side effects), IClinicScope (sets the current
                               clinic: EnterAsync, Use; implemented in Features/Platform/Clinics), IStartupSeeder
  Common/Messaging/            ICommand, ICommand<T>, IQuery<T> (+ ICommandBase, ICommitOnFailure) and their
                               handler interfaces
  Common/Results/              Result, Result<T>, Error, ErrorType, CommonErrors, TooManyRequestsError
  Common/Settings/             AuthSettings, OtpSettings (+ OtpModes), PlatformSettings (bound and validated by the Api)
  Common/Behaviors/            LoggingBehavior → ValidationBehavior → TransactionBehavior
  Common/Validation/           .WithError(error), the shared ValidName(maxLength = 256) (nameRequired; nameInvalid: control, line/paragraph
                               separator or bidi override or isolate characters; nameTooLong) and
                               ValidText() (invalidText) rules
  Common/Paging/               PagedResult<T>, Paging.Normalize, Paging.SearchTerm
  Features/Catalog/Drugs/      Commands/<UseCase>/, Queries/<UseCase>/, DrugDto, DrugErrors
  Features/Catalog/DrugGroups/ same, + DrugGroupDto, DrugGroupErrors, SaveDrugGroupItem
  Features/Identity/           IdentityErrors at the root; sub-features:
    Login/                     IOtpLock, IOtpSender, OtpHash; Commands/ (RequestOtp, VerifyOtp), Queries/GetOtpMode
    Sessions/                  ISessionService/SessionService, SessionRules (RotationGrace, SetContext),
                               SessionIssue, AuthResult, ContextDto, ITokenService; Commands/ (RefreshSession,
                               SwitchContext, Logout), Queries/GetContexts
    Users/                     IPhoneNormalizer/PhoneNormalizer (+ ValidPhone(), ConfigPhones), IUserAccounts/UserAccounts
                               (GetOrCreateAsync: the one way to find or create a user by phone), IIdentitySeeder/IdentitySeeder
                               (super admins); Queries/GetMe
  Features/Access/             AccessErrors, Permissions.cs (every permission, grouped by module with
                               [PermissionModule], + RequiresAttribute, PermissionModuleAttribute); sub-features:
    Authorization/             PermissionCatalog, PermissionSet, IPermissionService/PermissionService, IAccessCache;
                               Queries/GetPermissions
    Roles/                     DefaultRoles, RoleDto, RoleErrors, RoleRules; Commands/ (CreateRole, UpdateRole,
                               DeleteRole), Queries/GetRoles
    StaffMembers/              IMembershipService/MembershipService, StaffMemberDto, StaffErrors, StaffRules; Commands/
                               (AddStaff, UpdateStaff, RemoveStaff), Queries/GetStaff
  Features/Platform/Clinics/   ClinicErrors, ClinicDto (ClinicSummary, ClinicDetails), ClinicQueries (NotDeleted,
                               Manageable, SelectDetails), ClinicScope (IClinicScope); Commands/ (CreateClinic, RenameClinic,
                               SuspendClinic, ActivateClinic, DeleteClinic), Queries/ (GetClinics, GetClinic)
  Features/Platform/Provisioning/  IClinicProvisioner/ClinicProvisioner, IClinicSeeder (+ ClinicSeedContext); Seeders/
                               (DefaultRolesSeeder, OwnerSeeder, TemplateCatalogSeeder); all internal
  DependencyInjection.cs       AddApplication(configuration): MediatR (+ license), behaviors, validators,
                               the shared services; builds the permission catalog (startup validation)
ClinicHub.Infrastructure/      → Application, Domain. EF Core + PostgreSQL
  Database/AppDbContext.cs     DbSets, IAppDbContext, clinic FK + query filter for every IClinicOwned
  Database/Configurations/<Module>/   one IEntityTypeConfiguration<T> per entity (+ DosingConfiguration)
  Database/ClinicAndTimestampsInterceptor.cs   fills ClinicId + CreatedAt/UpdatedAt on save
  Database/TransactionRunner.cs                ITransactionRunner (EF execution strategy + savepoints) and
                                               IPostCommitActions (runs the queue when its outermost transaction ends)
  Migrations/                  EF Core migrations (applied automatically on startup)
  Identity/                    TokenService (JWT; ITokenService) + AuthClaims, JwtValidation, DisplayOtpSender, OtpLock
                               (pg_advisory_xact_lock)
  Access/AccessCache.cs        IAccessCache on HybridCache
  Platform/StartupSeeder.cs    IStartupSeeder: template clinic, super admins (IIdentitySeeder), dev data (template
                               content + two clinics through CreateClinicCommand)
  DependencyInjection.cs       AddInfrastructure(configuration): DbContext + interceptor, TransactionRunner,
                               HybridCache, the Identity/Access implementations, StartupSeeder
ClinicHub.Api/                 → Application, Infrastructure. ASP.NET Core API (+ serves the SPA in
                               production)
  Controllers/BaseApiController.cs
  Errors/                      ApiProblemFactory, Result → HTTP helpers, UnexpectedExceptionHandler
  DependencyInjection.cs       AddApi(): lowercase URLs, controllers, invalid-body 400, ProblemDetails safety
                               net, 500 handler
  Features/Drugs, DrugGroups/  thin controllers (+ their request records)
  Features/Identity/           AuthController (+ the refresh cookie), MeController, CurrentUser (ICurrentUser
                               from the claims), IdentitySetup (JWT bearer, AuthPolicies, clinic middleware)
  Features/Platform/           AdminClinicsController (api/v1/admin/clinics, PlatformAdmin policy),
                               AdminRolesController + AdminStaffController (…/clinics/{clinicId}/roles, /staff) with
                               the admin clinic filter ([AdminClinic], AdminClinicFilter: the route's clinic)
  Features/Access/             [HasPermission] + PermissionHandler + ClinicAccessHandler, PlatformAdminHandler, the 403 answers
                               (AccessDenied.cs: AccessFailureReason, AccessAuthorizationResultHandler),
                               PermissionsController, AccessSetup (DI)
  Shared/                      AppSettings (root of the config + startup validation, MediatRSettings)
  Program.cs                   settings, DI, middleware, migrate-on-startup, seeding (IStartupSeeder)
ClinicHub.Web/                 React SPA (Vite); builds into ClinicHub.Api/wwwroot
  src/app/                     App (routes), AppProviders, theme, chunkReload (reload once after a new deployment)
  src/api/                     axios client, error → message, shared API types
  src/components/common/       reusable UI (PageHeader, BackButton, ListPagination, PageBoundary, SearchField, …)
  src/components/layout/       AppShell (app bar + sidebar + page), navButtonSx, AppLayout (clinic app), SimpleLayout
                               (login etc.), LanguageMenu
  src/app/navigation.tsx       NAV_ITEMS (sidebar) with the permission each page needs, ADMIN_NAV_ITEMS (platform admin)
  src/features/<feature>/      api.ts, types.ts, components/, pages/
  src/features/access/         permissions.ts, usePermissions, withPermission, <Can>, Permission* controls,
                               <RequirePermission>
  src/hooks/                   useLanguage, useDebouncedValue, useFormatDate, useSingleFlight
  src/i18n/                    languages.ts, locales/en.ts, locales/ar.ts
  src/utils/                   clipboard
docs/                          this documentation
deploy.ps1, DEPLOY.md          production build + IIS guide
```

## Runtime architecture

- **Production:** one origin. The API serves `wwwroot` (SPA) and `/api/v1/*`. The SPA calls the
  API with the relative base URL `/api/v1`. `MapFallbackToFile` serves `index.html` for client routes, except under `/api` (an unknown API route
  is a 404 ProblemDetails).
- **Development:** Vite dev server on `http://localhost:5173`; API on `http://localhost:5000`
  (launch profile `http`, usually run from Rider). Vite **proxies `/api`** to the API
  (`vite.config.ts`) and `ClinicHub.Web/.env.development` sets `VITE_API_BASE_URL=/api/v1`, so the SPA
  and API share one origin, as in production (the refresh cookie is `SameSite=Strict`).
  `AllowedOrigins` (CORS) in `appsettings.json` is no longer needed by the SPA.
- **Database:** PostgreSQL (`ConnectionStrings:DefaultConnection`). In Development it is the Docker
  container from `docker-compose.yml` (set in `appsettings.Development.json`); production must set
  the connection string (e.g. env var `ConnectionStrings__DefaultConnection`).
  `Program.cs` validates the settings (missing/short secrets, `Otp:Mode = Sms` (no sender yet), an
  invalid seeded phone, or no `MediatR:LicenseKey` outside Development stop the app; OTP display mode outside Development only logs a warning; sections `Auth`, `Otp`,
  `Platform`: see [login § Configuration](../features/auth/tech.md#configuration)), then runs `Database.MigrateAsync()` and the startup seeding on every startup: the
  template clinic and the super admins from `Platform:SuperAdminPhones`; in Development, an empty DB
  also gets sample **template** content (2 eye drops, Moxifloxacin and Prednisolone, and the group "After cataract
  surgery" using both, the second line overriding its drug's dosing with a taper) and two clinics **provisioned from
  it** through `CreateClinicCommand` (default roles, owner, a copy of the template's drugs and group): "Demo clinic"
  (+ 10,000 sample drugs: 10,002) and "Second demo clinic" (the template copy only: 2 drugs + 1 group), the
  `Platform:DevOwnerPhone` user as staff "Dev Owner" (Owner) in both, and `Platform:DevAssistantPhone` as "Dev
  Assistant" (Assistant in the first, read-only "Viewer" in the second). An empty `DevOwnerPhone` skips only the demo
  clinics (a warning: a clinic needs an owner; the template is still filled when empty).
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

- Layers and rules: [backend architecture](../design/architecture.md). In short: **one use case = one
  command or query** (+ handler, + validator) in its own folder under
  `ClinicHub.Application/Features/<Module>/<SubFeature>/Commands|Queries/<UseCase>/`, files named after it
  (`CreateDrugCommand.cs`, `CreateDrugCommandHandler.cs`, `CreateDrugCommandValidator.cs`). DTOs, services and
  the sub-feature's error class (`DrugErrors`) sit at the sub-feature root; a module root only holds
  `<Module>Errors.cs` (and Access's `Permissions.cs`). Sub-feature folder names never equal a type name (`StaffMembers`, not
  `Staff`); namespaces follow folders. Every service and seeder is used through an interface and registered under it
  (exemptions in [architecture § 3.7](../design/architecture.md#37-folder-structure-and-naming)).
  No shared interfaces or base validators between create and update.
- **Controllers are thin** (`ClinicHub.Api/Features/<Feature>/`, Identity and Access included): build the command/query, `sender.Send` it,
  map the `Result` with `ToOk()`, `ToCreated(nameof(GetById), d => new { id = d.Id })` or `ToNoContent()`
  (`Api/Errors/ResultHttpExtensions`). Request records (`SaveDrugRequest`) live next to the controller.
  Controllers inherit `BaseApiController` (route `api/v1/[controller]`; override with `[Route]` for kebab-case,
  e.g. `api/v1/drug-groups`).
- **Handlers** use `IAppDbContext` (never `AppDbContext`), take the `CancellationToken`, and return a `Result`:
  expected failures are `Error`s from the feature's error class (implicit conversion: `return DrugErrors.NotFound;`),
  never exceptions. Commands run in one transaction (`TransactionBehavior`): a failed `Result` or an exception
  rolls back everything the handler saved, except for an `ICommitOnFailure` command (failures that must keep
  their writes, e.g. a wrong login code counted; [architecture § 3.5](../design/architecture.md#35-pipeline-behaviors)).
  Queries never write and use `AsNoTracking()`. Raw SQL goes behind a purpose-built interface implemented in
  Infrastructure (e.g. `IOtpLock`).
- **Validation** is FluentValidation, one validator per command: every rule ends with
  `.WithError(XErrors.Y)` (code + description), and rules are declared in the order the errors are reported
  (the first failure is the response's `code`; `errors` lists them all). Checks that read the database
  (e.g. `drugNotFound`) are done in the handler, after validation.
- Entities never leave the API; always return DTOs (avoids JSON cycles and over-posting).
- Lists return `PagedResult<T>` = `{ items, totalCount, page, pageSize }` (page is 1-based;
  `Paging.Normalize`: page ≥ 1, pageSize 1–100).
- Search is case-insensitive `Contains` on the name (`ToLower`). Drug search ranks names that
  **start with** the term first. `Paging.SearchTerm` trims the term and removes control characters (no name has
  one; a NUL would fail in the database): they are dropped from the term.
- **Errors**: every error response is one ProblemDetails shape (see [Errors](#errors-problemdetails)). Codes are
  API contracts: declared once in the feature's error class (`CommonErrors`, `DrugErrors`, `DrugGroupErrors`,
  `IdentityErrors`, `AccessErrors`, `ClinicErrors`, `RoleErrors`, `StaffErrors`). Add new codes
  there **and** under `errors.*` in both locale files. The transport codes (`unauthorized`, `invalidRequest`,
  `conflict`, `methodNotAllowed`, `unexpected`) have no keys on purpose: the SPA shows `errors.generic` for them;
  nor has `noContexts` (the refresh's 401 when no clinic is left: the SPA logs out with its own `auth.*` message).
- `Nullable` is disabled in every csproj.
- **Clinic-owned data:** a clinic's entity implements `IClinicOwned` (and `IHasTimestamps`); the
  query filter, the `ClinicId` FK (restrict) and filling on insert are then automatic. Look rows up
  with `FirstOrDefaultAsync(x => x.Id == id)`, never `FindAsync` (it can skip the filter). Never
  take a `clinicId` from the client in clinic routes. Only Platform code (and the Access module's
  membership queries and access-cache loads by id, read-only) may `IgnoreQueryFilters()`.
- **Auth:** clinic controllers carry `[Authorize(Policy = AuthPolicies.ClinicContext)]` (a clinic-context
  token whose staff member and clinic are still active; platform tokens get 403). Admin controllers
  (`Api/Features/Platform`, routes `api/v1/admin/…`) carry `[Authorize(Policy = AuthPolicies.PlatformAdmin)]`
  (a platform token whose user is still a super admin; anything else 403 `forbidden`). Read the caller from
  `ICurrentUser` (claims), never from the body.
- **Permissions:** every clinic action carries `[HasPermission(Permissions.X.Y)]` (implies the clinic
  policy). Adding a permission is one constant in `Application/Features/Access/Permissions.cs` (one class, its
  resource classes grouped by module; a new resource class needs `[PermissionModule("…")]`) (+ the SPA mirror
  and labels). Changes to staff, roles, clinics or
  users must call the `IAccessCache.Invalidate*` method from the
  [invalidation table](../features/access/tech.md#cache-accesscache), **after the commit**: queue it with
  `await postCommit.AddAsync(token => accessCache.InvalidateX(id, token))` (`IPostCommitActions`).
- **Clinics** are soft deleted (`DeletedAt`); there is no query filter on `Clinics`, so every place that decides
  whether a clinic can be used checks it explicitly (admin code: `db.Clinics.NotDeleted()` / `Manageable()`;
  [platform admin](../features/platform-admin/tech.md)).

### Errors (ProblemDetails)

Every error response, whatever produces it, is built by `ClinicHub.Api/Errors/ApiProblemFactory`
(`application/problem+json`):

```json
{
  "type": "https://httpstatuses.io/400", "title": "Validation failed", "status": 400,
  "detail": "The name is required.", "instance": "/api/v1/drugs",
  "code": "nameRequired",
  "errors": [
    { "code": "nameRequired", "description": "The name is required.", "field": "name" },
    { "code": "invalidDosing", "description": "The default dosing is not valid.", "field": "defaultDosing" }
  ],
  "traceId": "00-…-01"
}
```

- `code` = the first error's code (what the SPA translates); `errors` = all of them (`field` in camelCase, e.g.
  `items[0].dosing`, when known); `detail` = the first description (English, for developers); `traceId` finds the
  request in the logs.
- Status from the first error's `ErrorType`: Validation 400, Unauthorized 401, Forbidden 403, NotFound 404,
  Conflict 409, Failure 500; `tooManyRequests` 429 and `methodNotAllowed` 405 by code. A `TooManyRequestsError`
  (e.g. the OTP limits) also sets `Retry-After`.

| Source | Hook | Code |
|---|---|---|
| Use case failure (`Result`) | `ToOk` / `ToCreated` / `ToNoContent` | the handler's or validator's |
| No/invalid/expired token | JwtBearer `OnChallenge` | `unauthorized` (401; the SPA refreshes by status) |
| Permission / context | `AccessAuthorizationResultHandler`, JwtBearer `OnForbidden` | `forbidden`, `noAccess`, `clinicSuspended` |
| Malformed JSON, wrong types, empty body | `InvalidModelStateResponseFactory` (`AddApi`) | `invalidRequest` (one error per model-state error, with its `field`; the parser's message only in Development) |
| Unknown route / wrong method | `UseProblemStatusCodePages` | `notFound` 404 / `methodNotAllowed` 405 |
| Unhandled exception | `UnexpectedExceptionHandler` | `unexpected` 500; message and stack only in Development |
| Anything else (MVC `Problem()`, `Unauthorized()`…) | `AddProblemDetails` → `ApiProblemFactory.Complete` | from the status |

A missing drug or group answers `notFound` (the SPA shows "this item no longer exists").
`/api/*` paths never fall back to the SPA's `index.html`.

### Adding a use case

1. Folder `ClinicHub.Application/Features/<Module>/<Feature>/Commands/<Name>/` (or `Queries/<Name>/`).
2. `<Name>Command : ICommand<TData>` (or `ICommand` / `<Name>Query : IQuery<TData>`), a record with the inputs.
3. `<Name>CommandHandler(IAppDbContext db) : ICommandHandler<<Name>Command, TData>` (`internal sealed`),
   returning data or an `Error` from `<Feature>Errors`.
4. `<Name>CommandValidator : AbstractValidator<<Name>Command>` (`internal sealed`), each rule ending with
   `.WithError(...)`, in report order. New codes: in `<Feature>Errors` + `errors.*` in `en.ts` and `ar.ts`.
5. Controller action: `[HasPermission(...)]`, `(await sender.Send(new <Name>Command(...), ct)).ToOk()`.
   Handlers and validators are found by assembly scanning; nothing to register.

### Data model

```
Clinics (Platform)
- Id (PK), Name (≤256), Status ("active" | "suspended"), IsTemplate (only one: partial unique index),
  DeletedAt (timestamptz null: set = soft deleted, Status untouched; no query filter)

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
| GET | `/permissions` | The permission catalog `[{ key, module, resource, action, requires }]` (any access token) |
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
| GET | `/admin/clinics?search=&status=&page=1&pageSize=20` | Paged `ClinicSummary` (no template, no deleted), by name (prefix matches first when searching); `status` = `active` / `suspended` |
| GET | `/admin/clinics/{id}` | `ClinicDetails` (+ `owners`) |
| POST | `/admin/clinics` | Create `{ name, owner: { phone, fullName } }` → 201 + `ClinicDetails`, provisioned from the template (roles, owner, drugs and groups copied; all or nothing) |
| PUT | `/admin/clinics/{id}` | Rename `{ name }` → `ClinicDetails` |
| POST | `/admin/clinics/{id}/suspend`, `/admin/clinics/{id}/activate` | → 204 (idempotent) |
| DELETE | `/admin/clinics/{id}` | Soft delete → 204 (final for now) |
| GET | `/admin/clinics/{clinicId}/roles` | `Role[]`, Owner first then by name (`permissions` in catalog order; the Owner's = every key; `staffCount` = holders, active or not) |
| POST | `/admin/clinics/{clinicId}/roles` | Create `{ name, permissions[] }` → 201 + `Role` (keys stored with their requirements; `Location` = the list) |
| PUT | `/admin/clinics/{clinicId}/roles/{roleId}` | Rename + replace permissions → `Role` (not the Owner: `roleLocked`) |
| DELETE | `/admin/clinics/{clinicId}/roles/{roleId}` | → 204 (`roleLocked`, `roleInUse`) |
| GET | `/admin/clinics/{clinicId}/staff?search=&page=1&pageSize=20` | Paged `StaffMember` (active or not) by name; `search` = name, or phone digits |
| POST | `/admin/clinics/{clinicId}/staff` | Add `{ phone, fullName, roleIds[] }` → 201 + `StaffMember` (user reused by phone or created; `Location` = the list) |
| PUT | `/admin/clinics/{clinicId}/staff/{staffId}` | `{ fullName, isActive, roleIds[] }` → `StaffMember` (phone can't change; `lastOwner`) |
| DELETE | `/admin/clinics/{clinicId}/staff/{staffId}` | Remove (real delete) → 204 (`lastOwner`) |

Errors on every route: [ProblemDetails](#errors-problemdetails). Catalog routes (`/drugs`, `/drug-groups`) need a clinic-context access token
(`Authorization: Bearer …`): none/expired → 401, platform or no context → 403; and each route's
permission (e.g. `drugs.delete`, [table](../features/access/tech.md#api)), else 403 `forbidden`;
inactive staff or a deleted clinic → 403 `noAccess`, suspended clinic → 403 `clinicSuspended`. Auth contracts:
[login tech](../features/auth/tech.md). Admin routes (`/admin/*`) need a platform-context token of a
current super admin (else 403 `forbidden`); a missing, deleted or template clinic id → 404 `notFound`, also on the
roles and staff routes (a suspended clinic is managed); a role or staff id of another clinic → 404 `notFound`. Role
and staff errors: `roleNameTaken`, `roleLocked`, `roleInUse`, `staffExists`, `lastOwner` (409); `unknownPermission`,
`rolesRequired`, `roleNotFound`, `invalidPhone` and the name codes (400)
([platform admin](../features/platform-admin/tech.md#api)).

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
- M1.4 moved the migrations from the Api project to `ClinicHub.Infrastructure` (namespace
  `ClinicHub.Infrastructure.Migrations`) with their ids unchanged, so existing databases are unaffected.
- History: the SQLite migrations were replaced by a single PostgreSQL `Initial` when the app moved
  to PostgreSQL; `Initial` was regenerated again for clinic scoping (M1.1) and for login
  (M1.2). From M1.3 on, migrations are **added on top**, never regenerated: `Initial` → `AddRoles` (M1.3) →
  `AddClinicDeletedAt` (M1.5.1, one nullable column).
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
  ([login](../features/auth/tech.md)); the platform admin is `AdminLayout` behind `RequireAuth context="platform"`
  ([platform admin](../features/platform-admin/tech.md#frontend)):

| Path | Page |
|---|---|
| `/login` | `LoginPage` (phone → code) |
| `/select-clinic` | `SelectClinicPage` (logged in) |
| `/admin` | `ClinicsPage` (platform context: search, status filter, paging, kept in the URL query) |
| `/admin/clinics/new` | `CreateClinicPage` (clinic name + owner phone and name) |
| `/admin/clinics/:id` | `ClinicPage`: name, status, tabs from `CLINIC_TABS` as child routes (index = Overview: rename, disable / enable, delete with the name typed; Roles and Staff in M1.5.5); an id that isn't a positive int without leading zeros, or unknown/deleted/template → "not found" |
| `/admin/*` | redirects to `/admin` |
| `/platform` | redirects to `/admin` (the placeholder page before the admin area) |
| `/` | `PrescriptionPage` (`prescriptions.create`; without it → the first allowed page) |
| `/groups` | `DrugGroupsPage` (`groups.list`) |
| `/groups/new`, `/groups/:id` | `DrugGroupEditorPage` (`groups.create` / `groups.details`; read only without `groups.update`) |
| `/drugs` | `DrugsPage` (`drugs.list`) |
| `/manage` | redirects to `/drugs` (old URL) |
| `*` | redirects to `/` |

- `AppShell` (`components/layout`): fixed app bar (logo + app name, a link to the context's home; a context label;
  `LanguageMenu`; `UserMenu` with switch clinic and logout), sidebar navigation from a list (permanent ≥ md, drawer on
  mobile; an entry is active on its path, exactly with `end`, and under its `activeFor` paths), an optional item below
  the entries (the sidebar is a `<nav>` landmark), an optional banner, the page in a `PageBoundary` (`Suspense` + an
  error boundary: "Couldn't load — Reload" instead of a blank app when a page's chunk fails; `SimpleLayout` and the
  clinic page's tabs use it too).
- `AppLayout` (clinic app) = `AppShell` with the clinic name (the template as "Template clinic", translated:
  `useContextLabel`), a warning banner in the template clinic (with "Back to platform admin" for the super admin), and `NAV_ITEMS`
  (`app/navigation.tsx`, each with its `permission`; items the user can't open are hidden). Add new modules to
  `NAV_ITEMS` and `CLINIC_ROUTES` (`app/App.tsx`: each route with its permission, wrapped in `RequirePermission`).
  Pages are re-mounted when the context changes; `useClinic()` gives the current clinic.
- `AdminLayout` (`features/admin/components`, platform context) = `AppShell` with "Platform admin", `ADMIN_NAV_ITEMS` (Clinics; add
  new admin sections there) and "Edit default catalog" (switches to the template context, opens its drugs).

### Internationalization (UI text only)

- Languages are declared once in `src/i18n/languages.ts` (`code`, `label`, `dir`). Default `en`.
- Strings: `src/i18n/locales/en.ts` is the source; `ar.ts` is typed `Translations` (= `typeof en`),
  so **a missing Arabic key fails the build**. Always add keys to both files.
- UI counts are written as `"Label: {{count}}"`, not plural forms, to stay correct in Arabic. Where a sentence reads
  better (e.g. `admin.clinics.subtitle`, "3 clinics" / «3 عيادات»), use i18next plural keys with all six suffixes
  (`_zero/_one/_two/_few/_many/_other`) in **both** files (`ar.ts` is typed from `en.ts`).
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
- User-entered content (drug/group names) can be Arabic or English: inputs use `dir="auto"`. A name
  interpolated into a message is written `\u2068{{name}}\u2069` in both locale files (a bidi isolate: the quotes
  and the text after it stay in place in either direction).
- MUI's built-in English labels must be passed translated: e.g. `TablePagination`/`Pagination`
  `getItemAriaLabel` from `common.pagination.*`.
- Adding a language: add it to `LANGUAGES`, create `locales/<code>.ts` typed `Translations`,
  register it in `i18n/index.ts`.

### Data fetching

- `api/client.ts`: one axios instance (`baseURL` = `VITE_API_BASE_URL` or `/api/v1`). Interceptors add
  `Authorization: Bearer <access token>` and, on a 401 (or a 403 `noAccess`/`clinicSuspended` in a clinic), refresh
  once (shared promise) and retry once (not if the refresh moved to another clinic); a 401 from the refresh logs out
  (→ `/login`), a network error doesn't. The access token lives only in memory
  (`features/auth/session.ts`), never in storage.
- A context switch or logout cancels in-flight queries and clears the whole query cache.
- Each feature has `api.ts` with a query-key factory (`drugKeys`, `drugGroupKeys`) and hooks:
  `useX` (one page, `keepPreviousData`), `useXPicker` (`useInfiniteQuery`, "load more", 30/page),
  `useSaveX` / `useDeleteX` mutations that invalidate the feature's keys. Query hooks take
  `{enabled}` (`QueryOptions`), so pages never call endpoints the user can't use.
- Queries retry once, and only on network/5xx errors. Any 403 reloads `/me` (permissions may have
  changed); a 403 from a query also toasts the translated reason. A 403 `noAccess`/`clinicSuspended` in a clinic
  is first handled by the refresh interceptor, like a 401: it refreshes the session (as does a `/me` without a
  context while in a clinic, or in the platform admin of a user no longer super admin) and follows it: picker, the only clinic left, or login (with a message; a refresh 401
  `noContexts` = no clinic left), else replays the request once ([auth](../features/auth/tech.md)). `/me` also reloads when the tab gets the focus back.
  Drug mutations also invalidate group queries (groups embed drug names).
- `api/errors.ts` is the one place that reads error responses (the refresh interceptor uses it too): `toApiError(error)` parses the API's
  ProblemDetails into a typed `ApiError { status, code, errors, traceId }` (null without an HTTP response);
  `getErrorMessage(error)` maps `code` to `errors.<code>`, else 404 to `errors.notFound`, no response to
  `errors.network`, else `errors.generic`; `getFieldErrors(error)` maps each request field (`name`, `owner.phone`…) to
  the translated message of its first error, for forms that show errors on their inputs; `getOtherErrors(error,
  inputFields)` gives the messages of the errors no input shows (to toast next to them). Status checks (403 → reload `/me`, retries, the refresh's 401/409) use
  `toApiError(error)?.status`.

### Shared components (`components/common`)

| Component | Use |
|---|---|
| `PageHeader` | Page title, subtitle (a block: may hold a chip), leading (back button, top-aligned), actions; `titleText` for a title that may be long (cut after 3 lines, full text as tooltip) |
| `BackButton` | The header's "Back" icon button (arrow flipped in RTL) |
| `ListPagination` | Translated `TablePagination` with `PAGE_SIZES` (`pageSizes.ts`: 10/20/50); hides the rows-per-page choice below `sm` so it fits a phone |
| `PageBoundary` | Where a layout shows its page: `Suspense` spinner + error boundary ("Couldn't load this page. — Reload"), reset when the path changes |
| `SearchField` | Search input with icon and clear button |
| `SearchableList` | Search + result list with ↑/↓/Enter/Esc keyboard support, loading/error/empty states, "load more" |
| `SortableList` | dnd-kit vertical list; drag handle per row; mouse, touch and keyboard reordering |
| `EmptyState` | Icon + title + description + optional action |
| `useConfirm` | Promise-based confirmation dialog: `if (await confirm({...}))`; long titles/messages wrap; `destructive` starts with the focus on Cancel (a stray Enter does nothing) |
| `InfoTip` | Small ⓘ icon with a tooltip (opens on tap too) to explain a field or option |

Hooks (`src/hooks`): `useDebouncedValue`, `useLanguage`, `useFormatDate` (dates in the UI language, Latin digits),
`useSingleFlight` (`once(action)`: a call while the previous one runs is ignored; a mutation's `isPending` re-renders
too late to stop a double click). Use it for every create/save/delete button.

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
| `clinichub:chunkReloadAt` (`sessionStorage`) | When the app last reloaded itself after a failed chunk (`app/chunkReload.ts`: at most once per 30 s) |

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
`Auth__Jwt__SigningKey` and `Otp__HashKey` (≥ 32 bytes) and `MediatR__LicenseKey` (MediatR community license,
luckypennysoftware.com) as environment variables, or the app won't start. In Development the MediatR key may
be empty (MediatR only logs a warning).

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

- The admin area has screens for clinics (M1.5.4: create with the owner, list, rename, disable / enable, delete); each
  clinic's roles and staff are managed through the API only until M1.5.5. Clinics can't manage their own staff or
  roles yet.
- Permission or active-flag changes made outside the admin endpoints (e.g. psql) apply within 30 s
  (in-memory access cache) or at the next token refresh; the SPA's `/me` is cached 5 min (reloaded
  on any 403 and whenever the tab gets the focus back).
- No SMS sender yet: a deployed server must run with `Otp__Mode=Display` (code on screen; anyone can
  log in as any phone), so it suits a demo/staging server only.
- No per-IP limit on OTP requests yet (M3.2): one person can request codes for many numbers
  (costly once SMS is real).
- `AllowedOrigins` (CORS) is no longer used (dev goes through the Vite proxy, production is
  same-origin); it can be removed.
- Access tokens stay valid up to 15 min after **logout** (no per-request session check). Suspension
  and staff deactivation are checked per request through the access cache (within 30 s).
- **HTTPS is now required** outside localhost: the login refresh cookie is `Secure`, so on the
  plain-http LAN setup every reload would ask for a new login. Moving the deployment to HTTPS is a
  prerequisite for M1.2 in production.
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
   `IAppDbContext`, use cases in `ClinicHub.Application/Features/<Module>/<Feature>/` ([Adding a use case](#adding-a-use-case)),
   a thin controller in `ClinicHub.Api/Features/<Feature>/`, errors in `<Feature>Errors`, migration
   (reviewed, data-preserving).
2. Frontend: `src/features/<feature>/` with `types.ts`, `api.ts` (keys + hooks), `components/`,
   `pages/`; lazy route in `App.tsx`; nav item in `AppLayout`; strings in `en.ts` **and** `ar.ts`.
3. Check RTL (switch to Arabic) and mobile width.
4. Run the checks above.
5. Docs: `docs/features/<feature>/tech.md` + `business.md`, and update the overviews.
