import {waitFor} from "@testing-library/react";
import {describe, expect, test, vi} from "vitest";
import i18n from "../../i18n";
import {aDataTransfer, aFile, stubObjectUrls} from "../../test/pages/attachments.tsx";
import {
    acceptOf, asPdf, checkFile, decodeText, downloadBlob, extensionOf, fileKey, formatFileSize, previewKind,
    readTextPreview, splitDropped, TEXT_PREVIEW_BYTES, typeLabel,
} from "./functions.ts";
import type {AttachmentRules} from "./types.ts";

// Pure rules of the attachment components: design § 12; contract § 2; the stubs' comments in functions.ts.

const RULES: AttachmentRules = {maxFileSizeBytes: 1000, extensions: [".png", ".jpg", ".pdf"]};

describe("what identifies a picked file @area:attachments", () => {
    const LAST_MODIFIED = 1_000;
    const fileOf = (name: string, content: string, lastModified = LAST_MODIFIED) => new File([content], name, {lastModified});

    test("the same name, size and last modified are the same file, even as two File objects", () => {
        expect(fileKey(fileOf("a.png", "xx"))).toBe(fileKey(fileOf("a.png", "yy")));
    });

    test.each([
        ["the name", fileOf("b.png", "xx")],
        ["the size", fileOf("a.png", "xxx")],
        ["the last modified", fileOf("a.png", "xx", LAST_MODIFIED + 1)],
    ])("another %s is another file", (_what, other) => {
        expect(fileKey(other)).not.toBe(fileKey(fileOf("a.png", "xx")));
    });
});

describe("a file's extension @area:attachments", () => {
    test.each([
        ["photo.png", ".png"],
        ["IMG.JPG", ".jpg"],
        ["report.final.PDF", ".pdf"],
        ["a..png", ".png"],
        ["تقرير المريض.PDF", ".pdf"],
        ["with space.tar.Gz", ".gz"],
    ])("%s has the last one, lower case with its dot: %s", (name, extension) => {
        expect(extensionOf(name)).toBe(extension);
    });

    test.each([
        ["no extension", "report"],
        ["a trailing dot", "report."],
        ["only an extension", ".png"],
        ["an empty name", ""],
    ])("%s has none", (_what, name) => {
        expect(extensionOf(name)).toBeNull();
    });
});

describe("the accept attribute @area:attachments", () => {
    test("exactly the rules' extensions, comma separated", () => {
        expect(acceptOf(RULES)).toBe(".png,.jpg,.pdf");
        expect(acceptOf({maxFileSizeBytes: 1, extensions: [".txt"]})).toBe(".txt");
        expect(acceptOf({maxFileSizeBytes: 1, extensions: []})).toBe("");
    });
});

describe("the client's check of a file @area:attachments", () => {
    const named = (name: string, size = 10) => ({name, size});

    test("an extension of the rules passes, in any case: IMG.JPG matches .jpg @ATT-214", () => {
        expect(checkFile(named("IMG.JPG"), RULES)).toBeNull();
        expect(checkFile(named("img.jpg"), RULES)).toBeNull();
        expect(checkFile(named("Scan.PnG"), RULES)).toBeNull();
    });

    test("a size exactly at the limit passes; the limit + 1 is too large @ATT-214", () => {
        expect(checkFile(named("a.png", 1000), RULES)).toBeNull();
        expect(checkFile(named("a.png", 999), RULES)).toBeNull();
        expect(checkFile(named("a.png", 1001), RULES)).toBe("attachmentTooLarge");
    });

    test("one byte is not empty; zero bytes are @ATT-213", () => {
        expect(checkFile(named("a.png", 1), RULES)).toBeNull();
        expect(checkFile(named("a.png", 0), RULES)).toBe("attachmentEmpty");
    });

    test.each([
        ["another extension", "a.exe"],
        ["no extension", "report"],
        ["a trailing dot", "report."],
        ["only an extension", ".png"],
        ["the allowed one in the middle", "a.png.exe"],
        ["part of an allowed one", "a.pn"],
        ["an allowed one and more", "a.pngx"],
    ])("%s is not allowed", (_what, name) => {
        expect(checkFile(named(name), RULES)).toBe("attachmentTypeNotAllowed");
    });

    test("the server's order: empty, then size, then extension", () => {
        expect(checkFile(named("a.exe", 0), RULES)).toBe("attachmentEmpty");
        expect(checkFile(named("a.exe", 1001), RULES)).toBe("attachmentTooLarge");
        expect(checkFile(named("a.exe", 1000), RULES)).toBe("attachmentTypeNotAllowed");
    });

    test("the limit and the list come from the rules, none is hard coded", () => {
        const other: AttachmentRules = {maxFileSizeBytes: 5, extensions: [".exe"]};
        expect(checkFile(named("a.exe", 5), other)).toBeNull();
        expect(checkFile(named("a.exe", 6), other)).toBe("attachmentTooLarge");
        expect(checkFile(named("a.png", 5), other)).toBe("attachmentTypeNotAllowed");
    });

    test("a real File is read by its name and size, not its type", () => {
        expect(checkFile(aFile("a.png", 10, "application/x-msdownload"), RULES)).toBeNull();
        expect(checkFile(aFile("a.exe", 10, "image/png"), RULES)).toBe("attachmentTypeNotAllowed");
    });
});

