/** Tags that stay, as they are. */
const KEPT = new Set(["p", "br", "strong", "em", "u", "ol", "ul", "li", "h1", "h2", "h3", "span"]);
/** Tags removed with their content. */
const REMOVED = ["script", "style", "iframe", "object", "embed", "svg", "math", "template", "noscript", "head", "title", "link", "meta"];
/** Block tags that become a `p`: merging them into one line would lose the layout (Quill's paste keeps some of them). */
const BECOME_P = new Set(["div", "blockquote", "pre", "h4", "h5", "h6", "address", "section", "article"]);

/** The tags that open a block of their own once cleaned: a `p` or a heading can't hold them, the parser would close it. */
const BLOCKS = "p, h1, h2, h3, ol, ul, li";

const DIRECTIONS = new Set(["ltr", "rtl", "auto"]);
const ALIGNMENT = /^(left|right|center|justify|start|end)$/;
const SIDE_MARGINS = new Set(["margin-left", "margin-right", "margin-inline-start", "margin-inline-end"]);
const MARGIN_PROPERTIES = new Set(["margin-top", "margin-bottom", ...SIDE_MARGINS]);
/** Never negative: it would pull the text off the sheet, where `fits`, which measures height only, wouldn't see it. */
const MARGIN = /^\+?(?:\d+(?:\.\d*)?|\.\d+)(em|px|pt|mm)?$/;
/** Each unit in px, `em` at the browser's default size, the only way to compare it with `6em` here. No unit: the browser ignores it anyway. */
const PX_PER_UNIT: Record<string, number> = {em: 16, px: 1, pt: 4 / 3, mm: 96 / 25.4};
const DEEPEST_SIDE_MARGIN_PX = 6 * PX_PER_UNIT.em;

/** A side margin above `6em` (deep Tab indents) can't push the text off the sheet either: at most half of the box. */
const capSideMargin = (value: string, unit = "") =>
    parseFloat(value) * (PX_PER_UNIT[unit] ?? 0) > DEEPEST_SIDE_MARGIN_PX ? `min(${value}, 50%)` : value;

/** The declarations of the allow list, property by property (design § 4). */
const cleanStyle = (style: string) =>
    style.split(";").flatMap(declaration => {
        const colon = declaration.indexOf(":");
        if (colon < 0) return [];
        const property = declaration.slice(0, colon).trim().toLowerCase();
        const value = declaration.slice(colon + 1).trim().toLowerCase();
        if (property === "text-align") return ALIGNMENT.test(value) ? [`${property}:${value}`] : [];
        const margin = MARGIN_PROPERTIES.has(property) ? MARGIN.exec(value) : null;
        if (!margin) return [];
        return [`${property}:${SIDE_MARGINS.has(property) ? capSideMargin(value, margin[1]) : value}`];
    }).join(";");

const copyAttributes = (from: Element, to: Element) => {
    const dir = from.getAttribute("dir")?.trim().toLowerCase();
    if (dir && DIRECTIONS.has(dir)) to.setAttribute("dir", dir);
    const style = cleanStyle(from.getAttribute("style") ?? "");
    if (style) to.setAttribute("style", style);
};

/** A text node's copy; in a `pre`, each line break a `<br>`. */
const appendText = (text: string, into: Element, inPre: boolean) => {
    if (!inPre) {
        into.append(text);
        return;
    }
    text.split("\n").forEach((line, index) => {
        if (index > 0) into.append(into.ownerDocument.createElement("br"));
        if (line) into.append(line);
    });
};

/** Copies what the allow list keeps. The copy is built from nothing, so no attribute or tag can come along unseen. */
const copyAllowed = (from: Node, into: Element, inPre: boolean) => {
    from.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            appendText((node as Text).data, into, inPre);
            return;
        }
        if (!(node instanceof Element)) return;
        const tag = node.localName;
        if (REMOVED.includes(tag)) return;
        if (!KEPT.has(tag) && !BECOME_P.has(tag)) {
            copyAllowed(node, into, inPre);
            return;
        }
        const copy = into.ownerDocument.createElement(KEPT.has(tag) ? tag : "p");
        copyAttributes(node, copy);
        copyAllowed(node, copy, inPre || tag === "pre");
        into.append(copy);
    });
};

