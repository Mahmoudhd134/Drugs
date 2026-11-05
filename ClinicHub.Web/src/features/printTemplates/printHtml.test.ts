import {describe, expect, test, vi} from "vitest";
import {aDrug, aLine, aSharedDrug} from "../../test";
import {bodyOf, canonical, styleOf, textOf} from "../../test/htmlShape.ts";
import type {Dosing} from "../dosing/types.ts";
import {htmlForPaste, htmlToPlainText, linesToHtml, linesToPlainText} from "../prescription/prescriptionText.ts";
import {paginate} from "./pagination.ts";
import {cleanPrintHtml, hasPrintableText, singleLine} from "./printHtml.ts";

// Cleaning: contract § 2.3, design § 4 "Same text as Copy" (allow list); the input is `htmlForPaste`'s output.

const clean = (html: string) => canonical(cleanPrintHtml(html));
const shape = (html: string) => canonical(html);

/** The one element of a cleaned HTML that `selector` finds. */
const onlyOne = (html: string, selector: string) => {
    const found = bodyOf(cleanPrintHtml(html)).querySelectorAll(selector);
    expect(found, selector).toHaveLength(1);
    return found[0];
};

const twoDropsLeft: Dosing = {doseAmount: 2, doseUnit: "drop", eye: "left", frequency: "daily", frequencyValue: 6, durationUnit: "weeks", durationValue: 2};
const SENTENCE = "نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين";

describe("the text printed is the Copy text @area:prescription", () => {
    const lines = () => [
        aLine(aDrug({name: "Tobradex"}), twoDropsLeft, "رج الزجاجة"),
        aLine(aDrug({name: "قطرة مرطبة"}), twoDropsLeft),
    ];

    test("two drugs: names bold, dosing sentences, notes, in the prescription's order @TPL-123 @smoke", () => {
        const body = bodyOf(cleanPrintHtml(htmlForPaste(linesToHtml(lines()))));

        expect(Array.from(body.querySelectorAll("strong")).map(name => name.textContent)).toEqual(["Tobradex", "قطرة مرطبة"]);
        expect(body.textContent).toBe(`Tobradex${SENTENCE}رج الزجاجةقطرة مرطبة${SENTENCE}`);
    });

    test("read back as plain text, it is the plain text Copy puts on the clipboard @TPL-123", () => {
        const printed = lines();
        expect(htmlToPlainText(cleanPrintHtml(htmlForPaste(linesToHtml(printed))))).toBe(linesToPlainText(printed));
    });

    test("cleaning changes nothing of what Copy pastes for the generated text @TPL-123", () => {
        const pasted = htmlForPaste(linesToHtml(lines()));
        expect(clean(pasted)).toBe(shape(pasted));
    });

    test("the blank paragraph between two drugs stays @TPL-123", () => {
        const body = bodyOf(cleanPrintHtml(htmlForPaste(linesToHtml(lines()))));
        expect(Array.from(body.children).map(block => block.tagName)).toEqual(["P", "P", "P"]);
        expect(body.children[1].innerHTML).toBe("<br>");
    });
});

describe("what's only on the screen doesn't print @area:prescription", () => {
    test("a line with no dosing: no «لا توجد جرعة محددة» @TPL-330", () => {
        const html = htmlForPaste(linesToHtml([aLine(aDrug({name: "Vigamox"}), {})]));
        expect(textOf(cleanPrintHtml(html))).toBe("Vigamox");
    });

    test("a line of a drug the admin disabled: no «معطّل من الإدارة» @TPL-330", () => {
        const html = htmlForPaste(linesToHtml([aLine(aSharedDrug({name: "VIGAMOX", withdrawn: true}), twoDropsLeft)]));
        expect(textOf(cleanPrintHtml(html))).toBe(`VIGAMOX${SENTENCE}`);
    });
});

describe("HTML in a name, a note or the editor @area:prescription", () => {
    test("in a drug name or a note it stays text: no element is made @TPL-133", () => {
        const html = htmlForPaste(linesToHtml([aLine(aDrug({name: "<img src=x onerror=alert(1)>"}), {}, "<script>alert(2)</script>")]));
        const cleaned = cleanPrintHtml(html);

        const body = bodyOf(cleaned);
        expect(body.querySelector("img, script")).toBeNull();
        expect(body.textContent).toBe("<img src=x onerror=alert(1)><script>alert(2)</script>");
    });

    test.each([
        ["script", "<p>a</p><script>alert(1)</script><p>b</p>"],
        ["script in a paragraph", "<p>a<script>alert(1)</script></p><p>b</p>"],
        ["style", "<style>p{color:red}</style><p>a</p><p>b</p>"],
        ["iframe", "<p>a</p><iframe src=\"https://example.test/\">x</iframe><p>b</p>"],
        ["object", "<p>a</p><object data=\"x.swf\">x</object><p>b</p>"],
        ["embed", "<p>a</p><embed src=\"x.swf\"><p>b</p>"],
        ["svg", "<p>a</p><svg onload=\"alert(1)\"><text>x</text></svg><p>b</p>"],
        ["math", "<p>a</p><math><mi>x</mi></math><p>b</p>"],
        ["template", "<p>a</p><template><p>x</p></template><p>b</p>"],
        ["noscript", "<p>a</p><noscript><p>x</p></noscript><p>b</p>"],
        ["title", "<title>x</title><p>a</p><p>b</p>"],
        ["link", "<link rel=\"stylesheet\" href=\"x.css\"><p>a</p><p>b</p>"],
        ["meta", "<meta http-equiv=\"refresh\" content=\"0\"><p>a</p><p>b</p>"],
        ["a comment", "<p>a</p><!-- x --><p>b</p>"],
        ["a comment in a paragraph", "<p>a<!-- x --></p><p>b</p>"],
        ["svg hiding a style and an image", "<p>a</p><svg><style><img src=x onerror=alert(1)></style></svg><p>b</p>"],
    ])("%s is removed with its content @TPL-133", (_name, html) => {
        expect(clean(html)).toBe("<p>a</p><p>b</p>");
    });

    test("an image with `onerror` in the editor's HTML is gone @TPL-133", () => {
        expect(clean('<p>a<img src="x" onerror="alert(1)">b</p>')).toBe("<p>ab</p>");
    });

    test("event handlers and links leave with their attributes, the text stays @TPL-133", () => {
        expect(clean('<p onclick="alert(1)">a<a href="javascript:alert(2)" onmouseover="alert(3)">b</a></p>')).toBe("<p>ab</p>");
    });

    test("it parses apart from the page: nothing is added to the page's DOM, nothing is requested @TPL-133", () => {
        const before = document.body.innerHTML;
        const createElement = vi.spyOn(document, "createElement");
        const innerHTML = vi.spyOn(Element.prototype, "innerHTML", "set");

        cleanPrintHtml('<p>a<img src="https://example.test/x.png" onerror="alert(1)"></p><script>alert(2)</script>');

        expect(createElement).not.toHaveBeenCalled();
        expect(innerHTML.mock.contexts.filter(element => (element as Element).ownerDocument === document)).toEqual([]);
        expect(document.body.innerHTML).toBe(before);
    });
});

