import {expect, settled, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {categoryRow} from "../support/admin-catalog.ts";
import {dialog} from "../support/catalog.ts";
import {unique} from "../support/phones.ts";
import {category, deleteCategory, sharedDrug, subCategory} from "../support/shared.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";
import {TEXTS} from "../support/texts.ts";
import {expectToast, recordRequests} from "../support/ui.ts";

/**
 * The super admin's categories (design M1.7 D5, D9; M1.7b contract "Admin categories page") and a clinic's drug dialog
 * meeting a deleted category (§ 8). Every category here is the test's own (unique names), never an imported one
 * (design D12). Arabic UI (this project).
 */

const st = SHARED_TEXTS.ar;
const t = TEXTS.ar;

test.describe("The super admin's categories @area:admin", () => {
    test("a category or a subcategory with drugs: delete disabled but focusable, with «لا يمكن حذف هذا التصنيف: يستخدمه 3 أدوية.»; an empty one deletes after a destructive confirm @CAT-212",
        async ({page, admin, healthy}) => {
            const used = await category(admin);
            const usedSub = await subCategory(admin, used.id);
            for (let i = 0; i < 3; i++) await sharedDrug(admin, {categoryId: used.id, subCategoryId: usedSub.id});
            const empty = await category(admin);
            await signInSuperAdmin(page, "/admin/categories");
            await settled(page);

            const usedRow = categoryRow(page, used.nameAr, "ar");
            const deleteUsed = usedRow.getByRole("button", {name: st.deleteCategory}).first();
            await expect(deleteUsed).toHaveAttribute("aria-disabled", "true");
            await deleteUsed.focus();
            await expect(deleteUsed).toBeFocused();
            await deleteUsed.hover();
            await expect(page.getByRole("tooltip")).toHaveText(st.categoryInUse(3));
            await page.mouse.move(1, 1);
            const deleteSub = categoryRow(page, usedSub.nameAr, "ar").getByRole("button", {name: st.deleteSubCategory});
            await expect(deleteSub).toHaveAttribute("aria-disabled", "true");
            await deleteSub.hover();
            await expect(page.getByRole("tooltip")).toHaveText(st.subCategoryInUse(3));
            await page.mouse.move(1, 1);
            await healthy();

            const deletes = recordRequests(page, "DELETE", /^\/api\/v1\/admin\/drug-categories\/\d+$/);
            await categoryRow(page, empty.nameAr, "ar").getByRole("button", {name: st.deleteCategory}).first().click();
            const confirm = dialog(page, st.deleteCategoryTitle(empty.nameAr));
            await expect(confirm).toBeVisible();
            await expect(confirm).toContainText(st.deleteCategoryMessage);
            // Destructive: the focus starts on «إلغاء»
            await expect(confirm.getByRole("button", {name: t.cancel})).toBeFocused();
            await confirm.getByRole("button").filter({hasNotText: t.cancel}).click();
            await expectToast(page, st.categoryDeleted);
            await expect(page.getByText(empty.nameAr, {exact: true})).toHaveCount(0);
            expect(deletes).toHaveLength(1);
            await expect(page.getByText(used.nameAr, {exact: true})).toBeVisible();
        });

    test("a double click on the delete confirmation sends one request @CAT-216", async ({page, admin}) => {
        const empty = await category(admin);
        await signInSuperAdmin(page, "/admin/categories");
        await settled(page);
        const deletes = recordRequests(page, "DELETE", /^\/api\/v1\/admin\/drug-categories\/\d+$/);
        await categoryRow(page, empty.nameAr, "ar").getByRole("button", {name: st.deleteCategory}).first().click();
        await dialog(page, st.deleteCategoryTitle(empty.nameAr)).getByRole("button").filter({hasNotText: t.cancel}).dblclick();
        await expectToast(page, st.categoryDeleted);
        expect(deletes).toHaveLength(1);
    });
});

test.describe("A category deleted while a clinic's drug dialog is open @area:catalog", () => {
    test("saving: «هذا التصنيف لم يعد موجودًا. اختر تصنيفًا آخر.» on the category field, and the categories are read again (it is gone) @CAT-046",
        async ({page, data, admin, allowApiErrors}) => {
            // The save refused (categoryNotFound): the test's subject
            allowApiErrors({status: 400, method: "POST", path: /^\/api\/v1\/drugs$/});
            const gone = await category(admin, {nameAr: `تصنيف سيحذف ${unique()}`});
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await page.getByRole("button", {name: t.addDrug}).click();
            const form = dialog(page, t.newDrug);
            await form.getByRole("textbox", {name: t.drugName}).fill(`Drug ${unique()}`);
            const categoryField = form.getByRole("combobox", {name: /^التصنيف(?! الفرعي)/});
            await categoryField.click();
            await page.getByRole("option", {name: gone.nameAr, exact: true}).click();
            await expect(page.getByRole("listbox")).toHaveCount(0);

            await deleteCategory(admin, gone.id);
            const reads = recordRequests(page, "GET", /^\/api\/v1\/drug-categories$/);
            await form.getByRole("button", {name: t.save}).click();
            await expect(form.getByText(st.categoryNotFound, {exact: true})).toBeVisible();
            await expect(form).toBeVisible();
            await expect.poll(() => reads.length, {message: "the categories are read again"}).toBeGreaterThan(0);
            await categoryField.click();
            await expect(page.getByRole("option", {name: "العيون", exact: true})).toBeVisible();
            await expect(page.getByRole("option", {name: gone.nameAr, exact: true})).toHaveCount(0);
            await page.keyboard.press("Escape");
        });
});
