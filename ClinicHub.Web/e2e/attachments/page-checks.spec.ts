import {expect, test} from "../support/fixtures.ts";
import {closePreview, expectImageShown, LONG_ARABIC_SAMPLE, openHarness, pngFile} from "../support/attachments.ts";
import {dialog, expectNoCutOrOverlap, expectNoDialog, expectNotCut} from "../support/ux.ts";

/** Long and with no space to break on: only wrapping anywhere keeps it whole. */
const LONG_UNBROKEN = "صورة_الأشعة_المقطعية_للعين_اليسرى_قبل_العملية_الجراحية_وبعدها_مع_تقرير_الطبيب_المعالج_وملاحظات_المتابعة_خلال_العام_الماضي.png";
/** The harness refuses a file named `fail-*`. */
const LONG_REFUSED = "fail-نتائج_التحاليل_والأشعة_والمتابعة_الدورية_خلال_ستة_أشهر_بعد_العملية_الجراحية_للعين_اليمنى.png";

test.describe("Attachments: the page in Arabic, in English and on a phone @area:attachments", () => {
    test("a long Arabic file name wraps whole, and the axe, cut-text and RTL checks pass in the list, the selection, a failed row, the previews and the confirmation @ATT-253",
        async ({page, lang, healthy}) => {
            const ui = await openHarness(page, lang);
            const a = ui.a;
            const main = page.locator("main");
            const pageChecks = async (what: string) => {
                await test.step(`page checks: ${what}`, async () => {
                    await healthy();
                    await expectNoCutOrOverlap(main, what);
                });
            };

            // The stored files, the long name among them
            await expect(main, "the page's direction is the UI language's").toHaveCSS("direction", lang === "ar" ? "rtl" : "ltr");
            const storedName = ui.storedName(LONG_ARABIC_SAMPLE);
            await expect(storedName, "the long name is listed").toBeVisible();
            await expect(storedName, "a file name takes its own direction").toHaveAttribute("dir", "auto");
            await expect(storedName, "an Arabic name reads right to left in both languages").toHaveCSS("direction", "rtl");
            await expectNotCut(storedName, "the stored long name");
            await pageChecks("the list");

            // The selection
            await ui.input.setInputFiles([pngFile(LONG_UNBROKEN), pngFile(LONG_REFUSED)]);
            for (const name of [LONG_UNBROKEN, LONG_REFUSED]) {
                await expect(ui.selectedName(name), "selected").toBeVisible();
                await expectNotCut(ui.selectedName(name), "a selected long name");
            }
            await expect(ui.selectedName(LONG_UNBROKEN), "an Arabic name reads right to left").toHaveCSS("direction", "rtl");
            await pageChecks("the selection");

            // Uploaded: one moves to the list, one stays with its reason and Retry
            await ui.uploadButton.click();
            await expect(ui.storedName(LONG_UNBROKEN), "the first was uploaded").toBeVisible();
            await expectNotCut(ui.storedName(LONG_UNBROKEN), "the uploaded long name");
            const refused = ui.selectedRow(LONG_REFUSED);
            await expect(refused.getByText(a.typeNotAllowed), "the refused file shows its reason").toBeVisible();
            await expect(refused.getByRole("button", {name: a.retryFile(LONG_REFUSED), exact: true}), "and Retry").toBeVisible();
            await expectNotCut(ui.selectedName(LONG_REFUSED), "the refused long name");
            await pageChecks("a failed row");

            // The image preview of the long name
            await ui.previewButton(LONG_ARABIC_SAMPLE).click();
            const preview = ui.previewDialog(LONG_ARABIC_SAMPLE);
            await expect(preview, "the preview opened").toBeVisible();
            await expectImageShown(ui, LONG_ARABIC_SAMPLE);
            await healthy();
            await expectNoCutOrOverlap(preview, "the image preview");
            await closePreview(page, ui, LONG_ARABIC_SAMPLE);

            // A file with no preview
            await ui.previewButton("results.xlsx").click();
            const noViewer = ui.previewDialog("results.xlsx");
            await expect(noViewer.getByText(a.noPreview, {exact: true}), "the note shows").toBeVisible();
            await healthy();
            await expectNoCutOrOverlap(noViewer, "a preview with no viewer");
            await closePreview(page, ui, "results.xlsx");

            // The delete confirmation of the long name
            await ui.deleteButton(LONG_ARABIC_SAMPLE).click();
            const title = dialog(page).getByText(a.deleteTitle(LONG_ARABIC_SAMPLE), {exact: true});
            await expect(title, "the confirmation names the file").toBeVisible();
            await expectNotCut(title, "the confirmation's title");
            await healthy();
            await expectNoCutOrOverlap(dialog(page), "the delete confirmation");
            await dialog(page).getByRole("button", {name: a.cancel, exact: true}).click();
            await expectNoDialog(page);
            await expect(storedName, "cancelled: the file stays").toBeVisible();
        });
});