describe("every toolbar format stays @area:prescription", () => {
    // Quill's own HTML, then `htmlForPaste`, as the flow gives it
    test.each([
        ["bold", "<p><strong>x</strong></p>"],
        ["italic", "<p><em>x</em></p>"],
        ["underline", "<p><u>x</u></p>"],
        ["a numbered list", "<ol><li>x</li><li>y</li></ol>"],
        ["a bulleted list", "<ul><li>x</li><li>y</li></ul>"],
        ["direction", '<p class="ql-direction-rtl">نص</p>'],
        ["centered", '<p class="ql-align-center">x</p>'],
        ["aligned right", '<p class="ql-align-right">x</p>'],
        ["justified", '<p class="ql-align-justify">x</p>'],
        ["indented", '<p class="ql-indent-2">x</p>'],
        ["indented, right to left", '<p class="ql-direction-rtl ql-indent-1">نص</p>'],
        ["indented twice, right to left: 6em, the deepest that stays as it is", '<p class="ql-direction-rtl ql-indent-2">نص</p>'],
        ["a list item's format", '<ol><li class="ql-direction-rtl ql-align-center ql-indent-1">نص</li></ol>'],
        ["a heading", "<h2>x</h2>"],
        ["a name with its own direction", '<p><strong dir="ltr">Tobradex</strong><br>x</p>'],
        ["a span with its direction", '<p><span dir="rtl">x</span></p>'],
        ["all of them nested", "<p><strong><em><u>x</u></em></strong></p>"],
    ])("%s: the result equals `htmlForPaste` @TPL-328", (_name, quillHtml) => {
        const pasted = htmlForPaste(quillHtml);
        expect(clean(pasted)).toBe(shape(pasted));
    });

    test("alignment, direction and indent reach the print as `htmlForPaste` wrote them @TPL-328", () => {
        const pasted = htmlForPaste('<p class="ql-direction-rtl ql-align-center ql-indent-2">نص</p>');
        const paragraph = onlyOne(pasted, "p");
        expect(paragraph.getAttribute("dir")).toBe("rtl");
        expect(styleOf(paragraph.getAttribute("style") ?? "")).toBe("margin-bottom:0;margin-right:6em;margin-top:0;text-align:center");
    });

    test.each(["p", "h1", "h2", "h3"])("<%s> stays with its text @TPL-328", tag => {
        expect(clean(`<${tag}>x</${tag}>`)).toBe(`<${tag}>x</${tag}>`);
    });

    test.each(["strong", "em", "u", "span"])("<%s> stays inline with its text @TPL-328", tag => {
        expect(clean(`<p>a<${tag}>b</${tag}>c</p>`)).toBe(`<p>a<${tag}>b</${tag}>c</p>`);
    });

    test("<br> stays @TPL-328", () => {
        expect(clean("<p>a<br>b</p>")).toBe("<p>a<br>b</p>");
    });
});

