import type {Locator, Page} from "@playwright/test";
import {expect, settled, signInSuperAdmin, test} from "../support/fixtures.ts";
import type {ApiSession} from "../support/api.ts";
import {
    adminDrugRow,
    categoryFilter,
    categoryRow,
    pick,
    searchAdmin,
    statusSelect,
    subCategoryFilter,
} from "../support/admin-catalog.ts";
import {adminCategories, type AdminDrug, grouped, IMPORTED, type Paged} from "../support/shared.ts";
import type {Lang} from "../support/texts.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";

/**
 * The super admin's shared catalog screens, read only (design M1.7 D9; M1.7b contract "Admin drugs page", "Admin
 * categories page"): nothing is saved here (the writes are in `e2e/shared-catalog-edits/`). Counts of the imported
 * catalog are compared with the API's answer for the same query in the same run, never literals (D12, CAT-229).
 */

const adminList = (admin: ApiSession, query: Record<string, string | number>) =>
    admin.ok<Paged<AdminDrug>>("GET", `/api/v1/admin/drugs?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`);

/** The page shows `total` as its subtitle and in the pagination («1–n من total», grouped). */
const expectTotal = async (page: Page, lang: Lang, total: number) => {
    const st = SHARED_TEXTS[lang];
    await expect(page.getByText(st.adminDrugsSubtitle(total), {exact: true})).toBeVisible();
    const of = lang === "ar" ? "من" : "of";
    await expect(page.getByText(new RegExp(`^\\d[\\d,]*–\\d[\\d,]*\\s${of}\\s${grouped(total).replace(/,/g, ",")}$`)).first()).toBeVisible();
};

/** Waits for the admin list's next answer after `act`. */
const listAnswer = async (page: Page, act: () => Promise<void>) => {
    const answered = page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/admin/drugs" && r.request().method() === "GET");
    await act();
    await answered;
    await settled(page);
};

const directionOf = (field: Locator) => field.evaluate(e => getComputedStyle(e).direction);

test.describe("Platform admin: the shared drugs list @area:admin", () => {
    test("search, category and subcategory filters, status «مفعّل» (default) / «معطّل» / «الكل», paging; the count matches the list @CAT-204",
        async ({page, lang, admin, healthy}) => {
            test.slow();
            const st = SHARED_TEXTS[lang];
            const categories = await adminCategories(admin);
            const eye = categories.find(c => c.nameEn === "Eye")!;
            const glaucoma = eye.subCategories.find(s => s.nameEn === "Glaucoma")!;
            const name = (c: { nameEn: string; nameAr: string }) => lang === "ar" ? c.nameAr : c.nameEn;
            await signInSuperAdmin(page, "/admin/drugs");
            await expect(page.getByRole("heading", {name: st.adminDrugsTitle})).toBeVisible();

            // Default: «مفعّل»
            await expect(statusSelect(page, lang)).toContainText(st.statusActive);
            const active = await adminList(admin, {});
            await expectTotal(page, lang, active.totalCount);
            await expect(page.locator("tbody tr")).toHaveCount(Math.min(active.pageSize, active.totalCount));
            await healthy();

            // Paging: the next page shows the API's second page
            const second = await adminList(admin, {page: 2, pageSize: active.pageSize});
            await listAnswer(page, () => page.getByRole("button", {name: lang === "ar" ? "الذهاب إلى الصفحة التالية" : "Go to next page"}).click());
            await expect(adminDrugRow(page, second.items[0].name).first()).toBeVisible();
            await expect(page.getByText(new RegExp(`^${active.pageSize + 1}–`)).first()).toBeVisible();

            // Search
            await searchAdmin(page, lang, "ALEMOX");
            await settled(page);
            const searched = await adminList(admin, {search: "ALEMOX"});
            await expectTotal(page, lang, searched.totalCount);
            await expect(adminDrugRow(page, IMPORTED.alemox1g)).toBeVisible();
            // Cleared: the unfiltered list again (page 1 may come from the cache, without a request)
            await searchAdmin(page, lang, "");
            await expectTotal(page, lang, active.totalCount);
            await settled(page);

            // Category, then subcategory
            await listAnswer(page, () => pick(page, categoryFilter(page, lang), name(eye)));
            await expectTotal(page, lang, (await adminList(admin, {categoryId: eye.id})).totalCount);
            await listAnswer(page, () => pick(page, subCategoryFilter(page, lang), name(glaucoma)));
            const inGlaucoma = await adminList(admin, {categoryId: eye.id, subCategoryId: glaucoma.id});
            await expectTotal(page, lang, inGlaucoma.totalCount);
            await expect(adminDrugRow(page, inGlaucoma.items[0].name).first()).toBeVisible();
            // The filters are in the URL: a reload keeps them
            await page.reload();
            await settled(page);
            await expectTotal(page, lang, inGlaucoma.totalCount);

            // Status «الكل», then «معطّل»
            await listAnswer(page, () => pick(page, statusSelect(page, lang), st.statusAll));
            await expectTotal(page, lang, (await adminList(admin, {categoryId: eye.id, subCategoryId: glaucoma.id, status: "all"})).totalCount);
            await listAnswer(page, () => pick(page, statusSelect(page, lang), st.statusWithdrawn));
            const withdrawn = await adminList(admin, {categoryId: eye.id, subCategoryId: glaucoma.id, status: "withdrawn"});
            if (withdrawn.totalCount === 0) await expect(page.getByText(st.noWithdrawn, {exact: true})).toBeVisible();
            else await expectTotal(page, lang, withdrawn.totalCount);
            await healthy();
        });

    test("the shared drug dialog has the clinic dialog's fields without «الجرعة الافتراضية» @CAT-205", async ({page, t, lang, healthy}) => {
        const st = SHARED_TEXTS[lang];
        await signInSuperAdmin(page, "/admin/drugs");
        await page.getByRole("button", {name: st.adminAdd}).click();
        const form = page.getByRole("dialog", {name: st.adminNew});
        await expect(form).toBeVisible();
        await expect(form.getByRole("textbox", {name: t.drugName})).toBeVisible();
        await expect(form.getByRole("textbox", {name: st.activeIngredients})).toBeVisible();
        await expect(categoryFilter(form, lang)).toBeVisible();
        await expect(subCategoryFilter(form, lang)).toBeVisible();
        await expect(form.getByRole("textbox", {name: lang === "ar" ? "الوصف" : "Description"})).toBeVisible();
        // No dosing and no Arabic name
        await expect(form.getByText(st.defaultDosing)).toHaveCount(0);
        await expect(form.getByRole("spinbutton")).toHaveCount(0);
        await expect(form.getByRole("textbox", {name: /عربي|Arabic/})).toHaveCount(0);
        await healthy();
        await form.getByRole("button", {name: t.cancel}).click();
        await expect(form).toHaveCount(0);

        // Editing an imported drug: the same fields, filled; cancelled
        await searchAdmin(page, lang, IMPORTED.vigamox);
        await adminDrugRow(page, IMPORTED.vigamox).getByRole("button", {name: /^(تعديل|Edit)/}).click();
        const edit = page.getByRole("dialog", {name: st.adminEdit});
        await expect(edit.getByRole("textbox", {name: t.drugName})).toHaveValue(IMPORTED.vigamox);
        await expect(edit.getByRole("textbox", {name: st.activeIngredients})).toHaveValue("MOXIFLOXACIN");
        await expect(edit.getByRole("spinbutton")).toHaveCount(0);
        await edit.getByRole("button", {name: t.cancel}).click();
        await expect(edit).toHaveCount(0);
    });
});

