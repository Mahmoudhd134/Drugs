import {expect, test} from "../support/fixtures.ts";
import {expectImageShown, openHarness, pngFile, savedBytes} from "../support/attachments.ts";
import {dialog, expectNoDialog} from "../support/ux.ts";
import {expectToast} from "../support/ui.ts";

test.describe("Attachments: by touch on a phone @area:attachments", () => {
    test("a file is picked, uploaded, previewed and deleted by touch, and a PDF the browser can't show offers its name, size and Download @ATT-254",
        async ({page, lang, isMobile, healthy}) => {
            test.skip(!isMobile, "the phone project");
            await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", {get: () => false}));
            const ui = await openHarness(page, lang);
            const a = ui.a;
            const name = "صورة من الهاتف.png";

            // Picked through the real button: the browser's file choice opens
            const choosing = page.waitForEvent("filechooser");
            await ui.pickButton.tap();
            await (await choosing).setFiles(pngFile(name));
            await expect(ui.selectedName(name), "the file is selected").toBeVisible();

            await ui.uploadButton.tap();
            await expect(ui.storedName(name), "the file was uploaded").toBeVisible();
            await expect(ui.selectedName(name), "it left the selection").toHaveCount(0);
            await healthy();

            await ui.previewButton(name).tap();
            await expect(ui.previewDialog(name), "the preview opened").toBeVisible();
            await expectImageShown(ui, name);
            await ui.previewDialog(name).getByRole("button", {name: a.close, exact: true}).tap();
            await expectNoDialog(page);

            await ui.deleteButton(name).tap();
            await expect(dialog(page).getByText(a.deleteTitle(name), {exact: true}), "the confirmation names the file").toBeVisible();
            await expect(dialog(page).getByText(a.deleteMessage, {exact: true})).toBeVisible();
            await dialog(page).getByRole("button", {name: a.delete, exact: true}).tap();
            await expectToast(page, a.deleted);
            await expectNoDialog(page);
            await expect(ui.storedName(name), "the file left the list").toHaveCount(0);

            // No viewer: no frame, but the name, the size and Download
            const pdf = "report.pdf";
            await ui.previewButton(pdf).tap();
            const preview = ui.previewDialog(pdf);
            await expect(preview.getByText(a.noPreview, {exact: true}), "the PDF's preview says there's none").toBeVisible();
            await expect(preview.getByText(pdf, {exact: true}), "with the file's name").toBeVisible();
            await expect(preview.locator("iframe"), "no viewer is tried").toHaveCount(0);
            const started = page.waitForEvent("download");
            await preview.getByRole("button", {name: a.download, exact: true}).tap();
            const download = await started;
            expect(download.suggestedFilename(), "Download saves it under its name").toBe(pdf);
            const bytes = await savedBytes(download);
            expect(bytes.subarray(0, 5).toString("latin1"), "the PDF's own bytes").toBe("%PDF-");
            await expect(preview.getByText(a.sizeB(bytes.length)), "with the file's size").toBeVisible();
            await healthy();
        });

    test("a row's icon buttons stay 36 px with a small gap between them, in the selection and the list @ATT-278",
        async ({page, lang, isMobile}) => {
            test.skip(!isMobile, "the phone project");
            const ui = await openHarness(page, lang);
            await ui.input.setInputFiles(pngFile("صورة.png"));
            await expect(ui.selectedName("صورة.png"), "selected").toBeVisible();

            for (const [what, row] of [["a selected row", ui.selectedRow("صورة.png")], ["a stored row", ui.storedRow("report.pdf")]] as const) {
                const boxes = await row.getByRole("button").evaluateAll(buttons => buttons
                    .map(button => button.getBoundingClientRect())
                    .map(({left, right, width, height}) => ({left, right, width, height}))
                    .sort((one, other) => one.left - other.left));
                expect(boxes.length, `${what} has at least two buttons`).toBeGreaterThanOrEqual(2);
                for (const box of boxes) {
                    expect(Math.round(box.width), `${what}: 36 px wide`).toBe(36);
                    expect(Math.round(box.height), `${what}: 36 px tall`).toBe(36);
                }
                for (let index = 1; index < boxes.length; index++) {
                    expect(boxes[index].left - boxes[index - 1].right, `${what}: a gap between buttons ${index} and ${index + 1}`).toBeGreaterThanOrEqual(2);
                }
            }
        });

    test("the drop hint is hidden on a touch device, where dropping doesn't exist, and the button stays; on a desktop it shows @ATT-263",
        async ({page, lang, isMobile, healthy}) => {
            const ui = await openHarness(page, lang);
            const touch = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
            expect(touch, "the phone project is the one with no precise pointer").toBe(isMobile);

            await expect(ui.pickButton, "the button stays everywhere").toBeVisible();
            await expect(ui.dropArea.getByText(ui.a.dropHint, {exact: true}), "the hint shows only where a file can be dropped").toBeVisible({visible: !isMobile});
            await healthy();
        });
});
