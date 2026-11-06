import {expect, test} from "../support/fixtures.ts";
import {
    boxMm,
    COMPUTER_ONLY,
    type Designer,
    expectFit,
    expectUntouched,
    expectMm,
    layoutL,
    openDesigner,
    openDesignerWithPaper,
    openSection,
    pressEntry,
    trueZoom,
    zoomTo,
} from "../support/print-template.ts";
import {paperPng} from "../support/paper-files.ts";
import {expectNoCutOrOverlap, noHorizontalScroll} from "../support/ux.ts";

/** The designer's columns at each width, in both languages: step 4 design § 6, contract § 4.6. */

const rectsOf = async (designer: Designer) => {
    const [panel, area, settings] = await Promise.all([designer.panel.boundingBox(), designer.area.boundingBox(), designer.settings.boundingBox()]);
    if (!panel || !area || !settings) throw new Error("a part of the designer isn't on screen");
    return {panel, area, settings};
};

/** The two boxes share no vertical band: side by side. */
const sideBySide = (a: { x: number; width: number }, b: { x: number; width: number }) => a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1;

const expectTwoColumns = async (designer: Designer, what: string) => {
    const {panel, area, settings} = await rectsOf(designer);
    const column = (await designer.sideColumn.boundingBox())!;
    expect(Math.abs(column.width - 260), `${what}: the shared column's width`).toBeLessThanOrEqual(1);
    expect(sideBySide(column, area), `${what}: the column beside the sheet`).toBe(true);
    expect(Math.abs(column.y - area.y), `${what}: the same top as the area`).toBeLessThanOrEqual(1);
    expect(Math.abs(column.height - area.height), `${what}: the same height as the area`).toBeLessThanOrEqual(1);
    expect(sideBySide(settings, area), `${what}: the settings beside the sheet, never below`).toBe(true);
    expect(Math.abs(panel.x - settings.x), `${what}: the panel and the settings in one column`).toBeLessThanOrEqual(1);
    expect(settings.y, `${what}: the panel first, then the settings`).toBeGreaterThanOrEqual(panel.y + panel.height);
    await expect(designer.sideColumn).toHaveCSS("overflow-y", "auto");
};

const expectThreeColumns = async (designer: Designer, lang: string, what: string) => {
    const {panel, area, settings} = await rectsOf(designer);
    await expect(designer.sideColumn).toHaveCSS("display", "contents");
    expect(Math.abs(panel.width - 200), `${what}: the panel's width`).toBeLessThanOrEqual(1);
    expect(Math.abs(settings.width - 280), `${what}: the settings' width`).toBeLessThanOrEqual(1);
    expect(Math.abs(panel.y - area.y), `${what}: the panel's top`).toBeLessThanOrEqual(1);
    expect(Math.abs(settings.y - area.y), `${what}: the settings' top`).toBeLessThanOrEqual(1);
    if (lang === "ar") {
        expect(panel.x, `${what}: the panel on the right in Arabic`).toBeGreaterThanOrEqual(area.x + area.width);
        expect(settings.x + settings.width, `${what}: the settings on the left in Arabic`).toBeLessThanOrEqual(area.x);
    } else {
        expect(panel.x + panel.width, `${what}: the panel on the left in English`).toBeLessThanOrEqual(area.x);
        expect(settings.x, `${what}: the settings on the right in English`).toBeGreaterThanOrEqual(area.x + area.width);
    }
};

