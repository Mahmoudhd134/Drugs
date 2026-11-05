import {describe, expect, test} from "vitest";
import {bodyOf, canonical, textOf} from "../../test/htmlShape.ts";
import {functionValue} from "./functions.ts";
import {paginate} from "./pagination.ts";

// Measure and move: contract § 2.4, every rule with a fake `fits`; design § 4.6; the business file: «ينتقل الدواء كله إلى الورقة
// التالية إن كان يتسع فيها، وإلا ينقسم بين كلمتين. الأسطر الفارغة في آخر النص وفي أول الورقة لا تُطبع.»

const BLOCKS = "p, li, h1, h2, h3";

/** The lines of a block: one, and one more per `<br>` with something after it. */
const blockLines = (block: Element) => {
    const parts = block.innerHTML.split(/<br\s*\/?>/i);
    return Math.max(1, parts[parts.length - 1] === "" ? parts.length - 1 : parts.length);
};

/** A box of `max` lines, where no line ever wraps. */
const linesFit = (max: number) => (html: string) =>
    Array.from(bodyOf(html).querySelectorAll(BLOCKS)).reduce((sum, block) => sum + blockLines(block), 0) <= max;

/** The weight of a block in `charsFit`: its text's code points without the spaces at its ends, its `<br>`s; at least 1. */
const blockChars = (block: Element) =>
    Math.max(1, [...(block.textContent ?? "").trim()].length + block.querySelectorAll("br").length);

/** A box of `max` characters (a wide or narrow box: where the words and characters are cut). */
const charsFit = (max: number) => (html: string) =>
    Array.from(bodyOf(html).querySelectorAll(BLOCKS)).reduce((sum, block) => sum + blockChars(block), 0) <= max;

const everything = () => true;
const nothing = () => false;

/** `paginate`, stopping a loop that doesn't end. */
const pages = (html: string, fits: (sheet: string) => boolean) => {
    let calls = 0;
    return paginate(html, sheet => {
        if (++calls > 200_000) throw new Error("paginate keeps asking: its loop doesn't end");
        return fits(sheet);
    });
};

/** The sheets match these, whatever the attributes' order and on which side of a cut the space went. */
const expectSheets = (sheets: string[], expected: string[]) => {
    expect(sheets.map(sheet => canonical(sheet, {trimBlocks: true}))).toEqual(expected.map(sheet => canonical(sheet, {trimBlocks: true})));
};

/** Rule 5: the sheets' text, one after the other, is the input's. */
const expectNothingLost = (html: string, sheets: string[]) => expect(sheets.map(textOf).join("")).toBe(textOf(html));

const expectAllFit = (sheets: string[], fits: (sheet: string) => boolean) => {
    for (const sheet of sheets) expect(fits(sheet), sheet).toBe(true);
};

const BLANK = "<p><br></p>";
const paragraphs = (...texts: string[]) => texts.map(text => `<p>${text}</p>`).join("");
/** Paragraphs named `prefix`1…n: a drug the way Quill keeps it, each line its own paragraph. */
const run = (prefix: string, count: number) => paragraphs(...Array.from({length: count}, (_, i) => `${prefix}${i + 1}`));

/** The number the browser gives a list's first item on this sheet. */
const startOf = (list: Element) => Number(list.getAttribute("start") ?? 1);

describe("nothing to print @area:prescription", () => {
    test("no text: one empty sheet @TPL-326", () => {
        expect(pages("", everything)).toEqual([""]);
        expect(pages("", nothing)).toEqual([""]);
    });

    test.each([
        ["one blank", BLANK],
        ["many blanks", BLANK.repeat(50)],
        ["an empty paragraph", "<p></p>"],
        ["spaces", "<p>   </p>"],
        ["U+00A0", "<p>\u00A0</p>"],
        ["Quill's cursor", "<p>\uFEFF</p>"],
        ["an invisible mark", "<p>\u200F</p>"],
        ["a blank heading", "<h2><br></h2>"],
    ])("%s: one empty sheet @TPL-326", (_name, html) => {
        expect(pages(html, everything)).toEqual([""]);
        expect(pages(html, nothing)).toEqual([""]);
    });
});

