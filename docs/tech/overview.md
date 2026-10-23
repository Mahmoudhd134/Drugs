# Technical overview

Clinic Drugs is a small web app for a clinic. It keeps a **drug catalog**, puts drugs into
reusable **protocols** (treatment templates), and lets staff build a **prescription** and copy it
(plain or formatted for Word). The interface is in **English and Arabic** (right-to-left).
Drug and protocol **content is not translated**: it is stored once, as typed.

> `ClinicHub` is the neutral code name of the code base (solution, projects, namespaces). It was
> renamed from `Drags` (an old typo) on 2026-10-14; the commercial brand will only touch UI strings,
> the logo and the domain. Legacy names kept on purpose: the PostgreSQL database and user `drags`, and
> the Docker Compose project `drags` (container `drags-postgres`, volume `drags_drags-pgdata`), so
> existing data is kept. The `Initial` and `AddRoles` designer files keep their old CLR name strings
> (`Drags.Api.Models.*`); the snapshot was rewritten with `ClinicHub.Domain.*` by `AddClinicDeletedAt`. The new JWT issuer/audience and refresh cookie name (`clinichub_refresh`)
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
  Catalog/                     Drug, Protocol (+ ProtocolItem), Dosing (+ TaperStep, DosingCodes),
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
                               separator or bidi override or isolate characters; nameTooLong), ValidText() (invalidText)
                               and SingleLineText(1000) (invalidText, textTooLong) rules
  Common/Results/              Result, Error, CommonErrors, ClinicError (clinicNames), CountError (drugCount, M1.7b)
  Common/Paging/               PagedResult<T>, Paging.Normalize, Paging.SearchTerm
  Common/Search/               SearchText: the Arabic-normalized fold (Fold, Term; OtherText, OtherTerm) and the column
                               names (SearchName, SearchOther) (M1.6.1, M1.7b)
  Features/Catalog/Drugs/      Commands/<UseCase>/, Queries/<UseCase>/, DrugDto (+ ProtocolDrugDto), DrugErrors,
                               DrugSource, SubCategoryFilter, DrugQueries (the list composition and order, M1.7b);
                               Queries/GetDrugTree (the tree's counts, M1.7c)
  Features/Catalog/Protocols/  same, + ProtocolDto, ProtocolErrors, SaveProtocolItem, ProtocolLineRules
  Features/Catalog/Categories/ CategoryDto, CategoryErrors, CategoryIds, CategoryRules; Queries/GetCategories (M1.7b)
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
  Features/Platform/SharedDrugs/   AdminDrugDto, SharedDrugErrors, SharedDrugStatus; Commands/ (CreateSharedDrug,
                               UpdateSharedDrug, WithdrawSharedDrug, RestoreSharedDrug), Queries/ (GetSharedDrugs,
                               GetSharedDrug) (M1.7b)
  Features/Platform/DrugCategories/  AdminCategoryDto; Commands/ (CreateCategory, RenameCategory, DeleteCategory,
                               CreateSubCategory, RenameSubCategory, DeleteSubCategory), Queries/GetAdminCategories (M1.7b)
  DependencyInjection.cs       AddApplication(configuration): MediatR (+ license), behaviors, validators,
                               the shared services; builds the permission catalog (startup validation)
ClinicHub.Infrastructure/      → Application, Domain. EF Core + PostgreSQL
  Database/AppDbContext.cs     DbSets, IAppDbContext, clinic FK + query filter for every IClinicOwned
  Database/Configurations/<Module>/   one IEntityTypeConfiguration<T> per entity (+ DosingConfiguration; Common/
                                      SearchNameConfiguration: the search columns and their source annotation)
  Database/ClinicAndTimestampsInterceptor.cs   fills ClinicId + CreatedAt/UpdatedAt and the search columns on save;
                                               guards shared drugs (M1.7 D2)
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
  Features/Drugs, Protocols/   thin controllers (+ their request records)
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
ClinicHub.Web/                 React SPA (Vite); builds into ClinicHub.Api/wwwroot. Also holds a stub
                               ClinicHub.Web.csproj (in the solution; its Program.cs "Hello World" is unused)
  src/app/                     App (routes), AppProviders, theme, chunkReload (reload once after a new deployment)
  src/api/                     axios client, error → message, shared API types
  src/components/common/       reusable UI (PageHeader, BackButton, ListPagination, PageBoundary, SearchField, …)
  src/components/layout/       AppShell (app bar + sidebar + page), navButtonSx, AppLayout (clinic app), SimpleLayout
                               (login etc.), LanguageMenu
  src/app/navigation.tsx       NAV_ITEMS (sidebar) with the permission each page needs, ADMIN_NAV_ITEMS (platform admin)
  src/features/<feature>/      api.ts, types.ts, components/, pages/
  src/features/access/         permissions.ts, usePermissions, withPermission, <Can>, Permission* controls,
                               <RequirePermission>, api.ts (the permission catalog)
  src/features/roles/, staff/  reusable role and staff lists + editors; data only through an adapter (no URLs)
  src/features/admin/          admin layout, clinic pages and tabs, adapters.ts (adminRolesApi / adminStaffApi)
  src/hooks/                   useLanguage, useDebouncedValue, useFormatDate, useSingleFlight, useDialogSave, useOpeningKey
  src/i18n/                    languages.ts, locales/en.ts, locales/ar.ts
  src/utils/                   clipboard
  src/**/*.test.ts(x)          Vitest unit + component tests, next to the code; src/test/: their helpers (providers,
                               MSW handlers, builders, page harnesses)
  e2e/                         Playwright end-to-end specs per area (auth/, catalog/, prescription/, …); support/:
                               fixtures, API data builders, expected texts, page checks; global-setup.ts (own API + DB)
tests/                         automated tests (docs/testing/README.md)
  ClinicHub.UnitTests/         xUnit: Domain + Application pure rules and validators, per module (Access/, Catalog/, …)
  ClinicHub.IntegrationTests/  xUnit + WebApplicationFactory on PostgreSQL, per area (Auth/, Access/, Isolation/,
                               Errors/, Admin/, Catalog/); Harness/ (databases, builders, login, clock), SelfTests/
  fixtures/                    dosing-cases.json: dosing/taper rule parity cases
  tools/                       traceability (catalog IDs ↔ tests), coverage gates, mutation score
  stryker-config.json, coverage.runsettings   Stryker.NET (the 6 critical files) and coverage settings
ci.ps1                         runs a test tier on GitHub Actions (-Tier step | full | release, -Mutate): how tests run
test.ps1                       the same tiers on the laptop, to debug the runner (reports in artifacts/, git-ignored)
.github/workflows/ci.yml       the CI workflow (every pull request: full; by hand: any tier)
docs/                          this documentation (docs/testing/: the test guide, catalog, known bugs, dress rehearsal)
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
  `Program.cs` validates the settings (missing/short secrets, a missing JWT issuer/audience, out-of-range OTP
  numbers or token/session lifetimes, any `Otp:Mode` other than `Display` (no SMS sender yet), an invalid seeded
  phone, or no `MediatR:LicenseKey` outside Development stop the app; OTP display mode outside Development only logs a warning; sections `Auth`, `Otp`,
  `Platform`: see [login § Configuration](../features/auth/tech.md#configuration)), then runs `Database.MigrateAsync()` and the startup seeding on every startup: the
  template clinic and the super admins from `Platform:SuperAdminPhones`; in Development, an empty DB
  also gets sample **template** content (2 own eye drops with categories, Prednisolone and Timolol, and the protocol
  "After cataract surgery" = the shared "VIGAMOX 0.5% EYE DROPS 5 ML" + Prednisolone with a taper override) and two clinics
  **provisioned from it** through `CreateClinicCommand` (default roles, owner, a copy of the template's own drugs and
  protocol): "Demo clinic" and "Second demo clinic" (2 own drugs + 1 protocol each; no bulk drugs since M1.7b), the
  `Platform:DevOwnerPhone` user as staff "Dev Owner" (Owner) in both, and `Platform:DevAssistantPhone` as "Dev
  Assistant" (Assistant in the first, read-only "Viewer" in the second). An empty `DevOwnerPhone` skips only the demo
  clinics (a warning: a clinic needs an owner; the template is still filled when empty). Without the shared catalog loaded nothing is seeded (no template content, no
  demo clinic) and a warning names `data/drug-catalog/tools/load_catalog.py`; the first start after the load seeds all.
- **Login:** phone + one-time code; a JWT access token per context (a clinic, or the platform for a
  super admin) and a rotating refresh token in an HttpOnly cookie ([login](../features/auth/tech.md)).
- **Clinic scoping:** every catalog row belongs to a clinic and every query is filtered to the
  request's clinic automatically ([clinic scoping](../features/clinic-scoping/tech.md)), except the platform's
  **shared drugs** (`Drugs.ClinicId` null, M1.7b: every clinic sees them, only the super admin writes them; categories
  are platform rows too: [shared catalog](../features/shared-catalog/tech.md)). The clinic
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
  Controllers inherit `BaseApiController` (route `api/v1/[controller]`; override with `[Route]` for a nested or
  kebab-case route, e.g. `api/v1/admin/clinics`).
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
  `Paging.Normalize`: page ≥ 1, pageSize 1–100; a huge page is capped at `int.MaxValue / pageSize`, so the offset
  `(page - 1) × pageSize` always fits an `int`: such a page is simply empty, never an error).
- **Search** (drugs, protocols, admin clinics, admin staff by name) is a case-insensitive, **Arabic-normalized**
  `Contains` (M1.6.1; M1.7b): the searched tables (`Drugs`, `Protocols`, `Clinics`, `Staff`) have an ordinary column
  `SearchName` (`text NOT NULL DEFAULT ''`) = `SearchText.Fold` of the name (`FullName` for staff): lower case, with
  أ إ آ ٱ and the superscript alef U+0670 → ا, ى → ي, ة → ه, ؤ → و, ئ → ي, and the tatweel (U+0640) and the diacritics
  (U+064B–U+065F) removed; `Drugs` also has `SearchOther` = `SearchText.OtherText(NameAr, ActiveIngredients)`. The
  **save interceptor fills them** from their source properties whenever a row is added or a source changes
  (`SearchNameConfiguration` records the sources in a model annotation: a new searched table needs one configuration
  line); the term is folded by the same `SearchText` code (`Term`, `OtherTerm`), so the two sides can't drift and
  search has **no database-specific SQL**. Consequences: no `ExecuteUpdate` may set a searched text (it would leave the
  column stale; architecture test); a row inserted by raw SQL gets `''` and isn't found until the app saves it; a
  change to the fold table needs a data migration that refolds the stored rows (and the same change in
  `load_catalog.py`). Handlers filter with `EF.Property<string>(x, SearchText.Column).Contains(term)` (a shadow
  property: the domain entities don't carry it). Drug and clinic search rank names whose folded name **starts with**
  the term first (drugs: own drugs before shared ones, design M1.7 D7).
  Display, ordering and the stored names are unchanged. `Paging.SearchTerm` (first step of `SearchText.Term`) trims
  the term and removes control characters (no name has one; a NUL would fail in the database): they are dropped from
  the term; a term left empty (e.g. only a tatweel) means no filter. The staff search by phone digits is separate
  (unchanged).
- **Errors**: every error response is one ProblemDetails shape (see [Errors](#errors-problemdetails)). Codes are
  API contracts: declared once in the feature's error class (`CommonErrors`, `DrugErrors`, `ProtocolErrors`,
  `CategoryErrors`, `SharedDrugErrors`, `IdentityErrors`, `AccessErrors`, `ClinicErrors`, `RoleErrors`,
  `StaffErrors`). Add new codes
  there **and** under `errors.*` in both locale files. A code that may name a clinic (`clinicSuspended`,
  `staffInactive`: the `clinicNames` field below) also has `errors.<code>_named` (plural forms, `{{clinics}}`). The transport codes (`unauthorized`, `invalidRequest`,
  `conflict`, `methodNotAllowed`, `unexpected`) have no keys on purpose: the SPA shows `errors.generic` for them;
  nor has `noContexts` (the refresh's 401 when no clinic is left: the SPA logs out with its own `auth.*` message).
- `Nullable` is disabled in every backend csproj (the stub `ClinicHub.Web.csproj` has it enabled; it holds no
  backend code).
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
  request in the logs. `title` by status: 400 "Validation failed", 401 "Unauthorized", 403 "Forbidden", 404 "Not
  found", 405 "Method not allowed", 409 "Conflict", 429 "Too many requests", 500 "Unexpected error".
- `clinicNames` (M1.6.0): a string array, only when the first error is a `ClinicError` (`Application/Common/Results`):
  the login and clinic picker refusals `clinicSuspended` / `staffInactive` list the clinics concerned (the picked one;
  at login every clinic with that reason, by name); the SPA then shows `errors.<code>_named` (plural forms, the names
  quoted with `common.quotedName` and joined with `Intl.ListFormat`). Absent everywhere else (one shape, one optional
  field).
- `drugCount` (M1.7b): a number, only when the first error is a `CountError` (`categoryInUse`, `subCategoryInUse`:
  every drug blocking the delete); the SPA then shows `errors.<code>_counted` (plural forms).
- Status from the first error's `ErrorType`: Validation 400, Unauthorized 401, Forbidden 403, NotFound 404,
  Conflict 409, Failure 500; `tooManyRequests` 429 and `methodNotAllowed` 405 by code. A `TooManyRequestsError`
  (e.g. the OTP limits) also sets `Retry-After`. A caller may pass an explicit status, which then wins over the
  mapping (`ApiProblemFactory.Create(httpContext, error, status)`). A problem built from no error at all is 500
  `unexpected`; for a problem that has a `code` but no `detail`, `errors[0].description` is the status's
  reason phrase (409 → "Conflict") and `detail` stays empty.

| Source | Hook | Code |
|---|---|---|
| Use case failure (`Result`) | `ToOk` / `ToCreated` / `ToNoContent` | the handler's or validator's |
| No/invalid/expired token | JwtBearer `OnChallenge` | `unauthorized` (401; the SPA refreshes by status) |
| Permission / context | `AccessAuthorizationResultHandler`, JwtBearer `OnForbidden` | `forbidden`, `noAccess`, `clinicSuspended` (login and the clinic picker also `staffInactive`, from the use cases) |
| Malformed JSON, wrong types, empty body, unreadable query values (`?page=first`) | `InvalidModelStateResponseFactory` (`AddApi`) | `invalidRequest` (one error per model-state error, with its `field`; the parser's message only in Development) |
| Unknown route / wrong method | `UseProblemStatusCodePages` | `notFound` 404 / `methodNotAllowed` 405 |
| Unhandled exception | `UnexpectedExceptionHandler` | `unexpected` 500; message and stack only in Development |
| Anything else (MVC `Problem()`, `Unauthorized()`…) | `AddProblemDetails` → `ApiProblemFactory.Complete` | from the status |

A missing drug or protocol answers `notFound` (the SPA shows "this item no longer exists"). An id that is not a whole
number (`/drugs/abc`, `/protocols/abc`, any `{id:int}` segment) fails its route's constraint: the methods that route
has (`GET`/`PUT`/`DELETE` on `/drugs/{id:int}`) and `GET` always → 404 `notFound`, the other methods (`POST`, `PATCH`
on `/drugs/abc`; `PUT` on `/admin/clinics/abc/suspend`) → 405 `methodNotAllowed` (the method check runs before the
constraint; the non-GET quirk in [architecture](../design/architecture.md#carry-over-to-m15)).
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
  DeletedAt (timestamptz null: set = soft deleted, Status untouched; no query filter), SearchName (filled by the app)
Categories (Platform)  Id (fixed 1–23 imported), NameEn, NameAr (≤100); no ClinicId (M1.7b)
SubCategories          Id (fixed 1–182), CategoryId (restrict), NameEn, NameAr; unique (Id, CategoryId)

Users (Identity)       Phone (E.164, unique), IsSuperAdmin, LastLoginAt
OtpCodes (Identity)    Phone, CodeHash (HMAC), ExpiresAt, Attempts, ConsumedAt; index (Phone, CreatedAt)
Sessions (Identity)    Id (uuid), UserId (cascade), RefreshTokenHash (unique), PreviousRefreshTokenHash
                       (indexed) + RotatedAt (30 s rotation grace), ContextType, ClinicId (restrict),
                       ExpiresAt (sliding), LastUsedAt, RevokedAt
Staff (Access)         ClinicId (clinic-owned), UserId (restrict), FullName, IsActive, SearchName (filled by the app);
                       unique (ClinicId, UserId)
Roles (Access)         ClinicId (clinic-owned), Name (<=100, unique per clinic), IsOwner (one per clinic)
RolePermissions        RoleId (cascade) + Permission (<=100), PK (RoleId, Permission); none for Owner
StaffRoles             StaffId, RoleId, ClinicId (clinic-owned); PK (StaffId, RoleId); composite FKs
                       (StaffId, ClinicId) -> Staff and (RoleId, ClinicId) -> Roles (cascade)
```

Details: [login tech](../features/auth/tech.md), [access tech](../features/access/tech.md).

Every table except the join tables `RolePermissions` and `StaffRoles` has `CreatedAt`/`UpdatedAt`
(`timestamptz`, UTC, set on save). `Drugs`, `Protocols`
and `ProtocolItems` have `ClinicId` (FK → `Clinics`, restrict; **nullable on `Drugs`: null = a shared drug**, M1.7b);
indexes `(ClinicId, Name)` on `Drugs` and `Protocols`, `(CategoryId, SubCategoryId)` on `Drugs`. `Drugs`, `Protocols`,
`Clinics` and `Staff` have `SearchName` (`Drugs` also `SearchOther`): ordinary text columns filled by the save
interceptor, only searched ([search](#conventions)). No index: a `Contains` can't use a btree index (~23K visible drugs
are scanned per request; design M1.7 D7 budget). Protocol items reference their protocol with the composite FK
`(ProtocolId, ClinicId)` and their drug with a simple FK (`DrugId`, cascade): a line's drug is shared or the clinic's
own, checked by the protocol handlers (`drugNotFound`), not by the database (M1.7b).

```
Drugs                       Protocols
- Id (PK)                   - Id (PK)
- ClinicId (null = shared)  - Name (≤256, required)
- Name (≤256, required)     - SearchName (filled by the app)
- NameAr (internal, imported shared drugs only, search only)
- ActiveIngredients (≤1000), CategoryId (required), SubCategoryId (composite FK with CategoryId)
- IsWithdrawn, WithdrawnAt (shared only)
- SearchName, SearchOther (filled by the app)
- Description (nullable)
- DefaultDosing_* (owned Dosing, nullable; never on a shared drug: dose, frequency, duration, eye, TaperSteps JSON)
        ▲                           ▲
        │ DrugId (cascade)          │ ProtocolId (cascade)
        └────── ProtocolItems ──────┘
                - Id (PK)
                - Order (int, 0-based position in the protocol)
                - Dosing_* (owned Dosing, nullable: protocol override; eye may be "ask")
```

- `TaperSteps` is an optional tapering schedule stored as one JSON text column
  ([tapering tech](../features/tapering/tech.md)).

- Deleting a drug removes it from every protocol (cascade). Deleting a protocol keeps its drugs.
- A drug appears at most once per protocol **per effective eye** (the line's own eye, else the drug's default;
  `duplicateProtocolItem`, checked by the handlers since M1.6.0).
- `Dosing` is an EF **owned type** (`ClinicHub.Domain/Catalog/Dosing.cs`), reusable on any entity via
  `OwnsOne(..., DosingConfiguration.Configure)`. Codes and rules: [dosing tech](../features/dosing/tech.md).

### API (`/api/v1`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/auth/otp/mode` | `{ mode }` (`Display` → the login page shows its banner). Anonymous |
| POST | `/auth/otp/request` | `{ phone }` → code created (`devCode` in display mode). Anonymous |
| POST | `/auth/otp/verify` | `{ phone, code }` → `AuthResult` + refresh cookie. Anonymous (nowhere to enter: 403 `clinicSuspended` / `staffInactive` with `clinicNames`, else `noAccess`) |
| POST | `/auth/refresh` | Refresh cookie → new `AuthResult`, cookie rotated |
| POST | `/auth/context` | `{ type, clinicId? }` → `AuthResult` for that context (can't enter: 403 `clinicSuspended` / `staffInactive` with `clinicNames`, else `noAccess`) |
| GET | `/auth/contexts` | Contexts the user can pick |
| POST | `/auth/logout` | Revokes the session, clears the cookie → 204 |
| GET | `/me` | User, context, staff, permissions (expanded keys in a clinic context) |
| GET | `/permissions` | The permission catalog `[{ key, module, resource, action, requires }]` (any access token) |
| GET | `/drugs?search=&source=&categoryId=&subCategoryId=&page=1&pageSize=20` | Paged own + active shared drugs (`source` = `all`/`shared`/`own`; category filters; `subCategoryId` = id or `none`), own first (newest first; with a search prefix matches first, then by name) |
| GET | `/drugs/tree?search=&source=` | The drug tree's counts: categories → subcategories (the «بدون تصنيف فرعي» bucket last) with their match counts for the same search and `source` as `/drugs`; rows with 0 matches left out (`drugs.list`, M1.7c) |
| GET | `/drugs/{id}` | One drug, own or shared (a withdrawn shared one with `withdrawn: true`) |
| POST | `/drugs` | Create an own drug `{ name, activeIngredients, description, defaultDosing, categoryId, subCategoryId }` → 201 + drug |
| PUT | `/drugs/{id}` | Update (same body) → drug; a shared drug → 409 `sharedDrugReadOnly` |
| GET | `/drugs/{id}/protocols` | Names of this clinic's protocols using the drug |
| DELETE | `/drugs/{id}` | Delete → 204; a shared drug → 409 `sharedDrugReadOnly` |
| GET | `/drug-categories` | Every category with its subcategories (`drugs.list`) |
| GET | `/protocols?search=&page=1&pageSize=20` | Paged protocols (each with its items: drug + override, in order), ordered by name |
| GET | `/protocols/{id}` | One protocol with its items |
| POST | `/protocols` | Create `{ name, items: [{ drugId, dosing }] }` → 201 + protocol |
| PUT | `/protocols/{id}` | Replace name and items (order + overrides) → protocol; a withdrawn shared drug keeps its stored lines only (`drugWithdrawn`) |
| DELETE | `/protocols/{id}` | Delete → 204 |
| GET | `/admin/clinics?search=&status=&page=1&pageSize=20` | Paged `ClinicSummary` (no template, no deleted), by name (prefix matches first when searching); `status` = `active` / `suspended` |
| GET | `/admin/clinics/{id}` | `ClinicDetails` (+ `owners`) |
| POST | `/admin/clinics` | Create `{ name, owner: { phone, fullName } }` → 201 + `ClinicDetails`, provisioned from the template (roles, owner, drugs and protocols copied; all or nothing) |
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
| GET | `/admin/drugs?search=&status=&categoryId=&subCategoryId=&page=&pageSize=` | Paged shared drugs (`status` = `active` (default) / `withdrawn` / `all`), the clinic list's search and order (M1.7b) |
| GET | `/admin/drugs/{id}` | One shared drug (`AdminDrugDto`); own or unknown → 404 |
| POST | `/admin/drugs`, PUT `/admin/drugs/{id}` | Create / update `{ name, activeIngredients, description, categoryId, subCategoryId }` (no dosing) |
| POST | `/admin/drugs/{id}/withdraw`, `/admin/drugs/{id}/restore` | → 204 (idempotent) |
| GET | `/admin/drug-categories` | Categories and subcategories with `drugCount`, `deletedClinicsDrugCount` (+ `noSubCategoryDrugCount`) |
| POST | `/admin/drug-categories`, PUT `/admin/drug-categories/{id}`, DELETE `/admin/drug-categories/{id}` | Create / rename `{ nameEn, nameAr }` (`categoryNameTaken`) / delete (`categoryInUse` + `drugCount`) |
| POST | `/admin/drug-categories/{id}/subcategories`, PUT/DELETE `/admin/drug-subcategories/{id}` | Same for subcategories (`subCategoryNameTaken`, `subCategoryInUse`) |

Errors on every route: [ProblemDetails](#errors-problemdetails). Catalog routes (`/drugs`, `/protocols`) need a clinic-context access token
(`Authorization: Bearer …`): none/expired → 401, platform or no context → 403; and each route's
permission (e.g. `drugs.delete`, [table](../features/access/tech.md#api)), else 403 `forbidden`;
inactive staff or a deleted clinic → 403 `noAccess`, suspended clinic → 403 `clinicSuspended`. Auth contracts:
[login tech](../features/auth/tech.md). Admin routes (`/admin/*`) need a platform-context token of a
current super admin (else 403 `forbidden`); a missing, deleted or template clinic id → 404 `notFound`, also on the
roles and staff routes (a suspended clinic is managed); a role or staff id of another clinic → 404 `notFound`. Role
and staff errors: `roleNameTaken` (also a role named like the Owner role's label, "Owner" / «المالك»), `roleLocked`, `roleInUse`, `staffExists`, `lastOwner` (409); `unknownPermission`,
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
  `AddClinicDeletedAt` (M1.5.1, one nullable column) → `AddSearchNames` (M1.6.1: the stored generated `SearchName`
  columns on `Drugs`, `DrugGroups`, `Clinics` and `Staff`; computed for existing rows when added, so no data step; down
  drops them; tested up → down → up with data) → `RenameGroupsToProtocols` (M1.7a: renames in place, no drop/create:
  `DrugGroups` → `Protocols`, `DrugGroupItems` → `ProtocolItems`, `DrugGroupId` → `ProtocolId`, every PK/AK/FK and index
  name (`RENAME CONSTRAINT`, `RenameIndex`) and the two identity sequences, so a migrated database matches a fresh one;
  then the stored permission keys `groups.*` → `protocols.*` in `RolePermissions`; down reverses it; tested up → down →
  up with data) → `AddSharedCatalog` (M1.7b: schema only, on an empty `Drugs` table: `Categories`, `SubCategories`,
  the new drug columns, nullable `Drugs.ClinicId`, the items' drug FK made simple (cascade) and `AK_Drugs_Id_ClinicId`
  dropped, the composite subcategory FK, the four `SearchName` columns turned into ordinary columns filled by the app
  and `SearchOther` added; no rows (the shared catalog is loaded by `data/drug-catalog/tools/load_catalog.py`, once);
  down restores the generated columns and fails, rolled back, while shared drugs exist).
  To reset a dev DB: `docker compose down -v && docker compose up -d`, then
  `dotnet ef database update <ef args>`, then `python data/drug-catalog/tools/load_catalog.py --connection
  "host=localhost port=5432 dbname=drags user=drags password=drags"` before the first start (the dev seed's template
  sample needs the catalog).

## Frontend

### App shell

- `main.tsx` imports `./i18n` (initializes i18next) and renders `App`.
- `AppProviders` (inside `BrowserRouter`): TanStack `QueryClient` (staleTime 30 s, retry 1, no
  refetch on focus), emotion cache per direction (`rtl` cache adds the stylis RTL plugin), MUI theme
  from `createAppTheme(direction)`, `CssBaseline`, `AuthProvider` (session restore, `useAuth()`),
  `Toaster`.
- **Accessible names** (axe, UX-036): every progress indicator (`LinearProgress`, `CircularProgress`) has
  `aria-label={t("common.loading")}`; a `role="listbox"` has a name (`SearchableList`: `common.searchResults`); a MUI
  `List` holds `ListItem`s (`<li>`), a `ListItemButton` goes inside one (`disablePadding`); controls built by a library
  get theirs from the app (the Quill toolbar: `EditorContent`, `prescription.toolbar.*`).
- **Contrast**: text reads at ≥ 4.5:1 (axe `color-contrast`). The theme's `warning` is `#b45309` (MUI's `#ed6c02` gives
  white text 3.1:1: the login page's filled display-mode banner); muted text that must be read uses `text.secondary`,
  never `text.disabled` (the dosing preview's «لا توجد جرعة محددة», the protocol dialogs' boxes, the staff editor's locked
  phone explanation: a disabled field's helper text is set back to `text.secondary`).
- **Toasts** (`react-hot-toast`'s `Toaster`, bottom-center; `white-space: pre-line`, so a message's parts joined with
  `\n` show on their own lines, and `overflow-wrap: anywhere`, so a long name wraps): success, error or neutral
  (plain) style; each closes by itself after the library's time (some longer, e.g. 8 s for the lost-clinic messages).
  **Dismissing** (the user's decision, 2026-10-16): every toast also has a small × icon button (tooltip and accessible
  name «إغلاق» / "Close", `common.close`) that closes it at once, and on a touch phone swiping it sideways closes it;
  closing one toast leaves the others; a swipe shorter than 60 px springs back. Closing removes the toast at once
  (`toast.remove`, no exit delay). The toaster is `components/common/AppToaster.tsx` (`AppToaster`: react-hot-toast
  headless through `useToaster`, laid out as the library's `Toaster`; each toast a `ToastBar` with the button at its
  end, so on the left in Arabic), mounted by `AppProviders` and by the Vitest `renderWithProviders`. As in the library,
  a mouse over the toasts pauses their timers; a finger doesn't (a tap also fires mouse events, and once the tapped
  toast is gone the pointer never leaves, which would keep the other toasts paused for good).
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
| `/admin/clinics/:id` | `ClinicPage`: name, status, tabs from `CLINIC_TABS` as child routes (index = Overview: rename, disable / enable, delete with the name typed; `roles` and `staff`: the reusable role and staff components with the admin adapters); an id that isn't a positive int without leading zeros, or unknown/deleted/template → "not found" |
| `/admin/*` | redirects to `/admin` |
| `/platform` | redirects to `/admin` (the placeholder page before the admin area) |
| `/` | `PrescriptionPage` (`prescriptions.create`; without it → the first allowed page) |
| `/protocols` | `ProtocolsPage` (`protocols.list`) |
| `/protocols/new`, `/protocols/:id` | `ProtocolEditorPage` (`protocols.create` / `protocols.details`; read only without `protocols.update`) |
| `/groups`, `/groups/new`, `/groups/:id` | redirect (replace) to the same `/protocols…` route, id, query and hash kept (M1.7a) |
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
- Reusable data components (M1.5 design D9): a component that may be mounted by several areas (e.g. `RoleList`,
  `StaffList`) takes an **adapter** (`list`/`create`/`update`/`delete` + a `DataScope`: its query-key `scope` and what a
  change `affects`, `api/dataScope.ts`) instead of calling the API itself; the area builds the adapter (e.g.
  `adminRolesApi(clinicId)`) ([platform admin](../features/platform-admin/tech.md#roles-and-staff-screens-m155)).

### Internationalization (UI text only)

- Languages are declared once in `src/i18n/languages.ts` (`code`, `label`, `dir`). First visit: the browser's language when supported (any Arabic
  locale → `ar`), else `en` (`fallbackLng`); after that, the stored choice.
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
- User-entered content (drug/protocol names) can be Arabic or English: inputs use `dir="auto"`. A name
  interpolated into a message is wrapped in the bidi isolates U+2068/U+2069 in both locale files (written
  `\u2068{{name}}\u2069`; some `roles.*` / `staff.*` strings hold the literal characters instead, same result): the
  quotes and the text after it stay in place in either direction.
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
- Each feature has `api.ts` with a query-key factory (`drugKeys`, `protocolKeys`) and hooks:
  `useX` (one page, `keepPreviousData`), `useXPicker` (`useInfiniteQuery`, "load more", 30/page),
  `useSaveX` / `useDeleteX` mutations that invalidate the feature's keys. Query hooks take
  `{enabled}` (`QueryOptions`), so pages never call endpoints the user can't use.
- Queries retry once, and only on network/5xx errors. Any 403 reloads `/me` (permissions may have
  changed); a 403 from a query also toasts the translated reason. A 403 `noAccess`/`clinicSuspended` in a clinic
  is first handled by the refresh interceptor, like a 401: it refreshes the session (as does a `/me` without a
  context while in a clinic, or in the platform admin of a user no longer super admin) and follows it: picker, the only clinic left, or login (with a message; a refresh 401
  `noContexts` = no clinic left), else replays the request once ([auth](../features/auth/tech.md)). `/me` also reloads when the tab gets the focus back.
  Drug mutations also invalidate protocol queries (protocols embed drug names).
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
| `ListPagination` | Translated `TablePagination` with `PAGE_SIZES` (`pageSizes.ts`: 10/20/50); hides the rows-per-page choice below `sm` so it fits a phone; the choice also has its own `aria-label` |
| `PageBoundary` | Where a layout shows its page: `Suspense` spinner + error boundary ("Couldn't load this page. — Reload"), reset when the path changes |
| `SearchField` | Search input with icon and clear button |
| `SearchableList` | Search + result list with ↑/↓/Enter/Esc keyboard support (the first result is highlighted from the start and again when the search changes; ↑/↓ stop at the edges; Enter picks the highlighted one; Esc clears the search), loading/error/empty states, "load more"; a double click on an item selects it once (`event.detail > 1` ignored) |
| `SortableList` | dnd-kit vertical list; drag handle per row; mouse, touch and keyboard reordering |
| `EmptyState` | Icon + title + description + optional action |
| `useConfirm` | Promise-based confirmation dialog: `if (await confirm({...}))`; long titles/messages wrap; `destructive` starts with the focus on Cancel (a stray Enter does nothing) |
| `InfoTip` | Small ⓘ icon with a tooltip (a `TapTooltip`: on hover, on keyboard focus, and on tap at once; after a tap it stays ~5 s) to explain a field or option |
| `TapTooltip` | A `Tooltip` for tooltips that explain (ⓘ, why a control is disabled, the protocol editor line's custom-dosing and ask-the-eye chips in the read-only view; in edit mode a tap on the line opens its dosing dialog): a quick tap shows it at once and it stays ~5 s (`leaveTouchDelay` 5000); hover and focus as usual. MUI's default needs a 700 ms long press, and even with `enterTouchDelay={0}` a touchend in the same tick (a quick tap) cancels its open timer, so it is controlled and the child's `touchend` opens it; MUI's leave timer closes it. The child takes the ref and event props (wrap a disabled control in a `span`); `tap={false}` keeps MUI's touch behaviour while a tap is the control's own action. Used by `InfoTip`, the `Permission*` denied tooltip, the tapering steps editor's disabled step dose / «إضافة مرحلة», the role list's held-role Delete |
| `AppToaster` | The app's toaster ([App shell](#app-shell) "Toasts"): bottom-center, every toast with a × «إغلاق» / "Close" icon button and swipe-to-close; mounted once by `AppProviders` |
| `FormDialog` | The `Dialog` of a create/edit form saving through `useDialogSave`: Esc and a backdrop click do nothing while the save is in flight (contract below) |
| `DialogForm` | The `<form>` of a dialog around `DialogContent` + `DialogActions`: a flex column, so only the content scrolls and Save / Cancel stay on screen (also full screen on a phone). Drug, role and staff dialogs; its `onSubmit` is `useDialogSave`'s `submit` (below) |

Hooks (`src/hooks`): `useDebouncedValue`, `useLanguage`, `useFormatDate` (dates in the UI language, Latin digits),
`useSingleFlight` (`once(action)`: a call while the previous one runs is ignored; a mutation's `isPending` re-renders
too late to stop a double click). Use it for every create/save/delete button.

Every create/edit dialog whose Save calls the API (drug, role, staff, Rename clinic) follows one contract:
- `FormDialog` (`components/common`): the MUI `Dialog` of such a form. Not closable while the save is in flight: Esc
  and a backdrop click do nothing (`useDialogSave` tells it through a context), Cancel is disabled by the form
  (`isPending`); the typed values are kept. When no save runs, Esc closes it without saving (UX-023).
- `useDialogSave(save)` → `{submit, done}`: the form's `onSubmit` (one save at a time, through `useSingleFlight`). `save`
  resolves `true` when it succeeded and the dialog closes, `false` otherwise (invalid input, an API error). After a
  success the form stays locked until it unmounts: `done` is true (Save is `disabled={isPending || done}`) and every
  later submit (a second click or Enter landing after a fast answer, while the dialog fades out) is ignored. After a
  failure it unlocks at once, so the user can fix the input and save again.
- `useOpeningKey(open)`: a number that changes each time `open` turns true, used as the form's `key`. Every opening
  mounts a fresh form (from the given entity, or empty), also when reopened during the closing animation (MUI keeps the
  closing content mounted until it has faded out), and so also unlocked. The clinic Delete dialog and the prescription
  editor («تعديل ونسخ», rebuilt from the current lines) use it too.
- The clinic Delete dialog (a confirmation; its delete runs in the page) is not closable while deleting either:
  `onClose={pending ? undefined : onClose}`.

The line dialogs (protocol line, prescription line) save locally and synchronously; their form is rendered only while a line
is given (`{item && <Form key={item.key}/>}`), so it is gone as soon as they close.

Permission pieces (`features/access`, [details](../features/access/tech.md#frontend-srcfeaturesaccess)):

| Piece | Use |
|---|---|
| `usePermissions()` | `{ can, canAll, canAny, allows, ready }` for logic |
| `<Can permission / anyOf / allOf fallback?>` | Render children only when allowed |
| `PermissionButton`, `PermissionIconButton`, `PermissionMenuItem`, `PermissionFab` | Gated MUI controls; `whenDenied="disable"` shows them disabled with a tooltip (`TapTooltip`: on hover, and on tap at once, staying ~5 s; default hidden) |
| `withPermission(Component)` | Gate any control that takes `disabled` the same way |
| `<RequirePermission>` | Route guard with the "No permission" page |

### Browser storage

| Key | Content |
|---|---|
| `language` | UI language code |
| `prescription.lines.<clinicId>` | The clinic's current prescription lines (drug snapshot + dosing + note) |
| `prescription.lines` | Legacy (before login): moved to the first clinic opened, then removed |
| `prescription.selection` | Legacy (pre-dosing) list of drugs; migrated the same way, then removed |
| `clinichub:chunkReloadAt` (`sessionStorage`) | When the app last reloaded itself after a failed chunk (`app/chunkReload.ts`: at most once per 30 s, and only when the server answers `/` with a success: unreachable, or an answer that isn't ok (e.g. 5xx), means no reload, and the page shows "Couldn't load — Reload"; without `sessionStorage` it never reloads by itself) |

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

OTP limits come from `Otp:*`: the intended limits (code defaults in `OtpSettings`) are 60 s between codes for a phone,
5 codes per hour and 5 wrong tries; `appsettings.json` currently relaxes them to 0 s / 5000 / 5000 by choice, until
hardening in M3.2. In dev, `DELETE FROM "OtpCodes"` resets them.
Secrets: dev values are in `appsettings.Development.json`; any other environment must set
`Auth__Jwt__SigningKey` and `Otp__HashKey` (≥ 32 bytes) as environment variables, or the app won't start. The
MediatR community license key (luckypennysoftware.com) is committed in `appsettings.json` (`MediatR:LicenseKey`, by
choice; expires 2027-10-14, renew yearly); an env var `MediatR__LicenseKey` overrides it, and an empty key stops the
app outside Development (in Development MediatR only logs a warning).

Checks before committing (the laptop, seconds), then the tests on GitHub Actions after committing:

```bash
cd ClinicHub.Web && npx tsc -b && npx eslint src
dotnet build ClinicHub.sln             # all projects; use -c Release if Rider is running the Debug build
./ci.ps1                               # the step tier on CI (pushes the branch, waits), ≈ 5 min
./ci.ps1 -Tier full                    # the full tier on CI (also every pull request), ≈ 8 min
```

Tests: tiers, reports, gates and how to add a test at each level are in the [testing README](../testing/README.md);
what to test is the [test catalog](../testing/test-catalog.md). The test runs build in Release and use their own
databases (`drags_it_*`, `drags_e2e_*`), never `drags`, so Rider can keep running the API. Still check UI changes in
the browser at `http://localhost:5173` (Arabic and English, phone width).

Commits go directly to `main`. Production build and IIS deployment: see `DEPLOY.md` (`deploy.ps1`).

## Known limitations / tech debt

> Planned direction (clinics, staff, roles, phone + OTP login, super admin):
> [platform high-level design](../design/platform-hld.md).

- Only the super admin manages roles and staff (admin area, M1.5); clinics can't manage their own yet (the role and
  staff components are reusable for it: a clinic-side adapter + `roles.*` / `staff.*` permissions, after the MVP).
- Permission or active-flag changes made outside the admin endpoints (e.g. psql) apply within 30 s
  (in-memory access cache) or at the next token refresh; the SPA's `/me` is cached 5 min (reloaded
  on any 403 and whenever the tab gets the focus back).
- No SMS sender yet: a deployed server must run with `Otp__Mode=Display` (code on screen; anyone can
  log in as any phone), so it suits a demo/staging server only.
- No per-IP limit on OTP requests yet (M3.2): one person can request codes for many numbers
  (costly once SMS is real).
- `AllowedOrigins` (CORS) is still applied by `Program.cs` but no longer needed (dev goes through the Vite
  proxy, production is same-origin); it can be removed.
- Access tokens stay valid up to 15 min after **logout** (no per-request session check). Suspension,
  deletion and staff deactivation/removal are checked per request through the access cache: at once when done
  through the admin endpoints, within 30 s when changed outside them.
- **HTTPS is now required** outside localhost: the login refresh cookie is `Secure`, so on the
  plain-http LAN setup every reload would ask for a new login. Moving the deployment to HTTPS is a
  prerequisite for M1.2 in production.
- HTTP only on the LAN. The async Clipboard API needs HTTPS, so copying uses an
  `execCommand` fallback (works, but HTTPS is recommended).
- No automated database backups yet.
- Name ordering follows the database's default collation (not tuned for Arabic). With the `postgres:17` image's default
  (`en_US.utf8`: dev and tests) letters compare ignoring case first (`alpha` before `Zeta`) and Latin names come before
  Arabic ones; a database created with another collation (e.g. `C`, or a Windows locale) orders them differently, so
  the production database should be created with the same collation (`en_US.utf8`) or the orders above change.
  Search folds the common Arabic spelling variants and lower-cases (`ToLowerInvariant` for the term, the database's
  `lower()` for the name: they agree for Latin and Arabic; a few special letters, e.g. Turkish "İ", may differ).
  Not folded: Persian letters (ی, ک), a lone hamza ء, look-alike letters of other scripts.
- Prescription lines store a drug snapshot in the browser; later edits to a drug are not
  reflected in an already-built prescription, and deleted drugs stay in it until removed.
- Dosing code lists are fixed in code (`DosingCodes` / `features/dosing/types.ts`), not admin-managed.
- Tests run on GitHub Actions (`ci.ps1`, `.github/workflows/ci.yml`; every pull request runs `full`). Bugs found by the tests (none open): [known bugs](../testing/known-bugs.md).

## Adding a feature: checklist

1. Backend: entity in `ClinicHub.Domain/<Module>/`, its `IEntityTypeConfiguration` in
   `ClinicHub.Infrastructure/Database/Configurations/<Module>/` + a `DbSet` in `AppDbContext` and
   `IAppDbContext`, use cases in `ClinicHub.Application/Features/<Module>/<Feature>/` ([Adding a use case](#adding-a-use-case)),
   a thin controller in `ClinicHub.Api/Features/<Feature>/`, errors in `<Feature>Errors`, migration
   (reviewed, data-preserving).
2. Frontend: `src/features/<feature>/` with `types.ts`, `api.ts` (keys + hooks), `components/`,
   `pages/`; lazy route in `CLINIC_ROUTES` (`app/App.tsx`) and a nav item in `NAV_ITEMS` (`app/navigation.tsx`); strings in `en.ts` **and** `ar.ts`.
3. Check RTL (switch to Arabic) and mobile width.
4. Docs: `docs/features/<feature>/tech.md` + `business.md`, and update the overviews.
5. Test cases: add the feature's cases to the [test catalog](../testing/test-catalog.md) (the area's next IDs, or a new
   area for a new feature) and fix the cases whose behavior changed.
6. Tests at each case's level (`unit`, `api`, `ui`, `e2e`), tagged with the case IDs
   ([testing README § Adding a test](../testing/README.md#adding-a-test)), in the same commit as the code and docs.
7. Run the checks above: `./ci.ps1` (`step` on CI) after each round, `./ci.ps1 -Tier full` when the feature is done,
   then its pull request ([testing README § Continuous integration](../testing/README.md#continuous-integration-github-actions)).
