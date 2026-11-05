import {describe, expect, test} from "vitest";
import {CSS_PX_PER_MM} from "./constants.ts";
import {
    ALL_HANDLES,
    autoScrollDirection,
    type Box,
    canZoomIn,
    canZoomOut,
    CORNER_HANDLES,
    type DragContext,
    dropCounts,
    fitZoom,
    type HandleId,
    handlePositionPx,
    handlesFor,
    minimumOf,
    moveBox,
    nudgeBox,
    pastDragThreshold,
    pointToMm,
    resizeBox,
    type ScreenRect,
    zoomIn,
    zoomOut,
} from "./dragGeometry.ts";
import {EMPTY_HISTORY, canUndo, isDirty, recordNudge} from "./layoutHistory.ts";
import {normalizeLayout, roundTenth, updateItem} from "./layout.ts";
import type {PrintLayout, TemplateItemKind} from "./types.ts";

/*
 * The designer's drag geometry, from step 3's design (§ 3 and "Settled by the T0 reviews") and contract § 2.1 with the comments of
 * dragGeometry.ts. StrykerJS mutates dragGeometry.ts against this file. Each sheet line and box below is chosen so that only the
 * line a row is about is within 1 mm.
 */

const A5 = {widthMm: 148, heightMm: 210};
const A4 = {widthMm: 210, heightMm: 297};
/** A sheet whose own lines (0, 210, 420; 0, 300, 600) are far from what a row moves. */
const LARGE = {widthMm: 420, heightMm: 600};

const boxOf = (xMm: number, yMm: number, wMm: number, hMm: number): Box => ({xMm, yMm, wMm, hMm});
const context = (fields: Partial<DragContext> = {}): DragContext => ({page: A5, others: [], unsnapped: false, ...fields});
const noMinimum = {wMm: 5, hMm: 4};

/** The numbers of a box, with a `-0` read as 0: the two are the same place. */
const numbers = ({xMm, yMm, wMm, hMm}: Box): Box => ({xMm: xMm + 0, yMm: yMm + 0, wMm: wMm + 0, hMm: hMm + 0});

/** Far from every line of the sheet: an axis a row isn't about stays out of guides. */
const UNRELATED_Y = 20;
const OTHER_Y = 100;
/** A neighbour whose lines are at `start`, `start + 50`, `start + 100`, on the other axis far away. */
const neighbourAt = (start: number) => boxOf(start, OTHER_Y, 100, 8);

/** A neighbour for a resize across: its lines at `x`, `x + 30`, `x + 60`, too far down to matter on the other axis. */
const smallAt = (x: number) => boxOf(x, 180, 60, 2);

describe("print template drag: screen to mm @area:admin", () => {
    const rectAt = (zoomPercent: number, page = A5): ScreenRect => ({
        left: 100,
        top: 50,
        width: page.widthMm * CSS_PX_PER_MM * zoomPercent / 100,
        height: page.heightMm * CSS_PX_PER_MM * zoomPercent / 100,
    });

    test.each([50, 61.5, 100, 200])("at %s%%, the sheet's corners are 0 and the sheet's size in mm @TPL-533", zoom => {
        const rect = rectAt(zoom);
        const topLeft = pointToMm({clientX: rect.left, clientY: rect.top}, rect, A5);
        expect(topLeft.xMm + 0).toBeCloseTo(0, 6);
        expect(topLeft.yMm + 0).toBeCloseTo(0, 6);
        const bottomRight = pointToMm({clientX: rect.left + rect.width, clientY: rect.top + rect.height}, rect, A5);
        expect(bottomRight.xMm).toBeCloseTo(148, 6);
        expect(bottomRight.yMm).toBeCloseTo(210, 6);
    });

    test("not rounded, and past the sheet on every side: negative or above its size @TPL-533", () => {
        const rect = rectAt(100);
        const inside = pointToMm({clientX: rect.left + 10, clientY: rect.top + 20}, rect, A5);
        expect(inside.xMm).toBeCloseTo(10 / CSS_PX_PER_MM, 6);
        expect(inside.yMm).toBeCloseTo(20 / CSS_PX_PER_MM, 6);

        const before = pointToMm({clientX: rect.left - 10, clientY: rect.top - 20}, rect, A5);
        expect(before.xMm).toBeCloseTo(-10 / CSS_PX_PER_MM, 6);
        expect(before.yMm).toBeCloseTo(-20 / CSS_PX_PER_MM, 6);

        const after = pointToMm({clientX: rect.left + rect.width + 10, clientY: rect.top + rect.height + 20}, rect, A5);
        expect(after.xMm).toBeCloseTo(148 + 10 / CSS_PX_PER_MM, 6);
        expect(after.yMm).toBeCloseTo(210 + 20 / CSS_PX_PER_MM, 6);
    });

    test("through the rectangle's own width and height, so each axis uses its own sheet length @TPL-533", () => {
        // The middle of a sheet shown at another size (browser zoom, display scaling): half of each length
        const rect = {left: 0, top: 0, width: 1000, height: 300};
        const middle = pointToMm({clientX: 500, clientY: 150}, rect, A4);
        expect(middle.xMm).toBeCloseTo(105, 6);
        expect(middle.yMm).toBeCloseTo(148.5, 6);
    });

    test("a rectangle with no size (jsdom): 0, never NaN or Infinity @TPL-533", () => {
        const none = {left: 0, top: 0, width: 0, height: 0};
        const point = pointToMm({clientX: 300, clientY: 200}, none, A5);
        expect(point.xMm + 0).toBe(0);
        expect(point.yMm + 0).toBe(0);
    });

    /** The press at (200, 150), the pointer now 10 px to its right: the raw X that gives, as the contract computes it. */
    const rawAfterTenPixels = (zoom: number, startX: number) => {
        const rect = rectAt(zoom);
        const press = pointToMm({clientX: 200, clientY: 150}, rect, A5);
        const now = pointToMm({clientX: 210, clientY: 150}, rect, A5);
        return now.xMm - (press.xMm - startX);
    };

    test.each([
        [50, 17.6, 18],
        [75, 15.8, 16],
        [100, 14.9, 15],
        [125, 14.4, 14],
        [150, 14.1, 14],
        [175, 13.8, 14],
        [200, 13.6, 14],
        // Fit's non-step zoom
        [61.5, 16.6, 17],
    ])("x = 12.3 and +10 px at %s%%: %s with Alt, %s with snap @TPL-533", (zoom, unsnapped, snapped) => {
        const start = boxOf(12.3, UNRELATED_Y, 40, 8);
        const raw = rawAfterTenPixels(zoom, start.xMm);

        expect(moveBox(start, raw, UNRELATED_Y, context({unsnapped: true})).box.xMm).toBe(unsnapped);
        expect(moveBox(start, raw, UNRELATED_Y, context()).box.xMm).toBe(snapped);
    });

    test.each([25, 33.3, 50, 61.5, 75, 100, 125, 150, 175, 200])("at %s%%, however far it goes, a position and a size keep one decimal @TPL-430", zoom => {
        const start = boxOf(12.3, 30.7, 40.3, 8.9);
        for (const pixels of [1, 3, 7, 11, 13, 37, 101]) {
            const raw = start.xMm + pixels / (CSS_PX_PER_MM * zoom / 100);
            const moved = moveBox(start, raw, start.yMm + pixels / 7, context({unsnapped: true})).box;
            expect(moved.xMm).toBe(roundTenth(moved.xMm));
            expect(moved.yMm).toBe(roundTenth(moved.yMm));

            const resized = resizeBox(start, "se", {xMm: start.xMm + start.wMm + raw / 9, yMm: start.yMm + start.hMm + raw / 7}, noMinimum, context({unsnapped: true})).box;
            expect(resized.wMm).toBe(roundTenth(resized.wMm));
            expect(resized.hMm).toBe(roundTenth(resized.hMm));
        }
    });
});