describe("text that fits @area:prescription", () => {
    test("everything on one sheet, as it came @TPL-140", () => {
        const html = `<h1>t</h1><p dir="rtl" style="text-align:right"><strong dir="ltr">a</strong><br>b</p>${BLANK}<ul><li>c</li></ul><ol><li>d</li></ol>`;
        expectSheets(pages(html, everything), [html]);
    });

    test("exactly a box: one sheet; one line more: two @TPL-140 @smoke", () => {
        expect(pages(run("a", 5), linesFit(5))).toHaveLength(1);
        expect(pages(run("a", 6), linesFit(5))).toHaveLength(2);
    });

    test("a blank counts as a line: exactly a box with it, one sheet; one line more, two @TPL-140", () => {
        const html = `${run("a", 2)}${BLANK}${run("b", 2)}`;
        expectSheets(pages(html, linesFit(5)), [html]);
        expectSheets(pages(html, linesFit(4)), [run("a", 2), run("b", 2)]);
    });

    test("`fits` is asked about the sheet as a whole, so what's already on it counts @TPL-140", () => {
        const html = `${paragraphs("aaaa")}${BLANK}${paragraphs("bbbb")}${BLANK}${paragraphs("cccc")}`;
        const fits = charsFit(9);
        const sheets = pages(html, fits);
        expectAllFit(sheets, fits);
        expectSheets(sheets, [`${paragraphs("aaaa")}${BLANK}${paragraphs("bbbb")}`, paragraphs("cccc")]);
    });
});

describe("blanks @area:prescription", () => {
    test("at the start and the end of the text they are dropped @TPL-326", () => {
        expectSheets(pages(`${BLANK}${BLANK}${paragraphs("a")}${BLANK}${BLANK}${BLANK}`, everything), [paragraphs("a")]);
    });

    test("between two runs on one sheet they stay as typed: all of them, with their attributes @TPL-326", () => {
        const typed = '<p dir="rtl" style="text-align:right"><br></p>';
        const html = `${paragraphs("a")}${typed}${BLANK}${typed}${paragraphs("b")}`;
        expectSheets(pages(html, everything), [html]);
    });

    test("many blank lines at the end make no sheet of their own and the sheets' count doesn't change @TPL-326", () => {
        const text = `${run("a", 3)}${BLANK}${run("b", 3)}`;
        const sheets = pages(`${text}${BLANK.repeat(40)}`, linesFit(3));
        expectSheets(sheets, [run("a", 3), run("b", 3)]);
        expect(sheets).toHaveLength(pages(text, linesFit(3)).length);
    });

    test("a continuation sheet doesn't start with a blank, and the sheet before doesn't end with one @TPL-326", () => {
        expectSheets(pages(`${run("a", 2)}${BLANK}${BLANK}${BLANK}${run("b", 2)}`, linesFit(3)), [run("a", 2), run("b", 2)]);
    });

    test.each([
        ["spaces", "<p>  </p>"],
        ["U+00A0", "<p>\u00A0</p>"],
        ["Quill's cursor", "<p>\uFEFF</p>"],
        ["U+200B", "<p>\u200B</p>"],
        ["U+061C", "<p>\u061C</p>"],
        ["a heading", "<h1><br></h1>"],
        ["two <br>s", "<p><br><br></p>"],
        ["a tag with no text", "<p><strong><br></strong></p>"],
    ])("%s is a blank too: it splits two runs and is dropped at the top @TPL-326", (_name, blank) => {
        // A run that doesn't fit the rest of the sheet moves whole, and the blank before it goes
        expectSheets(pages(`${run("a", 2)}${blank}${run("b", 2)}`, linesFit(3)), [run("a", 2), run("b", 2)]);
        expectSheets(pages(`${blank}${paragraphs("a")}${blank}`, everything), [paragraphs("a")]);
    });

    test("a paragraph holding only a full stop isn't a blank @TPL-326", () => {
        const html = `${paragraphs("a")}${paragraphs(".")}${paragraphs("b")}`;
        expectSheets(pages(html, linesFit(2)), [paragraphs("a", "."), paragraphs("b")]);
    });

    test("an empty list item isn't a blank: its number stays taken @TPL-327", () => {
        const html = "<ol><li>a</li><li><br></li><li>b</li></ol>";
        expectSheets(pages(html, everything), [html]);
        expectSheets(pages(html, linesFit(2)), ["<ol><li>a</li><li><br></li></ol>", '<ol start="3"><li>b</li></ol>']);
    });
});

