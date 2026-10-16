# Testing

Status: first version (M1.6 phase A, foundation); phase C completes it. Design:
[M1.6 test foundation](../design/m1.6-test-foundation.md). Cases: [test catalog](test-catalog.md). Bugs found by tests:
[known bugs](known-bugs.md). Before the client's test: [dress rehearsal](dress-rehearsal.md).

| Level | Tool | Where | Tags |
|---|---|---|---|
| Backend unit | xUnit + Shouldly | `tests/ClinicHub.UnitTests` | `[Trait("Case", "DOSE-012")]`, `[Trait("Area", "catalog")]` |
| Integration (`api`) | xUnit + `WebApplicationFactory<Program>` + PostgreSQL + Respawn | `tests/ClinicHub.IntegrationTests/<Area>/` | same + `[Trait("Tier", "Smoke")]` |
| Frontend unit + component | Vitest | `ClinicHub.Web/src/**/*.test.ts(x)` | `@DOSE-012 @area:catalog @smoke` in the title |
| End to end | Playwright | `ClinicHub.Web/e2e/` | same |

## Running the tests: `test.ps1`

One runner at the repo root (PowerShell 5.1+). Docker must be running: it starts the compose PostgreSQL itself.

```powershell
./test.ps1                          # step tier, integration areas from your changes
./test.ps1 -Tier step -Area auth,access
./test.ps1 -Tier full               # before merging to main, at the end of a feature or milestone
./test.ps1 -Tier release            # milestone ends, before launch
./test.ps1 -Tier step -Seed 1234    # same random order as a previous run (its seed is in the summary)
./test.ps1 -NoBuild                 # reuse the Release build
./test.ps1 -Base main               # areas from the changes since main (default: see below)
./test.ps1 -Tier step -Area auth -Mutate 'ClinicHub.Application/Features/Identity/Login/Commands/VerifyOtp/VerifyOtpCommandHandler.cs'   # + Stryker.NET, scored by the auth tests
```

| Tier | Runs | Gates |
|---|---|---|
| `step` | all backend unit, all Vitest (`npm run test`), integration **smoke** (`Tier=Smoke`) + the **infra** self-tests + the integration tests of the chosen areas, e2e **smoke** (`npm run e2e -- --grep @smoke`) only when files under `ClinicHub.Web/` changed and an `e2e` script exists, traceability report | unknown case IDs and skips without a bug ID fail |
| `full` | everything (integration and unit with coverage), Vitest with coverage (`npm run test:coverage`), the whole e2e suite (Chromium) | backend coverage (D5: 90% lines, 85% branches; 95% branches per critical module), Vitest coverage (its own thresholds), traceability (100% P0 and P1; P2 reported, not gated) |
| `release` | `full` + Stryker.NET on the 6 critical backend files (`tests/stryker-config.json`, below) + StrykerJS (`npm run test:mutation`); e2e stays Chromium only | + mutation score ≥ 85% on **each** critical file |

