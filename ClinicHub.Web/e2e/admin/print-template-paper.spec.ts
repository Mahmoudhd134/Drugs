import type {Page} from "@playwright/test";
import {expect, test} from "../support/fixtures.ts";
import {
    boxMm,
    COMPUTER_ONLY,
    customLayout,
    type Designer,
    designerShown,
    expectPaperFillsSheet,
    expectUntouched,
    getPapers,
    getTemplate,
    hitAt,
    layoutL,
    ONE_LANGUAGE,
    opacityTo,
    openDesigner,
    openDesignerWithPaper,
    outlineOnEdges,
    pressBox,
    PT_TEXTS,
    scrollAreaTo,
    sheetOnScreen,
    tabPath,
    trueZoom,
    typeInto,
    uploadPaper,
    zoomTo,
} from "../support/print-template.ts";
import {corruptPng, paperPng, solidPng, widePaperPng} from "../support/paper-files.ts";
import {inPrintMedia, pdfDrawing} from "../support/print.ts";
import {TEXTS} from "../support/texts.ts";
import {open} from "../support/ux.ts";

/** The paper image through the real app and API, with real files: step 4 design §§ 2 (A10–A14), 3, P1; contract § 4.5. */

const PAPER_COLOR: [number, number, number] = [250, 240, 200];
const paperFile = () => ({name: "paper.png", mimeType: "image/png", buffer: solidPng(148, 210, PAPER_COLOR)});

/** The distinct colors of this rectangle of the window, as `r,g,b`. */
const colorsIn = async (page: Page, clip: { x: number; y: number; width: number; height: number }) => {
    const shot = await page.screenshot({clip, scale: "css"});
    return new Set(await page.evaluate(async png => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d", {willReadFrequently: true})!;
        context.drawImage(image, 0, 0);
        const {data} = context.getImageData(0, 0, image.width, image.height);
        const colors = new Set<string>();
        for (let at = 0; at < data.length; at += 4) colors.add(`${data[at]},${data[at + 1]},${data[at + 2]}`);
        return [...colors];
    }, shot.toString("base64")));
};

/** The window back at the top and the sheet's corner in view, at true size. */
const sheetCornerInView = async (page: Page, designer: Designer) => {
    await zoomTo(designer, 100);
    await page.evaluate(() => window.scrollTo(0, 0));
    await scrollAreaTo(designer, 0, 0);
};

