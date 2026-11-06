import {expect, type Locator, type Page, type TestInfo} from "@playwright/test";
import type {ClinicHandle, Data} from "./data.ts";
import {signIn} from "./fixtures.ts";
import {type Layout, type LayoutItem, MM, putTemplate} from "./print-template.ts";
import {type Dosing, RxPage, type RxDrug, rxDrug, rxProtocol} from "./rx.ts";
import type {Lang} from "./texts.ts";
import {RX_TEXTS, type RxTexts} from "./texts-rx.ts";

/**
 * Printing in the e2e specs (contract step 2 § 3, § 4.2). Real paper and the browser's dialog stay manual: here `window.print`
 * is a stub that fires no `afterprint`, so the print root stays like a browser with its dialog open; print media comes from
 * `page.emulateMedia`, always back to `screen`; the PDF from `page.pdf`, read with pdf.js.
 *
 * **`page.pdf` itself fires `beforeprint` and `afterprint`** (measured on Chromium), so it ends the print job as a real print
 * does: the PDF holds the sheets, and the print root goes right after. A spec reads the DOM first (`printSheets`,
 * `expectOnlySheetPrinted`) and the PDF last; a second PDF needs a second click on Print.
 *
 * Text from the PDF: Latin letters and digits come out as whole runs, Arabic as one glyph per item in visual order (its letters
 * in their joined presentation forms), so "exactly once" relies on Latin tokens and Arabic text is read from the DOM under print media.
 */

const PRINT_ROOT = "#clinichub-print-root";
const PRINT_SHEET = `${PRINT_ROOT} [data-testid=print-sheet]`;

/** The state of the page when `window.print` was called. */
type PrintMoment = { sheets: number; fonts: string[] };

declare global {
    interface Window {
        __printCalls: number;
        __printMoments: PrintMoment[];
    }
}

/** 1 mm in PDF points. */
export const MM_PT = 72 / 25.4;
export const mmToPt = (mm: number) => mm * MM_PT;

/** An init script (before the first page load): `window.print` counts its calls, notes what it found, and fires no `afterprint`. */
export const stubPrint = (page: Page) => page.addInitScript(() => {
    window.__printCalls = 0;
    window.__printMoments = [];
    window.print = () => {
        window.__printCalls += 1;
        window.__printMoments.push({
            sheets: document.querySelectorAll("#clinichub-print-root [data-testid=print-sheet]").length,
            fonts: [...document.fonts].filter(face => face.family.includes("ClinicHub Print")).map(face => `${face.weight} ${face.status}`),
        });
    };
});

export const printCalls = (page: Page) => page.evaluate(() => window.__printCalls);

/** What `window.print` found, per call. */
export const printMoments = (page: Page) => page.evaluate(() => window.__printMoments);

/** `window.print` was called `calls` times in all (a long prescription may take its time: `timeout`). */
export const expectPrintCalls = async (page: Page, calls: number, timeout = 30_000) => {
    await expect.poll(() => printCalls(page), {message: "the calls of window.print", timeout}).toBe(calls);
};

/** The browser's dialog closed: what the browser fires, so the app ends the print job. */
export const finishPrint = (page: Page) => page.evaluate(() => { window.dispatchEvent(new Event("afterprint")); });

export const printRoot = (page: Page) => page.locator(PRINT_ROOT);

/**
 * Runs `read` under print media, then back to the screen by ending the emulation: `media: "screen"` would stay in force and make
 * `page.pdf` print the screen's layout.
 */
export const inPrintMedia = async <T>(page: Page, read: () => Promise<T>): Promise<T> => {
    await page.emulateMedia({media: "print"});
    let result: T;
    try {
        result = await read();
    } finally {
        await page.emulateMedia({media: null});
    }
    await screenBackToSize(page);
    return result;
};

/**
 * The page back at the project's size. Print media stretches a phone's page to the sheet (mobile emulation: 559 px for an A5), and it
 * comes back through 395 px over a few frames, later than `emulateMedia` returns; a click sent meanwhile opens nothing (TPL-140, run at 72eea87).
 */
