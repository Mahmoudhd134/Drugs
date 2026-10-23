/** A name as the locale files put it inside a message: wrapped in the bidi isolates U+2068/U+2069. */
export const isolate = (name: string) => `⁨${name}⁩`;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The accessible name of a row's button that names its row (design M1.7b D30): the action (`verb`, a regex part such as
 * "تعديل" or "(?:Rename|Edit)"), then the row's name in quotes, «…» in Arabic, “…” in English, last (bidi isolates
 * allowed around it), like «تعديل «⁨الاسم⁩»» / "Edit “⁨name⁩”".
 */
export const rowAction = (verb: string, rowName: string, lang: "ar" | "en" = "ar") => {
    const [open, close] = lang === "ar" ? ["«", "»"] : ["“", "”"];
    return new RegExp(`^${verb}[^${open}]*${open}⁨?${escapeRegExp(rowName)}⁩?${close}$`);
};

/** Whether `element` isolates its text's direction: a `<bdi>`, or `dir="auto"`. */
const isolatesDirection = (element: Element) => element.tagName === "BDI" || element.getAttribute("dir") === "auto";

/**
 * Every place `scope` shows `name` (the deepest elements whose whole text is the name) has its own direction (design
 * M1.7b D27): that element, or an ancestor whose whole text is still exactly the name, is a `<bdi>` or has
 * `dir="auto"`. So "1 2 3 (ONE TWO THREE) 20 F.C.TABS." keeps its left-to-right order inside the Arabic UI, and an own
 * drug typed in Arabic stays right to left. At least one place must show it.
 */
export const expectOwnDirection = (scope: Element, name: string) => {
    const whole = (e: Element) => (e.textContent ?? "").trim() === name;
    const places = Array.from(scope.querySelectorAll("*"))
        .filter(e => whole(e) && !Array.from(e.children).some(whole));
    if (places.length === 0) throw new Error(`"${name}" is not shown as a text of its own in: ${scope.textContent}`);
    for (const place of places) {
        let isolated = false;
        for (let e: Element | null = place; e && e !== scope.parentElement && whole(e); e = e.parentElement)
            if (isolatesDirection(e)) isolated = true;
        if (!isolated) throw new Error(`"${name}" is shown in a <${place.tagName.toLowerCase()}> without its own direction (no <bdi> or dir="auto" around exactly the name): ${place.outerHTML.slice(0, 200)}`);
    }
};

/** An imported shared drug name that an RTL paragraph scrambles: leading digits, brackets, a final dot (D27, CAT-233). */
export const DIGITS_FIRST_NAME = "1 2 3 (ONE TWO THREE) 20 F.C.TABS.";
/** An own drug typed in Arabic (it stays right to left). */
export const ARABIC_DRUG_NAME = "قطرة مرطبة 10 مل.";