describe("a run that fits a box moves whole @area:prescription", () => {
    test("a drug that doesn't fit the rest of the sheet moves to the next, whole @TPL-143 @smoke", () => {
        const html = `${run("a", 3)}${BLANK}${run("b", 3)}`;
        expectSheets(pages(html, linesFit(4)), [run("a", 3), run("b", 3)]);
    });

    test("Quill's lines between blank paragraphs are one run: no line stays behind @TPL-147 @smoke", () => {
        const html = `${paragraphs("اسم الدواء 1", "الجرعة 1", "ملاحظة 1")}${BLANK}${paragraphs("اسم الدواء 2", "الجرعة 2", "ملاحظة 2")}${BLANK}${paragraphs("اسم الدواء 3", "الجرعة 3")}`;
        expectSheets(pages(html, linesFit(5)), [
            paragraphs("اسم الدواء 1", "الجرعة 1", "ملاحظة 1"),
            paragraphs("اسم الدواء 2", "الجرعة 2", "ملاحظة 2"),
            paragraphs("اسم الدواء 3", "الجرعة 3"),
        ]);
    });

    test("`linesToHtml`'s one-paragraph drug is a run of one: it moves whole, not cut at its <br> @TPL-147", () => {
        const drug = (name: string) => `<p><strong>${name}</strong><br>الجرعة<br>ملاحظة</p>`;
        expectSheets(pages(`${drug("a")}${BLANK}${drug("b")}`, linesFit(4)), [drug("a"), drug("b")]);
    });

    test("a run that exactly fits a box moves whole @TPL-143", () => {
        expectSheets(pages(`${paragraphs("a")}${BLANK}${run("b", 4)}`, linesFit(4)), [paragraphs("a"), run("b", 4)]);
    });

    test("the blanks before a run count: it fits without them, not with them, so it moves @TPL-143", () => {
        expectSheets(pages(`${paragraphs("a")}${BLANK}${BLANK}${paragraphs("b")}`, linesFit(3)), [paragraphs("a"), paragraphs("b")]);
    });

    test("the blanks before a run stay when the run fits with them @TPL-143", () => {
        const html = `${paragraphs("a")}${BLANK}${BLANK}${paragraphs("b")}`;
        expectSheets(pages(html, linesFit(4)), [html]);
    });

    test("a next run goes on the sheet the moved run opened @TPL-143", () => {
        const html = `${run("a", 3)}${BLANK}${run("b", 2)}${BLANK}${paragraphs("c")}`;
        expectSheets(pages(html, linesFit(4)), [run("a", 3), `${run("b", 2)}${BLANK}${paragraphs("c")}`]);
    });

    test("a first run never leaves an empty sheet before it @TPL-143", () => {
        expectSheets(pages(run("a", 2), linesFit(2)), [run("a", 2)]);
        expectSheets(pages(run("a", 3), linesFit(2)), [run("a", 2), paragraphs("a3")]);
    });
});

describe("a run taller than a box @area:prescription", () => {
    test("on an empty sheet it fills it block by block and carries on through the next ones @TPL-144 @smoke", () => {
        expectSheets(pages(run("a", 5), linesFit(2)), [run("a", 2), paragraphs("a3", "a4"), paragraphs("a5")]);
    });

    test("it starts on the current sheet, not a new one, with the blanks before it @TPL-144", () => {
        expectSheets(pages(`${paragraphs("x")}${BLANK}${run("a", 5)}`, linesFit(3)), [
            `${paragraphs("x")}${BLANK}${paragraphs("a1")}`,
            paragraphs("a2", "a3", "a4"),
            paragraphs("a5"),
        ]);
    });

    test("the next run carries on where it ended @TPL-144", () => {
        expectSheets(pages(`${run("a", 4)}${BLANK}${paragraphs("b")}`, linesFit(3)), [run("a", 3), `${paragraphs("a4")}${BLANK}${paragraphs("b")}`]);
    });

    test("when not even its first line fits the rest of the sheet, the blanks before it don't stay at the sheet's end @TPL-144", () => {
        expectSheets(pages(`${paragraphs("x")}${BLANK}${run("a", 5)}`, linesFit(2)), [
            paragraphs("x"),
            run("a", 2),
            paragraphs("a3", "a4"),
            paragraphs("a5"),
        ]);
    });
});

