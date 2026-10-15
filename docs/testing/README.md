# Testing

Status: first version (M1.6 phase A, track infra); phase C completes it. Design:
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
```

| Tier | Runs | Gates |
|---|---|---|
| `step` | all backend unit, all Vitest (`npm run test`), integration **smoke** (`Tier=Smoke`) + the **infra** self-tests + the integration tests of the chosen areas, e2e only when files under `ClinicHub.Web/` changed and an `e2e` script exists, traceability report | unknown case IDs fail |
| `full` | everything (integration and unit with coverage), Vitest with coverage (`npm run test:coverage`), e2e (Chromium) | backend coverage (D5: 90% lines, 85% branches; 95% branches per critical module), Vitest coverage (its own thresholds), traceability (100% P0 and P1, 80% P2) |
| `release` | `full` + Stryker.NET on the critical backend modules (`tests/stryker-config.json`) + StrykerJS (`npm run test:mutation`) + e2e on every browser (`CLINICHUB_E2E_BROWSERS=all`) | + mutation score ≥ 85% |

- Areas for `step`: `-Area auth,access` (or `all`), else from `git diff` against the branch point (merge-base with
  `m1.6-test-foundation`, else `main`) plus uncommitted and untracked files. The folder → area map is `$areaMap` in
  `test.ps1`:

  | Changed path | Areas |
  |---|---|
  | `tests/ClinicHub.IntegrationTests/<Area>/` | that area (`Auth` → `auth`, …) |
  | `tests/ClinicHub.IntegrationTests/Harness/`, the test project, `Migrations/`, `Program.cs`, settings, any backend file not below | all |
  | `…/Identity/` (Api, Application, Infrastructure, Domain) | `auth` |
  | `…/Access/` | `access` |
  | `…/Platform/` | `admin` |
  | `…/Catalog/`, `Api/Features/Drugs`, `DrugGroups`, `Infrastructure/Database/Configurations/Catalog/` | `catalog` |
  | `Infrastructure/Database/`, `Application/Common/Abstractions/`, `Domain/Common/` | `isolation` |
  | `Application/Common/(Results\|Behaviors\|Validation\|Messaging)/`, `Api/(Errors\|Controllers)/` | `errors` |
  | `Application/Common/(Paging\|Search)/` | `catalog`, `admin` |
  | `Application/Common/Settings/` | `auth` |
  | `ClinicHub.Web/`, `docs/`, unit tests, tools | none (UI files turn on e2e in `step`) |

- Missing pieces (no npm script yet, no e2e config) are skipped with a note, never silently. Exit code 1 when a stage
  fails or a gate is missed.
- npm contract (the frontend and e2e tracks provide it): `test` = `vitest run`; `test:coverage` = Vitest + v8 coverage
  with thresholds, reports in `artifacts/coverage/frontend` (`coverage-summary.json`); `test:mutation` = StrykerJS,
  reports in `artifacts/mutation/frontend`; `e2e` = Playwright (reads `CLINICHUB_E2E_BROWSERS`: `chromium` or `all`).

### Reports (`artifacts/`, git-ignored)

| File | Content |
|---|---|
| `summary.md` | per stage: result, counts, time; coverage gates; traceability; mutation; known bugs; the seed |
| `test-results/<unit\|integration>/` | `.trx` results (+ `coverage.cobertura.xml` in full/release) |
| `coverage/backend/` | merged report (`index.html`), `Cobertura.xml`, `gates.md` |
| `traceability.md`, `traceability.json` | cases covered / known bug / missing per priority, area and level; unknown IDs |
| `mutation/backend/reports/` | Stryker.NET `mutation-report.html` / `.json` |

Tools come from the local manifest `.config/dotnet-tools.json` (`dotnet tool restore`, done by `full`/`release`):
ReportGenerator, Stryker.NET. Traceability alone: `./tests/tools/traceability/traceability.ps1 [-Gate] [-Areas AUTH]
[-Levels api]` (scope = "only my areas/levels"); its self-test: `./tests/tools/traceability/selftest.ps1`.

## Integration tests (`tests/ClinicHub.IntegrationTests`)

### What a test runs against

- The real app (`Program`: settings validation, migrations, startup seeder, middleware, auth) in memory, environment
  **`Testing`** (`ClinicHub.Api/appsettings.Testing.json`, never published): the intended OTP limits (5 wrong tries,
  60 s between codes, 5 per hour, 5 min expiry), Display mode (`devCode` in the response), test keys, one test super
  admin (`+201009990001`), no dev seed.
- PostgreSQL: the compose container. Per test process (run id `CLINICHUB_TEST_RUN`, set by `test.ps1`; generated when
  unset), one **template** `drags_it_<run>_tpl` is migrated and seeded once by booting the app on it; each **collection**
  gets its own copy `drags_it_<run>_<n>` (`CREATE DATABASE … TEMPLATE`). Before each new test class the copy is reset
  (Respawn on every table but the migrations history, then the startup seeder runs again, then the access cache is
  emptied). Everything of the run is dropped at the end; a crashed or killed run's databases are dropped by the next
  run (each run holds a liveness lock; a database whose run holds none, or older than a day, is stale). A run never
  drops another live run's databases (parallel worktrees are safe).
- Safety: the test host only ever connects to a `drags_it_<run>_<n>` database on localhost; anything else (the dev
  database `drags`) stops it before any connection (`Harness/Databases/DatabaseGuard`, proved by `SelfTests`).
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
        response.Headers.RetryAfter!.Delta.ShouldBe(TimeSpan.FromSeconds(40));
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
- **Data**: tests of one class share the database (reset between classes only): every test builds its own data with
  unique names (the builders' defaults are unique) and never assumes an empty table, except right at the class start.
  Ids keep growing inside a run; never hard-code one.

### Helpers (`Harness/`)

| Need | Use |
|---|---|
| A clinic (provisioned from the template: roles, owner, catalog copy) | `var clinic = await Data.Clinic();` / `.Named("A")`, `.OwnedBy(phone, name)`, `.Suspended()`, `.Deleted()` → `ClinicHandle { Id, Name, Owner, RoleId("Doctor") }` |
| Clinic changes | `Data.SuspendClinicAsync(clinic)`, `ActivateClinicAsync`, `DeleteClinicAsync`, `RenameClinicAsync` |
| Staff | `await Data.Staff(clinic)` (default: new phone, unique name, Doctor) `.WithPhone(p)` (same user in two clinics), `.WithRole("Assistant")`, `.WithRoles(roleId)`, `.Named(n)`, `.Inactive()` → `StaffHandle`; `Data.DeactivateStaffAsync`, `ActivateStaffAsync`, `UpdateStaffAsync`, `RemoveStaffAsync` |
| Roles | `await Data.Role(clinic).WithPermissions(Permissions.Drugs.List, …)` → `RoleDto`; `Data.UpdateRoleAsync`, `DeleteRoleAsync` |
| Drugs, groups (a clinic, or the template: `await App.TemplateClinicIdAsync()`) | `await Data.Drug(clinic).Named("Tobradex").WithDosing(Dosings.Drops())`; `await Data.Group(clinic).With(drug).With(other, Dosings.AskEye())`; `Data.UpdateDrugAsync`, `DeleteDrugAsync`, `UpdateGroupAsync`, `DeleteGroupAsync`; `Dosings.Drops/Tablets/Taper/AskEye` |
| Unique values | `Unique.Phone()` (E.164 `+2011…`), `Unique.LocalPhone(e164)` (`011…`), `Unique.Name("Drug", "دواء")` |
| A logged-in browser (real OTP flow: request → `devCode` → verify → context) | `Login.SuperAdminAsync()` (platform), `Login.SuperAdminInTemplateAsync()`, `Login.OwnerAsync(clinic)`, `Login.StaffAsync(staff)`, `Login.WithRoleAsync(clinic, "Assistant")`, `Login.WithPermissionsAsync(clinic, keys…)`, `Login.AsAsync(phone)` (context left as the login gives it) |
| A refused login, a code | `Login.TryAsync(browser, phone)` (raw verify response), `Login.CodeAsync(browser, phone)` |
| A second session of the same user | call the login helper again: each call is a new browser |
| Switch clinic / platform | `client.EnterClinicAsync(id)`, `client.EnterPlatformAsync()` (assert 200); raw: `client.SwitchContextAsync(type, id)` |
| Raw auth calls | `client.RequestOtpAsync`, `VerifyOtpAsync`, `RefreshAsync`, `LogoutAsync` (a 200 keeps the new token, like the SPA); `client.AccessToken` (set it to test missing or garbage tokens), `client.RefreshCookie`, `client.Cookies` |
| HTTP | `client.GetAsync/PostAsync/PutAsync/DeleteAsync(url, body)`, `client.SendRawAsync(method, url, "{bad json")` |
| Assertions | `await response.ShouldBeOkAsync()`, `ShouldBeAsync(status)`, `await response.ReadAsync<T>()`, `ReadNodeAsync()` (exact JSON), `var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess")` → `problem.ClinicNames`, `problem.Errors`, `problem.ShouldHaveError("phone", "invalidPhone")` |
| An access token issued at a chosen time | `App.Tokens.ReissueAsync(client, issuedAt)` (see "Time and tokens") |
| Time | `Clock.Advance(TimeSpan…)`: the app's `TimeProvider` (OTP expiry and limits, sessions, refresh grace, clinic delete). Reset to the real time before every test |
| Read the database | `await App.QueryDbAsync(db => db.OtpCodes.CountAsync())` (clinic-owned tables: `IgnoreQueryFilters()`) |
| "Changed outside the app" | `App.OutsideTheApp.ExecuteAsync("UPDATE \"Staff\" SET \"IsActive\" = false WHERE \"Id\" = @p0", id)`: only for those cases, never to build data |
| Other settings or services (startup refusals, a failing sender) | `await using var variant = App.CreateVariant(settings, services)`; `variant.Start()` throws what startup throws; `new ApiClient(variant)` |
| One session for the whole class (fast path, opt-in) | `await Login.SharedSuperAdminAsync()` / `Login.SharedAsync("key", () => Login.OwnerAsync(clinic))`: only when no test changes that session; never shared across classes |

