import {describe, expect, test} from "vitest";
import {aDrug, aLine, aProtocolDrug, ARABIC_DRUG_NAME, aSharedDrug, DIGITS_FIRST_NAME} from "../../test";
import type {Dosing} from "../dosing/types.ts";
import {htmlForPaste, htmlToPlainText, linesToHtml, linesToPlainText} from "./prescriptionText.ts";

// Formats: docs/features/prescription/tech.md "Text formats (prescriptionText.ts)".

const P = '<p class="ql-direction-rtl ql-align-right">';
const SPACER = `${P}<br></p>`;
const twoDropsLeft: Dosing = {doseAmount: 2, doseUnit: "drop", eye: "left", frequency: "daily", frequencyValue: 6, durationUnit: "weeks", durationValue: 2};
const SENTENCE = "نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين";
const oneTablet: Dosing = {doseAmount: 1, doseUnit: "tablet", frequency: "everyHours", frequencyValue: 8, durationUnit: "days", durationValue: 5};
const TABLET_SENTENCE = "قرص واحد كل 8 ساعات لمدة 5 أيام";

describe("linesToPlainText @area:prescription", () => {
    test("name, then the sentence or the description, then the note; a blank line between drugs @RX-065 @smoke", () => {
        const a = aLine(aDrug({name: "A"}), twoDropsLeft);
        const b = aLine(aDrug({name: "B", description: "سطر1\nسطر2"}), {});
        const c = aLine(aDrug({name: "C", description: "not shown"}), oneTablet, "رج الزجاجة قبل الاستعمال");
        expect(linesToPlainText([a, b, c]))
            .toBe(`A\n${SENTENCE}\n\nB\nسطر1\nسطر2\n\nC\n${TABLET_SENTENCE}\nرج الزجاجة قبل الاستعمال`);
    });

    test("a line with neither dosing nor description nor note is just the name @RX-066", () => {
        expect(linesToPlainText([aLine(aDrug({name: "Vigamox"}), {})])).toBe("Vigamox");
        expect(linesToPlainText([aLine(aDrug({name: "Vigamox", description: "   "}), {}, "  ")])).toBe("Vigamox");
        expect(linesToPlainText([])).toBe("");
    });

    test("an eye-only dosing: the description, then the eye part, then the note; «بدون عين» writes no eye @RX-103", () => {
        const drug = aDrug({name: "Name", description: "سطر1\nسطر2"});
        expect(linesToPlainText([aLine(drug, {eye: "right"}, "N")])).toBe("Name\nسطر1\nسطر2\nفي العين اليمنى\nN");
        expect(linesToPlainText([aLine(drug, {eye: "none"}, "N")])).toBe("Name\nسطر1\nسطر2\nN");
        expect(linesToHtml([aLine(drug, {eye: "right"}, "N")]))
            .toBe(`${P}<strong dir="ltr">Name</strong><br>سطر1<br>سطر2<br>في العين اليمنى<br>N</p>`);
        expect(linesToHtml([aLine(drug, {eye: "none"}, "N")])).toBe(`${P}<strong dir="ltr">Name</strong><br>سطر1<br>سطر2<br>N</p>`);
    });

    test("the note and the description are trimmed", () => {
        expect(linesToPlainText([aLine(aDrug({name: "B", description: "  desc  "}), {}, "  note  ")])).toBe("B\ndesc\nnote");
    });
});

