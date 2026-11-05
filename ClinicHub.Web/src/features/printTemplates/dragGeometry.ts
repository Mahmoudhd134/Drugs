/* eslint-disable @typescript-eslint/no-unused-vars -- the contract's stubs; the coder removes this line */
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

/**
 * A screen point in mm from the sheet's top-left corner, through the sheet's own on-screen rectangle (`rect` is the
 * `template-sheet` element's `getBoundingClientRect`, so zoom, scroll, browser zoom and display scaling are all in it). Not
 * rounded, may be negative or past the sheet. A rectangle with no size (jsdom) gives 0.
 */
export const pointToMm = (_point: ScreenPoint, _rect: ScreenRect, _page: DragContext["page"]): { xMm: number; yMm: number } => {
    throw new Error("not implemented");
};

/** A movement counts as a drag past 4 px in a straight line: (4, 0) doesn't, (5, 0) and (3, 3) do. */
export const pastDragThreshold = (_dxPx: number, _dyPx: number): boolean => {
    throw new Error("not implemented");
};

/** Whether a panel drag released at `point` counts: inside both the sheet's and the area's rectangles, edges included. */
export const dropCounts = (_point: ScreenPoint, _sheetRect: ScreenRect, _areaRect: ScreenRect): boolean => {
    throw new Error("not implemented");
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
export const moveBox = (_start: Box, _rawXMm: number, _rawYMm: number, _context: DragContext): DragResult => {
    throw new Error("not implemented");
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
export const resizeBox = (_start: Box, _handle: HandleId, _edge: { xMm: number; yMm: number }, _minimum: { wMm: number; hMm: number }, _context: DragContext): DragResult => {
    throw new Error("not implemented");
};

/** The smallest a handle may make an item: width 5, height 4; the prescription text's height 20 (constants.ts). */
export const minimumOf = (_item: Pick<TemplateItem, "kind">): { wMm: number; hMm: number } => {
    throw new Error("not implemented");
};

/**
 * A keyboard move by whole tenths from the current value (no rounding to whole mm), stopping at the sheet's limits
 * `[0, max(0, sheet - length)]`; an item off the sheet lands at the nearest inside position. Same box back at the edge
 * (same numbers, so no step). No guides, no snap.
 */
export const nudgeBox = (_box: Box, _dxMm: number, _dyMm: number, _page: DragContext["page"]): Box => {
    throw new Error("not implemented");
};

/** The handles of a box at this zoom: all eight, or the corners when both sides are below 36 px on screen. 40 × 8 mm at 50% has eight. */
export const handlesFor = (_box: Pick<Box, "wMm" | "hMm">, _zoomPercent: number): readonly HandleId[] => {
    throw new Error("not implemented");
};

/**
 * Where a handle's target goes in the overlay, its top-left in px from the sheet's top-left at this zoom; the size is always
 * `HANDLE_SIZE_PX`. Not `cornersOnly` (all eight), each is centered on its corner or on the middle of its edge. `cornersOnly`,
 * each lies entirely outside the box, touching its corner, so the box itself always starts a move. `cornersOnly` is whether the
 * set on screen has four handles: during a drag the set is frozen, so it's the press's, not the live box's.
 */
export const handlePositionPx = (_box: Box, _handle: HandleId, _zoomPercent: number, _cornersOnly: boolean): { leftPx: number; topPx: number } => {
    throw new Error("not implemented");
};

/**
 * The zoom showing the whole sheet in an inner area of this size, in percent: floored to one decimal so nothing scrolls,
 * limited to 25–200. Either side at 0 or below (jsdom's 0 less the padding, or not measured yet) gives 100.
 */
export const fitZoom = (_areaWidthPx: number, _areaHeightPx: number, _page: DragContext["page"]): number => {
    throw new Error("not implemented");
};

/** Plus: the next multiple of 25 above `percent`, at most 200 (61.5 → 75, 30 → 50, 100 → 125). */
export const zoomIn = (_percent: number): number => {
    throw new Error("not implemented");
};

/** Minus: the next multiple of 25 below `percent`, at least 50 (61.5 → 50, 125 → 100, 30 stays 30: minus is off there). */
export const zoomOut = (_percent: number): number => {
    throw new Error("not implemented");
};

export const canZoomIn = (_percent: number): boolean => {
    throw new Error("not implemented");
};

export const canZoomOut = (_percent: number): boolean => {
    throw new Error("not implemented");
};

/**
 * Which way a drag scrolls the area: -1, 0 or 1 per axis. The pointer must be inside the area's rectangle, within 24 px of
 * that edge (exactly 24 counts); both edges of an axis in reach (an area under 48 px): the nearer, a tie goes to the start.
 */
export const autoScrollDirection = (_point: ScreenPoint, _areaRect: ScreenRect): { x: -1 | 0 | 1; y: -1 | 0 | 1 } => {
    throw new Error("not implemented");
};
