import {dosingToText} from "../dosing/dosingText.ts";
import {hasDosingInstructions} from "../dosing/types.ts";
import type {PrescriptionLine} from "./types.ts";

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The text under a line's drug name: the dosing sentence, or, when the dosing has no dose, frequency, duration or
 * tapering (empty, or only an eye), the drug's description followed by the eye part (as the line shows it,
 * `LineDetails`); then the line's note.
 */
const detailsOf = (line: PrescriptionLine) =>
    [
        hasDosingInstructions(line.dosing) ? null : line.drug.description?.trim(),
        dosingToText(line.dosing),
        line.note.trim(),
    ].filter(Boolean) as string[];

/** Plain text: drug name, then its details, one per line; a blank line between drugs. */
export const linesToPlainText = (lines: PrescriptionLine[]) =>
    lines.map(l => [l.drug.name, ...detailsOf(l)].join("\n")).join("\n\n");

/**
 * Initial editor (Quill) content, laid out like {@link linesToPlainText}.
 * Prescriptions are Arabic, so paragraphs are always right-to-left (Quill's own classes).
 */
export const linesToHtml = (lines: PrescriptionLine[]) => {
    const attrs = ' class="ql-direction-rtl ql-align-right"';
    return lines
        .map(l => {
            const parts = [
                `<strong>${escapeHtml(l.drug.name)}</strong>`,
                ...detailsOf(l).map(d => escapeHtml(d).replace(/\n/g, "<br>")),
            ];
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

const ALIGN_CLASSES = ["center", "right", "justify"];

/**
 * Editor HTML made self-contained for pasting into Word and similar apps:
 * Quill's alignment/direction/indent classes become inline styles, and
 * paragraph margins are removed so spacing matches the editor.
 */
export const htmlForPaste = (html: string) => {
    const body = new DOMParser().parseFromString(html, "text/html").body;

    body.querySelectorAll<HTMLElement>("p, li, h1, h2, h3, ol, ul").forEach(el => {
        const styles: string[] = [];
        const rtl = el.classList.contains("ql-direction-rtl");
        if (rtl) el.setAttribute("dir", "rtl");

        const align = ALIGN_CLASSES.find(a => el.classList.contains(`ql-align-${a}`));
        if (align) styles.push(`text-align:${align}`);

        const indent = Array.from(el.classList).find(c => c.startsWith("ql-indent-"));
        if (indent) styles.push(`margin-${rtl ? "right" : "left"}:${Number(indent.slice(10)) * 3}em`);

        if (el.tagName === "P") styles.push("margin-top:0", "margin-bottom:0");

        if (styles.length) el.setAttribute("style", styles.join(";"));
        el.removeAttribute("class");
    });

    return body.innerHTML;
};
