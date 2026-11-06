import type {Locator, Page} from "@playwright/test";
import {expect, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    expectPageSize,
    expectPrintCalls,
    expectRunShift,
    functionItem,
    inPrintMedia,
    moveMouseOff,
    openPrescription,
    pdfDrawing,
    pdfRun,
    pdfText,
    type PdfText,
    pdfWithoutBackground,
    printButton,
    printedPdf,
    printPopup,
    printRoot,
    printSheet,
    printSheets,
    rulerNumber,
    runMm,
    stubPrint,
} from "../support/print.ts";
import {
    A4,
    A5,
    COMPUTER_ONLY,
    type Designer,
    designerOf,
    designerShown,
    expectClose,
    fiftyItems,
    getTemplate,
    type Layout,
    layoutL,
    manualItem,
    ONE_LANGUAGE,
    openDesigner,
    openDesignerWithPaper,
    rulersOn,
    staticItem,
    tabPath,
    textItem,
    typeInto,
    zoomTo,
} from "../support/print-template.ts";
import {paperPng} from "../support/paper-files.ts";
import {pageChecks} from "../support/ux.ts";

/** Test print through the real app, read by the browser's own engine: step 4 design §§ 2, 3, P3, P4; contract §§ 4.2, 4.4, 8.4. */

const pressedOnce = async (page: Page, designer: Designer, calls = 1) => {
    await moveMouseOff(page);
    await designer.testPrint.click();
    await expectPrintCalls(page, calls);
};

const frames = (scope: Locator) => scope.getByTestId("test-print-frame");

