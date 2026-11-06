import fs from "node:fs/promises";
import {type Download, expect, type Page, test} from "@playwright/test";
import {settled} from "./fixtures.ts";
import type {Lang} from "./texts.ts";
import {ATTACHMENT_TEXTS} from "./texts-attachments.ts";

/**
 * The attachments harness page (docs/testing/README.md "The attachments harness page"; its contract:
 * docs/design/attachments.components.contract.md § 3): opening it, its names, the files a spec picks, and in real mode an
 * API answered by `page.route`. Nothing here is imported from the harness.
 */

/** A real 64 × 64 PNG, one color. */
export const PNG_64 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsGtiRMsZ0Ai+hcEKLNXzWgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgtUGSEt26/VwAAAAABJRU5ErkJggg==",
    "base64",
);

/**
 * A file as a spec picks it, by name, type and bytes. Never by path: only then does Chromium's multipart body hold the
 * bytes in `request.postDataBuffer()` (contract § 3).
 */
export type PickedFile = { name: string; mimeType: string; buffer: Buffer };

export const pngFile = (name: string): PickedFile => ({name, mimeType: "image/png", buffer: PNG_64});

/** The harness's sample with the long Arabic name (contract § 3). */
export const LONG_ARABIC_SAMPLE = "تقرير الفحص الطبي الشامل للمريض بعد العملية الجراحية للعين اليمنى مع نتائج التحاليل والأشعة والمتابعة الدورية خلال ستة أشهر.png";

type HarnessParams = Partial<Record<"mode" | "seed", string>>;

/** The harness page's names in the project's language. */
export const harnessUi = (page: Page, lang: Lang) => {
    const a = ATTACHMENT_TEXTS[lang];
    const selected = page.getByRole("list", {name: a.selectedLabel, exact: true});
    const stored = page.getByRole("list", {name: a.storedLabel, exact: true});
    const button = (name: string) => page.getByRole("button", {name, exact: true});
    return {
        a,
        heading: page.getByRole("heading", {level: 1, name: "Attachments harness"}),
        /** The hidden input of the picker: `setInputFiles` picks without the browser's file choice */
        input: page.getByTestId("attachment-input"),
        dropArea: page.getByTestId("attachment-drop-area"),
        pickButton: button(a.pick),
        uploadButton: button(a.upload),
        downloadAllButton: button(a.downloadAll),
        selected,
        stored,
        selectedRow: (name: string) => selected.getByRole("listitem").filter({hasText: name}),
        storedRow: (name: string) => stored.getByRole("listitem").filter({hasText: name}),
        /** The name as a row shows it */
        selectedName: (name: string) => selected.getByText(name, {exact: true}),
        storedName: (name: string) => stored.getByText(name, {exact: true}),
        previewButton: (name: string) => stored.getByRole("button", {name: a.previewFile(name), exact: true}),
        downloadButton: (name: string) => stored.getByRole("button", {name: a.downloadFile(name), exact: true}),
        deleteButton: (name: string) => stored.getByRole("button", {name: a.deleteFile(name), exact: true}),
        /** The preview dialog of this file */
        previewDialog: (name: string) => page.getByRole("dialog", {name: a.previewOf(name), exact: true}),
    };
};

export type HarnessUi = ReturnType<typeof harnessUi>;

/** Opens the harness page and waits until files can be picked (a drop before the rules load is ignored). */
export const openHarness = async (page: Page, lang: Lang, params: HarnessParams = {}) => {
    const query = new URLSearchParams(params).toString();
    await page.goto(`/__harness/attachments/${query ? `?${query}` : ""}`);
    const ui = harnessUi(page, lang);
    await expect(ui.heading, "the harness page opened (is it in the run's web root?)").toBeVisible();
    await settled(page);
    await expect(ui.pickButton, "the rules loaded, so files can be picked").toBeEnabled();
    return ui;
};

