import {expect, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    boxForLines,
    closeEditor,
    expectOnlySheetPrinted,
    expectOnlyTemplateText,
    expectPrintCalls,
    finishPrint,
    functionItem,
    MM_PT,
    mmToPt,
    openEditor,
    openPrescription,
    pdfRun,
    pdfText,
    printButton,
    printedPdf,
    printPopup,
    printRoot,
    printSheets,
    sheetLines,
    timesPrinted,
} from "../support/print.ts";
import {A5, layoutL, manualItem, putTemplate, staticItem, textItem} from "../support/print-template.ts";
import {RX_DOSINGS, RX_TEXTS} from "../support/texts-rx.ts";
import {setLanguage} from "../support/ux.ts";

/**
 * Continuation pages: the business file's «لا يضيع أي نص من الروشتة»; contract step 2 § 2.4. Line height 1.4 (§ 6.6) makes the
 * boxes below hold an exact number of lines whatever the font: a drug's name alone is one line, a blank between drugs another.
 */

const DETAILS = "سطر1\nسطر2";
const threeLineDrug = (name: string) => ({name, description: DETAILS});
/** Three drugs of three lines in a box of five: each drug takes its own sheet. */
const threeSheetBox = () => textItem({hMm: boxForLines(5, 12), fontSizePt: 12});
const threeSheetLines = (names: string[]) => names.map(name => [name, "سطر1", "سطر2"]);