describe("print template drag: what counts as a drag and as a drop @area:admin", () => {
    test.each([
        [0, 0, false],
        [4, 0, false],
        [0, 4, false],
        [-4, 0, false],
        [0, -4, false],
        [5, 0, true],
        [0, 5, true],
        [-5, 0, true],
        [0, -5, true],
        [3, 3, true],
        [-3, -3, true],
        [2, 2, false],
        [4.1, 0, true],
    ])("a movement of (%s, %s) px: past 4 px in a straight line is %s @TPL-503", (dx, dy, past) => {
        expect(pastDragThreshold(dx, dy)).toBe(past);
    });

    const sheet = {left: 100, top: 50, width: 200, height: 300};
    const area = {left: 80, top: 30, width: 150, height: 250};

    test.each([
        ["inside both", 150, 100, true],
        ["on the sheet's left edge", 100, 100, true],
        ["on the sheet's top edge", 150, 50, true],
        ["on the area's right edge", 230, 100, true],
        ["on the area's bottom edge", 150, 280, true],
        ["1 px left of the sheet, in the area", 99, 100, false],
        ["1 px above the sheet, in the area", 150, 49, false],
        ["on the sheet, 1 px right of the area", 231, 100, false],
        ["on the sheet, 1 px below the area", 150, 281, false],
    ])("%s: %s, %s counts as %s @TPL-505 @TPL-506 @TPL-404", (_name, clientX, clientY, counts) => {
        expect(dropCounts({clientX, clientY}, sheet, area)).toBe(counts);
    });

    test("the sheet's own far edges count too, when the area is larger @TPL-506 @TPL-404", () => {
        const large = {left: 0, top: 0, width: 1000, height: 1000};
        expect(dropCounts({clientX: 300, clientY: 350}, sheet, large)).toBe(true);
        expect(dropCounts({clientX: 301, clientY: 350}, sheet, large)).toBe(false);
        expect(dropCounts({clientX: 300, clientY: 351}, sheet, large)).toBe(false);
    });

    test("the area's own near edges count too, when the sheet is larger @TPL-505 @TPL-404", () => {
        const large = {left: 0, top: 0, width: 1000, height: 1000};
        expect(dropCounts({clientX: 80, clientY: 30}, large, area)).toBe(true);
        expect(dropCounts({clientX: 79, clientY: 30}, large, area)).toBe(false);
        expect(dropCounts({clientX: 80, clientY: 29}, large, area)).toBe(false);
    });
});

describe("print template drag: moving keeps the item on the sheet @area:admin", () => {
    test.each([
        ["the sheet's far corner", 140, 205, 108, 202],
        ["its very edge", 147, 209, 108, 202],
        ["just inside it", 107.6, 201.6, 108, 202],
        ["before its near corner", -3, -3, 0, 0],
    ])("a 40 × 8 item dropped at %s: the whole item is inside @TPL-404", (_name, rawX, rawY, x, y) => {
        const dropped = moveBox(boxOf(0, 0, 40, 8), rawX, rawY, context()).box;

        expect(numbers(dropped)).toEqual(boxOf(x, y, 40, 8));
        expect(dropped.xMm + dropped.wMm).toBeLessThanOrEqual(148);
        expect(dropped.yMm + dropped.hMm).toBeLessThanOrEqual(210);
    });

    test("a 30 × 8 function dropped past the corner of an A4 sheet: flush with it @TPL-404", () => {
        expect(moveBox(boxOf(0, 0, 30, 8), 500, 500, context({page: A4})).box).toEqual(boxOf(180, 289, 30, 8));
    });

    test.each([
        ["left", -50, UNRELATED_Y, 0, UNRELATED_Y],
        ["right", 500, UNRELATED_Y, 108, UNRELATED_Y],
        ["top", 12, -50, 12, 0],
        ["bottom", 12, 900, 12, 202],
    ])("past the %s edge it stops at the edge, its size kept @TPL-412", (_name, rawX, rawY, x, y) => {
        expect(numbers(moveBox(boxOf(12.3, UNRELATED_Y, 40, 8), rawX, rawY, context()).box)).toEqual(boxOf(x, y, 40, 8));
    });

    test("with Alt too: past the edges it stops at them @TPL-412", () => {
        const unsnapped = context({unsnapped: true});
        expect(numbers(moveBox(boxOf(12.3, 20.7, 40.3, 8.1), -50, -50, unsnapped).box)).toEqual(boxOf(0, 0, 40.3, 8.1));
        expect(numbers(moveBox(boxOf(12.3, 20.7, 40.3, 8.1), 500, 500, unsnapped).box)).toEqual(boxOf(107.7, 201.9, 40.3, 8.1));
    });

    test("an item longer than the sheet: its start stays at 0, whatever the pointer does @TPL-412", () => {
        const long = boxOf(0, 0, 160, 220);
        expect(numbers(moveBox(long, 30, 30, context()).box)).toEqual(long);
        expect(numbers(moveBox(long, -30, -30, context()).box)).toEqual(long);
    });

    test("w = 40.3: exactly 40.3 after a snap, an Alt move and a guide; never rounded @TPL-535", () => {
        const start = boxOf(12.3, UNRELATED_Y, 40.3, 8.7);

        const snapped = moveBox(start, 20.7, 33.3, context()).box;
        expect(snapped).toEqual(boxOf(21, 33, 40.3, 8.7));

        const unsnapped = moveBox(start, 20.74, 33.36, context({unsnapped: true})).box;
        expect(unsnapped).toEqual(boxOf(20.7, 33.4, 40.3, 8.7));

        // Its center on the sheet's, 74 - 20.15 = 53.85, rounded by roundTenth
        const onGuide = moveBox(start, 53.8, 33.3, context());
        expect(onGuide.box).toEqual(boxOf(53.9, 33, 40.3, 8.7));
        expect(onGuide.guides).toEqual([{axis: "x", mm: 74}]);
    });

    test.each([
        ["far past the edge", 200, []],
        ["just past whole-mm 108", 108.4, [{axis: "x", mm: 148}]],
        ["just before it", 107.2, [{axis: "x", mm: 148}]],
    ])("w = 40.3 on A5, %s: x = 107.7, flush; the edge beats whole mm @TPL-536", (_name, raw, guides) => {
        const moved = moveBox(boxOf(12.3, UNRELATED_Y, 40.3, 8), raw, UNRELATED_Y, context());
        expect(moved.box.xMm).toBe(107.7);
        expect(moved.box.wMm).toBe(40.3);
        expect(moved.guides).toEqual(guides);
    });

    test("the same on the other axis: h = 8.3 on A5 is flush at y = 201.7 @TPL-536", () => {
        expect(moveBox(boxOf(20, 12.3, 40, 8.3), 20, 500, context()).box.yMm).toBe(201.7);
    });

    test("an item partly past the sheet comes inside on the first move, on each axis @TPL-544", () => {
        expect(numbers(moveBox(boxOf(140, 46, 72, 8), 140, 46, context()).box)).toEqual(boxOf(76, 46, 72, 8));
        expect(numbers(moveBox(boxOf(20, -5, 40, 8), 20, -5, context()).box)).toEqual(boxOf(20, 0, 40, 8));
        expect(numbers(moveBox(boxOf(-7, 205, 40, 8), -7, 205, context()).box)).toEqual(boxOf(0, 202, 40, 8));
    });
});

describe("print template drag: snap and Alt @area:admin", () => {
    test.each([
        [12.46, 12],
        // The raw value itself, never through its tenth 12.5
        [12.49, 12],
        [12.5, 13],
        [12.51, 13],
        [30.0, 30],
    ])("raw %s snaps to %s @TPL-430", (raw, x) => {
        expect(moveBox(boxOf(0, UNRELATED_Y, 40, 8), raw, UNRELATED_Y, context()).box.xMm).toBe(x);
        expect(moveBox(boxOf(UNRELATED_Y, 0, 40, 8), UNRELATED_Y, raw, context()).box.yMm).toBe(x);
    });

    test.each([
        [12.34, 12.3],
        [12.35, 12.4],
        [12.3, 12.3],
        [0.30000000000000004, 0.3],
    ])("with Alt, raw %s is stored as %s, on both axes @TPL-430", (raw, stored) => {
        const unsnapped = moveBox(boxOf(0, 0, 40, 8), raw, raw, context({unsnapped: true}));
        expect(unsnapped.box.xMm).toBe(stored);
        expect(unsnapped.box.yMm).toBe(stored);
        expect(unsnapped.guides).toEqual([]);
    });

    test("with Alt, a line within reach neither sticks nor shows @TPL-431", () => {
        const moved = moveBox(boxOf(0, UNRELATED_Y, 40, 8), 13, UNRELATED_Y, context({others: [neighbourAt(12.3)], unsnapped: true}));
        expect(moved.box.xMm).toBe(13);
        expect(moved.guides).toEqual([]);
    });
});

