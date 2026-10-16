import type {Page} from "@playwright/test";
import {expect, loginViaUi, signIn, test} from "../support/fixtures.ts";
import type {Texts} from "../support/texts.ts";
import {unique} from "../support/phones.ts";
import {expectContextLabel, expectPicker, expectToast, focusBack, navTo, pickerEntries, recordRequests, toasts} from "../support/ui.ts";

/** The user does something that asks the API (opens the drugs page). */
const act = (page: Page, t: Texts) => navTo(page, t, t.navDrugs);

/** None of the "suspended" messages (the lost-clinic message replaces them). */
const expectNoSuspendedMessage = async (page: Page, t: Texts, clinic: string) => {
    await expect(page.getByText(t.clinicSuspendedPlain)).toHaveCount(0);
    await expect(page.getByText(t.clinicSuspendedNamed(clinic))).toHaveCount(0);
};

test.describe("Losing the clinic while working in it @area:auth", () => {
    test("deactivated in A with two other places: «…اختر أين تريد المتابعة.» and the picker opens @AUTH-182 @smoke",
        async ({page, t, data, healthy, allowApiErrors}) => {
            // The clinic lost: its next request is refused (the test's subject)
            allowApiErrors({status: 403, method: "GET", path: /^\/api\/v1\/drugs$/});
            const u = unique();
            const [a, b, c] = [await data.clinic({name: `A ${u}`}), await data.clinic({name: `B ${u}`}), await data.clinic({name: `C ${u}`})];
            const inA = await data.staff(a);
            await data.staff(b, {phone: inA.phone});
            await data.staff(c, {phone: inA.phone});
            await signIn(page, inA.phone, {clinicId: a.id});
            await expectContextLabel(page, a.name);

            await data.deactivate(inA);
            await act(page, t);

            await expectToast(page, t.clinicLostChoose(a.name));
            await expectPicker(page, t);
            await expect(pickerEntries(page)).toHaveCount(2);
            await expect(page.getByText(a.name, {exact: true})).toHaveCount(0);
            await healthy();
        });

    test("lost A with exactly one other clinic B: «…أنت الآن في «B».» and B's / opens @AUTH-183", async ({page, t, data, allowApiErrors}) => {
        // The clinic lost: its next request is refused (the test's subject)
        allowApiErrors({status: 403, method: "GET", path: /^\/api\/v1\/drugs$/});
        const u = unique();
        const a = await data.clinic({name: `A ${u}`});
        const b = await data.clinic({name: `B ${u}`});
        const inA = await data.staff(a);
        await data.staff(b, {phone: inA.phone});
        await signIn(page, inA.phone, {clinicId: a.id});
        await expectContextLabel(page, a.name);

        await data.deactivate(inA);
        await act(page, t);

        await expectToast(page, t.clinicLostMoved(a.name, b.name));
        await expect(page).toHaveURL(/\/$/);
        await expectContextLabel(page, b.name);
    });

    test("lost A with no other place: «…ولا أي عيادة أخرى.» and /login opens @AUTH-184", async ({page, t, data, allowApiErrors}) => {
        // The clinic lost: its next request is refused (the test's subject)
        allowApiErrors({status: 403, method: "GET", path: /^\/api\/v1\/drugs$/});
        const clinic = await data.clinic();
        const staff = await data.staff(clinic);
        await signIn(page, staff.phone);
        await expectContextLabel(page, clinic.name);

        await data.deactivate(staff);
        await act(page, t);

        await expectToast(page, t.clinicLostEnded(clinic.name));
        await expect(page).toHaveURL(/\/login$/);
    });

    test("the clinic suspended while working in it: the lost-clinic message, never a «موقوفة» one @AUTH-185", async ({page, t, data, allowApiErrors}) => {
        // The clinic lost: its next request is refused (the test's subject)
        allowApiErrors({status: 403, method: "GET", path: /^\/api\/v1\/drugs$/});
        const u = unique();
        const a = await data.clinic({name: `A ${u}`});
        const b = await data.clinic({name: `B ${u}`});
        const inA = await data.staff(a);
        await data.staff(b, {phone: inA.phone});
        await signIn(page, inA.phone, {clinicId: a.id});
        await expectContextLabel(page, a.name);

        await data.suspend(a);
        await act(page, t);

        await expectToast(page, t.clinicLostMoved(a.name, b.name));
        await expectContextLabel(page, b.name);
        await expectNoSuspendedMessage(page, t, a.name);
    });

    test("the clinic deleted while working in it: the lost-clinic message @AUTH-186", async ({page, t, data, allowApiErrors}) => {
        // The clinic lost: its next request is refused (the test's subject)
        allowApiErrors({status: 403, method: "GET", path: /^\/api\/v1\/drugs$/});
        const clinic = await data.clinic();
        const staff = await data.staff(clinic);
        await signIn(page, staff.phone);
        await expectContextLabel(page, clinic.name);

        await data.deleteClinic(clinic);
        await act(page, t);

        await expectToast(page, t.clinicLostEnded(clinic.name));
        await expect(page).toHaveURL(/\/login$/);
    });

    test("removed from the clinic while working in it: the lost-clinic message @AUTH-187", async ({page, t, data, allowApiErrors}) => {
        // The clinic lost: its next request is refused (the test's subject)
        allowApiErrors({status: 403, method: "GET", path: /^\/api\/v1\/drugs$/});
        const u = unique();
        const [a, b, c] = [await data.clinic({name: `A ${u}`}), await data.clinic({name: `B ${u}`}), await data.clinic({name: `C ${u}`})];
        const inA = await data.staff(a);
        await data.staff(b, {phone: inA.phone});
        await data.staff(c, {phone: inA.phone});
        await signIn(page, inA.phone, {clinicId: a.id});
        await expectContextLabel(page, a.name);

        await data.removeStaff(inA);
        await act(page, t);

        await expectToast(page, t.clinicLostChoose(a.name));
        await expectPicker(page, t);
    });

    test("removed and added again (a new staff record): the refused save is replayed once and succeeds quietly @AUTH-190",
        async ({page, t, data, allowApiErrors}) => {
            // The save refused once (the old staff record): the test's subject
            allowApiErrors({status: 403, method: "POST", path: /^\/api\/v1\/drugs$/});
            const clinic = await data.clinic();
            const staff = await data.staff(clinic, {roles: ["Doctor"]});
            await signIn(page, staff.phone, "asIs", "/drugs");
            await expectContextLabel(page, clinic.name);

            await data.removeStaff(staff);
            await data.staff(clinic, {phone: staff.phone, fullName: staff.fullName, roles: ["Doctor"]});

            const name = `Drug ${unique()}`;
            const posts = recordRequests(page, "POST", /\/api\/v1\/drugs$/);
            await page.getByRole("button", {name: t.addDrug}).click();
            const dialog = page.getByRole("dialog");
            await dialog.getByRole("textbox", {name: t.drugName}).fill(name);
            await dialog.getByRole("button", {name: t.save}).click();

            await expectToast(page, t.drugAdded);
            await expect(page.getByRole("cell", {name})).toBeVisible();
            await expectContextLabel(page, clinic.name);
            // The 403 then the replay, nothing more; no clinic-lost message
            expect(posts).toHaveLength(2);
            await expect(page.getByText(t.clinicLostEnded(clinic.name))).toHaveCount(0);
            await expect(toasts(page)).toHaveCount(1);
        });

    test("lost the clinic while the tab was in the background: back in front, /me reloads and the lost-clinic flow runs @AUTH-192",
        async ({page, t, data}) => {
            const u = unique();
            const a = await data.clinic({name: `A ${u}`});
            const b = await data.clinic({name: `B ${u}`});
            const inA = await data.staff(a);
            await data.staff(b, {phone: inA.phone});
            await signIn(page, inA.phone, {clinicId: a.id});
            await expectContextLabel(page, a.name);

            await data.deactivate(inA);
            const me = recordRequests(page, "GET", /\/api\/v1\/me$/);
            await focusBack(page);

            await expectToast(page, t.clinicLostMoved(a.name, b.name));
            await expectContextLabel(page, b.name);
            expect(me.length).toBeGreaterThanOrEqual(1);
        });

    test("a clinic disabled then enabled again: the staff member logs in and finds A as before @ADM-271", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const drug = await data.drug(clinic);
        const staff = await data.staff(clinic);
        await data.suspend(clinic);
        await data.activate(clinic);

        await loginViaUi(page, t, staff.phone);
        await expectContextLabel(page, clinic.name);
        await navTo(page, t, t.navDrugs);
        await expect(page.getByRole("cell", {name: drug.name})).toBeVisible();
    });
});
