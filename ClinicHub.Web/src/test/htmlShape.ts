/*
 * Comparing printed HTML by what it means (contract §§ 2.3, 2.4), not by how it was serialized: the order of attributes, the
 * spaces and order inside a `style`, and inline tags left empty print the same.
 */

const VOID = new Set(["br"]);
const INLINE = new Set(["strong", "em", "u", "span"]);
const BLOCK_SELECTOR = "p, li, h1, h2, h3";

/** The body of an HTML string, parsed apart from the page: nothing loads, nothing runs. */
export const bodyOf = (html: string) => new DOMParser().parseFromString(html, "text/html").body;

/** A `style` attribute as sorted `property:value` pairs, the spaces out. */
export const styleOf = (style: string) => style
    .split(";")
    .map(declaration => declaration.trim().replace(/\s*:\s*/, ":").toLowerCase())
    .filter(Boolean)
    .sort()
    .join(";");

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const attributesOf = (element: Element) => Array.from(element.attributes)
    .map(({name, value}) => `${name}="${name === "style" ? styleOf(value) : value}"`)
    .sort()
    .map(attribute => ` ${attribute}`)
    .join("");

const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    if (VOID.has(tag)) return `<${tag}${attributesOf(element)}>`;
    const children = Array.from(element.childNodes).map(serialize).join("");
    if (INLINE.has(tag) && !children) return "";
    return `<${tag}${attributesOf(element)}>${children}</${tag}>`;
};

const textNodesOf = (element: Element) => {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    return nodes;
};

/** The HTML in one canonical spelling. `trimBlocks`: the spaces at a block's two ends go too (a cut leaves one on either side). */
export const canonical = (html: string, {trimBlocks = false}: { trimBlocks?: boolean } = {}) => {
    const body = bodyOf(html);
    if (trimBlocks) {
        body.querySelectorAll(BLOCK_SELECTOR).forEach(block => {
            const nodes = textNodesOf(block);
            if (nodes.length === 0) return;
            nodes[0].textContent = (nodes[0].textContent ?? "").trimStart();
            const last = nodes[nodes.length - 1];
            last.textContent = (last.textContent ?? "").trimEnd();
        });
    }
    return Array.from(body.childNodes).map(serialize).join("");
};

/** All the text of an HTML string, as it is. */
export const textOf = (html: string) => bodyOf(html).textContent ?? "";