describe("print template drag: guides while moving @area:admin", () => {
    test("another item's left within 1 mm: it sticks and the line shows; past 1 mm it snaps to whole mm and the line goes @TPL-431", () => {
        const start = boxOf(30, UNRELATED_Y, 40, 8);
        const others = [neighbourAt(12.3)];

        const near = moveBox(start, 13, UNRELATED_Y, context({others}));
        expect(near.box).toEqual(boxOf(12.3, UNRELATED_Y, 40, 8));
        expect(near.guides).toEqual([{axis: "x", mm: 12.3}]);

        const past = moveBox(start, 13.4, UNRELATED_Y, context({others}));
        expect(past.box).toEqual(boxOf(13, UNRELATED_Y, 40, 8));
        expect(past.guides).toEqual([]);
    });

    test.each([
        ["exactly 1.0 mm above", 13.3, 12.3, true],
        ["exactly 1.0 mm below", 11.3, 12.3, true],
        ["1.1 mm above", 13.4, 13, false],
        ["1.1 mm below", 11.2, 11, false],
        ["compared by its tenth: 13.34 is 13.3", 13.34, 12.3, true],
        ["compared by its tenth: 13.36 is 13.4", 13.36, 13, false],
    ])("a neighbour's left at 12.3, a moving left edge %s @TPL-537", (_name, raw, x, sticks) => {
        const moved = moveBox(boxOf(30, UNRELATED_Y, 40, 8), raw, UNRELATED_Y, context({others: [neighbourAt(12.3)]}));
        expect(moved.box.xMm).toBe(x);
        expect(moved.guides).toEqual(sticks ? [{axis: "x", mm: 12.3}] : []);
    });

    test("the same on the other axis @TPL-537", () => {
        const others = [boxOf(100, 12.3, 30, 30)];
        const near = moveBox(boxOf(20, 40, 40, 8), 20, 13.3, context({others}));
        expect(near.box.yMm).toBe(12.3);
        expect(near.guides).toEqual([{axis: "y", mm: 12.3}]);

        const past = moveBox(boxOf(20, 40, 40, 8), 20, 13.4, context({others}));
        expect(past.box.yMm).toBe(13);
        expect(past.guides).toEqual([]);
    });

    test.each([
        ["in that order", [neighbourAt(12.3), neighbourAt(13.8)]],
        ["the other way round", [neighbourAt(13.8), neighbourAt(12.3)]],
    ])("two lines in range, %s: the nearest wins @TPL-537", (_name, others) => {
        const moved = moveBox(boxOf(30, UNRELATED_Y, 40, 8), 13.2, UNRELATED_Y, context({others}));
        expect(moved.box.xMm).toBe(13.8);
        expect(moved.guides).toEqual([{axis: "x", mm: 13.8}]);
    });

    test("two lines at the same distance: the first found stays @TPL-537", () => {
        const first = moveBox(boxOf(30, UNRELATED_Y, 40, 8), 13, UNRELATED_Y, context({others: [neighbourAt(12), neighbourAt(14)]}));
        expect(first.box.xMm).toBe(12);
        expect(first.guides).toEqual([{axis: "x", mm: 12}]);

        const swapped = moveBox(boxOf(30, UNRELATED_Y, 40, 8), 13, UNRELATED_Y, context({others: [neighbourAt(14), neighbourAt(12)]}));
        expect(swapped.box.xMm).toBe(14);
        expect(swapped.guides).toEqual([{axis: "x", mm: 14}]);
    });

    test("the same distance from one neighbour's start and center: its start, the first in order @TPL-537", () => {
        // Lines at 11, 13, 15; the moving start at 12
        const moved = moveBox(boxOf(30, UNRELATED_Y, 40, 8), 12, UNRELATED_Y, context({others: [boxOf(11, OTHER_Y, 4, 8)]}));
        expect(moved.box.xMm).toBe(11);
        expect(moved.guides).toEqual([{axis: "x", mm: 11}]);
    });

    test("the same distance from the moving box's start and center: the start's, the first in order, whichever neighbour comes first @TPL-537", () => {
        // The moving box at 20: start 20 is 1 from 19, center 40 is 1 from 41
        const fromCenter = boxOf(41, OTHER_Y, 10, 8);
        const fromStart = boxOf(19, OTHER_Y, 5, 8);
        for (const others of [[fromCenter, fromStart], [fromStart, fromCenter]]) {
            const moved = moveBox(boxOf(30, UNRELATED_Y, 40, 8), 20, UNRELATED_Y, context({others}));
            expect(moved.box.xMm).toBe(19);
            expect(moved.guides).toEqual([{axis: "x", mm: 19}]);
        }
    });

    test("the moving box's center nearer than its start: the center's line wins @TPL-537", () => {
        const others = [boxOf(40.5, OTHER_Y, 10, 8), boxOf(19, OTHER_Y, 5, 8)];
        const moved = moveBox(boxOf(30, UNRELATED_Y, 40, 8), 20, UNRELATED_Y, context({others}));
        expect(moved.box.xMm).toBe(20.5);
        expect(moved.guides).toEqual([{axis: "x", mm: 40.5}]);
    });

    test("the same distance from a neighbour's line and the sheet's: the neighbour's, other items come first @TPL-537", () => {
        const moved = moveBox(boxOf(30, UNRELATED_Y, 40, 8), 0.5, UNRELATED_Y, context({others: [neighbourAt(1)]}));
        expect(moved.box.xMm).toBe(1);
        expect(moved.guides).toEqual([{axis: "x", mm: 1}]);
    });

    test("a guide beats whole mm: it can line up at 12.3 @TPL-431", () => {
        const moved = moveBox(boxOf(30, UNRELATED_Y, 40, 8), 12.6, UNRELATED_Y, context({others: [neighbourAt(12.3)]}));
        expect(moved.box.xMm).toBe(12.3);
    });

    test("a line the sheet's limits moved the box off isn't shown @TPL-431", () => {
        // Its start would stick at 141; the limit then holds it at 107.7
        const moved = moveBox(boxOf(30, UNRELATED_Y, 40.3, 8), 140, UNRELATED_Y, context({others: [boxOf(141, OTHER_Y, 5, 4)]}));
        expect(moved.box.xMm).toBe(107.7);
        expect(moved.guides).toEqual([]);
    });

    test("a guide on each axis at once, at most one per axis @TPL-432", () => {
        const others = [boxOf(100, 200, 44, 30), boxOf(100.2, 200.2, 44, 30)];
        const moved = moveBox(boxOf(0, 0, 30, 10), 100.5, 200.5, context({page: LARGE, others}));
        expect(moved.box).toEqual(boxOf(100.2, 200.2, 30, 10));
        expect(moved.guides).toHaveLength(2);
        expect(moved.guides).toEqual(expect.arrayContaining([{axis: "x", mm: 100.2}, {axis: "y", mm: 200.2}]));
    });

    // A 30 × 10 box (its lines at +0, +15, +30; +0, +5, +10) and a 44 × 30 neighbour at (100, 200): lines 100, 122, 144; 200, 215, 230.
    const MOVING_X = [["start", 0], ["center", 15], ["end", 30]] as const;
    const TARGET_X = [["start", 100], ["center", 122], ["end", 144]] as const;
    const MOVING_Y = [["top", 0], ["middle", 5], ["bottom", 10]] as const;
    const TARGET_Y = [["top", 200], ["middle", 215], ["bottom", 230]] as const;
    const neighbour = boxOf(100, 200, 44, 30);
    const FAR = 300;
    const FAR_Y = 400;

    describe.each(MOVING_X)("the moving %s", (_moving, offset) => {
        test.each(TARGET_X)("sticks to a neighbour's %s, from both sides @TPL-432", (_target, line) => {
            for (const off of [0.4, -0.4]) {
                const moved = moveBox(boxOf(0, 0, 30, 10), line - offset + off, FAR_Y, context({page: LARGE, others: [neighbour]}));
                expect(moved.box.xMm).toBe(line - offset);
                expect(moved.box.yMm).toBe(FAR_Y);
                expect(moved.guides).toEqual([{axis: "x", mm: line}]);
            }
        });
    });

    describe.each(MOVING_Y)("the moving %s", (_moving, offset) => {
        test.each(TARGET_Y)("sticks to a neighbour's %s, from both sides @TPL-432", (_target, line) => {
            for (const off of [0.4, -0.4]) {
                const moved = moveBox(boxOf(0, 0, 30, 10), FAR, line - offset + off, context({page: LARGE, others: [neighbour]}));
                expect(moved.box.yMm).toBe(line - offset);
                expect(moved.box.xMm).toBe(FAR);
                expect(moved.guides).toEqual([{axis: "y", mm: line}]);
            }
        });
    });

    test.each([
        ["start on the sheet's start", 0, 0],
        ["start on the sheet's center", 0, 210],
        ["center on the sheet's center", 15, 210],
        ["end on the sheet's center", 30, 210],
        ["end on the sheet's end", 30, 420],
    ])("across: the moving %s @TPL-432", (_name, offset, line) => {
        const moved = moveBox(boxOf(50, 50, 30, 10), line - offset + 0.4, FAR_Y, context({page: LARGE}));
        expect(moved.box.xMm + 0).toBe(line - offset);
        expect(moved.guides).toEqual([{axis: "x", mm: line}]);
    });

    test.each([
        ["top on the sheet's top", 0, 0],
        ["top on the sheet's middle", 0, 300],
        ["middle on the sheet's middle", 5, 300],
        ["bottom on the sheet's middle", 10, 300],
        ["bottom on the sheet's bottom", 10, 600],
    ])("down: the moving %s @TPL-432", (_name, offset, line) => {
        const moved = moveBox(boxOf(50, 50, 30, 10), FAR, line - offset + 0.4, context({page: LARGE}));
        expect(moved.box.yMm + 0).toBe(line - offset);
        expect(moved.guides).toEqual([{axis: "y", mm: line}]);
    });

    test("only one item on the sheet: its sheet guides work and nothing fails @TPL-435", () => {
        const start = boxOf(30, 30, 40, 8);

        const corner = moveBox(start, 0.5, 0.5, context());
        expect(numbers(corner.box)).toEqual(boxOf(0, 0, 40, 8));
        expect(corner.guides).toHaveLength(2);
        expect(corner.guides).toEqual(expect.arrayContaining([{axis: "x", mm: 0}, {axis: "y", mm: 0}]));

        const center = moveBox(start, 54.4, 100.6, context());
        expect(center.box).toEqual(boxOf(54, 101, 40, 8));
        expect(center.guides).toHaveLength(2);
        expect(center.guides).toEqual(expect.arrayContaining([{axis: "x", mm: 74}, {axis: "y", mm: 105}]));

        const edge = moveBox(start, 107.6, 201.6, context());
        expect(edge.box).toEqual(boxOf(108, 202, 40, 8));
        expect(edge.guides).toEqual(expect.arrayContaining([{axis: "x", mm: 148}, {axis: "y", mm: 210}]));

        const away = moveBox(start, 30.4, 30.4, context());
        expect(away.box).toEqual(boxOf(30, 30, 40, 8));
        expect(away.guides).toEqual([]);
    });

    test("w = 5.1 and the sheet's center at 74: x rounds by roundTenth, 71.45 → 71.5, one decimal stored @TPL-539", () => {
        const moved = moveBox(boxOf(20, UNRELATED_Y, 5.1, 8), 71.5, UNRELATED_Y, context());
        expect(moved.box.xMm).toBe(71.5);
        expect(moved.box.wMm).toBe(5.1);
        expect(moved.guides).toEqual([{axis: "x", mm: 74}]);
    });

    test("a neighbour's center in half-tenths: within 1.0 sticks, at 1.05 doesn't; the start rounds up from its midpoint @TPL-539", () => {
        // The neighbour's lines at 10, 22.55, 35.1; the moving box 5 wide: its center at raw + 2.5
        const others = [boxOf(10, OTHER_Y, 25.1, 8)];
        const within = moveBox(boxOf(60, UNRELATED_Y, 5, 8), 21, UNRELATED_Y, context({others}));
        expect(within.box.xMm).toBe(20.1);
        expect(within.guides).toHaveLength(1);
        expect(within.guides[0].axis).toBe("x");

        const past = moveBox(boxOf(60, UNRELATED_Y, 5, 8), 21.1, UNRELATED_Y, context({others}));
        expect(past.box.xMm).toBe(21);
        expect(past.guides).toEqual([]);
    });

    test("a custom sheet 150.5 wide: its center 75.25 compares in tenths without failing @TPL-539", () => {
        const moved = moveBox(boxOf(20, UNRELATED_Y, 10, 8), 70, UNRELATED_Y, context({page: {widthMm: 150.5, heightMm: 210}}));
        // 75.25 - 5 = 70.25, rounded by roundTenth
        expect(moved.box.xMm).toBe(70.3);
        expect(moved.guides).toHaveLength(1);
        expect(moved.guides[0].axis).toBe("x");
        // The target's value (contract § 6.9): how a half-tenth line is stored isn't settled, so only where it lies is checked
        expect(Math.abs(moved.guides[0].mm - 75.25)).toBeLessThanOrEqual(0.05);
    });
});

