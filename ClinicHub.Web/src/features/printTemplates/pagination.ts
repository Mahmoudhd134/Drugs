import {isPrintableText} from "./printHtml.ts";

/** A list item's place in its list: the list's tag and attributes (`owner`), its number, and whether it's the rest of a cut item. */
type ListPlace = { owner: Element; number: number; continued: boolean };
/** A top-level element, or a list's `li`. */
type Block = { element: Element; list?: ListPlace };
/** The blocks between blanks, with the blanks before them. A drug: Quill makes each line its own paragraph. */
type Run = { blanks: Block[]; blocks: Block[] };
/** Where a block can be cut: the first part ends before atom `head`, the second starts at atom `tail`. */
type Cut = { head: number; tail: number };

/** A `<br>` among a block's atoms. The HTML parser never gives a U+0000, so no text can be mistaken for it. */
const BREAK = "\0";
/** A space a line can break at: not U+00A0, U+202F, U+FEFF. */
const isSpace = (atom: string) => /^[^\S\u00A0\u202F\uFEFF]$/.test(atom);

const isBlank = ({element, list}: Block) =>
    !list && element.matches("p, h1, h2, h3") && !isPrintableText(element.textContent ?? "");

const readBlocks = (body: HTMLElement): Block[] =>
    Array.from(body.childNodes).flatMap((node): Block[] => {
        if (node instanceof Element) {
            return node.matches("ol, ul")
                ? Array.from(node.children).map((element, index) => ({element, list: {owner: node, number: index + 1, continued: false}}))
                : [{element: node}];
        }
        if (node.nodeType !== Node.TEXT_NODE || !isPrintableText(node.nodeValue ?? "")) return [];
        const paragraph = body.ownerDocument.createElement("p");
        paragraph.append(node.cloneNode());
        return [{element: paragraph}];
    });

/** Blanks at the end of the text are left out here; those at its start are dropped with any others at the top of a sheet. */
const toRuns = (blocks: Block[]) => {
    const runs: Run[] = [];
    let blanks: Block[] = [];
    let run: Run | null = null;
    for (const block of blocks) {
        if (isBlank(block)) {
            blanks.push(block);
            run = null;
            continue;
        }
        if (!run) {
            run = {blanks, blocks: []};
            runs.push(run);
            blanks = [];
        }
        run.blocks.push(block);
    }
    return runs;
};

/** A sheet's HTML: consecutive items of one list in one list, an `ol` that doesn't start at its first item with `start`. */
const renderSheet = (blocks: Block[]) => {
    const sheet = document.implementation.createHTMLDocument().createElement("div");
    let open = null as { owner: Element; list: Element } | null;
    for (const {element, list} of blocks) {
        const copy = element.cloneNode(true) as Element;
        if (!list) {
            sheet.append(copy);
            open = null;
            continue;
        }
        if (open?.owner !== list.owner) {
            open = {owner: list.owner, list: list.owner.cloneNode(false) as Element};
            if (list.owner.localName === "ol" && list.number > 1) open.list.setAttribute("start", String(list.number));
            sheet.append(open.list);
        }
        if (list.continued) {
            const style = copy.getAttribute("style");
            copy.setAttribute("style", style ? `${style};list-style:none` : "list-style:none");
        }
        open.list.append(copy);
    }
    return sheet.innerHTML;
};

/** A node's atoms: each code point (never half of one) and each `<br>`. */
const atomsOf = (node: Node): string[] => {
    if (node.nodeType === Node.TEXT_NODE) return Array.from(node.nodeValue ?? "");
    if (!(node instanceof Element)) return [];
    if (node.localName === "br") return [BREAK];
    return Array.from(node.childNodes).flatMap(atomsOf);
};

/** The element's atoms `from`–`to`: its tag and attributes kept, every tag open around them closed and reopened, tags left with nothing gone. */
const sliceElement = (element: Element, from: number, to: number) => {
    const copy = element.cloneNode(false) as Element;
    let at = 0;
    element.childNodes.forEach(child => {
        const atoms = atomsOf(child);
        const start = Math.max(from - at, 0);
        const end = Math.min(to - at, atoms.length);
        if (start < end) {
            if (child.nodeType === Node.TEXT_NODE) copy.append(atoms.slice(start, end).join(""));
            else if ((child as Element).localName === "br") copy.append(child.cloneNode());
            else copy.append(sliceElement(child as Element, start, end));
        }
        at += atoms.length;
    });
    return copy;
};

