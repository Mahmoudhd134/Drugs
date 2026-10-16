# Clinic scoping: technical

## Summary
M1.1 (Foundations) of the [multi-clinic platform](../../design/platform-hld.md). Adds the
`Clinics` table and makes the catalog (drugs, groups, group items) belong to a clinic. Isolation is
automatic: an EF Core global query filter limits every query to the request's clinic, and a
`SaveChanges` interceptor stamps new rows with that clinic and fills UTC timestamps. The request's
clinic comes from the token's `clinic_id` (M1.2; the temporary middleware of M1.1 is gone). API
contracts are unchanged.

## Data model
**Clinics** (`ClinicHub.Domain/Platform/Clinic.cs`, Platform module)

| Column | Type | Rules |
|---|---|---|
| Id | int PK, identity | |
| Name | varchar(256) | required |
| Status | varchar(20) | `active` / `suspended` (`ClinicStatus`): suspended clinics are left out of the login contexts, a switch to one answers 403 `clinicSuspended`, and every clinic request is refused with 403 `clinicSuspended` (per-request check since M1.3; admin suspend since M1.5, effective from the next request) |
| IsTemplate | boolean | only one template: partial unique index `WHERE "IsTemplate"` |
| DeletedAt | timestamptz null | *(M1.5.1)* set = soft deleted: hidden everywhere, nobody can enter it (`noAccess`); no EF query filter, checked explicitly ([platform admin](../platform-admin/tech.md#data-model)) |
| CreatedAt, UpdatedAt | timestamptz | UTC |

**Catalog changes**

| Table | Change |
|---|---|
| Drugs | + `ClinicId` (FK → `Clinics`, restrict), index `(ClinicId, Name)`, unique `(Id, ClinicId)`, timestamps |
| DrugGroups | + `ClinicId` (FK, restrict), index `(ClinicId, Name)`, unique `(Id, ClinicId)`, timestamps |
| DrugGroupItems | + `ClinicId` (FK, restrict), timestamps; FKs to its group and drug are **composite**: `(DrugGroupId, ClinicId)` → `DrugGroups(Id, ClinicId)` and `(DrugId, ClinicId)` → `Drugs(Id, ClinicId)` (both cascade) |

The composite FKs make the database itself reject an item whose group or drug is in another
clinic (the unique `(Id, ClinicId)` alternate keys exist only as their targets).

Owned `Dosing`, cascades and "one drug per group per eye" are unchanged. Migration: the single
PostgreSQL `Initial` was regenerated (nothing in production; dev DBs reset with
`docker compose down -v && docker compose up -d`).

## API
No new endpoints, no contract changes. Behavior inside a clinic:

| Case | Result |
|---|---|
| List drugs / groups | only the current clinic's rows |
| GET/PUT/DELETE another clinic's drug or group | 404 |
| Group items with another clinic's drug | 400 `drugNotFound` |
| `GET /drugs/{id}/groups` for another clinic's drug | `[]` |

## Backend
- `IClinicOwned` (`ClinicId`), `IHasTimestamps` (`CreatedAt`, `UpdatedAt`) in `ClinicHub.Domain/Common`;
  `IClinicContext` (`int? ClinicId`, scoped) in `ClinicHub.Application/Common/Abstractions`. `ClinicContext`
  is the settable implementation, registered scoped (`AddApplication`) and exposed as `IClinicContext`.
- `AppDbContext` (`ClinicHub.Infrastructure/Database`) takes `IClinicContext` and exposes `ClinicId`. For
  every non-owned entity type implementing `IClinicOwned` it adds the FK to `Clinics` (restrict) and the filter
  `ClinicId != null && e.ClinicId == ClinicId`: **fails closed**, no clinic = no rows.
  `IgnoreQueryFilters()` is reserved for Platform code and the Access module's read-only membership queries and
  cache loads by id.
- `ClinicAndTimestampsInterceptor` (`ClinicHub.Infrastructure/Database`; one singleton, added in
  `AddInfrastructure`), before every save:
  - `IClinicOwned` (added, modified or deleted): no clinic in context → `InvalidOperationException`.
    New rows with `ClinicId == 0` get the context's clinic; a row whose `ClinicId` differs from the
    context, or was loaded from another clinic (original `ClinicId`), throws. So Platform code that works on a clinic's rows must set `ClinicContext` first.
  - `IHasTimestamps`: added → `CreatedAt = UpdatedAt = DateTime.UtcNow`; modified → `UpdatedAt`
    only (`CreatedAt` is never overwritten). A change to an owned value (e.g. only a drug's
    `DefaultDosing`) counts as a change to its owner (owners found with one key lookup, so bulk
    saves stay linear).
- `UpdateDrugGroupCommandHandler` marks the group's `UpdatedAt` modified (`IAppDbContext.Touch`), so
  replacing only the lines also moves the group's `UpdatedAt`.
- Handlers use `FirstOrDefaultAsync(x => x.Id == id)` instead of `FindAsync` (which can return
  a tracked entity without going through the filter).
- *(Replaced in M1.2 by the token's `clinic_id`, see [login](../auth/tech.md); kept for history.)*
  **Temporary** `Features/Platform/TemporaryClinicMiddleware` (after CORS, before controllers):
  sets the context to the first active non-template clinic (looked up once per process: restart
  the API after resetting the DB). In Development only, header `X-Dev-Clinic-Id: <id>` overrides
  it; an id that is not a clinic (or not a number) → 400 ProblemDetails. The template clinic is
  accepted. M1.2 deletes it and fills the
  context from the token's `clinic_id`.
- `StartupSeeder` (`ClinicHub.Infrastructure/Platform` since M1.4 part 3: the dev seed needs its own
  transaction and `ChangeTracker.Clear()`; resolved through Application's `IStartupSeeder`), run on every startup after migrations (idempotent):
  - ensures the template clinic ("Template clinic", `IsTemplate`) exists;
  - Development, no non-template clinic yet: fills the template (2 eye drops + group "After cataract
    surgery"), then creates "Demo clinic" and "Second demo clinic" through `CreateClinicCommand`, so both
    start with a copy of the template (since M1.5.2, [platform admin](../platform-admin/tech.md#dev-seed));
    "Demo clinic" also gets 10,000 "Drug number N". It enters each clinic with `IClinicScope.Use(clinicId)`
    while inserting its rows. The dev seed runs in one transaction, so a crash can't leave a half-seeded DB
    that later starts would skip.

- Since M1.2 the request's clinic comes from the token's `clinic_id`: `UseClinicFromToken()` in the Api's
  `Features/Identity/IdentitySetup` (reads `ICurrentUser`, whose interface is in `Application/Common/Abstractions`).
  Only exception (M1.5.3): the super admin's per-clinic admin routes (`/admin/clinics/{clinicId}/roles…`, `/staff…`),
  where the admin clinic filter enters the route's clinic (`IClinicScope.EnterAsync`; a platform token carries none);
  the use cases then run under the same filter and interceptor ([platform admin](../platform-admin/tech.md#roles-and-staff-m153)).

## Frontend
Catalog calls never send a clinic: it comes from the token. The SPA picks the clinic at login / switch
(`POST /auth/context`, see [login](../auth/tech.md)) and keeps the prescription per clinic
(`prescription.lines.<clinicId>`).

## Edge cases & limitations
- Fresh Production DB: only the template exists; nobody but the super admin can sign in until the super admin
  creates a clinic in `/admin`.
- Suspension is enforced per request by the permission check (M1.3; [access](../access/tech.md)), not only at
  login and switch. *(History: in M1.1 `Status` only picked the default clinic and the dev header accepted suspended
  clinics; in M1.2 open access tokens stayed valid ≤ 15 min after a suspension.)*
- A group PUT always moves the group's `UpdatedAt` (even with no change), and its lines are
  re-inserted, so a line's `CreatedAt` is the last group save. A drug PUT with an identical
  non-null dosing also moves `UpdatedAt` (the dosing is replaced). Deleting a drug removes its
  lines (DB cascade) without moving those groups' `UpdatedAt`.
- The prescription in `localStorage` is not per clinic yet (planned with login). *(Done in M1.2:
  `prescription.lines.<clinicId>`.)*

## Testing notes
Automated since M1.6 ([testing README](../../testing/README.md)): catalog area
[ISO](../../testing/test-catalog.md#iso--clinic-isolation) (catalog routes across clinics, the clinic from the token
only, the template clinic, the database guards, timestamps); a change here adds or fixes its cases and tests.

| Level | Tests |
|---|---|
| api | `tests/ClinicHub.IntegrationTests/Isolation/` (two clinics side by side; raw SQL only for the "changed outside the app" and database-guard cases) (`./test.ps1 -Area isolation`) |
| ui | `ClinicHub.Web/src/app/App.clinicLost.test.tsx` |
| e2e | `ClinicHub.Web/e2e/isolation/clinics.spec.ts`, `e2e/auth/picker.spec.ts` |

Mutation: `ClinicAndTimestampsInterceptor.cs` is one of the 6 critical files (85% on its own, scored by the
`isolation` tests: [testing README § Mutation testing](../../testing/README.md#mutation-testing)).