describe("print template drag: resizing @area:admin", () => {
    const start = boxOf(20, 30, 40, 50);
    const FAR_EDGE = 999;

    test.each<[HandleId, { xMm: number; yMm: number }, Box]>([
        ["nw", {xMm: 25, yMm: 35}, boxOf(25, 35, 35, 45)],
        ["n", {xMm: FAR_EDGE, yMm: 35}, boxOf(20, 35, 40, 45)],
        ["ne", {xMm: 70, yMm: 35}, boxOf(20, 35, 50, 45)],
        ["e", {xMm: 70, yMm: FAR_EDGE}, boxOf(20, 30, 50, 50)],
        ["se", {xMm: 70, yMm: 90}, boxOf(20, 30, 50, 60)],
        ["s", {xMm: FAR_EDGE, yMm: 90}, boxOf(20, 30, 40, 60)],
        ["sw", {xMm: 25, yMm: 90}, boxOf(25, 30, 35, 60)],
        ["w", {xMm: 25, yMm: FAR_EDGE}, boxOf(25, 30, 35, 50)],
    ])("%s moves only its edges; the opposite edges stay @TPL-420", (handle, edge, expected) => {
        const {box} = resizeBox(start, handle, edge, noMinimum, context());
        expect(box).toEqual(expected);
        // The edges this handle doesn't move
        if (!handle.includes("w")) expect(box.xMm).toBe(20);
        if (!handle.includes("e")) expect(box.xMm + box.wMm).toBe(60);
        if (!handle.includes("n")) expect(box.yMm).toBe(30);
        if (!handle.includes("s")) expect(box.yMm + box.hMm).toBe(80);
    });

    test.each<[string, HandleId, { xMm: number; yMm: number }, Box]>([
        ["the left edge", "w", {xMm: 11.2, yMm: FAR_EDGE}, boxOf(11, 30.3, 41.3, 20)],
        ["the right edge", "e", {xMm: 60.7, yMm: FAR_EDGE}, boxOf(12.3, 30.3, 48.7, 20)],
        ["the top edge", "n", {xMm: FAR_EDGE, yMm: 28.6}, boxOf(12.3, 29, 40, 21.3)],
        ["the bottom edge", "s", {xMm: FAR_EDGE, yMm: 130.6}, boxOf(12.3, 30.3, 40, 100.7)],
        ["the top-left corner, on both axes", "nw", {xMm: 11.2, yMm: 28.6}, boxOf(11, 29, 41.3, 21.3)],
        ["the top-right corner, on both axes", "ne", {xMm: 60.7, yMm: 28.6}, boxOf(12.3, 29, 48.7, 21.3)],
        ["the bottom-right corner, on both axes", "se", {xMm: 60.7, yMm: 130.6}, boxOf(12.3, 30.3, 48.7, 100.7)],
        ["the bottom-left corner, on both axes", "sw", {xMm: 11.2, yMm: 130.6}, boxOf(11, 30.3, 41.3, 100.7)],
    ])("x = 12.3, w = 40, y = 30.3, h = 20, %s lands on whole mm; the rest stays in tenths @TPL-534", (_name, handle, edge, expected) => {
        expect(resizeBox(boxOf(12.3, 30.3, 40, 20), handle, edge, noMinimum, context()).box).toEqual(expected);
    });

    test("x = 12.3, w = 40, the left edge to 11.2: x = 11, w = 41.3, and the right edge stays 52.3 in tenths @TPL-534", () => {
        const {box} = resizeBox(boxOf(12.3, UNRELATED_Y, 40, 8), "w", {xMm: 11.2, yMm: FAR_EDGE}, noMinimum, context());
        expect(box.xMm).toBe(11);
        expect(box.wMm).toBe(41.3);
        expect(roundTenth(box.xMm + box.wMm)).toBe(52.3);
    });

    test("the edge snaps from its raw value, never through its tenth: 60.46 → 60 @TPL-534", () => {
        expect(resizeBox(boxOf(12.3, UNRELATED_Y, 40, 8), "e", {xMm: 60.46, yMm: FAR_EDGE}, noMinimum, context()).box.wMm).toBe(47.7);
    });

    test("with Alt: the edge is kept with one decimal, in tenths, and no guide @TPL-430", () => {
        const others = [smallAt(70.4)];
        const unsnapped = context({others, unsnapped: true});
        const right = resizeBox(boxOf(12.3, UNRELATED_Y, 40, 8), "e", {xMm: 70.04, yMm: FAR_EDGE}, noMinimum, unsnapped);
        expect(right.box.wMm).toBe(57.7);
        expect(right.guides).toEqual([]);

        const left = resizeBox(boxOf(12.3, UNRELATED_Y, 40, 8), "w", {xMm: 10.06, yMm: FAR_EDGE}, noMinimum, unsnapped);
        expect(left.box.xMm).toBe(10.1);
        expect(left.box.wMm).toBe(42.2);

        const bottom = resizeBox(boxOf(12.3, 20.3, 40, 8), "s", {xMm: FAR_EDGE, yMm: 40.04}, noMinimum, unsnapped);
        expect(bottom.box.hMm).toBe(19.7);

        const top = resizeBox(boxOf(12.3, 20.3, 40, 8), "n", {xMm: FAR_EDGE, yMm: 10.06}, noMinimum, unsnapped);
        expect(top.box.yMm).toBe(10.1);
        expect(top.box.hMm).toBe(18.2);
    });

    test.each<[TemplateItemKind, number, number]>([
        ["manualInput", 5, 4],
        ["function", 5, 4],
        ["staticText", 5, 4],
        ["prescriptionText", 5, 20],
    ])("%s: at least %s wide and %s high @TPL-422", (kind, wMm, hMm) => {
        expect(minimumOf({kind})).toEqual({wMm, hMm});
    });

    describe.each<[string, { wMm: number; hMm: number }]>([
        ["a manual input", {wMm: 5, hMm: 4}],
        ["the prescription text", {wMm: 5, hMm: 20}],
    ])("%s dragged below its minimums", (_name, minimum) => {
        test.each<[HandleId, { xMm: number; yMm: number }, Partial<Box>]>([
            ["e", {xMm: 21, yMm: FAR_EDGE}, {xMm: 20, wMm: 5}],
            ["e", {xMm: 5, yMm: FAR_EDGE}, {xMm: 20, wMm: 5}],
            ["w", {xMm: 59, yMm: FAR_EDGE}, {xMm: 55, wMm: 5}],
            ["w", {xMm: 100, yMm: FAR_EDGE}, {xMm: 55, wMm: 5}],
        ])("%s to %j: the width stops there, no flip @TPL-422", (handle, edge, expected) => {
            expect(resizeBox(start, handle, edge, minimum, context()).box).toMatchObject(expected);
        });

        test("downwards: the bottom edge above the top, and the top below the bottom: the height stops there, no flip @TPL-422", () => {
            expect(resizeBox(start, "s", {xMm: FAR_EDGE, yMm: 5}, minimum, context()).box).toMatchObject({yMm: 30, hMm: minimum.hMm});
            expect(resizeBox(start, "n", {xMm: FAR_EDGE, yMm: 200}, minimum, context()).box).toMatchObject({yMm: 80 - minimum.hMm, hMm: minimum.hMm});
        });
    });

    test("the size exactly at the minimum is allowed, and one whole mm more @TPL-422", () => {
        expect(resizeBox(start, "e", {xMm: 25, yMm: FAR_EDGE}, noMinimum, context()).box.wMm).toBe(5);
        expect(resizeBox(start, "e", {xMm: 26, yMm: FAR_EDGE}, noMinimum, context()).box.wMm).toBe(6);
        expect(resizeBox(start, "s", {xMm: FAR_EDGE, yMm: 34}, noMinimum, context()).box.hMm).toBe(4);
        expect(resizeBox(start, "s", {xMm: FAR_EDGE, yMm: 35}, noMinimum, context()).box.hMm).toBe(5);
    });

    test.each<[HandleId, { xMm: number; yMm: number }, Box]>([
        ["e", {xMm: 500, yMm: FAR_EDGE}, boxOf(20, 30, 128, 50)],
        ["s", {xMm: FAR_EDGE, yMm: 500}, boxOf(20, 30, 40, 180)],
        ["w", {xMm: -50, yMm: FAR_EDGE}, boxOf(0, 30, 60, 50)],
        ["n", {xMm: FAR_EDGE, yMm: -50}, boxOf(20, 0, 40, 80)],
        ["se", {xMm: 500, yMm: 500}, boxOf(20, 30, 128, 180)],
        ["nw", {xMm: -50, yMm: -50}, boxOf(0, 0, 60, 80)],
    ])("%s dragged past the sheet: the size stops at its edge @TPL-422", (handle, edge, expected) => {
        expect(numbers(resizeBox(start, handle, edge, noMinimum, context()).box)).toEqual(expected);
    });

    test("right edge 52.3, the left handle crossing it: x = 47.3, w = 5, no flip @TPL-536", () => {
        expect(resizeBox(boxOf(12.3, UNRELATED_Y, 40, 8), "w", {xMm: 60, yMm: FAR_EDGE}, noMinimum, context()).box)
            .toEqual(boxOf(47.3, UNRELATED_Y, 5, 8));
    });

    test("bottom edge 52.3, the top handle crossing it: y = 48.3, h = 4, no flip @TPL-536", () => {
        expect(resizeBox(boxOf(UNRELATED_Y, 12.3, 40, 40), "n", {xMm: FAR_EDGE, yMm: 60}, noMinimum, context()).box)
            .toEqual(boxOf(UNRELATED_Y, 48.3, 40, 4));
    });

    describe("guides: only the moving edges stick", () => {
        test.each<[string, HandleId, { xMm: number; yMm: number }, Box[], Box, { axis: "x" | "y"; mm: number }[]]>([
            ["the right edge, on a neighbour's left", "e", {xMm: 70, yMm: FAR_EDGE}, [smallAt(70.4)], boxOf(20, 30, 50.4, 50), [{axis: "x", mm: 70.4}]],
            ["the right edge, on a neighbour's center", "e", {xMm: 80, yMm: FAR_EDGE}, [boxOf(70.4, 180, 20, 2)], boxOf(20, 30, 60.4, 50), [{axis: "x", mm: 80.4}]],
            ["the right edge, on a neighbour's end", "e", {xMm: 90, yMm: FAR_EDGE}, [boxOf(70.4, 180, 20, 2)], boxOf(20, 30, 70.4, 50), [{axis: "x", mm: 90.4}]],
            ["the left edge", "w", {xMm: 15, yMm: FAR_EDGE}, [smallAt(14.6)], boxOf(14.6, 30, 45.4, 50), [{axis: "x", mm: 14.6}]],
            ["the bottom edge", "s", {xMm: FAR_EDGE, yMm: 90}, [boxOf(100, 90.4, 2, 20)], boxOf(20, 30, 40, 60.4), [{axis: "y", mm: 90.4}]],
            ["the top edge", "n", {xMm: FAR_EDGE, yMm: 25}, [boxOf(100, 24.6, 2, 2)], boxOf(20, 24.6, 40, 55.4), [{axis: "y", mm: 24.6}]],
            ["the sheet's right edge", "e", {xMm: 147.5, yMm: FAR_EDGE}, [], boxOf(20, 30, 128, 50), [{axis: "x", mm: 148}]],
            ["the sheet's center, across", "e", {xMm: 74.5, yMm: FAR_EDGE}, [], boxOf(20, 30, 54, 50), [{axis: "x", mm: 74}]],
            ["the sheet's left edge", "w", {xMm: 0.5, yMm: FAR_EDGE}, [], boxOf(0, 30, 60, 50), [{axis: "x", mm: 0}]],
            ["the sheet's bottom edge", "s", {xMm: FAR_EDGE, yMm: 209.5}, [], boxOf(20, 30, 40, 180), [{axis: "y", mm: 210}]],
            ["the sheet's middle, down", "s", {xMm: FAR_EDGE, yMm: 105.5}, [], boxOf(20, 30, 40, 75), [{axis: "y", mm: 105}]],
            ["the sheet's top edge", "n", {xMm: FAR_EDGE, yMm: 0.5}, [], boxOf(20, 0, 40, 80), [{axis: "y", mm: 0}]],
        ])("%s sticks and shows @TPL-433", (_name, handle, edge, others, box, guides) => {
            const resized = resizeBox(start, handle, edge, noMinimum, context({others}));
            expect(numbers(resized.box)).toEqual(box);
            expect(resized.guides).toEqual(guides);
        });

        test("a corner: both moving edges stick, one line per axis @TPL-433", () => {
            const others = [boxOf(70.4, 90.4, 20, 20)];
            const resized = resizeBox(start, "se", {xMm: 70, yMm: 90}, noMinimum, context({others}));
            expect(resized.box).toEqual(boxOf(20, 30, 50.4, 60.4));
            expect(resized.guides).toHaveLength(2);
            expect(resized.guides).toEqual(expect.arrayContaining([{axis: "x", mm: 70.4}, {axis: "y", mm: 90.4}]));
        });

        test.each<[string, HandleId, { xMm: number; yMm: number }, Box[], Box]>([
            ["the box's center at 45", "e", {xMm: 70, yMm: FAR_EDGE}, [smallAt(45)], boxOf(20, 30, 50, 50)],
            ["the opposite edge at 20", "e", {xMm: 70, yMm: FAR_EDGE}, [smallAt(20.5)], boxOf(20, 30, 50, 50)],
            ["the opposite edge at 60", "w", {xMm: 25, yMm: FAR_EDGE}, [smallAt(60.5)], boxOf(25, 30, 35, 50)],
            ["the top, with only the right edge moving", "e", {xMm: 70, yMm: FAR_EDGE}, [boxOf(100, 30.5, 2, 2)], boxOf(20, 30, 50, 50)],
            ["the bottom, with only the right edge moving", "e", {xMm: 70, yMm: FAR_EDGE}, [boxOf(100, 80.5, 2, 2)], boxOf(20, 30, 50, 50)],
            ["the left, with only the bottom edge moving", "s", {xMm: FAR_EDGE, yMm: 90}, [boxOf(20.5, 180, 2, 2)], boxOf(20, 30, 40, 60)],
            ["the right, with only the top edge moving", "n", {xMm: FAR_EDGE, yMm: 35}, [boxOf(60.5, 180, 2, 2)], boxOf(20, 35, 40, 45)],
        ])("%s doesn't stick and shows no line @TPL-433", (_name, handle, edge, others, box) => {
            const resized = resizeBox(start, handle, edge, noMinimum, context({others}));
            expect(resized.box).toEqual(box);
            expect(resized.guides).toEqual([]);
        });

        test.each<[string, number, number, boolean]>([
            ["exactly 1.0 mm above", 71.4, 50.4, true],
            ["exactly 1.0 mm below", 69.4, 50.4, true],
            ["1.1 mm above", 71.5, 52, false],
            ["1.1 mm below", 69.3, 49, false],
            // Its tenth 71.5 is out of reach, and it snaps from the raw value
            ["71.46", 71.46, 51, false],
        ])("a neighbour at 70.4, the moving edge %s @TPL-433", (_name, raw, wMm, sticks) => {
            const resized = resizeBox(start, "e", {xMm: raw, yMm: FAR_EDGE}, noMinimum, context({others: [smallAt(70.4)]}));
            expect(resized.box.wMm).toBe(wMm);
            expect(resized.guides).toEqual(sticks ? [{axis: "x", mm: 70.4}] : []);
        });

        test("two lines in range: the nearest; at the same distance, the first found @TPL-433", () => {
            const nearest = (others: Box[]) => resizeBox(start, "e", {xMm: 71, yMm: FAR_EDGE}, noMinimum, context({others})).box.wMm;
            expect(nearest([smallAt(70.4), smallAt(70.8)])).toBe(50.8);
            expect(nearest([smallAt(70.8), smallAt(70.4)])).toBe(50.8);
            expect(nearest([smallAt(70), smallAt(72)])).toBe(50);
            expect(nearest([smallAt(72), smallAt(70)])).toBe(52);
        });

        test.each<[string, HandleId, { xMm: number; yMm: number }, Box[], Partial<Box>]>([
            ["at the minimum", "e", {xMm: 21.5, yMm: FAR_EDGE}, [smallAt(21)], {xMm: 20, wMm: 5}],
            ["at the minimum, the moving start", "w", {xMm: 59.5, yMm: FAR_EDGE}, [smallAt(59)], {xMm: 55, wMm: 5}],
            ["past the sheet", "e", {xMm: 149.5, yMm: FAR_EDGE}, [smallAt(150)], {xMm: 20, wMm: 128}],
        ])("a line the limits moved the edge off isn't shown: %s @TPL-433", (_name, handle, edge, others, box) => {
            const resized = resizeBox(start, handle, edge, noMinimum, context({others}));
            expect(resized.box).toMatchObject(box);
            expect(resized.guides).toEqual([]);
        });
    });

    describe("a box below the minimum, or off the sheet", () => {
        test.each([1, 0, -5])("a typed width of %s: each handle gives a box at least the minimum on what it moves @TPL-545", width => {
            for (const handle of ALL_HANDLES) {
                const {box} = resizeBox(boxOf(20, 30, width, 50), handle, {xMm: 21, yMm: 31}, noMinimum, context());
                for (const value of [box.xMm, box.yMm, box.wMm, box.hMm]) expect(Number.isFinite(value)).toBe(true);
                if (handle === "n" || handle === "s") expect(box.wMm).toBe(width);
                else expect(box.wMm).toBeGreaterThanOrEqual(5);
                expect(box.hMm).toBeGreaterThanOrEqual(4);
            }
        });

        test.each([1, 0, -5])("a typed height of %s: each handle gives a box at least the minimum on what it moves @TPL-545", height => {
            for (const handle of ALL_HANDLES) {
                const {box} = resizeBox(boxOf(20, 30, 40, height), handle, {xMm: 21, yMm: 31}, noMinimum, context());
                if (handle === "e" || handle === "w") expect(box.hMm).toBe(height);
                else expect(box.hMm).toBeGreaterThanOrEqual(4);
            }
        });

        test.each<[string, Box, HandleId, { xMm: number; yMm: number }, Partial<Box>]>([
            ["w = 1, by the end", boxOf(20, 30, 1, 50), "e", {xMm: 20.5, yMm: FAR_EDGE}, {xMm: 20, wMm: 5}],
            ["w = 0, by the end", boxOf(20, 30, 0, 50), "e", {xMm: 10, yMm: FAR_EDGE}, {xMm: 20, wMm: 5}],
            ["w = -5, by the end", boxOf(20, 30, -5, 50), "e", {xMm: 10, yMm: FAR_EDGE}, {xMm: 20, wMm: 5}],
            ["w = 1, by the start", boxOf(20, 30, 1, 50), "w", {xMm: 30, yMm: FAR_EDGE}, {xMm: 16, wMm: 5}],
            ["w = 1, by the start, growing", boxOf(20, 30, 1, 50), "w", {xMm: 10, yMm: FAR_EDGE}, {xMm: 10, wMm: 11}],
            ["w = 0, by the start", boxOf(20, 30, 0, 50), "w", {xMm: 30, yMm: FAR_EDGE}, {xMm: 15, wMm: 5}],
            ["w = -5, by the start", boxOf(20, 30, -5, 50), "w", {xMm: 30, yMm: FAR_EDGE}, {xMm: 10, wMm: 5}],
            ["w = -5 near the sheet's start", boxOf(2, 30, -5, 50), "w", {xMm: 30, yMm: FAR_EDGE}, {xMm: 0, wMm: 5}],
            ["h = 1, by the end", boxOf(20, 30, 40, 1), "s", {xMm: FAR_EDGE, yMm: 31}, {yMm: 30, hMm: 4}],
            ["h = 1, by the start", boxOf(20, 30, 40, 1), "n", {xMm: FAR_EDGE, yMm: 40}, {yMm: 27, hMm: 4}],
            ["h = -5, by the start", boxOf(20, 30, 40, -5), "n", {xMm: FAR_EDGE, yMm: 40}, {yMm: 21, hMm: 4}],
        ])("%s: the exact box @TPL-545", (_name, box, handle, edge, expected) => {
            expect(numbers(resizeBox(box, handle, edge, noMinimum, context()).box)).toMatchObject(expected);
        });

        test.each<[string, Box, HandleId, { xMm: number; yMm: number }, Partial<Box>]>([
            ["x = 145, w = 5 on A5, by its right edge", boxOf(145, 30, 5, 50), "e", {xMm: 150, yMm: FAR_EDGE}, {xMm: 143, wMm: 5}],
            ["x = 145, w = 5 on A5, its right edge inward", boxOf(145, 30, 5, 50), "e", {xMm: 146, yMm: FAR_EDGE}, {xMm: 143, wMm: 5}],
            ["x = 150, w = 10 on A5, by its left edge", boxOf(150, 30, 10, 50), "w", {xMm: 100, yMm: FAR_EDGE}, {xMm: 100, wMm: 48}],
            ["x = -10, w = 30 on A5, by its right edge", boxOf(-10, 30, 30, 50), "e", {xMm: 30, yMm: FAR_EDGE}, {xMm: 0, wMm: 30}],
            ["y = 208, h = 5 on A5, by its bottom edge", boxOf(20, 208, 40, 5), "s", {xMm: FAR_EDGE, yMm: 220}, {yMm: 206, hMm: 4}],
            ["y = 215, h = 10 on A5, by its top edge", boxOf(20, 215, 40, 10), "n", {xMm: FAR_EDGE, yMm: 100}, {yMm: 100, hMm: 110}],
            ["y = -10, h = 30 on A5, by its bottom edge", boxOf(20, -10, 40, 30), "s", {xMm: FAR_EDGE, yMm: 30}, {yMm: 0, hMm: 30}],
        ])("off the sheet, on the moving axis: %s @TPL-544", (_name, box, handle, edge, expected) => {
            expect(numbers(resizeBox(box, handle, edge, noMinimum, context()).box)).toMatchObject(expected);
        });

        test.each<[string, Box, HandleId, { xMm: number; yMm: number }, Box]>([
            ["past the right, by the bottom edge", boxOf(140, 50, 40, 8), "s", {xMm: FAR_EDGE, yMm: 70}, boxOf(108, 50, 40, 20)],
            ["past the left, by the top edge", boxOf(-5, 50, 40, 8), "n", {xMm: FAR_EDGE, yMm: 40}, boxOf(0, 40, 40, 18)],
            ["past the bottom, by the right edge", boxOf(20, 205, 40, 20), "e", {xMm: 70, yMm: FAR_EDGE}, boxOf(20, 190, 50, 20)],
            ["past the top, by the left edge", boxOf(20, -5, 40, 20), "w", {xMm: 10, yMm: FAR_EDGE}, boxOf(10, 0, 50, 20)],
            ["longer than the sheet, by the bottom edge", boxOf(-5, 50, 160, 8), "s", {xMm: FAR_EDGE, yMm: 70}, boxOf(0, 50, 160, 20)],
        ])("off the sheet, on the axis that doesn't move: %s: it comes inside, its length kept @TPL-544", (_name, box, handle, edge, expected) => {
            expect(numbers(resizeBox(box, handle, edge, noMinimum, context()).box)).toEqual(expected);
        });

        test("inside the sheet, the axis that doesn't move stays exactly as it is @TPL-544", () => {
            expect(resizeBox(boxOf(12.3, 30.3, 40.7, 20.1), "s", {xMm: FAR_EDGE, yMm: 80}, noMinimum, context()).box).toEqual(boxOf(12.3, 30.3, 40.7, 49.7));
            expect(resizeBox(boxOf(12.3, 30.3, 40.7, 20.1), "e", {xMm: 80, yMm: FAR_EDGE}, noMinimum, context()).box).toEqual(boxOf(12.3, 30.3, 67.7, 20.1));
        });
    });
});