test.describe("The paper image @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("a PNG picked and Upload pressed: behind the boxes, filling the sheet, at 50%, with no Save; its name shows; the `img` is empty to a screen reader @TPL-650 @smoke",
        async ({page, data, lang, healthy}) => {
            const {designer} = await openDesigner(page, data, lang, layoutL());
            await expect(designer.paperImage).toHaveCount(0);

            await uploadPaper(designer, paperPng());

            await expect(designer.paperImage).toBeVisible();
            await expect(designer.paperRow("paper.png")).toBeVisible();
            await expect.poll(() => designer.paperImage.evaluate(image => (image as HTMLImageElement).naturalWidth), {message: "a real picture, decoded"}).toBe(148);
            await expectPaperFillsSheet(designer, "after the upload");
            await expect(designer.paperImage).toHaveCSS("opacity", "0.5");
            await expect(designer.paperOpacity).toHaveAttribute("aria-valuetext", "50%");
            await expect(designer.paperShow).toBeChecked();
            await expect(designer.paperImage).toHaveAttribute("alt", "");
            await expect(designer.paperImage).toHaveAttribute("aria-hidden", "true");
            const order = await designer.sheet.evaluate(sheet => [...sheet.children].map(child => child.getAttribute("data-testid") ?? "item"));
            expect(order[0], "the picture is the sheet's first child").toBe("template-paper-image");
            expect(order[1], "the grid comes after it").toBe("template-sheet-grid");
            await expectUntouched(designer);
            await healthy();
        });

    test("where the picture shows, an item below it still takes the press and drags; the picture can't be dragged and takes no press @TPL-661",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesignerWithPaper(page, data, lang, layoutL(), paperPng());
            await page.evaluate(() => {
                (window as unknown as {__dragStarts: number}).__dragStarts = 0;
                document.addEventListener("dragstart", () => {
                    (window as unknown as {__dragStarts: number}).__dragStarts += 1;
                });
            });
            await expect(designer.paperImage).toHaveAttribute("draggable", "false");
            await expect(designer.paperImage).toHaveCSS("pointer-events", "none");

            const rect = (await designer.box("m").boundingBox())!;
            expect(await hitAt(page, {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2})).toMatchObject({item: "m"});

            const before = await boxMm(designer.box("m"));
            const drag = await pressBox(page, designer, "m");
            await drag.by(30, 30, 4);
            await drag.release();
            await expect(designer.box("m")).toHaveAttribute("aria-pressed", "true");
            const after = await boxMm(designer.box("m"));
            expect(after.x, "the box moved").not.toBe(before.x);
            expect(after.y, "the box moved").not.toBe(before.y);

            // A press on the sheet where only the picture is: nothing below it moves, nothing is dragged
            const sheet = await sheetOnScreen(designer);
            const spot = {x: sheet.left + 8 * sheet.pxPerMm, y: sheet.top + 8 * sheet.pxPerMm};
            expect(await hitAt(page, spot)).toEqual({handle: null, item: null});
            const hit = await page.evaluate(({x, y}) => document.elementFromPoint(x, y)?.getAttribute("data-testid"), spot);
            expect(hit, "the picture takes no press").not.toBe("template-paper-image");
            await page.mouse.move(spot.x, spot.y);
            await page.mouse.down();
            await page.mouse.move(spot.x + 40, spot.y + 40, {steps: 4});
            await page.mouse.up();
            expect(await page.evaluate(() => (window as unknown as {__dragStarts: number}).__dragStarts), "no dragstart").toBe(0);
            expect(await boxMm(designer.box("m"))).toEqual(after);
        });

    test("a picture of other proportions stretches to fill the sheet exactly, and follows a new page size @TPL-662",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesignerWithPaper(page, data, lang, layoutL(), widePaperPng());

            const natural = await designer.paperImage.evaluate(image => (image as HTMLImageElement).naturalWidth / (image as HTMLImageElement).naturalHeight);
            expect(natural, "twice as wide as high").toBe(2);
            await expect(designer.paperImage).toHaveCSS("object-fit", "fill");
            await expectPaperFillsSheet(designer, "A5");

            await designer.paperSize.click();
            await page.getByRole("option", {name: pt.sizeA4, exact: true}).click();
            await expect(designer.sheet).toHaveAttribute("style", /width: 210mm/);
            await expectPaperFillsSheet(designer, "A4");

            await designer.paperSize.click();
            await page.getByRole("option", {name: pt.sizeCustom, exact: true}).click();
            await typeInto(designer.field(pt.pageWidth), "190");
            await designer.field(pt.pageHeight).click();
            await expect(designer.sheet).toHaveAttribute("style", /width: 190mm/);
            await expectPaperFillsSheet(designer, "a custom size");
        });

    test("at 25%, 100% and 200% the picture matches the sheet exactly @TPL-664",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            // The tallest custom sheet: Fit alone goes down to 25%
            const {designer} = await openDesignerWithPaper(page, data, lang, customLayout(420, 600), paperPng());

            await designer.fit.click();
            await expect.poll(() => trueZoom(designer), {message: "Fit's zoom"}).toBe(25);
            await expectPaperFillsSheet(designer, "at 25%");

            for (const zoom of [100, 200]) {
                await zoomTo(designer, zoom);
                await expect(designer.zoomPercent).toHaveText(`${zoom}%`);
                await expectPaperFillsSheet(designer, `at ${zoom}%`);
            }
        });

    test("a draft with no saved template: the upload works, and the picture stays after the draft is abandoned @TPL-671",
        async ({page, data, lang}) => {
            const {clinic, designer, pt} = await openDesigner(page, data, lang, null);
            await designer.create.click();
            await designerShown(designer);

            await uploadPaper(designer, paperPng("draft.png"));
            await expect(designer.paperRow("draft.png")).toBeVisible();
            await expect(designer.paperImage).toBeVisible();
            expect(await getTemplate(data, clinic), "no template row").toBeFalsy();

            await page.getByRole("tab", {name: TEXTS[lang].tabOverview, exact: true}).click();
            await designer.question.getByRole("button", {name: pt.leave, exact: true}).click();
            await expect(designer.sheet).toHaveCount(0);

            expect((await getPapers(data, clinic)).map(paper => paper.originalFileName)).toEqual(["draft.png"]);
            expect(await getTemplate(data, clinic), "still no template").toBeFalsy();

            await open(page, tabPath(clinic));
            await expect(page.getByText(pt.empty, {exact: true})).toBeVisible();
            await designer.create.click();
            await designerShown(designer);
            await expect(designer.paperImage).toBeVisible();
            await expect(designer.paperRow("draft.png")).toBeVisible();
        });

    test("no job, under print media (Ctrl+P): the picture isn't printed: hidden, and no image more in the PDF than with it switched off @TPL-710",
        async ({page, data, lang}) => {
            const {designer} = await openDesignerWithPaper(page, data, lang, layoutL(), paperPng());
            await expect(designer.paperImage).toBeVisible();

            await inPrintMedia(page, async () => {
                await expect(designer.paperImage).toBeHidden();
                await expect(designer.paperImage).toHaveCSS("display", "none");
            });

            const countImages = async (printed = page) => {
                const bytes = await printed.pdf({printBackground: true});
                return (await pdfDrawing(bytes)).reduce((sum, drawing) => sum + drawing.images, 0);
            };
            const withPicture = await countImages();
            await designer.paperShow.click();
            await expect(designer.paperImage).toHaveCount(0);
            expect(withPicture, "the same as with no picture on the sheet").toBe(await countImages());

            // The control, on a page of its own: the count isn't blind, so every "no image" of TPL-636, TPL-666 and TPL-719 means something
            const control = await page.context().newPage();
            await control.setContent(`<img src="data:image/png;base64,${paperPng().buffer.toString("base64")}" alt="">`);
            await expect(control.locator("img")).toBeVisible();
            expect(await countImages(control), "a real `img` in a PDF counts").toBeGreaterThanOrEqual(1);
            await control.close();
        });

    test("at 100% opacity the grid and the box's marks still show above the picture @TPL-713",
        async ({page, data, lang}) => {
            // No press on a box: a selected box's handles would cover its edge, and the marks are read below
            const {designer} = await openDesignerWithPaper(page, data, lang, layoutL(), paperFile());

            await opacityTo(designer, 100);
            await expect(designer.paperOpacity).toHaveAttribute("aria-valuetext", "100%");
            await expect(designer.paperImage).toHaveCSS("opacity", "1");
            await sheetCornerInView(page, designer);

            const sheet = await sheetOnScreen(designer);
            const colors = await colorsIn(page, {
                x: sheet.left + 6 * sheet.pxPerMm, y: sheet.top + 6 * sheet.pxPerMm, width: 20 * sheet.pxPerMm, height: 20 * sheet.pxPerMm,
            });
            expect(colors.has(PAPER_COLOR.join(",")), "the picture shows, solid").toBe(true);
            expect(colors.size, "the grid's lines above it").toBeGreaterThan(1);

            await designer.box("m").scrollIntoViewIfNeeded();
            const edges = await outlineOnEdges(page, designer.box("m"));
            for (const [edge, share] of Object.entries(edges)) {
                expect(share, `how much of the box's ${edge} edge shows its mark`).toBeGreaterThanOrEqual(0.9);
            }
        });

    test("a PNG's signature with a broken body: stored, then the message with Retry on a blank sheet that still works @TPL-718",
        async ({page, data, lang, healthy}) => {
            const {clinic, designer} = await openDesigner(page, data, lang, layoutL());

            await uploadPaper(designer, corruptPng());

            await expect(designer.paperLoadFailed).toContainText(PT_TEXTS[lang].paperLoadFailed);
            await expect(designer.paperImage).toHaveCount(0);
            await expect(designer.paperRow("broken.png")).toBeVisible();
            expect((await getPapers(data, clinic)).map(paper => paper.originalFileName)).toEqual(["broken.png"]);

            const retry = designer.paperLoadFailed.getByRole("button", {name: TEXTS[lang].retry, exact: true});
            await expect(retry).toBeVisible();
            await retry.click();
            await expect(designer.paperLoadFailed).toContainText(PT_TEXTS[lang].paperLoadFailed);

            await designer.box("m").click();
            await expect(designer.box("m")).toHaveAttribute("aria-pressed", "true");
            await healthy();
        });
});
