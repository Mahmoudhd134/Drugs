import type {Locator, Page} from "@playwright/test";
import {expect, test} from "../support/fixtures.ts";
import {openHarness, pngFile, routeFilesApi} from "../support/attachments.ts";

/** `errors.network` in English. */
const NETWORK_REASON = "Can't reach the server. Check your connection.";

/** The harness refuses a file named `fail-*`, so each stays with its Retry; 20 rows make the page scroll. */
const NAMES = Array.from({length: 20}, (_, index) => `fail-${index + 1}.png`);

const scrollTop = (page: Page) => page.evaluate(() => window.scrollY);

/** Brings `button` to the middle of the screen, so pressing it needs no scrolling, and answers where the page is then. */
const scrollDownTo = async (page: Page, button: Locator) => {
    await button.evaluate(element => element.scrollIntoView({block: "center"}));
    const top = await scrollTop(page);
    expect(top, "the page is scrolled down, or this proves nothing").toBeGreaterThan(100);
    return top;
};

test.describe("Attachments: a long list @area:attachments", () => {
    test("a failed row whose reason wraps doesn't shrink when Retry starts, so the page doesn't move @ATT-282",
        async ({page, isMobile, allowNetworkErrors}) => {
            test.skip(!isMobile, "the phone project");
            allowNetworkErrors();
            await routeFilesApi(page);
            let release = () => { /* set when a send is held */ };
            let held = false;
            await page.route(/\/api\/v1\/test-files$/, async route => {
                if (route.request().method() !== "POST") return route.fallback();
                if (held) await new Promise<void>(resolve => { release = resolve; });
                return route.abort();
            });
            // In English: this reason fits on one line in Arabic at 375 px
            const ui = await openHarness(page, "en", {mode: "real", lang: "en"});
            const names =Array.from({length: 12}, (_, index) => `row-${index + 1}.png`);
            await ui.input.setInputFiles(names.map(pngFile));
            await expect(ui.selectedRow(names[11]), "all selected").toBeVisible();
            await ui.uploadButton.tap();

            // Upload moved the focus; the page ends at the last row's end, where a shorter row pulls it back
            const last = names[11];
            const retry = ui.selectedRow(last).getByRole("button", {name: ui.a.retryFile(last), exact: true});
            await expect(retry, "the run ended").toBeVisible();
            const row = ui.selectedRow(last);
            const reason = row.getByText(NETWORK_REASON, {exact: true});
            const lines = await reason.evaluate(e => e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight));
            expect(Math.round(lines), "the reason wraps, or this proves nothing").toBeGreaterThanOrEqual(2);
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            const top = await scrollTop(page);
            expect(top, "the page is scrolled down, or this proves nothing").toBeGreaterThan(100);
            const height = (await row.boundingBox())!.height;

            held = true;
            await retry.tap();
            await expect(row.getByRole("progressbar"), "its send is running").toBeVisible();

            expect((await row.boundingBox())!.height, "the row doesn't shrink").toBeGreaterThanOrEqual(height - 1);
            expect(await scrollTop(page), "the page stays where it was").toBeGreaterThanOrEqual(top - 2);
            release();
            await expect(retry, "it failed again").toBeVisible();
        });

    test("Upload by pointer: focus moves to the Choose files button and the page keeps its scroll position @ATT-282",
        async ({page, lang, isMobile}) => {
            const ui = await openHarness(page, lang, {seed: "none"});
            await ui.input.setInputFiles(NAMES.map(pngFile));
            await expect(ui.selectedRow(NAMES[19]), "all selected").toBeVisible();
            const top = await scrollDownTo(page, ui.uploadButton);

            await (isMobile ? ui.uploadButton.tap() : ui.uploadButton.click());

            await expect(ui.pickButton, "focus moved").toBeFocused();
            await expect(ui.selectedRow(NAMES[19]).getByRole("button", {name: ui.a.retryFile(NAMES[19]), exact: true}), "the run ended").toBeVisible();
            expect(await scrollTop(page), "the page stays where it was").toBeGreaterThanOrEqual(top - 2);
        });

    test("Retry by pointer: focus moves to the Choose files button and the page keeps its scroll position @ATT-282",
        async ({page, lang, isMobile}) => {
            const ui = await openHarness(page, lang, {seed: "none"});
            await ui.input.setInputFiles(NAMES.map(pngFile));
            await expect(ui.selectedRow(NAMES[19]), "all selected").toBeVisible();
            await ui.uploadButton.click();
            const retry = ui.selectedRow(NAMES[17]).getByRole("button", {name: ui.a.retryFile(NAMES[17]), exact: true});
            await expect(ui.selectedRow(NAMES[19]).getByRole("button", {name: ui.a.retryFile(NAMES[19]), exact: true}), "the run ended").toBeVisible();
            const top = await scrollDownTo(page, retry);

            await (isMobile ? retry.tap() : retry.click());

            await expect(ui.pickButton, "focus moved").toBeFocused();
            await expect(retry, "it failed again").toBeVisible();
            expect(await scrollTop(page), "the page stays where it was").toBeGreaterThanOrEqual(top - 2);
        });
});
