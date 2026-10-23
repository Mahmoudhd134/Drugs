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

const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
const LTR_CHAR = /[A-Za-zÀ-ɏ]/;

/** The direction of a text's first strong character (the bidi algorithm's rule P2), null when it has none. */
export const firstStrongDirection = (text: string): "ltr" | "rtl" | null => {
    for (const ch of text) {
        if (RTL_CHAR.test(ch)) return "rtl";
        if (LTR_CHAR.test(ch)) return "ltr";
    }
    return null;
};

/**
 * The direction `element`'s content runs in, as a browser resolves it (jsdom computes no `direction`): the nearest
 * `dir` on it or an ancestor; `dir="auto"` takes its own text's first strong character (none: as its parent).
 */
export const directionOf = (element: Element): "ltr" | "rtl" => {
    for (let e: Element | null = element; e; e = e.parentElement) {
        const dir = e.getAttribute("dir");
        if (dir === "ltr" || dir === "rtl") return dir;
        if (dir === "auto") {
            const found = firstStrongDirection(e.textContent ?? "");
            if (found) return found;
        }
    }
    return "ltr";
};

const INLINE_TAGS = new Set(["BDI", "BDO", "SPAN", "B", "I", "EM", "STRONG", "SMALL", "A", "LABEL", "MARK", "ABBR", "CODE", "S", "U", "SUB", "SUP"]);
const isInline = (e: Element) => {
    const display = getComputedStyle(e).display;
    return display ? display.startsWith("inline") : INLINE_TAGS.has(e.tagName);
};

/** The block whose lines hold `element`: itself, or the nearest ancestor that isn't inline (past a `<bdi>` or `<span>`). */
export const blockOf = (element: Element): Element => {
    let e: Element = element;
    while (isInline(e) && e.parentElement) e = e.parentElement;
    return e;
};

/** The outermost element in `scope` whose whole text is `text` (the line holding it, past any `<bdi>` inside). */
export const lineOf = (scope: Element, text: string): HTMLElement => {
    const whole = (e: Element) => (e.textContent ?? "").trim() === text;
    let found = Array.from(scope.querySelectorAll("*")).find(whole);
    if (!found) throw new Error(`"${text}" is not shown as a text of its own in: ${scope.textContent}`);
    while (found.parentElement && found.parentElement !== scope && whole(found.parentElement)) found = found.parentElement;
    return found as HTMLElement;
};

/**
 * The side a block's lines are aligned to: its `text-align` (inherited from the nearest ancestor that sets one other than
 * `start`), with `start` / `end` resolved against the block's own direction (as a browser does).
 */
export const alignedSide = (block: Element): "left" | "right" | "center" | "justify" => {
    let align = "";
    for (let e: Element | null = block; e && !align; e = e.parentElement) {
        const value = getComputedStyle(e).textAlign;
        if (value && value !== "start" && value !== "inherit" && value !== "initial") align = value;
    }
    const dir = directionOf(block);
    if (align === "left" || align === "right" || align === "center" || align === "justify") return align;
    if (align === "end") return dir === "ltr" ? "right" : "left";
    return dir === "ltr" ? "left" : "right";
};

/** The interface's start side: the right in Arabic, the left in English. */
export const startSide = (lang: "ar" | "en") => (lang === "ar" ? "right" : "left");
