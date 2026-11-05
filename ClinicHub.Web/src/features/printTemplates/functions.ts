import type {TemplateFunction, TemplateItem} from "./types.ts";

/** What the short items of one sheet need (design § 3): `now` is taken once, at the confirm; `page` and `pages` differ per sheet. */
export type PrintContext = {
    /** The pop-up's values by item id, trimmed; a missing or empty one prints blank */
    manualValues: Readonly<Record<string, string>>;
    now: Date;
    /** This sheet, from 1 */
    page: number;
    pages: number;
};

/**
 * A function's printed value (contract § 2.2), for the computer's local time, Arabic with Latin digits whatever the UI
 * language or the browser's locale, character for character as design § 3. No `Intl`.
 */
export const functionValue: (fn: TemplateFunction, context: Pick<PrintContext, "now" | "page" | "pages">) => string = () => {
    throw new Error("contract stub");
};

/** What a short item prints: the pop-up's value, the function's value or the static text. A prescription text has none here: "". */
export const itemValue: (item: TemplateItem, context: PrintContext) => string = () => {
    throw new Error("contract stub");
};

/** The values that read left to right whatever their surroundings (design § 4.7). */
export const isLeftToRightValue = (fn: TemplateFunction) => fn === "isoDateTime" || fn === "pageNumber";
