import i18n from "../../i18n";
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

const twoDigits = (value: number) => String(value).padStart(2, "0");

/**
 * A function's printed value (contract § 2.2), for the computer's local time, Arabic with Latin digits whatever the UI
 * language or the browser's locale, character for character as design § 3. No `Intl`.
 */
export const functionValue = (fn: TemplateFunction, {now, page, pages}: Pick<PrintContext, "now" | "page" | "pages">): string => {
    const t = i18n.getFixedT("ar");
    const hours = now.getHours();
    const minutes = twoDigits(now.getMinutes());
    switch (fn) {
        case "fullDate":
            return `${now.getDate()} ${t(`rxText.printValues.month${now.getMonth() + 1}`)} ${now.getFullYear()}`;
        case "time":
            return `${hours % 12 || 12}:${minutes} ${t(hours < 12 ? "rxText.printValues.am" : "rxText.printValues.pm")}`;
        case "dayOfWeek":
            return t(`rxText.printValues.day${now.getDay()}`);
        case "dayOfMonth":
            return String(now.getDate());
        case "isoDateTime":
            return `${String(now.getFullYear()).padStart(4, "0")}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}T${twoDigits(hours)}:${minutes}`;
        case "pageNumber":
            return pages === 1 ? "" : `${page}/${pages}`;
    }
};

/** What a short item prints: the pop-up's value, the function's value or the static text. A prescription text has none here: "". */
export const itemValue = (item: TemplateItem, context: PrintContext): string => {
    switch (item.kind) {
        case "manualInput":
            return context.manualValues[item.id] ?? "";
        case "function":
            return functionValue(item.function, context);
        case "staticText":
            return item.text;
        case "prescriptionText":
            return "";
    }
};

/** The values that read left to right whatever their surroundings (design § 4.7). */
export const isLeftToRightValue = (fn: TemplateFunction) => fn === "isoDateTime" || fn === "pageNumber";
