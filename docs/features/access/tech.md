# Access (roles and permissions): technical

## Summary
M1.3 (Access) of the [multi-clinic platform](../../design/platform-hld.md). Every catalog action
is checked against the caller's permissions, on the API and in the SPA. Roles belong to one clinic;
a staff member can have several and gets the union of their permissions. The **Owner** role has every
permission implicitly. Permissions are fixed in code (one per action) and are **never in the access
token**: the API reads them per request from a cache (HybridCache), and the SPA reads them from `/me`.
The same per-request check makes sure the staff member and the clinic are still active, which closes
M1.2's "token valid ≤ 15 min after deactivation/suspension" gap (bounded now by the cache, see below).
Roles come only from seeding in this step; managing them is M1.5.

## How to…

**Gate a new endpoint**: put `[HasPermission(Permissions.X.Y)]` on the action (it implies the
clinic-context policy; several attributes = all required). Checks inside use cases come with the
`AuthorizationBehavior` (architecture § 7, option B); until then a handler can read
`IPermissionService.GetAsync()` and return `CommonErrors.Forbidden`.

**Add a permission**: one constant in the `Permissions` class (`Application/Features/Access/Permissions.cs`,
resource classes grouped by module under a `// --- <module> ---` divider), with `[Requires(...)]` for the permissions it needs. A new
resource is a nested class with `[PermissionModule("<module>")]` named after the resource (`Drugs` holds
only `drugs.*`): the catalog refuses to start otherwise. Then the same key in `ClinicHub.Web/src/features/access/permissions.ts`, and its label
under `permissions.<resource>.<action>` in `en.ts` and `ar.ts`. Decide whether the default roles get it
(`DefaultRoles`: Doctor gets everything, Assistant everything except the deletes). A new resource also
needs `permissionResources.<resource>`.

**Gate a button**: change its name: `Button` → `PermissionButton` (also `PermissionIconButton`,
`PermissionMenuItem`, `PermissionFab`) and add `permission` / `anyOf` / `allOf`; `whenDenied="disable"`
shows it disabled with a "You don't have permission" tooltip (default: hidden). Any other component:
`withPermission(Component)`; anything else (links, sections): `<Can permission=… fallback?>`; logic:
`const {can} = usePermissions()`.

**Gate a page**: give its entry in `CLINIC_ROUTES` (`app/App.tsx`) a `permission` (or `anyOf`/`allOf`),
and its `NAV_ITEMS` entry (`app/navigation.tsx`) the permission that opens it. Pass
`{enabled: can(…)}` to query hooks for data the page may not be allowed to load.

## Data model
Migration **`AddRoles`** (on top of `Initial`; adds tables only). Existing staff get **no** roles from
it (so no permissions): fine while dev DBs are reset, but before the first deployment with real data a
data step must give each clinic its default roles and each existing staff member the Owner role.

**Roles** (`ClinicHub.Domain/Access/Role.cs`, `IClinicOwned`)

| Column | Type | Rules |
|---|---|---|
| Id | int PK | |
| ClinicId | int | FK → Clinics, restrict; clinic query filter |
| Name | varchar(100) | required; **unique `(ClinicId, Name)`** |
| IsOwner | boolean | every permission, no `RolePermissions` rows; **one per clinic** (partial unique `IX_Roles_ClinicId_Owner` `(ClinicId) WHERE "IsOwner"`) |
| CreatedAt, UpdatedAt | timestamptz | |
| | | unique `(Id, ClinicId)` (target of the staff-role FK) |

**RolePermissions** (`RolePermission`): `RoleId` (FK → Roles, cascade) + `Permission` varchar(100);
PK `(RoleId, Permission)`. No `DbSet` (neither on `AppDbContext` nor on `IAppDbContext`) and no clinic
column: it is only reached through its (filtered) role. Keys no longer in the catalog are ignored when
reading.