describe("print template drag: the keyboard @area:admin", () => {
    const start = boxOf(12.3, 20.7, 40, 8);

    test.each([
        ["right 1", 1, 0, 13.3, 20.7],
        ["left 1", -1, 0, 11.3, 20.7],
        ["down 1", 0, 1, 12.3, 21.7],
        ["up 1", 0, -1, 12.3, 19.7],
        ["right 5", 5, 0, 17.3, 20.7],
        ["left 5", -5, 0, 7.3, 20.7],
        ["right 0.1", 0.1, 0, 12.4, 20.7],
        ["left 0.1", -0.1, 0, 12.2, 20.7],
        ["down 0.1", 0, 0.1, 12.3, 20.8],
        ["up 0.1", 0, -0.1, 12.3, 20.6],
    ])("%s: from the current value, no rounding to whole mm @TPL-540", (_name, dx, dy, xMm, yMm) => {
        expect(nudgeBox(start, dx, dy, A5)).toEqual({...start, xMm, yMm});
    });

    test.each<[string, Box, number, number, Box]>([
        ["the left edge", boxOf(0, 20, 40, 8), -1, 0, boxOf(0, 20, 40, 8)],
        ["the top edge", boxOf(20, 0, 40, 8), 0, -1, boxOf(20, 0, 40, 8)],
        ["the right edge", boxOf(108, 20, 40, 8), 1, 0, boxOf(108, 20, 40, 8)],
        ["the bottom edge", boxOf(20, 202, 40, 8), 0, 1, boxOf(20, 202, 40, 8)],
        ["2 mm from the left edge, moving 5", boxOf(2, 20, 40, 8), -5, 0, boxOf(0, 20, 40, 8)],
        ["2 mm from the top edge, moving 5", boxOf(20, 2, 40, 8), 0, -5, boxOf(20, 0, 40, 8)],
        ["2 mm from the right edge, moving 5", boxOf(106, 20, 40, 8), 5, 0, boxOf(108, 20, 40, 8)],
        ["2 mm from the bottom edge, moving 5", boxOf(20, 200, 40, 8), 0, 5, boxOf(20, 202, 40, 8)],
        ["0.1 mm from the right edge, moving 0.1", boxOf(107.9, 20, 40, 8), 0.1, 0, boxOf(108, 20, 40, 8)],
    ])("at %s: the arrow stops there @TPL-442", (_name, box, dx, dy, expected) => {
        expect(numbers(nudgeBox(box, dx, dy, A5))).toEqual(expected);
    });

    test("a box longer than the sheet stays at 0 @TPL-442", () => {
        expect(numbers(nudgeBox(boxOf(0, 0, 160, 220), 1, 1, A5))).toEqual(boxOf(0, 0, 160, 220));
    });

    test("100 presses of Alt + arrow from 12.3: 22.3 exactly, in the layout and in the request; and back @TPL-540", () => {
        let box = boxOf(12.3, 20.3, 40, 8);
        for (let press = 0; press < 100; press++) box = nudgeBox(box, 0.1, 0.1, A5);
        expect(box).toEqual(boxOf(22.3, 30.3, 40, 8));

        const layout: PrintLayout = {
            schemaVersion: 1,
            page: {size: "A5", ...A5},
            items: [{id: "m", kind: "manualInput", name: "الاسم", ...boxOf(12.3, 20.3, 40, 8), fontSizePt: 11}],
        };
        const sent = normalizeLayout(updateItem(layout, "m", {xMm: box.xMm, yMm: box.yMm}));
        expect(sent.items[0]).toMatchObject({xMm: 22.3, yMm: 30.3, wMm: 40, hMm: 8});

        for (let press = 0; press < 100; press++) box = nudgeBox(box, -0.1, -0.1, A5);
        expect(box).toEqual(boxOf(12.3, 20.3, 40, 8));
    });

    test("three of 0.1 from 0: 0.3, no float noise @TPL-540", () => {
        const box = nudgeBox(nudgeBox(nudgeBox(boxOf(0, 0, 40, 8), 0.1, 0, A5), 0.1, 0, A5), 0.1, 0, A5);
        expect(box.xMm).toBe(0.3);
    });

    test("from 107.5 with a max of 107.7, one arrow lands on 107.7 @TPL-540", () => {
        expect(nudgeBox(boxOf(107.5, 20, 40.3, 8), 1, 0, A5).xMm).toBe(107.7);
    });

    test("already at the edge: the same numbers, no step, nothing unsaved @TPL-540", () => {
        const box = boxOf(107.7, 20, 40.3, 8);
        const nudged = nudgeBox(box, 1, 0, A5);
        expect(nudged).toEqual(box);

        const before: PrintLayout = {schemaVersion: 1, page: {size: "A5", ...A5}, items: [{id: "m", kind: "manualInput", name: "الاسم", ...box, fontSizePt: 11}]};
        const after = updateItem(before, "m", {xMm: nudged.xMm, yMm: nudged.yMm});
        const history = recordNudge(EMPTY_HISTORY, before, after, "m", 0);
        expect(canUndo(history)).toBe(false);
        expect(isDirty(after, before, {})).toBe(false);
    });

    test.each<[string, Box, number, number, Box]>([
        ["past the right, moving right", boxOf(140, 46, 72, 8), 1, 0, boxOf(76, 46, 72, 8)],
        ["past the right, moving left", boxOf(140, 46, 72, 8), -1, 0, boxOf(76, 46, 72, 8)],
        ["past the left, moving left", boxOf(-5, 46, 40, 8), -1, 0, boxOf(0, 46, 40, 8)],
        ["past the left, moving right", boxOf(-5, 46, 40, 8), 1, 0, boxOf(0, 46, 40, 8)],
        ["past the bottom, moving up", boxOf(20, 208, 40, 8), 0, -1, boxOf(20, 202, 40, 8)],
        ["past the right, moving down: the other axis comes in too", boxOf(140, 46, 72, 8), 0, 1, boxOf(76, 47, 72, 8)],
    ])("an item off the sheet, %s: the nearest inside position @TPL-544", (_name, box, dx, dy, expected) => {
        expect(numbers(nudgeBox(box, dx, dy, A5))).toEqual(expected);
    });
});

