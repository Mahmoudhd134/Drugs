import {expectHealthyPage} from "../support/checks.ts";
import {expect, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {expectContextLabel} from "../support/ui.ts";

/**
 * The axe findings the page checks let through as known bugs (support/checks.ts KNOWN_AXE): each one scanned here
 * without its own allowance (`onlyBug`; the other known bugs are still let through), as an expected failure
 * (`test.fail`). Once the bug is fixed the test passes and Playwright reports it ("expected to fail"): then drop its
 * KNOWN_AXE entry and the `test.fail`.
 */
test.describe("Accessibility known bugs @area:ux", () => {
    test.fail("BUG-500: the search result lists (role=listbox) have no accessible name: axe aria-input-field-name on the prescription page @UX-036",
        async ({page, data, lang}) => {
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone);
            await expectContextLabel(page, clinic.name);
            await expectHealthyPage(page, lang, test.info(), {onlyBug: "BUG-500"});
        });

    test.fail("BUG-501: lists whose entries are not <li> (sidebar links, clinic picker buttons): axe list @UX-036",
        async ({page, data, lang}) => {
            const a = await data.clinic();
            const b = await data.clinic();
            const staff = await data.staff(a);
            await data.staff(b, {phone: staff.phone});
            await signIn(page, staff.phone, "asIs", "/select-clinic");
            await expect(page).toHaveURL(/\/select-clinic$/);
            await expectHealthyPage(page, lang, test.info(), {onlyBug: "BUG-501"});
            await signIn(page, a.owner.phone, "asIs", "/drugs");
            await expectHealthyPage(page, lang, test.info(), {onlyBug: "BUG-501"});
        });

    test.fail("BUG-502: the login page's display-mode banner has a 3.1:1 contrast: axe color-contrast @UX-036", async ({page, lang}) => {
        test.skip(lang !== "en", "axe reports it in the English UI only (known-bugs.md BUG-502)");
        await page.goto("/login");
        await expectHealthyPage(page, lang, test.info(), {onlyBug: "BUG-502"});
    });

    test.fail("BUG-505: the drug dialog's empty dosing preview «No dosing set» has a 2.6:1 contrast: axe color-contrast @UX-036",
        async ({page, data, lang, t}) => {
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await page.getByRole("button", {name: t.addDrug}).click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await expectHealthyPage(page, lang, test.info(), {onlyBug: "BUG-505"});
        });

    test.fail("BUG-506: the staff editor's locked-phone explanation has a 2.7:1 contrast: axe color-contrast @UX-036",
        async ({page, data, lang, t}) => {
            test.skip(lang !== "en", "axe reports it in the English UI only (known-bugs.md BUG-506)");
            const clinic = await data.clinic();
            await signInSuperAdmin(page, `/admin/clinics/${clinic.id}/staff`);
            await page.getByRole("button", {name: t.staffEditNamed(clinic.owner.fullName)}).click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await expectHealthyPage(page, lang, test.info(), {onlyBug: "BUG-506"});
        });
});
