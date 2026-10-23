import {defineConfig, devices} from "@playwright/test";
import type {Options} from "./e2e/support/fixtures.ts";

/**
 * End-to-end tests (design M1.6 D3; docs/testing/README.md "npm contract"): `npm run e2e` = the whole suite,
 * `npm run e2e -- --grep @smoke` = the smoke tests (test.ps1 step tier). Chromium only (CLINICHUB_E2E_BROWSERS is
 * always "chromium"): desktop 1280 px in Arabic and in English, and a 375 px touch phone in Arabic.
 * Global setup builds the SPA and the Release API, starts the API (Testing) on its own database and port, and
 * stops/drops them at the end (e2e/global-setup.ts).
 */
const desktop = {...devices["Desktop Chrome"], viewport: {width: 1280, height: 800}};
const phone = {
    ...devices["Pixel 5"],
    viewport: {width: 375, height: 812},
    screen: {width: 375, height: 812},
    isMobile: true,
    hasTouch: true,
};

/** Tests that change the template clinic's catalog: run alone, after every other test (new clinics copy it). */
const TEMPLATE_EDITS = /template-edits\/.*\.spec\.ts$/;
/**
 * Tests that write the shared catalog or the categories (design M1.7 D12: their own rows, unique names, never imported
 * ones): run alone, last, after the template edits (every clinic sees the shared catalog).
 */
const SHARED_CATALOG_EDITS = /shared-catalog-edits\/.*\.spec\.ts$/;

if ((process.env.CLINICHUB_E2E_BROWSERS ?? "chromium").split(",").every(b => b.trim() !== "chromium")) {
    throw new Error(`CLINICHUB_E2E_BROWSERS=${process.env.CLINICHUB_E2E_BROWSERS}: the e2e suite has Chromium projects only`);
}

export default defineConfig<Options>({
    testDir: "./e2e",
    outputDir: "../artifacts/e2e/test-results",
    globalSetup: "./e2e/global-setup.ts",
    fullyParallel: true,
    forbidOnly: true,
    retries: 0,
    workers: Number(process.env.CLINICHUB_E2E_WORKERS) || 4,
    timeout: 90_000,
    expect: {timeout: 10_000},
    reporter: [
        ["list"],
        ["html", {outputFolder: "../artifacts/e2e/report", open: "never"}],
        ["json", {outputFile: "../artifacts/e2e/results.json"}],
    ],
    use: {
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        actionTimeout: 15_000,
        navigationTimeout: 60_000,
    },
    projects: [
        {name: "ar-desktop", testIgnore: [TEMPLATE_EDITS, SHARED_CATALOG_EDITS], use: {...desktop, locale: "ar-EG", lang: "ar"}},
        {name: "en-desktop", testIgnore: [TEMPLATE_EDITS, SHARED_CATALOG_EDITS], use: {...desktop, locale: "en-US", lang: "en"}},
        {name: "ar-phone", testIgnore: [TEMPLATE_EDITS, SHARED_CATALOG_EDITS], use: {...phone, locale: "ar-EG", lang: "ar"}},
        {
            name: "ar-desktop-template",
            testMatch: TEMPLATE_EDITS,
            dependencies: ["ar-desktop", "en-desktop", "ar-phone"],
            use: {...desktop, locale: "ar-EG", lang: "ar"},
        },
        {
            name: "ar-desktop-shared-catalog",
            testMatch: SHARED_CATALOG_EDITS,
            dependencies: ["ar-desktop", "en-desktop", "ar-phone", "ar-desktop-template"],
            use: {...desktop, locale: "ar-EG", lang: "ar"},
        },
    ],
});