test.describe("The designer's columns @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("at 1000 px the panel and the settings share a column beside the sheet, each reachable by its scroll, the numbers and the sheet in view together @TPL-680",
        async ({page, data, lang, healthy}) => {
            await page.setViewportSize({width: 1000, height: 800});
            const {designer, pt} = await openDesigner(page, data, lang, layoutL());
            await expectTwoColumns(designer, "at 1000 px");
            await noHorizontalScroll(page, "at 1000 px");

            await designer.entry(pt.manualInput).scrollIntoViewIfNeeded();
            await expect(designer.entry(pt.manualInput)).toBeInViewport();

            await designer.box("m").click();
            await designer.field(pt.x).scrollIntoViewIfNeeded();
            await expect(designer.field(pt.x)).toBeInViewport();
            await expect(designer.box("m"), "the box and its numbers together").toBeInViewport();
            expect(await page.evaluate(() => window.scrollY), "the column scrolls, not the page").toBe(0);
            expect(await designer.sideColumn.evaluate(column => column.scrollTop), "the column scrolled").toBeGreaterThan(0);

            await openSection(designer, "calibration");
            await designer.calibrationX.scrollIntoViewIfNeeded();
            await expect(designer.calibrationX).toBeInViewport();
            await expect(designer.sheet).toBeInViewport();
            await healthy();
        });

    test("a stored picture and an item selected, at 1000 and 1280 px: no cut text and no overlapping button in the settings' column @TPL-680 @TPL-681",
        async ({page, data, lang, healthy}) => {
            const {designer} = await openDesignerWithPaper(page, data, lang, layoutL(), paperPng());
            await designer.box("m").click();
            await expect(designer.box("m")).toHaveAttribute("aria-pressed", "true");

            for (const width of [1000, 1280]) {
                await test.step(`at ${width} px`, async () => {
                    await page.setViewportSize({width, height: 800});
                    await expect(designer.paperRow("paper.png")).toBeAttached();
                    // Only the open section is on screen, so each is opened in turn, the item's and the picture's being the ones this case is about
                    for (const section of ["item", "paper"] as const) {
                        await openSection(designer, section);
                        await expectNoCutOrOverlap(page.locator("main"), `the designer with a picture at ${width} px, the section ${section} open`);
                        await noHorizontalScroll(page, `at ${width} px, the section ${section} open`);
                        await healthy();
                    }
                });
            }
        });

    test("from 1200 px: three columns as today, flipped with the language @TPL-681",
        async ({page, data, lang, healthy}) => {
            const {designer} = await openDesigner(page, data, lang, layoutL());
            await expectThreeColumns(designer, lang, "at 1280 px");

            await page.setViewportSize({width: 1600, height: 900});
            await expectThreeColumns(designer, lang, "at 1600 px");
            await noHorizontalScroll(page, "at 1600 px");
            await healthy();
        });

    test("Fit at 1000 px is computed from the new layout; pressed twice it gives the same zoom @TPL-682",
        async ({page, data, lang}) => {
            await page.setViewportSize({width: 1000, height: 800});
            const {designer} = await openDesigner(page, data, lang, layoutL());

            await zoomTo(designer, 200);
            await designer.fit.click();
            await expectFit(designer, "Fit at 1000 px");
            const once = await trueZoom(designer);

            await designer.fit.click();
            await expectFit(designer, "Fit pressed again");
            expect(await trueZoom(designer), "the same zoom").toBe(once);
        });

    test("899, 900, 1199 and 1200 px: the message, two columns, two columns, three columns @TPL-714",
        async ({page, data, lang}) => {
            const {designer, pt} = await openDesigner(page, data, lang, layoutL());

            await page.setViewportSize({width: 899, height: 800});
            await expect(page.getByText(pt.desktopOnly, {exact: true})).toBeVisible();
            await expect(designer.sheet).toHaveCount(0);

            for (const width of [900, 1199]) {
                await test.step(`${width} px`, async () => {
                    await page.setViewportSize({width, height: 800});
                    await expect(designer.sheet).toBeVisible();
                    await expect(page.getByText(pt.desktopOnly, {exact: true})).toHaveCount(0);
                    await expectTwoColumns(designer, `at ${width} px`);
                    await noHorizontalScroll(page, `at ${width} px`);
                });
            }

            await page.setViewportSize({width: 1200, height: 800});
            await expect(designer.sheet).toBeVisible();
            await expectThreeColumns(designer, lang, "at 1200 px");
            await noHorizontalScroll(page, "at 1200 px");
        });

    test("the shared column scrolled: a panel entry dragged lands under the pointer; a drop over the settings adds nothing @TPL-715",
        async ({page, data, lang}) => {
            await page.setViewportSize({width: 1000, height: 800});
            const {designer, pt} = await openDesigner(page, data, lang, layoutL());
            await expect(designer.boxes).toHaveCount(3);

            // Only the column scrolled, so the entry and the settings' top are both in it: the entry at its top, the settings below. The element's own `scrollIntoView` would move the page too, the entry under the app bar
            const [entryAt, columnAt] = [(await designer.entry(pt.isoDateTime).boundingBox())!, (await designer.sideColumn.boundingBox())!];
            await designer.sideColumn.evaluate((column, by) => {
                column.scrollTop += by;
            }, entryAt.y - columnAt.y - 8);
            await expect.poll(() => designer.sideColumn.evaluate(column => column.scrollTop), {message: "the column scrolled"}).toBeGreaterThan(0);
            await expect(designer.entry(pt.isoDateTime)).toBeInViewport();

            const away = await pressEntry(page, designer, pt.isoDateTime);
            const settings = (await designer.settings.boundingBox())!;
            const column = (await designer.sideColumn.boundingBox())!;
            const overSettings = {x: settings.x + settings.width / 2, y: settings.y + 20};
            expect(overSettings.y, "the settings' top is in the column").toBeLessThan(column.y + column.height);
            await away.to(overSettings, 5);
            await away.release();
            await expect(designer.boxes, "a drop over the settings adds nothing").toHaveCount(3);
            await expectUntouched(designer);

            const drag = await pressEntry(page, designer, pt.isoDateTime);
            await drag.toMm(60, 20, 5);
            await drag.release();

            await expect(designer.boxes).toHaveCount(4);
            const added = designer.boxes.last();
            await expect(added).toHaveAttribute("aria-pressed", "true");
            const place = await boxMm(added);
            expect(Math.abs(place.x - 60), `the drop's x: ${place.x} mm`).toBeLessThanOrEqual(1.1);
            expect(Math.abs(place.y - 20), `the drop's y: ${place.y} mm`).toBeLessThanOrEqual(1.1);
            await expectMm(designer.box("m"), {x: 58, y: 46});
        });
});