describe("a preview's kind @area:attachments", () => {
    test.each(["png", "jpeg", "webp", "gif", "bmp", "avif"])("the stored type %s is an image", typeKey => {
        expect(previewKind({typeKey})).toBe("image");
    });

    test("a stored pdf is a pdf; txt and csv are text", () => {
        expect(previewKind({typeKey: "pdf"})).toBe("pdf");
        expect(previewKind({typeKey: "txt"})).toBe("text");
        expect(previewKind({typeKey: "csv"})).toBe("text");
    });

    test.each(["tiff", "heic", "docx", "xlsx", "pptx", "doc", "xls", "ppt", "svg", "html", "somethingNew", ""])(
        "the stored type «%s» has no preview", typeKey => {
            expect(previewKind({typeKey})).toBe("none");
        });

    test.each([
        ["a.png", "image"], ["a.PNG", "image"], ["a.jpg", "image"], ["a.jpeg", "image"], ["a.JPG", "image"], ["a.webp", "image"],
        ["a.gif", "image"], ["a.bmp", "image"], ["a.avif", "image"],
        ["a.pdf", "pdf"], ["a.PDF", "pdf"],
        ["a.txt", "text"], ["a.csv", "text"], ["a.TXT", "text"],
        ["a.tif", "none"], ["a.tiff", "none"], ["a.heic", "none"], ["a.heif", "none"], ["a.docx", "none"], ["a.xlsx", "none"],
        ["a.pptx", "none"], ["a.doc", "none"], ["a.xls", "none"], ["a.ppt", "none"],
        ["a.svg", "none"], ["a.html", "none"], ["report", "none"], ["report.", "none"], [".png", "none"], ["a.png.exe", "none"],
    ])("the selected file %s: %s", (name, kind) => {
        expect(previewKind({name})).toBe(kind);
    });

    test("never from a response's or a File's type", () => {
        expect(previewKind(new File(["x"], "a.txt", {type: "image/png"}))).toBe("text");
        expect(previewKind(new File(["x"], "a.docx", {type: "application/pdf"}))).toBe("none");
        expect(previewKind(new File(["x"], "a.png", {type: "text/html"}))).toBe("image");
        expect(previewKind({typeKey: "pdf", contentType: "text/html"} as { typeKey: string })).toBe("pdf");
    });
});

describe("a file's size @area:attachments", () => {
    test.each([
        [0, "0 B"],
        [1, "1 B"],
        [1023, "1023 B"],
        [1024, "1 KB"],
        [1025, "1 KB"],
        [1126, "1.1 KB"],
        [1536, "1.5 KB"],
        [1_048_064, "1023.5 KB"],
        [1_048_576, "1 MB"],
        [1_572_864, "1.5 MB"],
        [20 * 1_048_576, "20 MB"],
        [1_073_741_824, "1 GB"],
        [1_610_612_736, "1.5 GB"],
    ])("%d bytes: %s, at most one decimal", (bytes, text) => {
        expect(formatFileSize(bytes)).toBe(text);
    });

    test("Gigabytes are the largest unit", () => {
        expect(formatFileSize(2048 * 1_073_741_824)).toBe("2048 GB");
    });

    test.each([
        [500, "500 بايت"],
        [1536, "1.5 كيلوبايت"],
        [20 * 1_048_576, "20 ميجابايت"],
        [1_610_612_736, "1.5 جيجابايت"],
    ])("in Arabic %d bytes: «%s», in Latin digits and the language's units", async (bytes, text) => {
        await i18n.changeLanguage("ar");
        expect(formatFileSize(bytes)).toBe(text);
    });
});

describe("a type as a row shows it @area:attachments", () => {
    test.each([["png", "PNG"], ["jpeg", "JPEG"], ["xlsx", "XLSX"], ["pdf", "PDF"]])("%s: %s", (typeKey, label) => {
        expect(typeLabel(typeKey)).toBe(label);
    });
});

