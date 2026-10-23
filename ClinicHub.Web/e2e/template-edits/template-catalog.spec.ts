import {expect, signIn, superAdminPhone, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {addToProtocol} from "../support/catalog.ts";
import {pickCategory} from "../support/shared.ts";
import {expectContextLabel, expectToast, navTo} from "../support/ui.ts";

/**
 * Changes the template's catalog, which every new clinic copies: this project runs alone, after all the others
 * (playwright.config.ts), so no clinic created by another test copies these changes.
 */
test.describe("The template clinic's catalog @area:auth", () => {
    test("a super admin adds and edits an own drug (with a category) and a protocol in the template, as in any clinic @AUTH-181", async ({page, t, lang}) => {
        const u = unique();
        const drug = `Template drug ${u}`;
        const protocol = `Template protocol ${u}`;
        await signIn(page, superAdminPhone(), "template", "/drugs?view=list");
        await expectContextLabel(page, t.template);

        // Add a drug, then edit it
        await page.getByRole("button", {name: t.addDrug}).click();
        let dialog = page.getByRole("dialog");
        await dialog.getByRole("textbox", {name: t.drugName}).fill(drug);
        // An own drug needs a category (design M1.7 D3)
        await pickCategory(page, dialog, lang);
        await dialog.getByRole("button", {name: t.save}).click();
        await expectToast(page, t.drugAdded);
        const searched = page.waitForResponse(r => new URL(r.url()).pathname === "/api/v1/drugs"
            && new URL(r.url()).searchParams.get("search") === drug);
        await page.getByPlaceholder(t.searchDrugs).fill(drug);
        await searched;
        // The name cell also holds the «خاص بالعيادة» chip (M1.7b D12): the row is found by the name's exact text
        await page.locator("tbody tr").filter({has: page.getByText(drug, {exact: true})}).getByRole("cell").first().click();
        dialog = page.getByRole("dialog", {name: t.editDrug});
        await dialog.getByRole("textbox", {name: t.drugName}).fill(`${drug} edited`);
        await dialog.getByRole("button", {name: t.save}).click();
        await expectToast(page, t.drugUpdated);
        await expect(page.locator("tbody tr").filter({has: page.getByText(`${drug} edited`, {exact: true})})).toBeVisible();

        // Add a protocol with it, then edit the protocol
        await navTo(page, t, t.navProtocols);
        await page.getByRole("link", {name: t.newProtocol}).click();
        await page.getByRole("textbox", {name: t.protocolName}).fill(protocol);
        // The drug through the editor's tree (its one subcategory opens on the search)
        await addToProtocol(page, lang, `${drug} edited`);
        await expect(page.getByText(`${drug} edited`, {exact: true}).first()).toBeVisible();
        await page.getByRole("button", {name: t.save, exact: true}).click();
        await expectToast(page, t.protocolCreated);
        await expect(page).toHaveURL(/\/protocols$/);

        await page.getByText(protocol, {exact: true}).click();
        await expect(page.getByRole("heading", {level: 1, name: t.editProtocol})).toBeVisible();
        await page.getByRole("textbox", {name: t.protocolName}).fill(`${protocol} edited`);
        await page.getByRole("button", {name: t.save, exact: true}).click();
        await expectToast(page, t.protocolUpdated);
        await expect(page.getByText(`${protocol} edited`, {exact: true})).toBeVisible();
        await expectContextLabel(page, t.template);
    });
});
