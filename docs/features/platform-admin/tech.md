# Platform admin: technical

## Summary
M1.5 of the [multi-clinic platform](../../design/platform-hld.md), built in five sub-steps from the approved
[M1.5 design](../../design/m1.5-platform-admin.md). **Built: M1.5.1–M1.5.5** (M1.5 is done). M1.5.1: the
admin foundations and the clinic lifecycle API: the super admin, in the **platform** context, can list, search,
filter, open, rename, suspend, re-activate and (soft) delete clinics through `/api/v1/admin/clinics`, on the
`PlatformAdmin` policy (D1), `IClinicScope` (D2), post-commit cache invalidation (D3) and the `Clinics.DeletedAt` soft
delete with its explicit checks (D4). M1.5.2: **create clinic** (`POST /api/v1/admin/clinics`), provisioned from the
template by `IClinicProvisioner` and its ordered `IClinicSeeder`s (D5); `IUserAccounts`, the one way to find or create a
user by phone; the dev seed creates its clinics through the same command and gives the template sample content (D6).
M1.5.3: each clinic's **roles** and **staff** (`/api/v1/admin/clinics/{clinicId}/roles…`, `/staff…`) through the
**admin clinic filter** (D2: the route's clinic becomes the request's clinic, so the role and staff use cases, in the
Access module, never take a clinic id), with the Owner lock, `roleInUse`, `lastOwner` and the post-commit invalidations
of the D3 table (lockout on the next request). M1.5.4: the **admin screens for clinics** (frontend, plus one backend rule: `ValidName()` also refuses bidi overrides
and isolates with `nameInvalid`, so a name can't show reversed and can always be typed to confirm a delete): the
`/admin` area with its own layout, the clinics list, the create page and the clinic page (Overview tab: rename,
disable / enable, delete with the name typed), and a link into the template ([Frontend](#frontend)). M1.5.5: the
clinic page's **Roles** and **Staff** tabs (frontend only), built from reusable components that get their data through
an adapter (design D9), so a clinic-side screen can mount them later ([Roles and staff screens](#roles-and-staff-screens-m155)).

## Data model
Migration **`AddClinicDeletedAt`** (M1.5.1, on top of `AddRoles`; adds one nullable column, no data step needed).
M1.5.2 and M1.5.3 add no migration (provisioning, roles and staff write existing tables; access
[data model](../access/tech.md#data-model)).

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
| POST | `/admin/clinics` | `{ name, owner: { phone, fullName } }` | **201** `ClinicDetails` + `Location: /api/v1/admin/clinics/{id}` | 400 `nameRequired`, `nameInvalid`, `nameTooLong` (`field` `name` or `owner.fullName`), `invalidPhone` (`owner.phone`), `invalidRequest` (`owner` missing) |
| PUT | `/admin/clinics/{id}` | `{ name }` | `ClinicDetails` | 400 `nameRequired`, `nameInvalid`, `nameTooLong`; 404 `notFound` |
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
  it first; `status` = `active` / `suspended` (trimmed, lower-cased, control characters dropped; any other value matches nothing); then by
  name and id. Paging as everywhere (`Paging.Normalize`: page ≥ 1, pageSize 1–100, default 20).
- `staffCount` = active staff. `owners` = active staff holding the Owner role, by name.
- Create: both names trimmed, at most `FieldLimits.NameMaxLength` (256, the `Clinics.Name` and `Staff.FullName`
  columns); the phone as typed (local numbers use `Platform:DefaultRegion`), stored E.164. Every validation failure
  is returned (in the form's order: name, owner phone, owner name; the first is the response's `code`). The new clinic
  is `active` and answers with `staffCount` 1 and its owner. Clinic names need not be unique.

### Roles and staff (M1.5.3)
Under `/api/v1/admin/clinics/{clinicId}`, controllers `AdminRolesController` and `AdminStaffController`
(`Api/Features/Platform`), policy `PlatformAdmin` + `[AdminClinic]` on the class.

| Method | Route | Request | Response | Errors (codes) |
|---|---|---|---|---|
| GET | `…/roles` | | `Role[]` | — |
| POST | `…/roles` | `{ name, permissions[] }` | **201** `Role` + `Location: …/clinics/{clinicId}/roles` | 400 `nameRequired`, `nameInvalid`, `nameTooLong` (`name`), `unknownPermission` (`permissions`, one error for the list), `invalidRequest` (`permissions` missing); 409 `roleNameTaken` |
| PUT | `…/roles/{roleId}` | `{ name, permissions[] }` | `Role` | the same; 404 `notFound`; 409 `roleLocked` (Owner) |
| DELETE | `…/roles/{roleId}` | | 204 | 404 `notFound`; 409 `roleLocked`, `roleInUse` |
| GET | `…/staff?search=&page=1&pageSize=20` | | `PagedResult<StaffMember>` | — |
| POST | `…/staff` | `{ phone, fullName, roleIds[] }` | **201** `StaffMember` + `Location: …/clinics/{clinicId}/staff` | 400 `invalidPhone` (`phone`), `nameRequired`, `nameInvalid`, `nameTooLong` (`fullName`), `rolesRequired`, `roleNotFound` (`roleIds`); 409 `staffExists` |
| PUT | `…/staff/{staffId}` | `{ fullName, isActive, roleIds[] }` | `StaffMember` | the same (no phone) + `invalidRequest` (`isActive` missing); 404 `notFound`; 409 `lastOwner` |
| DELETE | `…/staff/{staffId}` | | 204 | 404 `notFound`; 409 `lastOwner` |

```ts
type Role = { id: number; name: string; isOwner: boolean; permissions: string[]; staffCount: number };
type StaffMember = { id: number; userId: number; phone: string; fullName: string; isActive: boolean;
                     roles: { id: number; name: string; isOwner: boolean }[] };
```

- **The clinic** (`AdminClinicFilter`): a missing, deleted or template `clinicId` → 404 `notFound` on every route,
  before the body is read (a malformed body still answers 404); a **suspended** clinic is managed normally. Policy
  failures as for the clinic routes (401 / 403 `forbidden`, checked first). A role or staff id of **another** clinic →
  404 `notFound` (the query filter hides it), like an unknown id.
- **Validation order** (every failure returned, the first is `code`): role: name, permissions; add staff: phone, full
  name, roles; update staff: full name, `isActive`, roles. Then, in the handler: 404, `roleLocked`, `roleNotFound`
  (400 before 409), then `roleNameTaken` / `staffExists` / `roleInUse` / `lastOwner`.
- **Roles list**: the Owner first, then by name (then id). `permissions` in catalog order, stored keys no longer in the
  catalog left out; the **Owner's** = every catalog key (it stores none and has all by rule, so the UI shows what it
  really grants). `staffCount` = staff rows holding the role, **active or not** (what `roleInUse` checks).
- **Role save**: name trimmed, `ValidName(FieldLimits.RoleNameMaxLength)` (100, the `Roles.Name` column). Unique per
  clinic **case-insensitively** after trimming (stored name lowered by the database, the new one with the invariant
  culture; they agree for Latin and Arabic, a few special letters such as Turkish `İ` may fold differently: accepted;
  `lower()` follows the database's locale: `en_US.utf8` here, a `C`/`POSIX` database folds ASCII letters only):
  stricter than the unique `(ClinicId, Name)` index (exact, default collation), so the index only fires on two saves of
  the same name in the same instant (500, accepted).
  Renaming a role to another case of its own name is allowed. `permissions` must be a list (missing → `invalidRequest`,
  so a client that forgets it can't empty a role); `[]` is allowed (a role that grants nothing). Every key must be in
  `PermissionCatalog` (`unknownPermission`, field `permissions`: **one** error for the whole list, however many keys
  are bad); the stored rows are
  `PermissionCatalog.WithRequirements(picked)` (e.g. `drugs.update` → also `drugs.details`, `drugs.list`), and the
  response shows them. Update replaces the rows (kept ones untouched); the role's `UpdatedAt` moves only when its name
  or rows changed.
- **Owner role** (`IsOwner`): update and delete → 409 `roleLocked` (after validation).
- **Role delete**: real delete (its `RolePermissions` cascade); any staff holding it, active or not → 409 `roleInUse`.
- **Staff list**: the clinic's staff, active or not, by full name then id; paging as everywhere. `search`
  (`Paging.SearchTerm`) matches the full name (`Contains`, case-insensitive); a term that looks like a phone (only
  digits, Arabic-Indic too, spaces, `+ - ( )`) **also** matches the stored phone containing its digits (mapped to
  ASCII) with the **leading zeros dropped**: a local `0100…` (trunk prefix), «٠١٠٠…» or an international `0020…` finds
  `+20100…`; `+20100` and `100000` match too. Not matched: a trunk `0` after the country code (`+20 0100…`, kept
  as typed). Roles: Owner first, then by name.
- **Add staff**: the phone normalized like login (`invalidPhone`; local numbers use `Platform:DefaultRegion`);
  `roleIds` at least one (`rolesRequired`; missing or `[]`), duplicates ignored, every id a role of this clinic
  (`roleNotFound`, 400: the request names something that isn't there); `staffExists` (409) when the phone's user already
  has a staff row here, **active or not**. Only then `IUserAccounts.GetOrCreateAsync(phone)`: an existing user (another
  clinic's staff, a super admin, a deleted clinic's owner…) is reused, else created. The new row is active. The name is
  per clinic (trimmed, ≤ 256).
- **Update staff**: name, active flag and roles (replaced; kept ones untouched; `UpdatedAt` moves when the roles
  change). `isActive` is required (`bool?`: a missing value is `invalidRequest`, never "deactivate"). The **phone can't
  change** (design § 6: remove and add again).
- **Remove staff**: real delete of the staff row (its `StaffRoles` cascade); the user, their sessions and their other
  clinics stay.
- **`lastOwner`** (409, `StaffRules.StopsBeingActiveOwner` + `ActiveOwners()`): a staff member who is an **active** Owner today may stop
  being one (deactivated, removed, or the Owner role taken away) only if **another active** staff member holds the
  Owner role. Inactive owners don't count; changes to anyone who is not an active Owner never answer it.
  Read, then write, no lock: two such changes in the very same instant could both pass (accepted, design § 6).

## Backend

| Piece | Layer | Role |
|---|---|---|
| `AuthPolicies.PlatformAdmin` | Api (`Features/Identity/IdentitySetup.cs`) | Authenticated + claim `ctx = platform` + `PlatformAdminRequirement` |
| `PlatformAdminRequirement` / `PlatformAdminHandler` | Api (`Features/Access/PlatformAdminHandler.cs`) | Succeeds when `IAccessCache.GetUserAsync(userId)` says `IsSuperAdmin` (so a phone dropped from `Platform:SuperAdminPhones` is locked out on its next request after the restart that demotes it); else `AccessFailureReason(CommonErrors.Forbidden)` through the existing 403 path (`AccessAuthorizationResultHandler`) |
| `IClinicScope` / `ClinicScope` | Application: the interface in `Common/Abstractions`, the implementation in `Features/Platform/Clinics` (it uses the clinic rules; `Common` never references `Features`); scoped | `EnterAsync(clinicId)`: `ClinicErrors.NotFound` for a missing, deleted or template clinic, else sets `ClinicContext` (suspended allowed); same clinic again = no-op success; a different one once set = `InvalidOperationException`. `Use(clinicId)` → `IDisposable`: sets the clinic for a block, restores the previous one (nestable). `Use` callers (M1.5.2): the provisioner and the dev seed; `EnterAsync`: M1.5.3's admin clinic filter |
| `IPostCommitActions` | Application (`Common/Abstractions`), implemented by `TransactionRunner` | `AddAsync(token => …)`: queued inside the runner's outermost transaction, run when it ends (committed or rolled back, after the execution strategy, retries included); at once otherwise. Failures logged. See [architecture § 3.5](../../design/architecture.md#35-pipeline-behaviors) |
| `ClinicErrors` | Application (`Features/Platform/Clinics`) | `NotFound` (code `notFound`, 404) |
| `ClinicDto.cs` | Application | `ClinicSummary`, `ClinicOwner`, `ClinicDetails` |
| `ClinicQueries` | Application | `NotDeleted()`, `Manageable()`, `SelectDetails(db)`: a projection to `ClinicDetails`, one query (active staff count and owners as subqueries across clinics with `IgnoreQueryFilters()`, read only); callers filter, then `FirstOrDefaultAsync` (null → `NotFound`) |
| `GetClinicsQuery`, `GetClinicQuery` | Application (`Queries/`) | List (one query + the count; `staffCount` as a subquery) and details |
| `RenameClinicCommand` | Application (`Commands/`) | Validator: `ValidName()` (`nameRequired`, `nameInvalid`, `nameTooLong`, max `FieldLimits.NameMaxLength` = the column); trims; no invalidation (no cached entry holds the name) |
| `SuspendClinicCommand`, `ActivateClinicCommand` | Application | Set `Status` when it differs; always queue `InvalidateClinicAsync(clinicId)` post-commit |
| `DeleteClinicCommand` | Application | `Clinic.Delete(now)` (`TimeProvider`), `Status` untouched; queues `InvalidateClinicAsync(clinicId)` post-commit |
| `CreateClinicCommand` (+ `CreateClinicOwner`) | Application (`Commands/CreateClinic`) | Validator: `ValidName()` on the name and on `Owner.FullName`, `ValidPhone()` on `Owner.Phone`, `Owner` not null (`invalidRequest`). Handler: normalizes the phone, trims, calls `IClinicProvisioner`. One transaction (`TransactionBehavior`): a failed result or an exception rolls everything back. **No cache invalidation** (below) |
| `IClinicProvisioner` / `ClinicProvisioner` | Application (`Features/Platform/Provisioning`), **internal**, scoped | `ProvisionAsync(name, ownerPhone, ownerName)`: inserts the `Clinic` (not clinic-owned: no clinic context needed), then inside `IClinicScope.Use(newId)` runs every `IClinicSeeder` by `Order` and returns `ClinicDetails` (`ClinicQueries.SelectDetails`, read in the same transaction). Never opens or checks a transaction: only the command's handler calls it |
| `IClinicSeeder` (+ `ClinicSeedContext(ClinicId, OwnerPhone, OwnerName)`) | Application (`Provisioning`), internal; each seeder registered as `IClinicSeeder`, scoped | `Order` + `SeedAsync(context)`; runs inside the new clinic and the provisioning transaction. A new module adds one (e.g. M2.1's default form) |
| `DefaultRolesSeeder` (10) | `Provisioning/Seeders` | Creates the roles of `DefaultRoles.Templates` (Owner, Doctor, Assistant) with their permissions; their clinic is the current one (filled on insert) |
| `OwnerSeeder` (20) | `Provisioning/Seeders` | The owner's user through `IUserAccounts.GetOrCreateAsync(phone)` (an existing user is reused: one user row per phone), the clinic's Owner role (query filter: the new clinic's), and a `Staff` row (`FullName` = the owner name given here; a staff name is per clinic) with that role |
| `TemplateCatalogSeeder` (30) | `Provisioning/Seeders` | Copies the template's catalog, see [Provisioning](#provisioning) |
| `IUserAccounts` / `UserAccounts` | Application (`Features/Identity/Users`), scoped | `GetOrCreateAsync(phone)` (phone already normalized): finds the user, or adds and saves one. Replaces `IIdentitySeeder.EnsureUserAsync`; also used by the super-admin seeding, the dev seed and `AddStaffCommand` (M1.5.3) |
| `AdminClinicAttribute` / `AdminClinicFilter` | Api (`Features/Platform/AdminClinicFilter.cs`) | M1.5.3, design D2. `[AdminClinic]` = `TypeFilterAttribute` of an `IAsyncResourceFilter`: after authorization (the policy runs in the middleware), before model binding; reads the route's `clinicId`, calls `IClinicScope.EnterAsync`; a failure → `Result.ToProblem()` (404 `notFound`). On `AdminRolesController` and `AdminStaffController` only |
| `AdminRolesController`, `AdminStaffController` | Api (`Features/Platform`) | Thin, `PlatformAdmin` + `[AdminClinic]`; request records `SaveRoleRequest`, `AddStaffRequest`, `UpdateStaffRequest` (`isActive` is `bool?`). No GET of one role or staff member, so `ToCreated` points to the list (`GetAll` with the `clinicId`) |
| `RoleDto` (+ `RoleMappings`), `RoleErrors`, `RoleRules` | Application (`Features/Access/Roles`) | `RoleDto(Id, Name, IsOwner, Permissions, StaffCount)`; errors `NotFound`, `NameTaken`, `UnknownPermission`, `Locked`, `InUse`; `RoleRules` (static, pure: composes queries, runs none): `WithName(name)` (case-insensitive: `lower()` vs invariant lower), `WithIds(ids)`, `SetPermissions` (stores `WithRequirements`, diffs the rows, true when changed) |
| `GetRolesQuery`, `CreateRoleCommand`, `UpdateRoleCommand`, `DeleteRoleCommand` | Application (`Roles/Queries`, `Roles/Commands`) | As above; each in the current clinic only (query filter). Create: no invalidation (new id, no holder). Update: `InvalidateRoleAsync(roleId)` after commit (always, a rename too, design D3). Delete: `InvalidateClinicAsync(clinicId)` after commit (D3; it also drops the role's own entry) |
| `StaffMemberDto` (+ `StaffRoleDto`, `StaffMappings.SelectDto`), `StaffErrors`, `StaffRules` | Application (`Features/Access/StaffMembers`) | Projection in one query; errors `NotFound`, `RolesRequired`, `RoleNotFound` (field `roleIds`), `StaffExists`, `LastOwner`; `StaffRules` (static, pure: composes queries, runs none): `WithRoles()`, `ActiveOwners()`, `StopsBeingActiveOwner(staff, staysActiveOwner)`; the handlers run the queries (distinct `roleIds`, count compared → `roleNotFound`) |
| `GetStaffQuery`, `AddStaffCommand`, `UpdateStaffCommand`, `RemoveStaffCommand` | Application (`StaffMembers/Queries`, `StaffMembers/Commands`) | As above. Add, update and remove queue `InvalidateStaffAsync(staffId)` after commit (D3; for an add the id is new, kept for the rule) |

**No invalidation after a create** (decided in M1.5.2): every cached access entry is keyed by a staff, role or clinic
id (`access:staff:{staffId}:{userId}:{clinicId}`, `access:role:{roleId}:{clinicId}`, `access:clinic:{clinicId}`), and
all of those are new (PostgreSQL identities are never reused, even after a rolled-back create), so nothing cached can
be stale. For an **existing** user who becomes the owner, nothing user-level changes (`access:user:{id}` only holds
`IsSuperAdmin`), and their clinics are not cached: login, refresh, switch and `/auth/contexts` read them from the
database (`MembershipService`), so the new clinic shows up at their next refresh or login.

Cross-clinic reads (`IgnoreQueryFilters()`) are allowed only in Platform code. Admin requests have **no current
clinic** (platform token), so clinic-owned queries in these use cases must bypass the filter explicitly, read
only. `Clinic` is not clinic-owned, so saving it needs no clinic context.

**Role and staff invalidations** (M1.5.3, design D3, all after the commit through `IPostCommitActions`): role updated
→ `InvalidateRoleAsync(roleId)` (every holder's next request reloads that role's keys); role deleted →
`InvalidateClinicAsync(clinicId)`; staff added / updated / removed → `InvalidateStaffAsync(staffId)`. Nothing
user-level: `access:user:{id}` holds only `IsSuperAdmin`, and a user's clinics are never cached (login, refresh, switch
and `/auth/contexts` read them from the database), so a user who loses their **last** clinic needs no extra clearing:
their next clinic request answers `noAccess` (the staff entry reloads as inactive or missing), the clinic leaves
`/auth/contexts` at once, and their next refresh with no context left revokes the session (as for a deleted clinic).
A **re-added** person gets a **new** staff id: their old access token still names the old one (`noAccess`) until the
next refresh, which issues a token for the new row.

Lockout is on the **next request** (design D7, no session revocation): suspend/activate/delete clear the clinic's
access cache entries after the commit, so the staff's next clinic request answers 403 `clinicSuspended`
(suspended) or `noAccess` (deleted); a deleted clinic also leaves `/auth/contexts`. The next refresh of a session
in it (`RefreshSessionCommandHandler`): two or more contexts left → the context is cleared (the user picks one);
exactly one → switched to it; none → the session is revoked (401 `noContexts`). The SPA runs that refresh right
after such a 403 (its API client, as for a 401; or a `/me` without a context) and follows it, with a message, or
replays the request when the clinic is still there (since M1.5.3, [auth](../auth/tech.md)).

## Provisioning
`TemplateCatalogSeeder` (design D5): finds the template (`IsTemplate`; missing → exception, the create fails), reads its
drugs and then its groups with their items across clinics (`IgnoreQueryFilters()` + `ClinicId == templateId`,
`AsNoTracking`, read only), and inserts **new** rows in the current (new) clinic: the drugs first (saved, so their ids
are known), then the groups with their items, each item's `DrugId` remapped to the copy of its template drug, `Order`
kept. Every `Dosing` (drug defaults and item overrides) is a **new instance**, its `TaperSteps` too (an owned value
can't be shared between two rows). The save interceptor stamps the new clinic on every row and refuses any other.
The copy is a snapshot: later template edits don't change existing clinics, and a clinic's edits never reach the
template. In memory: fine for templates of hundreds of drugs; thousands would move the copy to SQL behind a
purpose-built interface (design D5, limits).

All or nothing: the clinic, its roles, the owner's user (when new) and staff row, and the catalog copy are written in
the command's one transaction; an exception in any seeder answers 500 and leaves nothing (verified, see testing).

## Dev seed
`Infrastructure/Platform/StartupSeeder` (design D6), Development only, when no non-template clinic exists, in its own
all-or-nothing transaction:
1. **Template content** (skipped when the template already has drugs): "Moxifloxacin 0.5%" (antibiotic eye drops,
   1 drop 4 times a day for 1 week) and "Prednisolone acetate 1%" (steroid eye drops, 1 drop 4 times a day for
   4 weeks), and the group "After cataract surgery": Moxifloxacin with its default dosing, then Prednisolone with an
   **override** (a taper 4 → 3 → 2 → 1 times a day, one week each; eye `ask`; the dose comes from the drug).
2. **"Demo clinic"**: `CreateClinicCommand` through `ISender` (owner `Platform:DevOwnerPhone`, "Dev Owner"), then,
   inside `IClinicScope.Use(demoId)`, the 10,000 bulk drugs ("Drug number N") and `Platform:DevAssistantPhone` as
   "Dev Assistant" with the Assistant role (no deletes). 10,002 drugs, 1 group. The change tracker is cleared after
   it (the 10,000 drugs are not tracked through the next saves).
3. **"Second demo clinic"**: the same command (same owner), then the read-only **"Viewer"** role (`drugs.list`,
   `drugs.details`, `groups.list`, `groups.details`) and the assistant as Viewer. Its catalog is the template copy
   (2 drugs, 1 group).

The commands join the seed's transaction through savepoints (`TransactionRunner`); their post-commit actions would run
at once, before the seed commits (none: a create needs no invalidation). Dev phones are normalized first
(`ConfigPhones`: invalid → startup error naming the setting); the same phone in both settings stays the owner only; an
empty `DevAssistantPhone` skips the assistant; an empty `DevOwnerPhone` skips only the demo clinics, with a warning on
every start (a clinic needs an owner; the template is still filled when empty). Outside Development: unchanged
(template ensured, empty; super admins seeded). Logged when something was seeded: "Development data seeded in N ms"
(about 1.8–2.1 s on a fresh dev DB, mostly the 10,000 drugs).

## Frontend
Built in M1.5.4 (clinics) and M1.5.5 (the roles and staff tabs, [below](#roles-and-staff-screens-m155)). Everything under `/admin` is lazy, inside
`RequireAuth context="platform"` (any other context is sent to its own home: an owner's or a staff token never reaches
these pages, and the API refuses them anyway with 403 `forbidden`).

| Route | Page | What it does |
|---|---|---|
| `/admin` | `ClinicsPage` | Search (debounced 300 ms), status filter (all / active / disabled), paging (10/20/50); columns name, status chip, active staff, created date (hidden below `sm`); the name is a link to the clinic (keyboard, screen readers, new tab; visible focus outline; cut after 2 lines, full name in its `title`), and a click anywhere on the row opens it too; "New clinic". The subtitle counts the list as filtered (`admin.clinics.subtitle`, plural forms). `search`, `status`, `page` and `pageSize` live in the URL query (replaced, no history entries), so Back from a clinic returns to the same list; the typed search is written once typing pauses (only when it changed), and a search changed from outside (the sidebar's "Clinics", the logo, Back) replaces the typed one; the progress bar shows while a typed search waits and while the list loads; `page` is capped at 1,000,000 (an SPA limit that keeps the request within the API's `int` page; the API itself clamps a page to `int.MaxValue / pageSize`), and a page past the end moves to the last one |
| `/admin/clinics/new` | `CreateClinicPage` | One form: clinic name, owner phone (`dir="ltr"`, `type="tel"`), owner full name. Required fields checked first; `POST /admin/clinics` once (`useSingleFlight`: a double click sends one request); success → the new clinic's page (`replace`) with a toast. API field errors (`name`, `owner.phone`, `owner.fullName`) are shown on their inputs (`getFieldErrors`) and the first invalid input gets the focus (once the inputs are enabled again); errors of no field or of another field are toasted next to them (`getOtherErrors`); no field error at all → `getErrorMessage` |
| `/admin/clinics/:id` | `ClinicPage` | `PageHeader` with `BackButton` (to the list as it was left), the name (cut after 3 lines, full name in the `title`) and the status chip, then a **tab bar** from `CLINIC_TABS`; each tab is a child route that gets the clinic through the outlet context (`useTabClinic()`), inside a `PageBoundary`. An id that isn't a positive whole number without leading zeros fitting an int (`05`, `abc`, `99999999999`) or a 404 (missing, deleted, template) → "Clinic not found" with a link back; checked before the cached data, so a clinic deleted meanwhile shows it too. A load error → the header with Back, and "Couldn't load" with Retry |
| `/admin/clinics/:id` (index) | `ClinicOverview` (tab **Overview**) | Details (name, status, created date, active staff, owners: name + phone LTR); **Rename** (dialog, `PUT`; `name` errors on the input; not closable while saving; each opening starts from the current name, also when reopened during the closing animation); **Disable** (confirm saying staff lose access on their next action, the focus on Cancel; `suspend`) / **Enable** (no confirm; `activate`); **Delete** (dialog "Delete this clinic?", the name shown once: the button stays disabled until the name is typed exactly, both sides compared as typable text: NFC, invisible format characters (`\p{Cf}`) removed, white space runs as one space, trimmed; case kept; `DELETE` → the list as it was left, with a toast). Every action runs once per click burst (`useSingleFlight`). "Disabled" (chip and the Disable button) uses `#b45309` (≈ 5:1 on white, `disabledTone.ts`) instead of the theme's warning (≈ 3:1) |
| `/admin/clinics/:id/roles` | `ClinicRolesTab` (tab **Roles**, lazy) | `RoleList` with `adminRolesApi(clinicId)` ([below](#roles-and-staff-screens-m155)) |
| `/admin/clinics/:id/staff` | `ClinicStaffTab` (tab **Staff**, lazy) | `StaffList` with `adminStaffApi(clinicId)` and `adminRolesApi(clinicId)` |
| `/admin/*` | | → `/admin` |
| `/platform` | | → `/admin` (the placeholder page is gone) |

| Piece | Role |
|---|---|
| `features/admin/components/AdminLayout.tsx` | The admin frame: `AppShell` with "Platform admin" in the app bar, `ADMIN_NAV_ITEMS`, and **"Edit default catalog"** («تعديل الأدوية والمجموعات الافتراضية») below the sections: switches to the template context (`switchContext` with the session's template context, once) and opens `/drugs` (template banner shown there) |
| `components/layout/AppLayout.tsx` | In the template, for a user who also has the platform context (the super admin), the banner has **"Back to platform admin"**: switches to the platform context and opens `/admin`. The app bar names the template "Template clinic" / «العيادة النموذجية» (`useContextLabel`), not its stored English name |
| `components/layout/AppShell.tsx` | Shared frame: app bar (logo link, context label, `LanguageMenu`, `UserMenu`), sidebar in a `<nav>` landmark (permanent ≥ md, drawer below), optional banner, the page in a `PageBoundary` (spinner while its chunk loads, "Couldn't load — Reload" when it fails). `AppLayout` (clinic app) and `AdminLayout` are thin wrappers around it. An entry is active on its path (`end`: exactly) and under each `activeFor` path |
| `app/navigation.tsx` | `ADMIN_NAV_ITEMS` next to the clinic `NAV_ITEMS`: Clinics today; a new section (e.g. M2.1's Forms) is one entry here + its route |
| `features/admin/clinicTabs.tsx` | `CLINIC_TABS` (`path`, `labelKey`, `element`; `""` = the index tab), mapped to child routes in `App.tsx`: Overview, Roles, Staff (the last two `lazy`: their own chunks, loaded on first visit inside the page's `PageBoundary`). Overview is imported eagerly (one spinner, not two; it ships in the main chunk because `App.tsx` imports `CLINIC_TABS`). `useTabClinic()` is in `useTabClinic.ts` (no import cycle with the tab components) |
| `features/admin/api.ts` | `adminClinicKeys` (`all`, `lists` = `[...all, "list"]`, `list(search, status, page, pageSize)`, `detail(id)`); `useAdminClinics` (`keepPreviousData`), `useAdminClinic` (`staleTime: 0`), `useCreateClinic` / `useRenameClinic` (put the answer in the detail cache, reload the lists), `useSetClinicStatus` (updates the cached status, reloads the lists), `useDeleteClinic` (removes the cached lists, so the next list shown loads without the clinic instead of showing it first; the page drops the details with `useForgetClinic` only after leaving, so they aren't loaded again: no stray 404). Lists are reloaded with `refetchType: "all"`: also the list left for the clinic's page, so coming back never shows the old row first. A change answering 404 (deleted meanwhile) reloads the details ("not found") and the lists |
| `features/admin/listState.ts` | `ClinicsListState` (the list's query, passed as navigation state) and `useClinicsListPath()` (the Back target, kept across tabs) |
| `features/admin/components/` | `ClinicStatusChip`, `ClinicOverview`, `RenameClinicDialog`, `DeleteClinicDialog`, `disabledTone.ts` |
| `api/errors.ts` | `getFieldErrors(error)`: field → translated message of its first error (`errors.<code>`); `getOtherErrors(error, inputFields)`: the translated messages of the errors no input shows |
| Shared (`components/common`, `hooks`) | `PageHeader` (`titleText`: cut after 3 lines with a tooltip; top-aligned leading; subtitle may hold a chip), `BackButton`, `ListPagination` (also on the drugs page; the rows-per-page choice hidden below `sm`), `PageBoundary`, `useConfirm` (long titles wrap; a `destructive` confirm starts on Cancel), `useSingleFlight` (one run at a time; also the drug dialog's and the group editor's Save) |
| `features/auth` | `useContextLabel()` (platform → "Platform admin", template → "Template clinic", else the clinic name: picker, app bar, lost-context messages); the picker lists the platform first; a lost platform context is handled like a lost clinic (below) |
| `hooks/useFormatDate.ts` | Dates in the UI language with Latin digits (like the app's counts): `medium` in the list, `long` on the Overview |

- `homeOf(platform)` is `/admin`: the picker and a context switch into the platform land there. The super admin always
  has two contexts (platform + template), so the login shows the picker; the login's "return to the page" never
  returns to `/login`, `/select-clinic`, `/platform` or `/admin` (the path or anything below it, compared without case).
- **Lost platform context** (a super admin removed from `Platform:SuperAdminPhones`, effective at the next start): any
  admin call answers 403, which reloads `/me`; `/me` then has `context: null` (and `isSuperAdmin: false`), so
  `AuthProvider` re-checks the session (`recheckLostContext`, the same path as a lost clinic). The demotion revoked the
  sessions, so the refresh answers 401 → `/login` with "You no longer have access to “Platform admin”. Log in again to
  continue." (`auth.clinicLostSignedOut`, told only when the refresh itself didn't report a loss); had the refresh kept
  a session, the picker or the only clinic left would follow with the usual lost-clinic message.
- A failed page chunk (API down, or a new deployment replaced the chunk names): `PageBoundary` shows "Couldn't load
  this page. — Reload" instead of a blank app (another page tries again; the same page needs Reload: its failed import stays cached); `app/chunkReload.ts` listens to
  `vite:preloadError` and reloads the app once if the server answers (a new deployment), at most once per 30 s
  (`sessionStorage`), never without session storage.
- i18n: `admin.*` in `en.ts` and `ar.ts`; status "Disabled" / «موقوفة» (and `errors.clinicSuspended` "This clinic is
  disabled."); "Platform admin" everywhere in English; names in messages inside bidi isolates; the
  table pagination labels moved to `common.rowsPerPage` / `common.displayedRows` (the drugs page too); the placeholder's
  `auth.platformTitle`, `platformComingSoon`, `platformTemplateTip` removed. Phones always `dir="ltr"`.
- The role and staff error codes have `errors.*` texts since M1.5.3; the screens' own texts are `roles.*` and `staff.*` (M1.5.5).

### Roles and staff screens (M1.5.5)
Design D9: the components never build a URL or a cache key; an **adapter** gives them their data. The platform admin's
adapters are the only ones today; a clinic-side screen (after the MVP) passes its own and wraps the components in
`RequirePermission`. D9 holds for the **data**, not yet for the **actions**: `RoleList` / `StaffList` always show
Add, Edit and Delete, and the staff editor always lists the roles (the super admin may do everything). Gating each
action (`<Can>`, or capability flags on the adapter) comes with the clinic-side screens.

| Piece | Role |
|---|---|
| `api/dataScope.ts` | `DataScope = { scope: QueryKey; affects?: QueryKey[]; container?: QueryKey }`: where a component's data lives in the query cache, what else a change changes, and what it belongs to. `refreshScope(queryClient, s)`: after a change, the scope and everything it affects load again, in **one** `invalidateQueries` whose predicate matches any of the keys (`partialMatchKey`), so a query under two of them (one key prefixing another) loads once (`refetchType: "all"`: also lists not shown now, as for the clinics lists). `loadInScope(queryClient, s, load)`: wraps the list query functions: a 404 reloads the `container` (that key only), so a page whose clinic is gone shows "not found". `showsStaleData(error, codes?)`: 404, 409 or one of `codes` → the data shown is out of date, reload it too |
| `features/roles/types.ts` | `Role`, `SaveRole`, `RolesAdapter = DataScope & { list(), create(body), update(id, body), delete(id) }` |
| `features/staff/types.ts` | `StaffMember`, `AddStaff`, `UpdateStaff`, `StaffQuery { search, page, pageSize }`, `StaffAdapter = DataScope & { list(query), create(body), update(id, body), delete(id) }` |
| `features/admin/adapters.ts` | `adminRolesApi(clinicId)`: `/admin/clinics/{clinicId}/roles`, scope `[...adminClinicKeys.detail(id), "roles"]`, affects the staff (a rename shows in the role chips) and the clinic's details (a 404 there: the clinic is gone). `adminStaffApi(clinicId)`: `…/staff`, scope `[…detail(id), "staff"]`, affects the roles (`staffCount`), the clinic's details (active staff count, owners) and the clinics lists. Both scopes sit under the clinic's details key, so whatever reloads the clinic reloads them; both have the details as `container` (a 404 loading a list → the page shows "not found") |
| `features/admin/components/ClinicRolesTab.tsx`, `ClinicStaffTab.tsx` | Build the adapters for the page's clinic (`useTabClinic`) and mount the components. `ClinicPage` keys its `PageBoundary` by the clinic id: going to another clinic (e.g. Back between two clinics' Staff tabs) remounts the tab, so an open dialog, the search, the page and the previous rows (`keepPreviousData`) never follow to the other clinic |
| `features/access/api.ts` | `usePermissionCatalog()`: `GET /permissions` (`PermissionDefinition { key, module, resource, action, requires }`), loaded once per app run (`staleTime: Infinity`; the role editor keeps a role's keys the loaded catalog doesn't know, so a deploy adding a permission never drops it on save) |
| `features/roles/useRoles.ts` | `useRoles(adapter)` (key = the scope, `staleTime: 0`), `useSaveRole` (create when `id` is null), `useDeleteRole`; after success, or a stale-data refusal, `refreshScope` |
| `features/roles/permissionChoice.ts` | Pure rules of the picker (like `PermissionCatalog.WithRequirements`): `withRequirements(catalog, keys)` (transitive, catalog order, unknown keys dropped), `requiredBy(catalog, ticked, key)` (the ticked permissions directly requiring it; enough, the ticked set being closed), `toggle` (tick = add with requirements; untick only when nothing ticked requires it), `groupCatalog` (modules → resources, catalog order) |
| `features/roles/usePermissionLabels.ts` | Labels: `permissionModules.<module>`, `permissionResources.<resource>`, `permissions.<key>`; a key without a label shows as it is |
| `features/roles/components/RoleList.tsx` | Header (title, explanation, **New role**) and a table: name (+ **Locked** chip for the Owner) with a summary line under it (Owner: "Every permission, always…"; else "All permissions", "No permissions", or "*n* permissions: Drugs, Groups", plural forms, the resources from the catalog's `resource`; blank until the catalog is loaded), staff count (every holder, active or not), actions (edit, delete; none for the Owner). Delete of a role held by anyone is **disabled** (`aria-disabled`, still focusable; its tooltip is its description: "Held by *n* staff members. Take it away from them first.", plural forms); the API's `roleInUse` check stays. Delete: `useConfirm` (destructive, focus on Cancel), single-flight, toast with the name; `roleInUse` / `roleLocked` / `notFound` → toast (and the list reloads) |
| `features/roles/components/RoleEditorDialog.tsx` | Title "New role" / "Edit the role “…”". Name (`dir="auto"`, max 100) + `PermissionPicker`; "Selected: *n* of 11." (live region). Required name checked first. `name` errors on the input (`nameRequired`, `nameTooLong`, `nameInvalid` and `roleNameTaken`, which names no field: mapped by code), the focus back on it; anything else (`unknownPermission`, `roleLocked`…) toasted. 404 → toast, the dialog closes, the list reloads. Full screen below `sm`, only the content scrolls (`components/common/DialogForm`: the form is a flex column, so Save and Cancel stay on screen; the drug and staff dialogs use it too); not closable while saving; each opening starts from the role given. Waits for the catalog (spinner, or "Couldn't load" + Retry) |
| `features/roles/components/PermissionPicker.tsx` | One `section` per module (heading), one `fieldset` per resource (legend; a module of one resource, e.g. Prescription, shows no legend: the fieldset is named by `aria-label`), a checkbox per permission. A ticked permission's requirements are ticked and **locked**: `aria-disabled` (not `disabled`, so Tab reaches it; clicking does nothing), the tick in `text.secondary` (≈ 5.7:1), label in the normal colour, and "Needed by: Edit drugs, Delete drugs" under the label, the box's `aria-describedby` (said after its name) |
| `features/staff/useStaff.ts` | `useStaffList(adapter, query)` (`keepPreviousData`, `staleTime: 0`), `useSaveStaff` (`{id: null, body: AddStaff}` or `{id, body: UpdateStaff}`), `useRemoveStaff`; reload as for roles, also after `roleNotFound` |
| `features/staff/components/StaffList.tsx` | Header (title, "*n* staff members" with plural forms, or while searching "*n* results", the matches of the search; **Add staff member**), search (debounced 300 ms; name or phone, the API matches local, international and Arabic-Indic digits), progress bar while the typed search waits or loads, paging (local state; the page belongs to the search it was picked for, so a new search asks for its first page in its first request; a page past the end moves to the last, shown as loading meanwhile, never "no match"). Columns: name (min. 120 px, 160 from `sm`), phone (LTR), roles (chips, the Owner filled; long names wrap inside the chip, so a chip never widens the table), status (Active / Inactive), actions (edit, remove). Below `sm` the phone, below `md` the status, sit under the name; cells have less padding on phones (no horizontal scroll at 375 px). Remove: destructive confirm ("lose access on their next action; account and other clinics kept"), single-flight; `lastOwner` → toast with "Give the Owner role to another active staff member first, then try again." (8 s) |
| `features/staff/components/StaffEditorDialog.tsx` | Title "Add staff member" / "Edit “…”" (the person's name). Add: phone (`type="tel"`, LTR, hint: "For example 01001234567", an existing account is reused), full name, roles (a `fieldset` of checkboxes, the Owner role with "Every permission"). Edit: the phone shown disabled (hint: remove and add again to change it), full name ("the name in this clinic only"), **Active** switch with what it means (its `aria-describedby`), roles. A roles error sets `aria-invalid` and `aria-describedby` (the message) on the role boxes; the first one gets the focus. Save and Cancel pinned as in the role dialog (`DialogForm`). Required phone / name / at least one role checked first, then the API's: `phone` (`invalidPhone`, `staffExists` mapped by code), `fullName`, `roleIds` (`rolesRequired`, `roleNotFound`) on their inputs, the first one focused; the rest toasted (`lastOwner` with the hint above). Roles deleted meanwhile are not offered nor sent. 404 → toast, close, reload |
| `api/errors.ts` | `getFieldErrors` / `getOtherErrors` take an optional `codeFields` (`{staffExists: "phone"}`) for errors the API answers without a field; `splitFormErrors(error, inputFields, codeFields?)` → `{fields, others}` (others = the error's message when no input shows one) |

- After a **staff** change: the staff list (all pages and searches), the roles (staff counts), the clinic's Overview
  (active staff count, owners) and the clinics lists (staff count) load again, also when not shown. After a **role**
  change: the roles, the staff list (role chips) and the clinic's details. Each query once per change.
- i18n: `roles.*`, `staff.*`, `permissionModules.*` (catalog → "Drugs and groups" / «الأدوية والمجموعات», prescription →
  "Prescription" / «الروشتة», as the resource), `common.listSeparator` (", " / «، »), `admin.clinic.tabs.roles|staff`; names
  inside bidi isolates; plural forms for the staff count, the result count, the permission summary and the held-role
  Delete tooltip. The Arabic texts name the role «Owner» (its name in the data), not «مالك». Role names are clinic content (not translated:
  the default "Owner", "Doctor", "Assistant" stay in English).
- No backend change.

## Edge cases & limitations
- Delete is final in M1.5 (no endpoint clears `DeletedAt`); restoring = clearing it in the database, the clinic
  comes back with the `Status` it had. Who deleted it is not recorded (audit log, later).
- Clinic names are not unique; the details' `owners` tell clinics apart.
- Suspend/activate always invalidate, even when nothing changed (harmless; repairs a stale entry).
- Accepted (design D3): a cache load that started just before the commit may store the old row after the
  invalidation; the change then applies when the entry expires (≤ 10 min, 30 s in memory today).
- Demoting a super admin happens only at startup (`Platform:SuperAdminPhones`); their old platform access token
  then gets 403 on `/admin/*` (their sessions are revoked by the seeder); the SPA notices it on the next admin call and
  goes to `/login` with a message ([Frontend](#frontend)).
- Accepted: a double click on a button that opens a dialog (Disable, Delete) opens it and the second click lands on the
  backdrop, closing it again (nothing is sent).
- An unknown `status` filter returns an empty page, not a 400.
- Accepted (design D5): two creates with the same **new** owner phone at the same moment hit the unique phone index;
  one answers 500 and works when sent again. No lock or retry.
- An existing user made owner gets a new staff row with the owner name sent in the request (names are per clinic);
  their other clinics' staff names are untouched. Creating a clinic never touches the user's super-admin flag.
- The template is copied as it is at that moment: no "re-sync" of an existing clinic with later template edits.
- Accepted (MVP, one super admin, design D5): the copy reads the template's drugs, then its groups (two queries, read
  committed); a group saved in the template between them with a brand-new drug would make the create fail with a 500
  (rolled back; sending it again works). No lock.
- Accepted (design D7, § 11): after a super admin logs out, their platform access token still works on
  `/admin/*` until it expires (≤ 15 min): the policy checks the super-admin flag, not the session.
- Accepted (design § 6, M1.5.3): `lastOwner` and `roleInUse` read, then write, with no lock; two changes in the very same
  instant (two tabs) could both pass, e.g. leave no active owner, or delete a role just given to someone (the staff
  role cascades away). One super admin: not guarded.
- Accepted (D5): two adds (or a create and an add) of the same **new** phone at the same moment hit the unique phone
  index; one answers 500. Two creates of the same role name at the same moment hit the `(ClinicId, Name)` index: 500.
- The role name check is case-insensitive but the index is exact: two roles differing only in case can't be made through
  the API, but could exist after direct database edits (then neither can be renamed to the other's name).
- Removing or deactivating staff doesn't revoke sessions (D7): the removed person's access token keeps working ≤ 15 min
  on endpoints outside a clinic (`/me`, `/auth/contexts`, `/permissions`), which reveal nothing of the clinic.
- No GET of one role or staff member (the screens work from the lists): the `Location` of a 201 is the list's URL.
- A staff member's phone can't be changed; the super admin's own phone can be added as staff of a clinic (a normal
  staff row; the platform rights don't change).
- Accepted: a cycle in the catalog's `requires` would lock both boxes of the cycle once one is ticked. The catalog is
  defined in code and `PermissionCatalog` rejects unknown and self requirements; no cycle exists.
- After a staff change every cached staff page of the clinic (each page and search visited) loads again: a handful of
  requests at most.

## Testing notes
**M1.5.5**, verified in the built-in browser on a scratch database `drags_m155` (fresh dev seed; dropped afterwards; the
main dev DB untouched), API on `:5055` from the Release build serving the built SPA, opened as `http://m155.localhost:5055`
(the owner and the staff member on their own hosts, `owner155.` / `staff155.localhost`), English and Arabic, 1280 and
375 px (no horizontal scroll; the role and staff tables fit):
- Roles (Demo clinic): Owner first with **Locked**, no actions, "Every permission, always…"; Assistant "9 permissions:
  Drugs, Groups, Prescription". New role "Editors" with **Edit groups** → "Open a group", "See the group list" and
  "See the drug list" ticked and locked, each "Needed by: …"; a double click on Save → one `POST` (201). Renamed
  " doctor " → `roleNameTaken` on the name input; "Group editors" + **Delete drugs** (→ "Open a drug" locked) → saved,
  "6 permissions: Drugs, Groups". Delete Assistant → confirm (focus on Cancel) → `roleInUse` toast; delete Doctor
  (unused) → gone. A role deleted in the database while its editor was open → Save → "This item no longer exists.", the
  dialog closed, the list without it.
- Staff (Demo clinic): search "owner" → Dev Owner; `01000000003` → Dev Assistant; «٠١٠٠٠٠٠٠٠٠٢» → Dev Owner; "zzz" →
  "No staff members match your search." Add with nothing → the three required messages, the focus on the phone;
  `01000000003` → `staffExists` on the phone; `01000000050` "Nour Editor" with Group editors → added ("3 staff members").
  Dev Owner deactivated → `lastOwner` toast with the hint; Dev Assistant made inactive with Assistant + Group editors →
  "Inactive" and both chips; Overview "Active staff 2"; Roles: Group editors 2.
- Done-when (Arabic UI): clinic «عيادة النور» created on the create page (owner `01000000060`); role «قراءة فقط» with
  "Open a drug" + "Open a group" (→ 4 permissions); «سارة أحمد» (`01000000070`) added with it; an existing user
  (`+20 100 000 0003`, Dev Assistant) added as Assistant (user reused). The owner's login → the prescription page with
  the template's group (2 drugs). The staff member's login → `/groups` (no prescription permission), no add or edit
  buttons, `/me` permissions exactly `drugs.list, drugs.details, groups.list, groups.details`. Removing the owner →
  `lastOwner`; removing «سارة أحمد» («موظف واحد») → her next click → `/login` with "You no longer have access to
  “عيادة النور” or to any other clinic."
- Console: only the expected 4xx (refresh 401s, 409s, the removed staff member's 403); the API log only the expected
  failures (`roleNameTaken`, `roleInUse`, `staffExists`, `lastOwner`, `noContexts`).

**M1.5.4 review fixes**, verified in the built-in browser on a scratch database `drags_fix154` (dropped afterwards; the
main dev DB untouched), API on `:5055` from the Release build serving the built SPA, opened as
`http://fix154.localhost:5055` (own host, own refresh cookie), English and Arabic, 1280 and 375 px:
- One request per double click: create (one 201; a second synchronous click in the drug dialog: one `POST /drugs`),
  rename (one `PUT`), Disable confirm (one `suspend`), Enable (one `activate`), the delete dialog (one `DELETE`, one
  toast), "Edit default catalog" (one `POST /auth/context`).
- List: the name is a link (Tab reaches it with a 2 px outline, Enter opens it; rows have no `tabindex`); a long
  Arabic + Latin name cut after 2 lines with the full `title`; "28 clinics", «عيادة واحدة», "0 clinics" with "No clinics
  match your search or filter."; the bar shows while a typed search waits; `?search=clinic+2` then the sidebar's
  "Clinics" → empty search, `/admin`, no request back; `?page=99999999999` → asks page 1,000,000, lands on the last
  page; pagination fits 375 px (here and on the drugs page). `/admin/clinics/05` → "Clinic not found".
- "Disabled" chip and button `rgb(180, 83, 9)`; the Disable confirm and the drug delete confirm open with the focus on
  Cancel (Enter → nothing sent); a 157-character unbroken name: page header cut after 3 lines, the confirm dialog and
  the delete toast wrap at 375 px (no page scroll), the delete dialog shows the name once.
- Typed-name delete of `"Two  spaces\u200Bzw"`: "two spaceszw" keeps the button disabled, "Two   spaceszw " enables it.
- Create: name only → the focus on the phone (required); phone `123` → `invalidPhone` on the phone, the focus there.
- Rename reopened during the closing animation → the current name, not the cancelled text.
- Template: app bar and picker show "Template clinic" / «العيادة النموذجية»; the picker lists Platform admin first; the
  banner's "Back to platform admin" («العودة إلى إدارة المنصة», below the text at 375 px) → `/admin`.
- API stopped, then Back to the (not yet loaded) list → «تعذّر تحميل هذه الصفحة.» with «إعادة التحميل» (no reload loop);
  API started, Reload → the list.
- API restarted with `Platform__SuperAdminPhones__0` set to another phone while on a clinic page; Save in Rename → 403,
  `/me`, refresh 401 → `/login` with "You no longer have access to “Platform admin”. Log in again to continue." (one
  toast).
- Through the API: a clinic name with U+202E or U+2066…U+2069, and an owner name with U+202E → 400
  `nameInvalid` (`name`, `owner.fullName`); a name with an emoji ZWJ sequence → 201.
- Console: only the expected 4xx and the refused connections while the API was down; no error in the API logs.

**M1.5.4**, verified in the built-in browser on a **scratch database** `drags_m154` (fresh dev seed; dropped
afterwards; the main dev DB untouched), API on `:5055` from the Release build serving the built SPA, English and
Arabic, desktop (1280 px) and phone width (375 px, no horizontal scroll):
- Super admin login → picker (platform + template) → Platform administration → `/admin`; `/platform` → `/admin`;
  `/admin/whatever` → `/admin`.
- Create: empty form → the three required messages; a zero-width-space name, phone `123` and an owner name with
  U+2028 → `nameRequired`, `invalidPhone`, `nameInvalid` from the API on their inputs; 257 chars → `nameTooLong`; an
  Arabic name → the new clinic's page with the toast, the owner's phone shown LTR. 22 more clinics created through the
  API: search (`clinic 2` → 4), page 2 of 20, the disabled filter, `page=99` → the last page; Back from a clinic keeps
  the page, search and filter.
- Rename (blank → required; a padded name → trimmed), disable (confirm) → chip, list and filter updated; enable;
  delete: a wrong-case name keeps the button disabled, the exact name deletes → back to the filtered list, gone, no
  request for the deleted clinic; its URL, the template's (`/admin/clinics/1`) and `abc` → "Clinic not found". A
  clinic deleted through the API while its page was open: Disable → the error toast and "not found".
- Done-when: the new owner's login auto-enters the clinic: 2 drugs and the group "After cataract surgery" (2 drugs);
  that owner opening `/admin` → `/`.
- Lockout (the clinic changed through the API while the staff member had it open, then one click): disabled → login
  with "no access to … or any other clinic" (owner of one clinic); the assistant in Demo clinic with Demo disabled →
  moved to Second demo clinic with the message; the owner's clinic deleted → login with the message.
- "Edit default catalog" → the template's `/drugs` with its banner; Switch clinic → Platform → `/admin`.
- Console: only the expected 4xx (refresh 401s, validation 400s, 404s, lockout 403s); no exception in the API log.

**M1.5.3**, verified manually on a **scratch database** `drags_m153` (`ConnectionStrings__DefaultConnection` for
`dotnet ef database update` and the API; dropped afterwards; the main dev DB untouched), API on `:5055` from the Release
build, fresh dev seed, a Python script with the refresh cookie kept by hand (100 checks + 12 extra probes, all pass;
one wrong expectation in the script fixed), psql for the rows:
- Filter: roles/staff of the template (1) and an unknown id → 404 `notFound` (GET, POST; a malformed body on an unknown
  clinic → 404, not 400); a scratch clinic created then deleted → 404 on GET roles/staff and DELETE role; Second demo
  clinic suspended → roles and staff 200; `abc` as the id → 404. The owner's and the assistant's clinic tokens → 403
  `forbidden`, no token → 401. Second's role ids (PUT, DELETE) and staff ids (PUT, DELETE) under Demo's route → 404.
- Roles: Demo = Owner, Assistant, Doctor; the Owner's permissions = the 11 catalog keys; `staffCount` 1/1/0. Create
  `"  Editors  "` with `drugs.update` → 201, `Editors`, permissions `[drugs.list, drugs.details, drugs.update]`,
  `Location …/admin/clinics/2/roles`; `nope.x` → 400 `unknownPermission` (`permissions`, one error); `" Editors"`, `EDITORS`,
  `"editors "`, `owner` → 409 `roleNameTaken`; 101 chars → `nameTooLong`, 100 chars with `[]` → 201; no `permissions`
  → `invalidRequest`; blank name + bad key → both errors in order; an Arabic name → 201; a NUL in the name →
  `nameInvalid`. Owner PUT / DELETE → 409 `roleLocked`; DELETE Assistant → 409 `roleInUse`; Doctor renamed `doctor`
  (self) with `groups.update` → 200 `[drugs.list, groups.list, groups.details, groups.update]`, renamed to `Editors` →
  409, restored (11 rows); unknown role → 404; DELETE Editors → 204, again → 404.
- Lockout (cache warmed by a request first, then the change, then the next request, no waiting): Assistant role without
  `drugs.create` → the assistant's next `POST /drugs` → 403 `forbidden`, restored → 201; assistant deactivated → next
  `GET /drugs` → 403 `noAccess`, reactivated → 200 with the same token; removed → `noAccess` and Demo leaves their
  `/auth/contexts`; re-added with the local `01000000003` and the Assistant id twice → 201 (`+201000000003`, one role);
  the old token → `noAccess` (old staff id); after a refresh (context Demo again) → 200.
- Staff: new phone `01000000031` → 201, user created; the same phone in Second → 201, same `userId`; the deleted scratch
  clinic's owner phone → 201 (user reused); `+201000000003` again → 409 `staffExists`, also while that staff is inactive;
  `roleIds: []` and missing → `rolesRequired` (`roleIds`); a Second role id → 400 `roleNotFound` (`roleIds`; also on
  update); phone `123` + blank name + `[]` → `invalidPhone`, `nameRequired`, `rolesRequired` in order; 257-char name →
  `nameTooLong`; update without `isActive` → `invalidRequest`; a non-number in `roleIds` → `invalidRequest`; unknown
  staff → 404. Search: `01000000031` → New Person; `+2010000000` and `0100000000` → Dev Assistant + Dev Owner;
  `00201000000003`, `1000000003`, `(010) 0000-0003` → Dev Assistant; `DEV` → both devs; `dev%00` → both;
  `pageSize=2&page=2` → 2 of 4; `pageSize=1000` → 100; ordered by name.
- `lastOwner`: Dev Owner (only owner) deactivated / given Doctor instead of Owner / removed → 409; Owner + Doctor → 200
  (roles Owner first); a second owner who is **inactive** doesn't count (remove → 409); with two active owners,
  deactivating one → 200 and removing one → 204. Afterwards: role counts Owner 1, Assistant 1, Doctor 0; Demo's details
  owners = Dev Owner, `staffCount` 2; Dev Owner's `/drugs` 200.
- Done-when chain: `POST /admin/clinics` "Chain clinic" (owner `01000000040`) → 201; that owner's login auto-enters it,
  `/drugs` total 2 and `/drug-groups` 1 (the template copy); its roles Owner, Assistant, Doctor.
- psql: RolePermissions per role = Owner 0, Doctor 11, Assistant 9, Viewer 4 in every clinic after the restores; staff
  roles as expected; no exception in the API log.

**M1.5.2**, verified manually on a **scratch database** `drags_m152` (`ConnectionStrings__DefaultConnection` set for
`dotnet ef database update` and the API; the main dev DB untouched), API on `:5055` from the Release build, a Python
script with the refresh cookie kept by hand (37 checks + 3 rollback checks, all pass), psql for the rows:
- Fresh seed (1.8 s): template 2 drugs + 1 group (line 2: eye `ask` + 4 taper steps); Demo clinic 10,002 drugs,
  1 group, roles Owner/Doctor/Assistant, Dev Owner (Owner) + Dev Assistant (Assistant); Second demo clinic 2 drugs,
  1 group, roles + Viewer, Dev Owner + Dev Assistant (Viewer). Each copied group's items point to its own clinic's
  drug ids; the override survived; the template rows unchanged. Restart: nothing duplicated.
- `POST /admin/clinics` (super admin, platform) `{ "  Smoke clinic  ", owner 01000000009, " Smoke Owner " }` → 201,
  `Location …/admin/clinics/4`, name trimmed, `active`, `staffCount` 1, owner `+201000000009`; GET and the list match.
  That owner's login auto-enters it (Owner, 11 permissions): 2 drugs, 1 group whose items are the new drug ids, the
  override intact.
- Existing phone `+201000000003` → 201, no new user row, owner = that user; at their next login they have 3 contexts
  and enter the new clinic as Owner.
- 400: `"   "` → `nameRequired` (`name`), 257 chars → `nameTooLong`; owner name blank / 257 → `nameRequired` /
  `nameTooLong` (`owner.fullName`); phone `123` or null → `invalidPhone` (`owner.phone`); no owner →
  `invalidRequest` (`owner`); all three errors at once, in order. Nothing written.
- The owner's clinic token, a staff token, the super admin's template token → 403 `forbidden`; no token → 401.
- All or nothing: a temporary trigger on the scratch DB failing the **last** seeder's insert (`DrugGroups`) for one
  clinic name → 500; clinics, users, staff, roles, drugs and groups counts unchanged (no clinic, no new user).
- A template drug renamed through the template context → the new clinic's copy unchanged (then restored).
- Dev seed edge cases on fresh scratch DBs: with `DevAssistantPhone` = the owner's phone → both clinics, owner only;
  `DevAssistantPhone = "12"` → startup error `Platform:DevAssistantPhone: '12' is not a valid phone number.`
- Review fixes (scratch DB `drags_fix152`): fresh seed as above (1.4 s), restart → nothing seeded or logged.
  `POST /admin/clinics` with a new phone → 201, that owner sees the template copy. Names (`ValidName()`):
  `"Bad\u0000name"` → 400 `nameInvalid` (`name`; also `owner.fullName`, rename, a drug, a group), `"\u200B"` and
  `"\u200B \u2060\uFEFF"` → `nameRequired`, `"  \t "` → `nameRequired` only, an inner line break → `nameInvalid`, a
  trailing one trimmed → 201, an Arabic clinic and owner name → 201, a drug name with an inner ZWNJ → 201. Browser
  (Arabic): the "added from «group»" snackbar keeps the quotes around the English name and the count after them; the
  drugs table and the groups pagination buttons have Arabic labels. The main dev DB `drags` unchanged (row counts and
  latest timestamps compared before and after).
- Fix round 2 (scratch DB `drags_fix2_152`): empty `DevOwnerPhone` on a fresh DB → the template gets its 2 drugs and
  1 group, no demo clinic, one warning, "seeded in" logged; restarted the same way → no second fill, the warning, no
  "seeded in"; then started with the phone → both demo clinics from the template (10,002 drugs / 1 group; 2 / 1 and
  the Viewer role), 1.4 s. A drug description `"x\u0000y"` → 400 `invalidText` (`description`; also on update), one
  with a line break and a tab → 201 / 200 (kept as is); a custom `frequencyText` with a NUL → 400 `invalidDosing`
  (a drug and a group line); `?search=%00` (and `x%00y`, `demo%00`) on `/drugs`, `/drug-groups`, `/admin/clinics`
  → 200 (the NUL removed: `%00` alone lists everything); a name with an inner U+2028 or U+2029 → 400 `nameInvalid`
  (a drug, a group, a clinic), a trailing one is trimmed → 201.

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