/** «مرحبا» in Windows-1256. */
const WINDOWS_1256 = [0xE3, 0xD1, 0xCD, 0xC8, 0xC7];
const utf8 = (text: string) => [...new TextEncoder().encode(text)];
const bytes = (...values: number[]) => new Uint8Array(values);

describe("decoding a text file @area:attachments", () => {
    test("a UTF-16 mark decides, little or big endian, and isn't shown @ATT-247", () => {
        // «سلام» and an A
        expect(decodeText(bytes(0xFF, 0xFE, 0x33, 0x06, 0x44, 0x06, 0x27, 0x06, 0x45, 0x06, 0x41, 0x00), false)).toBe("سلامA");
        expect(decodeText(bytes(0xFE, 0xFF, 0x06, 0x33, 0x06, 0x44, 0x06, 0x27, 0x06, 0x45, 0x00, 0x41), false)).toBe("سلامA");
    });

    test("a UTF-8 mark decides and isn't shown @ATT-247", () => {
        expect(decodeText(bytes(0xEF, 0xBB, 0xBF, ...utf8("سلام")), false)).toBe("سلام");
    });

    test("a mark decides first: the bytes after it aren't checked, nor read as Windows-1256 @ATT-247", () => {
        expect(decodeText(bytes(0xEF, 0xBB, 0xBF, 0xE3, 0x41), false)).toBe("�A");
    });

    test("only a mark is an empty text @ATT-247", () => {
        expect(decodeText(bytes(0xEF, 0xBB, 0xBF), false)).toBe("");
        expect(decodeText(bytes(0xFF, 0xFE), false)).toBe("");
        expect(decodeText(bytes(0xFE, 0xFF), false)).toBe("");
    });

    test("no mark and valid UTF-8: UTF-8, Arabic and Latin alike @ATT-247", () => {
        expect(decodeText(bytes(...utf8("سلام world 😀")), false)).toBe("سلام world 😀");
        expect(decodeText(bytes(...utf8("plain")), false)).toBe("plain");
        expect(decodeText(bytes(), false)).toBe("");
        expect(decodeText(bytes(), true)).toBe("");
    });

    test("no mark and not UTF-8: Windows-1256 reads the Arabic @ATT-230", () => {
        expect(decodeText(bytes(...WINDOWS_1256), false)).toBe("مرحبا");
        expect(decodeText(bytes(...WINDOWS_1256), true)).toBe("مرحبا");
    });

    test("a cut inside an Arabic character doesn't count as invalid: the whole characters read, nothing else @ATT-247", () => {
        const salam = utf8("سلام");
        expect(decodeText(bytes(...salam.slice(0, -1)), true)).toBe("سلا");
    });

    test("the same bytes that aren't cut are not UTF-8: they read as Windows-1256 @ATT-247", () => {
        const salam = utf8("سلام");
        expect(decodeText(bytes(...salam.slice(0, -1)), false)).toBe("ط³ظ„ط§ظ");
    });

    test.each([1, 2, 3])("a cut %d bytes into a 4-byte character keeps the text before it @ATT-247", kept => {
        const emoji = utf8("😀");
        expect(decodeText(bytes(...utf8("ok"), ...emoji.slice(0, kept)), true)).toBe("ok");
    });

    test("a cut doesn't excuse invalid bytes before the end @ATT-247", () => {
        expect(decodeText(bytes(...WINDOWS_1256, ...utf8("A")), true)).toBe("مرحباA");
    });

    test("a cut inside a UTF-16 character keeps the text before it @ATT-247", () => {
        expect(decodeText(bytes(0xFF, 0xFE, 0x33, 0x06, 0x44), true)).toBe("س");
        expect(decodeText(bytes(0xFE, 0xFF, 0x06, 0x33, 0x06), true)).toBe("س");
    });
});

