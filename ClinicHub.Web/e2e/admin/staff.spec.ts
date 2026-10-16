import type {Page} from "@playwright/test";
import {expect, signInSuperAdmin, test} from "../support/fixtures.ts";
import {localPhone, unique, uniquePhone} from "../support/phones.ts";
import {expectToast, recordRequests, toast} from "../support/ui.ts";

const staffRows = (page: Page) => page.locator("tbody tr");

/** The Overview's "Active staff" value. */
const activeStaff = (page: Page, label: string) => page.locator("dt", {hasText: label}).locator("xpath=following-sibling::dd[1]");

test.describe("Platform admin: a clinic's staff @area:admin", () => {
    test("search «٠١٠٠٠٠٠٠٠٠٢» (Arabic-Indic digits) finds Dev Owner @ADM-241", async ({page, t, lang, data}) => {
        test.skip(lang !== "ar", "the Arabic UI");
        const clinic = await data.clinic();
        await data.staff(clinic, {phone: "+201000000002", fullName: "Dev Owner"});
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/staff`);
        await expect(staffRows(page)).toHaveCount(2);

        await page.getByPlaceholder(t.staffSearch).fill("٠١٠٠٠٠٠٠٠٠٢");
        await expect(staffRows(page)).toHaveCount(1);
        await expect(staffRows(page).first()).toContainText("Dev Owner");
    });

    test("add a staff member (double click): one POST, the toast, the row; the counts of the list, Roles, Overview and the clinics list follow without a reload @ADM-249 @smoke",
        async ({page, t, data, healthy}) => {
            const token = `S${unique()}`;
            const clinic = await data.clinic({name: `${token} clinic`});
            const name = `Nurse ${unique()}`;
            await signInSuperAdmin(page, `/admin?search=${token}`);
            await expect(staffRows(page).first()).toContainText(clinic.name);
            await staffRows(page).first().getByRole("link").click();
            await expect(activeStaff(page, t.activeStaff)).toHaveText("1");
            await page.getByRole("tab", {name: t.tabStaff}).click();
            await expect(page.getByText(t.staffCount(1), {exact: true})).toBeVisible();

            await page.getByRole("button", {name: t.addStaff}).click();
            const dialog = page.getByRole("dialog", {name: t.addStaffTitle});
            await dialog.getByRole("textbox", {name: t.staffPhone}).fill(localPhone(uniquePhone()));
            await dialog.getByRole("textbox", {name: t.staffFullName}).fill(name);
            await dialog.getByRole("checkbox", {name: "Doctor"}).check();
            await healthy();
            const posts = recordRequests(page, "POST", new RegExp(`/api/v1/admin/clinics/${clinic.id}/staff$`));
            await dialog.getByRole("button", {name: t.add, exact: true}).dblclick();

            await expectToast(page, t.staffAdded(name));
            await expect(staffRows(page).filter({hasText: name})).toHaveCount(1);
            await expect(page.getByText(t.staffCount(2), {exact: true})).toBeVisible();
            expect(posts).toHaveLength(1);

            await page.getByRole("tab", {name: t.tabRoles}).click();
            await expect(page.locator("tbody tr").filter({hasText: "Doctor"}).locator("td").nth(1)).toHaveText("1");
            await page.getByRole("tab", {name: t.tabOverview}).click();
            await expect(activeStaff(page, t.activeStaff)).toHaveText("2");
            await page.getByRole("button", {name: t.back}).first().click();
            await expect(page).toHaveURL(/\/admin\?/);
            await expect(staffRows(page).first().locator("td").nth(2)).toHaveText("2");
        });

    test("edit a staff member: Active off → «تم حفظ «…»», «غير نشط», the roles kept @ADM-251", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const staff = await data.staff(clinic, {roles: ["Assistant"]});
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/staff`);
        const row = staffRows(page).filter({hasText: staff.fullName});
        await expect(row).toContainText(t.staffActive);

        await page.getByRole("button", {name: t.staffEditNamed(staff.fullName)}).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("switch", {name: t.staffActive}).uncheck();
        await dialog.getByRole("button", {name: t.save}).click();

        await expectToast(page, t.staffSaved(staff.fullName));
        await expect(row).toContainText(t.staffInactive);
        await expect(row).toContainText("Assistant");
    });

    test("remove a staff member (confirm double-clicked): one DELETE, «تمت إزالة «…»», the row gone @ADM-253", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const staff = await data.staff(clinic);
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/staff`);
        await expect(staffRows(page).filter({hasText: staff.fullName})).toHaveCount(1);

        const deletes = recordRequests(page, "DELETE", new RegExp(`/staff/${staff.id}$`));
        await page.getByRole("button", {name: t.staffRemoveNamed(staff.fullName)}).click();
        await page.getByRole("dialog").getByRole("button", {name: t.remove}).dblclick();

        await expectToast(page, t.staffRemoved(staff.fullName));
        await expect(staffRows(page).filter({hasText: staff.fullName})).toHaveCount(0);
        expect(deletes).toHaveLength(1);
    });

    test("the only active owner can't be removed or deactivated: the lastOwner message and its hint, shown about 8 s @ADM-254", async ({page, t, data}) => {
        const clinic = await data.clinic();
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/staff`);
        const owner = clinic.owner.fullName;

        await page.getByRole("button", {name: t.staffRemoveNamed(owner)}).click();
        await page.getByRole("dialog").getByRole("button", {name: t.remove}).click();
        const message = toast(page, t.lastOwner);
        await expect(message).toContainText(t.lastOwner);
        await expect(message).toContainText(t.lastOwnerHint);
        const shownAt = Date.now();
        await expect(message).toBeHidden({timeout: 15_000});
        const shown = Date.now() - shownAt;
        expect(shown, "shown about 8 s").toBeGreaterThan(6_500);
        expect(shown, "shown about 8 s").toBeLessThan(11_000);
        await expect(staffRows(page).filter({hasText: owner})).toHaveCount(1);

        await page.getByRole("button", {name: t.staffEditNamed(owner)}).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("switch", {name: t.staffActive}).uncheck();
        await dialog.getByRole("button", {name: t.save}).click();
        await expect(toast(page, t.lastOwner)).toContainText(t.lastOwnerHint);
    });
});