describe("print template drag: which handles @area:admin", () => {
    test.each([
        [5, 4, 100, 4],
        [9, 9, 100, 4],
        [10, 10, 100, 8],
        [40, 8, 50, 8],
    ])("%s × %s mm at %s%%: %s handles @TPL-551", (wMm, hMm, zoom, count) => {
        const handles = handlesFor({wMm, hMm}, zoom);
        expect(handles).toEqual(count === 8 ? [...ALL_HANDLES] : [...CORNER_HANDLES]);
    });

    test.each([
        ["both sides just below 36 px", 9.5, 9.5, 100, CORNER_HANDLES],
        ["both just over", 9.6, 9.6, 100, ALL_HANDLES],
        ["only the width over", 9.6, 4, 100, ALL_HANDLES],
        ["only the height over", 4, 9.6, 100, ALL_HANDLES],
        ["zoomed in to 200%: 5 × 5 is 37.8 px", 5, 5, 200, ALL_HANDLES],
        ["at 200%, 4.7 × 4.7 is 35.5 px", 4.7, 4.7, 200, CORNER_HANDLES],
        ["at 50%, 19 × 19 is 35.9 px", 19, 19, 50, CORNER_HANDLES],
        ["at 50%, 20 × 4 is 37.8 × 7.6 px", 20, 4, 50, ALL_HANDLES],
        ["at Fit's 61.5%, 15.4 × 4 is 35.8 × 9.3 px", 15.4, 4, 61.5, CORNER_HANDLES],
        ["at Fit's 61.5%, 15.5 × 4 is 36.03 × 9.3 px", 15.5, 4, 61.5, ALL_HANDLES],
    ])("%s @TPL-551", (_name, wMm, hMm, zoom, handles) => {
        expect(handlesFor({wMm, hMm}, zoom)).toEqual([...handles]);
    });

    test("the corners are the four corners, and every handle is one of the eight, drawn in the contract's order @TPL-551", () => {
        expect([...ALL_HANDLES]).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);
        expect([...CORNER_HANDLES]).toEqual(["nw", "ne", "se", "sw"]);
    });

    test("a typed width of 1, 0 or -5: the set is still a set of corners, nothing fails @TPL-545", () => {
        for (const wMm of [1, 0, -5]) expect(handlesFor({wMm, hMm: 4}, 100)).toEqual([...CORNER_HANDLES]);
    });

    const box = boxOf(10, 20, 40, 30);
    const SIZE = 8;

    describe.each([50, 100, 200])("at %s%%", zoom => {
        const px = (mm: number) => mm * CSS_PX_PER_MM * zoom / 100;

        test.each<[HandleId, number, number]>([
            ["nw", 10, 20],
            ["n", 30, 20],
            ["ne", 50, 20],
            ["e", 50, 35],
            ["se", 50, 50],
            ["s", 30, 50],
            ["sw", 10, 50],
            ["w", 10, 35],
        ])("all eight: %s is centered on its corner or the middle of its edge @TPL-551", (handle, xMm, yMm) => {
            const {leftPx, topPx} = handlePositionPx(box, handle, zoom, false);
            expect(leftPx).toBeCloseTo(px(xMm) - SIZE / 2, 6);
            expect(topPx).toBeCloseTo(px(yMm) - SIZE / 2, 6);
        });

        test.each<[HandleId, number, number]>([
            ["nw", px(10) - SIZE, px(20) - SIZE],
            ["ne", px(50), px(20) - SIZE],
            ["se", px(50), px(50)],
            ["sw", px(10) - SIZE, px(50)],
        ])("corners only: %s lies entirely outside the box, touching its corner @TPL-551", (handle, left, top) => {
            const {leftPx, topPx} = handlePositionPx(box, handle, zoom, true);
            expect(leftPx).toBeCloseTo(left, 6);
            expect(topPx).toBeCloseTo(top, 6);
        });
    });

    test("a typed width of 0 or -5: the position is still a number @TPL-545", () => {
        for (const wMm of [0, -5]) {
            for (const handle of ALL_HANDLES) {
                const {leftPx, topPx} = handlePositionPx(boxOf(20, 30, wMm, 8), handle, 100, false);
                expect(Number.isFinite(leftPx)).toBe(true);
                expect(Number.isFinite(topPx)).toBe(true);
            }
        }
    });
});