test.describe("Test print @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("an unsaved draft: the print holds the draft's values, no API request is sent, Save stays on, the API keeps the saved layout @TPL-630 @smoke",
        async ({page, data, lang}) => {
            await stubPrint(page);
            const u = unique();
            const layout: Layout = {schemaVersion: 1, page: A5, items: [textItem(), staticItem({text: `Zsaved${u}`})]};
            const {clinic, designer, pt} = await openDesigner(page, data, lang, layout);

            await designer.box("s").click();
            await designer.field(pt.text).fill(`Zdraft${u}`);
            await typeInto(designer.calibrationX, "3");
            await typeInto(designer.calibrationY, "-2");
            await designer.calibrationX.click();

            const sent: string[] = [];
            page.on("request", request => {
                if (new URL(request.url()).pathname.startsWith("/api/v1")) sent.push(`${request.method()} ${request.url()}`);
            });
            await pressedOnce(page, designer);

            const [sheet] = await printSheets(page);
            expect(sheet.items.s.text).toBe(`Zdraft${u}`);
            expectClose(
                {x: sheet.items.s.xMm, y: sheet.items.s.yMm, w: sheet.items.s.wMm, h: sheet.items.s.hMm},
                {x: 14 + 3, y: 175 - 2, w: 60, h: 8},
                "the static text",
            );
            expect(sent, "no API request").toEqual([]);
            await expect(designer.save).toBeEnabled();
            const saved = await getTemplate(data, clinic);
            expect(saved?.layout.calibration).toEqual({xMm: 0, yMm: 0});
            expect(saved?.layout.items[1].text).toBe(`Zsaved${u}`);
            await pageChecks(page, "the designer after a test print");
        });

    test("with a correction, at any zoom: the boxes shift by X and Y, the top ruler's ticks by X, the left's by Y; each ruler's line stays 6 mm in @TPL-635",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            await stubPrint(page);
            const u = unique();
            const token = `Zstatic${u}`;
            const layout: Layout = {schemaVersion: 1, page: A5, items: [textItem(), staticItem({text: token})]};
            const {designer} = await openDesigner(page, data, lang, layout);
            let calls = 0;

            const testPage = async () => {
                await pressedOnce(page, designer, ++calls);
                const rulers = await inPrintMedia(page, () => rulersOn(printSheet(page)));
                const [sheet] = await printSheets(page);
                const pdf = await printedPdf(page);
                expect(pdf.pages, "one page").toHaveLength(1);
                expectPageSize(pdf.pages[0], A5.widthMm, A5.heightMm);
                return {rulers, sheet, page: pdf.pages[0]};
            };

            const atZero = await testPage();

            await typeInto(designer.calibrationX, "3");
            await typeInto(designer.calibrationY, "2");
            await designer.calibrationX.click();

            for (const zoom of [100, 200]) {
                await test.step(`designed at ${zoom}%`, async () => {
                    await zoomTo(designer, zoom);
                    const moved = await testPage();

                    expectClose(
                        {x: moved.sheet.items.s.xMm, y: moved.sheet.items.s.yMm, w: moved.sheet.items.s.wMm, h: moved.sheet.items.s.hMm},
                        {x: atZero.sheet.items.s.xMm + 3, y: atZero.sheet.items.s.yMm + 2, w: atZero.sheet.items.s.wMm, h: atZero.sheet.items.s.hMm},
                        "the box on the print's sheet",
                    );
                    expectRunShift(pdfRun(atZero.page, token), pdfRun(moved.page, token), 3, 2, "the box in the PDF");

                    expect(Math.abs(moved.rulers.top.ticks["50"] - 53), "the top ruler's 50 by X").toBeLessThanOrEqual(0.1);
                    expect(Math.abs(moved.rulers.left.ticks["50"] - 52), "the left ruler's 50 by Y").toBeLessThanOrEqual(0.1);
                    expect(Math.abs(moved.rulers.top.lineMm - 6), "the top ruler's line").toBeLessThanOrEqual(0.1);
                    expect(Math.abs(moved.rulers.left.lineMm - 6), "the left ruler's line").toBeLessThanOrEqual(0.1);

                    expectRunShift(rulerNumber(atZero.page, "top", "50"), rulerNumber(moved.page, "top", "50"), 3, 0, "the top ruler's 50 in the PDF");
                    expectRunShift(rulerNumber(atZero.page, "left", "50"), rulerNumber(moved.page, "left", "50"), 0, 2, "the left ruler's 50 in the PDF");
                });
            }
        });

    test("a picture on the sheet: the print root holds no `img` and the test PDF has no image operations @TPL-636",
        async ({page, data, lang}) => {
            await stubPrint(page);
            const {designer} = await openDesignerWithPaper(page, data, lang, layoutL(), paperPng());

            await pressedOnce(page, designer);

            await expect(printRoot(page).locator("img")).toHaveCount(0);
            const pdf = await printedPdf(page);
            expect((await pdfDrawing(pdf.bytes)).map(drawing => drawing.images), "no image in the PDF").toEqual(pdf.pages.map(() => 0));
        });

    test("50 boxes and a 20 mm prescription box at 36 pt: exactly one page, every box framed @TPL-637",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            await stubPrint(page);
            const full = fiftyItems();
            const layout: Layout = {...full, items: [textItem({xMm: 14, yMm: 200, wMm: 120, hMm: 20, fontSizePt: 36}), ...full.items.slice(1)]};
            const {designer} = await openDesigner(page, data, lang, layout);

            await pressedOnce(page, designer);

            const sheets = await printSheets(page);
            expect(sheets, "one sheet").toHaveLength(1);
            expect(Object.keys(sheets[0].items)).toHaveLength(50);
            await expect(frames(printRoot(page))).toHaveCount(50);
            const pdf = await printedPdf(page);
            expect(pdf.pages, "one PDF page").toHaveLength(1);
            expectPageSize(pdf.pages[0], A4.widthMm, A4.heightMm);
        });

    test("with background graphics off: frames and ruler lines are real: a computed border and path operations @TPL-639",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            await stubPrint(page);
            const {designer} = await openDesigner(page, data, lang, layoutL());

            await pressedOnce(page, designer);

            const computed = await inPrintMedia(page, () => frames(printRoot(page)).evaluateAll(all => all.map(frame => {
                const style = getComputedStyle(frame);
                return {style: style.borderTopStyle, width: parseFloat(style.borderTopWidth), position: style.position, isLast: frame.parentElement?.lastElementChild === frame};
            })));
            expect(computed).toHaveLength(layoutL().items.length);
            for (const frame of computed) {
                expect(frame.style).toBe("solid");
                expect(frame.width).toBeGreaterThan(0);
                expect(frame.position).toBe("absolute");
                expect(frame.isLast, "the frame is the box's last child").toBe(true);
            }

            const bytes = await pdfWithoutBackground(page);
            const [drawing] = await pdfDrawing(bytes);
            expect(drawing.paths, "path operations").toBeGreaterThan(0);
            expect(drawing.strokes, "strokes").toBeGreaterThan(0);
        });

    test("the print root shows `2/3` for the page number and the manual input's name, neither empty @TPL-707",
        async ({page, data, lang}) => {
            await stubPrint(page);
            const u = unique();
            const name = `Zname${u}`;
            const layout: Layout = {
                schemaVersion: 1,
                page: A5,
                items: [textItem(), manualItem({name}), functionItem("pageNumber", {id: "pg", name: "الصفحة", xMm: 14, yMm: 20, wMm: 30, hMm: 8})],
            };
            const {designer} = await openDesigner(page, data, lang, layout);

            await pressedOnce(page, designer);

            const [sheet] = await printSheets(page);
            expect(sheet.items.pg.text).toBe("2/3");
            expect(sheet.items.m.text).toBe(name);
            const pdf = await printedPdf(page);
            expect(pdfText(pdf.pages[0])).toContain("2/3");
            expect(pdfText(pdf.pages[0])).toContain(name);
        });

    test("one template: each value on the test page sits where the real print puts it, within 0.1 mm, and wraps the same @TPL-711",
        async ({page, data, lang, newBrowser}) => {
            const u = unique();
            const name = `Zname${u}`;
            const when = new Date(2026, 10, 5, 14, 30);
            const wrapped = `Zalpha bravo charlie delta echo foxtrot golf ${u}`;
            const iso = functionItem("isoDateTime", {id: "iso", name: "الوقت", xMm: 20, yMm: 20, wMm: 60, hMm: 8});
            const manual = manualItem({name, xMm: 20, yMm: 35, wMm: 70, hMm: 8});
            const fixed = staticItem({text: wrapped, xMm: 20, yMm: 180, wMm: 30, hMm: 25, fontSizePt: 11});
            const layout: Layout = {schemaVersion: 1, page: A5, items: [textItem({xMm: 14, yMm: 60, wMm: 120, hMm: 90}), iso, manual, fixed], calibration: {xMm: 2, yMm: -1}};
            // The runs inside the three boxes, moved by the correction: the rulers and the prescription text's sample lie elsewhere
            const inBoxes = (runs: PdfText[]) => runs
                .filter(run => [iso, manual, fixed].some(item => {
                    const {x, y} = runMm(run);
                    return x >= item.xMm + 1 && x <= item.xMm + item.wMm + 2 && y >= item.yMm - 2 && y <= item.yMm + item.hMm + 1;
                }))
                .map(run => ({text: run.text, ...runMm(run)}))
                .sort((a, b) => a.y - b.y || a.x - b.x);

            // The real print, a member of the clinic in a browser of its own
            const other = await newBrowser();
            await other.page.clock.setFixedTime(when);
            const {clinic, rx, rt} = await openPrescription(other.page, data, lang, layout, [{name: `Zdrug${u}`}]);
            await printButton(rx.panel, rt).click();
            const popup = printPopup(other.page, rt);
            await popup.getByRole("textbox").first().fill(name);
            await printButton(popup, rt).click();
            await expect(popup).toBeHidden();
            await expectPrintCalls(other.page, 1);
            const [real] = await printSheets(other.page);
            const realPdf = await printedPdf(other.page);

            // The test page, the super admin, the same template
            await stubPrint(page);
            await page.clock.setFixedTime(when);
            const designer = designerOf(page, lang);
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);
            await pressedOnce(page, designer);
            const [sample] = await printSheets(page);
            const samplePdf = await printedPdf(page);

            for (const item of [iso, manual, fixed]) {
                const [a, b] = [sample.items[item.id], real.items[item.id]];
                expectClose({x: a.xMm, y: a.yMm, w: a.wMm, h: a.hMm}, {x: b.xMm, y: b.yMm, w: b.wMm, h: b.hMm}, `the box ${item.id}`);
                expect(a.text, `${item.id}: the same value`).toBe(b.text);
                expect(Math.abs(a.contentHeightMm - b.contentHeightMm), `${item.id}: it wraps the same`).toBeLessThanOrEqual(0.1);
                expect(a.fontSizePt).toBe(b.fontSizePt);
            }
            const [sampleRuns, realRuns] = [inBoxes(samplePdf.pages[0].items), inBoxes(realPdf.pages[0].items)];
            expect(sampleRuns.map(run => run.text), "the same lines").toEqual(realRuns.map(run => run.text));
            expect(sampleRuns.length).toBeGreaterThanOrEqual(5);
            for (const [index, run] of sampleRuns.entries()) {
                expect(Math.abs(run.x - realRuns[index].x), `«${run.text}»: x`).toBeLessThanOrEqual(0.1);
                expect(Math.abs(run.y - realRuns[index].y), `«${run.text}»: y`).toBeLessThanOrEqual(0.1);
            }
        });

    for (const shift of [-6, -20]) {
        test(`X = Y = ${shift}: both rulers are still on the page, their lines 6 mm in, their ticks only on the sheet @TPL-712`,
            async ({page, data, lang}) => {
                test.skip(lang !== "ar", ONE_LANGUAGE);
                await stubPrint(page);
                const {designer} = await openDesigner(page, data, lang, {...layoutL(), calibration: {xMm: shift, yMm: shift}});
                await expect(designer.calibrationX).toHaveValue(String(shift));

                await pressedOnce(page, designer);

                const {top, left} = await inPrintMedia(page, () => rulersOn(printSheet(page)));
                for (const [ruler, length, what] of [[top, A5.widthMm, "top"], [left, A5.heightMm, "left"]] as const) {
                    expect(Math.abs(ruler.lineMm - 6), `the ${what} ruler's line`).toBeLessThanOrEqual(0.1);
                    const places = Object.values(ruler.ticks);
                    expect(Math.min(...places), `the ${what} ruler starts on the sheet`).toBeGreaterThanOrEqual(-0.1);
                    expect(Math.max(...places), `the ${what} ruler ends on the sheet`).toBeLessThanOrEqual(length + 0.1);
                    // It's counted from the sheet's corner with no correction: the sheet's corner reads the shift
                    expect(Math.abs(ruler.ticks[String(-shift)]), `the ${what} ruler's ${-shift} at the corner`).toBeLessThanOrEqual(0.1);
                    expect(ruler.ticks["0"], `the ${what} ruler's 0 left the sheet`).toBeUndefined();
                    expect(ruler.labels.length, `the ${what} ruler has numbers`).toBeGreaterThan(0);
                }
                const pdf = await printedPdf(page);
                expect(pdf.pages).toHaveLength(1);
                const [drawing] = await pdfDrawing(pdf.bytes);
                expect(drawing.strokes, "the lines are drawn").toBeGreaterThan(0);
            });
    }
});
