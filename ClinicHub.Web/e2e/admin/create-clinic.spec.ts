import {expect, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {localPhone, unique, uniquePhone} from "../support/phones.ts";
import {runState} from "../support/run.ts";
import {expectContextLabel, expectToast, navTo, recordRequests} from "../support/ui.ts";
import {ApiSession} from "../support/api.ts";
import {drugRow, drugRows, showDrugsList} from "../support/catalog.ts";
import {listDrugs} from "../support/shared.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";

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

    test("SA creates «عيادة النور» in the Arabic UI; its new owner logs in to the template's 2 own drugs (on «أدوية العيادة», first among the shared catalog on «الكل») and its protocol of 2 lines @ADM-088 @smoke",
        async ({page, t, lang, newBrowser}) => {
            test.skip(lang !== "ar", "the Arabic UI");
            const ct = CATALOG_TEXTS.ar;
            const st = SHARED_TEXTS.ar;
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
            await navTo(owner.page, t, t.navDrugs);
            await showDrugsList(owner.page, ct);
            // «الكل»: T's 2 own drugs first, then the shared catalog (design M1.7 D7); the total is the API's answer of
            // the same run (never a literal of the catalog, D12)
            const ownerApi = await ApiSession.login(runState().baseURL, ownerPhone);
            const all = (await listDrugs(ownerApi, {pageSize: 20})).totalCount;
            const own = (await listDrugs(ownerApi, {pageSize: 20, source: "own"}));
            await ownerApi.dispose();
            expect(own.items.map(d => d.name).sort()).toEqual([...template.drugs].sort());
            await expect(owner.page.getByText(ct.drugsSubtitle(all), {exact: true})).toBeVisible();
            const firstNames = await drugRows(owner.page).locator("td:first-child p:first-child").allTextContents();
            expect(firstNames.slice(0, template.drugs.length).sort()).toEqual([...template.drugs].sort());
            // Then the shared catalog: no chip on a shared row (M1.7 review R2)
            await expect(drugRows(owner.page).nth(template.drugs.length)).toBeVisible();
            await expect(drugRows(owner.page).nth(template.drugs.length).getByText(st.chipOwn, {exact: true})).toHaveCount(0);
            await expect(drugRows(owner.page).nth(template.drugs.length).getByText(st.chipShared, {exact: true})).toHaveCount(0);
            // «أدوية العيادة»: exactly T's 2 own drugs
            await owner.page.getByRole("group", {name: ct.sourceLabel}).getByRole("button", {name: ct.sourceOwn, exact: true}).click();
            await expect(owner.page.getByText(ct.drugsSubtitle(template.drugs.length), {exact: true})).toBeVisible();
            await expect(drugRows(owner.page)).toHaveCount(template.drugs.length);
            for (const drug of template.drugs) {
                await expect(drugRow(owner.page, drug).getByText(st.chipOwn, {exact: true})).toBeVisible();
            }
            await navTo(owner.page, t, t.navProtocols);
            await expect(owner.page.getByText("إجمالي البروتوكولات: 1", {exact: true})).toBeVisible();
            await expect(owner.page.getByText(template.protocol.name, {exact: true})).toBeVisible();
            await expect(owner.page.getByText(`الأدوية: ${template.protocol.lines}`, {exact: true})).toBeVisible();
        });
});
