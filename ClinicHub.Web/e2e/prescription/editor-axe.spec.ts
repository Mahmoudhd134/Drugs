import {expectHealthyPage} from "../support/checks.ts";
import {expect, signIn, test} from "../support/fixtures.ts";
import {RxPage, dropDaily, rxDrug, rxName} from "../support/rx.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";

/**
 * The axe finding the page checks let through with the editor open (support/checks.ts KNOWN_AXE, BUG-570: the Quill
 * toolbar's buttons, rules button-name and aria-command-name only): scanned here without that allowance, as an expected
 * failure, so it is reported once the bug is fixed (then drop the two KNOWN_AXE entries and the `test.fail`).
 */
test.describe("Accessibility known bugs: the prescription editor @area:ux", () => {
    test.fail("BUG-570: the «تعديل قبل النسخ» editor's toolbar buttons have no accessible name: axe button-name, aria-command-name @UX-036",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1)});
            await signIn(page, clinic.owner.phone);
            await new RxPage(page, rt).addAlone([drug]);
            await page.getByRole("button", {name: rt.editAndCopy}).click();
            await expect(page.locator(".ql-editor")).toBeVisible({timeout: 30_000});
            await expectHealthyPage(page, lang, test.info(), {onlyBug: "BUG-570"});
        });
});
