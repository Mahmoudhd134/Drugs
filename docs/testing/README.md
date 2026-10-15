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
./test.ps1 -Tier step -Area auth -Mutate 'ClinicHub.Application/Features/Identity/Login/**/*.cs'   # + Stryker.NET on those files
```

| Tier | Runs | Gates |
|---|---|---|
| `step` | all backend unit, all Vitest (`npm run test`), integration **smoke** (`Tier=Smoke`) + the **infra** self-tests + the integration tests of the chosen areas, e2e **smoke** (`npm run e2e -- --grep @smoke`) only when files under `ClinicHub.Web/` changed and an `e2e` script exists, traceability report | unknown case IDs and skips without a bug ID fail |
| `full` | everything (integration and unit with coverage), Vitest with coverage (`npm run test:coverage`), the whole e2e suite (Chromium projects) | backend coverage (D5: 90% lines, 85% branches; 95% branches per critical module), Vitest coverage (its own thresholds), traceability (100% P0 and P1, 80% P2) |
| `release` | `full` + Stryker.NET on the critical backend modules (`tests/stryker-config.json`) + StrykerJS (`npm run test:mutation`) + the whole e2e suite on every browser (`CLINICHUB_E2E_BROWSERS=all`: + Firefox and WebKit) | + mutation score ≥ 85% |

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
    their title) and nothing in `full`/`release`. The Playwright config picks its projects from
    `CLINICHUB_E2E_BROWSERS`: `chromium` (default: the Chromium projects, desktop Arabic + English and phone) or `all`
    (+ Firefox and WebKit desktop; `release`).

### Reports (`artifacts/`, git-ignored)

| File | Content |
|---|---|
| `summary.md` | per stage: result, counts (passed/failed/skipped from each test result), time; coverage gates; traceability; mutation scores; known bugs (skipped `BUG-nnn` tests and their IDs); the seed |
| `test-results/<unit\|integration>/` | `.trx` results (+ `coverage.cobertura.xml` in full/release) |
| `coverage/backend/` | merged report (`index.html`), `Cobertura.xml`, `gates.md` |
| `traceability.md`, `traceability.json` | cases covered / known bug / missing per priority, area and level; unknown IDs; skips without a bug ID |
| `mutation/backend/` | Stryker.NET `reports/mutation-report.html` / `.json`; `mutation.md` (score overall, per critical module, per file) |

Tools come from the local manifest `.config/dotnet-tools.json` (`dotnet tool restore`, done by `full`/`release` and
`-Mutate`): ReportGenerator, Stryker.NET. Traceability alone: `./tests/tools/traceability/traceability.ps1 [-Gate]
[-Areas AUTH] [-Levels api]` (scope = "only my areas/levels"); its self-test: `./tests/tools/traceability/selftest.ps1`.
Traceability rules: a test skipped as a known bug counts (as known bug) only with its `BUG-nnn` ID in the skip reason or
title; any other skip (`Skip = "later"`, `test.skip`/`test.todo`/`describe.skip` without an ID) is not coverage and fails
the run; IDs in comments don't count; anything that is not exactly a catalog ID (`@AUTH-0163`, `@auth-189`) is
reported as unknown.

### Mutation testing on chosen files (Stryker.NET)

Integration and e2e tracks prove their tests with Stryker.NET on a few critical files of their area (instead of
hand-planted bugs; design § 7): `./test.ps1 -Tier step -Area auth -Mutate '<glob>'[, '<glob>']`. Globs are
repo-relative (`ClinicHub.Application/Features/Identity/Login/**/*.cs`) or start with `**`; they replace the config's
critical-module list for that run, every test project runs against each mutant (integration tests included: each Stryker
test process makes its own test databases), and the 85% break threshold applies. Survivors are in
`artifacts/mutation/backend/reports/mutation-report.html`; a survivor is either a missing assertion (add it) or an
equivalent mutant (say so in the track report).

- Expect minutes per file: an integration-covered mutant reruns the tests that cover it. Mutate a few files at a time.
- Paths: keep the worktree path short (e.g. `Drags-wt\<track>`) and use the tool from the manifest (`dotnet tool
  restore`; never install it under a long folder): beyond Windows' 260-character limit Stryker fails with
  "Value cannot be null (path3)".
- Stryker gaps (phase C knows them): a mutant that no longer compiles makes Stryker's safe mode drop **every** mutant of
  that method (counted as "not counted", not against the score). Seen: `Api/Features/Access/PlatformAdminHandler.cs`
  `HandleRequirementAsync` (CS0165 on `userId` from the `is not { } userId` pattern): the super-admin gate gets no tested
  mutant, so the ADM/ACC integration cases must cover "super admin flag removed → 403" directly.

## Integration tests (`tests/ClinicHub.IntegrationTests`)

### What a test runs against

- The real app (`Program`: settings validation, migrations, startup seeder, middleware, auth) in memory, environment
  **`Testing`** (`ClinicHub.Api/appsettings.Testing.json`, never published): the intended OTP limits (5 wrong tries,
  60 s between codes, 5 per hour, 5 min expiry), Display mode (`devCode` in the response), test keys, one test super
  admin (`+201009990001`), no dev seed. Two test substitutions only (`Harness/Hosting/ClinicHubFactory`): the app's
  `TimeProvider` is the test clock, and JwtBearer checks token lifetimes against it (see "Time and tokens").
- PostgreSQL: the compose container. Per test process (run id `CLINICHUB_TEST_RUN`, set by `test.ps1`; generated when
  unset), one **template** `drags_it_<run>_tpl` is migrated and seeded once by booting the app on it; each **collection**
  gets its own copy `drags_it_<run>_<n>` (`CREATE DATABASE … TEMPLATE`). Before each new test class the copy is reset
  (Respawn on every table but the migrations history, then the startup seeder runs again, then the access cache is
  emptied). Everything of the run is dropped at the end; a crashed or killed run's databases are dropped by the next
  run (each run holds a liveness lock; a database whose run holds none, or older than a day, is stale). A run never
  drops another live run's databases (parallel worktrees are safe), and a second process started with a run id that is
  already in use stops at once and drops nothing.
- Safety: the test host only ever connects to a `drags_it_<run>_<n>` database on localhost; anything else (the dev
  database `drags`) stops it before any connection, whatever the settings or a service override say (checked when the
  app's DbContext options are built and on every connection it opens; `Harness/Databases/DatabaseGuard`, proved by
  `SelfTests`).
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
| One session for the whole class (fast path, opt-in) | `await Login.SharedSuperAdminAsync()` / `Login.SharedAsync("key", () => Login.OwnerAsync(clinic))`: only when no test changes that session; never shared across classes; get it **before** `Clock.Advance` (it throws after) |

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
- The access cache (HybridCache) dates its entries and its invalidations with the clock: an entry cached at the **same
  instant** as an invalidation of one of its tags is not kept (the next request reads the database again). Tests that
  need the cache to hold an answer (a "stale for up to 30 s" check) advance the clock by a second after the change. A
  test that moved the clock leaves no cached answer behind (the fixture empties the cache before the next test).

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

## Known bugs

See [known-bugs.md](known-bugs.md): mark the test (xUnit `Skip = "BUG-0nn: …"`, Vitest `test.skip("BUG-1nn: … @ID")`,
Playwright `test.fixme("BUG-1nn: … @ID")`), add the row. Known-bug tests count as covered-but-known-bug in the
traceability report and are listed in the summary; a skip without its `BUG-nnn` ID fails the run.
