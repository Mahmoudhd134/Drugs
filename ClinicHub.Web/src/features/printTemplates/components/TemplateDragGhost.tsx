import {DEFAULT_FONT_SIZE_PT, PRINT_FONT_FAMILY, PRINT_LINE_HEIGHT} from "../constants.ts";
import type {ScreenPoint} from "../dragGeometry.ts";

type Props = { label: string; point: ScreenPoint; widthPx: number; heightPx: number; zoom: number };

/**
 * What follows the pointer in a drag from the panel (step 3 contract § 3.3): the new item's default size and font at the current zoom,
 * its top-left at the pointer, so the drop's place is what's under the pointer's tip. Takes no pointer, and in the designer, not in a
 * portal, so it goes when the designer goes. Inline positions: the RTL style cache would flip `left`. Its text has the sheet's look and
 * wraps as the item will, from its own start; `TemplateSheet`, on this page, declares the print font.
 */
export const TemplateDragGhost = ({label, point, widthPx, heightPx, zoom}: Props) => (
    <div
        data-testid="template-drag-ghost"
        aria-hidden="true"
        dir="auto"
        style={{
            position: "fixed",
            left: point.clientX,
            top: point.clientY,
            width: widthPx,
            height: heightPx,
            boxSizing: "border-box",
            border: "1px dashed #0f766e",
            backgroundColor: "rgba(15, 118, 110, 0.12)",
            color: "#000",
            fontSize: `${DEFAULT_FONT_SIZE_PT * zoom / 100}pt`,
            fontFamily: PRINT_FONT_FAMILY,
            lineHeight: PRINT_LINE_HEIGHT,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            textAlign: "start",
            pointerEvents: "none",
            zIndex: 1,
        }}
    >
        {label}
    </div>
);
