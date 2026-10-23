# Testing

The one guide to the automated tests: when to run them, how to read the results, how to add a test. Why they are built
this way: [M1.6 test foundation](../design/m1.6-test-foundation.md). What to test: the [test catalog](test-catalog.md).
Bugs found by tests: [known bugs](known-bugs.md). Before the client's test: [dress rehearsal](dress-rehearsal.md).

| Level (catalog) | Tool | Where | Tags |
|---|---|---|---|
| `unit`, backend | xUnit + Shouldly | `tests/ClinicHub.UnitTests/<Module>/<SubFeature>/` | `[Trait("Case", "DOSE-012")]` per test, `[Trait("Area", "catalog")]` per class |
| `api` (integration) | xUnit + `WebApplicationFactory<Program>` + PostgreSQL + Respawn | `tests/ClinicHub.IntegrationTests/<Area>/` | same + `[Trait("Tier", "Smoke")]` |
| `unit` (frontend pure logic), `ui` (component) | Vitest + Testing Library + MSW | next to the code: `unit` in `ClinicHub.Web/src/**/*.test.ts`, `ui` in `*.test.tsx` (the file decides the level) | `@DOSE-012 @area:catalog @smoke` in the title |
| `e2e` | Playwright (Chromium) | `ClinicHub.Web/e2e/<area>/` | same |
| `manual` | by hand | the [dress rehearsal](dress-rehearsal.md) | none |

