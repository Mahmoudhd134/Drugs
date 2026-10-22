import type {Page, Response} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {type ClinicHandle, type Data, type PermissionKey, READ_ONLY} from "../support/data.ts";
import {expectContextLabel, expectToast, focusBack, navTo, recordRequests, sidebarEntries, toasts} from "../support/ui.ts";

/** The Assistant default role (docs/features/access/business.md: everything except deleting drugs and protocols). */
const ASSISTANT: PermissionKey[] = [
    "drugs.list", "drugs.details", "drugs.create", "drugs.update",
    "protocols.list", "protocols.details", "protocols.create", "protocols.update", "prescriptions.create",
];

/** A clinic with a drug and a protocol, and a staff member with `role` (a default role's name, or a custom role's keys). */
const setUp = async (data: Data, role: string | readonly PermissionKey[]) => {
    const clinic = await data.clinic();
    const drug = await data.drug(clinic);
    const protocol = await data.protocol(clinic, [drug]);
    const roleId = typeof role === "string" ? data.roleId(clinic, role) : (await data.role(clinic, role)).id;
    const staff = await data.staff(clinic, {roles: [roleId]});
    return {clinic, drug, protocol, staff, roleId};
};

const forbiddenAnswers = (page: Page) => {
    const refused: string[] = [];
    page.on("response", (response: Response) => {
        if (response.status() === 403 && response.url().includes("/api/v1/")) refused.push(`${response.request().method()} ${response.url()}`);
    });
    return refused;
};