describe("linesToHtml @area:prescription", () => {
    test("one RTL paragraph per drug, bold name, <br> between parts, empty RTL paragraphs between drugs @RX-067", () => {
        const a = aLine(aDrug({name: "A"}), twoDropsLeft, "سطر1\nسطر2");
        const b = aLine(aDrug({name: "B", description: "وصف"}), {});
        expect(linesToHtml([a, b]))
            .toBe(`${P}<strong dir="ltr">A</strong><br>${SENTENCE}<br>سطر1<br>سطر2</p>${SPACER}${P}<strong dir="ltr">B</strong><br>وصف</p>`);
        expect(linesToHtml([])).toBe("");
    });

    test("<, >, & and \" in a name, description or note are escaped @RX-068", () => {
        const html = linesToHtml([aLine(aDrug({name: `<b>"Tobra" & Dex</b>`, description: "<script>x</script>"}), {}, `a < b & "c" > d`)]);
        expect(html).toBe(`${P}<strong dir="ltr">&lt;b&gt;&quot;Tobra&quot; &amp; Dex&lt;/b&gt;</strong>`
            + `<br>&lt;script&gt;x&lt;/script&gt;<br>a &lt; b &amp; &quot;c&quot; &gt; d</p>`);
        const parsed = new DOMParser().parseFromString(html, "text/html").body;
        expect(parsed.querySelectorAll("b, script")).toHaveLength(0);
        expect(parsed.querySelector("strong")?.textContent).toBe(`<b>"Tobra" & Dex</b>`);
    });
});

describe("htmlForPaste @area:prescription", () => {
    test("Quill classes become dir and inline styles, no class remains @RX-069", () => {
        const html = htmlForPaste(
            `${P}<strong dir="ltr">A</strong></p>${SPACER}`
            + '<p class="ql-direction-rtl ql-align-right ql-indent-2">indented</p>'
            + '<p class="ql-indent-1">ltr indent</p>'
            + '<p class="ql-align-center">centered</p>'
            + '<ol><li class="ql-direction-rtl ql-align-justify">item</li></ol>'
            + '<h2 class="ql-align-right">title</h2>',
        );
        expect(html).toBe(
            '<p dir="rtl" style="text-align:right;margin-top:0;margin-bottom:0"><strong dir="ltr">A</strong></p>'
            + '<p dir="rtl" style="text-align:right;margin-top:0;margin-bottom:0"><br></p>'
            + '<p dir="rtl" style="text-align:right;margin-right:6em;margin-top:0;margin-bottom:0">indented</p>'
            + '<p style="margin-left:3em;margin-top:0;margin-bottom:0">ltr indent</p>'
            + '<p style="text-align:center;margin-top:0;margin-bottom:0">centered</p>'
            + '<ol><li dir="rtl" style="text-align:justify">item</li></ol>'
            + '<h2 style="text-align:right">title</h2>',
        );
        expect(html).not.toContain("class=");
    });

    test("the prescription's own HTML, ready for Word", () => {
        const html = htmlForPaste(linesToHtml([aLine(aDrug({name: "A"}), twoDropsLeft)]));
        expect(html).toBe(`<p dir="rtl" style="text-align:right;margin-top:0;margin-bottom:0"><strong dir="ltr">A</strong><br>${SENTENCE}</p>`);
    });
});

describe("htmlToPlainText @area:prescription", () => {
    test("lists numbered and bulleted, <br> as line breaks, normal spaces, one blank line at most, trimmed @RX-070", () => {
        const html = "<p><br></p><p><strong>A</strong><br>first\u00a0line</p><p><br></p><p><br></p><p><br></p>"
            + "<ol><li>one</li><li>two<br>more</li></ol><ul><li>dot</li><li>dot\u00a0two</li></ul><p>end </p><p><br></p>";
        expect(htmlToPlainText(html)).toBe("A\nfirst line\n\n1. one\n2. two\nmore\n• dot\n• dot two\nend");
    });

    test("the prescription's HTML reads back as its plain text", () => {
        const lines = [aLine(aDrug({name: "A"}), twoDropsLeft, "note"), aLine(aDrug({name: "B", description: "x\ny"}), {})];
        expect(htmlToPlainText(linesToHtml(lines))).toBe(linesToPlainText(lines));
    });

    test("text outside a paragraph is kept", () => {
        expect(htmlToPlainText("plain text")).toBe("plain text");
    });

    test("empty editor gives empty text", () => {
        expect(htmlToPlainText("")).toBe("");
        expect(htmlToPlainText("<p><br></p>")).toBe("");
    });
});

