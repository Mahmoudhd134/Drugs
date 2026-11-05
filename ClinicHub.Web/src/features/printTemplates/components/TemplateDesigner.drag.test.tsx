import {beforeEach, describe, expect, test, vi} from "vitest";
import {act, fireEvent, screen} from "@testing-library/react";
import {AREA_BOTTOM_GAP_PX, AREA_MIN_HEIGHT_PX, AREA_PADDING_PX, AUTO_SCROLL_PX_PER_FRAME, CSS_PX_PER_MM, MAX_ITEMS} from "../constants.ts";
import type {PrintLayout} from "../types.ts";
import {aPrintLayout, aTemplateItem} from "../../../test";
import {
    blurAll,
    boxOf,
    dragGhost,
    FIELD_LABEL,
    fitButton,
    guideLines,
    handleIds,
    handleOf,
    measuresOf,
    panelEntry,
    pressKey,
    pressShortcut,
    REDO_KEYS,
    REDO_SHIFT_KEYS,
    releaseKey,
    renderDesigner,
    saveButton,
    selectedIds,
    settingsField,
    sheetArea,
    sheetBoxes,
    theSheet,
    UNDO_KEYS,
    undoButton,
    unloadAsks,
    zoomInButton,
    zoomOutButton,
    zoomPercent,
} from "../../../test/pages/printTemplate.tsx";

/*
 * A drag from the press to the end, on the screen: step 3 design § 3 ("Moving", "Resizing", "Dragging from the panel", "Snap", "Guides",
 * "Alt", "Scrolling", "Settled by the T0 reviews"), contract §§ 3.3, 3.4, 3.5. jsdom has no layout, so `stubLayout` gives the area and
 * the sheet the rectangles a browser would: the sheet's size is its frame's inline size, which follows the zoom, and its place follows
 * the area's scroll. Each case's level in the catalog stays e2e; the tags here count as extra.
 */

type Rect = { left: number; top: number; width: number; height: number };
type Point = { clientX: number; clientY: number };

/** A plain A5 at 100% is 559 × 794 px: this area holds all of it, its bands away from everything but the tests about them. */
const WIDE_AREA: Rect = {left: 200, top: 100, width: 800, height: 900};
/** The panel's side of the window: outside the area and the sheet. */
const IN_PANEL: Point = {clientX: 50, clientY: 300};

let areaRect: Rect;

const toDomRect = ({left, top, width, height}: Rect) =>
    ({left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({})}) as DOMRect;

const rectOf = (element: Element): DOMRect => {
    if (element.querySelector(":scope > [data-testid='template-sheet-frame']")) return toDomRect(areaRect);
    const frame = element.closest<HTMLElement>("[data-testid='template-sheet-frame']");
    if (frame && element.getAttribute("data-testid") === "template-sheet") {
        const area = frame.parentElement as HTMLElement;
        return toDomRect({
            left: areaRect.left + AREA_PADDING_PX - area.scrollLeft,
            top: areaRect.top + AREA_PADDING_PX - area.scrollTop,
            width: parseFloat(frame.style.width),
            height: parseFloat(frame.style.height),
        });
    }
    return toDomRect({left: 0, top: 0, width: 0, height: 0});
};

beforeEach(() => {
    areaRect = {...WIDE_AREA};
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function stubLayout(this: Element) {
        return rectOf(this);
    });
});

/** A place on the sheet, in mm from its top-left, on the screen now: through the zoom and the scroll. */
const at = (xMm: number, yMm: number): Point => {
    const rect = theSheet().getBoundingClientRect();
    const pxPerMm = rect.width / parseFloat(theSheet().style.width);
    return {clientX: rect.left + xMm * pxPerMm, clientY: rect.top + yMm * pxPerMm};
};

type PointerInit = { altKey?: boolean };

const press = (element: Element, point: Point, init: PointerInit & { button?: number; buttons?: number; pointerId?: number } = {}) =>
    fireEvent.pointerDown(element, {pointerId: 1, button: 0, buttons: 1, ...point, ...init});
const moveTo = (element: Element, point: Point, init: PointerInit & { buttons?: number } = {}) =>
    fireEvent.pointerMove(element, {pointerId: 1, button: -1, buttons: 1, ...point, ...init});
const releaseAt = (element: Element, point: Point, init: PointerInit = {}) =>
    fireEvent.pointerUp(element, {pointerId: 1, button: 0, buttons: 0, ...point, ...init});
/** The `click` a mouse's release gives. */
const mouseClick = (element: Element) => fireEvent.click(element, {detail: 1});
/** A press and a release in place: the box is selected, its handles show. */
const select = (id: string) => {
    press(boxOf(id), at(20, 25));
    releaseAt(boxOf(id), at(20, 25));
    mouseClick(boxOf(id));
};

const placeOf = (id: string) => {
    const {x, y, w, h} = measuresOf(boxOf(id));
    return {x, y, w, h};
};

/** Requested animation frames, run by the test, so an auto-scroll is counted exactly. */
const stubFrames = () => {
    const pending = new Map<number, FrameRequestCallback>();
    let lastId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        pending.set(++lastId, callback);
        return lastId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
    return {
        run: (count: number) => {
            for (let i = 0; i < count; i++) {
                const now = [...pending.values()];
                pending.clear();
                now.forEach(callback => callback(0));
            }
        },
        waiting: () => pending.size,
    };
};

/** Pointer capture as a browser keeps it: who holds it, and a release that tells the element, as a real one does. */
const stubCapture = () => {
    const holders = new Set<Element>();
    vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(function capture(this: Element) {
        holders.add(this);
    });
    vi.spyOn(Element.prototype, "hasPointerCapture").mockImplementation(function holds(this: Element) {
        return holders.has(this);
    });
    vi.spyOn(Element.prototype, "releasePointerCapture").mockImplementation(function release(this: Element) {
        holders.delete(this);
        this.dispatchEvent(new Event("lostpointercapture"));
    });
    return holders;
};

/**
 * t, the prescription text, at x 14, 74, 134 and y 80, 125, 170; m, the manual input (40 × 8), at 12.3 × 20.3; f, the function, at
 * x 70, 85, 100 and y 46, 50, 54. The sheet's lines: x 0, 74, 148 and y 0, 105, 210.
 */
const layoutL = (): PrintLayout => aPrintLayout({
    items: [
        aTemplateItem("prescriptionText", {id: "t", xMm: 14, yMm: 80, wMm: 120, hMm: 90}),
        aTemplateItem("manualInput", {id: "m", xMm: 12.3, yMm: 20.3, wMm: 40, hMm: 8}),
        aTemplateItem("function", {id: "f", xMm: 70, yMm: 46, wMm: 30, hMm: 8}),
    ],
});

