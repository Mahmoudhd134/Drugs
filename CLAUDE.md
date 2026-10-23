# Clinic Drugs (ClinicHub)

Web app for a clinic: drug catalog, protocols (treatment templates), and a prescription builder
that copies text for Word. ASP.NET Core 9 + EF Core + PostgreSQL API; React + TypeScript + MUI SPA;
UI in English and Arabic (RTL). Drug/protocol content is not translated.
`ClinicHub` is the neutral code name (renamed from `Drags` on 2026-10-14); the PostgreSQL database,
user, Docker Compose project and volume keep the legacy name `drags`.
Backend projects: `ClinicHub.Domain` ← `ClinicHub.Application` ← `ClinicHub.Infrastructure` ← `ClinicHub.Api`
(`docs/design/architecture.md`).

## Before any change
Read the docs, they are the source of truth for how and why things work:
- `docs/tech/overview.md`: architecture, conventions, API, data model, checklist
- `docs/business/overview.md`: (Arabic) what the clinic can do today and the business rules
- `docs/features/<feature>/tech.md` and `business.md` for every feature you touch
- `docs/testing/README.md`: running and writing the tests (cases: `docs/testing/test-catalog.md`)

## When adding or changing a feature
- Copy `docs/features/_template/` to `docs/features/<feature>/` and fill in **both** files
  (tech in English, business in Arabic). Update both overviews if you add endpoints, tables, pages
  or user-visible capabilities. Update docs in the same commit as the code.
- Tests: add the feature's cases to `docs/testing/test-catalog.md` (fix the ones whose behavior changed) and write a
  test at each case's level (unit, api, ui, e2e), tagged with the case IDs, merged with the code on the feature branch
  (`docs/testing/README.md` "Adding a test"; who writes them: "Feature workflow" below). Never weaken a test to make it pass.
- UI strings go in `ClinicHub.Web/src/i18n/locales/en.ts` **and** `ar.ts`; check the UI in Arabic (RTL).
- Migrations: nothing in production yet; once deployed they must preserve data (see "Migrations" in the tech overview).

## Working here
- Dev: `docker compose up -d` (PostgreSQL); Vite at http://localhost:5173 (test UI there); API at
  http://localhost:5000, usually run from Rider. Don't kill Rider's process; build with `-c Release` if the Debug bin is locked.
- Checks on the laptop (seconds): `cd ClinicHub.Web && npx tsc -b && npx eslint src`, `dotnet build ClinicHub.sln`,
  and at most the one test being written. **Every test tier runs on GitHub Actions**, never on the laptop: commit, then
  `./ci.ps1` (pushes the branch, runs the tier, waits, writes `artifacts/ci/summary.md`): `-Tier step` (≈ 5 min) after
  each round, `-Tier full` (≈ 8 min; also every pull request but into `main`, "Gates" is the required check), `-Tier release`
  (+ mutation; also every pull request into `main`), `-Mutate <files> [-Area <areas>]` (Stryker.NET on any tier). See `docs/testing/README.md` "Continuous
  integration". Tests use their own databases (`drags_it_*`, `drags_e2e_*`), never `drags`.
- EF commands (migrations live in `ClinicHub.Infrastructure`): always pass
  `--project ClinicHub.Infrastructure --startup-project ClinicHub.Api` (+ `--configuration Release` if Rider runs
  the API; for `dotnet ef`, `-c` means `--context`),
  e.g. `dotnet ef migrations add <Name> …`, `dotnet ef database update …`. Never regenerate migrations.
