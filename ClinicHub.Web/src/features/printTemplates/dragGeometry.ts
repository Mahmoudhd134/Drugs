import {
    AUTO_SCROLL_BAND_PX,
    CSS_PX_PER_MM,
    DRAG_THRESHOLD_PX,
    FIT_MIN_ZOOM,
    GUIDE_REACH_MM,
    HANDLE_SIZE_PX,
    MIN_ITEM_HEIGHT_MM,
    MIN_ITEM_WIDTH_MM,
    MIN_TEXT_HEIGHT_MM,
    SMALL_BOX_PX,
    ZOOM_MAX,
    ZOOM_MIN,
    ZOOM_STEP,
} from "./constants.ts";
import {toTenths} from "./layout.ts";
import type {TemplateItem, TemplatePage} from "./types.ts";

/*
 * The designer's drag geometry (step 3 contract § 2.1): screen to mm, snap, guides, handles, limits. Pure: nothing here reads
 * the DOM or a clock. Every comparison and sum is in whole tenths of a mm (design § 3); centers in half-tenths. StrykerJS
 * mutates this file (PURE_LOGIC).
 */

/** A box's place and size in mm. An item (`TemplateItem`) is one. */
export type Box = { xMm: number; yMm: number; wMm: number; hMm: number };

/** The physical corner or edge a handle moves; the same in both languages. */
export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Every handle, in the order they are drawn: a later one lies above an earlier one where they meet. */
export const ALL_HANDLES: readonly HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const CORNER_HANDLES: readonly HandleId[] = ["nw", "ne", "se", "sw"];

/** A guide line across the sheet: axis `x` is a vertical line at `mm` from the left, axis `y` a horizontal one from the top. */
export type GuideLine = { axis: "x" | "y"; mm: number };

/** What a drag's geometry needs to know. */
export type DragContext = {
    page: Pick<TemplatePage, "widthMm" | "heightMm">;
    /** The other items' boxes, in the layout's order; the moving item isn't one */
    others: readonly Box[];
    /** Alt: no guides, no whole-mm snap, one decimal kept */
    unsnapped: boolean;
};

/** The box a drag gives right now, and the lines to show (at most one per axis). */
export type DragResult = { box: Box; guides: GuideLine[] };

/** A rectangle as `getBoundingClientRect` gives it. */
export type ScreenRect = { left: number; top: number; width: number; height: number };

/** The pointer's position on the screen. */
export type ScreenPoint = { clientX: number; clientY: number };

/** Half-tenths of a mm in a mm: the unit a center can be compared in without rounding. */
const HALF_TENTHS_PER_MM = 20;
const GUIDE_REACH = GUIDE_REACH_MM * HALF_TENTHS_PER_MM;

const between = (value: number, min: number, max: number) => Math.max(Math.min(value, max), min);

/** A place inside the sheet on one axis, in tenths: `[0, max(0, sheet - length)]`. */
const insideSheet = (startTenths: number, length: number, sheet: number) =>
    between(startTenths, 0, Math.max(0, toTenths(sheet) - toTenths(length)));

/** The start, center and end of a span, in half-tenths. */
const linesOf = (start: number, length: number) => {
    const first = toTenths(start) * 2;
    const half = toTenths(length);
    return [first, first + half, first + 2 * half];
};

/** What a moving line may stick to on one axis: the other boxes' lines in their order, then the sheet's. */
const targetsOf = (others: readonly Box[], startOf: (box: Box) => number, lengthOf: (box: Box) => number, sheet: number) => [
    ...others.flatMap(box => linesOf(startOf(box), lengthOf(box))),
    ...linesOf(0, sheet),
];

/**
 * The target nearest to any of `lines` (half-tenths), within reach (exactly 1.0 mm counts); a tie stays on the first found.
 * `line` is the moving line it matched.
 */
const nearestTarget = (lines: readonly number[], targets: readonly number[]) => {
    let best: { line: number; target: number; distance: number } | null = null;
    for (const line of lines) {
        for (const target of targets) {
            const distance = Math.abs(line - target);
            if (distance <= GUIDE_REACH && (!best || distance < best.distance)) best = {line, target, distance};
        }
    }
    return best;
};

/** Which edge of an axis a handle moves, by the letters of that axis' start and end; null: none. */
const movingEdge = (handle: HandleId, startLetter: string, endLetter: string) => {
    if (handle.includes(startLetter)) return "start";
    return handle.includes(endLetter) ? "end" : null;
};

/** A guide's place in whole tenths, from half-tenths: a center may fall between two tenths (71.45 → 71.5). */
const tenthsOfHalfTenths = (halfTenths: number) => toTenths(halfTenths / HALF_TENTHS_PER_MM);

