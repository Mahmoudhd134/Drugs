# Login (phone + OTP): technical

## Summary
M1.2 (Identity) of the [multi-clinic platform](../../design/platform-hld.md). Everyone logs in
with a phone number and a one-time code (no passwords). A login creates a **session** (one per
device) holding a rotating refresh token and the current **context**: a clinic (as staff, or the
template clinic for a super admin) or the platform (super admin). The API issues a short-lived JWT
access token per context; the request's clinic (`IClinicContext`) now comes only from that token's
`clinic_id`, which replaces M1.1's `TemporaryClinicMiddleware` and the `X-Dev-Clinic-Id` header.
A minimal `Staff` table says which clinics a user may enter (roles: M1.3, [access](../access/tech.md)).

## Data model
Migration: the single PostgreSQL `Initial` was regenerated (nothing in production; dev DB reset
with `docker compose down -v && docker compose up -d`). All tables have `CreatedAt`/`UpdatedAt`.

**Users** (`ClinicHub.Domain/Identity/User.cs`)

| Column | Type | Rules |
|---|---|---|
| Id | int PK | |
| Phone | varchar(20) | E.164, **unique** |
| IsSuperAdmin | boolean | set only by the startup seeder |
| LastLoginAt | timestamptz null | set on each successful verify |

**OtpCodes** (`ClinicHub.Domain/Identity/OtpCode.cs`)

| Column | Type | Rules |
|---|---|---|
| Id | int PK | |
| Phone | varchar(20) | index `(Phone, CreatedAt)` |
| CodeHash | varchar(100) | hex HMAC-SHA256 of `"{phone}:{code}"` with `Otp:HashKey` |
| ExpiresAt | timestamptz | now + `Otp:ExpiryMinutes` |
| Attempts | int | wrong guesses; at `Otp:MaxAttempts` the code is dead |
| ConsumedAt | timestamptz null | single use |

**Sessions** (`ClinicHub.Domain/Identity/Session.cs`)

| Column | Type | Rules |
|---|---|---|
| Id | uuid PK | `sid` claim |
| UserId | int | FK → Users, cascade |
| RefreshTokenHash | varchar(100) | hex SHA-256 of the refresh token; **unique**; EF concurrency token |
| PreviousRefreshTokenHash | varchar(100) null | the hash before the last rotation (indexed) |
| RotatedAt | timestamptz null | last rotation; the previous hash is recognized for 30 s after it |
| ContextType | varchar(20) null | `clinic` / `platform` / null (not chosen) |
| ClinicId | int null | FK → Clinics, restrict |
| ExpiresAt | timestamptz | sliding |
| LastUsedAt | timestamptz | |
| RevokedAt | timestamptz null | logout, lost access, super admin demoted |

**Staff** (`ClinicHub.Domain/Access/Staff.cs`, Access module, `IClinicOwned`)

| Column | Type | Rules |
|---|---|---|
| Id | int PK | `staff_id` claim |
| ClinicId | int | FK → Clinics, restrict; clinic query filter |
| UserId | int | FK → Users, restrict |
| FullName | varchar(256) | required |
| IsActive | boolean | inactive = cannot enter the clinic |
| | | **unique `(ClinicId, UserId)`** |

