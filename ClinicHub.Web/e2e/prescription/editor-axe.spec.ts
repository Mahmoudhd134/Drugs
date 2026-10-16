import {expectHealthyPage} from "../support/checks.ts";
import {expect, signIn, test} from "../support/fixtures.ts";
import {RxPage, dropDaily, rxDrug, rxName} from "../support/rx.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";

/**
 * The axe finding the editor's page check leaves out (support/rx.ts `expectEditorHealthy`): scanned here in full, so
 * the test passes once the bug is fixed (then drop the exclusion and this fixme).
 */
test.describe("Accessibility known bugs: the prescription editor @area:ux", () => {
    test.fixme("BUG-570: the «تعديل قبل النسخ» editor's toolbar buttons have no accessible name: axe button-name, aria-command-name @UX-036",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1)});
            await signIn(page, clinic.owner.phone);
            await new RxPage(page, rt).addAlone([drug]);
            await page.getByRole("button", {name: rt.editAndCopy}).click();
            await expect(page.locator(".ql-editor")).toBeVisible({timeout: 30_000});
            await expectHealthyPage(page, lang, test.info(), {ignoreKnownBugs: false});
        });
});