describe("print template zoom: the numbers @area:admin", () => {
    test.each([
        // 210 mm is 793.70 px, 148 mm is 559.37 px
        ["the height limits it", 800, 500, A5, 62.9],
        ["the width limits it", 300, 900, A5, 53.6],
        ["A4 on a laptop: below 50%", 1000, 450, A4, 40],
    ])("Fit, %s: floored to one decimal @TPL-460", (_name, width, height, page, zoom) => {
        expect(fitZoom(width, height, page)).toBe(zoom);
    });

    test("Fit is limited to 200 on a very large area and 25 on a very small one @TPL-580", () => {
        expect(fitZoom(5000, 5000, A5)).toBe(200);
        expect(fitZoom(100, 100, LARGE)).toBe(25);
    });

    test("nothing scrolls by rounding: the sheet at Fit is never larger than the area @TPL-460", () => {
        for (const [width, height] of [[800, 500], [333, 777], [1234, 567], [640, 481], [901, 613]]) {
            const zoom = fitZoom(width, height, A5);
            expect(Math.round(zoom * 10) / 10).toBe(zoom);
            expect(148 * CSS_PX_PER_MM * zoom / 100).toBeLessThanOrEqual(width);
            expect(210 * CSS_PX_PER_MM * zoom / 100).toBeLessThanOrEqual(height);
        }
    });

    test.each([
        [0, 500],
        [500, 0],
        [-32, 500],
        [500, -32],
        [0, 0],
    ])("Fit of %s × %s (jsdom's 0 less the padding, or not measured yet): 100 @TPL-460", (width, height) => {
        expect(fitZoom(width, height, A5)).toBe(100);
    });

    test.each([
        [61.5, 75],
        [30, 50],
        [25, 50],
        [40, 50],
        [50, 75],
        [75, 100],
        [100, 125],
        [125, 150],
        [150, 175],
        [175, 200],
        [199, 200],
        [200, 200],
    ])("plus from %s: %s @TPL-461 @TPL-587", (from, to) => {
        expect(zoomIn(from)).toBe(to);
    });

    test.each([
        [61.5, 50],
        [125, 100],
        [100, 75],
        [75, 50],
        [51, 50],
        [50, 50],
        [30, 30],
        [25, 25],
        [200, 175],
        [199, 175],
    ])("minus from %s: %s @TPL-461 @TPL-587", (from, to) => {
        expect(zoomOut(from)).toBe(to);
    });

    test.each([
        [25, true, false],
        [30, true, false],
        [50, true, false],
        [50.1, true, true],
        [61.5, true, true],
        [100, true, true],
        [199.9, true, true],
        [200, false, true],
    ])("at %s%%: plus %s, minus %s @TPL-461 @TPL-580", (percent, plus, minus) => {
        expect(canZoomIn(percent)).toBe(plus);
        expect(canZoomOut(percent)).toBe(minus);
    });
});

