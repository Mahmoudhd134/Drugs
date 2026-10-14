# Platform admin: technical

## Summary
M1.5 of the [multi-clinic platform](../../design/platform-hld.md), built in five sub-steps from the approved
[M1.5 design](../../design/m1.5-platform-admin.md). **Built so far: M1.5.1** (backend only): the admin
foundations and the clinic lifecycle API. The super admin, in the **platform** context, can list, search, filter,
open, rename, suspend, re-activate and (soft) delete clinics through `/api/v1/admin/clinics`. The foundations the
next sub-steps build on are in place: the `PlatformAdmin` policy (D1), `IClinicScope` (D2), post-commit cache
invalidation (D3) and the `Clinics.DeletedAt` soft delete with its explicit checks (D4).
Not built yet: create clinic + provisioning (M1.5.2), roles and staff (M1.5.3), the admin screens (M1.5.4–5).

## Data model
Migration **`AddClinicDeletedAt`** (on top of `AddRoles`; adds one nullable column, no data step needed).

**Clinics** (`ClinicHub.Domain/Platform/Clinic.cs`)

| Column | Type | Rules |
|---|---|---|
| DeletedAt | timestamptz null | set = soft deleted (`Clinic.Delete(now)`, keeps the first time). `Status` is **not** touched, so a future restore only clears it. All the clinic's rows are kept |

There is **no EF query filter** on `Clinics` (design D4: the access reads bypass filters, and the cached staff
query joins `Clinics` to read the flag itself). Every place that decides whether a clinic can be used checks it explicitly:

| Place | Deleted clinic |
|---|---|
| `MembershipService.GetEnterableClinicsAsync` (login contexts, refresh, switch) | skipped (`DeletedAt == null`) |
| `AccessCache` → `PermissionService` | `StaffAccess.IsClinicDeleted` / `ClinicAccess.IsDeleted` → 403 `noAccess`, checked before the status (never `clinicSuspended`, which would reveal the clinic) |
| `SwitchContextCommandHandler` "is it suspended?" | `noAccess` whatever its `Status` |
| `IClinicScope.EnterAsync`, the clinic use cases | 404 `notFound` |
| Admin lists and lookups | `db.Clinics.NotDeleted()` (`ClinicQueries`); `Manageable()` = not deleted and not the template |

## API
All under `/api/v1/admin/clinics`, controller `Api/Features/Platform/AdminClinicsController`, policy
`AuthPolicies.PlatformAdmin` on the class.

| Method | Route | Request | Response | Errors (codes) |
|---|---|---|---|---|
| GET | `/admin/clinics?search=&status=&page=1&pageSize=20` | | `PagedResult<ClinicSummary>` | — |
| GET | `/admin/clinics/{id}` | | `ClinicDetails` | 404 `notFound` |
| PUT | `/admin/clinics/{id}` | `{ name }` | `ClinicDetails` | 400 `nameRequired`, `nameTooLong`; 404 `notFound` |
| POST | `/admin/clinics/{id}/suspend` | | 204 (idempotent) | 404 `notFound` |
| POST | `/admin/clinics/{id}/activate` | | 204 (idempotent) | 404 `notFound` |
| DELETE | `/admin/clinics/{id}` | | 204 (soft delete, final for now) | 404 `notFound` |

```ts
type ClinicSummary = { id: number; name: string; status: "active" | "suspended"; staffCount: number; createdAt: string };
type ClinicDetails = ClinicSummary & { owners: { staffId: number; fullName: string; phone: string }[] };
```

- Every route: no/expired token → 401 `unauthorized`; any token that is not a platform-context token of a user who
  is **still** a super admin → 403 `forbidden` (a clinic or template-context token of the super admin too).
