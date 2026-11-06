import {
    PRINT_FONT_FAMILY,
    RULER_INSET_MM,
    RULER_LABEL_SIZE_MM,
    RULER_LONG_TICK_LENGTH_MM,
    RULER_STROKE_MM,
    RULER_TICK_LENGTH_MM,
} from "../constants.ts";
import {type RulerTick, rulerTicks} from "../testPrintSample.ts";
import type {PrintLayout} from "../types.ts";

/** Between a long tick's end and its number. */
const LABEL_GAP_MM = 0.5;

const STROKE = {stroke: "#000", strokeWidth: RULER_STROKE_MM} as const;

const tickLength = (tick: RulerTick) => (tick.long ? RULER_LONG_TICK_LENGTH_MM : RULER_TICK_LENGTH_MM);

/**
 * Test print's rulers (step 4 contract § 4.4), the last child of a test sheet, never in the designer:
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
export const TemplatePrintRulers = ({page, calibration}: { page: PrintLayout["page"]; calibration: PrintLayout["calibration"] }) => {
    const {widthMm, heightMm} = page;
    return (
        <svg
            data-testid="test-print-rulers"
            aria-hidden="true"
            viewBox={`0 0 ${widthMm} ${heightMm}`}
            style={{position: "absolute", left: 0, top: 0, width: `${widthMm}mm`, height: `${heightMm}mm`, fontFamily: PRINT_FONT_FAMILY, direction: "ltr"}}
        >
            <line data-testid="ruler-line-top" x1={0} y1={RULER_INSET_MM} x2={widthMm} y2={RULER_INSET_MM} {...STROKE}/>
            <line data-testid="ruler-line-left" x1={RULER_INSET_MM} y1={0} x2={RULER_INSET_MM} y2={heightMm} {...STROKE}/>
            {rulerTicks(widthMm, calibration.xMm).map(tick => (
                <g key={tick.mm}>
                    <line data-ruler="top" data-mm={tick.mm} x1={tick.atMm} y1={RULER_INSET_MM} x2={tick.atMm} y2={RULER_INSET_MM + tickLength(tick)} {...STROKE}/>
                    {tick.label && (
                        <text
                            data-ruler="top"
                            data-mm={tick.mm}
                            x={tick.atMm}
                            y={RULER_INSET_MM + tickLength(tick) + LABEL_GAP_MM}
                            fontSize={RULER_LABEL_SIZE_MM}
                            textAnchor="middle"
                            dominantBaseline="hanging"
                            fill="#000"
                        >
                            {tick.label}
                        </text>
                    )}
                </g>
            ))}
            {rulerTicks(heightMm, calibration.yMm).map(tick => (
                <g key={tick.mm}>
                    <line data-ruler="left" data-mm={tick.mm} x1={RULER_INSET_MM} y1={tick.atMm} x2={RULER_INSET_MM + tickLength(tick)} y2={tick.atMm} {...STROKE}/>
                    {tick.label && (
                        <text
                            data-ruler="left"
                            data-mm={tick.mm}
                            x={RULER_INSET_MM + tickLength(tick) + LABEL_GAP_MM}
                            y={tick.atMm}
                            fontSize={RULER_LABEL_SIZE_MM}
                            dominantBaseline="central"
                            fill="#000"
                        >
                            {tick.label}
                        </text>
                    )}
                </g>
            ))}
        </svg>
    );
};
