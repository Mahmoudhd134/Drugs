/**
 * The allow list before the print root (design § 4, contract § 2.3): tags `p br strong em u ol ul li h1 h2 h3 span`; attribute
 * `dir` (`ltr`, `rtl`, `auto`); `style` with `text-align` and `margin-*` only. Everything else is dropped, its text kept.
 * Input: what `htmlForPaste` gives. Output: an HTML string safe for `dangerouslySetInnerHTML`.
 */
export const cleanPrintHtml: (html: string) => string = () => {
    throw new Error("contract stub");
};

/** Whether the HTML holds a letter to print: an empty list item, spaces or invisible characters don't count (TPL-304). */
export const hasPrintableText: (html: string) => boolean = () => {
    throw new Error("contract stub");
};

/** A pop-up value while it's typed or pasted: line breaks become one space (TPL-114). */
export const singleLine: (text: string) => string = () => {
    throw new Error("contract stub");
};