const holdsBlock = (node: Node) => node instanceof Element && (node.matches(BLOCKS) || node.querySelector(BLOCKS) !== null);
const isWhiteSpace = (node: Node) => node.nodeType === Node.TEXT_NODE && !node.nodeValue?.trim();

/**
 * Blocks out of a `p`, a heading or an inline tag (a `div` in a `div` became a `p` in a `p`): the text around them keeps its tags, and the
 * HTML then parses back to this very tree, with no empty paragraph added.
 */
const liftBlocks = (element: Element): Node[] => {
    if (element.matches("ol, ul, li")) {
        Array.from(element.children).forEach(child => child.replaceWith(...liftBlocks(child)));
        return [element];
    }
    if (!element.querySelector(BLOCKS)) return [element];
    const pieces: Node[] = [];
    const runs: Element[] = [];
    let run: Element | null = null;
    for (const child of Array.from(element.childNodes)) {
        if (holdsBlock(child)) {
            run = null;
            pieces.push(...liftBlocks(child as Element));
            continue;
        }
        if (!run) {
            run = element.cloneNode(false) as Element;
            runs.push(run);
            pieces.push(run);
        }
        run.append(child);
    }
    const blanks = runs.filter(piece => !piece.textContent?.trim() && !piece.querySelector("br"));
    return pieces.filter(piece => !blanks.includes(piece as Element));
};

/** A list holds only `li`s, so pagination can count them: anything else becomes one, white space goes. */
const tidyList = (list: Element) => {
    let item: Element | null = null;
    for (const node of Array.from(list.childNodes)) {
        if (node instanceof Element && node.localName === "li") {
            item = null;
        } else if (item) {
            item.append(node);
        } else if (isWhiteSpace(node)) {
            node.remove();
        } else {
            item = list.ownerDocument.createElement("li");
            list.insertBefore(item, node);
            item.append(node);
        }
    }
};

/**
 * The allow list before the print root (design § 4, contract § 2.3): tags `p br strong em u ol ul li h1 h2 h3 span`; attribute
 * `dir` (`ltr`, `rtl`, `auto`); `style` with `text-align` and `margin-*` only, never negative, a deep side margin capped. Everything else is dropped, its text kept.
 * Input: what `htmlForPaste` gives. Output: an HTML string safe for `dangerouslySetInnerHTML`. Parsed with `DOMParser`, never in the
 * page's DOM: nothing loads and nothing runs.
 */
export const cleanPrintHtml = (html: string): string => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const copy = doc.createElement("div");
    copyAllowed(doc.body, copy, false);
    copy.querySelectorAll("ol, ul").forEach(tidyList);

    const pieces = Array.from(copy.childNodes).flatMap(node => (node instanceof Element ? liftBlocks(node) : [node]));
    const clean = doc.createElement("div");
    let wrapper: Element | null = null;
    for (const piece of pieces) {
        if (piece instanceof Element && piece.matches(BLOCKS)) {
            clean.append(piece);
            wrapper = null;
        } else if (wrapper) {
            wrapper.append(piece);
        } else if (!isWhiteSpace(piece)) {
            wrapper = doc.createElement("p");
            wrapper.append(piece);
            clean.append(wrapper);
        }
    }
    return clean.innerHTML;
};

/** Whether a text holds something other than white space and the invisible characters: U+00A0, U+FEFF (Quill's cursor), U+200B–U+200F, U+061C. */
export const isPrintableText = (text: string) => /[^\s\u00A0\uFEFF\u200B-\u200F\u061C]/.test(text);

/**
 * Whether the HTML holds a letter to print: an empty list item, spaces or invisible characters don't count (TPL-304). Print's check only:
 * the editor's Copy stays as it is.
 */
export const hasPrintableText = (html: string) => {
    const {body} = new DOMParser().parseFromString(html, "text/html");
    body.querySelectorAll(REMOVED.join(",")).forEach(element => element.remove());
    return isPrintableText(body.textContent!);
};

/** A pop-up value while it's typed or pasted: line breaks become one space (TPL-114). */
export const singleLine = (text: string) => text.replace(/[\r\n]+/g, " ");