/** Where m's box is pressed in these tests. */
const PRESS_M = {xMm: 20, yMm: 25};
/** The pointer's place on the sheet that gives m this raw top-left. */
const pointerForM = (rawX: number, rawY: number) => at(PRESS_M.xMm + rawX - 12.3, PRESS_M.yMm + rawY - 20.3);
/** m pressed and moved to the raw top-left (31.6, 30.4): no line within reach, so it snaps to (32, 30). */
const dragM = (rawX = 31.6, rawY = 30.4, init: PointerInit = {}) => {
    press(boxOf("m"), at(PRESS_M.xMm, PRESS_M.yMm));
    moveTo(boxOf("m"), pointerForM(rawX, rawY), init);
};
const M_AT_REST = {x: "12.3mm", y: "20.3mm", w: "40mm", h: "8mm"};
const M_DRAGGED = {x: "32mm", y: "30mm", w: "40mm", h: "8mm"};

describe("print template drag: a box @area:admin", () => {
    test("moved in whole mm, on a preview: nothing is unsaved until the drop, and the drop is one undo step @TPL-410 @TPL-530 @TPL-559", async () => {
        const {user} = await renderDesigner(layoutL());

        dragM();

        expect(placeOf("m")).toEqual(M_DRAGGED);
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("32");
        expect(settingsField(FIELD_LABEL.y)).toHaveValue("30");
        expect(saveButton()).toBeDisabled();
        expect(undoButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);

        releaseAt(boxOf("m"), pointerForM(31.6, 30.4));

        expect(placeOf("m")).toEqual(M_DRAGGED);
        expect(selectedIds()).toEqual(["m"]);
        expect(boxOf("m")).toHaveFocus();
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);

        await user.click(undoButton());

        expect(placeOf("m")).toEqual(M_AT_REST);
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test("the place comes from the press: 50 small moves give the mm of one big one @TPL-541", async () => {
        await renderDesigner(layoutL());
        press(boxOf("m"), at(PRESS_M.xMm, PRESS_M.yMm));

        for (let step = 1; step <= 50; step++) moveTo(boxOf("m"), pointerForM(12.3 + (31.6 - 12.3) * step / 50, 20.3 + (30.4 - 20.3) * step / 50));

        expect(placeOf("m")).toEqual(M_DRAGGED);
    });

    test("kept fully on the sheet: past the right and the bottom it stops at the edge, flush @TPL-412", async () => {
        await renderDesigner(layoutL());

        dragM(500, 500);

        expect(placeOf("m")).toEqual({x: "108mm", y: "202mm", w: "40mm", h: "8mm"});
    });

    test("moved 3 or 4 px: nothing moves and no step; 5 px, or 3 + 3 px on the diagonal: a drag @TPL-411 @TPL-503", async () => {
        await renderDesigner(layoutL());
        const start = at(PRESS_M.xMm, PRESS_M.yMm);

        press(boxOf("m"), start);
        moveTo(boxOf("m"), {clientX: start.clientX + 3, clientY: start.clientY});
        expect(placeOf("m")).toEqual(M_AT_REST);
        moveTo(boxOf("m"), {clientX: start.clientX + 4, clientY: start.clientY});
        expect(placeOf("m")).toEqual(M_AT_REST);
        releaseAt(boxOf("m"), {clientX: start.clientX + 4, clientY: start.clientY});
        expect(placeOf("m")).toEqual(M_AT_REST);
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();

        press(boxOf("m"), start);
        moveTo(boxOf("m"), {clientX: start.clientX + 5, clientY: start.clientY});
        // 13.6 is within 1 mm of t's left, 14; the y of 20.3 snaps to 20
        expect(placeOf("m")).toEqual({...M_AT_REST, x: "14mm", y: "20mm"});
        pressKey(boxOf("m"), "Escape");
        releaseAt(boxOf("m"), start);

        press(boxOf("m"), start);
        moveTo(boxOf("m"), {clientX: start.clientX + 3, clientY: start.clientY + 3});
        expect(placeOf("m")).toEqual({...M_AT_REST, x: "14mm", y: "21mm"});
    });

    test("once past the threshold it stays a drag: back at the press it shows the snapped place, and at 12.3 the drop is one step @TPL-503 @TPL-542", async () => {
        const {user} = await renderDesigner(layoutL());
        const start = at(PRESS_M.xMm, PRESS_M.yMm);

        press(boxOf("m"), start);
        moveTo(boxOf("m"), {clientX: start.clientX + 40, clientY: start.clientY});
        moveTo(boxOf("m"), start);
        expect(placeOf("m")).toEqual({...M_AT_REST, x: "12mm", y: "20mm"});
        releaseAt(boxOf("m"), start);

        expect(placeOf("m")).toEqual({...M_AT_REST, x: "12mm", y: "20mm"});
        expect(saveButton()).toBeEnabled();
        await user.click(undoButton());
        expect(placeOf("m")).toEqual(M_AT_REST);
        expect(undoButton()).toBeDisabled();
    });

    test("a drag that comes back to the same layout: no step, nothing unsaved @TPL-542", async () => {
        await renderDesigner(aPrintLayout({items: [aTemplateItem("manualInput", {id: "m", xMm: 30, yMm: 30, wMm: 40, hMm: 8})]}));
        const start = at(35, 32);

        press(boxOf("m"), start);
        moveTo(boxOf("m"), {clientX: start.clientX + 40, clientY: start.clientY});
        moveTo(boxOf("m"), start);
        releaseAt(boxOf("m"), start);

        expect(boxOf("m").style.left).toBe("30mm");
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
    });

    test("an unselected box: the drag selects it and A's handles go; Esc: B is back, the selection stays B @TPL-555", async () => {
        await renderDesigner(layoutL());
        select("m");
        expect(selectedIds()).toEqual(["m"]);

        press(boxOf("f"), at(75, 50));
        moveTo(boxOf("f"), at(95, 60));

        expect(selectedIds()).toEqual(["f"]);
        expect(handleIds()).toHaveLength(8);
        expect(boxOf("f").style.left).not.toBe("70mm");

        expect(pressKey(boxOf("f"), "Escape")).toBe(true);
        expect(placeOf("f")).toEqual({x: "70mm", y: "46mm", w: "30mm", h: "8mm"});
        expect(selectedIds()).toEqual(["f"]);
    });

    test("an item off the sheet: a press leaves it, the first drag brings it inside, undo restores it @TPL-544", async () => {
        const {user} = await renderDesigner(aPrintLayout({items: [aTemplateItem("manualInput", {id: "m", xMm: 140, yMm: 20.3, wMm: 40, hMm: 8})]}));

        press(boxOf("m"), at(145, 25));
        expect(boxOf("m").style.left).toBe("140mm");
        moveTo(boxOf("m"), at(149, 35));
        releaseAt(boxOf("m"), at(149, 35));

        expect(placeOf("m")).toEqual({x: "108mm", y: "30mm", w: "40mm", h: "8mm"});
        await user.click(undoButton());
        expect(boxOf("m").style.left).toBe("140mm");
    });

    test("at every zoom the same sheet point gives the same mm @TPL-462", async () => {
        await renderDesigner(layoutL());

        fireEvent.click(zoomOutButton());
        fireEvent.click(zoomOutButton());
        expect(zoomPercent()).toBe("50%");
        dragM();
        expect(placeOf("m")).toEqual(M_DRAGGED);
        pressKey(boxOf("m"), "Escape");
        releaseAt(boxOf("m"), at(20, 25));

        for (let press = 0; press < 6; press++) fireEvent.click(zoomInButton());
        expect(zoomPercent()).toBe("200%");
        dragM();
        expect(placeOf("m")).toEqual(M_DRAGGED);
    });

    test("a typed field not committed yet is its own step, before the drag's, and the box drag ends with the fields on the new place @TPL-582", async () => {
        const {user} = await renderDesigner(layoutL());
        select("m");
        fireEvent.change(settingsField(FIELD_LABEL.width), {target: {value: "30"}});

        press(boxOf("m"), at(PRESS_M.xMm, PRESS_M.yMm));
        moveTo(boxOf("m"), pointerForM(31.6, 30.4));
        releaseAt(boxOf("m"), pointerForM(31.6, 30.4));

        expect(placeOf("m")).toEqual({...M_DRAGGED, w: "30mm"});
        await user.click(undoButton());
        expect(placeOf("m")).toEqual({...M_AT_REST, w: "30mm"});
        await user.click(undoButton());
        expect(placeOf("m")).toEqual(M_AT_REST);
        expect(undoButton()).toBeDisabled();
    });

    test("X with text the layout can't take: after the drop the field shows the new X, the text is gone @TPL-582", async () => {
        const {user} = await renderDesigner(layoutL());
        select("m");
        await user.clear(settingsField(FIELD_LABEL.x));
        await user.type(settingsField(FIELD_LABEL.x), "abc");

        dragM();
        releaseAt(boxOf("m"), pointerForM(31.6, 30.4));

        expect(settingsField(FIELD_LABEL.x)).toHaveValue("32");
    });
});

describe("print template drag: a handle @area:admin", () => {
    /** m at (20, 30), 40 × 20: its edges 20, 60, 30 and 50 are far from t's and the sheet's lines, and so are they 3.4 mm on. */
    const layoutR = () => aPrintLayout({
        items: [
            aTemplateItem("prescriptionText", {id: "t", xMm: 14, yMm: 80, wMm: 120, hMm: 90}),
            aTemplateItem("manualInput", {id: "m", xMm: 20, yMm: 30, wMm: 40, hMm: 20}),
        ],
    });
    const CORNER = {
        nw: [20, 30], n: [40, 30], ne: [60, 30], e: [60, 40], se: [60, 50], s: [40, 50], sw: [20, 50], w: [20, 40],
    } as const;

    test.each([
        ["nw", {x: "23mm", y: "33mm", w: "37mm", h: "17mm"}],
        ["n", {x: "20mm", y: "33mm", w: "40mm", h: "17mm"}],
        ["ne", {x: "20mm", y: "33mm", w: "43mm", h: "17mm"}],
        ["e", {x: "20mm", y: "30mm", w: "43mm", h: "20mm"}],
        ["se", {x: "20mm", y: "30mm", w: "43mm", h: "23mm"}],
        ["s", {x: "20mm", y: "30mm", w: "40mm", h: "23mm"}],
        ["sw", {x: "23mm", y: "30mm", w: "37mm", h: "23mm"}],
        ["w", {x: "23mm", y: "30mm", w: "37mm", h: "20mm"}],
    ] as const)("%s, grabbed a little off its place: only its edges move, in whole mm, without a jump, one undo step @TPL-420", async (id, expected) => {
        const {user} = await renderDesigner(layoutR());
        press(boxOf("m"), at(30, 40));
        releaseAt(boxOf("m"), at(30, 40));
        const handle = handleOf(id) as HTMLElement;
        const [x, y] = CORNER[id];

        press(handle, at(x + 0.5, y + 0.25));
        moveTo(handle, at(x + 3.9, y + 3.65));
        expect(placeOf("m")).toEqual(expected);
        expect(saveButton()).toBeDisabled();
        releaseAt(handle, at(x + 3.9, y + 3.65));

        expect(placeOf("m")).toEqual(expected);
        await user.click(undoButton());
        expect(placeOf("m")).toEqual({x: "20mm", y: "30mm", w: "40mm", h: "20mm"});
        expect(undoButton()).toBeDisabled();
    });

    test("a press takes no focus from the box: the handle's `mousedown` is cancelled and the box holds the focus @TPL-559", async () => {
        await renderDesigner(layoutR());
        select("m");
        blurAll();
        const handle = handleOf("se") as HTMLElement;

        expect(fireEvent.mouseDown(handle)).toBe(false);
        press(handle, at(60, 50));

        expect(boxOf("m")).toHaveFocus();
    });

    test("stops at the minimum and never flips: the left edge past the right gives x 55, w 5 @TPL-422 @TPL-536", async () => {
        await renderDesigner(layoutR());
        select("m");

        press(handleOf("w") as HTMLElement, at(20, 40));
        moveTo(handleOf("w") as HTMLElement, at(100, 40));

        expect(placeOf("m")).toEqual({x: "55mm", y: "30mm", w: "5mm", h: "20mm"});
    });

    test("a moving edge sticks to a line, which shows, and the line goes past 1 mm @TPL-431 @TPL-433", async () => {
        await renderDesigner(layoutR());
        select("m");
        const handle = handleOf("e") as HTMLElement;

        press(handle, at(60, 40));
        moveTo(handle, at(74.4, 40));

        expect(placeOf("m")).toEqual({x: "20mm", y: "30mm", w: "54mm", h: "20mm"});
        expect(guideLines().map(line => [line.dataset.axis, line.dataset.mm])).toEqual([["x", "74"]]);

        moveTo(handle, at(76, 40));

        expect(boxOf("m").style.width).toBe("56mm");
        expect(guideLines()).toEqual([]);
    });

    test("the set is frozen during a drag: a small box's corners stay until the drop, then all eight @TPL-421", async () => {
        await renderDesigner(aPrintLayout({
            items: [
                aTemplateItem("prescriptionText", {id: "t", xMm: 14, yMm: 80, wMm: 120, hMm: 90}),
                aTemplateItem("manualInput", {id: "m", xMm: 30, yMm: 30, wMm: 5, hMm: 4}),
            ],
        }));
        press(boxOf("m"), at(32, 32));
        releaseAt(boxOf("m"), at(32, 32));
        const corners = ["nw", "ne", "se", "sw"];
        expect(handleIds()).toEqual(corners);
        const handle = handleOf("se") as HTMLElement;

        press(handle, at(35, 34));
        moveTo(handle, at(65.4, 64.4));

        expect(placeOf("m")).toEqual({x: "30mm", y: "30mm", w: "35mm", h: "34mm"});
        expect(handleIds()).toEqual(corners);
        expect(handleOf("se")).toBe(handle);

        releaseAt(handle, at(65.4, 64.4));

        expect(handleIds()).toHaveLength(8);
    });

    test("an item off the sheet: the first handle drag also brings the axis that doesn't move inside; undo restores it @TPL-544", async () => {
        const {user} = await renderDesigner(aPrintLayout({items: [aTemplateItem("manualInput", {id: "m", xMm: 140, yMm: 20.3, wMm: 40, hMm: 8})]}));
        press(boxOf("m"), at(145, 25));
        releaseAt(boxOf("m"), at(145, 25));
        const handle = handleOf("s") as HTMLElement;

        press(handle, at(160, 28.3));
        moveTo(handle, at(160, 31.7));
        releaseAt(handle, at(160, 31.7));

        expect(placeOf("m")).toEqual({x: "108mm", y: "20.3mm", w: "40mm", h: "11.7mm"});
        await user.click(undoButton());
        expect(placeOf("m")).toEqual({x: "140mm", y: "20.3mm", w: "40mm", h: "8mm"});
    });

    test("a right or middle press on a handle: no resize @TPL-504", async () => {
        await renderDesigner(layoutR());
        select("m");
        const handle = handleOf("se") as HTMLElement;

        press(handle, at(60, 50), {button: 2, buttons: 2});
        moveTo(handle, at(80, 70), {buttons: 2});
        releaseAt(handle, at(80, 70));

        expect(placeOf("m")).toEqual({x: "20mm", y: "30mm", w: "40mm", h: "20mm"});
        expect(undoButton()).toBeDisabled();
    });
});

describe("print template drag: guides, and Alt @area:admin", () => {
    test("a line within 1 mm on each axis: the box sticks and both lines show across the sheet; past it the lines go @TPL-431", async () => {
        await renderDesigner(layoutL());

        // m's right edge 70.5 is near f's left, 70; its top 46.4 near f's top, 46
        dragM(30.5, 46.4);

        expect(placeOf("m")).toEqual({...M_AT_REST, x: "30mm", y: "46mm"});
        const [across, down] = guideLines();
        expect([across.dataset.axis, across.dataset.mm]).toEqual(["x", "70"]);
        expect(parseFloat(across.style.left)).toBeCloseTo(70 * CSS_PX_PER_MM);
        expect(across.style.height).toBe("100%");
        expect([down.dataset.axis, down.dataset.mm]).toEqual(["y", "46"]);
        expect(parseFloat(down.style.top)).toBeCloseTo(46 * CSS_PX_PER_MM);
        expect(down.style.width).toBe("100%");

        moveTo(boxOf("m"), pointerForM(32, 30));

        expect(placeOf("m")).toEqual(M_DRAGGED);
        expect(guideLines()).toEqual([]);
    });

    test("the lines go with the drop @TPL-431", async () => {
        await renderDesigner(layoutL());
        dragM(30.5, 46.4);
        expect(guideLines()).toHaveLength(2);

        releaseAt(boxOf("m"), pointerForM(30.5, 46.4));

        expect(placeOf("m")).toEqual({...M_AT_REST, x: "30mm", y: "46mm"});
        expect(guideLines()).toEqual([]);
    });

    test("Alt mid-way: unsnapped with no line at that move, one decimal; up again, the next move sticks; the value at the release counts @TPL-434 @TPL-518", async () => {
        const {user} = await renderDesigner(layoutL());

        dragM(30.5, 46.4, {altKey: true});
        expect(placeOf("m")).toEqual({...M_AT_REST, x: "30.5mm", y: "46.4mm"});
        expect(guideLines()).toEqual([]);

        expect(pressKey(boxOf("m"), "Alt", {altKey: true})).toBe(true);
        expect(releaseKey(boxOf("m"), "Alt")).toBe(true);
        moveTo(boxOf("m"), pointerForM(30.5, 46.4));
        expect(placeOf("m")).toEqual({...M_AT_REST, x: "30mm", y: "46mm"});
        expect(guideLines()).toHaveLength(2);

        releaseAt(boxOf("m"), pointerForM(31.64, 30.44), {altKey: true});

        expect(placeOf("m")).toEqual({...M_AT_REST, x: "31.6mm", y: "30.4mm"});
        await user.click(undoButton());
        expect(placeOf("m")).toEqual(M_AT_REST);
    });

    test("Alt at the press and up by the first move: that move's own state counts, so it snaps @TPL-518", async () => {
        await renderDesigner(layoutL());

        press(boxOf("m"), at(PRESS_M.xMm, PRESS_M.yMm), {altKey: true});
        moveTo(boxOf("m"), pointerForM(31.6, 30.4));

        expect(placeOf("m")).toEqual(M_DRAGGED);
    });
});

describe("print template drag: the ends that put it back @area:admin", () => {
    const ENDS: [string, (element: Element, point: Point) => void][] = [
        ["Esc", element => void pressKey(element, "Escape")],
        ["`pointercancel`", element => void fireEvent.pointerCancel(element, {pointerId: 1})],
        ["a move with no button down", (element, point) => void moveTo(element, point, {buttons: 0})],
        ["`lostpointercapture` with no `pointerup`", element => void fireEvent.lostPointerCapture(element, {pointerId: 1})],
        ["`popstate`", () => void fireEvent.popState(window)],
    ];

    test.each(ENDS)("%s in a box's drag: back exactly, no step, nothing unsaved, the selection stays; moves and the release then do nothing @TPL-413 @TPL-414 @TPL-512 @TPL-527 @TPL-532", async (_, end) => {
        await renderDesigner(layoutL());
        dragM();
        expect(document.body.style.userSelect).toBe("none");

        end(boxOf("m"), pointerForM(31.6, 30.4));

        expect(placeOf("m")).toEqual(M_AT_REST);
        expect(guideLines()).toEqual([]);
        expect(document.body.style.userSelect).toBe("");
        expect(selectedIds()).toEqual(["m"]);
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);

        moveTo(boxOf("m"), pointerForM(50, 50));
        expect(placeOf("m")).toEqual(M_AT_REST);
        releaseAt(boxOf("m"), pointerForM(50, 50));
        mouseClick(boxOf("m"));

        expect(placeOf("m")).toEqual(M_AT_REST);
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test.each(ENDS)("%s in a resize: x, y, w and h exactly as before, the guide gone, no step @TPL-513 @TPL-524", async (_, end) => {
        await renderDesigner(layoutL());
        select("m");
        const handle = handleOf("e") as HTMLElement;
        press(handle, at(52.3, 25));
        // Near f's left, 70
        moveTo(handle, at(70.4, 25));
        expect(boxOf("m").style.width).toBe("57.7mm");
        expect(guideLines()).toHaveLength(1);

        end(handle, at(70.4, 25));

        expect(placeOf("m")).toEqual(M_AT_REST);
        expect(guideLines()).toEqual([]);
        expect(document.body.style.userSelect).toBe("");
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test.each(ENDS)("%s in a panel drag: no ghost and nothing added, not by the release nor by its `click` @TPL-401 @TPL-513", async (_, end) => {
        await renderDesigner(layoutL());
        const entry = panelEntry("Manual input");
        press(entry, IN_PANEL);
        moveTo(entry, at(40.4, 150.6));
        expect(dragGhost()).toBeInTheDocument();

        end(entry, at(40.4, 150.6));

        expect(dragGhost()).not.toBeInTheDocument();
        expect(guideLines()).toEqual([]);
        expect(document.body.style.userSelect).toBe("");
        releaseAt(entry, at(40.4, 150.6));
        mouseClick(entry);

        expect(sheetBoxes()).toHaveLength(3);
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test("a real release loses the capture too: the drop stands, and the capture is on the pressed element only until the end @TPL-512", async () => {
        const holders = stubCapture();
        await renderDesigner(layoutL());

        dragM();
        expect([...holders]).toEqual([boxOf("m")]);
        releaseAt(boxOf("m"), pointerForM(31.6, 30.4));

        expect(holders.size).toBe(0);
        expect(placeOf("m")).toEqual(M_DRAGGED);
        fireEvent.lostPointerCapture(boxOf("m"), {pointerId: 1});
        expect(placeOf("m")).toEqual(M_DRAGGED);
        expect(saveButton()).toBeEnabled();
    });

    test("a resize holds the capture on the handle, and a cancel frees it @TPL-513", async () => {
        const holders = stubCapture();
        await renderDesigner(layoutL());
        select("m");
        const handle = handleOf("e") as HTMLElement;

        press(handle, at(52.3, 25));
        moveTo(handle, at(60, 25));
        expect([...holders]).toEqual([handle]);
        fireEvent.pointerCancel(handle, {pointerId: 1});

        expect(holders.size).toBe(0);
        expect(placeOf("m")).toEqual(M_AT_REST);
    });

    test("the first Esc ends the drag and keeps the selection, the second deselects, and the release's `click` doesn't select again @TPL-527", async () => {
        await renderDesigner(layoutL());
        dragM();

        expect(pressKey(boxOf("m"), "Escape")).toBe(true);
        expect(selectedIds()).toEqual(["m"]);
        expect(pressKey(boxOf("m"), "Escape")).toBe(true);
        expect(selectedIds()).toEqual([]);

        releaseAt(boxOf("m"), pointerForM(31.6, 30.4));
        mouseClick(boxOf("m"));
        expect(selectedIds()).toEqual([]);
        expect(placeOf("m")).toEqual(M_AT_REST);
    });

    test("that swallowed `click` is one only, and a keyboard's is never swallowed @TPL-501 @TPL-527", async () => {
        await renderDesigner(layoutL());
        dragM();
        pressKey(boxOf("m"), "Escape");
        pressKey(boxOf("m"), "Escape");
        releaseAt(boxOf("m"), pointerForM(31.6, 30.4));

        // Enter on the box, before the mouse's `click` came
        fireEvent.click(boxOf("f"), {detail: 0});
        expect(selectedIds()).toEqual(["f"]);
        mouseClick(boxOf("m"));
        expect(selectedIds()).toEqual(["f"]);
        mouseClick(boxOf("m"));
        expect(selectedIds()).toEqual(["m"]);
    });

    test("the `keyup` of an Esc pressed before the drag doesn't end it @TPL-413", async () => {
        await renderDesigner(layoutL());
        dragM();

        releaseKey(boxOf("m"), "Escape");

        expect(placeOf("m")).toEqual(M_DRAGGED);
    });
});

describe("print template drag: the keys while it runs @area:admin", () => {
    test.each([
        ["ArrowLeft", {}],
        ["ArrowRight", {}],
        ["ArrowUp", {}],
        ["ArrowDown", {}],
        ["Delete", {}],
        ["Tab", {}],
        ["Enter", {}],
        [" ", {}],
    ] as const)("%j goes nowhere: it is cancelled, on `keydown` and `keyup`, and the drag goes on @TPL-523 @TPL-526 @TPL-528", async (key, init) => {
        await renderDesigner(layoutL());
        dragM();

        expect(pressKey(boxOf("m"), key, init)).toBe(true);
        expect(releaseKey(boxOf("m"), key, init)).toBe(true);

        expect(placeOf("m")).toEqual(M_DRAGGED);
        expect(sheetBoxes()).toHaveLength(3);
        expect(selectedIds()).toEqual(["m"]);
        // Goes on: the next move is still followed
        moveTo(boxOf("m"), pointerForM(50, 30.4));
        expect(boxOf("m").style.left).toBe("50mm");
    });

    test("Delete in a resize: the item stays, the resize goes on @TPL-523", async () => {
        await renderDesigner(layoutL());
        select("m");
        const handle = handleOf("e") as HTMLElement;
        press(handle, at(52.3, 25));
        moveTo(handle, at(60.4, 25));

        expect(pressKey(handle, "Delete")).toBe(true);

        expect(sheetBoxes()).toHaveLength(3);
        expect(boxOf("m").style.width).toBe("47.7mm");
    });

    test("undo and redo, by Ctrl or Cmd: history unchanged, the drag goes on, and a later Esc returns to the press's place @TPL-525", async () => {
        const {user} = await renderDesigner(layoutL());
        dragM();
        releaseAt(boxOf("m"), pointerForM(31.6, 30.4));
        mouseClick(boxOf("m"));
        const start = at(35, 32);

        press(boxOf("m"), start);
        moveTo(boxOf("m"), at(55.4, 42.4));
        const inDrag = placeOf("m");

        for (const keys of [UNDO_KEYS, REDO_KEYS, REDO_SHIFT_KEYS, {...UNDO_KEYS, ctrlKey: false, metaKey: true}, {...REDO_KEYS, ctrlKey: false, metaKey: true}]) {
            expect(pressShortcut(boxOf("m"), keys)).toBe(true);
            expect(placeOf("m")).toEqual(inDrag);
        }
        expect(inDrag).not.toEqual(M_DRAGGED);

        expect(pressKey(boxOf("m"), "Escape")).toBe(true);
        expect(placeOf("m")).toEqual(M_DRAGGED);

        await user.click(undoButton());
        expect(placeOf("m")).toEqual(M_AT_REST);
        expect(undoButton()).toBeDisabled();
    });

    test("any other key passes: a letter, and Ctrl+A, change nothing and aren't cancelled @TPL-522", async () => {
        await renderDesigner(layoutL());
        dragM();

        expect(pressKey(boxOf("m"), "a", {code: "KeyA"})).toBe(false);
        expect(pressKey(boxOf("m"), "a", {code: "KeyA", ctrlKey: true})).toBe(false);
        // Z and Y without Ctrl or Cmd aren't shortcuts
        expect(pressKey(boxOf("m"), "z", {code: "KeyZ"})).toBe(false);

        expect(placeOf("m")).toEqual(M_DRAGGED);
        expect(saveButton()).toBeDisabled();
    });

    test("a clean template in a drag: leaving asks nothing @TPL-522", async () => {
        await renderDesigner(layoutL());

        dragM();

        expect(unloadAsks()).toBe(false);
    });
});

describe("print template drag: one at a time, by the main button @area:admin", () => {
    test("a press on another box, a handle or an entry while it runs starts nothing: the first drag goes on and is what the release commits", async () => {
        await renderDesigner(layoutL());
        dragM();
        const handle = handleOf("e") as HTMLElement;

        press(boxOf("f"), at(75, 50), {pointerId: 2});
        press(handle, at(52.3, 25), {pointerId: 2});
        press(panelEntry("Manual input"), IN_PANEL, {pointerId: 2});

        expect(selectedIds()).toEqual(["m"]);
        expect(dragGhost()).not.toBeInTheDocument();
        moveTo(boxOf("m"), pointerForM(50, 30.4));
        expect(boxOf("m").style.left).toBe("50mm");
        expect(dragGhost()).not.toBeInTheDocument();
        releaseAt(boxOf("m"), pointerForM(50, 30.4));

        expect(boxOf("m").style.left).toBe("50mm");
        expect(boxOf("f").style.left).toBe("70mm");
        expect(sheetBoxes()).toHaveLength(3);
    });

    test("a right or middle press on a box, moved and released: no move, no selection @TPL-504", async () => {
        await renderDesigner(layoutL());

        press(boxOf("m"), at(20, 25), {button: 2, buttons: 2});
        moveTo(boxOf("m"), at(60, 60), {buttons: 2});
        releaseAt(boxOf("m"), at(60, 60));

        expect(placeOf("m")).toEqual(M_AT_REST);
        expect(selectedIds()).toEqual([]);
    });

    test("a right press on an entry, moved onto the sheet and released: no ghost, nothing added @TPL-504", async () => {
        await renderDesigner(layoutL());
        const entry = panelEntry("Manual input");

        press(entry, IN_PANEL, {button: 2, buttons: 2});
        moveTo(entry, at(40, 150), {buttons: 2});
        expect(dragGhost()).not.toBeInTheDocument();
        releaseAt(entry, at(40, 150));

        expect(sheetBoxes()).toHaveLength(3);
    });
});

describe("print template drag: from the panel @area:admin", () => {
    const newBox = () => sheetBoxes()[sheetBoxes().length - 1];

    test("the ghost: none below the threshold, then at the pointer, the default size, the entry's label @TPL-400 @TPL-503", async () => {
        await renderDesigner(layoutL());
        const entry = panelEntry("Manual input");

        press(entry, IN_PANEL);
        moveTo(entry, {clientX: IN_PANEL.clientX + 4, clientY: IN_PANEL.clientY});
        expect(dragGhost()).not.toBeInTheDocument();

        moveTo(entry, {clientX: IN_PANEL.clientX + 5, clientY: IN_PANEL.clientY});

        const ghost = dragGhost() as HTMLElement;
        expect(ghost).toHaveTextContent("Manual input");
        expect(ghost.style.left).toBe("55px");
        expect(ghost.style.top).toBe("300px");
        expect(parseFloat(ghost.style.width)).toBeCloseTo(40 * CSS_PX_PER_MM);
        expect(parseFloat(ghost.style.height)).toBeCloseTo(8 * CSS_PX_PER_MM);
        expect(ghost.style.fontSize).toBe("11pt");
        expect(document.body.style.userSelect).toBe("none");
    });

    test("the ghost follows the zoom, in its size and its text @TPL-593", async () => {
        await renderDesigner(layoutL());
        fireEvent.click(zoomOutButton());
        fireEvent.click(zoomOutButton());
        const entry = panelEntry("Manual input");

        press(entry, IN_PANEL);
        moveTo(entry, at(40.4, 150.6));

        const ghost = dragGhost() as HTMLElement;
        expect(parseFloat(ghost.style.width)).toBeCloseTo(20 * CSS_PX_PER_MM);
        expect(parseFloat(ghost.style.height)).toBeCloseTo(4 * CSS_PX_PER_MM);
        expect(ghost.style.fontSize).toBe("5.5pt");
    });

    test("another kind's ghost has that kind's default size @TPL-400", async () => {
        await renderDesigner(layoutL());
        const entry = panelEntry("Static text");

        press(entry, IN_PANEL);
        moveTo(entry, at(40.4, 150.6));
        releaseAt(entry, at(40.4, 150.6));

        expect(measuresOf(newBox())).toMatchObject({x: "40mm", y: "151mm", w: "40mm", h: "8mm"});
    });

    test("over the sheet the lines show, no preview box; off it they go @TPL-431", async () => {
        await renderDesigner(layoutL());
        const entry = panelEntry("Manual input");
        press(entry, IN_PANEL);

        moveTo(entry, at(30.5, 46.4));
        expect(guideLines().map(line => [line.dataset.axis, line.dataset.mm])).toEqual([["x", "70"], ["y", "46"]]);
        expect(sheetBoxes()).toHaveLength(3);

        moveTo(entry, IN_PANEL);
        expect(guideLines()).toEqual([]);
        expect(dragGhost()).toBeInTheDocument();
    });

    test("dropped on the sheet: exactly one, at whole mm, selected and focused, one undo step, and the `click` after it adds no second @TPL-400 @TPL-501 @TPL-507", async () => {
        const {user} = await renderDesigner(layoutL());
        const entry = panelEntry("Manual input");

        press(entry, IN_PANEL);
        moveTo(entry, at(40.4, 150.6));
        expect(saveButton()).toBeDisabled();
        releaseAt(entry, at(40.4, 150.6));
        mouseClick(entry);

        expect(sheetBoxes()).toHaveLength(4);
        expect(measuresOf(newBox())).toEqual({x: "40mm", y: "151mm", w: "40mm", h: "8mm", font: "11pt"});
        expect(selectedIds()).toEqual([newBox().dataset.itemId]);
        expect(newBox()).toHaveFocus();
        expect(dragGhost()).not.toBeInTheDocument();
        expect(document.body.style.userSelect).toBe("");
        expect(saveButton()).toBeEnabled();

        // The new box has the focus: an arrow nudges it at once
        expect(pressKey(newBox(), "ArrowRight")).toBe(true);
        expect(newBox().style.left).toBe("41mm");
        await user.click(undoButton());
        await user.click(undoButton());

        expect(sheetBoxes()).toHaveLength(3);
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test("undoing the drop with the focus on its box: the focus goes to the sheet's area @TPL-557", async () => {
        await renderDesigner(layoutL());
        const entry = panelEntry("Manual input");
        press(entry, IN_PANEL);
        moveTo(entry, at(40.4, 150.6));
        releaseAt(entry, at(40.4, 150.6));
        expect(newBox()).toHaveFocus();

        expect(pressShortcut(newBox(), UNDO_KEYS)).toBe(true);

        expect(sheetBoxes()).toHaveLength(3);
        expect(sheetArea()).toHaveFocus();
    });

    test("a field not committed yet is its own step, before the drop's @TPL-501", async () => {
        const {user} = await renderDesigner(layoutL());
        select("m");
        fireEvent.change(settingsField(FIELD_LABEL.width), {target: {value: "30"}});
        const entry = panelEntry("Manual input");

        press(entry, IN_PANEL);
        moveTo(entry, at(40.4, 150.6));
        releaseAt(entry, at(40.4, 150.6));
        expect(sheetBoxes()).toHaveLength(4);

        await user.click(undoButton());
        expect(sheetBoxes()).toHaveLength(3);
        expect(boxOf("m").style.width).toBe("30mm");
        await user.click(undoButton());
        expect(boxOf("m").style.width).toBe("40mm");
        expect(undoButton()).toBeDisabled();
    });

    test("with Alt: not snapped, one decimal, no stick @TPL-509", async () => {
        await renderDesigner(layoutL());
        const entry = panelEntry("Manual input");

        press(entry, IN_PANEL);
        moveTo(entry, at(30.5, 46.4), {altKey: true});
        expect(guideLines()).toEqual([]);
        releaseAt(entry, at(30.5, 46.4), {altKey: true});

        expect(measuresOf(newBox())).toMatchObject({x: "30.5mm", y: "46.4mm"});
    });

    test("1 px inside the right edge: added and moved in, fully on the sheet; 1 px outside it, in the area's padding: nothing @TPL-404 @TPL-506", async () => {
        await renderDesigner(layoutL());
        const entry = panelEntry("Manual input");
        const sheet = theSheet().getBoundingClientRect();
        const y = at(0, 140).clientY;
        const outside = {clientX: sheet.right + 1, clientY: y};

        press(entry, IN_PANEL);
        moveTo(entry, outside);
        expect(guideLines()).toEqual([]);
        releaseAt(entry, outside);
        expect(sheetBoxes()).toHaveLength(3);
        expect(dragGhost()).not.toBeInTheDocument();
        expect(saveButton()).toBeDisabled();

        press(entry, IN_PANEL);
        moveTo(entry, {clientX: sheet.right - 1, clientY: y});
        releaseAt(entry, {clientX: sheet.right - 1, clientY: y});

        expect(sheetBoxes()).toHaveLength(4);
        expect(measuresOf(newBox())).toMatchObject({x: "108mm", y: "140mm", w: "40mm", h: "8mm"});
    });

    test("over the sheet but outside the area (its scrolled part, hidden under the settings): nothing @TPL-505", async () => {
        await renderDesigner(layoutL());
        areaRect = {...WIDE_AREA, width: 300};
        const entry = panelEntry("Manual input");
        const hidden = at(100, 60);
        expect(hidden.clientX).toBeGreaterThan(areaRect.left + areaRect.width);

        press(entry, IN_PANEL);
        moveTo(entry, hidden);
        expect(guideLines()).toEqual([]);
        releaseAt(entry, hidden);

        expect(sheetBoxes()).toHaveLength(3);
        expect(saveButton()).toBeDisabled();
    });

    test("past the threshold and back on the entry: released there, nothing is added @TPL-502", async () => {
        await renderDesigner(layoutL());
        const entry = panelEntry("Manual input");

        press(entry, IN_PANEL);
        moveTo(entry, at(40, 150));
        moveTo(entry, IN_PANEL);
        expect(dragGhost()).toBeInTheDocument();
        releaseAt(entry, IN_PANEL);
        mouseClick(entry);

        expect(sheetBoxes()).toHaveLength(3);
        expect(dragGhost()).not.toBeInTheDocument();
        expect(saveButton()).toBeDisabled();
    });

    test("at 50 items by the time it drops: nothing is added, and no step @TPL-403", async () => {
        const items = [
            aTemplateItem("prescriptionText", {id: "t", xMm: 14, yMm: 80, wMm: 120, hMm: 90}),
            ...Array.from({length: MAX_ITEMS - 2}, (_, index) => aTemplateItem("manualInput", {id: `n${index}`, xMm: 5, yMm: 5, wMm: 40, hMm: 8})),
        ];
        const {user} = await renderDesigner(aPrintLayout({items}));
        const entry = panelEntry("Manual input");
        press(entry, IN_PANEL);
        moveTo(entry, at(40.4, 150.6));

        // A click no key or pointer gave: assistive software's, the one way to add while a drag runs
        fireEvent.click(entry, {detail: 0});
        expect(sheetBoxes()).toHaveLength(MAX_ITEMS);
        releaseAt(entry, at(40.4, 150.6));

        expect(sheetBoxes()).toHaveLength(MAX_ITEMS);
        expect(dragGhost()).not.toBeInTheDocument();
        // The same click again, on the entry that is dimmed by now: the limit holds there too
        fireEvent.click(entry, {detail: 0});
        expect(sheetBoxes()).toHaveLength(MAX_ITEMS);
        await user.click(undoButton());
        expect(sheetBoxes()).toHaveLength(MAX_ITEMS - 1);
        expect(undoButton()).toBeDisabled();
    });
});

describe("print template drag: scrolling @area:admin", () => {
    const POINT_IN_THE_MIDDLE = {clientX: 600, clientY: 600};

    test.each([
        ["bottom", {clientX: 600, clientY: 990}, {top: 8 * 3, left: 0}],
        ["right", {clientX: 990, clientY: 600}, {top: 0, left: 8 * 3}],
        ["top", {clientX: 600, clientY: 110}, {top: -8 * 3, left: 0}],
        ["left", {clientX: 210, clientY: 600}, {top: 0, left: -8 * 3}],
        ["bottom and right corner", {clientX: 990, clientY: 990}, {top: 8 * 3, left: 8 * 3}],
    ])("the pointer held still in the %s band: the area scrolls frame by frame @TPL-470 @TPL-585", async (_, point, moved) => {
        await renderDesigner(layoutL());
        const frames = stubFrames();
        const area = sheetArea();
        area.scrollTop = 100;
        area.scrollLeft = 100;

        press(boxOf("m"), POINT_IN_THE_MIDDLE);
        moveTo(boxOf("m"), point);
        frames.run(3);

        expect(area.scrollTop).toBe(100 + moved.top);
        expect(area.scrollLeft).toBe(100 + moved.left);
    });

    test("outside the band, or outside the area, nothing scrolls; before the threshold no loop runs at all @TPL-585", async () => {
        await renderDesigner(layoutL());
        const frames = stubFrames();
        const area = sheetArea();

        press(boxOf("m"), POINT_IN_THE_MIDDLE);
        moveTo(boxOf("m"), {clientX: POINT_IN_THE_MIDDLE.clientX + 4, clientY: POINT_IN_THE_MIDDLE.clientY});
        expect(frames.waiting()).toBe(0);

        moveTo(boxOf("m"), {clientX: 650, clientY: 650});
        frames.run(3);
        moveTo(boxOf("m"), {clientX: 1100, clientY: 990});
        frames.run(3);

        expect(area.scrollTop).toBe(0);
        expect(area.scrollLeft).toBe(0);
    });

    test("the box follows the scroll with the pointer held still; Esc: back, the scroll stays, the loop stopped @TPL-531 @TPL-585", async () => {
        await renderDesigner(layoutL());
        const frames = stubFrames();
        const area = sheetArea();
        // At 100 mm down, 10 px above the area's bottom
        const pointer = pointerForM(32.3, 95.3);
        areaRect = {...WIDE_AREA, height: pointer.clientY + 10 - WIDE_AREA.top};

        press(boxOf("m"), at(PRESS_M.xMm, PRESS_M.yMm));
        moveTo(boxOf("m"), pointer);
        expect(placeOf("m")).toEqual({...M_AT_REST, x: "32mm", y: "95mm"});

        frames.run(15);
        expect(area.scrollTop).toBe(15 * AUTO_SCROLL_PX_PER_FRAME);
        fireEvent.scroll(area);
        // 120 px is 31.75 mm: 127.05, snapped
        expect(placeOf("m")).toEqual({...M_AT_REST, x: "32mm", y: "127mm"});

        expect(pressKey(boxOf("m"), "Escape")).toBe(true);
        expect(placeOf("m")).toEqual(M_AT_REST);
        expect(area.scrollTop).toBe(120);
        expect(frames.waiting()).toBe(0);
    });

    test("the wheel in a drag and a release with no move: it lands under the pointer, counting the new scroll @TPL-531", async () => {
        await renderDesigner(layoutL());
        const area = sheetArea();
        const pointer = pointerForM(32.3, 95.3);
        press(boxOf("m"), at(PRESS_M.xMm, PRESS_M.yMm));
        moveTo(boxOf("m"), pointer);

        area.scrollTop = 120;
        fireEvent.scroll(area);
        releaseAt(boxOf("m"), pointer);

        expect(placeOf("m")).toEqual({...M_AT_REST, x: "32mm", y: "127mm"});
    });

    test("a scroll before the threshold shows nothing: it isn't a drag yet @TPL-503", async () => {
        await renderDesigner(layoutL());
        const area = sheetArea();
        const entry = panelEntry("Manual input");

        press(entry, IN_PANEL);
        area.scrollTop = 120;
        fireEvent.scroll(area);

        expect(dragGhost()).not.toBeInTheDocument();
        expect(guideLines()).toEqual([]);
    });

    test("a panel drag entering the band: the drop counts the scroll at the drop @TPL-471 @TPL-589", async () => {
        await renderDesigner(layoutL());
        const frames = stubFrames();
        const area = sheetArea();
        area.scrollLeft = 80;
        const entry = panelEntry("Manual input");
        const y = at(0, 150).clientY;
        const inBand = {clientX: 220, clientY: y};

        press(entry, IN_PANEL);
        moveTo(entry, inBand);
        frames.run(10);
        expect(area.scrollLeft).toBe(0);
        releaseAt(entry, inBand);

        expect(frames.waiting()).toBe(0);
        // 220 is 4 px into the sheet by now, 1.06 mm: snapped
        expect(measuresOf(sheetBoxes()[3])).toMatchObject({x: "1mm", y: "150mm"});
    });
});

describe("print template drag: the area and Fit @area:admin", () => {
    test("the area's height comes from the window and follows it, never below the minimum; the zoom stays @TPL-464 @TPL-592", async () => {
        await renderDesigner(layoutL());
        fireEvent.click(zoomOutButton());
        expect(zoomPercent()).toBe("75%");
        const area = sheetArea();
        expect(area.style.height).toBe(`${window.innerHeight - WIDE_AREA.top - AREA_BOTTOM_GAP_PX}px`);

        areaRect = {...WIDE_AREA, top: window.innerHeight};
        fireEvent(window, new Event("resize"));

        expect(area.style.height).toBe(`${AREA_MIN_HEIGHT_PX}px`);
        expect(zoomPercent()).toBe("75%");
    });

    test("Fit: the whole sheet in the area as measured, with room for a scrollbar that goes @TPL-460", async () => {
        vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function offsetWidth(this: HTMLElement) {
            return this.getAttribute("role") === "region" ? 632 : 0;
        });
        vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function offsetHeight(this: HTMLElement) {
            return this.getAttribute("role") === "region" ? 432 : 0;
        });
        await renderDesigner(layoutL());

        // 400 px down the 793.7 px of A5, floored to one decimal
        expect(zoomPercent()).toBe("50%");
        expect(parseFloat(screen.getByTestId("template-sheet-frame").style.width)).toBeCloseTo(148 * CSS_PX_PER_MM * 0.503);

        fireEvent.click(zoomInButton());
        expect(zoomPercent()).toBe("75%");
        fireEvent.click(fitButton());
        expect(zoomPercent()).toBe("50%");
    });
});

describe("print template drag: when the designer goes @area:admin", () => {
    test("unmounted in a drag: no ghost, no console error, `user-select` restored, no pointer listener or frame left @TPL-514", async () => {
        const {unmount} = await renderDesigner(layoutL());
        const frames = stubFrames();
        const consoleError = vi.spyOn(console, "error");
        const added = vi.spyOn(window, "addEventListener");
        const removed = vi.spyOn(window, "removeEventListener");
        const entry = panelEntry("Manual input");

        press(entry, IN_PANEL);
        moveTo(entry, at(40.4, 150.6));
        expect(dragGhost()).toBeInTheDocument();
        const addedTypes = added.mock.calls.map(([type]) => type);
        expect(addedTypes).toEqual(expect.arrayContaining(["pointermove", "pointerup", "pointercancel", "popstate"]));

        unmount();

        expect(dragGhost()).not.toBeInTheDocument();
        expect(document.body.style.userSelect).toBe("");
        expect(frames.waiting()).toBe(0);
        for (const [type, listener, capture] of added.mock.calls) {
            expect(removed.mock.calls.some(call => call[0] === type && call[1] === listener && call[2] === capture), `${type} still listened to`).toBe(true);
        }
        act(() => {
            window.dispatchEvent(new MouseEvent("pointermove", {clientX: 1, clientY: 1, buttons: 1}));
            window.dispatchEvent(new MouseEvent("pointerup", {clientX: 1, clientY: 1}));
        });
        expect(consoleError).not.toHaveBeenCalled();
    });
});
