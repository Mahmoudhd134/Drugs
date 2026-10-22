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

/**
 * Types in the admin drugs search and waits for its answer. Clearing it (`""`) waits for nothing: the unfiltered list
 * may come from the query cache without a request, so the caller waits for the screen (e.g. the API's total).
 */
export const searchAdmin = async (page: Page, lang: Lang, term: string) => {
    const field = page.getByPlaceholder(SHARED_TEXTS[lang].adminSearch);
    if (!term.trim()) {
        await field.fill(term);
        return;
    }
    const answered = page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/admin/drugs"
        && new URL(r.url()).searchParams.get("search") === term.trim());
    await field.fill(term);
    await answered;
};

/**
 * The row of a category or subcategory on the categories page (whatever the markup): the innermost element around its
 * name that also shows its count «الأدوية: …» and holds its buttons (the name+count box alone has none).
 */
export const categoryRow = (page: Page, name: string, lang: Lang) =>
    page.locator("li, tr, [role=row], [role=listitem], .MuiCard-root, .MuiAccordion-root, .MuiAccordionSummary-root, .MuiStack-root, div")
        .filter({has: page.getByText(name, {exact: true})})
        .filter({hasText: lang === "ar" ? "الأدوية:" : "Drugs:"})
        .filter({has: page.getByRole("button")})
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
    const listData = await shownData();
    await check("shared drugs list", listData);
    await page.getByRole("button", {name: st.adminAdd}).click();
    await expect(page.getByRole("dialog", {name: st.adminNew})).toBeVisible();
    // The list stays behind the dialog: its rows are data too
    await check("new shared drug dialog", listData);
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await searchAdmin(page, lang, IMPORTED.vigamox);
    const row = adminDrugRow(page, IMPORTED.vigamox);
    await row.getByRole("button", {name: st.editRow(IMPORTED.vigamox)}).click();
    const edit = page.getByRole("dialog", {name: st.adminEdit});
    await expect(edit).toBeVisible();
    const searchedData = await shownData();
    const editData = [...searchedData, IMPORTED.vigamox, await edit.getByRole("textbox", {name: st.activeIngredients}).inputValue()];
    await check("edit shared drug dialog", editData);
    await edit.getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await row.getByRole("button", {name: st.withdrawRow(IMPORTED.vigamox)}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await check("disable confirmation", [...searchedData, IMPORTED.vigamox]);
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/admin/categories");
    await expect(page.getByText(lang === "ar" ? "العيون" : "Eye", {exact: true}).first()).toBeVisible();
    // The category and subcategory names are catalog data (some Arabic names hold Latin acronyms: DPP-4, SGLT2, COX-2):
    // each row's name is the line just above its count «الأدوية: …»
    const lines = (await page.locator("main").innerText()).split("\n").map(l => l.trim()).filter(Boolean);
    const categoryNames = lines.filter((_, i) => /^(الأدوية|Drugs): /.test(lines[i + 1] ?? ""));
    expect(categoryNames.length, "the category names are read").toBeGreaterThan(0);
    await check("categories", categoryNames);
    await page.getByRole("button", {name: st.addCategory, exact: true}).click();
    await expect(page.getByRole("dialog", {name: st.newCategory})).toBeVisible();
    await check("new category dialog", categoryNames);
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const eye = categoryRow(page, lang === "ar" ? "العيون" : "Eye", lang);
    await eye.getByRole("button", {name: st.renameRow(lang === "ar" ? "العيون" : "Eye")}).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await check("rename category dialog", categoryNames);
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await eye.getByRole("button", {name: st.addSubCategory}).first().click();
    await expect(page.getByRole("dialog", {name: st.newSubCategory})).toBeVisible();
    await check("new subcategory dialog", categoryNames);
    await page.getByRole("dialog").getByRole("button", {name: t.cancel}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
};
