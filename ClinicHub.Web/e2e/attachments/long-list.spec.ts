import type {Locator, Page} from "@playwright/test";
import {expect, test} from "../support/fixtures.ts";
import {openHarness, pngFile} from "../support/attachments.ts";

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
