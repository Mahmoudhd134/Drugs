import {expect, signIn, test} from "../support/fixtures.ts";
import {navTo} from "../support/ui.ts";
import {textsOf} from "../support/ux.ts";

test.describe("A new version deployed while the app is open @area:ux", () => {
    test("opening a page whose chunk no longer exists: the app reloads itself once and the page opens @UX-029",
        async ({page, data, lang, consoleErrors}) => {
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone);
            await expect(page.getByRole("heading", {level: 1})).toBeVisible();

            // The drugs page's chunk of the old build is gone (404) the first time; after the reload it is served again
            const missing: string[] = [];
            await page.route(/\/assets\/DrugsPage-[^/]+\.js$/, async route => {
                if (missing.length === 0) {
                    missing.push(route.request().url());
                    await route.fulfill({status: 404, contentType: "text/plain", body: "Not found"});
                } else {
                    await route.continue();
                }
            });
            let loads = 0;
            page.on("load", () => loads++);
            await page.evaluate(() => Object.assign(window, {__beforeReload: true}));

            await navTo(page, t, t.navDrugs);
            await expect(page).toHaveURL(/\/drugs$/);
            await expect(page.getByRole("heading", {level: 1, name: t.drugsTitle})).toBeVisible({timeout: 30_000});
            expect(missing, "the old chunk was asked for").toHaveLength(1);
            expect(await page.evaluate(() => (window as unknown as { __beforeReload?: boolean }).__beforeReload ?? false),
                "the page was reloaded").toBe(false);
            expect(loads, "exactly one reload").toBe(1);
            const at = Number(await page.evaluate(() => sessionStorage.getItem("clinichub:chunkReloadAt")));
            expect(Date.now() - at, "the reload time is kept for 30 s").toBeLessThan(60_000);

            // The planted 404 and the failed import it causes are the test's own doing, not app errors
            const planted = (line: string) => line.includes(missing[0]) || /dynamically imported module|Importing a module script failed/.test(line);
            for (let i = consoleErrors.length - 1; i >= 0; i--) if (planted(consoleErrors[i])) consoleErrors.splice(i, 1);
        });
});