describe("a block that doesn't fit is cut @area:prescription", () => {
    test("the most words that fit stay, the rest starts the next sheet @TPL-144", () => {
        const html = paragraphs("one two three");
        const sheets = pages(html, charsFit(7));
        expectSheets(sheets, [paragraphs("one two"), paragraphs("three")]);
        expectNothingLost(html, sheets);
    });

    test("no more, no fewer: each word that still fits stays on the sheet @TPL-144", () => {
        const html = paragraphs("a bb ccc dddd");
        const sheets = pages(html, charsFit(7));
        expectSheets(sheets, [paragraphs("a bb"), paragraphs("ccc"), paragraphs("dddd")]);
        expectNothingLost(html, sheets);
    });

    test("the rest carries on through as many sheets as it needs @TPL-144", () => {
        const words = Array.from({length: 30}, (_, i) => `w${String(i).padStart(2, "0")}`);
        const html = paragraphs(words.join(" "));
        const fits = charsFit(11);
        const sheets = pages(html, fits);
        expect(sheets).toHaveLength(10);
        expectAllFit(sheets, fits);
        expectNothingLost(html, sheets);
    });

    test("a word is never cut while a word fits: a tag inside a word isn't a cut point @TPL-144", () => {
        const html = "<p>aa<strong>bb</strong> cc</p>";
        const sheets = pages(html, charsFit(4));
        expectSheets(sheets, ["<p>aa<strong>bb</strong></p>", "<p>cc</p>"]);
        expectNothingLost(html, sheets);
    });

    test("<br> is a cut point, and a cut there drops that <br> @TPL-144", () => {
        expectSheets(pages("<p>aaa<br>bbb<br>ccc</p>", charsFit(7)), ["<p>aaa<br>bbb</p>", "<p>ccc</p>"]);
    });

    test("only the <br> at the cut goes: a blank line inside the second part stays @TPL-144", () => {
        expectSheets(pages("<p>aaa<br>bbb<br><br>ccc</p>", charsFit(7)), ["<p>aaa<br>bbb</p>", "<p><br>ccc</p>"]);
    });

    test("a block with spaces and <br>s is cut at whichever comes last that fits @TPL-144", () => {
        const html = "<p>aa bb<br>cc dd</p>";
        const sheets = pages(html, charsFit(8));
        expectSheets(sheets, ["<p>aa bb<br>cc</p>", "<p>dd</p>"]);
        expectNothingLost(html, sheets);
    });

    test("on a non-empty sheet with no word fitting, the block starts a new sheet @TPL-144", () => {
        const html = `${paragraphs("aaaaaaaa")}${BLANK}${paragraphs("bbbbbbb ccccccc ddddddd")}`;
        const sheets = pages(html, charsFit(10));
        expectSheets(sheets, [paragraphs("aaaaaaaa"), paragraphs("bbbbbbb"), paragraphs("ccccccc"), paragraphs("ddddddd")]);
    });

    test("a non-empty sheet doesn't cut a word between characters even when letters would fit @TPL-340", () => {
        const html = `${paragraphs("aaaa")}${BLANK}${paragraphs("bbbbbbbb bbbbbbbb")}`;
        const sheets = pages(html, charsFit(8));
        expect(sheets.map(sheet => textOf(sheet).trim())).toEqual(["aaaa", "bbbbbbbb", "bbbbbbbb"]);
    });

    test("on an empty sheet with no word fitting, it's cut between characters @TPL-340 @smoke", () => {
        const html = paragraphs("abcdefghijkl");
        const sheets = pages(html, charsFit(5));
        expectSheets(sheets, [paragraphs("abcde"), paragraphs("fghij"), paragraphs("kl")]);
    });

    test("a word that fits stays, then the long one is cut on its own sheet @TPL-340", () => {
        const html = paragraphs("abc defghijklmnop");
        const sheets = pages(html, charsFit(5));
        expectSheets(sheets, [paragraphs("abc"), paragraphs("defgh"), paragraphs("ijklm"), paragraphs("nop")]);
        expectNothingLost(html, sheets);
    });

    test("a 256-character unbroken name appears once, whole, across its sheets, each of them fitting @TPL-340", () => {
        const name = "N".repeat(256);
        const html = `<p><strong>${name}</strong></p>`;
        const fits = charsFit(30);
        const sheets = pages(html, fits);
        expect(sheets).toHaveLength(9);
        expectAllFit(sheets, fits);
        expect(sheets.map(textOf).join("")).toBe(name);
        for (const sheet of sheets) expect(bodyOf(sheet).querySelector("strong")).not.toBeNull();
    });

    test("characters are code points: a letter outside the BMP is never split @TPL-340", () => {
        const letter = String.fromCodePoint(0x1D400);
        const name = letter.repeat(9);
        const sheets = pages(paragraphs(name), charsFit(4));
        // In code points: a split pair would count two more
        expect(sheets.map(sheet => [...textOf(sheet)].length)).toEqual([4, 4, 1]);
        expect(sheets.map(textOf).join("")).toBe(name);
    });

    test("an Arabic name is cut between characters the same way, its direction kept @TPL-340", () => {
        const name = "أموكسيسيلين".repeat(3);
        const html = `<p dir="rtl">${name}</p>`;
        const sheets = pages(html, charsFit(10));
        expect(sheets.map(textOf).join("")).toBe(name);
        for (const sheet of sheets) expect(bodyOf(sheet).querySelector("p")?.getAttribute("dir")).toBe("rtl");
    });

    test("not even one character fitting: one is placed anyway, so the loop ends and nothing is lost @TPL-340", () => {
        const sheets = pages(paragraphs("abc"), nothing);
        expect(sheets.map(textOf)).toEqual(["a", "b", "c"]);
    });

    test("`fits` never true: runs, words, lists and formats all end and lose nothing @TPL-340", () => {
        const html = `<p><strong>ab</strong> cd</p>${BLANK}<ol><li>ef</li><li>g h</li></ol><h2>ij</h2>`;
        const sheets = pages(html, nothing);
        expect(sheets.map(textOf).join("")).toBe(textOf(html));
    });
});

