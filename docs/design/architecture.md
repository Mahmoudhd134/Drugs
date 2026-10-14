# Backend architecture

Status: **agreed, implemented** (steps 1–3 done). Decided in discussion on 2026-10-12. Built in **Phase 3.5**,
a pure refactor between Phase 3 (Access) and Phase 4 (Platform), so the Phase 4 admin code is written
directly in this structure. `docs/tech/overview.md` describes the code as it is now.

Phase 3.5 is done in three steps:

1. **Project split (done):** the four projects; Domain and data access moved (§ 1, § 2, § 4). Services,
   controllers and auth stay in `ClinicHub.Api`.
2. **Application foundations + Catalog (done):** MediatR abstractions, `Result`/`Error`, FluentValidation, the
   pipeline behaviors and `ITransactionRunner` (§ 3); `ApiProblemFactory` with every error source and the
   `Result` → HTTP helpers (§ 5, § 6); the Catalog module (Drugs, DrugGroups) as commands/queries with thin
   controllers. The app works end to end after this step.
3. **Identity, Access, Platform + permission structure (done):** the remaining services move to Application on top
   of the abstractions (purpose-built interfaces for what `IAppDbContext` hides), their use cases and
   Infrastructure implementations, Access 403s through `ApiProblemFactory`, and the permission constants
   split per module with `[PermissionModule]` (§ 7.1). See [carry-over](#carry-over-to-phase-4).

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

### Step 3: what was done

- **Identity** (`Application/Features/Identity`): `Commands/` `RequestOtp`, `VerifyOtp` (login), `RefreshSession`,
  `SwitchContext`, `Logout`; `Queries/` `GetOtpMode`, `GetContexts`, `GetMe`. `OtpService` became the
  `RequestOtp` and `VerifyOtp` handlers (+ the shared `OtpHash`); `SessionService` keeps what the session use
  cases share (contexts, `IssueAsync`, `TrySaveAsync`) and is internal. `PhoneNormalizer` moved as is; phone
  validation is a FluentValidation rule, `ValidPhone()` (`.WithError(IdentityErrors.InvalidPhone)`), shared by both OTP validators. Identity is one feature, so
  its use cases sit directly under `Features/Identity/Commands|Queries` (no extra feature folder).
- Abstractions in Application: `ICurrentUser` (`Common/Abstractions`), `ITokenService`, `IOtpSender`, `IOtpLock`
  (`Features/Identity`), `IAccessCache` (`Features/Access`). Implementations in Infrastructure: `TokenService`,
  `DisplayOtpSender`, `OtpLock` (`pg_advisory_xact_lock`; throws outside a transaction), `AccessCache` + the
  HybridCache registration. `CurrentUser` stays in the Api (it reads `HttpContext`).
- **`AuthClaims` moved to Infrastructure** (`Infrastructure/Identity`), not kept in the Api: `TokenService`
  writes the claims, and Infrastructure can't reference the Api. It is constants only (no ASP.NET); the Api's
  `CurrentUser` and policies read it from there. `AuthPolicies` stays in the Api (`IdentitySetup.cs`).
- **The refresh cookie stays in `AuthController`**: login, refresh and switch return a `SessionIssue` (the
  `AuthResult` body + the refresh token and its expiry, `[JsonIgnore]`); the controller sets the cookie on
  success, clears it on `IdentityErrors.SessionEnded` (401, no live session) and on logout, and leaves it on
  every other failure (`RefreshTokenRejected` 401, 403, 409). The two 401s are distinct `Error`s with the
  same code `unauthorized`.
- **Access** (`Application/Features/Access`): `IPermissionService`/`PermissionService` (returns `Error`s, not code
  strings), `MembershipService`, `Permissions` + `PermissionCatalog` + `RequiresAttribute`, `DefaultRoles`
  (`SeedAsync(IAppDbContext, IClinicContext, clinicId)`), `PermissionSet`, `GetPermissionsQuery`. The Api keeps
  `[HasPermission]`, `PermissionHandler`, `ClinicAccessHandler`, `AccessAuthorizationResultHandler`, JWT setup
  and the clinic middleware. Failure reasons are `AccessFailureReason`s carrying the `Error`; the result handler
  passes the most specific one to `ApiProblemFactory`. `EnsureAsync`, `AccessDeniedException` and
  `AccessExceptionHandler` had no callers and are gone (and with them the .NET 9 "logged at Error" note).
- **Platform**: `StartupSeeder` → `Infrastructure/Platform` (its dev seed needs its own transaction and
  `ChangeTracker.Clear()`), a scoped service. `IdentitySeeder` → `Application/Features/Identity`, a service
  (not a use case: it runs before the app serves requests) on `IAppDbContext` + `ITransactionRunner` only, so
  it fits Application; it invalidates the cache after the commit. `Database.MigrateAsync()` stays in `Program.cs`.
- **Errors**: `IdentityErrors` (`invalidPhone`, `invalidCode`, `codeExpired`, `tooManyAttempts`, and the session
  outcomes `SessionEnded`/`RefreshTokenRejected` (`unauthorized` 401) and `RefreshTokenRotated` (`conflict` 409));
  `AccessErrors` (`noAccess`, `clinicSuspended`); `forbidden`, `unauthorized` from `CommonErrors`. The OTP 429 is a
  `TooManyRequestsError` (§ 6). `ErrorCodes` and `BaseApiController.ApiError` are deleted. Codes and statuses are
  unchanged; the `detail`/`description` texts are now the errors' own (they were generic per status), and
  `invalidPhone` now has `field: "phone"`.
- **Commit on failure** (§ 3.5): `ICommitOnFailure` on `VerifyOtpCommand` and `RefreshSessionCommand` only.
  `RequestOtpCommand` doesn't need it: its only failure is the 429, whose only write is the cleanup of day-old
  codes, which the next request redoes.
- **Permissions** (§ 7.1): `Permissions` is partial, one file per module (`Features/Catalog/CatalogPermissions.cs`,
  `Features/Prescription/PrescriptionPermissions.cs`, both in the `Features.Access` namespace, which a partial
  class needs); `[PermissionModule]` on every resource class; `PermissionDefinition.Module`, returned by
  `/permissions`; the catalog is built in `AddApplication` (startup validation: module present, key prefix =
  class). Keys and `[Requires]` unchanged.
- **Settings**: `AuthSettings`, `OtpSettings` (+ `OtpModes`), `PlatformSettings` → `Application/Common/Settings`;
  the Api's `AppSettings` stays the root (binding, `Validate`, `AllowedOrigins`, `MediatR`) and registers each
  validated section as a singleton. `TimeProvider.System` is registered by `AddApplication`. Config keys unchanged.
- **Fixes from the step 2 validation**: outside Development the 400 `invalidRequest` keeps each `field` but uses
  the generic description (no parser messages or CLR type names); lowercase URLs for generated links
  (`Location: /api/v1/drugs/5`).
- Packages: `libphonenumber-csharp` → Application; `Microsoft.Extensions.Caching.Hybrid` and
  `Microsoft.IdentityModel.JsonWebTokens` → Infrastructure; the Api keeps JwtBearer.
- Verified with a contract recording of 83 calls before and after ([login testing notes](../features/auth/tech.md#testing-notes)).

### Carry-over to Phase 4

- **Permissions on endpoints only** (§ 7, option A): use cases sent outside HTTP are not permission-checked; move
  to option B when background jobs arrive.
- **OTP send inside the transaction**: `RequestOtp` calls `IOtpSender` before the commit, holding the phone's
  advisory lock. Fine for display mode; an SMS sender (Phase 5) should send after the commit (or through an
  outbox) so a slow provider doesn't hold the lock and a failed commit doesn't send an unusable code.
- **Housekeeping deletes inside command transactions**: `RequestOtp` deletes day-old codes and `VerifyOtp` week-old
  sessions; these used to commit on their own, now their row locks last until the command commits, so two
  requests that both find rows just past the cutoff wait for each other (briefly; never a wrong answer). Move
  them to a background job when one exists.
- **An exception after a consumed code** (e.g. the database fails while the session is saved) now rolls the
  consumption back too, so the code stays usable; before, it was already committed. Only on a 500.
- **Catalog order**: `PermissionCatalog.All` follows the nested types' metadata order, i.e. the order the compiler
  sees the partial files (Catalog, then Prescription today). `/permissions` and `DefaultRoles` don't depend on
  it for correctness; the role editor sorts by module if that ever changes.
- **Parallel wrong guesses** (unchanged from before): the handler reads `Attempts` before its atomic update, so
  the last of several parallel wrong guesses may answer `invalidCode` instead of `tooManyAttempts`. The limit
  itself holds (the update is conditional).
- `DefaultRoles.SeedAsync` is ready for clinic provisioning (Phase 4): it needs the clinic context set to the new
  clinic (a command that creates a clinic sets it, or the seeding moves into the provisioning handler).
- `TransactionRunner`: a nested command that fails rolls back to its savepoint but leaves the change tracker as
  is (the outer unit's entities are in it too); revisit if commands start sending commands. A nested
  `ICommitOnFailure` command releases its savepoint; the outer command still decides the commit.
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
| **Application** | Use cases (commands, queries, handlers, validators), DTOs, errors, MediatR abstractions and behaviors, `Result`/`Error`, abstractions implemented elsewhere (`IAppDbContext`, `IClinicContext`, `ICurrentUser`, `IAccessCache`, `IOtpSender`, `IOtpLock`, `ITokenService`, `ITransactionRunner`), application services that are not use cases (`PermissionService`, `MembershipService`, `SessionService`, `IdentitySeeder`), the permission catalog, `DefaultRoles`, the settings classes it reads (`Common/Settings`) |
| **Infrastructure** | `AppDbContext` (implements `IAppDbContext`), one `IEntityTypeConfiguration<T>` per entity, the clinic query filter, the clinic/timestamps interceptor, migrations, `TransactionRunner`, `AccessCache` (HybridCache), `TokenService` (JWT) + `AuthClaims`, `DisplayOtpSender` (later SMS), `OtpLock` (advisory lock), `StartupSeeder` (needs EF internals) |
| **Api** | Thin controllers (+ the refresh cookie in `AuthController`), authentication and authorization setup, `CurrentUser` (claims reader: needs `HttpContext`), `[HasPermission]` and its handlers, the clinic middleware, the `ApiProblemFactory` and every error source, `Result` → HTTP mapping, SPA hosting (`wwwroot`), `Program.cs`, config binding and validation (`AppSettings`), `Database.MigrateAsync()` |

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
| `TransactionBehavior` | `ICommandBase` only, never queries | Wraps the handler in one DB transaction through `ITransactionRunner` (EF execution strategy, so retries stay safe); joins an existing transaction instead of nesting; rolls back when the `Result` is a failure, unless the command is `ICommitOnFailure` |

**Commit on failure.** Some failures must keep what the handler wrote: a wrong login code must stay counted
(brute-force limit), a right code stays consumed even when the login answers 403, and a session revoked because
its user lost every context must stay revoked. A command opts in with the marker `ICommitOnFailure`
(`Common/Messaging`): the transaction then commits whatever the `Result`; an **exception still rolls back**.
Only for commands that need it, each saying why in its doc comment: `VerifyOtpCommand`, `RefreshSessionCommand`. Such a handler must only write what should survive
its failures (here: the counted attempt, the consumed code, the revocation; the session row is only added on
the success path). Writes that must serialize (the per-phone OTP limit) use a lock held by that transaction
(`IOtpLock`).

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
   Identity/                    one feature: Commands/<UseCase>/, Queries/<UseCase>/, IdentityErrors…
   Access/ …                    PermissionCatalog, PermissionService…, Queries/GetPermissions/
   Prescription/                PrescriptionPermissions.cs (no use cases yet)
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
  as config), `TokenService` (+ the claim names, `AuthClaims`), `DisplayOtpSender`, `OtpLock`. `CurrentUser`
  is in the Api: it reads `HttpContext`, and Infrastructure has no ASP.NET reference.
- `StartupSeeder` (template clinic, super admins through Application's `IdentitySeeder`, dev data).

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
| 403 (permission or context) | `IAuthorizationMiddlewareResultHandler` (the `Error` of the `AccessFailureReason`), JwtBearer `OnForbidden` |
| 400 malformed JSON / wrong types | `ApiBehaviorOptions.InvalidModelStateResponseFactory` (`invalidRequest`) |
| 404/405 with no body | `UseStatusCodePages` |
| 500 unexpected exception | `IExceptionHandler` (`unexpected`; no stack trace outside Development) |
| 429 | a `TooManyRequestsError` `Result` (the OTP limits); Phase 5 (planned): rate limiter `OnRejected` |

`AddProblemDetails(o => o.CustomizeProblemDetails = …)` adds `code`, `errors` and `traceId` as a safety net
for anything not listed (e.g. MVC's `Problem()`, `Unauthorized()`): `ApiProblemFactory.Complete` derives the code from
the status. Bare statuses map to `unauthorized` 401, `forbidden` 403, `notFound` 404, `methodNotAllowed` 405,
`conflict` 409, `tooManyRequests` 429, `unexpected` 5xx, `invalidRequest` otherwise. In Development the 500 also
carries the exception (`detail` = message, `exception` = full text).

**`Retry-After`.** `TooManyRequestsError(int RetryAfterSeconds)` (`Common/Results`) is an `Error` with the
`tooManyRequests` code: a handler returns it like any error, and the `Result` → HTTP helper (`ToProblem`) sets
the `Retry-After` header (seconds) from it. Handlers still know nothing about HTTP; only this helper reads it.

**`invalidRequest` (malformed body).** In Development each error carries the parser's message (useful, but it
names CLR types); elsewhere the generic description. The `field` is always kept.

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

**Changed in Phase 3.5 (step 3, done), so it scales to hundreds of permissions:**

1. `Permissions` becomes a **`partial` class split per module**: each module declares its resources in its own
   file next to its use cases (`Application/Features/Catalog/CatalogPermissions.cs`,
   `Application/Features/Prescription/PrescriptionPermissions.cs`; Access gets `AccessPermissions.cs` with its
   own resources in Phase 4). Every part is in the `ClinicHub.Application.Features.Access` namespace (a partial
   class needs one). Usage is unchanged (`Permissions.Drugs.Create`).

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
