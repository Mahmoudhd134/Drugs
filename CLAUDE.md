# Clinic Drugs (ClinicHub)

Web app for a clinic: drug catalog, drug groups (treatment templates), and a prescription builder
that copies text for Word. ASP.NET Core 9 + EF Core + PostgreSQL API; React + TypeScript + MUI SPA;
UI in English and Arabic (RTL). Drug/group content is not translated.
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
  test at each case's level (unit, api, ui, e2e), tagged with the case IDs, in the same commit
  (`docs/testing/README.md` "Adding a test"). Never weaken a test to make it pass.
- UI strings go in `ClinicHub.Web/src/i18n/locales/en.ts` **and** `ar.ts`; check the UI in Arabic (RTL).
- Migrations: nothing in production yet; once deployed they must preserve data (see "Migrations" in the tech overview).

## Working here
- Dev: `docker compose up -d` (PostgreSQL); Vite at http://localhost:5173 (test UI there); API at
  http://localhost:5000, usually run from Rider. Don't kill Rider's process; build with `-c Release` if the Debug bin is locked.
- Checks: `cd ClinicHub.Web && npx tsc -b && npx eslint src`, `dotnet build ClinicHub.sln`, and `./test.ps1 -Tier step`
  (PowerShell, Docker running; `./test.ps1 -Tier full` at a feature's end and before merging to `main`). Tests use their
  own databases (`drags_it_*`, `drags_e2e_*`), never `drags`.
- EF commands (migrations live in `ClinicHub.Infrastructure`): always pass
  `--project ClinicHub.Infrastructure --startup-project ClinicHub.Api` (+ `--configuration Release` if Rider runs
  the API; for `dotnet ef`, `-c` means `--context`),
  e.g. `dotnet ef migrations add <Name> …`, `dotnet ef database update …`. Never regenerate migrations.
- Commit directly on `main`, only when asked. Never push unless asked.