/**
 * A screen point in mm from the sheet's top-left corner, through the sheet's own on-screen rectangle (`rect` is the
 * `template-sheet` element's `getBoundingClientRect`, so zoom, scroll, browser zoom and display scaling are all in it). Not
 * rounded, may be negative or past the sheet. A rectangle with no size (jsdom) gives 0.
 */
export const pointToMm = (point: ScreenPoint, rect: ScreenRect, page: DragContext["page"]): { xMm: number; yMm: number } => ({
    xMm: rect.width > 0 ? (point.clientX - rect.left) / rect.width * page.widthMm : 0,
    yMm: rect.height > 0 ? (point.clientY - rect.top) / rect.height * page.heightMm : 0,
});

/** A movement counts as a drag past 4 px in a straight line: (4, 0) doesn't, (5, 0) and (3, 3) do. */
export const pastDragThreshold = (dxPx: number, dyPx: number): boolean =>
    dxPx * dxPx + dyPx * dyPx > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;

const isInside = (point: ScreenPoint, rect: ScreenRect) =>
    point.clientX >= rect.left && point.clientX <= rect.left + rect.width
    && point.clientY >= rect.top && point.clientY <= rect.top + rect.height;

/** Whether a panel drag released at `point` counts: inside both the sheet's and the area's rectangles, edges included. */
export const dropCounts = (point: ScreenPoint, sheetRect: ScreenRect, areaRect: ScreenRect): boolean =>
    isInside(point, sheetRect) && isInside(point, areaRect);

/** One axis of a move: the box's start in tenths and the line it stuck to, if any. */
const moveAxis = (raw: number, length: number, sheet: number, targets: readonly number[], unsnapped: boolean) => {
    if (unsnapped) return {start: insideSheet(toTenths(raw), length, sheet), guide: null};
    const match = nearestTarget(linesOf(raw, length), targets);
    if (!match) return {start: insideSheet(toTenths(Math.round(raw)), length, sheet), guide: null};
    const stuck = tenthsOfHalfTenths(toTenths(raw) * 2 + match.target - match.line);
    const start = insideSheet(stuck, length, sheet);
    return {start, guide: start === stuck ? match.target / HALF_TENTHS_PER_MM : null};
};

const guidesOf = (x: number | null, y: number | null) => {
    const guides: GuideLine[] = [];
    if (x !== null) guides.push({axis: "x", mm: x});
    if (y !== null) guides.push({axis: "y", mm: y});
    return guides;
};

/**
 * A move to the raw top-left (`rawXMm`, `rawYMm`, unrounded); the size is never touched. Per axis:
 * - `unsnapped`: the raw value rounded to a tenth, no guide.
 * - else **guides**, compared with the raw value rounded to a tenth: the box's start, center and end against each other box's
 *   start, center and end (in `others`' order), then the sheet's start, center and end. Within 1.0 mm inclusive; the nearest
 *   wins, and a tie stays on the first found (the box's lines in that order, each against the targets in that order). The
 *   result's start is rounded by `roundTenth` (w = 5.1 on a center line at 74: 71.45 → 71.5).
 * - else **snap**: `Math.round` of the raw value itself, whole mm (12.46 → 12, never through its tenth 12.5).
 * - Last, the sheet's limits: `[0, max(0, sheet - length)]` in tenths, so an edge beats whole mm (x = 107.7 stays flush). A
 *   guide whose line the limits moved the box off isn't shown.
 */
export const moveBox = (start: Box, rawXMm: number, rawYMm: number, context: DragContext): DragResult => {
    const {page, others, unsnapped} = context;
    const across = moveAxis(rawXMm, start.wMm, page.widthMm, targetsOf(others, box => box.xMm, box => box.wMm, page.widthMm), unsnapped);
    const down = moveAxis(rawYMm, start.hMm, page.heightMm, targetsOf(others, box => box.yMm, box => box.hMm, page.heightMm), unsnapped);
    return {
        box: {xMm: across.start / 10, yMm: down.start / 10, wMm: start.wMm, hMm: start.hMm},
        guides: guidesOf(across.guide, down.guide),
    };
};

/** Where a moving edge goes before the limits, in tenths, and the line it stuck to, if any. */
const edgeTarget = (raw: number, targets: readonly number[], unsnapped: boolean) => {
    if (unsnapped) return {edge: toTenths(raw), line: null};
    const match = nearestTarget([toTenths(raw) * 2], targets);
    return match
        ? {edge: tenthsOfHalfTenths(match.target), line: match.target}
        : {edge: toTenths(Math.round(raw)), line: null};
};

