import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {createDrug, createDrugs, drugRow, drugRows} from "../support/catalog.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {recordRequests} from "../support/ui.ts";
import {listDrugs} from "../support/shared.ts";

/** The drugs page: search, paging, no results (docs/features/drugs/business.md "البحث عن دواء"). */
test.describe("The drugs list @area:catalog", () => {
    test("the search updates the list while typing (debounced, no button) and goes back to the first page @DRUG-051",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            // 25 own drugs "Bulk …", then the searched one; the shared catalog after them (design M1.7 D7 order)
            await createDrugs(data, clinic, Array.from({length: 25}, (_, i) => `Bulk ${u} ${String(i).padStart(2, "0")}`));
            await createDrug(data, clinic, `Zeta ${u}`);
            // The list's total: the API's answer of the same run (never a literal of the catalog, design M1.7 D12)
            const total = (await listDrugs(await data.ownerApi(clinic), {pageSize: 20})).totalCount;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await expect(page.getByText(ct.displayedRows(1, 20, total), {exact: true})).toBeVisible();
            await healthy();

            await page.getByRole("button", {name: t.nextPage}).click();
            await expect(page.getByText(ct.displayedRows(21, 40, total), {exact: true})).toBeVisible();

            const search = page.getByPlaceholder(t.searchDrugs);
            const lists = recordRequests(page, "GET", /\/api\/v1\/drugs$/);
            const term = `zeta ${u}`;
            await search.click();
            await search.pressSequentially(term, {delay: 30});
            // No search button: the list follows the typing, on the first page
            await expect(drugRows(page)).toHaveCount(1);
            await expect(drugRow(page, `Zeta ${u}`)).toBeVisible();
            await expect(page.getByText(ct.displayedRows(1, 1, 1), {exact: true})).toBeVisible();
            const searched = lists.map(r => new URL(r.url()).searchParams.get("search") ?? "");
            expect(searched, "the last request searches the whole term").toContain(term);
            expect(searched.length, "debounced: fewer requests than keys typed").toBeLessThan(term.length / 2);
            expect(lists.every(r => new URL(r.url()).searchParams.get("page") === "1"), "every search asks page 1").toBe(true);
            await expect(page.getByRole("button", {name: /search|بحث/i})).toHaveCount(0);
        });

    test("20 rows per page with paging; 10 or 50 rows show that many and go back to the first page @DRUG-052",
        async ({page, t, lang, data, isMobile}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            await createDrugs(data, clinic, Array.from({length: 53}, (_, i) => `Page ${u} ${String(i).padStart(2, "0")}`));
            // Own drugs + the shared catalog: the API's total of the same run (design M1.7 D12)
            const total = (await listDrugs(await data.ownerApi(clinic), {pageSize: 20})).totalCount;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await expect(drugRows(page)).toHaveCount(20);
            await expect(page.getByText(ct.displayedRows(1, 20, total), {exact: true})).toBeVisible();
            await page.getByRole("button", {name: t.nextPage}).click();
            await expect(page.getByText(ct.displayedRows(21, 40, total), {exact: true})).toBeVisible();
            await expect(drugRows(page)).toHaveCount(20);

            // On a phone the rows-per-page choice is hidden (ListPagination), the default 20 is kept
            if (isMobile) {
                await expect(page.getByRole("combobox", {name: t.rowsPerPage})).toBeHidden();
                return;
            }
            for (const size of [10, 50]) {
                await page.getByRole("combobox", {name: t.rowsPerPage}).click();
                await page.getByRole("option", {name: String(size), exact: true}).click();
                await expect(drugRows(page)).toHaveCount(size);
                await expect(page.getByText(ct.displayedRows(1, size, total), {exact: true})).toBeVisible();
                await page.getByRole("button", {name: t.nextPage}).click();
                await expect(page.getByText(ct.displayedRows(size + 1, Math.min(2 * size, total), total), {exact: true})).toBeVisible();
            }
        });

    test("a search without results says «لا توجد أدوية مطابقة للبحث.» @DRUG-054", async ({page, t, lang, data, healthy}) => {
        const ct = CATALOG_TEXTS[lang];
        const clinic = await data.clinic();
        await signIn(page, clinic.owner.phone, "asIs", "/drugs");
        await page.getByPlaceholder(t.searchDrugs).fill(`nothing ${unique()}`);
        await expect(page.getByText(ct.drugsNoResults, {exact: true})).toBeVisible();
        await expect(drugRows(page)).toHaveCount(0);
        await healthy();
    });

    test("typing «اسبرين» lists «أسبرين ممتد», «اسبرين أطفال» and «قرص أسبرين», in that order @DRUG-102",
        async ({page, t, data, healthy}) => {
            const clinic = await data.clinic();
            for (const name of ["قرص أسبرين", "اسبرين أطفال", "أسبرين ممتد", "باراسيتامول"]) await createDrug(data, clinic, name);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await page.getByPlaceholder(t.searchDrugs).fill("اسبرين");
            // The clinic's own drugs come first (design M1.7 D7); shared drugs matching the term may follow them
            const names = drugRows(page).locator("td:first-child p:first-child");
            await expect(names.first()).toHaveText("أسبرين ممتد");
            const shown = await names.allTextContents();
            expect(shown.slice(0, 3)).toEqual(["أسبرين ممتد", "اسبرين أطفال", "قرص أسبرين"]);
            expect(shown).not.toContain("باراسيتامول");
            await healthy();
        });
});
