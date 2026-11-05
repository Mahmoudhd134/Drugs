import {expect, test} from "../support/fixtures.ts";
import {attachScreenshot} from "../support/print.ts";
import {
    A4,
    COMPUTER_ONLY,
    dateItem,
    expectGuide,
    expectMm,
    getTemplate,
    handleIds,
    openDesigner,
    pressBox,
    pressEntry,
    pressHandle,
    reopenDesigner,
    saveLayout,
    textItem,
} from "../support/print-template.ts";

/** Step 3's "Done when" (design § 1), from the panel to the reload. The screenshots are for the ready report. */

test.describe("Print template: the drag journey @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("A4 at Fit: a manual input from the panel, a guide level with the date, its left edge, Alt and an arrow, two undos and a redo, Save: after a reload each item is at its mm @TPL-500 @smoke",
        async ({page, data, lang, healthy}, testInfo) => {
            test.slow();
            const text = textItem({xMm: 14, yMm: 100, wMm: 180, hMm: 150});
            const date = dateItem({xMm: 14, yMm: 40.3, wMm: 30, hMm: 8});
            const {clinic, designer, pt} = await openDesigner(page, data, lang, {schemaVersion: 1, page: A4, items: [text, date]});
            const fit = await designer.zoomPercent.textContent();

            // From the panel
            const fromPanel = await pressEntry(page, designer, pt.manualInput);
            await fromPanel.toMm(120, 80);
            await expect(designer.ghost).toBeVisible();
            await fromPanel.release();
            await expect(designer.boxes).toHaveCount(3);
            const box = designer.box("i1");
            await expectMm(box, {x: 120, y: 80, w: 40, h: 8}, "dropped");

            // Until a guide shows it level with the date: its 40.3 isn't a whole mm, so only the guide can give it
            const move = await pressBox(page, designer, "i1");
            await move.toMm(120, 40.8);
            await expectGuide(designer, "y", 40.3);
            await expectMm(box, {x: 120, y: 40.3}, "level with the date");
            await attachScreenshot(page, testInfo, "a guide level with the date", "screen", "viewport");
            await move.release();
            await expect(designer.guides).toHaveCount(0);
            await expectMm(box, {x: 120, y: 40.3, w: 40, h: 8}, "moved");

            // By its left edge: 40 x 8 mm at this zoom still has all eight handles
            expect(await handleIds(designer)).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
            await expect(designer.handle("w")).toBeVisible();
            await attachScreenshot(page, testInfo, "the handles");
            const resize = await pressHandle(page, designer, "i1", "w");
            await resize.toMm(110, 44.3);
            await expectMm(box, {x: 110, y: 40.3, w: 50, h: 8}, "resizing");
            await resize.release();
            await expectMm(box, {x: 110, y: 40.3, w: 50, h: 8}, "resized");

            await page.keyboard.press("Alt+ArrowRight");
            await expectMm(box, {x: 110.1, w: 50}, "nudged");

            await page.keyboard.press("Control+KeyZ");
            await expectMm(box, {x: 110, w: 50}, "the nudge undone");
            await page.keyboard.press("Control+KeyZ");
            await expectMm(box, {x: 120, y: 40.3, w: 40, h: 8}, "the resize undone");
            await page.keyboard.press("Control+KeyY");
            await expectMm(box, {x: 110, y: 40.3, w: 50, h: 8}, "the resize redone");

            await saveLayout(page, designer);
            await expect(designer.save).toBeDisabled();
            await healthy();

            await reopenDesigner(page, designer);
            await expect(designer.zoomPercent, "Fit again").toHaveText(fit!);
            await expect(designer.boxes).toHaveCount(3);
            await expectMm(box, {x: 110, y: 40.3, w: 50, h: 8}, "after the reload");
            await expectMm(designer.box("f"), {x: 14, y: 40.3, w: 30, h: 8}, "the date");
            await expectMm(designer.box("t"), {x: 14, y: 100, w: 180, h: 150}, "the prescription text");

            const saved = (await getTemplate(data, clinic))!.layout;
            expect(saved.items.map(item => [item.id, item.xMm, item.yMm, item.wMm, item.hMm])).toEqual([
                ["t", 14, 100, 180, 150],
                ["f", 14, 40.3, 30, 8],
                ["i1", 110, 40.3, 50, 8],
            ]);
        });
});
