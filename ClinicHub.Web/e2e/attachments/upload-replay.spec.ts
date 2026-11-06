import {expect, test} from "../support/fixtures.ts";
import {
    expectSameBytes,
    FIRST_TOKEN,
    FRESH_TOKEN,
    openHarness,
    PNG_64,
    readMultipart,
    routeFilesApi,
} from "../support/attachments.ts";

test.describe("Attachments: an upload through a token refresh @area:attachments", () => {
    test("an expired token: the refresh replays the upload, each send's body matches its own boundary, and the Arabic name and the bytes are the same @ATT-210",
        async ({page, lang, allowApiErrors}) => {
            allowApiErrors({status: 401, method: "POST", path: /^\/api\/v1\/test-files$/});
            const api = await routeFilesApi(page, {expireFirstToken: true});
            const ui = await openHarness(page, lang, {mode: "real"});

            // Bytes that aren't text, and that look like a part's end
            const name = "صورة الفحص.png";
            const bytes = Buffer.concat([PNG_64, Buffer.from([0x00, 0xff, 0xfe, 0x80]), Buffer.from("\r\n--not-a-boundary\r\n"), Buffer.from([0xc3, 0x28])]);
            await ui.input.setInputFiles({name, mimeType: "image/png", buffer: bytes});
            await expect(ui.selectedName(name), "the file is selected").toBeVisible();
            await ui.uploadButton.click();

            await expect(ui.storedName(name), "the replay stored the file, under its name").toBeVisible();
            await expect(ui.selectedName(name), "it left the selection").toHaveCount(0);

            expect(api.refreshes, "the 401 refreshed the token once").toBe(1);
            expect(api.uploads, "two sends: the first, answered 401, and its replay").toHaveLength(2);
            const [first, replay] = api.uploads;
            expect(first.authorization, "the first send has the old token").toBe(`Bearer ${FIRST_TOKEN}`);
            expect(replay.authorization, "the replay has the refreshed token").toBe(`Bearer ${FRESH_TOKEN}`);

            // readMultipart checks each body against its own Content-Type's boundary
            const sent = readMultipart(first);
            const replayed = readMultipart(replay);
            for (const [what, part] of [["the first send", sent], ["the replay", replayed]] as const) {
                expect(part.partName, `${what}: the part is named file`).toBe("file");
                expect(part.fileName, `${what}: the Arabic file name arrives intact`).toBe(name);
                expectSameBytes(part.bytes, bytes, `${what}: the file`);
            }
            expectSameBytes(replayed.bytes, sent.bytes, "the replay's part and the first send's");
        });
});