describe("pasted content @area:prescription", () => {
    test("an image is gone and its neighbours stay @TPL-329", () => {
        expect(clean('<p>a<img src="https://example.test/x.png">b</p>')).toBe("<p>ab</p>");
    });

    test("a link: its text stays in place, no `href` @TPL-329", () => {
        const html = '<p>a<a href="https://example.test/" target="_blank">b</a>c</p>';
        expect(clean(html)).toBe("<p>abc</p>");
    });

    test.each([
        ["color", "color:red"],
        ["background", "background:url(https://example.test/x.png)"],
        ["background color", "background-color:yellow"],
        ["font family", "font-family:Arial"],
        ["font size", "font-size:40px"],
        ["font shorthand", "font:40px Arial"],
        ["position", "position:fixed"],
        ["display", "display:none"],
        ["padding", "padding:10px"],
        ["width", "width:100%"],
        ["line height", "line-height:10"],
    ])("a %s is dropped and the attribute with it, the text stays @TPL-329", (_name, style) => {
        expect(clean(`<p style="${style}">x</p>`)).toBe("<p>x</p>");
        expect(clean(`<p><span style="${style}">x</span></p>`)).toBe("<p><span>x</span></p>");
    });

    test("only the allowed properties stay, property by property @TPL-329", () => {
        const paragraph = onlyOne('<p style="color: red; text-align: center; position: fixed; margin-top: 1em; font-size: 40px">x</p>', "p");
        expect(styleOf(paragraph.getAttribute("style") ?? "")).toBe("margin-top:1em;text-align:center");
    });

    test.each(["left", "right", "center", "justify", "start", "end"])("text-align:%s stays @TPL-329", align => {
        expect(styleOf(onlyOne(`<p style="text-align:${align}">x</p>`, "p").getAttribute("style") ?? "")).toBe(`text-align:${align}`);
    });

    test.each(["inherit", "-webkit-center", "match-parent", "url(x)"])("text-align:%s goes @TPL-329", align => {
        expect(clean(`<p style="text-align:${align}">x</p>`)).toBe("<p>x</p>");
    });

    test.each([
        "margin-top:0", "margin-bottom:0", "margin-left:3em", "margin-right:6em", "margin-left:6em",
        "margin-inline-start:1.5em", "margin-inline-end:2px", "margin-top:10pt", "margin-bottom:5mm", "margin-left:12",
    ])("%s stays @TPL-329", margin => {
        expect(styleOf(onlyOne(`<p style="${margin}">x</p>`, "p").getAttribute("style") ?? "")).toBe(margin);
    });

    test.each([
        "margin:auto", "margin-top:1vw", "margin-top:1%", "margin-top:1rem", "margin-left:calc(1px + 1px)", "margin:1px 2px",
        "margin-top:em", "margin-block-start:1em", "margin-foo:1em",
    ])("%s goes @TPL-329", margin => {
        expect(clean(`<p style="${margin}">x</p>`)).toBe("<p>x</p>");
    });

    test.each(["margin:0", "margin:1em", "margin:-5em", "margin:0 0 0 24em"])("the shorthand %s goes @TPL-329", margin => {
        expect(clean(`<p style="${margin}">x</p>`)).toBe("<p>x</p>");
    });

    test.each([
        "margin-left:-5em", "margin-right:-1px", "margin-top:-100mm", "margin-bottom:-1pt",
        "margin-inline-start:-2em", "margin-inline-end:-0.5em", "margin-left:-12",
    ])("the negative %s goes: it would pull text off the sheet @TPL-329", margin => {
        expect(clean(`<p style="${margin}">x</p>`)).toBe("<p>x</p>");
    });

    test("a negative margin goes, the other properties beside it stay @TPL-329", () => {
        const paragraph = onlyOne('<p style="margin-left:-5em;text-align:center;margin-top:0">x</p>', "p");
        expect(styleOf(paragraph.getAttribute("style") ?? "")).toBe("margin-top:0;text-align:center");
    });

    test.each([
        ["margin-left", "24em"], ["margin-right", "24em"], ["margin-inline-start", "24em"], ["margin-inline-end", "24em"], ["margin-left", "6.5em"],
    ])("a side margin above 6em is capped: %s:%s @TPL-329", (property, value) => {
        const paragraph = onlyOne(`<p style="${property}:${value}">x</p>`, "p");
        expect(styleOf(paragraph.getAttribute("style") ?? "")).toBe(`${property}:min(${value}, 50%)`);
    });

    test.each(["margin-top:24em", "margin-bottom:24em"])("%s isn't a side margin: it stays as it is @TPL-329", margin => {
        expect(styleOf(onlyOne(`<p style="${margin}">x</p>`, "p").getAttribute("style") ?? "")).toBe(margin);
    });

    test("a deep Tab indent from `htmlForPaste`: capped in print, on the side the direction gives @TPL-329", () => {
        const left = onlyOne(htmlForPaste('<p class="ql-indent-8">x</p>'), "p");
        expect(styleOf(left.getAttribute("style") ?? "")).toBe("margin-bottom:0;margin-left:min(24em, 50%);margin-top:0");
        const right = onlyOne(htmlForPaste('<p class="ql-direction-rtl ql-indent-8">نص</p>'), "p");
        expect(styleOf(right.getAttribute("style") ?? "")).toBe("margin-bottom:0;margin-right:min(24em, 50%);margin-top:0");
    });

    test("an empty style leaves no attribute @TPL-329", () => {
        expect(cleanPrintHtml('<p style="">x</p>')).not.toContain("style");
        expect(cleanPrintHtml('<p style="color:red">x</p>')).not.toContain("style");
    });

    test.each(["ltr", "rtl", "auto"])("dir=%s stays, on any allowed tag @TPL-329", dir => {
        expect(clean(`<p dir="${dir}"><strong dir="${dir}">نص</strong></p>`)).toBe(`<p dir="${dir}"><strong dir="${dir}">نص</strong></p>`);
    });

    test("any other dir goes @TPL-329", () => {
        expect(clean('<p dir="sideways">x</p>')).toBe("<p>x</p>");
    });

    test.each(["class", "id", "lang", "title", "data-x", "align", "width", "contenteditable"])("attribute %s goes @TPL-329", attribute => {
        expect(clean(`<p ${attribute}="y">x</p>`)).toBe("<p>x</p>");
        expect(clean(`<ol><li ${attribute}="y">x</li></ol>`)).toBe("<ol><li>x</li></ol>");
    });

    test("`start` on a pasted list goes: `paginate` writes it @TPL-329", () => {
        expect(clean('<ol start="7"><li>x</li></ol>')).toBe("<ol><li>x</li></ol>");
    });

    test.each(["b", "i", "font", "a", "sub", "sup", "mark", "small", "abbr", "code"])("<%s> is dropped, its children stay in place @TPL-329", tag => {
        expect(clean(`<p>a<${tag}>b<strong>c</strong>d</${tag}>e</p>`)).toBe("<p>ab<strong>c</strong>de</p>");
    });

    test.each(["div", "blockquote", "pre", "h4", "h5", "h6", "address", "section", "article"])("<%s> becomes a paragraph, not merged with its neighbours @TPL-329", tag => {
        expect(clean(`<p>a</p><${tag}>b</${tag}><p>c</p>`)).toBe("<p>a</p><p>b</p><p>c</p>");
    });

    test.each(["div", "blockquote", "h4", "section"])("<%s> keeps its direction and alignment when it becomes a paragraph @TPL-329", tag => {
        const paragraph = onlyOne(`<${tag} dir="rtl" style="text-align:center;color:red">نص</${tag}>`, "p");
        expect(paragraph.getAttribute("dir")).toBe("rtl");
        expect(styleOf(paragraph.getAttribute("style") ?? "")).toBe("text-align:center");
    });

    test("in a <pre> a line break becomes <br> @TPL-329", () => {
        expect(clean("<pre>a\nb\nc</pre>")).toBe("<p>a<br>b<br>c</p>");
    });

    test("a block inside a dropped tag keeps its text, and no dropped block tag remains @TPL-329", () => {
        const cleaned = cleanPrintHtml("<blockquote><div>a</div><div>b</div></blockquote>");
        const body = bodyOf(cleaned);
        expect(body.querySelector("blockquote, div")).toBeNull();
        expect(body.textContent).toBe("ab");
    });

    test("a table's text stays, its tags go @TPL-329", () => {
        const body = bodyOf(cleanPrintHtml("<table><tr><td>a</td><td>b</td></tr></table>"));
        expect(body.querySelector("table, tr, td")).toBeNull();
        expect(body.textContent).toBe("ab");
    });

    test("text outside any block at the top level is wrapped in a paragraph @TPL-329", () => {
        expect(clean("a")).toBe("<p>a</p>");
        expect(clean("a <strong>b</strong> c")).toBe("<p>a <strong>b</strong> c</p>");
        expect(clean("<p>a</p>b<p>c</p>")).toBe("<p>a</p><p>b</p><p>c</p>");
        expect(clean('a<a href="x">b</a>')).toBe("<p>ab</p>");
    });

    test("nothing comes out of nothing @TPL-329", () => {
        expect(clean("")).toBe("");
        expect(clean("<script>alert(1)</script>")).toBe("");
    });

    test("escaped text stays escaped @TPL-133", () => {
        const cleaned = cleanPrintHtml("<p>1 &lt; 2 &amp; &lt;b&gt;x&lt;/b&gt;</p>");
        expect(bodyOf(cleaned).querySelector("b")).toBeNull();
        expect(textOf(cleaned)).toBe("1 < 2 & <b>x</b>");
    });
});

describe("the cap's units @area:prescription", () => {
    // 6em = 96 px: 1em = 16 px, 1 pt = 4/3 px, 1 mm = 96/25.4 px
    test.each([
        ["margin-left:96px"], ["margin-right:72pt"], ["margin-inline-start:25mm"], ["margin-inline-end:6em"],
    ])("%s is at most 6em: it stays as it is @TPL-329", margin => {
        expect(cleanPrintHtml(`<p style="${margin}">x</p>`)).toBe(`<p style="${margin}">x</p>`);
    });

    test.each([
        ["margin-left", "97px"], ["margin-left", "500px"], ["margin-right", "73pt"], ["margin-inline-start", "26mm"], ["margin-inline-end", "6.01em"],
    ])("%s:%s is above 6em: capped @TPL-329", (property, value) => {
        expect(cleanPrintHtml(`<p style="${property}:${value}">x</p>`)).toBe(`<p style="${property}:min(${value}, 50%)">x</p>`);
    });

    test.each(["margin-left:500", "margin-right:500"])("%s has no unit: the browser ignores it, so it's never capped @TPL-329", margin => {
        expect(cleanPrintHtml(`<p style="${margin}">x</p>`)).toBe(`<p style="${margin}">x</p>`);
    });

    test("a leading + is allowed, and the cap counts its number @TPL-329", () => {
        expect(cleanPrintHtml('<p style="margin-left:+3em">x</p>')).toBe('<p style="margin-left:+3em">x</p>');
        expect(cleanPrintHtml('<p style="margin-left:+24em">x</p>')).toBe('<p style="margin-left:min(+24em, 50%)">x</p>');
    });

    test("a number with no digit before its point: read as it is @TPL-329", () => {
        expect(cleanPrintHtml('<p style="margin-left:.5em">x</p>')).toBe('<p style="margin-left:.5em">x</p>');
        expect(cleanPrintHtml('<p style="margin-left:96.5px">x</p>')).toBe('<p style="margin-left:min(96.5px, 50%)">x</p>');
    });

    test("the cap is for side margins, in every unit: a deep top or bottom margin stays @TPL-329", () => {
        expect(cleanPrintHtml('<p style="margin-top:500px;margin-bottom:100mm">x</p>')).toBe('<p style="margin-top:500px;margin-bottom:100mm">x</p>');
    });

    test("capitals and spaces in a declaration: it's read, and written in small letters with none around it @TPL-329", () => {
        expect(cleanPrintHtml('<p style=" TEXT-ALIGN : CENTER ; Margin-Left : 3EM ">x</p>')).toBe('<p style="text-align:center;margin-left:3em">x</p>');
    });

    test("a declaration with no colon, or with no property, goes; those beside it stay @TPL-329", () => {
        expect(cleanPrintHtml('<p style="center;text-align:center;:3em">x</p>')).toBe('<p style="text-align:center">x</p>');
    });
});

