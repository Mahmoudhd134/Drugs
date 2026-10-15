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
Migration: these tables are in `Initial` (regenerated in M1.2, when nothing was in production; dev DB reset
with `docker compose down -v && docker compose up -d`); later steps add migrations on top (`AddRoles`,
`AddClinicDeletedAt`). All these tables have `CreatedAt`/`UpdatedAt`.

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
| POST | `/auth/otp/verify` | anonymous | `{ phone, code }` | `AuthResult` + refresh cookie | 400 `invalidPhone`, `invalidCode`, `codeExpired`, `tooManyAttempts`; 403 nowhere to enter: `clinicSuspended` / `staffInactive` (+ `clinicNames`), else `noAccess` (M1.6.0, below) |
| POST | `/auth/refresh` | refresh cookie | — | `AuthResult`, cookie rotated | 401 `unauthorized` (cookie cleared); 401 `noContexts` the user has no context left: session revoked (cookie cleared; M1.5.3); 409 `conflict` the cookie was rotated by a parallel call less than 30 s ago (cookie kept, no tokens) |
| POST | `/auth/context` | access token (any context) **and** this session's refresh cookie | `{ type: "clinic" \| "platform", clinicId? }` | `AuthResult`, cookie rotated | 403 `clinicSuspended` / `staffInactive` (+ `clinicNames`: the picked clinic), `noAccess`; 401 session gone (checked first): cookie cleared, unless it is another live session's (then kept, M1.6.0); 401 cookie missing or of another session (cookie kept); 409 as above |
| GET | `/auth/contexts` | access token | — | `Context[]` | 401 |
| POST | `/auth/logout` | refresh cookie | — | 204, session revoked, cookie cleared | — |
| GET | `/me` | access token | — | `Me` (a context the user lost: `context: null`, `staff: null`, `permissions: []`) | 401 |

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
`GetContexts`, the session service), `Users/` (`GetMe`, phone normalizing, users by phone, the seeder);
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
  numbers only, formatted E.164; otherwise null. Any valid number is accepted, **landlines too** (e.g. `0223456789`), not
  only mobiles: kept on purpose for now (M1.6.1, Q4) for the login, the owner phone and the staff phone; a phone input
  with a country code comes later. The request and verify validators get it injected and use the
  `ValidPhone(normalizer, region)` rule (`PhoneValidation`): null → 400 `invalidPhone` (`field: "phone"`). (Not named `PhoneNumbers`: that is the library's namespace.)
  Phones from configuration go through `ConfigPhones.Normalize(normalizer, phone, region, setting)`: invalid → startup
  error naming the setting.
- **`IUserAccounts` / `UserAccounts`** (scoped, M1.5.2): `GetOrCreateAsync(phone)`, the **one way to find or create a
  user by phone** (an already normalized E.164 phone): finds the user or adds and saves a new one (the caller's
  transaction).
  Used by the super-admin seeding, clinic provisioning (the owner), the dev seed and the admin's "add staff" (M1.5.3)
  too. Login never creates users. Accepted (M1.5 design D5): two requests creating the same new phone at the same
  moment hit the unique index; one fails with a 500 and works when sent again.
- **Request** (`RequestOtpCommandHandler`): deletes codes older than a day; then takes
  `IOtpLock` for the phone (`OtpLock`: `pg_advisory_xact_lock(hashtext(phone))`, held until the command's
  transaction ends; it throws outside a transaction), so parallel requests for one phone can't pass the
  limits together; refuses with a `TooManyRequestsError` (429 `tooManyRequests` + `Retry-After` seconds) if
  the last code is younger than `ResendSeconds` or the phone had `MaxPerPhonePerHour` codes in the last hour;
  else stores a new random code (`RandomNumberGenerator`, HMAC via `OtpHash`) and calls `IOtpSender` (inside
  the transaction: a sender that throws leaves no stored code). A code is created for **any valid phone**,
  user or not (no account probing). Boundaries: a new code is allowed once `ResendSeconds` have passed (at exactly
  60 s: allowed); the hour counts codes created less than an hour ago; `Retry-After` = the whole seconds (rounded up,
  ≥ 1) until the resend wait ends, else until the hour's oldest code turns an hour old.
- **Verify** (`VerifyOtpCommandHandler`): only the phone's **latest** code counts. Order: none/consumed →
  `invalidCode`; attempts used up → `tooManyAttempts`; expired → `codeExpired`; wrong → atomic
  `Attempts + 1` (`ExecuteUpdate … WHERE Attempts < Max`) and `invalidCode`, or `tooManyAttempts` on the
  last allowed try; right → atomic consume (`WHERE ConsumedAt IS NULL`). Hashes are compared with
  `FixedTimeEquals`. Codes typed with Arabic-Indic digits are accepted (spaces dropped); the code itself is not
  validated: empty, letters or another length is a wrong code (`invalidCode`, a try counted). A code expires at
  `ExpiresAt` itself (requested exactly 5 min ago → `codeExpired`). Then: unknown phone → 403 `noAccess`; no
  context → the most specific reason (`IMembershipService.GetEntryRefusalAsync`, M1.6.0, below); either way no
  session and no cookie (the code stays consumed). Otherwise a new session, exactly one context → chosen
  automatically; also deletes sessions that ended a week ago.
- **Why the user can't enter** (M1.6.0, `GetEntryRefusalAsync(userId, clinicId?)`; login: all the user's staff rows,
  the picker: the requested clinic's), template and **deleted** clinics left out: a staff row (active or not) in a
  suspended clinic → `clinicSuspended`; else a deactivated staff row in an active clinic → `staffInactive`
  (`AccessErrors.StaffInactive`, 403); else `noAccess` (removed staff, deleted clinics, unknown phones: never
  revealed). The first two are a `ClinicError` listing the clinics with that reason (`clinicNames` in the
  ProblemDetails, by name, ordinal, each name once even when two clinics share it): at login **every** one (mixed
  reasons: only the suspended ones), in the picker the picked one. Only answered after a right code (login) or to a
  logged-in user (picker), so it reveals nothing to someone guessing numbers. Requests inside a clinic are unchanged
  (`noAccess` / `clinicSuspended` from the access check, then the lost-clinic flow).
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
  non-template, non-deleted clinics (`DeletedAt`, M1.5.1), their staff id in a clinic, and why they can't enter
  (`GetEntryRefusalAsync`, M1.6.0). They read
  `Staff` across clinics with `IgnoreQueryFilters()` (read only), like the platform admin's clinic queries and the access
  cache; Identity calls the service.
- **`ISessionService` / `SessionService`** (shared by the session use cases; `SessionRules` holds
  `RotationGrace` and `SetContext`)
  - `GetContextsAsync`: each clinic from `IMembershipService` (by name), then for a super admin the
    template clinic and `platform`.
  - `IssueAsync`: rotates the refresh token, slides `ExpiresAt` (`RefreshTokenDays` (30) for staff;
    `PlatformSessionHours` (12) for **every session of a super admin**, whatever the context: they can
    switch to the platform at any time without a new code), saves (the hash is an EF concurrency token:
    a lost race → `RefreshTokenRotated`, 409), queues the access cache invalidation for after the commit
    (`IPostCommitActions`, M1.5.1) and builds the access token.
    Returns a `SessionIssue`: the `AuthResult` body plus the refresh token and its expiry (`[JsonIgnore]`),
    which only the controller reads, for the cookie.
- **Refresh**: live session (not revoked, not expired) by token hash; re-checks the context
  against current contexts (lost → cleared, or replaced if only one is left; none left → session
  revoked, 401 `IdentityErrors.NoContexts`, code `noContexts`, so the SPA can tell it from a session that ended
  otherwise). Every rotation keeps the old hash as `PreviousRefreshTokenHash` + `RotatedAt`:
  a token that matches it within **30 s** (a parallel call won the race, before or after its commit)
  gets **409**, no tokens, and its cookie is **not** cleared (the winner's `Set-Cookie` is the valid one).
  Older tokens → 401. A reused old token does **not** revoke the session (no reuse detection). Boundaries: a session
  is live while `ExpiresAt` > now (unused for exactly 30 days, or 12 h for a super admin → ended); the previous token
  answers 409 while `RotatedAt` is less than 30 s ago (at exactly 30 s → 401).
- **Switch**: needs the session's **current refresh cookie** besides the access token
  (missing or another session's → 401 `RefreshTokenRejected`, cookie kept; just rotated → 409), so a stolen
  access token alone can't obtain a refresh token. The token's session ended (revoked, expired, gone) → 401
  `SessionEnded` (cookie cleared), **unless** the cookie is the current or previous refresh token of another live
  session → 401 `RefreshTokenRejected` (cookie kept; M1.6.0, review AUTH-T01: log out in one tab, log in again in
  another, then use the stale tab: the new session's cookie survives, the SPA's refresh-and-retry picks it up). The
  requested context must be in the user's contexts; otherwise the reason from `GetEntryRefusalAsync` for that clinic
  (`clinicSuspended`, `staffInactive`, `noAccess`, above; a **deleted** clinic is always `noAccess`); the platform and
  the template (never in `GetEntryRefusalAsync`) → `noAccess` (a super admin always has both among their contexts,
  whatever the template's status, so they never get here). Any other body (an unknown `type`, `clinic` without
  `clinicId`) → 403 `noAccess`.
- **Logout**: finds the session by token hash (current, or previous within 30 s) and
  revokes it **by id** with `ExecuteUpdate` (no concurrency check), so a refresh rotating the token
  meanwhile can't undo it.
- **`AuthController`** (`api/v1/auth`), **`MeController`** (`api/v1/me`): thin, they send the use cases.
  The refresh cookie stays in `AuthController`: it passes the cookie's value to the commands and, from the
  `Result`, sets the rotated cookie on success, **clears** it on `IdentityErrors.SessionEnded` (401: no live
  session) and `IdentityErrors.NoContexts` (401: revoked, no context left) and on logout, and leaves it for every other failure (`RefreshTokenRejected` 401, 403, 409).
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
  (normalized; invalid → startup error) gets a user (`IUserAccounts`) with `IsSuperAdmin`; any other user loses the
  flag and their sessions are revoked. Development, no non-template clinic yet: `Platform:DevOwnerPhone` becomes
  staff "Dev Owner" (Owner) in **both** demo clinics, which the dev seed creates with `CreateClinicCommand` (the
  owner's user through `IUserAccounts`), and `Platform:DevAssistantPhone` "Dev Assistant" (`IUserAccounts` too), all
  inside the dev seed transaction ([platform admin](../platform-admin/tech.md#dev-seed)). Invalid dev phones →
  startup error; an empty `DevOwnerPhone` skips only the demo clinics (warning; the template is still filled when empty).

### Configuration

| Key | Default (`appsettings.json`; the OTP limits: code defaults, see below) | Development | Production |
|---|---|---|---|
| `Auth:Jwt:Issuer` / `Audience` | `clinichub` | | |
| `Auth:Jwt:SigningKey` | — | dev key | env `Auth__Jwt__SigningKey` (≥ 32 bytes) |
| `Auth:AccessTokenMinutes` / `RefreshTokenDays` / `PlatformSessionHours` | 15 / 30 / 12 | | |
| `Otp:Mode` | `Sms` (refused until an SMS sender exists) | `Display` | env `Otp__Mode=Display` for a demo/staging server (startup warning; anyone can log in) |
| `Otp:Length`, `ExpiryMinutes`, `MaxAttempts`, `ResendSeconds`, `MaxPerPhonePerHour` | 6, 5, 5, 60, 5 (code defaults in `OtpSettings`; `appsettings.json` currently relaxes the last three to 5000, 0, 5000 by choice, until hardening in M3.2) | | |
| `Otp:HashKey` | — | dev key | env `Otp__HashKey` (≥ 32 bytes) |
| `Platform:DefaultRegion` | `EG` | | |
| `Platform:SuperAdminPhones` | `[]` | `+201000000001` | env `Platform__SuperAdminPhones__0`, … |
| `Platform:DevOwnerPhone` | — | `+201000000002` | (dev seed only) |
| `Platform:DevAssistantPhone` | — | `+201000000003` | (dev seed only) |

## Frontend
- **Dev proxy:** `vite.config.ts` proxies `/api` → `http://localhost:5000`; `.env.development` sets
  `VITE_API_BASE_URL=/api/v1`, so the SPA and API share an origin (the `SameSite=Strict` cookie works).
- **`features/auth/session.ts`**: the session store outside React (`loading` / `offline` /
  `anonymous` / `authenticated` + `AuthResult`). The access token lives **only in memory**.
  - Every call that rotates the cookie (refresh, context switch, logout) runs **one at a time**: a
    promise queue in the tab, plus a Web Lock across tabs where the browser provides them
    (HTTPS/localhost). Concurrent refreshes share one promise. A 409 is retried once; a switch that
    gets 401 refreshes and retries once, **unless the refresh brought another user's session** (M1.6.0, review
    UI-F3: the tab was stale and someone logged out and in as another user in another tab; the users are told apart by
    the access tokens' `sub`, read without trust): then the switch is not sent again, the tab keeps that session as it
    is, and `onOtherUserSignedIn` lets `AuthProvider` toast `auth.otherUserSignedIn` ("Another user signed in from
    another tab. This tab now uses that account.") and open that session's home (`homeOf`: its clinic, the admin, or
    the picker): the only navigation, since the call rejects with `OtherUserSignedInError` and the callers (the clinic
    picker, "Back to platform admin", "Edit default catalog") skip their own navigation and error toast. A change of
    user also clears the query cache (`setState` compares the tokens' `sub` besides the context), so the old user's
    `/me` and data never show. Auth calls time out after 15 s, so a stalled API can't hold
    the lock forever.
  - Only a **401** from `/auth/refresh` logs out. An unreachable/failing API keeps the session (the
    request fails with its own error); on page load it gives `offline` (a retry screen), not the login page.
  - Logout waits for a refresh in flight, so its result can't log the user back in. If the logout
    call fails (API unreachable) the user stays logged in and sees an error, since the cookie would
    log them back in on the next load anyway.
  - When the context key changes, `setSession` calls the context-changed handler **before** notifying, which cancels in-flight
    queries and clears the TanStack Query cache, so another clinic's data never shows.
- **`api/client.ts`**: request interceptor adds `Authorization: Bearer` and records the context the
  request was made in; on a 401, and on a 403 `noAccess`/`clinicSuspended` of a request made in a clinic (since
  M1.5.3: the clinic may be lost, or the token out of date), except for `/auth/otp/*`, `/auth/refresh`,
  `/auth/logout` and `/auth/context` (which refreshes itself inside the queue), it refreshes once (one shared call)
  and retries once, **unless the refresh changed the context** (e.g. another tab switched clinic, or the clinic was
  lost): then the request fails instead of being replayed in the wrong clinic. A 403 that persists after the replay
  reaches the 403 handling in `AppProviders` (toast + `/me` reload, as for `forbidden`). The store registers itself with
  `setAuthHandlers` (no import cycle).
- **`features/auth/api.ts`**: `requestOtp`, `verifyOtp`; `useOtpMode()` (`authKeys.otpMode`,
  `staleTime: Infinity`); `useMeQuery` (`authKeys.me(contextKey)`; also reloaded whenever the tab gets the focus
  back, `refetchOnWindowFocus: "always"`, since M1.5.3); `useContextsQuery` (`GET /auth/contexts`, loaded on every
  mount and focus).
- **`AuthProvider`** (inside `AppProviders`): starts the session on load (`/auth/refresh`), and
  `useAuth()` exposes `status`, `context`, `contexts`, `me` (`GET /me`, query key `["me", contextKey]`),
  `meReady` / `meFailed` / `meRetrying` / `retryMe` (the `/me` load state), `signIn`, `switchContext`, `logout` (then opens `/login`), `retry` (offline). `useClinic()` returns
  the current clinic context inside the clinic app.
- **Lost clinic** (since M1.5.3, design D7): every `/auth/refresh` re-checks the context (several contexts left →
  cleared → picker; one → entered; none → 401 `noContexts` → `/login`), and the routes follow its answer. A 403
  `noAccess`/`clinicSuspended` gets there through the interceptor's refresh (as a 401 does, e.g. for an expired access
  token); a `/me` with `context: null` while in a context (a clinic, or the platform: also `isSuperAdmin: false` there, M1.5.4)
  runs `recheckLostContext()` (`AuthProvider`): a refresh, and when it ends the session with another 401 than
  `noContexts` (a demoted super admin's sessions are revoked), `onClinicLost` with `signedOut` (`auth.clinicLostSignedOut`:
  "…Log in again to continue."). After any
  refresh from a clinic or the platform context (`callRefresh`), when that context is no longer among the returned contexts (not when
  another tab merely switched) or the refresh answered 401 `noContexts`, `onClinicLost` (called in a later task, after
  the failed request's own error handling) lets `AuthProvider` dismiss the page's own error toast and say why
  (`auth.clinicLostChoose` / `clinicLostMoved` / `clinicLostEnded`, the names in bidi isolates: `useContextLabel`, so
  the platform reads "Platform admin" and the template "Template clinic"), and open `/`
  of the clinic it was moved to. Any other 401 (logged out in another tab, session expired) → `/login` without a
  message. Not reported: the refresh retried inside a context switch, and page load (no clinic before: after a reload
  the routes follow the refresh without a message, accepted). If the refresh keeps the same clinic (re-added under a
  new staff record, access given back) the request is replayed once with the new token, so it succeeds quietly (a
  save too: the API answered the 403 before running it), and `/me` is loaded again for the `/me` case. If the refresh
  fails (API unreachable) the 403 is handled like `forbidden`. A 403 about a context already left (the request's
  `_contextKey`) is ignored.
- **Routes** (`app/App.tsx`): `SimpleLayout` (app bar with language + user menu, centered content)
  holds `/login` and `/select-clinic` (`RequireAuth`). The platform admin (`AdminLayout` + pages, `/admin…`) is under
  `RequireAuth context="platform"` (M1.5.4, [platform admin](../platform-admin/tech.md#frontend); `/platform`, the
  placeholder page before it, redirects to `/admin`). The clinic app (`AppLayout` + pages) is under
  `RequireAuth context="clinic"`. `RequireAuth`: loading → spinner; offline → "can't reach the server" + retry; anonymous →
  `/login` (remembers the page; after login it reopens it only when the login lands in a clinic context and the page
  is inside the clinic app, not `/login`, `/select-clinic`, `/platform` or `/admin…`; else the context's home); wrong/no context → that context's home (`/`, `/admin` or
  `/select-clinic`). Its outlet is keyed by the context, so every page re-mounts on a switch. A logged-in user
  opening `/login` goes to their context's home.
- **`LoginPage`**: phone → code. In display mode (`GET /auth/otp/mode`, or a response with
  `devCode`) a warning banner ("OTP display mode") is always visible; the code appears in an alert,
  is filled in and submitted automatically. Resend button with countdown; "change number" (back to the phone step,
  the number kept). The submit button is disabled while the phone (or the code) is empty.
- **`SelectClinicPage`**: the contexts (platform admin first, then the clinics and the template in the API's order),
  current one marked; picking another calls `/auth/context` and opens that context's home (picking the current one
  just opens its home). Buttons: Back (when a context is set) and Log out; no context → `auth.noContexts` ("No clinic
  is available for your number."). The list is `GET /auth/contexts`, loaded fresh on opening (a
  spinner meanwhile; the session's list if it fails), so a clinic lost or given since the last refresh shows as it is.
- **`AppLayout`**: clinic name in the app bar, `UserMenu` (name + phone, "Switch clinic" when there
  are several contexts, "Log out"), and a warning banner in the template clinic (with "Back to platform admin"
  for a user who has the platform context; [platform admin](../platform-admin/tech.md#frontend)). The app bar's name
  comes from `useContextLabel` ("Template clinic" for the template), through `AppShell`.
- **Prescription** (`usePrescriptionLines(clinicId)`): `localStorage["prescription.lines.<clinicId>"]`.
  The old unscoped `prescription.lines` (and the older `prescription.selection`) move to the first
  clinic opened.
- i18n: `auth.*` and new `errors.*` (`invalidPhone`, `invalidCode`, `codeExpired`, `tooManyAttempts`,
  `tooManyRequests`, `noAccess`, `clinicSuspended`, `forbidden`; M1.6.0: `staffInactive`, and
  `clinicSuspended_named_*` / `staffInactive_named_*`, plural forms with `{{clinics}}`, and `common.quotedName`) in
  `en.ts` and `ar.ts`. `api/errors.ts` reads `clinicNames` into `ApiError.clinicNames`; `getErrorMessage` then uses
  `errors.<code>_named` with `count` = the number of names and `clinics` = the names, each quoted
  (`common.quotedName`, bidi isolated) and joined by `Intl.ListFormat` in the UI language (“A” and “B” / «A» و«B»),
  so the login page and the clinic picker name the clinics (`tsconfig.app.json` lib + `ES2021.Intl`).

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
- Landline numbers are accepted as phones (login, clinic owner, staff), by choice for now (M1.6.1, Q4). Once codes go
  by SMS (M3.2), a person added with a landline can't receive one; a country-code phone input (mobile numbers) comes
  later.
- Outside Development the template starts empty (dev seed: sample content, M1.5.2).
- Users are created only by seeding, `POST /admin/clinics` (owner) and `POST /admin/clinics/{clinicId}/staff`
  (M1.5.3); the latter two reuse an existing user of the phone.

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
- one active membership → context chosen automatically; inactive staff → `noAccess` (since M1.6.0: `staffInactive`
  at login and in the picker); suspended clinic → `clinicSuspended`.
- super admin: contexts template + platform; platform token has `super_admin` and gets 403 on
  `/drugs`; in the template they create a drug; `/me` has no staff. Session expiry: 12 h for the
  super admin (even before a context is chosen); 30 days for the dev owner.
- no token / garbage token → 401.
- Review fixes (two review cycles): 6 parallel refreshes with one cookie → 1×200 + 5×409, no cookie
  deleted; switch + refresh races never delete the cookie; logout racing a refresh leaves the session
  revoked (10/10); `/auth/context` with only an access token (no cookie) → 401 and no `Set-Cookie`,
  with another session's cookie → 401 and that cookie kept; startup refused for Display in
  Production and Staging (since allowed in any environment, with a warning: Configuration above), for `Sms`, and for a
  short signing key; with the API stopped the page
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
- M1.6.0 (scratch DB `drags_m160`, API on `:5056`, script with the cookie kept by hand, 57/57): at verify, active
  staff in one / two suspended clinics → `clinicSuspended` + `clinicNames` (one / both, by name); inactive in one / two
  active clinics → `staffInactive` + the name(s); inactive + suspended elsewhere, and inactive **in** a suspended
  clinic → `clinicSuspended`; only in a deleted (suspended) clinic, removed staff, unknown phone → `noAccess` without
  `clinicNames`; never a cookie. In the picker: deactivated → `staffInactive`, suspended (staff active or not) →
  `clinicSuspended`, deleted / removed / not a member / platform → `noAccess`, the cookie kept; inside a clinic a
  deactivation still answers `noAccess`. Ended session's access token + another live session's cookie → 401, cookie
  **not** cleared, that cookie still refreshes; with its own cookie or an unknown one → 401 + cleared.
  Browser (Arabic and English, 1280 and 375 px): the login messages naming the clinic.