- Small fixes the user asks for may be committed on `main`; features and bug rounds live on their own branch + git
  worktree, and their sessions commit validated work there. Merging to `main` only with the user's OK, through a pull
  request. Pushing any branch but `main` is allowed for CI runs (the user's standing OK, 2026-10-23); `main` is never
  pushed directly.

## Feature workflow (agreed 2026-10-17)
Roles: a **program orchestrator** session starts one **feature session** per feature (and merges to `main` on the
user's OK); the feature session designs with the user and runs T1–T6 with **separate** agents (edge-case finder, coders,
test writers, reviewers, code fixer, test fixer, acceptance tester). The user only walks through the result for about a
minute and never tests by hand: the tests must be reliable and cheap.

- **Size:** about 1 day of build, at most 4 parallel tracks, one migration, about 150 new cases or fewer, mergeable to
  `main` on its own (`full` green). Bigger: split into several features.
- **Environment:** feature branch + worktree `Drags-wt\<feature>` from `main`; each track its own worktree, branch
  `<feature>/<track>`, scratch DB `drags_<feature>_<track>` and ports. Never touch `drags`, Rider (:5000) or Vite (:5173).
  At most 4 agents at once. Commits: plain messages, no AI attribution. Every branch but `main` may be pushed for its CI
  runs (`./ci.ps1`); a track's tests run on CI too.
- **T0 Design** (user + session): Arabic business doc, tech, decisions; test-case draft (given/when/then, P0–P2, level,
  source); an **edge-case agent** maps every rule sentence to a case, adds edge cases (borders, empty states, double
  clicks, permissions, Arabic/RTL, phone, stale screens) and lists the existing cases the feature changes or retires; the
  **contract as compiled code**, committed before T1 (DTOs, route stubs, error codes, i18n keys and texts, accessible
  names, screen structure, MSW handlers, builders and test data); the work split (code tracks, test tracks, each case
  assigned to a test track); one reviewer; the **user's approval** is the gate.
- **T1 Build** (parallel): **coders** write the code and the feature docs (moved from the design, no rule rewrites) and
  run build (0 warnings), tsc, eslint and the EF pending-changes check; **test writers** write the catalog rows and the
  tests from the docs and the contract only, never from the code (they compile against the contract; component tests run
  against MSW). A rule or contract change goes through the session to both sides.
- **T2 First run:** merge everything, run `./ci.ps1 -Tier full` in **report mode** (every job runs to the end) 3 times
  (each run has its own random order): a failure report for the reviewers, not a verdict (a green T2 counts for nothing).
- **T3 Review** (parallel, read-only, no test runs): 2–3 code reviewers (fit to the design, bugs, security and clinic
  isolation, browser/RTL/phone for UI) and 2 test reviewers (each test matches the doc, "would it fail if the rule
  broke?", every case and edge case covered, nothing weakened). Every T2 failure is labeled code bug / test bug / doc
  unclear. Each finding cites the doc line and the code or test line and passes a verify step (confidence ≥ 80).
- **T4 Fix:** for a code bug the **test fixer writes a failing test first** (if none exists), then the **code fixer**
  makes it pass. The code fixer never edits tests; the test fixer never edits code and changes a test only when the doc
  proves it wrong. An unclear doc goes to the user. Each fix names the finding it closes.
- **T5 Prove** (gate): `full` green on CI (the step → feature pull request) + diff coverage of the feature's changed code (≥ 90% lines / 85% branches) + Stryker on
  all the feature's new logic (≥ 85%; `./ci.ps1 -Mutate <files>`, one CI job per file) + an **acceptance agent** that uses the app from the business doc only (Arabic,
  English, phone) and explores freely; its findings become cases and go to T4. Repeat T4–T5 until green (after 3
  rounds, ask the user); one reviewer on the fix diff only if it was large or touched security.
- **T6 Done** (gate): rebase on `main`, `release` green on CI (the feature → `main` pull request: `full` + mutation), then a **ready report**: a 3–5 click script for the "done when"
  scenario, an e2e screenshot gallery (Arabic, English, phone) and the numbers (cases covered, coverage, mutation, flaky
  runs 0, known bugs 0). The user's one-minute walkthrough (findings go to T4), then the user's merge OK.
- **Test rules:** every business rule is a catalog case with a test; the feature's new and changed cases 100% covered
  (P2 included), the app's P0/P1 100%; the lowest level that proves the rule (unit → api → component → e2e); e2e for the
  P0 and P1 cases whose level includes `e2e` (one journey spec may tag several cases); `step` during the work, the whole
  e2e suite only in `full` (every tier on CI); no retries (a flaky test is a bug); axe, cut-text and RTL checks on every e2e page; known
  bugs at merge 0 unless the user defers one; `release` tier at a milestone's end.
- **Stop and ask the user:** a business rule the docs don't settle, a contract change that changes behavior, a fix loop
  that doesn't settle after 3 rounds, usage limits, or the session's context above about 60% (save state, hand over).
- Bug rounds keep their own rule: fix → independent validate + review agent → fix → second cycle → fix.