describe("a cut keeps the format @area:prescription", () => {
    test("both parts keep the block's tag, `dir` and `style` @TPL-144", () => {
        const open = '<p dir="rtl" style="text-align:right;margin-top:0">';
        const sheets = pages(`${open}one two</p>`, charsFit(3));
        expectSheets(sheets, [`${open}one</p>`, `${open}two</p>`]);
    });

    test.each(["h1", "h2", "h3"])("a <%s> stays the same heading on both sides @TPL-144", tag => {
        expectSheets(pages(`<${tag} dir="rtl">one two</${tag}>`, charsFit(3)), [`<${tag} dir="rtl">one</${tag}>`, `<${tag} dir="rtl">two</${tag}>`]);
    });

    test.each(["strong", "em", "u", "span"])("<%s> open at the cut is closed and reopened @TPL-144", tag => {
        const html = `<p><${tag}>one two</${tag}> three</p>`;
        const sheets = pages(html, charsFit(5));
        expectSheets(sheets, [`<p><${tag}>one</${tag}></p>`, `<p><${tag}>two</${tag}></p>`, "<p>three</p>"]);
        expectNothingLost(html, sheets);
    });

    test("nested tags reopen in order @TPL-144", () => {
        const sheets = pages("<p><strong><em><u>one two</u></em></strong></p>", charsFit(3));
        expectSheets(sheets, ["<p><strong><em><u>one</u></em></strong></p>", "<p><strong><em><u>two</u></em></strong></p>"]);
    });

    test("a reopened tag keeps its `dir` @TPL-144", () => {
        const sheets = pages('<p dir="rtl"><span dir="ltr">one two</span></p>', charsFit(3));
        expectSheets(sheets, ['<p dir="rtl"><span dir="ltr">one</span></p>', '<p dir="rtl"><span dir="ltr">two</span></p>']);
        const name = pages('<p><strong dir="ltr">one two</strong></p>', charsFit(3));
        expectSheets(name, ['<p><strong dir="ltr">one</strong></p>', '<p><strong dir="ltr">two</strong></p>']);
    });

    test("a cut at a <br> inside a tag closes and reopens it too @TPL-144", () => {
        expectSheets(pages("<p><strong>aaa<br>bbb</strong></p>", charsFit(3)), ["<p><strong>aaa</strong></p>", "<p><strong>bbb</strong></p>"]);
    });

    test("a cut between characters keeps the tag open on both sides @TPL-340", () => {
        expectSheets(pages("<p><em>abcdef</em></p>", charsFit(3)), ["<p><em>abc</em></p>", "<p><em>def</em></p>"]);
    });

    test("text before and after the tag stays where it was @TPL-144", () => {
        const html = "<p>aa <strong>bb cc</strong> dd</p>";
        const sheets = pages(html, charsFit(5));
        expectSheets(sheets, ["<p>aa <strong>bb</strong></p>", "<p><strong>cc</strong> dd</p>"]);
        expectNothingLost(html, sheets);
    });

    test("escaped text stays escaped through a cut: nothing becomes an element @TPL-144", () => {
        const html = "<p>&lt;b&gt;x&lt;/b&gt; &amp;amp; y</p>";
        const sheets = pages(html, charsFit(8));
        for (const sheet of sheets) expect(bodyOf(sheet).querySelector("b")).toBeNull();
        expectNothingLost(html, sheets);
    });

    test("every sheet's text, one after the other, is the input's, whatever the box @TPL-144", () => {
        const html = `<h2>عنوان طويل جدًا</h2><p dir="rtl"><strong dir="ltr">Tobradex 5 ml</strong><br>نقطة في العين اليمنى<br>رج الزجاجة قبل الاستعمال</p>${BLANK}<ol><li>first item</li><li><em>second item is long</em></li></ol>${BLANK}<ul dir="rtl"><li>نقطة أولى</li><li>نقطة ثانية</li></ul>${BLANK}${BLANK}<p>${"z".repeat(40)}</p>`;
        for (const max of [1, 2, 3, 5, 8, 13, 21, 34, 55, 80]) {
            const fits = charsFit(max);
            const sheets = pages(html, fits);
            expect(sheets.map(textOf).join(""), `a box of ${max}`).toBe(textOf(html));
            expect(sheets.filter(sheet => !fits(sheet)), `a box of ${max}`).toEqual([]);
        }
    });
});