/** A part of a block. A list item's part after the first is the rest of that item: same number, no marker of its own. */
const partOf = ({element, list}: Block, from: number, to: number): Block => ({
    element: sliceElement(element, from, to),
    list: list && {...list, continued: list.continued || from > 0},
});

/** After a space, or at a `<br>` (which the cut drops); never before the block's first letter, which would leave a sheet with nothing. */
const wordCuts = (atoms: string[]) => {
    const cuts: Cut[] = [];
    let hasText = false;
    atoms.forEach((atom, index) => {
        if (hasText && atom === BREAK) cuts.push({head: index, tail: index + 1});
        else if (hasText && atom !== BREAK && !isSpace(atom) && isSpace(atoms[index - 1])) cuts.push({head: index, tail: index});
        hasText ||= atom !== BREAK && !isSpace(atom);
    });
    return cuts;
};

const characterCuts = (atoms: string[]) => atoms.slice(1).map((_, index): Cut => ({head: index + 1, tail: index + 1}));

/** The last cut whose first part fits. Text only grows from one cut to the next, so halving needs few measurements. */
const lastFitting = (cuts: Cut[], fitsCut: (cut: Cut) => boolean) => {
    let found: Cut | undefined;
    let low = 0;
    let high = cuts.length - 1;
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        if (fitsCut(cuts[middle])) {
            found = cuts[middle];
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return found;
};

/**
 * Measure and move (design § 4.6, contract § 2.4): the sheets' prescription text. `cleanHtml` is `cleanPrintHtml`'s output;
 * `fits` says whether a sheet's HTML fits the box (`printMeasure`'s in the app, a fake in unit tests). Answers one HTML string per
 * sheet, at least one. Pure logic over the DOM parser, no layout of its own.
 */
export const paginate = (cleanHtml: string, fits: (html: string) => boolean): string[] => {
    const sheets: Block[][] = [];
    let sheet: Block[] = [];
    const fit = (blocks: Block[]) => fits(renderSheet(blocks));
    const nextSheet = () => {
        sheets.push(sheet);
        sheet = [];
    };

    /** A block of a run taller than a box: the most words that fit stay here, the rest carries on through the next sheets. */
    const placeCutting = (block: Block, blanksBefore: Block[]) => {
        let rest = block;
        let blanks = blanksBefore;
        for (; ;) {
            const placed = [...sheet, ...blanks];
            if (fit([...placed, rest])) {
                sheet = [...placed, rest];
                return;
            }
            const atoms = atomsOf(rest.element);
            const current = rest;
            const headFits = ({head}: Cut) => fit([...placed, partOf(current, 0, head)]);
            const wordCut = lastFitting(wordCuts(atoms), headFits);
            if (!wordCut && sheet.length > 0) {
                nextSheet();
                blanks = [];
                continue;
            }
            // An empty sheet: between characters, and when not even one fits, one anyway, so the loop ends and nothing is lost
            const cuts = characterCuts(atoms);
            const cut = wordCut ?? lastFitting(cuts, headFits) ?? cuts[0];
            if (!cut) {
                sheet = [...placed, rest];
                return;
            }
            sheet = [...placed, partOf(rest, 0, cut.head)];
            let tail = cut.tail;
            while (atoms[tail] === BREAK) tail++;
            if (!isPrintableText(atoms.slice(tail).filter(atom => atom !== BREAK).join(""))) return;
            nextSheet();
            blanks = [];
            rest = partOf(rest, tail, atoms.length);
        }
    };

    const {body} = new DOMParser().parseFromString(cleanHtml, "text/html");
    for (const run of toRuns(readBlocks(body))) {
        const blanks = sheet.length > 0 ? run.blanks : [];
        if (fit([...sheet, ...blanks, ...run.blocks])) {
            sheet = [...sheet, ...blanks, ...run.blocks];
        } else if (sheet.length > 0 && fit(run.blocks)) {
            nextSheet();
            sheet = run.blocks;
        } else {
            run.blocks.forEach((block, index) => placeCutting(block, index === 0 ? blanks : []));
        }
    }
    if (sheet.length > 0) sheets.push(sheet);
    return sheets.length > 0 ? sheets.map(renderSheet) : [""];
};
