import {expect, test} from "../support/fixtures.ts";
import {
    A4,
    areaRect,
    areaScroll,
    boxMm,
    centerAreaOn,
    COMPUTER_ONLY,
    customLayout,
    type Designer,
    designerOf,
    expectMm,
    expectUnderPointer,
    expectUntouched,
    layoutL,
    manualItem,
    ONE_LANGUAGE,
    openDesigner,
    plainLayout,
    pressBox,
    pressEntry,
    pressHandle,
    reopenDesigner,
    scrollAreaTo,
    sheetOnScreen,
    textItem,
    zoomTo,
} from "../support/print-template.ts";
import type {Lang} from "../support/texts.ts";
import {setLanguage} from "../support/ux.ts";

/** Auto-scroll and drags across a scrolled sheet, through the real app: step 3 design § 3 "Scrolling", contract § 3.4 and § 6.10. */

/** A band's distance from the area's edge: inside the 24 px. */
const IN_BAND = 12;

/** How far past the area's edge a pointer is held. */
const PAST_EDGE = 60;

/** The value goes on rising with nothing else happening: three rises in a row. */
const expectKeepsRising = async (read: () => Promise<number>, message: string) => {
    for (let rise = 0; rise < 3; rise++) {
        const before = await read();
        await expect.poll(read, {message}).toBeGreaterThan(before);
    }
};

/** The area's scroll is this at several polls in a row, about half a second: an auto-scroll would have moved it by far more than a pixel by then. */
const expectScrollStays = async (designer: Designer, expected: { left: number; top: number }, message: string) => {
    const SEVERAL = 5;
    let polls = 0;
    await expect.poll(async () => {
        polls++;
        const {left, top} = await areaScroll(designer);
        return {left, top, polls: Math.min(polls, SEVERAL)};
    }, {message, intervals: [100]}).toEqual({left: expected.left, top: expected.top, polls: SEVERAL});
};

