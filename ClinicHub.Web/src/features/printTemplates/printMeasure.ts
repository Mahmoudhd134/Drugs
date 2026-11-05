import type {PrescriptionTextItem} from "./types.ts";

export type TextMeasurer = {
    /** Whether this sheet's HTML fits the box, in the print font at the item's size */
    fits: (html: string) => boolean;
    /** Removes the hidden box */
    dispose: () => void;
};

/**
 * A hidden box of the true size (contract § 2.5): under `body`, off screen, never `display: none`, `dir="ltr"`, styled by the same
 * `.print-text` rules as the sheet. It takes no focus and makes no scroll.
 */
export const createTextMeasurer: (item: PrescriptionTextItem) => TextMeasurer = () => {
    throw new Error("contract stub");
};

/**
 * Loads the print font, regular and bold, for Arabic and Latin (`document.fonts.load`; `document.fonts.ready` doesn't load an unused
 * font). Never rejects: on a failure, or after `FONT_LOAD_TIMEOUT_MS`, printing carries on with the fallback font (TPL-331).
 */
export const loadPrintFont = (): Promise<void> => {
    throw new Error("contract stub");
};
