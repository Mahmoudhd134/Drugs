import {expect, test} from "../support/fixtures.ts";
import {openHarness, pngFile} from "../support/attachments.ts";

test.describe("Attachments: a row's Replace @area:attachments", () => {
    test("cancelled: the old row stays and focus is on that row's Replace button, in a real browser @ATT-261",
        async ({page, lang, isMobile, healthy}) => {
            const ui = await openHarness(page, lang);
            const name = "notes.txt";
            /** By keyboard, or by touch on the phone, which has no keys */
            const press = async (button: ReturnType<typeof ui.replaceButton>) => {
                if (isMobile) {
                    await button.tap();
                } else {
                    await button.focus();
                    await page.keyboard.press("Enter");
                }
            };

            const choosing = page.waitForEvent("filechooser");
            await press(ui.replaceButton(name));
            // `slow-*` takes about 8 s: time to cancel it
            await (await choosing).setFiles(pngFile("slow-new.png"));
            await expect(ui.cancelButton(name), "the row's Replace is running").toBeVisible();

            await press(ui.cancelButton(name));

            await expect(ui.cancelButton(name), "cancelled").toHaveCount(0);
            await expect(ui.storedName(name), "the old file stays").toBeVisible();
            await expect(ui.storedName("slow-new.png"), "the new one wasn't stored").toHaveCount(0);
            await expect(ui.replaceButton(name), "focus returns to that row's Replace").toBeFocused();
            await healthy();
        });
});
