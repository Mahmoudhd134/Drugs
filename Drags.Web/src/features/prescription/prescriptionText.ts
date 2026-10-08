import type {Drug} from "../drugs/types.ts";
import type {Direction} from "../../i18n/languages.ts";

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text: name and description on separate lines, a blank line between drugs. */
export const drugsToPlainText = (drugs: Drug[]) =>
    drugs.map(d => [d.name, d.description?.trim()].filter(Boolean).join("\n")).join("\n\n");

/** Initial editor (Quill) content for the drugs, laid out like {@link drugsToPlainText}. */
export const drugsToHtml = (drugs: Drug[], dir: Direction) => {
    // Quill's own classes for right-to-left paragraphs
    const attrs = dir === "rtl" ? ' class="ql-direction-rtl ql-align-right"' : "";
    return drugs
        .map(d => {
            const parts = [`<strong>${escapeHtml(d.name)}</strong>`];
            if (d.description?.trim()) parts.push(escapeHtml(d.description.trim()).replace(/\n/g, "<br>"));
            return `<p${attrs}>${parts.join("<br>")}</p>`;
        })
        .join(`<p${attrs}><br></p>`);
};

const textOf = (node: Node) => {
    const clone = node.cloneNode(true);
    if (clone instanceof Element) clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
    return (clone.textContent ?? "").replace(/\u00a0/g, " ");
};

/** Converts editor HTML back to plain text, keeping line breaks and list numbering/bullets. */
export const htmlToPlainText = (html: string) => {
    const body = new DOMParser().parseFromString(html, "text/html").body;
    const lines: string[] = [];

    body.childNodes.forEach(node => {
        if (node instanceof HTMLOListElement || node instanceof HTMLUListElement) {
            Array.from(node.children).forEach((item, i) =>
                lines.push(`${node instanceof HTMLOListElement ? `${i + 1}.` : "\u2022"} ${textOf(item)}`));
        } else {
            lines.push(textOf(node));
        }
    });

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};