describe("lists @area:prescription", () => {
    const items = (from: number, to: number) =>
        Array.from({length: to - from + 1}, (_, i) => `<li>item ${from + i}</li>`).join("");

    test("consecutive items of one list on a sheet stay in one list @TPL-327", () => {
        const html = `<ol>${items(1, 3)}</ol>`;
        const [sheet] = pages(html, everything);
        expect(bodyOf(sheet).querySelectorAll("ol")).toHaveLength(1);
        expect(bodyOf(sheet).querySelectorAll("li")).toHaveLength(3);
    });

    test("the first sheet's list has no `start` @TPL-327", () => {
        const [sheet] = pages(`<ol>${items(1, 3)}</ol>`, everything);
        expect(bodyOf(sheet).querySelector("ol")?.hasAttribute("start")).toBe(false);
    });

    test("a numbered list of 30 items crossing sheets: the numbers continue, each item once @TPL-327 @smoke", () => {
        const sheets = pages(`<ol>${items(1, 30)}</ol>`, linesFit(10));
        expectSheets(sheets, [`<ol>${items(1, 10)}</ol>`, `<ol start="11">${items(11, 20)}</ol>`, `<ol start="21">${items(21, 30)}</ol>`]);
    });

    test("the list's own attributes are on every sheet's list @TPL-327", () => {
        const sheets = pages(`<ol dir="rtl" style="margin-right:3em">${items(1, 4)}</ol>`, linesFit(2));
        expectSheets(sheets, [
            `<ol dir="rtl" style="margin-right:3em">${items(1, 2)}</ol>`,
            `<ol dir="rtl" start="3" style="margin-right:3em">${items(3, 4)}</ol>`,
        ]);
    });

    test("an item's own attributes stay @TPL-327", () => {
        const item = '<li dir="rtl" style="text-align:center">a</li>';
        expectSheets(pages(`<ol>${item}${item}</ol>`, linesFit(1)), [`<ol>${item}</ol>`, `<ol start="2">${item}</ol>`]);
    });

    test("a bulleted list continues with no `start` @TPL-327", () => {
        const sheets = pages(`<ul>${items(1, 4)}</ul>`, linesFit(2));
        expectSheets(sheets, [`<ul>${items(1, 2)}</ul>`, `<ul>${items(3, 4)}</ul>`]);
    });

    test("a list is a run: it fits a box, so it moves whole, and starts at 1 @TPL-327", () => {
        const html = `${paragraphs("a", "b")}${BLANK}<ol>${items(1, 3)}</ol>`;
        expectSheets(pages(html, linesFit(4)), [paragraphs("a", "b"), `<ol>${items(1, 3)}</ol>`]);
    });

    test("a paragraph and the list right after it are one run @TPL-327", () => {
        const html = `${paragraphs("x")}${BLANK}${paragraphs("title")}<ol>${items(1, 2)}</ol>`;
        expectSheets(pages(html, linesFit(4)), [paragraphs("x"), `${paragraphs("title")}<ol>${items(1, 2)}</ol>`]);
    });

    test("two lists in a row stay two: the second has its own numbers @TPL-327", () => {
        const html = `<ol>${items(1, 2)}</ol><ol><li>x</li><li>y</li></ol>`;
        const [sheet] = pages(html, everything);
        const lists = bodyOf(sheet).querySelectorAll("ol");
        expect(lists).toHaveLength(2);
        expect(startOf(lists[1])).toBe(1);
        const crossing = pages(`<ol>${items(1, 2)}</ol><ol><li>x</li><li>y</li><li>z</li></ol>`, linesFit(3));
        expectSheets(crossing, [`<ol>${items(1, 2)}</ol><ol><li>x</li></ol>`, '<ol start="2"><li>y</li><li>z</li></ol>']);
    });

    test("a numbered and a bulleted list in a row keep their tags @TPL-327", () => {
        const html = "<ol><li>a</li></ol><ul><li>b</li></ul>";
        expectSheets(pages(html, linesFit(1)), ["<ol><li>a</li></ol>", "<ul><li>b</li></ul>"]);
    });

    test("the second part of a cut item has no marker, and its list starts at that item's own number @TPL-327", () => {
        const sheets = pages("<ol><li>one</li><li>aaaa bbbb</li><li>dd</li></ol>", charsFit(7));
        expectSheets(sheets, [
            "<ol><li>one</li><li>aaaa</li></ol>",
            '<ol start="2"><li style="list-style:none">bbbb</li><li>dd</li></ol>',
        ]);
    });

    test("so the next item still gets the next number: it keeps its own marker @TPL-327", () => {
        const sheets = pages("<ol><li>one</li><li>aaaa bbbb</li><li>dd</li></ol>", charsFit(7));
        const list = bodyOf(sheets[1]).querySelector("ol")!;
        const [cut, next] = Array.from(list.children);
        expect(startOf(list)).toBe(2);
        expect(cut.getAttribute("style")).toContain("list-style:none");
        expect(next.textContent).toBe("dd");
        expect(next.hasAttribute("style")).toBe(false);
    });

    test("the first part of a cut item keeps its marker @TPL-327", () => {
        const [first] = pages("<ol><li>one</li><li>aaaa bbbb</li></ol>", charsFit(7));
        for (const item of bodyOf(first).querySelectorAll("li")) expect(item.hasAttribute("style")).toBe(false);
    });

    test("every further part of a cut item has no marker either, each list at the item's own number @TPL-327", () => {
        const sheets = pages("<ol><li>x</li><li>aaaa bbbb cccc dddd</li></ol>", charsFit(5));
        expectSheets(sheets, [
            "<ol><li>x</li><li>aaaa</li></ol>",
            '<ol start="2"><li style="list-style:none">bbbb</li></ol>',
            '<ol start="2"><li style="list-style:none">cccc</li></ol>',
            '<ol start="2"><li style="list-style:none">dddd</li></ol>',
        ]);
    });

    test("a first item cut: its second part's list starts at 1, and the next item is 2 @TPL-327", () => {
        const sheets = pages("<ol><li>aaaa bbbb</li><li>c</li></ol>", charsFit(5));
        expect(sheets).toHaveLength(2);
        const list = bodyOf(sheets[1]).querySelector("ol")!;
        expect(startOf(list)).toBe(1);
        expect(list.children[0].getAttribute("style")).toContain("list-style:none");
        expect(list.children[1].textContent).toBe("c");
    });

    test("a cut item's own style stays beside the marker's @TPL-327", () => {
        const sheets = pages('<ol><li>x</li><li style="text-align:right">aaaa bbbb</li></ol>', charsFit(5));
        expectSheets(sheets, [
            '<ol><li>x</li><li style="text-align:right">aaaa</li></ol>',
            '<ol start="2"><li style="text-align:right;list-style:none">bbbb</li></ol>',
        ]);
    });

    test("a cut bulleted item: no marker on its second part, no `start` @TPL-327", () => {
        const sheets = pages("<ul><li>aaaa bbbb</li></ul>", charsFit(4));
        expectSheets(sheets, ["<ul><li>aaaa</li></ul>", '<ul><li style="list-style:none">bbbb</li></ul>']);
    });

    test("an item's format stays through a cut @TPL-327", () => {
        const sheets = pages("<ol><li>x</li><li><strong>aaaa bbbb</strong></li></ol>", charsFit(5));
        expectSheets(sheets, ["<ol><li>x</li><li><strong>aaaa</strong></li></ol>", '<ol start="2"><li style="list-style:none"><strong>bbbb</strong></li></ol>']);
    });
});

