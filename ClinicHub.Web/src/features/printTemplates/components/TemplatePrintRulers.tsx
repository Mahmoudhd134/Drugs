import type {ReactNode} from "react";
import type {PrintLayout} from "../types.ts";

/**
 * **Stub (T1: frontend).** Test print's rulers (step 4 contract § 4.4), the last child of a test sheet, never in the designer:
 *
 * ```
 * svg data-testid="test-print-rulers" aria-hidden="true"  absolute at 0, 0; width and height the sheet's in mm; viewBox "0 0 <w> <h>"; font PRINT_FONT_FAMILY
 * ├ line data-testid="ruler-line-top"                     y = RULER_INSET_MM, x from 0 to the sheet's width: it never moves (P4)
 * ├ line data-testid="ruler-line-left"                    x = RULER_INSET_MM, y from 0 to the sheet's height
 * ├ line data-ruler="top|left" data-mm="<tick.mm>"        per `rulerTicks(width, X)` and `rulerTicks(height, Y)`, RULER_TICK_LENGTH_MM or RULER_LONG_TICK_LENGTH_MM long, from the line away from the edge
 * └ text data-ruler="top|left" data-mm="<tick.mm>"        tick.label, past the tick's end, centered on it; `direction: ltr`, Latin digits in Arabic too
 * ```
 *
 * Lines stroke `#000`, RULER_STROKE_MM wide: real strokes, printed with "Background graphics" off (TPL-639).
 */
export const TemplatePrintRulers: (props: { page: PrintLayout["page"]; calibration: PrintLayout["calibration"] }) => ReactNode = () => null;
