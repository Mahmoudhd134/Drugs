import {type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState} from "react";
import {AUTO_SCROLL_PX_PER_FRAME, CSS_PX_PER_MM, DEFAULT_ITEM_SIZES} from "./constants.ts";
import {
    autoScrollDirection,
    type Box,
    dropCounts,
    type DragResult,
    type GuideLine,
    type HandleId,
    handlesFor,
    minimumOf,
    moveBox,
    pastDragThreshold,
    pointToMm,
    resizeBox,
    type ScreenPoint,
} from "./dragGeometry.ts";
import type {AddableItem, PrintLayout, TemplateItem} from "./types.ts";
import {useLatest} from "./useLatest.ts";

/** What a running drag shows. Nothing in a drag changes the layout: the drop commits (design § 3 settled). */
export type DragView =
    | { kind: "item"; itemId: string; box: Box; guides: GuideLine[]; handles: readonly HandleId[] }
    | { kind: "entry"; label: string; point: ScreenPoint; widthPx: number; heightPx: number; guides: GuideLine[] };

type DragTarget =
    | { kind: "box"; item: TemplateItem }
    | { kind: "handle"; item: TemplateItem; handle: HandleId }
    | { kind: "entry"; addable: AddableItem; label: string };

type Options = {
    area: RefObject<HTMLElement | null>;
    sheet: RefObject<HTMLElement | null>;
    zoom: number;
    layout: PrintLayout;
    onSelect: (id: string) => void;
    onCommitBox: (itemId: string, box: Box) => void;
    onDropNew: (addable: AddableItem, label: string, box: Box) => void;
};

/** While a drag runs only Esc and Alt do anything: these go nowhere (design § 3 settled, contract § 3.5). */
const SWALLOWED_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Tab", "Enter", " "]);

const NO_RECT = {left: 0, top: 0, width: 0, height: 0};

const pointOf = (event: PointerEvent | ReactPointerEvent): ScreenPoint => ({clientX: event.clientX, clientY: event.clientY});

/** The new item's default size at (0, 0): a panel drag's `moveBox` start (contract § 3.4). */
const newBoxOf = (addable: AddableItem): Box => ({xMm: 0, yMm: 0, ...DEFAULT_ITEM_SIZES[addable.kind]});

/**
 * The pointer's side of the designer (contract § 3.4): box moves, handle resizes and drags from the panel, one at a time, from
 * the press to the release or the cancel. Every listener and `user-select` lives in one running drag and goes when it ends,
 * unmount included (TPL-514). The press handlers go on the elements; everything after them through `window`, in the capture
 * phase, since the pointer is captured and a captured element's events reach it anyway.
 */