test.describe("Permissions in the UI @area:access", () => {
    for (const role of ["Owner", "Doctor", "Assistant"] as const) {
        test(`${role}: the sidebar shows Prescription, Protocols and Drugs @ACC-057`, async ({page, t, data}) => {
            const clinic = await data.clinic();
            const phone = role === "Owner" ? clinic.owner.phone : (await data.staff(clinic, {roles: [role]})).phone;
            await signIn(page, phone);
            await expectContextLabel(page, clinic.name);
            expect(await sidebarEntries(page, t)).toEqual([t.navPrescription, t.navProtocols, t.navDrugs]);
        });
    }

    test("a read-only role: the sidebar shows only Protocols and Drugs, and / opens the first allowed page (/protocols) @ACC-057 @ACC-058 @smoke",
        async ({page, t, data, healthy}) => {
            const {clinic, staff} = await setUp(data, READ_ONLY);
            await signIn(page, staff.phone);
            await expectContextLabel(page, clinic.name);
            await expect(page).toHaveURL(/\/protocols$/);
            await expect(page.getByRole("heading", {level: 1, name: t.protocolsTitle})).toBeVisible();
            expect(await sidebarEntries(page, t)).toEqual([t.navProtocols, t.navDrugs]);
            await healthy();
        });

    test("a read-only role opening /protocols/new: the no-permission page @ACC-060", async ({page, t, data, healthy}) => {
        const {staff} = await setUp(data, READ_ONLY);
        await signIn(page, staff.phone, "asIs", "/protocols/new");
        await expect(page.getByText(t.noPermissionTitle, {exact: true})).toBeVisible();
        await expect(page.getByText(t.noPermissionDescription, {exact: true})).toBeVisible();
        const home = page.getByRole("link", {name: t.goHome});
        await expect(home).toBeVisible();
        await healthy();
        await home.click();
        await expect(page).toHaveURL(/\/protocols$/);
    });

    test("a read-only role on Drugs: no Add, no Actions column; a row opens the read-only details, also with Enter and Space @ACC-061",
        async ({page, t, data, healthy}) => {
            const {drug, staff} = await setUp(data, READ_ONLY);
            await signIn(page, staff.phone, "asIs", "/drugs");
            const row = page.getByRole("row").filter({hasText: drug.name});
            await expect(row).toBeVisible();
            await expect(page.getByRole("button", {name: t.addDrug})).toHaveCount(0);
            await expect(page.getByRole("columnheader", {name: t.drugActions})).toHaveCount(0);
            await expect(page.getByRole("button", {name: t.edit})).toHaveCount(0);
            await expect(page.getByRole("button", {name: t.delete})).toHaveCount(0);
            await healthy();

            const details = page.getByRole("dialog", {name: t.drugDetails});
            await row.click();
            await expect(details).toBeVisible();
            await expect(details.getByRole("button", {name: t.save})).toHaveCount(0);
            await details.getByRole("button", {name: t.close}).click();
            await expect(details).toHaveCount(0);

            for (const key of ["Enter", " "]) {
                await row.focus();
                await page.keyboard.press(key === " " ? "Space" : key);
                await expect(details, key).toBeVisible();
                await details.getByRole("button", {name: t.close}).click();
                await expect(details).toHaveCount(0);
            }
        });

    test("an Assistant on Drugs: Add and the edit icon show, the delete icon doesn't, and a row opens the editor @ACC-062", async ({page, t, data}) => {
        const {drug, staff} = await setUp(data, "Assistant");
        await signIn(page, staff.phone, "asIs", "/drugs");
        const row = page.getByRole("row").filter({hasText: drug.name});
        await expect(row).toBeVisible();
        await expect(page.getByRole("button", {name: t.addDrug})).toBeVisible();
        await expect(row.getByRole("button", {name: t.edit})).toBeVisible();
        await expect(row.getByRole("button", {name: t.delete})).toHaveCount(0);

        await row.getByRole("cell").first().click();
        const editor = page.getByRole("dialog", {name: t.editDrug});
        await expect(editor).toBeVisible();
        await expect(editor.getByRole("textbox", {name: t.drugName})).toHaveValue(drug.name);
    });

    test("an Assistant in the protocol editor: Delete is shown disabled, and hovering it says «ليست لديك صلاحية» @ACC-066",
        async ({page, t, data, isMobile}) => {
            test.skip(isMobile, "no hover on a touch phone: the tap is the next test");
            const {protocol, staff} = await setUp(data, "Assistant");
            await signIn(page, staff.phone, "asIs", `/protocols/${protocol.id}`);
            await expect(page.getByRole("heading", {level: 1, name: t.editProtocol})).toBeVisible();
            const remove = page.getByRole("button", {name: t.delete});
            await expect(remove).toBeDisabled();

            // The tooltip sits on the button's wrapper (a disabled button gets no pointer events)
            await page.locator("span").filter({has: remove}).last().hover();
            await expect(page.getByRole("tooltip")).toHaveText(t.noPermissionTooltip);
        });

    test("an Assistant on a phone taps the disabled Delete of the protocol editor: «ليست لديك صلاحية» shows @ACC-066",
        async ({page, t, data, isMobile}) => {
            test.skip(!isMobile, "touch only");
            const {protocol, staff} = await setUp(data, "Assistant");
            await signIn(page, staff.phone, "asIs", `/protocols/${protocol.id}`);
            const remove = page.getByRole("button", {name: t.delete});
            await expect(remove).toBeDisabled();

            await page.locator("span").filter({has: remove}).last().tap();
            await expect(page.getByRole("tooltip")).toHaveText(t.noPermissionTooltip);
        });

    for (const role of ["Owner", "Doctor", "Assistant", "read-only"] as const) {
        test(`${role}: every page they can open loads without a 403 @ACC-073`, async ({page, t, data}) => {
            const {clinic, drug, protocol, staff} = await setUp(data, role === "read-only" ? READ_ONLY : role === "Owner" ? "Doctor" : role);
            const phone = role === "Owner" ? clinic.owner.phone : staff.phone;
            const refused = forbiddenAnswers(page);
            await signIn(page, phone);
            await expectContextLabel(page, clinic.name);

            const pages = role === "read-only" ? ["/protocols", `/protocols/${protocol.id}`, "/drugs"]
                : ["/", "/protocols", "/protocols/new", `/protocols/${protocol.id}`, "/drugs"];
            for (const path of pages) {
                await page.goto(path);
                await expectContextLabel(page, clinic.name);
                await expect(page.getByText(t.noPermissionTitle)).toHaveCount(0);
                await page.waitForLoadState("networkidle");
            }
            // The drug's dialog (editor or details) and its "used in protocols" data
            await page.getByRole("row").filter({hasText: drug.name}).getByRole("cell").first().click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await page.waitForLoadState("networkidle");
            expect(refused).toEqual([]);
        });
    }
});