test.describe("Printing: continuation pages @area:prescription", () => {
    test("text that fits exactly makes one page; 0.1 mm less or one line more makes two @TPL-140 @smoke",
        async ({page, lang, data}) => {
            const u = unique();
            const [a, b] = [`Za${u}`, `Zb${u}`];
            const fitting = textItem({hMm: boxForLines(3, 14), fontSizePt: 14});
            // Two names and the blank between them: three lines
            const {clinic, rx, rt} = await openPrescription(page, data, lang, layoutL({items: [fitting]}), [{name: a}, {name: b}]);

            const printAndCount = async (calls: number) => {
                await printButton(rx.panel, rt).click();
                await expectPrintCalls(page, calls);
                const sheets = sheetLines(await printSheets(page));
                const {pages} = await printedPdf(page);
                expect(pages, "one PDF page per sheet").toHaveLength(sheets.length);
                return sheets;
            };

            expect(await printAndCount(1), "the three lines fit exactly").toEqual([[a, b]]);

            await putTemplate(data, clinic, layoutL({items: [{...fitting, hMm: Math.round((fitting.hMm - 0.1) * 10) / 10}]}));
            expect(await printAndCount(2), "0.1 mm less").toEqual([[a], [b]]);

            await putTemplate(data, clinic, layoutL({items: [fitting]}));
            await rx.saveNote(rx.line(1), "Znote");
            expect(await printAndCount(3), "one line more: the second drug moves whole").toEqual([[a], [b, "Znote"]]);
        });

    test("a drug that doesn't fit the rest of the box but fits a box moves whole to the next page, from the generated text and from the editor's one paragraph per line @TPL-143 @TPL-147",
        async ({page, lang, data}) => {
            const u = unique();
            const names = [`Za${u}`, `Zb${u}`, `Zc${u}`];
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [threeSheetBox()]}), names.map(threeLineDrug));

            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            expect(sheetLines(await printSheets(page)), "beside Copy").toEqual(threeSheetLines(names));
            await finishPrint(page);

            const editor = await openEditor(page, rt);
            await printButton(editor, rt).click();
            await expectPrintCalls(page, 2);
            expect(sheetLines(await printSheets(page)), "in the editor").toEqual(threeSheetLines(names));
            await finishPrint(page);
            await closeEditor(editor, rt);
        });

    test("a paragraph taller than the box splits between words and nothing is lost @TPL-144",
        async ({page, lang, data}) => {
            const u = unique();
            const name = `Zname${u}`;
            const words = Array.from({length: 150}, (_, i) => `W${String(i + 1).padStart(3, "0")}`);
            const box = textItem({hMm: 30});
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [box]}), [{name}]);
            await rx.saveNote(rx.line(0), words.join(" "));
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);

            const sheets = await printSheets(page);
            expect(sheets.length, "the note takes several sheets").toBeGreaterThan(1);
            const printed = sheets.flatMap(sheet => sheet.items.t.text.split(/\s+/).filter(Boolean));
            expect(printed, "every word whole, once, in order").toEqual([name, ...words]);
            for (const sheet of sheets) expect(sheet.items.t.contentHeightMm, "inside the box").toBeLessThanOrEqual(box.hMm + 0.1);

            const {pages} = await printedPdf(page);
            expect(pages).toHaveLength(sheets.length);
            const inPdf = pages.flatMap(sheet => pdfText(sheet).match(/W\d{3}/g) ?? []).sort();
            expect(inPdf, "every word on the PDF, once").toEqual(words);
        });

    test("a one-page prescription prints no page number; three pages print 1/3, 2/3, 3/3 @TPL-145",
        async ({page, lang, data}) => {
            const u = unique();
            const names = [`Za${u}`, `Zb${u}`, `Zc${u}`];
            const number = functionItem("pageNumber", {id: "pg", xMm: 120, yMm: 190, wMm: 20, hMm: 8});
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [threeSheetBox(), number]}), names.map(threeLineDrug));

            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            expect((await printSheets(page)).map(sheet => sheet.items.pg.text)).toEqual(["1/3", "2/3", "3/3"]);
            const three = await printedPdf(page);
            expect(three.pages.map(sheet => sheet.items.filter(item => item.text.includes("/")).map(item => item.text))).toEqual([["1/3"], ["2/3"], ["3/3"]]);

            await rx.line(2).getByRole("button", {name: rt.remove}).click();
            await rx.line(1).getByRole("button", {name: rt.remove}).click();
            await expect(rx.lines).toHaveCount(1);
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 2);
            const [only, ...rest] = await printSheets(page);
            expect(rest, "one sheet").toEqual([]);
            expect(only.items.pg.text, "nothing printed").toBe("");
            const one = await printedPdf(page);
            expect(one.pages).toHaveLength(1);
            expect(pdfText(one.pages[0]), "no page number").not.toContain("/");
        });

    test("text edited to end in many empty lines makes no sheet of its own and the page number doesn't count one; a continuation page doesn't start with a blank line @TPL-326",
        async ({page, lang, data}) => {
            const u = unique();
            const names = [`Za${u}`, `Zb${u}`, `Zc${u}`];
            const number = functionItem("pageNumber", {id: "pg", xMm: 120, yMm: 190, wMm: 20, hMm: 8});
            const box = textItem({hMm: boxForLines(3, 14), fontSizePt: 14});
            const {rt} = await openPrescription(page, data, lang, layoutL({items: [box, number]}), names.map(name => ({name})));

            const editor = await openEditor(page, rt);
            await editor.locator(".ql-editor").click();
            await page.keyboard.press("Control+End");
            for (let i = 0; i < 20; i++) await page.keyboard.press("Enter");
            await printButton(editor, rt).click();
            await expectPrintCalls(page, 1);

            const sheets = await printSheets(page);
            // A, blank, B fill the first sheet; the blank after B would top the second, and goes
            expect(sheetLines(sheets)).toEqual([[names[0], names[1]], [names[2]]]);
            expect(sheets.map(sheet => sheet.items.pg.text)).toEqual(["1/2", "2/2"]);
            const firstBlock = await printRoot(page).locator("[data-item-id=t] .print-text > :first-child").allTextContents();
            expect(firstBlock.map(text => text.trim()), "each sheet starts with text").toEqual([names[0], names[2]]);
            const {pages} = await printedPdf(page);
            expect(pages).toHaveLength(2);
            const top = (sheet: typeof pages[number], name: string) => pdfRun(sheet, name).yPt;
            expect(Math.abs(top(pages[1], names[2]) - top(pages[0], names[0])), "the second sheet's text starts on the box's first line").toBeLessThanOrEqual(1);
            await closeEditor(editor, rt);
        });

    test("a numbered list of 30 items crossing pages: the numbers continue, each item once; the same pages whether or not the editor and its CSS were opened before @TPL-327",
        async ({page, lang, data}) => {
            test.slow();
            const u = unique();
            const names = [`Za${u}`, `Zb${u}`, `Zc${u}`];
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [threeSheetBox()]}), names.map(threeLineDrug));

            // Before the editor's lazy chunk and its CSS load, and after
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            const before = sheetLines(await printSheets(page));
            await finishPrint(page);
            const editor = await openEditor(page, rt);
            await closeEditor(editor, rt);
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 2);
            expect(sheetLines(await printSheets(page)), "the same sheets after the editor was opened").toEqual(before);
            await finishPrint(page);

            // The list
            const items = Array.from({length: 30}, (_, i) => `Item${String(i + 1).padStart(2, "0")}`);
            await openEditor(page, rt);
            const quill = editor.locator(".ql-editor");
            await quill.click();
            await page.keyboard.press("Control+a");
            await page.keyboard.press("Delete");
            await editor.locator(".ql-toolbar button.ql-list[value=ordered]").click();
            for (const [index, item] of items.entries()) {
                if (index) await page.keyboard.press("Enter");
                await page.keyboard.type(item);
            }
            await printButton(editor, rt).click();
            await expectPrintCalls(page, 3);

            const sheets = await printSheets(page);
            expect(sheets.length, "the list crosses pages").toBeGreaterThan(1);
            const numbered = await printRoot(page).locator("ol").evaluateAll(lists => lists.flatMap(list => {
                const start = Number((list as HTMLOListElement).getAttribute("start") ?? 1);
                return [...list.querySelectorAll("li")].map((li, index) => ({number: start + index, text: (li.textContent ?? "").trim()}));
            }));
            expect(numbered, "each item once, its number continuing").toEqual(items.map((text, index) => ({number: index + 1, text})));

            const {pages} = await printedPdf(page);
            expect(pages).toHaveLength(sheets.length);
            for (const item of items) expect(timesPrinted(pages, item), `${item} on the PDF`).toBe(1);
            // The markers as printed
            const markers = pages.flatMap(sheet => pdfText(sheet).replace(/Item\d\d/g, " ").match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b);
            expect(markers, "the numbers on the PDF").toEqual(items.map((_, index) => index + 1));
            await closeEditor(editor, rt);
        });

    test("a 20 mm box at 36 pt and 40 drugs: the print ends in time with three-digit page numbers, each page has all items, each drug once, each line whole inside the box @TPL-335 @TPL-336",
        async ({page, lang, data, isMobile}) => {
            test.skip(isMobile || lang !== "ar", "the one project: the same layout in every language (TPL-337)");
            test.slow();
            const u = unique();
            const names = Array.from({length: 40}, (_, i) => `Zd${String(i + 1).padStart(2, "0")}${u}`);
            const box = textItem({yMm: 80, wMm: 120, hMm: 20, fontSizePt: 36});
            const number = functionItem("pageNumber", {id: "pg", xMm: 120, yMm: 190, wMm: 25, hMm: 8});
            const fixed = staticItem({id: "s", text: `Zstatic${u}`, xMm: 14, yMm: 175, wMm: 60, hMm: 8});
            const layout = {schemaVersion: 1 as const, page: A5, items: [box, number, fixed]};
            const {rx, rt} = await openPrescription(page, data, lang, layout,
                names.map(name => ({name, dosing: RX_DOSINGS.ointmentBothBedtimeNextVisit.dosing})));

            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1, 120_000);

            const sheets = await printSheets(page);
            expect(sheets.length, "at least three lines a drug, one line a sheet").toBeGreaterThanOrEqual(100);
            const total = sheets.length;
            for (const [index, sheet] of sheets.entries()) {
                expect(sheet.items.pg.text).toBe(`${index + 1}/${total}`);
                expect(sheet.items.s.text).toBe(fixed.text);
                expect(sheet.items.t.contentHeightMm, `sheet ${index + 1}: inside the box`).toBeLessThanOrEqual(box.hMm + 0.1);
                expect(sheet.items.t.text.trim(), `sheet ${index + 1}: holds text`).not.toBe("");
            }
            const printed = sheets.flatMap(sheet => sheet.items.t.text.split(/\s+/)).filter(word => word.startsWith("Zd"));
            expect(printed, "every drug once, in order").toEqual(names);

            const {pages} = await printedPdf(page);
            expect(pages).toHaveLength(total);
            for (const name of names) expect(timesPrinted(pages, name), name).toBe(1);
            for (const [index, sheet] of pages.entries()) {
                expect(timesPrinted([sheet], `${index + 1}/${total}`), `page ${index + 1}'s number`).toBe(1);
                expect(timesPrinted([sheet], fixed.text ?? ""), `page ${index + 1}'s static text`).toBe(1);
                // The line's baseline and what hangs below it stay inside the box (a descent is under 0.5 em)
                for (const run of sheet.items.filter(item => item.sizePt > 30)) {
                    expect(run.yPt, `page ${index + 1}: «${run.text}» below the box's top`).toBeGreaterThan(mmToPt(box.yMm));
                    expect(run.yPt + 0.5 * 36, `page ${index + 1}: «${run.text}» above the box's bottom`).toBeLessThanOrEqual(mmToPt(box.yMm + box.hMm) + MM_PT);
                }
            }
        });

    test("the same long text gives the same pages and the same text on each page in the Arabic and the English UI @TPL-337",
        async ({page, lang, data, isMobile}) => {
            test.skip(isMobile || lang !== "ar", "one project: both languages inside the test");
            test.slow();
            const u = unique();
            const names = Array.from({length: 12}, (_, i) => `Zd${String(i + 1).padStart(2, "0")}${u}`);
            const box = textItem({hMm: 40});
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [box]}),
                names.map(name => ({name, dosing: RX_DOSINGS.twoDropsLeft6Daily2Weeks.dosing})));
            await rx.saveNote(rx.line(0), Array.from({length: 60}, (_, i) => `Word${i}`).join(" "));

            const print = async (button: ReturnType<typeof printButton>) => {
                await button.click();
                await expectPrintCalls(page, 1);
                const sheets = sheetLines(await printSheets(page));
                const {pages} = await printedPdf(page);
                expect(pages, "one PDF page per sheet").toHaveLength(sheets.length);
                return sheets;
            };

            const arabic = await print(printButton(rx.panel, rt));
            expect(arabic.length, "several sheets").toBeGreaterThan(1);
            await setLanguage(page, "en");
            const english = await print(page.getByRole("button", {name: RX_TEXTS.en.print, exact: true}));
            expect(english, "the same pages, the same text").toEqual(arabic);
        });

    test("a 256-character unbroken drug name wraps inside the prescription box, appears once and stays inside the box's width, also in a 20 mm box at 36 pt @TPL-340",
        async ({page, lang, data}) => {
            test.slow();
            const start = `Z${unique()}`;
            const name = start + "A".repeat(256 - start.length);
            const box = textItem();
            const {clinic, rx, rt} = await openPrescription(page, data, lang, layoutL({items: [box]}), [{name}]);
            const inOneString = (text: string[]) => text.join("").replace(/\s+/g, "");
            const once = (text: string) => text.split(name).length - 1;
            const expectInsideWidth = (sheet: {items: {xPt: number; widthPt: number}[]}, x: number, w: number) => {
                for (const run of sheet.items) {
                    expect(run.xPt, "inside the box's width").toBeGreaterThanOrEqual(mmToPt(x - 1));
                    expect(run.xPt + run.widthPt, "inside the box's width").toBeLessThanOrEqual(mmToPt(x + w + 1));
                }
            };

            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            const sheets = await printSheets(page);
            expect(sheets, "one sheet: it fits a 90 mm box").toHaveLength(1);
            expect(once(inOneString([sheets[0].items.t.text])), "once on the sheet").toBe(1);
            const first = await printedPdf(page);
            expect(once(inOneString(first.pages.map(pdfText))), "once on the PDF").toBe(1);
            expectInsideWidth(first.pages[0], box.xMm, box.wMm);

            // Taller than the box, between characters: nothing lost
            const small = textItem({hMm: 20, fontSizePt: 36});
            await putTemplate(data, clinic, layoutL({items: [small]}));
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 2);
            const cut = await printSheets(page);
            expect(cut.length, "several sheets").toBeGreaterThan(1);
            expect(inOneString(cut.map(sheet => sheet.items.t.text)), "the whole name, once").toBe(name);
            const second = await printedPdf(page);
            expect(second.pages).toHaveLength(cut.length);
            expect(inOneString(second.pages.map(pdfText)), "the whole name on the PDF, once").toBe(name);
            for (const sheet of second.pages) expectInsideWidth(sheet, small.xMm, small.wMm);
        });

    test("Print in the editor through the pop-up with a three-page text: the PDF has three pages holding only the sheet, no dialog, backdrop, toast or tooltip @TPL-325 @smoke",
        async ({page, context, lang, data}) => {
            await context.grantPermissions(["clipboard-read", "clipboard-write"]);
            const u = unique();
            const names = Array.from({length: 6}, (_, i) => `Zd${i + 1}${u}`);
            const patient = `Zpatient${u}`;
            const manual = manualItem();
            const box = textItem({hMm: boxForLines(3, 14), fontSizePt: 14});
            const number = functionItem("pageNumber", {id: "pg", xMm: 120, yMm: 190, wMm: 20, hMm: 8});
            const layout = layoutL({items: [box, manual, number]});
            const {rx, rt} = await openPrescription(page, data, lang, layout, names.map(name => ({name})));
            await expect(rx.lines).toHaveCount(6);

            const editor = await openEditor(page, rt);
            // A toast on screen, and the mouse left on Print: its tooltip
            await editor.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await printButton(editor, rt).click();
            const popup = printPopup(page, rt);
            await popup.getByRole("textbox", {name: manual.name, exact: true}).fill(patient);
            await printButton(popup, rt).click();
            await expect(popup).toBeHidden();
            await expectPrintCalls(page, 1);
            await printButton(editor, rt).hover();

            const sheets = await printSheets(page);
            expect(sheetLines(sheets)).toEqual([[names[0], names[1]], [names[2], names[3]], [names[4], names[5]]]);
            await expectOnlySheetPrinted(page);

            const {pages} = await printedPdf(page);
            expect(pages).toHaveLength(3);
            for (const [index, sheet] of pages.entries()) {
                expectOnlyTemplateText(sheet, layout, `page ${index + 1}`);
                expect(timesPrinted([sheet], patient), `the value on page ${index + 1}`).toBe(1);
                expect(timesPrinted([sheet], `${index + 1}/3`), `the number on page ${index + 1}`).toBe(1);
            }
            await expect(editor, "the editor stays").toBeVisible();
            await closeEditor(editor, rt);
        });
});
