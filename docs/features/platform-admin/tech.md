# Platform admin: technical

## Summary
M1.5 of the [multi-clinic platform](../../design/platform-hld.md), built in five sub-steps from the approved
[M1.5 design](../../design/m1.5-platform-admin.md). **Built so far: M1.5.1–M1.5.2** (backend only). M1.5.1: the
admin foundations and the clinic lifecycle API: the super admin, in the **platform** context, can list, search,
filter, open, rename, suspend, re-activate and (soft) delete clinics through `/api/v1/admin/clinics`, on the
`PlatformAdmin` policy (D1), `IClinicScope` (D2), post-commit cache invalidation (D3) and the `Clinics.DeletedAt` soft
delete with its explicit checks (D4). M1.5.2: **create clinic** (`POST /api/v1/admin/clinics`), provisioned from the
template by `IClinicProvisioner` and its ordered `IClinicSeeder`s (D5); `IUserAccounts`, the one way to find or create a
user by phone; the dev seed creates its clinics through the same command and gives the template sample content (D6).
Not built yet: roles and staff (M1.5.3), the admin screens (M1.5.4–5).

## Data model
Migration **`AddClinicDeletedAt`** (M1.5.1, on top of `AddRoles`; adds one nullable column, no data step needed).
M1.5.2 adds no migration (provisioning writes existing tables).

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
| `IUserAccounts` / `UserAccounts` | Application (`Features/Identity/Users`), scoped | `GetOrCreateAsync(phone)` (phone already normalized): finds the user, or adds and saves one. Replaces `IIdentitySeeder.EnsureUserAsync`; also used by the super-admin seeding and the dev seed; M1.5.3's "add staff" will use it |

**No invalidation after a create** (decided in M1.5.2): every cached access entry is keyed by a staff, role or clinic
id (`access:staff:{staffId}:{userId}:{clinicId}`, `access:role:{roleId}:{clinicId}`, `access:clinic:{clinicId}`), and
all of those are new (PostgreSQL identities are never reused, even after a rolled-back create), so nothing cached can
be stale. For an **existing** user who becomes the owner, nothing user-level changes (`access:user:{id}` only holds
`IsSuperAdmin`), and their clinics are not cached: login, refresh, switch and `/auth/contexts` read them from the
database (`MembershipService`), so the new clinic shows up at their next refresh or login.

Cross-clinic reads (`IgnoreQueryFilters()`) are allowed only in Platform code. Admin requests have **no current
clinic** (platform token), so clinic-owned queries in these use cases must bypass the filter explicitly, read
only. `Clinic` is not clinic-owned, so saving it needs no clinic context.

Lockout is on the **next request** (design D7, no session revocation): suspend/activate/delete clear the clinic's
access cache entries after the commit, so the staff's next clinic request answers 403 `clinicSuspended`
(suspended) or `noAccess` (deleted); a deleted clinic also leaves `/auth/contexts`. The next refresh of a session
in it (`RefreshSessionCommandHandler`): two or more contexts left → the context is cleared (the user picks one);
exactly one → switched to it; none → the session is revoked (401 `unauthorized`).

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

## Testing notes
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