Areas (the `Area` trait, the `@area:` tag): `auth`, `access`, `isolation`, `errors`, `admin`, `catalog` (backend and
frontend); `prescription`, `i18n`, `ux` (frontend only); `infra` (the integration harness's self-tests).

## When to run what

**Every tier runs on GitHub Actions, never on the laptop** (the user's choice, 2026-10-23: fresh machines, parallel
jobs, the laptop stays free). The laptop only builds, type checks and lints (seconds: a typo should not cost a CI
round) and, at most, runs the one test being written ([below](#running-a-single-test)).

| Tier | When | On CI | ≈ |
|---|---|---|---|
| `step` | after every implementation or fix round: `./ci.ps1` | all backend unit and integration tests, all Vitest, the e2e **smoke** tests, the traceability report | 5 min, 4 jobs |
| `full` | a step's report run (T2), every pull request but into `main` (step → feature), before the dress rehearsal: `./ci.ps1 -Tier full` | everything with coverage, the whole e2e suite (Chromium), every gate | 8 min, 11 jobs |
| `release` | every pull request into `main` (feature → `main`), at the end of a milestone, before launch: `./ci.ps1 -Tier release` | `full` + Stryker.NET on the 6 critical backend files (one job each) + StrykerJS | the slowest file |

The tiers don't replace the other checks (`npx tsc -b`, `npx eslint src`, `dotnet build ClinicHub.sln`:
[CLAUDE.md](../../CLAUDE.md), [tech overview](../tech/overview.md#development-workflow)).

## Continuous integration (GitHub Actions)

`.github/workflows/ci.yml` runs on Linux runners (the repository is public: minutes are free). It runs on every **pull
request** (into `main`: `release`; into any other branch: `full`) and **by hand**, any tier, on any pushed branch. A push alone runs nothing. A newer run of the same
pull request or branch cancels the older one.

### `ci.ps1`: a tier from the laptop

```powershell
./ci.ps1                        # step tier on the current branch (commit first)
./ci.ps1 -Tier full             # what every pull request runs, except into main
./ci.ps1 -Tier release          # + mutation of the critical files (what every pull request into main runs)
./ci.ps1 -Mutate 'ClinicHub.Application/Features/Identity/Login/Commands/VerifyOtp/VerifyOtpCommandHandler.cs' -Area auth   # + Stryker.NET, scored by the auth tests
./ci.ps1 -Tier full -NoWait     # start it and return (the link is printed)
```

It refuses on `main` and with uncommitted changes to tracked files (CI tests the pushed commit), pushes the branch
(`git push -u origin HEAD`: allowed for every branch but `main`), starts the workflow (`gh workflow run ci.yml -f
tier=…`), waits (a check every 30 s) and writes `artifacts/ci/summary.md`: the run's link, every job's result and, when
it failed, the failed steps' log tails; a failed e2e part's traces, screenshots and `api.log` are downloaded to
`artifacts/ci/e2e-failures-<part>/` (`npx playwright show-trace <trace.zip>`). Exit code 0 when the run passed. Needs
the GitHub CLI signed in (`gh auth login`). The same by hand: Actions → CI → Run workflow, or `gh workflow run CI --ref
<branch> -f tier=step`.

### Merge levels

| Merge | CI |
|---|---|
| track → step branch | the track's own `step` runs while it works; the merge itself: none |
| step branch ready, and each fix round | `./ci.ps1 -Tier full` as a **report run**: every job runs to the end, a failure report, not a gate |
| step → feature (pull request) | `full`, **required** green |
| feature → `main` (pull request, after rebasing on `main`) | `release` (`full` + mutation), **required** green, + the user's merge OK |

### Jobs

All at once; none stops the others (so one run reports every failure).

| Job | Runs | ≈ (`full`) |
|---|---|---|
| Start | picks the tier's jobs, the random seed | 5 s |
| Backend | Release build, unit + integration tests (compose PostgreSQL in the job); with coverage and its gates on `full`/`release` | 2 min |
| Frontend | `tsc -b`, `eslint src`, the e2e specs' `tsc` and eslint, Vitest (`npm run test:coverage` and its gates on `full`/`release`) | 4 min |
| E2E (smoke) | `step`: the `@smoke` tests of every project in one job | 4 min |
| E2E (1/6 … 6/6) | `full`/`release`: the three main Playwright projects (`ar-desktop`, `en-desktop`, `ar-phone`) in 6 shards, each with its own API and database | 5 min each |
| E2E (template) | `full`/`release`: `ar-desktop-template` alone (`--no-deps`): its `dependencies` in `playwright.config.ts` would keep the whole suite in one shard | 1.5 min |
| Mutation (`<file>`) | `release`, so every pull request into `main` (the 6 critical files), or `-Mutate`: Stryker.NET on one file per job, 85% gate (`tests/tools/mutation/mutation-score.ps1`) | minutes per file |
| Mutation (frontend pure logic) | `release` (every pull request into `main`): StrykerJS (`npm run test:mutation`), 85% overall | |
| Gates | merges the e2e reports (fails if fewer tests reported than planned), traceability (`step`: the report; `full`/`release`: the self-test and the gate); fails when any job failed (or, on `release`, a mutation job was skipped). **The one required check** | 1 min |

- The run's summary page shows the tier, the seed, the counts, the coverage gates, the e2e totals, the mutation scores
  and the traceability table; the artifacts (14 days): `backend`, `frontend` (results and coverage), `e2e-report` (the
  merged Playwright report, traceability), `e2e-failures-<part>`, `mutation-<file>`, `mutation-frontend`.
- Same as the laptop: random test order (the seed is on the summary page; `./test.ps1 -Seed <seed>` reproduces it),
  time zone `Africa/Cairo`, no retries. Different: Linux (file names are case sensitive), PostgreSQL pulled from
  `mirror.gcr.io` (`CLINICHUB_POSTGRES_IMAGE`; locally `postgres:17`), Chromium without Playwright's extra fonts (the
  app's fonts come from Google Fonts), 3 Playwright workers per job.
- `step` on CI runs **every** integration test (they take ≈ 30 s there), not the areas `test.ps1` picks from the diff.
- The free plan runs 20 jobs at once: a `full` run takes 11, so runs of several sessions at the same moment queue a
  few minutes; `step` (4 jobs) is the one to use while working.
- A push to the branch of an open pull request (drafts too) also starts that pull request's run (`full`; into `main`:
  `release`): on such a branch, `./ci.ps1` with the same tier would run it twice, so wait for the pull request's run instead (`gh pr checks --watch`);
  other tiers' runs come on top of it (and may queue behind it).

## Running the tests locally: `test.ps1`

The same tiers on the laptop (PowerShell 5.1+, Docker running: it starts the compose PostgreSQL itself): only to debug
the runner or a test that fails on CI and not in its own run; `full` takes 25–30 min here. The tiers' contents and gates
below are the same on CI.

**Prerequisite: Python 3.10+ and psycopg** (design M1.7 D12). The integration harness and the e2e setup load the shared
drug catalog with `data/drug-catalog/tools/load_catalog.py`: `python` on the PATH, then once
`python -m pip install "psycopg[binary]"`. `test.ps1` checks it first (stage "Prerequisites") and stops with that
command when it is missing; a run started any other way (Rider, `dotnet test`, `npm run e2e`, Stryker) stops at its
first load with the same message (`CatalogLoader.InstallHint`, `PYTHON_HINT`).

```powershell
./test.ps1                          # step tier, integration areas from your changes
./test.ps1 -Tier step -Area auth,access
./test.ps1 -Tier full               # 25–30 min here: CI's job
./test.ps1 -Tier release            # CI's job too
./test.ps1 -Tier step -Seed 1234    # same random order as a previous run (its seed is in the summary)
./test.ps1 -NoBuild                 # reuse the Release build
./test.ps1 -Base main               # areas from the changes since main (default: see below)
./test.ps1 -Tier step -Area auth -Mutate 'ClinicHub.Application/Features/Identity/Login/Commands/VerifyOtp/VerifyOtpCommandHandler.cs'   # + Stryker.NET, scored by the auth tests
```

| Tier | Runs | Gates |
|---|---|---|
| `step` | all backend unit, all Vitest (`npm run test`), integration **smoke** (`Tier=Smoke`) + the **infra** self-tests + the integration tests of the chosen areas, e2e **smoke** (`npm run e2e -- --grep @smoke`) only when files under `ClinicHub.Web/` changed, traceability report | unknown case IDs and skips without a bug ID fail |
| `full` | everything (integration and unit with coverage), Vitest with coverage (`npm run test:coverage`), the whole e2e suite (Chromium) | backend coverage (90% lines, 85% branches; 95% branches per critical module), Vitest coverage (95% lines, 90% branches per pure-logic file), traceability (100% P0 and P1; P2 reported, not gated) |
| `release` | `full` + Stryker.NET on the 6 critical backend files (`tests/stryker-config.json`, below) + StrykerJS (`npm run test:mutation`); e2e stays Chromium only | + mutation score ≥ 85% on **each** critical backend file, and overall on the frontend pure logic |

Gates only go up; lowering one needs the user's OK ([design D5](../design/m1.6-test-foundation.md#d5-coverage-and-mutation-gates)).

- Areas for `step`: `-Area auth,access` (or `all`), else from `git diff` against a base plus uncommitted and untracked
  files. The base: `-Base <ref>` (the merge-base with it), else, on an integration branch (`main`; `$integrationBranches`
  in `test.ps1`) its **last commit** (`HEAD~1`), else the merge-base with the first integration branch that exists.
  (`m1.6-test-foundation` is still listed there; drop it once M1.6 is merged.) The folder → area map is `$areaMap` in
  `test.ps1`:

  | Changed path | Areas |
  |---|---|
  | `tests/ClinicHub.IntegrationTests/<Area>/` | that area (`Auth` → `auth`, …) |
  | `tests/ClinicHub.IntegrationTests/Harness/`, the test project, `Migrations/`, `Program.cs`, settings, any backend file not below | all |
  | `…/Identity/` (Api, Application, Infrastructure, Domain), `Database/Configurations/Identity/` | `auth` |
  | `Application\|Domain/…/Access/(Roles\|StaffMembers)/`, `Database/Configurations/Access/`, `Api/Features/Access/PlatformAdmin*` | `access`, `admin` (the admin screens use the same use cases; the super-admin gate) |
  | any other `…/Access/` | `access` |
  | `Application\|Domain/…/Platform/`, `Database/Configurations/Platform/`, `Settings/PlatformSettings` | `admin`, `auth` (a clinic's state and the super admins decide who logs in) |
  | `Api\|Infrastructure/…/Platform/` | `admin` |
  | `…/Catalog/`, `Api/Features/Drugs`, `Protocols`, `Database/Configurations/Catalog/` | `catalog` |
  | `Infrastructure/Database/` (other), `Application/Common/Abstractions/`, `Domain/Common/` | `isolation` |
  | `Application/Common/(Results\|Behaviors\|Validation\|Messaging)/`, `Api/(Errors\|Controllers)/` | `errors` |
  | `Application/Common/(Paging\|Search)/` | `catalog`, `admin` |
  | `Application/Common/Settings/` (other) | `auth` |
  | `ClinicHub.Web/`, `docs/`, unit tests, tools | none (UI files turn on e2e smoke in `step`) |

- Missing pieces (no npm script yet, no e2e config) are skipped with a note, never silently. Exit code 1 when a stage
  fails, a gate is missed or the runner itself fails (`artifacts/summary.md` is always rewritten, never left stale).
- npm contract (`ClinicHub.Web/package.json`; the runner relies on these names; `npm` is found as installed:
  `npm.cmd` or `npm.exe`):
  - `test` = `vitest run`; `test:coverage` = Vitest + v8 coverage with thresholds, reports in
    `artifacts/coverage/frontend` (`coverage-summary.json`); `test:mutation` = StrykerJS, reports in
    `artifacts/mutation/frontend`.
  - `e2e` = type check + lint of the specs, then the **whole** Playwright suite. The runner adds `-- --grep @smoke` in
    `step` (smoke tests carry `@smoke` in their title) and nothing in `full`/`release`. The runner always sets
    `CLINICHUB_E2E_BROWSERS=chromium`: Chromium projects only (desktop Arabic + English and phone; no Firefox/WebKit,
    the user's trim of 2026-10-15).

### Running a single test

The runner is for whole tiers; while writing a test, run only it (Release, so a Rider-locked Debug build is no
problem; the integration tests need Docker's PostgreSQL up: `docker compose up -d`):

```powershell
dotnet test tests/ClinicHub.UnitTests -c Release --filter "Case=DOSE-012"
dotnet test tests/ClinicHub.IntegrationTests -c Release --filter "FullyQualifiedName~OtpRequestTests"   # or "Area=auth"
cd ClinicHub.Web; npx vitest run src/features/dosing             # a folder or a file; -t "<title part>" for one test
cd ClinicHub.Web; npm run e2e -- e2e/auth/login.spec.ts --project ar-desktop   # or --grep "@AUTH-004"
```

`CLINICHUB_E2E_NO_BUILD=1` reuses the last SPA and API builds for e2e (faster between edits that don't touch the app);
`CLINICHUB_E2E_WORKERS` sets Playwright's workers (default 4).

### Reports (`artifacts/`, git-ignored)

| File | Content |
|---|---|
| `summary.md` | per stage: result, counts (passed/failed/skipped from each test result), time; coverage gates; traceability; mutation scores; known bugs (the known-bug tests of xUnit, Vitest and Playwright and their `BUG-nnn` IDs, from the traceability tool; the skipped .NET ones of the run); the seed |
| `test-results/<unit\|integration>/` | `.trx` results (+ `coverage.cobertura.xml` in full/release) |
| `coverage/backend/` | merged report (`index.html`), `Cobertura.xml`, `gates.md` |
| `coverage/frontend/` | Vitest coverage (`index.html`, `coverage-summary.json`) |
| `traceability.md`, `traceability.json` | cases covered / covered with known bug / missing per priority, area and level; the known-bug tests per tool and their IDs; Vitest/Playwright known-bug tests still marked `test.skip`/`test.fixme` (with a BUG id: listed as known bugs not run, to turn into `test.fails`/`test.fail`); unknown IDs; skips or expected failures without a bug ID |
| `e2e/report/` (`index.html`), `e2e/results.json`, `e2e/test-results/` | Playwright's report; a failed test's trace and screenshot (`npx playwright show-trace <trace.zip>`) |
| `mutation/backend/` | Stryker.NET `reports/mutation-report.html` / `.json`; `mutation.md` (score per mutated file against the 85% gate, and overall); `stryker.log` (its console output) |
| `mutation/frontend/` | StrykerJS `mutation.html` / `.json` |

Tools come from the local manifest `.config/dotnet-tools.json` (`dotnet tool restore`, done by `full`/`release` and
`-Mutate`): ReportGenerator, Stryker.NET.

### Mutation testing

Mutation proves that the tests catch bugs, not just run the code (a mutant = the code with one small change; a
surviving mutant = no test noticed). It is gated in `release` only.

**Backend (Stryker.NET): the 6 critical files.** The gate (85%, **on each file**) covers only the 6 riskiest files (the
user's trim, 2026-10-15; the list is `tests/stryker-config.json`):

| File | Why | Its tests (`-Area`) |
|---|---|---|
| `ClinicHub.Infrastructure/Database/ClinicAndTimestampsInterceptor.cs` | stamps the clinic, refuses cross-clinic writes | `isolation` |
| `ClinicHub.Api/Features/Platform/AdminClinicFilter.cs` | the super admin's per-clinic entry | `admin` |
| `ClinicHub.Application/Features/Access/Authorization/PermissionService.cs` | every access decision (noAccess, clinicSuspended, permissions) | `access` |
| `ClinicHub.Application/Features/Identity/Login/Commands/VerifyOtp/VerifyOtpCommandHandler.cs` | login | `auth` |
| `ClinicHub.Application/Features/Identity/Sessions/Commands/RefreshSession/RefreshSessionCommandHandler.cs` | refresh rotation, reuse grace | `auth` |
| `ClinicHub.Application/Features/Access/StaffMembers/MembershipService.cs` | entry refusals, enterable clinics | `auth` |

After changing one of these files or its tests, prove the area's tests on it:
`./ci.ps1 -Mutate '<file>'[,'<file>'] -Area auth` (one CI job per file; `./test.ps1 -Tier step -Area auth -Mutate …` runs
the same on the laptop).
- `-Mutate` takes repo-relative paths or globs (or starting with `**`), comma separated or repeated (also under
  `powershell -File`); they replace the config's list for that run. The stage lists the files actually mutated with
  their scores, and it **fails** when the list matched no code ("no mutant in …") or a file scores below 85%.
- With an explicit `-Area` (not `all`), only that area's **integration** tests run against the mutants (Stryker's
  `test-case-filter` `(Area=auth)&FullyQualifiedName~ClinicHub.IntegrationTests`), so the score is the area's own
  (unit tests and other areas' tests don't count; Stryker then warns that the unit test project "did not report any
  test": expected). Without `-Area` (and in `release`), every .NET test counts.
- E2E specs are not scored: Stryker.NET only runs the .NET test projects against a mutant, never Playwright.
- Survivors are in `artifacts/mutation/backend/reports/mutation-report.html`: a survivor is either a missing assertion
  (add it) or an equivalent mutant (say why in the step's report).
- Expect minutes per file: an integration-covered mutant reruns the tests that cover it (each Stryker test process makes
  its own test databases). Mutate a few files at a time.
- Paths: keep the checkout's path short (e.g. `Drags-wt\<name>` for a worktree) and use the tool from the manifest
  (`dotnet tool restore`; never install it under a long folder): beyond Windows' 260-character limit Stryker fails with
  "Value cannot be null (path3)".
- When Stryker itself fails: no report → the stage says "Stryker failed before scoring" (its output is also in
  `artifacts/mutation/backend/stryker.log`). Seen under load: `CS0518 Predefined type 'System.Attribute' is not
  defined` / "General Build Failure" (a Buildalyzer hiccup): rerun. Tests that already fail in Stryker's initial run
  ("N tests are failing … outcome will be impacted") fail the stage: the score would not mean anything; fix or rerun.
- Known gap: a mutant that no longer compiles makes Stryker's safe mode drop **every** mutant of that method (counted
  as "not counted", not against the score). Seen: `Api/Features/Access/PlatformAdminHandler.cs`
  `HandleRequirementAsync` (CS0165 on `userId` from the `is not { } userId` pattern; not a gated file): the ADM/ACC
  integration cases cover "super admin flag removed → 403" directly.

**Frontend (StrykerJS): the pure logic.** `npm run test:mutation` mutates the files listed in
`ClinicHub.Web/stryker.config.json` (`mutate`: dosing, taper and sentence logic, the prescription text and lines, the
permission choice, the error reader, …) against the Vitest tests; the run fails below 85% overall. The same files
(`PURE_LOGIC` in `vite.config.ts`) carry the per-file coverage thresholds of `test:coverage`. A new pure-logic module
with rules goes into both lists.

## The test catalog and traceability

The [test catalog](test-catalog.md) lists everything the client could check, one behavior per case, taken from the
business and tech docs: ID (`AUTH-012`), priority (P0 acceptance-critical, P1 important rule or message, P2 edge or
cosmetic) and level (where it is cheapest to test). It is the source of the tests: a test is written from a case, with
the expected values of the docs, never from what the app does today.

- Every test names the cases it proves (the tags above); a case may need several tests (one per level for `api+e2e`).
- `tests/tools/traceability` reads the tags and the catalog: the gate (`full`/`release`, `-Gate`) is **100% of the P0
  and P1 cases** covered; P2 is reported, not gated. E2E covers P0 and P1 cases only: a P2 case whose level includes
  `e2e` is covered by a component or `api` test where that is cheap, else left open (reported).
- Run it alone: `./tests/tools/traceability/traceability.ps1 [-Gate] [-Areas AUTH] [-Levels api]` (scope = "only my
  areas/levels"); its self-test: `./tests/tools/traceability/selftest.ps1`.
- Rules: a known-bug test (Vitest `test.fails`, Playwright `test.fail`: run and expected to fail; xUnit `Skip`) counts
  (as covered with known bug, also when a passing test proves the same case at that level: the bug stays visible) only
  with its `BUG-nnn` ID in the title or skip reason, and in xUnit the reason must be a **plain string literal**
  (`Skip = "BUG-003: …"`; a const, `$"…"` or `@"…"` skips the test but counts as a skip without a bug ID); any other
  skip **or expected failure** (`Skip = "later"`, `test.skip`/`test.fixme`/`test.todo`/`describe.skip`/`test.fail`/
  `test.fails` without an ID) is not coverage and fails the run; IDs in comments don't count, nor does an e-mail-like
  `owner@clinic-1.test`; anything that is not exactly a catalog ID (`@AUTH-0163`, `@auth-189`) is reported as unknown
  and fails the run.
- Vitest levels come from the file: a `*.test.ts` file (functions, hooks through `renderHook`, the locale files) proves
  `unit`; a `*.test.tsx` file (it renders components) proves `ui`. A `unit+ui` case needs one test of each; a component
  test also proves the `unit` level of a case **without** a `ui` level (e.g. `unit+e2e`: logic only reachable through
  the page), listed apart in the report (`unitByComponentTest`). So put pure-logic tests in a `.test.ts` file.

**Every later step adds its cases and tests**, in the same commit as its code and docs:
1. Update the feature's `business.md` / `tech.md` (the rule comes first).
2. Add the new behaviors to the catalog (the area's next free number; IDs are never reused; a new area only for a new
   feature) and fix the cases whose behavior changed; update the catalog's summary counts.
3. Write a test at each case's level ([Adding a test](#adding-a-test)), tagged with the case IDs.
4. Run `./ci.ps1` (the `step` tier on CI) after each round; `./ci.ps1 -Tier full` at the end of the step, and the pull
   requests before merging ([Continuous integration](#continuous-integration-github-actions)).

## Adding a test

Pick the level from the case's `Level` column; one test per behavior, named after the "then" of the case.

| Level | Where | How |
|---|---|---|
| `unit` (backend: a pure rule, a validator) | `tests/ClinicHub.UnitTests/<Module>/<SubFeature>/` | [Backend unit tests](#backend-unit-tests-testsclinichubunittests) |
| `api` | `tests/ClinicHub.IntegrationTests/<Area>/` | [Integration tests](#integration-tests-testsclinichubintegrationtests) |
| `unit` (frontend pure logic), `ui` | next to the code: `<name>.test.ts` for `unit`, `<name>.test.tsx` for `ui` (a component test also proves the `unit` level of a case without a `ui` level) | [Component tests](#component-and-frontend-unit-tests-vitest) |
| `e2e` | `ClinicHub.Web/e2e/<area>/<journey>.spec.ts` | [End-to-end tests](#end-to-end-tests-playwright-clinichubwebe2e) |
| `manual` | not automated | the [dress rehearsal](dress-rehearsal.md) runs it |

Rules for every level ([design D10](../design/m1.6-test-foundation.md#d10-review-of-test-code)):
- **Expected values come from the docs** (catalog, feature docs, locale files), never from running the app. If the app
  disagrees with a clear doc, keep the test as the doc says and see [Known bugs](#known-bugs).
- Assert a **business** outcome (status, code, message, data), not an implementation detail.
- No sleeps: time through the test clock (`Clock.Advance`), waits through the framework's assertions (`findBy…`,
  Playwright's `expect`).
- Tests are independent: every suite runs in a random order; never rely on another test's data.
- A dosing or taper rule that both C# and TypeScript implement gets a row in `tests/fixtures/dosing-cases.json` (run by
  both sides: `Catalog/Parity` and `src/features/dosing/parity.test.ts`; [fixtures README](../../tests/fixtures/README.md)).

## Backend unit tests (`tests/ClinicHub.UnitTests`)

Pure rules (Domain, Application: `DosingRules`, `PermissionCatalog`/`PermissionSet`, `PhoneNormalizer`, `SessionRules`,
`RoleRules`, `StaffRules`, `Paging`, `SearchText`, …) and every validator, without a database or HTTP. The folders
mirror the Application's (`Access/Roles/`, `Catalog/Drugs/`, `Identity/Login/`, …). Application types are `internal`:
the test project sees them through `InternalsVisibleTo`.

```csharp
[Trait("Area", "access")]                    // every class: its area
public class PermissionSetTests
{
    [Fact]
    [Trait("Case", "ACC-005")]               // one per catalog case this test proves
    [Trait("Tier", "Smoke")]                 // optional: unit tests run in every tier anyway
    public void Of_expands_the_requirements_transitively()
    {
        PermissionSet.Of(["drugs.update"]).Keys.ShouldBe(["drugs.update", "drugs.details", "drugs.list"], ignoreOrder: true);
    }
}
```

Helpers (`TestSupport/`): `ApiValidation.Run(validator, command)` runs a validator the way the API does (the real
`ValidationBehavior` and `ApiProblemFactory`: status, codes in report order, camelCase `field`), so a validator test
asserts what the API documents (`answer.Status.ShouldBe(400); answer.Code.ShouldBe("nameRequired")`; see
`Catalog/Drugs/CreateDrugCommandValidatorTests.cs`); `FixedClock` (a stopped clock); `Text` (hard-to-read strings: a
zero-width space, a name of exactly n characters). A rule whose answer depends on the database (a 404, a 409) is an
`api` case, not a unit one.

## Integration tests (`tests/ClinicHub.IntegrationTests`)

### What a test runs against

- The real app (`Program`: settings validation, migrations, startup seeder, middleware, auth) in memory, environment
  **`Testing`** (`ClinicHub.Api/appsettings.Testing.json`, never published): the intended OTP limits (5 wrong tries,
  60 s between codes, 5 per hour, 5 min expiry), Display mode (`devCode` in the response), test keys, one test super
  admin (`+201009990001`), no dev seed. Three test substitutions only (`Harness/Hosting/ClinicHubFactory`): the app's
  `TimeProvider` is the test clock, JwtBearer checks token lifetimes against it (the app's own `ValidateLifetime`
  switch kept), and the access cache (HybridCache) runs on its own clock (see "Time and tokens").
- PostgreSQL: the compose container. Per test process (run id `CLINICHUB_TEST_RUN`, set by `test.ps1`; generated when
  unset), one **template** `drags_it_<run>_tpl` is migrated and seeded once by booting the app on it, copied to the
  **bare template** `drags_it_<run>_tpl_bare` (no catalog), then loaded with the shared catalog (`load_catalog.py`, run
  with `Process.Start` and an argument list, no shell) and its **baseline** recorded (`TestRun.Baseline`, see
  [The shared catalog](#the-shared-catalog-in-integration-tests)); each **collection** gets its own copy
  `drags_it_<run>_<n>` of the loaded template (the migration collection: of the bare one) (`CREATE DATABASE …
  TEMPLATE`). Before each new test class the copy is reset (below), then the startup seeder runs again, then the access
  cache is emptied. Everything of the run is dropped at the end; a crashed or killed run's databases are dropped by the next
  run (each run holds a liveness lock; a database whose run holds none, or older than a day, is stale). A run never
  drops another live run's databases (parallel worktrees are safe), and a second process started with a run id that is
  already in use stops at once and drops nothing. Under load (parallel worktrees, Stryker) `CREATE`/`DROP DATABASE` can
  wait long for PostgreSQL's checkpoints: the maintenance connection allows 10 minutes per command, and dropping is
  best effort (a collection's copy at its end, the run's databases at shutdown, other runs' leftovers): a failure is
  printed at the end of the run (`ClinicHub test databases: could not drop …`) and retried later (at shutdown, else by
  the next run's cleanup), never a failed test. Only creating the run's own databases fails the run. Opening a
  connection can be slow too: every test connection allows 60 s (Npgsql's default 15 s timed out when a collection's
  app started on a busy machine), and a collection's (or the template's) app whose start fails on a connection failure
  is started again, up to 3 times (`TestRun.StartAppAsync`, each retry printed at the end of the run like the drop
  warnings). Three full integration runs at the same time pass.
- Safety: the test host only ever connects to a `drags_it_<run>_<n>` database on localhost; anything else (the dev
  database `drags`) stops it before any connection, whatever the settings or a service override say (checked when the
  app's DbContext options are built, again when the context gets its options (an override that replaces them whole)
  and on every connection it opens; `Harness/Databases/DatabaseGuard`, proved by `SelfTests`).
- Order: collections run in parallel (one database each); the classes of a collection one after another; with a seed
  (`CLINICHUB_TEST_SEED`, always set by `test.ps1`), collections, classes and tests are shuffled reproducibly.

### The shared catalog in integration tests

Every collection but the migrations runs on the full imported catalog (23 categories, 182 subcategories, 23,414
shared drugs), as production will (design M1.7 D12).

- **Reset of a loaded copy**: Respawn on every table but `__EFMigrationsHistory`, `Clinics`, `Drugs`, `Categories`,
  `SubCategories` (a truncate cascades into every table referencing a truncated one: truncating `Clinics` would empty
  `Drugs`), then in one transaction `DELETE FROM "Drugs" WHERE "ClinicId" IS NOT NULL OR "Id" > <max imported id>`,
  `DELETE FROM "Clinics"`, and the subcategories and categories above the imported max ids; then the baseline check;
  then the startup seeder. About 0.2–0.3 s (the check is ~0.12 s of it).
- **Baseline check** (`BaselineGuard.CheckAsync`): the imported rows (shared drugs, categories, subcategories up to
  the baseline's max ids) must keep their count, max ids and checksum (`md5` of every column of every imported row, so
  a raw SQL change that keeps `UpdatedAt` counts too). Checked after every reset and once more when the collection
  ends. A change fails the run with "tests never edit imported rows or categories: create your own shared drug or
  category", naming the class that ran last (the first test of the next class fails with it, or the collection's
  cleanup); the collection's database is then re-created from the template, so the next classes run clean.
- **Rules for tests**: read imported drugs by exact name (`await Data.Shared("ALEMOX 1 GM 12 F.C.TABS.")`; names in
  the M1.7b contract's test data), never by id; anything that creates, renames, withdraws, restores or deletes a shared
  drug, a category or a subcategory uses its **own** rows (`Data.SharedDrug()`, `Data.Category()`,
  `Data.SubCategory()`); a subcategory of your own under an imported category is fine. Catalog numbers come from
  `TestRun.Baseline` (`SharedCount`, `MaxCategoryId`, …), never literals. Lists that should show "only this clinic's
  drugs" filter `source=own` or search a name absent from the catalog.
- **Migration collection**: its fixture is `BareAppFixture` (a copy of the bare template: migrated and seeded, no
  catalog, reset by Respawn on every table, no baseline check). Its classes take `BareAppFixture app`.
  `AddSharedCatalog` needs an empty `Drugs` table: a case crossing it with drugs deletes them first.
- **Self-tests of the guard** run `BaselineGuard.CheckAsync` on a scratch copy (`TestRun.CreateCopyAsync()`, then
  `TestRun.DropAsync`), never on the collection's own database. `TestRun.RecreateCopyAsync(name)` re-creates a copy
  from its template.
- Timings (a quiet machine): template migrated and seeded ~4–7 s, bare copy ~0.1 s, catalog load ~4 s, baseline
  read ~0.7 s, a collection copy ~0.1–0.2 s, a reset ~0.2–0.3 s.

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
| Drugs, protocols (a clinic, or the template: `await App.TemplateClinicIdAsync()`) | `await Data.Drug(clinic).Named("Tobradex").WithDosing(Dosings.Drops())`; `await Data.Protocol(clinic).With(drug).With(other, Dosings.AskEye())` (no `With`: one line with a new drug of the clinic); `Data.UpdateDrugAsync`, `DeleteDrugAsync`, `UpdateProtocolAsync`, `DeleteProtocolAsync`; `Dosings.Drops/Tablets/Taper/AskEye` |
| Imported shared drugs (read only) | `await Data.Shared("VIGAMOX 0.5% EYE DROPS 5 ML")` → `DrugDto` (fails unless exactly one shared drug has that exact name); the catalog's numbers: `TestRun.Baseline` |
| Shared drugs, categories, subcategories of the test's own (super admin use cases) | `await Data.SharedDrug()` (default: unique name, «العيون › المياه الزرقاء») `.Named(n)`, `.WithIngredients(i)`, `.Described(d)`, `.InCategory(cat, sub?)`, `.Withdrawn()` → `AdminDrugDto`; `await Data.Category().Named(en, ar)` → `CategoryDto`; `await Data.SubCategory(categoryId).Named(en, ar)` → `SubCategoryDto`; `Data.UpdateSharedDrugAsync`, `WithdrawSharedDrugAsync`, `RestoreSharedDrugAsync`. Own drugs' builders send a category too (default Eye › Glaucoma: `CategoryIds`, `SubCategoryIds`) |
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

## Component and frontend unit tests (Vitest)

Next to the code they test (`DrugFormDialog.tsx` → `DrugFormDialog.test.tsx`, a big one split by subject:
`ProtocolEditorPage.save.test.tsx`); helpers in `ClinicHub.Web/src/test`. The area tag goes on the `describe`, the
case IDs (and `@smoke`) on each test:

```ts
describe("drug dialog: opening and the name @area:catalog", () => {
    test("an empty or spaces-only name: red with «الاسم مطلوب.» under it, no request @DRUG-063 @smoke", async () => {
        // …
    });
});
```

- The file decides the level: a `*.test.ts` file proves `unit`, a `*.test.tsx` file `ui` ([traceability](#the-test-catalog-and-traceability)).
  A known bug: `test.fails("BUG-nnn: … @CASE", …)` (or `test.fails.each(…)` for table rows): it runs and must fail
  ([Known bugs](#known-bugs)).
- Pure logic (`dosingText.ts`, `taper.ts`, `prescriptionText.ts`, `api/errors.ts`, …): plain function tests, one per
  rule and boundary (both sides of each limit). It carries the coverage and StrykerJS gates ([Mutation
  testing](#mutation-testing)).
- Components: render with the providers, drive with `userEvent` like a user (roles and labels, not CSS classes),
  answer the API with MSW handlers shaped like the tech docs, assert what the user sees (texts from the locale files'
  values as quoted in the catalog) and what the SPA sent (`recordRequests`).

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
| Render a component in the app's providers (theme + RTL, i18n, router, auth, QueryClient, toasts) | `renderWithProviders(ui, {lang, route, path, user, auth, clipboard})`: `user.permissions` are expanded with their requirements, as `/me` returns them (so a set the API can't produce never reaches a test); a query retries a 5xx or network error once, as in the app; a query answering 403 **fails the test** (the app's 403 toast and `/me` reload exist only in `startApp`: use it for 403 flows) |
| The whole app on a page load (real AuthProvider, session store, API client) | `startApp({route, lang, clipboard})`, `sessionIn`, `refreshSequence`, `meByContext`, `contextOfRequest`, `expectPath`; `recordPaths()` (`src/test/app.tsx`: every path the app navigates to, in order, for "never opens X" even when a guard redirects before X mounts) |
| API answers (as the tech docs define them) | `drugsHandlers`, `protocolsHandlers`, `meHandler`, …, `problem(status, code)`, `networkError()`; builders `aDrug`, `aProtocol`, `aMe`, … |
| What the SPA sent | `recordRequests()` → `requests`, `writes()` (every method but GET) |
| Toasts | `findToast()` (newest), `toastTexts()`, `expectToasts(...texts)` (exactly these) |
| Text longer than a few characters, when the keystrokes don't matter | `fillIn(user, input, text)` (one paste) |
| MUI selects and field errors | `choose`, `optionsOf`, `openSelect`, `isRed` |
| Tooltips (on fake timers: no real delays) | `hoverTooltip(el)` → its text, `leaveTooltip(el)`, `hoverPastDelay(el)` (then check that none opened) |
| "Before the timer fires" (debounces, toasts) | `holdTimers()` → `advance(ms)`, `release()` |
| The clipboard | the `clipboard` option (or `stubClipboard()` after `userEvent.setup()`) → `write`, `execCommand`, `written()` |
| A name inside a message | `isolate(name)` (the bidi isolates the locale files put around it) |
| Storage failures, phone width | `breakStorage()`, `setViewportWidth(375)` |
| A dialog that must not close ("not closable while saving"): Esc or a backdrop click, then check | `clickOutside(user, dialog)`, `expectStillOpen(dialog)` (waits past MUI's exit transition, then expects the same dialog shown, not fading out), `pastExitTransition()` (`src/test/mui.ts`): a closing MUI dialog stays in the document during its fade-out, so never assert "still open" right after the key |

- A feature's page or dialog with its API lives in `src/test/pages/` (imported by path, so tests that don't need it
  stay light): `admin.tsx` (`renderAdmin`, `navigateInApp`; its `AdminRoutes.tsx` copies App.tsx's `/admin` routes:
  keep them in step), `protocolEditor.tsx`, `prescription.tsx`, `rolesTab.ts`, `staffTab.ts`, `EditorHarness.tsx`,
  `DosingHarness.tsx` + `dosing.ts`.

## End-to-end tests (Playwright, `ClinicHub.Web/e2e`)

Critical journeys through the real app in a browser: one spec file per journey under its area's folder
(`e2e/auth/login.spec.ts`, `e2e/prescription/copy.spec.ts`, …); shared steps and data in `e2e/support/`. E2E tests prove
P0 and P1 cases only.

### What a test runs against

- `npm run e2e` (global setup, `e2e/global-setup.ts`) builds the SPA and the Release API, starts the API in the
  `Testing` environment on its own port (5080 and up) serving the built SPA, on its own database `drags_e2e_<run>`
  (created by the API's startup; any other name is refused, never `drags`), loads the shared drug catalog into it once
  the API answers (`loadCatalog`, `e2e/support/catalogLoad.ts`: `spawnSync("python", …)` without a shell; Python +
  psycopg needed, see [`test.ps1`](#running-the-tests-testps1)), seeds the template's catalog (2 own drugs in
  «العيون › المياه الزرقاء», found through `GET /drug-categories`, and 1 protocol), and at the end stops the API and
  drops the database. Docker's PostgreSQL must be up (it is started when it isn't).
- Settings on top of `appsettings.Testing.json`: a pool of super admin phones (each test claims its own, so the OTP
  limit of 5 codes per hour per phone is never reached) and `Otp:ResendSeconds = 0` (a test may log the same person in
  twice in a row; the 60 s rule is proven by the `api` tests).
- Projects (`playwright.config.ts`), all Chromium: `ar-desktop` and `en-desktop` (1280 px), `ar-phone` (375 px, touch),
  and `ar-desktop-template`: the specs of `e2e/template-edits/` change the template clinic's catalog (copied into every
  new clinic), so they run alone, after all the others; `ar-desktop-shared-catalog`: the specs of
  `e2e/shared-catalog-edits/` create, rename, withdraw, restore or delete shared drugs, categories or subcategories
  (their own rows, unique names, never imported ones), so they run last too.
- The imported catalog is shared by every test of the run: a spec never asserts a literal count of it (the total, a
  search's or a category's matches: CAT-229); it compares the screen with the API's answer for the same search in the
  same run (`ApiSession.ok("GET", …)`).
- Parallel: `fullyParallel`, 4 workers, no retries (a flaky test is a bug to fix, not to retry).

### Writing a spec

```ts
import {expect, signIn, test} from "../support/fixtures.ts";

test.describe("Drugs: add, open, edit @area:catalog", () => {
    test("«إضافة دواء», a name, Save: the toast «تمت إضافة الدواء», the dialog closes and the drug is listed @DRUG-061 @smoke",
        async ({page, t, data, healthy}) => {
            const clinic = await data.clinic();                      // a new clinic of its own, through the API
            await signIn(page, clinic.owner.phone, "asIs", "/drugs"); // fast login, then the page
            await page.getByRole("button", {name: t.addDrug}).click();
            // … the steps a user takes, then the outcome the case states
            await healthy();                                         // the page checks, at an interesting moment
        });
});
```

| Need | Use (`e2e/support/`) |
|---|---|
| The project's language and its expected texts | `lang`, `t` (`texts.ts`, plus `texts-catalog.ts`, `texts-rx.ts`, `texts-ux.ts`): written out from the catalog and the locale files, never imported from them, so a changed message fails a test |
| Test data through the real API (the worker's super admin; an owner for drugs and protocols) | `data.clinic()`, `data.staff(clinic, …)`, `data.role(clinic, permissions)`, `data.drug(clinic)`, `data.protocol(clinic, drugs)`, `data.suspend` / `deleteClinic` / `deactivate` / `removeStaff`, … (`data.ts`); every name and phone unique in the run (`unique()`, `uniquePhone()`) |
| A logged-in page | `signIn(page, phone, target, path)` (OTP through the browser's own request context, so the cookie is the browser's; `target` = `"asIs"`, `"platform"`, `"template"`, `{clinicId}`), `signInSuperAdmin(page)`; through the login page itself: `loginViaUi(page, t, phone)` (for the login cases) |
| Another tab (same cookies) or another browser (own cookies, a second user) | `newTab()`, `newBrowser()` |
| Page checks | `healthy()`: `dir`/`lang` of the UI language, no horizontal scroll, axe-core (serious/critical fail); run by itself on every page left open at the end of a passing test, which also fails on any console error, uncaught exception or undeclared API error (below) |
| The API cut off on purpose (`page.route(…).abort()`) | `allowNetworkErrors()` (the browser's `net::ERR_…` lines are then expected) |
| API error answers the test expects (its subject: a refused request, a 404, a 401 it fakes…) | `allowApiErrors({status, method?, path?})` (`path` a RegExp on the pathname): every `/api/v1` answer of 400–499 a test's pages get must be declared, or the test fails at its end; `POST /api/v1/auth/refresh` → 401 (a page load without a session) is always allowed |
| Page loaded, toasts, the sidebar, area steps | `settled(page)`, `expectToast`, `openSidebar` / `navTo` (`ui.ts`), `catalog.ts`, `rx.ts`, `ux.ts` |

- Locate by role and accessible name in the project's language (`getByRole("button", {name: t.addDrug})`), like a
  user; never by CSS class unless nothing else exists (MUI internals).
- Wait with Playwright's web-first assertions (`await expect(…).toBeVisible()`), never `waitForTimeout`.
- Each test makes its own clinic and users: tests run in parallel against one database and never see each other's
  data. Don't change the template clinic outside `e2e/template-edits/`.
- An axe finding that is a known bug is listed in `KNOWN_AXE` (`checks.ts`) with its `BUG-nnn`, limited to the rule
  and the elements its row documents: reported (the test's attachments), not failed, so the rest of the scan still
  guards every page. Cut text that is a known bug is listed the same way in `KNOWN_CUT` (`ux.ts`, used by
  `expectNoCutOrOverlap`; empty today).
- A known-bug test is `test.fail("BUG-nnn: … @CASE", …)`: it runs and must fail (a project where the bug doesn't show:
  a conditional `test.skip(condition, "<why> (BUG-nnn)")` at its top). An axe bug's own test checks the page with
  `expectHealthyPage(page, lang, testInfo, {onlyBug: "BUG-nnn"})`: that bug's allowance is dropped, the other known
  bugs still let through, so it fails on its own bug only and passes once that one is fixed ([Known bugs](#known-bugs)).
- `npm run e2e` first type-checks and lints the specs (`tsc -p e2e`, ESLint): fix those errors first.

## Known bugs

A test that fails because the app contradicts a **clear** doc is never weakened to pass. From the end of M1.6, a bug a
new test finds in the feature being built is **fixed with that feature**, in the same step (the test then passes
unchanged). Only a bug that can't be fixed there (outside the step's scope, or deferred by the user) is marked and
listed in [known-bugs.md](known-bugs.md); a rule the docs don't settle is a question for the user, not a bug. The
entries collected during M1.6 are fixed after it, one per commit ([design D9](../design/m1.6-test-foundation.md#d9-bugs-found-while-writing-tests)).

Marking (the ID in the marker, the case tags kept). The test **runs and is expected to fail**, so the run notices a
bug that got fixed (the expected failure then passes, which fails the run):
- Vitest: `test.fails("BUG-612: <one line> @DOSE-012", …)` (table rows: `test.fails.each(rows)("BUG-612: … %s @DOSE-012", …)`);
- Playwright: `test.fail("BUG-612: <one line> @RX-004", …)`; an axe finding: a `KNOWN_AXE` entry (`checks.ts`) and the
  bug's own test checks with `expectHealthyPage(…, {onlyBug: "BUG-612"})` (fails on that bug only);
- xUnit (no expected-failure marker): `[Fact(Skip = "BUG-612: <one line>")]` (or `[Theory(Skip = …)]`), a **plain
  string literal**.

Known-bug tests count as covered with known bug in the traceability report (even when a passing test covers the same
case) and their IDs are listed in `artifacts/summary.md` (all three levels);
a skip without its `BUG-nnn` ID fails the run. Fixing one: [known-bugs.md § How to clear an entry](known-bugs.md#how-to-clear-an-entry).