const screenBackToSize = async (page: Page) => {
    const size = page.viewportSize();
    if (!size) return;
    await expect.poll(() => page.evaluate(() => new Promise<number[]>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve([window.innerWidth, window.innerHeight])));
    })), {message: "the page is back at the project's size after print media"}).toEqual([size.width, size.height]);
};

/**
 * The mouse off whatever it clicked last, its tooltip gone. A finger never hovers, but the test's mouse stays: on a phone the tooltip of Copy or
 * of Print lies over the next stacked button, and once the mouse moves onto that tooltip it stays open for good (TPL-103, TPL-133).
 */
export const moveMouseOff = async (page: Page) => {
    await page.mouse.move(0, 0);
    await expect(page.locator("[role=tooltip]"), "no tooltip left").toHaveCount(0);
};

export type SheetItem = {
    id: string;
    xMm: number; yMm: number; wMm: number; hMm: number;
    /** The item's text as laid out (`innerText`: line breaks included) */
    text: string;
    /** The item's HTML */
    html: string;
    /** The size and the family the content is set in */
    fontSizePt: number;
    fontFamily: string;
    /** The height of what it shows, past its box or not */
    contentHeightMm: number;
};

export type PrintSheet = {
    widthMm: number; heightMm: number;
    /** The sheet's direction, and what its overflow does */
    dir: string; overflow: string;
    items: Record<string, SheetItem>;
};

/** The sheets as laid out under print media, in mm from each sheet's top-left corner. */
export const printSheets = (page: Page): Promise<PrintSheet[]> => inPrintMedia(page, () =>
    page.locator(PRINT_SHEET).evaluateAll((sheets, mm) => sheets.map(sheet => {
        const s = sheet.getBoundingClientRect();
        const items = [...sheet.querySelectorAll<HTMLElement>("[data-item-id]")].map(element => {
            const r = element.getBoundingClientRect();
            // The prescription text's `.print-text`, or a short item's inner `span`
            const content = element.firstElementChild as HTMLElement | null;
            const style = getComputedStyle(content ?? element);
            return {
                id: element.dataset.itemId ?? "",
                xMm: (r.left - s.left) / mm, yMm: (r.top - s.top) / mm, wMm: r.width / mm, hMm: r.height / mm,
                text: element.innerText,
                html: element.innerHTML,
                fontSizePt: parseFloat(style.fontSize) * 72 / 96,
                fontFamily: style.fontFamily,
                contentHeightMm: (content?.getBoundingClientRect().height ?? 0) / mm,
            };
        });
        const own = getComputedStyle(sheet);
        return {
            widthMm: s.width / mm, heightMm: s.height / mm, dir: own.direction, overflow: own.overflow,
            items: Object.fromEntries(items.map(item => [item.id, item])),
        };
    }), MM));

/** An item's lines as printed: trimmed, the blank ones left out. */
export const linesOf = (text: string) => text.split("\n").map(line => line.trim()).filter(Boolean);

/** The prescription text's lines per sheet (`id`: the template's prescription text item). */
export const sheetLines = (sheets: PrintSheet[], id = "t") => sheets.map(sheet => linesOf(sheet.items[id].text));

