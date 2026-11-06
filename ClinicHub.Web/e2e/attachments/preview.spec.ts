import {expect, test} from "../support/fixtures.ts";
import {closePreview, expectImageShown, expectSameBytes, openHarness, pngFile, routeFilesApi, servedFile} from "../support/attachments.ts";

test.describe("Attachments: previewing @area:attachments", () => {
    test("picked, uploaded and listed: an image and a text file, when previewed, each really shows @ATT-226 @smoke",
        async ({page, lang}) => {
            const ui = await openHarness(page, lang, {seed: "none"});
            const image = "scan.png";
            const text = "ملاحظات.txt";
            const lines = ["سطر عربي", "An English line"];
            await expect(page.getByText(ui.a.empty, {exact: true}), "no files yet").toBeVisible();

            await ui.input.setInputFiles([
                pngFile(image),
                {name: text, mimeType: "text/plain", buffer: Buffer.from(`${lines.join("\n")}\n`)},
            ]);
            for (const name of [image, text]) await expect(ui.selectedName(name), `${name} is selected`).toBeVisible();

            await ui.uploadButton.click();
            for (const name of [image, text]) {
                await expect(ui.storedName(name), `${name} is in the list`).toBeVisible();
                await expect(ui.selectedName(name), `${name} left the selection`).toHaveCount(0);
            }
            await expect(page.getByText(ui.a.empty, {exact: true}), "the list isn't empty any more").toHaveCount(0);

            await ui.previewButton(image).click();
            await expect(ui.previewDialog(image), "the image's preview opened").toBeVisible();
            await expectImageShown(ui, image);
            await closePreview(page, ui, image);

            await ui.previewButton(text).click();
            const shown = ui.previewDialog(text).locator("pre");
            await expect(shown, "the text's preview shows its text").toBeVisible();
            expect((await shown.innerText()).trim(), "both lines, each on its own line").toBe(lines.join("\n"));
            await closePreview(page, ui, text);
        });

    test("the viewer flag on: a PDF's iframe has its title, no sandbox, the hard-coded application/pdf type and the PDF's bytes, whatever the server called it @ATT-248",
        async ({page, lang}) => {
            await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", {get: () => true}));
            const name = "report.pdf";
            const bytes = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");
            // Served as HTML: without the hard-coded type the frame would run it as a page of this origin
            await routeFilesApi(page, {files: [servedFile("a1", name, bytes, "text/html")]});
            const ui = await openHarness(page, lang, {mode: "real"});

            await ui.previewButton(name).click();

            // Headless Chromium has no viewer: with the flag forced, the frame also fires a download, which is ignored
            const frame = ui.previewDialog(name).locator("iframe");
            await expect(frame, "the iframe's title names the file").toHaveAttribute("title", ui.a.previewOf(name));
            await expect(frame, "no sandbox: it blocks Chrome's viewer").not.toHaveAttribute("sandbox");
            await expect(frame, "the PDF comes from a blob").toHaveAttribute("src", /^blob:/);
            const blob = await frame.evaluate(async (e: HTMLIFrameElement) => {
                const answer = await (await fetch(e.src)).blob();
                return {type: answer.type, bytes: [...new Uint8Array(await answer.arrayBuffer())]};
            });
            expect(blob.type, "the type is hard-coded, not the response's text/html").toBe("application/pdf");
            const shown = Buffer.from(blob.bytes);
            expect(shown.subarray(0, 5).toString("latin1"), "a PDF's first bytes").toBe("%PDF-");
            expectSameBytes(shown, bytes, "the iframe's blob");

            await closePreview(page, ui, name);
        });
});
