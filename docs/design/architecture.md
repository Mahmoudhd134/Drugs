# Backend architecture

Status: **agreed, being implemented.** Decided in discussion on 2026-10-12. Built in **Phase 3.5**,
a pure refactor between Phase 3 (Access) and Phase 4 (Platform), so the Phase 4 admin code is written
directly in this structure. Until it is done, the code follows `docs/tech/overview.md`.

Phase 3.5 is done in three steps:

1. **Project split (done):** the four projects; Domain and data access moved (§ 1, § 2, § 4). Services,
   controllers and auth stay in `ClinicHub.Api`. See [carry-over](#carry-over-to-step-2).
2. Use cases, `Result`/`Error`, MediatR, validation and the Application services (§ 3).
3. API layer: thin controllers, `ApiProblemFactory`, ProblemDetails everywhere (§ 5, § 6), permissions
   (§ 7.1).

### Carry-over to step 2

What step 1 could not move cleanly, and why:

- **Controllers and services still inject the concrete `AppDbContext`**, not `IAppDbContext`. Some need
  members the interface deliberately hides: transactions (`OtpService`, `IdentitySeeder`, `StartupSeeder`:
  `Database.BeginTransactionAsync` → `ITransactionRunner`), raw SQL (`OtpService`'s per-phone
  `pg_advisory_xact_lock` → a purpose-built interface, e.g. `IOtpLock`), `ChangeTracker.Clear()`
  (`StartupSeeder`'s batched dev seed) and `Database.MigrateAsync()` (`Program.cs`; stays in
  Infrastructure/Api). Switch each to `IAppDbContext` as it moves.
- **`ErrorCodes.ValidateName`** stays in `ClinicHub.Api/Shared` (it returns an API error code); only its limit
  moved to `Domain.Common.FieldLimits`. It becomes FluentValidation rules with
  `.WithErrorCode(...)` in the validators.
- **`DosingRules.IsValid`** (Domain) returns `bool`; the callers (`DrugMappings.Validate`,
  `DrugGroupsController.Validate`) map `false` to `invalidDosing`. Same for the validators in step 2.
- Still in `ClinicHub.Api`, to move per § 1:
  - to Application: `ICurrentUser`, `IAccessCache`, `IOtpSender`, `PermissionService`, `SessionService`,
    `OtpService`, `MembershipService`, `Permissions` + `PermissionCatalog`, `DefaultRoles`, `IdentitySeeder`,
    `StartupSeeder`, `ErrorCodes` (→ per-feature error classes), `PagedResult`;
  - to Infrastructure: `AccessCache`, `TokenService`, `DisplayOtpSender`, `CurrentUser`;
  - stays in Api: `AppSettings` (+ validation), auth setup, `[HasPermission]` and its handlers.
- `RolePermission` has **no** `DbSet` on `IAppDbContext` (decided in step 1, § 3.6): it is not clinic-owned,
  so a set of its own would be read unfiltered; it is only reached through its (filtered) role.
- The migrations' designer files and snapshot keep the old CLR names as strings
  (`"Drags.Api.Models.Drug"`, from before the moves and the ClinicHub rename). EF compares the
  relational model, so this is harmless (`has-pending-model-changes` reports none); the next
  `migrations add` rewrites the snapshot with the new names. Historic designer files stay as they are.
- `ClinicHub.Application` references `Microsoft.EntityFrameworkCore` (for `DbSet<T>` in `IAppDbContext`), as
  § 3.6 intends; it has no ASP.NET or Npgsql dependency.

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

Each layer registers itself: `AddApplication()`, `AddInfrastructure(configuration)`, `AddApi()`.

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
        new("drugNotFound", "The drug does not exist in this clinic.", ErrorType.NotFound);
}
```

- **Codes stay exactly as today** (`nameRequired`, `drugNotFound`, `invalidDosing`, `noAccess`…), so the
  frontend's `errors.<code>` translations keep working.
- The description is English, for developers and logs; the UI always translates by code.
- Cross-cutting errors (`forbidden`, `unauthorized`, `invalidRequest`, `unexpected`, `tooManyRequests`) live in
  `Common/CommonErrors.cs`.

### 3.4 Validation

**FluentValidation.** One validator per command (queries only when they take input worth checking).
Every rule sets its code: `.WithErrorCode(DrugErrors.NameRequired.Code)`. The `ValidationBehavior` runs all
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
          GetDrugGroupNamesQueryHandler.cs
          DrugGroupNameDto.cs     ← used by this use case only: lives in its folder
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
public async Task<IActionResult> Create(SaveDrugRequest request, CancellationToken ct) =>
    (await sender.Send(new CreateDrugCommand(request), ct)).ToCreated(nameof(GetById), d => new { id = d.Id });
```

`Result` → HTTP helpers (one place): `ToOk()`, `ToCreated(...)`, `ToNoContent()`; a failure always becomes
ProblemDetails through `ApiProblemFactory`.

**Success responses are plain data** (`200` + JSON, `201` + JSON, `204`): no envelope.

---

## 6. Errors: ProblemDetails

**Every error response, whatever produces it, has one shape** (RFC 9457), so the frontend handles errors in
one place (the axios response interceptor → a typed `ApiError { status, code, errors, traceId }`).

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
    { "code": "invalidDosing", "description": "The dosing is not valid.", "field": "defaultDosing" }
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
| 403 (permission or context) | `IAuthorizationMiddlewareResultHandler` |
| 400 malformed JSON / wrong types | `ApiBehaviorOptions.InvalidModelStateResponseFactory` (`invalidRequest`) |
| 404/405 with no body | `UseStatusCodePages` |
| 500 unexpected exception | `IExceptionHandler` (`unexpected`; no stack trace outside Development) |
| 429 (Phase 5 rate limits) | rate limiter `OnRejected` |

`AddProblemDetails(o => o.CustomizeProblemDetails = …)` adds `code`, `errors` and `traceId` as a safety net
for anything not listed.

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
   file next to its use cases (`Application/Catalog/CatalogPermissions.cs`, `Application/Access/AccessPermissions.cs`…).
   Usage is unchanged (`Permissions.Drugs.Create`) and the reflection catalog needs no change.

   ```cs
   // Application/Catalog/CatalogPermissions.cs
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
