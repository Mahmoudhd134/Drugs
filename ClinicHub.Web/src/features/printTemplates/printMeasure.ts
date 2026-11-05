import type {CSSProperties} from "react";
import {FONT_LOAD_TIMEOUT_MS, PRINT_FONT_FAMILY, PRINT_LINE_HEIGHT} from "./constants.ts";
import type {PrescriptionTextItem} from "./types.ts";

export type TextMeasurer = {
    /** Whether this sheet's HTML fits the box, in the print font at the item's size */
    fits: (html: string) => boolean;
    /** Removes the hidden box */
    dispose: () => void;
};

/** How much a height may pass the box and still count as fitting: rounding, not a line. */
const FIT_TOLERANCE_PX = 0.01;

/** The prescription text's styles: one helper for the sheet and the hidden box, so what's measured is what prints (contract § 3.4). Repeated spaces and tabs print as typed. */
export const printTextStyle = (fontSizePt: number): CSSProperties => ({
    fontSize: `${fontSizePt}pt`,
    lineHeight: PRINT_LINE_HEIGHT,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    textAlign: "start",
});

/**
 * A hidden box of the true size (contract § 2.5): under `body`, off screen, never `display: none`, `dir="ltr"`, styled by the same
 * `.print-text` rules as the sheet. It takes no focus and makes no scroll (fixed, so not in RTL either).
 */
export const createTextMeasurer = (item: PrescriptionTextItem): TextMeasurer => {
    const box = document.createElement("div");
    box.dir = "ltr";
    box.setAttribute("aria-hidden", "true");
    Object.assign(box.style, {
        position: "fixed",
        left: "-100000px",
        top: "0",
        visibility: "hidden",
        width: `${item.wMm}mm`,
        fontFamily: PRINT_FONT_FAMILY,
    });

    // Its height in px: the browser's own mm-to-px conversion
    const height = document.createElement("div");
    height.style.height = `${item.hMm}mm`;
    height.style.position = "absolute";

    const text = document.createElement("div");
    text.className = "print-text";
    Object.assign(text.style, printTextStyle(item.fontSizePt));

    box.append(height, text);
    document.body.append(box);

    return {
        fits: html => {
            text.innerHTML = html;
            return text.getBoundingClientRect().height <= height.getBoundingClientRect().height + FIT_TOLERANCE_PX;
        },
        dispose: () => box.remove(),
    };
};

/** An Arabic and a Latin letter, so `unicode-range` loads all four files. */
const FONT_SAMPLE = "م A";
const FONT_WEIGHTS = [400, 700];

/**
 * Loads the print font, regular and bold, for Arabic and Latin (`document.fonts.load`; `document.fonts.ready` doesn't load an unused
 * font). Never rejects: on a failure, or after `FONT_LOAD_TIMEOUT_MS`, printing carries on with the fallback font (TPL-331).
 */
export const loadPrintFont = async (): Promise<void> => {
    if (!("fonts" in document)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>(resolve => {
        timer = setTimeout(resolve, FONT_LOAD_TIMEOUT_MS);
    });
    const loads = Promise.allSettled(FONT_WEIGHTS.map(async weight =>
        document.fonts.load(`${weight} 16px "ClinicHub Print"`, FONT_SAMPLE)));
    await Promise.race([loads, timeout]);
    clearTimeout(timer);
};
