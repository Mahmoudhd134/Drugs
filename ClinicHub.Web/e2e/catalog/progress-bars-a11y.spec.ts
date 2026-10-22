import AxeBuilder from "@axe-core/playwright";
import type {Page} from "@playwright/test";
import {expect, settled, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {createDrug, createProtocol} from "../support/catalog.ts";
import {TREE_TEXTS} from "../support/texts-rx.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";

/**
 * The lists' "loading" bars must have an accessible name like every control (design M1.6 D3: axe serious/critical
 * violations fail). The page checks (`healthy()`) wait until no progress bar shows, so they never meet these bars:
 * here a search request is held while axe scans the page with the bar on screen.
 */

/** Holds every list or tree request that searches (drugs, protocols, the drug tree, the admin drugs), until released. */
const holdSearches = async (page: Page) => {
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(url => /\/api\/v1\/(drugs|protocols|drugs\/tree|admin\/drugs)$/.test(url.pathname) && !!url.searchParams.get("search"),
        async route => {
            await gate;
            await route.continue();
        });
    return release;
};

/** The axe `aria-progressbar-name` findings on the page as it is now. */
const unnamedBars = async (page: Page) => {
    const results = await new AxeBuilder({page}).withRules(["aria-progressbar-name"]).analyze();
    return results.violations.flatMap(v => v.nodes.map(n => n.html));
};

/** Types `term` in the search box while its request is held, scans, then lets the request go. */
const scanWhileSearching = async (page: Page, placeholder: string, term: string) => {
    const release = await holdSearches(page);
    await page.getByPlaceholder(placeholder).filter({visible: true}).fill(term);
    await expect(page.locator("[role=progressbar]:visible").first(), "the loading bar shows").toBeVisible();
    const found = await unnamedBars(page);
    release();
    await page.unrouteAll({behavior: "wait"});
    await settled(page);
    return found;
};

test.describe("Loading bars of the lists @area:ux", () => {
    test("the drugs page's, the protocols page's, the drug tree's (protocol editor, prescription) and the admin drugs page's loading bars have an accessible name (axe aria-progressbar-name) @UX-036",
        async ({page, t, lang, data, newBrowser}) => {
            const tt = TREE_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Bar ${unique()}`);
            await createProtocol(data, clinic, `Bar protocol ${unique()}`, [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            expect.soft(await scanWhileSearching(page, t.searchDrugs, "bar"), "drugs page").toEqual([]);

            await page.goto("/protocols");
            await settled(page);
            expect.soft(await scanWhileSearching(page, t.searchProtocols, "bar"), "protocols page").toEqual([]);

            // The drug tree (M1.7c): the thin bar over the old tree while a new search loads
            await page.goto("/protocols/new");
            await settled(page);
            expect.soft(await scanWhileSearching(page, tt.searchPlaceholder, "bar"), "protocol editor's drug tree").toEqual([]);
            await page.goto("/");
            await settled(page);
            await page.getByRole("tab", {name: t.rxTabDrugs}).click();
            expect.soft(await scanWhileSearching(page, tt.searchPlaceholder, "bar"), "prescription's drug tree").toEqual([]);

            const admin = await newBrowser();
            await signInSuperAdmin(admin.page, "/admin/drugs");
            expect.soft(await scanWhileSearching(admin.page, SHARED_TEXTS[lang].adminSearch, "bar"), "admin drugs page").toEqual([]);
        });
});
