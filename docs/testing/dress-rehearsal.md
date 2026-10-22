# Dress rehearsal

Status: **defined** (M1.6.1, 2026-10-15); run at the end of M3.2, before the client's acceptance test. Defined by
[M1.6 design D8](../design/m1.6-test-foundation.md#d8-dress-rehearsal-defined-now-run-at-the-end-of-m32).

## Purpose

The MVP ends with **one** full, free acceptance test by the client; if it fails, the client won't trust us again. The
dress rehearsal is that test, run by us first on a production-like system: everything the client could try, by hand,
in the real deployment, so nothing reaches the client that the automated tests could not see (Word and Notepad
pastes, a real phone, HTTPS, the real server and database, realistic data, free use).

It comes **after** `./test.ps1 -Tier full` and `./test.ps1 -Tier release` are green on the release candidate
([D4](../design/m1.6-test-foundation.md#d4-tiers-and-the-runner)): it doesn't replace the automated tests, it checks what
they can't and the system as the client will meet it.

## Environment

| Item | Setting |
|---|---|
| Build | The release candidate, built and deployed with the production scripts (`deploy.ps1`, `DEPLOY.md`) |
| Configuration | `ASPNETCORE_ENVIRONMENT=Production`; production secrets (signing key, OTP hash key) from the environment; the **intended** OTP limits (5 attempts, 60 s, 5 per hour: the relaxed values in `appsettings.json` are restored in M3.2); OTP by SMS if built by then, else Display mode (its banner on the login page) |
| Server | The target server size and OS, IIS as in `DEPLOY.md`, the production PostgreSQL version and its default collation |
| Network | **HTTPS** with a real certificate on the real host name (the refresh cookie is `Secure`); also one pass over plain `http://` on the clinic LAN if the clinic will use it (copy fallback, login not kept on reload) |
| Database | Fresh: created and migrated with the production procedure (`dotnet ef database update` / the deploy script), no dev seed |
| Data | Realistic, entered through the app or the API (never raw SQL): **several clinics** (active, one suspended, one deleted), each with staff on the default and custom roles (an Arabic role name like «قراءة فقط»), a super admin; **hundreds of drugs** with Arabic and Latin names and descriptions (some 256 characters long, some multi-line), default dosings of every kind (every unit, frequency, duration, eye; tapers up to 10 steps); **dozens of protocols** with overrides, «تُحدد عند الإضافة» lines and right/left pairs; Arabic clinic, staff and protocol names (also mixed Arabic + Latin, digits and punctuation at the ends) |
| Clients | Desktop: Chrome or Edge and Firefox on Windows (Safari on a Mac if available), 1280 px and wider; a **real phone** (Android and iPhone if available), portrait and landscape; Word (desktop) and Windows 11 Notepad for pasting; WhatsApp for a plain-text paste |
| Languages | Arabic first (the whole checklist), then English |

## Who runs it

1. **Agents acting as the client**, in rounds: each round runs the whole checklist below plus free exploration, in
   Arabic then English, desktop then phone, and records every finding. `api` items are run with an HTTP client
   script against the rehearsal server (the browser can't forge tokens or time); the rest in the browser.
2. **The user**, once the agents' round is clean: the same checklist (at least every P0 journey) and free use, as the
   client would.

Every finding is recorded with: the steps, what the docs say (the catalog case or doc section), what happened, a
screenshot or the response, the language and device. Each one is fixed like a test failure
([D9](../design/m1.6-test-foundation.md#d9-bugs-found-while-writing-tests)): a failing automated test first when it can
be automated, the smallest fix, docs updated if behavior changes; a gap in the docs goes to the user.

## Free exploration

Beyond the checklist, try to break it the way a new user would:

- **Arabic first**: work a full clinic day in Arabic (log in, build prescriptions from protocols, edit lines, copy into
  Word); check every screen is right-to-left, numbers are Latin digits, no English text is left, names in other
  scripts don't scramble the sentences around them.
- **Phone**: the whole flow on a real phone by touch (drag to reorder, ⓘ tips by tap, dialogs full screen, the
  keyboard covering inputs, landscape), and on a narrow desktop window.
- **Slow and broken network**: throttle to a slow connection, go offline in the middle of a save and come back, reload
  while a request is pending, open the app with the server stopped.
- **Two tabs, two users**: the same user in two tabs (switch clinic in one, act in the other; log out in one); two
  users of one clinic on two computers; the super admin changing roles, staff and clinic status while staff work
  (deactivate, remove, suspend, delete, take a permission away) and the staff's next click; log out and in as another
  user in one tab, then use the old tab.
- **Stale data**: edit or delete a drug or protocol in one window and use the old one in another (save, delete, add to a
  prescription); change a drug's default eye that a protocol relies on.
- **Hands**: double clicks and double Enter on every button and list, Back / Forward / reload in the middle of a flow,
  very long and odd names (256 characters, emoji, Arabic + Latin, leading digits), pasting text with line breaks.
- **The deployment**: stay logged in across a browser restart over HTTPS; name ordering (English before Arabic, upper
  and lower case together) on the server's database collation; dates in the browser's time zone; a new version deployed
  while the app is open (the page reloads itself once).

## Exit rule

The rehearsal passes only with a **clean run**: every checklist item below passes in one run made after the last fix,
in Arabic and English, on desktop and the phone, and no finding is open. Any fix restarts the affected journeys (and
`./test.ps1 -Tier full`); a fix touching login, permissions, isolation or the prescription text restarts the whole
checklist. Only then is the system handed to the client.

## Checklist

Every `manual` case and every P0 case of the [test catalog](test-catalog.md), grouped by journey (360 items: the 352 P0 cases, the 6 other `manual` ones (7 `manual` in all), and 2 real-phone
checks: UX-013, UX-038 / UX-039). The
catalog holds each case's source; the level says how to check it here (`api`: an HTTP script; `unit`: check the visible
result in the app, e.g. the exact sentence or the copied text).

### 1. Log in, stay logged in, switch clinics (61)

#### AUTH · OTP mode, display banner, startup configuration

- [ ] `AUTH-004` (P0, e2e) Given display mode, when a code is requested, then the code appears in an alert «الكود الخاص بك:» + the 6 digits, is filled in and submitted automatically (no typing)

#### AUTH · Requesting a code

- [ ] `AUTH-010` (P0, api) Given a valid local phone `01001234567`, when `POST /auth/otp/request`, then 200 `{ expiresInSeconds: 300, resendAfterSeconds: 60, devCode: <6 digits> }`
- [ ] `AUTH-019` (P0, api) Given a valid phone that belongs to no user, when a code is requested, then 200 with the same response shape as a known phone (`devCode` included) and no `Users` row is created
- [ ] `AUTH-020` (P0, api) Given a code requested 20 s ago, when another is requested for the same phone, then 429 `tooManyRequests` with `Retry-After: 40` (whole seconds until 60 s after the last code)

#### AUTH · Verifying the code

- [ ] `AUTH-036` (P0, api) Given a staff member active in exactly one active clinic, when the right code is verified, then 200 `AuthResult { accessToken, expiresAt ≈ now+15 min, context: that clinic, contexts: [1] }` and the refresh cookie is set
- [ ] `AUTH-037` (P0, api) Given a user with several contexts, when the right code is verified, then 200 with `context: null`, every context listed, and an access token without `ctx`/`clinic_id`
- [ ] `AUTH-038` (P0, api) Given a successful verify, then the cookie is `clinichub_refresh; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` with `Expires` = now + 30 days
- [ ] `AUTH-044` (P0, api) Given a wrong code, when verified, then 400 `invalidCode` and the code's `Attempts` becomes 1 (kept after the failed request)
- [ ] `AUTH-045` (P0, api) Given 4 wrong tries (each `invalidCode`), when a 5th wrong code is sent, then 400 `tooManyAttempts`
- [ ] `AUTH-046` (P0, api) Given a code killed by 5 wrong tries, when the right code is sent, then 400 `tooManyAttempts`; a newly requested code works
- [ ] `AUTH-048` (P0, api) Given a code requested 4 min 59 s ago, when the right code is verified, then 200
- [ ] `AUTH-049` (P0, api) Given a code requested exactly 5 min ago (or more), when the right code is verified, then 400 `codeExpired`
- [ ] `AUTH-051` (P0, api) Given a code already used for a login, when it is verified again, then 400 `invalidCode`
- [ ] `AUTH-055` (P0, api) Given code A then a newer code B for the same phone, when A is verified, then 400 `invalidCode`; B then succeeds
- [ ] `AUTH-058` (P0, api) Given a phone with no user, when the right code is verified, then 403 `noAccess`, no `Set-Cookie`, no session row, and the code stays consumed (verifying it again → `invalidCode`)
- [ ] `AUTH-060` (P0, api) Given a staff member deactivated in their only clinic A (active, not deleted), when the right code is verified, then 403 `staffInactive` with `clinicNames: ["A"]`, no session and no cookie
- [ ] `AUTH-061` (P0, api) Given an active staff member whose only clinic A is suspended, when the right code is verified, then 403 `clinicSuspended` with `clinicNames: ["A"]`, no session and no cookie
- [ ] `AUTH-062` (P0, api) Given a staff member whose only clinic is deleted (also when it was suspended first), when the right code is verified, then 403 `noAccess` without `clinicNames` (the deletion is never revealed)
- [ ] `AUTH-063` (P0, api) Given a user removed from their only clinic, when the right code is verified, then 403 `noAccess` without `clinicNames`
- [ ] `AUTH-072` (P0, api) Given active staff in clinic A and staff in suspended clinic B, when the right code is verified, then 200 with context A chosen automatically and B absent from `contexts`
- [ ] `AUTH-073` (P0, api) Given a deactivated staff member, or staff whose only clinic is suspended, when a **wrong** code is verified, then 400 `invalidCode` (the reason is revealed only after a correct code)
- [ ] `AUTH-074` (P0, ui+e2e) Given verify answers 403 `noAccess`, then the login page shows «هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.» (en "This number has no access. Ask your clinic to add you.")
- [ ] `AUTH-075` (P0, ui+e2e) Given verify answers `staffInactive` naming one clinic A, then the login page shows «تم إيقاف حسابك في «A». تواصل مع مالك العيادة.» (en "Your account in “A” is deactivated. Ask the clinic owner.")
- [ ] `AUTH-078` (P0, ui+e2e) Given verify answers `clinicSuspended` naming one clinic A, then the login page shows «العيادة «A» موقوفة.» (en "“A” is disabled.")
- [ ] `AUTH-084` (P0, api) Given a super admin with no clinic membership, when the right code is verified, then `context: null` and `contexts` = the template (`isTemplate: true`, `roles: []`) and `{ type: "platform" }`
- [ ] `AUTH-089` (P0, e2e) Given a staff member of one clinic, when they log in in the browser, then they land on `/` (prescription) with the clinic name in the app bar
- [ ] `AUTH-090` (P0, e2e) Given a user with several places, when they log in in the browser, then «اختر العيادة» opens

#### AUTH · Access token validation

- [ ] `AUTH-092` (P0, api) Given no `Authorization` header, when any authenticated route (`/drugs`, `/me`, `/auth/contexts`) is called, then 401 `unauthorized`
- [ ] `AUTH-094` (P0, api) Given a token signed with another key, or with `alg: none`, when a protected route is called, then 401

#### AUTH · Session lifetime and refresh

- [ ] `AUTH-098` (P0, api) Given a live session cookie, when `POST /auth/refresh`, then 200 `AuthResult` with the same context, a new access token, and a rotated cookie (new value)
- [ ] `AUTH-100` (P0, api) Given a staff session unused for 30 days (exactly, or more), when refreshed, then 401 `unauthorized` and the cookie is cleared
- [ ] `AUTH-101` (P0, api) Given a super admin session unused for 12 h (exactly, or more; any context: platform, template, or a clinic as staff), when refreshed, then 401; at 11 h 59 min it slides
- [ ] `AUTH-104` (P0, api) Given a cookie rotated less than 30 s ago (29 s) by another call, when the old value is refreshed, then 409 `conflict`, no tokens, and the cookie is **not** cleared
- [ ] `AUTH-109` (P0, api) Given a session in clinic A that the user lost while ≥ 2 contexts remain, when refreshed, then 200 with `context: null`
- [ ] `AUTH-110` (P0, api) Given a session in clinic A that the user lost while exactly one context remains, when refreshed, then 200 with that context chosen
- [ ] `AUTH-111` (P0, api) Given a session whose user has no context left, when refreshed, then 401 `noContexts`, the session is revoked (a later refresh → 401 `unauthorized`) and the cookie cleared

#### AUTH · Contexts and the clinic picker

- [ ] `AUTH-114` (P0, api) Given a staff token, when `GET /auth/contexts`, then the active memberships in active, non-template, non-deleted clinics, by clinic name, each `{ type: "clinic", clinicId, clinicName, isTemplate: false, roles }`
- [ ] `AUTH-116` (P0, api) Given memberships in a suspended clinic, a deleted clinic and as deactivated staff, when `GET /auth/contexts`, then none of them is listed
- [ ] `AUTH-121` (P0, e2e) Given the picker, when a clinic is picked, then `POST /auth/context` is sent and that clinic's `/` opens with its name in the app bar

#### AUTH · Switching context (API)

- [ ] `AUTH-133` (P0, api) Given a staff access token and the session's current cookie, when `POST /auth/context { type: "clinic", clinicId }` for a membership, then 200 `AuthResult` in that clinic, cookie rotated, and a later refresh keeps that clinic
- [ ] `AUTH-137` (P0, api) Given a staff member (not super admin), when switching to `platform`, then 403 `noAccess`
- [ ] `AUTH-138` (P0, api) Given a staff member, when switching to the template clinic, then 403 `noAccess`
- [ ] `AUTH-139` (P0, api) Given an existing clinic the user is not staff of, when switching to it, then 403 `noAccess`
- [ ] `AUTH-141` (P0, api) Given the user's clinic A was suspended, when switching to it, then 403 `clinicSuspended` with `clinicNames: ["A"]` (the picked clinic) and the cookie kept
- [ ] `AUTH-142` (P0, api) Given the user's clinic was deleted (whatever its status), when switching to it, then 403 `noAccess` without `clinicNames`
- [ ] `AUTH-147` (P0, api) Given only an access token (no cookie), when switching, then 401 and no `Set-Cookie`
- [ ] `AUTH-151` (P0, api+e2e) Given a logged-out session's access token and the cookie of a **new live session** (logout in one tab, login again in another, then the stale tab switches), when switching, then 401 and the live cookie is **not** cleared (it still refreshes)

#### AUTH · Logout

- [ ] `AUTH-152` (P0, api) Given a live session, when `POST /auth/logout` with its cookie, then 204, the session is revoked, the cookie cleared, and a refresh with it → 401
- [ ] `AUTH-156` (P0, e2e) Given a logged-in user, when «تسجيل الخروج» is chosen in the account menu, then `/login` opens, and opening `/drugs` afterwards redirects to `/login`

#### AUTH · Staying logged in, routes, tokens in the browser

- [ ] `AUTH-160` (P0, e2e) Given a logged-in user in a clinic, when the page is reloaded (or the browser closed and reopened), then they stay logged in in the same clinic
- [ ] `AUTH-163` (P0, ui) Given an expired access token, when a request answers 401, then the SPA refreshes once and retries it transparently (the user sees the data)
- [ ] `AUTH-167` (P1, manual) Given a deployment over HTTPS (not localhost), when a logged-in user reloads, then they stay logged in; over plain http they must log in again
- [ ] `AUTH-168` (P0, e2e) Given an anonymous user, when any app route (`/`, `/drugs`, `/groups/1`, `/admin`, `/select-clinic`) opens, then `/login`
- [ ] `AUTH-171` (P0, e2e) Given a clinic context, when `/admin` (or `/admin/clinics/new`, `/admin/clinics/{id}`) opens, then `/` and no admin page or admin request shows; given the platform context, when `/drugs` opens, then `/admin`; given no context, when `/` opens, then `/select-clinic`

#### AUTH · Offline start

- [ ] `AUTH-173` (P0, e2e) Given a logged-in user and an unreachable API, when the page loads, then «تعذّر الاتصال بالخادم. تحقّق من الاتصال.» with «إعادة المحاولة» shows instead of the login page
- [ ] `AUTH-174` (P0, e2e) Given the offline screen, when the API is back and «إعادة المحاولة» is pressed, then the session is restored in the same clinic without logging in

#### AUTH · App bar, account menu, template clinic

- [ ] `AUTH-177` (P0, e2e) Given a clinic context, then the clinic name is always in the app bar (the template as «العيادة النموذجية»)

#### AUTH · Losing the context mid-session

- [ ] `AUTH-182` (P0, e2e) Given a user working in clinic A with ≥ 2 other places, when the admin deactivates them in A and they act, then «لم تعد لديك صلاحية دخول «A». اختر أين تريد المتابعة.» and the picker opens
- [ ] `AUTH-183` (P0, e2e) Given a user in clinic A with exactly one other clinic B, when they lose A and act, then «لم تعد لديك صلاحية دخول «A». أنت الآن في «B».» and B's `/` opens
- [ ] `AUTH-184` (P0, e2e) Given a user in clinic A with no other place, when they lose A and act, then «لم تعد لديك صلاحية دخول «A» ولا أي عيادة أخرى.» and `/login` opens
- [ ] `AUTH-189` (P0, ui+api) Given a save is sent just after the clinic was lost, then it is not replayed in the clinic the user is moved to (nothing is written anywhere)

### 2. Clinic isolation (20)

#### ISO · Catalog routes across clinics (API)

- [ ] `ISO-001` (P0, api) Given an A token, when `GET /drugs`, then only A's drugs are listed and `totalCount` counts only A's
- [ ] `ISO-002` (P0, api) Given a drug name that exists only in B, when A searches for it, then no results
- [ ] `ISO-003` (P0, api) Given B's drug id, when A calls `GET /drugs/{id}`, then 404 `notFound`
- [ ] `ISO-004` (P0, api) Given B's drug id, when A calls `PUT /drugs/{id}` with a valid body, then 404 `notFound` and B's drug is unchanged
- [ ] `ISO-005` (P0, api) Given B's drug id, when A calls `DELETE /drugs/{id}`, then 404 and B's drug and B's group lines using it are intact
- [ ] `ISO-007` (P0, api) Given an A token, when `GET /drug-groups`, then only A's groups, and their items name only A's drugs
- [ ] `ISO-008` (P0, api) Given B's group id, when A calls `GET /drug-groups/{id}`, then 404 `notFound`
- [ ] `ISO-009` (P0, api) Given B's group id, when A calls `PUT /drug-groups/{id}` with A's drugs, then 404 and B's group is unchanged
- [ ] `ISO-011` (P0, api) Given B's group id, when A calls `DELETE /drug-groups/{id}`, then 404 and B's group is intact
- [ ] `ISO-012` (P0, api) Given A creates a group whose `items` hold a B drug id, then 400 `drugNotFound` and no group is created
- [ ] `ISO-013` (P0, api) Given A's own group, when A saves it with a B drug added, then 400 `drugNotFound` and the group is unchanged
- [ ] `ISO-015` (P0, api) Given A creates a drug, then it is stored with A's `ClinicId` and B can't see it
- [ ] `ISO-017` (P0, api) Given the template's drug and group ids, when A asks for them (GET/PUT/DELETE), then 404, and A's list doesn't contain the template rows (A's copies have their own ids)

#### ISO · The clinic comes from the token only

- [ ] `ISO-019` (P0, api) Given an A token, when `POST /drugs` or `PUT /drugs/{id}` carries `clinicId: B` in the body, then it is ignored (the row is A's)
- [ ] `ISO-023` (P0, api) Given a token signed with the test key whose `clinic_id` is B but whose `staff_id` belongs to A, when it reads `/drugs`, then 403 `noAccess` and no B data

#### ISO · Template clinic

- [ ] `ISO-026` (P0, api) Given clinic A created from the template, when the super admin edits or deletes a template drug or group, then A's copy is unchanged
- [ ] `ISO-027` (P0, api) Given clinic A created from the template, when A edits or deletes its copy, then the template is unchanged
- [ ] `ISO-029` (P0, api+e2e) Given staff of any clinic, then the template never appears in their contexts, picker or lists

#### ISO · In the browser

- [ ] `ISO-040` (P0, e2e) Given a user on A's drugs page, when they switch to B, then only B's drugs and groups show, with no moment of A's data (cache cleared, in-flight queries cancelled)
- [ ] `ISO-042` (P0, e2e) Given a prescription line added in A, when the user switches to B, then B's prescription is its own (empty at first); back in A, the line is still there (`prescription.lines.<clinicId>`)

### 3. Roles and permissions inside a clinic (34)

#### ACC · Default roles and who can do what

- [ ] `ACC-010` (P0, api) Given an Owner, when `GET /me`, then all 11 keys and the context's `roles` = `["Owner"]`; every catalog call succeeds
- [ ] `ACC-011` (P0, api) Given a Doctor, when they delete a drug and a group, then 204 each; `/me` lists 11 keys
- [ ] `ACC-012` (P0, api) Given an Assistant, when `DELETE /drugs/{id}` or `DELETE /drug-groups/{id}`, then 403 `forbidden` and the row still exists; create and update succeed
- [ ] `ACC-014` (P0, api) Given the super admin in the template, when `GET /me`, then 11 keys and `staff: null`; creating and deleting a drug succeed
- [ ] `ACC-016` (P0, api) Given a staff member with two roles, then `/me` and the API allow the union of both roles' permissions

#### ACC · Endpoint gating (API): one permission per endpoint

- [ ] `ACC-022` (P0, api) `GET /drugs` needs `drugs.list`
- [ ] `ACC-023` (P0, api) `GET /drugs/{id}` needs `drugs.details`
- [ ] `ACC-024` (P0, api) `GET /drugs/{id}/groups` needs `drugs.details`
- [ ] `ACC-025` (P0, api) `POST /drugs` needs `drugs.create` (without it: 403 and no drug created)
- [ ] `ACC-026` (P0, api) `PUT /drugs/{id}` needs `drugs.update` (without it: 403 and the drug unchanged)
- [ ] `ACC-027` (P0, api) `DELETE /drugs/{id}` needs `drugs.delete` (without it: 403 and the drug kept)
- [ ] `ACC-028` (P0, api) `GET /drug-groups` needs `groups.list`
- [ ] `ACC-029` (P0, api) `GET /drug-groups/{id}` needs `groups.details`
- [ ] `ACC-030` (P0, api) `POST /drug-groups` needs `groups.create` (without it: 403, nothing created)
- [ ] `ACC-031` (P0, api) `PUT /drug-groups/{id}` needs `groups.update` (without it: 403, unchanged)
- [ ] `ACC-032` (P0, api) `DELETE /drug-groups/{id}` needs `groups.delete` (without it: 403, kept)

#### ACC · Clinic access checks and 403 codes

- [ ] `ACC-034` (P0, api) Given a platform token, when any catalog route is called, then 403 `forbidden`
- [ ] `ACC-035` (P0, api) Given a no-context token, when any catalog route is called, then 403 `forbidden`
- [ ] `ACC-036` (P0, api) Given a deactivated staff member (active clinic) with a valid token, when any catalog route is called, then 403 `noAccess`
- [ ] `ACC-037` (P0, api) Given a staff member whose staff row was removed, when any catalog route is called with their token, then 403 `noAccess`
- [ ] `ACC-038` (P0, api) Given a suspended clinic, when its staff call any catalog route, then 403 `clinicSuspended`
- [ ] `ACC-039` (P0, api) Given a deleted clinic (also when it is suspended), when its staff call any catalog route, then 403 `noAccess` (never `clinicSuspended`)

#### ACC · Changes while the user works (API, post-commit invalidation, no waiting)

- [ ] `ACC-046` (P0, api) Given an Assistant's cache is warm, when the admin removes `drugs.create` from the Assistant role, then their next `POST /drugs` (same token) → 403 `forbidden` while `GET /drugs` still answers 200; restored → `POST` 201
- [ ] `ACC-049` (P0, api) Given a warm cache, when the admin deactivates the staff member, then their next request → 403 `noAccess`; reactivated → 200 with the same token
- [ ] `ACC-050` (P0, api) Given a warm cache, when the admin removes the staff member, then their next request → 403 `noAccess` and the clinic leaves `/auth/contexts`; re-added → 200 after a refresh
- [ ] `ACC-051` (P0, api) Given a warm cache, when the admin suspends the clinic, then the next request of each of its staff → 403 `clinicSuspended`; activated → 200
- [ ] `ACC-052` (P0, api) Given a warm cache, when the admin deletes the clinic, then the next request → 403 `noAccess` and the clinic leaves `/auth/contexts`
- [ ] `ACC-054` (P2, manual) Given a change made directly in the database without a refresh (staff flag, or a role's permissions), then it applies within about 30 s (documented, not automated: design D3)

#### ACC · Gating in the UI

- [ ] `ACC-057` (P0, e2e) Given Owner, Doctor or Assistant, then the sidebar shows Prescription, Groups and Drugs; given the read-only role, only Groups and Drugs
- [ ] `ACC-058` (P0, e2e) Given a role without `prescriptions.create`, when `/` opens, then the first allowed page opens (read-only role → `/groups`)
- [ ] `ACC-060` (P0, e2e) Given a URL the user may not open (read-only role → `/groups/new`), then «لا توجد صلاحية» + «ليست لديك صلاحية لفتح هذه الصفحة. اطلبها من مالك العيادة إن احتجت إليها.» + «الذهاب إلى صفحة البداية» (en "No permission" + "You don't have permission to open this page. Ask the clinic owner if you need it." + "Go to the start page")
- [ ] `ACC-061` (P0, e2e) Given the read-only role on Drugs, then no «إضافة دواء», no Actions column, and a row opens the read-only drug details dialog (also with Enter/Space)
- [ ] `ACC-062` (P0, e2e) Given an Assistant on Drugs, then Add and the edit icon show, the delete icon does not, and a row opens the editor

#### ACC · Permission changes in the open app

- [ ] `ACC-074` (P0, e2e) Given an Assistant on the Groups page, when `groups.list` is removed from their role and the next groups request runs, then one toast «غير مسموح لك بهذا الإجراء.» (en "You are not allowed to do this."), `/me` reloads, Groups leaves the sidebar and the no-permission page shows

### 4. Errors and server answers (4)

#### ERR · Shape

- [ ] `ERR-001` (P0, api) Given any error (one per status: 400, 401, 403, 404, 405, 409, 429, 500), then the body is `application/problem+json` with `type = "https://httpstatuses.io/<status>"`, `title` (400 "Validation failed", 401 "Unauthorized", 403 "Forbidden", 404 "Not found", 405 "Method not allowed", 409 "Conflict", 429 "Too many requests", 500 "Unexpected error"), `status`, `detail`, `instance` (the request path), `code`, `errors[]` and `traceId`
- [ ] `ERR-002` (P0, api) Given `POST /drugs` with an empty name and an invalid default dosing, then 400 with `code: "nameRequired"` and `errors` = `[{ nameRequired, field: "name" }, { invalidDosing, field: "defaultDosing" }]` in that order, each with a `description`

#### ERR · Status by error type

- [ ] `ERR-007` (P0, api) Given no or an invalid token, then 401 `unauthorized` in the same ProblemDetails shape (from the JWT handler)

#### ERR · Routing

- [ ] `ERR-015` (P0, api) Given `GET /api/v1/unknown`, then 404 `notFound` ProblemDetails (never the SPA's `index.html`)

### 5. Platform admin: clinics, roles, staff (58)

#### ADM · Admin authorization and entry

- [ ] `ADM-001` (P0, api) Given no access token, when calling every admin route, then 401 `unauthorized` and nothing changes
- [ ] `ADM-003` (P0, api) Given owner O's clinic-context token, when calling every admin route (incl. `POST /admin/clinics`), then 403 `forbidden` and nothing is written
- [ ] `ADM-004` (P0, api) Given assistant S's clinic-context token, when calling every admin route, then 403 `forbidden`
- [ ] `ADM-006` (P0, api) Given SA's **template-context** token, when calling every admin route, then 403 `forbidden`
- [ ] `ADM-007` (P0, api) Given O's token for clinic A, when calling `/admin/clinics/{A}/roles` and `/staff` (own clinic, GET/POST/PUT/DELETE), then 403 `forbidden` (clinics can't manage their own roles/staff)
- [ ] `ADM-009` (P0, api) Given SA's platform token, when calling `GET /admin/clinics`, then 200

#### ADM · Demoted super admin

- [ ] `ADM-012` (P0, api) Given SA holds a platform access token, when the API restarts with SA's phone removed from `Platform:SuperAdminPhones`, then the old token gets 403 `forbidden` on `GET /admin/clinics`

#### ADM · Clinics list (API)

- [ ] `ADM-016` (P0, api) Given the template, A, B and a deleted clinic C, when `GET /admin/clinics`, then items are A and B only (no template, no deleted)

#### ADM · Create clinic: validation

- [ ] `ADM-059` (P0, api) Given any validation failure, then no clinic, user, role, staff, drug or group row is added

#### ADM · Create clinic: provisioning and the template copy

- [ ] `ADM-066` (P0, api) Given `{name:"  Smoke clinic  ", owner:{phone:"01000000009", fullName:" Smoke Owner "}}`, then 201, `Location: /api/v1/admin/clinics/{id}`, name `Smoke clinic`, status `active`, `staffCount` 1, owners `[{fullName:"Smoke Owner", phone:"+201000000009"}]`
- [ ] `ADM-067` (P0, api) Given a new clinic, then its roles are Owner (`isOwner`, all 11 permissions), Doctor (all 11) and Assistant (9: all but `drugs.delete`, `groups.delete`), with `staffCount` 1/0/0
- [ ] `ADM-068` (P0, api) Given a new phone, then one new user is created and the owner is an active staff row with only the Owner role
- [ ] `ADM-069` (P0, api) Given a new clinic, when its owner logs in with a correct code, then they enter it directly (only context) with all 11 permissions
- [ ] `ADM-070` (P0, api) Given T has 2 drugs and 1 group, then the new clinic has 2 drugs with the same names, descriptions and default dosings (incl. taper steps) and 1 group with its items in the same order
- [ ] `ADM-071` (P0, api) Given T's group line 2 overrides the dosing (taper 4→3→2→1, eye `ask`, dose from the drug), then the copied line has the same override
- [ ] `ADM-072` (P0, api) Given the new clinic's copied group, then each item points to the new clinic's own drug copy (not to T's drug ids) and T's rows are unchanged
- [ ] `ADM-073` (P0, api) Given a clinic was created, when a T drug is renamed (template context), then the clinic's copy is unchanged
- [ ] `ADM-074` (P0, api) Given a clinic was created, when its owner edits or deletes a copied drug or group, then T and every other clinic are unchanged
- [ ] `ADM-077` (P0, api) Given any seeder fails (roles, owner or catalog copy; e.g. the catalog copy's insert fails), then 500 and nothing is left: no clinic, no new user, no roles, staff, drugs or groups
- [ ] `ADM-078` (P0, api) Given the phone of S (staff of clinic A as "Dev Assistant"), when creating clinic N with owner name "Sara", then 201, no new user row, the owner is S's user; S's name in A stays "Dev Assistant"
- [ ] `ADM-085` (P0, e2e) Given a valid create form, when double-clicking "Create clinic" («إنشاء العيادة»), then exactly one `POST` is sent and one clinic exists
- [ ] `ADM-088` (P0, e2e) Given SA creates «عيادة النور» in the Arabic UI with a new owner phone, when that owner logs in, then they land in the clinic and see T's 2 drugs and the group with its 2 lines (design done-when)

#### ADM · Clinic page and Overview

- [ ] `ADM-091` (P0, api) Given unknown id `999999`, when GET, PUT, suspend, activate or DELETE, then 404 `notFound`

#### ADM · Rename

- [ ] `ADM-101` (P0, api) Given A, when `PUT /admin/clinics/{A}` with `"  New name  "`, then 200 `ClinicDetails` with `New name`

#### ADM · Suspend and activate

- [ ] `ADM-111` (P0, api) Given A active, when `POST …/{A}/suspend`, then 204 and A's status is `suspended` in the details and the list (and under `status=suspended`)
- [ ] `ADM-114` (P0, api) Given A suspended then activated, then all its drugs, groups, roles and staff are unchanged (data kept)

#### ADM · Soft delete

- [ ] `ADM-123` (P0, api) Given A, when `DELETE /admin/clinics/{A}`, then 204, A is gone from the list (every filter and search) and `GET …/{A}` → 404 `notFound`
- [ ] `ADM-125` (P0, api) Given A deleted, then every other admin route on A (PUT, suspend, activate, roles and staff GET/POST/PUT/DELETE) → 404 `notFound`
- [ ] `ADM-126` (P0, api) Given A deleted at a fixed time, then all its rows (drugs, groups, roles, staff) still exist, `DeletedAt` = that time and `Status` is unchanged (a suspended A stays `suspended`)
- [ ] `ADM-127` (P0, api) Given A deleted, then A leaves `/auth/contexts` of its staff, and `POST /auth/context` into A → 403 `noAccess` (also when A was suspended: never `clinicSuspended`)
- [ ] `ADM-128` (P0, api) Given O is owner of A and B, when A is deleted, then O's user and B are untouched and O still works in B
- [ ] `ADM-130` (P0, ui) Given the delete dialog, then the Delete button stays disabled until the typed name equals the clinic name; a wrong case ("demo clinic" for "Demo clinic") keeps it disabled

#### ADM · Template clinic protections and the default catalog link

- [ ] `ADM-137` (P0, api) Given T, when listing with any search (incl. its stored name) and any status, then T never appears
- [ ] `ADM-138` (P0, api) Given T's id, when GET, PUT (rename), suspend, activate or DELETE, then 404 `notFound` and T is unchanged
- [ ] `ADM-139` (P0, api) Given T's id, when calling its roles and staff routes (GET/POST/PUT/DELETE), then 404 `notFound`

#### ADM · Roles: API

- [ ] `ADM-147` (P0, api) Given `{name:"  Editors  ", permissions:["drugs.update"]}`, when `POST …/roles`, then 201, `Location: …/clinics/{A}/roles`, name `Editors`, `permissions` `[drugs.list, drugs.details, drugs.update]`
- [ ] `ADM-162` (P0, api) Given the role Doctor, when `PUT` with name `Doctor Plus` and `["groups.update"]`, then 200 with the new name and exactly the closed set (old keys removed)
- [ ] `ADM-165` (P0, api) Given the Owner role, when `PUT` (any valid body), then 409 `roleLocked`; a `PUT` with a blank name → 400 `nameRequired` first
- [ ] `ADM-166` (P0, api) Given the Owner role, when `DELETE`, then 409 `roleLocked` «لا يمكن تعديل دور «المالك» أو حذفه.» (en "The Owner role can't be changed or deleted.") and it stays
- [ ] `ADM-168` (P0, api) Given an unused role, when `DELETE`, then 204 and it's gone from the list; `DELETE` again → 404
- [ ] `ADM-169` (P0, api) Given a role held by an active staff member, when `DELETE`, then 409 `roleInUse` «هذا الدور ممنوح لموظفين. أزِل هذا الدور من موظفيه أولًا.»

#### ADM · Roles: screen

- [ ] `ADM-180` (P0, ui) Given the picker, when ticking «تعديل المجموعات» / "Edit groups", then «فتح مجموعة», «عرض قائمة المجموعات والبحث فيها», «عرض قائمة الأدوية والبحث فيها» are ticked and locked, each with «مطلوبة لـ: تعديل المجموعات», and the count is 4 of 11
- [ ] `ADM-185` (P0, e2e) Given a new role named "Editors" with Edit groups, when Save is double-clicked, then one `POST`, the toast «تم إنشاء الدور «Editors»» and the row after Owner in name order

#### ADM · Staff: API

- [ ] `ADM-199` (P0, api) Given staff `+201000000003`, when `search=01000000003` (local), then that staff member
- [ ] `ADM-200` (P0, api) Given staff `+201000000002`, when `search=٠١٠٠٠٠٠٠٠٠٢` (Arabic-Indic digits), then that staff member
- [ ] `ADM-205` (P0, api) Given a phone that is staff in B only, when searching it in A, then no result (A's staff only)
- [ ] `ADM-206` (P0, api) Given a new phone `01000000031`, name "New Person" and the Assistant id, when `POST …/staff`, then 201, `Location: …/clinics/{A}/staff`, phone `+201000000031`, active, roles [Assistant], one new user
- [ ] `ADM-207` (P0, api) Given the new staff member, when they log in, then they enter A with the Assistant's 9 permissions
- [ ] `ADM-208` (P0, api) Given S (staff of B as "Sara B"), when added to A as "Sara A", then 201 with S's `userId` (no new user) and S's name in B stays "Sara B"
- [ ] `ADM-210` (P0, api) Given S is active staff of A, when adding S's phone (any format) to A, then 409 `staffExists` «هذا الرقم مسجّل بالفعل كموظف في هذه العيادة.»
- [ ] `ADM-216` (P0, api) Given an unknown role id, or a role id of clinic B, then 400 `roleNotFound` field `roleIds` «أحد الأدوار لم يعد موجودًا.» and nothing written
- [ ] `ADM-221` (P0, api) Given S in A, when `PUT` with a new name, `isActive:false` and roles [Assistant, Editors], then 200 with all three changed; S's name in B unchanged
- [ ] `ADM-226` (P0, api) Given S in A and B, when removed from A, then 204, S's staff row in A is gone, S's user and S's membership in B stay

#### ADM · Staff: the last active owner

- [ ] `ADM-229` (P0, api) Given O is A's only active owner, when `PUT` with `isActive:false`, then 409 `lastOwner` and O stays active
- [ ] `ADM-230` (P0, api) Given O is A's only active owner, when `DELETE`, then 409 `lastOwner` and O stays
- [ ] `ADM-231` (P0, api) Given O is A's only active owner, when `PUT` with roles [Doctor] (Owner taken away), then 409 `lastOwner`
- [ ] `ADM-233` (P0, api) Given O active owner and P inactive owner, when removing or deactivating O, then 409 `lastOwner` (an inactive owner doesn't count)
- [ ] `ADM-234` (P0, api) Given O and P both active owners, when deactivating P → 200; or removing P → 204; or taking Owner from P → 200

### 6. Drugs, dosing and tapering (92)

#### DRUG · Create and update (API)

- [ ] `DRUG-001` (P0, api) Given a clinic user with `drugs.create`, when POST `/drugs` `{name:"Tobradex", description:"Antibiotic + steroid", defaultDosing:null}`, then 201, body `{id, name, description, defaultDosing:null}` and a `Location` header for `/api/v1/drugs/{id}`
- [ ] `DRUG-002` (P0, api) Given a created drug, when GET `/drugs/{id}`, then 200 with the same name, description and default dosing
- [ ] `DRUG-003` (P0, api) Given an Arabic name «قطرة مرطبة» and an Arabic multi-line description, when the drug is created and read back, then both are stored exactly as typed (no translation, line breaks kept)
- [ ] `DRUG-007` (P0, api) Given an existing drug, when PUT `/drugs/{id}` with a new name, description and default dosing, then 200 with the new values and a later GET returns them
- [ ] `DRUG-014` (P0, api) Given an invalid default dosing (e.g. amount without unit), when POST `/drugs`, then 400 `invalidDosing` with field `defaultDosing` and nothing is saved

#### DRUG · Name and description rules (API)

- [ ] `DRUG-015` (P0, api) Given name "", when POST `/drugs`, then 400 `nameRequired` (field `name`)

#### DRUG · Search, ordering and paging

- [ ] `DRUG-034` (P0, api) Given drugs "Zinc", "atropine", "Tobradex", when GET `/drugs` without a search, then they are ordered by name (the database collation; on the compose PostgreSQL, `en_US.utf8`: atropine, Tobradex, Zinc, case-insensitive), then by id
- [ ] `DRUG-037` (P0, api) Given "Tobradex", when searching "tobra" or "TOBRA", then it is found (case-insensitive contains)
- [ ] `DRUG-038` (P0, api) Given «قطرة مرطبة», when searching «مرطبة» (middle of the name), then it is found
- [ ] `DRUG-040` (P0, api) Given "Atropine tobra", "Tobradex" and "Zinc tobra", when searching "tobra", then "Tobradex" (starts with the term) comes first, then the others by name
- [ ] `DRUG-045` (P0, api) Given 25 drugs, when GET `/drugs?page=2&pageSize=20`, then 5 items, `totalCount` 25, `page` 2, `pageSize` 20
- [ ] `DRUG-051` (P0, e2e) Given the drugs page, when typing in the search box, then the list updates while typing (debounced ~300 ms, no button) and goes back to the first page
- [ ] `DRUG-102` (P0, e2e) Given the drugs page (Arabic and English UI, 1280 and 375 px), when typing «اسبرين» in the search, then «أسبرين ممتد», «اسبرين أطفال» and «قرص أسبرين» are listed, in that order

#### DRUG · Drug dialog (UI)

- [ ] `DRUG-061` (P0, e2e) Given a user with `drugs.create`, when clicking «إضافة دواء», typing a name and saving, then the toast «تمت إضافة الدواء» (English "Drug added") appears, the dialog closes and the drug is in the list
- [ ] `DRUG-063` (P0, ui) Given the drug dialog with an empty (or spaces-only) name, when saving, then the name field turns red with «الاسم مطلوب.» under it and no request is sent
- [ ] `DRUG-065` (P0, ui) Given the drug dialog with incomplete dosing (e.g. «مرات في اليوم» without the number), when saving, then the incomplete fields turn red and nothing is saved
- [ ] `DRUG-066` (P0, e2e) Given an existing drug, when clicking its row (or the ✎ button), then «تعديل الدواء» opens pre-filled with its name, description and default dosing
- [ ] `DRUG-067` (P0, e2e) Given the edit dialog, when changing the name and saving, then the toast «تم تحديث الدواء» (English "Drug updated") appears and the row shows the new name
- [ ] `DRUG-071` (P0, e2e) Given a drug in two groups, when its name or default dosing is edited, then both groups' editors and pickers show the new name/sentence without a reload (the groups were refreshed)

#### DRUG · Delete with the groups warning

- [ ] `DRUG-077` (P0, api) Given a drug used in groups, when DELETE `/drugs/{id}`, then 204, the drug is gone and every group line of it is removed (the groups stay)
- [ ] `DRUG-079` (P0, e2e) Given a drug used in two groups, when clicking delete, then the confirmation «حذف الدواء؟» says «سيتم حذف «Tobradex» وإزالته من كل المجموعات. لا يمكن التراجع عن ذلك.» and on the next line «يُستخدم في هذه المجموعات: A، B»
- [ ] `DRUG-083` (P0, e2e) Given the delete confirmation, when choosing «إلغاء», then nothing is deleted
- [ ] `DRUG-084` (P0, e2e) Given the delete confirmation, when confirming «حذف», then the toast «تم حذف الدواء» (English "Drug deleted") appears and the row disappears

#### DOSE · Sentence: dose and unit

- [ ] `DOSE-001` (P0, unit) Given unit drop and amounts empty / 1 / 2, then the sentence starts «نقطة واحدة» / «نقطة واحدة» / «نقطتين»
- [ ] `DOSE-002` (P0, unit) Given unit drop and amounts 3 / 10 (few), then «3 نقاط» / «10 نقاط»
- [ ] `DOSE-003` (P0, unit) Given unit drop and amounts 11 / 99 (many), then «11 نقطة» / «99 نقطة»
- [ ] `DOSE-006` (P0, unit) Given unit drop and amount 0.5, then «نصف نقطة»
- [ ] `DOSE-008` (P0, unit) Given unit tablet and amounts empty / 1 / 2 / 3 / 10, then «قرص واحد» / «قرص واحد» / «قرصين» / «3 أقراص» / «10 أقراص»
- [ ] `DOSE-010` (P0, unit) Given unit tablet and amounts 0.5 / 1.5, then «نصف قرص» / «1.5 قرص»
- [ ] `DOSE-011` (P0, unit) Given unit capsule and amounts empty / 1 / 2 / 3 / 10, then «كبسولة واحدة» / «كبسولة واحدة» / «كبسولتين» / «3 كبسولات» / «10 كبسولات»
- [ ] `DOSE-013` (P0, unit) Given unit ml and amounts empty / 1 / 2 / 5 / 11 / 100, then «1 مل» / «1 مل» / «2 مل» / «5 مل» / «11 مل» / «100 مل»
- [ ] `DOSE-015` (P0, unit) Given unit application and amounts empty / 1 / 2 / 3 / 11 / 100 / 0.5 / 1.5, then always «طبقة رقيقة»

#### DOSE · Sentence: eye, frequency, duration, order

- [ ] `DOSE-017` (P0, unit) Given eye right / left / both, then the eye part is «في العين اليمنى» / «في العين اليسرى» / «في العينين»
- [ ] `DOSE-018` (P0, unit) Given eye none, not set, or ask, then the sentence has no eye part and no double space
- [ ] `DOSE-019` (P0, unit) Given daily 1 / 2 / 3 / 10, then «مرة واحدة يوميًا» / «مرتين يوميًا» / «3 مرات يوميًا» / «10 مرات يوميًا»
- [ ] `DOSE-020` (P0, unit) Given daily 11 / 24, then «11 مرة يوميًا» / «24 مرة يوميًا»
- [ ] `DOSE-021` (P0, unit) Given every-hours 1 / 2 / 3 / 8 / 10, then «كل ساعة» / «كل ساعتين» / «كل 3 ساعات» / «كل 8 ساعات» / «كل 10 ساعات»
- [ ] `DOSE-022` (P0, unit) Given every-hours 11 / 12 / 72, then «كل 11 ساعة» / «كل 12 ساعة» / «كل 72 ساعة»
- [ ] `DOSE-023` (P0, unit) Given frequency bedtime / asNeeded, then «قبل النوم» / «عند اللزوم»
- [ ] `DOSE-024` (P0, unit) Given a custom frequency "  صباحًا ومساءً  ", then the sentence contains «صباحًا ومساءً» exactly as typed, trimmed
- [ ] `DOSE-026` (P0, unit) Given days 1 / 2 / 3 / 10, then «لمدة يوم واحد» / «لمدة يومين» / «لمدة 3 أيام» / «لمدة 10 أيام»
- [ ] `DOSE-028` (P0, unit) Given weeks 1 / 2 / 3 / 10, then «لمدة أسبوع» / «لمدة أسبوعين» / «لمدة 3 أسابيع» / «لمدة 10 أسابيع»
- [ ] `DOSE-030` (P0, unit) Given months 1 / 2 / 3 / 6 / 10, then «لمدة شهر» / «لمدة شهرين» / «لمدة 3 أشهر» / «لمدة 6 أشهر» / «لمدة 10 أشهر»
- [ ] `DOSE-032` (P0, unit) Given duration continuous / untilNextVisit, then «بصفة مستمرة» / «حتى الزيارة القادمة»
- [ ] `DOSE-034` (P0, unit) Given 2 drops, left eye, daily 6, 2 weeks, then exactly «نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين» (order dose → eye → frequency → duration, single spaces)
- [ ] `DOSE-035` (P0, unit) Given 1 tablet, no eye, every 8 hours, 5 days, then «قرص واحد كل 8 ساعات لمدة 5 أيام»
- [ ] `DOSE-039` (P0, unit) Given an empty dosing, null or undefined, then `dosingToText` returns ""
- [ ] `DOSE-040` (P0, unit) Given the interface in English, then `dosingToText` still returns the same Arabic sentence (fixed Arabic translator)
- [ ] `DOSE-041` (P0, unit) Given any sentence, then all numbers are Western digits (1, 2, 3), never Arabic-Indic (١، ٢، ٣)

#### DOSE · Validation limits (both sides of each)

- [ ] `DOSE-043` (P0, unit+api) Given dose amount 0 or -1 (with a unit), then invalid (`doseAmount` on the client, `invalidDosing` on the API)
- [ ] `DOSE-045` (P0, unit+api) Given dose amount 1000.5 (or 1001), then invalid
- [ ] `DOSE-046` (P0, unit+api) Given a dose amount without a unit, then invalid (client highlights the unit; API `invalidDosing`)
- [ ] `DOSE-048` (P0, unit+api) Given daily with 0 / 1 / 24 / 25 times, then invalid / valid / valid / invalid
- [ ] `DOSE-049` (P0, unit+api) Given daily without a number, then invalid (`frequencyValue`)
- [ ] `DOSE-050` (P0, unit+api) Given every-hours with 0 / 1 / 72 / 73 hours, then invalid / valid / valid / invalid; without a number, invalid
- [ ] `DOSE-051` (P0, unit+api) Given custom frequency with no text, or only spaces, then invalid (`frequencyText`)
- [ ] `DOSE-055` (P0, unit+api) Given days / weeks / months with 0 / 1 / 365 / 366, then invalid / valid / valid / invalid; without a number, invalid (`durationValue`)
- [ ] `DOSE-058` (P0, api) Given eye `ask` on a drug's default dosing, then 400 `invalidDosing`; on a group line, accepted

#### DOSE · Normalization (parity fixture: C# and TypeScript)

- [ ] `DOSE-066` (P0, unit) Given the same input, then C# `DosingRules.Normalize`/`IsValid` and TS `normalizeDosing`/`dosingErrors` agree for every row of `tests/fixtures/dosing-cases.json`

#### DOSE · Merge (drug default → group override)

- [ ] `DOSE-069` (P0, unit) Given an empty override, then `mergeDosing` returns the base
- [ ] `DOSE-070` (P0, unit) Given an override with only a dose (amount + unit), then dose from the override, frequency/duration/eye from the base
- [ ] `DOSE-072` (P0, unit) Given an override frequency daily 6 over base daily 4 / every 8 hours / custom, then the frequency and its value or text come from the override only
- [ ] `DOSE-073` (P0, unit) Given an override duration over a base duration, then duration + value come from the override
- [ ] `DOSE-074` (P0, unit) Given an override eye (incl. "none" and "ask") over a base eye "right", then the override eye wins; no override eye keeps "right"

#### DOSE · Dosing fields (UI)

- [ ] `DOSE-081` (P0, ui) Given the dosing fields, when changing any field, then the preview «نص الروشتة» updates at once with the Arabic sentence
- [ ] `DOSE-084` (P0, ui) Given an invalid dosing and a save attempt, then exactly the invalid fields are red (amount, unit, times/hours, custom text, duration number), and fixing a field removes its red
- [ ] `DOSE-087` (P0, e2e) Given a drug with a default dosing, then its sentence shows under its name in the drugs table, the drug picker and the read-only details

#### TAPER · Rules (API and parity fixture)

- [ ] `TAPER-001` (P0, api) Given a drug default with 2 valid steps, when saved, then 201/200 and GET returns the same `taperSteps` (order, frequency, values) and `frequency`/`durationUnit` null
- [ ] `TAPER-002` (P0, unit+api) Given 10 steps, when saved, then accepted
- [ ] `TAPER-003` (P0, unit+api) Given 11 steps, when saved, then 400 `invalidDosing`; the client marks `taperSteps`
- [ ] `TAPER-004` (P0, unit+api) Given 1 step (daily 4, 1 week), when saved, then it is stored as a plain dosing (`taperSteps:null`, `frequency:"daily"`, `frequencyValue:4`, `durationUnit:"weeks"`, `durationValue:1`)
- [ ] `TAPER-008` (P0, unit+api) Given a step with frequency bedtime / asNeeded / custom, or none, then invalid
- [ ] `TAPER-013` (P0, unit+api) Given the last step continuous or until next visit, then valid
- [ ] `TAPER-014` (P0, unit+api) Given a non-last step continuous or until next visit, then invalid (`invalidDosing`; client field `taperSteps.<i>.durationUnit`)
- [ ] `TAPER-020` (P0, unit) Given a group override with steps over a drug default with a plain frequency, then the merged dosing uses the override steps (base frequency/duration dropped)

#### TAPER · Sentence

- [ ] `TAPER-025` (P0, unit) Given 2 drops, right eye, steps [daily 4, 1 week] then [dose 1, daily 3, 1 week], then «نقطتين في العين اليمنى 4 مرات يوميًا لمدة أسبوع، ثم نقطة واحدة 3 مرات يوميًا لمدة أسبوع، ثم يتوقف»
- [ ] `TAPER-026` (P0, unit) Given 1 drop and steps without step doses [daily 4, 1 week], [daily 3, 1 week], then «نقطة واحدة 4 مرات يوميًا لمدة أسبوع، ثم 3 مرات يوميًا لمدة أسبوع، ثم يتوقف» (the dose is written once)
- [ ] `TAPER-031` (P0, unit) Given the last step continuous, then the sentence ends «…، ثم مرة واحدة يوميًا بصفة مستمرة» without «ثم يتوقف»
- [ ] `TAPER-032` (P0, unit) Given the last step until next visit, then it ends «… حتى الزيارة القادمة» without «ثم يتوقف»

#### TAPER · Start, add step, total (pure logic)

- [ ] `TAPER-038` (P0, unit) Given daily 4 for 1 week, when the schedule starts, then steps [daily 4, 1 week], [daily 3, 1 week]
- [ ] `TAPER-043` (P0, unit) Given steps ending with [daily 3, 1 week], when adding a step, then [daily 2, 1 week] is appended
- [ ] `TAPER-045` (P0, unit) Given steps [daily 4, 1 w], [daily 2, continuous], when adding a step, then [daily 3, 1 w] is inserted before the open-ended step, which stays last

#### TAPER · Generator

- [ ] `TAPER-051` (P0, unit) Given start 6, reduce by 2, down to 1, each 1 week, then steps daily 6, 4, 2, 1, each 1 week
- [ ] `TAPER-060` (P0, ui) Given a valid plan in the generator, then it shows «عدد المراحل: N»; clicking «إنشاء» replaces the steps and closes it

#### TAPER · Steps editor (UI)

- [ ] `TAPER-064` (P0, ui) Given daily 4 for 1 week, when switching tapering on, then two step rows appear (4 then 3 times a day, 1 week each) instead of the frequency/period rows
- [ ] `TAPER-065` (P0, ui) Given a schedule, when switching tapering off, then step 1 becomes the normal frequency and period
- [ ] `TAPER-069` (P0, ui) Given steps, then only the last step's period list offers «بصفة مستمرة» and «حتى الزيارة القادمة»; the others offer أيام / أسابيع only; step frequency offers مرات في اليوم / كل عدد ساعات only
- [ ] `TAPER-071` (P0, ui) Given a step with a missing or out-of-range number, when saving, then that step's field is red and nothing is saved
- [ ] `TAPER-075` (P0, ui) Given a step dose typed (step 2 = 1 drop), then the preview shows the step dose in the sentence
- [ ] `TAPER-077` (P0, ui) Given that group line, when switching tapering on, then the drug's steps are copied into the override for editing
- [ ] `TAPER-078` (P0, e2e) Given a drug saved with a taper, when its dialog is reopened, then the switch is on and the steps are shown as saved
- [ ] `TAPER-079` (P0, e2e) Given a drug with a taper default, when added to a prescription, then the line shows the full taper sentence and «تعديل الجرعة» opens with the steps

### 7. Groups (31)

#### GRP · Create, update, delete (API)

- [ ] `GRP-001` (P0, api) Given 3 drugs, when POST `/drug-groups` `{name:"Post cataract", items:[{drugId:A,dosing:null},{drugId:B,dosing:{frequency:"daily",frequencyValue:6}},{drugId:C,dosing:null}]}`, then 201 + `Location`, items in that order with each `drug` (incl. `defaultDosing`) and `dosing`
- [ ] `GRP-002` (P0, api) Given a group, when GET `/drug-groups/{id}`, then its items come back in the saved order
- [ ] `GRP-003` (P0, api) Given a group of A, B, C, when PUT with items C, A (new order, B removed, new override on A) and a new name, then 200 and GET returns exactly C, A with the new override and name (all lines replaced)
- [ ] `GRP-004` (P0, api) Given a group, when DELETE `/drug-groups/{id}`, then 204, the group is gone and its drugs still exist
- [ ] `GRP-011` (P0, api) Given a drug in a group, when the drug's default dosing is changed, then GET of the group returns the new `drug.defaultDosing` and the unchanged override

#### GRP · Validation (API)

- [ ] `GRP-012` (P0, api) Given an empty name, when POST `/drug-groups`, then 400 `nameRequired`
- [ ] `GRP-015` (P0, api) Given `items: []`, when POST, then 400 `drugsRequired` (field `items`)
- [ ] `GRP-021` (P0, api) Given an override with eye `ask`, when POST `/drug-groups`, then 201 and the line keeps `eye:"ask"`
- [ ] `GRP-022` (P0, api) Given the same drug twice with the same override eye "right", when POST, then 400 `duplicateGroupItem` (field `items`)
- [ ] `GRP-024` (P0, api) Given the same drug twice with override eyes "right" and "left", when POST, then 201 with both lines
- [ ] `GRP-027` (P0, api) Given a drug whose default eye is "right", when POST a group with that drug once without override and once with override eye "right", then 400 `duplicateGroupItem` (effective eye)
- [ ] `GRP-029` (P0, api) Given a group with line A (no override, drug default right) and line B (override left), when the drug's default eye becomes "left" (200) and the group is PUT unchanged (e.g. renamed), then 400 `duplicateGroupItem`; `GET` still shows both lines (effective eye left)

#### GRP · List page and picker (UI)

- [ ] `GRP-041` (P0, e2e) Given a group card, when clicking it, then its editor opens at `/groups/{id}`
- [ ] `GRP-042` (P0, e2e) Given a group card's delete button, when confirming «حذف المجموعة؟» («سيتم حذف «X». الأدوية نفسها لن تُحذف.»), then «تم حذف المجموعة» and the card disappears; the drugs remain on the drugs page
- [ ] `GRP-097` (P0, e2e) Given the prescription's Groups tab (Arabic and English UI, 1280 and 375 px), when typing «عمليه», then «بعد عملية المياه» is listed (the picker uses the same search)

#### GRP · Editor (UI)

- [ ] `GRP-046` (P0, e2e) Given «مجموعة جديدة», when typing a name, clicking 3 drugs in «إضافة أدوية» and saving, then «تم إنشاء المجموعة» (English "Group created") and the list shows it with «الأدوية: 3»
- [ ] `GRP-048` (P0, e2e) Given an existing group, when changing it and saving, then «تم تحديث المجموعة» (English "Group updated") and the editor goes back to the list
- [ ] `GRP-049` (P0, ui) Given the editor with an empty or spaces-only name, when saving, then the name field shows «الاسم مطلوب.» and no request is sent
- [ ] `GRP-050` (P0, ui) Given the editor with a name and no drugs, when saving, then the error toast «أضف دواءً واحدًا على الأقل.» appears and no request is sent
- [ ] `GRP-051` (P0, ui) Given the drug picker in the editor, when a drug is clicked, then it is appended to «أدوية هذه المجموعة» with no override (its default dosing sentence shown) and the picker marks it «مُضاف»
- [ ] `GRP-053` (P0, ui) Given a drug already in the group for its (effective) eye, when it is clicked again in the picker, then the toast ««Tobradex» موجود بالفعل في هذه المجموعة لنفس العين» appears and no line is added
- [ ] `GRP-056` (P0, e2e) Given 3 lines, when dragging the third to the top by its handle and saving, then reopening shows the new order

#### GRP · Overrides and inheritance

- [ ] `GRP-068` (P0, ui) Given a drug default «نقطة واحدة 4 مرات يوميًا لمدة أسبوعين», when only the times are overridden to 6, then the preview reads «نقطة واحدة 6 مرات يوميًا لمدة أسبوعين»
- [ ] `GRP-072` (P0, e2e) Given a group whose line overrides only the frequency, when the drug's default duration is changed on the drugs page, then the group line shows the group's frequency with the drug's new duration
- [ ] `GRP-073` (P0, e2e) Given a line without override, when the drug's default dosing changes, then the line follows it completely (no chip)

#### GRP · "Ask when adding" eye and other eye

- [ ] `GRP-077` (P0, ui) Given the override dialog, then the eye choices include «تُحدد عند الإضافة» (with the tooltip «العين غير محددة في المجموعة: …») besides اليمنى / اليسرى / العينين / بدون عين
- [ ] `GRP-081` (P0, ui) Given a line whose effective eye is right (or left) and no line of the same drug for the other eye, then ⊕ «إضافة للعين الأخرى» is shown; clicking it inserts a line for the other eye right after it with the same dosing
- [ ] `GRP-083` (P0, e2e) Given right and left lines of the same drug with different doses, when saved and reopened, then both lines keep their own dosing
- [ ] `GRP-084` (P0, e2e) Given a saved group whose two lines of a drug now have the same effective eye (the drug's default eye changed), when the editor opens, then both lines get the chip «نفس الدواء والعين في سطر آخر» (en "Same drug and eye as another line") and the alert «يوجد دواء مكرر في المجموعة لنفس العين (مُعلَّم بالأسفل). احذف أحد السطرين أو غيّر العين، ثم احفظ.» (en "A drug is in the group twice for the same eye (marked below). Remove a line or change its eye, then save.") shows above the lines
- [ ] `GRP-085` (P0, ui) Given clashing lines in the editor, when saving, then the same text shows as an error toast and no request is sent; after one line is removed or its eye changed, the chips and the alert go and the save succeeds

#### GRP · Unsaved-changes guard

- [ ] `GRP-087` (P0, e2e) Given an editor with unsaved changes, when clicking «إلغاء» or «رجوع», then «تجاهل التغييرات؟» / «ستفقد التغييرات غير المحفوظة على هذه المجموعة.» (en "Discard changes?" / "Your unsaved changes to this group will be lost.") asks, with «تجاهل» and «إلغاء»

### 8. Prescription and copying (40)

#### RX · Page and adding drugs

- [ ] `RX-001` (P0, e2e) Given a user with `prescriptions.create`, when logging in to a clinic, then the prescription page (`/`) opens first with «إضافة إلى الروشتة» and «الأدوية المختارة»
- [ ] `RX-005` (P0, e2e) Given the Drugs tab, when clicking a drug, then a line is appended with the drug's default dosing sentence, the count chip increases and the picker marks the drug «مُضاف»
- [ ] `RX-007` (P0, e2e) Given a drug already in the list for its default eye, when it is added again, then the toast ««Tobradex» موجود بالفعل في القائمة» (English "“Tobradex” is already in the list") appears and no line is added
- [ ] `RX-009` (P0, e2e) Given a drug without a default dosing, when added, then the line shows its description (multi-line kept) instead of a sentence

#### RX · Adding a group

- [ ] `RX-015` (P0, e2e) Given a group of 3 drugs and an empty prescription, when clicking it, then its 3 lines are appended in the group's order with each line's merged dosing (drug default + override)
- [ ] `RX-017` (P0, e2e) Given a group added, then one toast lists «تمت الإضافة من «Post cataract»: 3» (English "Added from “Post cataract”: 3")
- [ ] `RX-019` (P0, e2e) Given a group with "ask" lines, when it is added, then «أي عين؟» asks once with «بعض أدوية «Post cataract» تُعطى للعين التي تختارها الآن.» and buttons «اليمنى» / «اليسرى» / «العينين» and «إلغاء»
- [ ] `RX-020` (P0, unit+e2e) Given 3 "ask" lines and 1 "right" line, when choosing «اليسرى», then the 3 ask lines get the left eye and the right line stays right (asked only once)
- [ ] `RX-022` (P0, e2e) Given the eye question, when choosing «إلغاء» or pressing Esc, then nothing of the group is added and no toast appears; a click outside the dialog does nothing (it stays open)
- [ ] `RX-024` (P0, e2e) Given a line of drug A for the right eye with the same dosing as the group's A line, when the group is added, then A is skipped without a question and the toast adds «موجود مسبقًا في القائمة: 1»
- [ ] `RX-029` (P0, unit+e2e) Given a saved group whose two lines give the same drug for the same eye after merging (the drug's default eye changed), when added, then the first line in group order is added and the toast adds «مكرر في المجموعة ولم يُضف: 1» (en "Duplicated in the group, not added: 1")
- [ ] `RX-030` (P0, e2e) Given a group with drug A on «تُحدد عند الإضافة» and A on the right eye with different dosings, when added choosing «اليمنى», then «جرعتان لنفس العين» asks ««A» موجود في المجموعة مرتين للعين التي اخترتها، بجرعتين مختلفتين. أي جرعة تُضاف؟» with the two sentences under «الجرعة الأولى في المجموعة» / «الجرعة الثانية في المجموعة» and the buttons «استخدام الأولى» / «استخدام الثانية» (en "Two dosings for the same eye", "First in the group" / "Second in the group", "Use the first" / "Use the second")
- [ ] `RX-031` (P0, unit+e2e) Given that dialog, when «استخدام الأولى» (or «استخدام الثانية») is chosen, then one line of A for the right eye with the first (or second) line's dosing, in the first line's place; the toast counts it as added, not as «مكرر في المجموعة»

#### RX · Conflicts

- [ ] `RX-038` (P0, e2e) Given a line of drug A (right) with a different dosing than the group's A (right), when the group is added, then «موجود بالفعل في الروشتة» asks with ««A» موجود بالفعل في القائمة بجرعة مختلفة.» and both sentences under «الحالي» and «من المجموعة»
- [ ] `RX-041` (P0, e2e) Given a conflict, when choosing «استخدام جرعة المجموعة», then the existing line gets the group's dosing in the same position and keeps its note; the toast adds «تم الاستبدال بجرعة المجموعة: 1»
- [ ] `RX-042` (P0, e2e) Given a conflict, when choosing «الإبقاء على الحالي», then the line is unchanged and the toast adds «تم الإبقاء على الجرعة الحالية: 1»
- [ ] `RX-044` (P0, e2e) Given 3 conflicts, then they are asked one by one in group order; the first shows the checkbox «تطبيق على باقي التعارضات: 2», the second «… : 1», the last none
- [ ] `RX-045` (P0, e2e) Given 3 conflicts, when the first answer is «استخدام جرعة المجموعة» with the checkbox ticked, then no more questions and all 3 are replaced («تم الاستبدال بجرعة المجموعة: 3»)
- [ ] `RX-049` (P0, unit+e2e) Given a group of 4 lines: 1 new, 1 replaced, 1 kept, 1 identical, then one toast with 4 lines in this order: «تمت الإضافة من «G»: 1», «تم الاستبدال بجرعة المجموعة: 1», «تم الإبقاء على الجرعة الحالية: 1», «موجود مسبقًا في القائمة: 1»

#### RX · Editing lines

- [ ] `RX-053` (P0, e2e) Given a line, when clicking ✎ or the line text, then «تعديل الجرعة» opens with the drug name, the line's dosing and its note (empty for a new line)
- [ ] `RX-054` (P0, e2e) Given the line dialog, when changing the times to 6 and typing a note «رج الزجاجة قبل الاستعمال», then after saving the line shows the new sentence and the note (italic) under it
- [ ] `RX-055` (P0, e2e) Given a line edited in the prescription, then the drug's default dosing (drugs page/API) and its groups are unchanged
- [ ] `RX-058` (P0, e2e) Given lines of drug A for right and left, when the left line's eye is changed to right, then ««A» موجود بالفعل في القائمة لنفس العين» (English "… is already in the list for that eye") appears and the dialog stays open, nothing changed
- [ ] `RX-061` (P0, e2e) Given a line for the right eye and the left eye free, then ⊕ «إضافة للعين الأخرى» is shown; clicking it inserts the same drug for the left eye right after the line, with the same dosing and note
- [ ] `RX-063` (P0, e2e) Given 3 lines, when dragging the third to the top, then the order and the numbers change and survive a reload
- [ ] `RX-064` (P0, e2e) Given a line, when clicking ✕, then it is removed at once (no confirmation, no undo) and the drug's «مُضاف» mark goes away if it has no other line

#### RX · Copy, Edit & copy

- [ ] `RX-065` (P0, unit) Given lines A (dosing), B (no dosing, description «سطر1\nسطر2»), C (dosing + note), then the plain text is "A\n<sentence>\n\nB\nسطر1\nسطر2\n\nC\n<sentence>\n<note>"
- [ ] `RX-067` (P0, unit) Given lines, then the HTML is one `<p class="ql-direction-rtl ql-align-right">` per drug with `<strong>name</strong><br>details`, separated by empty RTL paragraphs, and multi-line text uses `<br>`
- [ ] `RX-071` (P0, e2e) Given lines, when clicking «نسخ», then the clipboard holds both formats (plain text and HTML read back equal the expected ones) and the toast «تم النسخ» (English "Copied to clipboard") appears
- [ ] `RX-072` (P0, e2e) Given the English UI, when copying, then the copied text is still the Arabic sentences, right-to-left
- [ ] `RX-075` (P0, e2e) Given lines, when clicking «تعديل ونسخ», then «تعديل قبل النسخ» opens (after loading) with «التعديلات هنا للنسخ فقط ولا يتم حفظها.» and the content: bold names, sentences, notes, right-to-left
- [ ] `RX-077` (P0, e2e) Given text made bold and a numbered list in the editor, when clicking «نسخ», then the copied HTML keeps them and the plain text has "1. " items, with «تم النسخ»
- [ ] `RX-078` (P0, ui+e2e) Given edits in the editor, when closing it with «إغلاق», then the prescription lines are unchanged, and reopening shows the original text again (rebuilt from the current lines, also when reopened during the closing animation)
- [ ] `RX-080` (P0, manual) Given the copied text pasted into Word (desktop), then names are bold, sentences Arabic, paragraphs right-to-left and right-aligned, a blank line between drugs, editor formatting kept
- [ ] `RX-081` (P1, manual) Given the copied text pasted into Windows Notepad (incl. Windows 11 Notepad) and WhatsApp, then plain text without formatting, lines as in the plain-text format
- [ ] `RX-082` (P1, manual) Given the app opened over plain http on the LAN (real click), when copying, then the paste into Word still keeps the formatting

#### RX · Clear, undo, persistence

- [ ] `RX-083` (P0, e2e) Given lines, when clicking «مسح الكل», then the list is empty and the toast «تم مسح القائمة» (English "List cleared") shows an «تراجع» button
- [ ] `RX-084` (P0, e2e) Given the clear toast, when clicking «تراجع» within 6 s, then the lines come back exactly (order, dosing, notes) and the toast closes
- [ ] `RX-088` (P0, e2e) Given lines, when reloading the page (or closing and reopening the browser), then the same lines, order, dosing and notes are shown
- [ ] `RX-099` (P0, e2e) Given a drug added to the prescription, when its name or default dosing is edited on the drugs page, then the existing line keeps the old name and sentence (snapshot)

### 9. Languages, phone and layout (18)

#### I18N

- [ ] `I18N-001` (P0, e2e) Given the English UI, when choosing «العربية» in the language menu (top bar), then the whole UI switches to Arabic at once (no reload) and the menu shows a check on the current language
- [ ] `I18N-002` (P0, e2e) Given Arabic chosen, when reloading or opening a new tab, then the UI is still Arabic (`localStorage["language"] = "ar"`)
- [ ] `I18N-003` (P0, e2e) Given a language chosen, then `<html lang>` and `<html dir>` are `ar`/`rtl` or `en`/`ltr`
- [ ] `I18N-005` (P0, e2e) Given the Arabic UI, then the layout is mirrored: sidebar on the right (drawer opens from the right on a phone), text right-aligned, back arrows pointing right, number avatars and action buttons on the mirrored sides
- [ ] `I18N-008` (P0, e2e) Given drug and group names/descriptions in Arabic and English, when switching the UI language, then they show exactly as typed in both (not translated)
- [ ] `I18N-009` (P0, e2e) Given the English UI, then dosing sentences (drugs table, pickers, group lines, prescription lines, previews, conflict boxes) and copied text are Arabic
- [ ] `I18N-011` (P0, unit) Given both locale files, then every key of `en.ts` exists in `ar.ts` and vice versa (type check + test), and `rxText` is identical in both
- [ ] `I18N-013` (P0, unit) Given every message quoted in the business docs' message tables (every feature), then the Arabic text equals the `ar.ts` value
- [ ] `I18N-014` (P0, e2e) Given numbers in the UI (counts «الأدوية: 12», pagination «1–20 من 10002», step numbers, totals, sentences), then all use Western digits in both languages
- [ ] `I18N-015` (P0, e2e) Given a Latin name (drug, group, clinic, role or staff member) in an Arabic message (e.g. «Tobradex» موجود بالفعل في القائمة) or an Arabic name in an English message, then the quotes stay around the name and the rest of the sentence stays in order (bidi isolates U+2068/U+2069)

#### UX · Phone width and layout

- [ ] `UX-001` (P0, e2e) Given a 375 px wide phone, when visiting the prescription, drugs, groups list and group editor pages (Arabic and English), then there is no horizontal page scroll
- [ ] `UX-002` (P0, e2e) Given 375 px, when opening the drug dialog, group line dialog and prescription line dialog, then they are full-screen, only the content scrolls, and Save/Cancel stay visible
- [ ] `UX-011` (P1, manual) Given a real phone (touch), when adding a group, editing a line, dragging to reorder and copying, then everything works by touch
- [ ] `UX-013` (P1, e2e; the tap only on a real phone) On a real phone, in the drug dialog, tap ⓘ next to «تقليل تدريجي»: the explanation shows and stays about 5 s (the e2e test sends the touch events from the page: Chromium's emulated tap closes the tooltip at once, so the real tap is checked here)
- [ ] `UX-038` / `UX-039` (P1 ui+e2e / P2 e2e; the swipe only on a real phone) On a real phone, make a toast show (e.g. delete a drug: «تم حذف الدواء») and swipe it sideways: it closes at once; make another and tap its × («إغلاق» / "Close"): it closes, other toasts stay

#### UX · Confirmations, focus and keyboard

- [ ] `UX-016` (P0, e2e) Given a delete confirmation (drug, group) or the discard question, when it opens, then the focus is on «إلغاء» and pressing Enter does not delete

#### UX · Double clicks (single flight)

- [ ] `UX-024` (P0, e2e) Given the new-drug dialog, when double-clicking Save (or pressing Enter twice fast), then exactly one drug is created
- [ ] `UX-025` (P0, e2e) Given a new group, when double-clicking Save, then exactly one group is created

#### UX · Load errors and app updates

- [ ] `UX-029` (P0, e2e) Given a new version deployed while the app is open, when opening a page whose chunk no longer exists, then the app reloads itself once and the page opens
- [ ] `UX-037` (P1, manual) Given the app served over the real HTTPS deployment, when copying a prescription, then the async Clipboard API is used and Word keeps the formatting