## API
All under `/api/v1`. Errors are [ProblemDetails](../../tech/overview.md#errors-problemdetails) with `code`
(the 401 from the JWT handler: `unauthorized`; 403 from a policy: `forbidden`). The codes and their English
descriptions are in `IdentityErrors` (+ `AccessErrors` for the 403s, `TooManyRequestsError` for the 429).

| Method | Route | Auth | Request | Response | Errors (codes) |
|---|---|---|---|---|---|
| GET | `/auth/otp/mode` | anonymous | — | `{ mode: "Display" \| "Sms" }` (not in HLD 8.1: lets the login page show the display-mode banner up front) | — |
| POST | `/auth/otp/request` | anonymous | `{ phone }` | `{ expiresInSeconds, resendAfterSeconds, devCode? }` | 400 `invalidPhone`; 429 `tooManyRequests` (+ `Retry-After`) |
| POST | `/auth/otp/verify` | anonymous | `{ phone, code }` | `AuthResult` + refresh cookie | 400 `invalidPhone`, `invalidCode`, `codeExpired`, `tooManyAttempts`; 403 `noAccess` |
| POST | `/auth/refresh` | refresh cookie | — | `AuthResult`, cookie rotated | 401 `unauthorized` (cookie cleared); 409 `conflict` the cookie was rotated by a parallel call less than 30 s ago (cookie kept, no tokens) |
| POST | `/auth/context` | access token (any context) **and** this session's refresh cookie | `{ type: "clinic" \| "platform", clinicId? }` | `AuthResult`, cookie rotated | 403 `noAccess`, `clinicSuspended`; 401 session gone, or cookie missing/of another session (cookie kept); 409 as above |
| GET | `/auth/contexts` | access token | — | `Context[]` | 401 |
| POST | `/auth/logout` | refresh cookie | — | 204, session revoked, cookie cleared | — |
| GET | `/me` | access token | — | `Me` | 401 |

Shapes (`Application/Features/Identity/Sessions/AuthResult.cs`, `ContextDto.cs`, `…/Users/Queries/GetMe/MeDto.cs`,
`ClinicHub.Web/src/features/auth/types.ts`) follow HLD 8.1:
`AuthResult { accessToken, expiresAt, context | null, contexts[] }`;
`Context` = `{ type: "clinic", clinicId, clinicName, isTemplate, roles: string[] }` or `{ type: "platform" }`;
`Me { user: { id, phone, isSuperAdmin }, context, staff: { id, fullName } | null, permissions }`.
`roles` lists the user's role names in that clinic and `permissions` the expanded permission keys in a
clinic context (`[]` otherwise), both since M1.3 ([access](../access/tech.md)).

Catalog endpoints (`/drugs`, `/drug-groups`) carry `[Authorize(Policy = AuthPolicies.ClinicContext)]`:
no/expired/invalid token → 401; a platform or no-context token → 403 `forbidden`. Since M1.3 each
action also needs its permission, and the staff member and clinic must still be active
([access](../access/tech.md)).

## Backend
Use cases in `ClinicHub.Application/Features/Identity/` (M1.4 part 3; [architecture](../../design/architecture.md)),
grouped by sub-feature: `Login/` (OTP request and verify, `GetOtpMode`), `Sessions/` (refresh, switch, logout,
`GetContexts`, the session service), `Users/` (`GetMe`, phone normalizing, the seeder);
implementations in `ClinicHub.Infrastructure/Identity/`, HTTP and cookie in `ClinicHub.Api/Features/Identity/`.

| Use case | Endpoint | Notes |
|---|---|---|
| `GetOtpModeQuery` | `GET otp/mode` | reads `OtpSettings.Mode` |
| `RequestOtpCommand` | `POST otp/request` | 429 → rolled back (only the day-old cleanup is lost; the next request redoes it) |
| `VerifyOtpCommand` | `POST otp/verify` | login; `ICommitOnFailure` (wrong codes stay counted, a used code consumed) |
| `RefreshSessionCommand` | `POST refresh` | `ICommitOnFailure` (a session revoked for losing every context stays revoked) |
| `SwitchContextCommand` | `POST context` | writes only on success: a plain command |
| `LogoutCommand` | `POST logout` | always succeeds |
| `GetContextsQuery`, `GetMeQuery` | `GET contexts`, `GET /me` | 401 `unauthorized` when the token's user no longer exists |

- **`IPhoneNormalizer` / `PhoneNormalizer`** (singleton): `libphonenumber-csharp` parse with `Platform:DefaultRegion` (EG), valid
  numbers only, formatted E.164; otherwise null. The request and verify validators get it injected and use the
  `ValidPhone(normalizer, region)` rule (`PhoneValidation`): null → 400 `invalidPhone` (`field: "phone"`). (Not named `PhoneNumbers`: that is the library's namespace.)
- **Request** (`RequestOtpCommandHandler`): deletes codes older than a day; then takes
  `IOtpLock` for the phone (`OtpLock`: `pg_advisory_xact_lock(hashtext(phone))`, held until the command's
  transaction ends; it throws outside a transaction), so parallel requests for one phone can't pass the
  limits together; refuses with a `TooManyRequestsError` (429 `tooManyRequests` + `Retry-After` seconds) if
  the last code is younger than `ResendSeconds` or the phone had `MaxPerPhonePerHour` codes in the last hour;
  else stores a new random code (`RandomNumberGenerator`, HMAC via `OtpHash`) and calls `IOtpSender` (inside
  the transaction: a sender that throws leaves no stored code). A code is created for **any valid phone**,
  user or not (no account probing).
- **Verify** (`VerifyOtpCommandHandler`): only the phone's **latest** code counts. Order: none/consumed →
  `invalidCode`; attempts used up → `tooManyAttempts`; expired → `codeExpired`; wrong → atomic
  `Attempts + 1` (`ExecuteUpdate … WHERE Attempts < Max`) and `invalidCode`, or `tooManyAttempts` on the
  last allowed try; right → atomic consume (`WHERE ConsumedAt IS NULL`). Hashes are compared with
  `FixedTimeEquals`. Codes typed with Arabic-Indic digits are accepted. Then: unknown phone or no context →
  403 `noAccess` (no session, no cookie; the code stays consumed); otherwise a new session, exactly one
  context → chosen automatically; also deletes sessions that ended a week ago.
- **`IOtpSender`** / **`DisplayOtpSender`** (Infrastructure): display mode logs the code (warning) and sets
  `RevealsCode`, so the API returns `devCode`. `Otp:Mode = Sms` has no sender yet: `AppSettings.Validate`
  stops the app.
- **`ITokenService`** / **`TokenService`** (Infrastructure; claim names in `AuthClaims`; the signing key and the
  `TokenValidationParameters` used by the Api's JwtBearer setup in `JwtValidation`): JWT via
  `JsonWebTokenHandler`, HS256, `Auth:AccessTokenMinutes` (15), issuer and audience from config, clock skew
  30 s. Claims: `sub`, `sid`, `ctx` (when chosen), `clinic_id`, `staff_id` (clinic context with a staff row;
  none in the template), `super_admin: "true"` (platform only). Refresh tokens are 32 random bytes
  (base64url); only their SHA-256 is stored.
- **`IMembershipService` / `MembershipService`** (`Features/Access/StaffMembers`, Access module): a user's active memberships in active,
  non-template clinics, their staff id in a clinic, and "is active member". These are the only reads of
  `Staff` across clinics, so they use `IgnoreQueryFilters()` (read only); Identity calls the service.
- **`ISessionService` / `SessionService`** (shared by the session use cases; `SessionRules` holds
  `RotationGrace` and `SetContext`)
  - `GetContextsAsync`: each clinic from `IMembershipService` (by name), then for a super admin the
    template clinic and `platform`.
  - `IssueAsync`: rotates the refresh token, slides `ExpiresAt` (`RefreshTokenDays` (30) for staff;
    `PlatformSessionHours` (12) for **every session of a super admin**, whatever the context: they can
    switch to the platform at any time without a new code), saves (the hash is an EF concurrency token:
    a lost race → `RefreshTokenRotated`, 409), invalidates the access cache and builds the access token.
    Returns a `SessionIssue`: the `AuthResult` body plus the refresh token and its expiry (`[JsonIgnore]`),
    which only the controller reads, for the cookie.
- **Refresh**: live session (not revoked, not expired) by token hash; re-checks the context
  against current contexts (lost → cleared, or replaced if only one is left; none left → session
  revoked, 401). Every rotation keeps the old hash as `PreviousRefreshTokenHash` + `RotatedAt`:
  a token that matches it within **30 s** (a parallel call won the race, before or after its commit)
  gets **409**, no tokens, and its cookie is **not** cleared (the winner's `Set-Cookie` is the valid one).
  Older tokens → 401. A reused old token does **not** revoke the session (no reuse detection).
- **Switch**: needs the session's **current refresh cookie** besides the access token
  (missing or another session's → 401 `RefreshTokenRejected`, cookie kept; just rotated → 409), so a stolen
  access token alone can't obtain a refresh token. The requested context must be in the user's
  contexts; otherwise `clinicSuspended` (a clinic the user could enter, but suspended) or `noAccess`.
- **Logout**: finds the session by token hash (current, or previous within 30 s) and
  revokes it **by id** with `ExecuteUpdate` (no concurrency check), so a refresh rotating the token
  meanwhile can't undo it.
- **`AuthController`** (`api/v1/auth`), **`MeController`** (`api/v1/me`): thin, they send the use cases.
  The refresh cookie stays in `AuthController`: it passes the cookie's value to the commands and, from the
  `Result`, sets the rotated cookie on success, **clears** it on `IdentityErrors.SessionEnded` (401: no live
  session) and on logout, and leaves it for every other failure (`RefreshTokenRejected` 401, 403, 409).
  Cookie `clinichub_refresh`: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, `Expires` = session
  expiry. Browsers accept `Secure` cookies on `http://localhost`, so dev works over http; **any other host
  needs HTTPS** (on plain http the browser drops the cookie: every reload asks for a new login).
- **`IdentitySetup`** (Api): `ICurrentUser`, JwtBearer (`MapInboundClaims = false`; 401/403 written through
  `ApiProblemFactory`), the `ClinicContext` policy (`ctx = clinic` + `clinic_id`), and `UseClinicFromToken()`
  (after `UseAuthentication`, before `UseAuthorization`): sets `ClinicContext.ClinicId = ICurrentUser.ClinicId`,
  so no token = no clinic = the catalog filter matches nothing.
- `Application/Common/Abstractions/ICurrentUser` (implemented by the Api's `Features/Identity/CurrentUser`,
  scoped, from `HttpContext.User`): `IsAuthenticated`, `UserId`, `SessionId`, `ClinicId`, `StaffId`,
  `IsClinic`, `IsPlatform`, `IsSuperAdmin` (platform tokens only).
- Settings: `AuthSettings`, `OtpSettings`, `PlatformSettings` live in `Application/Common/Settings`; the Api's
  `Shared/AppSettings` binds them (sections `Auth`, `Otp`, `Platform`), `Validate()`s them in `Program.cs`
  before anything starts and registers each section as a singleton: signing key and OTP hash key ≥ 32
  bytes, issuer/audience set, sane limits, and `Sms` refused (no sender yet). **Display mode is allowed in
  any environment, by config** (`Otp__Mode=Display`), so a staging server or a demo for doctors can run
  before an SMS provider exists; outside Development a startup warning is logged, and the login page always
  shows the display-mode banner. This deliberately drops HLD NFR-4 ("never in Production") until a sender
  exists: in display mode anyone can log in as any phone, so use it only where that is acceptable.
- **Seeding** (every start, idempotent): Infrastructure's `Platform/StartupSeeder` (`IStartupSeeder`) ensures the
  template clinic, then calls Application's `Features/Identity/Users/IIdentitySeeder` (on `IAppDbContext` +
  `ITransactionRunner`; cache invalidated after the commit): every `Platform:SuperAdminPhones` entry
  (normalized; invalid → startup error) gets a user with `IsSuperAdmin`; any other user loses the flag and
  their sessions are revoked. Development, no non-template clinic yet: a user for `Platform:DevOwnerPhone`
  (`IIdentitySeeder.EnsureUserAsync`) becomes staff "Dev Owner" in **both** demo clinics (inside the
  dev seed transaction).

### Configuration

| Key | Default (`appsettings.json`) | Development | Production |
|---|---|---|---|
| `Auth:Jwt:Issuer` / `Audience` | `clinichub` | | |
| `Auth:Jwt:SigningKey` | — | dev key | env `Auth__Jwt__SigningKey` (≥ 32 bytes) |
| `Auth:AccessTokenMinutes` / `RefreshTokenDays` / `PlatformSessionHours` | 15 / 30 / 12 | | |
| `Otp:Mode` | `Sms` (refused until an SMS sender exists) | `Display` | env `Otp__Mode=Display` for a demo/staging server (startup warning; anyone can log in) |
| `Otp:Length`, `ExpiryMinutes`, `MaxAttempts`, `ResendSeconds`, `MaxPerPhonePerHour` | 6, 5, 5, 60, 5 | | |
| `Otp:HashKey` | — | dev key | env `Otp__HashKey` (≥ 32 bytes) |
| `Platform:DefaultRegion` | `EG` | | |
| `Platform:SuperAdminPhones` | `[]` | `+201000000001` | env `Platform__SuperAdminPhones__0`, … |
| `Platform:DevOwnerPhone` | — | `+201000000002` | (dev seed only) |

## Frontend
- **Dev proxy:** `vite.config.ts` proxies `/api` → `http://localhost:5000`; `.env.development` sets
  `VITE_API_BASE_URL=/api/v1`, so the SPA and API share an origin (the `SameSite=Strict` cookie works).
- **`features/auth/session.ts`**: the session store outside React (`loading` / `offline` /
  `anonymous` / `authenticated` + `AuthResult`). The access token lives **only in memory**.
  - Every call that rotates the cookie (refresh, context switch, logout) runs **one at a time**: a
    promise queue in the tab, plus a Web Lock across tabs where the browser provides them
    (HTTPS/localhost). Concurrent refreshes share one promise. A 409 is retried once; a switch that
    gets 401 refreshes and retries once. Auth calls time out after 15 s, so a stalled API can't hold
    the lock forever.
  - Only a **401** from `/auth/refresh` logs out. An unreachable/failing API keeps the session (the
    request fails with its own error); on page load it gives `offline` (a retry screen), not the login page.
  - Logout waits for a refresh in flight, so its result can't log the user back in. If the logout
    call fails (API unreachable) the user stays logged in and sees an error, since the cookie would
    log them back in on the next load anyway.
  - When the context key changes, `setSession` calls the context-changed handler **before** notifying, which cancels in-flight
    queries and clears the TanStack Query cache, so another clinic's data never shows.
- **`api/client.ts`**: request interceptor adds `Authorization: Bearer` and records the context the
  request was made in; on a 401 (except `/auth/otp/*`, `/auth/refresh`, `/auth/logout`,
  `/auth/context`, which refreshes itself inside the queue) it refreshes once and retries once,
  **unless the refresh changed the context** (e.g. another tab switched clinic): then the request
  fails instead of being replayed in the wrong clinic. The store registers itself with
  `setAuthHandlers` (no import cycle).
- **`features/auth/api.ts`**: `requestOtp`, `verifyOtp`; `useOtpMode()` (`authKeys.otpMode`,
  `staleTime: Infinity`); `useMeQuery` (`authKeys.me(contextKey)`).
- **`AuthProvider`** (inside `AppProviders`): starts the session on load (`/auth/refresh`), and
  `useAuth()` exposes `status`, `context`, `contexts`, `me` (`GET /me`, query key `["me", contextKey]`),
  `signIn`, `switchContext`, `logout` (then opens `/login`), `retry` (offline). `useClinic()` returns
  the current clinic context inside the clinic app.
- **Routes** (`app/App.tsx`): `SimpleLayout` (app bar with language + user menu, centered content)
  holds `/login`, `/select-clinic` (`RequireAuth`) and `/platform` (`RequireAuth context="platform"`,
  a TEMPORARY placeholder until the admin area). The clinic app (`AppLayout` + pages) is under
  `RequireAuth context="clinic"`. `RequireAuth`: loading → spinner; offline → "can't reach the server" + retry; anonymous →
  `/login` (remembers the page); wrong/no context → that context's home (`/`, `/platform` or
  `/select-clinic`). Its outlet is keyed by the context, so every page re-mounts on a switch.
- **`LoginPage`**: phone → code. In display mode (`GET /auth/otp/mode`, or a response with
  `devCode`) a warning banner ("OTP display mode") is always visible; the code appears in an alert,
  is filled in and submitted automatically. Resend button with countdown; "change number".
- **`SelectClinicPage`**: the contexts (clinics, template, platform), current one marked; picking
  calls `/auth/context` and opens that context's home.
- **`AppLayout`**: clinic name in the app bar, `UserMenu` (name + phone, "Switch clinic" when there
  are several contexts, "Log out"), and a warning banner in the template clinic.
- **Prescription** (`usePrescriptionLines(clinicId)`): `localStorage["prescription.lines.<clinicId>"]`.
  The old unscoped `prescription.lines` (and the older `prescription.selection`) move to the first
  clinic opened.
- i18n: `auth.*` and new `errors.*` (`invalidPhone`, `invalidCode`, `codeExpired`, `tooManyAttempts`,
  `tooManyRequests`, `noAccess`, `clinicSuspended`, `forbidden`) in `en.ts` and `ar.ts`.

## Edge cases & limitations
- Access tokens stay valid until they expire (≤ 15 min) after logout; refresh and context switches
  re-check access. *(M1.3: suspension and staff deactivation are checked on every clinic request
  through the access cache; every issued token invalidates the user's cached access entries.)*
- The context is per session (per browser), not per tab: switching clinic in one tab moves the
  other tabs' next refresh to that clinic too.
- Calls racing with the same cookie: one wins, the others get 409 within 30 s (cookie kept) and
  the SPA retries once. Within a tab the queue prevents races; across tabs Web Locks do on HTTPS and
  localhost.
- **HTTPS is required** outside localhost (the refresh cookie is `Secure`); the current plain-http
  LAN setup in `DEPLOY.md` must move to HTTPS before this is deployed (HLD NFR-6).
- `Otp:Mode = Sms` has no sender, so a deployed server runs only with `Otp__Mode=Display`
  (a demo/staging setup, not real patients' data: anyone can log in as any phone).
- Per-IP rate limiting of `/auth/otp/*` is M3.2.
- The template clinic is still empty (filled in M1.5).
- No user/staff management UI or API yet: users exist only through seeding (M1.5).

## Testing notes
Verified manually on a reset DB (API on :5000 in Development, Vite on :5173). With a Python script
against the API:
- invalid phone → `invalidPhone`; unknown phone gets a code (`devCode`, 300 s), a second request
  → 429 `tooManyRequests`, the right code → 403 `noAccess` with no cookie, reused → `invalidCode`;
  4 wrong codes → `invalidCode`, 5th → `tooManyAttempts`, then the right code → `tooManyAttempts`;
  an expired code (`ExpiresAt` moved back in SQL) → `codeExpired`.
- dev owner: no context yet (2 contexts); cookie has `HttpOnly; Secure; SameSite=Strict;
  Path=/api/v1/auth`; no-context token on `/drugs` → 403; Demo clinic token has `ctx`, `clinic_id`,
  `staff_id`, no `super_admin` and lists 10,000 drugs; `/me` shows "Dev Owner" and `["*"]`; Second
  demo clinic lists 3; platform or template → `noAccess`; refresh keeps the context and rotates the
  cookie; the old cookie → 409 within 30 s (no tokens), 401 after; logout 204, then refresh → 401.
- one active membership → context chosen automatically; inactive staff → `noAccess`; suspended
  clinic → `clinicSuspended`.
- super admin: contexts template + platform; platform token has `super_admin` and gets 403 on
  `/drugs`; in the template they create a drug; `/me` has no staff. Session expiry: 12 h for the
  super admin (even before a context is chosen); 30 days for the dev owner.
- no token / garbage token → 401.
- Review fixes (two review cycles): 6 parallel refreshes with one cookie → 1×200 + 5×409, no cookie
  deleted; switch + refresh races never delete the cookie; logout racing a refresh leaves the session
  revoked (10/10); `/auth/context` with only an access token (no cookie) → 401 and no `Set-Cookie`,
  with another session's cookie → 401 and that cookie kept; startup refused for Display in
  Production and Staging, for `Sms`, and for a short signing key; with the API stopped the page
  shows "can't reach the server" + retry (not the login page) and retry restores the session; the
  display-mode banner shows before any code is requested.
- Browser (Arabic, RTL): login with auto-filled code → select clinic → Demo clinic; prescription line
  kept under `prescription.lines.2`; switch to the Second demo clinic (only its drugs and group,
  empty prescription), back (line still there); page reload keeps the login; logout → `/login`,
  refresh 401, `/drugs` redirects to login. Super admin: platform page, `/drugs` redirects to
  `/platform`, template clinic with banner, drug edited. Mobile width (375 px): no horizontal scroll.
  Only `language` and `prescription.lines.*` are in `localStorage`.
- M1.4 part 3 (use cases): the same 83 calls (every endpoint above, the 401/403/409 cases, cookies,
  parallel refreshes, the catalog smoke test, the suspended clinic, losing every context) recorded before and
  after on `:5055` with `Otp:MaxAttempts=3`, `ResendSeconds=60`: statuses, codes, cookies and `Retry-After`
  identical; only the English `detail`/`description` texts (from `IdentityErrors`), `field: "phone"` on
  `invalidPhone`, `module` on `/permissions` and the lowercase `Location` differ. In the DB: wrong codes still
  count (1, then 3), a right code for an unknown phone stays consumed, losing every context revokes the
  session; 8 parallel requests for one phone → 1×200 + 7×429; 8 parallel wrong guesses leave `Attempts` at 3.