describe("the result re-parses to itself @area:prescription", () => {
    /** Each expected value is the exact string, which the HTML parser gives back as it is. */
    const expectCleaned = (html: string, expected: string) => {
        const cleaned = cleanPrintHtml(html);
        expect(cleaned).toBe(expected);
        expect(bodyOf(cleaned).innerHTML).toBe(expected);
        expect(cleanPrintHtml(cleaned)).toBe(expected);
    };

    test.each([
        ["text on both sides of it", "<div>a<div>b</div>c</div>", "<p>a</p><p>b</p><p>c</p>"],
        ["siblings before it stay together", "<div>a<strong>b</strong>c<div>d</div></div>", "<p>a<strong>b</strong>c</p><p>d</p>"],
        ["an inline sibling holding no block", "<div><strong>a</strong><div>b</div></div>", "<p><strong>a</strong></p><p>b</p>"],
        ["two levels deep", "<div><div><div>a</div></div></div>", "<p>a</p>"],
        ["two blocks in a dropped block", "<blockquote><div>a</div><div>b</div></blockquote>", "<p>a</p><p>b</p>"],
        ["a heading", "<h2>a<div>b</div>c</h2>", "<h2>a</h2><p>b</p><h2>c</h2>"],
        ["a list in a paragraph", "<div>a<ul><li>b</li></ul>c</div>", "<p>a</p><ul><li>b</li></ul><p>c</p>"],
        ["a list in a heading", "<h1>a<ol><li>b</li></ol></h1>", "<h1>a</h1><ol><li>b</li></ol>"],
    ])("a block nested in a paragraph or a heading is lifted out, around its siblings: %s @TPL-329", (_name, html, expected) => {
        expectCleaned(html, expected);
    });

    test("each part around a lifted block keeps its block's direction and alignment; the lifted block keeps only its own @TPL-329", () => {
        expectCleaned(
            '<div dir="rtl" style="text-align:center">أ<div dir="ltr">b</div>ج</div>',
            '<p dir="rtl" style="text-align:center">أ</p><p dir="ltr">b</p><p dir="rtl" style="text-align:center">ج</p>',
        );
    });

    test.each([
        ["with text around it", "<div><strong>a<div>b</div>c</strong></div>", "<p><strong>a</strong></p><p>b</p><p><strong>c</strong></p>"],
        ["at the top level", "<span>a<div>b</div></span>", "<p><span>a</span></p><p>b</p>"],
        ["keeping the inline tag's direction", '<div><span dir="ltr">a<div>b</div></span></div>', '<p><span dir="ltr">a</span></p><p>b</p>'],
    ])("a block nested in an inline tag is lifted out, the tag closed and reopened around it: %s @TPL-329", (_name, html, expected) => {
        expectCleaned(html, expected);
    });

    test.each([
        ["white space", "<div> <div>a</div> </div>", "<p>a</p>"],
        ["an inline tag holding only white space", "<div><span> </span><div>a</div></div>", "<p>a</p>"],
    ])("what's left around a lifted block makes no empty paragraph: %s @TPL-329", (_name, html, expected) => {
        expectCleaned(html, expected);
    });

    test("a blank line left around a lifted block stays: a <br> isn't nothing @TPL-329", () => {
        expectCleaned("<div><br><div>a</div></div>", "<p><br></p><p>a</p>");
    });

    test.each([
        ["text beside it", "<ul><li>a<div>b</div></li></ul>", "<ul><li>a<p>b</p></li></ul>"],
        ["a block nested in a block", "<ul><li><div>a<div>b</div></div></li></ul>", "<ul><li><p>a</p><p>b</p></li></ul>"],
        ["a nested list", "<ol><li>a<ul><li>b</li></ul></li></ol>", "<ol><li>a<ul><li>b</li></ul></li></ol>"],
    ])("a list item may hold blocks: %s @TPL-329", (_name, html, expected) => {
        expectCleaned(html, expected);
    });

    test.each([
        ["text before an item", "<ol>a<li>b</li></ol>", "<ol><li>a</li><li>b</li></ol>"],
        ["text after an item", "<ol><li>a</li>b</ol>", "<ol><li>a</li><li>b</li></ol>"],
        ["text between items, each its own", "<ol><li>a</li>b<li>c</li>d</ol>", "<ol><li>a</li><li>b</li><li>c</li><li>d</li></ol>"],
        ["siblings in a row, in one item", "<ol>a<strong>b</strong>c<li>d</li></ol>", "<ol><li>a<strong>b</strong>c</li><li>d</li></ol>"],
        ["a block", "<ul><div>a</div></ul>", "<ul><li><p>a</p></li></ul>"],
        ["a list", "<ol><ul><li>a</li></ul></ol>", "<ol><li><ul><li>a</li></ul></li></ol>"],
    ])("a list's child that isn't a <li> is wrapped in one: %s @TPL-329", (_name, html, expected) => {
        expectCleaned(html, expected);
    });

    test.each([
        ["between its items", "<ol><li>a</li> <li>b</li></ol>", "<ol><li>a</li><li>b</li></ol>"],
        ["all around them", "<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>", "<ul><li>a</li><li>b</li></ul>"],
        ["and nothing else in the list", "<ol> </ol>", "<ol></ol>"],
    ])("white space in a list goes, it makes no item: %s @TPL-329", (_name, html, expected) => {
        expectCleaned(html, expected);
    });

    test.each([
        ["one space", "<p>a</p> <p>b</p>", "<p>a</p><p>b</p>"],
        ["lines, around every kind of block", "<p>a</p>\n\n<ol><li>b</li></ol>\n<h2>c</h2>\n", "<p>a</p><ol><li>b</li></ol><h2>c</h2>"],
    ])("white space between top-level blocks goes: %s @TPL-329", (_name, html, expected) => {
        expectCleaned(html, expected);
    });

    test("text between top-level blocks is wrapped with its own spaces @TPL-329", () => {
        expectCleaned("<p>a</p> b <p>c</p>", "<p>a</p><p> b </p><p>c</p>");
    });

    test("white space between two inline tags at the top level is part of their paragraph @TPL-329", () => {
        expectCleaned("<strong>a</strong> <em>b</em>", "<p><strong>a</strong> <em>b</em></p>");
    });

    test.each([
        ["text", "a"],
        ["text around a block", "a<p>b</p>c"],
        ["a <br> alone", "<br>"],
        ["a comment at the top level", "<!-- x -->a<!-- y --><p>b</p><!-- z -->"],
        ["a comment in a block and in a list", "<p>a<!-- x --></p><ol><!-- y --><li>b<!-- z --></li></ol>"],
        ["what the parser reads as a comment", "<?php x?><![CDATA[y]]><p>a</p></ x>"],
        ["a closing tag with no opening", "</p></div>a</br>"],
        ["a table's text, which the parser moves out of it", "<table>a<tr><td>b</td></tr>c</table>"],
        ["a form control", "<select><option>a</option></select><textarea>b</textarea>"],
        ["html and body tags", "<html><body>a</body></html>"],
        ["a dropped inline tag at the top level", "<b>a</b> <i>b</i>"],
    ])("the top level holds only elements, and nothing anywhere is a comment: %s @TPL-329", (_name, html) => {
        const body = bodyOf(cleanPrintHtml(html));
        expect(Array.from(body.childNodes).filter(node => !(node instanceof Element))).toEqual([]);
        expect(body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_COMMENT).nextNode()).toBeNull();
    });

    test("toolbar lists, nested as Quill's paste keeps them, equal htmlForPaste @TPL-328", () => {
        const pasted = htmlForPaste('<ol><li class="ql-direction-rtl">أ<ul><li class="ql-align-center">b</li></ul></li></ol>');
        expectCleaned(pasted, '<ol><li dir="rtl">أ<ul><li style="text-align:center">b</li></ul></li></ol>');
    });
});

