import {describe, expect, test, vi} from "vitest";
import {aDrug, aLine, aSharedDrug} from "../../test";
import {bodyOf, canonical, styleOf, textOf} from "../../test/htmlShape.ts";
import type {Dosing} from "../dosing/types.ts";
import {htmlForPaste, htmlToPlainText, linesToHtml, linesToPlainText} from "../prescription/prescriptionText.ts";
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
        ["direction", '<p class="ql-direction-rtl">x</p>'],
        ["centered", '<p class="ql-align-center">x</p>'],
        ["aligned right", '<p class="ql-align-right">x</p>'],
        ["justified", '<p class="ql-align-justify">x</p>'],
        ["indented", '<p class="ql-indent-2">x</p>'],
        ["indented, right to left", '<p class="ql-direction-rtl ql-indent-1">x</p>'],
        ["indented twice, right to left: 6em, the deepest that stays as it is", '<p class="ql-direction-rtl ql-indent-2">x</p>'],
        ["a list item's format", '<ol><li class="ql-direction-rtl ql-align-center ql-indent-1">x</li></ol>'],
        ["a heading", "<h2>x</h2>"],
        ["a name with its own direction", '<p><strong dir="ltr">Tobradex</strong><br>x</p>'],
        ["a span with its direction", '<p><span dir="rtl">x</span></p>'],
        ["all of them nested", "<p><strong><em><u>x</u></em></strong></p>"],
    ])("%s: the result equals `htmlForPaste` @TPL-328", (_name, quillHtml) => {
        const pasted = htmlForPaste(quillHtml);
        expect(clean(pasted)).toBe(shape(pasted));
    });

    test("alignment, direction and indent reach the print as `htmlForPaste` wrote them @TPL-328", () => {
        const pasted = htmlForPaste('<p class="ql-direction-rtl ql-align-center ql-indent-2">x</p>');
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
        const right = onlyOne(htmlForPaste('<p class="ql-direction-rtl ql-indent-8">x</p>'), "p");
        expect(styleOf(right.getAttribute("style") ?? "")).toBe("margin-bottom:0;margin-right:min(24em, 50%);margin-top:0");
    });

    test("an empty style leaves no attribute @TPL-329", () => {
        expect(cleanPrintHtml('<p style="">x</p>')).not.toContain("style");
        expect(cleanPrintHtml('<p style="color:red">x</p>')).not.toContain("style");
    });

    test.each(["ltr", "rtl", "auto"])("dir=%s stays, on any allowed tag @TPL-329", dir => {
        expect(clean(`<p dir="${dir}"><strong dir="${dir}">x</strong></p>`)).toBe(`<p dir="${dir}"><strong dir="${dir}">x</strong></p>`);
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
        const paragraph = onlyOne(`<${tag} dir="rtl" style="text-align:center;color:red">x</${tag}>`, "p");
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
            '<div dir="rtl" style="text-align:center">a<div dir="ltr">b</div>c</div>',
            '<p dir="rtl" style="text-align:center">a</p><p dir="ltr">b</p><p dir="rtl" style="text-align:center">c</p>',
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
        const pasted = htmlForPaste('<ol><li class="ql-direction-rtl">a<ul><li class="ql-align-center">b</li></ul></li></ol>');
        expectCleaned(pasted, '<ol><li dir="rtl">a<ul><li style="text-align:center">b</li></ul></li></ol>');
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