describe("print template drag: scrolling near the area's edge @area:admin", () => {
    const area = {left: 100, top: 50, width: 400, height: 300};

    test.each([
        ["on the left edge", 100, -1],
        ["inside the left band", 110, -1],
        ["exactly 24 from the left", 124, -1],
        ["25 from the left", 125, 0],
        ["in the middle", 300, 0],
        ["25 from the right", 475, 0],
        ["exactly 24 from the right", 476, 1],
        ["on the right edge", 500, 1],
        ["past the left edge", 99, 0],
        ["past the right edge", 501, 0],
    ])("across, %s @TPL-470", (_name, clientX, x) => {
        expect(autoScrollDirection({clientX, clientY: 200}, area)).toEqual({x, y: 0});
    });

    test.each([
        ["on the top edge", 50, -1],
        ["exactly 24 from the top", 74, -1],
        ["25 from the top", 75, 0],
        ["25 from the bottom", 325, 0],
        ["exactly 24 from the bottom", 326, 1],
        ["on the bottom edge", 350, 1],
        ["past the top edge", 49, 0],
        ["past the bottom edge", 351, 0],
    ])("down, %s @TPL-470", (_name, clientY, y) => {
        expect(autoScrollDirection({clientX: 300, clientY}, area)).toEqual({x: 0, y});
    });

    test.each([
        ["top left", 110, 60, -1, -1],
        ["top right", 490, 60, 1, -1],
        ["bottom left", 110, 340, -1, 1],
        ["bottom right", 490, 340, 1, 1],
    ])("in the %s corner, both axes @TPL-470", (_name, clientX, clientY, x, y) => {
        expect(autoScrollDirection({clientX, clientY}, area)).toEqual({x, y});
    });

    test.each([
        ["above the area, in the left band", 110, 40],
        ["below the area, in the right band", 490, 360],
        ["left of the area, in the top band", 90, 60],
        ["right of the area, in the bottom band", 510, 340],
    ])("the pointer outside the area: no scroll, %s @TPL-470", (_name, clientX, clientY) => {
        expect(autoScrollDirection({clientX, clientY}, area)).toEqual({x: 0, y: 0});
    });

    test.each([
        // 40 px wide and high, from 100 to 140 and from 50 to 90
        ["only the start in reach", 115, 65, -1, -1],
        ["only the end in reach", 125, 75, 1, 1],
        ["both in reach, the start nearer", 118, 68, -1, -1],
        ["both in reach, the end nearer", 122, 72, 1, 1],
        ["both in reach, a tie goes to the start", 120, 70, -1, -1],
    ])("an area under 48 px: %s @TPL-470", (_name, clientX, clientY, x, y) => {
        expect(autoScrollDirection({clientX, clientY}, {left: 100, top: 50, width: 40, height: 40})).toEqual({x, y});
    });
});
