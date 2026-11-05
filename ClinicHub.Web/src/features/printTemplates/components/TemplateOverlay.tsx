import type {CSSProperties, PointerEvent} from "react";
import {Box} from "@mui/material";
import {CSS_PX_PER_MM, HANDLE_SIZE_PX} from "../constants.ts";
import {type Box as MmBox, type GuideLine, handlePositionPx, type HandleId} from "../dragGeometry.ts";

/** The selected box's mark (`TemplateSheet`): a handle belongs to it. */
const HANDLE_COLOR = "#0f766e";
/** Stands out on the mm grid. */
const GUIDE_COLOR = "#db2777";

const CURSORS: Record<HandleId, CSSProperties["cursor"]> = {
    nw: "nwse-resize",
    se: "nwse-resize",
    n: "ns-resize",
    s: "ns-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    e: "ew-resize",
    w: "ew-resize",
};

type Props = {
    zoom: number;
    /** The selected item's box as shown (a drag's preview included); null: nothing selected */
    box: MmBox | null;
    handles: readonly HandleId[];
    guides: readonly GuideLine[];
    onHandlePress: (event: PointerEvent<HTMLElement>, handle: HandleId) => void;
};

/**
 * Handles and guide lines (step 3 contract § 3.3), in screen px above the scaled sheet: outside the button and the sheet's clip,
 * so an item at the sheet's edge keeps a full target and a handle keeps its size at any zoom. Inline positions: the RTL style
 * cache would flip `left`. It lets the pointer through but for the handles, which have no name and take no focus: keyboard
 * resizing stays in the number fields.
 */
export const TemplateOverlay = ({zoom, box, handles, guides, onHandlePress}: Props) => {
    const scale = CSS_PX_PER_MM * zoom / 100;
    const cornersOnly = handles.length === 4;

    return (
        <Box data-testid="template-overlay" sx={{displayPrint: "none"}} style={{position: "absolute", inset: 0, pointerEvents: "none"}}>
            {box && handles.map(handle => {
                const {leftPx, topPx} = handlePositionPx(box, handle, zoom, cornersOnly);
                return (
                    <div
                        key={handle}
                        data-testid={`template-handle-${handle}`}
                        data-handle={handle}
                        aria-hidden="true"
                        // Only here, never on a box's press: the focus stays on the box (TPL-559)
                        onMouseDown={(event) => event.preventDefault()}
                        onPointerDown={(event) => onHandlePress(event, handle)}
                        style={{
                            position: "absolute",
                            left: leftPx,
                            top: topPx,
                            width: HANDLE_SIZE_PX,
                            height: HANDLE_SIZE_PX,
                            boxSizing: "border-box",
                            backgroundColor: "#fff",
                            border: `1px solid ${HANDLE_COLOR}`,
                            cursor: CURSORS[handle],
                            touchAction: "none",
                            pointerEvents: "auto",
                        }}
                    />
                );
            })}
            {guides.map(({axis, mm}) => (
                <div
                    key={axis}
                    data-testid="template-guide"
                    data-axis={axis}
                    data-mm={mm}
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        backgroundColor: GUIDE_COLOR,
                        ...(axis === "x"
                            ? {left: mm * scale, top: 0, width: 1, height: "100%"}
                            : {left: 0, top: mm * scale, width: "100%", height: 1}),
                    }}
                />
            ))}
        </Box>
    );
};