- A missing or deleted clinic, or the **template**, → 404 `notFound` on every `{id}` route (so the template can't be
  renamed, suspended or deleted, and a deleted clinic can't be deleted again).
- List: no template, no deleted clinics; `search` = case-insensitive `Contains` on the name, names starting with
  it first; `status` = `active` / `suspended` (trimmed, lower-cased; any other value matches nothing); then by
  name and id. Paging as everywhere (`Paging.Normalize`: page ≥ 1, pageSize 1–100, default 20).
- `staffCount` = active staff. `owners` = active staff holding the Owner role, by name.

## Backend

| Piece | Layer | Role |
|---|---|---|
| `AuthPolicies.PlatformAdmin` | Api (`Features/Identity/IdentitySetup.cs`) | Authenticated + claim `ctx = platform` + `PlatformAdminRequirement` |
| `PlatformAdminRequirement` / `PlatformAdminHandler` | Api (`Features/Access/PlatformAdminHandler.cs`) | Succeeds when `IAccessCache.GetUserAsync(userId)` says `IsSuperAdmin` (so a phone dropped from `Platform:SuperAdminPhones` is locked out on its next request after the restart that demotes it); else `AccessFailureReason(CommonErrors.Forbidden)` through the existing 403 path (`AccessAuthorizationResultHandler`) |
| `IClinicScope` / `ClinicScope` | Application: the interface in `Common/Abstractions`, the implementation in `Features/Platform/Clinics` (it uses the clinic rules; `Common` never references `Features`); scoped | `EnterAsync(clinicId)`: `ClinicErrors.NotFound` for a missing, deleted or template clinic, else sets `ClinicContext` (suspended allowed); same clinic again = no-op success; a different one once set = `InvalidOperationException`. `Use(clinicId)` → `IDisposable`: sets the clinic for a block, restores the previous one (nestable). No caller yet: M1.5.2 (provisioning) and M1.5.3 (the admin clinic filter) use them |
| `IPostCommitActions` | Application (`Common/Abstractions`), implemented by `TransactionRunner` | `AddAsync(token => …)`: queued inside the runner's outermost transaction, run when it ends (committed or rolled back, after the execution strategy, retries included); at once otherwise. Failures logged. See [architecture § 3.5](../../design/architecture.md#35-pipeline-behaviors) |
| `ClinicErrors` | Application (`Features/Platform/Clinics`) | `NotFound` (code `notFound`, 404) |
| `ClinicDto.cs` | Application | `ClinicSummary`, `ClinicOwner`, `ClinicDetails` |
| `ClinicQueries` | Application | `NotDeleted()`, `Manageable()`, `SelectDetails(db)`: a projection to `ClinicDetails`, one query (active staff count and owners as subqueries across clinics with `IgnoreQueryFilters()`, read only); callers filter, then `FirstOrDefaultAsync` (null → `NotFound`) |
| `GetClinicsQuery`, `GetClinicQuery` | Application (`Queries/`) | List (one query + the count; `staffCount` as a subquery) and details |
| `RenameClinicCommand` | Application (`Commands/`) | Validator: `ValidName()` (`nameRequired`, `nameTooLong`, max `FieldLimits.NameMaxLength` = the column); trims; no invalidation (no cached entry holds the name) |
| `SuspendClinicCommand`, `ActivateClinicCommand` | Application | Set `Status` when it differs; always queue `InvalidateClinicAsync(clinicId)` post-commit |
| `DeleteClinicCommand` | Application | `Clinic.Delete(now)` (`TimeProvider`), `Status` untouched; queues `InvalidateClinicAsync(clinicId)` post-commit |

Cross-clinic reads (`IgnoreQueryFilters()`) are allowed only in Platform code. Admin requests have **no current
clinic** (platform token), so clinic-owned queries in these use cases must bypass the filter explicitly, read
only. `Clinic` is not clinic-owned, so saving it needs no clinic context.

Lockout is on the **next request** (design D7, no session revocation): suspend/activate/delete clear the clinic's
access cache entries after the commit, so the staff's next clinic request answers 403 `clinicSuspended`
(suspended) or `noAccess` (deleted); a deleted clinic also leaves `/auth/contexts`. The next refresh of a session
in it (`RefreshSessionCommandHandler`): two or more contexts left → the context is cleared (the user picks one);
exactly one → switched to it; none → the session is revoked (401 `unauthorized`).

## Frontend
None yet (M1.5.4–M1.5.5). `/platform` is still the placeholder page.

## Edge cases & limitations
- Delete is final in M1.5 (no endpoint clears `DeletedAt`); restoring = clearing it in the database, the clinic
  comes back with the `Status` it had. Who deleted it is not recorded (audit log, later).
- Clinic names are not unique; the details' `owners` tell clinics apart.
- Suspend/activate always invalidate, even when nothing changed (harmless; repairs a stale entry).
- Accepted (design D3): a cache load that started just before the commit may store the old row after the
  invalidation; the change then applies when the entry expires (≤ 10 min, 30 s in memory today).
- Demoting a super admin happens only at startup (`Platform:SuperAdminPhones`); their old platform access token
  then gets 403 on `/admin/*` (their sessions are revoked by the seeder).
- An unknown `status` filter returns an empty page, not a 400.
- Accepted (design D7, § 11): after a super admin logs out, their platform access token still works on
  `/admin/*` until it expires (≤ 15 min): the policy checks the super-admin flag, not the session.

## Testing notes
M1.5.1, verified manually (no automated tests before M1.6) on the dev DB after `dotnet ef database update`
(`AddClinicDeletedAt` applied), API on `:5055` from the Release build, a Python script with the refresh cookie
kept by hand (63 checks, all pass):
- Super admin, platform context: list = Demo + Second demo (no template), shapes as above, `staffCount` 2 each;
  get Second → owners `[Dev Owner, +201000000002]`; rename (trimmed) and back; `"  "` → 400 `nameRequired`,
  257 chars → `nameTooLong`; `search=second` → [3], `search=demo` → [2, 3]; `status=suspended` → 0;
  `status=active&pageSize=1&page=2` → 1 of 2; `pageSize=1000` → 100.
- Template id (1) and an unknown id → 404 `notFound` on GET, PUT, suspend, activate, DELETE.
- No token → 401; the owner's no-context and clinic tokens, and the super admin's **template-context** token
  → 403 `forbidden`.
- Suspend Second (twice: 204, 204) → the owner's and the assistant's next `/drugs` in it → 403 `clinicSuspended`;
  `status=suspended` lists it; switching into it → `clinicSuspended`; activate (twice) → both 200 again.
- Suspend + delete Second → next `/drugs` → 403 `noAccess` (not `clinicSuspended`); it leaves both users'
  `/auth/contexts` and the admin list (also the suspended filter); switching into it → `noAccess`; GET, PUT,
  suspend, activate, DELETE on it → 404; the owner's refresh moves the session to Demo clinic.
- Demo clinic unaffected: a new owner login auto-enters it (only context left), 10,000 drugs, `/me` 200.
- D1: with the API restarted with `Platform__SuperAdminPhones__0` set to another phone, the earlier platform
  token → 403 `forbidden` on `/admin/clinics`; restarted normally, a new one → 200.
- The dev data was restored afterwards with psql (`DeletedAt` null, `Status` active, original names; the extra
  user the demotion test created was deleted).
