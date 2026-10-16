import AxeBuilder from "@axe-core/playwright";
import type {Page} from "@playwright/test";
import {expect, settled, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {createDrug, createGroup} from "../support/catalog.ts";

/**
 * The lists' "loading" bars must have an accessible name like every control (design M1.6 D3: axe serious/critical
 * violations fail). The page checks (`healthy()`) wait until no progress bar shows, so they never meet these bars:
 * here a search request is held while axe scans the page with the bar on screen.
 */

/** Holds every drugs/groups list request that searches, until the returned function is called. */
const holdSearches = async (page: Page) => {
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(url => /\/api\/v1\/(drugs|drug-groups)$/.test(url.pathname) && !!url.searchParams.get("search"),
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
    test.fixme("BUG-551: the drugs page's, the groups page's and the pickers' loading bars have an accessible name (axe aria-progressbar-name) @UX-036",
        async ({page, t, data}) => {
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Bar ${unique()}`);
            await createGroup(data, clinic, `Bar group ${unique()}`, [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            expect.soft(await scanWhileSearching(page, t.searchDrugs, "bar"), "drugs page").toEqual([]);

            await page.goto("/groups");
            await settled(page);
            expect.soft(await scanWhileSearching(page, t.searchGroups, "bar"), "groups page").toEqual([]);

            // SearchableList: the group editor's drug picker (the prescription's pickers are the same component)
            await page.goto("/groups/new");
            await settled(page);
            expect.soft(await scanWhileSearching(page, t.searchDrugs, "bar"), "drug picker").toEqual([]);
        });
});
