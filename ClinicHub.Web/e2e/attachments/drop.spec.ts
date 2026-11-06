import {expect, test} from "../support/fixtures.ts";
import {expectSameBytes, openHarness, PNG_64, readMultipart, routeFilesApi} from "../support/attachments.ts";
import {dropFiles, dropOutside} from "../support/attachmentsDrop.ts";

test.describe("Attachments: dropping files @area:attachments", () => {
    test("files dropped on the drop area are selected as if picked: name and size shown, nothing sent until Upload, then their names and bytes @ATT-211",
        async ({page, lang}) => {
            const api = await routeFilesApi(page);
            const ui = await openHarness(page, lang, {mode: "real"});
            const a = ui.a;
            const image = {name: "dropped.png", mimeType: "image/png", buffer: PNG_64, size: a.sizeB(PNG_64.length)};
            const table = {name: "نتائج التحاليل.csv", mimeType: "text/csv", buffer: Buffer.alloc(1536, "a"), size: a.sizeKb("1.5")};
            await expect(ui.dropArea, "the drop area says files can be dropped").toContainText(a.dropHint);

            await dropFiles(ui.dropArea, [image, table].map(({name, mimeType, buffer}) => ({name, mimeType, bytes: [...buffer]})));

            for (const {name, size} of [image, table]) {
                await expect(ui.selectedName(name), `${name} is selected`).toBeVisible();
                await expect(ui.selectedRow(name).getByText(size), `${name} shows its size`).toBeVisible();
            }
            expect(api.uploads, "selected only: nothing is sent yet").toHaveLength(0);

            await ui.uploadButton.click();
            for (const {name} of [image, table]) await expect(ui.storedName(name), `${name} was uploaded`).toBeVisible();
            expect(api.uploads, "one request per file").toHaveLength(2);
            const parts = api.uploads.map(readMultipart);
            for (const {name, buffer} of [image, table]) {
                const part = parts.find(entry => entry.fileName === name);
                expect(part, `a part named ${name} (sent: ${parts.map(entry => entry.fileName).join(", ")})`).toBeDefined();
                expectSameBytes(part!.bytes, buffer, name);
            }
        });

    test("a file dropped outside the area: the page cancels the browser's own dragover and drop, so the app stays open and nothing is selected @ATT-219",
        async ({page, lang}) => {
            const ui = await openHarness(page, lang);
            const url = page.url();

            // A script's drop never navigates: the proof that a real one wouldn't is that both events were cancelled
            const cancelled = await dropOutside(page);

            expect(cancelled, "the window's guard cancelled both events (else the tab would open the file)").toEqual({dragover: true, drop: true});
            await expect(page, "the page stays").toHaveURL(url);
            await expect(ui.heading, "the app stays open").toBeVisible();
            await expect(page.getByText("outside.png"), "a drop outside the area selects nothing").toHaveCount(0);
        });
});