describe("a line with no right-to-left letter @area:prescription", () => {
    const AT_THE_RIGHT = 'dir="ltr" style="text-align:right"';

    test.each([
        ["a <p>", '<p dir="rtl">5-FU 1%</p>', `<p ${AT_THE_RIGHT}>5-FU 1%</p>`],
        ["an <h1>", '<h1 dir="rtl">5-FU 1%</h1>', `<h1 ${AT_THE_RIGHT}>5-FU 1%</h1>`],
        ["an <h2>", '<h2 dir="rtl">5-FU 1%</h2>', `<h2 ${AT_THE_RIGHT}>5-FU 1%</h2>`],
        ["an <h3>", '<h3 dir="rtl">5-FU 1%</h3>', `<h3 ${AT_THE_RIGHT}>5-FU 1%</h3>`],
        ["a block that became a <p>", '<blockquote dir="rtl">5-FU 1%</blockquote>', `<p ${AT_THE_RIGHT}>5-FU 1%</p>`],
        ["inside a bold tag", '<p dir="rtl"><strong>ALEMOX 1 GM 12 F.C.TABS.</strong></p>', `<p ${AT_THE_RIGHT}><strong>ALEMOX 1 GM 12 F.C.TABS.</strong></p>`],
        ["over two lines of one block", '<p dir="rtl">5-FU 1%<br>ALEMOX</p>', `<p ${AT_THE_RIGHT}>5-FU 1%<br>ALEMOX</p>`],
    ])("%s with dir=rtl and only Latin letters reads left to right, staying at the right @TPL-349 @smoke", (_name, html, expected) => {
        expect(cleanPrintHtml(html)).toBe(expected);
    });

    test.each([["digits", "123"], ["a percentage", "100 %"], ["punctuation", "..."]])(
        "no letter at all counts too: %s @TPL-349", (_name, content) => {
            expect(cleanPrintHtml(`<p dir="rtl">${content}</p>`)).toBe(`<p ${AT_THE_RIGHT}>${content}</p>`);
        });

    test.each([
        ["a <br>", '<p dir="rtl"><br></p>'],
        ["a space", '<p dir="rtl"> </p>'],
        ["a no-break space", '<p dir="rtl">\u00A0</p>'],
        ["Quill's cursor alone", '<p dir="rtl">\uFEFF</p>'],
        ["an invisible mark", '<p dir="rtl">\u200F</p>'],
        ["a heading", '<h2 dir="rtl"><br></h2>'],
        ["a list item", '<ol><li dir="rtl"><br></li></ol>'],
        ["with its alignment and margins", '<p dir="rtl" style="text-align:right;margin-top:0;margin-bottom:0"><br></p>'],
    ])("a blank line stays as it is: %s @TPL-349", (_name, html) => {
        expect(clean(html)).toBe(shape(html));
    });

    test.each([
        ["at its start", "\uFEFF5-FU 1%"],
        ["at its end", "5-FU 1%\uFEFF"],
        ["inside it", "5-FU\uFEFF 1%"],
    ])("U+FEFF, Quill's cursor, isn't a right-to-left letter: a Latin line holding it %s still flips, the mark kept @TPL-349", (_name, text) => {
        expect(cleanPrintHtml(`<p dir="rtl">${text}</p>`)).toBe(`<p ${AT_THE_RIGHT}>${text}</p>`);
    });

    test.each([
        ["a numbered item", "ol"],
        ["a bulleted item", "ul"],
    ])("%s that flips also gets list-style-position:inside, so its marker stays beside its text at the right @TPL-349 @smoke", (_name, list) => {
        expect(clean(`<${list}><li dir="rtl">5-FU 1%</li></${list}>`))
            .toBe(shape(`<${list}><li dir="ltr" style="text-align:right;list-style-position:inside">5-FU 1%</li></${list}>`));
    });

    test("a flipped item with its own alignment and margin keeps them, beside the marker's position @TPL-349", () => {
        expect(clean('<ol><li dir="rtl" style="text-align:center;margin-right:3em">abc</li></ol>'))
            .toBe(shape('<ol><li dir="ltr" style="text-align:center;margin-right:3em;list-style-position:inside">abc</li></ol>'));
    });

    test("through `htmlForPaste`, a right-to-left item of the editor flips the same @TPL-349", () => {
        expect(clean(htmlForPaste('<ol><li class="ql-direction-rtl ql-align-right">ALEMOX</li></ol>')))
            .toBe(shape('<ol><li dir="ltr" style="text-align:right;list-style-position:inside">ALEMOX</li></ol>'));
    });

    test.each([
        ["with both scripts", '<ol><li dir="rtl">Tobradex رج الزجاجة</li></ol>'],
        ["Arabic", '<ol><li dir="rtl">نص</li></ol>'],
        ["dir=ltr already", '<ol><li dir="ltr">abc</li></ol>'],
        ["with no dir", "<ol><li>abc</li></ol>"],
    ])("an item that doesn't flip gets no list-style-position: %s @TPL-349", (_name, html) => {
        expect(cleanPrintHtml(html)).toBe(html);
    });

    test("a paragraph or a heading that flips gets no list-style-position @TPL-349", () => {
        expect(cleanPrintHtml('<p dir="rtl">abc</p><h2 dir="rtl">abc</h2>')).not.toContain("list-style");
    });

    test.each([
        ["an item with no dir", '<ol><li style="list-style-position:inside">abc</li></ol>', "<ol><li>abc</li></ol>"],
        ["an Arabic item", '<ol><li dir="rtl" style="list-style-position:inside">نص</li></ol>', '<ol><li dir="rtl">نص</li></ol>'],
    ])("a pasted list-style-position is still dropped: only the flip writes it: %s @TPL-329", (_name, html, expected) => {
        expect(cleanPrintHtml(html)).toBe(expected);
    });

    test.each([["Cyrillic", "абв"], ["Armenian", "Ֆ"], ["Devanagari", "अ"]])("%s isn't a right-to-left script @TPL-349", (_name, content) => {
        expect(cleanPrintHtml(`<p dir="rtl">${content}</p>`)).toBe(`<p ${AT_THE_RIGHT}>${content}</p>`);
    });

    test.each(["left", "right", "center", "justify", "start", "end"])("its own text-align:%s stays, and none is added @TPL-349", align => {
        expect(cleanPrintHtml(`<p dir="rtl" style="text-align:${align}">abc</p>`)).toBe(`<p dir="ltr" style="text-align:${align}">abc</p>`);
    });

    test("with no text-align it gains one beside its margins, which stay @TPL-349", () => {
        const paragraph = onlyOne('<p dir="rtl" style="margin-top:0;margin-right:3em">abc</p>', "p");
        expect(paragraph.getAttribute("dir")).toBe("ltr");
        expect(styleOf(paragraph.getAttribute("style") ?? "")).toBe("margin-right:3em;margin-top:0;text-align:right");
    });

    test("a text-align the cleaning drops is no text-align: it gains one @TPL-349", () => {
        expect(cleanPrintHtml('<p dir="rtl" style="text-align:inherit;color:red">abc</p>')).toBe(`<p ${AT_THE_RIGHT}>abc</p>`);
    });

    test.each([
        ["the generated line, its name's own direction on it", () => linesToHtml([aLine(aDrug({name: "5-FU 1%"}), {})]), "<strong dir=\"ltr\">5-FU 1%</strong>"],
        ["the editor's line, which dropped that direction", () => '<p class="ql-direction-rtl ql-align-right"><strong>ALEMOX 1 GM 12 F.C.TABS.</strong></p>', "<strong>ALEMOX 1 GM 12 F.C.TABS.</strong>"],
    ])("through `htmlForPaste`, %s: dir=ltr, at the right, as Copy's alignment and margins have it @TPL-349", (_name, html, name) => {
        const pasted = htmlForPaste(html());
        const expected = `<p dir="ltr" style="text-align:right;margin-top:0;margin-bottom:0">${name}</p>`;
        expect(pasted).toBe(expected.replace('dir="ltr"', 'dir="rtl"'));
        expect(cleanPrintHtml(pasted)).toBe(expected);
    });

    test("through `htmlForPaste`, a right-to-left line with no alignment: it gains the right @TPL-349", () => {
        const paragraph = onlyOne(htmlForPaste('<p class="ql-direction-rtl ql-indent-1">abc</p>'), "p");
        expect(paragraph.getAttribute("dir")).toBe("ltr");
        expect(styleOf(paragraph.getAttribute("style") ?? "")).toBe("margin-bottom:0;margin-right:3em;margin-top:0;text-align:right");
    });

    test("each item of a list on its own: only the one with no right-to-left letter changes @TPL-349", () => {
        expect(clean('<ol><li dir="rtl">abc</li><li dir="rtl">نص</li></ol>'))
            .toBe(shape('<ol><li dir="ltr" style="text-align:right;list-style-position:inside">abc</li><li dir="rtl">نص</li></ol>'));
    });

    test("each line a lift leaves on its own: the Latin part changes, the Arabic part doesn't @TPL-349", () => {
        expect(cleanPrintHtml('<div dir="rtl">abc<div dir="rtl">نص</div></div>')).toBe(`<p ${AT_THE_RIGHT}>abc</p><p dir="rtl">نص</p>`);
    });

    test("cleaning it again changes nothing @TPL-349", () => {
        const cleaned = cleanPrintHtml('<p dir="rtl">5-FU 1%</p>');
        expect(cleanPrintHtml(cleaned)).toBe(cleaned);
    });

    test.each([
        ["Latin and Arabic in one run", '<p dir="rtl">أموكسيسيلين Amoxicillin 500mg</p>'],
        ["a Latin name and an Arabic sentence", '<p dir="rtl"><strong dir="ltr">5-FU 1%</strong><br>رج الزجاجة</p>'],
        ["a <li>", '<ol><li dir="rtl">Tobradex رج الزجاجة</li></ol>'],
        ["an <h2>", '<h2 dir="rtl">Tobradex رج الزجاجة</h2>'],
    ])("a line holding both scripts doesn't change, and gains no alignment: %s @TPL-349 @smoke", (_name, html) => {
        expect(cleanPrintHtml(html)).toBe(html);
    });

    test.each([
        ["Arabic", '<p dir="rtl">نص</p>'],
        ["Hebrew", '<p dir="rtl">אבג</p>'],
        ["Arabic presentation forms", '<p dir="rtl">\uFE8F</p>'],
        ["the last of them", '<p dir="rtl">\uFEFC</p>'],
        ["Arabic beside Quill's cursor", '<p dir="rtl">\uFEFFنص</p>'],
        ["the ligatures' block", '<p dir="rtl">\uFDFA</p>'],
        ["Hebrew presentation forms", '<p dir="rtl">\uFB1D</p>'],
    ])("a right-to-left line stays as it is: %s @TPL-349", (_name, html) => {
        expect(cleanPrintHtml(html)).toBe(html);
    });

    test.each([
        ["dir=ltr, Latin", '<p dir="ltr">abc</p>'],
        ["dir=ltr, Arabic", '<p dir="ltr">نص</p>'],
        ["no `dir`, Latin", "<p>abc</p>"],
        ["no `dir`, Arabic", "<p>نص</p>"],
        ["dir=auto, Latin", '<p dir="auto">abc</p>'],
        ["dir=ltr on a <li>", '<ol><li dir="ltr">abc</li></ol>'],
        ["no `dir` on a heading", "<h2>abc</h2>"],
    ])("%s is unchanged, and gains no alignment @TPL-349", (_name, html) => {
        expect(cleanPrintHtml(html)).toBe(html);
    });

    test.each([
        ["a list's own `dir`", '<ol dir="rtl"><li>abc</li></ol>'],
        ["an inline tag's `dir`", '<p dir="ltr"><strong dir="rtl">abc</strong></p>'],
    ])("the rule is for a line: %s is unchanged @TPL-349", (_name, html) => {
        expect(cleanPrintHtml(html)).toBe(html);
    });

    test("Copy isn't touched: `htmlForPaste` keeps dir=rtl on a Latin line @TPL-349", () => {
        expect(htmlForPaste('<p class="ql-direction-rtl">abc</p>')).toBe('<p dir="rtl" style="margin-top:0;margin-bottom:0">abc</p>');
    });
});

