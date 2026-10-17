import {expectHealthyPage} from "../support/checks.ts";
import {expect, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {expectContextLabel} from "../support/ui.ts";

/**
 * Axe findings once known bugs (BUG-500/501/502/505/506, fixed after M1.6): each page or dialog where one showed is
 * scanned again (the page checks: axe without serious/critical violations), so it can't come back unseen.
 */
test.describe("Accessibility: the pages of the former axe known bugs @area:ux", () => {
    test("the search result lists (role=listbox) have an accessible name: no axe aria-input-field-name on the prescription page @UX-036",
        async ({page, data, lang}) => {
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone);
            await expectContextLabel(page, clinic.name);
            await expectHealthyPage(page, lang, test.info());
        });

    test("lists hold their entries in <li> (sidebar links, clinic picker buttons): no axe list @UX-036",
        async ({page, data, lang}) => {
            const a = await data.clinic();
            const b = await data.clinic();
            const staff = await data.staff(a);
            await data.staff(b, {phone: staff.phone});
            await signIn(page, staff.phone, "asIs", "/select-clinic");
            await expect(page).toHaveURL(/\/select-clinic$/);
            await expectHealthyPage(page, lang, test.info());
            await signIn(page, a.owner.phone, "asIs", "/drugs");
            await expectHealthyPage(page, lang, test.info());
        });

    test("the login page's display-mode banner has a contrast of at least 4.5:1: no axe color-contrast @UX-036", async ({page, lang}) => {
        await page.goto("/login");
        await expectHealthyPage(page, lang, test.info());
    });

    test("the drug dialog's empty dosing preview «No dosing set» has a contrast of at least 4.5:1: no axe color-contrast @UX-036",
        async ({page, data, lang, t}) => {
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await page.getByRole("button", {name: t.addDrug}).click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await expectHealthyPage(page, lang, test.info());
        });

    test("the staff editor's locked-phone explanation has a contrast of at least 4.5:1: no axe color-contrast @UX-036",
        async ({page, data, lang, t}) => {
            const clinic = await data.clinic();
            await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/staff`);
            await page.getByRole("button", {name: t.staffEditNamed(clinic.owner.fullName)}).click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await expectHealthyPage(page, lang, test.info());
        });
});
