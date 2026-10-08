# Clinic Drugs (Drags)

Web app for a clinic: drug catalog, drug groups (treatment templates), and a prescription builder
that copies text for Word. ASP.NET Core 9 + EF Core + SQLite API; React + TypeScript + MUI SPA;
UI in English and Arabic (RTL). Drug/group content is not translated.

## Before any change
Read the docs, they are the source of truth for how and why things work:
- `docs/tech/overview.md`: architecture, conventions, API, data model, checklist
- `docs/business/overview.md`: (Arabic) what the clinic can do today and the business rules
- `docs/features/<feature>/tech.md` and `business.md` for every feature you touch

## When adding or changing a feature
- Copy `docs/features/_template/` to `docs/features/<feature>/` and fill in **both** files
  (tech in English, business in Arabic). Update both overviews if you add endpoints, tables, pages
  or user-visible capabilities. Update docs in the same commit as the code.
- UI strings go in `Drags.Web/src/i18n/locales/en.ts` **and** `ar.ts`; check the UI in Arabic (RTL).
- Migrations must preserve production data (see "Migrations" in the tech overview).

## Working here
- Dev: Vite at http://localhost:5173 (test UI there); API at http://localhost:5000, usually run
  from Rider. Don't kill Rider's process; build with `-c Release` if the Debug bin is locked.
- Checks: `cd Drags.Web && npx tsc -b && npx eslint src` and `dotnet build Drags.Api`.
- Commit directly on `main`, only when asked. Never push unless asked.
