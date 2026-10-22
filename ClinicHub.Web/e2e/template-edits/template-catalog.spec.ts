import {expect, signIn, superAdminPhone, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {expectContextLabel, expectToast, navTo} from "../support/ui.ts";

/**
 * Changes the template's catalog, which every new clinic copies: this project runs alone, after all the others
 * (playwright.config.ts), so no clinic created by another test copies these changes.
 */
test.describe("The template clinic's catalog @area:auth", () => {
    test("a super admin adds and edits a drug and a group in the template, as in any clinic @AUTH-181", async ({page, t}) => {
        const u = unique();
        const drug = `Template drug ${u}`;
        const protocol = `Template group ${u}`;
        await signIn(page, superAdminPhone(), "template", "/drugs");
        await expectContextLabel(page, t.template);

        // Add a drug, then edit it
        await page.getByRole("button", {name: t.addDrug}).click();
        let dialog = page.getByRole("dialog");
        await dialog.getByRole("textbox", {name: t.drugName}).fill(drug);
        await dialog.getByRole("button", {name: t.save}).click();
        await expectToast(page, t.drugAdded);
        await page.getByRole("cell", {name: drug, exact: true}).click();
        dialog = page.getByRole("dialog", {name: t.editDrug});
        await dialog.getByRole("textbox", {name: t.drugName}).fill(`${drug} edited`);
        await dialog.getByRole("button", {name: t.save}).click();
        await expectToast(page, t.drugUpdated);
        await expect(page.getByRole("cell", {name: `${drug} edited`, exact: true})).toBeVisible();

        // Add a group with it, then edit the group
        await navTo(page, t, t.navProtocols);
        await page.getByRole("link", {name: t.newProtocol}).click();
        await page.getByRole("textbox", {name: t.protocolName}).fill(protocol);
        await page.getByPlaceholder(t.searchDrugs).fill(`${drug} edited`);
        await page.getByRole("option", {name: new RegExp(`${drug} edited`)}).click();
        await page.getByRole("button", {name: t.save, exact: true}).click();
        await expectToast(page, t.protocolCreated);
        await expect(page).toHaveURL(/\/groups$/);

        await page.getByText(protocol, {exact: true}).click();
        await expect(page.getByRole("heading", {level: 1, name: t.editProtocol})).toBeVisible();
        await page.getByRole("textbox", {name: t.protocolName}).fill(`${protocol} edited`);
        await page.getByRole("button", {name: t.save, exact: true}).click();
        await expectToast(page, t.protocolUpdated);
        await expect(page.getByText(`${protocol} edited`, {exact: true})).toBeVisible();
        await expectContextLabel(page, t.template);
    });
});
