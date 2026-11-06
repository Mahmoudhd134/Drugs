import type {Download} from "@playwright/test";
import {expect, test} from "../support/fixtures.ts";
import {expectSameBytes, openHarness, PNG_64, routeFilesApi, savedBytes, servedFile} from "../support/attachments.ts";

/** Known bytes that aren't text. */
const bytesOf = (seed: number) => Buffer.from(Array.from({length: 2048}, (_, i) => (i * seed) % 256));

test.describe("Attachments: downloading @area:attachments", () => {
    test("Download on a row: the browser saves the bytes under the original name, an Arabic name too @ATT-223",
        async ({page, lang}) => {
            const files = [
                servedFile("a1", "results.xlsx", bytesOf(7)),
                servedFile("a2", "تقرير الفحص.png", PNG_64),
            ];
            const api = await routeFilesApi(page, {files});
            const ui = await openHarness(page, lang, {mode: "real"});

            for (const {dto, bytes} of files) {
                const name = dto.originalFileName;
                const started = page.waitForEvent("download");
                await ui.downloadButton(name).click();
                const download = await started;
                expect(download.suggestedFilename(), "saved under the original name").toBe(name);
                expectSameBytes(await savedBytes(download), bytes, name);
            }
            expect(api.downloads, "one request per download").toEqual(["a1", "a2"]);
        });

    test("Download all: each file is saved, with its own name and bytes @ATT-246",
        async ({page, lang}) => {
            const files = [
                servedFile("a1", "results.xlsx", bytesOf(7)),
                servedFile("a2", "ملاحظات الطبيب.txt", Buffer.from("سطر عربي\nAn English line\n")),
                servedFile("a3", "scan.png", PNG_64),
            ];
            const api = await routeFilesApi(page, {files});
            const ui = await openHarness(page, lang, {mode: "real"});
            const downloads: Download[] = [];
            page.on("download", download => downloads.push(download));

            await ui.downloadAllButton.click();

            await expect.poll(() => downloads.length, {message: "one saved file per stored file"}).toBeGreaterThanOrEqual(files.length);
            expect(downloads.map(download => download.suggestedFilename()).sort(), "each file once, under its name")
                .toEqual(files.map(file => file.dto.originalFileName).sort());
            for (const download of downloads) {
                const name = download.suggestedFilename();
                expectSameBytes(await savedBytes(download), files.find(file => file.dto.originalFileName === name)!.bytes, name);
            }
            expect([...api.downloads].sort(), "one request per file").toEqual(["a1", "a2", "a3"]);
        });
});