// Shared catalog names in the copied text (design M1.7 § 8: `"` in 13 names, `&` in 213; D3: no dosing, no description)
describe("shared drugs in the copied text @area:prescription", () => {
    test("`CARBOPLATIN \"EBEWE\" 150 MG VIAL` and `<b>X</b> & Y`: literal in the plain text, escaped in the HTML @CAT-001", () => {
        const carboplatin = aLine(aProtocolDrug(aSharedDrug({name: `CARBOPLATIN "EBEWE" 150 MG VIAL`, activeIngredients: null})), {});
        const adminMade = aLine(aProtocolDrug(aSharedDrug({name: "<b>X</b> & Y"})), {});
        expect(linesToPlainText([carboplatin, adminMade])).toBe(`CARBOPLATIN "EBEWE" 150 MG VIAL\n\n<b>X</b> & Y`);
        const html = linesToHtml([carboplatin, adminMade]);
        expect(html).toBe(`${P}<strong dir="ltr">CARBOPLATIN &quot;EBEWE&quot; 150 MG VIAL</strong></p>${SPACER}${P}<strong dir="ltr">&lt;b&gt;X&lt;/b&gt; &amp; Y</strong></p>`);
        const parsed = new DOMParser().parseFromString(html, "text/html").body;
        expect(parsed.querySelectorAll("b")).toHaveLength(0);
        expect(Array.from(parsed.querySelectorAll("strong")).map(s => s.textContent)).toEqual([`CARBOPLATIN "EBEWE" 150 MG VIAL`, "<b>X</b> & Y"]);
    });

    test("a shared drug with only an `ask` override, added for «اليمنى»: the name and «في العين اليمنى» @CAT-172", () => {
        // The line's dosing after the eye question: the override's eye, nothing from the (absent) drug default
        const line = aLine(aProtocolDrug(aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"})), {eye: "right"});
        expect(linesToPlainText([line])).toBe("VIGAMOX 0.5% EYE DROPS 5 ML\nفي العين اليمنى");
        expect(linesToHtml([line])).toBe(`${P}<strong dir="ltr">VIGAMOX 0.5% EYE DROPS 5 ML</strong><br>في العين اليمنى</p>`);
    });

    test("a shared drug with no dosing and no description: the name alone, nothing invented @CAT-172", () => {
        const line = aLine(aProtocolDrug(aSharedDrug({name: "NAILNER NAIL FUNGUS PEN 4 ML", activeIngredients: null})), {});
        expect(linesToPlainText([line])).toBe("NAILNER NAIL FUNGUS PEN 4 ML");
    });
});

describe("the copied HTML gives each drug name its own direction @area:i18n", () => {
    // Decision D27 (copied HTML): Word ignores dir="auto" and <bdi>, so the name's <strong> gets an explicit direction
    // from the name's first strong character: Latin → dir="ltr", Arabic → dir="rtl", none → "ltr"
    test("«1 2 3 (ONE TWO THREE) 20 F.C.TABS.» → <strong dir=\"ltr\">, an own drug typed in Arabic → <strong dir=\"rtl\">, a name without letters → ltr; the paragraphs stay RTL @CAT-234",
        () => {
            const latin = aLine(aSharedDrug({name: DIGITS_FIRST_NAME}), twoDropsLeft);
            const arabic = aLine(aDrug({name: ARABIC_DRUG_NAME}));
            const digits = aLine(aDrug({name: "123 (456)"}));
            const pasted = '<p dir="rtl" style="text-align:right;margin-top:0;margin-bottom:0">';
            expect(htmlForPaste(linesToHtml([latin, arabic, digits]))).toBe(
                `${pasted}<strong dir="ltr">${DIGITS_FIRST_NAME}</strong><br>${SENTENCE}</p>`
                + `${pasted}<br></p>`
                + `${pasted}<strong dir="rtl">${ARABIC_DRUG_NAME}</strong></p>`
                + `${pasted}<br></p>`
                + `${pasted}<strong dir="ltr">123 (456)</strong></p>`);
        });
});
