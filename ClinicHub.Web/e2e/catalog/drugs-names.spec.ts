import type {Page} from "@playwright/test";
import {expect, settled, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import type {Lang} from "../support/texts.ts";
import {createProtocol, dialog, drugRow, search} from "../support/catalog.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import {type ApiDrug, type CategoryRow, IMPORTED, sharedByName} from "../support/shared.ts";
import {adminDrugRow, categoryFilter, pick, searchAdmin, subCategoryFilter} from "../support/admin-catalog.ts";
import {markClipboard, readClipboard} from "../support/rx.ts";
import {TREE_TEXTS} from "../support/texts-rx.ts";
import {DrugTreeUi, type TreeAnswer} from "../support/tree.ts";
import {expectToast} from "../support/ui.ts";

/**
 * Names on the catalog screens (design M1.7 D3, D5, D9): category and subcategory names in the UI language everywhere
 * (I18N-024), a drug's name exactly as stored and never its hidden Arabic name (CAT-113). The tree's row names are the
 * contract's accessible names (M1.7c contract § 3.3, C8); its counts come from the API's answer of the same run.
 */

const nameIn = (row: { nameEn: string; nameAr: string }, lang: Lang) => (lang === "ar" ? row.nameAr : row.nameEn);
const pathOf = (drug: ApiDrug, lang: Lang) => drug.subCategory
    ? SHARED_TEXTS[lang].categoryPath(nameIn(drug.category, lang), nameIn(drug.subCategory, lang))
    : nameIn(drug.category, lang);
const sortedNames = (rows: { nameEn: string; nameAr: string; pinnedLast: boolean }[], lang: Lang) => {
    const collator = new Intl.Collator(lang);
    const names = (list: typeof rows) => list.map(r => nameIn(r, lang)).sort(collator.compare);
    return [...names(rows.filter(r => !r.pinnedLast)), ...names(rows.filter(r => r.pinnedLast))];
};
const optionLabels = async (page: Page, field: ReturnType<Page["getByRole"]>) => {
    await field.click();
    const labels = await page.getByRole("listbox").getByRole("option").allTextContents();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    return labels;
};

/** The drug tree of the page's main area (the prescription's «الأدوية» tab; support/tree.ts). */
const treeOf = (page: Page, lang: Lang) => new DrugTreeUi(page, page.locator("main"), TREE_TEXTS[lang]);

/** «أليموكس»: ALEMOX's hidden Arabic name (the case's), which no screen may show. */
const ALEMOX_AR = "أليموكس";

test.describe("Category names in the UI language @area:i18n", () => {
    test("Arabic UI: category and subcategory names are Arabic in the filters, the table, the details, the drug dialog, the tree and the admin; drug names as stored @I18N-024 @smoke",
        async ({page, t, lang, data, newBrowser}) => {
            test.skip(lang !== "ar", "the Arabic UI");
            const st = SHARED_TEXTS.ar;
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            const categories = await api.ok<CategoryRow[]>("GET", "/api/v1/drug-categories");
            const alemox = await sharedByName(api, IMPORTED.alemox1g);
            const alemoxCategory = categories.find(c => c.id === alemox.category.id)!;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            // The filters
            expect(await optionLabels(page, categoryFilter(page, "ar"))).toEqual([st.allCategories, ...sortedNames(categories, "ar")]);
            await pick(page, categoryFilter(page, "ar"), alemoxCategory.nameAr);
            expect(await optionLabels(page, subCategoryFilter(page, "ar")))
                .toEqual([st.allSubCategories, ...sortedNames(alemoxCategory.subCategories, "ar"), st.noSubCategory]);

            // The table: the name as stored, the path in Arabic
            await search(page, page.getByPlaceholder(t.searchDrugs), IMPORTED.alemox1g);
            const row = drugRow(page, IMPORTED.alemox1g);
            await expect(row.getByText(IMPORTED.alemox1g, {exact: true})).toBeVisible();
            await expect(row.getByText(pathOf(alemox, "ar"), {exact: true}).filter({visible: true})).toBeVisible();

            // The read-only details
            await row.getByRole("cell").first().click();
            const details = dialog(page, t.drugDetails);
            await expect(details.getByText(st.categoryLine(pathOf(alemox, "ar")), {exact: true})).toBeVisible();
            await details.getByRole("button", {name: t.close}).click();
            await expect(details).toHaveCount(0);

            // The own-drug dialog
            await page.getByRole("button", {name: t.addDrug}).first().click();
            const form = page.getByRole("dialog");
            expect(await optionLabels(page, categoryFilter(form, "ar"))).toEqual(sortedNames(categories, "ar"));
            await form.getByRole("button", {name: t.cancel}).click();
            await expect(form).toHaveCount(0);

            // The tree (the prescription's «الأدوية» tab): each category row named in Arabic with its count
            await page.goto("/");
            await settled(page);
            await page.getByRole("tab", {name: t.rxTabDrugs}).click();
            const answer = await api.ok<TreeAnswer>("GET", `/api/v1/drugs/tree?search=${encodeURIComponent("ALEMOX")}`);
            const drugTree = treeOf(page, "ar");
            await drugTree.search("ALEMOX");
            expect(answer.categories.length, "ALEMOX matches drugs").toBeGreaterThan(0);
            for (const category of answer.categories) {
                await expect(drugTree.rows(1).and(page.getByRole("treeitem", {name: TREE_TEXTS.ar.node(category.nameAr, category.count), exact: true})),
                    category.nameEn).toBeVisible();
            }

            // The admin: the drugs table and the categories page
            const admin = await newBrowser();
            await signInSuperAdmin(admin.page, "/admin/drugs");
            await searchAdmin(admin.page, "ar", IMPORTED.alemox1g);
            await expect(adminDrugRow(admin.page, IMPORTED.alemox1g).getByText(pathOf(alemox, "ar"), {exact: true}).filter({visible: true})).toBeVisible();
            await admin.page.goto("/admin/categories");
            await settled(admin.page);
            for (const category of categories) {
                await expect(admin.page.getByText(category.nameAr, {exact: true}).first(), category.nameEn).toBeVisible();
                await expect(admin.page.getByText(category.nameEn, {exact: true}), category.nameEn).toHaveCount(0);
            }
        });
});

test.describe("A shared drug's name @area:catalog", () => {
    test.beforeEach(async ({context}) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("ALEMOX in the drugs list, the details, the tree, a protocol line, a prescription line and its copy, the admin list and dialog: only its name, never «أليموكس» @CAT-113",
        async ({page, t, lang, data, newBrowser}) => {
            const rt = RX_TEXTS[lang];
            const name = IMPORTED.alemox1g;
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            const alemox = await sharedByName(api, name);
            const protocol = await createProtocol(data, clinic, `Protocol ${unique()}`, [{drug: {id: alemox.id}}]);
            const noArabicName = async (where: string, scope: Page = page) =>
                expect(scope.getByText(ALEMOX_AR), `${where}: no «${ALEMOX_AR}»`).toHaveCount(0);

            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await search(page, page.getByPlaceholder(t.searchDrugs), "ALEMOX 1 GM");
            await expect(drugRow(page, name).getByText(name, {exact: true})).toBeVisible();
            await noArabicName("drugs list");
            await drugRow(page, name).getByRole("cell").first().click();
            const details = dialog(page, t.drugDetails);
            await expect(details.getByText(name, {exact: true})).toBeVisible();
            await noArabicName("details");
            await details.getByRole("button", {name: t.close}).click();

            await page.goto(`/protocols/${protocol.id}`);
            await settled(page);
            await expect(page.getByText(name, {exact: true}).first()).toBeVisible();
            await noArabicName("protocol line");

            await page.goto("/");
            await settled(page);
            await page.getByRole("tab", {name: t.rxTabDrugs}).click();
            // Searched by its Arabic name: found, but shown by its name only
            const drugTree = treeOf(page, lang);
            const answer = await drugTree.search(ALEMOX_AR);
            const subs = answer?.categories.flatMap(c => c.subCategories) ?? [];
            // One subcategory opens by itself (design M1.7 D7), else its category and subcategory are opened
            if (subs.length !== 1) {
                await drugTree.openPath(nameIn(alemox.category, lang),
                    alemox.subCategory ? nameIn(alemox.subCategory, lang) : TREE_TEXTS[lang].noSubCategory);
            }
            await expect(drugTree.drug(name)).toBeVisible();
            await noArabicName("tree (the search box holds the typed term, not a shown name)");
            await drugTree.select(name);
            await expect(page.getByText(name, {exact: true}).filter({visible: true}).first()).toBeVisible();
            await noArabicName("prescription");
            await markClipboard(page);
            await page.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await expectToast(page, rt.copied);
            const copied = await readClipboard(page);
            expect(copied.text).toContain(name);
            expect(copied.text).not.toContain(ALEMOX_AR);
            expect(copied.html ?? "").not.toContain(ALEMOX_AR);

            const admin = await newBrowser();
            await signInSuperAdmin(admin.page, "/admin/drugs");
            await searchAdmin(admin.page, lang, "ALEMOX 1 GM");
            const adminRow = adminDrugRow(admin.page, name);
            await expect(adminRow).toBeVisible();
            await noArabicName("admin list", admin.page);
            await adminRow.getByRole("button", {name: /^(تعديل|Edit)/}).click();
            const editor = admin.page.getByRole("dialog", {name: SHARED_TEXTS[lang].adminEdit});
            await expect(editor.getByRole("textbox", {name: t.drugName})).toHaveValue(name);
            await noArabicName("admin dialog", admin.page);
            for (const field of await editor.locator("input[type=text], textarea").all()) {
                expect(await field.inputValue(), "no field holds the Arabic name").not.toContain(ALEMOX_AR);
            }
            await editor.getByRole("button", {name: t.cancel}).click();
        });
});