/** One axis of a resize by its moving edge: the new start and length in tenths, and the guide if the edge is still on it. */
const resizeAxis = (start: number, length: number, rawEdge: number, moving: "start" | "end", minimum: number, sheet: number, targets: readonly number[], unsnapped: boolean) => {
    const {edge, line} = edgeTarget(rawEdge, targets, unsnapped);
    const minimumTenths = toTenths(minimum);
    const sheetTenths = toTenths(sheet);
    const guideIf = (limited: number) => (line !== null && limited === edge ? line / HALF_TENTHS_PER_MM : null);
    if (moving === "start") {
        const opposite = between(toTenths(start) + toTenths(length), minimumTenths, sheetTenths);
        const moved = between(edge, 0, opposite - minimumTenths);
        return {start: moved, length: opposite - moved, guide: guideIf(moved)};
    }
    const opposite = between(toTenths(start), 0, sheetTenths - minimumTenths);
    const moved = between(edge, opposite + minimumTenths, sheetTenths);
    return {start: opposite, length: moved - opposite, guide: guideIf(moved)};
};

/**
 * A resize by `handle`: `edge.xMm` is where the moving vertical edge goes (ignored by `n` and `s`), `edge.yMm` the moving
 * horizontal edge (ignored by `e` and `w`), raw. Per moving axis: as {@link moveBox}, but only the moving edge's line is
 * matched against the targets (never the box's center or opposite edge). The limits, in tenths, last: for a moving start the
 * opposite edge is held in `[minimum, sheet]` and the start in `[0, opposite - minimum]`; for a moving end the opposite edge is
 * held in `[0, sheet - minimum]` and the end in `[opposite + minimum, sheet]`. So the length is never below the minimum and never
 * flips, and a box below the minimum or with a negative length (typed: TPL-545) comes out at the minimum. x = 12.3, w = 40, left
 * edge to 11.2 → x = 11, w = 41.3. The left edge past the right → x = 47.3, w = 5. x = 145, w = 5 on A5 by `e` → x = 143, w = 5.
 * The axis that doesn't move keeps its length and stays exactly as it is when inside the sheet; off the sheet, its start moves
 * to the nearest inside position, as "the first drag brings it inside" (design § 3): `[0, max(0, sheet - length)]`.
 */
export const resizeBox = (start: Box, handle: HandleId, edge: { xMm: number; yMm: number }, minimum: { wMm: number; hMm: number }, context: DragContext): DragResult => {
    const {page, others, unsnapped} = context;

    const movingX = movingEdge(handle, "w", "e");
    const across = movingX
        ? resizeAxis(start.xMm, start.wMm, edge.xMm, movingX, minimum.wMm, page.widthMm, targetsOf(others, box => box.xMm, box => box.wMm, page.widthMm), unsnapped)
        : {start: insideSheet(toTenths(start.xMm), start.wMm, page.widthMm), length: toTenths(start.wMm), guide: null};

    const movingY = movingEdge(handle, "n", "s");
    const down = movingY
        ? resizeAxis(start.yMm, start.hMm, edge.yMm, movingY, minimum.hMm, page.heightMm, targetsOf(others, box => box.yMm, box => box.hMm, page.heightMm), unsnapped)
        : {start: insideSheet(toTenths(start.yMm), start.hMm, page.heightMm), length: toTenths(start.hMm), guide: null};

    return {
        box: {xMm: across.start / 10, yMm: down.start / 10, wMm: across.length / 10, hMm: down.length / 10},
        guides: guidesOf(across.guide, down.guide),
    };
};

/** The smallest a handle may make an item: width 5, height 4; the prescription text's height 20 (constants.ts). */
export const minimumOf = (item: Pick<TemplateItem, "kind">): { wMm: number; hMm: number } => ({
    wMm: MIN_ITEM_WIDTH_MM,
    hMm: item.kind === "prescriptionText" ? MIN_TEXT_HEIGHT_MM : MIN_ITEM_HEIGHT_MM,
});

/**
 * A keyboard move by whole tenths from the current value (no rounding to whole mm), stopping at the sheet's limits
 * `[0, max(0, sheet - length)]`; an item off the sheet lands at the nearest inside position. Same box back at the edge
 * (same numbers, so no step). No guides, no snap.
 */
export const nudgeBox = (box: Box, dxMm: number, dyMm: number, page: DragContext["page"]): Box => ({
    xMm: insideSheet(toTenths(box.xMm) + toTenths(dxMm), box.wMm, page.widthMm) / 10,
    yMm: insideSheet(toTenths(box.yMm) + toTenths(dyMm), box.hMm, page.heightMm) / 10,
    wMm: box.wMm,
    hMm: box.hMm,
});

/** On-screen px per mm at this zoom. */
const pxPerMm = (zoomPercent: number) => CSS_PX_PER_MM * zoomPercent / 100;