- Areas for `step`: `-Area auth,access` (or `all`), else from `git diff` against a base plus uncommitted and untracked
  files. The base: `-Base <ref>` (the merge-base with it), else, on an integration branch (`main`,
  `m1.6-test-foundation`) its **last commit** (`HEAD~1`: on the M1.6 branch, the track just merged), else the merge-base
  with the first integration branch that exists (`m1.6-test-foundation`, then `main`). After M1.6 is merged, drop
  `m1.6-test-foundation` from `$integrationBranches` in `test.ps1`. The folder → area map is `$areaMap` in `test.ps1`:

  | Changed path | Areas |
  |---|---|
  | `tests/ClinicHub.IntegrationTests/<Area>/` | that area (`Auth` → `auth`, …) |
  | `tests/ClinicHub.IntegrationTests/Harness/`, the test project, `Migrations/`, `Program.cs`, settings, any backend file not below | all |
  | `…/Identity/` (Api, Application, Infrastructure, Domain), `Database/Configurations/Identity/` | `auth` |
  | `Application\|Domain/…/Access/(Roles\|StaffMembers)/`, `Database/Configurations/Access/`, `Api/Features/Access/PlatformAdmin*` | `access`, `admin` (the admin screens use the same use cases; the super-admin gate) |
  | any other `…/Access/` | `access` |
  | `Application\|Domain/…/Platform/`, `Database/Configurations/Platform/`, `Settings/PlatformSettings` | `admin`, `auth` (a clinic's state and the super admins decide who logs in) |
  | `Api\|Infrastructure/…/Platform/` | `admin` |
  | `…/Catalog/`, `Api/Features/Drugs`, `DrugGroups`, `Database/Configurations/Catalog/` | `catalog` |
  | `Infrastructure/Database/` (other), `Application/Common/Abstractions/`, `Domain/Common/` | `isolation` |
  | `Application/Common/(Results\|Behaviors\|Validation\|Messaging)/`, `Api/(Errors\|Controllers)/` | `errors` |
  | `Application/Common/(Paging\|Search)/` | `catalog`, `admin` |
  | `Application/Common/Settings/` (other) | `auth` |
  | `ClinicHub.Web/`, `docs/`, unit tests, tools | none (UI files turn on e2e smoke in `step`) |

- Missing pieces (no npm script yet, no e2e config) are skipped with a note, never silently. Exit code 1 when a stage
  fails, a gate is missed or the runner itself fails (`artifacts/summary.md` is always rewritten, never left stale).
- npm contract (the frontend and e2e tracks provide it; `npm` is found as installed: `npm.cmd` or `npm.exe`):
  - `test` = `vitest run`; `test:coverage` = Vitest + v8 coverage with thresholds, reports in
    `artifacts/coverage/frontend` (`coverage-summary.json`); `test:mutation` = StrykerJS, reports in
    `artifacts/mutation/frontend`.
  - `e2e` = the **whole** Playwright suite. The runner adds `-- --grep @smoke` in `step` (smoke tests carry `@smoke` in
    their title) and nothing in `full`/`release`. The runner always sets `CLINICHUB_E2E_BROWSERS=chromium`: Chromium
    projects only (desktop Arabic + English and phone; no Firefox/WebKit, the user's trim of 2026-10-15). E2E tests
    prove P0 and P1 cases; a P2 case is left to a component or api test where cheap.

### Reports (`artifacts/`, git-ignored)

| File | Content |
|---|---|
| `summary.md` | per stage: result, counts (passed/failed/skipped from each test result), time; coverage gates; traceability; mutation scores; known bugs (skipped `BUG-nnn` tests and their IDs); the seed |
| `test-results/<unit\|integration>/` | `.trx` results (+ `coverage.cobertura.xml` in full/release) |
| `coverage/backend/` | merged report (`index.html`), `Cobertura.xml`, `gates.md` |
| `traceability.md`, `traceability.json` | cases covered / known bug / missing per priority, area and level; unknown IDs; skips without a bug ID |
| `mutation/backend/` | Stryker.NET `reports/mutation-report.html` / `.json`; `mutation.md` (score per mutated file against the 85% gate, and overall); `stryker.log` (its console output) |

Tools come from the local manifest `.config/dotnet-tools.json` (`dotnet tool restore`, done by `full`/`release` and
`-Mutate`): ReportGenerator, Stryker.NET. Traceability alone: `./tests/tools/traceability/traceability.ps1 [-Gate]
[-Areas AUTH] [-Levels api]` (scope = "only my areas/levels"); its self-test: `./tests/tools/traceability/selftest.ps1`.
Traceability rules: a test skipped as a known bug counts (as known bug) only with its `BUG-nnn` ID in the skip reason or
title, and in xUnit the reason must be a **plain string literal** (`Skip = "BUG-003: …"`; a const, `$"…"` or `@"…"`
skips the test but counts as a skip without a bug ID); any other skip (`Skip = "later"`, `test.skip`/`test.todo`/
`describe.skip` without an ID) is not coverage and fails the run; IDs in comments don't count, nor does an e-mail-like
`owner@clinic-1.test`; anything that is not exactly a catalog ID (`@AUTH-0163`, `@auth-189`) is reported as unknown.
The gate (`full`, `-Gate`) is 100% of the P0 and P1 cases; P2 is reported, not gated.

### Mutation testing (Stryker.NET): the 6 critical files

The backend mutation gate (85%, **on each file**) covers only the 6 riskiest files (the user's trim, 2026-10-15; the
list is `tests/stryker-config.json`, run by `release`):

| File | Why | Phase-B track (`-Area`) |
|---|---|---|
| `ClinicHub.Infrastructure/Database/ClinicAndTimestampsInterceptor.cs` | stamps the clinic, refuses cross-clinic writes | Int-2 (`isolation`) |
| `ClinicHub.Api/Features/Platform/AdminClinicFilter.cs` | the super admin's per-clinic entry | Int-3 (`admin`) |
| `ClinicHub.Application/Features/Access/Authorization/PermissionService.cs` | every access decision (noAccess, clinicSuspended, permissions) | Int-2 (`access`) |
| `ClinicHub.Application/Features/Identity/Login/Commands/VerifyOtp/VerifyOtpCommandHandler.cs` | login | Int-1 (`auth`) |
| `ClinicHub.Application/Features/Identity/Sessions/Commands/RefreshSession/RefreshSessionCommandHandler.cs` | refresh rotation, reuse grace | Int-1 (`auth`) |
| `ClinicHub.Application/Features/Access/StaffMembers/MembershipService.cs` | entry refusals, enterable clinics | Int-1 (`auth`) |

An integration track proves its tests on its files: `./test.ps1 -Tier step -Area auth -Mutate '<file>'[,'<file>']`.
- `-Mutate` takes repo-relative paths or globs (or starting with `**`), comma separated or repeated (also under
  `powershell -File`); they replace the config's list for that run. The stage lists the files actually mutated with
  their scores, and it **fails** when the list matched no code ("no mutant in …") or a file scores below 85%.
- With an explicit `-Area` (not `all`), only that area's **integration** tests run against the mutants (Stryker's
  `test-case-filter` `(Area=auth)&FullyQualifiedName~ClinicHub.IntegrationTests`), so the score is the track's own
  (unit tests and other areas' tests don't count; Stryker then warns that the unit test project "did not report any
  test": expected). Without `-Area` (and in `release`), every .NET test counts.
- E2E: Stryker.NET only runs the .NET test projects against a mutant, never Playwright, so it says nothing about e2e
  specs: the e2e track has no Stryker.NET step (it proves its specs with non-security UI plants; StrykerJS covers the
  SPA's pure logic).
- Survivors are in `artifacts/mutation/backend/reports/mutation-report.html`: a survivor is either a missing assertion
  (add it) or an equivalent mutant (say so in the track report).
- Expect minutes per file: an integration-covered mutant reruns the tests that cover it (each Stryker test process makes
  its own test databases). Mutate a few files at a time.
- Paths: keep the worktree path short (e.g. `Drags-wt\<track>`) and use the tool from the manifest (`dotnet tool
  restore`; never install it under a long folder): beyond Windows' 260-character limit Stryker fails with
  "Value cannot be null (path3)".
- When Stryker itself fails: no report → the stage says "Stryker failed before scoring" (its output is also in
  `artifacts/mutation/backend/stryker.log`). Seen under load: `CS0518 Predefined type 'System.Attribute' is not
  defined` / "General Build Failure" (a Buildalyzer hiccup): rerun. Tests that already fail in Stryker's initial run
  ("N tests are failing … outcome will be impacted") fail the stage: the score would not mean anything; fix or rerun.
- Stryker gaps (phase C knows them): a mutant that no longer compiles makes Stryker's safe mode drop **every** mutant of
  that method (counted as "not counted", not against the score). Seen: `Api/Features/Access/PlatformAdminHandler.cs`
  `HandleRequirementAsync` (CS0165 on `userId` from the `is not { } userId` pattern; not a gated file): the ADM/ACC
  integration cases must cover "super admin flag removed → 403" directly.

## Integration tests (`tests/ClinicHub.IntegrationTests`)

### What a test runs against

- The real app (`Program`: settings validation, migrations, startup seeder, middleware, auth) in memory, environment
  **`Testing`** (`ClinicHub.Api/appsettings.Testing.json`, never published): the intended OTP limits (5 wrong tries,
  60 s between codes, 5 per hour, 5 min expiry), Display mode (`devCode` in the response), test keys, one test super
  admin (`+201009990001`), no dev seed. Three test substitutions only (`Harness/Hosting/ClinicHubFactory`): the app's
  `TimeProvider` is the test clock, JwtBearer checks token lifetimes against it (the app's own `ValidateLifetime`
  switch kept), and the access cache (HybridCache) runs on its own clock (see "Time and tokens").
- PostgreSQL: the compose container. Per test process (run id `CLINICHUB_TEST_RUN`, set by `test.ps1`; generated when
  unset), one **template** `drags_it_<run>_tpl` is migrated and seeded once by booting the app on it; each **collection**
  gets its own copy `drags_it_<run>_<n>` (`CREATE DATABASE … TEMPLATE`). Before each new test class the copy is reset
  (Respawn on every table but the migrations history, then the startup seeder runs again, then the access cache is
  emptied). Everything of the run is dropped at the end; a crashed or killed run's databases are dropped by the next
  run (each run holds a liveness lock; a database whose run holds none, or older than a day, is stale). A run never
  drops another live run's databases (parallel worktrees are safe), and a second process started with a run id that is
  already in use stops at once and drops nothing. Under load (parallel worktrees, Stryker) `CREATE`/`DROP DATABASE` can
  wait long for PostgreSQL's checkpoints: the maintenance connection allows 10 minutes per command, and dropping is
  best effort (a collection's copy at its end, the run's databases at shutdown, other runs' leftovers): a failure is
  printed at the end of the run (`ClinicHub test databases: could not drop …`) and retried later (at shutdown, else by
  the next run's cleanup), never a failed test. Only creating the run's own databases fails the run.
- Safety: the test host only ever connects to a `drags_it_<run>_<n>` database on localhost; anything else (the dev
  database `drags`) stops it before any connection, whatever the settings or a service override say (checked when the
  app's DbContext options are built, again when the context gets its options (an override that replaces them whole)
  and on every connection it opens; `Harness/Databases/DatabaseGuard`, proved by `SelfTests`).
- Order: collections run in parallel (one database each); the classes of a collection one after another; with a seed
  (`CLINICHUB_TEST_SEED`, always set by `test.ps1`), collections, classes and tests are shuffled reproducibly.

### Writing a test class

```csharp
[Collection(AuthCollection.Name)]            // the parallel group: its database and app
[Trait("Area", "auth")]                      // every class: its area (auth, access, isolation, errors, admin, catalog)
public class OtpRequestTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "AUTH-020")]              // one per catalog case this test proves (its "then")
    public async Task A_second_code_within_60_s_is_refused_with_the_seconds_to_wait()
    {
        var browser = Anonymous();                                   // a new browser: own cookie jar, no token
        var phone = Unique.Phone();
        await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();

        Clock.Advance(TimeSpan.FromSeconds(20));                     // never Task.Delay / sleep
        var response = await browser.RequestOtpAsync(phone);

        await response.ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");
        response.Headers.RetryAfter.ShouldNotBeNull();
        response.Headers.RetryAfter.Delta.ShouldBe(TimeSpan.FromSeconds(40));
    }
}
```

- **Collection**: put the class in its area's collection (`Auth/AuthCollection.cs` is the model:
  `[CollectionDefinition(Name)] class … : ICollectionFixture<AppFixture>`). An area with many classes adds more
  collections (`auth-2`, …) to run in parallel; each costs one database copy and one app (≈ 0.3 s to start). A class
  without a collection does not get an `AppFixture` and fails at once.
- **Tags**: `[Trait("Area", "…")]` on the class, `[Trait("Case", "AUTH-020")]` per case on the test method (the
  traceability tool reads method attributes only), `[Trait("Tier", "Smoke")]` on the area's smoke tests (one happy
  path + the top P0 cases; all smoke tests together stay under 3 minutes).
- **Expected values come from the docs** (catalog, feature docs, locale files), never from running the app. If the app
  disagrees with a clear doc, keep the test and mark it as a [known bug](known-bugs.md).
- **Assertions**: assert the status first (`await response.ShouldBeOkAsync()` before `ReadAsync<T>()`, which accepts
  any 2xx); never write an assertion behind `?.` (`x?.Y.ShouldBe(…)` passes when `x` is null): `x.ShouldNotBeNull();`
  first.
- **Data**: tests of one class share the database (reset between classes only): every test builds its own data with
  unique names (the builders' defaults are unique) and never assumes an empty table, except right at the class start.
  Ids keep growing inside a run; never hard-code one.
- **Setup**: never build data in the constructor (the reset before the first test wipes it). Per-test setup goes in
  `protected override Task SetUpAsync()` (runs after the reset); `InitializeAsync` is not overridable. Data or sessions
  for the whole class: `App.PerClassAsync(key, create)` / `Login.SharedAsync`.

### Helpers (`Harness/`)

| Need | Use |
|---|---|
| A clinic (provisioned from the template: roles, owner, catalog copy) | `var clinic = await Data.Clinic();` / `.Named("A")`, `.OwnedBy(phone, name)`, `.Suspended()`, `.Deleted()` → `ClinicHandle { Id, Name, Owner, RoleId("Doctor") }` |
| Clinic changes | `Data.SuspendClinicAsync(clinic)`, `ActivateClinicAsync`, `DeleteClinicAsync`, `RenameClinicAsync` |
| Staff | `await Data.Staff(clinic)` (default: new phone, unique name, Doctor) `.WithPhone(p)` (same user in two clinics), `.WithRole("Assistant")`, `.WithRoles(roleId)`, `.Named(n)`, `.Inactive()` → `StaffHandle`; `Data.DeactivateStaffAsync`, `ActivateStaffAsync`, `UpdateStaffAsync`, `RemoveStaffAsync` |
| Roles | `await Data.Role(clinic).WithPermissions(Permissions.Drugs.List, …)` → `RoleDto`; `Data.UpdateRoleAsync`, `DeleteRoleAsync` |
| Drugs, groups (a clinic, or the template: `await App.TemplateClinicIdAsync()`) | `await Data.Drug(clinic).Named("Tobradex").WithDosing(Dosings.Drops())`; `await Data.Group(clinic).With(drug).With(other, Dosings.AskEye())` (no `With`: one line with a new drug of the clinic); `Data.UpdateDrugAsync`, `DeleteDrugAsync`, `UpdateGroupAsync`, `DeleteGroupAsync`; `Dosings.Drops/Tablets/Taper/AskEye` |
| Unique values | `Unique.Phone()` (E.164 `+2011…`), `Unique.LocalPhone(e164)` (`011…`), `Unique.Name("Drug", "دواء")` |
| A logged-in browser (real OTP flow: request → `devCode` → verify → context) | `Login.SuperAdminAsync()` (platform), `Login.SuperAdminInTemplateAsync()`, `Login.OwnerAsync(clinic)`, `Login.StaffAsync(staff)`, `Login.WithRoleAsync(clinic, "Assistant")`, `Login.WithPermissionsAsync(clinic, keys…)`, `Login.AsAsync(phone)` (context left as the login gives it) |
| A refused login, a code | `Login.TryAsync(browser, phone)` (raw verify response), `Login.CodeAsync(browser, phone)`, `Login.ClearCodesAsync(phone)` |
| A second session of the same user | call the login helper again: each call is a new browser |
| Switch clinic / platform | `client.EnterClinicAsync(id)`, `client.EnterPlatformAsync()` (assert 200); raw: `client.SwitchContextAsync(type, id)` |
| Raw auth calls | `client.RequestOtpAsync`, `VerifyOtpAsync`, `RefreshAsync`, `LogoutAsync` (a 200 keeps the new token, like the SPA); `client.AccessToken` (set it to test missing or garbage tokens), `client.RefreshCookie`, `client.Cookies` |
| HTTP | `client.GetAsync/PostAsync/PutAsync/DeleteAsync(url, body)`, `client.SendRawAsync(method, url, "{bad json")` |
| Assertions | `await response.ShouldBeOkAsync()`, `ShouldBeAsync(status)`, `await response.ReadAsync<T>()`, `ReadNodeAsync()` (exact JSON), `var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess")` (also asserts `application/problem+json`) → `problem.ClinicNames`, `problem.Errors`, `problem.ShouldHaveError("phone", "invalidPhone")` |
| Time | `Clock.Advance(TimeSpan…)`: the app's only clock, frozen during a test (see "Time and tokens") |
| An access token issued at a chosen time without moving the clock | `App.Tokens.ReissueAsync(client, issuedAt)` |
| Read the database | `await App.QueryDbAsync(db => db.OtpCodes.CountAsync())` (clinic-owned tables: `IgnoreQueryFilters()`) |
| "Changed outside the app" | `App.OutsideTheApp.ExecuteAsync("UPDATE \"Staff\" SET \"IsActive\" = false WHERE \"Id\" = @p0", id)`: only for those cases, never to build data |
| Other settings or services (startup refusals, a failing sender, a restart) | `await using var variant = App.CreateVariant(settings, services)`; `variant.Start()` throws what startup throws; `new ApiClient(variant)`, `Login.On(variant)…`, `variant.Clock` (see "Restart cases") |
| One session for the whole class (fast path, opt-in) | `await Login.SharedSuperAdminAsync()` / `Login.SharedAsync("key", () => Login.OwnerAsync(clinic))`: only when no test changes that session; never shared across classes; get it **before** `Clock.Advance` (creating it after an advance throws; reading it again is fine) |

Notes for the login helpers: the `Testing` limits are the real ones (60 s, 5 per hour), so a helper login first
deletes that phone's earlier codes. A test about the limits requests codes itself and does not log the same phone in
through a helper meanwhile.

Builders call the app's own use cases through MediatR in a DI scope acting in the right clinic (validation,
transaction, provisioning, post-commit cache invalidation, as in production), not HTTP: they create no session, OTP
code or extra staff row, so the data is exactly what the test asked for. To test a use case's own answer (a validation
code, a 409), call the API.

### Time and tokens

`Clock` (`TestClock`) is the app's `TimeProvider`, and it is **frozen**: before every test it is set to the real time
(whole seconds), and it only moves when the test calls `Clock.Advance` (only forward). Everything the app dates follows
it: `CreatedAt`/`UpdatedAt` (the save interceptor), OTP expiry, resend delay and hourly limit, session lifetimes and
the refresh grace, a clinic's delete date, and access tokens (`iat`/`nbf`/`exp` when issued, and their check: the
factory gives JwtBearer a lifetime validator that is IdentityModel's own rule, 30 s skew included, with the test clock
as "now"). So time spans are **exact**: after `Clock.Advance(TimeSpan.FromSeconds(60))` a code is exactly 60 s old,
and "at exactly 60 s" / "59 s" cases (AUTH-021, AUTH-023, AUTH-049, AUTH-096, AUTH-100, AUTH-105…) tell `>` from `>=`.

- Token expiry by time: advance the clock (`Clock.Advance(TimeSpan.FromMinutes(15) + TimeSpan.FromSeconds(31))` → the
  token is refused; at `15 min + 30 s` it still passes). `App.Tokens.ReissueAsync(client, issuedAt)` stays for a token
  with a chosen time while the clock stays put (e.g. two tokens of different ages in one test).
- The clock goes back to the real time between tests: an access token issued after an advance is "from the future" in
  the next test (refused, `nbf`). That is why `Login.SharedAsync` throws when called after `Clock.Advance`.
- Timers and elapsed-time measures stay real, and the in-memory cache's own 30 s expiry is real time (the design
  documents the "changed by hand, applies within 30 s" path rather than testing it).
