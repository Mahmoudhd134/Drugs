import {expect, test} from "../support/fixtures.ts";
import {
    A4,
    areaRect,
    boxMm,
    COMPUTER_ONLY,
    expectMm,
    expectUntouched,
    fiftyItems,
    getTemplate,
    ONE_LANGUAGE,
    openDesigner,
    plainLayout,
    pressBox,
    pressEntry,
    pressHandle,
    saveLayout,
    sheetOnScreen,
    textItem,
    zoomTo,
} from "../support/print-template.ts";

/** Dragging from the side panel, through the real app: step 3 design § 3 "Dragging from the panel", contract § 3.3 and § 3.4. */

test.describe("Print template: dragging from the panel @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("a manual input dropped on the sheet: exactly one where dropped, in whole mm, selected; the click after the release adds no second; one undo removes it; it saves @TPL-400 @TPL-501",
        async ({page, data, lang}) => {
            const {clinic, designer, pt} = await openDesigner(page, data, lang, plainLayout());
            await expect(designer.boxes).toHaveCount(2);

            const drag = await pressEntry(page, designer, pt.manualInput);
            await drag.toMm(60, 40);
            await expect(designer.ghost).toBeVisible();
            await expect.poll(async () => {
                const ghost = (await designer.ghost.boundingBox())!;
                const {pxPerMm} = await sheetOnScreen(designer);
                return Math.max(Math.abs(ghost.x - drag.now().x), Math.abs(ghost.y - drag.now().y),
                    Math.abs(ghost.width - 40 * pxPerMm), Math.abs(ghost.height - 8 * pxPerMm));
            }, {message: "the ghost's top-left at the pointer, the new item's size at this zoom"}).toBeLessThanOrEqual(1.5);
            await expect(designer.boxes, "nothing added before the drop").toHaveCount(2);
            await expect(designer.save, "nothing unsaved before the drop").toBeDisabled();

            await drag.release();
            await expect(designer.ghost).toHaveCount(0);
            await expect(designer.boxes).toHaveCount(3);
            const box = designer.box("i1");
            await expectMm(box, {x: 60, y: 40, w: 40, h: 8}, "dropped");
            await expect(box).toHaveAttribute("aria-pressed", "true");
            await expect(designer.field(pt.x)).toHaveValue("60");
            await expect(designer.field(pt.y)).toHaveValue("40");
            await expect(designer.field(pt.name)).toHaveValue(pt.manualInput);
            await expect(designer.save).toBeEnabled();

            // One step, and no second item at the cascade's place
            await designer.undo.click();
            await expect(designer.boxes).toHaveCount(2);
            await expectUntouched(designer);

            await designer.redo.click();
            await expect(designer.boxes).toHaveCount(3);
            await expect(box).toHaveAttribute("aria-pressed", "true");
            await expectMm(box, {x: 60, y: 40}, "redone");
            await saveLayout(page, designer);
            const saved = (await getTemplate(data, clinic))!.layout;
            expect(saved.items.map(item => item.id)).toEqual(["t", "m", "i1"]);
            expect([saved.items[2].xMm, saved.items[2].yMm, saved.items[2].wMm, saved.items[2].hMm]).toEqual([60, 40, 40, 8]);
        });

    test("dropped outside the sheet, or Esc during the drag: nothing added, nothing unsaved, no ghost @TPL-401",
        async ({page, data, lang}) => {
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());

            const settings = (await designer.settings.boundingBox())!;
            const outside = await pressEntry(page, designer, pt.manualInput);
            await outside.to({x: settings.x + settings.width / 2, y: settings.y + 40});
            await expect(designer.ghost).toBeVisible();
            await outside.release();
            await expect(designer.ghost).toHaveCount(0);
            await expect(designer.boxes).toHaveCount(2);
            await expectUntouched(designer);

            const cancelled = await pressEntry(page, designer, pt.manualInput);
            await cancelled.toMm(60, 40);
            await expect(designer.ghost).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(designer.ghost).toHaveCount(0);
            await cancelled.release();
            await expect(designer.boxes).toHaveCount(2);
            await expectUntouched(designer);
        });

    test("a dimmed entry, or any entry at 50 items: a drag shows no ghost and adds nothing @TPL-403",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const dimmed = await openDesigner(page, data, lang, plainLayout());
            const later = dimmed.designer.entry(dimmed.pt.internalData);
            await expect(later).toHaveAttribute("aria-disabled", "true");
            const onDimmed = await pressEntry(page, dimmed.designer, dimmed.pt.internalData);
            await onDimmed.toMm(60, 40);
            await expect(dimmed.designer.ghost).toHaveCount(0);
            await onDimmed.release();
            await expect(dimmed.designer.boxes).toHaveCount(2);
            await expectUntouched(dimmed.designer);

            const full = await openDesigner(page, data, lang, fiftyItems());
            await expect(full.designer.boxes).toHaveCount(50);
            await expect(full.designer.entry(full.pt.manualInput)).toHaveAttribute("aria-disabled", "true");
            const onFull = await pressEntry(page, full.designer, full.pt.manualInput);
            await onFull.toMm(150, 150);
            await expect(full.designer.ghost).toHaveCount(0);
            await onFull.release();
            await expect(full.designer.boxes).toHaveCount(50);
            await expectUntouched(full.designer);
        });

    test("past 4 px and back to the same entry, or Esc and a release over the entry: nothing added, nothing unsaved, no ghost @TPL-502",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());

            const back = await pressEntry(page, designer, pt.manualInput);
            await back.by(30, 0);
            await expect(designer.ghost).toBeVisible();
            await back.by(0, 0);
            await expect(designer.ghost, "once past, it stays a drag").toBeVisible();
            await back.release();
            await expect(designer.ghost).toHaveCount(0);
            await expect(designer.boxes).toHaveCount(2);
            await expectUntouched(designer);

            const cancelled = await pressEntry(page, designer, pt.manualInput);
            await cancelled.by(30, 0);
            await expect(designer.ghost).toBeVisible();
            await page.keyboard.press("Escape");
            await cancelled.by(0, 0);
            await cancelled.release();
            await expect(designer.ghost).toHaveCount(0);
            await expect(designer.boxes).toHaveCount(2);
            await expectUntouched(designer);
        });

    test("the threshold: 3 and 4 px are a click, 5 px and a diagonal of 3, 3 are a drag; on an entry and on a box @TPL-503",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());

            // An entry: a click adds at the cascade's place (n items already: 5 + 6 n)
            for (const [distance, id, place] of [[3, "i1", 17], [4, "i2", 23]] as const) {
                await test.step(`an entry, ${distance} px`, async () => {
                    const drag = await pressEntry(page, designer, pt.manualInput);
                    await drag.by(distance, 0);
                    await expect(designer.ghost).toHaveCount(0);
                    await drag.release();
                    await expect(designer.box(id)).toBeVisible();
                    await expectMm(designer.box(id), {x: place, y: place}, "added by the click");
                    await expect(designer.ghost).toHaveCount(0);
                });
            }
            for (const [dx, dy] of [[5, 0], [3, 3]] as const) {
                await test.step(`an entry, ${dx}, ${dy} px`, async () => {
                    const drag = await pressEntry(page, designer, pt.manualInput);
                    await drag.by(dx, dy);
                    await expect(designer.ghost).toBeVisible();
                    await page.keyboard.press("Escape");
                    await drag.release();
                    await expect(designer.boxes).toHaveCount(4);
                });
            }

            // A box, the two items added gone: their lines would be in reach
            await designer.undo.click();
            await designer.undo.click();
            await expect(designer.boxes).toHaveCount(2);
            const box = designer.box("m");
            for (const distance of [3, 4]) {
                await test.step(`a box, ${distance} px`, async () => {
                    const drag = await pressBox(page, designer, "m");
                    await drag.by(distance, 0);
                    await drag.release();
                    await expect(box).toHaveAttribute("aria-pressed", "true");
                    await expectMm(box, {x: 40, y: 20}, "unchanged");
                });
            }
            const {pxPerMm} = await sheetOnScreen(designer);
            for (const [dx, dy] of [[5, 0], [3, 3]] as const) {
                await test.step(`a box, ${dx}, ${dy} px`, async () => {
                    const start = await boxMm(box);
                    const drag = await pressBox(page, designer, "m");
                    await drag.by(dx, dy);
                    await drag.release();
                    await expectMm(box, {x: Math.round(start.x + dx / pxPerMm), y: Math.round(start.y + dy / pxPerMm)}, "moved");
                });
            }
        });

    test("a right or a middle press on an entry, a box or a handle: no ghost, no move, no resize, nothing added @TPL-504",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());
            await designer.box("m").click();
            const start = await boxMm(designer.box("m"));

            for (const button of ["right", "middle"] as const) {
                await test.step(button, async () => {
                    const onEntry = await pressEntry(page, designer, pt.manualInput, {button});
                    await onEntry.toMm(60, 40);
                    await expect(designer.ghost).toHaveCount(0);
                    await onEntry.release();
                    await expect(designer.boxes).toHaveCount(2);

                    const onBox = await pressBox(page, designer, "m", {button});
                    await onBox.by(40, 30);
                    await onBox.release();
                    await expectMm(designer.box("m"), start, "not moved");

                    const onHandle = await pressHandle(page, designer, "m", "e", {button});
                    await onHandle.by(40, 0);
                    await onHandle.release();
                    await expectMm(designer.box("m"), start, "not resized");
                    await expectUntouched(designer);
                });
            }
        });

    test("at 200%, dropped over the column beside the area, where the sheet's scrolled part lies hidden: nothing added @TPL-505",
        async ({page, data, lang}) => {
            const {designer, pt} = await openDesigner(page, data, lang, {
                schemaVersion: 1, page: A4, items: [textItem({xMm: 14, yMm: 100, wMm: 120, hMm: 90})],
            });
            await zoomTo(designer, 200);

            // The sheet runs on to the right, under the settings in English and under the panel in Arabic
            const beside = (await (lang === "en" ? designer.settings : designer.panel).boundingBox())!;
            const area = await areaRect(designer);
            const point = {x: beside.x + beside.width / 2, y: area.y + area.height / 2};
            const sheet = await sheetOnScreen(designer);
            expect(sheet.left, "the sheet's rectangle alone would say on the sheet").toBeLessThan(point.x);
            expect(sheet.right).toBeGreaterThan(point.x);
            expect(point.x, "outside the area's rectangle").toBeGreaterThan(area.x + area.width);

            const drag = await pressEntry(page, designer, pt.manualInput);
            await drag.to(point);
            await expect(designer.ghost).toBeVisible();
            await drag.release();
            await expect(designer.ghost).toHaveCount(0);
            await expect(designer.boxes).toHaveCount(1);
            await expectUntouched(designer);
        });

    test("dropped 1 px outside the sheet, in the area's padding: nothing added; 1 px inside its right edge: added, moved in, fully on the sheet @TPL-506",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());
            const sheet = await sheetOnScreen(designer);
            const area = await areaRect(designer);
            const y = sheet.top + 60 * sheet.pxPerMm;
            const outside = Math.ceil(sheet.right) + 1;
            expect(outside, "still in the area").toBeLessThan(area.x + area.width);

            const off = await pressEntry(page, designer, pt.manualInput);
            await off.to({x: outside, y});
            await off.release();
            await expect(designer.ghost).toHaveCount(0);
            await expect(designer.boxes).toHaveCount(2);
            await expectUntouched(designer);

            const on = await pressEntry(page, designer, pt.manualInput);
            await on.to({x: Math.floor(sheet.right) - 1, y});
            await on.release();
            await expect(designer.boxes).toHaveCount(3);
            await expectMm(designer.box("i1"), {x: 108, y: 60, w: 40, h: 8}, "flush with the right edge");
        });

    test("after a drop the new box has the focus, and an arrow nudges it at once @TPL-507",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());
            const drag = await pressEntry(page, designer, pt.manualInput);
            await drag.toMm(60, 40);
            await drag.release();
            await expect(designer.box("i1")).toBeFocused();

            await page.keyboard.press("ArrowRight");
            await expectMm(designer.box("i1"), {x: 61, y: 40}, "nudged");
            await expect(designer.box("i1")).toBeFocused();
        });
});