/** The handles of a box at this zoom: all eight, or the corners when both sides are below 36 px on screen. 40 × 8 mm at 50% has eight. */
export const handlesFor = (box: Pick<Box, "wMm" | "hMm">, zoomPercent: number): readonly HandleId[] => {
    const scale = pxPerMm(zoomPercent);
    return box.wMm * scale < SMALL_BOX_PX && box.hMm * scale < SMALL_BOX_PX ? CORNER_HANDLES : ALL_HANDLES;
};

/** A handle's start on one axis, from the box's start and end in px. */
const handleStart = (moving: "start" | "end" | null, start: number, end: number, cornersOnly: boolean) => {
    if (moving === null) return (start + end - HANDLE_SIZE_PX) / 2;
    if (cornersOnly) return moving === "start" ? start - HANDLE_SIZE_PX : end;
    return (moving === "start" ? start : end) - HANDLE_SIZE_PX / 2;
};

/**
 * Where a handle's target goes in the overlay, its top-left in px from the sheet's top-left at this zoom; the size is always
 * `HANDLE_SIZE_PX`. Not `cornersOnly` (all eight), each is centered on its corner or on the middle of its edge. `cornersOnly`,
 * each lies entirely outside the box, touching its corner, so the box itself always starts a move. `cornersOnly` is whether the
 * set on screen has four handles: during a drag the set is frozen, so it's the press's, not the live box's.
 */
export const handlePositionPx = (box: Box, handle: HandleId, zoomPercent: number, cornersOnly: boolean): { leftPx: number; topPx: number } => {
    const scale = pxPerMm(zoomPercent);
    return {
        leftPx: handleStart(movingEdge(handle, "w", "e"), box.xMm * scale, (box.xMm + box.wMm) * scale, cornersOnly),
        topPx: handleStart(movingEdge(handle, "n", "s"), box.yMm * scale, (box.yMm + box.hMm) * scale, cornersOnly),
    };
};

/**
 * The zoom showing the whole sheet in an inner area of this size, in percent: floored to one decimal so nothing scrolls,
 * limited to 25–200. Either side at 0 or below (jsdom's 0 less the padding, or not measured yet) gives 100.
 */
export const fitZoom = (areaWidthPx: number, areaHeightPx: number, page: DragContext["page"]): number => {
    if (areaWidthPx <= 0 || areaHeightPx <= 0) return 100;
    const percent = Math.min(areaWidthPx / (page.widthMm * CSS_PX_PER_MM), areaHeightPx / (page.heightMm * CSS_PX_PER_MM)) * 100;
    return between(Math.floor(percent * 10) / 10, FIT_MIN_ZOOM, ZOOM_MAX);
};

/** Plus: the next multiple of 25 above `percent`, at most 200 (61.5 → 75, 30 → 50, 100 → 125). */
export const zoomIn = (percent: number): number =>
    between((Math.floor(percent / ZOOM_STEP) + 1) * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);

/** Minus: the next multiple of 25 below `percent`, at least 50 (61.5 → 50, 125 → 100, 30 stays 30: minus is off there). */
export const zoomOut = (percent: number): number =>
    (percent <= ZOOM_MIN ? percent : Math.max((Math.ceil(percent / ZOOM_STEP) - 1) * ZOOM_STEP, ZOOM_MIN));

export const canZoomIn = (percent: number): boolean => percent < ZOOM_MAX;

export const canZoomOut = (percent: number): boolean => percent > ZOOM_MIN;

/** One axis of auto-scroll: distances from a point inside the span to its two edges; the nearer in reach, a tie to the start. */
const scrollOnAxis = (fromStart: number, fromEnd: number): -1 | 0 | 1 => {
    if (fromStart <= AUTO_SCROLL_BAND_PX && fromStart <= fromEnd) return -1;
    return fromEnd <= AUTO_SCROLL_BAND_PX ? 1 : 0;
};

/**
 * Which way a drag scrolls the area: -1, 0 or 1 per axis, each axis on its own. Inside the area's rectangle, within 24 px of
 * an edge (exactly 24 counts); both edges of an axis in reach (an area under 48 px): the nearer, a tie goes to the start.
 * `pastEdge` (a move or a resize): a pointer past an edge also scrolls that way, on that axis, whatever the other axis does.
 * Not `pastEdge` (a panel drag): the pointer must be inside the rectangle on both axes, so crossing the panel never scrolls.
 */
export const autoScrollDirection = (point: ScreenPoint, areaRect: ScreenRect): { x: -1 | 0 | 1; y: -1 | 0 | 1 } => {
    if (!isInside(point, areaRect)) return {x: 0, y: 0};
    return {
        x: scrollOnAxis(point.clientX - areaRect.left, areaRect.left + areaRect.width - point.clientX),
        y: scrollOnAxis(point.clientY - areaRect.top, areaRect.top + areaRect.height - point.clientY),
    };
};