describe("a line counts at its <br>s too @area:prescription", () => {
    const THE_DRUG = '<p dir="rtl"><strong dir="ltr">ALEMOX</strong><br>قرص<br>5-FU 1%</p>';
    const THE_DRUG_CLEANED = '<p dir="rtl"><strong dir="ltr">ALEMOX</strong><br>قرص<br><span dir="ltr">5-FU 1%</span></p>';

    /** The exact result, which the parser gives back as it is and which cleans to itself. */
    const expectLines = (html: string, expected: string) => {
        const cleaned = cleanPrintHtml(html);
        expect(cleaned).toBe(expected);
        expect(bodyOf(cleaned).innerHTML).toBe(expected);
        expect(cleanPrintHtml(cleaned)).toBe(expected);
    };

    test("the block keeps dir=rtl, the name stays as it is, and only the Latin line is wrapped @TPL-349 @smoke", () => {
        expectLines(THE_DRUG, THE_DRUG_CLEANED);
    });

    test.each([
        ["bold", '<p dir="rtl"><strong>ALEMOX</strong><br>قرص</p>', '<p dir="rtl"><span dir="ltr"><strong>ALEMOX</strong></span><br>قرص</p>'],
        ["text, then bold", '<p dir="rtl">5-FU <strong>1%</strong><br>قرص</p>', '<p dir="rtl"><span dir="ltr">5-FU <strong>1%</strong></span><br>قرص</p>'],
        ["two inline tags", '<p dir="rtl">قرص<br><strong>5-FU</strong> <em>1%</em></p>', '<p dir="rtl">قرص<br><span dir="ltr"><strong>5-FU</strong> <em>1%</em></span></p>'],
        ["tags inside tags", '<p dir="rtl">قرص<br><strong><em>5-FU</em></strong></p>', '<p dir="rtl">قرص<br><span dir="ltr"><strong><em>5-FU</em></strong></span></p>'],
        ["an element with its own dir, beside more text", '<p dir="rtl"><strong dir="ltr">A</strong> 5mg<br>قرص</p>', '<p dir="rtl"><span dir="ltr"><strong dir="ltr">A</strong> 5mg</span><br>قرص</p>'],
    ])("a line of inline tags is wrapped whole: %s @TPL-349", (_name, html, expected) => {
        expectLines(html, expected);
    });

    test.each([
        ["a <strong> with dir=ltr", '<p dir="rtl"><strong dir="ltr">5-FU</strong><br>قرص</p>'],
        ["a <span> with dir=ltr", '<p dir="rtl">قرص<br><span dir="ltr">5-FU</span></p>'],
        ["an element with dir=auto", '<p dir="rtl">قرص<br><span dir="auto">5-FU</span></p>'],
    ])("a line that is one element with its own dir stays as it is: %s @TPL-349", (_name, html) => {
        expectLines(html, html);
    });

    test("each Latin line is wrapped on its own, an Arabic one between them isn't @TPL-349", () => {
        expectLines(
            '<p dir="rtl">5-FU<br>قرص<br>ALEMOX<br>GM 12</p>',
            '<p dir="rtl"><span dir="ltr">5-FU</span><br>قرص<br><span dir="ltr">ALEMOX</span><br><span dir="ltr">GM 12</span></p>',
        );
    });

    test("digits are enough: a line of them is wrapped @TPL-349", () => {
        expectLines('<p dir="rtl">قرص<br>12 - 3</p>', '<p dir="rtl">قرص<br><span dir="ltr">12 - 3</span></p>');
    });

    test("U+FEFF, Quill's cursor, doesn't make a Latin line right to left: it's wrapped, the mark kept @TPL-349", () => {
        expectLines('<p dir="rtl">قرص<br>\uFEFF5-FU</p>', '<p dir="rtl">قرص<br><span dir="ltr">\uFEFF5-FU</span></p>');
    });

    test.each([
        ["a <li>", '<ol><li dir="rtl">قرص<br>5-FU</li></ol>', '<ol><li dir="rtl">قرص<br><span dir="ltr">5-FU</span></li></ol>'],
        ["an <h2>", '<h2 dir="rtl">قرص<br>5-FU</h2>', '<h2 dir="rtl">قرص<br><span dir="ltr">5-FU</span></h2>'],
        ["a block that became a <p>", '<div dir="rtl">قرص<br>5-FU</div>', '<p dir="rtl">قرص<br><span dir="ltr">5-FU</span></p>'],
        ["a <pre>, whose line breaks became <br>s", '<pre dir="rtl">قرص\n5-FU</pre>', '<p dir="rtl">قرص<br><span dir="ltr">5-FU</span></p>'],
    ])("the same in %s @TPL-349", (_name, html, expected) => {
        expectLines(html, expected);
    });

    test("its style stays, and the block gains no alignment: it holds Arabic @TPL-349", () => {
        expectLines(
            '<p dir="rtl" style="margin-top:0">قرص<br>5-FU</p>',
            '<p dir="rtl" style="margin-top:0">قرص<br><span dir="ltr">5-FU</span></p>',
        );
    });

    test.each([
        ["both scripts on a line", '<p dir="rtl">Tobradex قرص<br>نقطة</p>'],
        ["both scripts in two tags", '<p dir="rtl"><strong>Tobradex</strong> <em>قرص</em><br>نقطة</p>'],
        ["Arabic in bold", '<p dir="rtl"><strong>قرص</strong><br>نقطة</p>'],
    ])("a line with Arabic isn't wrapped: %s @TPL-349", (_name, html) => {
        expectLines(html, html);
    });

    test("a line with Arabic stays, the Latin line beside it is wrapped @TPL-349", () => {
        expectLines('<p dir="rtl">Tobradex قرص<br>5-FU</p>', '<p dir="rtl">Tobradex قرص<br><span dir="ltr">5-FU</span></p>');
    });

    test.each([
        ["an empty line", '<p dir="rtl">قرص<br><br>نقطة</p>'],
        ["at the end", '<p dir="rtl">قرص<br></p>'],
        ["an invisible mark", '<p dir="rtl">قرص<br>\u200F<br>نقطة</p>'],
        ["Quill's cursor", '<p dir="rtl">قرص<br>\uFEFF<br>نقطة</p>'],
        ["punctuation, no letter or digit", '<p dir="rtl">قرص<br>...<br>نقطة</p>'],
    ])("a blank line, or one with no letter or digit, isn't wrapped: %s @TPL-349", (_name, html) => {
        expectLines(html, html);
    });

    test.each([
        ["one line, Latin", '<p dir="rtl">5-FU 1%</p>', '<p dir="ltr" style="text-align:right">5-FU 1%</p>'],
        ["several lines, all Latin", '<p dir="rtl">5-FU 1%<br>ALEMOX</p>', '<p dir="ltr" style="text-align:right">5-FU 1%<br>ALEMOX</p>'],
        ["several lines, a name with its own dir", '<p dir="rtl"><strong dir="ltr">5-FU</strong><br>shake</p>', '<p dir="ltr" style="text-align:right"><strong dir="ltr">5-FU</strong><br>shake</p>'],
    ])("a block with no Arabic at all flips as before, and nothing in it is wrapped: %s @TPL-349", (_name, html, expected) => {
        expectLines(html, expected);
    });

    test.each([
        ["one line with both scripts", '<p dir="rtl">Tobradex قرص</p>'],
        ["no dir", "<p>قرص<br>5-FU</p>"],
        ["dir=ltr", '<p dir="ltr">قرص<br>5-FU</p>'],
        ["dir=auto", '<p dir="auto">قرص<br>5-FU</p>'],
    ])("the rule is for a dir=rtl block of several lines: %s stays as it is @TPL-349", (_name, html) => {
        expectLines(html, html);
    });

    describe("from the generated text", () => {
        const drug = () => aLine(aDrug({name: "ALEMOX 1 GM"}), twoDropsLeft, "5-FU 1%");
        const P = 'dir="rtl" style="text-align:right;margin-top:0;margin-bottom:0"';

        test("a Latin note on a drug with an Arabic sentence is wrapped; the name and the sentence stay @TPL-349 @TPL-123 @smoke", () => {
            const pasted = htmlForPaste(linesToHtml([drug()]));
            expect(cleanPrintHtml(pasted)).toBe(`<p ${P}><strong dir="ltr">ALEMOX 1 GM</strong><br>${SENTENCE}<br><span dir="ltr">5-FU 1%</span></p>`);
        });

        test("Copy isn't touched: what it pastes wraps nothing @TPL-349", () => {
            expect(htmlForPaste(linesToHtml([drug()]))).toBe(`<p ${P}><strong dir="ltr">ALEMOX 1 GM</strong><br>${SENTENCE}<br>5-FU 1%</p>`);
        });

        test("read back as plain text, it's still what Copy puts on the clipboard @TPL-349 @TPL-123", () => {
            expect(htmlToPlainText(cleanPrintHtml(htmlForPaste(linesToHtml([drug()]))))).toBe(linesToPlainText([drug()]));
        });

        test("a drug with no Arabic at all flips whole, its note unwrapped @TPL-349", () => {
            const pasted = htmlForPaste(linesToHtml([aLine(aDrug({name: "5-FU"}), {}, "shake")]));
            expect(cleanPrintHtml(pasted)).toBe('<p dir="ltr" style="text-align:right;margin-top:0;margin-bottom:0"><strong dir="ltr">5-FU</strong><br>shake</p>');
        });
    });

    describe("through `paginate`", () => {
        /** A box of `max` characters, spaces counted. */
        const charsFit = (max: number) => (html: string) => textOf(html).length <= max;
        const sheetsOf = (max: number) => paginate(cleanPrintHtml(THE_DRUG), charsFit(max)).map(sheet => canonical(sheet, {trimBlocks: true}));

        test("on one sheet the wrapped line stays as it is @TPL-349", () => {
            expect(paginate(cleanPrintHtml(THE_DRUG), () => true)).toEqual([THE_DRUG_CLEANED]);
        });

        test("a cut at the <br> before it: the line moves to the next sheet, wrapped, in a block that keeps dir=rtl @TPL-349 @TPL-144", () => {
            expect(sheetsOf(9)).toEqual([
                '<p dir="rtl"><strong dir="ltr">ALEMOX</strong><br>قرص</p>',
                '<p dir="rtl"><span dir="ltr">5-FU 1%</span></p>',
            ]);
        });

        test("a cut inside it: both parts stay wrapped @TPL-349 @TPL-144", () => {
            expect(sheetsOf(14)).toEqual([
                '<p dir="rtl"><strong dir="ltr">ALEMOX</strong><br>قرص<br><span dir="ltr">5-FU</span></p>',
                '<p dir="rtl"><span dir="ltr">1%</span></p>',
            ]);
        });
    });
});