describe("a text preview: the first 1 MB @area:attachments", () => {
    const MB = 1_048_576;
    const latin = (length: number) => new Uint8Array(length).fill(0x61);

    test("the limit is 1 MB", () => {
        expect(TEXT_PREVIEW_BYTES).toBe(MB);
    });

    test("a text under the limit is whole @ATT-230", async () => {
        await expect(readTextPreview(new Blob(["short"]))).resolves.toEqual({text: "short", cut: false});
        await expect(readTextPreview(new Blob([]))).resolves.toEqual({text: "", cut: false});
    });

    test("exactly 1 MB is whole; 1 MB + 1 shows the first 1 MB, cut @ATT-230", async () => {
        const exact = await readTextPreview(new Blob([latin(MB)]));
        expect(exact.cut).toBe(false);
        expect(exact.text).toHaveLength(MB);

        const over = await readTextPreview(new Blob([latin(MB + 1)]));
        expect(over.cut).toBe(true);
        expect(over.text).toHaveLength(MB);
    });

    test("a cut inside an Arabic character at 1 MB reads correctly, with no replacement character @ATT-247", async () => {
        // One Latin byte first, so the 2-byte characters cross the limit
        const text = `a${"س".repeat(MB)}`;
        const {text: shown, cut} = await readTextPreview(new Blob([text]));
        expect(cut).toBe(true);
        expect(shown).toBe(`a${"س".repeat(Math.floor((MB - 1) / 2))}`);
        expect(shown).not.toContain("�");
    });

    test("Windows-1256 Arabic over 1 MB reads correctly @ATT-230", async () => {
        const repeats = Math.floor(MB / WINDOWS_1256.length) + 1;
        const content = new Uint8Array(repeats * WINDOWS_1256.length);
        for (let i = 0; i < content.length; i++) content[i] = WINDOWS_1256[i % WINDOWS_1256.length];
        const {text, cut} = await readTextPreview(new Blob([content]));
        expect(cut).toBe(true);
        expect(text).toHaveLength(MB);
        expect(text.startsWith("مرحبامرحبا")).toBe(true);
    });

    test("a UTF-16 file over 1 MB keeps its mark's decoding @ATT-247", async () => {
        const units = new Uint8Array(MB + 4);
        units.set([0xFF, 0xFE]);
        for (let i = 2; i < units.length; i += 2) units.set([0x33, 0x06], i);
        const {text, cut} = await readTextPreview(new Blob([units]));
        expect(cut).toBe(true);
        expect(text).toBe("س".repeat((MB - 2) / 2));
    });
});

describe("a PDF's blob @area:attachments", () => {
    test.each(["text/html", "", "application/octet-stream"])(
        "arriving as «%s» it's re-wrapped as application/pdf, with the same bytes", async type => {
            const arrived = new Blob(["%PDF-1.7 body"], {type});
            const pdf = asPdf(arrived);
            expect(pdf.type).toBe("application/pdf");
            await expect(pdf.text()).resolves.toBe("%PDF-1.7 body");
            expect(arrived.type).toBe(type);
        });
});

describe("saving a file @area:attachments", () => {
    test("one click on a link with the name and the blob's URL, revoked shortly after the click", async () => {
        const urls = stubObjectUrls();
        const clicks: { name: string; href: string; revokedByThen: number }[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(this: HTMLAnchorElement) {
            clicks.push({name: this.download, href: this.href, revokedByThen: urls.revoked.length});
        });
        const blob = new Blob(["content"]);

        downloadBlob(blob, "تقرير المريض.pdf");

        expect(urls.created).toHaveLength(1);
        expect(urls.created[0]).toBe(blob);
        expect(clicks).toEqual([{name: "تقرير المريض.pdf", href: "blob:test/1", revokedByThen: 0}]);
        expect(urls.revoked).toEqual([]);
        await waitFor(() => expect(urls.revoked).toEqual(["blob:test/1"]));
    });
});

describe("splitting a drop @area:attachments", () => {
    test("files and folders apart, a folder by its entry's name @ATT-218", () => {
        const a = aFile("a.png", 1);
        const b = aFile("b.png", 2);
        const dropped = splitDropped(aDataTransfer({files: [a, b], folders: ["scans", "old"]}));
        expect(dropped.files).toHaveLength(2);
        expect(dropped.files[0]).toBe(a);
        expect(dropped.files[1]).toBe(b);
        expect(dropped.folders).toEqual(["scans", "old"]);
    });

    test("nothing dropped: nothing", () => {
        expect(splitDropped(aDataTransfer({}))).toEqual({files: [], folders: []});
    });

    test("an entry answering null is a file: a DataTransfer a script builds @ATT-218", () => {
        const a = aFile("a.png", 1);
        const dropped = splitDropped(aDataTransfer({files: [a], noEntries: true}));
        expect(dropped.files).toEqual([a]);
        expect(dropped.folders).toEqual([]);
    });

    test("only items of kind file count; `files` isn't read", () => {
        const a = aFile("a.png", 1);
        const dragged = aDataTransfer({files: [a]});
        const withText = {
            items: [{kind: "string", type: "text/plain", getAsFile: () => null, webkitGetAsEntry: () => null}, ...dragged.items],
            files: [aFile("not-an-item.png", 1)],
        } as unknown as DataTransfer;
        const dropped = splitDropped(withText);
        expect(dropped.files).toEqual([a]);
        expect(dropped.folders).toEqual([]);
    });
});
