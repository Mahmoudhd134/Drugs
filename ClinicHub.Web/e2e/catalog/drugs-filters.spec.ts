import type {Locator, Page} from "@playwright/test";
import {expect, settled, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import type {ClinicHandle, Data} from "../support/data.ts";
import type {Lang} from "../support/texts.ts";
import {createDrug, createDrugs, dialog, drugRow, drugRows, search} from "../support/catalog.ts";
import {CATALOG_TEXTS, type CatalogTexts} from "../support/texts-catalog.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";
import {type ApiDrug, type CategoryRow, IMPORTED, listDrugs, pickCategory} from "../support/shared.ts";
import {categoryFilter, pick, subCategoryFilter} from "../support/admin-catalog.ts";
import {expectToast, navTo} from "../support/ui.ts";
import {expectNotCut, noHorizontalScroll} from "../support/ux.ts";

/**
 * The drugs page's toggle and filters (M1.7c contract § 3.4, decisions C2; design M1.7 D7, D9; business «صفحة الأدوية»):
 * «الكل» / «المشتركة» / «أدوية العيادة», category then subcategory, all in the URL (Back keeps them), any change to page
 * 1; the category column in the UI language. Catalog counts are never literals: the screen is compared with the API's
 * answer for the same query in the same run (design D12).
 */

const toggle = (page: Page, ct: CatalogTexts) => page.getByRole("group", {name: ct.sourceLabel});
const sourceButton = (page: Page, ct: CatalogTexts, source: "all" | "shared" | "own") =>
    toggle(page, ct).getByRole("button", {name: {all: ct.sourceAll, shared: ct.sourceShared, own: ct.sourceOwn}[source], exact: true});

const expectPressed = async (page: Page, ct: CatalogTexts, source: "all" | "shared" | "own") => {
    for (const s of ["all", "shared", "own"] as const) {
        await expect(sourceButton(page, ct, s), s).toHaveAttribute("aria-pressed", String(s === source));
    }
};

const subtitleOf = (page: Page, ct: CatalogTexts, total: number) => page.getByText(ct.drugsSubtitle(total), {exact: true});

const nameIn = (row: { nameEn: string; nameAr: string }, lang: Lang) => (lang === "ar" ? row.nameAr : row.nameEn);
const otherLang = (lang: Lang): Lang => (lang === "ar" ? "en" : "ar");

/** «الفئة › الفرعية» (or the category alone) of a drug in a language, as the UI writes it. */
const pathOf = (drug: ApiDrug, lang: Lang) => drug.subCategory
    ? SHARED_TEXTS[lang].categoryPath(nameIn(drug.category, lang), nameIn(drug.subCategory, lang))
    : nameIn(drug.category, lang);

/** Sorted like the UI (design M1.7 D5): `Intl.Collator` in the UI language, the pinned rows last. */
const sortedNames = (rows: { nameEn: string; nameAr: string; pinnedLast: boolean }[], lang: Lang) => {
    const collator = new Intl.Collator(lang);
    const names = (list: typeof rows) => list.map(r => nameIn(r, lang)).sort(collator.compare);
    return [...names(rows.filter(r => !r.pinnedLast)), ...names(rows.filter(r => r.pinnedLast))];
};

/** The labels of an open MUI select's options (it is closed again). */
const optionsOf = async (page: Page, field: Locator) => {
    await field.click();
    const labels = await page.getByRole("listbox").getByRole("option").allTextContents();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    return labels;
};

/** `GET /drug-categories` as the clinic's API answers it. */
const categories = async (data: Data, clinic: ClinicHandle) =>
    (await data.ownerApi(clinic)).ok<CategoryRow[]>("GET", "/api/v1/drug-categories");

const eyeOf = (rows: CategoryRow[]) => {
    const eye = rows.find(c => c.nameEn === "Eye");
    if (!eye) throw new Error("The catalog has no Eye category");
    return eye;
};

test.describe("The drugs page's toggle and filters @area:catalog", () => {
    test("«الكل» is selected and the subtitle «إجمالي الأدوية: N» (grouped digits) equals the list's totalCount @CAT-131 @smoke",
        async ({page, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            await createDrug(data, clinic, `Own ${unique()}`);
            const total = (await listDrugs(await data.ownerApi(clinic), {pageSize: 20})).totalCount;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await expect(toggle(page, ct).getByRole("button")).toHaveText([ct.sourceAll, ct.sourceShared, ct.sourceOwn]);
            await expectPressed(page, ct, "all");
            await expect(subtitleOf(page, ct, total)).toBeVisible();
            await expect(page.getByText(ct.displayedRows(1, 20, total), {exact: true})).toBeVisible();
            await healthy();
        });

    test("«المشتركة» lists only «مشترك» rows, «أدوية العيادة» only «خاص بالعيادة»; the count follows and the table goes to page 1 each time @CAT-132",
        async ({page, lang, data, t}) => {
            const ct = CATALOG_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            await createDrugs(data, clinic, [`Own ${unique()}`, `Own ${unique()}`]);
            const api = await data.ownerApi(clinic);
            const all = (await listDrugs(api, {pageSize: 20})).totalCount;
            const shared = (await listDrugs(api, {pageSize: 20, source: "shared"})).totalCount;
            const own = (await listDrugs(api, {pageSize: 20, source: "own"})).totalCount;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await expect(subtitleOf(page, ct, all)).toBeVisible();
            await page.getByRole("button", {name: t.nextPage}).click();
            await expect(page.getByText(ct.displayedRows(21, 40, all), {exact: true})).toBeVisible();

            await sourceButton(page, ct, "shared").click();
            await expect(subtitleOf(page, ct, shared)).toBeVisible();
            await expect(page.getByText(ct.displayedRows(1, 20, shared), {exact: true})).toBeVisible();
            await expectPressed(page, ct, "shared");
            await expect(drugRows(page)).toHaveCount(20);
            await expect(drugRows(page).filter({has: page.getByText(st.chipShared, {exact: true})})).toHaveCount(20);
            await expect(drugRows(page).filter({has: page.getByText(st.chipOwn, {exact: true})})).toHaveCount(0);

            await page.getByRole("button", {name: t.nextPage}).click();
            await expect(page.getByText(ct.displayedRows(21, 40, shared), {exact: true})).toBeVisible();
            await sourceButton(page, ct, "own").click();
            await expect(subtitleOf(page, ct, own)).toBeVisible();
            await expect(page.getByText(ct.displayedRows(1, own, own), {exact: true})).toBeVisible();
            await expect(drugRows(page)).toHaveCount(own);
            await expect(drugRows(page).filter({has: page.getByText(st.chipOwn, {exact: true})})).toHaveCount(own);
            await expect(drugRows(page).filter({has: page.getByText(st.chipShared, {exact: true})})).toHaveCount(0);
            await expect(page).toHaveURL(/[?&]source=own(&|$)/);
        });

    test("a category picked: the subcategory select lists only its subcategories (+ «بدون تصنيف فرعي»); another category resets the subcategory @CAT-133",
        async ({page, lang, data}) => {
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            const rows = await categories(data, clinic);
            const eye = eyeOf(rows);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await expect(subCategoryFilter(page, lang)).toHaveAttribute("aria-disabled", "true");

            await pick(page, categoryFilter(page, lang), nameIn(eye, lang));
            expect(await optionsOf(page, subCategoryFilter(page, lang)))
                .toEqual([st.allSubCategories, ...sortedNames(eye.subCategories, lang), st.noSubCategory]);
            const glaucoma = eye.subCategories.find(s => s.nameEn === "Glaucoma")!;
            await pick(page, subCategoryFilter(page, lang), nameIn(glaucoma, lang));
            await expect(subCategoryFilter(page, lang)).toContainText(nameIn(glaucoma, lang));

            // Another category (the first of the list after «العيون»'s): the subcategory is back to every subcategory
            const other = rows.find(c => c.id !== eye.id && c.subCategories.length > 0)!;
            await pick(page, categoryFilter(page, lang), nameIn(other, lang));
            await expect(subCategoryFilter(page, lang)).toContainText(st.allSubCategories);
            expect(await optionsOf(page, subCategoryFilter(page, lang)))
                .toEqual([st.allSubCategories, ...sortedNames(other.subCategories, lang), st.noSubCategory]);
            await expect(page).not.toHaveURL(/subCategoryId=/);
        });

    test("toggle, category, subcategory, search and page set: kept after a drug's dialog and after Protocols and Back (URL query) @CAT-134",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            await createDrugs(data, clinic, Array.from({length: 25}, (_, i) => `Keep ${u} ${String(i).padStart(2, "0")}`));
            const rows = await categories(data, clinic);
            const eye = eyeOf(rows);
            const glaucoma = eye.subCategories.find(s => s.nameEn === "Glaucoma")!;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            await sourceButton(page, ct, "own").click();
            await pick(page, categoryFilter(page, lang), nameIn(eye, lang));
            await pick(page, subCategoryFilter(page, lang), nameIn(glaucoma, lang));
            await search(page, page.getByPlaceholder(t.searchDrugs), `Keep ${u}`);
            await expect(page.getByText(ct.displayedRows(1, 20, 25), {exact: true})).toBeVisible();
            await page.getByRole("button", {name: t.nextPage}).click();
            await expect(page.getByText(ct.displayedRows(21, 25, 25), {exact: true})).toBeVisible();

            const expectKept = async (when: string) => {
                await expect(page.getByText(ct.displayedRows(21, 25, 25), {exact: true}), when).toBeVisible();
                await expectPressed(page, ct, "own");
                await expect(categoryFilter(page, lang), when).toContainText(nameIn(eye, lang));
                await expect(subCategoryFilter(page, lang), when).toContainText(nameIn(glaucoma, lang));
                await expect(page.getByPlaceholder(t.searchDrugs), when).toHaveValue(`Keep ${u}`);
                const query = new URL(page.url()).searchParams;
                expect([query.get("source"), query.get("categoryId"), query.get("subCategoryId"), query.get("search"), query.get("page")], when)
                    .toEqual(["own", String(eye.id), String(glaucoma.id), `Keep ${u}`, "2"]);
            };
            await expectKept("set");

            // A drug's dialog opened and closed
            await drugRow(page, `Keep ${u} 24`).getByRole("cell").first().click();
            const editor = dialog(page, t.editDrug);
            await expect(editor).toBeVisible();
            await editor.getByRole("button", {name: t.cancel}).click();
            await expect(editor).toHaveCount(0);
            await expectKept("after the dialog");

            // Protocols, then Back
            await navTo(page, t, t.navProtocols);
            await expect(page).toHaveURL(/\/protocols$/);
            await page.goBack();
            await settled(page);
            await expectKept("after Back");
        });

    test("«المشتركة» selected, an own drug added: after the toast the toggle shows «أدوية العيادة» and the new drug is listed @CAT-137",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await sourceButton(page, ct, "shared").click();
            await expectPressed(page, ct, "shared");
            await expect(page).toHaveURL(/source=shared/);

            const name = `Added ${unique()}`;
            await page.getByRole("button", {name: t.addDrug}).first().click();
            const form = page.getByRole("dialog");
            await form.getByRole("textbox", {name: t.drugName}).fill(name);
            await pickCategory(page, form, lang);
            await form.getByRole("button", {name: t.save}).click();
            await expectToast(page, t.drugAdded);
            await expectPressed(page, ct, "own");
            const row = drugRow(page, name);
            await expect(row).toBeVisible();
            await expect(row.getByText(st.chipOwn, {exact: true})).toBeVisible();
            await expect(page).toHaveURL(/source=own/);
            expect(new URL(page.url()).searchParams.get("page")).toBeNull();
            await healthy();
        });

    test("each row shows its category › subcategory in the UI language, never the other language's; the text runs in the UI's direction @CAT-138",
        async ({page, t, lang, data, healthy}) => {
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            const firstPage = (await listDrugs(api, {pageSize: 20})).items;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await expect(drugRows(page)).toHaveCount(20);
            for (const [i, drug] of firstPage.slice(0, 8).entries()) {
                const row = drugRows(page).nth(i);
                await expect(row).toContainText(drug.name);
                const path = row.getByText(pathOf(drug, lang), {exact: true});
                await expect(path, drug.name).toBeVisible();
                await expect(row, drug.name).not.toContainText(pathOf(drug, otherLang(lang)));
                expect(await path.evaluate(e => getComputedStyle(e).direction), `${drug.name}: direction`).toBe(lang === "ar" ? "rtl" : "ltr");
            }
            // Another category than the template's «العيون»: ALEMOX's
            const alemox = (await listDrugs(api, {search: IMPORTED.alemox1g, source: "shared"})).items.find(d => d.name === IMPORTED.alemox1g)!;
            await search(page, page.getByPlaceholder(t.searchDrugs), IMPORTED.alemox1g);
            const row = drugRow(page, IMPORTED.alemox1g);
            await expect(row.getByText(pathOf(alemox, lang), {exact: true})).toBeVisible();
            await expect(row).not.toContainText(pathOf(alemox, otherLang(lang)));
            await healthy();
        });

    test("«الكل» without a search: A's newest own drug is the first row, its other own drugs follow before any shared drug @CAT-016",
        async ({page, lang, data}) => {
            const st = SHARED_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            // Created in this order: newest first means 3, 2, 1 (names not in A→Z order on purpose)
            for (const name of [`Zulu ${u}`, `Alpha ${u}`, `Mike ${u}`]) await createDrug(data, clinic, name);
            const own = (await listDrugs(await data.ownerApi(clinic), {pageSize: 20, source: "own"})).totalCount;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            const names = drugRows(page).locator("td:first-child p:first-child");
            await expect(names.first()).toHaveText(`Mike ${u}`);
            expect((await names.allTextContents()).slice(0, 3)).toEqual([`Mike ${u}`, `Alpha ${u}`, `Zulu ${u}`]);
            for (let i = 0; i < own; i++) await expect(drugRows(page).nth(i).getByText(st.chipOwn, {exact: true}), `row ${i + 1}`).toBeVisible();
            await expect(drugRows(page).nth(own).getByText(st.chipShared, {exact: true})).toBeVisible();
        });

    test("with only drugs.list: the toggle and the filters work and no «إضافة دواء» shows @CAT-140", async ({page, t, lang, data, healthy}) => {
        const ct = CATALOG_TEXTS[lang];
        const clinic = await data.clinic();
        const staff = await data.staff(clinic, {roles: [(await data.role(clinic, ["drugs.list"])).id]});
        const api = await data.ownerApi(clinic);
        const eye = eyeOf(await categories(data, clinic));
        const own = (await listDrugs(api, {pageSize: 20, source: "own"})).totalCount;
        const ownEye = (await listDrugs(api, {pageSize: 20, source: "own", categoryId: eye.id})).totalCount;
        const sharedEye = (await listDrugs(api, {pageSize: 20, source: "shared", categoryId: eye.id})).totalCount;
        await signIn(page, staff.phone, "asIs", "/drugs");
        await expect(page.getByRole("button", {name: t.addDrug})).toHaveCount(0);

        await sourceButton(page, ct, "own").click();
        await expect(subtitleOf(page, ct, own)).toBeVisible();
        await pick(page, categoryFilter(page, lang), nameIn(eye, lang));
        await expect(subtitleOf(page, ct, ownEye)).toBeVisible();
        await sourceButton(page, ct, "shared").click();
        await expect(subtitleOf(page, ct, sharedEye)).toBeVisible();
        await expect(page.getByRole("button", {name: t.addDrug})).toHaveCount(0);
        await healthy();
    });

    test("at phone width: the toggle and filters wrap under the search, no horizontal scroll, the chips and the category path readable @CAT-141",
        async ({page, t, lang, data, isMobile, healthy}) => {
            test.skip(!isMobile, "the phone project");
            const ct = CATALOG_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            const searchBox = await page.getByPlaceholder(t.searchDrugs).boundingBox();
            for (const [what, control] of [["toggle", toggle(page, ct)], ["category", categoryFilter(page, lang)], ["subcategory", subCategoryFilter(page, lang)]] as const) {
                const box = await control.boundingBox();
                expect(box, what).not.toBeNull();
                expect(box!.y, `${what} under the search`).toBeGreaterThanOrEqual(searchBox!.y + searchBox!.height - 1);
                expect(box!.x + box!.width, `${what} inside the screen`).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
                expect(box!.x, `${what} inside the screen`).toBeGreaterThanOrEqual(-1);
            }
            await noHorizontalScroll(page, "drugs page");
            await expectNotCut(page.getByText(st.chipShared, {exact: true}), "«مشترك» chips");
            await expectNotCut(page.getByText(st.chipOwn, {exact: true}), "«خاص بالعيادة» chips");
            await expectNotCut(toggle(page, ct).getByRole("button"), "toggle buttons");
            // Below `sm` the category column is hidden: the path shows under the name
            await expect(page.getByRole("columnheader", {name: st.category, exact: true})).toBeHidden();
            const first = (await listDrugs(await data.ownerApi(clinic), {pageSize: 20})).items[0];
            await expect(drugRows(page).first().getByText(pathOf(first, lang), {exact: true})).toBeVisible();
            for (const source of ["shared", "own"] as const) {
                await sourceButton(page, ct, source).click();
                await expectPressed(page, ct, source);
                await settled(page);
                await noHorizontalScroll(page, `drugs page on ${source}`);
            }
            await healthy();
        });
});