describe("line breaks in a <pre> @area:prescription", () => {
    test.each([
        ["an empty line between two", "<pre>a\n\nb</pre>", "<p>a<br><br>b</p>"],
        ["at the end", "<pre>a\n</pre>", "<p>a<br></p>"],
        ["inside a kept tag", "<pre><span>a\nb</span></pre>", "<p><span>a<br>b</span></p>"],
        ["inside a dropped tag", "<pre><b>a\nb</b></pre>", "<p>a<br>b</p>"],
    ])("each \\n becomes a <br>: %s @TPL-329", (_name, html, expected) => {
        expect(cleanPrintHtml(html)).toBe(expected);
    });

    test("outside a <pre> a line break stays in the text: only a <pre> shows it @TPL-329", () => {
        expect(cleanPrintHtml("<p>a\nb</p>")).toBe("<p>a\nb</p>");
        expect(cleanPrintHtml("<pre>a</pre><p>b\nc</p>")).toBe("<p>a</p><p>b\nc</p>");
    });
});

// Print's check in the editor (the screen's half is in PrintFlow.buttons.test.tsx)
describe("hasPrintableText @area:prescription", () => {
    test.each([
        ["nothing", ""],
        ["Quill's empty editor", "<p><br></p>"],
        ["an empty paragraph", "<p></p>"],
        ["spaces", "<p>   </p>"],
        ["several blank lines", "<p><br></p><p> </p><p><br></p>"],
        ["a tab and line breaks", "<p>\t\n\r</p>"],
        ["U+00A0", "<p>\u00A0</p>"],
        ["&nbsp;", "<p>&nbsp;</p>"],
        ["U+FEFF, Quill's cursor", "<p>\uFEFF</p>"],
        ["U+200B", "<p>\u200B</p>"],
        ["U+200C", "<p>\u200C</p>"],
        ["U+200D", "<p>\u200D</p>"],
        ["U+200E", "<p>\u200E</p>"],
        ["U+200F", "<p>\u200F</p>"],
        ["U+061C", "<p>\u061C</p>"],
        ["an em space", "<p>\u2003</p>"],
        ["all of them", "<p> \u00A0\uFEFF\u200B\u200C\u200D\u200E\u200F\u061C</p>"],
        ["one empty numbered item", "<ol><li><br></li></ol>"],
        ["one empty bulleted item", "<ul><li></li></ul>"],
        ["an image", '<p><img src="x"></p>'],
        ["a script", "<p><script>alert(1)</script></p>"],
        ["a style", "<style>p{color:red}</style>"],
        ["a comment", "<!-- x -->"],
        ["a template", "<template>x</template>"],
        ["an svg", "<svg><text>x</text></svg>"],
    ])("%s: nothing to print @TPL-304", (_name, html) => {
        expect(hasPrintableText(html)).toBe(false);
    });

    test.each([
        ["a letter", "<p>a</p>"],
        ["an Arabic letter", "<p>أ</p>"],
        ["a digit", "<p>1</p>"],
        ["a full stop", "<p>.</p>"],
        ["one numbered item with a letter", "<ol><li>a</li></ol>"],
        ["a letter after blank lines", "<p><br></p><p>a</p>"],
        ["a letter beside the invisible marks", "<p>\u200F\uFEFFa</p>"],
        ["bold text", "<p><strong>a</strong></p>"],
        ["text with no block", "a"],
        ["U+061B, next to U+061C", "<p>\u061B</p>"],
        ["U+061D, next to U+061C", "<p>\u061D</p>"],
        ["U+2010, next to U+200F", "<p>\u2010</p>"],
    ])("%s: something to print @TPL-304", (_name, html) => {
        expect(hasPrintableText(html)).toBe(true);
    });
});

// The pop-up's values (the screen's half is in PrintFlow.popup.test.tsx)
describe("singleLine @area:prescription", () => {
    test.each([
        ["a\nb", "a b"],
        ["a\rb", "a b"],
        ["a\r\nb", "a b"],
        ["a\n\n\nb", "a b"],
        ["a\r\n\r\nb", "a b"],
        ["a\nb\nc", "a b c"],
        ["a\n", "a "],
        ["\na", " a"],
    ])("%j: every run of line breaks becomes one space @TPL-114", (text, expected) => {
        expect(singleLine(text)).toBe(expected);
    });

    test.each(["", "a", " a  b ", "a\tb", "أحمد"])("%j: nothing else changes @TPL-114", text => {
        expect(singleLine(text)).toBe(text);
    });
});
