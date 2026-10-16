import type {Page} from "@playwright/test";
import {expect, signInSuperAdmin, test} from "../support/fixtures.ts";
import type {Texts} from "../support/texts.ts";
import {unique} from "../support/phones.ts";
import {expectToast, recordRequests, toast, toasts} from "../support/ui.ts";

const expectNotFound = async (page: Page, t: Texts) => {
    await expect(page.getByText(t.clinicNotFoundTitle, {exact: true})).toBeVisible();
    await expect(page.getByText(t.clinicNotFoundDescription, {exact: true})).toBeVisible();
};

const statusChip = (page: Page, label: string) => page.locator(".MuiChip-root").filter({hasText: label});

/** Holds the requests matching `pattern` until `release()`. */
const hold = async (page: Page, pattern: string) => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(pattern, async route => {
        await held;
        await route.continue();
    });
    return () => release();
};

test.describe("Platform admin: a clinic's Overview @area:admin", () => {
    test("an unknown clinic: «العيادة غير موجودة», and «العودة إلى العيادات» opens the list @ADM-095", async ({page, t, healthy, allowApiErrors}) => {
        // An unknown clinic: the test's subject
        allowApiErrors({status: 404, method: "GET", path: /^\/api\/v1\/admin\/clinics\/999999$/});
        await signInSuperAdmin(page, "/admin/clinics/999999");
        await expectNotFound(page, t);
        await healthy();
        await page.getByRole("link", {name: t.backToClinics}).click();
        await expect(page).toHaveURL(/\/admin$/);
    });

    test("a deleted clinic's URL and the template's URL: «العيادة غير موجودة» @ADM-136 @ADM-141", async ({page, t, data, allowApiErrors}) => {
        // A deleted clinic and the template are not found: the test's subject
        allowApiErrors({status: 404, method: "GET", path: /^\/api\/v1\/admin\/clinics\/\d+$/});
        const clinic = await data.clinic();
        await data.deleteClinic(clinic);
        const template = data.admin.auth!.contexts.find(c => c.type === "clinic" && c.isTemplate);
        if (template?.type !== "clinic") throw new Error("the super admin has no template context");

        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}`);
        await expectNotFound(page, t);
        await page.goto(`/admin/clinics/${template.clinicId}`);
        await expectNotFound(page, t);
    });

    test("Rename starts from the current name; Save → «تم تغيير اسم العيادة» and the new name in the header @ADM-106", async ({page, t, data, healthy}) => {
        const clinic = await data.clinic();
        const renamed = `Renamed ${unique()}`;
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}`);
        await page.getByRole("button", {name: t.rename}).click();
        const dialog = page.getByRole("dialog", {name: t.renameTitle});
        const input = dialog.getByRole("textbox", {name: t.clinicName});
        await expect(input).toHaveValue(clinic.name);
        await healthy();

        await input.fill(renamed);
        await dialog.getByRole("button", {name: t.save}).click();
        await expectToast(page, t.clinicRenamed);
        await expect(dialog).toHaveCount(0);
        await expect(page.getByRole("heading", {level: 1})).toContainText(renamed);
    });

    test("Rename while saving: Esc and the backdrop don't close it; a double click on Save sends one PUT @ADM-109", async ({page, t, data}) => {
        const clinic = await data.clinic();
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}`);
        await page.getByRole("button", {name: t.rename}).click();
        const dialog = page.getByRole("dialog", {name: t.renameTitle});
        const renamed = `Renamed ${unique()}`;
        const input = dialog.getByRole("textbox", {name: t.clinicName});
        await input.fill(renamed);

        const puts = recordRequests(page, "PUT", new RegExp(`/api/v1/admin/clinics/${clinic.id}$`));
        const release = await hold(page, `**/api/v1/admin/clinics/${clinic.id}`);
        await dialog.getByRole("button", {name: t.save}).dblclick();
        await expect.poll(() => puts.length).toBe(1);
        // A dialog that closes stays in the DOM while it fades out (~200 ms) and still counts as visible: each check
        // waits past that transition, then the dialog must still be there, fully opaque, with the typed name
        const stillOpen = async (after: string) => {
            await page.waitForTimeout(600);
            await expect(dialog, `still open after ${after}`).toBeVisible();
            // (MUI fades the dialog's container, the paper's parent)
            await expect(dialog.locator("xpath=.."), `not fading out after ${after}`).toHaveCSS("opacity", "1");
            await expect(input, `the typed name kept after ${after}`).toHaveValue(renamed);
        };
        await page.keyboard.press("Escape");
        await stillOpen("Esc");
        await page.mouse.click(5, 5);
        await stillOpen("a backdrop click");

        release();
        await expectToast(page, t.clinicRenamed);
        await expect(dialog).toHaveCount(0);
        expect(puts).toHaveLength(1);
    });

    test("Disable (confirm double-clicked): one suspend, «تم إيقاف العيادة», the chip, Enable and the explanation; the list shows it disabled without a reload @ADM-119 @ADM-121",
        async ({page, t, data, healthy}) => {
            const token = `D${unique()}`;
            const clinic = await data.clinic({name: `${token} clinic`});
            await signInSuperAdmin(page, `/admin?search=${token}`);
            await page.locator("tbody tr").first().getByRole("link").click();
            await expect(statusChip(page, t.statusActive).first()).toBeVisible();

            const suspends = recordRequests(page, "POST", new RegExp(`/api/v1/admin/clinics/${clinic.id}/suspend$`));
            await page.getByRole("button", {name: t.disable}).click();
            const confirm = page.getByRole("dialog", {name: t.disableTitle(clinic.name)});
            await expect(confirm).toBeVisible();
            await healthy();
            await confirm.getByRole("button", {name: t.disable}).dblclick();

            await expectToast(page, t.clinicDisabled);
            await expect(statusChip(page, t.statusDisabled).first()).toBeVisible();
            await expect(page.getByRole("button", {name: t.enable})).toBeVisible();
            await expect(page.getByText(t.suspendedInfo, {exact: true})).toBeVisible();
            expect(suspends).toHaveLength(1);

            // Back to the list, then its Disabled filter: both from the app's cache, no page load
            await page.evaluate(() => { (window as unknown as { sameLoad: boolean }).sameLoad = true; });
            await page.getByRole("button", {name: t.back}).first().click();
            await expect(page.locator("tbody tr").first()).toContainText(t.statusDisabled);
            await page.getByRole("combobox", {name: t.statusFilter}).click();
            await page.getByRole("option", {name: t.statusDisabled, exact: true}).click();
            await expect(page).toHaveURL(/status=suspended/);
            await expect(page.locator("tbody tr")).toHaveCount(1);
            await expect(page.locator("tbody tr").first()).toContainText(clinic.name);
            await expect(page.locator("tbody tr").first()).toContainText(t.statusDisabled);
            expect(await page.evaluate(() => (window as unknown as { sameLoad?: boolean }).sameLoad), "no page load").toBe(true);
        });

    test("Enable (double click): no confirm, one activate, «تم تفعيل العيادة» and the chip «نشطة» @ADM-120 @ADM-121", async ({page, t, data}) => {
        const clinic = await data.clinic();
        await data.suspend(clinic);
        await signInSuperAdmin(page, `/admin/clinics/${clinic.id}`);
        await expect(page.getByRole("button", {name: t.enable})).toBeVisible();

        const activates = recordRequests(page, "POST", new RegExp(`/api/v1/admin/clinics/${clinic.id}/activate$`));
        await page.getByRole("button", {name: t.enable}).dblclick();
        await expectToast(page, t.clinicEnabled);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(statusChip(page, t.statusActive).first()).toBeVisible();
        await expect(page.getByRole("button", {name: t.disable})).toBeVisible();
        expect(activates).toHaveLength(1);
    });

    test("Delete with the name typed (double click): one DELETE, the list as left with «تم حذف «…»», the row never shown, no request for its details @ADM-134 @ADM-135",
        async ({page, t, data}) => {
            const token = `X${unique()}`;
            const clinic = await data.clinic({name: `${token} gone`});
            await data.clinic({name: `${token} kept`});
            await signInSuperAdmin(page, `/admin?search=${token}`);
            await expect(page.locator("tbody tr")).toHaveCount(2);
            const listUrl = page.url();
            await page.locator("tbody tr").filter({hasText: clinic.name}).getByRole("link").click();
            await expect(page.getByRole("heading", {level: 1})).toContainText(clinic.name);

            await page.getByRole("button", {name: t.deleteClinic}).click();
            const dialog = page.getByRole("dialog", {name: t.deleteTitle});
            await dialog.getByRole("textbox", {name: t.clinicName}).fill(clinic.name);
            await page.evaluate(name => {
                const flags = window as unknown as { shown?: boolean };
                new MutationObserver(() => {
                    if (location.pathname === "/admin" && [...document.querySelectorAll("tbody tr")].some(r => (r as HTMLElement).innerText.includes(name))) flags.shown = true;
                }).observe(document, {subtree: true, childList: true, characterData: true});
            }, clinic.name);
            const deletes = recordRequests(page, "DELETE", new RegExp(`/api/v1/admin/clinics/${clinic.id}$`));
            const details = recordRequests(page, "GET", new RegExp(`/api/v1/admin/clinics/${clinic.id}$`));
            await dialog.getByRole("button", {name: t.deleteClinic}).dblclick();

            await expectToast(page, t.clinicDeleted(clinic.name));
            await expect(page).toHaveURL(listUrl);
            await expect(page.locator("tbody tr")).toHaveCount(1);
            await expect(page.locator("tbody tr").first()).toContainText(`${token} kept`);
            await page.waitForLoadState("networkidle");
            expect(deletes).toHaveLength(1);
            expect(details).toHaveLength(0);
            await expect(toast(page, t.clinicDeleted(clinic.name))).toHaveCount(1);
            expect(await page.evaluate(() => (window as unknown as { shown?: boolean }).shown ?? false)).toBe(false);
        });

    test("A deleted in another window while its Overview is open: Rename-Save, Disable, Enable and Delete each answer «هذا العنصر لم يعد موجودًا.» and «العيادة غير موجودة» @ADM-272",
        async ({page, t, data, allowApiErrors}) => {
            // Every action on the deleted clinic answers 404 (and its page's reload): the test's subject
            allowApiErrors(
                {status: 404, method: "GET", path: /^\/api\/v1\/admin\/clinics\/\d+$/},
                {status: 404, method: "PUT", path: /^\/api\/v1\/admin\/clinics\/\d+$/},
                {status: 404, method: "DELETE", path: /^\/api\/v1\/admin\/clinics\/\d+$/},
                {status: 404, method: "POST", path: /^\/api\/v1\/admin\/clinics\/\d+\/(suspend|activate)$/},
            );
            const actions: { name: string; suspended?: boolean; run: (clinicName: string) => Promise<void> }[] = [
                {
                    name: "rename", run: async () => {
                        await page.getByRole("button", {name: t.rename}).click();
                        const dialog = page.getByRole("dialog", {name: t.renameTitle});
                        await dialog.getByRole("textbox", {name: t.clinicName}).fill(`Renamed ${unique()}`);
                        await dialog.getByRole("button", {name: t.save}).click();
                    },
                },
                {
                    name: "disable", run: async clinicName => {
                        await page.getByRole("button", {name: t.disable}).click();
                        await page.getByRole("dialog", {name: t.disableTitle(clinicName)}).getByRole("button", {name: t.disable}).click();
                    },
                },
                {name: "enable", suspended: true, run: async () => page.getByRole("button", {name: t.enable}).click()},
                {
                    name: "delete", run: async clinicName => {
                        await page.getByRole("button", {name: t.deleteClinic}).click();
                        const dialog = page.getByRole("dialog", {name: t.deleteTitle});
                        await dialog.getByRole("textbox", {name: t.clinicName}).fill(clinicName);
                        await dialog.getByRole("button", {name: t.deleteClinic}).click();
                    },
                },
            ];
            // Many pages, scans or clinics: three times the usual time
            test.slow();
            await signInSuperAdmin(page, "/admin");
            for (const action of actions) {
                await test.step(action.name, async () => {
                    const clinic = await data.clinic();
                    if (action.suspended) await data.suspend(clinic);
                    await page.goto(`/admin/clinics/${clinic.id}`);
                    await expect(page.getByRole("heading", {level: 1})).toContainText(clinic.name);
                    await data.deleteClinic(clinic);

                    await action.run(clinic.name);
                    await expectToast(page, t.notFound);
                    await expectNotFound(page, t);
                    await expect(toasts(page).filter({hasText: t.notFound})).toHaveCount(1);
                });
            }
        });
});