test.describe("Platform admin: the categories page @area:admin", () => {
    test("each category with its subcategories and drug counts in the UI language; add and rename ask both names (Arabic RTL, English LTR) @CAT-210",
        async ({page, t, lang, admin, healthy}) => {
            const st = SHARED_TEXTS[lang];
            const name = (c: { nameEn: string; nameAr: string }) => lang === "ar" ? c.nameAr : c.nameEn;
            await signInSuperAdmin(page, "/admin/categories");
            await expect(page.getByRole("heading", {name: st.categoriesTitle})).toBeVisible();
            // A category no other test adds drugs to (own test drugs go to «العيون › المياه الزرقاء»)
            const oncology = (await adminCategories(admin)).find(c => c.nameAr === "الأورام")!;
            expect(oncology, "the imported «الأورام»").toBeTruthy();
            const row = categoryRow(page, name(oncology), lang);
            await expect(row.getByText(st.drugCount(oncology.drugCount), {exact: true}).first()).toBeVisible();
            for (const sub of oncology.subCategories) {
                await expect(categoryRow(page, name(sub), lang).getByText(st.drugCount(sub.drugCount), {exact: true}).first(),
                    name(sub)).toBeVisible();
            }
            // In the UI language only: the other language's names are not shown
            await expect(page.getByText(lang === "ar" ? oncology.nameEn : oncology.nameAr, {exact: true})).toHaveCount(0);
            await healthy();

            for (const open of ["add", "rename", "add subcategory"] as const) {
                if (open === "add") await page.getByRole("button", {name: st.addCategory, exact: true}).click();
                else await row.getByRole("button", {name: open === "rename" ? st.renameCategory : st.addSubCategory}).first().click();
                const form = page.getByRole("dialog");
                await expect(form, open).toBeVisible();
                const english = form.getByRole("textbox", {name: st.nameEn});
                const arabic = form.getByRole("textbox", {name: st.nameAr});
                await expect(english).toBeVisible();
                await expect(arabic).toBeVisible();
                expect(await directionOf(english), `${open}: the English name is LTR`).toBe("ltr");
                expect(await directionOf(arabic), `${open}: the Arabic name is RTL`).toBe("rtl");
                if (open === "rename") {
                    await expect(english).toHaveValue(oncology.nameEn);
                    await expect(arabic).toHaveValue(oncology.nameAr);
                }
                await healthy();
                await form.getByRole("button", {name: t.cancel}).click();
                await expect(form).toHaveCount(0);
            }
        });
});
