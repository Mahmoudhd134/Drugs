import {expect, test} from "../support/fixtures.ts";
import {
    boxMm,
    COMPUTER_ONLY,
    expectGuide,
    expectMm,
    expectOneDecimalNear,
    getTemplate,
    guideLayout,
    offGridColumn,
    ONE_LANGUAGE,
    openDesigner,
    pressBox,
    pressEntry,
    saveLayout,
    sheetOnScreen,
} from "../support/print-template.ts";

/**
 * Guides and Alt, through the real app: step 3 design § 3 "Guides", "Alt", contract § 3.4. `guideLayout`: a date's left edge at 62.3,
 * not a whole mm, so where the item lands tells a guide from a snap from Alt.
 */

test.describe("Print template: guides and Alt @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("another item's left edge within 1 mm: it sticks and a line shows; past 1 mm it snaps to whole mm and the line goes @TPL-431",
        async ({page, data, lang}) => {
            const {clinic, designer} = await openDesigner(page, data, lang, guideLayout());
            const box = designer.box("m");

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(63, 20);
            await expectGuide(designer, "x", 62.3);
            await expectMm(box, {x: 62.3, y: 20}, "stuck");

            await drag.toMm(64, 20);
            await expect(designer.guides).toHaveCount(0);
            await expectMm(box, {x: 64, y: 20}, "past 1 mm");

            await drag.toMm(63, 20);
            await expectGuide(designer, "x", 62.3);
            await drag.release();
            await expect(designer.guides, "gone with the drop").toHaveCount(0);
            await expectMm(box, {x: 62.3, y: 20}, "dropped");

            await saveLayout(page, designer);
            expect((await getTemplate(data, clinic))!.layout.items[1].xMm).toBe(62.3);
        });

    test("Alt held during a drag: no guide, no whole-mm snap, one decimal stored @TPL-434",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {clinic, designer} = await openDesigner(page, data, lang, guideLayout());
            const box = designer.box("m");

            const drag = await pressBox(page, designer, "m");
            const {px, tenth} = offGridColumn(await sheetOnScreen(designer), drag.grab.xMm, 62.3);
            await page.keyboard.down("Alt");
            await drag.to({x: px, y: drag.start.y});
            await expect.poll(async () => (await boxMm(box)).x, {message: "the preview follows"}).not.toBe(40);
            await expect(designer.guides).toHaveCount(0);
            await drag.release();
            await page.keyboard.up("Alt");

            const {x} = await boxMm(box);
            expectOneDecimalNear(x, tenth, "dropped with Alt");
            await saveLayout(page, designer);
            expect((await getTemplate(data, clinic))!.layout.items[1].xMm).toBe(x);
        });

    test("Alt held during a panel drag: the drop isn't snapped and holds one decimal, and guides don't stick @TPL-509",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {clinic, designer, pt} = await openDesigner(page, data, lang, guideLayout());
            const sheet = await sheetOnScreen(designer);
            const {px, tenth} = offGridColumn(sheet, 0, 62.3);

            const drag = await pressEntry(page, designer, pt.manualInput);
            await page.keyboard.down("Alt");
            await drag.to({x: px, y: sheet.top + 20 * sheet.pxPerMm});
            await expect(designer.ghost).toBeVisible();
            await expect(designer.guides).toHaveCount(0);
            await drag.release();
            await page.keyboard.up("Alt");

            await expect(designer.boxes).toHaveCount(4);
            const {x} = await boxMm(designer.box("i1"));
            expectOneDecimalNear(x, tenth, "dropped with Alt");
            await saveLayout(page, designer);
            expect((await getTemplate(data, clinic))!.layout.items[3].xMm).toBe(x);
        });

    test("Alt going down mid-way: the next move is unsnapped; going up: the next snaps and guides return; a release with Alt held stores the unsnapped value @TPL-518",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, guideLayout());
            const box = designer.box("m");

            const drag = await pressBox(page, designer, "m");
            const {px, tenth} = offGridColumn(await sheetOnScreen(designer), drag.grab.xMm, 62.3);
            const at = (dy: number) => drag.to({x: px, y: drag.start.y + dy});

            await at(0);
            await expectGuide(designer, "x", 62.3);
            await expectMm(box, {x: 62.3}, "no Alt yet");

            // Alt counts at the next move, so each key is followed by one
            await page.keyboard.down("Alt");
            await at(1);
            await expect(designer.guides).toHaveCount(0);
            await expect.poll(async () => (await boxMm(box)).x, {message: "unsnapped"}).not.toBe(62.3);
            expectOneDecimalNear((await boxMm(box)).x, tenth, "Alt down");

            await page.keyboard.up("Alt");
            await at(2);
            await expectGuide(designer, "x", 62.3);
            await expectMm(box, {x: 62.3}, "Alt up");

            await page.keyboard.down("Alt");
            await at(1);
            await expect(designer.guides).toHaveCount(0);
            await drag.release();
            await page.keyboard.up("Alt");
            expectOneDecimalNear((await boxMm(box)).x, tenth, "released with Alt held");
        });
});
