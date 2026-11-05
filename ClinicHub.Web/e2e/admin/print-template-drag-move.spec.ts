import {expect, test} from "../support/fixtures.ts";
import {
    COMPUTER_ONLY,
    expectGuide,
    expectMm,
    expectUnderPointer,
    expectUntouched,
    fiftyItems,
    getTemplate,
    hitAt,
    manualItem,
    ONE_LANGUAGE,
    openDesigner,
    plainLayout,
    pressBox,
    pressEntry,
    pressHandle,
    pressSheetAt,
    reopenDesigner,
    saveLayout,
    sheetOnScreen,
    staticItem,
    typeInto,
} from "../support/print-template.ts";

/** Moving an item with the mouse, through the real app: step 3 design § 3 "Moving", "Snap", "Settled by the T0 reviews"; contract § 3.4. */

test.describe("Print template: moving an item @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("an item dragged goes to the pointer's place, in whole mm, and reloads there after Save @TPL-410",
        async ({page, data, lang}) => {
            const {clinic, designer} = await openDesigner(page, data, lang, plainLayout({xMm: 40.3, yMm: 20.6}));
            const box = designer.box("m");

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            await expectMm(box, {x: 60, y: 40, w: 40, h: 8}, "while dragging");
            await expectUnderPointer(designer, box, drag);
            await drag.release();
            await expectMm(box, {x: 60, y: 40, w: 40, h: 8}, "dropped");

            await saveLayout(page, designer);
            await reopenDesigner(page, designer);
            await expectMm(box, {x: 60, y: 40, w: 40, h: 8}, "after the reload");
            const saved = (await getTemplate(data, clinic))!.layout.items[1];
            expect([saved.xMm, saved.yMm]).toEqual([60, 40]);
        });

    test("an item at 12.3 pressed without moving, or moved under 4 px: it stays at 12.3 and nothing is unsaved @TPL-411",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout({xMm: 12.3}));
            const box = designer.box("m");

            const pressed = await pressBox(page, designer, "m");
            await pressed.release();
            await expect(box, "a press selects").toHaveAttribute("aria-pressed", "true");
            await expect(designer.field(pt.x)).toHaveValue("12.3");
            await expectMm(box, {x: 12.3, y: 20}, "pressed");
            await expectUntouched(designer);

            const nudged = await pressBox(page, designer, "m");
            await nudged.by(3, 0);
            await nudged.release();
            await expectMm(box, {x: 12.3, y: 20}, "moved 3 px");
            await expect(designer.field(pt.x)).toHaveValue("12.3");
            await expectUntouched(designer);
        });

    test("a drag in 50 small moves and the same drag in one: the same mm @TPL-541",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout({xMm: 40.3}));
            const box = designer.box("m");

            const small = await pressBox(page, designer, "m");
            await small.toMm(60, 40, 50);
            await small.release();
            await expectMm(box, {x: 60, y: 40}, "in 50 moves");

            await designer.undo.click();
            await expectMm(box, {x: 40.3, y: 20}, "undone");

            const whole = await pressBox(page, designer, "m");
            await whole.toMm(60, 40, 1);
            await whole.release();
            await expectMm(box, {x: 60, y: 40}, "in one move");
        });

    test("a drag past 4 px that comes back: a whole-mm item is the same layout, no step; x = 12.3 lands on 12, one step @TPL-542",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout({}, manualItem({id: "n", name: "ثان", xMm: 12.3, yMm: 60, wMm: 40, hMm: 8})));

            const whole = await pressBox(page, designer, "m");
            await whole.by(30, 0);
            await whole.by(0, 0);
            await whole.release();
            await expectMm(designer.box("m"), {x: 40, y: 20}, "the whole-mm item");
            await expectUntouched(designer);

            const tenth = await pressBox(page, designer, "n");
            await tenth.by(30, 0);
            await tenth.by(0, 0);
            await tenth.release();
            await expectMm(designer.box("n"), {x: 12, y: 60}, "12.3 snapped");
            await expect(designer.save).toBeEnabled();
            await designer.undo.click();
            await expectMm(designer.box("n"), {x: 12.3, y: 60}, "one step back");
            await expectUntouched(designer);
        });

    // Browser zoom at 125% is, to the page, a window 1 / 1.25 as wide at a scale of 1.25: emulated so, as CI can't press a browser's Ctrl and +
    for (const [what, deviceScaleFactor, viewport] of [
        ["display scaling 125%", 1.25, {width: 1280, height: 800}],
        ["display scaling 150%", 1.5, {width: 1280, height: 800}],
        ["browser zoom 125%", 1.25, {width: 1024, height: 640}],
    ] as const) {
        test.describe(what, () => {
            test.use({deviceScaleFactor, viewport});

            test(`${what}: the item lands under the pointer, at the same mm @TPL-543`,
                async ({page, data, lang}) => {
                    test.skip(lang !== "ar", ONE_LANGUAGE);
                    const {designer} = await openDesigner(page, data, lang, plainLayout());
                    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(deviceScaleFactor);
                    const box = designer.box("m");

                    const drag = await pressBox(page, designer, "m");
                    await drag.toMm(60, 40);
                    await expectUnderPointer(designer, box, drag);
                    await drag.release();
                    await expectMm(box, {x: 60, y: 40, w: 40, h: 8}, "dropped");
                });
        });
    }

    test("two overlapping items: a press on the overlap selects and moves the later one; the order doesn't change, and Save sends the same order @TPL-546",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {clinic, designer} = await openDesigner(page, data, lang, plainLayout({id: "a", name: "أ"}, manualItem({id: "b", name: "ب", xMm: 50, yMm: 24, wMm: 40, hMm: 8})));

            const drag = await pressSheetAt(page, designer, "b", 60, 26);
            await expect(designer.box("b")).toHaveAttribute("aria-pressed", "true");
            await expect(designer.box("a")).toHaveAttribute("aria-pressed", "false");
            await drag.toMm(60, 50);
            await drag.release();
            await expectMm(designer.box("b"), {x: 60, y: 50}, "the later one");
            await expectMm(designer.box("a"), {x: 40, y: 20}, "the one under it");

            const ids = await designer.boxes.evaluateAll(boxes => boxes.map(box => (box as HTMLElement).dataset.itemId));
            expect(ids).toEqual(["t", "a", "b"]);
            await saveLayout(page, designer);
            expect((await getTemplate(data, clinic))!.layout.items.map(item => item.id)).toEqual(["t", "a", "b"]);
        });

    test("a long text overflowing its box, pressed on the overflow over a neighbour: that item is selected and moved @TPL-553",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            // The overflowing item comes later than its neighbour, as the later one is on top (contract § 4.2)
            const {designer} = await openDesigner(page, data, lang, plainLayout(
                {id: "n", name: "جار", xMm: 20, yMm: 40, wMm: 40, hMm: 20},
                staticItem({id: "s", text: "word ".repeat(60).trimEnd(), xMm: 20, yMm: 20, wMm: 60, hMm: 8}),
            ));
            const sheet = await sheetOnScreen(designer);
            const point = {x: Math.round(sheet.left + 30 * sheet.pxPerMm), y: Math.round(sheet.top + 50 * sheet.pxPerMm)};
            expect(await hitAt(page, point), "the overflow lies over the neighbour").toEqual({handle: null, item: "s"});

            const drag = await pressSheetAt(page, designer, "s", (point.x - sheet.left) / sheet.pxPerMm, (point.y - sheet.top) / sheet.pxPerMm);
            await expect(designer.box("s")).toHaveAttribute("aria-pressed", "true");
            await drag.toMm(44, 26);
            await drag.release();
            await expectMm(designer.box("s"), {x: 44, y: 26}, "the overflowing item");
            await expectMm(designer.box("n"), {x: 20, y: 40, w: 40, h: 20}, "its neighbour");
            await expect(designer.box("n")).toHaveAttribute("aria-pressed", "false");
        });

    test("50 items on A4: one dragged, a guide sticks, undo, redo and Save work, and the panel stays disabled @TPL-554",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            test.slow();
            const {clinic, designer, pt} = await openDesigner(page, data, lang, fiftyItems());
            await expect(designer.boxes).toHaveCount(50);
            const box = designer.box("m0");

            const drag = await pressBox(page, designer, "m0");
            await drag.toMm(150, 200.6);
            await expectGuide(designer, "y", 200);
            await drag.release();
            await expectMm(box, {x: 150, y: 200, w: 20, h: 8}, "stuck to the prescription text's top");
            await expect(designer.entry(pt.manualInput)).toHaveAttribute("aria-disabled", "true");

            await designer.undo.click();
            await expectMm(box, {x: 5, y: 5}, "undone");
            await designer.redo.click();
            await expectMm(box, {x: 150, y: 200}, "redone");
            await saveLayout(page, designer);
            await expect(designer.entry(pt.manualInput)).toHaveAttribute("aria-disabled", "true");

            const saved = (await getTemplate(data, clinic))!.layout;
            expect(saved.items).toHaveLength(50);
            expect([saved.items[1].xMm, saved.items[1].yMm]).toEqual([150, 200]);
        });

    test("A selected, B dragged: B is selected with the handles, A's go; Esc: B back, the selection stays on B @TPL-555",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout({id: "a", name: "أ"}, manualItem({id: "b", name: "ب", xMm: 40, yMm: 50, wMm: 40, hMm: 8})));
            const handleNearBox = async (id: string) => {
                await expect.poll(async () => {
                    const [handle, box] = await Promise.all([designer.handle("nw").boundingBox(), designer.box(id).boundingBox()]);
                    return handle && box ? Math.hypot(handle.x + handle.width / 2 - box.x, handle.y + handle.height / 2 - box.y) : Infinity;
                }, {message: `the handles on ${id}`}).toBeLessThanOrEqual(2);
            };

            await designer.box("a").click();
            await handleNearBox("a");

            const drag = await pressBox(page, designer, "b");
            await drag.toMm(60, 70);
            await expect(designer.box("b")).toHaveAttribute("aria-pressed", "true");
            await expect(designer.box("a")).toHaveAttribute("aria-pressed", "false");
            await expect(designer.handles).toHaveCount(8);
            await handleNearBox("b");

            await page.keyboard.press("Escape");
            await expectMm(designer.box("b"), {x: 40, y: 50}, "back");
            await expect(designer.box("b")).toHaveAttribute("aria-pressed", "true");
            await handleNearBox("b");
            await drag.release();
            await expect(designer.box("b")).toHaveAttribute("aria-pressed", "true");
            await expectUntouched(designer);
        });

    test("a press or a drag on a box or a handle: the box has the focus afterwards, and arrows work with no extra click @TPL-559",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout());
            const box = designer.box("m");

            const pressed = await pressBox(page, designer, "m");
            await pressed.release();
            await expect(box).toBeFocused();
            await page.keyboard.press("ArrowDown");
            await expectMm(box, {x: 40, y: 21}, "after a press");

            const dragged = await pressBox(page, designer, "m");
            await dragged.toMm(60, 40);
            await dragged.release();
            await expect(box).toBeFocused();
            await page.keyboard.press("ArrowRight");
            await expectMm(box, {x: 61, y: 40}, "after a drag");

            // The focus elsewhere first, so it's the handle's press that brings it back
            await designer.fit.focus();
            const onHandle = await pressHandle(page, designer, "m", "e");
            await onHandle.release();
            await expect(box).toBeFocused();
            await page.keyboard.press("ArrowLeft");
            await expectMm(box, {x: 60, w: 40}, "after a press on a handle");

            await designer.fit.focus();
            const resized = await pressHandle(page, designer, "m", "e");
            await resized.toMm(110, 44);
            await resized.release();
            await expectMm(box, {x: 60, w: 50}, "resized");
            await expect(box).toBeFocused();
            await page.keyboard.press("ArrowRight");
            await expectMm(box, {x: 61, w: 50}, "after a drag on a handle");
        });

    test("a press or a drag on an entry, a box or a handle: the page's selection stays collapsed, and text in a field can still be selected @TPL-562",
        async ({page, data, lang}) => {
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());
            const collapsed = (what: string) => expect.poll(() => page.evaluate(() => getSelection()?.isCollapsed ?? true), {message: `${what}: nothing selected`}).toBe(true);

            const onEntry = await pressEntry(page, designer, pt.manualInput);
            await onEntry.by(0, 120);
            await collapsed("dragging from an entry");
            await page.keyboard.press("Escape");
            await onEntry.release();
            await collapsed("after an entry");

            const onBox = await pressBox(page, designer, "m");
            await onBox.toMm(60, 40);
            await collapsed("dragging a box");
            await onBox.release();
            await collapsed("after a box");

            const onHandle = await pressHandle(page, designer, "m", "se");
            await onHandle.toMm(110, 60);
            await collapsed("dragging a handle");
            await onHandle.release();
            await collapsed("after a handle");

            await designer.field(pt.name).dblclick();
            await expect.poll(() => designer.field(pt.name).evaluate(field => {
                const input = field as HTMLInputElement;
                return (input.selectionEnd ?? 0) - (input.selectionStart ?? 0);
            }), {message: "a double click selects in the field"}).toBeGreaterThan(0);
        });

    test("X focused with typed text, then the box dragged: the field shows the new X @TPL-582",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer, pt} = await openDesigner(page, data, lang, plainLayout());
            await designer.box("m").click();
            await typeInto(designer.field(pt.x), "30");
            await expectMm(designer.box("m"), {x: 30}, "typed");

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(60, 40);
            await drag.release();
            await expectMm(designer.box("m"), {x: 60, y: 40}, "dragged");
            await expect(designer.field(pt.x)).toHaveValue("60");
            await expect(designer.field(pt.y)).toHaveValue("40");
        });
});