export const useDesignerDrag = (options: Options) => {
    const latest = useLatest(options);
    const [view, setView] = useState<DragView | null>(null);
    /** Ends the running drag; null: none is running */
    const stopRunning = useRef<(() => void) | null>(null);
    /** The pointer `click` following a drag or a cancel must not add or select (TPL-501, TPL-527) */
    const swallowNextClick = useRef(false);

    useEffect(() => () => stopRunning.current?.(), []);

    const begin = (event: ReactPointerEvent<HTMLElement>, target: DragTarget) => {
        const captured = event.currentTarget;
        const {pointerId} = event;
        const origin = pointOf(event);
        const {sheet, area, layout, zoom} = latest.current;
        const pressMm = pointToMm(origin, sheet.current?.getBoundingClientRect() ?? NO_RECT, layout.page);
        // Frozen for the whole drag, so crossing 36 px can't unmount the handle in use
        const handles = target.kind === "entry" ? [] : handlesFor(target.item, zoom);
        const userSelectBefore = document.body.style.userSelect;

        let last = origin;
        let altKey = event.altKey;
        let started = false;
        let frame: number | null = null;
        const removals: (() => void)[] = [];

        /** The box this pointer position gives, from the press rather than from the moves added up (TPL-541). */
        const resultAt = (point: ScreenPoint, unsnapped: boolean): DragResult => {
            const {layout: {page, items}} = latest.current;
            const now = pointToMm(point, sheet.current?.getBoundingClientRect() ?? NO_RECT, page);
            if (target.kind === "entry") return moveBox(newBoxOf(target.addable), now.xMm, now.yMm, {page, others: items, unsnapped});

            const {item} = target;
            const others = items.filter(other => other.id !== item.id);
            if (target.kind === "box") {
                return moveBox(item, now.xMm - (pressMm.xMm - item.xMm), now.yMm - (pressMm.yMm - item.yMm), {page, others, unsnapped});
            }
            // The moving edges at the press, so grabbing a handle a little off its corner doesn't jump
            const edgeX = target.handle.includes("e") ? item.xMm + item.wMm : item.xMm;
            const edgeY = target.handle.includes("s") ? item.yMm + item.hMm : item.yMm;
            const edge = {xMm: now.xMm - (pressMm.xMm - edgeX), yMm: now.yMm - (pressMm.yMm - edgeY)};
            return resizeBox(item, target.handle, edge, minimumOf(item), {page, others, unsnapped});
        };

        const overSheet = (point: ScreenPoint) => {
            const sheetRect = sheet.current?.getBoundingClientRect();
            const areaRect = area.current?.getBoundingClientRect();
            return !!sheetRect && !!areaRect && dropCounts(point, sheetRect, areaRect);
        };

        const show = () => {
            if (!started) return;
            const {box, guides} = resultAt(last, altKey);
            if (target.kind === "entry") {
                const size = DEFAULT_ITEM_SIZES[target.addable.kind];
                const scale = CSS_PX_PER_MM * latest.current.zoom / 100;
                setView({
                    kind: "entry",
                    label: target.label,
                    point: last,
                    widthPx: size.wMm * scale,
                    heightPx: size.hMm * scale,
                    guides: overSheet(last) ? guides : [],
                });
            } else {
                setView({kind: "item", itemId: target.item.id, box, guides, handles});
            }
        };

        /** One loop while the drag runs, so the area also scrolls with the pointer held still (TPL-585). Its `scroll` event moves the preview. */
        const scrollFrame = () => {
            const element = area.current;
            if (element) {
                const direction = autoScrollDirection(last, element.getBoundingClientRect(), target.kind !== "entry");
                if (direction.x !== 0) element.scrollLeft += direction.x * AUTO_SCROLL_PX_PER_FRAME;
                if (direction.y !== 0) element.scrollTop += direction.y * AUTO_SCROLL_PX_PER_FRAME;
            }
            frame = requestAnimationFrame(scrollFrame);
        };

        /** Takes this event's place and Alt; true once the movement has passed the threshold. Once past, it stays a drag. */
        const track = (pointerEvent: PointerEvent) => {
            last = pointOf(pointerEvent);
            altKey = pointerEvent.altKey;
            if (!started && pastDragThreshold(last.clientX - origin.clientX, last.clientY - origin.clientY)) {
                started = true;
                frame = requestAnimationFrame(scrollFrame);
            }
            return started;
        };

        const stop = () => {
            stopRunning.current = null;
            removals.forEach(remove => remove());
            if (frame !== null) cancelAnimationFrame(frame);
            document.body.style.userSelect = userSelectBefore;
            if (captured.hasPointerCapture(pointerId)) captured.releasePointerCapture(pointerId);
            setView(null);
        };

        /** The preview goes, nothing recorded; the selection and the scroll stay. */
        const cancel = () => {
            stop();
            swallowNextClick.current = true;
        };

        const onMove = (pointerEvent: PointerEvent) => {
            // No main button any more: the release was missed (Alt+Tab, released in another app)
            if ((pointerEvent.buttons & 1) === 0) cancel();
            else if (track(pointerEvent)) show();
        };

        const onUp = (pointerEvent: PointerEvent) => {
            const moved = track(pointerEvent);
            stop();
            // Below the threshold nothing happens here: the click does what it did in step 1
            if (!moved) return;
            swallowNextClick.current = true;
            if (target.kind !== "entry") latest.current.onCommitBox(target.item.id, resultAt(last, altKey).box);
            else if (overSheet(last)) latest.current.onDropNew(target.addable, target.label, resultAt(last, altKey).box);
        };

        const onKey = (keyEvent: KeyboardEvent) => {
            if (keyEvent.key === "Escape") {
                if (keyEvent.type !== "keydown") return;
                keyEvent.preventDefault();
                // So the same press doesn't also deselect
                keyEvent.stopPropagation();
                cancel();
            } else if (keyEvent.key === "Alt") {
                keyEvent.preventDefault();
            } else if (SWALLOWED_KEYS.has(keyEvent.key)
                || ((keyEvent.ctrlKey || keyEvent.metaKey) && (keyEvent.code === "KeyZ" || keyEvent.code === "KeyY"))) {
                keyEvent.preventDefault();
                keyEvent.stopPropagation();
            }
        };

        const listen = <E extends Event>(on: EventTarget, type: string, handler: (listened: E) => void, capture = true) => {
            const listener = handler as EventListener;
            on.addEventListener(type, listener, capture);
            removals.push(() => on.removeEventListener(type, listener, capture));
        };

        document.body.style.userSelect = "none";
        captured.setPointerCapture(pointerId);
        listen<PointerEvent>(window, "pointermove", onMove);
        listen<PointerEvent>(window, "pointerup", onUp);
        listen(window, "pointercancel", cancel);
        // A real release comes as `pointerup` first, which removes this: one alone means the release was never seen
        listen(captured, "lostpointercapture", cancel);
        listen(window, "popstate", cancel);
        listen<KeyboardEvent>(window, "keydown", onKey);
        listen<KeyboardEvent>(window, "keyup", onKey);
        // Auto-scroll and the wheel: the same pointer position is another place on the sheet now (TPL-531)
        if (area.current) listen(area.current, "scroll", show, false);
        stopRunning.current = stop;
    };

    /** Only the main button starts anything, and one drag at a time. Any press ends the wait for a click to swallow. */
    const canBegin = (event: ReactPointerEvent) => {
        swallowNextClick.current = false;
        return event.button === 0 && stopRunning.current === null;
    };

    const boxElement = (id: string) => latest.current.sheet.current?.querySelector<HTMLElement>(`[data-item-id="${id}"]`);

    return {
        view,
        /** A press on a box selects it and gives it the focus; never `preventDefault`, which would lose the focus (TPL-559). */
        pressBox: (event: ReactPointerEvent<HTMLElement>, item: TemplateItem) => {
            if (!canBegin(event)) return;
            latest.current.onSelect(item.id);
            event.currentTarget.focus({preventScroll: true});
            begin(event, {kind: "box", item});
        },
        /** A press on a handle: the same, the capture on the handle, the focus on its box (a handle isn't focusable). */
        pressHandle: (event: ReactPointerEvent<HTMLElement>, item: TemplateItem, handle: HandleId) => {
            if (!canBegin(event)) return;
            latest.current.onSelect(item.id);
            boxElement(item.id)?.focus({preventScroll: true});
            begin(event, {kind: "handle", item, handle});
        },
        /** A press on a panel entry: nothing visible until the threshold. */
        pressEntry: (event: ReactPointerEvent<HTMLElement>, addable: AddableItem, label: string) => {
            if (canBegin(event)) begin(event, {kind: "entry", addable, label});
        },
        /**
         * Whether this click is the one following a drag or a cancel. Only a pointer's (`detail` > 0): a keyboard click is never
         * swallowed.
         */
        swallowClick: (event: ReactMouseEvent) => {
            if (event.detail === 0 || !swallowNextClick.current) return false;
            swallowNextClick.current = false;
            return true;
        },
    };
};
