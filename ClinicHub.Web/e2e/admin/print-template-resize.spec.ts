import {expect, test} from "../support/fixtures.ts";
import {inPrintMedia} from "../support/print.ts";
import {
    COMPUTER_ONLY,
    designerOf,
    expectFullHandleTargets,
    expectGuide,
    expectMm,
    expectUntouched,
    guideLayout,
    handleIds,
    hitAt,
    layoutL,
    manualItem,
    MM,
    ONE_LANGUAGE,
    openDesigner,
    plainLayout,
    pressBox,
    pressHandle,
    sheetOnScreen,
    textItem,
    zoomTo,
} from "../support/print-template.ts";
import type {Lang} from "../support/texts.ts";
import {pageChecks, setLanguage} from "../support/ux.ts";

/** The eight handles, through the real app: step 3 design § 3 "Resizing", "Geometry"; contract § 3.3. */

const ALL_DRAWN = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CORNERS = ["ne", "nw", "se", "sw"];

/** Clear of each other's reach: `t`'s lines are x 10, 70, 130 and y 120, 160, 200; the moving edges go to x 44, 96 and y 44, 76. */
const resizeLayout = () => layoutL({items: [textItem({xMm: 10, yMm: 120, wMm: 120, hMm: 80}), manualItem({xMm: 50, yMm: 50, wMm: 40, hMm: 20})]});

/** Each handle of a box at 50, 50 of 40 x 20: where its edges go, and the box that gives. */
const RESIZES: [string, [number, number], { x: number; y: number; w: number; h: number }][] = [
    ["nw", [44, 44], {x: 44, y: 44, w: 46, h: 26}],
    ["n", [70, 44], {x: 50, y: 44, w: 40, h: 26}],
    ["ne", [96, 44], {x: 50, y: 44, w: 46, h: 26}],
    ["e", [96, 60], {x: 50, y: 50, w: 46, h: 20}],
    ["se", [96, 76], {x: 50, y: 50, w: 46, h: 26}],
    ["s", [70, 76], {x: 50, y: 50, w: 40, h: 26}],
    ["sw", [44, 76], {x: 44, y: 50, w: 46, h: 26}],
    ["w", [44, 60], {x: 44, y: 50, w: 46, h: 20}],
];
const START = {x: 50, y: 50, w: 40, h: 20};

