# Backend architecture

Status: **agreed, being implemented** (steps 1 and 2 done). Decided in discussion on 2026-10-12. Built in **Phase 3.5**,
a pure refactor between Phase 3 (Access) and Phase 4 (Platform), so the Phase 4 admin code is written
directly in this structure. Until it is done, the code follows `docs/tech/overview.md`.

Phase 3.5 is done in three steps:

1. **Project split (done):** the four projects; Domain and data access moved (§ 1, § 2, § 4). Services,
   controllers and auth stay in `ClinicHub.Api`.
2. **Application foundations + Catalog (done):** MediatR abstractions, `Result`/`Error`, FluentValidation, the
   pipeline behaviors and `ITransactionRunner` (§ 3); `ApiProblemFactory` with every error source and the
   `Result` → HTTP helpers (§ 5, § 6); the Catalog module (Drugs, DrugGroups) as commands/queries with thin
   controllers. The app works end to end after this step. See [carry-over](#carry-over-to-step-3).
3. **Identity, Access, Platform + permission structure:** the remaining services move to Application on top
   of the abstractions (purpose-built interfaces for what `IAppDbContext` hides), their use cases and
   Infrastructure implementations, Access 403s through `ApiProblemFactory`, and the permission constants
   split per module with `[PermissionModule]` (§ 7.1).

Module by module, so every step ends with a working app.

### Step 2: what was done

- Packages in `ClinicHub.Application`: MediatR 13.1 (license from `MediatR:LicenseKey`; `AppSettings.Validate`
  stops the app outside Development when it is empty), FluentValidation 12 + its DI extensions,
  `Microsoft.Extensions.Configuration.Abstractions` (for `AddApplication(configuration)`).
- `Application/Common`: `Messaging/` (§ 3.1), `Results/` (`Result`, `Error`, `ErrorType`, `CommonErrors`),
  `Behaviors/` (§ 3.5), `Validation/` (`.WithError(error)` = `.WithErrorCode(code)` + the description; the shared
  `ValidName()` rule), `Paging/` (`PagedResult`, `Paging.Normalize`), `Abstractions/ITransactionRunner`.
- `TransactionRunner` (Infrastructure): EF execution strategy + one transaction; commits only a successful
  `Result`; on a failed one it rolls back and clears the change tracker; inside an existing transaction it
  uses a savepoint (released on success, rolled back to on failure).
- Catalog (`Application/Features/Catalog/Drugs`, `…/DrugGroups`): one folder per use case. Create and update
  each have their own validator and handler (no shared interface or base validator: a few repeated lines
  are simpler). `SaveDrugGroupItem.Normalize` is the one shared helper (validators + handlers).
- `ErrorCodes.ValidateName` became `ValidName()`; `DosingRules.IsValid` → `invalidDosing` is a `.Must(...)`
  rule. The group's `drugNotFound` reads the database, so the handlers check it after validation (same
  precedence as before: it is only reported when everything else is valid).
- **404 code:** an unknown drug or group answers `code: "notFound"` (`DrugErrors.NotFound`,
  `DrugGroupErrors.NotFound`), not `drugNotFound`: before, the 404 had no code and the SPA showed
  `errors.notFound`; `drugNotFound` stays the 400 for an unknown drug *inside* a group.
- API: `Errors/ApiProblemFactory` (+ `ResultHttpExtensions`, `UnexpectedExceptionHandler`), `AddApi()`,
  `UseProblemStatusCodePages()`; the SPA fallback no longer answers `/api/*` (an unknown API route is a 404
  ProblemDetails instead of `index.html`).
- `Application/Features/Access/AccessErrors` (`noAccess`, `clinicSuspended`), so the Access 403s have
  descriptions; the Api's Access 403 handlers file is now `AccessDenied.cs`.

### Carry-over to step 3

