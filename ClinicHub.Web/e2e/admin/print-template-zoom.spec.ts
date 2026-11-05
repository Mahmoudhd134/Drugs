import {expect, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {expectPageSize, expectPrintCalls, openPrescription, printButton, printedPdf, printRoot, printSheets} from "../support/print.ts";
import {
    A4,
    A5,
    areaScroll,
    COMPUTER_ONLY,
    customLayout,
    dateItem,
    designerOf,
    designerShown,
    expectClose,
    expectFit,
    expectMm,
    expectUnderPointer,
    getTemplate,
    layoutL,
    MM,
    ONE_LANGUAGE,
    openDesigner,
    plainLayout,
    pressBox,
    pressEntry,
    putTemplate,
    reopenDesigner,
    saveLayout,
    scrollAreaTo,
    staticItem,
    tabPath,
    textItem,
    trueZoom,
    zoomTo,
} from "../support/print-template.ts";
import {expectNoCutOrOverlap, pageChecks} from "../support/ux.ts";

/** Zoom and Fit, through the real app: step 3 design § 3 "Zoom", "Settled: Zoom"; contract § 3.2, § 3.3, § 3.8. */

test.describe("Print template: zoom and Fit @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("A5 and A4: Fit shows the whole sheet on opening, at 1280 x 720 too, below 50% when needed, never below 25% @TPL-460",
        async ({page, data, lang}) => {
            const {clinic, designer} = await openDesigner(page, data, lang, layoutL());

            for (const height of [800, 720]) {
                await page.setViewportSize({width: 1280, height});
                for (const sheet of [A5, A4]) {
                    await test.step(`${sheet.size} at 1280 x ${height}`, async () => {
                        await putTemplate(data, clinic, layoutL({page: sheet}));
                        await reopenDesigner(page, designer);
                        await expectFit(designer, sheet.size);
                        const zoom = await trueZoom(designer);
                        expect(zoom).toBeGreaterThanOrEqual(25);
                        await expect(designer.zoomPercent).toHaveText(`${Math.round(zoom)}%`);
                        if (sheet.size === "A4" && height === 720) expect(zoom, "A4 at 50% is 561 px tall: too tall for this window").toBeLessThan(50);
                    });
                }
            }
        });

    test("a drag at 50%, 100% and 200%: the item lands under the pointer, with the same mm for the same sheet point @TPL-462",
        async ({page, data, lang}) => {
            const {designer} = await openDesigner(page, data, lang, plainLayout({xMm: 20}));
            const box = designer.box("m");

            for (const zoom of [50, 100, 200]) {
                await test.step(`${zoom}%`, async () => {
                    await zoomTo(designer, zoom);
                    await scrollAreaTo(designer, 0, 0);
                    const drag = await pressBox(page, designer, "m");
                    await drag.toMm(32, 26);
                    await expectMm(box, {x: 32, y: 26}, "while dragging");
                    await expectUnderPointer(designer, box, drag);
                    await drag.release();
                    await expectMm(box, {x: 32, y: 26, w: 40, h: 8}, "dropped");
                    await designer.undo.click();
                    await expectMm(box, {x: 20, y: 20}, "undone");
                });
            }
        });

    test("a page-size change re-fits; a window resize keeps the zoom @TPL-464",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, layoutL());
            await expectFit(designer, "A5");
            const a5 = await trueZoom(designer);

            await designer.paperSize.click();
            await page.getByRole("option", {name: pt.sizeA4, exact: true}).click();
            await expect(designer.sheet).toHaveAttribute("style", /width: 210mm/);
            await expectFit(designer, "A4 after the change");
            const a4 = await trueZoom(designer);
            expect(a4).toBeLessThan(a5);

            await page.setViewportSize({width: 1280, height: 640});
            await expect.poll(() => trueZoom(designer), {message: "a lower window keeps the zoom"}).toBeCloseTo(a4, 1);
            await zoomTo(designer, 100);
            await page.setViewportSize({width: 1280, height: 800});
            await expect(designer.zoomPercent).toHaveText("100%");
            await expect.poll(() => trueZoom(designer), {message: "a higher window keeps it too"}).toBeCloseTo(100, 1);
        });

    test("a template saved while viewing at 200%, when printed: the sheet is true size, with no handle in print @TPL-465",
        async ({page, data, lang, newBrowser}) => {
            test.slow();
            const layout = layoutL({items: [textItem(), dateItem(), staticItem({text: "Zstatic"})]});
            const {clinic, rx, rt} = await openPrescription(page, data, lang, layout, [{name: `Zdrug${unique()}`}]);

            const {page: adminPage} = await newBrowser();
            const designer = designerOf(adminPage, lang);
            await signInSuperAdmin(adminPage, tabPath(clinic));
            await designerShown(designer);
            await zoomTo(designer, 200);
            await designer.box("s").click();
            await adminPage.keyboard.press("Shift+ArrowRight");
            await expectMm(designer.box("s"), {x: 19}, "moved at 200%");
            await saveLayout(adminPage, designer);
            await expect(designer.zoomPercent).toHaveText("200%");
            const saved = (await getTemplate(data, clinic))!.layout;
            expect(JSON.stringify(saved), "no zoom in the layout").not.toMatch(/zoom/i);
            const item = saved.items[2];
            expect(item.xMm).toBe(19);

            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            const [sheet] = await printSheets(page);
            expect(Math.abs(sheet.widthMm - 148), `the sheet is ${sheet.widthMm} mm wide`).toBeLessThanOrEqual(0.1);
            expect(Math.abs(sheet.heightMm - 210), `the sheet is ${sheet.heightMm} mm high`).toBeLessThanOrEqual(0.1);
            const printed = sheet.items.s;
            expectClose({x: printed.xMm, y: printed.yMm, w: printed.wMm, h: printed.hMm}, {x: item.xMm, y: item.yMm, w: item.wMm, h: item.hMm}, "the item moved at 200%");
            await expect(printRoot(page).locator("[data-handle], [data-testid=template-guide], [data-testid=template-overlay]")).toHaveCount(0);

            const {pages} = await printedPdf(page);
            expectPageSize(pages[0], 148, 210);
        });

    test("the toolbar's buttons: each has its name and tooltip; axe and the cut-text check pass with each state, in a drag and with the ghost @TPL-480",
        async ({page, data, lang}) => {
            test.slow();
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());
            const main = page.locator("main");
            const check = async (what: string) => {
                await pageChecks(page, what);
                await expectNoCutOrOverlap(main, what);
            };

            for (const name of [pt.undo, pt.redo, pt.zoomOut, pt.zoomIn, pt.fit]) {
                await test.step(name, async () => {
                    const button = designer.toolbar.getByRole("button", {name, exact: true});
                    await expect(button).toHaveCount(1);
                    // Force: the off ones are reached through their `span` (contract § 3.2)
                    await button.hover({force: true});
                    await expect(page.getByRole("tooltip").filter({hasText: name})).toHaveText(name);
                    await page.mouse.move(0, 0);
                    await expect(page.getByRole("tooltip")).toHaveCount(0);
                });
            }
            await expect(designer.zoomPercent).toHaveText(/^\d+%$/);
            await check("the toolbar at Fit, nothing to undo");

            const moved = await pressBox(page, designer, "m");
            await moved.toMm(60, 40);
            await expectMm(designer.box("m"), {x: 60, y: 40}, "in a drag");
            await check("in a drag, the handles showing");
            await moved.release();
            await check("something to undo");

            await designer.undo.click();
            await expect(designer.redo).toBeEnabled();
            await check("something to redo");

            await zoomTo(designer, 200);
            await expect(designer.zoomIn).toBeDisabled();
            await check("at 200%");
            await zoomTo(designer, 50);
            await expect(designer.zoomOut).toBeDisabled();
            await check("at 50%");

            const fromPanel = await pressEntry(page, designer, pt.manualInput);
            await fromPanel.toMm(60, 40);
            await expect(designer.ghost).toBeVisible();
            await pageChecks(page, "with the ghost");
            await page.keyboard.press("Escape");
            await fromPanel.release();
        });

    test("420 x 600 mm at Fit: below 50%, minus off, plus goes to 50%, the area scrolls both ways; A4 at 200%: all four corners reachable by scroll @TPL-580",
        async ({page, data, lang}) => {
            const {clinic, designer} = await openDesigner(page, data, lang, customLayout(420, 600));

            const fit = await trueZoom(designer);
            expect(fit).toBeLessThan(50);
            expect(fit).toBeGreaterThanOrEqual(25);
            await expect(designer.zoomOut).toBeDisabled();
            await designer.zoomIn.click();
            await expect(designer.zoomPercent).toHaveText("50%");
            await expect.poll(() => trueZoom(designer)).toBeCloseTo(50, 1);
            const large = await areaScroll(designer);
            expect(large.maxLeft, "scrolls sideways").toBeGreaterThan(0);
            expect(large.maxTop, "scrolls down").toBeGreaterThan(0);

            await putTemplate(data, clinic, layoutL({page: A4}));
            await reopenDesigner(page, designer);
            await zoomTo(designer, 200);
            const {maxLeft, maxTop} = await areaScroll(designer);
            for (const [xEnd, yEnd] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
                await test.step(`corner ${xEnd}, ${yEnd}`, async () => {
                    await scrollAreaTo(designer, maxLeft * xEnd, maxTop * yEnd);
                    const seen = await designer.area.evaluate(area => {
                        const box = area.getBoundingClientRect();
                        const sheet = area.querySelector("[data-testid=template-sheet]")!.getBoundingClientRect();
                        return {
                            scrollLeft: area.scrollLeft,
                            left: sheet.left - box.left,
                            top: sheet.top - box.top,
                            right: box.left + area.clientWidth - sheet.right,
                            bottom: box.top + area.clientHeight - sheet.bottom,
                        };
                    });
                    expect(seen.scrollLeft, "never negative").toBeGreaterThanOrEqual(0);
                    expect(xEnd ? seen.right : seen.left, "the sheet's side in reach").toBeGreaterThanOrEqual(0);
                    expect(yEnd ? seen.bottom : seen.top, "the sheet's end in reach").toBeGreaterThanOrEqual(0);
                });
            }
        });

    test("at 50% the area has no scroll left over from the unscaled size @TPL-584",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, layoutL());
            await zoomTo(designer, 50);

            const frame = (await designer.frame.boundingBox())!;
            expect(Math.abs(frame.width - 148 * MM / 2), `the frame is ${frame.width} px wide`).toBeLessThanOrEqual(1);
            expect(Math.abs(frame.height - 210 * MM / 2), `the frame is ${frame.height} px high`).toBeLessThanOrEqual(1);
            const {maxLeft, maxTop} = await areaScroll(designer);
            expect([maxLeft, maxTop], "nothing to scroll").toEqual([0, 0]);
        });

    test("Fit at a non-step value: plus and minus go to the next multiple of 25, and the percentage shows a whole number @TPL-587",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            await page.setViewportSize({width: 1280, height: 720});
            const {designer} = await openDesigner(page, data, lang, layoutL());
            const fit = await trueZoom(designer);
            await expect(designer.zoomPercent).toHaveText(`${Math.round(fit)}%`);
            await expect(designer.zoomPercent).toHaveText(/^\d+%$/);
            expect(fit % 25, `Fit is ${fit}%: this case needs a non-step value`).not.toBeCloseTo(0, 1);

            await designer.zoomIn.click();
            await expect(designer.zoomPercent).toHaveText(`${(Math.floor(fit / 25) + 1) * 25}%`);

            await designer.fit.click();
            await expect(designer.zoomPercent).toHaveText(`${Math.round(fit)}%`);
            if (fit > 50) {
                await designer.zoomOut.click();
                await expect(designer.zoomPercent).toHaveText(`${Math.floor(fit / 25) * 25}%`);
            } else {
                await expect(designer.zoomOut, "below 50% only Fit goes").toBeDisabled();
            }
        });

    test("each way the sheet first appears (a load, «إنشاء قالب», widening from below 900 px): Fit is computed then, from a measured area @TPL-588",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            await test.step("a load", async () => {
                const {designer} = await openDesigner(page, data, lang, layoutL());
                await expectFit(designer, "a load");
            });

            await test.step("«إنشاء قالب»", async () => {
                const {designer} = await openDesigner(page, data, lang, null);
                await designer.create.click();
                await designerShown(designer);
                await expectFit(designer, "a new sheet");
            });

            await test.step("widening", async () => {
                await page.setViewportSize({width: 899, height: 800});
                const clinic = await data.clinic();
                await putTemplate(data, clinic, layoutL());
                const designer = designerOf(page, lang);
                await signInSuperAdmin(page, tabPath(clinic));
                await expect(page.getByText(designer.pt.desktopOnly, {exact: true})).toBeVisible();
                await expect(designer.sheet).toHaveCount(0);
                await page.setViewportSize({width: 1280, height: 800});
                await designerShown(designer);
                await expectFit(designer, "after widening");
            });
        });
});