**StaffRoles** (`StaffRole`, `IClinicOwned`): `StaffId`, `RoleId`, `ClinicId`; PK `(StaffId, RoleId)`.
Composite FKs `(StaffId, ClinicId)` → `Staff(Id, ClinicId)` and `(RoleId, ClinicId)` → `Roles(Id, ClinicId)`
(both cascade), so the database rejects a role of another clinic (same pattern as `DrugGroupItems`).
Like every clinic-owned table it also has the FK `ClinicId` → `Clinics` (restrict) and its index.
`Staff` gets the unique `(Id, ClinicId)` they target.

The join tables have no timestamps (only `Roles` does).

`ClinicAndTimestampsInterceptor` now also treats an EF **temporary** `ClinicId` on a new row as unset
(a new staff row and its new staff role share the key value through the composite FK), and sets it
through the change tracker so it propagates.

## API

| Method | Route | Auth | Response |
|---|---|---|---|
| GET | `/permissions` | any access token | `[{ key, module, resource, action, requires[] }]` (catalog order; `module` since M1.4, for the role editor's sections; labels are translated in the SPA) |
| GET | `/me` | access token | `permissions`: the expanded keys in a clinic context (Owner/template = all keys), `[]` on the platform or without a context |

`Context.roles` (login, refresh, switch, `/auth/contexts`) now lists the user's role names in each
clinic (Owner first, then by name; `[]` in the template clinic).

Catalog permissions (HLD 8.2):

| Endpoint | Permission |
|---|---|
| `GET /drugs` | `drugs.list` |
| `GET /drugs/{id}`, `GET /drugs/{id}/groups` | `drugs.details` |
| `POST /drugs` / `PUT /drugs/{id}` / `DELETE /drugs/{id}` | `drugs.create` / `drugs.update` / `drugs.delete` |
| `GET /drug-groups` | `groups.list` |
| `GET /drug-groups/{id}` | `groups.details` |
| `POST /drug-groups` / `PUT /drug-groups/{id}` / `DELETE /drug-groups/{id}` | `groups.create` / `groups.update` / `groups.delete` |

403 codes on every clinic request: `forbidden` (missing permission, or not a clinic token),
`noAccess` (staff row gone or inactive, or a staff-less token that is not the super admin's template
context), `clinicSuspended`. When several apply the most specific wins (`clinicSuspended` > `noAccess` > `forbidden`).

## Backend

Rules and use cases in `ClinicHub.Application/Features/Access`: `Permissions.cs` and `AccessErrors` at the root,
then `Authorization/` (catalog, permission set and service, cache interface, `Queries/GetPermissions`), `Roles/`
(`DefaultRoles`) and `StaffMembers/` (memberships). The cache is in `ClinicHub.Infrastructure/Access`, the
endpoint checks in `ClinicHub.Api/Features/Access`.

| Piece | Layer | Role |
|---|---|---|
| `Permissions` | Application | `public static class` in `Features/Access/Permissions.cs`, every resource class grouped by module (catalog: `Drugs`, `Groups`; prescription: `Prescriptions`). Nested constants (`Permissions.Drugs.Create = "drugs.create"`); `[Requires(...)]` on a constant lists what it needs; `[PermissionModule("catalog")]` on every resource class. The single source of truth |
| `PermissionCatalog` | Application | `All` (`PermissionDefinition(Key, Module, Resource, Action, Requires)`), built once by reflection from `Permissions` in declaration order and validated (format `resource.action`, unique, requirements known, every resource class has a module, every key's prefix matches its class). Built in `AddApplication`, so a bad declaration stops the app at startup. `IsKnown`, `Keys`, `ByResource()`, `WithRequirements(keys)` (transitive closure, for M1.5's role editor) |
| `DefaultRoles` | Application | Templates Owner (`IsOwner`), Doctor (all), Assistant (all but `drugs.delete`, `groups.delete`); `SeedAsync(db, clinicContext, clinicId)` creates and saves them in a clinic (the clinic context must be that clinic) and returns them by name. Independent of the dev seed, for M1.5 provisioning |
| `IAccessCache` / `AccessCache` | Application / Infrastructure | Singleton. The only code that knows cache keys, tags and the library (below) |
| `IPermissionService` / `PermissionService` | Application | Scoped, computed once per request. `CheckClinicAccessAsync()` (null or the `Error`: `AccessErrors.NoAccess`, `AccessErrors.ClinicSuspended`, `CommonErrors.Forbidden`), `GetAsync()` → `PermissionSet` |
| `PermissionSet` | Application | `Has`, `HasAll`, `HasAny`, `IsAll`, `Keys` (expanded), `ToList()` (catalog order). `Of(keys)` adds the requirements (`WithRequirements`): a role with `drugs.update` but not `drugs.details` still gets both, so the UI never offers an action whose data it can't load |
| `IMembershipService` / `MembershipService` | Application | Scoped. A user's memberships across clinics (used by Identity; see [login](../auth/tech.md#backend)) |
| `GetPermissionsQuery` | Application | `GET /api/v1/permissions` (`PermissionsController` in the Api) |
| `HasPermissionAttribute` | Api | `AuthorizeAttribute` + `IAuthorizationRequirementData` (.NET 8+, no policy provider): sets `Policy = ClinicContext` and adds a `PermissionRequirement`. Unknown keys throw when the endpoints are built (first request) |
| `PermissionHandler` | Api | Succeeds when `IPermissionService.GetAsync()` has the key; else fails with an `AccessFailureReason(CommonErrors.Forbidden)` |
| `ClinicAccessRequirement` + `ClinicAccessHandler` | Api | Part of the `ClinicContext` policy (`IdentitySetup`), so **every** clinic request checks that staff and clinic are active, permission-gated or not; fails with an `AccessFailureReason` carrying `CheckClinicAccessAsync()`'s `Error` |
| `AccessAuthorizationResultHandler` | Api | `IAuthorizationMiddlewareResultHandler` (`AccessDenied.cs`): a denied request answers 403 ProblemDetails (`ApiProblemFactory`) with the most specific `Error` of its `AccessFailureReason`s; otherwise the default (JwtBearer's 403 `forbidden`, or 401 `unauthorized`) |
| `AccessSetup.AddAccessModule()` | Api | DI for the authorization handlers and the result handler (the services are registered by `AddApplication`, the cache by `AddInfrastructure`) |

`PermissionService` rules, from the token's `clinic_id`, `staff_id` and `sub`:
- not a clinic token → no permissions (`forbidden`);
- no `staff_id` → the super admin's template context: allowed with **all** permissions only if the
  cached user is a super admin and the cached clinic is the template, else `noAccess`;
- (template context: a suspended template → `clinicSuspended`)
- staff entry missing (or its user/clinic don't match the token) → `noAccess`; clinic not active →
  `clinicSuspended` (checked before the active flag: the more specific reason); staff inactive →
  `noAccess`; any Owner role → all; else the union of each role's cached permissions (read in
  parallel), merged in memory.

`GetMeQuery` (`/me`) returns `PermissionSet.ToList()` in a clinic context. Controllers keep
`[Authorize(Policy = AuthPolicies.ClinicContext)]` at class level, so an action added without
`[HasPermission]` is still clinic- and active-checked (but not permission-checked).

### Cache (`AccessCache`)

.NET 9 `HybridCache` (`Microsoft.Extensions.Caching.Hybrid` 9.10.0), registered in `AddInfrastructure`:
in memory now; for several servers, register a distributed cache (e.g. `AddStackExchangeRedisCache`)
and HybridCache uses it as its second level with no code change. Every read is `GetOrCreateAsync`:
a miss runs **one** query (concurrent misses of a key share it, no stampede), in its **own DI scope
and `AppDbContext`** (`IServiceScopeFactory`): the requests waiting on a shared load must not depend on
the first caller's request (and its disposed context) staying alive. Reads bypass the clinic query
filter on purpose (read only, by id), like `MembershipService`. Cached records are sealed and
`[ImmutableObject(true)]`, so the in-memory copy is reused without serialization.

| Method | Key | Tags | Value |
|---|---|---|---|
| `GetStaffAsync(staffId, userId, clinicId)` | `access:staff:{staffId}:{userId}:{clinicId}` | `staff:{staffId}`, `user:{userId}`, `clinic:{clinicId}` | `StaffAccess { StaffId, UserId, ClinicId, FullName, IsActive, ClinicStatus, IsOwner, RoleIds }` or null |
| `GetRolePermissionsAsync(roleId, clinicId)` | `access:role:{roleId}:{clinicId}` | `role:{roleId}`, `clinic:{clinicId}` | `RoleAccess { RoleId, ClinicId, Permissions }` or null |
| `GetUserAsync(userId)` | `access:user:{userId}` | `user:{userId}` | `UserAccess { UserId, IsSuperAdmin }` (template context only) |
| `GetClinicAsync(clinicId)` | `access:clinic:{clinicId}` | `clinic:{clinicId}` | `ClinicAccess { ClinicId, Status, IsTemplate }` (template context only) |

The user and clinic ids passed with a staff/role id come from the token. They are the entry's tags
(HybridCache takes tags before the value is loaded) **and part of its key** (a deviation from the HLD's
`access:staff:{staffId}`): a token with mismatching ids (only possible with the signing key) gets its
own null entry and can't attach wrong tags to the real one, which a later `InvalidateUser/Clinic`
would then miss.
`GetUserAsync`/`GetClinicAsync` were added beyond the HLD so the template context is verified too.

Lifetimes: `Expiration` **10 min** (safety net if an invalidation is missed), `LocalCacheExpiration`
**30 s** (staleness bound between servers). With the in-memory cache only, the local copy *is* the
cache, so an entry is reloaded at most every **30 s**: a change made directly in the database (psql)
is seen within 30 s even without an invalidation.

**Invalidation** (each one `RemoveByTagAsync`). M1.5 must call these on every change:

| Change | Invalidate |
|---|---|
| staff roles or active flag | `InvalidateStaffAsync(staffId)` |
| role permissions | `InvalidateRoleAsync(roleId)` (a rename needs nothing: role names aren't cached) |
| role deleted | `InvalidateRoleAsync(roleId)` + `InvalidateClinicAsync(clinicId)` |
| clinic status | `InvalidateClinicAsync(clinicId)` |
| user-level change (e.g. super-admin flag; `IdentitySeeder` does it for every user whose flag changes) | `InvalidateUserAsync(userId)` |
| token issued (login, refresh, switch) | staff — and the user (see below); **not** the roles: role permission edits rely on `InvalidateRoleAsync` |

`SessionService.IssueAsync` (behind `ISessionService`) calls `InvalidateStaffAsync` for the issued staff **and**
`InvalidateUserAsync` for the user: a refresh can move a user out of a clinic they lost into another
one, and their still-valid older token points at the lost clinic's staff entry, which must be dropped too.

## Frontend (`src/features/access`)

| Piece | Use |
|---|---|
| `permissions.ts` | `PERMISSIONS.drugs.create`… (mirrors the backend `Permissions` class; keep in sync), `Permission` union type, `PermissionRule` (`permission` / `anyOf` / `allOf`, all must hold) |
| `usePermissions()` | `{ can, canAll, canAny, allows(rule), ready, failed, retry }` from `useAuth().me` (a `Set`); re-renders on a context switch (`/me` is cached per context). `ready` = `/me` answered; `failed` = it failed (network/5xx) |
| `components/Can.tsx` | `<Can permission… fallback?>` renders children only when allowed |
| `withPermission.tsx` | `withPermission(Component)` adds the rule props + `whenDenied: "hide" \| "disable"` (default hide); disabled controls get the `access.noPermissionTooltip` tooltip on a wrapping `span` (a disabled button has no mouse events), which also takes the ref, so an outer `Tooltip` anchors on it (its own title is then replaced by "no permission") |
| `components/PermissionControls.tsx` | `PermissionButton`, `PermissionIconButton`, `PermissionMenuItem`, `PermissionFab` (MUI). They take no `component` prop: gate link-buttons with `<Can>` |
| `components/RequirePermission.tsx` | Route guard: spinner until `ready`, then the page, its `fallback`, or `NoPermissionPage` ("No permission" + a link to `/`); if `/me` failed, `PermissionsLoadError` (load failed + Retry) instead of a false "no permission" |

- `useAuth()` exposes `meReady`, `meFailed`, `meRetrying`, `retryMe` (Retry shows progress); `Me.permissions` is the expanded key list.
- Routes: `CLINIC_ROUTES` in `app/App.tsx` (`path`, `page`, permission rule, optional `denied`), each
  wrapped in `RequirePermission`. `/` (prescription) uses `denied: <FirstAllowedPage/>`
  (`app/FirstAllowedPage.tsx`): the first `NAV_ITEMS` page the user may open, or the no-permission page.
- `NAV_ITEMS` moved to `app/navigation.tsx` with a `permission`; the sidebar hides the rest.
- Query hooks take `{enabled}` (`QueryOptions` in `api/types.ts`): `useDrugs`, `useDrugPicker`,
  `useDrugGroups`, `useDrugGroupPicker`, `useDrugGroup`; `DrugPicker` / `GroupPicker` take `enabled`.
- `AppProviders`: a 403 from a query toasts the translated reason (`errors.forbidden`…, one toast id),
  and any 403 (query or mutation) reloads `/me` (`authKeys.allMe`), so stale permissions catch up.
  Queries retry once and only on network/5xx errors (a 4xx answers the same again).
- Pages:
  - Drugs: Add (`drugs.create`), edit icon (`drugs.update`), delete icon (`drugs.delete`); the Actions
    column is hidden when neither applies. A row opens the editor with `drugs.update`, else a read-only
    **Drug details** dialog with `drugs.details`, else nothing (rows that open are focusable: Enter/Space). The "used in groups" lookup before
    deleting needs `drugs.details`.
  - Groups: New group (`groups.create`) and edit icon (`groups.update`) are links gated with `<Can>`;
    card opens the group (`groups.details`); delete icon (`groups.delete`); the actions bar is hidden
    when neither applies.
  - Group editor: without `groups.create`/`groups.update` it is **read only** (title "Group", name
    read-only, `DosingLineList readOnly`, no picker, no Cancel/Save). Delete: `groups.delete`, shown
    disabled with the tooltip to editors who lack it. The drug picker also needs `drugs.list`. Save,
    Cancel and Back go to `/groups`, or to `/` without `groups.list`.
  - Prescription: `CatalogPanel` shows the Groups tab with `groups.list` and the Drugs tab with
    `drugs.list` (each picker `enabled` only then; the visible one gets the focus); neither → a short message.
- i18n: `access.*` (no-permission page, tooltip, `nothingToPick`), `permissions.<resource>.<action>`
  and `permissionResources.*` (for M1.5's role editor), `drugs.details`, `groups.view`.

## Dev seed
`StartupSeeder` (Infrastructure; Development, empty DB): both demo clinics get the default roles via
`DefaultRoles.SeedAsync`; "Dev Owner" (`Platform:DevOwnerPhone`) has Owner in both. New
`Platform:DevAssistantPhone` (`+201000000003` in `appsettings.Development.json`): staff
"Dev Assistant" with **Assistant** in "Demo clinic" (no deletes) and a custom **Viewer** role in
"Second demo clinic" (`drugs.list`, `drugs.details`, `groups.list`, `groups.details`: read only, no
prescription page).

## Edge cases & limitations
- Cache staleness: with no invalidation (direct DB edits, until M1.5 adds the admin endpoints),
  a change applies within 30 s (in-memory cache), at the latest 10 min with a distributed cache.
  The user's next token refresh applies staff changes (roles given or taken, active flag) and clinic
  status at once, but **not** edits to a role's permissions (those need `InvalidateRoleAsync`).
- The SPA's `/me` is cached 5 min per context: permission changes show in the UI after that, after a
  reload/switch, or right after the first 403.
- Owner roles have no rows, so `RolePermissions` can't express "Owner minus X" (by design: Owner is locked).
- `[Requires]` is applied when reading (above), not stored. **M1.5's role editor must save the
  closure** (`PermissionCatalog.WithRequirements`) so `RolePermissions` stays truthful, and can warn about
  what it added.
- `RolePermission` has no clinic filter of its own; never add a `DbSet` for it or query it directly.
- `PermissionCatalog` order is reflection order (declaration order in practice).
- Platform context: `/me` permissions are `[]` (platform permissions come with M1.5's admin area).
- A 403 from a page query shows both the toast and the page's own error state (accepted: the toast
  says why).
- The disabled Delete in the group editor is not keyboard-focusable, so its tooltip is mouse/touch only.
- The sidebar is empty for a moment after a context switch, while `/me` loads.
- (Older than M1.3) `/groups/999` shows "This item no longer exists" with a Retry that can't help,
  and deleting from the group editor refetches the deleted group once (a 404 in the console).

## Testing notes
Verified manually (no automated tests before M1.6), API in Development on a reset DB (`docker compose
down -v`, `docker compose up -d`, `dotnet ef database update`: `Initial` + `AddRoles`; also reverted
to `Initial` and re-applied):
- Seed: 3 roles per demo clinic (+ Viewer in the second), Owner with 0 permission rows, Doctor 11,
  Assistant 9; staff roles in the right clinics.
- Owner (Demo clinic): `/me` = 11 keys, context roles `["Owner"]`; list, details, groups, create all 2xx.
- Assistant (Demo clinic): 9 keys; `DELETE /drugs/2` → 403 `forbidden`; `PUT` → 200.
- Viewer (Second demo clinic): 4 keys; GETs 200; POST/PUT/DELETE on drugs and groups → 403 `forbidden`.
- Super admin: template context `/me` = 11 keys, no staff, create + delete a drug; platform token →
  `/drugs` 403 `forbidden`, `/me` `[]`; `/permissions` 200 with any token, 401 without.
- Cache: 5 requests after login → 1 staff query + 1 role query in the EF SQL log; 5 more → none.
  After the review fixes: 20 parallel requests right after login → all 200, 1 staff load.
- Inactive staff in a suspended clinic → `clinicSuspended`; reactivating the clinic → `noAccess`.
- Review cycle 2 (three agents: adversarial API probe with forged tokens, UI QA in the browser for
  every role incl. Arabic and 375 px, docs vs code): no bypass with issued tokens; forged tokens with
  mismatching ids → 401/403. Fixed: keyboard access to drug details, Retry progress, the editor's exit
  for a role without `groups.list`, cache keys now
  include the token's ids (a forged token could mis-tag an entry), suspended template → `clinicSuspended`,
  `drugs.delete` now requires `drugs.details` (the delete warning lists the groups), and doc fixes.
- Review cycle 1 (two review agents, backend + frontend): fixed a shared-load bug (a cache miss ran on
  the first caller's `DbContext`; aborting that request made the waiting ones 500), null caching for
  mismatching ids, the code priority, a false "no permission" when `/me` fails, the disabled-control
  ref, the groups Edit link, focus in the catalog, the empty Actions column, and a dev seed crash
  when both dev phones are equal.
- Deactivating the staff row in psql: same token still 200 (cached); after a refresh (which moved the
  session to the other clinic) the old token → 403 `noAccess`. Suspending the clinic: after a refresh →
  403 `clinicSuspended`. Without any refresh, the deactivation applied after ~35 s (30 s local expiry).
- Browser (Vite + this API): Viewer: `/` redirects to `/groups`, nav without Prescription, no
  New/Edit/Delete, group opens read-only, `/groups/new` → "No permission", a drug row opens "Drug
  details". Assistant (Arabic, RTL): prescription page, Add + Edit but no Delete on drugs, group editor
  Delete disabled with the Arabic tooltip. Removing `groups.list` from the Assistant role in psql: the
  next groups request → 403 → Arabic "forbidden" toast, `/me` reloaded, Groups gone from the nav and the
  no-permission page shown. No console errors.
- M1.4 part 3 (Access moved to Application/Infrastructure): the 403s (`forbidden` for a missing
  permission or a no-context token, `noAccess`, `clinicSuspended`, the Assistant's delete, the Viewer's
  create) answer exactly as before (contract diff in [login testing notes](../auth/tech.md#testing-notes));
  `/permissions` gains `module` (`catalog` ×10, `prescription` ×1), same keys and order.