describe("a whole prescription @area:prescription", () => {
    const nameOf = (index: number) => `Drug${String(index).padStart(3, "0")}`;
    const drugs = (count: number) => Array.from({length: count}, (_, i) =>
        `<p dir="rtl" style="text-align:right;margin-top:0;margin-bottom:0"><strong dir="ltr">${nameOf(i + 1)}</strong><br>نقطة في العين<br>ملاحظة ${i + 1}</p>`,
    ).join(BLANK);
    const namesOn = (sheet: string) => Array.from(bodyOf(sheet).querySelectorAll("strong")).map(name => name.textContent);
    const numberOf = (index: number, sheets: string[]) =>
        functionValue("pageNumber", {now: new Date(2026, 10, 5), page: index + 1, pages: sheets.length});

    test("40 drugs: every drug's text appears exactly once across the sheets and none is cut @TPL-141 @smoke", () => {
        const html = drugs(40);
        const sheets = pages(html, linesFit(20));

        expect(sheets.length).toBeGreaterThan(1);
        expect(sheets.flatMap(namesOn)).toEqual(Array.from({length: 40}, (_, i) => nameOf(i + 1)));
        // None is cut: each paragraph that isn't a blank holds its three lines
        for (const sheet of sheets) {
            for (const paragraph of bodyOf(sheet).querySelectorAll("p")) {
                if (paragraph.textContent) expect(paragraph.querySelectorAll("br"), paragraph.innerHTML).toHaveLength(2);
            }
        }
        expectNothingLost(html, sheets);
    });

    test("a one-page prescription prints no page number; three sheets print 1/3, 2/3, 3/3 @TPL-145", () => {
        const one = pages(drugs(2), linesFit(10));
        expect(one.map((_, i) => numberOf(i, one))).toEqual([""]);
        const three = pages(drugs(3), linesFit(3));
        expect(three.map((_, i) => numberOf(i, three))).toEqual(["1/3", "2/3", "3/3"]);
    });

    test("40 drugs in a tiny box: it ends, each drug once, three-digit page numbers reached @TPL-335", () => {
        const html = drugs(40);
        const fits = charsFit(8);
        const sheets = pages(html, fits);

        expect(sheets.length).toBeGreaterThan(100);
        expectAllFit(sheets, fits);
        expect(sheets.flatMap(namesOn)).toEqual(Array.from({length: 40}, (_, i) => nameOf(i + 1)));
        expectNothingLost(html, sheets);
        expect(numberOf(99, sheets)).toBe(`100/${sheets.length}`);
    });

    test("the same text in the same box always gives the same sheets @TPL-335", () => {
        const html = drugs(12);
        expect(pages(html, linesFit(7))).toEqual(pages(html, linesFit(7)));
    });
});
