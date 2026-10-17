import {expectHealthyPage} from "../support/checks.ts";
import {expect, signIn, test} from "../support/fixtures.ts";
import {RxPage, dropDaily, rxDrug, rxName} from "../support/rx.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";

/**
 * The «تعديل قبل النسخ» editor's Quill toolbar (its icon buttons and alignment picker, built by Quill) gets its names from
 * EditorContent (once known bug BUG-570): the page checks with the editor open (axe button-name, aria-command-name, …).
 */
test.describe("Accessibility: the prescription editor @area:ux", () => {
    test("the «تعديل قبل النسخ» editor's toolbar buttons have an accessible name: no axe button-name, aria-command-name @UX-036",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1)});
            await signIn(page, clinic.owner.phone);
            await new RxPage(page, rt).addAlone([drug]);
            await page.getByRole("button", {name: rt.editAndCopy}).click();
            await expect(page.locator(".ql-editor")).toBeVisible({timeout: 30_000});
            await expectHealthyPage(page, lang, test.info());
        });
});
