# Test catalog

Status: **in use**: written in M1.6.1 (2026-10-15) and automated in M1.6; the M1.6 final review (2026-10-16) fixed
rows against their sources and added TAPER-080, UX-038, UX-039 and ADM-292 (1,191 cases then, 1,194 after it; M1.7a, the rename to protocols, added 14: 1,208; M1.7b, the shared catalog core and admin, added 172 and retired DRUG-055: 1,379 now); every later step adds and fixes its
cases ([below](#how-tests-reference-cases)). Gates (`full` tier): 100% of the P0 and P1 cases have a test, P2 is reported.
Running and writing the tests: [testing README](README.md). Defined by the [M1.6 test foundation design](../design/m1.6-test-foundation.md)
([D2](../design/m1.6-test-foundation.md#d2-test-catalog), [D3](../design/m1.6-test-foundation.md#d3-test-stack-and-layout),
[D7](../design/m1.6-test-foundation.md#d7-what-stays-manual)).

## Purpose

The MVP ends with one full, free acceptance test by the client. This catalog lists everything the client could check,
one behavior per line, taken from the business docs (the client's view) and the tech docs (API rules, exact codes): every
rule and limit (both sides), every message, permissions, clinic isolation, both languages, phone width, double clicks,
stale data and lost access. M1.6 turned the cases into automated tests (phases A–C of the
[design](../design/m1.6-test-foundation.md#7-sub-steps-and-phases)); the `manual` ones and every P0 case are also run by
hand in the [dress rehearsal](dress-rehearsal.md). The feature docs stay the source of truth: when a
case and its source disagree, the source wins and the case is fixed.

## How to read it

| Column | Meaning |
|---|---|
| ID | `<AREA>-<NNN>`. Fixed from this version on: a removed case leaves its number unused, a new case takes the area's next number |
| Case | One behavior: given / when / then. Codes in backticks; messages quoted exactly as in `ar.ts` (Arabic) and `en.ts` (English, "en …"). A name inside a message is wrapped in the bidi isolates U+2068/U+2069 (not shown) |
| P | **P0** acceptance-critical (the client would notice; data, isolation, security, the main flows); **P1** an important rule or message; **P2** an edge case or cosmetic |
| Level | Where the case is cheapest to test reliably: `unit` (a pure function), `api` (integration through HTTP), `ui` (a component), `e2e` (a browser journey), `manual` (only what can't be automated: pasting into Word or Notepad, a real phone, the HTTPS deployment). Two levels (`api+e2e`): a rule enforced by the server whose message the user sees; the case needs a test at each |
| Source | The doc section that states the behavior (relative links) |

- Fixtures: integration tests run in the `Testing` environment with the intended OTP limits (5 attempts, 60 s, 5 per
  hour) and a frozen test clock ([D3](../design/m1.6-test-foundation.md#d3-test-stack-and-layout)); test data is built
  through the real use cases. Example names below: clinics A, B, C; drugs "Tobradex", "Vigamox", "Pred Forte" and
  «قطرة مرطبة»; protocols "Post cataract" (P).
- Dosing sentences are the exact output of `dosingToText` (`rxTextAr.ts`). Arabic plural classes: one = 1, two = 2,
  few = n % 100 in 3–10, many = n % 100 in 11–99, other = everything else (100, 101, 102, fractions).

## How tests reference cases

- Vitest levels come from the file: `*.test.ts` proves `unit`, `*.test.tsx` (a component test) proves `ui`, and also
  `unit` for a case without a `ui` level ([testing README](README.md#the-test-catalog-and-traceability)).
- Every test names the cases it proves: xUnit `[Trait("Case", "AUTH-012")]`, Vitest and Playwright `@AUTH-012` in the
  test title. A test may prove several cases; a case may need several tests (one per level for `api+e2e`).
- No "covered by" column here: `tests/tools/traceability` lists the IDs found in the tests and fails when a P0 or P1 case
  has no test or a test names an unknown ID (report in `artifacts/`). Gate: 100% of P0 and P1; P2 is reported, not
  gated ([D5](../design/m1.6-test-foundation.md#d5-coverage-and-mutation-gates); the user's trim, 2026-10-15).
- E2E covers P0 and P1 cases only (Chromium only): a P2 case whose level includes `e2e` is covered by a component or
  `api` test where that is cheap, else left open (reported).
- Every later step adds its feature's cases here, in the same commit as its docs and tests (a new area only for a new
  feature), fixes the cases whose behavior it changes, and updates the [summary](#summary) counts
  ([testing README § The test catalog](README.md#the-test-catalog-and-traceability)).
- `manual` cases are not automated: they are run in the [dress rehearsal](dress-rehearsal.md) (with every P0 case).

## Open questions

Product decisions not settled by the docs or the code are asked to the user and marked in the cases they touch
(`(Qn)`); once answered, the docs, the code (if needed) and the cases are updated and the marker removed. None is open:
M1.6.1's Q1–Q6 were answered on 2026-10-15 (kept: Undo after «مسح الكل» restores the cleared list, stale pickers until
they reload, landlines accepted as phones, «، » between protocol names; changed: a dosing with only an eye shows the
description (RX-010), Arabic-normalized search (DRUG-088 to DRUG-102, GRP-096, ADM-287 to ADM-291)).

## Summary

Cases per area and priority, and per level (a case with two levels counts once in each).

| Area | P0 | P1 | P2 | Total | unit | api | ui | e2e | manual |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| [AUTH](#auth--login-otp-sessions-contexts) | 60 | 86 | 57 | 203 | 5 | 116 | 55 | 48 | 1 |
| [ISO](#iso--clinic-isolation) | 22 | 18 | 6 | 46 | 0 | 42 | 1 | 4 | 0 |
| [ACC](#acc--permissions-and-access) | 35 | 29 | 25 | 89 | 5 | 59 | 15 | 10 | 1 |
| [ERR](#err--error-contract-problemdetails) | 4 | 18 | 10 | 32 | 9 | 20 | 3 | 2 | 0 |
| [ADM](#adm--platform-admin) | 58 | 145 | 92 | 295 | 3 | 167 | 79 | 49 | 0 |
| [DRUG](#drug--drug-catalog) | 24 | 47 | 33 | 104 | 0 | 66 | 23 | 16 | 0 |
| [GRP](#grp--protocols) | 33 | 47 | 26 | 106 | 2 | 36 | 43 | 26 | 0 |
| [DOSE](#dose--structured-dosing) | 44 | 32 | 12 | 88 | 69 | 18 | 13 | 1 | 0 |
| [TAPER](#taper--tapering-schedules) | 25 | 35 | 20 | 80 | 55 | 19 | 24 | 2 | 0 |
| [RX](#rx--prescription-builder) | 40 | 45 | 24 | 109 | 38 | 0 | 25 | 49 | 3 |
| [I18N](#i18n--languages-and-direction) | 10 | 7 | 6 | 23 | 6 | 0 | 4 | 13 | 0 |
| [UX](#ux--cross-cutting-ui) | 6 | 21 | 16 | 43 | 4 | 0 | 19 | 21 | 2 |
| [CAT](#cat--shared-catalog-and-categories) | 55 | 69 | 37 | 161 | 10 | 115 | 17 | 28 | 1 |
| **All** | **416** | **599** | **364** | **1379** | **206** | **658** | **321** | **269** | **8** |

## AUTH — Login, OTP, sessions, contexts

Sources: [auth business](../features/auth/business.md), [auth tech](../features/auth/tech.md),
[business overview § قواعد عامة](../business/overview.md#قواعد-عامة), [tech overview § Data fetching](../tech/overview.md#data-fetching).

### OTP mode, display banner, startup configuration

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-001 | Given no token, when `GET /auth/otp/mode`, then 200 `{ mode: "Display" }` | P1 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-002 | Given display mode, when the login page opens (before any code is requested), then the banner shows «وضع عرض الكود: يظهر الكود هنا بدل إرساله برسالة SMS (للتطوير فقط).» (en "OTP display mode: codes are shown here instead of being sent by SMS (development only).") | P1 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-003 | Given display mode, when the user is on the code step, then the banner is still visible | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-004 | Given display mode, when a code is requested, then the code appears in an alert «الكود الخاص بك:» + the 6 digits, is filled in and submitted automatically (no typing) | P0 | e2e | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-005 | Given `Otp:Mode = Sms`, when the API starts, then startup is refused (no SMS sender exists) | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-006 | Given `Otp:Mode = Display` in a non-Development environment, when the API starts, then it starts and logs a startup warning | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-007 | Given a JWT signing key or an `Otp:HashKey` shorter than 32 bytes, or a missing issuer/audience, when the API starts, then startup is refused | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-008 | Given an invalid phone in `Platform:SuperAdminPhones`, when the API starts, then startup fails with an error naming the setting | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-009 | Given out-of-range OTP numbers or token/session lifetimes in config, when the API starts, then startup is refused | P2 | api | [tech overview § Runtime](../tech/overview.md#runtime-architecture) |

### Requesting a code

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-010 | Given a valid local phone `01001234567`, when `POST /auth/otp/request`, then 200 `{ expiresInSeconds: 300, resendAfterSeconds: 60, devCode: <6 digits> }` | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-011 | Given the international form `+201001234567`, when a code is requested, then 200; a code requested with `01001234567` verifies with `+201001234567` (same E.164 phone) | P1 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-012 | Given an invalid phone (empty, letters, too short `0100123`, too many digits `010012345678`), when a code is requested, then 400 `invalidPhone` with `errors[0].field = "phone"` and no code stored | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-013 | Given a body without `phone` (`{}`), when a code is requested, then 400 `invalidPhone` (`field: "phone"`) | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-014 | Given the phone typed as `010 0123 4567`, `010-0123-4567`, `0020 100 123 4567` or in Arabic-Indic digits «٠١٠٠١٢٣٤٥٦٧», when a code is requested, then 200 and the code belongs to `+201001234567` (verifying with `01001234567` works) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-015 | Given a phone input longer than 40 characters, when a code is requested, then 400 `invalidPhone` | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-016 | Given a valid Egyptian landline (e.g. `0223456789`), when a code is requested, then 200: any valid number is accepted, landlines too (kept for now; a country-code phone input comes later). The owner and staff phones follow the same rule (ADM-285, ADM-286) | P2 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-017 | Given an invalid phone typed on the login page, when «إرسال الكود» is pressed, then «أدخل رقم موبايل صحيحًا.» (en "Enter a valid mobile number.") shows and the page stays on the phone step | P1 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-018 | Given the phone input (or, on the code step, the code input) empty, then «إرسال الكود» («دخول») is disabled and no request is sent | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-019 | Given a valid phone that belongs to no user, when a code is requested, then 200 with the same response shape as a known phone (`devCode` included) and no `Users` row is created | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-020 | Given a code requested 20 s ago, when another is requested for the same phone, then 429 `tooManyRequests` with `Retry-After: 40` (whole seconds until 60 s after the last code) | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-021 | Given a code requested 59 s ago, when another is requested, then 429 (`Retry-After: 1`); at exactly 60 s, then 200 | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-022 | Given 5 codes requested for one phone within the last hour (each ≥ 60 s apart, the oldest 50 min ago), when a 6th is requested, then 429 `tooManyRequests` with `Retry-After: 600` (until the oldest code turns an hour old) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-023 | Given 5 codes in the last hour, when the oldest is exactly an hour old, then a new request answers 200 (the hour counts codes created less than an hour ago) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-024 | Given phone A is rate-limited, when phone B requests a code, then 200 (limits are per phone) | P1 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-025 | Given a request refused with 429, when the previous code is verified, then it still works (the refused request stored no new code) | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-026 | Given 8 parallel requests for one phone, when they complete, then exactly 1×200 and 7×429 | P1 | api | [auth tech § Testing notes](../features/auth/tech.md#testing-notes) |
| AUTH-027 | Given codes older than a day exist, when any code is requested, then they are deleted from `OtpCodes` | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-028 | Given a code was requested, when `OtpCodes` is read, then only an HMAC hash is stored (no plain code), with `ExpiresAt = now + 5 min` | P2 | api | [auth tech § Data model](../features/auth/tech.md#data-model) |
| AUTH-029 | Given an `IOtpSender` that throws, when a code is requested, then 500 `unexpected` and no code is stored | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-030 | Given the request answers 429, when shown on the login page, then «طلبات أكواد كثيرة. انتظر قليلًا ثم حاول مرة أخرى.» (en "Too many codes requested. Wait a little and try again.") | P1 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-031 | Given a code was sent, when the code step shows, then the resend button counts down «كود جديد بعد: {{count}} ث» from `resendAfterSeconds` and becomes «إرسال كود جديد» at 0 (at once when `resendAfterSeconds` is 0); pressing it requests a new code | P1 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-032 | Given the code step, when «تغيير الرقم» is pressed, then the phone step shows again with the typed number kept | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-033 | Given the code step, then it shows «كود لمرة واحدة للرقم» with the phone | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-034 | Given the phone step, then the input shows the hint «مثال: 01001234567» | P2 | ui | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-035 | Given the phone step, when «إرسال الكود» is double-clicked, then exactly one `POST /auth/otp/request` is sent | P1 | e2e | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |

### Verifying the code

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-036 | Given a staff member active in exactly one active clinic, when the right code is verified, then 200 `AuthResult { accessToken, expiresAt ≈ now+15 min, context: that clinic, contexts: [1] }` and the refresh cookie is set | P0 | api | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-037 | Given a user with several contexts, when the right code is verified, then 200 with `context: null`, every context listed, and an access token without `ctx`/`clinic_id` | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-038 | Given a successful verify, then the cookie is `clinichub_refresh; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` with `Expires` = now + 30 days | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-039 | Given a super admin, when the right code is verified, then the cookie/session expires in 12 h (even before a context is chosen) | P1 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-040 | Given a clinic context token, then its claims are `sub`, `sid`, `ctx = clinic`, `clinic_id`, `staff_id` and no `super_admin` | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-041 | Given a platform context token, then it has `ctx = platform`, `super_admin = "true"` and no `clinic_id`/`staff_id` | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-042 | Given the super admin's template context token, then it has `ctx = clinic`, `clinic_id` = the template and no `staff_id` | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-043 | Given any issued access token, then it is HS256 with the configured issuer/audience and expires 15 min after issue | P2 | unit | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-044 | Given a wrong code, when verified, then 400 `invalidCode` and the code's `Attempts` becomes 1 (kept after the failed request) | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-045 | Given 4 wrong tries (each `invalidCode`), when a 5th wrong code is sent, then 400 `tooManyAttempts` | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-046 | Given a code killed by 5 wrong tries, when the right code is sent, then 400 `tooManyAttempts`; a newly requested code works | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-047 | Given 8 parallel wrong guesses on one code, when they complete, then `Attempts` never exceeds the maximum (5) | P2 | api | [auth tech § Testing notes](../features/auth/tech.md#testing-notes) |
| AUTH-048 | Given a code requested 4 min 59 s ago, when the right code is verified, then 200 | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-049 | Given a code requested exactly 5 min ago (or more), when the right code is verified, then 400 `codeExpired` | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-050 | Given an expired code whose attempts are used up, when verified, then `tooManyAttempts` (attempts are checked before expiry) | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-051 | Given a code already used for a login, when it is verified again, then 400 `invalidCode` | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-052 | Given no code was ever requested for the phone, when a code is verified, then 400 `invalidCode` | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-053 | Given a code was requested, when verify is sent with an empty code, letters, or 5 or 7 digits, then 400 `invalidCode` and a try is counted (`Attempts` 1) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-054 | Given the right code typed with spaces (`123 456`), when verified, then it is accepted | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-055 | Given code A then a newer code B for the same phone, when A is verified, then 400 `invalidCode`; B then succeeds | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-056 | Given the right code typed in Arabic-Indic digits (e.g. «١٢٣٤٥٦»), when verified, then it is accepted | P1 | api+ui | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-057 | Given an invalid phone, when `POST /auth/otp/verify`, then 400 `invalidPhone` (`field: "phone"`) | P1 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-058 | Given a phone with no user, when the right code is verified, then 403 `noAccess`, no `Set-Cookie`, no session row, and the code stays consumed (verifying it again → `invalidCode`) | P0 | api | [auth § المستخدمون](../features/auth/business.md#المستخدمون) |
| AUTH-059 | Given a phone with no user, when it logs in, then no `Users` row is created (login never creates users) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-060 | Given a staff member deactivated in their only clinic A (active, not deleted), when the right code is verified, then 403 `staffInactive` with `clinicNames: ["A"]`, no session and no cookie | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-061 | Given an active staff member whose only clinic A is suspended, when the right code is verified, then 403 `clinicSuspended` with `clinicNames: ["A"]`, no session and no cookie | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-062 | Given a staff member whose only clinic is deleted (also when it was suspended first), when the right code is verified, then 403 `noAccess` without `clinicNames` (the deletion is never revealed) | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-063 | Given a user removed from their only clinic, when the right code is verified, then 403 `noAccess` without `clinicNames` | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-064 | Given active staff in suspended clinic A and deactivated staff in active clinic B, when the right code is verified, then 403 `clinicSuspended` with `clinicNames: ["A"]` only (suspended wins; B is not named) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-065 | Given staff deactivated **in** a suspended clinic A (and nothing else), when the right code is verified, then 403 `clinicSuspended` with `clinicNames: ["A"]` (the suspension wins) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-066 | Given active staff of two suspended clinics "Beta" and "Alpha", when the right code is verified, then 403 `clinicSuspended` with `clinicNames: ["Alpha", "Beta"]` (every clinic with the reason, by name) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-067 | Given deactivated staff in two active clinics B and A, when the right code is verified, then 403 `staffInactive` with `clinicNames: ["A", "B"]` | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-068 | Given staff of two suspended clinics both named "Same", when the right code is verified, then `clinicNames: ["Same"]` (each name once) | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-069 | Given suspended clinics "beta", "Alpha" and «النور», when the right code is verified, then `clinicNames` is in ordinal order: `["Alpha", "beta", "النور"]` | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-070 | Given deactivated staff in active clinic A and staff of deleted clinic B (or removed from B), when the right code is verified, then 403 `staffInactive` with `clinicNames: ["A"]` (B never mentioned) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-071 | Given staff of deleted clinic A and removed from clinic B, when the right code is verified, then 403 `noAccess` | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-072 | Given active staff in clinic A and staff in suspended clinic B, when the right code is verified, then 200 with context A chosen automatically and B absent from `contexts` | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-073 | Given a deactivated staff member, or staff whose only clinic is suspended, when a **wrong** code is verified, then 400 `invalidCode` (the reason is revealed only after a correct code) | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-074 | Given verify answers 403 `noAccess`, then the login page shows «هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.» (en "This number has no access. Ask your clinic to add you.") | P0 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-075 | Given verify answers `staffInactive` naming one clinic A, then the login page shows «تم إيقاف حسابك في «A». تواصل مع مالك العيادة.» (en "Your account in “A” is deactivated. Ask the clinic owner.") | P0 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-076 | Given `staffInactive` naming two clinics A and B, then «تم إيقاف حسابك في العيادتين «A» و«B». تواصل مع مالك كل عيادة.» (en "Your accounts in “A” and “B” are deactivated. Ask the clinic owners.") | P1 | ui | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-077 | Given `staffInactive` naming three clinics, then «تم إيقاف حسابك في العيادات «A» و«B» و«C». تواصل مع مالك كل عيادة.» (en "Your accounts in “A”, “B”, and “C” are deactivated. Ask the clinic owners.") | P1 | ui | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-078 | Given verify answers `clinicSuspended` naming one clinic A, then the login page shows «العيادة «A» موقوفة.» (en "“A” is disabled.") | P0 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-079 | Given `clinicSuspended` naming two clinics, then «العيادتان «A» و«B» موقوفتان.» (en "“A” and “B” are disabled.") | P1 | ui | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-080 | Given `clinicSuspended` naming three clinics (or more), then «العيادات «A» و«B» و«C» موقوفة.» (en "“A”, “B”, and “C” are disabled.") | P1 | ui | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-081 | Given a wrong code, then the login page shows «الكود غير صحيح. راجعه وحاول مرة أخرى.» (en "Wrong code. Check it and try again.") | P1 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-082 | Given an expired code, then the login page shows «انتهت صلاحية هذا الكود. اطلب كودًا جديدًا.» (en "This code has expired. Ask for a new one.") | P1 | ui | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-083 | Given 5 wrong tries, then the login page shows «محاولات خاطئة كثيرة. اطلب كودًا جديدًا.» (en "Too many wrong tries. Ask for a new code.") | P1 | ui | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-084 | Given a super admin with no clinic membership, when the right code is verified, then `context: null` and `contexts` = the template (`isTemplate: true`, `roles: []`) and `{ type: "platform" }` | P0 | api | [auth § المستخدمون](../features/auth/business.md#المستخدمون) |
| AUTH-085 | Given a super admin who is also staff of a clinic, when they log in, then contexts = that clinic + template + platform and the session lasts 12 h in every context | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-086 | Given a successful verify, then the user's `LastLoginAt` is set to now | P2 | api | [auth tech § Data model](../features/auth/tech.md#data-model) |
| AUTH-087 | Given sessions that ended more than a week ago, when anyone verifies a code, then those sessions are deleted (one that ended exactly 7 days ago is kept) | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-088 | Given the code step, when «دخول» is double-clicked, then exactly one verify is sent | P1 | e2e | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| AUTH-089 | Given a staff member of one clinic, when they log in in the browser, then they land on `/` (prescription) with the clinic name in the app bar | P0 | e2e | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-090 | Given a user with several places, when they log in in the browser, then «اختر العيادة» opens | P0 | e2e | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-091 | Given the login and picker pages at 375 px in Arabic, then they fit without horizontal scroll and the language menu is available | P2 | e2e | [auth tech § Frontend](../features/auth/tech.md#frontend) |

### Access token validation

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-092 | Given no `Authorization` header, when any authenticated route (`/drugs`, `/me`, `/auth/contexts`) is called, then 401 `unauthorized` | P0 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-093 | Given a garbage bearer token, when a protected route is called, then 401 `unauthorized` | P1 | api | [auth tech § Testing notes](../features/auth/tech.md#testing-notes) |
| AUTH-094 | Given a token signed with another key, or with `alg: none`, when a protected route is called, then 401 | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-095 | Given a token with a wrong issuer or audience, when a protected route is called, then 401 | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-096 | Given an access token 15 min + 31 s old (past the 30 s clock skew), then 401; at 15 min + 29 s, then accepted | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-097 | Given a valid token of a user that no longer exists, when `GET /me` or `GET /auth/contexts`, then 401 `unauthorized` | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |

### Session lifetime and refresh

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-098 | Given a live session cookie, when `POST /auth/refresh`, then 200 `AuthResult` with the same context, a new access token, and a rotated cookie (new value) | P0 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-099 | Given a staff session last used 29 days 23 h ago, when refreshed, then 200 and the expiry slides to now + 30 days | P1 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-100 | Given a staff session unused for 30 days (exactly, or more), when refreshed, then 401 `unauthorized` and the cookie is cleared | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-101 | Given a super admin session unused for 12 h (exactly, or more; any context: platform, template, or a clinic as staff), when refreshed, then 401; at 11 h 59 min it slides | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-102 | Given no refresh cookie, when `POST /auth/refresh`, then 401 `unauthorized` | P1 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-103 | Given an unknown cookie value, when refreshed, then 401 and the cookie is cleared | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-104 | Given a cookie rotated less than 30 s ago (29 s) by another call, when the old value is refreshed, then 409 `conflict`, no tokens, and the cookie is **not** cleared | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-105 | Given a cookie rotated 30 s ago (exactly, or more), when the old value is refreshed, then 401 | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-106 | Given an old cookie was reused (409 or 401), when the current cookie is refreshed, then 200 (no reuse detection: the session is not revoked) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-107 | Given 6 parallel refreshes with one cookie, then 1×200 + 5×409, no response clears the cookie, and the winner's cookie works | P1 | api | [auth tech § Testing notes](../features/auth/tech.md#testing-notes) |
| AUTH-108 | Given a logged-out (revoked) session's cookie, when refreshed, then 401 and the cookie is cleared | P1 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-109 | Given a session in clinic A that the user lost while ≥ 2 contexts remain, when refreshed, then 200 with `context: null` | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-110 | Given a session in clinic A that the user lost while exactly one context remains, when refreshed, then 200 with that context chosen | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-111 | Given a session whose user has no context left, when refreshed, then 401 `noContexts`, the session is revoked (a later refresh → 401 `unauthorized`) and the cookie cleared | P0 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-112 | Given a super admin removed from `Platform:SuperAdminPhones` and the API restarted, then the user loses `IsSuperAdmin`, their sessions are revoked, and a refresh answers 401 (not `noContexts`) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-113 | Given a logout racing a refresh on the same session, when both complete (10 runs), then the session is always revoked | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |

### Contexts and the clinic picker

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-114 | Given a staff token, when `GET /auth/contexts`, then the active memberships in active, non-template, non-deleted clinics, by clinic name, each `{ type: "clinic", clinicId, clinicName, isTemplate: false, roles }` | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-115 | Given a super admin token, when `GET /auth/contexts`, then their clinics, then the template, then `{ type: "platform" }` | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-116 | Given memberships in a suspended clinic, a deleted clinic and as deactivated staff, when `GET /auth/contexts`, then none of them is listed | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-117 | Given no token, when `GET /auth/contexts`, then 401 | P1 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-118 | Given the picker, then the platform admin is first, then the clinics and the template in the API's order, and the current one is marked «الحالي» | P1 | ui+e2e | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-119 | Given the picker, then the template shows as «العيادة النموذجية» with «الأدوية والبروتوكولات الافتراضية للعيادات الجديدة» and the platform as «إدارة المنصة» with «العيادات وإعدادات المنصة كلها» | P2 | ui | [auth § المستخدمون](../features/auth/business.md#المستخدمون) |
| AUTH-120 | Given the picker, then its title is «اختر العيادة» and subtitle «اختر المكان الذي تريد العمل فيه الآن.» | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-121 | Given the picker, when a clinic is picked, then `POST /auth/context` is sent and that clinic's `/` opens with its name in the app bar | P0 | e2e | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-122 | Given a super admin on the picker, when «إدارة المنصة» is picked, then `/admin` opens | P1 | e2e | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-123 | Given a super admin on the picker, when «العيادة النموذجية» is picked, then `/` opens with the template banner (AUTH-180's text, ar and en) | P1 | e2e | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-124 | Given the picker, when the current context is picked, then its home opens without calling `/auth/context` | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-125 | Given the picker with a context set, then «رجوع» (Back) and «تسجيل الخروج» are shown; without a context only «تسجيل الخروج» | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-126 | Given a session with no context available, when the picker opens, then «لا توجد عيادة متاحة لرقمك.» (en "No clinic is available for your number.") | P1 | ui | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-127 | Given a clinic was lost or given since the last refresh, when the picker opens, then it shows a spinner, loads `GET /auth/contexts` fresh and lists the current state | P1 | ui+e2e | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-128 | Given `GET /auth/contexts` fails, when the picker opens, then it lists the session's contexts | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-129 | Given the picker lists clinic A, suspended meanwhile, when A is picked, then «العيادة «A» موقوفة.» (en "“A” is disabled.") and the user stays on the picker | P1 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-130 | Given the picker lists a clinic deleted (or the user removed from it) meanwhile, when it is picked, then «هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.» | P1 | ui | [access § الرسائل](../features/access/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-131 | Given the picker lists clinic A where the user was deactivated meanwhile, when A is picked, then «تم إيقاف حسابك في «A». تواصل مع مالك العيادة.» and the user stays on the picker | P1 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-132 | Given the picker, when a clinic is double-clicked, then exactly one `POST /auth/context` is sent | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |

### Switching context (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-133 | Given a staff access token and the session's current cookie, when `POST /auth/context { type: "clinic", clinicId }` for a membership, then 200 `AuthResult` in that clinic, cookie rotated, and a later refresh keeps that clinic | P0 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-134 | Given a no-context token (several contexts), when switching to a clinic, then 200 (any context's token may switch) | P1 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-135 | Given a super admin, when switching to `{ type: "platform" }`, then 200 with a platform token | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-136 | Given a super admin, when switching to the template clinic, then 200 with a template context (`isTemplate: true`) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-137 | Given a staff member (not super admin), when switching to `platform`, then 403 `noAccess` | P0 | api | [auth tech § Testing notes](../features/auth/tech.md#testing-notes) |
| AUTH-138 | Given a staff member, when switching to the template clinic, then 403 `noAccess` | P0 | api | [clinic-scoping § القواعد](../features/clinic-scoping/business.md#القواعد-التشغيلية) |
| AUTH-139 | Given an existing clinic the user is not staff of, when switching to it, then 403 `noAccess` | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-140 | Given a clinic id that doesn't exist, when switching to it, then 403 `noAccess` | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-141 | Given the user's clinic A was suspended, when switching to it, then 403 `clinicSuspended` with `clinicNames: ["A"]` (the picked clinic) and the cookie kept | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-142 | Given the user's clinic was deleted (whatever its status), when switching to it, then 403 `noAccess` without `clinicNames` | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-143 | Given the user was deactivated in active clinic A, when switching to it, then 403 `staffInactive` with `clinicNames: ["A"]` | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-144 | Given the user's staff row is deactivated in clinic A, which is also suspended, when switching to it, then 403 `clinicSuspended` with `clinicNames: ["A"]` | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-145 | Given a body with an unknown `type`, or `type: "clinic"` without `clinicId`, when switching, then 403 `noAccess` | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-146 | Given a refused switch (403), when the session is refreshed, then it is still in its previous context (a switch writes only on success) | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-147 | Given only an access token (no cookie), when switching, then 401 and no `Set-Cookie` | P0 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-148 | Given a live token and **another live session's** cookie, when switching, then 401 and that cookie is kept (still refreshes) | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-149 | Given a cookie rotated less than 30 s ago, when switching with the old value, then 409 | P2 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-150 | Given a logged-out session's access token and that same session's cookie (or an unknown cookie), when switching, then 401 and the cookie is cleared | P1 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-151 | Given a logged-out session's access token and the cookie of a **new live session** (logout in one tab, login again in another, then the stale tab switches), when switching, then 401 and the live cookie is **not** cleared (it still refreshes) | P0 | api+e2e | [auth tech § Backend](../features/auth/tech.md#backend) |

### Logout

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-152 | Given a live session, when `POST /auth/logout` with its cookie, then 204, the session is revoked, the cookie cleared, and a refresh with it → 401 | P0 | api | [auth tech § API](../features/auth/tech.md#api) |
| AUTH-153 | Given no cookie, when `POST /auth/logout`, then 204 (always succeeds) | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-154 | Given a cookie rotated less than 30 s ago, when logging out with the old value, then the session is revoked | P2 | api | [auth tech § Backend](../features/auth/tech.md#backend) |
| AUTH-155 | Given a logout, when the old access token is used within 15 min, then catalog requests still succeed (documented limit); after it expires, 401 | P2 | api | [auth tech § Edge cases](../features/auth/tech.md#edge-cases--limitations) |
| AUTH-156 | Given a logged-in user, when «تسجيل الخروج» is chosen in the account menu, then `/login` opens, and opening `/drugs` afterwards redirects to `/login` | P0 | e2e | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-157 | Given the API is unreachable, when the user logs out, then they stay logged in and see an error | P1 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-158 | Given a refresh in flight, when the user logs out, then the logout waits for it and the user stays logged out | P2 | unit | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-159 | Given two tabs, when one logs out, then the other keeps working until its next refresh, which opens `/login` without a message | P1 | e2e | [auth § ما لا تدعمه](../features/auth/business.md#ما-لا-تدعمه-الميزة-حاليًا) |

### Staying logged in, routes, tokens in the browser

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-160 | Given a logged-in user in a clinic, when the page is reloaded (or the browser closed and reopened), then they stay logged in in the same clinic | P0 | e2e | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-161 | Given a logged-in tab, when a new tab of the app opens, then it is logged in (shared cookie) | P1 | e2e | [auth tech § Edge cases](../features/auth/tech.md#edge-cases--limitations) |
| AUTH-162 | Given a logged-in user, then `localStorage` holds only `language` and `prescription.lines.*` and no token is in `localStorage`/`sessionStorage` | P1 | e2e | [tech overview § Browser storage](../tech/overview.md#browser-storage) |
| AUTH-163 | Given an expired access token, when a request answers 401, then the SPA refreshes once and retries it transparently (the user sees the data) | P0 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-164 | Given several requests answer 401 at once, then one shared refresh is made and each request is retried once | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-165 | Given a refresh answers 409, then the SPA retries it once | P2 | unit | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-166 | Given an auth call stalls, then it times out after 15 s and later auth calls still run | P2 | unit | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-167 | Given a deployment over HTTPS (not localhost), when a logged-in user reloads, then they stay logged in; over plain http they must log in again | P1 | manual | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-168 | Given an anonymous user, when any app route (`/`, `/drugs`, `/protocols/1`, `/admin`, `/select-clinic`) opens, then `/login` | P0 | e2e | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-169 | Given an anonymous user opened `/drugs`, when the login lands in a clinic, then `/drugs` opens (with its query string; the home `/` never opens in between) | P1 | ui+e2e | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-170 | Given an anonymous user opened `/drugs`, when the login lands on the picker (several contexts), or opened `/admin…`, then the remembered page is not reopened (the context's home instead) | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-171 | Given a clinic context, when `/admin` (or `/admin/clinics/new`, `/admin/clinics/{id}`) opens, then `/` and no admin page or admin request shows; given the platform context, when `/drugs` opens, then `/admin`; given no context, when `/` opens, then `/select-clinic` | P0 | e2e | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-172 | Given a logged-in user, when `/login` opens, then their context's home opens (`/`, `/admin` or `/select-clinic`) | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |

### Offline start

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-173 | Given a logged-in user and an unreachable API, when the page loads, then «تعذّر الاتصال بالخادم. تحقّق من الاتصال.» with «إعادة المحاولة» shows instead of the login page | P0 | e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-174 | Given the offline screen, when the API is back and «إعادة المحاولة» is pressed, then the session is restored in the same clinic without logging in | P0 | e2e | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| AUTH-175 | Given the refresh answers 5xx at page load, then the offline screen shows (not the login page) and the cookie is kept | P1 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-176 | Given the API becomes unreachable mid-session, when an action fails, then the action shows its own error and the user stays logged in | P1 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |

### App bar, account menu, template clinic

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-177 | Given a clinic context, then the clinic name is always in the app bar (the template as «العيادة النموذجية») | P0 | e2e | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام) |
| AUTH-178 | Given the account menu, then it shows the staff name and phone, «تبديل العيادة» only when there are several contexts, and «تسجيل الخروج» | P1 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-179 | Given a clinic page with state (e.g. a search typed), when the context switches, then the page re-mounts (state reset) | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-180 | Given a super admin in the template clinic, then the banner «أنت تعدّل العيادة النموذجية. التغييرات تُنسخ إلى العيادات التي تُنشأ لاحقًا، وليس إلى العيادات الحالية.» (en "You are editing the template clinic. Changes are copied to clinics created later, not to existing ones.") shows with «العودة إلى إدارة المنصة», which switches to the platform and opens `/admin` | P1 | e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-181 | Given a super admin in the template clinic, when they add and edit an own drug (with a category) and a protocol, then it works as in any clinic; shared drugs are read-only there (CAT-021, ADM-293) | P1 | e2e | [auth § السيناريوهات](../features/auth/business.md#سيناريوهات-الاستخدام), [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |

### Losing the context mid-session

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-182 | Given a user working in clinic A with ≥ 2 other places, when the admin deactivates them in A and they act, then «لم تعد لديك صلاحية دخول «A». اختر أين تريد المتابعة.» and the picker opens | P0 | e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-183 | Given a user in clinic A with exactly one other clinic B, when they lose A and act, then «لم تعد لديك صلاحية دخول «A». أنت الآن في «B».» and B's `/` opens | P0 | e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-184 | Given a user in clinic A with no other place, when they lose A and act, then «لم تعد لديك صلاحية دخول «A» ولا أي عيادة أخرى.» and `/login` opens | P0 | e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-185 | Given the user's clinic is **suspended** while they work in it, when they act, then the clinic-lost message for their case shows and neither «هذه العيادة موقوفة.» (en "This clinic is disabled.") nor «العيادة «A» موقوفة.» shows | P1 | ui+e2e | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| AUTH-186 | Given the user's clinic is **deleted** while they work in it, when they act, then the clinic-lost message for their case shows | P1 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-187 | Given the user is **removed** from their clinic while working in it, when they act, then the clinic-lost message for their case shows | P1 | ui+e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-188 | Given the user loses the clinic, when the failing request had its own error toast, then that toast is dismissed and only the clinic-lost message shows | P1 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-189 | Given a save is sent just after the clinic was lost, then it is not replayed in the clinic the user is moved to (nothing is written anywhere) | P0 | ui+api | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-190 | Given the user was removed and re-added to the same clinic (new staff record), when a request answers 403 `noAccess`, then the SPA refreshes and replays it once and it succeeds silently (a save too) | P1 | ui+e2e | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-191 | Given a 403 `noAccess` and the refresh fails (API unreachable), then it is handled like `forbidden`: one toast of its own code «هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.» (en "This number has no access. Ask your clinic to add you."), `/me` reloaded, the user stays logged in on the page | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-192 | Given the user lost the clinic while the tab was in the background, when the tab gets the focus back, then `/me` reloads and the clinic-lost flow runs (message + move) | P1 | e2e | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-193 | Given the user lost the clinic, when they reload the page instead of acting, then the routes follow the refresh (picker / other clinic / login) without a message | P2 | e2e | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-194 | Given tab 1 switched the session to clinic B, when tab 2 (still on A) sends a request that needs a refresh, then it fails instead of being replayed in B, and no clinic-lost message shows | P1 | ui+e2e | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-195 | Given a 403 that belongs to a context already left, then it is ignored (no toast, no navigation) | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-196 | Given a super admin on the platform whose phone was removed from the settings (API restarted), when they act, then «لم تعد لديك صلاحية دخول «إدارة المنصة». سجّل الدخول من جديد للمتابعة.» and `/login` | P1 | ui+api | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |

### Several tabs

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| AUTH-197 | Given two tabs in clinic A, when tab 1 switches to B, then tab 2's next refresh moves it to B (context is per session) and it never shows A's data under B's name | P1 | e2e | [auth tech § Edge cases](../features/auth/tech.md#edge-cases--limitations) |
| AUTH-198 | Given two tabs refreshing at the same moment (localhost, Web Locks), then neither is logged out and both keep working | P2 | e2e | [auth tech § Edge cases](../features/auth/tech.md#edge-cases--limitations) |
| AUTH-199 | Given tab 1 left on the picker by user U1, when tab 2 logs out and logs in as user U2 and tab 1 then picks a clinic, then tab 1 shows «سجّل مستخدم آخر الدخول من تبويب آخر، وهذا التبويب يستخدم حسابه الآن.» (en "Another user signed in from another tab. This tab now uses that account."), opens U2's home (U2's clinic, `/admin` or the picker), sends the switch only once and shows no error toast | P1 | e2e | [auth § الرسائل](../features/auth/business.md#الرسائل-التي-تظهر-للمستخدم) |
| AUTH-200 | Given the same stale tab, when «العودة إلى إدارة المنصة» or «تعديل العيادة النموذجية» is used, then the same toast and U2's home: the button itself neither opens `/admin` / `/drugs` nor shows an error | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-201 | Given another user signed in from another tab, then tab 1 never shows U1's data or `/me` (name, permissions) once it follows U2 (the query cache is cleared on a change of user) | P1 | ui+e2e | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-202 | Given tab 2 logged out and back in as the **same** user, when tab 1 picks a clinic, then the switch is retried after the refresh and succeeds (no other-user toast) | P2 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| AUTH-203 | Given `switchSessionContext` gets 401 and the refresh returns a token of another `sub`, then it rejects with `OtherUserSignedInError`, calls the other-user handler once and doesn't post the switch again | P2 | unit | [auth tech § Frontend](../features/auth/tech.md#frontend) |

## ISO — Clinic isolation

Sources: [clinic-scoping business](../features/clinic-scoping/business.md), [clinic-scoping tech](../features/clinic-scoping/tech.md),
[tech overview § Conventions](../tech/overview.md#conventions), [auth business § القواعد](../features/auth/business.md#القواعد-التشغيلية).
Setup for the API cases: clinics A and B, each with its own drugs and protocols; the caller is staff of A with every
permission (Owner) unless stated.

### Catalog routes across clinics (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ISO-001 | Given an A token, when `GET /drugs`, then A's own drugs and the active shared drugs are listed and `totalCount` = A's own + the shared ones (the baseline's 23,414), never B's own; with `source=own`, only A's drugs and `totalCount` counts only them | P0 | api | [clinic-scoping tech § API](../features/clinic-scoping/tech.md#api), [design D1](../design/m1.7-shared-catalog.md#d1-one-drugs-table-clinicid-null--shared) |
| ISO-002 | Given a drug name that exists only in B (also absent from the shared catalog: names, hidden Arabic names, ingredients, category names), when A searches for it, then no results | P0 | api | [clinic-scoping § السيناريوهات](../features/clinic-scoping/business.md#سيناريوهات-الاستخدام), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| ISO-003 | Given B's drug id, when A calls `GET /drugs/{id}`, then 404 `notFound` | P0 | api | [clinic-scoping § القواعد](../features/clinic-scoping/business.md#القواعد-التشغيلية) |
| ISO-004 | Given B's drug id, when A calls `PUT /drugs/{id}` with a valid body, then 404 `notFound` and B's drug is unchanged | P0 | api | [clinic-scoping tech § API](../features/clinic-scoping/tech.md#api) |
| ISO-005 | Given B's drug id, when A calls `DELETE /drugs/{id}`, then 404 and B's drug and B's protocol lines using it are intact | P0 | api | [clinic-scoping tech § API](../features/clinic-scoping/tech.md#api) |
| ISO-006 | Given B's drug id, when A calls `GET /drugs/{id}/protocols`, then 200 `[]` | P1 | api | [clinic-scoping tech § API](../features/clinic-scoping/tech.md#api) |
| ISO-007 | Given an A token, when `GET /protocols`, then only A's protocols, and their items name only A's own drugs or shared drugs, never B's own | P0 | api | [clinic-scoping tech § API](../features/clinic-scoping/tech.md#api), [design § 6](../design/m1.7-shared-catalog.md#6-clinic-isolation-after-m17) |
| ISO-008 | Given B's protocol id, when A calls `GET /protocols/{id}`, then 404 `notFound` | P0 | api | [clinic-scoping tech § API](../features/clinic-scoping/tech.md#api) |
| ISO-009 | Given B's protocol id, when A calls `PUT /protocols/{id}` with A's drugs, then 404 and B's protocol is unchanged | P0 | api | [clinic-scoping tech § API](../features/clinic-scoping/tech.md#api) |
| ISO-010 | Given B's protocol id, when A calls `PUT /protocols/{id}` with a B drug in `items`, then 400 `drugNotFound` (checked before the 404) and nothing changes | P2 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| ISO-011 | Given B's protocol id, when A calls `DELETE /protocols/{id}`, then 404 and B's protocol is intact | P0 | api | [clinic-scoping tech § API](../features/clinic-scoping/tech.md#api) |
| ISO-012 | Given A creates a protocol whose `items` hold a B drug id, then 400 `drugNotFound` and no protocol is created | P0 | api | [clinic-scoping § القواعد](../features/clinic-scoping/business.md#القواعد-التشغيلية) |
| ISO-013 | Given A's own protocol, when A saves it with a B drug added, then 400 `drugNotFound` and the protocol is unchanged | P0 | api | [clinic-scoping tech § API](../features/clinic-scoping/tech.md#api) |
| ISO-014 | Given a B drug id and an id that never existed, when A asks for each, then both answers are identical (404 `notFound`, same shape): another clinic's row is indistinguishable from a missing one | P1 | api | [clinic-scoping § القواعد](../features/clinic-scoping/business.md#القواعد-التشغيلية) |
| ISO-015 | Given A creates a drug, then it is stored with A's `ClinicId` and B can't see it | P0 | api | [clinic-scoping § السيناريوهات](../features/clinic-scoping/business.md#سيناريوهات-الاستخدام) |
| ISO-016 | Given A creates a protocol, then the protocol and each of its lines are stored with A's `ClinicId` | P1 | api | [clinic-scoping tech § Backend](../features/clinic-scoping/tech.md#backend) |
| ISO-017 | Given the template's own drug and protocol ids, when A asks for them (GET/PUT/DELETE), then 404, and A's own list (`source=own`) doesn't contain the template rows (A's copies have their own ids); shared drug ids are the same in A and the template by design (not copies) | P0 | api | [clinic-scoping § القواعد](../features/clinic-scoping/business.md#القواعد-التشغيلية), [design D1](../design/m1.7-shared-catalog.md#d1-one-drugs-table-clinicid-null--shared) |
| ISO-018 | Given A has a protocol, when A calls `GET /drugs/{id}/protocols` for one of its drugs, then only A's protocol names are listed | P2 | api | [clinic-scoping tech § API](../features/clinic-scoping/tech.md#api) |
| ISO-044 | Given A's own drug id, when B calls `GET /drugs/{id}`, `/drugs/{id}/protocols`, PUT or DELETE, then 404, identical to a missing id (shared drugs changed nothing for own drugs) | P0 | api | [design § 6](../design/m1.7-shared-catalog.md#6-clinic-isolation-after-m17) |
| ISO-045 | Given A's own drug, when B creates a protocol with it, then 400 `drugNotFound`; with a shared drug instead → 201 | P0 | api | [design § 6](../design/m1.7-shared-catalog.md#6-clinic-isolation-after-m17) |
| ISO-046 | Given `GET /admin/drugs?search=<A's own drug name>`, then nothing (the platform filter hides own drugs from the super admin's catalog search too) | P1 | api | [design § 6](../design/m1.7-shared-catalog.md#6-clinic-isolation-after-m17) |

### The clinic comes from the token only

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ISO-019 | Given an A token, when `POST /drugs` or `PUT /drugs/{id}` carries `clinicId: B` in the body, then it is ignored (the row is A's) | P0 | api | [tech overview § Conventions](../tech/overview.md#conventions) |
| ISO-020 | Given an A token, when a catalog request carries `?clinicId=B`, then it is ignored (A's data) | P1 | api | [tech overview § Conventions](../tech/overview.md#conventions) |
| ISO-021 | Given an A token, when a request carries the old `X-Dev-Clinic-Id: B` header (Development too), then it is ignored (A's data) | P1 | api | [clinic-scoping tech § Backend](../features/clinic-scoping/tech.md#backend) |
| ISO-022 | Given an A access token, when the same session switches to B, then the old token still reads A only (the token's `clinic_id` decides, until it expires) | P1 | api | [auth tech § Summary](../features/auth/tech.md#summary) |
| ISO-023 | Given a token signed with the test key whose `clinic_id` is B but whose `staff_id` belongs to A, when it reads `/drugs`, then 403 `noAccess` and no B data | P0 | api | [access tech § Backend](../features/access/tech.md#backend) |
| ISO-024 | Given a token signed with the test key with B's `clinic_id` and no `staff_id`, for a user who is not a super admin, then 403 `noAccess` | P1 | api | [access tech § Backend](../features/access/tech.md#backend) |

### Template clinic

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ISO-025 | Given the super admin in the template, when they list drugs and protocols, then the template's own drugs + every active shared drug (CAT-014), and only the template's protocols | P1 | api | [clinic-scoping § القواعد](../features/clinic-scoping/business.md#القواعد-التشغيلية), [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |
| ISO-026 | Given clinic A created from the template, when the super admin edits or deletes a template own drug or protocol, then A's copy is unchanged (shared drugs aren't editable from the template) | P0 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية), [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| ISO-027 | Given clinic A created from the template, when A edits or deletes its copy (its own-drug copies and protocols), then the template is unchanged; shared drugs aren't copies and A can't edit them | P0 | api | [clinic-scoping § القواعد](../features/clinic-scoping/business.md#القواعد-التشغيلية), [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| ISO-028 | Given the template was edited, when a new clinic is created afterwards, then it gets the edited template own drugs and protocols; protocol lines on shared drugs keep the same shared ids (CAT-219) | P1 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية), [design § 9 M1.7b](../design/m1.7-shared-catalog.md#9-sub-features) |
| ISO-029 | Given staff of any clinic, then the template never appears in their contexts, picker or lists | P0 | api+e2e | [clinic-scoping § القواعد](../features/clinic-scoping/business.md#القواعد-التشغيلية) |

### Database guards

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ISO-030 | Given no clinic in the request context, when clinic-owned rows are queried, then none are returned (the filter fails closed); `Drugs` returns only the shared rows | P1 | api | [clinic-scoping tech § Backend](../features/clinic-scoping/tech.md#backend), [design D1](../design/m1.7-shared-catalog.md#d1-one-drugs-table-clinicid-null--shared) |
| ISO-031 | Given no clinic in the request context, when a clinic-owned row is saved, then `InvalidOperationException` and nothing is written; for `Drug`, adding a row with no clinic throws unless inside `UseSharedCatalog()` (CAT-025) | P1 | api | [clinic-scoping tech § Backend](../features/clinic-scoping/tech.md#backend), [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| ISO-032 | Given clinic A in context, when a row with `ClinicId = B` is added, or a row loaded from B (ignoring the filter) is modified or deleted, then the save throws; so does a shared row modified in a clinic context or deleted in any context (CAT-024, CAT-026), a `ClinicId` change (CAT-027), a dosing on a shared row or an own row marked withdrawn (CAT-028) | P1 | api | [clinic-scoping tech § Backend](../features/clinic-scoping/tech.md#backend), [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| ISO-033 | Given A's protocol, when `PUT /protocols/{id}` replaces a stored line's drug with B's own drug id, then 400 `drugNotFound` and the stored lines are unchanged: `FK_ProtocolItems_Drugs_DrugId_ClinicId` no longer exists and nothing in the database replaces it, the protocol handlers look drugs up through the clinic filter (direct SQL is not guarded) | P1 | api | [clinic-scoping tech § Data model](../features/clinic-scoping/tech.md#data-model), [design D4](../design/m1.7-shared-catalog.md#d4-protocol-lines-and-the-guards) |
| ISO-034 | Given raw SQL, when a protocol item with A's `ClinicId` points to B's protocol, then the insert fails on `FK_ProtocolItems_Protocols_ProtocolId_ClinicId` | P1 | api | [clinic-scoping tech § Data model](../features/clinic-scoping/tech.md#data-model) |
| ISO-035 | Given raw SQL, when a staff role links A's staff to B's role, then the insert fails (composite FK `(RoleId, ClinicId)` → `Roles`) | P1 | api | [access tech § Data model](../features/access/tech.md#data-model) |
| ISO-036 | Given a template already exists, when a second clinic with `IsTemplate = true` is inserted, then the partial unique index rejects it | P2 | api | [clinic-scoping tech § Data model](../features/clinic-scoping/tech.md#data-model) |

### Timestamps

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ISO-037 | Given a new drug, protocol or line, then `CreatedAt = UpdatedAt` = now (UTC) | P2 | api | [clinic-scoping tech § Backend](../features/clinic-scoping/tech.md#backend) |
| ISO-038 | Given a drug edit, then only `UpdatedAt` moves (`CreatedAt` kept), also for a dosing-only change | P2 | api | [clinic-scoping tech § Backend](../features/clinic-scoping/tech.md#backend) |
| ISO-039 | Given a protocol save that changes only its lines, then the protocol's `UpdatedAt` moves | P2 | api | [clinic-scoping tech § Backend](../features/clinic-scoping/tech.md#backend) |

### In the browser

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ISO-040 | Given a user on A's drugs page, when they switch to B, then only B's own drugs (+ the shared ones) and B's protocols show, with no moment of A's data (no A own drug or protocol ever shows; cache cleared, in-flight queries cancelled) | P0 | e2e | [auth tech § Frontend](../features/auth/tech.md#frontend), [design § 6](../design/m1.7-shared-catalog.md#6-clinic-isolation-after-m17) |
| ISO-041 | Given a slow A query in flight, when the context switches to B, then its answer never renders in B | P1 | ui | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| ISO-042 | Given a prescription line added in A, when the user switches to B, then B's prescription is its own (empty at first); back in A, the line is still there (`prescription.lines.<clinicId>`) | P0 | e2e | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| ISO-043 | Given A's user opens the URL of B's protocol (`/protocols/{B id}`), then «هذا العنصر لم يعد موجودًا.» (en "This item no longer exists.") | P1 | e2e | [clinic-scoping § الرسائل](../features/clinic-scoping/business.md#الرسائل-التي-تظهر-للمستخدم) |

## ACC — Permissions and access

Sources: [access business](../features/access/business.md), [access tech](../features/access/tech.md),
[tech overview § Conventions](../tech/overview.md#conventions), [access § القواعد](../features/access/business.md#القواعد-التشغيلية).

### Permission catalog

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ACC-001 | Given a clinic token, when `GET /permissions`, then 200 with 11 entries `{ key, module, resource, action, requires[] }` in order `drugs.list, drugs.details, drugs.create, drugs.update, drugs.delete, protocols.list, protocols.details, protocols.create, protocols.update, protocols.delete, prescriptions.create` | P1 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-002 | Given `GET /permissions`, then `module` is `catalog` for the 10 drug/protocol keys and `prescription` for `prescriptions.create` | P2 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-003 | Given `GET /permissions`, then `requires` holds the direct requirements only (not transitive), as in the business table: `drugs.details`, `drugs.create` → `drugs.list`; `drugs.update`, `drugs.delete` → `drugs.details`; `protocols.details`, `protocols.delete` → `protocols.list`; `protocols.create` → `protocols.list` + `drugs.list`; `protocols.update` → `protocols.details` + `drugs.list`; `prescriptions.create` → `drugs.list` | P1 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-004 | Given a platform or no-context token, when `GET /permissions`, then 200; without a token, 401 | P1 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-005 | Given a permission set `{drugs.update}`, when expanded (`PermissionSet.Of`), then it holds `drugs.update`, `drugs.details`, `drugs.list` (transitive); `{protocols.update}` → + `protocols.details`, `protocols.list`, `drugs.list` | P1 | unit | [access tech § Backend](../features/access/tech.md#backend) |
| ACC-006 | Given `PermissionSet`, then `Has`, `HasAll`, `HasAny`, `IsAll` and `ToList()` (catalog order) answer correctly, incl. the Owner's "all" (a role set holding every key is not `IsAll`; `HasAll()` of no key is true, `HasAny()` of no key false) | P2 | unit | [access tech § Backend](../features/access/tech.md#backend) |
| ACC-007 | Given a bad declaration (key not `resource.action`, duplicate key, unknown requirement, resource class without a module, key prefix ≠ class), when the catalog is built, then it throws (the app refuses to start) | P2 | unit | [access tech § Backend](../features/access/tech.md#backend) |
| ACC-008 | Given the SPA's `permissions.ts`, then it holds exactly the backend's 11 keys | P1 | unit | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-009 | Given every permission key, resource and module, then `en.ts` and `ar.ts` have its label (`permissions.*`, `permissionResources.*`, `permissionModules.*`); e.g. `drugs.delete` = «حذف الأدوية» | P2 | unit | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |

### Default roles and who can do what

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ACC-010 | Given an Owner, when `GET /me`, then all 11 keys and the context's `roles` = `["Owner"]`; every catalog call on own drugs succeeds, and `PUT`/`DELETE /drugs/{shared id}` → 409 `sharedDrugReadOnly` (CAT-019) | P0 | api | [access § المستخدمون](../features/access/business.md#المستخدمون), [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| ACC-011 | Given a Doctor, when they delete an own drug and a protocol, then 204 each; `/me` lists 11 keys | P0 | api | [access § الأدوار الافتراضية](../features/access/business.md#الأدوار-الافتراضية-في-كل-عيادة) |
| ACC-012 | Given an Assistant, when `DELETE /drugs/{id}` or `DELETE /protocols/{id}`, then 403 `forbidden` and the row still exists; create and update succeed | P0 | api | [access § الأدوار الافتراضية](../features/access/business.md#الأدوار-الافتراضية-في-كل-عيادة) |
| ACC-013 | Given a read-only role (`drugs.list`, `drugs.details`, `protocols.list`, `protocols.details`), when it calls the GETs, then 200; every POST/PUT/DELETE on drugs and protocols → 403 `forbidden`; `/me` = 4 keys | P1 | api | [access tech § Dev seed](../features/access/tech.md#dev-seed) |
| ACC-014 | Given the super admin in the template, when `GET /me`, then 11 keys and `staff: null`; creating and deleting a drug succeed | P0 | api | [access § المستخدمون](../features/access/business.md#المستخدمون) |
| ACC-015 | Given a super admin who is also staff of a regular clinic with only the Assistant role, when they work in that clinic, then they have the Assistant's 9 keys (not all) | P1 | api | [access tech § Backend](../features/access/tech.md#backend) |
| ACC-016 | Given a staff member with two roles, then `/me` and the API allow the union of both roles' permissions | P0 | api | [access § المستخدمون](../features/access/business.md#المستخدمون) |
| ACC-017 | Given a staff member with the Owner role and another role, then they have every permission | P2 | api | [access tech § Backend](../features/access/tech.md#backend) |
| ACC-018 | Given a role stored with `drugs.update` only (rows edited by hand), when its holder calls `GET /drugs/{id}`, then 200 (requirements are added when reading) | P1 | api | [access tech § Backend](../features/access/tech.md#backend) |
| ACC-019 | Given a `RolePermissions` row with a key not in the catalog, when its holder works, then the key is ignored (no error, grants nothing) | P2 | api | [access tech § Data model](../features/access/tech.md#data-model) |
| ACC-020 | Given a staff member with no role (database edit), then every catalog route → 403 `forbidden` and `/me` permissions = `[]` | P2 | api | [access tech § Backend](../features/access/tech.md#backend) |
| ACC-021 | Given a clinic's roles, then a second `IsOwner` role in the same clinic is rejected by the partial unique index | P2 | api | [access tech § Data model](../features/access/tech.md#data-model) |

### Endpoint gating (API): one permission per endpoint

Each row: a role holding the key (stored alone; its requirements are added) → 2xx; a role holding only the key's
requirements → 403 `forbidden`.

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ACC-022 | `GET /drugs` needs `drugs.list` | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-023 | `GET /drugs/{id}` needs `drugs.details` | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-024 | `GET /drugs/{id}/protocols` needs `drugs.details` | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-025 | `POST /drugs` needs `drugs.create` (without it: 403 and no drug created) | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-026 | `PUT /drugs/{id}` needs `drugs.update` (without it: 403 and the drug unchanged) | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-027 | `DELETE /drugs/{id}` needs `drugs.delete` (without it: 403 and the drug kept) | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-028 | `GET /protocols` needs `protocols.list` | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-029 | `GET /protocols/{id}` needs `protocols.details` | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-030 | `POST /protocols` needs `protocols.create` (without it: 403, nothing created) | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-031 | `PUT /protocols/{id}` needs `protocols.update` (without it: 403, unchanged) | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-032 | `DELETE /protocols/{id}` needs `protocols.delete` (without it: 403, kept) | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-033 | Given a forbidden request with an invalid body (e.g. Assistant `DELETE`, Viewer `POST /drugs` with an empty name), then 403 `forbidden` (permission checked before model binding and validation, so even a body that is not JSON gets 403) | P2 | api | [access tech § Backend](../features/access/tech.md#backend) |

### Clinic access checks and 403 codes

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ACC-034 | Given a platform token, when any catalog route is called, then 403 `forbidden` | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-035 | Given a no-context token, when any catalog route is called, then 403 `forbidden` | P0 | api | [auth tech § API](../features/auth/tech.md#api) |
| ACC-036 | Given a deactivated staff member (active clinic) with a valid token, when any catalog route is called, then 403 `noAccess` | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-037 | Given a staff member whose staff row was removed, when any catalog route is called with their token, then 403 `noAccess` | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-038 | Given a suspended clinic, when its staff call any catalog route, then 403 `clinicSuspended` | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-039 | Given a deleted clinic (also when it is suspended), when its staff call any catalog route, then 403 `noAccess` (never `clinicSuspended`) | P0 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-040 | Given a deactivated staff member in a suspended clinic, then `clinicSuspended`; after the clinic is activated, then `noAccess` | P1 | api | [access tech § Testing notes](../features/access/tech.md#testing-notes) |
| ACC-041 | Given a suspended clinic and a missing permission, then `clinicSuspended`; given a deactivated staff member and a missing permission, then `noAccess` (`clinicSuspended` > `noAccess` > `forbidden`) | P1 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-042 | Given a super admin's template token, when the user is no longer a super admin, then catalog routes → 403 `noAccess` | P1 | api | [access tech § Backend](../features/access/tech.md#backend) |
| ACC-043 | Given the template suspended in the database, when the super admin works in it, then 403 `clinicSuspended` | P2 | api | [access tech § Backend](../features/access/tech.md#backend) |
| ACC-044 | Given a token with mismatching ids (signed with the test key) was used, when the real owner's token is used afterwards, then it still answers 200 (the forged one got its own cache entry) | P2 | api | [access tech § Cache](../features/access/tech.md#cache-accesscache) |
| ACC-045 | Given a clinic token of a user who lost that clinic (deactivated, removed, clinic suspended or deleted), when `GET /me`, then 200 with `context: null`, `staff: null`, `permissions: []` (the SPA then re-checks) | P1 | api | [auth tech § API](../features/auth/tech.md#api) |

### Changes while the user works (API, post-commit invalidation, no waiting)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ACC-046 | Given an Assistant's cache is warm, when the admin removes `drugs.create` from the Assistant role, then their next `POST /drugs` (same token) → 403 `forbidden` while `GET /drugs` still answers 200; restored → `POST` 201 | P0 | api | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| ACC-047 | Given an Assistant's cache is warm, when the admin adds `drugs.delete` to the Assistant role, then their next `DELETE /drugs/{id}` → 204 | P1 | api | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| ACC-048 | Given an Assistant's cache is warm, when the admin gives them the Doctor role, then their next delete succeeds; when it is taken away again, then 403 | P1 | api | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| ACC-049 | Given a warm cache, when the admin deactivates the staff member, then their next request → 403 `noAccess`; reactivated → 200 with the same token | P0 | api | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| ACC-050 | Given a warm cache, when the admin removes the staff member, then their next request → 403 `noAccess` and the clinic leaves `/auth/contexts`; re-added → 200 after a refresh | P0 | api | [access tech § Testing notes](../features/access/tech.md#testing-notes) |
| ACC-051 | Given a warm cache, when the admin suspends the clinic, then the next request of each of its staff → 403 `clinicSuspended`; activated → 200 | P0 | api | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| ACC-052 | Given a warm cache, when the admin deletes the clinic, then the next request → 403 `noAccess` and the clinic leaves `/auth/contexts` | P0 | api | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| ACC-053 | Given a staff member deactivated directly in the database, when the user's session refreshes (moving to their other clinic), then the old clinic token → 403 `noAccess` at once | P2 | api | [access tech § Cache](../features/access/tech.md#cache-accesscache) |
| ACC-054 | Given a change made directly in the database without a refresh (staff flag, or a role's permissions), then it applies within about 30 s (documented, not automated: design D3) | P2 | manual | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| ACC-055 | Given 20 parallel requests right after login, then all answer 200 and the staff access is loaded once | P2 | api | [access tech § Cache](../features/access/tech.md#cache-accesscache) |
| ACC-056 | Given a cache miss shared by several requests, when the first request is aborted, then the others still succeed | P2 | api | [access tech § Cache](../features/access/tech.md#cache-accesscache) |

### Gating in the UI

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ACC-057 | Given Owner, Doctor or Assistant, then the sidebar shows Prescription, Protocols and Drugs; given the read-only role, only Protocols and Drugs | P0 | e2e | [access § السيناريوهات](../features/access/business.md#سيناريوهات-الاستخدام) |
| ACC-058 | Given a role without `prescriptions.create`, when `/` opens, then the first allowed page opens (read-only role → `/protocols`) | P0 | e2e | [access § السيناريوهات](../features/access/business.md#سيناريوهات-الاستخدام) |
| ACC-059 | Given a role that can open no page, when `/` opens, then the no-permission page shows without its home link (no loop) | P2 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-060 | Given a URL the user may not open (read-only role → `/protocols/new`), then «لا توجد صلاحية» + «ليست لديك صلاحية لفتح هذه الصفحة. اطلبها من مالك العيادة إن احتجت إليها.» + «الذهاب إلى صفحة البداية» (en "No permission" + "You don't have permission to open this page. Ask the clinic owner if you need it." + "Go to the start page") | P0 | e2e | [access § الرسائل](../features/access/business.md#الرسائل-التي-تظهر-للمستخدم) |
| ACC-061 | Given the read-only role on Drugs, then no «إضافة دواء», no Actions column, and a row opens the read-only drug details dialog (also with Enter/Space) | P0 | e2e | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-062 | Given an Assistant on Drugs, then Add shows, the edit icon shows on own rows only, the delete icon does not, and an own row opens the editor; shared rows have no edit icon and open the read-only details | P0 | e2e | [access § السيناريوهات](../features/access/business.md#سيناريوهات-الاستخدام), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| ACC-063 | Given a role with `drugs.list` only, then drug rows (own and shared) don't open and aren't focusable, and the Actions column is hidden (the shared details need `drugs.details`, like own rows) | P2 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| ACC-064 | Given Protocols without `protocols.create` / `protocols.update` / `protocols.delete`, then «بروتوكول جديد», the edit link and the delete icon are hidden each, and the actions bar is hidden when neither edit nor delete applies | P1 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-065 | Given Protocols without `protocols.details`, then a card doesn't open the protocol | P2 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-066 | Given an Assistant in the protocol editor, then Delete is shown disabled, and hovering or tapping it shows «ليست لديك صلاحية» (en "You don't have permission") | P1 | ui+e2e | [access § الرسائل](../features/access/business.md#الرسائل-التي-تظهر-للمستخدم) |
| ACC-067 | Given the protocol editor, when Save, Cancel or Back is used, then `/protocols` opens | P2 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-068 | Given the prescription page, then the Protocols tab shows only with `protocols.list` and the Drugs tab only with `drugs.list`, and the visible one has the focus | P1 | ui | [access § الصلاحيات](../features/access/business.md#الصلاحيات) |
| ACC-069 | Given a catalog panel with neither tab allowed (component test), then «ليست لديك صلاحية للبحث في الأدوية أو البروتوكولات.» | P2 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-070 | Given `PermissionButton` / `PermissionIconButton` / `PermissionMenuItem` / `PermissionFab` / `withPermission` / `<Can>`, then denied → hidden by default, `whenDenied="disable"` → disabled with the tooltip on a wrapping span; `anyOf` / `allOf` rules hold | P1 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-071 | Given `/me` is loading, when a gated route opens, then a spinner until it answers | P2 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-072 | Given `/me` fails (network or 5xx), when a gated route opens, then the load error with «إعادة المحاولة» (showing progress) shows, not the no-permission page; Retry recovers | P1 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-073 | Given each default role and the read-only role, when they visit every page they can open, then no request answers 403 (pages never call endpoints they may not use) | P1 | e2e | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-091 | Given `drugs.delete` (so `drugs.details`), then shared rows have no delete button and `GET /drugs/{shared id}/protocols` is never called for them | P2 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |

### Permission changes in the open app

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ACC-074 | Given an Assistant on the Protocols page, when `protocols.list` is removed from their role and the next protocols request runs, then one toast «غير مسموح لك بهذا الإجراء.» (en "You are not allowed to do this."), `/me` reloads, Protocols leaves the sidebar and the no-permission page shows | P0 | e2e | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| ACC-075 | Given an Assistant editing a drug, when `drugs.update` is removed and they save, then «غير مسموح لك بهذا الإجراء.» shows, nothing is saved, `/me` reloads and the edit controls disappear | P1 | e2e | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| ACC-076 | Given a permission was given or taken while the user was in another program, when the app's tab gets the focus back, then `/me` reloads and the UI updates without any action | P1 | e2e | [access § القواعد](../features/access/business.md#القواعد-التشغيلية) |
| ACC-077 | Given several queries answer 403 `forbidden` at once, then one toast only (one toast id) | P2 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |
| ACC-078 | Given the context switches, then `usePermissions()` re-renders with the new context's `/me` (no permissions of the old clinic) | P1 | ui | [access tech § Frontend](../features/access/tech.md#frontend-srcfeaturesaccess) |

### `/me`

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ACC-079 | Given a clinic token, when `GET /me`, then `{ user: { id, phone (E.164), isSuperAdmin: false }, context, staff: { id, fullName }, permissions }` with the expanded keys in catalog order | P1 | api | [auth tech § API](../features/auth/tech.md#api) |
| ACC-080 | Given a platform token, when `GET /me`, then `isSuperAdmin: true`, `staff: null`, `permissions: []` | P1 | api | [access tech § Edge cases](../features/access/tech.md#edge-cases--limitations) |
| ACC-081 | Given a no-context token, when `GET /me`, then `context: null`, `permissions: []` | P2 | api | [access tech § API](../features/access/tech.md#api) |
| ACC-082 | Given no token, when `GET /me`, then 401 | P1 | api | [auth tech § API](../features/auth/tech.md#api) |
| ACC-083 | Given a staff member with several roles, then `Context.roles` lists Owner first, then the others by name; in the template, `[]` | P2 | api | [access tech § API](../features/access/tech.md#api) |

### Rename groups → protocols (M1.7a)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ACC-084 | Given the permission catalog after M1.7a, then `protocols.list/details/create/update/delete` exist with the same requirements as the old `groups.*`, and no `groups.*` key remains | P0 | api | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| ACC-085 | Given a role holding `groups.update` before the migration, then after it the role holds `protocols.update` (+ its requirements), and on a freshly started app (as after a deploy) its staff keep the same rights at their next request, without logging in again | P0 | api | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| ACC-086 | Given the role editor, then the resource reads «البروتوكولات» / "Protocols" in the module «الأدوية والبروتوكولات» / "Drugs and protocols", and its permissions «عرض قائمة البروتوكولات والبحث فيها», «فتح بروتوكول», «إضافة بروتوكولات», «تعديل البروتوكولات», «حذف البروتوكولات» (en "See the protocol list and search it", "Open a protocol", "Add protocols", "Edit protocols", "Delete protocols") | P1 | ui | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| ACC-088 | Given `RenameGroupsToProtocols`, then only keys **starting** with `groups.` change, the rows of every clinic (deleted ones and the template included) move, and no role ends up with a duplicate key | P1 | api | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| ACC-089 | Given `DefaultRoles` and the dev seed after M1.7a, then no `groups.*` key anywhere, and the Viewer keeps exactly `drugs.list`, `drugs.details`, `protocols.list`, `protocols.details` | P1 | api | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |

## ERR — Error contract (ProblemDetails)

Sources: [tech overview § Errors](../tech/overview.md#errors-problemdetails), [architecture § 6](../design/architecture.md#6-errors-problemdetails),
[architecture § 3.3](../design/architecture.md#33-error-catalog), [tech overview § Data fetching](../tech/overview.md#data-fetching).

### Shape

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ERR-001 | Given any error (one per status: 400, 401, 403, 404, 405, 409, 429, 500), then the body is `application/problem+json` with `type = "https://httpstatuses.io/<status>"`, `title` (400 "Validation failed", 401 "Unauthorized", 403 "Forbidden", 404 "Not found", 405 "Method not allowed", 409 "Conflict", 429 "Too many requests", 500 "Unexpected error"), `status`, `detail`, `instance` (the request path), `code`, `errors[]` and `traceId` | P0 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-002 | Given `POST /drugs` with a valid `categoryId`, an empty name and an invalid default dosing, then 400 with `code: "nameRequired"` and `errors` = `[{ nameRequired, field: "name" }, { invalidDosing, field: "defaultDosing" }]` in that order, each with a `description` (without a category, `categoryRequired` would come third) | P0 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails), [design § 7](../design/m1.7-shared-catalog.md#7-errors-new-and-renamed) |
| ERR-003 | Given any error, then `detail` = the first error's English description | P2 | api | [architecture § 6](../design/architecture.md#6-errors-problemdetails) |
| ERR-004 | Given two failing requests, then each has a non-empty, different `traceId` | P2 | api | [architecture § 6](../design/architecture.md#6-errors-problemdetails) |
| ERR-005 | Given a successful response, then it is plain data (no ProblemDetails fields) | P2 | api | [architecture § 8](../design/architecture.md#8-conventions-summary) |
| ERR-006 | Given a 201 Created (e.g. `POST /drugs`), then `Location` is lowercase (`/api/v1/drugs/{id}`) | P2 | api | [architecture § Part 3](../design/architecture.md#part-3-what-was-done) |

### Status by error type

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ERR-007 | Given no or an invalid token, then 401 `unauthorized` in the same ProblemDetails shape (from the JWT handler) | P0 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-008 | Given 403 `clinicSuspended` or `staffInactive` from login or the clinic picker, then the ProblemDetails also has `clinicNames` (a string array) and the rest of the shape is unchanged; every other error (incl. `noAccess`, and `clinicSuspended` from a request inside a clinic) has no `clinicNames` | P1 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-009 | Given an MVC bare status not produced by `ApiProblemFactory` directly, then it is completed with `code` from the status (401 `unauthorized`, 403 `forbidden`, 404 `notFound`, 405 `methodNotAllowed`, 409 `conflict`, 429 `tooManyRequests`, 5xx `unexpected`, other `invalidRequest`) | P2 | unit | [architecture § 6](../design/architecture.md#6-errors-problemdetails) |

### Invalid bodies

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ERR-010 | Given a request the model binding can't read (malformed JSON on `POST /drugs`, or unreadable query values: `GET /drugs?page=first&pageSize=many`), then 400 `invalidRequest` with one error per model-state error, each with its `field` (the query case: two errors, on `page` and `pageSize`) | P1 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-011 | Given a wrong type (e.g. `name: 123`, `items: "x"`), then 400 `invalidRequest` with the field named | P1 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-012 | Given an empty body on `POST /drugs` and `POST /auth/otp/verify`, then 400 `invalidRequest` | P1 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-013 | Given a malformed body outside Development (the Testing environment), then each error keeps its `field` but the description is generic (no parser message, no CLR type names) | P1 | api | [architecture § 6](../design/architecture.md#6-errors-problemdetails) |
| ERR-014 | Given a malformed body in Development, then each error carries the parser's message | P2 | api | [architecture § 6](../design/architecture.md#6-errors-problemdetails) |

### Routing

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ERR-015 | Given `GET /api/v1/unknown`, then 404 `notFound` ProblemDetails (never the SPA's `index.html`) | P0 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-016 | Given a non-GET method on an unknown `/api` route (e.g. `POST /api/v1/unknown`), then 405 `methodNotAllowed` (documented quirk) | P2 | api | [architecture § Carry-over](../design/architecture.md#carry-over-to-m15) |
| ERR-017 | Given a wrong method on a known route (e.g. `PATCH /api/v1/drugs/1`, `DELETE /api/v1/permissions`), then 405 `methodNotAllowed` ProblemDetails | P1 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-018 | Given an id that is not a whole number in any `{id:int}` route (`/api/v1/drugs/abc`, `/api/v1/protocols/abc`, `/api/v1/drugs/abc/protocols`, the admin clinic/role/staff routes), then the methods that route has (`GET`, `PUT`, `DELETE` on `/drugs/abc`; `POST` on `/admin/clinics/abc/suspend`) and `GET` always → 404 `notFound`, the other methods (`POST`, `PATCH` on `/drugs/abc`; `PUT` on `/admin/clinics/abc/suspend`) → 405 `methodNotAllowed` ProblemDetails | P2 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-019 | Given a client route (e.g. `/drugs`, `/protocols/5`) requested from the server, then 200 `index.html` (deep links and reloads work) | P1 | api+e2e | [tech overview § Runtime](../tech/overview.md#runtime-architecture) |

### Unexpected errors

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ERR-020 | Given an unhandled exception outside Development, then 500 `unexpected` ProblemDetails with no exception message or stack | P1 | api | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-021 | Given an unhandled exception in Development, then 500 with `detail` = the message and `exception` = the full text | P2 | api | [architecture § 6](../design/architecture.md#6-errors-problemdetails) |
| ERR-022 | Given a 500 on an action (e.g. saving a drug or protocol), then the toast «حدث خطأ ما. حاول مرة أخرى.» (en "Something went wrong. Please try again.") | P1 | ui | [tech overview § Conventions](../tech/overview.md#conventions) |

### Reading errors in the SPA

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ERR-023 | Given an axios error with a ProblemDetails body, then `toApiError` returns `{ status, code, errors, traceId }`; without an HTTP response, `null` | P1 | unit | [tech overview § Data fetching](../tech/overview.md#data-fetching) |
| ERR-024 | Given a code with an `errors.<code>` key, then `getErrorMessage` returns that translation | P1 | unit | [tech overview § Data fetching](../tech/overview.md#data-fetching) |
| ERR-025 | Given a 404 whose code has no key, then `errors.notFound`; no response, then `errors.network`; anything else, then `errors.generic` | P1 | unit | [tech overview § Data fetching](../tech/overview.md#data-fetching) |
| ERR-026 | Given a transport code (`unauthorized`, `invalidRequest`, `conflict`, `methodNotAllowed`, `unexpected`) or `noContexts`, then `errors.generic` (they have no keys on purpose) | P1 | unit | [tech overview § Conventions](../tech/overview.md#conventions) |
| ERR-027 | Given errors on `name` and `owner.phone`, then `getFieldErrors` maps each field to the translated message of its first error, and `getOtherErrors(inputFields)` returns the messages no input shows | P1 | unit | [tech overview § Data fetching](../tech/overview.md#data-fetching) |
| ERR-028 | Given an error with `clinicNames` ["A", "B"], then `getErrorMessage` uses `errors.<code>_named` with `count` 2 and the names quoted (`common.quotedName`) and joined by `Intl.ListFormat` in the UI language («A» و«B» / “A” and “B”); without `clinicNames`, `errors.<code>` («هذه العيادة موقوفة.» / "This clinic is disabled.", «تم إيقاف حسابك. تواصل مع مالك العيادة.») | P1 | unit | [auth tech § Frontend](../features/auth/tech.md#frontend) |
| ERR-029 | Given a ProblemDetails body, then `toApiError` reads `clinicNames` (non-string entries dropped; missing → `[]`) | P2 | unit | [tech overview § Errors](../tech/overview.md#errors-problemdetails) |
| ERR-030 | Given every API error code other than the transport codes and `noContexts`, then `en.ts` and `ar.ts` both have `errors.<code>` | P1 | unit | [tech overview § Conventions](../tech/overview.md#conventions) |
| ERR-031 | Given the API is unreachable, when an action is done (e.g. saving a drug or protocol), then the toast «تعذّر الاتصال بالخادم. تحقّق من الاتصال.» (en "Can't reach the server. Check your connection.") and the form keeps the typed data | P1 | ui+e2e | [tech overview § Data fetching](../tech/overview.md#data-fetching) |
| ERR-032 | Given a query fails with a network error or 5xx, then it is retried once; with a 4xx, it is not retried | P1 | ui | [tech overview § Data fetching](../tech/overview.md#data-fetching) |

## ADM — Platform admin

Sources: [platform admin business][adm-b-screens] (screens, [rules][adm-b-rules], [roles][adm-b-roles],
[staff][adm-b-staff], [messages][adm-b-msg]), [platform admin tech][adm-t-api] ([roles and staff API][adm-t-rs],
[provisioning][adm-t-prov], [frontend][adm-t-fe], [roles and staff screens][adm-t-rsui], [edge cases][adm-t-edge]),
[M1.5 design][adm-d-api] (D1, D4, D5, D7, [errors][adm-d-err]), [access business][adm-a-rules] ([messages][adm-a-msg]),
[business overview][adm-o-rules].

Fixtures used below: the template (T) with 2 drugs and 1 protocol whose line 2 overrides the dosing (taper, eye `ask`);
clinic A (owner O, assistant S with Assistant), clinic B (owner O, S with a custom read-only role), the super admin (SA).
"Every admin route" = `GET/POST /admin/clinics`, `GET/PUT/DELETE /admin/clinics/{id}`, `POST …/{id}/suspend|activate`,
`GET/POST …/{id}/roles`, `PUT/DELETE …/roles/{roleId}`, `GET/POST …/{id}/staff`, `PUT/DELETE …/staff/{staffId}`.

### Admin authorization and entry

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-001 | Given no access token, when calling every admin route, then 401 `unauthorized` and nothing changes | P0 | api | [tech API][adm-t-api] |
| ADM-002 | Given an expired access token of SA (platform context), when calling `GET /admin/clinics`, then 401 `unauthorized` | P1 | api | [tech API][adm-t-api] |
| ADM-003 | Given owner O's clinic-context token, when calling every admin route (incl. `POST /admin/clinics`), then 403 `forbidden` and nothing is written | P0 | api | [design D1][adm-d-d1] |
| ADM-004 | Given assistant S's clinic-context token, when calling every admin route, then 403 `forbidden` | P0 | api | [design D1][adm-d-d1] |
| ADM-005 | Given O's no-context token (before picking a clinic), when calling `GET /admin/clinics`, then 403 `forbidden` | P1 | api | [tech API][adm-t-api] |
| ADM-006 | Given SA's **template-context** token, when calling every admin route, then 403 `forbidden` | P0 | api | [tech API][adm-t-api] |
| ADM-007 | Given O's token for clinic A, when calling `/admin/clinics/{A}/roles` and `/staff` (own clinic, GET/POST/PUT/DELETE), then 403 `forbidden` (clinics can't manage their own roles/staff) | P0 | api | [business: users][adm-b-users] |
| ADM-008 | Given a staff token, when calling `/admin/clinics/{unknownId}/roles`, then 403 `forbidden` (the policy runs before the clinic filter; no 404 leaks existence) | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-009 | Given SA's platform token, when calling `GET /admin/clinics`, then 200 | P0 | api | [tech API][adm-t-api] |
| ADM-010 | Given SA in the platform context, then the app bar shows "Platform admin" and the sidebar is «العيادات»، «الأدوية»، «التصنيفات»، «تعديل العيادة النموذجية» ("Clinics", "Drugs", "Categories", "Edit template clinic"), each opening its page | P1 | e2e | [business: screens][adm-b-screens], [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| ADM-011 | Given SA in the platform context, when opening `/platform`, then `/admin`; when opening `/admin/anything`, then `/admin` | P2 | ui | [tech frontend][adm-t-fe] |

### Demoted super admin

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-012 | Given SA holds a platform access token, when the API restarts with SA's phone removed from `Platform:SuperAdminPhones`, then the old token gets 403 `forbidden` on `GET /admin/clinics` | P0 | api | [design D1][adm-d-d1] |
| ADM-013 | Given SA was demoted and has no clinic, when logging in again with a correct code, then 403 `noAccess` (no platform context offered) | P1 | api | [business: users][adm-b-users] |
| ADM-014 | Given the API restarts with the phone added back, when SA logs in again, then the platform context is offered and `GET /admin/clinics` answers 200 | P2 | api | [design D1][adm-d-d1] |
| ADM-015 | Given SA logged out, when the platform access token (not yet expired, ≤ 15 min) calls `GET /admin/clinics`, then 200 (accepted: the policy checks the flag, not the session) | P2 | api | [tech edge cases][adm-t-edge] |

### Clinics list (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-016 | Given the template, A, B and a deleted clinic C, when `GET /admin/clinics`, then items are A and B only (no template, no deleted) | P0 | api | [business: scenarios][adm-b-scen] |
| ADM-017 | Given A, then its summary is `{id, name, status:"active", staffCount, createdAt}` with `staffCount` = active staff only (an inactive member is not counted) | P1 | api | [tech API][adm-t-api] |
| ADM-018 | Given "Demo clinic" and "Second demo clinic", when `search=DEMO`, then both (case-insensitive contains), "Demo clinic" first (names starting with the term first) | P1 | api | [tech API][adm-t-api] |
| ADM-019 | Given two clinics with the same name, when listed, then they are ordered by name then id | P2 | api | [tech API][adm-t-api] |
| ADM-020 | Given A active and B suspended, when `status=suspended`, then only B; `status=active` → only A; no `status` → both | P1 | api | [tech API][adm-t-api] |
| ADM-021 | Given `status= Suspended ` (spaces, capitals), then it filters as `suspended` (trimmed, lower-cased) | P2 | api | [tech API][adm-t-api] |
| ADM-022 | Given `status=foo`, then 200 with an empty page (not 400) | P2 | api | [tech edge cases][adm-t-edge] |
| ADM-023 | Given `search=%00`, then 200 with every clinic (control character dropped); `search=demo%00` → as `demo` | P2 | api | [tech API][adm-t-api] |
| ADM-024 | Given a clinic «عيادة أحمد», when `search=احمد` (alef without hamza), then it is found: the search is Arabic-normalized | P1 | api | [tech API][adm-t-api] |
| ADM-025 | Given a deleted clinic named "Gone", when `search=Gone` with any status, then no item (deleted never listed, also not under `suspended`) | P1 | api | [business: rules][adm-b-rules] |
| ADM-026 | Given 25 clinics, when no paging params, then pageSize 20, page 1, `totalCount` 25 | P1 | api | [tech API][adm-t-api] |
| ADM-027 | Given 25 clinics, when `pageSize=100` → 100 asked (all 25); `pageSize=101` and `pageSize=1000` → clamped to 100 | P1 | api | [tech API][adm-t-api] |
| ADM-028 | Given `pageSize=1` → 1 item; `pageSize=0` → clamped to 1; `page=0` / `page=-1` → page 1 | P2 | api | [tech API][adm-t-api] |
| ADM-029 | Given `page=2147483647&pageSize=100`, then 200 with an empty page (page clamped, no overflow/500) | P2 | api | [tech frontend][adm-t-fe] |
| ADM-030 | Given a search and a filter, then `totalCount` counts the filtered list, not all clinics | P1 | api | [business: screens][adm-b-screens] |
| ADM-287 | Given clinics «عيادة احمد» and «مستشفى النور», when `search=أحمد` → «عيادة احمد», `search=مستشفي` → «مستشفى النور», `search=عياده` → «عيادة احمد» (hamza, ى ↔ ي and ة ↔ ه folded in both directions) | P1 | api | [tech API][adm-t-api] |
| ADM-288 | Given «أمل» and «مركز الأمل», when `search=امل`, then both, «أمل» first (names starting with the folded term first) | P2 | api | [tech API][adm-t-api] |

### Clinics list (screen)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-031 | Given clinics exist, then each row shows the name (a link), the status chip "Active"/"Disabled" («نشطة»/«موقوفة»), active staff and the created date (UI language, Latin digits) | P1 | ui | [business: screens][adm-b-screens] |
| ADM-032 | Given no clinic at all, then «لا توجد عيادات بعد — أنشئ أول عيادة. يستطيع مالكها الدخول فورًا ويجد فيها الأدوية والبروتوكولات الافتراضية.» / "No clinics yet" + "Create the first clinic. …" | P1 | ui | [business: messages][adm-b-msg] |
| ADM-033 | Given a search with no match, then «لا توجد عيادات مطابقة للبحث أو الفلتر.» / "No clinics match your search or filter." | P1 | ui | [business: messages][adm-b-msg] |
| ADM-034 | Given the list is filtered, then the subtitle counts the filtered rows with plural forms: en "0 clinics", "1 clinic", "28 clinics"; ar «0 عيادة», «عيادة واحدة», «عيادتان», «3 عيادات», «11 عيادة» | P2 | ui | [business: screens][adm-b-screens] |
| ADM-035 | Given typing "clin" fast in the search, then one request after typing pauses (300 ms) and a progress bar shows while waiting and loading | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-036 | Given the status filter set to Disabled, then only disabled clinics show; All shows both | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-037 | Given 22+ clinics, when moving to page 2 and changing rows per page (10/20/50), then the rows change accordingly | P1 | e2e | [tech frontend][adm-t-fe] |
| ADM-038 | Given a search, filter and page 2, when opening a clinic then pressing the page's Back (or the browser Back), then the list shows the same search, filter and page | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-039 | Given a search, filter and page, when reloading the browser, then the same list shows (state in the URL, no extra history entries per keystroke) | P2 | e2e | [tech frontend][adm-t-fe] |
| ADM-040 | Given `?search=clinic+2`, when clicking the sidebar's "Clinics", then the search is cleared and the full list shows | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-290 | Given the clinics list (Arabic and English UI, 1280 and 375 px), when typing «عياده احمد» in the search, then «عيادة أحمد» is listed, written as stored | P2 | e2e | [business: rules][adm-b-rules] |
| ADM-041 | Given `?page=99999999999` or a page past the end, then the last page is shown (the request asks page ≤ 1,000,000) | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-042 | Given a row, when clicking anywhere on it, or Tab to the name link then Enter, then the clinic's page opens; the link opens in a new tab with a middle click | P2 | e2e | [tech frontend][adm-t-fe] |
| ADM-043 | Given a long name (157 chars) or Arabic + Latin, then it is cut after 2 lines and the full name is in its tooltip/`title` | P2 | ui | [business: screens][adm-b-screens] |
| ADM-044 | Given the list request fails (500), then «تعذّر تحميل البيانات.» / "Couldn't load data." with «إعادة المحاولة» / "Retry", and Retry loads it | P1 | ui | [business: messages][adm-b-msg] |
| ADM-045 | Given a phone (375 px), then the created-date column and the rows-per-page choice are hidden and the page has no horizontal scroll | P2 | e2e | [tech frontend][adm-t-fe] |

### Create clinic: validation

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-046 | Given name `"   "`, when `POST /admin/clinics`, then 400 `nameRequired` field `name`; nothing written | P1 | api | [tech API][adm-t-api] |
| ADM-047 | Given a name made only of invisible format characters (`"​ ⁠﻿"`), then 400 `nameRequired` | P2 | api | [design errors][adm-d-err] |
| ADM-048 | Given a clinic name of exactly 256 characters, then 201; 257 characters → 400 `nameTooLong` field `name` | P1 | api | [business: rules][adm-b-rules] |
| ADM-049 | Given a name with a NUL, an inner line break, or U+2028/U+2029, then 400 `nameInvalid` field `name`; a trailing line break is trimmed → 201 | P1 | api | [design errors][adm-d-err] |
| ADM-050 | Given a name with a bidi override U+202E (or U+202A–U+202D, isolates U+2066–U+2069), then 400 `nameInvalid` «الاسم يحتوي على رموز غير مسموح بها.» | P1 | api | [business: rules][adm-b-rules] |
| ADM-051 | Given a name with ZWJ (emoji sequence), ZWNJ, or the marks U+200E/U+200F/U+061C, then 201 (allowed) | P2 | api | [design errors][adm-d-err] |
| ADM-052 | Given an Arabic clinic name «عيادة النور» and Arabic owner name, then 201 and both stored exactly as typed (trimmed) | P1 | api | [business: rules][adm-b-rules] |
| ADM-053 | Given owner `fullName` blank, then 400 `nameRequired` field `owner.fullName`; 256 chars → 201; 257 → `nameTooLong`; U+202E → `nameInvalid` (`owner.fullName`) | P1 | api | [tech API][adm-t-api] |
| ADM-054 | Given owner phone `123` or `null`, then 400 `invalidPhone` field `owner.phone` «أدخل رقم موبايل صحيحًا.» | P1 | api | [tech API][adm-t-api] |
| ADM-055 | Given owner phone as `01000000050`, `+201000000050`, `00201000000050` or `+20 100 000 0050`, then 201 and the owner's phone is `+201000000050` | P1 | api | [business: rules][adm-b-rules] |
| ADM-056 | Given the owner phone typed in Arabic-Indic digits «٠١٠٠٠٠٠٠٠٥٠» (create clinic) or a new staff phone the same way (add staff), then 201 and the phone is `+201000000050` | P1 | api | [tech API][adm-t-api] |
| ADM-057 | Given the body has no `owner`, then 400 `invalidRequest` field `owner` | P1 | api | [tech API][adm-t-api] |
| ADM-058 | Given blank name + phone `123` + blank owner name, then 400 with all three errors in order `name`, `owner.phone`, `owner.fullName`, and `code` = `nameRequired` | P2 | api | [tech API][adm-t-api] |
| ADM-059 | Given any validation failure, then no clinic, user, role, staff, drug or protocol row is added | P0 | api | [business: rules][adm-b-rules] |
| ADM-060 | Given the create form submitted empty, then «الاسم مطلوب.» under the clinic name, «رقم الموبايل مطلوب.» under the phone, «الاسم مطلوب.» under the owner name, the focus on the clinic name, no request sent | P1 | ui | [business: screens][adm-b-screens] |
| ADM-061 | Given only the clinic name filled, when submitting, then the focus moves to the phone (first invalid input) | P2 | ui | [business: screens][adm-b-screens] |
| ADM-062 | Given the API answers `invalidPhone` (`owner.phone`), then the message is under the phone and the phone has the focus (once inputs are enabled again) | P1 | ui | [tech frontend][adm-t-fe] |
| ADM-285 | Given owner phone `0223456789` (a landline), when creating a clinic, then 201 and the owner's phone is `+20223456789` (landlines accepted for now, as at login: AUTH-016) | P2 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| ADM-063 | Given the API answers `nameInvalid` on `owner.fullName`, then the message is under the owner name input | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-064 | Given the API answers an error with no field (e.g. 500 generic), then a toast «حدث خطأ ما. حاول مرة أخرى.» and the form keeps its values | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-065 | Given the clinic and owner name inputs, then they accept at most 256 characters (typing more is not possible) | P2 | ui | [business: messages][adm-b-msg] |

### Create clinic: provisioning and the template copy

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-066 | Given `{name:"  Smoke clinic  ", owner:{phone:"01000000009", fullName:" Smoke Owner "}}`, then 201, `Location: /api/v1/admin/clinics/{id}`, name `Smoke clinic`, status `active`, `staffCount` 1, owners `[{fullName:"Smoke Owner", phone:"+201000000009"}]` | P0 | api | [tech API][adm-t-api] |
| ADM-067 | Given a new clinic, then its roles are Owner (`isOwner`, all 11 permissions), Doctor (all 11) and Assistant (9: all but `drugs.delete`, `protocols.delete`), with `staffCount` 1/0/0 | P0 | api | [business: scenarios][adm-b-scen] |
| ADM-068 | Given a new phone, then one new user is created and the owner is an active staff row with only the Owner role | P0 | api | [design D5][adm-d-d5] |
| ADM-069 | Given a new clinic, when its owner logs in with a correct code, then they enter it directly (only context) with all 11 permissions | P0 | api | [business: screens][adm-b-screens] |
| ADM-070 | Given T has 2 own drugs and 1 protocol, then the new clinic has 2 own drugs with the same names, descriptions, default dosings (incl. taper steps), categories, subcategories and ingredients, and 1 protocol with its items in the same order; no shared drug is copied (CAT-221) | P0 | api | [business: scenarios][adm-b-scen], [design § 9 M1.7b](../design/m1.7-shared-catalog.md#9-sub-features) |
| ADM-071 | Given T's protocol line 2 overrides the dosing (taper 4→3→2→1, eye `ask`, dose from the drug), then the copied line has the same override | P0 | api | [tech provisioning][adm-t-prov] |
| ADM-072 | Given the new clinic's copied protocol, then each own-drug item points to the new clinic's own drug copy (not to T's drug ids), each shared-drug item keeps the same shared id (CAT-219), and T's rows are unchanged | P0 | api | [tech provisioning][adm-t-prov], [design § 9 M1.7b](../design/m1.7-shared-catalog.md#9-sub-features) |
| ADM-073 | Given a clinic was created, when a T own drug is renamed (template context), then the clinic's copy is unchanged (shared drugs can't be renamed in the template) | P0 | api | [business: rules][adm-b-rules], [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| ADM-074 | Given a clinic was created, when its owner edits or deletes a copied own drug or protocol, then T and every other clinic are unchanged | P0 | api | [business: rules][adm-b-rules] |
| ADM-075 | Given T was edited (a drug added) before a create, then the new clinic gets T as it is at that moment (the added drug included) | P1 | api | [tech provisioning][adm-t-prov] |
| ADM-076 | Given an empty T (no own drugs, no protocols), then the create answers 201 with roles and owner, and the clinic has no own drugs and no protocols (it still sees the shared catalog) | P2 | api | [tech provisioning][adm-t-prov], [design § 9 M1.7b](../design/m1.7-shared-catalog.md#9-sub-features) |
| ADM-077 | Given any seeder fails (roles, owner or catalog copy; e.g. the catalog copy's insert fails), then 500 and nothing is left: no clinic, no new user, no roles, staff, drugs or protocols | P0 | api | [business: rules][adm-b-rules] |
| ADM-078 | Given the phone of S (staff of clinic A as "Dev Assistant"), when creating clinic N with owner name "Sara", then 201, no new user row, the owner is S's user; S's name in A stays "Dev Assistant" | P0 | api | [business: rules][adm-b-rules] |
| ADM-079 | Given S became owner of N while logged in to A, when S's session refreshes or they open "Switch clinic", then N is listed and S enters it as Owner | P1 | api+e2e | [business: scenarios][adm-b-scen] |
| ADM-080 | Given SA's own phone as the new owner, then 201, SA becomes Owner staff there and still has the platform context | P2 | api | [tech edge cases][adm-t-edge] |
| ADM-081 | Given the owner phone of a deleted clinic, then 201 and that user is reused | P2 | api | [tech roles/staff][adm-t-rs] |
| ADM-082 | Given an existing clinic named "Same", when creating another "Same", then 201 (names need not be unique) and the two details differ by their owners | P1 | api | [business: rules][adm-b-rules] |
| ADM-083 | Given a clinic was created, then `GET /admin/clinics` lists it at once with `staffCount` 1, and `GET /admin/clinics/{id}` equals the 201 body | P1 | api | [tech API][adm-t-api] |
| ADM-084 | Given the clock is at a fixed time, then the new clinic's `createdAt` is that time | P2 | api | [tech API][adm-t-api] |
| ADM-085 | Given a valid create form, when double-clicking "Create clinic" («إنشاء العيادة»), then exactly one `POST` is sent and one clinic exists | P0 | e2e | [business: screens][adm-b-screens] |
| ADM-086 | Given a valid create form, when submitting, then the button shows "Creating…" and the inputs are disabled until the answer | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-087 | Given a successful create, then the new clinic's page opens with the toast «تم إنشاء «اسم العيادة»» / "Clinic “…” created", and browser Back does not return to the filled form | P1 | e2e | [business: messages][adm-b-msg] |
| ADM-088 | Given SA creates «عيادة النور» in the Arabic UI with a new owner phone, when that owner logs in, then they land in the clinic and see T's 2 drugs and the protocol with its 2 lines (design done-when) | P0 | e2e | [design goal][adm-d-goal] |
| ADM-089 | Given the create page, then the owner hint reads «يدخل المالك برقم الموبايل هذا. إن كان للرقم حساب من قبل يُستخدم نفس الحساب.» and the template note «تبدأ العيادة بالأدوار الافتراضية (المالك، Doctor، Assistant) ونسخة من الأدوية والبروتوكولات الافتراضية.» (en "The clinic starts with the default roles (Owner, Doctor, Assistant) and a copy of the default drugs and protocols.") | P1 | ui | [business: scenarios][adm-b-scen] |

### Clinic page and Overview

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-090 | Given A with owner O (active) and a second owner P (inactive), when `GET /admin/clinics/{A}`, then `owners` = only O (active Owner holders, by name) with phone E.164 | P1 | api | [tech API][adm-t-api] |
| ADM-091 | Given unknown id `999999`, when GET, PUT, suspend, activate or DELETE, then 404 `notFound` | P0 | api | [tech API][adm-t-api] |
| ADM-092 | Given A, then Overview shows name, status, created date (long, Latin digits), active staff, owners with names and phones (phones LTR in Arabic) | P1 | ui | [business: screens][adm-b-screens] |
| ADM-093 | Given a clinic created at 23:30 UTC, then the list and the Overview show its date in the browser's time zone (the next day for a browser in Cairo) | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-094 | Given a clinic with no active owner (made in the database), then Overview shows «لا يوجد مالك نشط» / "No active owner" | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-095 | Given `/admin/clinics/999999`, then «العيادة غير موجودة» + «هذه العيادة غير موجودة أو تم حذفها.» / "Clinic not found" + "This clinic doesn't exist or was deleted." and «العودة إلى العيادات» / "Back to clinics" opens the list | P1 | e2e | [business: messages][adm-b-msg] |
| ADM-096 | Given ids `05`, `abc`, `0`, `-1`, `99999999999`, then "Clinic not found" (no request sent for a malformed id) | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-097 | Given the clinic details request fails (500), then the header with Back and «تعذّر تحميل البيانات.» with Retry | P2 | ui | [business: messages][adm-b-msg] |
| ADM-098 | Given A's page, then the tabs Overview / Roles / Staff («نظرة عامة» / «الأدوار» / «الموظفون») each have a URL (`/admin/clinics/{A}`, `/roles`, `/staff`), and a reload keeps the tab | P2 | e2e | [tech frontend][adm-t-fe] |
| ADM-099 | Given a long clinic name, then the page header cuts it after 3 lines with the full name in its tooltip | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-100 | Given A's Staff tab with a search and an open dialog, when navigating to B's Staff tab (e.g. Back), then no dialog, search, page or row of A is carried to B | P2 | ui | [tech roles/staff screens][adm-t-rsui] |

### Rename

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-101 | Given A, when `PUT /admin/clinics/{A}` with `"  New name  "`, then 200 `ClinicDetails` with `New name` | P0 | api | [tech API][adm-t-api] |
| ADM-102 | Given a rename to `"  "`, then 400 `nameRequired`; 256 chars → 200; 257 → `nameTooLong`; U+202E → `nameInvalid` | P1 | api | [tech API][adm-t-api] |
| ADM-103 | Given a rename to another clinic's name, then 200 (names need not be unique) | P2 | api | [business: rules][adm-b-rules] |
| ADM-104 | Given a suspended clinic, when renamed, then 200 | P2 | api | [business: rules][adm-b-rules] |
| ADM-105 | Given A renamed, then the list, the details and staff's `/auth/contexts` show the new name at once | P1 | api | [design D3][adm-d-d3] |
| ADM-106 | Given Rename opened, then the input holds the current name; Save → the toast «تم تغيير اسم العيادة» / "Clinic renamed" and the header shows the new name | P1 | e2e | [business: messages][adm-b-msg] |
| ADM-107 | Given Rename with a blank name, when saving, then «الاسم مطلوب.» on the input and no request | P1 | ui | [business: messages][adm-b-msg] |
| ADM-108 | Given the API answers `nameInvalid`, then the message is on the input | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-109 | Given Rename saving, then the dialog can't be closed (Esc/backdrop) until the answer; a double click on Save sends one `PUT` | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-110 | Given Rename cancelled with edited text, when reopened (also during the closing animation), then it shows the current name, not the cancelled text | P2 | ui | [tech frontend][adm-t-fe] |
| ADM-294 | Given a clinic created as «عيادة الأمل» and renamed by the super admin to «مستشفى النور», then its stored `SearchName` (read by SQL) is `SearchText.Fold` of the new name, `search=مستشفي النور` finds it and `search=عياده الامل` no longer does | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |

### Suspend and activate

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-111 | Given A active, when `POST …/{A}/suspend`, then 204 and A's status is `suspended` in the details and the list (and under `status=suspended`) | P0 | api | [tech API][adm-t-api] |
| ADM-112 | Given A suspended, when suspend again, then 204 and nothing changes (idempotent) | P1 | api | [business: rules][adm-b-rules] |
| ADM-113 | Given A suspended, when `activate` twice, then 204, 204 and A is `active` | P1 | api | [business: rules][adm-b-rules] |
| ADM-114 | Given A suspended then activated, then all its drugs, protocols, roles and staff are unchanged (data kept) | P0 | api | [business: rules][adm-b-rules] |
| ADM-115 | Given A suspended, then its roles and staff can still be listed, created, edited and removed (200/201/204) | P1 | api | [business: rules][adm-b-rules] |
| ADM-116 | Given A suspended, then its `staffCount` and owners in the details stay the same | P2 | api | [tech API][adm-t-api] |
| ADM-117 | Given A active, when clicking Disable («إيقاف»), then a confirm «إيقاف «A»؟» with «يفقد موظفوها الدخول بمجرد قيامهم بأي إجراء تالٍ، حتى من يعمل داخلها الآن. لا يُحذف شيء، ويمكنك تفعيلها من جديد في أي وقت.» opens with the focus on Cancel | P1 | ui | [business: messages][adm-b-msg] |
| ADM-118 | Given the Disable confirm just opened, when pressing Enter, then nothing is sent and the dialog closes | P1 | ui | [business: screens][adm-b-screens] |
| ADM-119 | Given the Disable confirm, when confirming, then the toast «تم إيقاف العيادة» / "Clinic disabled", the chip «موقوفة» / "Disabled", the Enable button and the disabled explanation «العيادة موقوفة: لا يستطيع موظفوها دخولها. فعّلها ليعود لهم الدخول.» / "The clinic is disabled: its staff can't enter it. Enable it to give them access again." show, and the list/filter show it disabled without a reload | P1 | e2e | [business: screens][adm-b-screens], [business: messages][adm-b-msg] |
| ADM-120 | Given A disabled, when clicking Enable («تفعيل»), then no confirm, one `activate`, the toast «تم تفعيل العيادة» / "Clinic enabled" and the chip "Active" | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-121 | Given the Disable confirm, when double-clicking its confirm button, then one `suspend` request; a double click on Enable → one `activate` | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-122 | Given a double click on the Disable (or Delete) button that opens a dialog, then the dialog may open and close again on the backdrop, and nothing is sent (accepted) | P2 | e2e | [tech edge cases][adm-t-edge] |

### Soft delete

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-123 | Given A, when `DELETE /admin/clinics/{A}`, then 204, A is gone from the list (every filter and search) and `GET …/{A}` → 404 `notFound` | P0 | api | [business: rules][adm-b-rules] |
| ADM-124 | Given A deleted, when `DELETE` again, then 404 `notFound` | P1 | api | [business: rules][adm-b-rules] |
| ADM-125 | Given A deleted, then every other admin route on A (PUT, suspend, activate, roles and staff GET/POST/PUT/DELETE) → 404 `notFound` | P0 | api | [tech API][adm-t-api] |
| ADM-126 | Given A deleted at a fixed time, then all its rows (drugs, protocols, roles, staff) still exist, `DeletedAt` = that time and `Status` is unchanged (a suspended A stays `suspended`) | P0 | api | [design D4][adm-d-d4] |
| ADM-127 | Given A deleted, then A leaves `/auth/contexts` of its staff, and `POST /auth/context` into A → 403 `noAccess` (also when A was suspended: never `clinicSuspended`) | P0 | api | [business: rules][adm-b-rules] |
| ADM-128 | Given O is owner of A and B, when A is deleted, then O's user and B are untouched and O still works in B | P0 | api | [business: rules][adm-b-rules] |
| ADM-129 | Given the Delete button, then the dialog shows «حذف هذه العيادة؟», the explanation, «للتأكيد، اكتب اسم العيادة:» with the name once in bold without quotes, and under the input «اكتب الاسم تمامًا كما يظهر» | P1 | ui | [business: messages][adm-b-msg] |
| ADM-130 | Given the delete dialog, then the Delete button stays disabled until the typed name equals the clinic name; a wrong case ("demo clinic" for "Demo clinic") keeps it disabled | P0 | ui | [business: screens][adm-b-screens] |
| ADM-131 | Given name `"Two  spaces​zw"`, when typing `"Two   spaceszw "`, then Delete is enabled (white space runs, trailing spaces and invisible format characters ignored); `"two spaceszw"` keeps it disabled | P1 | ui | [tech frontend][adm-t-fe] |
| ADM-132 | Given a name stored in NFC and typed in NFD (decomposed accents), then Delete is enabled | P2 | unit | [tech frontend][adm-t-fe] |
| ADM-133 | Given an Arabic clinic name typed exactly in the Arabic UI, then Delete is enabled | P1 | ui | [business: screens][adm-b-screens] |
| ADM-134 | Given the name typed, when confirming, then one `DELETE`, the list as it was left (search/page) opens with the toast «تم حذف «اسم العيادة»» / "Clinic “…” deleted", the row never shows (not even briefly), and no request for the deleted clinic's details follows | P1 | e2e | [business: messages][adm-b-msg] |
| ADM-135 | Given the name typed, when double-clicking Delete, then one `DELETE` and one toast | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-136 | Given A deleted, when opening its URL, then "Clinic not found" | P1 | e2e | [business: screens][adm-b-screens] |

### Template clinic protections and the default catalog link

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-137 | Given T, when listing with any search (incl. its stored name) and any status, then T never appears | P0 | api | [business: scenarios][adm-b-scen] |
| ADM-138 | Given T's id, when GET, PUT (rename), suspend, activate or DELETE, then 404 `notFound` and T is unchanged | P0 | api | [business: rules][adm-b-rules] |
| ADM-139 | Given T's id, when calling its roles and staff routes (GET/POST/PUT/DELETE), then 404 `notFound` | P0 | api | [business: rules][adm-b-rules] |
| ADM-140 | Given an unknown, deleted or template clinic id with a malformed JSON body on `POST …/roles`, then 404 `notFound` (not 400: the clinic is checked first) | P2 | api | [tech roles/staff][adm-t-rs] |
| ADM-141 | Given `/admin/clinics/{T}` in the browser, then "Clinic not found" | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-142 | Given SA on `/admin`, when clicking "Edit template clinic" (also double-click), then one context switch, the template's drugs page opens with the template banner (AUTH-180's text, ar and en) | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-293 | Given the super admin in the template, then shared drugs show read-only there with the «مشترك» chip (they are edited from «الأدوية» in the admin area) | P1 | e2e | [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |

### Roles: API

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-143 | Given A with Owner, Assistant, Doctor and Viewer, when `GET …/{A}/roles`, then Owner first, then Assistant, Doctor, Viewer (by name, then id) | P1 | api | [business: roles][adm-b-roles] |
| ADM-144 | Given the Owner role, then `isOwner` true and `permissions` = all 11 catalog keys in catalog order (no rows stored) | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-145 | Given a role held by 1 active and 2 inactive staff, then its `staffCount` is 3 | P1 | api | [business: roles][adm-b-roles] |
| ADM-146 | Given a role row with a key no longer in the catalog (set in the database), then the list leaves it out of `permissions` | P2 | api | [tech roles/staff][adm-t-rs] |
| ADM-147 | Given `{name:"  Editors  ", permissions:["drugs.update"]}`, when `POST …/roles`, then 201, `Location: …/clinics/{A}/roles`, name `Editors`, `permissions` `[drugs.list, drugs.details, drugs.update]` | P0 | api | [business: roles][adm-b-roles] |
| ADM-148 | Given `["protocols.update"]`, then the saved role has `protocols.list`, `protocols.details`, `protocols.update`, `drugs.list` | P1 | api | [business: screens][adm-b-screens] |
| ADM-149 | Given `["prescriptions.create"]` → `drugs.list` added; `["protocols.create"]` → `protocols.list` and `drugs.list` added; `["drugs.delete"]` → `drugs.details`, `drugs.list` added | P1 | api | [access: permissions][adm-a-perms] |
| ADM-150 | Given `permissions: []`, then 201, a role that grants nothing | P1 | api | [business: roles][adm-b-roles] |
| ADM-151 | Given a staff member holding only a role with no permissions, when they log in, then `/me` permissions `[]` and `GET /drugs` → 403 `forbidden` | P1 | api | [business: roles][adm-b-roles] |
| ADM-152 | Given the body has no `permissions`, then 400 `invalidRequest` (create and update; a role is never emptied by mistake) | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-153 | Given `["nope.x"]`, then 400 `unknownPermission` field `permissions` «إحدى الصلاحيات غير موجودة.»; with two unknown keys → still one error | P1 | api | [business: messages][adm-b-msg] |
| ADM-154 | Given `permissions: ["drugs.list", "drugs.list"]`, when `POST …/roles`, then 201 and the key is stored once | P2 | api | [tech roles/staff][adm-t-rs] |
| ADM-155 | Given a role name `"  "`, then 400 `nameRequired`; a NUL or U+202E → `nameInvalid` | P1 | api | [business: roles][adm-b-roles] |
| ADM-156 | Given a role name of exactly 100 characters, then 201; 101 → 400 `nameTooLong` | P1 | api | [business: roles][adm-b-roles] |
| ADM-157 | Given an Arabic role name «قراءة فقط», then 201 stored as typed | P1 | api | [tech testing notes][adm-t-test] |
| ADM-158 | Given a blank name and an unknown key, then both errors, `nameRequired` first | P2 | api | [tech roles/staff][adm-t-rs] |
| ADM-159 | Given "Editors" exists, when creating `" Editors"`, `EDITORS` or `"editors "`, then 409 `roleNameTaken` «يوجد دور آخر في هذه العيادة بنفس الاسم.» | P1 | api | [business: roles][adm-b-roles] |
| ADM-160 | Given the Owner role, when creating `owner` or `OWNER`, then 409 `roleNameTaken` | P1 | api | [business: roles][adm-b-roles] |
| ADM-161 | Given "Editors" exists in clinic B only, when creating "Editors" in A, then 201 (unique per clinic) | P1 | api | [business: roles][adm-b-roles] |
| ADM-162 | Given the role Doctor, when `PUT` with name `Doctor Plus` and `["protocols.update"]`, then 200 with the new name and exactly the closed set (old keys removed) | P0 | api | [business: scenarios][adm-b-scen] |
| ADM-163 | Given the role Doctor, when renamed to `doctor` (its own name, other case), then 200 | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-164 | Given Doctor and Editors, when renaming Doctor to `editors`, then 409 `roleNameTaken` and Doctor unchanged | P1 | api | [business: roles][adm-b-roles] |
| ADM-165 | Given the Owner role, when `PUT` (any valid body), then 409 `roleLocked`; a `PUT` with a blank name → 400 `nameRequired` first | P0 | api | [business: roles][adm-b-roles] |
| ADM-166 | Given the Owner role, when `DELETE`, then 409 `roleLocked` «لا يمكن تعديل دور «المالك» أو حذفه.» (en "The Owner role can't be changed or deleted.") and it stays | P0 | api | [business: messages][adm-b-msg] |
| ADM-167 | Given an unknown role id, when `PUT` or `DELETE`, then 404 `notFound` | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-168 | Given an unused role, when `DELETE`, then 204 and it's gone from the list; `DELETE` again → 404 | P0 | api | [business: scenarios][adm-b-scen] |
| ADM-169 | Given a role held by an active staff member, when `DELETE`, then 409 `roleInUse` «هذا الدور ممنوح لموظفين. أزِل هذا الدور من موظفيه أولًا.» | P0 | api | [business: roles][adm-b-roles] |
| ADM-170 | Given a role held only by an inactive staff member, when `DELETE`, then 409 `roleInUse` | P1 | api | [business: roles][adm-b-roles] |
| ADM-171 | Given a role renamed, then `GET …/staff` shows the new name in its holders' roles at once | P1 | api | [business: screens][adm-b-screens] |
| ADM-172 | Given a `PUT` with the same name and permissions, then 200 and the role's `UpdatedAt` doesn't move | P2 | api | [tech roles/staff][adm-t-rs] |

### Roles: screen

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-173 | Given the Roles tab, then the Owner role is first, shown «المالك» (en "Owner") with the chip «مقفل» / "Locked", no edit or delete button, and the line «كل الصلاحيات دائمًا. لا يمكن تعديل هذا الدور أو حذفه.» | P1 | ui | [business: roles][adm-b-roles] |
| ADM-174 | Given Doctor (11), Assistant (9), a 6-key role and an empty role, then the summaries «كل الصلاحيات» / "All permissions", «9 صلاحيات: الأدوية، البروتوكولات، الروشتة», «6 صلاحيات: الأدوية، البروتوكولات», «بلا صلاحيات» / "No permissions"; also «صلاحية واحدة: …», «صلاحيتان: …», «11 صلاحية: …» | P1 | ui | [business: screens][adm-b-screens] |
| ADM-175 | Given each role, then the staff column shows every holder, active or not | P1 | ui | [business: screens][adm-b-screens] |
| ADM-176 | Given a role held by 3 staff, then its Delete is disabled (still focusable) and its tooltip «ممنوح لـ 3 موظفين. أزِل هذا الدور من موظفيه أولًا.» / "Held by 3 staff members. Take it away from them first." (on hover, or at once on a phone tap); held by 1 → «ممنوح لموظف واحد. …» | P1 | ui | [business: screens][adm-b-screens] |
| ADM-177 | Given an unused role, when Delete, then the confirm «حذف الدور «X»؟ لا يمكن التراجع عن ذلك. لا يمكن حذف دور ممنوح لموظفين: أزِل هذا الدور من موظفيه أولًا.» opens with the focus on Cancel | P1 | ui | [business: messages][adm-b-msg] |
| ADM-178 | Given the delete confirm, when confirming (double click), then one `DELETE`, the toast «تم حذف الدور «X»» and the row is gone | P1 | e2e | [business: messages][adm-b-msg] |
| ADM-179 | Given "New role", then the dialog shows the name (max 100), the sections «الأدوية والبروتوكولات» (Drugs, Protocols) and «الروشتة», 11 checkboxes with their translated labels, and «المختار: 0 من 11.» | P1 | ui | [business: screens][adm-b-screens] |
| ADM-180 | Given the picker, when ticking «تعديل البروتوكولات» / "Edit protocols", then «فتح بروتوكول», «عرض قائمة البروتوكولات والبحث فيها», «عرض قائمة الأدوية والبحث فيها» are ticked and locked, each with the ticked permissions that directly require it: «فتح بروتوكول» and «عرض قائمة الأدوية والبحث فيها» show «مطلوبة لـ: تعديل البروتوكولات», «عرض قائمة البروتوكولات والبحث فيها» shows «مطلوبة لـ: فتح بروتوكول»; the count is 4 of 11 | P0 | ui | [business: screens][adm-b-screens], [tech roles/staff screens][adm-t-rsui] |
| ADM-181 | Given a locked (required) box, when clicking it or pressing Space on it, then it stays ticked | P1 | ui | [business: screens][adm-b-screens] |
| ADM-182 | Given «تعديل البروتوكولات» ticked (its 3 requirements locked), when it is unticked, then the 3 requirements stay ticked: «فتح بروتوكول» and «عرض قائمة الأدوية والبحث فيها» unlocked, «عرض قائمة البروتوكولات والبحث فيها» still locked by «فتح بروتوكول» (its direct requirer, still ticked); the count reads 3 of 11 | P1 | ui | [business: screens][adm-b-screens] |
| ADM-183 | Given "Edit drugs" and "Delete drugs" ticked, then "Open a drug" shows "Needed by: Edit drugs, Delete drugs"; unticking both unlocks it | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-184 | Given the requirement rules, then `withRequirements`/`toggle`/`requiredBy` give the same closure as the server's `WithRequirements` for every catalog key | P1 | unit | [tech roles/staff screens][adm-t-rsui] |
| ADM-185 | Given a new role named "Editors" with Edit protocols, when Save is double-clicked, then one `POST`, the toast «تم إنشاء الدور «Editors»» and the row after Owner in name order | P0 | e2e | [business: messages][adm-b-msg] |
| ADM-186 | Given a blank name, when saving, then «الاسم مطلوب.» on the name and no request | P1 | ui | [business: messages][adm-b-msg] |
| ADM-187 | Given the API answers `roleNameTaken` (e.g. " doctor "), then «يوجد دور آخر في هذه العيادة بنفس الاسم.» on the name input with the focus there | P1 | ui | [business: messages][adm-b-msg] |
| ADM-188 | Given the API answers `unknownPermission` or `roleLocked`, then a toast with the message and the dialog stays open | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-189 | Given Edit on a role, then the title «تعديل الدور «X»» / "Edit the role “X”", the current name and keys ticked; Save → «تم حفظ الدور «X»» | P1 | e2e | [business: messages][adm-b-msg] |
| ADM-190 | Given a role is renamed, then the Staff tab's chips show the new name without a reload | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-191 | Given the permission catalog is loading or failed, then the editor shows a spinner, or "Couldn't load" with Retry | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-192 | Given a role holding a key the loaded catalog doesn't know, when saved unchanged, then the key is still sent | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-193 | Given the editor saving, then it can't be closed until the answer | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-194 | Given a phone (375 px), then the role editor is full screen, only its content scrolls and Save/Cancel stay visible | P2 | ui+e2e | [tech roles/staff screens][adm-t-rsui] |
| ADM-195 | Given the Roles tab request fails, then «تعذّر تحميل البيانات.» with Retry | P2 | ui | [business: messages][adm-b-msg] |

### Staff: API

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-196 | Given A with active and inactive staff, when `GET …/{A}/staff`, then all of them by full name (then id), each with `phone` E.164, `isActive`, roles Owner first then by name | P1 | api | [business: staff][adm-b-staff] |
| ADM-197 | Given 4 staff, when `pageSize=2&page=2`, then 2 items and `totalCount` 4; `pageSize=1000` → 100 | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-198 | Given "Dev Owner" and "Dev Assistant", when `search=DEV`, then both (name contains, case-insensitive); `search=owner` → Dev Owner | P1 | api | [business: staff][adm-b-staff] |
| ADM-199 | Given staff `+201000000003`, when `search=01000000003` (local), then that staff member | P0 | api | [business: staff][adm-b-staff] |
| ADM-200 | Given staff `+201000000002`, when `search=٠١٠٠٠٠٠٠٠٠٢` (Arabic-Indic digits), then that staff member | P0 | api | [business: screens][adm-b-screens] |
| ADM-201 | Given staff `+201000000003`, when `search` is `+201000000003`, `00201000000003`, `1000000003` or `(010) 0000-0003`, then that staff member | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-202 | Given staff `+201000000002` and `+201000000003`, when `search=+2010000000` or `0100000000`, then both | P2 | api | [tech roles/staff][adm-t-rs] |
| ADM-203 | Given `search=+20 0100…` (trunk 0 after the country code), then no match (documented) | P2 | api | [tech roles/staff][adm-t-rs] |
| ADM-204 | Given `search=dev%00`, then the NUL is dropped (both devs) | P2 | api | [tech testing notes][adm-t-test] |
| ADM-205 | Given a phone that is staff in B only, when searching it in A, then no result (A's staff only) | P0 | api | [business: rules][adm-b-rules] |
| ADM-289 | Given staff «مُنَى عليّ», «أحمد إبراهيم» and «فاطمة الزهراء», when `search=مني علي`, `ابراهيم` and `فاطمه`, then each is found (diacritics, hamza, ى ↔ ي, ة ↔ ه folded on the name; the phone-digit search is unchanged: ADM-199 to ADM-203) | P1 | api | [business: staff][adm-b-staff] |
| ADM-206 | Given a new phone `01000000031`, name "New Person" and the Assistant id, when `POST …/staff`, then 201, `Location: …/clinics/{A}/staff`, phone `+201000000031`, active, roles [Assistant], one new user | P0 | api | [business: staff][adm-b-staff] |
| ADM-286 | Given a new staff phone `0223456780` (a landline), when `POST …/staff`, then 201 and the phone is `+20223456780` (landlines accepted for now: AUTH-016) | P2 | api | [auth § القواعد](../features/auth/business.md#القواعد-التشغيلية) |
| ADM-207 | Given the new staff member, when they log in, then they enter A with the Assistant's 9 permissions | P0 | api | [business: staff][adm-b-staff] |
| ADM-208 | Given S (staff of B as "Sara B"), when added to A as "Sara A", then 201 with S's `userId` (no new user) and S's name in B stays "Sara B" | P0 | api | [business: staff][adm-b-staff] |
| ADM-209 | Given SA's phone, when added as staff of A, then 201 and SA keeps the platform context | P2 | api | [tech edge cases][adm-t-edge] |
| ADM-210 | Given S is active staff of A, when adding S's phone (any format) to A, then 409 `staffExists` «هذا الرقم مسجّل بالفعل كموظف في هذه العيادة.» | P0 | api | [business: staff][adm-b-staff] |
| ADM-211 | Given S is inactive staff of A, when adding S's phone to A, then 409 `staffExists` | P1 | api | [business: staff][adm-b-staff] |
| ADM-212 | Given phone `123`, then 400 `invalidPhone` field `phone` | P1 | api | [business: staff][adm-b-staff] |
| ADM-213 | Given a blank `fullName`, then 400 `nameRequired` field `fullName`; 256 chars → 201; 257 → `nameTooLong`; NUL or U+202E → `nameInvalid` | P1 | api | [business: staff][adm-b-staff] |
| ADM-214 | Given `roleIds: []` or no `roleIds`, then 400 `rolesRequired` field `roleIds` «اختر دورًا واحدًا على الأقل.» | P1 | api | [business: staff][adm-b-staff] |
| ADM-215 | Given `roleIds` with the Assistant id twice, then 201 with one role | P2 | api | [tech roles/staff][adm-t-rs] |
| ADM-216 | Given an unknown role id, or a role id of clinic B, then 400 `roleNotFound` field `roleIds` «أحد الأدوار لم يعد موجودًا.» and nothing written | P0 | api | [business: staff][adm-b-staff] |
| ADM-217 | Given S's phone (already staff) and a bad role id, then 400 `roleNotFound` (checked before the 409 `staffExists`) | P2 | api | [tech roles/staff][adm-t-rs] |
| ADM-218 | Given a non-number in `roleIds`, then 400 `invalidRequest` | P2 | api | [tech testing notes][adm-t-test] |
| ADM-219 | Given phone `123`, blank name and `[]`, then `invalidPhone`, `nameRequired`, `rolesRequired` in that order | P2 | api | [tech roles/staff][adm-t-rs] |
| ADM-220 | Given a new phone with a bad role id (or `staffExists`), then no user row is created | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-221 | Given S in A, when `PUT` with a new name, `isActive:false` and roles [Assistant, Editors], then 200 with all three changed; S's name in B unchanged | P0 | api | [business: staff][adm-b-staff] |
| ADM-222 | Given a `PUT` without `isActive`, then 400 `invalidRequest` (never "deactivate") | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-223 | Given a `PUT` that also sends a `phone`, then the phone is unchanged | P2 | api | [business: staff][adm-b-staff] |
| ADM-224 | Given a `PUT` with a role id of B, then 400 `roleNotFound` | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-225 | Given an unknown staff id, when `PUT` or `DELETE`, then 404 `notFound`; `DELETE` twice → 204 then 404 | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-226 | Given S in A and B, when removed from A, then 204, S's staff row in A is gone, S's user and S's membership in B stay | P0 | api | [business: staff][adm-b-staff] |
| ADM-227 | Given S removed from A, when added again, then 201 with a new staff id; S's old token → 403 `noAccess` until a refresh, then 200 in A | P1 | api | [tech roles/staff][adm-t-rs] |
| ADM-228 | Given a staff change (add, deactivate, remove), then the clinic's `staffCount`, `owners` and each role's `staffCount` reflect it at once | P1 | api | [business: screens][adm-b-screens] |
| ADM-295 | Given a staff member «أحمد إبراهيم» renamed to «مُنَى عليّ» (`PUT …/staff/{id}`), then the stored `SearchName` is `SearchText.Fold` of the new name, `search=مني علي` finds them and `search=ابراهيم` no longer does (the phone search unchanged) | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |

### Staff: the last active owner

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-229 | Given O is A's only active owner, when `PUT` with `isActive:false`, then 409 `lastOwner` and O stays active | P0 | api | [business: staff][adm-b-staff] |
| ADM-230 | Given O is A's only active owner, when `DELETE`, then 409 `lastOwner` and O stays | P0 | api | [business: staff][adm-b-staff] |
| ADM-231 | Given O is A's only active owner, when `PUT` with roles [Doctor] (Owner taken away), then 409 `lastOwner` | P0 | api | [business: staff][adm-b-staff] |
| ADM-232 | Given O is the only active owner, when `PUT` with roles [Owner, Doctor], then 200 (still an Owner), roles Owner first | P1 | api | [tech testing notes][adm-t-test] |
| ADM-233 | Given O active owner and P inactive owner, when removing or deactivating O, then 409 `lastOwner` (an inactive owner doesn't count) | P0 | api | [business: staff][adm-b-staff] |
| ADM-234 | Given O and P both active owners, when deactivating P → 200; or removing P → 204; or taking Owner from P → 200 | P0 | api | [business: staff][adm-b-staff] |
| ADM-235 | Given O active owner and P inactive owner, when removing P, then 204 (changes to someone who isn't an active owner never answer `lastOwner`) | P2 | api | [tech roles/staff][adm-t-rs] |

### Staff: screen

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-236 | Given the Staff tab, then each row shows the name, the phone LTR (also in Arabic), role chips (the Owner role filled, shown «المالك» / "Owner") and «نشط» / «غير نشط» | P1 | ui | [business: screens][adm-b-screens] |
| ADM-237 | Given 1, 2, 3, 11 staff, then the subtitle «موظف واحد», «موظفان», «3 موظفين», «11 موظفًا» / "1 staff member", "3 staff members" | P2 | ui | [business: screens][adm-b-screens] |
| ADM-238 | Given a search with 3 matches, then the subtitle shows «3 نتائج» / "3 results" instead of the staff count | P2 | ui | [business: screens][adm-b-screens] |
| ADM-239 | Given a search with no match ("zzz"), then «لا يوجد موظفون مطابقون للبحث.» / "No staff members match your search." | P1 | ui | [business: messages][adm-b-msg] |
| ADM-240 | Given a clinic with no staff rows (made in the database), then «لا يوجد موظفون بعد — أضف الأشخاص برقم الموبايل واختر أدوارهم.» | P2 | ui | [business: messages][adm-b-msg] |
| ADM-241 | Given typing «٠١٠٠٠٠٠٠٠٠٢» in the search box (Arabic UI), then Dev Owner is listed | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-242 | Given page 3 of a search, when changing the search, then the first page of the new search is asked in its first request; a page past the end moves to the last page (never "no match" meanwhile) | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-291 | Given the Staff tab (Arabic and English UI, 1280 and 375 px), when typing «ابراهيم» in the search, then «أحمد إبراهيم» is listed | P2 | e2e | [business: staff][adm-b-staff] |
| ADM-243 | Given the Staff tab, then rows per page offer 10 / 20 / 50 (default 20), and changing it shows the first page | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-244 | Given "Add staff member", then the dialog has the phone (LTR, hint "For example 01001234567…", an existing account is reused), full name, and a role checkbox per role (the Owner role shown «المالك» / "Owner", with «كل الصلاحيات») | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-245 | Given the add dialog submitted empty, then «رقم الموبايل مطلوب.», «الاسم مطلوب.», «اختر دورًا واحدًا على الأقل.» under their inputs, the focus on the phone, no request | P1 | ui | [business: messages][adm-b-msg] |
| ADM-246 | Given the API answers `staffExists`, then «هذا الرقم مسجّل بالفعل كموظف في هذه العيادة.» under the phone with the focus there | P1 | ui | [business: screens][adm-b-screens] |
| ADM-247 | Given the API answers `invalidPhone`, then «أدخل رقم موبايل صحيحًا.» under the phone | P1 | ui | [business: messages][adm-b-msg] |
| ADM-248 | Given the API answers `rolesRequired` or `roleNotFound`, then the message is under the roles (boxes `aria-invalid`, first box focused) | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-249 | Given a valid add (double click on Add), then one `POST`, the toast «تمت إضافة «الاسم»», the row in the list, and without a reload the staff count, the Roles tab's counts, the Overview's active staff and the clinics list's staff count update | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-250 | Given Edit on a staff member, then the title «تعديل «الاسم»», the phone shown disabled with «لا يمكن تغيير الرقم. لاستخدام رقم آخر، أزل هذا الموظف ثم أضفه من جديد.», the name hint «الاسم المستخدم في هذه العيادة فقط.», the Active switch with «يستطيع دخول العيادة.» / «لا يستطيع دخول العيادة حتى يُفعَّل من جديد. تبقى أدواره محفوظة.» | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-251 | Given Edit, when switching Active off and saving, then the toast «تم حفظ «الاسم»», the status «غير نشط» and the roles kept | P1 | e2e | [business: staff][adm-b-staff] |
| ADM-252 | Given Remove, then the confirm «إزالة «الاسم» من العيادة؟ يفقد الدخول إلى هذه العيادة بمجرد قيامه بأي إجراء تالٍ. يبقى حسابه وعياداته الأخرى كما هي، ويمكنك إضافته من جديد لاحقًا.» with the focus on Cancel | P1 | ui | [business: messages][adm-b-msg] |
| ADM-253 | Given the remove confirm, when confirming (double click), then one `DELETE`, the toast «تمت إزالة «الاسم»» and the row gone | P1 | e2e | [business: messages][adm-b-msg] |
| ADM-254 | Given the only active owner, when removing or deactivating them in the UI, then the toast «يجب أن يبقى للعيادة موظف نشط واحد على الأقل له دور «المالك».» with the hint «أعطِ دور «المالك» لموظف نشط آخر أولًا، ثم حاول مرة أخرى.» (en "The clinic must keep at least one active staff member with the Owner role." + "Give the Owner role to another active staff member first, then try again."), shown ~8 s | P1 | e2e | [business: messages][adm-b-msg] |
| ADM-255 | Given a phone (375 px), then the phone sits under the name (below `sm`), the status too (below `md`), long role names wrap inside their chip, and no horizontal scroll | P2 | e2e | [tech roles/staff screens][adm-t-rsui] |
| ADM-256 | Given the Staff tab request fails, then «تعذّر تحميل البيانات.» with Retry | P2 | ui | [business: messages][adm-b-msg] |
| ADM-292 | Given the staff editor saving (e.g. adding a staff member while the `POST` is held), then it can't be closed until the answer: Esc and a backdrop click do nothing, «إلغاء» / "Cancel" is disabled, and the typed name is kept | P2 | ui | [tech roles/staff screens][adm-t-rsui] |

### Owner label and refused role names

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-257 | Given the Roles tab, then the Owner role (`isOwner`) shows «المالك» in Arabic and "Owner" in English; the API still returns the stored name `Owner` | P1 | ui+e2e | [business: roles][adm-b-roles] |
| ADM-258 | Given the Staff tab in Arabic, then the Owner chip shows «المالك» | P1 | ui | [business: roles][adm-b-roles] |
| ADM-259 | Given the staff editor in Arabic, then the Owner role choice shows «المالك» | P1 | ui | [business: roles][adm-b-roles] |
| ADM-260 | Given Doctor, Assistant and a custom «قراءة فقط», then they show exactly as stored in both languages | P1 | ui | [business: roles][adm-b-roles] |
| ADM-261 | Given a role with `isOwner:false` named "Owner" (database edit) and the real Owner role, then only the `isOwner` role gets the label (by flag, not name) | P2 | ui | [business: roles][adm-b-roles] |
| ADM-262 | Given A, when creating a role «المالك» (or `" المالك "`), then 409 `roleNameTaken` and no role is created | P1 | api | [business: roles][adm-b-roles] |
| ADM-263 | Given a custom role, when renaming it to «المالك» or `OWNER`, then 409 `roleNameTaken` and the role unchanged | P1 | api | [business: roles][adm-b-roles] |
| ADM-264 | Given the role editor, when saving «المالك», then «يوجد دور آخر في هذه العيادة بنفس الاسم.» on the name input | P2 | ui | [business: roles][adm-b-roles] |
| ADM-265 | Given A, when creating a role named «المالك» with an RLM (U+200F) or a zero-width space inside, «المـالك» (tatweel), «المالِك» (kasra), «المٰلك» (superscript alef) or "Owner" with a zero-width space after "Ow", then 409 `roleNameTaken` | P1 | api | [tech roles/staff screens][adm-t-rsui] |
| ADM-266 | Given A, when creating «مالك», "Owners" or "The Owner", then 201 (only the two labels are refused) | P2 | api | [tech roles/staff screens][adm-t-rsui] |
| ADM-267 | Given a role name "Owner" whose "O" is the Cyrillic U+041E, when created, then 201 (look-alike letters of another script pass: accepted limit) | P2 | api | [tech roles/staff screens][adm-t-rsui] |
| ADM-268 | Given `RoleRules.IsOwnerLabel`, then true for "Owner", " owner ", «المالك», «المالك» + RLM, «المـالك», «المالِك», «المٰلك», and false for «مالك», "Owners" | P1 | unit | [tech roles/staff screens][adm-t-rsui] |
| ADM-269 | Given a custom role already stored as «المالك» (made in the database), when it is saved again under that name, then 409 `roleNameTaken` (it must be renamed) | P2 | api | [tech roles/staff screens][adm-t-rsui] |

### After an admin change (re-added, re-enabled)

The lockout itself (next request refused, the lost-clinic messages, login refusals) is in ACC and AUTH.

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-270 | Given S removed from A while working in it, when SA adds S again, then A shows again in S's «تبديل العيادة» list (the picker loads the contexts fresh) and S enters it | P1 | e2e | [business: staff][adm-b-staff] |
| ADM-271 | Given A disabled then enabled again, when S logs in, then S enters A with all its data as before | P1 | e2e | [business: rules][adm-b-rules] |

### Stale data, another window, double clicks

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-272 | Given A's Overview open, when A is deleted in another window and SA clicks Rename-Save, Disable-confirm, Enable or Delete, then the toast «هذا العنصر لم يعد موجودًا.» and the page shows "Clinic not found" | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-273 | Given A's Roles tab open, when A is deleted in another window and SA saves a new role, then the notFound toast and "Clinic not found" | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-274 | Given A's Staff tab open, when A is deleted elsewhere and the list reloads (search/page change), then "Clinic not found" | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-275 | Given a role's editor open, when the role is deleted in another window and SA saves, then «هذا العنصر لم يعد موجودًا.», the dialog closes, the list no longer shows it | P1 | e2e | [business: screens][adm-b-screens] |
| ADM-276 | Given a staff editor open, when that person is removed in another window and SA saves, then the notFound toast, the dialog closes, the list reloads | P1 | ui | [business: screens][adm-b-screens] |
| ADM-277 | Given an unused role shown with Delete enabled, when it is given to someone in another window and SA deletes it, then the `roleInUse` toast and the list reloads with the new count | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-278 | Given a role ticked in the staff editor, when that role is deleted in another window and SA saves, then `roleNotFound` on the roles and the roles reload (the deleted role no longer offered) | P2 | ui | [tech roles/staff screens][adm-t-rsui] |
| ADM-279 | Given the clinics list was left for A's page, when A is renamed/disabled there and SA goes Back, then the list shows the new state at once (never the old row first) | P1 | e2e | [tech frontend][adm-t-fe] |
| ADM-280 | Given a staff change in A, when SA goes to the clinics list, then A's active staff count is already updated | P2 | e2e | [tech roles/staff screens][adm-t-rsui] |
| ADM-281 | Given the clinics list open, when a clinic changes in another window, then the list shows the change once it is opened again (data older than 30 s is reloaded on navigation), not when the tab gets the focus back | P2 | e2e | [tech frontend][adm-t-fe] |

### Errors, languages, layout

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| ADM-282 | Given the Arabic UI, then every admin page (list, create, clinic tabs, `/admin/drugs`, `/admin/categories`, dialogs) is RTL (`dir="rtl"`, `lang="ar"`), has no English UI string, and phones stay LTR | P1 | e2e | [tech frontend][adm-t-fe], [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| ADM-283 | Given a phone (375 px) in both languages, then the clinics list, create page, clinic tabs, `/admin/drugs`, `/admin/categories` and their dialogs have no horizontal scroll and the dialogs/toasts with a 157-character name wrap | P1 | e2e | [tech testing notes][adm-t-test], [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| ADM-284 | Given the "Disabled" chip and button, then their colour is `#b45309` (≈ 5:1 contrast on white) | P2 | ui | [tech frontend][adm-t-fe] |

[adm-b-users]: ../features/platform-admin/business.md#المستخدمون
[adm-b-screens]: ../features/platform-admin/business.md#الشاشات-m154m155
[adm-b-scen]: ../features/platform-admin/business.md#سيناريوهات-الاستخدام
[adm-b-rules]: ../features/platform-admin/business.md#القواعد-التشغيلية
[adm-b-roles]: ../features/platform-admin/business.md#الأدوار
[adm-b-staff]: ../features/platform-admin/business.md#الموظفون
[adm-b-msg]: ../features/platform-admin/business.md#الرسائل-التي-تظهر-للمستخدم
[adm-t-api]: ../features/platform-admin/tech.md#api
[adm-t-rs]: ../features/platform-admin/tech.md#roles-and-staff-m153
[adm-t-prov]: ../features/platform-admin/tech.md#provisioning
[adm-t-fe]: ../features/platform-admin/tech.md#frontend
[adm-t-rsui]: ../features/platform-admin/tech.md#roles-and-staff-screens-m155
[adm-t-edge]: ../features/platform-admin/tech.md#edge-cases--limitations
[adm-t-test]: ../features/platform-admin/tech.md#testing-notes
[adm-d-d1]: ../design/m1.5-platform-admin.md#d1-admin-authorization-a-platformadmin-policy-not-permissions
[adm-d-d4]: ../design/m1.5-platform-admin.md#d4-clinic-soft-delete--a-deletedat-column-users-decision
[adm-d-d5]: ../design/m1.5-platform-admin.md#d5-provisioning-iclinicprovisioner--ordered-iclinicseeders
[adm-d-api]: ../design/m1.5-platform-admin.md#6-api-apiv1admin-policy-platformadmin
[adm-d-err]: ../design/m1.5-platform-admin.md#7-errors-new
[adm-d-d3]: ../design/m1.5-platform-admin.md#d3-cache-invalidation-after-commit-ipostcommitactions
[adm-d-goal]: ../design/m1.5-platform-admin.md#1-goal
[adm-a-rules]: ../features/access/business.md#القواعد-التشغيلية
[adm-a-msg]: ../features/access/business.md#الرسائل-التي-تظهر-للمستخدم
[adm-a-perms]: ../features/access/business.md#الصلاحيات
[adm-o-rules]: ../business/overview.md#قواعد-عامة

## DRUG — Drug catalog

Sources: [drugs business](../features/drugs/business.md), [drugs tech](../features/drugs/tech.md),
[tech overview § Conventions](../tech/overview.md#conventions)

### Create and update (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DRUG-001 | Given a clinic user with `drugs.create`, when POST `/drugs` `{name:"Tobradex", description:"Antibiotic + steroid", defaultDosing:null, categoryId, subCategoryId}` («العيون › المياه الزرقاء»), then 201, body `{id, name, activeIngredients:null, description, defaultDosing:null, isShared:false, withdrawn:false, category, subCategory}` (both with `id`, `nameEn`, `nameAr`; no `nameAr` of the drug) and a `Location` header for `/api/v1/drugs/{id}` | P0 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs), [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| DRUG-002 | Given a created drug, when GET `/drugs/{id}`, then 200 with the same name, description and default dosing | P0 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs) |
| DRUG-003 | Given an Arabic name «قطرة مرطبة» and an Arabic multi-line description, when the drug is created and read back, then both are stored exactly as typed (no translation, line breaks kept) | P0 | api | [drugs § القواعد](../features/drugs/business.md#القواعد-التشغيلية) |
| DRUG-004 | Given name "  Tobradex  " and description "  text  ", when saved, then the stored name is "Tobradex" and the description "text" (trimmed) | P1 | api | [drugs § القواعد](../features/drugs/business.md#القواعد-التشغيلية) |
| DRUG-005 | Given a description of only spaces or empty, when saved, then the stored description is `null` | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-006 | Given a description with line breaks and tabs, when saved, then 2xx and they are kept | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-007 | Given an existing own drug, when PUT `/drugs/{id}` with a new name, description, default dosing, active ingredients and category (`categoryId` required on update too: else 400 `categoryRequired`), then 200 with the new values (and `isShared:false`, `withdrawn:false`) and a later GET returns them | P0 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs), [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |
| DRUG-008 | Given an unknown drug id, when GET `/drugs/{id}`, then 404 `notFound` | P1 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs) |
| DRUG-009 | Given an unknown drug id and a valid body, when PUT `/drugs/{id}`, then 404 `notFound` | P1 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs) |
| DRUG-010 | Given an unknown drug id and an empty name, when PUT `/drugs/{id}`, then 400 `nameRequired` (validation is checked before the 404) | P2 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs) |
| DRUG-011 | Given two drugs with the same name "Tobradex", when the second is created, then 201 (no duplicate-name check) and both are listed | P1 | api | [drugs § القواعد](../features/drugs/business.md#القواعد-التشغيلية) |
| DRUG-012 | Given a default dosing object with every field empty (`{}`), when the drug is saved, then the stored and returned `defaultDosing` is `null` | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-013 | Given a valid default dosing with fields that don't apply (e.g. `frequency:"bedtime", frequencyValue:3`), when saved, then the response holds the normalized dosing (`frequencyValue:null`) | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-014 | Given an invalid default dosing (e.g. amount without unit), when POST `/drugs`, then 400 `invalidDosing` with field `defaultDosing` and nothing is saved | P0 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs) |

### Name and description rules (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DRUG-015 | Given name "", when POST `/drugs`, then 400 `nameRequired` (field `name`) | P0 | api | [drugs § الرسائل](../features/drugs/business.md#الرسائل-التي-تظهر-للمستخدم) |
| DRUG-016 | Given name null (missing), when POST `/drugs`, then 400 `nameRequired` | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-017 | Given name "   " (spaces only), when POST, then 400 `nameRequired` | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-018 | Given a name made only of invisible format characters (U+200B zero-width space), when POST, then 400 `nameRequired` | P2 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-019 | Given a name of exactly 256 characters, when POST, then 201 and the full name is stored | P1 | api | [drugs § القواعد](../features/drugs/business.md#القواعد-التشغيلية) |
| DRUG-020 | Given a name of 257 characters, when POST, then 400 `nameTooLong` | P1 | api | [drugs § القواعد](../features/drugs/business.md#القواعد-التشغيلية) |
| DRUG-021 | Given a 256-character name surrounded by spaces (258 raw), when POST, then 201 (the limit applies after trimming) | P2 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-022 | Given a name containing a NUL, when POST, then 400 `nameInvalid` | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-023 | Given a name containing a line break (`\n`) or a tab inside the text, when POST, then 400 `nameInvalid` | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-024 | Given a name containing U+2028 (line separator) or U+2029 (paragraph separator), when POST, then 400 `nameInvalid` | P2 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-025 | Given a name containing a bidi override (U+202A–U+202E) or isolate (U+2066–U+2069), when POST, then 400 `nameInvalid` (each boundary: U+202A, U+202E, U+2066, U+2069) | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-026 | Given a name containing ZWJ/ZWNJ (U+200D/U+200C) or the marks U+200E, U+200F, U+061C (e.g. pasted Arabic), when POST, then 201 | P2 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-027 | Given a name with an emoji or mixed Arabic/Latin text ("Vigamox فيجاموكس"), when POST, then 201 and it is stored as typed | P2 | api | [drugs § القواعد](../features/drugs/business.md#القواعد-التشغيلية) |
| DRUG-028 | Given a 257-character name that also contains a NUL, when POST, then 400 with `code` `nameInvalid` and `errors` = [`nameInvalid`, `nameTooLong`] in that order | P2 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs) |
| DRUG-029 | Given a description containing a NUL, when POST, then 400 `invalidText` with field `description` | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-030 | Given a valid `categoryId`, an empty name, a description with a NUL and an invalid dosing together, when POST, then 400 `code` `nameRequired` and `errors` = [`nameRequired`, `invalidText`, `invalidDosing`] in that order (CAT-042 owns the case without a category) | P1 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs), [design § 7](../design/m1.7-shared-catalog.md#7-errors-new-and-renamed) |
| DRUG-031 | Given the Arabic UI and an API answer `nameInvalid`, when saving a drug, then the toast reads «الاسم يحتوي على رموز غير مسموح بها.» and the dialog stays open | P1 | ui | [overview § Data fetching](../tech/overview.md#data-fetching) |
| DRUG-032 | Given the Arabic UI and an API answer `nameTooLong`, when saving, then the toast reads «الاسم طويل جدًا.» | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-033 | Given the Arabic UI and an API answer `invalidText`, when saving, then the toast reads «النص يحتوي على رموز غير مسموح بها.» | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |

### Search, ordering and paging

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DRUG-034 | Given own drugs created "Zinc", "atropine", "Tobradex", when GET `/drugs?source=own` without a search, then newest first (`CreatedAt`, then id, descending): Tobradex, atropine, Zinc; shared drugs keep the name order (CAT-015) | P0 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| DRUG-035 | Given two own drugs with the same name, when listed with `source=own` and no search, then the newer (higher id) comes first | P2 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| DRUG-036 | Given Latin and Arabic own drug names that a search term all start with (or all only contain), when listed with `source=own` and that search, then the Latin names come before the Arabic ones (without a search own drugs are newest first) | P1 | api | [drugs § القواعد](../features/drugs/business.md#القواعد-التشغيلية), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| DRUG-037 | Given "Tobradex", when searching "tobra" or "TOBRA", then it is found (case-insensitive contains) | P0 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-038 | Given «قطرة مرطبة», when searching «مرطبة» (middle of the name), then it is found | P0 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-039 | Given «قطرة أحمر», when searching «احمر» (alef without hamza), then it is found (Arabic-normalized search) | P1 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-040 | Given own drugs "Atropine tobra", "Tobradex" and "Zinc tobra", when searching "tobra" with `source=own`, then "Tobradex" (starts with the term) comes first, then the others by name (9 shared names start with "TOBRA"; 34 shared drugs contain it in the name, hidden Arabic name or ingredients) | P0 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| DRUG-041 | Given search "  tobra  ", when GET `/drugs`, then the result equals the search "tobra" (term trimmed) | P2 | api | [overview § Conventions](../tech/overview.md#conventions) |
| DRUG-042 | Given a search term containing control characters (e.g. a NUL or a tab), when GET `/drugs`, then 200 and they are ignored (no 500) | P2 | api | [overview § Conventions](../tech/overview.md#conventions) |
| DRUG-043 | Given a search term containing `%` or `_`, when GET `/drugs?source=own`, then only names containing those characters literally match (1,399 shared names contain `%`, 2 contain `_`: CAT-069) | P2 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| DRUG-044 | Given a search with no match (a term absent from names, hidden Arabic names, ingredients and category names, e.g. "zzqx"), when GET `/drugs`, then 200 `{items:[], totalCount:0}` | P1 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| DRUG-088 | Given «أسبرين ممتد», when searching «اسبرين», «إسبرين», «آسبرين» or «ٱسبرين», then it is found (every alef form folds to ا) | P1 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-089 | Given «اسبرين أطفال» (stored without hamza), when searching «أسبرين» or «إسبرين», then it is found (the other direction) | P1 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-090 | Given «مستشفى العين» and «قطرة عيني», when searching «مستشفي» and «عينى», then each is found (ى ↔ ي) | P1 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-091 | Given «قطرة عيني» and «قطره مرطبه», when searching «قطره عيني» and «قطرة مرطبة», then each is found (ة ↔ ه) | P1 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-092 | Given «مؤقت» and «هيئة», when searching «موقت» and «هييه», then each is found (ؤ → و, ئ → ي) | P2 | api | [overview § Conventions](../tech/overview.md#conventions) |
| DRUG-093 | Given «مُضَادّ حَيَوِيّ» and «مضاد حيوي قوي», when searching «مضاد حيوي» or «مُضَادّ», then both (diacritics, shadda included, ignored on either side) | P1 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-094 | Given «كـــورتيزون» and «كورتيزون موضعي», when searching «كورتيزون», then both; «كـورتيزون م» → «كورتيزون موضعي» (tatweel ignored on either side) | P2 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-095 | Given «هٰذا» (superscript alef), when searching «هاذا», then it is found | P2 | api | [overview § Conventions](../tech/overview.md#conventions) |
| DRUG-096 | Given a term made only of tatweel or diacritics (e.g. «ـ»), then no filter: every drug, as with an empty search | P2 | api | [overview § Conventions](../tech/overview.md#conventions) |
| DRUG-097 | Given «أسبرين ممتد», «اسبرين أطفال» and «قرص أسبرين», when searching «إسبرين», then the two that start with it (after folding) come first, by name, then «قرص أسبرين»; with `pageSize=2&page=2` → only «قرص أسبرين» and `totalCount` 3 | P1 | api | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-098 | Given «أسبرين ممتد» found by «اسبرين», then the item's `name` is the stored «أسبرين ممتد»: names are shown, stored and ordered as typed; only the search folds | P1 | api | [overview § Conventions](../tech/overview.md#conventions) |
| DRUG-099 | Given Latin names ("Moxifloxacin 0.5%"), then the folding changes nothing: "MOXI" finds it and `%` matches only a literal % (DRUG-037, DRUG-043); a mixed «قطرة Tobradex» is found by «قطره TOBRA» | P1 | api | [overview § Conventions](../tech/overview.md#conventions) |
| DRUG-100 | Given a drug renamed from «مؤقت» to «مُؤقّتة», when searching «موقته», then it is found, and its stored `SearchName` (read by SQL) = `SearchText.Fold("مُؤقّتة")`: refolded by the save interceptor, no longer by the database | P1 | api | [drugs tech § Data model](../features/drugs/tech.md#data-model), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| DRUG-101 | Given the migration collection (bare template, no catalog) with drugs, groups, clinics and staff before `AddSearchNames`, when it is applied, then every existing row gets its generated `SearchName` at once (read by SQL at that version); migrating down to `AddClinicDeletedAt` and up to `RenameGroupsToProtocols` keeps every row; the test then deletes its drugs and migrates to the latest version (`AddSharedCatalog` needs an empty `Drugs` and refolds no row) | P1 | api | [overview § Migrations](../tech/overview.md#migrations), [design D12](../design/m1.7-shared-catalog.md#d12-tests-carry-the-full-catalog) |
| DRUG-045 | Given 25 own drugs, when GET `/drugs?source=own&page=2&pageSize=20`, then 5 items (the 5 oldest: newest first), `totalCount` 25, `page` 2, `pageSize` 20 | P0 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| DRUG-046 | Given no paging parameters, when GET `/drugs`, then `page` 1 and `pageSize` 20 | P1 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs) |
| DRUG-047 | Given `pageSize` 0, 100 and 101, when GET `/drugs`, then the answered `pageSize` is 1, 100 and 100 | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-048 | Given `page` 0 or -1, when GET `/drugs`, then `page` 1 is answered | P2 | api | [overview § Conventions](../tech/overview.md#conventions) |
| DRUG-049 | Given a page past the end (or `page=2147483647`), when GET `/drugs`, then 200 with no items and the right `totalCount` (no overflow error) | P2 | api | [overview § Conventions](../tech/overview.md#conventions) |
| DRUG-050 | Given each listed drug (own and shared), when GET `/drugs`, then its `defaultDosing`, `activeIngredients`, `isShared`, `withdrawn`, `category` and `subCategory` are included | P1 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs), [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| DRUG-051 | Given the drugs page, when typing in the search box, then the list updates while typing (debounced ~300 ms, no button) and goes back to the first page | P0 | e2e | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-052 | Given more than 20 drugs, when the page opens, then 20 rows are shown with pagination; choosing 10 or 50 rows per page shows that many and goes back to the first page | P1 | e2e | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-053 | Given the drugs page, then the header subtitle reads «إجمالي الأدوية: N» (English "Total drugs: N") with N = `totalCount` | P1 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-054 | Given a search with no results, when the list loads, then «لا توجد أدوية مطابقة للبحث.» is shown (English "No drugs match your search.") | P1 | e2e | [drugs § الرسائل](../features/drugs/business.md#الرسائل-التي-تظهر-للمستخدم) |
| DRUG-102 | Given the drugs page (Arabic and English UI, 1280 and 375 px), when typing «اسبرين» in the search, then «أسبرين ممتد», «اسبرين أطفال» and «قرص أسبرين» are listed, in that order | P0 | e2e | [drugs § البحث](../features/drugs/business.md#البحث-عن-دواء) |
| DRUG-056 | Given a drug with a default dosing and a 4-line description, when listed, then the row shows the name, the Arabic dosing sentence and the description cut to 2 lines | P1 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-057 | Given the drug list request fails, when the page loads, then «تعذّر تحميل البيانات.» with «إعادة المحاولة» is shown, and Retry reloads | P1 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-058 | Given the drug picker (protocol editor or prescription), when scrolling to the end of 30 results, then «تحميل المزيد» loads the next 30, and «النتائج: N» shows the total | P1 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-059 | Given the drug picker, then each drug shows its name, default dosing sentence and description, and drugs already chosen show the «مُضاف» chip | P1 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-103 | Given a drug whose default dosing is only «اليمنى» and a description, then the drugs table and the drug picker show «في العين اليمنى» and the description (there the description always shows) | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-060 | Given the drug picker with a search typed, when a drug is selected, then the search box is cleared | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |

### Drug dialog (UI)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DRUG-061 | Given a user with `drugs.create`, when clicking «إضافة دواء», typing a name, picking a category (required) and saving, then the toast «تمت إضافة الدواء» (English "Drug added") appears, the dialog closes and the drug is found by search or on «أدوية العيادة» | P0 | e2e | [drugs § إضافة دواء](../features/drugs/business.md#إضافة-دواء), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| DRUG-062 | Given the new-drug dialog, when it opens, then the title is «دواء جديد», the name field has the focus and the fields are empty | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-063 | Given the drug dialog with an empty (or spaces-only) name, when saving, then the name field turns red with «الاسم مطلوب.» under it and no request is sent | P0 | ui | [drugs § الرسائل](../features/drugs/business.md#الرسائل-التي-تظهر-للمستخدم) |
| DRUG-064 | Given the drug dialog, when typing more than 256 characters in the name, then the field stops at 256 | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-065 | Given the drug dialog with incomplete dosing (e.g. «مرات في اليوم» without the number), when saving, then the incomplete fields turn red and nothing is saved | P0 | ui | [drugs § الرسائل](../features/drugs/business.md#الرسائل-التي-تظهر-للمستخدم) |
| DRUG-066 | Given an existing own drug, when clicking its row (or the ✎ button), then «تعديل الدواء» opens pre-filled with its name, active ingredients, category, subcategory, description and default dosing (CAT-051); shared rows open the read-only details | P0 | e2e | [drugs § تعديل دواء](../features/drugs/business.md#تعديل-دواء), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| DRUG-067 | Given the edit dialog, when changing the name and saving, then the toast «تم تحديث الدواء» (English "Drug updated") appears and the row shows the new name | P0 | e2e | [drugs § الرسائل](../features/drugs/business.md#الرسائل-التي-تظهر-للمستخدم) |
| DRUG-068 | Given the edit dialog was cancelled after changes, when it is opened again, then it shows the saved values (the form restarts from the drug) | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-104 | Given the drug dialog closing (saved, or cancelled with text typed), when it is opened again during the closing animation (e.g. a second Enter on «إضافة دواء», where the focus went back), then it starts from the given drug: empty for a new drug, not the text of the closing form | P2 | ui+e2e | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-069 | Given the drug dialog with only empty dosing fields, when saving, then the request sends `defaultDosing: null` | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-070 | Given the drug dialog while a save is in progress, then Save shows «جارٍ الحفظ…» and Save/Cancel are disabled | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-071 | Given a drug in two protocols, when its name or default dosing is edited, then both protocols' editors and pickers show the new name/sentence without a reload (the protocols were refreshed) | P0 | e2e | [drugs § تعديل دواء](../features/drugs/business.md#تعديل-دواء) |
| DRUG-072 | Given a user with `drugs.details` but not `drugs.update`, when clicking an own row, then «تفاصيل الدواء» opens read-only (name, active ingredients, «التصنيف: … › …», dosing sentence, description, «إغلاق» only; no Arabic name); shared rows open the read-only details for every user with `drugs.details`, even with `drugs.update` (CAT-033, CAT-034) | P1 | e2e | [drugs § المستخدمون](../features/drugs/business.md#المستخدمون), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| DRUG-073 | Given a drug deleted in another window, when this window saves an edit of it, then the toast «هذا العنصر لم يعد موجودًا.» appears (404 `notFound`) | P1 | e2e | [overview § Errors](../tech/overview.md#errors-problemdetails) |

### Delete with the protocols warning

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DRUG-074 | Given a drug used in protocols "Post cataract" and «التهاب الملتحمة», when GET `/drugs/{id}/protocols`, then 200 with both names, distinct, ordered by name | P1 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-075 | Given a drug used twice in one protocol (right and left eye lines), when GET `/drugs/{id}/protocols`, then that protocol's name appears once | P2 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DRUG-076 | Given an unknown drug id, when GET `/drugs/{id}/protocols`, then 200 `[]` | P2 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs) |
| DRUG-077 | Given a drug used in protocols, when DELETE `/drugs/{id}`, then 204, the drug is gone and every protocol line of it is removed (the protocols stay) | P0 | api | [drugs § حذف دواء](../features/drugs/business.md#حذف-دواء) |
| DRUG-078 | Given an unknown (or already deleted) drug id, when DELETE `/drugs/{id}`, then 404 `notFound` | P1 | api | [drugs tech § API](../features/drugs/tech.md#api-clinichubapifeaturesdrugsdrugscontrollercs-route-apiv1drugs) |
| DRUG-079 | Given a drug used in two protocols, when clicking delete, then the confirmation «حذف الدواء؟» says «سيتم حذف «Tobradex» وإزالته من كل البروتوكولات. لا يمكن التراجع عن ذلك.» and on the next line «يُستخدم في هذه البروتوكولات: A، B» | P0 | e2e | [drugs § حذف دواء](../features/drugs/business.md#حذف-دواء) |
| DRUG-080 | Given a drug used in no protocol, when clicking delete, then the confirmation shows only the first sentence (no protocols line) | P1 | ui | [drugs § حذف دواء](../features/drugs/business.md#حذف-دواء) |
| DRUG-081 | Given the English UI and a drug used in two protocols, then the protocols line reads "It is used in these protocols: A، B": the names are joined with the Arabic comma «، » in both languages (by choice) | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-082 | Given the protocol-names lookup fails (network/500), when clicking delete, then the confirmation still opens without the protocols line | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |
| DRUG-083 | Given the delete confirmation, when choosing «إلغاء», then nothing is deleted | P0 | e2e | [drugs § حذف دواء](../features/drugs/business.md#حذف-دواء) |
| DRUG-084 | Given the delete confirmation, when confirming «حذف», then the toast «تم حذف الدواء» (English "Drug deleted") appears and the row disappears | P0 | e2e | [drugs § الرسائل](../features/drugs/business.md#الرسائل-التي-تظهر-للمستخدم) |
| DRUG-085 | Given the only row of the last page (page > 1), when it is deleted, then the table steps back one page | P2 | ui | [drugs tech § Edge](../features/drugs/tech.md#edge-cases--limitations) |
| DRUG-086 | Given a protocol whose only drug is deleted, then the protocol's card shows «الأدوية: 0»; when the protocol is opened, it shows «لا توجد أدوية في هذا البروتوكول» and saving it says «أضف دواءً واحدًا على الأقل.» (en "Add at least one drug.") until a drug is added | P1 | e2e | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |
| DRUG-087 | Given a drug already deleted in another window, when it is deleted here, then the toast «هذا العنصر لم يعد موجودًا.» appears | P2 | ui | [overview § Errors](../tech/overview.md#errors-problemdetails) |
| DRUG-106 | Given an own drug used in a protocol together with shared drugs, when deleted, then the confirmation names the protocols («يُستخدم في هذه البروتوكولات: …») and only its lines go | P0 | e2e | [design D4](../design/m1.7-shared-catalog.md#d4-protocol-lines-and-the-guards), [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |

## GRP — Protocols

Sources: [protocols business](../features/protocols/business.md), [protocols tech](../features/protocols/tech.md)

### Create, update, delete (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| GRP-001 | Given 3 drugs, when POST `/protocols` `{name:"Post cataract", items:[{drugId:A,dosing:null},{drugId:B,dosing:{frequency:"daily",frequencyValue:6}},{drugId:C,dosing:null}]}`, then 201 + `Location`, items in that order with each `drug` (incl. `defaultDosing`) and `dosing` | P0 | api | [protocols tech § API](../features/protocols/tech.md#api-clinichubapifeaturesprotocolsprotocolscontrollercs-route-apiv1protocols) |
| GRP-002 | Given a protocol, when GET `/protocols/{id}`, then its items come back in the saved order | P0 | api | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |
| GRP-003 | Given a protocol of A, B, C, when PUT with items C, A (new order, B removed, new override on A) and a new name, then 200 and GET returns exactly C, A with the new override and name (all lines replaced) | P0 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-004 | Given a protocol, when DELETE `/protocols/{id}`, then 204, the protocol is gone and its drugs still exist | P0 | api | [protocols § تعديل أو حذف](../features/protocols/business.md#تعديل-أو-حذف-بروتوكول) |
| GRP-005 | Given an unknown protocol id, when GET, PUT (valid body) or DELETE, then 404 `notFound` | P1 | api | [protocols tech § API](../features/protocols/tech.md#api-clinichubapifeaturesprotocolsprotocolscontrollercs-route-apiv1protocols) |
| GRP-006 | Given an override with fields that don't apply, when saved, then the stored override is normalized; an empty override `{}` is stored as `null` | P1 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-007 | Given items with `null` entries between valid ones, when POST, then the nulls are dropped and the order of the others is kept | P2 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-008 | Given name "  Post cataract  ", when saved, then the stored name is trimmed | P2 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-009 | Given protocols "Zeta", «التهاب», "alpha" and another "alpha", when GET `/protocols`, then they are ordered by name then id (the default `en_US.utf8` collation: case-insensitive first, Latin before Arabic: "alpha", a second "alpha" (higher id), "Zeta", «التهاب»), each with its items | P1 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols), [tech overview § Known limitations](../tech/overview.md#known-limitations--tech-debt) |
| GRP-010 | Given protocols, when GET `/protocols?search=cat` (or Arabic part of a name), then only names containing it are returned (case-insensitive, Arabic-normalized: GRP-096), paged like drugs (`pageSize` clamped 1–100) | P1 | api | [protocols tech § API](../features/protocols/tech.md#api-clinichubapifeaturesprotocolsprotocolscontrollercs-route-apiv1protocols) |
| GRP-096 | Given «بروتوكول إلتهاب», «بعد عملية المياه» and «علاج آلام», when `search=التهاب`, `بروتوكول`, `عمليه المياة` and `الام`, then each is found (alef forms, ة ↔ ه in both directions; diacritics and tatweel ignored as for drugs) | P1 | api | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |
| GRP-011 | Given a drug in a protocol, when the drug's default dosing is changed, then GET of the protocol returns the new `drug.defaultDosing` and the unchanged override | P0 | api | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |

### Validation (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| GRP-012 | Given an empty name, when POST `/protocols`, then 400 `nameRequired` | P0 | api | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |
| GRP-013 | Given a 256-character name, when POST, then 201; with 257 characters, then 400 `nameTooLong` | P1 | api | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |
| GRP-014 | Given a name with a line break or a bidi override, when POST, then 400 `nameInvalid` | P2 | api | [protocols tech § API](../features/protocols/tech.md#api-clinichubapifeaturesprotocolsprotocolscontrollercs-route-apiv1protocols) |
| GRP-015 | Given `items: []`, when POST, then 400 `drugsRequired` (field `items`) | P0 | api | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |
| GRP-016 | Given `items` missing (null) or `[null, null]`, when POST, then 400 `drugsRequired` | P2 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-017 | Given 1000 items (distinct drug+eye), when POST, then 201 | P1 | api | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |
| GRP-018 | Given 1001 items, when POST, then 400 `invalidRequest` (field `items`) and no per-item errors are listed | P1 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-019 | Given the editor saving more than 1000 lines, then the toast «حدث خطأ ما. حاول مرة أخرى.» (the API's `invalidRequest` has no message of its own) | P2 | ui | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-020 | Given item 2 with an invalid override (e.g. `daily` without a number), when POST, then 400 `invalidDosing` with field `items[1].dosing` | P1 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-021 | Given an override with eye `ask`, when POST `/protocols`, then 201 and the line keeps `eye:"ask"` | P0 | api | [protocols tech § Data model](../features/protocols/tech.md#data-model) |
| GRP-022 | Given the same drug twice with the same override eye "right", when POST, then 400 `duplicateProtocolItem` (field `items`) | P0 | api | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |
| GRP-023 | Given duplicate lines and an empty name, when POST, then 400 with only `nameRequired` (`duplicateProtocolItem` is checked by the handler, after validation) | P2 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-024 | Given the same drug twice with override eyes "right" and "left", when POST, then 201 with both lines | P0 | api | [protocols § نفس الدواء للعينين](../features/protocols/business.md#نفس-الدواء-للعينين-بجرعتين-مختلفتين) |
| GRP-025 | Given the same drug twice, both without override and its default without an eye, when POST, then 400 `duplicateProtocolItem` | P1 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-026 | Given the same drug twice, both with eye `ask`, when POST, then 400 `duplicateProtocolItem`; with `ask` and "right", then 201 (`ask` is its own value) | P1 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-027 | Given a drug whose default eye is "right", when POST a protocol with that drug once without override and once with override eye "right", then 400 `duplicateProtocolItem` (effective eye) | P0 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-028 | Given a drug without a default eye, when POST it once without override and once with override eye "none", then 400 `duplicateProtocolItem` (no eye = "none") | P1 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-029 | Given a protocol with line A (no override, drug default right) and line B (override left), when the drug's default eye becomes "left" (200) and the protocol is PUT unchanged (e.g. renamed), then 400 `duplicateProtocolItem`; `GET` still shows both lines (effective eye left) | P0 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-030 | Given an unknown drug id in items, when POST (otherwise valid), then 400 `drugNotFound` | P1 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-031 | Given an unknown drug id and an empty name, when POST, then 400 `nameRequired` only (`drugNotFound` is checked after validation) | P2 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-032 | Given an unknown protocol id and an unknown drug id in a valid body, when PUT, then 400 `drugNotFound` (before the 404); an unknown drug is reported before a duplicate line, and a duplicate before an unknown protocol's 404 | P2 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-033 | Given an empty name, no items, when POST, then `errors` = [`nameRequired`, `drugsRequired`] in that order | P2 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-034 | Given an API answer `drugNotFound` while saving a protocol (a drug deleted in another window), then the toast reads «أحد الأدوية لم يعد موجودًا.» (en "One of the drugs no longer exists.") and the editor keeps the changes | P1 | e2e | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |
| GRP-035 | Given an API answer `duplicateProtocolItem` (e.g. a stale editor), then the toast «يوجد دواء مكرر في البروتوكول لنفس العين.» (en "A drug is in the protocol twice for the same eye.") | P1 | ui | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |

### List page and picker (UI)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| GRP-036 | Given protocols, when opening «البروتوكولات», then cards show the name, «الأدوية: N» and the first 4 drug names; a protocol with 6 drugs also shows «+2 أخرى» | P1 | e2e | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-037 | Given more than 12 protocols, when opening the list, then 12 cards per page with page buttons | P2 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-038 | Given the list, when searching part of a name, then only matching protocols show and the page resets to 1; no match shows «لا توجد بروتوكولات مطابقة للبحث.» | P1 | e2e | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-039 | Given a clinic without protocols, when opening the list, then «لا توجد بروتوكولات بعد» / «البروتوكولات تتيح لك إضافة عدة أدوية إلى الروشتة بضغطة واحدة.» with «بروتوكول جديد» | P1 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-040 | Given the list, then the subtitle reads «إجمالي البروتوكولات: N» | P2 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-041 | Given a protocol card, when clicking it, then its editor opens at `/protocols/{id}` | P0 | e2e | [protocols § تعديل أو حذف](../features/protocols/business.md#تعديل-أو-حذف-بروتوكول) |
| GRP-042 | Given a protocol card's delete button, when confirming «حذف البروتوكول؟» («سيتم حذف «X». الأدوية نفسها لن تُحذف.»), then «تم حذف البروتوكول» and the card disappears; the drugs remain on the drugs page | P0 | e2e | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |
| GRP-043 | Given the delete confirmation of a protocol, when choosing «إلغاء», then the protocol is kept | P1 | e2e | [protocols § تعديل أو حذف](../features/protocols/business.md#تعديل-أو-حذف-بروتوكول) |
| GRP-044 | Given the prescription's protocol picker, then each protocol shows its name, «الأدوية: N» and its drug names joined with " · " | P2 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-045 | Given a clinic without protocols, when the prescription's protocol picker shows no search, then it says «لا توجد بروتوكولات في هذه العيادة بعد.»; with a search and no match, «لا توجد بروتوكولات مطابقة للبحث.» | P2 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-097 | Given the prescription's Protocols tab (Arabic and English UI, 1280 and 375 px), when typing «عمليه», then «بعد عملية المياه» is listed (the picker uses the same search) | P0 | e2e | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |

### Editor (UI)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| GRP-046 | Given «بروتوكول جديد», when typing a name, clicking 3 drugs in «إضافة أدوية» and saving, then «تم إنشاء البروتوكول» (English "Protocol created") and the list shows it with «الأدوية: 3» | P0 | e2e | [protocols § إنشاء بروتوكول](../features/protocols/business.md#إنشاء-بروتوكول) |
| GRP-047 | Given the new-protocol editor, when it opens, then the title is «بروتوكول جديد», the name field has the focus and «لا توجد أدوية في هذا البروتوكول» is shown | P2 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-048 | Given an existing protocol, when changing it and saving, then «تم تحديث البروتوكول» (English "Protocol updated") and the editor goes back to the list | P0 | e2e | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |
| GRP-049 | Given the editor with an empty or spaces-only name, when saving, then the name field shows «الاسم مطلوب.» and no request is sent | P0 | ui | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |
| GRP-050 | Given the editor with a name and no drugs, when saving, then the error toast «أضف دواءً واحدًا على الأقل.» appears and no request is sent | P0 | ui | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |
| GRP-051 | Given the drug picker in the editor, when a drug is clicked, then it is appended to «أدوية هذا البروتوكول» with no override (its default dosing sentence shown) and the picker marks it «مُضاف» | P0 | ui | [protocols § إنشاء بروتوكول](../features/protocols/business.md#إنشاء-بروتوكول) |
| GRP-052 | Given the picker focused in the editor, when using ↓/↑ and Enter, then the highlighted drug is added | P1 | e2e | [protocols § إنشاء بروتوكول](../features/protocols/business.md#إنشاء-بروتوكول) |
| GRP-053 | Given a drug already in the protocol for its (effective) eye, when it is clicked again in the picker, then the toast ««Tobradex» موجود بالفعل في هذا البروتوكول لنفس العين» appears and no line is added | P0 | ui | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |
| GRP-054 | Given the editor's drug picker, when a drug is double-clicked, then one line is added and no «… موجود بالفعل في هذا البروتوكول لنفس العين» toast follows | P1 | ui | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| GRP-055 | Given a line of drug A overridden to the left eye while A's default eye is right, when A is clicked again in the picker, then a second line (right, no override) is added | P2 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-056 | Given 3 lines, when dragging the third to the top by its handle and saving, then reopening shows the new order | P0 | e2e | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |
| GRP-057 | Given a line, when clicking ✕, then it is removed from the list (saved only with Save) | P1 | ui | [protocols § إنشاء بروتوكول](../features/protocols/business.md#إنشاء-بروتوكول) |
| GRP-058 | Given lines, then each is numbered 1..N and shows the drug name and its **effective** sentence (drug default + override); when the effective dosing has no dose, frequency, duration or tapering (empty, only an eye, or only «تُحدد عند الإضافة»), the drug's description followed by the eye part if any | P1 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-098 | Given a line whose drug's default dosing is only «اليمنى» (no override), then it shows the description then «في العين اليمنى»; a line whose override is only «تُحدد عند الإضافة» shows the description and the chip «العين تُحدد عند إضافة البروتوكول» | P2 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-059 | Given an existing protocol, when the editor opens, then the title is «تعديل البروتوكول» and the name and lines are pre-filled | P1 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-060 | Given `/protocols/abc` or `/protocols/1.5`, when opened, then the app redirects to `/protocols` | P2 | ui | [overview § App shell](../tech/overview.md#app-shell) |
| GRP-061 | Given `/protocols/{id}` of a deleted or unknown protocol, when opened, then an error «هذا العنصر لم يعد موجودًا.» with «إعادة المحاولة» is shown instead of the form | P1 | e2e | [overview § Errors](../tech/overview.md#errors-problemdetails) |
| GRP-099 | Given a protocol opened earlier (cached) whose drug was renamed or got a new default dosing since, when its editor opens again, then the loading spinner shows until the protocol is fetched again and the form shows the fresh name and sentence, never the cached ones; a failed fetch shows the error with «إعادة المحاولة» instead of the cached form; a refetch while the editor is open keeps the form and its changes | P0 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-062 | Given the editor's Delete button, when confirmed, then «تم حذف البروتوكول» and the app goes back to the list | P1 | e2e | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |
| GRP-063 | Given a protocol deleted in another window, when this editor saves, then the toast «هذا العنصر لم يعد موجودًا.» appears | P2 | ui | [overview § Errors](../tech/overview.md#errors-problemdetails) |
| GRP-064 | Given a user with `protocols.details` but not `protocols.update`, when opening a protocol, then the title is «البروتوكول», the name is read-only and there is no picker, Save, Cancel, ✎, ⊕, ✕ or drag handle | P1 | e2e | [protocols § المستخدمون](../features/protocols/business.md#المستخدمون) |
| GRP-065 | Given two windows editing the same protocol, when both save, then the last save wins (all lines replaced) and no error is shown | P2 | api | [protocols tech § Backend](../features/protocols/tech.md#backend-clinichubapplicationfeaturescatalogprotocols) |

### Overrides and inheritance

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| GRP-066 | Given an own drug's line, when clicking ✎, then «الجرعة في هذا البروتوكول» opens with the drug name, the hint «الحقول الفارغة تأخذ الجرعة الافتراضية للدواء.» and an ⓘ «افتراضي الدواء» explanation (a shared drug's line has no inherit hint: CAT-171) | P1 | ui | [protocols § جرعة خاصة](../features/protocols/business.md#جرعة-خاصة-بالبروتوكول), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| GRP-067 | Given the override dialog of an own drug's line with no override, then each empty select shows «افتراضي الدواء» (English "Drug default"), the dose field's placeholder says so, and the preview shows the drug's default sentence (a shared drug's line shows no «افتراضي الدواء»: CAT-171) | P1 | ui | [protocols § جرعة خاصة](../features/protocols/business.md#جرعة-خاصة-بالبروتوكول), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| GRP-068 | Given a drug default «نقطة واحدة 4 مرات يوميًا لمدة أسبوعين», when only the times are overridden to 6, then the preview reads «نقطة واحدة 6 مرات يوميًا لمدة أسبوعين» | P0 | ui | [protocols § جرعة خاصة](../features/protocols/business.md#جرعة-خاصة-بالبروتوكول) |
| GRP-069 | Given a saved override on a line, then the line shows the chip «جرعة خاصة بالبروتوكول» with the tooltip «لهذا الدواء جرعة خاصة في هذا البروتوكول بدل جرعته الافتراضية.» | P1 | ui | [protocols § جرعة خاصة](../features/protocols/business.md#جرعة-خاصة-بالبروتوكول) |
| GRP-070 | Given an own drug's line with an override, when clicking «استخدام جرعة الدواء الافتراضية» and saving the dialog, then the override is cleared, the chip disappears and the line shows the drug default (a shared drug's line has no such button: CAT-171) | P1 | ui | [protocols § جرعة خاصة](../features/protocols/business.md#جرعة-خاصة-بالبروتوكول), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| GRP-071 | Given the override dialog with no override, then «استخدام جرعة الدواء الافتراضية» is disabled | P2 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-072 | Given a protocol whose line overrides only the frequency, when the drug's default duration is changed on the drugs page, then the protocol line shows the protocol's frequency with the drug's new duration | P0 | e2e | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |
| GRP-073 | Given a line without override, when the drug's default dosing changes, then the line follows it completely (no chip) | P0 | e2e | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |
| GRP-074 | Given an override with only a dose amount (no unit), when saving the dialog, then the unit field turns red and the dialog stays open (dose amount + unit are one part) | P2 | ui | [protocols tech § Edge](../features/protocols/tech.md#edge-cases--limitations) |
| GRP-075 | Given an override dialog with an invalid value (e.g. times 25), when saving, then the field turns red and the dialog stays open | P1 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-076 | Given the override dialog, when choosing an eye already used by another line of the same drug, then the toast ««X» موجود بالفعل في هذا البروتوكول لنفس العين» appears and the dialog stays open | P1 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |

### "Ask when adding" eye and other eye

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| GRP-077 | Given the override dialog, then the eye choices include «تُحدد عند الإضافة» (with the tooltip «العين غير محددة في البروتوكول: …») besides اليمنى / اليسرى / العينين / بدون عين | P0 | ui | [protocols § تُحدد عند الإضافة](../features/protocols/business.md#تُحدد-عند-الإضافة-العين) |
| GRP-078 | Given the eye «تُحدد عند الإضافة» chosen, then the preview shows the sentence without an eye and under it «العين تُحدد عند إضافة البروتوكول» | P1 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-079 | Given a line with eye ask, then it shows the chip «العين تُحدد عند إضافة البروتوكول» with the «askEyeInfo» tooltip | P1 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-080 | Given the drug dialog (default dosing) or the prescription line dialog, then «تُحدد عند الإضافة» is not offered | P1 | ui | [protocols tech § Data model](../features/protocols/tech.md#data-model) |
| GRP-081 | Given a line whose effective eye is right (or left) and no line of the same drug for the other eye, then ⊕ «إضافة للعين الأخرى» is shown; clicking it inserts a line for the other eye right after it with the same dosing | P0 | ui | [protocols § نفس الدواء للعينين](../features/protocols/business.md#نفس-الدواء-للعينين-بجرعتين-مختلفتين) |
| GRP-082 | Given lines of a drug for both right and left, or a line whose effective eye is both / none / ask / not set, then ⊕ is not shown | P1 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-083 | Given right and left lines of the same drug with different doses, when saved and reopened, then both lines keep their own dosing | P0 | e2e | [protocols § نفس الدواء للعينين](../features/protocols/business.md#نفس-الدواء-للعينين-بجرعتين-مختلفتين) |
| GRP-084 | Given a saved protocol whose two lines of a drug now have the same effective eye (the drug's default eye changed), when the editor opens, then both lines get the chip «نفس الدواء والعين في سطر آخر» (en "Same drug and eye as another line") and the alert «يوجد دواء مكرر في البروتوكول لنفس العين (مُعلَّم بالأسفل). احذف أحد السطرين أو غيّر العين، ثم احفظ.» (en "A drug is in the protocol twice for the same eye (marked below). Remove a line or change its eye, then save.") shows above the lines | P0 | e2e | [protocols § القواعد](../features/protocols/business.md#القواعد-التشغيلية) |
| GRP-085 | Given clashing lines in the editor, when saving, then the same text shows as an error toast and no request is sent; after one line is removed or its eye changed, the chips and the alert go and the save succeeds | P0 | ui | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |
| GRP-086 | Given a user without `protocols.update` opening a protocol with clashing lines, then the chips show but not the alert | P2 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |

### Unsaved-changes guard

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| GRP-087 | Given an editor with unsaved changes, when clicking «إلغاء» or «رجوع», then «تجاهل التغييرات؟» / «ستفقد التغييرات غير المحفوظة على هذا البروتوكول.» (en "Discard changes?" / "Your unsaved changes to this protocol will be lost.") asks, with «تجاهل» and «إلغاء» | P0 | e2e | [protocols § الرسائل](../features/protocols/business.md#الرسائل-التي-تظهر-للمستخدم) |
| GRP-088 | Given the discard question, when choosing «إلغاء», then the editor stays with the changes | P1 | e2e | [protocols § تعديل أو حذف](../features/protocols/business.md#تعديل-أو-حذف-بروتوكول) |
| GRP-089 | Given the discard question, when choosing «تجاهل», then the app goes back to the list and the protocol is unchanged | P1 | e2e | [protocols § تعديل أو حذف](../features/protocols/business.md#تعديل-أو-حذف-بروتوكول) |
| GRP-090 | Given an editor without changes, when clicking «رجوع», then it leaves without asking | P1 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-091 | Given a change undone by hand (line dragged away and back, override set then reset, name edited back or only trailing spaces added), when clicking «رجوع», then it leaves without asking | P2 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-092 | Given each kind of change alone (name, add line, remove line, reorder, override), when clicking «رجوع», then the question appears | P1 | ui | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-093 | Given unsaved changes, when closing or reloading the tab, then the browser's "leave page?" prompt appears; without changes it does not | P1 | e2e | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| GRP-094 | Given unsaved changes, when navigating with the sidebar, then the changes are discarded without asking (documented limitation) | P2 | e2e | [protocols § ما لا تدعمه](../features/protocols/business.md#ما-لا-تدعمه-الميزة-حاليًا) |
| GRP-095 | Given a successful save, when the editor navigates away, then no discard question appears | P1 | e2e | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |

### Rename to protocols (M1.7a)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| GRP-100 | Given an old bookmark `/groups`, `/groups/new`, `/groups/{id}` or `/groups?search=x&page=2`, then it redirects to the matching `/protocols…` with the same id and query | P1 | e2e | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| GRP-101 | Given the API's old routes `/api/v1/drug-groups…`, then 404 `notFound` for GET and 405 `methodNotAllowed` for POST, PUT and DELETE (no alias kept) | P2 | api | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| GRP-102 | Given every screen in Arabic (sidebar, page titles, buttons, toasts, empty states, dialogs, prescription tabs, delete warnings), then no «مجموعة» / «المجموعات» remains; in English no "group" (all locale strings searched for leftovers) | P0 | unit+e2e | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| GRP-103 | Given Arabic grammar with the masculine «بروتوكول», then «تم إنشاء البروتوكول», «تم تحديث البروتوكول», «تم حذف البروتوكول», «بروتوكول جديد», «حذف البروتوكول؟» | P1 | ui | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| GRP-104 | Given `document.title`, every `aria-label`, tooltip and error text, then no "group" / «مجموعة» (GRP-102 covers the visible text) | P1 | unit | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| GRP-105 | Given a tab opened before the upgrade (old bundle) calling `/api/v1/drug-groups`, then the SPA's existing 404/405 handling applies (its usual error message, no blank page) | P2 | ui | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| GRP-106 | Given a protocol created as «علاج آلام» and renamed to «مُضاد حيوي», then its stored `SearchName` is `SearchText.Fold` of the new name, `search=مضاد حيوي` finds it and `search=الام` no longer does | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |

## DOSE — Structured dosing

Sources: [dosing business](../features/dosing/business.md), [dosing tech](../features/dosing/tech.md),
`ClinicHub.Web/src/features/dosing/dosingText.ts`, `src/i18n/locales/rxTextAr.ts`, `ClinicHub.Domain/Catalog/DosingRules.cs`.
Sentence cases are `unit` (Vitest on `dosingToText`); the parity fixture (D6) also runs the validity/normalization rows
through xUnit (`DosingRules`) and Vitest (`normalizeDosing`/`dosingErrors`).

### Sentence: dose and unit

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DOSE-001 | Given unit drop and amounts empty / 1 / 2, then the sentence starts «نقطة واحدة» / «نقطة واحدة» / «نقطتين» | P0 | unit | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-002 | Given unit drop and amounts 3 / 10 (few), then «3 نقاط» / «10 نقاط» | P0 | unit | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-003 | Given unit drop and amounts 11 / 99 (many), then «11 نقطة» / «99 نقطة» | P0 | unit | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-004 | Given unit drop and amounts 100 / 101 / 102 / 1000 (other), then «100 نقطة» / «101 نقطة» / «102 نقطة» / «1000 نقطة» | P1 | unit | [dosing tech § i18n](../features/dosing/tech.md#i18n) |
| DOSE-005 | Given unit drop and amounts 103 (few) / 111 (many), then «103 نقاط» / «111 نقطة» | P2 | unit | [dosing tech § i18n](../features/dosing/tech.md#i18n) |
| DOSE-006 | Given unit drop and amount 0.5, then «نصف نقطة» | P0 | unit | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-007 | Given unit drop and amounts 1.5 / 0.25, then «1.5 نقطة» / «0.25 نقطة» | P1 | unit | [dosing tech § Edge](../features/dosing/tech.md#edge-cases--limitations) |
| DOSE-008 | Given unit tablet and amounts empty / 1 / 2 / 3 / 10, then «قرص واحد» / «قرص واحد» / «قرصين» / «3 أقراص» / «10 أقراص» | P0 | unit | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-009 | Given unit tablet and amounts 11 / 99 / 100 / 103 / 111, then «11 قرصًا» / «99 قرصًا» / «100 قرص» / «103 أقراص» / «111 قرصًا» | P1 | unit | [dosing tech § i18n](../features/dosing/tech.md#i18n) |
| DOSE-010 | Given unit tablet and amounts 0.5 / 1.5, then «نصف قرص» / «1.5 قرص» | P0 | unit | [dosing tech § Edge](../features/dosing/tech.md#edge-cases--limitations) |
| DOSE-011 | Given unit capsule and amounts empty / 1 / 2 / 3 / 10, then «كبسولة واحدة» / «كبسولة واحدة» / «كبسولتين» / «3 كبسولات» / «10 كبسولات» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-012 | Given unit capsule and amounts 11 / 100 / 0.5 / 1.5, then «11 كبسولة» / «100 كبسولة» / «نصف كبسولة» / «1.5 كبسولة» | P1 | unit | [dosing tech § i18n](../features/dosing/tech.md#i18n) |
| DOSE-013 | Given unit ml and amounts empty / 1 / 2 / 5 / 11 / 100, then «1 مل» / «1 مل» / «2 مل» / «5 مل» / «11 مل» / «100 مل» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-014 | Given unit ml and amounts 0.5 / 2.5, then «نصف مل» / «2.5 مل» | P1 | unit | [dosing tech § i18n](../features/dosing/tech.md#i18n) |
| DOSE-015 | Given unit application and amounts empty / 1 / 2 / 3 / 11 / 100 / 0.5 / 1.5, then always «طبقة رقيقة» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-016 | Given no unit (and no amount), then the sentence has no dose part | P1 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |

### Sentence: eye, frequency, duration, order

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DOSE-017 | Given eye right / left / both, then the eye part is «في العين اليمنى» / «في العين اليسرى» / «في العينين» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-018 | Given eye none, not set, or ask, then the sentence has no eye part and no double space | P0 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-019 | Given daily 1 / 2 / 3 / 10, then «مرة واحدة يوميًا» / «مرتين يوميًا» / «3 مرات يوميًا» / «10 مرات يوميًا» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-020 | Given daily 11 / 24, then «11 مرة يوميًا» / «24 مرة يوميًا» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-021 | Given every-hours 1 / 2 / 3 / 8 / 10, then «كل ساعة» / «كل ساعتين» / «كل 3 ساعات» / «كل 8 ساعات» / «كل 10 ساعات» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-022 | Given every-hours 11 / 12 / 72, then «كل 11 ساعة» / «كل 12 ساعة» / «كل 72 ساعة» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-023 | Given frequency bedtime / asNeeded, then «قبل النوم» / «عند اللزوم» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-024 | Given a custom frequency "  صباحًا ومساءً  ", then the sentence contains «صباحًا ومساءً» exactly as typed, trimmed | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-025 | Given daily or every-hours without a number (incomplete), then the sentence has no frequency part | P2 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-026 | Given days 1 / 2 / 3 / 10, then «لمدة يوم واحد» / «لمدة يومين» / «لمدة 3 أيام» / «لمدة 10 أيام» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-027 | Given days 11 / 99 / 100 / 101 / 103 / 111 / 365, then «لمدة 11 يومًا» / «لمدة 99 يومًا» / «لمدة 100 يوم» / «لمدة 101 يوم» / «لمدة 103 أيام» / «لمدة 111 يومًا» / «لمدة 365 يومًا» | P1 | unit | [dosing tech § i18n](../features/dosing/tech.md#i18n) |
| DOSE-028 | Given weeks 1 / 2 / 3 / 10, then «لمدة أسبوع» / «لمدة أسبوعين» / «لمدة 3 أسابيع» / «لمدة 10 أسابيع» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-029 | Given weeks 11 / 52 / 100, then «لمدة 11 أسبوعًا» / «لمدة 52 أسبوعًا» / «لمدة 100 أسبوع» | P1 | unit | [dosing tech § i18n](../features/dosing/tech.md#i18n) |
| DOSE-030 | Given months 1 / 2 / 3 / 6 / 10, then «لمدة شهر» / «لمدة شهرين» / «لمدة 3 أشهر» / «لمدة 6 أشهر» / «لمدة 10 أشهر» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-031 | Given months 11 / 12 / 100, then «لمدة 11 شهرًا» / «لمدة 12 شهرًا» / «لمدة 100 شهر» | P1 | unit | [dosing tech § i18n](../features/dosing/tech.md#i18n) |
| DOSE-032 | Given duration continuous / untilNextVisit, then «بصفة مستمرة» / «حتى الزيارة القادمة» | P0 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-033 | Given days / weeks / months without a number (incomplete), then the sentence has no duration part | P2 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-034 | Given 2 drops, left eye, daily 6, 2 weeks, then exactly «نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين» (order dose → eye → frequency → duration, single spaces) | P0 | unit | [dosing § الهدف](../features/dosing/business.md#الهدف) |
| DOSE-035 | Given 1 tablet, no eye, every 8 hours, 5 days, then «قرص واحد كل 8 ساعات لمدة 5 أيام» | P0 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-036 | Given ointment, both eyes, bedtime, until next visit, then «طبقة رقيقة في العينين قبل النوم حتى الزيارة القادمة» | P1 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-037 | Given only an eye (right), then «في العين اليمنى»; only a duration (1 week), then «لمدة أسبوع»; only a frequency (as needed), then «عند اللزوم» | P1 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-038 | Given 1 drop, right eye, custom «بعد الأكل», continuous, then «نقطة واحدة في العين اليمنى بعد الأكل بصفة مستمرة» | P1 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-039 | Given an empty dosing, null or undefined, then `dosingToText` returns "" | P0 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-040 | Given the interface in English, then `dosingToText` still returns the same Arabic sentence (fixed Arabic translator) | P0 | unit | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-041 | Given any sentence, then all numbers are Western digits (1, 2, 3), never Arabic-Indic (١، ٢، ٣) | P0 | unit | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-042 | Given a dosing with fields that don't apply (e.g. bedtime with value 3, continuous with value 4, custom text with daily), then the sentence ignores them («قبل النوم», «بصفة مستمرة») | P1 | unit | [dosing tech § Backend](../features/dosing/tech.md#backend) |

### Validation limits (both sides of each)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DOSE-043 | Given dose amount 0 or -1 (with a unit), then invalid (`doseAmount` on the client, `invalidDosing` on the API) | P0 | unit+api | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-044 | Given dose amount 0.001, 0.5, 1000 (with a unit), then valid | P1 | unit+api | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-045 | Given dose amount 1000.5 (or 1001), then invalid | P0 | unit+api | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-046 | Given a dose amount without a unit, then invalid (client highlights the unit; API `invalidDosing`) | P0 | unit+api | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-047 | Given a unit without an amount, then valid (reads as one) | P1 | unit+api | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-048 | Given daily with 0 / 1 / 24 / 25 times, then invalid / valid / valid / invalid | P0 | unit+api | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-049 | Given daily without a number, then invalid (`frequencyValue`) | P0 | unit+api | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-050 | Given every-hours with 0 / 1 / 72 / 73 hours, then invalid / valid / valid / invalid; without a number, invalid | P0 | unit+api | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-051 | Given custom frequency with no text, or only spaces, then invalid (`frequencyText`) | P0 | unit+api | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-052 | Given custom text of 200 characters (after trim), then valid; 201 characters, then API `invalidDosing` | P1 | api | [dosing tech § Data model](../features/dosing/tech.md#data-model) |
| DOSE-053 | Given the custom text field, when typing or pasting more than 200 characters, then the field stops at 200 | P2 | ui | [dosing tech § Data model](../features/dosing/tech.md#data-model) |
| DOSE-054 | Given custom text containing a NUL, then API `invalidDosing` | P2 | api | [drugs tech § Backend](../features/drugs/tech.md#backend-clinichubapplicationfeaturescatalogdrugs) |
| DOSE-055 | Given days / weeks / months with 0 / 1 / 365 / 366, then invalid / valid / valid / invalid; without a number, invalid (`durationValue`) | P0 | unit+api | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| DOSE-056 | Given an unknown code (unit "spoon", frequency "weekly", duration "years", eye "top"), then API `invalidDosing` | P1 | api | [dosing tech § Data model](../features/dosing/tech.md#data-model) |
| DOSE-057 | Given a code in another case ("Drop", "Daily"), then API `invalidDosing` (codes are exact) | P2 | api | [dosing tech § Data model](../features/dosing/tech.md#data-model) |
| DOSE-058 | Given eye `ask` on a drug's default dosing, then 400 `invalidDosing`; on a protocol line, accepted | P0 | api | [dosing tech § Backend](../features/dosing/tech.md#backend) |
| DOSE-059 | Given an empty dosing, then valid (no errors) and normalized to null (API) / `isDosingEmpty` true (client) | P1 | unit+api | [dosing tech § Backend](../features/dosing/tech.md#backend) |
| DOSE-060 | Given an invalid dosing reaching the API (e.g. through a stale form), when saving, then the toast reads «بعض بيانات الجرعة ناقصة أو غير صحيحة.» (English "Some dosing values are missing or invalid.") | P1 | api+ui | [dosing § الرسائل](../features/dosing/business.md#الرسائل-التي-تظهر-للمستخدم) |

### Normalization (parity fixture: C# and TypeScript)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DOSE-061 | Given bedtime / asNeeded / custom with a `frequencyValue`, then normalize drops the value | P1 | unit | [dosing tech § Backend](../features/dosing/tech.md#backend) |
| DOSE-062 | Given a non-custom frequency with `frequencyText`, then normalize drops the text; custom text is trimmed | P1 | unit | [dosing tech § Backend](../features/dosing/tech.md#backend) |
| DOSE-063 | Given continuous / untilNextVisit with a `durationValue`, then normalize drops the value | P1 | unit | [dosing tech § Backend](../features/dosing/tech.md#backend) |
| DOSE-064 | Given blank strings for codes (`doseUnit:""`, `eye:" "`, a step's `frequency` / `durationUnit`), then they normalize to null, in the API and in the SPA's `normalizeDosing` / `normalizeStep` (so `isDosingEmpty` and `dosingErrors` agree with the API: a dose amount with a blank unit is missing its unit) | P2 | unit | [dosing tech § Backend](../features/dosing/tech.md#backend), [§ Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-065 | Given all fields empty, then normalize returns null (API) and the drug stores `defaultDosing: null` | P1 | unit+api | [dosing tech § Data model](../features/dosing/tech.md#data-model) |
| DOSE-066 | Given the same input, then C# `DosingRules.Normalize`/`IsValid` and TS `normalizeDosing`/`dosingErrors` agree for every row of `tests/fixtures/dosing-cases.json` | P0 | unit | [M1.6 § D6](../design/m1.6-test-foundation.md#d6-rule-parity-between-c-and-typescript) |
| DOSE-067 | Given two dosings that differ only in fields that don't apply, then `sameDosing` is true | P1 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-068 | Given `eyeKey` of a dosing without an eye, then "none"; `otherEye` right↔left, and null for both/none/ask | P1 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-088 | Given `hasDosingInstructions`, then false for null, `{}` and a dosing with only an eye (right, left, both, none or ask); true as soon as a dose unit, a frequency, a duration or taper steps is set | P1 | unit | [dosing tech § Edge](../features/dosing/tech.md#edge-cases--limitations) |

### Merge (drug default → protocol override)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DOSE-069 | Given an empty override, then `mergeDosing` returns the base | P0 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-070 | Given an override with only a dose (amount + unit), then dose from the override, frequency/duration/eye from the base | P0 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-071 | Given an override with only a unit (no amount) over a base "2 drops", then the merged dose is the override's unit with no amount (reads as one) | P2 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-072 | Given an override frequency daily 6 over base daily 4 / every 8 hours / custom, then the frequency and its value or text come from the override only | P0 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-073 | Given an override duration over a base duration, then duration + value come from the override | P0 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-074 | Given an override eye (incl. "none" and "ask") over a base eye "right", then the override eye wins; no override eye keeps "right" | P0 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-075 | Given a null base (drug without default) and an override, then the merge equals the normalized override | P1 | unit | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |

### Dosing fields (UI)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| DOSE-076 | Given the dosing fields, then unit offers نقطة / قرص / كبسولة / مل / دهان (مرهم), frequency مرات في اليوم / كل عدد ساعات / قبل النوم / عند اللزوم / نص مخصص, period أيام / أسابيع / أشهر / بصفة مستمرة / حتى الزيارة القادمة, eye اليمنى / اليسرى / العينين / بدون عين (English labels in the English UI) | P1 | ui | [dosing § الحقول](../features/dosing/business.md#الحقول) |
| DOSE-077 | Given frequency «مرات في اليوم» or «كل عدد ساعات», then a number field «العدد» or «الساعات» appears next to it; for the others it is hidden | P1 | ui | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-078 | Given frequency «نص مخصص», then a text field «نص عدد المرات» (direction auto) appears | P1 | ui | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-079 | Given period days/weeks/months, then a number field «المدة» appears; for continuous/until next visit it is hidden | P1 | ui | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-080 | Given the eye toggle with «اليمنى» selected, when clicking «اليمنى» again, then the eye is cleared | P2 | ui | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-081 | Given the dosing fields, when changing any field, then the preview «نص الروشتة» updates at once with the Arabic sentence | P0 | ui | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-082 | Given no dosing, then the preview shows «لا توجد جرعة محددة» (English "No dosing set") in a muted color | P1 | ui | [dosing § الرسائل](../features/dosing/business.md#الرسائل-التي-تظهر-للمستخدم) |
| DOSE-083 | Given the dose field, when hovering it, then the tooltip «اكتب 0.5 لنصف قرص أو نصف نقطة.» shows | P2 | ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| DOSE-084 | Given an invalid dosing and a save attempt, then exactly the invalid fields are red (amount, unit, times/hours, custom text, duration number), and fixing a field removes its red | P0 | ui | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-085 | Given an invalid dosing, then no field is red before the first save attempt | P2 | ui | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-086 | Given quick successive edits (typing the amount then picking the unit at once), then both changes are kept | P2 | ui | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| DOSE-087 | Given a drug with a default dosing, then its sentence shows under its name in the drugs table, the drug picker and the read-only details | P0 | e2e | [dosing § كيف تعمل الجرعة](../features/dosing/business.md#كيف-تعمل-الجرعة-على-ثلاثة-مستويات) |

## TAPER — Tapering schedules

Sources: [tapering business](../features/tapering/business.md), [tapering tech](../features/tapering/tech.md),
`src/features/dosing/taper.ts`, `taperConfig.ts`

### Rules (API and parity fixture)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TAPER-001 | Given a drug default with 2 valid steps, when saved, then 201/200 and GET returns the same `taperSteps` (order, frequency, values) and `frequency`/`durationUnit` null | P0 | api | [tapering tech § API](../features/tapering/tech.md#api) |
| TAPER-002 | Given 10 steps, when saved, then accepted | P0 | unit+api | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-003 | Given 11 steps, when saved, then 400 `invalidDosing`; the client marks `taperSteps` | P0 | unit+api | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-004 | Given 1 step (daily 4, 1 week), when saved, then it is stored as a plain dosing (`taperSteps:null`, `frequency:"daily"`, `frequencyValue:4`, `durationUnit:"weeks"`, `durationValue:1`) | P0 | unit+api | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-005 | Given 1 step with a step dose 2 and a dosing dose 1, when normalized, then the dosing dose becomes 2 | P2 | unit | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |
| TAPER-006 | Given `taperSteps: []`, when saved, then treated as no schedule | P2 | unit+api | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |
| TAPER-007 | Given steps and a dosing-level frequency/duration in the same request, when saved, then the steps are kept and the dosing's own frequency/duration are cleared | P1 | unit+api | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |
| TAPER-008 | Given a step with frequency bedtime / asNeeded / custom, or none, then invalid | P0 | unit+api | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-009 | Given a step daily with 0 / 1 / 24 / 25, or every-hours with 0 / 1 / 72 / 73, then invalid / valid / valid / invalid | P1 | unit+api | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |
| TAPER-010 | Given a step with period months (any step, incl. the last), then invalid | P1 | unit+api | [tapering § ما لا تدعمه](../features/tapering/business.md#ما-لا-تدعمه-الميزة-حاليًا) |
| TAPER-011 | Given a step with days/weeks 0 / 1 / 365 / 366, or without a number, then invalid / valid / valid / invalid / invalid | P1 | unit+api | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |
| TAPER-012 | Given a step without a period, then invalid | P1 | unit+api | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-013 | Given the last step continuous or until next visit, then valid | P0 | unit+api | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-014 | Given a non-last step continuous or until next visit, then invalid (`invalidDosing`; client field `taperSteps.<i>.durationUnit`) | P0 | unit+api | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-015 | Given a step dose 0 / -1 / 1000.5, then invalid; 0.5 / 1000, then valid | P1 | unit+api | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |
| TAPER-016 | Given a protocol override with steps that have step doses but no unit (the unit comes from the drug), when saved, then accepted (the API accepts them on a drug default too, where they never show in the sentence) | P1 | api | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |
| TAPER-017 | Given a step 1 dose 2 and a dosing dose 1, when normalized, then the dosing dose is 2 and step 1's dose is cleared | P1 | unit+api | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |
| TAPER-018 | Given a later step whose dose equals the dosing dose, when normalized, then that step dose is cleared | P1 | unit+api | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |
| TAPER-019 | Given step values that don't apply (every-hours with a duration value on continuous), when normalized, then they are dropped | P2 | unit | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |
| TAPER-020 | Given a protocol override with steps over a drug default with a plain frequency, then the merged dosing uses the override steps (base frequency/duration dropped) | P0 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-021 | Given a drug default with steps and a protocol override with only a frequency (or only a duration), then the merged dosing has no steps and uses the override's frequency (or duration) | P1 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-022 | Given a drug default with steps and an override with only a dose or an eye, then the merged dosing keeps the drug's steps | P1 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-023 | Given a saved taper, when the drug is saved again without steps, then the taper is removed | P1 | api | [tapering tech § API](../features/tapering/tech.md#api) |
| TAPER-024 | Given a prescription line stored before tapering existed (no `taperSteps`), when the page loads, then it shows as before | P2 | unit | [tapering tech § Edge](../features/tapering/tech.md#edge-cases--limitations) |
| TAPER-080 | Given a taper whose step 1 has a dose but the dosing has no unit (e.g. `taperSteps: [{doseAmount: 2, daily 4, 1 week}, {daily 3, 1 week}]`, no `doseUnit`), when saved as a drug default or as a protocol line override, then 400 `invalidDosing` (step 1's dose becomes the dosing's dose, which needs its unit); the TypeScript rules refuse it too (parity fixture) | P1 | unit+api | [tapering tech § Backend](../features/tapering/tech.md#backend-clinichubdomaincatalogdosingrulescs) |

### Sentence

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TAPER-025 | Given 2 drops, right eye, steps [daily 4, 1 week] then [dose 1, daily 3, 1 week], then «نقطتين في العين اليمنى 4 مرات يوميًا لمدة أسبوع، ثم نقطة واحدة 3 مرات يوميًا لمدة أسبوع، ثم يتوقف» | P0 | unit | [tapering § الهدف](../features/tapering/business.md#الهدف) |
| TAPER-026 | Given 1 drop and steps without step doses [daily 4, 1 week], [daily 3, 1 week], then «نقطة واحدة 4 مرات يوميًا لمدة أسبوع، ثم 3 مرات يوميًا لمدة أسبوع، ثم يتوقف» (the dose is written once) | P0 | unit | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-027 | Given dose 2 drops and steps [–, daily 4, 1 w], [1, daily 3, 1 w], [–, daily 2, 1 w], then «نقطتين 4 مرات يوميًا لمدة أسبوع، ثم نقطة واحدة 3 مرات يوميًا لمدة أسبوع، ثم نقطتين مرتين يوميًا لمدة أسبوع، ثم يتوقف» (an empty step dose = the dose above, written again because it changed) | P1 | unit | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-028 | Given a drop unit with no amount and a step dose 1, then the step dose is not written (same as one); a step dose 2 writes «نقطتين» | P2 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-029 | Given a step dose 0.5 (unit drop), then that step reads «نصف نقطة …» | P2 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-030 | Given step doses but no unit on the dosing, then no step dose is written | P2 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-031 | Given the last step continuous, then the sentence ends «…، ثم مرة واحدة يوميًا بصفة مستمرة» without «ثم يتوقف» | P0 | unit | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-032 | Given the last step until next visit, then it ends «… حتى الزيارة القادمة» without «ثم يتوقف» | P0 | unit | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-033 | Given every-hours steps [every 6 h, 3 days], [every 8 h, 3 days], then «كل 6 ساعات لمدة 3 أيام، ثم كل 8 ساعات لمدة 3 أيام، ثم يتوقف» | P1 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-034 | Given 2 drops, left eye and steps, then the eye is written once, before the first step («نقطتين في العين اليسرى 4 مرات يوميًا …») | P1 | unit | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-035 | Given 10 steps, then one sentence with 9 «، ثم » joins plus «، ثم يتوقف» and no line break | P1 | unit | [tapering tech § Edge](../features/tapering/tech.md#edge-cases--limitations) |
| TAPER-036 | Given ointment with step doses (step 1 = 1, step 2 = 2), then a changed step dose still reads «طبقة رقيقة» and is written again because its value changed: «طبقة رقيقة مرتين يوميًا لمدة أسبوع، ثم طبقة رقيقة مرة واحدة يوميًا لمدة أسبوع، ثم يتوقف» | P2 | unit | [dosing § الحقول](../features/dosing/business.md#الحقول), [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-037 | Given steps joined, then the separator is exactly the Arabic comma «، ثم » (U+060C) | P1 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |

### Start, add step, total (pure logic)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TAPER-038 | Given daily 4 for 1 week, when the schedule starts, then steps [daily 4, 1 week], [daily 3, 1 week] | P0 | unit | [tapering § سيناريوهات](../features/tapering/business.md#سيناريوهات-الاستخدام) |
| TAPER-039 | Given an empty dosing, when the schedule starts, then [daily 4, 1 week], [daily 3, 1 week] | P1 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-040 | Given daily 1, when the schedule starts, then both steps are daily 1 (never below 1) | P2 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-041 | Given every 6 hours for 5 days, when the schedule starts, then both steps are every 6 hours, 5 days (no reduction for hours) | P2 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-042 | Given bedtime / as needed / custom, or months / continuous / until next visit, when the schedule starts, then the step uses daily 4 and/or 1 week instead | P2 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-043 | Given steps ending with [daily 3, 1 week], when adding a step, then [daily 2, 1 week] is appended | P0 | unit | [tapering § سيناريوهات](../features/tapering/business.md#سيناريوهات-الاستخدام) |
| TAPER-044 | Given the last step daily 1, when adding a step, then the new step is daily 1 | P2 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-045 | Given steps [daily 4, 1 w], [daily 2, continuous], when adding a step, then [daily 3, 1 w] is inserted before the open-ended step, which stays last | P0 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-046 | Given steps 1 week + 1 week, then the total chip reads «المدة الإجمالية: أسبوعين» (English "Total: 2 weeks") | P1 | unit+ui | [tapering § سيناريوهات](../features/tapering/business.md#سيناريوهات-الاستخدام) |
| TAPER-047 | Given totals of 7 / 14 / 21 / 77 days in whole weeks, then «المدة الإجمالية: أسبوع» / «أسبوعين» / «3 أسابيع» / «11 أسبوعًا» | P2 | unit+ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-048 | Given 1 week + 3 days (10 days), then «المدة الإجمالية: 10 أيام»; 1 / 2 / 15 / 100 days read «يوم واحد» / «يومين» / «15 يومًا» / «100 يوم» | P2 | unit+ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-049 | Given 2 weeks of fixed steps then a continuous last step, then «المدة الإجمالية: أسبوعين، ثم بصفة مستمرة» (English "Total: 2 weeks, then: Continuous") | P1 | unit+ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-050 | Given steps with no fixed duration yet, then no total chip is shown | P2 | ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |

### Generator

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TAPER-051 | Given start 6, reduce by 2, down to 1, each 1 week, then steps daily 6, 4, 2, 1, each 1 week | P0 | unit | [tapering § سيناريوهات](../features/tapering/business.md#سيناريوهات-الاستخدام) |
| TAPER-052 | Given start 4, reduce 1, down to 1, 3 days, then 4, 3, 2, 1 for 3 days each | P1 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-053 | Given start 6, reduce 4, down to 1, then 6, 2, 1 (always ends at "down to") | P1 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-054 | Given start 10, reduce 1, down to 1, then 10 steps (allowed) | P1 | unit | [tapering § الرسائل](../features/tapering/business.md#الرسائل-التي-تظهر-للمستخدم) |
| TAPER-055 | Given start 11, reduce 1, down to 1 (11 steps), then no result | P1 | unit | [tapering § الرسائل](../features/tapering/business.md#الرسائل-التي-تظهر-للمستخدم) |
| TAPER-056 | Given start 0 or 25, reduce 0, down to 0, down to above start, each 0 or 366, a non-integer (2.5) or an empty field, then no result | P1 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-057 | Given start 24, each 365 days, reduce 3, down to 1, then a valid plan (24, 21, 18, 15, 12, 9, 6, 3, 1 = 9 steps) | P2 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-058 | Given start = down to (e.g. 2 and 2), then a 1-step plan («عدد المراحل: 1», «إنشاء» enabled), which saves as a plain dosing | P2 | unit | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-059 | Given «إنشاء تلقائي…», when opened, then it is pre-filled from step 1 (start = its times a day, reduce 1, down to 1, each = its period) and shows «سيتم استبدال المراحل الحالية. يمكنك تعديل كل مرحلة بعد ذلك.» | P1 | ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-060 | Given a valid plan in the generator, then it shows «عدد المراحل: N»; clicking «إنشاء» replaces the steps and closes it | P0 | ui | [tapering § سيناريوهات](../features/tapering/business.md#سيناريوهات-الاستخدام) |
| TAPER-061 | Given an invalid plan, then the generator shows «راجع الأرقام. أقصى عدد للمراحل 10.» in red and «إنشاء» is disabled | P1 | ui | [tapering § الرسائل](../features/tapering/business.md#الرسائل-التي-تظهر-للمستخدم) |
| TAPER-062 | Given the generator, when choosing «إلغاء» (or clicking outside), then the steps are unchanged | P2 | ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |

### Steps editor (UI)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TAPER-063 | Given any dosing dialog (drug, protocol line, prescription line), then the «تقليل تدريجي» switch with an ⓘ («تقليل الجرعة على مراحل، …») is shown | P1 | ui | [tapering § سيناريوهات](../features/tapering/business.md#سيناريوهات-الاستخدام) |
| TAPER-064 | Given daily 4 for 1 week, when switching tapering on, then two step rows appear (4 then 3 times a day, 1 week each) instead of the frequency/period rows | P0 | ui | [tapering § سيناريوهات](../features/tapering/business.md#سيناريوهات-الاستخدام) |
| TAPER-065 | Given a schedule, when switching tapering off, then step 1 becomes the normal frequency and period | P0 | ui | [tapering § سيناريوهات](../features/tapering/business.md#سيناريوهات-الاستخدام) |
| TAPER-066 | Given 9 steps, when clicking «إضافة مرحلة», then 10 steps and the button becomes disabled with the tooltip «أقصى عدد للمراحل: 10» (on hover, or at once on a phone tap) | P1 | ui | [tapering § الرسائل](../features/tapering/business.md#الرسائل-التي-تظهر-للمستخدم) |
| TAPER-067 | Given «إضافة مرحلة» enabled, when hovering, then «تضيف مرحلة في النهاية بمرة أقل في اليوم. يمكنك تعديلها بعد ذلك.» | P2 | ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-068 | Given steps, when clicking a step's ✕ «حذف المرحلة», then that step is removed; with one step left the ✕ is disabled | P1 | ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-069 | Given steps, then only the last step's period list offers «بصفة مستمرة» and «حتى الزيارة القادمة»; the others offer أيام / أسابيع only; step frequency offers مرات في اليوم / كل عدد ساعات only | P0 | ui | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-070 | Given an open-ended period on a step that is not last, then the field is red, its value stays visible and the hint «المرحلة الأخيرة فقط يمكن أن تكون «بصفة مستمرة» أو «حتى الزيارة القادمة».» is shown; save is blocked | P1 | ui | [tapering § الرسائل](../features/tapering/business.md#الرسائل-التي-تظهر-للمستخدم) |
| TAPER-071 | Given a step with a missing or out-of-range number, when saving, then that step's field is red and nothing is saved | P0 | ui | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-072 | Given a unit and a dose above, then step 1's dose field is disabled, shows the dose above and has the tooltip «المرحلة الأولى تأخذ الجرعة المكتوبة بالأعلى.» | P1 | ui | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-073 | Given no unit above, then the step dose fields are disabled with the tooltip «اختر الوحدة بالأعلى لتحديد جرعة خاصة لكل مرحلة.» (on hover, or at once on a phone tap) | P1 | ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-074 | Given a unit above, then step 2+ dose fields are enabled, their placeholder is the dose above (or 1), and the tooltip reads «جرعة هذه المرحلة بنفس الوحدة المختارة بالأعلى. …» | P2 | ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| TAPER-075 | Given a step dose typed (step 2 = 1 drop), then the preview shows the step dose in the sentence | P0 | ui | [tapering § سيناريوهات](../features/tapering/business.md#سيناريوهات-الاستخدام) |
| TAPER-076 | Given a protocol line whose drug default is a taper and no override schedule, then the dialog shows «الجرعة الافتراضية للدواء فيها تقليل تدريجي. فعّل هذا الخيار لتغييره في هذا البروتوكول.» and the preview shows the drug's steps | P1 | ui | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-077 | Given that protocol line, when switching tapering on, then the drug's steps are copied into the override for editing | P0 | ui | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| TAPER-078 | Given a drug saved with a taper, when its dialog is reopened, then the switch is on and the steps are shown as saved | P0 | e2e | [tapering § سيناريوهات](../features/tapering/business.md#سيناريوهات-الاستخدام) |
| TAPER-079 | Given a drug with a taper default, when added to a prescription, then the line shows the full taper sentence and «تعديل الجرعة» opens with the steps | P0 | e2e | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |

## RX — Prescription builder

Sources: [prescription business](../features/prescription/business.md), [prescription tech](../features/prescription/tech.md),
[tech overview § Browser storage](../tech/overview.md#browser-storage)

### Page and adding drugs

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| RX-001 | Given a user with `prescriptions.create`, when logging in to a clinic, then the prescription page (`/`) opens first with «إضافة إلى الروشتة» and «الأدوية المختارة» | P0 | e2e | [rx § المستخدمون](../features/prescription/business.md#المستخدمون) |
| RX-002 | Given the page, then the «البروتوكولات» tab is selected by default and its search box has the focus | P1 | e2e | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-003 | Given a search typed in the Protocols tab, when switching to Drugs and back, then each tab still shows its own search | P2 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-004 | Given an empty prescription, then «لم يتم اختيار شيء بعد» / «ابحث عن بروتوكول أو دواء واضغط عليه لإضافته هنا.», the count chip 0, and «مسح الكل», «نسخ», «تعديل ونسخ» disabled | P1 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-005 | Given the Drugs tab, when clicking a drug, then a line is appended with the drug's default dosing sentence, the count chip increases and the picker marks the drug «مُضاف» | P0 | e2e | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-006 | Given the Drugs tab focused, when using ↓/↑ and Enter, then the highlighted drug is added | P1 | e2e | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-007 | Given a drug already in the list for its default eye, when it is added again, then the toast ««Tobradex» موجود بالفعل في القائمة» (English "“Tobradex” is already in the list") appears and no line is added | P0 | e2e | [rx § الرسائل](../features/prescription/business.md#الرسائل-التي-تظهر-للمستخدم) |
| RX-008 | Given a drug line whose eye was changed from right (default) to left, when the drug is added again, then a new line for the right eye is added | P1 | unit | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-009 | Given a drug without a default dosing, when added, then the line shows its description (multi-line kept) instead of a sentence | P0 | e2e | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-010 | Given a drug with a description D whose default dosing holds only an eye, when added, then the line shows D followed by the eye part (only «اليمنى»: D, then «في العين اليمنى»; only «بدون عين»: D alone), and the copied text has the same lines | P1 | ui | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-104 | Given a line edited to keep only an eye (dose, frequency and duration cleared), when saved, then the line shows the drug's description followed by the eye part | P2 | ui | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-011 | Given `addDrugs([A, A])` (same drug twice in one batch), then one line is added and `{added:1, skipped:1}` | P2 | unit | [rx tech § State](../features/prescription/tech.md#state-useprescriptionlinests) |
| RX-012 | Given the Drugs tab, when a drug is double-clicked, then one line is added and no «… موجود بالفعل في القائمة» toast follows (the second click of a burst is ignored) | P1 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-013 | Given a drug highlighted with ↓/↑, when Enter is pressed, then it is added (keyboard selection still works); Enter again → «… موجود بالفعل في القائمة» and no second line | P1 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-014 | Given two `addDrugs` calls for the same drug before a re-render, then one line (the checks read the latest lines) | P2 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |

### Adding a protocol

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| RX-015 | Given a protocol of 3 drugs and an empty prescription, when clicking it, then its 3 lines are appended in the protocol's order with each line's merged dosing (drug default + override) | P0 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-016 | Given lines already present, when a protocol with new drugs is added, then its lines are appended after them | P1 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-017 | Given a protocol added, then one toast lists «تمت الإضافة من «Post cataract»: 3» (English "Added from “Post cataract”: 3") | P0 | e2e | [rx § الرسائل](../features/prescription/business.md#الرسائل-التي-تظهر-للمستخدم) |
| RX-018 | Given a protocol with no "ask" lines, when it is added, then no eye question appears | P1 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-019 | Given a protocol with "ask" lines, when it is added, then «أي عين؟» asks once with «بعض أدوية «Post cataract» تُعطى للعين التي تختارها الآن.» and buttons «اليمنى» / «اليسرى» / «العينين» and «إلغاء» | P0 | e2e | [rx § الرسائل](../features/prescription/business.md#الرسائل-التي-تظهر-للمستخدم) |
| RX-020 | Given 3 "ask" lines and 1 "right" line, when choosing «اليسرى», then the 3 ask lines get the left eye and the right line stays right (asked only once) | P0 | unit+e2e | [protocols § تُحدد عند الإضافة](../features/protocols/business.md#تُحدد-عند-الإضافة-العين) |
| RX-021 | Given the eye question, when choosing «العينين», then the ask lines read «في العينين» | P1 | unit | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-022 | Given the eye question, when choosing «إلغاء» or pressing Esc, then nothing of the protocol is added and no toast appears; a click outside the dialog does nothing (it stays open) | P0 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-023 | Given the same protocol added twice with different chosen eyes (right, then left), then separate lines exist for each eye | P1 | unit | [rx tech § Edge](../features/prescription/tech.md#edge-cases--limitations) |
| RX-024 | Given a line of drug A for the right eye with the same dosing as the protocol's A line, when the protocol is added, then A is skipped without a question and the toast adds «موجود مسبقًا في القائمة: 1» | P0 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-025 | Given an existing line whose dosing equals the protocol's only after normalization (e.g. a leftover value of a non-numeric frequency), then it counts as identical | P2 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-026 | Given an identical taper schedule already in the list, when the protocol is added again, then it is skipped (no conflict) | P1 | unit | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| RX-027 | Given a protocol added twice in a row unchanged, then the second time the toast reads «تمت الإضافة من «X»: 0» and «موجود مسبقًا في القائمة: N» in the neutral (not success) style | P1 | e2e | [rx § الرسائل](../features/prescription/business.md#الرسائل-التي-تظهر-للمستخدم) |
| RX-028 | Given a protocol double-clicked, then its flow runs once (one eye question or none, one toast) and no drug appears twice for one eye; a click on a protocol while its dialogs are open does nothing | P1 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-029 | Given a saved protocol whose two lines give the same drug for the same eye after merging (the drug's default eye changed), when added, then the first line in protocol order is added and the toast adds «مكرر في البروتوكول ولم يُضف: 1» (en "Duplicated in the protocol, not added: 1") | P0 | unit+e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-030 | Given a protocol with drug A on «تُحدد عند الإضافة» and A on the right eye with different dosings, when added choosing «اليمنى», then «جرعتان لنفس العين» asks ««A» موجود في البروتوكول مرتين للعين التي اخترتها، بجرعتين مختلفتين. أي جرعة تُضاف؟» with the two sentences under «الجرعة الأولى في البروتوكول» / «الجرعة الثانية في البروتوكول» and the buttons «استخدام الأولى» / «استخدام الثانية» (en "Two dosings for the same eye", "First in the protocol" / "Second in the protocol", "Use the first" / "Use the second") | P0 | e2e | [rx § الرسائل](../features/prescription/business.md#الرسائل-التي-تظهر-للمستخدم) |
| RX-031 | Given that dialog, when «استخدام الأولى» (or «استخدام الثانية») is chosen, then one line of A for the right eye with the first (or second) line's dosing, in the first line's place; the toast counts it as added, not as «مكرر في البروتوكول» | P0 | unit+e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-032 | Given that dialog, when Esc is pressed, then it counts as «استخدام الأولى»; a click outside does nothing | P1 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-033 | Given the «تُحدد عند الإضافة» line and the right line with the same dosing, when «اليمنى» is chosen, then one line is added without a question | P1 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-034 | Given the «تُحدد عند الإضافة» line and the right line, when «اليسرى» is chosen, then two lines (the «تُحدد عند الإضافة» line for the left eye, and the right line) and no question | P1 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-035 | Given two such pairs, then the first dialog shows «تطبيق على باقي التعارضات: 1» and ticking it applies the same choice to the second pair without asking | P2 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-036 | Given the chosen line clashes with a line already in the prescription (same drug and eye, other dosing), then the usual «موجود بالفعل في الروشتة» question follows | P2 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-037 | Given an eye, conflict or same-eye dialog closing, then it keeps its own text while it fades out (no empty text or another dialog's text flashes) | P2 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |

### Conflicts

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| RX-038 | Given a line of drug A (right) with a different dosing than the protocol's A (right), when the protocol is added, then «موجود بالفعل في الروشتة» asks with ««A» موجود بالفعل في القائمة بجرعة مختلفة.» and both sentences under «الحالي» and «من البروتوكول» | P0 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-039 | Given a conflict where one side has no dosing, then that box shows «لا توجد جرعة محددة» | P2 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-040 | Given a conflict with different taper schedules, then both full schedule sentences are shown | P1 | ui | [tapering § القواعد](../features/tapering/business.md#القواعد-التشغيلية) |
| RX-041 | Given a conflict, when choosing «استخدام جرعة البروتوكول», then the existing line gets the protocol's dosing in the same position and keeps its note; the toast adds «تم الاستبدال بجرعة البروتوكول: 1» | P0 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-042 | Given a conflict, when choosing «الإبقاء على الحالي», then the line is unchanged and the toast adds «تم الإبقاء على الجرعة الحالية: 1» | P0 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-043 | Given a conflict dialog, when pressing Esc, then it counts as «الإبقاء على الحالي»; a click outside does nothing (the dialog stays) | P1 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-044 | Given 3 conflicts, then they are asked one by one in protocol order; the first shows the checkbox «تطبيق على باقي التعارضات: 2», the second «… : 1», the last none | P0 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-045 | Given 3 conflicts, when the first answer is «استخدام جرعة البروتوكول» with the checkbox ticked, then no more questions and all 3 are replaced («تم الاستبدال بجرعة البروتوكول: 3») | P0 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-046 | Given 3 conflicts, when the first answer is «الإبقاء على الحالي» with the checkbox ticked, then all 3 are kept without more questions | P1 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-047 | Given the checkbox ticked on one conflict but not applied (answered on a later conflict), then each new conflict dialog starts unticked | P2 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-048 | Given a single conflict, then no «تطبيق على باقي التعارضات» checkbox is shown | P1 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-049 | Given a protocol of 4 lines: 1 new, 1 replaced, 1 kept, 1 identical, then one toast with 4 lines in this order: «تمت الإضافة من «P»: 1», «تم الاستبدال بجرعة البروتوكول: 1», «تم الإبقاء على الجرعة الحالية: 1», «موجود مسبقًا في القائمة: 1» | P0 | unit+e2e | [rx § الرسائل](../features/prescription/business.md#الرسائل-التي-تظهر-للمستخدم) |
| RX-050 | Given nothing replaced, kept or identical, then the toast holds only the «تمت الإضافة» line | P1 | unit | [rx § الرسائل](../features/prescription/business.md#الرسائل-التي-تظهر-للمستخدم) |
| RX-051 | Given a protocol whose lines are all gone (its drugs deleted), when it is added, then nothing is added and the toast «تمت الإضافة من «P»: 0» shows in the neutral style | P2 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-052 | Given conflicts and new lines, then the new lines are appended only after all conflicts are answered | P2 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-105 | Given a conflict in which one dosing has nothing to write (only «بدون عين»), then its box shows «لا توجد جرعة محددة» / "No dosing set" | P2 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-106 | Given a line added alone with no dosing and a protocol whose line for the same drug has only «بدون عين», when the protocol is added, then no conflict is asked and the line is counted as unchanged (an unset eye equals «بدون عين»: both write no eye) | P1 | unit+ui | [rx tech § Page](../features/prescription/tech.md#page--components) |

### Editing lines

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| RX-053 | Given a line, when clicking ✎ or the line text, then «تعديل الجرعة» opens with the drug name, the line's dosing and its note (empty for a new line) | P0 | e2e | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-054 | Given the line dialog, when changing the times to 6 and typing a note «رج الزجاجة قبل الاستعمال», then after saving the line shows the new sentence and the note (italic) under it | P0 | e2e | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-055 | Given a line edited in the prescription, then the drug's default dosing (drugs page/API) and its protocols are unchanged | P0 | e2e | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-056 | Given a note "  text  ", when saved, then it is stored trimmed; a note of only spaces is removed | P2 | unit | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-057 | Given the line dialog with invalid dosing, when saving, then the invalid fields turn red and the dialog stays open | P1 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-058 | Given lines of drug A for right and left, when the left line's eye is changed to right, then ««A» موجود بالفعل في القائمة لنفس العين» (English "… is already in the list for that eye") appears and the dialog stays open, nothing changed | P0 | e2e | [rx § الرسائل](../features/prescription/business.md#الرسائل-التي-تظهر-للمستخدم) |
| RX-059 | Given the line dialog, when choosing «إلغاء», then the line is unchanged | P1 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-060 | Given a line's dosing cleared completely, when saved, then the line shows the drug's description (or only the name) | P2 | ui | [rx tech § Text formats](../features/prescription/tech.md#text-formats-prescriptiontextts) |
| RX-061 | Given a line for the right eye and the left eye free, then ⊕ «إضافة للعين الأخرى» is shown; clicking it inserts the same drug for the left eye right after the line, with the same dosing and note | P0 | e2e | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-062 | Given lines of A for both right and left, or a line for both eyes / no eye, then ⊕ is hidden; after removing the left line, ⊕ shows again on the right one | P1 | ui | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-063 | Given 3 lines, when dragging the third to the top, then the order and the numbers change and survive a reload | P0 | e2e | [rx § تكوين روشتة](../features/prescription/business.md#تكوين-روشتة) |
| RX-064 | Given a line, when clicking ✕, then it is removed at once (no confirmation, no undo) and the drug's «مُضاف» mark goes away if it has no other line | P0 | e2e | [business overview § قواعد عامة](../business/overview.md#قواعد-عامة) |
| RX-109 | Given a shared drug in the prescription and the super admin renames it, then the line keeps the old name until removed and added again (snapshot rule); lines stored before M1.7 (without `isShared`, `withdrawn`) still load, edit and copy | P2 | ui | [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |

### Copy, Edit & copy

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| RX-065 | Given lines A (dosing), B (no dosing, description «سطر1\nسطر2»), C (dosing + note), then the plain text is "A\n<sentence>\n\nB\nسطر1\nسطر2\n\nC\n<sentence>\n<note>" | P0 | unit | [rx tech § Text formats](../features/prescription/tech.md#text-formats-prescriptiontextts) |
| RX-066 | Given a line with neither dosing nor description nor note, then it is just the drug name | P2 | unit | [rx tech § Text formats](../features/prescription/tech.md#text-formats-prescriptiontextts) |
| RX-103 | Given a line whose dosing is only the right eye, with description «سطر1\nسطر2» and note N, then the plain text is "Name\nسطر1\nسطر2\nفي العين اليمنى\nN" and the HTML holds the same parts in that order; only «بدون عين» → "Name\nسطر1\nسطر2\nN" | P1 | unit | [rx tech § Text formats](../features/prescription/tech.md#text-formats-prescriptiontextts) |
| RX-067 | Given lines, then the HTML is one `<p class="ql-direction-rtl ql-align-right">` per drug with `<strong>name</strong><br>details`, separated by empty RTL paragraphs, and multi-line text uses `<br>` | P0 | unit | [rx tech § Text formats](../features/prescription/tech.md#text-formats-prescriptiontextts) |
| RX-068 | Given a drug name or note with `<`, `>`, `&` or `"`, then the HTML escapes them (no markup injected) | P1 | unit | [rx tech § Text formats](../features/prescription/tech.md#text-formats-prescriptiontextts) |
| RX-069 | Given the HTML for paste, then Quill classes become `dir="rtl"` and `text-align:right`, paragraphs get `margin-top:0;margin-bottom:0`, `ql-indent-2` in RTL becomes `margin-right:6em`, and no `class` remains | P1 | unit | [rx tech § Text formats](../features/prescription/tech.md#text-formats-prescriptiontextts) |
| RX-070 | Given editor HTML with an ordered list, a bullet list, `<br>` and non-breaking spaces, then the plain text has "1. ", "2. ", "• " items, line breaks, normal spaces, at most one blank line in a row, trimmed | P1 | unit | [rx tech § Text formats](../features/prescription/tech.md#text-formats-prescriptiontextts) |
| RX-071 | Given lines, when clicking «نسخ», then the clipboard holds both formats (plain text and HTML read back equal the expected ones) and the toast «تم النسخ» (English "Copied to clipboard") appears | P0 | e2e | [rx § النسخ](../features/prescription/business.md#النسخ) |
| RX-072 | Given the English UI, when copying, then the copied text is still the Arabic sentences, right-to-left | P0 | e2e | [rx § النسخ](../features/prescription/business.md#النسخ) |
| RX-073 | Given the clipboard write fails (API rejected and execCommand false), when copying, then the error toast «تعذّر النسخ. حدّد النص وانسخه يدويًا.» appears | P1 | ui | [rx § الرسائل](../features/prescription/business.md#الرسائل-التي-تظهر-للمستخدم) |
| RX-074 | Given a non-secure context (plain http), when copying, then the `copy`-event fallback puts both HTML and plain text on the clipboard | P1 | unit | [rx tech § Clipboard](../features/prescription/tech.md#clipboard-srcutilsclipboardts) |
| RX-075 | Given lines, when clicking «تعديل ونسخ», then «تعديل قبل النسخ» opens (after loading) with «التعديلات هنا للنسخ فقط ولا يتم حفظها.» and the content: bold names, sentences, notes, right-to-left | P0 | e2e | [rx § النسخ](../features/prescription/business.md#النسخ) |
| RX-076 | Given the editor, then its toolbar offers bold, italic, underline, numbered and bulleted lists, direction, alignment and clear formatting, each control named in the UI language («عريض», «المحاذاة», … / "Bold", "Alignment", …) | P2 | ui | [rx § النسخ](../features/prescription/business.md#النسخ) |
| RX-077 | Given text made bold and a numbered list in the editor, when clicking «نسخ», then the copied HTML keeps them and the plain text has "1. " items, with «تم النسخ» | P0 | e2e | [rx § النسخ](../features/prescription/business.md#النسخ) |
| RX-078 | Given edits in the editor, when closing it with «إغلاق», then the prescription lines are unchanged, and reopening shows the original text again (rebuilt from the current lines, also when reopened during the closing animation) | P0 | ui+e2e | [rx § النسخ](../features/prescription/business.md#النسخ) |
| RX-079 | Given a line added after closing the editor, when reopening it, then the new line is in its content | P2 | e2e | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-080 | Given the copied text pasted into Word (desktop), then names are bold, sentences Arabic, paragraphs right-to-left and right-aligned, a blank line between drugs, editor formatting kept | P0 | manual | [M1.6 § D7](../design/m1.6-test-foundation.md#d7-what-stays-manual) |
| RX-081 | Given the copied text pasted into Windows Notepad (incl. Windows 11 Notepad) and WhatsApp, then plain text without formatting, lines as in the plain-text format | P1 | manual | [rx tech § Edge](../features/prescription/tech.md#edge-cases--limitations) |
| RX-082 | Given the app opened over plain http on the LAN (real click), when copying, then the paste into Word still keeps the formatting | P1 | manual | [rx tech § Clipboard](../features/prescription/tech.md#clipboard-srcutilsclipboardts) |
| RX-107 | Given a prescription with a shared drug (no default dosing) and no edit, then the copied text is its full name and, under it, its description if any; for an imported drug (no description) the name alone, nothing invented | P0 | e2e | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |
| RX-108 | Given a shared drug line edited to «نقطة في العين اليمنى 4 مرات يوميًا» then copied, then the Arabic sentence as for own drugs | P0 | e2e | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |

### Clear, undo, persistence

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| RX-083 | Given lines, when clicking «مسح الكل», then the list is empty and the toast «تم مسح القائمة» (English "List cleared") shows an «تراجع» button | P0 | e2e | [rx § البدء مع مريض جديد](../features/prescription/business.md#البدء-مع-مريض-جديد) |
| RX-084 | Given the clear toast, when clicking «تراجع» within 6 s, then the lines come back exactly (order, dosing, notes) and the toast closes | P0 | e2e | [rx § البدء مع مريض جديد](../features/prescription/business.md#البدء-مع-مريض-جديد) |
| RX-085 | Given a clear, when 6 s have passed, then the toast is gone and the lines can't be restored | P1 | ui | [rx tech § Page](../features/prescription/tech.md#page--components) |
| RX-086 | Given «مسح الكل» and then a drug added, when «تراجع» is clicked within 6 s, then the list is exactly the cleared one: the drug added since is removed, without a message (intended: Undo restores the prescription as it was) | P2 | ui | [rx § البدء مع مريض جديد](../features/prescription/business.md#البدء-مع-مريض-جديد) |
| RX-087 | Given the «مسح الكل» button with lines, when hovering, then «حذف كل الأدوية للبدء مع المريض التالي. يمكنك التراجع.» | P2 | ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| RX-088 | Given lines, when reloading the page (or closing and reopening the browser), then the same lines, order, dosing and notes are shown | P0 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-089 | Given a cleared list, when reloading, then it is still empty | P1 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-090 | Given a prescription, then it is stored only in `localStorage["prescription.lines.<clinicId>"]` and no API call saves it | P1 | unit | [rx tech § State](../features/prescription/tech.md#state-useprescriptionlinests) |
| RX-091 | Given a second browser (or browser profile) of the same user, then it does not see the first browser's prescription | P1 | e2e | [rx § ما لا تدعمه](../features/prescription/business.md#ما-لا-تدعمه-الميزة-حاليًا) |
| RX-092 | Given corrupt JSON (or a non-array) under the clinic's key, when the page opens, then it starts empty without an error | P1 | unit | [rx tech § State](../features/prescription/tech.md#state-useprescriptionlinests) |
| RX-093 | Given `localStorage` unavailable or full (private mode, quota), when adding lines, then the page works and only persistence is lost | P2 | unit | [rx tech § State](../features/prescription/tech.md#state-useprescriptionlinests) |
| RX-094 | Given only the old key `prescription.lines` (array of lines), when a clinic's page opens with no key of its own, then the lines move to `prescription.lines.<clinicId>` and the old key is removed | P1 | unit | [rx tech § State](../features/prescription/tech.md#state-useprescriptionlinests) |
| RX-095 | Given only the legacy key `prescription.selection` (array of drugs), when the page opens, then each drug becomes a line with its default dosing (or its description), saved under the clinic key, and the legacy key is removed | P1 | unit | [rx tech § State](../features/prescription/tech.md#state-useprescriptionlinests) |
| RX-096 | Given the migration's initializer runs twice (React strict mode), then the migrated lines are not lost (the new key is written before the old one is removed) | P1 | unit | [rx tech § State](../features/prescription/tech.md#state-useprescriptionlinests) |
| RX-097 | Given a clinic that already has its own key and an old unscoped key exists, when the page opens, then the clinic's own lines are used (the old key is left for another clinic) | P2 | unit | [rx tech § State](../features/prescription/tech.md#state-useprescriptionlinests) |
| RX-098 | Given both old keys `prescription.lines` and `prescription.selection`, then the first clinic opened gets the unscoped lines, and the `selection` key moves into the next clinic opened without a key of its own | P2 | unit | [rx tech § State](../features/prescription/tech.md#state-useprescriptionlinests) |
| RX-099 | Given a drug added to the prescription, when its name or default dosing is edited on the drugs page, then the existing line keeps the old name and sentence (snapshot) | P0 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-100 | Given a drug in the prescription that is then deleted, then its line stays until removed, and copying still includes it | P1 | e2e | [rx tech § Edge](../features/prescription/tech.md#edge-cases--limitations) |
| RX-101 | Given a line removed and the edited drug added again, then the new line has the new name and dosing | P1 | e2e | [rx § القواعد](../features/prescription/business.md#القواعد-التشغيلية) |
| RX-102 | Given the prescription page open, when a protocol or drug is changed or deleted in another window or on another computer, then the pickers keep the old version until they load again (the search changes, or the page is opened again once the data is older than 30 s, or the browser page is reloaded; no reload on focus), and adding it meanwhile uses the old lines and dosings (accepted) | P1 | e2e | [rx tech § Edge](../features/prescription/tech.md#edge-cases--limitations) |

## I18N — Languages and direction

Sources: [business overview § اللغات](../business/overview.md#اللغات),
[tech overview § Internationalization](../tech/overview.md#internationalization-ui-text-only),
[dosing tech § i18n](../features/dosing/tech.md#i18n)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| I18N-001 | Given the English UI, when choosing «العربية» in the language menu (top bar), then the whole UI switches to Arabic at once (no reload) and the menu shows a check on the current language | P0 | e2e | [overview § اللغات](../business/overview.md#اللغات) |
| I18N-002 | Given Arabic chosen, when reloading or opening a new tab, then the UI is still Arabic (`localStorage["language"] = "ar"`) | P0 | e2e | [overview § اللغات](../business/overview.md#اللغات) |
| I18N-003 | Given a language chosen, then `<html lang>` and `<html dir>` are `ar`/`rtl` or `en`/`ltr` | P0 | e2e | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-004 | Given the login page (before login), then the language menu works and the choice is kept after login | P1 | e2e | [overview § اللغات](../business/overview.md#اللغات) |
| I18N-005 | Given the Arabic UI, then the layout is mirrored: sidebar on the right (drawer opens from the right on a phone), text right-aligned, back arrows pointing right, number avatars and action buttons on the mirrored sides | P0 | e2e | [overview § اللغات](../business/overview.md#اللغات) |
| I18N-006 | Given each page and dialog of these areas (prescription, protocols list/editor, drugs, dosing/taper dialogs, conflict and eye dialogs, Edit & copy), then it renders without overlap or cut text in both languages | P1 | e2e | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-007 | Given spacing written with logical properties, then paddings/margins in RTL are mirrored, never zero (no `ms`/`me` shorthands used) | P2 | ui | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-008 | Given drug and protocol names/descriptions in Arabic and English, when switching the UI language, then they show exactly as typed in both (not translated) | P0 | e2e | [overview § اللغات](../business/overview.md#اللغات) |
| I18N-009 | Given the English UI, then dosing sentences (drugs table, pickers, protocol lines, prescription lines, previews, conflict boxes) and copied text are Arabic | P0 | e2e | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية) |
| I18N-010 | Given the English UI, then the Arabic sentence under a drug name is aligned under the name (left side) yet reads right-to-left; in the Arabic UI it is right-aligned | P1 | e2e | [dosing tech § Frontend](../features/dosing/tech.md#frontend-srcfeaturesdosing) |
| I18N-011 | Given both locale files, then every key of `en.ts` exists in `ar.ts` and vice versa (type check + test), and `rxText` is identical in both | P0 | unit | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-012 | Given each plural key family (`rxText.*`, `dosing.taper.total*`, others), then it has all six suffixes `_zero/_one/_two/_few/_many/_other` in both files | P1 | unit | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-013 | Given every message quoted in the business docs' message tables (every feature), then the Arabic text equals the `ar.ts` value | P0 | unit | [M1.6 § D2](../design/m1.6-test-foundation.md#d2-test-catalog) |
| I18N-014 | Given numbers in the UI (counts «الأدوية: 12», pagination, step numbers, totals, sentences), then all use Western digits in both languages; counts and pagination are grouped: «1–20 من N» with N the list's `totalCount` from the same response, grouped (e.g. «23,417»; no literal catalog total) | P0 | e2e | [dosing § القواعد](../features/dosing/business.md#القواعد-التشغيلية), [design D12](../design/m1.7-shared-catalog.md#d12-tests-carry-the-full-catalog) |
| I18N-015 | Given a Latin name (drug, protocol, clinic, role or staff member) in an Arabic message (e.g. «Tobradex» موجود بالفعل في القائمة) or an Arabic name in an English message, then the quotes stay around the name and the rest of the sentence stays in order (bidi isolates U+2068/U+2069) | P0 | e2e | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-016 | Given names that start or end with digits or punctuation ("500 Vit C.", «قطرة 2%»), when shown in messages and confirmations in either UI direction, then they display correctly in their place | P2 | e2e | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-017 | Given every message with an interpolated name in both locale files, then the name is wrapped in U+2068…U+2069 | P1 | unit | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-018 | Given the name, description, note and custom-frequency inputs, when typing Arabic in the English UI (or English in the Arabic UI), then the text aligns by its own direction (`dir="auto"`) | P1 | e2e | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-019 | Given the drugs table pagination in Arabic, then «عدد الصفوف» and «{{from}}–{{to}} من {{count}}» are shown and its buttons have Arabic accessible names | P2 | ui | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-020 | Given dosing option labels, then they are translated with the UI (Drop / نقطة …) while the generated sentence stays Arabic | P1 | ui | [dosing tech § i18n](../features/dosing/tech.md#i18n) |
| I18N-021 | Given no stored language, when the app opens for the first time, then the UI follows the browser's language when it is Arabic (any `ar-*`) or English, else English | P2 | unit | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-022 | Given a stored unsupported value (`language = "fr"`), when the app opens, then the browser's language is used when supported, else English, without errors | P2 | unit | [tech overview § i18n](../tech/overview.md#internationalization-ui-text-only) |
| I18N-023 | Given the Arabic UI, when a list of names is joined in a sentence (protocols using a drug), then the Arabic comma «، » separates them | P2 | ui | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs) |

## UX — Cross-cutting UI

Sources: [tech overview § Frontend](../tech/overview.md#app-shell), [shared components](../tech/overview.md#shared-components-componentscommon),
[business overview § قواعد عامة](../business/overview.md#قواعد-عامة), [M1.6 § D3](../design/m1.6-test-foundation.md#d3-test-stack-and-layout)

### Phone width and layout

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| UX-001 | Given a 375 px wide phone, when visiting the prescription, drugs, protocols list and protocol editor pages (Arabic and English), then there is no horizontal page scroll | P0 | e2e | [M1.6 § D3](../design/m1.6-test-foundation.md#d3-test-stack-and-layout) |
| UX-002 | Given 375 px, when opening the drug dialog, protocol line dialog and prescription line dialog, then they are full-screen, only the content scrolls, and Save/Cancel stay visible | P0 | e2e | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-003 | Given 375 px and a taper of 10 steps, then each step wraps onto 2–3 lines with a divider between steps, step 1's dose field is hidden, and nothing overflows | P1 | e2e | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| UX-004 | Given 375 px, then the prescription columns stack (catalog above, selected lines below) and «نسخ» / «تعديل ونسخ» are full-width stacked buttons | P1 | e2e | [rx tech § Page](../features/prescription/tech.md#page--components) |
| UX-005 | Given 375 px, then the conflict dialog shows «الحالي» and «من البروتوكول» stacked, and the eye dialog's three buttons fit | P1 | e2e | [rx tech § Page](../features/prescription/tech.md#page--components) |
| UX-006 | Given 375 px, then the protocol-line chips («جرعة خاصة بالبروتوكول», «العين تُحدد عند إضافة البروتوكول») wrap instead of being cut | P2 | e2e | [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| UX-007 | Given 375 px, then the drugs table pagination hides the rows-per-page choice and fits | P2 | e2e | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-008 | Given 375 px, then the menu button (tooltip «فتح القائمة») opens the navigation drawer, and choosing an entry closes it | P1 | e2e | [tech overview § App shell](../tech/overview.md#app-shell) |
| UX-009 | Given a very long unbroken drug or protocol name (256 characters), then lists (incl. the protocols list's cards: the protocol name and its drug names), lines, dialogs and confirmations wrap it without widening the page, never cut it | P1 | e2e | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon), [protocols tech § Frontend](../features/protocols/tech.md#frontend-srcfeaturesprotocols) |
| UX-010 | Given the Edit & copy editor on a phone, then it is full-screen and the editor height fits the screen | P2 | e2e | [rx tech § Page](../features/prescription/tech.md#page--components) |
| UX-011 | Given a real phone (touch), when adding a protocol, editing a line, dragging to reorder and copying, then everything works by touch | P1 | manual | [M1.6 § D7](../design/m1.6-test-foundation.md#d7-what-stays-manual) |

### Tooltips and ⓘ

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| UX-012 | Given every icon-only button in these areas (✎, ⊕, ✕, delete, search clear «مسح», remove step, menu), then it has a tooltip and an accessible name in the UI language | P1 | ui | [tech overview § Code conventions](../tech/overview.md#code-conventions) |
| UX-013 | Given an ⓘ icon, when hovering, focusing it with Tab, or tapping it on a phone, then its explanation shows (after a tap it stays ~5 s, then hides) | P1 | ui+e2e | [business overview § قواعد عامة](../business/overview.md#قواعد-عامة), [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-014 | Given the «نسخ» and «تعديل ونسخ» buttons with lines, when hovering, then «نسخ الروشتة كما هي. اللصق في Word يحتفظ بالتنسيق.» / «تعديل النص أولًا (عريض، قوائم، محاذاة) ثم نسخه.»; when disabled (empty list), no tooltip | P2 | ui | [rx tech § Page](../features/prescription/tech.md#page--components), [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |
| UX-015 | Given the generator's fields, when hovering, then «عدد المرات في اليوم في المرحلة الأولى», «عدد المرات التي تقل في كل مرحلة», «عدد المرات في اليوم في المرحلة الأخيرة», «المدة التي تستمر فيها كل مرحلة» | P2 | ui | [tapering tech § Frontend](../features/tapering/tech.md#frontend-srcfeaturesdosing) |

### Confirmations, focus and keyboard

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| UX-016 | Given a delete confirmation (drug, protocol) or the discard question, when it opens, then the focus is on «إلغاء» and pressing Enter does not delete | P0 | e2e | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-017 | Given any confirmation, when pressing Esc, then it closes as cancel | P1 | ui | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-018 | Given a search list (drug or protocol picker), when pressing ↓ past the last result or ↑ before the first, then the highlight stays on the edge; the highlighted row scrolls into view | P2 | ui | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-019 | Given a search list with text typed, when pressing Esc, then the search is cleared; when the search changes, the highlight returns to the first result | P2 | ui | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-020 | Given the drugs table, when tabbing to a row and pressing Enter or Space, then the drug opens: an own row edits (or shows the details for a viewer), a shared row opens the read-only details for users with `drugs.details` | P1 | e2e | [drugs tech § Frontend](../features/drugs/tech.md#frontend-srcfeaturesdrugs), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| UX-021 | Given a sortable list (protocol lines, prescription lines), when focusing a drag handle and using Space + arrow keys, then the line moves | P1 | e2e | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-022 | Given the drug dialog, when pressing Enter in the name field, then the form is submitted (same rules as Save) | P2 | ui | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-023 | Given any dialog of these areas, when pressing Esc, then it closes without saving | P2 | ui | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |

### Double clicks (single flight)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| UX-024 | Given the new-drug dialog, when double-clicking Save (or pressing Enter twice fast), then exactly one drug is created | P0 | e2e | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-025 | Given a new protocol, when double-clicking Save, then exactly one protocol is created | P0 | e2e | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-026 | Given `useSingleFlight`, when `once(action)` is called while the previous call runs, then the second call is ignored and resolves to undefined; after the first finishes (or throws), a new call runs | P1 | unit | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-027 | Given a search list (drug or protocol picker), when an item is double-clicked, then it is selected once (the second click of a burst, `event.detail > 1`, is ignored); keyboard Enter (`detail` 0) still selects | P1 | ui | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-028 | Given a delete confirmation, when double-clicking «حذف», then one DELETE request is sent and no error toast appears | P2 | e2e | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-040 | Given a create/edit dialog saving through `useDialogSave` in a `FormDialog` (drug, role, staff, Rename clinic), when its save is in flight, then Esc and a click outside don't close it (the typed values kept); when the save succeeds (also a 404 that closes it), then the form stays locked until the dialog has closed (Save disabled; a second click, Enter or submit sends nothing); when it fails (invalid input or an API error), then it unlocks at once (Esc closes it again) and saving again sends the request | P1 | unit+ui | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-041 | Given a dialog whose form is keyed by `useOpeningKey`, when it is opened again (also right after closing, during the closing animation), then a new form mounts (from the given entity, or empty); while it stays open the form is kept | P2 | unit | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-044 | Given each new dialog (own drug with the category fields, admin shared drug, category, subcategory) saving with the request held, then Esc, a backdrop click and «إلغاء» do nothing until the answer (ADM-292's rule, UX-040), a second Save click sends nothing (one request), and after a successful save, reopening it (also during the closing animation) starts from the given row, empty for a new one (BUG-586/588 rules, UX-041) | P1 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |

### Load errors and app updates

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| UX-029 | Given a new version deployed while the app is open, when opening a page whose chunk no longer exists, then the app reloads itself once and the page opens | P0 | e2e | [tech overview § Browser storage](../tech/overview.md#browser-storage) |
| UX-030 | Given a chunk reload happened less than 30 s ago (`sessionStorage["clinichub:chunkReloadAt"]`), when another chunk fails, then no second reload; the page shows «تعذّر تحميل هذه الصفحة.» / «تحقّق من الاتصال، ثم أعد تحميل الصفحة.» with «إعادة التحميل» | P1 | ui | [tech overview § App shell](../tech/overview.md#app-shell) |
| UX-031 | Given the server unreachable, when a page's chunk fails, then no automatic reload; the "couldn't load" state shows and «إعادة التحميل» reloads | P1 | ui | [tech overview § App shell](../tech/overview.md#app-shell) |
| UX-032 | Given `sessionStorage` unavailable, when a chunk fails, then the app never reloads by itself and shows the "couldn't load" state | P2 | unit | [tech overview § Browser storage](../tech/overview.md#browser-storage) |
| UX-033 | Given the "couldn't load" state on one page, when navigating to another page, then that page loads normally (boundary reset) | P2 | ui | [tech overview § Shared components](../tech/overview.md#shared-components-componentscommon) |
| UX-034 | Given a page crashing while rendering, then the "couldn't load" state shows instead of a blank app | P1 | ui | [tech overview § App shell](../tech/overview.md#app-shell) |
| UX-035 | Given a list or picker loading, then a progress indicator shows; while refetching with a new search, the previous results stay with a thin progress bar | P2 | ui | [tech overview § Data fetching](../tech/overview.md#data-fetching) |
| UX-036 | Given every page of these areas visited in e2e, then no console errors and no serious/critical axe-core violations | P1 | e2e | [M1.6 § D3](../design/m1.6-test-foundation.md#d3-test-stack-and-layout) |
| UX-037 | Given the app served over the real HTTPS deployment, when copying a prescription, then the async Clipboard API is used and Word keeps the formatting | P1 | manual | [M1.6 § D7](../design/m1.6-test-foundation.md#d7-what-stays-manual) |

### Toasts

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| UX-038 | Given a toast showing (e.g. «تم حذف الدواء» after a delete), when clicking its × icon button (tooltip and accessible name «إغلاق» / "Close"), then that toast closes at once, before its own time, and other toasts stay and still close by themselves in their time (also after a tap on a touch phone) | P1 | ui+e2e | [business overview § قواعد عامة](../business/overview.md#قواعد-عامة), [tech overview § App shell](../tech/overview.md#app-shell) |
| UX-039 | Given a toast on a touch phone (375 px), when swiping it sideways, then it closes | P2 | e2e | [business overview § قواعد عامة](../business/overview.md#قواعد-عامة), [tech overview § App shell](../tech/overview.md#app-shell) |
| UX-045 | Given the new toasts (the ⚠ toast «أُضيف رغم تعطيله من الإدارة: N», «تم تعطيل الدواء», «تم تفعيل الدواء», the category toasts), then each has the × «إغلاق» / "Close" button that closes it at once, other toasts staying (UX-038's rule) | P2 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |

## CAT — Shared catalog and categories

Sources: [M1.7 design](../design/m1.7-shared-catalog.md), [M1.7 business](../design/m1.7-shared-catalog.business.md). The area of the shared catalog (M1.7); M1.7a added its migration cases, M1.7b the catalog core and admin cases (source, order and search through `GET /drugs`, read-only shared drugs, the save guards, categories, withdrawn drugs, the admin API, provisioning, the harness guards), M1.7c adds the tree and the drugs-page filters (their numbers are left free). Migration cases run in the migration collection (their own database, a copy of the bare template without the imported catalog, migrated down and up again). Every other test database holds the imported catalog (23,414 shared drugs, 23 categories, 182 subcategories: the run's baseline, read from the harness); tests that write shared drugs or categories use their own rows.

### Migrations

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-003 | Given a database with own drugs, protocols and roles holding `groups.*` before `RenameGroupsToProtocols`, when applied, then every protocol, line, order and override is kept, the constraints carry the new names (`FK_ProtocolItems_Protocols_ProtocolId_ClinicId`), and every role holds the same rights as `protocols.*` | P0 | api | [design D10](../design/m1.7-shared-catalog.md#d10-rename-groups--protocols) |
| CAT-004 | Given `RenameGroupsToProtocols`, when migrated down and up again, then the data and the permission keys round-trip | P1 | api | [design § 5](../design/m1.7-shared-catalog.md#5-data-model-after-m17) |
| CAT-005 | Given `AddSharedCatalog` applied on a database without drugs, migrated down to `RenameGroupsToProtocols` and up again, then the schema is back: a test category, an own drug in it and a protocol line on it save, and the own drug's stored `SearchOther` holds its folded ingredients (filled by the app) | P1 | api | [design § 5](../design/m1.7-shared-catalog.md#5-data-model-after-m17) |
| CAT-006 | Given `AddSharedCatalog` applied, then `SearchName` of `Drugs`, `Protocols`, `Clinics` and `Staff` and `Drugs.SearchOther` are ordinary columns (`information_schema.columns.is_generated` = `NEVER`, `NOT NULL`, default `''`); after Down, the four `SearchName` are generated columns again | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree), [design § 5](../design/m1.7-shared-catalog.md#5-data-model-after-m17) |
| CAT-007 | Given the migrations applied, then `has-pending-model-changes` reports nothing | P1 | api | [design § 5](../design/m1.7-shared-catalog.md#5-data-model-after-m17) |

### Source data shown in the UI

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-001 | Given the shared drug `CARBOPLATIN "EBEWE" 150 MG VIAL` and an admin-created `<b>X</b> & Y`, when shown in a clinic and copied, then shown literally and the copied HTML is escaped (`&quot;`, `&lt;b&gt;`, `&amp;`): one shared name reaches every clinic's clipboard | P1 | unit+e2e | [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here), [rx text formats](../features/prescription/tech.md) |

### Seeing shared and own drugs (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-008 | Given clinic A with 3 own drugs, when `GET /drugs`, then `totalCount` = the baseline's active shared count + 3 and the list holds both kinds; each item has `isShared` right | P0 | api | [design D1](../design/m1.7-shared-catalog.md#d1-one-drugs-table-clinicid-null--shared) |
| CAT-009 | Given A and B, then both see the same shared drug ids, and neither sees the other's own drugs (`source=all`, `shared`, `own`, the tree, search) | P0 | api | [design D1](../design/m1.7-shared-catalog.md#d1-one-drugs-table-clinicid-null--shared), [design § 6](../design/m1.7-shared-catalog.md#6-clinic-isolation-after-m17) |
| CAT-010 | Given an own drug of A named "ALEMOX 1 GM 12 F.C.TABS." (same as a shared one), when A searches "alemox 1 gm", then both are listed, the own one with `isShared:false` | P1 | api | [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |
| CAT-011 | Given `source=shared`, then only shared rows and `totalCount` = the baseline's active shared count (withdrawn excluded); `source=own` → only A's own; no `source` = `all` | P0 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-012 | Given `source=Shared`, `source=mine`, `source=1` or `source=%00`, when `GET /drugs`, then 400 `invalidRequest` (field `source`: exact lower-case values only); `source=` (empty) → `all` | P2 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-013 | Given `GET /drugs/{id}` of a shared drug from clinic A, then 200 with `isShared:true`, `defaultDosing:null`, its category and subcategory (both names) | P0 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-014 | Given the super admin **in the template clinic**, when listing drugs, then the template's own drugs + all active shared drugs | P1 | api | [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |
| CAT-015 | Given A's own drugs created in the order "Zinc", "atropine", «قطرة مرطبة», and no search, then «قطرة مرطبة», "atropine", "Zinc" come first (newest first: `CreatedAt` then id, descending), then the shared ones by name: the 11 names starting with a digit ("1 2 3 (ONE TWO THREE) 20 F.C.TABS.", "2HC F.C.T 20 TABLETS"…), then Latin in collation order (punctuation ignored: "TOBRA-ALEX…" before "TOBRABIOTIC…"), ties by id | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree), [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |
| CAT-017 | Given a tree subcategory holding 2 own drugs of A and shared drugs, when it is paged with no search, then A's 2 own drugs come first (newest first), then the shared ones by name; with a search matching all of them, A's own drugs come first, each part with the names starting with the term first, then by name | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-018 | Given `pageSize=100`, then the last page is `ceil((active shared + own) / 100)` (235 with 3 own drugs, holding 17 items) with the right items and `totalCount`; the next page and `page=2147483647` → an empty page, no overflow | P2 | api | DRUG-049 |

### Shared drugs are read-only for clinics

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-019 | Given the owner of A (every permission), when `PUT /drugs/{shared id}` with a valid body, then 409 `sharedDrugReadOnly` and the shared drug is unchanged for every clinic | P0 | api | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| CAT-020 | Given the owner of A, when `DELETE /drugs/{shared id}`, then 409 `sharedDrugReadOnly`; the drug and every protocol line using it (in A and B) are intact | P0 | api | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| CAT-021 | Given the super admin in the **template** context, when PUT or DELETE a shared drug through `/drugs/{id}`, then 409 `sharedDrugReadOnly` (shared drugs are edited only in `/admin/drugs`) | P1 | api | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| CAT-022 | Given `PUT /drugs/{shared id}` with an empty name, then 400 `nameRequired`; with valid fields and an unknown `categoryId`, then 400 `categoryNotFound` (the read-only check comes last, § 7) | P2 | api | [design § 7](../design/m1.7-shared-catalog.md#7-errors-new-and-renamed) |
| CAT-023 | Given `PUT /drugs/{shared id}` with `defaultDosing` set, then 409 and no dosing is ever stored on the shared row | P1 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |
| CAT-024 | Given a clinic request that loads a shared drug and modifies it in code (a bug), when saving, then the interceptor throws and nothing is written | P0 | api | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| CAT-025 | Given a request with **no** clinic and outside `UseSharedCatalog()`, when a `Drug` with `ClinicId` 0/null is added, then the save throws (provisioning or the dev seed can't create a shared drug by mistake) | P0 | api | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| CAT-026 | Given a shared drug deleted through EF, in a clinic context or inside `UseSharedCatalog()`, then the save throws (shared drugs are withdrawn, never deleted) | P0 | api | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| CAT-027 | Given an own drug of A whose `ClinicId` is changed in code to null or to B (or a shared drug's to A), then the save throws in both contexts (inside `UseSharedCatalog()` too) and nothing is written | P1 | api | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases), [design D4](../design/m1.7-shared-catalog.md#d4-protocol-lines-and-the-guards) |
| CAT-028 | Given EF inside `UseSharedCatalog()` saving a shared drug with one dosing column set (each of the 9 in turn, also on an otherwise valid admin update), then the interceptor throws and nothing is written; given an own drug of A marked withdrawn in A's context, then the save throws too | P0 | api | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases), [design D4](../design/m1.7-shared-catalog.md#d4-protocol-lines-and-the-guards) |
| CAT-029 | Given `UseSharedCatalog()` disposed, when the same scope saves a shared row again, then it throws; a nested `UseSharedCatalog()` keeps writing open until the outer one is disposed; calling it with a clinic in context throws, and `Use(clinicId)` inside it throws | P1 | unit | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| CAT-030 | Given the code base, then no `ExecuteUpdate`/`ExecuteDelete`/raw SQL writes `Drugs`, `Categories` or `SubCategories` outside the admin handlers, the migrations and the test harness (architecture test) | P1 | unit | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases) |
| CAT-031 | Given `GET /drugs/{shared id}/protocols` from A, then only A's protocol names using it (B's protocols with the same drug never appear) | P0 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api), [design § 6](../design/m1.7-shared-catalog.md#6-clinic-isolation-after-m17) |
| CAT-032 | 👁 Given the drugs page as the owner, then shared rows show **no** edit and no delete button (also on hover and on a phone), own rows show both | P0 | e2e | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-033 | Given a shared row clicked by a user with `drugs.details` ("ALEMOX 1 GM 12 F.C.TABS."), then the read-only details open: name (no Arabic name), active ingredients "AMOXICILLIN", «التصنيف: مضادات العدوى › البنسلينات», description when present, only «إغلاق»; no dosing section | P0 | e2e | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-034 | Given a user **with** `drugs.update`, when a shared row is clicked, or focused and Enter/Space pressed, then the read-only details open, never the edit dialog | P0 | e2e | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-035 | Given the details of a shared drug without ingredients or description, then those rows are hidden, never an empty label or "null" | P2 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-036 | Given the read-only details opened and the drug withdrawn meanwhile (another tab), then closing works and the list drops it at its next load (no error toast) | P2 | ui | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |

### Own drugs: category and new fields

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-037 | Given `POST /drugs` without `categoryId`, then 400 `categoryRequired` (field `categoryId`) | P0 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |
| CAT-038 | Given `categoryId: 0`, `-1` or an id that doesn't exist, then 400 `categoryNotFound` (field `categoryId`) | P1 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |
| CAT-039 | Given a valid category and a `subCategoryId` of **another** category, then 400 `subCategoryNotFound` and nothing is saved | P0 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields), [design D4](../design/m1.7-shared-catalog.md#d4-protocol-lines-and-the-guards) |
| CAT-040 | Given a valid category and no subcategory, then 201; the drug shows `subCategory:null` and appears in «بدون تصنيف فرعي» of that category | P0 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |
| CAT-041 | Given an own drug in «العيون › المياه الزرقاء», when PUT moves it to «مضادات العدوى» keeping the old subcategory id, then 400 `subCategoryNotFound` (clear or change the subcategory) | P1 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |
| CAT-042 | Given an empty name, a NUL in the description, an invalid dosing and no category together, then 400 with `errors` in the order `nameRequired`, `invalidText`, `invalidDosing`, `categoryRequired` | P2 | api | [design § 7](../design/m1.7-shared-catalog.md#7-errors-new-and-renamed) |
| CAT-043 | Given `activeIngredients` with a line break or a tab, then 400 `invalidText` (field `activeIngredients`); 1,001 characters → 400 `textTooLong`; 1,000 → 201 | P2 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |
| CAT-044 | Given an own drug saved with active ingredients, when read back, then they are returned trimmed, exactly as typed | P1 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |
| CAT-045 | Given `POST`/`PUT /drugs` or `/admin/drugs` with a `nameAr` property, then it is ignored (an own drug has no Arabic name; the API never sets a shared drug's hidden one); no response of any route (drugs, tree, protocols, admin) carries `nameAr` or a drug's Arabic name | P2 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields), [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-046 | Given a category deleted by the super admin between opening the form and saving, when saving, then 400 `categoryNotFound`; the dialog shows it on the category field and reloads the categories | P1 | api+e2e | [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |
| CAT-047 | Given `GET /drug-categories` from a clinic, then every category with all its subcategories (both names), `pinnedLast` true only for «أخرى» and «غير مصنف», no counts, no clinic data | P1 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories), [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-048 | Given a user **without** `drugs.list` (e.g. a role with only `protocols.list`), when `GET /drug-categories` or `GET /drugs/tree`, then 403 `forbidden` | P1 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-049 | Given the new-drug dialog, when saving without a category, then the category field turns red with «التصنيف مطلوب.» and no request is sent | P0 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-050 | Given a category picked, then the subcategory list shows only its subcategories in the UI language; picking another category clears the subcategory | P0 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-051 | Given an own drug edited, then the dialog opens with its ingredients, category and subcategory pre-filled (names in the UI language); there is no Arabic name field | P1 | e2e | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-052 | Given the API answers `subCategoryNotFound` (subcategory deleted meanwhile), then the message shows on the subcategory field and the lists reload | P2 | ui | [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |
| CAT-053 | Given the active ingredients typed in English or Arabic, then the input uses `dir="auto"` | P2 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-054 | Given a category created by the super admin a few seconds before, when the drug dialog opens, then it is listed (the dialog refetches `/drug-categories`; other screens within 30 s) | P2 | ui | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |

### List filters (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-055 | Given `categoryId` = «العيون», then only drugs of that category (shared and own), `totalCount` = the tree's count for «العيون» (541 shared + A's own there) | P0 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-056 | Given `categoryId` + `subCategoryId=none`, then only the category's drugs without a subcategory (own drugs and admin-created shared drugs: no imported drug lacks one) | P1 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields), [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-057 | Given `subCategoryId=5` or `subCategoryId=none` without `categoryId`, then 400 `invalidRequest` (field `subCategoryId`) | P2 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-058 | Given a `subCategoryId` of another category than `categoryId`, or ids that don't exist, then 200 and an empty page (not 400) | P2 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-059 | Given `subCategoryId=abc`, `NONE`, `None`, `0` or `-1`, then 400 `invalidRequest` (only a positive int or lower-case `none`); `categoryId=1.5` or `2147483648`, then 400 `invalidRequest` | P2 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-060 | Given filters + search + `source=own` + page 2, then the intersection, paged; `totalCount` is the filtered total | P1 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |

### Search: name, ingredients, categories and the hidden Arabic name

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-061 | Given "amoxicillin", then the 203 shared drugs whose ingredients contain it are found, all in «البنسلينات», plus own drugs whose ingredients say so | P0 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-062 | Given «أليموكس» (the hidden Arabic name of ALEMOX), then "ALEMOX 1 GM 12 F.C.TABS." and "ALEMOX 750 MG 12 F.C.TABS." are found, and the rows show only the English names | P0 | api+e2e | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-063 | Given «اليموكس» (alef without hamza), then the same two (Arabic folding applies to `NameAr`) | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-064 | Given "alemox" and A's own drugs «قطرة alemox» and "Alemox drops", then A's two own drugs come first, "Alemox drops" (starts with it) before «قطرة alemox» (contains it), then the two shared ALEMOX rows | P0 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-065 | Given "tobra", then A's own "Tobradex" first (own drugs first); then the shared names starting with it, in collation order: "TOBRA-ALEX 20MG/2ML 5 AMP.", "TOBRA-ALEX 80MG/2ML I.V./I.M. AMP.", "TOBRABIOTIC 0.3% EYE DROPS 10 ML", "TOBRABIOTIC PLUS EYE SUSP. DROPS 5 ML", "TOBRACOID EYE DROPS 5 ML", "TOBRACTIVA 0.3% EYE DROPS 5 ML", "TOBRADEX EYE OINT. 3.5 GM", "TOBRADEX EYE SUSP. DROPS 5 ML", "TOBRAL 0.3% EYE DROPS 5 ML"; then the other 25 by name, wherever they hold the term (ingredients or the middle of a name): "AVAZIR 0.3% EYE DROPS 10 ML" (TOBRAMYCIN), "CO- AVAZIR EYE OINT. 5 GM" (DEXAMETHASONE+TOBRAMYCIN), … "SWIXTOBRAM 0.3% EYE DROPS 5 ML", … "TOBRIN 0.3% EYE.OINT. 5 GM" | P0 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-066 | Given "moxi", then 276 shared matches in 7 categories / 10 subcategories: first the 14 names starting with it (e.g. "MOXIFLOX 400 MG 10 F.C.TABS."), then the other 262 by name, whether the term is in the name, the ingredients or both ("ACTIMOXIFLOX 400 MG 10 F.C.TABS." first; MOXIFLOXACIN drugs such as "VIGAMOX 0.5% EYE DROPS 5 ML" mixed with AMOXICILLIN ones such as "ALEMOX 1 GM 12 F.C.TABS.") | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-067 | Given a term copied from a row's ingredients, "DEXAMETHASONE+TOBRAMYCIN" or "PARACETAMOL(ACETAMINOPHEN)", then the drugs holding it are found (the term compared with `SearchOther` gets the same `+`/`(` → space replacement: "DEXAMETHASONE+TOBRAMYCIN" finds "TOBRADEX EYE SUSP. DROPS 5 ML") | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-068 | Given "acetaminophen" (written "PARACETAMOL(ACETAMINOPHEN)…" in the source), then 258 matches across 6 categories / 12 subcategories: "ACETAMINOPHEN 125MG PAED. SUPP.U.S.P.XXIII" first (the only name starting with it), then the other 257 by name from "1 2 3 (ONE TWO THREE) 20 F.C.TABS."; nothing auto-opens | P2 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-069 | Given a term with `%`, `_`, `\`, `/` or `.` ("5%", "SOFFIONIL_CARE", A's own "A\B", "50MCG/ML", "F.C."), then only literal matches (no wildcard; the LIKE escape character escaped too) | P1 | api | DRUG-043 |
| CAT-070 | Given a withdrawn shared drug, then no search (name, Arabic name, ingredient, category) finds it in clinic lists or the tree | P0 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-071 | Given "NAILNER NAIL FUNGUS PEN 4 ML" (no ingredients), when searching «نايلنير» (its hidden Arabic name), then it is found; given an own drug with ingredients, when searching its ingredient, then found (`SearchOther` never null) and the row loads | P0 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-072 | Given "a", then 23,410 of the 23,414 shared drugs match (name, Arabic name, ingredients or category name); given «ا», then all 23,414; tree and list answer 200 within the budget, the tree holds all 23 categories and paging works | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-073 | 👁 Given "glaucoma" or «المياه الزرقاء» (no drug name contains them), then the 91 shared drugs of the Glaucoma subcategory of Eye («العيون › المياه الزرقاء») in name order (after the clinic's own there), the tree has that one subcategory and it opens by itself; given «قطرة» in clinic **B** (no own drug; no shared Arabic name contains it), then «لا توجد أدوية مطابقة للبحث.» (e2e: the opened subcategory's count equals the API's tree answer for the same search in the same run; the literal 91 is asserted at the api level, D12) | P1 | api+e2e | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree), [design D12](../design/m1.7-shared-catalog.md#d12-tests-carry-the-full-catalog) |
| CAT-074 | 👁 Given "amox", then 219 matches and 6 categories by match count: «مضادات العدوى» 207 (البنسلينات 203, الكينولونات 2, طاردات الديدان 1, مضادات الدرن 1), «الأورام» 5, «الأمراض الجلدية» 4, then «التخدير ومستلزمات المستشفيات», «العيون», «الفيتامينات والمكملات الغذائية» with 1 each (ties by name); nothing auto-opens (e2e: «النتائج: N» and the categories' order and counts equal the API's tree answer for "amox" in the same run; the literals are asserted at the api level, D12) | P1 | api+e2e | [design § 1](../design/m1.7-shared-catalog.md#1-goal), [design D5](../design/m1.7-shared-catalog.md#d5-categories), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree), [design D12](../design/m1.7-shared-catalog.md#d12-tests-carry-the-full-catalog) |

### Search columns filled by the app

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-075 | Given an own drug created with a name and ingredients, then renamed, then its ingredients changed, then after each save its stored `SearchName` and `SearchOther` (read by SQL) equal `SearchText.Fold(Name)` and `SearchText.OtherText(null, ActiveIngredients)`, and search finds the new texts, not the old ones; a description-only update leaves both unchanged | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-076 | Given a test-created shared drug whose hidden Arabic name «زوكالين» the test set (raw SQL on its own row, `SearchOther` included), when the super admin renames it, then its stored `NameAr` is null and its `SearchOther` equals its folded ingredients alone (no Arabic text left); its `SearchName` is the folded new name | P1 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-077 | Given the M1.6.1 Arabic folding cases (DRUG-088 to DRUG-102, GRP-096, GRP-097, ADM-024, ADM-287 to ADM-291), when they run on the app-filled columns, then every result, order and `totalCount` is identical to before: their expectations are unchanged and they pass | P0 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-078 | Given a clinic created by the super admin (provisioning copies the template's own drugs and protocols and adds the owner's staff row), then the clinic, its owner, its copied own drugs and its protocols are each found at once by a folded search (`عياده`, an alef without hamza…): every write path goes through the interceptor | P1 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-079 | Given the code base, then no `HasComputedColumnSql`, no `translate(`/`lower(` SQL and no database function is used by search (the old migrations excepted), search handlers compare the shadow columns with `Contains`/`StartsWith` only, and no `ExecuteUpdate` sets a searched text (a drug's `Name`, `NameAr`, `ActiveIngredients`, a protocol's or clinic's `Name`, a staff member's `FullName`) (architecture test) | P1 | unit | [design D2](../design/m1.7-shared-catalog.md#d2-writes-shared-rows-only-through-the-admin-catalog-use-cases), [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |
| CAT-080 | Given a clinic inserted by raw SQL without `SearchName` (as ISO-036 does), then the insert succeeds with `SearchName = ''` (the column default); such a row isn't found by search until the app saves it (accepted, design § 6) | P2 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree) |

### Withdrawn shared drugs

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-146 | Given the super admin withdraws a shared drug, then in A and B it disappears from `GET /drugs`, the tree, the counts and search at once (no cache) | P0 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-147 | Given a withdrawn drug, when a clinic calls `GET /drugs/{id}`, then 200 `withdrawn:true` | P1 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-148 | Given A's protocol with a shared drug that is then withdrawn, when `GET /protocols/{id}`, then the line is there with `drug.withdrawn:true` | P0 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-149 | Given that protocol, when saved unchanged or with other lines edited, then 200: a withdrawn drug's stored lines may stay | P0 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-150 | Given that protocol, when the withdrawn line's override changes, its eye changes (right → left) or the lines are reordered, then 200 | P1 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-151 | Given that protocol, when saved with a **second** line of the withdrawn drug (another eye), then 400 `drugWithdrawn` on that line (field `items[i].drugId`); given a protocol holding two stored lines of a withdrawn drug (right and left), when saved with both, then 200 (lines pass up to their stored number) | P1 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs), [design § 7](../design/m1.7-shared-catalog.md#7-errors-new-and-renamed) |
| CAT-152 | Given a **new** protocol (POST) with a withdrawn drug, then 400 `drugWithdrawn` and nothing is created | P0 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-153 | Given a protocol whose withdrawn line was removed and saved, when it is added back in a later save, then 400 `drugWithdrawn` | P2 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-154 | Given `items` with a `null` before the withdrawn line, then `drugWithdrawn`'s field `items[i].drugId` carries the line's **request** index (kept while the nulls are dropped, GRP-007), and the editor marks the right line | P2 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs), [design § 7](../design/m1.7-shared-catalog.md#7-errors-new-and-renamed), GRP-007 |
| CAT-155 | Given a protocol open in two tabs, tab 1 removes the withdrawn line and saves, tab 2 (still holding it) saves, then 400 `drugWithdrawn`, the toast names the drug (««…» معطّل من الإدارة ولا يمكن إضافته.», the name taken from the line the editor sent) and the editor keeps its changes | P2 | api+ui | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-156 | 👁 Given the protocol editor with a withdrawn line, then the line has the chip «معطّل من الإدارة» whose tooltip (hover and focus) reads «عطّل مدير المنصة هذا الدواء…» (full text CAT-167), its ⊕ (other eye) is hidden while ✎, ✕ and drag work, and the alert «بعض الأدوية عطّلها مدير المنصة في الكتالوج المشترك.» shows above the lines; removing the line removes the alert | P0 | e2e | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-157 | 👁 Given a protocol of 3 lines, 1 withdrawn, then its card (protocols page and the prescription's tab) shows «الأدوية: 3» and «معطّل من الإدارة: 1», which shows the tooltip «عطّل مدير المنصة هذا الدواء…» on hover and focus | P2 | ui | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-158 | 👁 Given a protocol with 3 lines, one withdrawn, when added to the prescription, then all 3 lines are added; the withdrawn one carries the chip «معطّل من الإدارة» (tooltip «عطّل مدير المنصة هذا الدواء في الكتالوج المشترك، فلا يظهر في البحث. يبقى في البروتوكولات التي تستخدمه.» on hover and focus; kept after a reload; neither the chip nor the tooltip text is in the copied text), and **two toasts** show: the usual protocol toast, in the success style, «تمت الإضافة من «P»: 3» (no line about the disabled drug), then a separate plain toast with a ⚠ icon «أُضيف رغم تعطيله من الإدارة: 1» (en "Added although disabled by admin: 1"); each closes on its own (× «إغلاق») | P0 | e2e | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-159 | Given a protocol with a withdrawn line, an `ask` line, a line identical to the prescription and a conflict, when added, then the eye question and the conflict are asked once each, the protocol toast lists its counts in the RX-049 order exactly as today, and the separate ⚠ toast «أُضيف رغم تعطيله من الإدارة: 1» follows it | P1 | unit+e2e | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs), RX-049 |
| CAT-160 | Given a protocol whose **only** line is withdrawn, when added, then the line is added with the chip, the protocol toast reads «تمت الإضافة من «P»: 1» (success style) and the ⚠ toast «أُضيف رغم تعطيله من الإدارة: 1» follows; a protocol with no disabled line shows no ⚠ toast | P1 | e2e | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-161 | Given a withdrawn line with eye «تُحدد عند الإضافة» and an active `ask` line, when the protocol is added, then the eye question is asked once for both and both are added (the withdrawn one with the chip) | P2 | unit | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-162 | Given a prescription already holding the drug (added before it was disabled), then the line stays without the chip, can be edited, its ⊕ adds the other eye, and it is copied (snapshot) | P1 | ui | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-163 | Given a withdrawn drug restored, then it is back in lists, tree, counts and search in every clinic; its protocol lines lose the chip and are added to prescriptions without the warning | P0 | api+e2e | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-164 | Given withdraw called twice, then 204 both times and `WithdrawnAt` is the first withdrawal's time; restore (also on an active drug: 204) sets it to null; withdrawing again sets the new time | P2 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-165 | Given a drug withdrawn while the protocol editor is open with it as an existing line, when saving, then 200 (it is a stored line) | P2 | api | [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |
| CAT-167 | 👁 Given a withdrawn drug in each place its mark shows (a protocol editor line; its protocol's card on the protocols page and in the prescription's tab; a prescription line added from that protocol; its admin drugs row on «معطّل» and on «الكل»), in the Arabic UI, when the mark is hovered, focused with Tab, and tapped on a touch screen at 375 px, then each time the tooltip «عطّل مدير المنصة هذا الدواء في الكتالوج المشترك، فلا يظهر في البحث. يبقى في البروتوكولات التي تستخدمه.» shows (RTL, fully inside the viewport) and Esc or a tap elsewhere closes it; the mark's accessible description is the same text; the copied prescription text holds neither the chip nor the tooltip | P1 | e2e | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-168 | 👁 Given the English UI, then the same places show "Disabled by admin" (cards "Disabled by admin: 1") and hover, Tab focus and tap each show "The platform admin disabled this drug in the shared catalog, so it no longer appears in search. It stays in the protocols that use it." (LTR, inside the viewport); the editor alert reads "Some drugs were disabled by the platform admin in the shared catalog.", the prescription toast ends with "Added although disabled by admin: 1", the admin actions are "Disable drug" / "Enable drug" (toasts "Drug disabled" / "Drug enabled") and the status filter "Enabled" / "Disabled" / "All" | P1 | e2e | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |

### Shared drugs without default dosing

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-169 | 👁 Given an imported shared drug (no description, no dosing) added alone to a prescription, then the line shows the name and a muted «لا توجد جرعة محددة» on screen; the copied text is the name alone; ✎ opens with every field empty | P1 | e2e | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-170 | Given a shared drug line with **no** override in the protocol editor, then it shows the muted «لا توجد جرعة محددة» (or its description when present), never a made-up dosing; added to a prescription, the same | P1 | e2e | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-171 | Given a shared drug line's dosing dialog in the protocol editor, then no field shows «افتراضي الدواء», the inherit hint and «استخدام جرعة الدواء الافتراضية» are absent, and the empty preview says «لا توجد جرعة محددة» | P1 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-172 | Given a shared drug in a protocol with only an `ask` override, when added choosing «اليمنى», then the line is the name + «في العين اليمنى» | P2 | unit | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields), RX-010 |

### Protocols with shared and own drugs

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-173 | Given a protocol with a shared drug (with a protocol dosing) and an own drug, when saved and read back, then both lines in order with their overrides | P0 | api | [design D4](../design/m1.7-shared-catalog.md#d4-protocol-lines-and-the-guards) |
| CAT-174 | Given the same shared drug for the right and the left eye in one protocol, then saved (different effective eyes); twice for the same eye → `duplicateProtocolItem` (a shared drug without an override has the effective eye "none") | P1 | api | GRP rules |
| CAT-175 | Given the super admin renames a shared drug used in A's protocol, then A's protocol editor and card show the new name at their next load | P0 | api+e2e | [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |
| CAT-176 | Given a shared drug renamed while A's protocol editor holds it, when A saves, then 200 and the protocol shows the new name | P2 | api | [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |
| CAT-177 | Given an own drug of A in A's protocol is deleted, then its lines are removed (cascade) and the shared lines stay | P1 | api | [design D4](../design/m1.7-shared-catalog.md#d4-protocol-lines-and-the-guards) |

### Admin: shared drugs (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-178 | Given the super admin (platform), when `POST /admin/drugs` with name, ingredients, category and subcategory, then 201 and every clinic sees it in `GET /drugs` with `isShared:true` | P0 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-179 | Given a body with `defaultDosing`, then it is ignored (not stored, not returned) | P1 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields) |
| CAT-180 | Given `PUT /admin/drugs/{id}`, then 200; the change shows in every clinic's list, tree and protocols at their next load | P0 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-181 | Given an **own** drug id of A, when `GET`, `PUT`, `withdraw` or `restore` on `/admin/drugs/{id}`, then 404 `notFound` («The shared drug does not exist.») | P0 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-182 | Given `GET /admin/drugs`, then only shared drugs, default `status=active`; `withdrawn` lists only withdrawn; `all` both; `status=bogus` or `Active` → 400 `invalidRequest` (field `status`) | P1 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-183 | Given `GET /admin/drugs?search=tobra`, then only the 34 shared matches (A's own "Tobradex" never): the 9 names starting with it first ("TOBRA-ALEX 20MG/2ML 5 AMP." … "TOBRAL 0.3% EYE DROPS 5 ML"), then the other 25 by name; with no search, every active shared drug by name, then id (the clinic list's order without own drugs) | P2 | api | [design D7](../design/m1.7-shared-catalog.md#d7-search-and-the-tree), [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-184 | Given a staff token (any clinic, even an owner) or the template context, when calling `/admin/drugs*`, `/admin/drug-categories*` or `/admin/drug-subcategories*` (counts included), then 403 `forbidden` | P0 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api), [design § 6](../design/m1.7-shared-catalog.md#6-clinic-isolation-after-m17) |
| CAT-185 | Given the validation of the clinic create (name, ingredients, description, category, subcategory), then the admin create and update answer the same codes, fields and order | P1 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api), [design § 7](../design/m1.7-shared-catalog.md#7-errors-new-and-renamed) |
| CAT-186 | Given an edit of a withdrawn drug, then 200 and it stays withdrawn | P2 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-187 | Given a **test-created** shared drug carrying an imported drug's exact fields (a pack-size name, the 397-character ingredients), opened in the admin dialog and saved unchanged, then 200 and nothing changes | P0 | api+e2e | [design D8](../design/m1.7-shared-catalog.md#d8-api), [design D11](../design/m1.7-shared-catalog.md#d11-one-time-import-and-the-production-baseline) |
| CAT-188 | Given the super admin moves a shared drug to another subcategory, then each clinic's tree and the admin counts move it at the next load and its protocol lines are unchanged | P1 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-189 | Given a test-created shared drug whose hidden Arabic name the test set to «زوكالين» (raw SQL on its own row, `SearchOther` included), when the super admin changes only its description, then searching «زوكالين» still finds it; when the super admin then changes its name, then 200, «زوكالين» no longer finds it (the hidden Arabic name is cleared), the new name does, and no response or admin screen shows an Arabic name at any step | P1 | api | [design D3](../design/m1.7-shared-catalog.md#d3-drug-fields), [design D8](../design/m1.7-shared-catalog.md#d8-api) |

### Admin: categories (API)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-190 | Given `POST /admin/drug-categories {nameEn:"Test cat", nameAr:«تصنيف تجريبي»}`, then 201; it shows in `/drug-categories` for every clinic and **not** in their trees (empty) | P0 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |
| CAT-191 | Given a name equal to an existing category's English name in another case ("eye") or its Arabic name with other alef/hamza and teh marbuta forms («الامراض الجلديه» vs «الأمراض الجلدية»), then 409 `categoryNameTaken` with the field | P1 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |
| CAT-192 | Given a rename of a test category or a test subcategory to its own current name, to it in another case ("Test cat" → "test cat") or another hamza, then 200 (the check excludes the row itself) | P0 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |
| CAT-193 | Given a subcategory named "Other" in two different categories, then both 201; twice in the same category → 409 `subCategoryNameTaken` | P1 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |
| CAT-194 | Given an empty, 101-character, NUL or bidi-override name (either language), then `nameRequired` / `nameTooLong` / `nameInvalid` on `nameEn` or `nameAr`; 100 characters, also with spaces around, → 201 (the limit applies after trimming) | P1 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |
| CAT-195 | Given a test subcategory used by **one own drug of a deleted clinic** only, when deleted, then 409 `subCategoryInUse` with `drugCount:1`, and `GET /admin/drug-categories` gives it `deletedClinicsDrugCount:1` | P1 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories), [design § 8](../design/m1.7-shared-catalog.md#8-edge-cases-decided-here) |
| CAT-196 | Given a test subcategory used only by a **withdrawn** shared drug, when deleted, then 409 `subCategoryInUse` (withdrawn drugs count) | P1 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |
| CAT-197 | Given a test category whose subcategories are all empty and no drug without subcategory, when deleted, then 204 and its subcategories are gone too | P0 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |
| CAT-198 | Given a test category with one own drug in «بدون تصنيف فرعي» only, when deleted, then 409 `categoryInUse` `drugCount:1` | P0 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |
| CAT-199 | Given a rename of a test category, then every drug in it shows the new name (no copy of the name on drugs) | P1 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |
| CAT-200 | Given a request to change a subcategory's category (a `categoryId` in the PUT body), then it is ignored (rename only) | P2 | api | [design D5](../design/m1.7-shared-catalog.md#d5-categories) |
| CAT-201 | Given `GET /admin/drug-categories`, then each `drugCount` = shared (withdrawn included) + every clinic's own drugs, a category's `noSubCategoryDrugCount` counts its drugs without a subcategory, and the super admin sees no clinic or drug names through it | P1 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api), [design § 6](../design/m1.7-shared-catalog.md#6-clinic-isolation-after-m17) |
| CAT-202 | Given two deletes of the same empty test category (two tabs), then 204 then 404 (no 500) | P2 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api) |
| CAT-203 | Given an unknown category or subcategory id, when renaming or deleting it, or creating a subcategory under an unknown category, then 404 `notFound` | P2 | api | [design D8](../design/m1.7-shared-catalog.md#d8-api), [design § 7](../design/m1.7-shared-catalog.md#7-errors-new-and-renamed) |

### Admin screens

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-204 | Given `/admin/drugs`, then search, category/subcategory filters and status «مفعّل» / «معطّل» / «الكل» (default «مفعّل»), paging; the count matches the list | P0 | e2e | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-205 | Given the admin drug dialog, then the same fields as the clinic dialog **without** «الجرعة الافتراضية» | P0 | e2e | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-206 | Given «تعطيل الدواء» on a drug, then the confirmation («تعطيل «…»؟»; focus on «إلغاء») names it and says it disappears from search in every clinic but stays in protocols and can be enabled later; confirming → toast «تم تعطيل الدواء» and it leaves the «مفعّل» list | P0 | e2e | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-207 | Given status «معطّل», then each row has the chip «معطّل من الإدارة» (tooltip «عطّل مدير المنصة هذا الدواء…» on hover and focus) and «تفعيل الدواء» (no confirm), toast «تم تفعيل الدواء» | P1 | e2e | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-208 | Given «الكل», when a drug is disabled, then its row stays with the chip «معطّل من الإدارة» (its tooltip shows on hover and focus) and its button becomes «تفعيل الدواء»; on «مفعّل» the row leaves, and the only row of the last page steps the table back one page | P2 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-209 | Given «معطّل» with no disabled drug matching the filters, then «لا توجد أدوية معطّلة.» (no «إضافة دواء» button) | P2 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-210 | Given `/admin/categories`, then each category with its subcategories and drug counts, in the UI language; add/rename dialogs ask both names (Arabic input RTL, English LTR) | P0 | e2e | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-211 | 👁 Given «أخرى» with its 8 + 56 shared drugs and 3 own drugs without a subcategory, then the category shows 67 and its rows add up to 67: «علاج الإنزيمات والأمراض النادرة» 8, «غير مصنف» 56, «بدون تصنيف فرعي» 3 | P1 | ui | [design D8](../design/m1.7-shared-catalog.md#d8-api), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-212 | 👁 Given a category or a subcategory with drugs, then its delete button is disabled (still focusable) with the tooltip «لا يمكن حذف هذا التصنيف: يستخدمه 3 أدوية.» / «لا يمكن حذف هذا التصنيف الفرعي: …»; an empty one deletes after a destructive confirm | P0 | e2e | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-213 | Given a subcategory blocked only by a deleted clinic's drug, then the tooltip ends with «من عيادات محذوفة: 1» | P2 | ui | [design D5](../design/m1.7-shared-catalog.md#d5-categories), [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-214 | Given «يستخدمه N دواء» for N = 1, 2, 3, 11, 100, then each uses its Arabic plural form («يستخدمه دواء واحد», «يستخدمه دواءان», «يستخدمه 3 أدوية», «يستخدمه 11 دواءً», «يستخدمه 100 دواء»), and the warning toast, card and tooltip lines keep the colon form («أُضيف رغم تعطيله من الإدارة: 2», «من عيادات محذوفة: 2») | P1 | unit | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-215 | Given a delete answered 409 (a clinic added a drug meanwhile), then the toast shows the message with the count and the list reloads with the new count | P1 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-216 | Given double clicks on Save, withdraw-confirm or delete-confirm, then one request each (`useSingleFlight`) | P1 | e2e | UX |
| CAT-217 | Given a deleted subcategory still selected in the admin drugs filter (URL), then the filter falls back to «الكل» | P2 | ui | [design D9](../design/m1.7-shared-catalog.md#d9-frontend) |
| CAT-218 | Given a super admin demoted while on `/admin/drugs`, when withdrawing or saving, then 403 and the app leaves the admin area (the existing demotion rule on the new screens) | P1 | e2e | ADM |

### Provisioning, template and dev seed

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-219 | Given the template's protocol with a shared drug and a template own drug, when a clinic is created, then the clinic's copy of the protocol keeps the **same** shared drug id on the shared line and points the own line to the clinic's new copy | P0 | api | [M1.5 D5](../design/m1.5-platform-admin.md), [design § 9 M1.7b](../design/m1.7-shared-catalog.md#9-sub-features) |
| CAT-220 | Given a template with **no** own drug and a protocol of 2 shared drugs, when a clinic is created, then its copy holds the protocol with the same 2 shared ids (provisioning doesn't stop when the template has no own drug) | P0 | api | [design § 9 M1.7b](../design/m1.7-shared-catalog.md#9-sub-features) |
| CAT-221 | Given a clinic created, then no shared drug is copied (the shared count is unchanged, the clinic's own count = the template's own count) | P0 | api | [design D1](../design/m1.7-shared-catalog.md#d1-one-drugs-table-clinicid-null--shared) |
| CAT-222 | Given the template's protocol holding a withdrawn shared drug, then the new clinic's copy keeps the line (with the chip) | P2 | api | [design D6](../design/m1.7-shared-catalog.md#d6-withdrawn-shared-drugs) |
| CAT-223 | Given a fresh dev database (Development, baseline copy + dev seed), then the demo clinics exist without the 10,000 "Drug number N" rows, every dev own drug has a category, and the template's sample protocol holds VIGAMOX (shared) and one own drug; a restart seeds nothing again | P2 | manual | [design § 9 M1.7b](../design/m1.7-shared-catalog.md#9-sub-features) |

### Test harness guards

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| CAT-224 | Given a test class that created clinics, own drugs, protocol lines on shared drugs, shared drugs and categories, when the next class starts, then they are gone and exactly the baseline remains (23,414 shared drugs, 23/182 categories): Respawn never truncates `Clinics`, so nothing cascades into `Drugs` | P0 | api | [design D12](../design/m1.7-shared-catalog.md#d12-tests-carry-the-full-catalog) |
| CAT-225 | Given a scratch copy of a collection database where an imported shared drug was changed through EF, when the harness's baseline check (`BaselineGuard.CheckAsync`) runs, then it reports a violation naming the class, and a database re-created from the template passes the check (the run's own reset is never tripped) | P1 | api | [design D12](../design/m1.7-shared-catalog.md#d12-tests-carry-the-full-catalog) |
| CAT-226 | Given a scratch copy where an imported row was changed by raw SQL without touching `UpdatedAt` (its name, `IsWithdrawn`), when `BaselineGuard.CheckAsync` runs, then it reports the violation (the checksum covers the row contents) | P1 | api | [design D12](../design/m1.7-shared-catalog.md#d12-tests-carry-the-full-catalog) |
| CAT-227 | Given a scratch copy where an imported category was renamed or an imported subcategory deleted, when `BaselineGuard.CheckAsync` runs, then it reports the violation (categories are in the checksum) | P1 | api | [design D12](../design/m1.7-shared-catalog.md#d12-tests-carry-the-full-catalog) |
| CAT-228 | Given the collection fixture disposed, then it calls the same baseline check once more (a change made by the last class is reported) | P2 | unit | [design D12](../design/m1.7-shared-catalog.md#d12-tests-carry-the-full-catalog) |
| CAT-229 | Given the e2e specs, then no spec holds a literal count of the imported catalog (the global total 23,414, the number of categories, or a search's, category's or subcategory's count such as 219, 203, 91 or 1,469): a lint over `e2e/**/*.spec.ts` rejects these literals in count assertions (count specs compare with the API's answer of the same run) | P1 | unit | [design D12](../design/m1.7-shared-catalog.md#d12-tests-carry-the-full-catalog) |