test.describe("Permissions changed while working @area:access", () => {
    /** The Assistant role of the clinic loses some permissions (by the super admin, through the API). */
    const narrowAssistant = async (data: Data, clinic: ClinicHandle, roleId: number, without: PermissionKey[]) => {
        const role = clinic.roles.find(r => r.id === roleId)!;
        await data.updateRole(clinic, role, ASSISTANT.filter(k => !without.includes(k)));
    };

    test("Protocols taken away from an Assistant on the Protocols page: one «غير مسموح لك بهذا الإجراء.», /me reloads, Protocols leaves the sidebar, no-permission page @ACC-074 @smoke",
        async ({page, t, data, allowApiErrors}) => {
            // The protocols list refused once the role lost protocols.list: the test's subject
            allowApiErrors({status: 403, method: "GET", path: /^\/api\/v1\/protocols$/});
            const {clinic, staff, roleId} = await setUp(data, "Assistant");
            await signIn(page, staff.phone, "asIs", "/protocols");
            await expect(page.getByRole("heading", {level: 1, name: t.protocolsTitle})).toBeVisible();

            await narrowAssistant(data, clinic, roleId, ["protocols.list", "protocols.details", "protocols.create", "protocols.update"]);
            const me = recordRequests(page, "GET", /\/api\/v1\/me$/);
            await page.getByPlaceholder(t.searchProtocols).fill("x");

            await expectToast(page, t.forbidden);
            await expect(toasts(page)).toHaveCount(1);
            await expect(page.getByText(t.noPermissionTitle, {exact: true})).toBeVisible();
            expect(me.length).toBeGreaterThanOrEqual(1);
            expect(await sidebarEntries(page, t)).toEqual([t.navPrescription, t.navDrugs]);
        });

    test("an Assistant saving a drug after «تعديل الأدوية» was taken away: refused, nothing saved, the edit controls disappear @ACC-075",
        async ({page, t, data, allowApiErrors}) => {
            // The save refused once the role lost drugs.update: the test's subject
            allowApiErrors({status: 403, method: "PUT", path: /^\/api\/v1\/drugs\/\d+$/});
            const {clinic, drug, staff, roleId} = await setUp(data, "Assistant");
            await signIn(page, staff.phone, "asIs", "/drugs");
            const row = page.getByRole("row").filter({hasText: drug.name});
            await row.getByRole("button", {name: t.edit}).click();
            const editor = page.getByRole("dialog", {name: t.editDrug});
            await editor.getByRole("textbox", {name: t.drugName}).fill(`${drug.name} changed`);

            await narrowAssistant(data, clinic, roleId, ["drugs.update"]);
            const me = recordRequests(page, "GET", /\/api\/v1\/me$/);
            await editor.getByRole("button", {name: t.save}).click();

            await expect(page.getByText(t.forbidden, {exact: true}).first()).toBeVisible();
            await expect.poll(() => me.length).toBeGreaterThanOrEqual(1);
            // The open dialog follows the new permissions (read only now: the details dialog, no Save); close it once it
            // has turned read only (Esc is ignored while the refused save is still in flight)
            const details = page.getByRole("dialog", {name: t.drugDetails});
            await expect(details.getByRole("button", {name: t.close})).toBeVisible();
            await expect(details.getByRole("button", {name: t.save})).toHaveCount(0);
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await expect(page.getByRole("button", {name: t.edit})).toHaveCount(0);
            await expect(page.getByRole("cell", {name: `${drug.name} changed`})).toHaveCount(0);
            await expect(row).toBeVisible();
            // Nothing saved on the server either
            const saved = await (await data.ownerApi(clinic)).ok<{ name: string }>("GET", `/api/v1/drugs/${drug.id}`);
            expect(saved.name).toBe(drug.name);
        });

    test("a permission taken while the user was in another program: back in front, /me reloads and the page updates @ACC-076",
        async ({page, t, data}) => {
            const {clinic, staff, roleId} = await setUp(data, "Assistant");
            await signIn(page, staff.phone, "asIs", "/drugs");
            await expect(page.getByRole("button", {name: t.addDrug})).toBeVisible();

            await narrowAssistant(data, clinic, roleId, ["drugs.create", "protocols.create"]);
            const me = recordRequests(page, "GET", /\/api\/v1\/me$/);
            await focusBack(page);

            await expect(page.getByRole("button", {name: t.addDrug})).toHaveCount(0);
            expect(me.length).toBeGreaterThanOrEqual(1);
            await navTo(page, t, t.navProtocols);
            await expect(page.getByRole("link", {name: t.newProtocol})).toHaveCount(0);
        });
});
