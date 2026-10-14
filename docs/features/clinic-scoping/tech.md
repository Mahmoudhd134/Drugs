# Clinic scoping: technical

## Summary
Phase 1 (Foundations) of the [multi-clinic platform](../../design/platform-hld.md). Adds the
`Clinics` table and makes the catalog (drugs, groups, group items) belong to a clinic. Isolation is
automatic: an EF Core global query filter limits every query to the request's clinic, and a
`SaveChanges` interceptor stamps new rows with that clinic and fills UTC timestamps. Until login
exists, a temporary middleware chooses the clinic. API contracts are unchanged.

## Data model
**Clinics** (`ClinicHub.Domain/Platform/Clinic.cs`, Platform module)

| Column | Type | Rules |
|---|---|---|
| Id | int PK, identity | |
| Name | varchar(256) | required |
| Status | varchar(20) | `active` / `suspended` (`ClinicStatus`); only used to pick the default clinic so far *(phase 2: suspended clinics are left out of login contexts → `clinicSuspended`)* |
| IsTemplate | boolean | only one template: partial unique index `WHERE "IsTemplate"` |
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
  `IgnoreQueryFilters()` is reserved for Platform code.
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
- *(Replaced in phase 2 by the token's `clinic_id`, see [login](../auth/tech.md); kept for history.)*
  **Temporary** `Features/Platform/TemporaryClinicMiddleware` (after CORS, before controllers):
  sets the context to the first active non-template clinic (looked up once per process: restart
  the API after resetting the DB). In Development only, header `X-Dev-Clinic-Id: <id>` overrides
  it; an id that is not a clinic (or not a number) → 400 ProblemDetails. The template clinic is
  accepted. Phase 2 deletes it and fills the
  context from the token's `clinic_id`.
- `StartupSeeder` (`ClinicHub.Infrastructure/Platform` since Phase 3.5 step 3: the dev seed needs its own
  transaction and `ChangeTracker.Clear()`), run on every startup after migrations (idempotent):
  - ensures the template clinic ("Template clinic", `IsTemplate`) exists;
  - Development, no non-template clinic yet: creates "Demo clinic" (10,000 "Drug number N") and
    "Second demo clinic" (3 eye drops + group "After cataract surgery"). It sets the
    `ClinicContext` to each clinic while inserting its rows. The dev seed runs in one transaction,
    so a crash can't leave a half-seeded DB that later starts would skip.

- Since phase 2 the request's clinic comes from the token's `clinic_id`: `UseClinicFromToken()` in the Api's
  `Features/Identity/IdentitySetup` (reads `ICurrentUser`, whose interface is in `Application/Common/Abstractions`).

## Frontend
No changes. The SPA never sends a clinic; the API decides it.

## Edge cases & limitations
- Fresh Production DB: only the template exists, so the middleware finds no clinic: lists are empty
  and saves throw (500) until clinics can be created (phase 4).
- `Status` only matters for picking the default clinic; the dev header accepts suspended clinics,
  and suspension is not enforced yet (phase 3/4). *(Phase 2: the middleware is gone; suspended
  clinics can't be entered at login or switch, but open access tokens stay valid ≤ 15 min.)*
- A group PUT always moves the group's `UpdatedAt` (even with no change), and its lines are
  re-inserted, so a line's `CreatedAt` is the last group save. A drug PUT with an identical
  non-null dosing also moves `UpdatedAt` (the dosing is replaced). Deleting a drug removes its
  lines (DB cascade) without moving those groups' `UpdatedAt`.
- The prescription in `localStorage` is not per clinic yet (planned with login). *(Done in phase 2:
  `prescription.lines.<clinicId>`.)*

## Testing notes
Verified manually (no automated tests in the MVP) on a reset DB, API on :5000, Vite on :5173:
- Seed: template (id 1, 0 drugs), Demo clinic (id 2, 10,000 drugs), Second demo clinic (id 3,
  3 drugs, 1 group with 3 items, all `ClinicId = 3`).
- curl: each clinic lists only its drugs/groups; template and unknown ids list nothing; GET, PUT
  and DELETE of the other clinic's drug and group → 404 (rows intact); a group in clinic 3 with a
  clinic 2 drug → `drugNotFound`.
- New drug, group and items get the right `ClinicId`; `CreatedAt`/`UpdatedAt` in UTC; an update
  changes only `UpdatedAt`.
- After review fixes: a dosing-only drug edit and a lines-only group edit move `UpdatedAt` (not
  `CreatedAt`); `X-Dev-Clinic-Id: 99` / `abc` → 400; seed on a fresh DB (migrated with
  `dotnet ef database update`) creates all three clinics.
- Composite FKs: a raw SQL insert of an item linking a clinic 3 group to a clinic 2 drug fails
  on `FK_DrugGroupItems_Drugs_DrugId_ClinicId` (or `..._DrugGroups_DrugGroupId_ClinicId`); group
  create, line replace, drug edit, drug delete (cascades its line) and group delete all work.
- Browser (Demo clinic): drugs list, edit, delete; group create, edit, delete; group added to a
  prescription. No console errors.