test.describe("Print template: the handles @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("each of the eight handles, dragged: only its edges move and the opposite edges stay @TPL-420",
        async ({page, data, lang}) => {
            const {designer} = await openDesigner(page, data, lang, resizeLayout());
            const box = designer.box("m");
            await box.click();
            expect(await handleIds(designer)).toEqual(ALL_DRAWN);

            for (const [handle, [xMm, yMm], expected] of RESIZES) {
                await test.step(handle, async () => {
                    const drag = await pressHandle(page, designer, "m", handle);
                    await drag.toMm(xMm, yMm);
                    await expectMm(box, expected, `${handle} while dragging`);
                    await drag.release();
                    await expectMm(box, expected, `${handle} dropped`);
                    await designer.undo.click();
                    await expectMm(box, START, `${handle} undone`);
                });
            }
        });

    test("a box with both sides below 36 screen px shows the corners only; zooming in shows all eight @TPL-421",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout({xMm: 20, yMm: 20, wMm: 9, hMm: 9}));
            await designer.box("m").click();
            const expectShown = (ids: string[], what: string) =>
                expect.poll(async () => (await handleIds(designer)).sort(), {message: what}).toEqual(ids);

            await zoomTo(designer, 50);
            await expectShown(CORNERS, "9 x 9 mm at 50%, 17 px");
            await zoomTo(designer, 100);
            await expectShown(CORNERS, "9 x 9 mm at 100%, under 36 px");
            await zoomTo(designer, 125);
            await expectShown([...ALL_DRAWN].sort(), "9 x 9 mm at 125%, 42.5 px");
            await zoomTo(designer, 50);
            await expectShown(CORNERS, "back at 50%");
        });

    test("a handle at 50% and at 200%: the same size on screen, at least 8 px @TPL-423",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout());
            await designer.box("m").click();
            const sizes = () => designer.handles.evaluateAll(all => all.map(handle => {
                const {width, height} = handle.getBoundingClientRect();
                return [width, height];
            }));

            await zoomTo(designer, 50);
            const small = await sizes();
            await zoomTo(designer, 200);
            const large = await sizes();
            expect(small).toHaveLength(8);
            expect(large).toEqual(small);
            for (const [width, height] of small) {
                expect(width).toBeGreaterThanOrEqual(8);
                expect(height).toBeGreaterThanOrEqual(8);
            }
        });

    test("the Arabic and the English UI: each handle in the same physical place, moving the same edge @TPL-424",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", "the test goes through both languages itself");
            await openDesigner(page, data, lang, resizeLayout());
            const seen: Record<string, Record<string, [number, number]>> = {};

            for (const shown of ["ar", "en"] as Lang[]) {
                await test.step(shown, async () => {
                    await setLanguage(page, shown);
                    const designer = designerOf(page, shown);
                    const box = designer.box("m");
                    await box.click();
                    const sheet = await sheetOnScreen(designer);
                    const places = await designer.handles.evaluateAll(all => all.map(handle => {
                        const rect = handle.getBoundingClientRect();
                        return [(handle as HTMLElement).dataset.handle ?? "", rect.left + rect.width / 2, rect.top + rect.height / 2] as const;
                    }));
                    seen[shown] = Object.fromEntries(places.map(([id, x, y]) =>
                        [id, [(x - sheet.left) / sheet.pxPerMm, (y - sheet.top) / sheet.pxPerMm]]));
                    expect(Object.keys(seen[shown]).sort()).toEqual([...ALL_DRAWN].sort());

                    for (const [handle, [xMm, yMm], expected] of RESIZES) {
                        const physical = seen[shown][handle];
                        const px = 1 / sheet.pxPerMm;
                        expect(Math.abs(physical[0] - (handle.includes("w") ? 50 : handle.includes("e") ? 90 : 70)), `${shown} ${handle}: x`).toBeLessThanOrEqual(px);
                        expect(Math.abs(physical[1] - (handle.includes("n") ? 50 : handle.includes("s") ? 70 : 60)), `${shown} ${handle}: y`).toBeLessThanOrEqual(px);

                        const drag = await pressHandle(page, designer, "m", handle);
                        await drag.toMm(xMm, yMm);
                        await drag.release();
                        await expectMm(box, expected, `${shown} ${handle}`);
                        await designer.undo.click();
                        await expectMm(box, START, `${shown} ${handle} undone`);
                    }
                });
            }
            for (const handle of ALL_DRAWN) {
                expect(Math.abs(seen.ar[handle][0] - seen.en[handle][0]), `${handle}: x in both languages`).toBeLessThanOrEqual(0.5);
                expect(Math.abs(seen.ar[handle][1] - seen.en[handle][1]), `${handle}: y in both languages`).toBeLessThanOrEqual(0.5);
            }
        });

    test("Esc during a resize: x, y, w and h exactly as before, no step, nothing unsaved, guides gone @TPL-524",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout({xMm: 40.3, wMm: 39.7}, manualItem({id: "n", name: "جار", xMm: 100, yMm: 60, wMm: 30, hMm: 8})));
            const box = designer.box("m");
            await box.click();

            const drag = await pressHandle(page, designer, "m", "e");
            await drag.toMm(100.4, 24);
            await expectGuide(designer, "x", 100);
            await expectMm(box, {x: 40.3, w: 59.7}, "stuck to the neighbour's left");

            await page.keyboard.press("Escape");
            await expectMm(box, {x: 40.3, y: 20, w: 39.7, h: 8}, "exactly as before");
            await expect(designer.guides).toHaveCount(0);
            await drag.release();
            await expectMm(box, {x: 40.3, y: 20, w: 39.7, h: 8}, "after the release");
            await expectUntouched(designer);
        });

    test("an item flush with each corner of the sheet: every handle is a full target and drags inward; a selected item's handles lie above the box covering it @TPL-547",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const corner = (id: string, xMm: number, yMm: number) => manualItem({id, name: id, xMm, yMm, wMm: 40, hMm: 8});
            const {designer} = await openDesigner(page, data, lang, layoutL({
                items: [
                    textItem({xMm: 30, yMm: 100, wMm: 90, hMm: 90}),
                    corner("c1", 0, 0), corner("c2", 108, 0), corner("c3", 108, 202), corner("c4", 0, 202),
                    manualItem({id: "u", name: "تحت", xMm: 60, yMm: 40, wMm: 20, hMm: 10}),
                    manualItem({id: "k", name: "فوق", xMm: 50, yMm: 30, wMm: 40, hMm: 30}),
                ],
            }));

            for (const [id, handle, start, [xMm, yMm], expected] of [
                ["c1", "nw", {x: 0, y: 0}, [3, 2], {x: 3, y: 2, w: 37, h: 6}],
                ["c2", "ne", {x: 108, y: 0}, [145, 2], {x: 108, y: 2, w: 37, h: 6}],
                ["c3", "se", {x: 108, y: 202}, [145, 208], {x: 108, y: 202, w: 37, h: 6}],
                ["c4", "sw", {x: 0, y: 202}, [3, 208], {x: 3, y: 202, w: 37, h: 6}],
            ] as const) {
                await test.step(id, async () => {
                    await designer.box(id).click();
                    await expect(designer.handles).toHaveCount(8);
                    await expectFullHandleTargets(designer, id);

                    const drag = await pressHandle(page, designer, id, handle);
                    await drag.toMm(xMm, yMm);
                    await drag.release();
                    await expectMm(designer.box(id), expected, `${id} inward`);
                    await designer.undo.click();
                    await expectMm(designer.box(id), {...start, w: 40, h: 8}, `${id} undone`);
                });
            }

            await designer.box("u").focus();
            await page.keyboard.press("Enter");
            await expect(designer.box("u")).toHaveAttribute("aria-pressed", "true");
            await expect(designer.handles).toHaveCount(8);
            await expectFullHandleTargets(designer, "under another box");
        });

    test("only the selected item shows handles, none after Esc or Delete; they aren't in the button; neither they nor guide lines show under print media @TPL-548",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, guideLayout());
            await expect(designer.handles).toHaveCount(0);

            await designer.box("m").click();
            await expect(designer.handles).toHaveCount(8);
            const outside = await designer.handles.evaluateAll(all => all.every(handle =>
                !handle.closest("button") && !handle.closest("[data-testid=template-sheet]") && handle.getAttribute("aria-hidden") === "true"));
            expect(outside, "not in the button nor in the sheet's clip").toBe(true);
            await pageChecks(page, "a box with its handles");

            await designer.box("f").click();
            await expect(designer.handles, "only the selected item's").toHaveCount(8);
            await page.keyboard.press("Escape");
            await expect(designer.box("f")).toHaveAttribute("aria-pressed", "false");
            await expect(designer.handles).toHaveCount(0);

            await designer.box("m").click();
            await expect(designer.handles).toHaveCount(8);
            await page.keyboard.press("Delete");
            await expect(designer.boxes).toHaveCount(2);
            await expect(designer.handles).toHaveCount(0);

            await designer.undo.click();
            await expect(designer.box("m")).toHaveAttribute("aria-pressed", "true");
            await expect(designer.handles).toHaveCount(8);

            const drag = await pressBox(page, designer, "m");
            await drag.toMm(63, 20);
            await expect(designer.guides).toHaveCount(1);
            await inPrintMedia(page, async () => {
                await expect(designer.overlay).toBeHidden();
                await expect(designer.guides.first()).toBeHidden();
                await expect(designer.handles.first()).toBeHidden();
            });
            await page.keyboard.press("Escape");
            await drag.release();
        });

    test("a fully covered item reached by Tab and Enter: it's selected, arrows move it and its handles work @TPL-549",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, layoutL({
                items: [
                    textItem({xMm: 10, yMm: 100, wMm: 120, hMm: 90}),
                    manualItem({id: "u", name: "تحت", xMm: 60, yMm: 40, wMm: 20, hMm: 10}),
                    manualItem({id: "k", name: "فوق", xMm: 50, yMm: 30, wMm: 40, hMm: 30}),
                ],
            }));
            const under = designer.box("u");

            await designer.box("t").focus();
            await page.keyboard.press("Tab");
            await expect(under).toBeFocused();
            await page.keyboard.press("Enter");
            await expect(under).toHaveAttribute("aria-pressed", "true");

            await page.keyboard.press("ArrowRight");
            await expectMm(under, {x: 61, y: 40, w: 20, h: 10}, "by an arrow");

            const drag = await pressHandle(page, designer, "u", "e");
            await drag.toMm(86, 45);
            await drag.release();
            await expectMm(under, {x: 61, y: 40, w: 25, h: 10}, "by its handle");
            await expect(under, "still selected").toHaveAttribute("aria-pressed", "true");
            await expectMm(designer.box("k"), {x: 50, y: 30, w: 40, h: 30}, "the cover");
        });

    test("5 x 4 and 40 x 4 mm boxes at 50%: a part of the box still starts a move, and which handle wins where they meet is stable @TPL-550",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const {designer} = await openDesigner(page, data, lang, plainLayout(
                {id: "a", name: "أ", xMm: 20, yMm: 20, wMm: 5, hMm: 4},
                manualItem({id: "b", name: "ب", xMm: 40, yMm: 40, wMm: 40, hMm: 4}),
            ));
            await zoomTo(designer, 50);
            const sheet = await sheetOnScreen(designer);
            expect(sheet.pxPerMm).toBeCloseTo(MM / 2, 2);

            await test.step("5 x 4 mm: the corners outside the box", async () => {
                await designer.box("a").click();
                expect((await handleIds(designer)).sort()).toEqual(CORNERS);
                const rect = (await designer.box("a").boundingBox())!;
                expect(await hitAt(page, {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}), "the box's middle").toEqual({handle: null, item: "a"});
                const drag = await pressBox(page, designer, "a", {fx: 0.5, fy: 0.5});
                await drag.toMm(30, 30);
                await drag.release();
                await expectMm(designer.box("a"), {x: 30, y: 30, w: 5, h: 4}, "moved");
            });

            await test.step("40 x 4 mm: eight handles, drawn in their order", async () => {
                await designer.box("b").click();
                expect(await handleIds(designer)).toEqual(ALL_DRAWN);
                const rect = (await designer.box("b").boundingBox())!;
                // nw and w meet at the left end: w is drawn later. e and se meet at the right end: se is drawn later
                expect((await hitAt(page, {x: rect.x, y: rect.y + 2})).handle).toBe("w");
                expect((await hitAt(page, {x: rect.x + rect.width, y: rect.y + rect.height - 1})).handle).toBe("se");
                expect(await hitAt(page, {x: rect.x + rect.width / 4, y: rect.y + rect.height / 2}), "a quarter along").toEqual({handle: null, item: "b"});

                const drag = await pressBox(page, designer, "b");
                await drag.toMm(52, 60);
                await drag.release();
                await expectMm(designer.box("b"), {x: 52, y: 60, w: 40, h: 4}, "moved");
            });
        });
});
