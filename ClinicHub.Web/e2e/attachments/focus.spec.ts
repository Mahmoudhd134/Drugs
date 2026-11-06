import {expect, test} from "../support/fixtures.ts";
import {harnessUi, routeFilesApi} from "../support/attachments.ts";

const RULES_PATH = /\/api\/v1\/test-files\/rules$/;

test.describe("Attachments: focus in a real browser @area:attachments", () => {
    test("Retry after the rules failed: the alert leaves while they load, and focus goes to the Choose files button once it's enabled @ATT-274",
        async ({page, lang, isMobile, allowApiErrors}) => {
            // jsdom focuses a disabled button and a browser doesn't, so only here does waiting for it being enabled show
            allowApiErrors({status: 400, method: "GET", path: RULES_PATH});
            await routeFilesApi(page);
            let refusing = true;
            let release = () => { /* set when the Retry's request is held */ };
            const released = new Promise<void>(resolve => { release = resolve; });
            await page.route(RULES_PATH, async route => {
                if (refusing) {
                    return route.fulfill({
                        status: 400,
                        contentType: "application/problem+json",
                        body: JSON.stringify({status: 400, code: "attachmentEmpty", errors: [{code: "attachmentEmpty", description: "attachmentEmpty"}], traceId: "e2e"}),
                    });
                }
                await released;
                return route.fallback();
            });
            await page.goto("/__harness/attachments/index.html?mode=real");
            const ui = harnessUi(page, lang);
            await expect(page.getByText(ui.a.rulesFailed, {exact: true}), "the rules failed").toBeVisible();
            await expect(ui.pickButton, "picking is off").toBeDisabled();
            const retry = page.getByRole("button", {name: ui.a.retry, exact: true});

            refusing = false;
            if (isMobile) {
                await retry.tap();
            } else {
                await retry.focus();
                await page.keyboard.press("Enter");
            }
            await expect(retry, "the alert left while they load").toHaveCount(0);
            release();

            await expect(ui.pickButton, "the rules loaded").toBeEnabled();
            await expect(ui.pickButton, "focus followed").toBeFocused();
        });
});