/** Under print media only the print root shows: every sibling under `body` hidden, the page's margins gone. */
export const expectOnlySheetPrinted = (page: Page) => inPrintMedia(page, async () => {
    const shown = await page.evaluate(root => [...document.body.children]
        .filter(element => `#${element.id}` !== root && getComputedStyle(element).display !== "none")
        .map(element => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`), PRINT_ROOT);
    expect(shown, "nothing shows under print media but the print root").toEqual([]);
    await expect(printRoot(page), "the print root").toBeVisible();
    await expect(page.locator(PRINT_SHEET).first(), "a sheet").toBeVisible();
    const margins = await page.evaluate(() => [document.documentElement, document.body]
        .flatMap(element => [getComputedStyle(element).marginTop, getComputedStyle(element).marginLeft, getComputedStyle(element).paddingTop]));
    expect(new Set(margins), "no margin or padding on the page").toEqual(new Set(["0px"]));
});

/** The `@page` rules the document holds now (a rule left behind would size the app's own Ctrl+P). */
export const pageRules = (page: Page) => page.evaluate(() => {
    const count = (rules: CSSRuleList): number => [...rules].reduce((sum, rule) =>
        sum + (rule instanceof CSSPageRule ? 1 : rule instanceof CSSGroupingRule ? count(rule.cssRules) : 0), 0);
    return [...document.styleSheets].reduce((sum, sheet) => {
        try {
            return sum + count(sheet.cssRules);
        } catch {
            return sum; // A stylesheet of another origin can't be read
        }
    }, 0);
});

/** From a line's top to its baseline, in points: read by the browser, for this size in the sheet's font and line height. */
export const baselineOffsetPt = (page: Page, fontSizePt: number) => page.evaluate(pt => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;font:${pt}pt/1.4 "ClinicHub Print",sans-serif`;
    // An empty inline-block sits on the baseline
    probe.innerHTML = 'x<span style="display:inline-block;width:0;height:0"></span>';
    document.body.append(probe);
    const offset = probe.querySelector("span")!.getBoundingClientRect().bottom - probe.getBoundingClientRect().top;
    probe.remove();
    return offset * 72 / 96;
}, fontSizePt);

/** One run of text in the PDF: from the page's top-left corner, `yPt` being its baseline. */
export type PdfText = { text: string; xPt: number; yPt: number; widthPt: number; sizePt: number };
export type PdfPage = { widthPt: number; heightPt: number; items: PdfText[] };
export type PrintedPdf = { pages: PdfPage[]; bytes: Buffer };

const parsePdf = async (bytes: Buffer): Promise<PdfPage[]> => {
    // Loaded here, so the specs that never read a PDF don't load pdf.js
    const {getDocument} = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loading = getDocument({data: new Uint8Array(bytes), verbosity: 0});
    try {
        const document = await loading.promise;
        const pages: PdfPage[] = [];
        for (let number = 1; number <= document.numPages; number++) {
            const page = await document.getPage(number);
            const viewport = page.getViewport({scale: 1});
            const content = await page.getTextContent();
            const items: PdfText[] = [];
            for (const item of content.items) {
                if (!("str" in item) || !item.str.trim()) continue;
                const [xPt, yPt] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
                items.push({text: item.str, xPt, yPt, widthPt: item.width, sizePt: Math.hypot(item.transform[2], item.transform[3])});
            }
            pages.push({widthPt: viewport.width, heightPt: viewport.height, items});
        }
        return pages;
    } finally {
        await loading.destroy();
    }
};

/**
 * The page as a PDF, in print media, at the size its CSS says, parsed. It ends the print job (see above): read the DOM first.
 */
export const printedPdf = async (page: Page): Promise<PrintedPdf> => {
    const bytes = await page.pdf({preferCSSPageSize: true, printBackground: true});
    return {bytes, pages: await parsePdf(bytes)};
};

/** The page's text: top to bottom, each line left to right (Latin runs whole; an Arabic line comes out in visual order). */
export const pdfText = (page: PdfPage) => {
    const lines: PdfText[][] = [];
    for (const item of [...page.items].sort((a, b) => a.yPt - b.yPt)) {
        const line = lines.at(-1);
        // A vowel mark sits a little off its line's baseline
        if (line && Math.abs(line[0].yPt - item.yPt) < 1) line.push(item);
        else lines.push([item]);
    }
    return lines.map(line => line.sort((a, b) => a.xPt - b.xPt).map(item => item.text).join("")).join("\n");
};

/** How many times a Latin token is printed across the pages. */
export const timesPrinted = (pages: PdfPage[], token: string) =>
    pages.reduce((sum, page) => sum + pdfText(page).split(token).length - 1, 0);

/** A token printed once on this page: the run holding it. */
export const pdfRun = (page: PdfPage, token: string) => {
    const runs = page.items.filter(item => item.text.includes(token));
    expect(runs.length, `«${token}» once on the page: ${pdfText(page)}`).toBe(1);
    return runs[0];
};

/** The fonts embedded in the PDF (Chromium writes them uncompressed), without the subset's prefix. */
export const embeddedFonts = (bytes: Buffer) =>
    [...new Set([...bytes.toString("latin1").matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([^\s/>]+)/g)].map(match => match[1]))];

/** The PDF's page is this many mm, within 1 pt, in this orientation. */
export const expectPageSize = (page: PdfPage, widthMm: number, heightMm: number, what = "the PDF page") => {
    expect(Math.abs(page.widthPt - mmToPt(widthMm)), `${what}: ${page.widthPt} pt wide, expected ${widthMm} mm`).toBeLessThanOrEqual(1);
    expect(Math.abs(page.heightPt - mmToPt(heightMm)), `${what}: ${page.heightPt} pt high, expected ${heightMm} mm`).toBeLessThanOrEqual(1);
};

/** Within 1 mm of the template's place: the run's start (for text starting at the box's left) and its first line's baseline. */
export const expectRunAt = (run: PdfText, item: LayoutItem, baselinePt: number, what: string) => {
    expect(Math.abs(run.xPt - mmToPt(item.xMm)), `${what}: x is ${run.xPt / MM_PT} mm, expected ${item.xMm} mm`).toBeLessThanOrEqual(MM_PT);
    expectRunOnFirstLine(run, item, baselinePt, what);
};

/** Within 1 mm of the first line of the template's box, whatever the side the text starts on. */
export const expectRunOnFirstLine = (run: PdfText, item: LayoutItem, baselinePt: number, what: string) => {
    const expected = mmToPt(item.yMm) + baselinePt;
    expect(Math.abs(run.yPt - expected), `${what}: its baseline is at ${run.yPt} pt, expected ${expected} pt (${item.yMm} mm + the line's baseline)`).toBeLessThanOrEqual(MM_PT);
};

/** A run ending at the box's right edge, within 1 mm (right-to-left text starts there). */
export const expectRunEndsAtRight = (run: PdfText, item: LayoutItem, what: string) => {
    const right = mmToPt(item.xMm + item.wMm);
    expect(Math.abs(run.xPt + run.widthPt - right), `${what}: ends at ${run.xPt + run.widthPt} pt, the box's right edge is ${right} pt`).toBeLessThanOrEqual(MM_PT);
};

/** Every run of the page lies inside a box of the template (1 mm of grace), so nothing but the sheet printed. */
export const expectOnlyTemplateText = (page: PdfPage, layout: Layout, what: string) => {
    const outside = page.items.filter(run => !layout.items.some(item =>
        run.xPt >= mmToPt(item.xMm - 1) && run.xPt + run.widthPt <= mmToPt(item.xMm + item.wMm + 1)
        && run.yPt >= mmToPt(item.yMm - 1) && run.yPt <= mmToPt(item.yMm + item.hMm + 1)));
    expect(outside.map(run => `«${run.text}» at ${run.xPt / MM_PT}, ${run.yPt / MM_PT} mm`), `${what}: text outside the template's boxes`).toEqual([]);
};

/** The left edge of each character of the element's text, in order, under print media (they grow when it reads left to right). */
export const characterLefts = (element: Locator) => inPrintMedia(element.page(), () => element.evaluate(root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const lefts: number[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let i = 0; i < (node.textContent ?? "").length; i++) {
            const range = document.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            lefts.push(range.getBoundingClientRect().left);
        }
    }
    return lefts;
}));