- **Identity, Access and Platform still live in `ClinicHub.Api`** and inject the concrete `AppDbContext`:
  `OtpService`, `SessionService`, `MembershipService`, `PermissionService`, `IdentitySeeder`, `StartupSeeder`,
  `AccessCache`, `TokenService`, `DisplayOtpSender`, `CurrentUser`, `Permissions` + `PermissionCatalog`,
  `DefaultRoles`, `ICurrentUser`, `IAccessCache`, `IOtpSender`. Move them per § 1, switching to
  `IAppDbContext`: transactions (`OtpService`, `IdentitySeeder`, `StartupSeeder`) → `ITransactionRunner` (it
  exists now), raw SQL (`OtpService`'s `pg_advisory_xact_lock`) → a purpose-built interface (e.g. `IOtpLock`),
  `ChangeTracker.Clear()` (`StartupSeeder`'s batched seed) and `Database.MigrateAsync()` stay in
  Infrastructure/Api.
- **`ErrorCodes`** (`ClinicHub.Api/Shared`) still holds the Identity/Access codes (`invalidPhone`, `invalidCode`,
  `codeExpired`, `tooManyAttempts`, `tooManyRequests`, `noAccess`, `clinicSuspended`, `forbidden`); the services
  return them as strings and `AuthController` answers with `BaseApiController.ApiError(code, status)`, which goes
  through `ApiProblemFactory` but only has a generic description per status (the 403 codes use `AccessErrors`).
  Turn them into `IdentityErrors` / `AccessErrors` and `Result`s; then remove `ApiError` and `ErrorCodes`.
- **Access 403s**: `AccessAuthorizationResultHandler` and `AccessExceptionHandler` already answer through
  `ApiProblemFactory`, but map failure-reason *strings* to `Error`s (`AccessProblem.ToError`); once the codes are
  `Error`s, pass the `Error` itself.
- **Permissions**: split `Permissions` per module with `[PermissionModule]` (§ 7.1).
- `EnsureAsync`'s `AccessDeniedException` → 403 is logged at Error by .NET 9's exception middleware (before
  any `IExceptionHandler` runs; unchanged from before). Returning a `Result` with `ErrorType.Forbidden` instead of
  throwing (once Access is in Application) removes it.
- `TransactionRunner`: a nested command that fails rolls back to its savepoint but leaves the change tracker as
  is (the outer unit's entities are in it too); revisit if commands start sending commands.
- 429: `tooManyRequests` gets its status by code in `ApiProblemFactory.StatusOf` (there is no `ErrorType` for
  it); the OTP 429 still sets `Retry-After` in `AuthController`.
- An unknown `/api` route with a non-GET method answers **405** (not 404): the SPA fallback's route matches the
  path for the method check before its constraint rules it out. Harmless; revisit if the fallback changes.
- The migrations' designer files and snapshot keep the old CLR names as strings (`"Drags.Api.Models.Drug"`);
  harmless (`has-pending-model-changes` reports none); the next `migrations add` rewrites the snapshot.
- `RolePermission` still has **no** `DbSet` on `IAppDbContext` (§ 3.6), on purpose.
- Npgsql's execution strategy has no retries configured; `TransactionRunner` is ready for
  `EnableRetryOnFailure` (each retried attempt clears the change tracker and reruns the handler).

What does **not** change: endpoints, routes, request and response shapes (except error responses gaining
fields, see [ProblemDetails](#6-errors-problemdetails)), the database schema, the frontend, and the
module boundaries (Catalog, Identity, Access, Platform) from the [platform HLD](platform-hld.md).

---

## 1. Layers

Four projects in `ClinicHub.sln`. Layers split the code by technical concern; **module folders inside each
layer** split it by feature, so no layer becomes one big bag of files.

```
ClinicHub.Domain           ← no references (no EF Core, no ASP.NET)
ClinicHub.Application      → Domain
ClinicHub.Infrastructure   → Application, Domain
ClinicHub.Api              → Application, Infrastructure
```

| Project | Contains |
|---|---|
| **Domain** | Entities (`Drug`, `DrugGroup`, `DrugGroupItem`, `Clinic`, `User`, `OtpCode`, `Session`, `Staff`, `Role`, `RolePermission`, `StaffRole`), owned values (`Dosing`, `TaperStep`), code lists (`DosingCodes`, `ClinicStatus`, `ContextTypes`), pure rules (`DosingRules`), markers (`IClinicOwned`, `IHasTimestamps`), field limits (`FieldLimits`) |
| **Application** | Use cases (commands, queries, handlers, validators), DTOs, errors, MediatR abstractions and behaviors, `Result`/`Error`, abstractions implemented elsewhere (`IAppDbContext`, `IClinicContext`, `ICurrentUser`, `IAccessCache`, `IOtpSender`, `ITokenService`, `ITransactionRunner`), application services that are not use cases (`PermissionService`, `SessionService`, `OtpService`), the permission catalog, `DefaultRoles`, startup seeding |
| **Infrastructure** | `AppDbContext` (implements `IAppDbContext`), one `IEntityTypeConfiguration<T>` per entity, the clinic query filter, the clinic/timestamps interceptor, migrations, `TransactionRunner`, `AccessCache` (HybridCache), `TokenService` (JWT), `DisplayOtpSender` (later SMS), `CurrentUser` (claims reader) |
| **Api** | Thin controllers, authentication and authorization setup, `[HasPermission]` and its handler, the `ApiProblemFactory` and every error source, `Result` → HTTP mapping, SPA hosting (`wwwroot`), `Program.cs`, config validation |

Each layer registers itself: `AddApplication(configuration)`, `AddInfrastructure(configuration)`, `AddApi()`.

The solution and projects use the code name `ClinicHub` (renamed from `Drags` on 2026-10-14, after step 1).

---

## 2. Domain

**Anemic domain model** (for now): entities are plain classes with properties and relationships, no
behavior. Business rules live in handlers, plus a few pure, reusable helpers (`DosingRules`).
Moving behavior into entities later is possible without changing the layering.

---

## 3. Application

### 3.1 MediatR abstractions

MediatR (commercial since v13; free **community license** for companies under $5M yearly revenue: register
at luckypennysoftware.com). The license key is read from config `MediatR:LicenseKey` (environment variable
outside Development; may be empty in dev, MediatR then only logs a warning). Own abstractions on top:

```cs
public interface ICommandBase;                                   // marker: lets behaviors target every command
public interface ICommand : IRequest<Result>, ICommandBase;
public interface ICommand<TData> : IRequest<Result<TData>>, ICommandBase;
public interface IQuery<TData> : IRequest<Result<TData>>;

public interface ICommandHandler<TCommand> : IRequestHandler<TCommand, Result>
    where TCommand : ICommand;
public interface ICommandHandler<TCommand, TData> : IRequestHandler<TCommand, Result<TData>>
    where TCommand : ICommand<TData>;
public interface IQueryHandler<TQuery, TData> : IRequestHandler<TQuery, Result<TData>>
    where TQuery : IQuery<TData>;
```

- Commands change state; queries never do. Both use the same `IAppDbContext` (no separate read model).
- Every handler returns a `Result`; **expected failures are never exceptions**.

### 3.2 Result and Error

```cs
public enum ErrorType { Validation, NotFound, Conflict, Forbidden, Unauthorized, Failure }

/// <param name="Field">Request property the error is about (validation errors only).</param>
public record Error(string Code, string Description, ErrorType Type, string Field = null);

public class Result
{
    public bool IsSuccess { get; }
    public IReadOnlyList<Error> Errors { get; }   // empty on success; one or more on failure
    public Error Error => Errors.FirstOrDefault(); // shortcut: the first error
    public static Result Success();
    public static Result Failure(Error error);
    public static Result Failure(IEnumerable<Error> errors);
}

public class Result<TData> : Result
{
    public TData Data { get; }                     // only valid when IsSuccess
    // implicit conversions from TData (success) and from Error (failure)
}
```

- **The handler picks the `ErrorType`; the API layer alone turns it into an HTTP status.** Handlers never
  know about HTTP.
- `Errors` is a list so several validation failures can be returned together. Today the frontend uses the
  first one; the full list is in the response for later.

### 3.3 Error catalog

Every error is declared once, in one static class per feature, next to its use cases:

```cs
public static class DrugErrors
{
    public static readonly Error NotFound =
        new("notFound", "The drug does not exist in this clinic.", ErrorType.NotFound);

    public static readonly Error InvalidDosing =
        new("invalidDosing", "The default dosing is not valid.", ErrorType.Validation);
}
```

- **Codes stay exactly as today** (`nameRequired`, `drugNotFound`, `invalidDosing`, `noAccess`…), so the
  frontend's `errors.<code>` translations keep working. A missing row is `notFound` (the SPA's generic
  "this item no longer exists"); `drugNotFound` is the 400 for an unknown drug inside a group.
- The description is English, for developers and logs; the UI always translates by code.
- Cross-cutting errors (`forbidden`, `unauthorized`, `notFound`, `conflict`, `invalidRequest`,
  `unexpected`, `tooManyRequests`) and the shared name rules (`nameRequired`, `nameTooLong`) live in
  `Common/Results/CommonErrors.cs`; the routing-only `methodNotAllowed` (405) lives in the Api's `ApiProblemFactory`.

### 3.4 Validation

**FluentValidation.** One validator per command (queries only when they take input worth checking).
Every rule sets its code: `.WithError(DrugErrors.InvalidDosing)` (= `.WithErrorCode(code)` + the description).
Rules are declared in the order the errors should be reported: the first failure is the response's `code`. The `ValidationBehavior` runs all
validators of the request and returns **every** failure as `Error(code, message, Validation, propertyName)`.
Today's rules and codes are kept exactly.

### 3.5 Pipeline behaviors

Order: **Logging → Validation → Transaction → handler.**

| Behavior | Applies to | Does |
|---|---|---|
| `LoggingBehavior` | everything | Request name, duration, and failure codes (no request bodies: they may hold personal data) |
| `ValidationBehavior` | requests with validators | Returns `Result.Failure(all errors)` without calling the handler |
| `TransactionBehavior` | `ICommandBase` only, never queries | Wraps the handler in one DB transaction through `ITransactionRunner` (EF execution strategy, so retries stay safe); joins an existing transaction instead of nesting; rolls back when the `Result` is a failure |

Permissions are **not** a behavior yet; see [§ 7](#7-permissions).

### 3.6 Data access: `IAppDbContext`

Handlers use the database **directly through `IAppDbContext`**, with no generic repositories.
A repository exposing `IQueryable` would not hide EF (handlers still write EF LINQ) and would not make a
later move to a stored procedure easier.

```cs
public interface IAppDbContext
{
    DbSet<Clinic> Clinics { get; }
    DbSet<User> Users { get; }
    DbSet<OtpCode> OtpCodes { get; }
    DbSet<Session> Sessions { get; }
    DbSet<Staff> Staff { get; }
    DbSet<Role> Roles { get; }   // + its Permissions (RolePermission: no set, see below)
    DbSet<StaffRole> StaffRoles { get; }
    DbSet<Drug> Drugs { get; }
    DbSet<DrugGroup> DrugGroups { get; }
    DbSet<DrugGroupItem> DrugGroupItems { get; }

    /// <summary>Marks the row as changed so its UpdatedAt moves (e.g. a group whose items changed).</summary>
    void Touch(IHasTimestamps entity);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
```

- **Exposed:** one `DbSet` per table (except `RolePermissions`: it has no clinic column, so it is only read
  through its filtered `Role`, never on its own), and through it the whole EF query API (LINQ, `Include`, `AsNoTracking`,
  `ExecuteUpdateAsync`/`ExecuteDeleteAsync`, `IgnoreQueryFilters()` for the few cross-clinic reads).
- **Not exposed:** `Database` (migrations, raw SQL, connections, transactions), `ChangeTracker`, `Model`,
  `Entry()`. Transactions go through `ITransactionRunner`; the interceptor stays in Infrastructure.
- The **clinic query filter lives in `AppDbContext`**, so every read through this interface is filtered.
- **Views** are mapped as keyless entities (`HasNoKey().ToView(...)`) and added here as `DbSet`s.
- **Raw SQL, stored procedures, Dapper or another store:** add a **purpose-built interface** in Application
  (for example `IDrugReportQueries.GetUsageAsync(...)`), implemented in Infrastructure. The handler depends
  on that method, not on how it is fetched. This is the only kind of "repository" we add, and only when a
  specific path needs it.

### 3.7 Folder structure and naming

```
ClinicHub.Application/
  Common/                      Result, Error, ErrorType, CommonErrors, MediatR abstractions,
                               behaviors, abstractions (IAppDbContext, ICurrentUser…)
  Features/
   Catalog/
    Drugs/
      Commands/
        CreateDrug/
          CreateDrugCommand.cs
          CreateDrugCommandHandler.cs
          CreateDrugCommandValidator.cs
        UpdateDrug/ …
        DeleteDrug/ …
      Queries/
        GetDrugs/
          GetDrugsQuery.cs
          GetDrugsQueryHandler.cs
        GetDrug/ …
        GetDrugGroupNames/
          GetDrugGroupNamesQuery.cs
          GetDrugGroupNamesQueryHandler.cs   (returns List<string>; a type used by one use case only would live here)
      DrugDto.cs                  ← shared by several use cases: lives at the feature root
      DrugErrors.cs
    DrugGroups/ …
   Identity/ …
   Access/ …
   Platform/ …
```

- Folders and files in PascalCase; **files and classes are named after the use case**
  (`CreateDrugCommand.cs`, not `Command.cs`), so search, editor tabs and stack traces stay readable.
- A type lives next to its only user and moves up to the feature root when a second use case needs it.
- Modules live under `Features/` (`Features/Catalog/Drugs`…); namespaces follow the folders
  (`ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug`).
- No shared interfaces or base validators between create and update: each use case has its own validator
  and handler, even if a few lines repeat.

---

## 4. Infrastructure

- `AppDbContext : DbContext, IAppDbContext`; `ApplyConfigurationsFromAssembly` loads one
  `IEntityTypeConfiguration<T>` per entity (`DrugConfiguration`, `StaffConfiguration`…) instead of one large
  `OnModelCreating`. The generic clinic setup (FK to `Clinics` + query filter for every `IClinicOwned`) stays
  in `AppDbContext`.
- The clinic/timestamps interceptor moves as is.
- **Migrations move to `ClinicHub.Infrastructure`** with their ids unchanged, so existing databases are
  unaffected. They are **never regenerated**: new ones are added on top, and both adding and applying use
  the CLI:

  ```bash
  dotnet ef migrations add <Name> --project ClinicHub.Infrastructure --startup-project ClinicHub.Api
  dotnet ef database update --project ClinicHub.Infrastructure --startup-project ClinicHub.Api
  ```

- Implementations of Application abstractions: `TransactionRunner`, `AccessCache` (HybridCache; Redis later
  as config), `TokenService`, `DisplayOtpSender`, `CurrentUser`.

---

## 5. API

**Controllers stay** (not Minimal APIs): routes, `[HasPermission]`, filters and Swagger keep working. Each
action is a thin wrapper: build the request, `Send` it, map the `Result`.

```cs
[HttpPost, HasPermission(Permissions.Drugs.Create)]
public async Task<ActionResult<DrugDto>> Create([FromBody] SaveDrugRequest request, CancellationToken ct) =>
    (await sender.Send(new CreateDrugCommand(request.Name, request.Description, request.DefaultDosing), ct))
    .ToCreated(nameof(GetById), drug => new { id = drug.Id });
```

`Result` → HTTP helpers (one place): `ToOk()`, `ToCreated(...)`, `ToNoContent()`; a failure always becomes
ProblemDetails through `ApiProblemFactory`.

Request records (`SaveDrugRequest`) stay in the Api, next to their controller; the command carries the fields.

**Success responses are plain data** (`200` + JSON, `201` + JSON, `204`): no envelope.

---

## 6. Errors: ProblemDetails

**Every error response, whatever produces it, has one shape** (RFC 9457), so the frontend handles errors in
one place (`toApiError(error)` in `src/api/errors.ts` → a typed `ApiError { status, code, errors, traceId }`).

```json
{
  "type": "https://httpstatuses.io/400",
  "title": "Validation failed",
  "status": 400,
  "detail": "The name is required.",
  "instance": "/api/v1/drugs",
  "code": "nameRequired",
  "errors": [
    { "code": "nameRequired", "description": "The name is required.", "field": "name" },
    { "code": "invalidDosing", "description": "The default dosing is not valid.", "field": "defaultDosing" }
  ],
  "traceId": "00-4bf9…-01"
}
```

| Field | Value |
|---|---|
| `status`, `title` | From the first error's `ErrorType` (Validation 400, Unauthorized 401, Forbidden 403, NotFound 404, Conflict 409, Failure 500; `tooManyRequests` 429) |
| `code` | The first error's code: what the frontend reads today |
| `errors` | Every error (`code`, `description`, `field` when known) |
| `detail` | The first error's English description (developers, logs) |
| `traceId` | `Activity.Current?.Id ?? HttpContext.TraceIdentifier`, to find the request in the logs |

All error sources go through **one `ApiProblemFactory`**:

| Source | Hook |
|---|---|
| Handler / validation `Result` failure | `Result` → HTTP helpers |
| 401 (no or expired token) | JwtBearer `OnChallenge` |
| 403 (permission or context) | `IAuthorizationMiddlewareResultHandler`, JwtBearer `OnForbidden`, `AccessExceptionHandler` (`EnsureAsync`) |
| 400 malformed JSON / wrong types | `ApiBehaviorOptions.InvalidModelStateResponseFactory` (`invalidRequest`) |
| 404/405 with no body | `UseStatusCodePages` |
| 500 unexpected exception | `IExceptionHandler` (`unexpected`; no stack trace outside Development) |
| 429 | today: the OTP limit in `AuthController` (`ApiError(..., 429)`); Phase 5 (planned): rate limiter `OnRejected` |

`AddProblemDetails(o => o.CustomizeProblemDetails = …)` adds `code`, `errors` and `traceId` as a safety net
for anything not listed (e.g. MVC's `Problem()`, `Unauthorized()`): `ApiProblemFactory.Complete` derives the code from
the status. Bare statuses map to `unauthorized` 401, `forbidden` 403, `notFound` 404, `methodNotAllowed` 405,
`conflict` 409, `tooManyRequests` 429, `unexpected` 5xx, `invalidRequest` otherwise. In Development the 500 also
carries the exception (`detail` = message, `exception` = full text).

---

## 7. Permissions

**Decision: option A (for now).** Permissions stay **on the endpoints**: `[HasPermission(...)]` on controller
actions (Phase 3), checked by ASP.NET authorization with `IPermissionService` / `IAccessCache`. Session-level
checks (authenticated, clinic context, staff and clinic still active) also stay in the ASP.NET pipeline.
Use cases sent from outside HTTP are not permission-checked.

**Planned upgrade: option B.** Move permissions onto the request, so they apply to every `Send` (HTTP,
background jobs, one handler calling another):

- `[RequirePermission(Permissions.Drugs.Create)] record CreateDrugCommand …`, `[RequireSuperAdmin]` for platform
  commands, `[AllowAnyStaff]` to make "no permission needed" explicit; a request with none fails at startup.
- An `AuthorizationBehavior` checks it **before** validation (Logging → Authorization → Validation →
  Transaction), returning `Result` with `ErrorType.Forbidden` (→ 403 ProblemDetails like any other error).
- Background jobs run through one helper that sets the clinic and the caller together, e.g.
  `jobScope.RunAsSystemAsync(clinicId, sender => …)`: `IClinicContext` = the clinic, `ICurrentUser` = a system
  caller that the behavior lets through. Jobs need the clinic part anyway (the clinic filter fails closed),
  so this adds no per-job work, and a job run on behalf of a staff member can be checked as that staff.

Deferred because the MVP has no background jobs; moving later is mechanical (attribute from action to
request, add the behavior). The frontend is unaffected either way.

### 7.1 Permission constants

**Kept from Phase 3:** permissions are `const string` keys named `resource.action` (they must be constants:
attributes such as `[HasPermission(...)]` only accept compile-time constants), dependencies are declared with
`[Requires(...)]`, and `PermissionCatalog` is built from them by reflection and validated at startup. The keys are
the single source of truth for the catalog, `/permissions`, the seeded roles and (later) the generated
frontend `permissions.ts`. Keys are stored in the database, so they never change once deployed.

**Changed in Phase 3.5, so it scales to hundreds of permissions:**

1. `Permissions` becomes a **`partial` class split per module**: each module declares its resources in its own
   file next to its use cases (`Application/Features/Catalog/CatalogPermissions.cs`, `Application/Features/Access/AccessPermissions.cs`…).
   Usage is unchanged (`Permissions.Drugs.Create`) and the reflection catalog needs no change.

   ```cs
   // Application/Features/Catalog/CatalogPermissions.cs
   public static partial class Permissions
   {
       [PermissionModule("catalog")]
       public static class Drugs
       {
           public const string List = "drugs.list";
           [Requires(List)] public const string Details = "drugs.details";
           [Requires(List)] public const string Create = "drugs.create";
           [Requires(Details)] public const string Update = "drugs.update";
           [Requires(Details)] public const string Delete = "drugs.delete";
       }
   }
   ```

2. **`[PermissionModule("…")]` on every resource class** adds a third level to the catalog
   (module → resource → action): `PermissionDefinition` gains `Module`, `/permissions` returns it, and the role
   editor shows collapsible sections per module. The module is a grouping only; keys stay two-part
   (`drugs.create`, not `catalog.drugs.create`), since resources are unique.
3. **More startup validation** on top of today's (format, duplicates, unknown or self requirements): every
   resource class has a module, and every key's prefix matches its class (`Drugs` may only hold `drugs.*`).

Not done on purpose: permission objects (unusable in attributes), three-part keys, and descriptions in C#
(labels and descriptions are translated in the SPA locales under `permissions.<key>`).

**Requirements are honored** (Phase 4): when a role is saved, its permissions are completed with everything they
require (`PermissionCatalog.WithRequirements`), so a role can never hold `drugs.update` without `drugs.details`.

---

## 8. Conventions summary

- One use case = one command or query + handler (+ validator) in its own folder.
- Handlers return `Result`; expected failures are `Error`s from the feature's error class, never exceptions.
- Error codes are stable API contracts; the frontend translates them (`errors.<code>` in `en.ts` and `ar.ts`).
- Handlers use `IAppDbContext`; purpose-built query interfaces only for SQL/SP/other stores.
- Controllers contain no logic: `Send` and map.
- Every error response is ProblemDetails from `ApiProblemFactory`; success responses are plain data.
- Domain has no dependencies; Application has no ASP.NET dependencies; only Infrastructure knows EF
  internals beyond `DbSet` and LINQ.