/** Closes the preview dialog with its Close button, and waits until it left. */
export const closePreview = async (page: Page, ui: HarnessUi, name: string) => {
    await ui.previewDialog(name).getByRole("button", {name: ui.a.close, exact: true}).click();
    await expect(page.getByRole("dialog"), "the preview closed").toHaveCount(0);
};

/** The image of a preview really shows: decoded from a blob, at its real size. */
export const expectImageShown = async (ui: HarnessUi, name: string) => {
    const image = ui.previewDialog(name).getByRole("img", {name: ui.a.previewOf(name), exact: true});
    await expect(image, `the preview of ${name} shows an image`).toBeVisible();
    await expect(image, "the image comes from a blob").toHaveAttribute("src", /^blob:/);
    await expect.poll(() => image.evaluate((e: HTMLImageElement) => [e.complete, e.naturalWidth, e.naturalHeight]),
        {message: `the image of ${name} decoded: [complete, width, height] of the 64 × 64 PNG`}).toEqual([true, 64, 64]);
};

let saved = 0;

/** What the browser saved for this download, through `saveAs`. */
export const savedBytes = async (download: Download) => {
    const file = test.info().outputPath(`download-${++saved}`);
    await download.saveAs(file);
    return fs.readFile(file);
};

/** Compared as bytes: a file's bytes aren't text. */
export const expectSameBytes = (actual: Buffer, expected: Buffer, what: string) => {
    expect(actual.equals(expected), `${what}: the same bytes (${actual.length} here, ${expected.length} expected; starts ${actual.subarray(0, 16).toString("hex")}, expected ${expected.subarray(0, 16).toString("hex")})`).toBe(true);
};

/** One send of a request, as `page.route` saw it. */
export type CapturedSend = { body: Buffer | null; contentType: string | null; authorization: string | null };

/**
 * The one part of a send's multipart body, checked against that send's own header: Chromium makes a new boundary on each
 * send of the same `FormData` (contract § 3). Throws, saying what is wrong, on a body that doesn't match it.
 */
export const readMultipart = ({body, contentType}: CapturedSend) => {
    const boundary = /boundary=(.+)$/.exec(contentType ?? "")?.[1];
    if (!boundary) throw new Error(`Content-Type has no multipart boundary: ${contentType}`);
    if (!body) throw new Error("the request has no body");
    const start = Buffer.from(`--${boundary}\r\n`);
    if (!body.subarray(0, start.length).equals(start)) {
        throw new Error(`the body doesn't start with its own header's boundary ${boundary}: ${body.subarray(0, 80).toString("latin1")}`);
    }
    const end = body.lastIndexOf(`\r\n--${boundary}--`);
    if (end < 0) throw new Error(`the body doesn't end with its own header's boundary ${boundary}`);
    const blank = body.indexOf("\r\n\r\n");
    if (blank < 0 || blank > end) throw new Error("the part has no blank line after its headers");
    const headers = body.subarray(start.length, blank).toString("utf8");
    const bytes = body.subarray(blank + 4, end);
    if (bytes.includes(`\r\n--${boundary}`)) throw new Error("the body holds more than one part");
    return {
        boundary,
        partName: /; name="([^"]*)"/.exec(headers)?.[1],
        fileName: /; filename="([^"]*)"/.exec(headers)?.[1],
        bytes,
    };
};

/** The API's `AttachmentDto`. */
type StoredDto = { id: string; originalFileName: string; typeKey: string; contentType: string; sizeBytes: number; createdAt: string };

/** A stored file of the routed API. `servedAs` is the `Content-Type` its download answers with: its own by default. */
export type ServedFile = { dto: StoredDto; bytes: Buffer; servedAs?: string };