/** Each line of a short item's text (its `\n`s), under print media, by `Range` rects: its text, and its left and right edges in mm from the box's left. */
export const itemLineEdges = (box: Locator) => inPrintMedia(box.page(), () => box.evaluate((root, mm) => {
    const {left} = root.getBoundingClientRect();
    const node = document.createTreeWalker(root, NodeFilter.SHOW_TEXT).nextNode();
    if (!node) throw new Error("the item holds no text");
    let start = 0;
    return (node.textContent ?? "").split("\n").map(text => {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + text.length);
        start += text.length + 1;
        const rect = range.getBoundingClientRect();
        return {text, leftMm: (rect.left - left) / mm, rightMm: (rect.right - left) / mm};
    });
}, MM));

/**
 * Parts of an item's text nodes, under print media, by `Range` rects: each `[the node's whole text, start, end]` gives its left and right
 * edges and its width, in mm from the box's left.
 */
export const textPartEdges = (box: Locator, parts: [text: string, start: number, end: number][]) => inPrintMedia(box.page(), () => box.evaluate((root, {parts, mm}) => {
    const {left} = root.getBoundingClientRect();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Node[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return parts.map(([text, start, end]) => {
        const node = nodes.find(candidate => candidate.textContent === text);
        if (!node) throw new Error(`no text node ${JSON.stringify(text)} among ${JSON.stringify(nodes.map(candidate => candidate.textContent))}`);
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        const rect = range.getBoundingClientRect();
        return {leftMm: (rect.left - left) / mm, rightMm: (rect.right - left) / mm, widthMm: rect.width / mm};
    });
}, {parts, mm: MM}));

/** The left and right edges, in mm from the page's left, of the PDF's line holding the run this expression finds. */
export const pdfLineEdges = (page: PdfPage, run: RegExp) => {
    const found = page.items.find(item => run.test(item.text));
    if (!found) throw new Error(`no run ${run} in ${pdfText(page)}`);
    const line = page.items.filter(item => Math.abs(item.yPt - found.yPt) < 1);
    return {
        leftMm: Math.min(...line.map(item => item.xPt)) / MM_PT,
        rightMm: Math.max(...line.map(item => item.xPt + item.widthPt)) / MM_PT,
    };
};

/** The item of a sheet on the page (for a look at its DOM). */
export const sheetItem = (page: Page, sheet: number, id: string) =>
    page.locator(PRINT_SHEET).nth(sheet).locator(`[data-item-id="${id}"]`);

/** A function item (`print-template.ts` has the full date). */
export const functionItem = (fn: "fullDate" | "time" | "dayOfWeek" | "dayOfMonth" | "isoDateTime" | "pageNumber", fields: Partial<LayoutItem> = {}): LayoutItem =>
    ({id: fn, kind: "function", function: fn, name: `دالة ${fn}`, xMm: 14, yMm: 20, wMm: 60, hMm: 8, fontSizePt: 11, ...fields});

/** The height in mm of a box that holds exactly this many lines (line height 1.4, contract § 6.6), one decimal, rounded up. */
export const boxForLines = (lines: number, fontSizePt: number) => Math.ceil(lines * fontSizePt * 1.4 / MM_PT * 10) / 10;

/** Print beside Copy, or in the editor. */
export const printButton = (scope: Locator, rt: RxTexts) => scope.getByRole("button", {name: rt.print, exact: true});

/** The pop-up asking for the manual inputs. */
export const printPopup = (page: Page, rt: RxTexts) =>
    page.getByRole("dialog").filter({has: page.getByRole("heading", {name: rt.printTitle, exact: true})});

/** Opens the editor («تعديل ونسخ») and waits for it: it's lazy-loaded. */
export const openEditor = async (page: Page, rt: RxTexts) => {
    await moveMouseOff(page);
    await page.getByRole("button", {name: rt.editAndCopy, exact: true}).click();
    const dialog = page.getByRole("dialog").filter({has: page.getByRole("heading", {name: rt.editorTitle, exact: true})});
    await expect(dialog.locator(".ql-editor")).toBeVisible({timeout: 30_000});
    return dialog;
};

export const closeEditor = async (dialog: Locator, rt: RxTexts) => {
    await dialog.getByRole("button", {name: rt.close, exact: true}).click();
    await expect(dialog).toBeHidden();
};

/** A protocol through the page: one click, and its drugs are the prescription's lines (so 40 lines take one click). */
const addProtocolLines = async (rx: RxPage, protocolName: string, count: number) => {
    await rx.openProtocolsTab();
    await rx.addProtocol(protocolName);
    await expect(rx.lines).toHaveCount(count);
};

/** The drugs as the prescription's lines, on a page already open (a reload shows the new protocol). */
export const addLines = async (rx: RxPage, data: Data, clinic: ClinicHandle, drugs: RxDrug[]) => {
    const protocol = await rxProtocol(data, clinic, drugs.map(drug => ({drug})));
    await rx.page.reload();
    await addProtocolLines(rx, protocol.name, drugs.length);
};

export type DrugSpec = { name: string; description?: string | null; dosing?: Dosing | null };

/**
 * A clinic with this template (none: `layout` null) and these drugs as its prescription's lines, its owner on the prescription
 * page, `window.print` stubbed.
 */
export const openPrescription = async (page: Page, data: Data, lang: Lang, layout: Layout | null, drugs: DrugSpec[]) => {
    const clinic = await data.clinic();
    if (layout) await putTemplate(data, clinic, layout);
    const made = await Promise.all(drugs.map(drug => rxDrug(data, clinic, drug)));
    const protocol = made.length ? await rxProtocol(data, clinic, made.map(drug => ({drug}))) : null;
    await stubPrint(page);
    await signIn(page, clinic.owner.phone);
    const rt = RX_TEXTS[lang];
    const rx = new RxPage(page, rt);
    if (protocol) await addProtocolLines(rx, protocol.name, made.length);
    return {clinic, rt, rx, drugs: made};
};

/**
 * Attaches a screenshot for the ready report (under print media: the sheets as they print). Of the full page by default, which
 * changes the viewport for a moment: with a mouse button held that cancels the drag, so a shot in the middle of one takes `"viewport"`.
 */
export const attachScreenshot = async (page: Page, testInfo: TestInfo, name: string, media: "screen" | "print" = "screen", extent: "fullPage" | "viewport" = "fullPage") => {
    const take = () => page.screenshot({fullPage: extent === "fullPage"});
    const body = media === "print" ? await inPrintMedia(page, take) : await take();
    await testInfo.attach(`${testInfo.project.name}: ${name}`, {body, contentType: "image/png"});
};

/** Attaches the printed PDF for the ready report. */
export const attachPdf = async (pdf: PrintedPdf, testInfo: TestInfo, name: string) => {
    await testInfo.attach(`${testInfo.project.name}: ${name}.pdf`, {body: pdf.bytes, contentType: "application/pdf"});
};

/** What a PDF page draws, by pdf.js's operators (step 4 contract § 8.4): `images` (image operators of any kind), `paths` (`constructPath`, what lines and frames become), `strokes`. */
export type PdfDrawing = { images: number; paths: number; strokes: number };

/**
 * Per page, what `getOperatorList` holds. TPL-636, TPL-666: `images` is 0. TPL-639: `paths` and `strokes` above 0 with `page.pdf({printBackground: false})`, so print a test page with
 * `pdfWithoutBackground` when a spec asks it. Never assert the exact thickness of a line (design TPL-639).
 */
export const pdfDrawing = async (bytes: Buffer): Promise<PdfDrawing[]> => {
    const {getDocument, OPS} = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const images = new Set<number>([
        OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat,
        OPS.paintImageMaskXObjectRepeat, OPS.paintInlineImageXObjectGroup, OPS.paintImageMaskXObjectGroup, OPS.paintSolidColorImageMask,
    ]);
    const strokes = new Set<number>([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
    const loading = getDocument({data: new Uint8Array(bytes), verbosity: 0});
    try {
        const document = await loading.promise;
        const pages: PdfDrawing[] = [];
        for (let number = 1; number <= document.numPages; number++) {
            const {fnArray} = await (await document.getPage(number)).getOperatorList();
            pages.push({
                images: fnArray.filter(fn => images.has(fn)).length,
                paths: fnArray.filter(fn => fn === OPS.constructPath).length,
                strokes: fnArray.filter(fn => strokes.has(fn)).length,
            });
        }
        return pages;
    } finally {
        await loading.destroy();
    }
};

/** The page as a PDF with background graphics off, as the browser's dialog does by default: only real borders and strokes print (TPL-639). It ends the print job, as `printedPdf` does. */
export const pdfWithoutBackground = (page: Page) => page.pdf({preferCSSPageSize: true, printBackground: false});