Notes for the login helpers: the `Testing` limits are the real ones (60 s, 5 per hour), so a helper login first
deletes that phone's earlier codes. A test about the limits requests codes itself and does not log the same phone in
through a helper meanwhile.

Builders call the app's own use cases through MediatR in a DI scope acting in the right clinic (validation,
transaction, provisioning, post-commit cache invalidation, as in production), not HTTP: they create no session, OTP
code or extra staff row, so the data is exactly what the test asked for. To test a use case's own answer (a validation
code, a 409), call the API.

### Time and tokens

`TestClock` is the real time plus an offset that only moves forward (not a frozen `FakeTimeProvider`): the app stamps
`CreatedAt` with `DateTime.UtcNow`, and comparing those stamps with a frozen clock would be off by the test's own
running time (`Retry-After: 61` instead of 60). JwtBearer checks access-token lifetimes with the **real** clock, so
advancing the test clock does not expire an access token: for "token expired" cases, use
`client.AccessToken = await App.Tokens.ReissueAsync(client, DateTimeOffset.UtcNow.AddMinutes(-16))` (the app's own
`TokenService` with a clock set in the past: same user, session and context, signed with the `Testing` key).

## Known bugs

See [known-bugs.md](known-bugs.md): mark the test (xUnit `Skip = "BUG-0nn: …"`, Vitest `test.skip("BUG-1nn: … @ID")`,
Playwright `test.fixme`), add the row. Known-bug tests count as covered-but-known-bug in the traceability report and
are listed in the summary.