test.describe("Print template: scrolling during a drag @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("a drag near the area's edge on a large custom sheet: the area scrolls and the item follows @TPL-470",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, customLayout(420, 600, manualItem({xMm: 10, yMm: 10, wMm: 40, hMm: 8})));
            const box = designer.box("m");
            await zoomTo(designer, 100);
            await scrollAreaTo(designer, 0, 0);
            const area = await areaRect(designer);

            const drag = await pressBox(page, designer, "m");
            await drag.to({x: area.x + area.width - IN_BAND, y: area.y + area.height - IN_BAND});
            await expect.poll(async () => {
                const {left, top} = await areaScroll(designer);
                return left > 100 && top > 100;
            }, {message: "the area scrolls both ways"}).toBe(true);
            await expect.poll(async () => (await boxMm(box)).y, {message: "the item follows"}).toBeGreaterThan(30);

            // Out of the band it stops, and the item lies under the pointer
            await drag.to({x: area.x + area.width / 2, y: area.y + area.height / 2});
            await expectUnderPointer(designer, box, drag);
            const before = await areaScroll(designer);
            await drag.release();
            await expectUnderPointer(designer, box, drag);
            expect((await areaScroll(designer)).top, "the scroll stays").toBeGreaterThanOrEqual(before.top);
        });

    test("a drag from the panel across a scrolled sheet: the drop position counts the scroll @TPL-471",
        async ({page, data, lang}) => {
            const {designer, pt} = await openDesigner(page, data, lang, customLayout(420, 600));
            await zoomTo(designer, 100);
            await centerAreaOn(designer, 150, 250);
            const scrolled = await areaScroll(designer);
            expect(scrolled.left, "scrolled sideways").toBeGreaterThan(0);
            expect(scrolled.top, "scrolled down").toBeGreaterThan(0);

            const drag = await pressEntry(page, designer, pt.manualInput);
            await drag.toMm(150, 250);
            await expect(designer.ghost).toBeVisible();
            await drag.release();
            await expect(designer.boxes).toHaveCount(2);
            await expectMm(designer.box("i1"), {x: 150, y: 250, w: 40, h: 8}, "dropped");
        });

    test("the wheel during a drag, then a release with no pointer move: the item lands under the pointer, counting the new scroll @TPL-531",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout({xMm: 20}));
            const box = designer.box("m");
            await zoomTo(designer, 200);
            await scrollAreaTo(designer, 0, 0);

            const drag = await pressBox(page, designer, "m");
            await drag.by(10, 10);
            await expect.poll(async () => (await boxMm(box)).y, {message: "the preview"}).toBeGreaterThan(20);
            const before = (await boxMm(box)).y;

            await page.mouse.wheel(0, 120);
            await expect.poll(async () => (await areaScroll(designer)).top, {message: "the wheel scrolls the area"}).toBeGreaterThan(0);
            await expect.poll(async () => (await boxMm(box)).y, {message: "the item follows with no pointer move"}).toBeGreaterThan(before);
            await expectUnderPointer(designer, box, drag);

            await drag.release();
            await expectUnderPointer(designer, box, drag);
            expect((await boxMm(box)).y).toBeGreaterThan(before);
        });

    test("the pointer held still in the band: the area keeps scrolling, the item follows with no pointer move, it stops at the end; Esc: the item is back, the scroll stays @TPL-585",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout({xMm: 20}));
            const box = designer.box("m");
            await zoomTo(designer, 200);
            await scrollAreaTo(designer, 0, 0);
            const area = await areaRect(designer);

            const drag = await pressBox(page, designer, "m");
            await drag.to({x: drag.start.x, y: area.y + area.height - IN_BAND});
            const first = (await boxMm(box)).y;
            await expect.poll(async () => (await boxMm(box)).y, {message: "the item follows"}).toBeGreaterThan(first);

            const {maxTop} = await areaScroll(designer);
            expect(maxTop).toBeGreaterThan(0);
            await expect.poll(async () => (await areaScroll(designer)).top, {message: "it scrolls to the end", timeout: 30_000}).toBe(maxTop);
            // The end of the scroll is the sheet's: the item stops at its bottom edge
            await expectMm(box, {x: 20, y: 202}, "at the end");

            await page.keyboard.press("Escape");
            await expectMm(box, {x: 20, y: 20}, "back");
            expect((await areaScroll(designer)).top, "the scroll stays").toBe(maxTop);
            await drag.release();
            await expectUntouched(designer);
        });

    test("the Arabic UI at 200%: the area is still left to right, scrollLeft never negative, auto-scroll right raises it, and the same sheet point gives the same mm as in English @TPL-586",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", "the test goes through both languages itself");
            await openDesigner(page, data, lang, plainLayout({xMm: 20}));
            const landed: Record<string, { x: number; y: number }> = {};

            for (const shown of ["ar", "en"] as Lang[]) {
                await test.step(shown, async () => {
                    await setLanguage(page, shown);
                    const designer = designerOf(page, shown);
                    const box = designer.box("m");
                    await zoomTo(designer, 200);
                    await expect(designer.area).toHaveAttribute("dir", "ltr");
                    await scrollAreaTo(designer, 0, 0);

                    const drag = await pressBox(page, designer, "m");
                    await drag.toMm(32, 26);
                    await expectMm(box, {x: 32, y: 26}, "while dragging");
                    await drag.release();
                    const {x, y} = await boxMm(box);
                    landed[shown] = {x, y};
                    await designer.undo.click();
                    await expectMm(box, {x: 20, y: 20}, "undone");

                    if (shown === "ar") {
                        const area = await areaRect(designer);
                        const toRight = await pressBox(page, designer, "m");
                        await toRight.to({x: area.x + area.width - IN_BAND, y: toRight.start.y});
                        await expect.poll(async () => (await areaScroll(designer)).left, {message: "auto-scroll right raises scrollLeft"}).toBeGreaterThan(0);
                        await page.keyboard.press("Escape");
                        await toRight.release();
                        expect((await areaScroll(designer)).left).toBeGreaterThan(0);
                        await expectUntouched(designer);
                    }
                });
            }
            expect(landed.ar).toEqual(landed.en);
            expect(landed.ar).toEqual({x: 32, y: 26});
        });

    test("a panel drag entering the band from the panel's side on a scrollable sheet: the drop counts the scroll at the drop @TPL-589",
        async ({page, data, lang}) => {
            const {designer, pt} = await openDesigner(page, data, lang, customLayout(420, 600));
            await zoomTo(designer, 100);
            await centerAreaOn(designer, 210, 200);
            const start = await areaScroll(designer);
            const area = await areaRect(designer);
            // The panel is on the UI's start: the left in English, the right in Arabic. The area is left to right, so the first goes down, the other up
            const x = lang === "en" ? area.x + IN_BAND : area.x + area.width - IN_BAND;
            const y = area.y + area.height / 2;

            const drag = await pressEntry(page, designer, pt.manualInput);
            await drag.to({x, y});
            await expect.poll(async () => Math.abs((await areaScroll(designer)).left - start.left), {message: "the area scrolls", intervals: [50]}).toBeGreaterThan(40);
            await drag.release();

            await expect(designer.boxes).toHaveCount(2);
            const sheet = await sheetOnScreen(designer);
            const place = await boxMm(designer.box("i1"));
            const pointer = drag.now();
            expect(Math.abs(place.x - (pointer.x - sheet.left) / sheet.pxPerMm), "x counts the scroll at the drop").toBeLessThanOrEqual(1.1);
            expect(Math.abs(place.y - (pointer.y - sheet.top) / sheet.pxPerMm), "y counts the scroll at the drop").toBeLessThanOrEqual(1.1);
        });

    test("1280 x 720, the page not scrolled: a drag reaches the band at the area's bottom, inside the window, and it scrolls @TPL-590",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            await page.setViewportSize({width: 1280, height: 720});
            const {designer} = await openDesigner(page, data, lang, {
                schemaVersion: 1,
                page: A4,
                items: [textItem({xMm: 14, yMm: 100, wMm: 120, hMm: 90}), manualItem({xMm: 20, yMm: 20, wMm: 40, hMm: 8})],
            });
            await zoomTo(designer, 100);
            await scrollAreaTo(designer, 0, 0);
            const area = await areaRect(designer);
            expect(await page.evaluate(() => window.scrollY), "the page isn't scrolled").toBe(0);
            expect(area.y + area.height, "the area's bottom is in the window").toBeLessThanOrEqual(720);

            const drag = await pressBox(page, designer, "m");
            await drag.to({x: drag.start.x, y: area.y + area.height - IN_BAND});
            await expect.poll(async () => (await areaScroll(designer)).top, {message: "the area scrolls"}).toBeGreaterThan(0);
            expect(await page.evaluate(() => window.scrollY), "the page itself doesn't").toBe(0);
            await page.keyboard.press("Escape");
            await drag.release();
            await expectUntouched(designer);
        });

    test("a move with the pointer held still 60 px past the area's right edge, at 200%: the area keeps scrolling on that axis and the item follows; Esc: back, the scroll stays @TPL-594",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, customLayout(420, 600, manualItem({xMm: 10, yMm: 10, wMm: 30, hMm: 8})));
            const box = designer.box("m");
            await zoomTo(designer, 200);
            await scrollAreaTo(designer, 0, 0);
            const area = await areaRect(designer);

            const drag = await pressBox(page, designer, "m");
            await drag.to({x: area.x + area.width + PAST_EDGE, y: area.y + area.height / 2});
            await expectKeepsRising(async () => (await boxMm(box)).x, "the item's X follows with no pointer move");
            await expectKeepsRising(async () => (await areaScroll(designer)).left, "scrollLeft keeps rising");
            expect((await areaScroll(designer)).top, "the other axis stays").toBe(0);

            await page.keyboard.press("Escape");
            await expectMm(box, {x: 10, y: 10}, "back");
            const stopped = await areaScroll(designer);
            expect(stopped.left, "the scroll stays").toBeGreaterThan(0);
            await expectScrollStays(designer, stopped, "the loop stopped");
            await drag.release();
            await expectUntouched(designer);
        });

    test("a resize with the pointer held still 60 px past the area's right edge, at 200%: the area keeps scrolling on that axis and the edge follows; the release stops it, one step @TPL-594",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, customLayout(420, 600, manualItem({xMm: 10, yMm: 10, wMm: 30, hMm: 8})));
            const box = designer.box("m");
            await zoomTo(designer, 200);
            await box.click();
            await scrollAreaTo(designer, 0, 0);
            const area = await areaRect(designer);

            const drag = await pressHandle(page, designer, "m", "e");
            await drag.to({x: area.x + area.width + PAST_EDGE, y: area.y + area.height / 2});
            await expectKeepsRising(async () => (await boxMm(box)).w, "the width follows with no pointer move");
            await expectKeepsRising(async () => (await areaScroll(designer)).left, "scrollLeft keeps rising");
            expect((await areaScroll(designer)).top, "the other axis stays").toBe(0);
            await expectMm(box, {x: 10, y: 10, h: 8}, "only the moving edge moves");

            await drag.release();
            await expect(designer.undo, "one step").toBeEnabled();
            await expectScrollStays(designer, await areaScroll(designer), "the release stops it");
        });

    test("a panel drag on a scrolled sheet, the pointer over the side panel: the area doesn't scroll @TPL-594",
        async ({page, data, lang}) => {
            const {designer, pt} = await openDesigner(page, data, lang, customLayout(420, 600));
            await zoomTo(designer, 200);
            await centerAreaOn(designer, 210, 300);
            const start = await areaScroll(designer);
            expect(start.left, "room to scroll back").toBeGreaterThan(0);
            expect(start.left, "room to scroll on").toBeLessThan(start.maxLeft);

            const drag = await pressEntry(page, designer, pt.manualInput);
            await drag.by(10, 10);
            await expect(designer.ghost).toBeVisible();

            // The panel lies past the area's left edge in English and past its right edge in Arabic
            const [area, panel] = [await areaRect(designer), (await designer.panel.boundingBox())!];
            const pointer = drag.now();
            expect(pointer.x, "the pointer is over the panel").toBeGreaterThanOrEqual(panel.x);
            expect(pointer.x, "the pointer is over the panel").toBeLessThanOrEqual(panel.x + panel.width);
            expect(pointer.x < area.x || pointer.x > area.x + area.width, "the pointer is past the area's edge").toBe(true);
            await expectScrollStays(designer, start, "crossing the panel doesn't scroll the sheet");

            await page.keyboard.press("Escape");
            await drag.release();
            await expect(designer.boxes, "nothing added").toHaveCount(1);
            await expectUntouched(designer);
        });

    test("1920 x 970, nothing selected: the page has no vertical scrollbar and the area's bottom is in the window; 1280 x 720: the area's bottom is in the window, the page not scrolled @TPL-592",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            await page.setViewportSize({width: 1920, height: 970});
            const {designer} = await openDesigner(page, data, lang, layoutL());
            await expect(designer.boxes.and(page.locator("[aria-pressed=true]")), "nothing selected").toHaveCount(0);

            const {scrollHeight, clientHeight} = await page.evaluate(() => {
                const {scrollHeight, clientHeight} = document.documentElement;
                return {scrollHeight, clientHeight};
            });
            expect(scrollHeight, "no vertical scrollbar on the page").toBeLessThanOrEqual(clientHeight);
            const tall = await areaRect(designer);
            expect(tall.y + tall.height, "the area's bottom is in the window").toBeLessThanOrEqual(970);

            await page.setViewportSize({width: 1280, height: 720});
            await reopenDesigner(page, designer);
            const low = await areaRect(designer);
            expect(await page.evaluate(() => window.scrollY), "the page isn't scrolled").toBe(0);
            expect(low.y + low.height, "the area's bottom is in the window").toBeLessThanOrEqual(720);
        });
});
