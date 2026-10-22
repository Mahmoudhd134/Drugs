import {expect, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {localPhone, unique, uniquePhone} from "../support/phones.ts";
import {runState} from "../support/run.ts";
import {ApiSession} from "../support/api.ts";
import {UX_TEXTS} from "../support/texts-ux.ts";
import {expectContextLabel, expectToast, navTo, recordRequests} from "../support/ui.ts";

test.describe("Platform admin: creating a clinic @area:admin", () => {
    test("a double click on «إنشاء العيادة» sends one POST and makes one clinic; its page opens with the toast, and Back doesn't return to the form @ADM-085 @ADM-087 @smoke",
        async ({page, t, data, healthy}) => {
            const name = `New ${unique()}`;
            await signInSuperAdmin(page, "/admin");
            await page.getByRole("link", {name: t.newClinic}).click();
            await expect(page).toHaveURL(/\/admin\/clinics\/new$/);
            await page.getByRole("textbox", {name: t.clinicName}).fill(name);
            await page.getByRole("textbox", {name: t.ownerPhone}).fill(localPhone(uniquePhone()));
            await page.getByRole("textbox", {name: t.ownerName}).fill(`Owner ${unique()}`);
            await healthy();

            const posts = recordRequests(page, "POST", /\/api\/v1\/admin\/clinics$/);
            await page.getByRole("button", {name: t.createClinic}).dblclick();

            await expectToast(page, t.clinicCreated(name));
            await expect(page).toHaveURL(/\/admin\/clinics\/\d+$/);
            await expect(page.getByRole("heading", {level: 1})).toContainText(name);
            expect(posts).toHaveLength(1);
            const found = await data.admin.ok<{ totalCount: number }>("GET", `/api/v1/admin/clinics?search=${encodeURIComponent(name)}`);
            expect(found.totalCount).toBe(1);

            await page.goBack();
            await expect(page).toHaveURL(/\/admin$/);
            await expect(page.getByRole("textbox", {name: t.ownerPhone})).toHaveCount(0);
        });

    test("SA creates «عيادة النور» in the Arabic UI; its new owner logs in to the template's 2 drugs and its protocol of 2 lines @ADM-088 @smoke",
        async ({page, t, lang, newBrowser}) => {
            test.skip(lang !== "ar", "the Arabic UI");
            const {template} = runState();
            const ownerPhone = uniquePhone();
            await signInSuperAdmin(page, "/admin/clinics/new");
            await page.getByRole("textbox", {name: t.clinicName}).fill("عيادة النور");
            await page.getByRole("textbox", {name: t.ownerPhone}).fill(localPhone(ownerPhone));
            await page.getByRole("textbox", {name: t.ownerName}).fill("أحمد علي");
            await page.getByRole("button", {name: t.createClinic}).click();
            await expectToast(page, t.clinicCreated("عيادة النور"));

            const owner = await newBrowser();
            await signIn(owner.page, ownerPhone);
            await expectContextLabel(owner.page, "عيادة النور");
            // The template's 2 drugs are the clinic's own; the total also counts the shared catalog (M1.7b contract § 4.4),
            // so it is compared with the API's answer of this run
            const ownerApi = await ApiSession.login(runState().baseURL, ownerPhone);
            try {
                const own = await ownerApi.ok<{ totalCount: number; items: { name: string }[] }>("GET", "/api/v1/drugs?source=own&pageSize=50");
                expect(own.totalCount).toBe(2);
                expect(own.items.map(d => d.name).sort()).toEqual([...template.drugs].sort());
                const all = await ownerApi.ok<{ totalCount: number }>("GET", "/api/v1/drugs");
                await navTo(owner.page, t, t.navDrugs);
                await expect(owner.page.getByText(UX_TEXTS.ar.drugsSubtitle(all.totalCount), {exact: true})).toBeVisible();
            } finally {
                await ownerApi.dispose();
            }
            for (const drug of template.drugs) {
                const answered = owner.page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/drugs"
                    && new URL(r.url()).searchParams.get("search") === drug);
                await owner.page.getByPlaceholder(t.searchDrugs).fill(drug);
                await answered;
                await expect(owner.page.locator("tbody tr").filter({has: owner.page.getByText(drug, {exact: true})})).toBeVisible();
            }
            await navTo(owner.page, t, t.navProtocols);
            await expect(owner.page.getByText("إجمالي البروتوكولات: 1", {exact: true})).toBeVisible();
            await expect(owner.page.getByText(template.protocol.name, {exact: true})).toBeVisible();
            await expect(owner.page.getByText(`الأدوية: ${template.protocol.lines}`, {exact: true})).toBeVisible();
        });
});
