# ClinicHub.Web

The ClinicHub SPA (React + TypeScript + MUI, English and Arabic RTL): drug catalog, protocols and the prescription
builder. The API (`ClinicHub.Api`) serves the built app; architecture and conventions: [docs/tech/overview.md](../docs/tech/overview.md).

- `npm ci`, then `npm run dev`: Vite at http://localhost:5173, `/api` proxied to the API at http://localhost:5000.
- `npm run build`: type-check and build into `../ClinicHub.Api/wwwroot`. Checks: `npx tsc -b && npx eslint src`.
- `npm run test` (Vitest unit + component), `npm run test:coverage` (+ the coverage gates), `npm run test:mutation`
  (StrykerJS on the pure logic), `npm run e2e` (Playwright: builds the SPA and the API and runs them on a test database).
- How to write and run tests (all levels, `../test.ps1`): [docs/testing/README.md](../docs/testing/README.md).
