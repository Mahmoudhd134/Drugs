import {expect, loginViaUi, signIn, superAdminPhone, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {UX_TEXTS} from "../support/texts-ux.ts";
import {showDrugsList} from "../support/catalog.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {
    expectContextLabel,
    expectPicker,
    expectToast,
    navTo,
    openSwitchClinic,
    pickerEntries,
    pickerEntry,
    recordRequests,
} from "../support/ui.ts";

test.describe("Clinic picker @area:auth", () => {
    test("a user with several clinics logs in: «اختر العيادة» opens, without the template; picking a clinic switches and opens it; the language menu is there and the picker fits (375 px: no horizontal scroll) @AUTH-090 @AUTH-121 @ISO-029 @AUTH-091 @smoke",
        async ({page, t, lang, data, healthy}) => {
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const staff = await data.staff(a);
            await data.staff(b, {phone: staff.phone});

            await loginViaUi(page, t, staff.phone);
            await expectPicker(page, t);
            // The two clinics, never the template (ISO-029)
            await expect(pickerEntries(page)).toHaveCount(2);
            await expect(pickerEntries(page).nth(0)).toContainText(a.name);
            await expect(pickerEntries(page).nth(1)).toContainText(b.name);
            await expect(page.getByText(t.template, {exact: true})).toHaveCount(0);
            await expect(page.getByRole("button", {name: UX_TEXTS[lang].language}), "the language menu").toBeVisible();
            // dir/lang, no horizontal scroll (the phone project is 375 px), axe
            await healthy();

            const switches = recordRequests(page, "POST", /\/api\/v1\/auth\/context$/);
            await pickerEntry(page, b.name).click();
            await expect(page).toHaveURL(/\/$/);
            await expectContextLabel(page, b.name);
            expect(switches).toHaveLength(1);
            expect(switches[0].postDataJSON()).toEqual({type: "clinic", clinicId: b.id});
        });

    test("the picker lists the platform admin first, then the clinics and the template in the API's order, the current one marked @AUTH-118",
        async ({page, t, data, healthy}) => {
            const phone = superAdminPhone();
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            await data.staff(a, {phone});
            await data.staff(b, {phone});

            await signIn(page, phone, {clinicId: b.id});
            await expectContextLabel(page, b.name);
            await openSwitchClinic(page, t);

            const entries = pickerEntries(page);
            await expect(entries).toHaveCount(4);
            await expect(entries.nth(0)).toContainText(t.platform);
            await expect(entries.nth(1)).toContainText(a.name);
            await expect(entries.nth(2)).toContainText(b.name);
            await expect(entries.nth(3)).toContainText(t.template);
            // Only the current one carries «الحالي»
            await expect(page.getByText(t.current, {exact: true})).toHaveCount(1);
            await expect(entries.nth(2).getByText(t.current, {exact: true})).toBeVisible();
            await healthy();
        });

    test("a super admin picks «إدارة المنصة»: /admin opens @AUTH-122", async ({page, t, healthy}) => {
        await loginViaUi(page, t, superAdminPhone());
        await expectPicker(page, t);
        await pickerEntry(page, t.platform).click();
        await expect(page).toHaveURL(/\/admin$/);
        await expectContextLabel(page, t.platform);
        await healthy();
    });

    test("a super admin picks «العيادة النموذجية»: / opens with the template banner @AUTH-123", async ({page, t, healthy}) => {
        await loginViaUi(page, t, superAdminPhone());
        await expectPicker(page, t);
        await pickerEntry(page, t.template).click();
        await expect(page).toHaveURL(/\/$/);
        await expectContextLabel(page, t.template);
        await expect(page.getByRole("alert").filter({hasText: t.templateBanner})).toBeVisible();
        await healthy();
    });

    test("the picker loads the contexts fresh: a clinic given and one lost since the login show as they are @AUTH-127",
        async ({page, t, data}) => {
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const c = await data.clinic({name: `C ${u}`});
            const inA = await data.staff(a);
            const inB = await data.staff(b, {phone: inA.phone});
            await signIn(page, inA.phone, {clinicId: a.id});
            await expectContextLabel(page, a.name);

            await data.staff(c, {phone: inA.phone});
            await data.removeStaff(inB);

            // Hold the list, to see the spinner while it loads
            let release!: () => void;
            const held = new Promise<void>(resolve => { release = resolve; });
            const loads = recordRequests(page, "GET", /\/api\/v1\/auth\/contexts$/);
            await page.route("**/api/v1/auth/contexts", async route => {
                await held;
                await route.continue();
            });
            await openSwitchClinic(page, t);
            await expect(page.getByRole("progressbar")).toBeVisible();
            release();

            await expect(pickerEntries(page)).toHaveCount(2);
            await expect(pickerEntries(page).nth(0)).toContainText(a.name);
            await expect(pickerEntries(page).nth(1)).toContainText(c.name);
            await expect(page.getByText(b.name)).toHaveCount(0);
            expect(loads.length).toBeGreaterThanOrEqual(1);
        });

    test("picking a clinic suspended meanwhile: «العيادة «A» موقوفة.» and the picker stays @AUTH-129", async ({page, t, data, allowApiErrors}) => {
        // The switch refused: the test's subject
        allowApiErrors({status: 403, method: "POST", path: /^\/api\/v1\/auth\/context$/});
        const u = unique();
        const a = await data.clinic({name: `A ${u}`});
        const b = await data.clinic({name: `B ${u}`});
        const staff = await data.staff(a);
        await data.staff(b, {phone: staff.phone});
        await loginViaUi(page, t, staff.phone);
        await expectPicker(page, t);
        await expect(pickerEntry(page, a.name)).toBeVisible();

        await data.suspend(a);
        await pickerEntry(page, a.name).click();

        await expectToast(page, t.clinicSuspendedNamed(a.name));
        await expectPicker(page, t);
    });

    test("picking a clinic where the user was deactivated meanwhile: «تم إيقاف حسابك في «A»…» and the picker stays @AUTH-131",
        async ({page, t, data, allowApiErrors}) => {
            // The switch refused: the test's subject
            allowApiErrors({status: 403, method: "POST", path: /^\/api\/v1\/auth\/context$/});
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const staff = await data.staff(a);
            await data.staff(b, {phone: staff.phone});
            await loginViaUi(page, t, staff.phone);
            await expectPicker(page, t);
            await expect(pickerEntry(page, a.name)).toBeVisible();

            await data.deactivate(staff);
            await pickerEntry(page, a.name).click();

            await expectToast(page, t.staffInactiveNamed(a.name));
            await expectPicker(page, t);
        });

    test("made owner of a new clinic while working in another: «تبديل العيادة» lists it and they enter it as Owner @ADM-079",
        async ({page, t, lang, data}) => {
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const staff = await data.staff(a, {roles: ["Assistant"]});
            await data.staff(b, {phone: staff.phone, roles: ["Assistant"]});
            await signIn(page, staff.phone, {clinicId: a.id});
            await expectContextLabel(page, a.name);

            const n = await data.clinic({name: `N ${u}`, ownerPhone: staff.phone});
            await openSwitchClinic(page, t);
            await pickerEntry(page, n.name).click();
            await expectContextLabel(page, n.name);

            // As Owner: every permission, e.g. deleting drugs (an Assistant can't)
            await navTo(page, t, t.navDrugs);
            await showDrugsList(page, CATALOG_TEXTS[lang]);
            await expect(page.getByRole("button", {name: t.delete}).first()).toBeVisible();
        });

    test("removed from a clinic, then added again: it shows again in «تبديل العيادة» and they enter it @ADM-270", async ({page, t, data, allowApiErrors}) => {
        // Removed from the clinic while in it: its next request is refused (the test's setup)
        allowApiErrors({status: 403, method: "GET", path: /^\/api\/v1\/drugs(\/tree)?$/}, {status: 403, method: "GET", path: /^\/api\/v1\/drug-categories$/});
        const u = unique();
        const a = await data.clinic({name: `A ${u}`});
        const b = await data.clinic({name: `B ${u}`});
        const c = await data.clinic({name: `C ${u}`});
        const inA = await data.staff(a);
        await data.staff(b, {phone: inA.phone});
        await data.staff(c, {phone: inA.phone});
        await signIn(page, inA.phone, {clinicId: a.id});
        await expectContextLabel(page, a.name);

        await data.removeStaff(inA);
        // Their next action finds A gone: the picker, without A
        await navTo(page, t, t.navDrugs);
        await expectToast(page, t.clinicLostChoose(a.name));
        await expectPicker(page, t);
        await expect(pickerEntry(page, a.name)).toHaveCount(0);
        await pickerEntry(page, b.name).click();
        await expectContextLabel(page, b.name);

        await data.staff(a, {phone: inA.phone});
        await openSwitchClinic(page, t);
        await pickerEntry(page, a.name).click();
        await expect(page).toHaveURL(/\/$/);
        await expectContextLabel(page, a.name);
    });
});