- The access cache (HybridCache) works as in production: it dates its entries and tag invalidations with its own clock
  (`CacheClock`: the real time plus the test clock's advance, never backwards, never twice the same instant), so the
  answer to the request right after a login is cached, and a change through the app (a builder, the API) invalidates
  it for the next request. A change made outside the app (`App.OutsideTheApp`) is **not** seen while the answer is
  cached (that is the "applies within 30 s" path; its 30 s expiry is real time and not waited for). A test that relies
  on an invalidation can first prove the cache is warm (a change by hand not seen; `SelfTests/AccessCacheTests` shows
  how), so a missing invalidation fails it. The cache is emptied between test classes (the database is reset), kept
  between the tests of a class.

### Restart cases (a variant is the restarted API)

Some cases restart the API with other settings (another `Platform:SuperAdminPhones`: ADM-012, ADM-014, AUTH-112,
AUTH-196, ACC-042). `App.CreateVariant(settings)` boots the real app again on the collection's database, so its
startup seeder runs (it promotes and demotes super admins there). After `variant.Start()`:
- send every "after the restart" request through the variant (`new ApiClient(variant)`, `Login.On(variant).SuperAdminAsync()`,
  …): the collection's own app still has its old cache, like a server that was not restarted;
- move `variant.Clock` (each app has its own clock), and build data before starting the variant (builders run on the
  collection's app, whose cache invalidations don't reach the variant);
- the next test (of this class too) starts on a reset database, as if it were a new class; dispose the variant in the
  test (`await using`).

## Component tests (Vitest, `ClinicHub.Web/src/**/*.test.ts(x)`)

### How to write a component test

- Global set-up (`src/test/setup.ts`, `vite.config.ts`), so no test file tunes its own: `findBy…` / `waitFor` wait up
  to 20 s (a passing wait returns at once), a test may take 60 s, half the cores run test files (CPU-bound: more
  workers only slow each test down), `scrollIntoView` is a no-op (spy on it to check the calls), a request no MSW
  handler answers fails the test (add the handler the page needs, even for a call the test doesn't look at), and after
  each test: unmount, toasts removed, handlers, mocks, globals, timers, clipboard, storage, language and viewport
  reset. Tests run shuffled: never depend on another test.
- Keep them fast: paste text (`fillIn`), tooltips on fake timers, and in helpers that run on every layout or query
  call, no DOM search per call (`getByLabelText` and `querySelector` with `:scope` cost seconds on a big page).
  A success toast leaves after 2 s: check it before waiting for anything slower (e.g. the navigation).
- One way per need, from `src/test` (import `…/test`):

| Need | Helper |
|---|---|
| Render a component in the app's providers (theme + RTL, i18n, router, auth, QueryClient, toasts) | `renderWithProviders(ui, {lang, route, path, user, auth, clipboard})` |
| The whole app on a page load (real AuthProvider, session store, API client) | `startApp({route, lang, clipboard})`, `sessionIn`, `refreshSequence`, `meByContext`, `contextOfRequest`, `expectPath` |
| API answers (as the tech docs define them) | `drugsHandlers`, `drugGroupsHandlers`, `meHandler`, …, `problem(status, code)`, `networkError()`; builders `aDrug`, `aGroup`, `aMe`, … |
| What the SPA sent | `recordRequests()` → `requests`, `writes()` (every method but GET) |
| Toasts | `findToast()` (newest), `toastTexts()`, `expectToasts(...texts)` (exactly these) |
| Text longer than a few characters, when the keystrokes don't matter | `fillIn(user, input, text)` (one paste) |
| MUI selects and field errors | `choose`, `optionsOf`, `openSelect`, `isRed` |
| Tooltips (on fake timers: no real delays) | `hoverTooltip(el)` → its text, `leaveTooltip(el)`, `hoverPastDelay(el)` (then check that none opened) |
| "Before the timer fires" (debounces, toasts) | `holdTimers()` → `advance(ms)`, `release()` |
| The clipboard | the `clipboard` option (or `stubClipboard()` after `userEvent.setup()`) → `write`, `execCommand`, `written()` |
| A name inside a message | `isolate(name)` (the bidi isolates the locale files put around it) |
| Storage failures, phone width | `breakStorage()`, `setViewportWidth(375)` |

- A feature's page or dialog with its API lives in `src/test/pages/` (imported by path, so tests that don't need it
  stay light): `admin.tsx` (`renderAdmin`, `navigateInApp`; its `AdminRoutes.tsx` copies App.tsx's `/admin` routes:
  keep them in step), `groupEditor.tsx`, `prescription.tsx`, `rolesTab.ts`, `staffTab.ts`, `EditorHarness.tsx`,
  `DosingHarness.tsx` + `dosing.ts`.

## Known bugs

See [known-bugs.md](known-bugs.md): mark the test (xUnit `Skip = "BUG-0nn: …"`, Vitest `test.skip("BUG-1nn: … @ID")`,
Playwright `test.fixme("BUG-1nn: … @ID")`), add the row. Known-bug tests count as covered-but-known-bug in the
traceability report and are listed in the summary; a skip without its `BUG-nnn` ID fails the run.