const TYPES: Readonly<Record<string, { typeKey: string; contentType: string }>> = {
    png: {typeKey: "png", contentType: "image/png"},
    pdf: {typeKey: "pdf", contentType: "application/pdf"},
    txt: {typeKey: "txt", contentType: "text/plain"},
    csv: {typeKey: "csv", contentType: "text/csv"},
    xlsx: {typeKey: "xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
};

export const servedFile = (id: string, name: string, bytes: Buffer, servedAs?: string): ServedFile => {
    const type = TYPES[name.slice(name.lastIndexOf(".") + 1)];
    if (!type) throw new Error(`No type of the test's API for ${name}`);
    return {dto: {id, originalFileName: name, ...type, sizeBytes: bytes.length, createdAt: "2026-11-05T10:00:00Z"}, bytes, servedAs};
};

/** The module's rules, as design § 5's table has its extensions. */
const RULES = {
    maxFileSizeBytes: 20 * 1_048_576,
    extensions: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif", ".tif", ".tiff", ".heic", ".heif", ".pdf",
        ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt", ".txt", ".csv"],
};

const FILES_PATH = "/api/v1/test-files";

/** The harness's first token, and the one the routed refresh answers with (contract § 3, real mode). */
export const FIRST_TOKEN = "harness-token";
export const FRESH_TOKEN = "fresh-token";

const problem = (status: number, code: string) => ({
    status,
    contentType: "application/problem+json",
    body: JSON.stringify({status, code, errors: [{code, description: code}], traceId: "e2e"}),
});

/**
 * Real mode's API, answered by `page.route`: the rules, the list, uploads (stored, or a 401 for the expired token) and
 * downloads, plus the refresh. Any other `/api/v1` call answers 501, which fails the test (an API 5xx is a console
 * error) and names the call. Returns what the page sent.
 */
export const routeFilesApi = async (page: Page, options: { files?: ServedFile[]; expireFirstToken?: boolean } = {}) => {
    const files = [...options.files ?? []];
    const calls = {uploads: [] as CapturedSend[], downloads: [] as string[], refreshes: 0};
    let lastId = 0;
    await page.route(/\/api\/v1\//, async route => {
        const request = route.request();
        const method = request.method();
        const path = new URL(request.url()).pathname;
        if (method === "POST" && path === "/api/v1/auth/refresh") {
            calls.refreshes++;
            return route.fulfill({json: {accessToken: FRESH_TOKEN}});
        }
        if (method === "GET" && path === `${FILES_PATH}/rules`) return route.fulfill({json: RULES});
        if (method === "GET" && path === FILES_PATH) return route.fulfill({json: files.map(file => file.dto)});
        if (method === "POST" && path === FILES_PATH) {
            const headers = await request.allHeaders();
            const send: CapturedSend = {
                body: request.postDataBuffer(),
                contentType: headers["content-type"] ?? null,
                authorization: headers.authorization ?? null,
            };
            calls.uploads.push(send);
            if (options.expireFirstToken && send.authorization === `Bearer ${FIRST_TOKEN}`) return route.fulfill(problem(401, "unauthorized"));
            let part: ReturnType<typeof readMultipart>;
            try {
                part = readMultipart(send);
            } catch {
                // As the real API answers a body with no file in it: undeclared, so the test fails
                return route.fulfill(problem(400, "attachmentEmpty"));
            }
            const stored = servedFile(`file-${++lastId}`, part.fileName ?? "", part.bytes);
            files.unshift(stored);
            return route.fulfill({status: 201, json: stored.dto});
        }
        const id = path.startsWith(`${FILES_PATH}/`) ? path.slice(FILES_PATH.length + 1) : null;
        if (method === "GET" && id) {
            calls.downloads.push(id);
            const file = files.find(entry => entry.dto.id === id);
            if (!file) return route.fulfill(problem(404, "notFound"));
            return route.fulfill({
                contentType: file.servedAs ?? file.dto.contentType,
                headers: {"Content-Disposition": "attachment"},
                body: file.bytes,
            });
        }
        return route.fulfill({status: 501, contentType: "text/plain", body: `The test's API doesn't answer ${method} ${path}`});
    });
    return calls;
};
