import type {Locator} from "@playwright/test";
import {expect, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {expectPageSize, expectPrintCalls, openPrescription, printButton, printedPdf, printRoot, printSheets} from "../support/print.ts";
import {
    A4,
    A5,
    areaRect,
    areaScroll,
    boxMm,
    boxOutlines,
    COMPUTER_ONLY,
    customLayout,
    dateItem,
    type Designer,
    designerOf,
    designerShown,
    expectClose,
    expectFit,
    expectMm,
    expectUnderPointer,
    getTemplate,
    type Layout,
    layoutL,
    manualItem,
    MM,
    ONE_LANGUAGE,
    openDesigner,
    outlineOnEdges,
    plainLayout,
    pressBox,
    pressEntry,
    putTemplate,
    reopenDesigner,
    saveLayout,
    scrollAreaTo,
    sheetOnScreen,
    staticItem,
    tabPath,
    textItem,
    trueZoom,
    zoomTo,
} from "../support/print-template.ts";
import {expectNoCutOrOverlap, pageChecks} from "../support/ux.ts";

/** Zoom and Fit, through the real app: step 3 design § 3 "Zoom", "Settled: Zoom"; contract § 3.2, § 3.3, § 3.8. */

/** Boxes whose edges fall differently on the pixel grid at any zoom, none on a line of the mm grid. */
const outlineLayout = (page: Layout["page"]): Layout => ({
    schemaVersion: 1,
    page,
    items: [
        textItem({xMm: 14.3, yMm: 80.6, wMm: 120.2, hMm: 90.4}),
        manualItem({xMm: 58.1, yMm: 46.7, wMm: 72.4, hMm: 8.3}),
        dateItem({xMm: 14.6, yMm: 46.2, wMm: 30.7, hMm: 8.9}),
        staticItem({xMm: 20.9, yMm: 190.4, wMm: 60.2, hMm: 8.6}),
    ],
});

/** What a computed value and the frame's measure may be off by, in px on screen. */
const OUTLINE_SLACK_PX = 0.02;

/** The outline at the zoom in force: `wanted` px on screen for each box, about that, not growing with the zoom; each box's size exact. */
const expectOutlines = async (designer: Designer, layout: Layout, selectedId: string | null, what: string) => {
    const outlines = await boxOutlines(designer);
    expect(outlines.map(outline => outline.id), what).toEqual(layout.items.map(item => item.id));
    outlines.forEach((outline, index) => {
        const item = layout.items[index];
        const selected = item.id === selectedId;
        const wanted = selected ? 2 : 1;
        const named = `${what}, the box ${item.id}`;
        expect(outline.selected, `${named}: selected`).toBe(selected);
        expect(outline.onScreenPx, `${named}: the outline on screen`).toBeGreaterThanOrEqual(wanted - OUTLINE_SLACK_PX);
        expect(outline.onScreenPx, `${named}: the outline doesn't grow with the zoom`).toBeLessThanOrEqual(2 * wanted + OUTLINE_SLACK_PX);
        expect(Math.abs(outline.widthPx - item.wMm * outline.pxPerMm), `${named}: its width`).toBeLessThanOrEqual(0.1);
        expect(Math.abs(outline.heightPx - item.hMm * outline.pxPerMm), `${named}: its height`).toBeLessThanOrEqual(0.1);
    });
};

/** How far the box lies out of what the area shows, in px, its scrollbars left out: 0 or below when the whole box shows. */
const pxOutOfArea = async (designer: Designer, box: Locator) => {
    const [shown, rect] = await Promise.all([
        designer.area.evaluate(area => {
            const {left, top} = area.getBoundingClientRect();
            const [x, y] = [left + area.clientLeft, top + area.clientTop];
            return {left: x, top: y, right: x + area.clientWidth, bottom: y + area.clientHeight};
        }),
        box.boundingBox(),
    ]);
    if (!rect) return Number.POSITIVE_INFINITY;
    return Math.max(shown.left - rect.x, shown.top - rect.y, rect.x + rect.width - shown.right, rect.y + rect.height - shown.bottom);
};

/** The whole box shows inside the area; a pixel off is the scale's rounding. */
const expectBoxInArea = async (designer: Designer, box: Locator, what: string) => {
    await expect.poll(() => pxOutOfArea(designer, box), {message: `${what}: px of the box outside the area`}).toBeLessThanOrEqual(1);
};

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

            // The resize has landed once the area's height follows it (contract § 3.3): only then would a re-fit show
            const windowHeight = async (height: number) => {
                const areaHeight = () => designer.area.evaluate(area => area.clientHeight);
                const before = await areaHeight();
                await page.setViewportSize({width: 1280, height});
                await expect.poll(areaHeight, {message: "the area re-measured"}).not.toBe(before);
            };

            await windowHeight(640);
            expect(await trueZoom(designer), "a lower window keeps the zoom").toBeCloseTo(a4, 1);
            await zoomTo(designer, 100);
            await windowHeight(800);
            await expect(designer.zoomPercent).toHaveText("100%");
            expect(await trueZoom(designer), "a higher window keeps it too").toBeCloseTo(100, 1);
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

    test("A4 at 100%, an item selected low on the sheet, plus to 200%: its box lies inside the area; with nothing selected a zoom press leaves the scroll @TPL-595",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, {
                schemaVersion: 1,
                page: A4,
                items: [textItem({xMm: 14, yMm: 100, wMm: 120, hMm: 90}), manualItem({xMm: 100, yMm: 270, wMm: 30, hMm: 8})],
            });
            const box = designer.box("m");
            await zoomTo(designer, 100);
            await box.click();
            await expect(box).toHaveAttribute("aria-pressed", "true");
            await expectBoxInArea(designer, box, "at 100%");

            await zoomTo(designer, 200);
            await expect(designer.zoomPercent).toHaveText("200%");
            await expectBoxInArea(designer, box, "at 200%");
            await expectMm(box, {x: 100, y: 270}, "the layout doesn't change");

            await page.keyboard.press("Escape");
            await expect(box).toHaveAttribute("aria-pressed", "false");
            await scrollAreaTo(designer, 40, 60);
            await designer.zoomOut.click();
            await expect(designer.zoomPercent).toHaveText("175%");
            expect(await areaScroll(designer), "nothing selected: the scroll stays").toMatchObject({left: 40, top: 60});
        });

    test("an item dragged far with auto-scroll at 200%, the area scrolled away from where it was: Ctrl+Z, the restored box is inside the area; Ctrl+Y, the same @TPL-595",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout({xMm: 20}));
            const box = designer.box("m");
            await zoomTo(designer, 200);
            await scrollAreaTo(designer, 0, 0);
            const area = await areaRect(designer);

            const drag = await pressBox(page, designer, "m");
            await drag.to({x: drag.start.x, y: area.y + area.height - 12});
            await expect.poll(async () => (await boxMm(box)).y, {message: "dragged far", timeout: 30_000}).toBeGreaterThan(150);
            await drag.release();
            await expect(designer.undo).toBeEnabled();
            const far = await boxMm(box);

            const {maxLeft, maxTop} = await areaScroll(designer);
            await scrollAreaTo(designer, maxLeft, maxTop);
            const sheet = await sheetOnScreen(designer);
            expect(sheet.top + 28 * sheet.pxPerMm, "where it goes back to is out of view").toBeLessThan(area.y);

            await page.keyboard.press("Control+KeyZ");
            await expectMm(box, {x: 20, y: 20}, "undone");
            await expectBoxInArea(designer, box, "after the undo");

            await page.keyboard.press("Control+KeyY");
            await expectMm(box, {x: far.x, y: far.y}, "redone");
            await expectBoxInArea(designer, box, "after the redo");
        });

    test("A4 at Fit on 1280 x 720, and 25%, 50%, 100%, 200%: every box's outline is about 1 px on screen all round, 2 px selected, and its size stays exact @TPL-591",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            await page.setViewportSize({width: 1280, height: 720});
            const a4 = outlineLayout(A4);
            const {clinic, designer} = await openDesigner(page, data, lang, a4);

            const onScreen = async (layout: Layout, what: string) => {
                await expectOutlines(designer, layout, null, what);
                await designer.box("m").click();
                await expect(designer.box("m")).toHaveAttribute("aria-pressed", "true");
                await expectOutlines(designer, layout, "m", `${what}, selected`);
                await page.keyboard.press("Escape");
                await expect(designer.box("m")).toHaveAttribute("aria-pressed", "false");
            };
            /** Before any press: nothing selected, no focus ring. */
            const inPixels = async (layout: Layout, what: string) => {
                for (const item of layout.items) {
                    const edges = await outlineOnEdges(page, designer.box(item.id));
                    for (const [edge, share] of Object.entries(edges)) {
                        expect(share, `${what}, the box ${item.id}: how much of its ${edge} edge shows the outline`).toBeGreaterThanOrEqual(0.9);
                    }
                }
            };

            await test.step("A4 at Fit", async () => {
                await expectFit(designer, "A4");
                const fit = await trueZoom(designer);
                expect(fit, "below 50%").toBeLessThan(50);
                expect(fit, "above 25%").toBeGreaterThan(25);
                await inPixels(a4, "at Fit");
                await onScreen(a4, "at Fit");
            });

            for (const zoom of [50, 100, 200]) {
                await test.step(`${zoom}%`, async () => {
                    await zoomTo(designer, zoom);
                    await onScreen(a4, `at ${zoom}%`);
                });
            }

            await test.step("25%", async () => {
                const large = outlineLayout({size: "custom", widthMm: 420, heightMm: 600});
                await putTemplate(data, clinic, large);
                await reopenDesigner(page, designer);
                await expect(designer.zoomPercent).toHaveText("25%");
                await inPixels(large, "at 25%");
                await onScreen(large, "at 25%");
            });
        });
});
