import type {Locator, Page} from "@playwright/test";
import {expect, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {expectToast, recordRequests} from "../support/ui.ts";

const roleRows = (page: Page) => page.locator("tbody tr");

/** A permission's checkbox by its label (the label may go on with "Needed by: …"). */
const permissionBox = (dialog: Locator, label: string) =>
    dialog.getByRole("checkbox", {name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)});

test.describe("Platform admin: a clinic's roles @area:admin", () => {
    test("a new role \"Editors\" with «تعديل المجموعات» (Save double-clicked): one POST, the toast, its row right after the Owner in name order @ADM-185 @smoke",
        async ({page, t, data, healthy}) => {
            const clinic = await data.clinic();
            await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/roles`);
            await expect(roleRows(page)).toHaveCount(3);
            await page.getByRole("button", {name: t.newRole}).click();
            const dialog = page.getByRole("dialog", {name: t.newRoleTitle});
            await dialog.getByRole("textbox", {name: t.roleName}).fill("Editors");
            await permissionBox(dialog, t.permissionLabel["groups.update"]).check();
            await healthy();

            const posts = recordRequests(page, "POST", new RegExp(`/api/v1/admin/clinics/${clinic.id}/roles$`));
            await dialog.getByRole("button", {name: t.save}).dblclick();
            await expectToast(page, t.roleCreated("Editors"));
            await expect(roleRows(page)).toHaveCount(4);
            expect(posts).toHaveLength(1);
            const names = (await roleRows(page).locator("td:first-child span[dir=auto]").allTextContents()).map(n => n.trim());
            expect(names).toEqual([t.ownerRole, "Assistant", "Doctor", "Editors"]);
        });

    test("delete a role (confirm double-clicked): one DELETE, «تم حذف الدور «X»», the row gone @ADM-178", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const role = await data.role(clinic, ["drugs.list"], `Temp ${unique()}`);
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/roles`);
        await expect(roleRows(page).filter({hasText: role.name})).toHaveCount(1);

        const deletes = recordRequests(page, "DELETE", new RegExp(`/roles/${role.id}$`));
        await page.getByRole("button", {name: t.roleDeleteNamed(role.name)}).click();
        await page.getByRole("dialog").getByRole("button", {name: t.delete}).dblclick();

        await expectToast(page, t.roleDeleted(role.name));
        await expect(roleRows(page).filter({hasText: role.name})).toHaveCount(0);
        expect(deletes).toHaveLength(1);
    });

    test("edit a role: its title, name and ticked keys; Save → «تم حفظ الدور «X»» @ADM-189", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const role = await data.role(clinic, ["groups.list"], `Readers ${unique()}`);
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/roles`);
        await page.getByRole("button", {name: t.roleEditNamed(role.name)}).click();

        const dialog = page.getByRole("dialog", {name: t.roleEditTitle(role.name)});
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("textbox", {name: t.roleName})).toHaveValue(role.name);
        await expect(permissionBox(dialog, t.permissionLabel["groups.list"])).toBeChecked();
        await expect(dialog.getByRole("checkbox", {checked: true})).toHaveCount(1);
        await dialog.getByRole("button", {name: t.save}).click();
        await expectToast(page, t.roleSaved(role.name));
    });

    test("a role renamed: the Staff tab's chips show the new name without a reload @ADM-190", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const role = await data.role(clinic, ["drugs.list"], `Old ${unique()}`);
        const staff = await data.staff(clinic, {roles: [role.id]});
        const renamed = `New ${unique()}`;
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/staff`);
        await expect(page.locator("tbody tr").filter({hasText: staff.fullName})).toContainText(role.name);

        await page.getByRole("tab", {name: t.tabRoles}).click();
        await page.getByRole("button", {name: t.roleEditNamed(role.name)}).click();
        const dialog = page.getByRole("dialog", {name: t.roleEditTitle(role.name)});
        await dialog.getByRole("textbox", {name: t.roleName}).fill(renamed);
        await dialog.getByRole("button", {name: t.save}).click();
        await expectToast(page, t.roleSaved(renamed));

        await page.getByRole("tab", {name: t.tabStaff}).click();
        const row = page.locator("tbody tr").filter({hasText: staff.fullName});
        await expect(row).toContainText(renamed);
        await expect(row).not.toContainText(role.name);
    });

    test("the Owner role reads «المالك» in Arabic and \"Owner\" in English; the API keeps the stored name Owner @ADM-257", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const roles = await data.roles(clinic.id);
        expect(roles.find(r => r.isOwner)?.name).toBe("Owner");

        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/roles`);
        await expect(roleRows(page).first().locator("td:first-child span[dir=auto]")).toHaveText(t.ownerRole);
    });

    test("the clinic deleted in another window while its Roles tab is open: saving a new role → «هذا العنصر لم يعد موجودًا.» and «العيادة غير موجودة» @ADM-273",
        async ({page, t, data}) => {
            const clinic = await data.clinic();
            await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/roles`);
            await expect(roleRows(page)).toHaveCount(3);
            await data.deleteClinic(clinic);

            await page.getByRole("button", {name: t.newRole}).click();
            const dialog = page.getByRole("dialog", {name: t.newRoleTitle});
            await dialog.getByRole("textbox", {name: t.roleName}).fill(`Late ${unique()}`);
            await dialog.getByRole("button", {name: t.save}).click();

            await expectToast(page, t.notFound);
            await expect(page.getByText(t.clinicNotFoundTitle, {exact: true})).toBeVisible();
        });

    test("the role deleted in another window while its editor is open: Save → «هذا العنصر لم يعد موجودًا.», the dialog closes, the row is gone @ADM-275",
        async ({page, t, data}) => {
            const clinic = await data.clinic();
            const role = await data.role(clinic, ["drugs.list"], `Doomed ${unique()}`);
            await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/roles`);
            await page.getByRole("button", {name: t.roleEditNamed(role.name)}).click();
            const dialog = page.getByRole("dialog", {name: t.roleEditTitle(role.name)});
            await expect(dialog).toBeVisible();
            await data.deleteRole(clinic, role);

            await dialog.getByRole("button", {name: t.save}).click();
            await expectToast(page, t.notFound);
            await expect(dialog).toHaveCount(0);
            await expect(roleRows(page).filter({hasText: role.name})).toHaveCount(0);
        });
});
