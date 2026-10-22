import {expect, type Locator, type Page} from "@playwright/test";
import {IMPORTED} from "./shared.ts";
import type {Lang, Texts} from "./texts.ts";
import {SHARED_TEXTS} from "./texts-shared.ts";

/**
 * The super admin's shared catalog screens (design M1.7 D9; M1.7b contract "Admin drugs page", "Admin categories page"):
 * locators and a tour of their pages and dialogs that changes nothing (every dialog is cancelled).
 */

/** A select of the admin drugs page's filters (or of a dialog) by the start of its accessible name. */
export const select = (scope: Page | Locator, start: RegExp) => scope.getByRole("combobox", {name: start});

export const statusSelect = (scope: Page | Locator, lang: Lang) => select(scope, new RegExp(`^${SHARED_TEXTS[lang].statusLabel}`));
export const categoryFilter = (scope: Page | Locator, lang: Lang) => select(scope, lang === "ar" ? /^التصنيف(?! الفرعي)/ : /^Category/);
export const subCategoryFilter = (scope: Page | Locator, lang: Lang) => select(scope, lang === "ar" ? /^التصنيف الفرعي/ : /^Subcategory/);

/** Opens `field` (an MUI select) and picks the option `label`. */
export const pick = async (page: Page, field: Locator, label: string) => {
    await field.click();
    await page.getByRole("option", {name: label, exact: true}).click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
};

/** The row of the admin drugs table showing this drug. */
export const adminDrugRow = (page: Page, name: string) => page.locator("tbody tr").filter({has: page.getByText(name, {exact: true})});

/** Types in the admin drugs search and waits for its answer. */
export const searchAdmin = async (page: Page, lang: Lang, term: string) => {
    const answered = page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/admin/drugs"
        && new URL(r.url()).searchParams.get("search") === term.trim());
    await page.getByPlaceholder(SHARED_TEXTS[lang].adminSearch).fill(term);
    await answered;
};

/**
 * The element of a category or subcategory on the categories page: the nearest one around its name that also shows its
 * count «الأدوية: …» (whatever the markup).
 */
export const categoryRow = (page: Page, name: string, lang: Lang) =>
    page.locator("li, tr, [role=row], [role=listitem], .MuiCard-root, .MuiAccordion-root, .MuiAccordionSummary-root, .MuiStack-root, div")
        .filter({has: page.getByText(name, {exact: true})})
        .filter({hasText: lang === "ar" ? "الأدوية:" : "Drugs:"})
        .last();

/**
 * Each page and dialog of the shared catalog screens, in turn; `check(what, data)` runs on each, `data` the catalog
 * texts shown there (drug names, ingredients) that are data, not UI strings. Nothing is saved.
 */
export const visitCatalogAdmin = async (page: Page, t: Texts, lang: Lang, check: (what: string, data: string[]) => Promise<void>) => {
    const st = SHARED_TEXTS[lang];
    await page.goto("/admin/drugs");
    await expect(page.locator("tbody tr").first()).toBeVisible();
    const shownData = async () => (await page.locator("tbody").innerText()).split(/\n|\t/).map(s => s.trim()).filter(Boolean);
    await check("shared drugs list", await shownData());
    await page.getByRole("button", {name: st.adminAdd}).click();
    await expect(page.getByRole("dialog", {name: st.adminNew})).toBeVisible();
    await check("new shared drug dialog", []);
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await searchAdmin(page, lang, IMPORTED.vigamox);
    const row = adminDrugRow(page, IMPORTED.vigamox);
    await row.getByRole("button", {name: /^(تعديل|Edit)/}).click();
    const edit = page.getByRole("dialog", {name: st.adminEdit});
    await expect(edit).toBeVisible();
    const editData = [IMPORTED.vigamox, await edit.getByRole("textbox", {name: st.activeIngredients}).inputValue()];
    await check("edit shared drug dialog", editData);
    await edit.getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await row.getByRole("button", {name: st.withdraw}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await check("disable confirmation", [IMPORTED.vigamox]);
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/admin/categories");
    await expect(page.getByText(lang === "ar" ? "العيون" : "Eye", {exact: true}).first()).toBeVisible();
    await check("categories", []);
    await page.getByRole("button", {name: st.addCategory}).click();
    await expect(page.getByRole("dialog", {name: st.newCategory})).toBeVisible();
    await check("new category dialog", []);
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const eye = categoryRow(page, lang === "ar" ? "العيون" : "Eye", lang);
    await eye.getByRole("button", {name: st.renameCategory}).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await check("rename category dialog", []);
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await eye.getByRole("button", {name: st.addSubCategory}).first().click();
    await expect(page.getByRole("dialog", {name: st.newSubCategory})).toBeVisible();
    await check("new subcategory dialog", []);
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
};
