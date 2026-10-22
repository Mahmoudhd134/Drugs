import type {Locator, Page} from "@playwright/test";
import {expect, settled, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {READ_ONLY} from "../support/data.ts";
import {unique, uniqueDigits} from "../support/phones.ts";
import {createProtocol, dialog as namedDialog, drugRow, protocolCard, search} from "../support/catalog.ts";
import {category, ownDrugIn, sharedDrug, withdrawSharedDrug} from "../support/shared.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";
import {TEXTS} from "../support/texts.ts";
import {adminDrugRow, categoryRow, searchAdmin} from "../support/admin-catalog.ts";
import {expectNotCut, noHorizontalScroll} from "../support/ux.ts";
import {TREE_TEXTS} from "../support/texts-rx.ts";
import {DrugTreeUi} from "../support/tree.ts";

/**
 * Long texts on the catalog screens (design M1.7 D9 "Long names wrap, never cut", UX-009's rule): a 256-character
 * unbroken drug name, a 100-character unbroken category name (UX-046) and 126-character unbroken active ingredients
 * (CAT-002) wrap inside their box at 1280 and 375 px, with no horizontal page scroll; a text cut on one line has its
 * tooltip. These specs create a category and shared drugs of their own (unique names, design D12): this project runs
 * last. Arabic UI (this project).
 */

const t = TEXTS.ar;
const ct = CATALOG_TEXTS.ar;
const st = SHARED_TEXTS.ar;

const WIDTHS = [1280, 375] as const;

/** The drug tree of the page's main area (the prescription's «الأدوية» tab; support/tree.ts). */
const treeOf = (page: Page) => new DrugTreeUi(page, page.locator("main"), TREE_TEXTS.ar);

/** At `width`, the page as it is now: no horizontal scroll, and each of `texts` inside `scope` shown whole. */
const wraps = async (page: Page, scope: Locator, texts: string[], what: string) => {
    await noHorizontalScroll(page, what);
    for (const text of texts) await expectNotCut(scope.getByText(text, {exact: true}).filter({visible: true}), `${what}: ${text.slice(0, 20)}…`);
};

const atWidth = async (page: Page, width: number) => {
    await page.setViewportSize({width, height: width === 375 ? 812 : 900});
};

test.describe("Long names wrap, never cut @area:ux", () => {
    test("a 256-character drug name and a 100-character category name wrap in the tree row (with its chips), the drugs table, the read-only details, a protocol card with «معطّل من الإدارة: N», the admin lists and dialogs and the delete confirmations, at 1280 and 375 px @UX-046",
        async ({page, data, admin, newBrowser}) => {
            test.slow();
            const u = uniqueDigits();
            const longCategory = await category(admin, {nameEn: `C${u}`.padEnd(100, "W"), nameAr: `ت${u}`.padEnd(100, "ب")});
            const emptyCategory = await category(admin, {nameEn: `E${u}`.padEnd(100, "W"), nameAr: `ف${u}`.padEnd(100, "ب")});
            const clinic = await data.clinic();
            const own = await ownDrugIn(data, clinic, {name: `O${u}`.padEnd(256, "W"), categoryId: longCategory.id, subCategoryId: null});
            const shared = await sharedDrug(admin, {name: `S${u}`.padEnd(256, "W"), categoryId: longCategory.id, subCategoryId: null});
            const withdrawn = await sharedDrug(admin, {name: `E2E DISABLED ${unique()} 5 ML`});
            const protocol = await createProtocol(data, clinic, `P${u}`.padEnd(256, "W"), [{drug: own}, {drug: withdrawn}]);
            await withdrawSharedDrug(admin, withdrawn);
            const viewer = await data.staff(clinic, {roles: [(await data.role(clinic, READ_ONLY)).id]});

            // The clinic's owner: drugs table, delete confirmation, tree, protocol card
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            for (const width of WIDTHS) {
                await test.step(`${width} px`, async () => {
                    await atWidth(page, width);
                    await page.goto(`/drugs?search=${encodeURIComponent(`O${u}`)}`);
                    await settled(page);
                    const row = drugRow(page, own.name);
                    await expect(row).toBeVisible();
                    await wraps(page, row, [own.name, longCategory.nameAr], `${width} drugs table`);
                    await expectNotCut(row.getByText(st.chipOwn, {exact: true}), `${width} drugs table chip`);

                    await row.getByRole("button", {name: t.delete}).click();
                    const confirm = namedDialog(page, ct.drugDeleteTitle);
                    await expect(confirm).toBeVisible();
                    await noHorizontalScroll(page, `${width} delete confirmation`);
                    await expectNotCut(confirm.getByText(ct.drugDeleteMessage(own.name), {exact: true}), `${width} delete confirmation`);
                    await confirm.getByRole("button", {name: t.cancel}).click();
                    await expect(confirm).toHaveCount(0);

                    await page.goto("/");
                    await settled(page);
                    await page.getByRole("tab", {name: t.rxTabDrugs}).click();
                    const item = await treeOf(page).show(own.name);
                    await wraps(page, treeOf(page).tree, [own.name, longCategory.nameAr], `${width} tree`);
                    await expectNotCut(item.getByText(st.chipOwn, {exact: true}), `${width} tree row chip`);

                    await page.goto("/protocols");
                    await settled(page);
                    const card = protocolCard(page, protocol.name);
                    await expect(card).toBeVisible();
                    await wraps(page, card, [protocol.name, own.name, st.withdrawnCount(1)], `${width} protocol card`);
                });
            }

            // A viewer: the shared drug's read-only details
            const other = await newBrowser();
            await signIn(other.page, viewer.phone, "asIs", "/drugs");
            for (const width of WIDTHS) {
                await test.step(`${width} px details`, async () => {
                    await atWidth(other.page, width);
                    await other.page.goto(`/drugs?search=${encodeURIComponent(`S${u}`)}`);
                    await settled(other.page);
                    await drugRow(other.page, shared.name).getByRole("cell").first().click();
                    const details = namedDialog(other.page, t.drugDetails);
                    await expect(details).toBeVisible();
                    await wraps(other.page, details, [shared.name, st.categoryLine(longCategory.nameAr)], `${width} read-only details`);
                    await details.getByRole("button", {name: t.close}).click();
                    await expect(details).toHaveCount(0);
                });
            }

            // The super admin: the drugs table, its dialog, the categories page, a rename dialog, a delete confirmation
            const sa = await newBrowser();
            await signInSuperAdmin(sa.page, "/admin/drugs");
            for (const width of WIDTHS) {
                await test.step(`${width} px admin`, async () => {
                    await atWidth(sa.page, width);
                    await sa.page.goto("/admin/drugs");
                    await settled(sa.page);
                    await searchAdmin(sa.page, "ar", `S${u}`);
                    const row = adminDrugRow(sa.page, shared.name);
                    await wraps(sa.page, row, [shared.name, longCategory.nameAr], `${width} admin drugs table`);
                    await row.getByRole("button", {name: /^تعديل/}).click();
                    const form = sa.page.getByRole("dialog", {name: st.adminEdit});
                    await expect(form).toBeVisible();
                    await noHorizontalScroll(sa.page, `${width} admin drug dialog`);
                    await expectNotCut(form.getByRole("combobox").filter({hasText: longCategory.nameAr}), `${width} admin drug dialog category`);
                    await form.getByRole("button", {name: t.cancel}).click();
                    await expect(form).toHaveCount(0);

                    await sa.page.goto("/admin/categories");
                    await settled(sa.page);
                    const longRow = categoryRow(sa.page, longCategory.nameAr, "ar");
                    await wraps(sa.page, longRow, [longCategory.nameAr], `${width} admin categories`);
                    await categoryRow(sa.page, emptyCategory.nameAr, "ar").getByRole("button", {name: st.deleteCategory}).first().click();
                    const confirm = namedDialog(sa.page, st.deleteCategoryTitle(emptyCategory.nameAr));
                    await expect(confirm).toBeVisible();
                    await noHorizontalScroll(sa.page, `${width} delete category confirmation`);
                    await expectNotCut(confirm.getByRole("heading"), `${width} delete category confirmation title`);
                    await confirm.getByRole("button", {name: t.cancel}).click();
                    await expect(confirm).toHaveCount(0);
                    await longRow.getByRole("button", {name: st.renameCategory}).first().click();
                    const rename = sa.page.getByRole("dialog").filter({visible: true});
                    await expect(rename).toBeVisible();
                    await noHorizontalScroll(sa.page, `${width} rename category dialog`);
                    await rename.getByRole("button", {name: t.cancel}).click();
                    await expect(rename).toHaveCount(0);
                });
            }
        });
});

test.describe("Long active ingredients @area:catalog", () => {
    test("126-character unbroken ingredients at 375 px wrap in the read-only details, a tree row and the admin drugs table; at 1280 px the tree row's one line has the full text in its tooltip @CAT-002",
        async ({page, data, admin, newBrowser}) => {
            const u = uniqueDigits();
            const ingredients = `I${u}`.padEnd(126, "X");
            const shared = await sharedDrug(admin, {name: `E2E INGREDIENTS ${u} 5 ML`, activeIngredients: ingredients});
            const clinic = await data.clinic();
            const viewer = await data.staff(clinic, {roles: [(await data.role(clinic, [...READ_ONLY, "prescriptions.create"])).id]});
            await signIn(page, viewer.phone, "asIs", "/drugs");

            await atWidth(page, 375);
            await search(page, page.getByPlaceholder(t.searchDrugs), shared.name);
            await drugRow(page, shared.name).getByRole("cell").first().click();
            const details = namedDialog(page, t.drugDetails);
            await expect(details).toBeVisible();
            await wraps(page, details, [ingredients], "375 read-only details");
            await details.getByRole("button", {name: t.close}).click();
            await expect(details).toHaveCount(0);

            await page.goto("/");
            await settled(page);
            await page.getByRole("tab", {name: t.rxTabDrugs}).click();
            const item = await treeOf(page).show(shared.name);
            await wraps(page, item, [ingredients], "375 tree row");

            // At 1280 px the ingredients keep one line: cut with "…", the whole text in the row's tooltip
            await atWidth(page, 1280);
            const line = item.getByText(ingredients, {exact: true});
            await expect(line).toBeVisible();
            await line.hover();
            await expect(page.getByRole("tooltip")).toHaveText(ingredients);
            await page.mouse.move(1, 1);

            const sa = await newBrowser();
            await signInSuperAdmin(sa.page, "/admin/drugs");
            await atWidth(sa.page, 375);
            await searchAdmin(sa.page, "ar", shared.name);
            const row = adminDrugRow(sa.page, shared.name);
            await expect(row).toBeVisible();
            await wraps(sa.page, row, [ingredients], "375 admin drugs table");
        });
});
