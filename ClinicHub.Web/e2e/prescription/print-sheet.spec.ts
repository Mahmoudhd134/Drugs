import {expect, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    baselineOffsetPt,
    boxForLines,
    characterLefts,
    closeEditor,
    expectOnlySheetPrinted,
    expectPageSize,
    expectPrintCalls,
    expectRunAt,
    expectRunEndsAtRight,
    expectRunOnFirstLine,
    finishPrint,
    functionItem,
    itemLineEdges,
    linesOf,
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
    sheetItem,
    timesPrinted,
} from "../support/print.ts";
import {A4, A5, expectClose, type Layout, type LayoutItem, layoutL, manualItem, putTemplate, staticItem, textItem} from "../support/print-template.ts";
import {markClipboard, putHtmlOnClipboard, readClipboard} from "../support/rx.ts";
import {RX_DOSINGS} from "../support/texts-rx.ts";
import {expectToast} from "../support/ui.ts";

/** What one printed sheet holds and where: design § 4; contract step 2 § 3.4; the business file's rules. */

const layoutOf = (page: Layout["page"], items: LayoutItem[]): Layout => ({schemaVersion: 1, page, items});
const FROZEN = () => new Date(2026, 10, 5, 14, 30);

test.describe("Printing: the sheet @area:prescription", () => {
    test("A4, a custom page, 420 x 600 mm and a landscape 210 x 148 mm: the PDF page is that size and orientation with no margin, items in place, the template read at each click @TPL-120 @TPL-333",
        async ({page, lang, data, isMobile}) => {
            test.skip(isMobile, "at 375 px: TPL-346");
            test.slow();
            const corner = staticItem({id: "corner", text: "ZcornerA", xMm: 0, yMm: 0, wMm: 30, hMm: 8});
            const text = textItem({xMm: 14, yMm: 20, wMm: 30, hMm: 25});
            const far = (w: number, h: number) => staticItem({id: "far", text: "ZfarB", xMm: w - 40, yMm: h - 12, wMm: 40, hMm: 8});
            const pageOf = (widthMm: number, heightMm: number) => ({size: "custom", widthMm, heightMm});
            const {clinic, rx, rt} = await openPrescription(page, data, lang, layoutL({page: A4}), [{name: `Zdrug${unique()}`}]);

            let calls = 0;
            for (const sheet of [A4, pageOf(100, 150), pageOf(420, 600), pageOf(210, 148)]) {
                await test.step(`${sheet.widthMm} x ${sheet.heightMm} mm`, async () => {
                    const edge = far(sheet.widthMm, sheet.heightMm);
                    await putTemplate(data, clinic, layoutOf(sheet, [text, corner, edge]));
                    await printButton(rx.panel, rt).click();
                    await expectPrintCalls(page, ++calls);
                    await expect(printRoot(page)).toBeAttached();
                    const baseline = await baselineOffsetPt(page, 10);
                    const {pages} = await printedPdf(page);
                    expect(pages).toHaveLength(1);
                    expectPageSize(pages[0], sheet.widthMm, sheet.heightMm);
                    expect(pages[0].widthPt > pages[0].heightPt, "the orientation").toBe(sheet.widthMm > sheet.heightMm);
                    // No margin: an item at 0, 0 prints at the page's corner
                    expectRunAt(pdfRun(pages[0], "ZcornerA"), corner, baseline, "the corner");
                    expectRunAt(pdfRun(pages[0], "ZfarB"), edge, baseline, "the far item");
                });
            }
        });

    test("under print media only the sheet shows, no app bar, sidebar, buttons, dialog or toast; after printing the app is back and the print root is gone @TPL-122 @smoke",
        async ({page, lang, data, t, healthy}) => {
            const {rx, rt} = await openPrescription(page, data, lang, layoutL(), [{name: `Zdrug${unique()}`}]);
            await printButton(rx.panel, rt).click();
            const popup = printPopup(page, rt);
            await printButton(popup, rt).click();
            await expectPrintCalls(page, 1);

            await expectOnlySheetPrinted(page);
            await expect(printRoot(page), "nothing of it on screen").toBeHidden();

            await finishPrint(page);
            await expect(printRoot(page)).toHaveCount(0);
            await expect(page.getByRole("banner"), "the app bar").toBeVisible();
            await expect(printButton(rx.panel, rt)).toBeEnabled();
            await expect(page.locator("html")).toHaveAttribute("dir", t.dir);
            await healthy();
        });

    test("Print beside Copy prints the Copy text: names bold, dosing sentences, notes, in the prescription's order @TPL-123",
        async ({page, context, lang, data}) => {
            await context.grantPermissions(["clipboard-read", "clipboard-write"]);
            const u = unique();
            const a = `Zalpha${u}`, b = `Zbeta${u}`;
            const note = "رج الزجاجة قبل الاستعمال";
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem()]}), [
                {name: a, dosing: RX_DOSINGS.twoDropsLeft6Daily2Weeks.dosing},
                {name: b, dosing: RX_DOSINGS.tabletEvery8Hours5Days.dosing},
            ]);
            await rx.saveNote(rx.line(1), note);
            await markClipboard(page);
            await rx.panel.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await expectToast(page, rt.copied);
            const {text: copied} = await readClipboard(page);

            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            const [sheet] = await printSheets(page);
            expect(linesOf(sheet.items.t.text)).toEqual(linesOf(copied ?? ""));
            expect(linesOf(sheet.items.t.text)).toEqual([a, RX_DOSINGS.twoDropsLeft6Daily2Weeks.sentence, b, RX_DOSINGS.tabletEvery8Hours5Days.sentence, note]);
            await expect(sheetItem(page, 0, "t").locator("strong")).toHaveText([a, b]);
            const {pages} = await printedPdf(page);
            expect(pdfRun(pages[0], a).yPt, "A above B").toBeLessThan(pdfRun(pages[0], b).yPt);
        });

    test("Print in the editor prints the changed word, the bold and the list; the lines themselves are unchanged @TPL-124 @smoke",
        async ({page, lang, data}) => {
            const u = unique();
            const name = `Zname${u}`;
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem()]}), [{name, description: "Zoldword"}]);
            const lines = await rx.lineTexts();

            const editor = await openEditor(page, rt);
            const quill = editor.locator(".ql-editor");
            await quill.click();
            await page.keyboard.press("Control+End");
            for (let i = 0; i < "oldword".length; i++) await page.keyboard.press("Backspace");
            await page.keyboard.type("newword");
            await page.keyboard.press("Enter");
            await editor.locator(".ql-toolbar button.ql-list[value=ordered]").click();
            await editor.locator(".ql-toolbar button.ql-bold").click();
            await page.keyboard.type("Zfirst");
            await page.keyboard.press("Enter");
            await page.keyboard.type("Zsecond");

            await printButton(editor, rt).click();
            await expectPrintCalls(page, 1);
            const [sheet] = await printSheets(page);
            expect(linesOf(sheet.items.t.text)).toEqual(expect.arrayContaining([name, "Znewword"]));
            expect(sheet.items.t.text).not.toContain("Zoldword");
            const box = sheetItem(page, 0, "t");
            await expect(box.locator("ol li")).toHaveText(["Zfirst", "Zsecond"]);
            await expect(box.locator("ol li strong")).toHaveText(["Zfirst", "Zsecond"]);
            await expect(box.locator("strong").first()).toHaveText(name);

            const {pages} = await printedPdf(page);
            expect(timesPrinted(pages, "Znewword")).toBe(1);
            expect(timesPrinted(pages, "Zoldword")).toBe(0);
            await closeEditor(editor, rt);
            await rx.expectLines(lines);
        });

    test("a mixed line «أموكسيسيلين Amoxicillin 500mg مرتين يوميًا (2×) لمدة 7 أيام»: letters joined, the order right in the print layout @TPL-126",
        async ({page, lang, data}) => {
            const mixed = "أموكسيسيلين Amoxicillin 500mg مرتين يوميًا (2×) لمدة 7 أيام";
            const name = `Zname${unique()}`;
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem()]}), [{name, description: mixed}]);
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);

            const [sheet] = await printSheets(page);
            expect(linesOf(sheet.items.t.text)).toEqual([name, mixed]);
            const spacing = await sheetItem(page, 0, "t").locator(".print-text").evaluate(element => getComputedStyle(element).letterSpacing);
            expect(spacing, "letter spacing would break the joins").toBe("normal");

            const {pages} = await printedPdf(page);
            const latin = pdfRun(pages[0], "Amoxicillin 500mg");
            const line = pages[0].items.filter(item => Math.abs(item.yPt - latin.yPt) < 1);
            const at = (text: string) => {
                const found = line.find(item => item.text.includes(text));
                expect(found, `«${text}» on the line: ${pdfText(pages[0])}`).toBeDefined();
                return found!.xPt;
            };
            // Right to left on the paper: the Latin part in the middle, then (2×), then 7
            expect(at("7"), "7 left of (2×)").toBeLessThan(at("×"));
            expect(at("×"), "× left of 2, read from the right: 2×").toBeLessThan(at("2"));
            expect(at("2"), "(2×) left of the Latin part").toBeLessThan(latin.xPt);
            const arabic = line.filter(item => /\p{Script=Arabic}/u.test(item.text));
            expect(arabic.some(item => item.xPt > latin.xPt + latin.widthPt), "Arabic right of the Latin part").toBe(true);
            expect(arabic.some(item => item.xPt < latin.xPt), "Arabic left of the Latin part").toBe(true);
            // Joined letters are set in their initial and medial forms; a broken join would give only isolated ones
            const joinedForms = new Set(["ﻣ", "ﻤ", "ﺳ", "ﺴ", "ﻳ", "ﻴ", "ﻟ", "ﻠ", "ﻛ", "ﻜ"]);
            expect(arabic.flatMap(item => [...item.text]).filter(letter => joinedForms.has(letter)).length, `joined letters on: ${pdfText(pages[0])}`).toBeGreaterThan(5);
        });

    test("static text with line breaks prints each on its own line; each item prints at its own font size @TPL-128 @TPL-129",
        async ({page, lang, data}) => {
            const u = unique();
            const [one, two, three] = [`Zone${u}`, `Ztwo${u}`, `Zthree${u}`];
            const big = staticItem({id: "big", text: `${one}\n${two}\n${three}`, xMm: 14, yMm: 20, wMm: 100, hMm: 40, fontSizePt: 24});
            const small = staticItem({id: "small", text: `Zsmall${u}`, xMm: 14, yMm: 175, wMm: 60, hMm: 8, fontSizePt: 8});
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem(), big, small]}), [{name: `Zname${u}`}]);
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);

            const [sheet] = await printSheets(page);
            expect(sheet.items.big.text.split("\n")).toEqual([one, two, three]);
            expect(Math.abs(sheet.items.big.fontSizePt - 24), "24 pt").toBeLessThanOrEqual(0.1);
            expect(Math.abs(sheet.items.small.fontSizePt - 8), "8 pt").toBeLessThanOrEqual(0.1);
            expect(Math.abs(sheet.items.t.fontSizePt - 11), "11 pt").toBeLessThanOrEqual(0.1);

            const {pages} = await printedPdf(page);
            const runs = [one, two, three].map(token => pdfRun(pages[0], token));
            const line = 24 * 1.4;
            for (const [i, run] of runs.entries()) {
                expect(Math.abs(run.xPt - mmToPt(big.xMm)), "each line starts at the box's left").toBeLessThanOrEqual(MM_PT);
                expect(Math.abs(run.sizePt - 24), `${run.text} at 24 pt`).toBeLessThanOrEqual(0.5);
                if (i) expect(Math.abs(run.yPt - runs[i - 1].yPt - line), `${run.text} one line below`).toBeLessThanOrEqual(1);
            }
            expect(Math.abs(pdfRun(pages[0], `Zsmall${u}`).sizePt - 8), "8 pt").toBeLessThanOrEqual(0.5);
        });

    test("a value longer than its box wraps and shows past it, cut only at the sheet's edge; at the sheet's bottom it makes no extra page @TPL-131 @TPL-339",
        async ({page, lang, data}) => {
            const u = unique();
            const words = Array.from({length: 22}, (_, i) => `Zw${String(i + 1).padStart(2, "0")}${"x".repeat(4)}`);
            const value = words.join(" ");
            const narrow = manualItem({id: "narrow", name: "الطويل", xMm: 20, yMm: 20, wMm: 30, hMm: 6});
            const bottom = manualItem({id: "bottom", name: "الأخير", xMm: 10, yMm: 200, wMm: 40, hMm: 8, fontSizePt: 36});
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem(), narrow, bottom]}), [{name: `Zname${u}`}]);
            const popup = printPopup(page, rt);

            // With a short value: one page
            await printButton(rx.panel, rt).click();
            await popup.getByRole("textbox", {name: bottom.name, exact: true}).fill("Zshort");
            await printButton(popup, rt).click();
            await expectPrintCalls(page, 1);
            expect((await printedPdf(page)).pages, "with a short value").toHaveLength(1);

            await printButton(rx.panel, rt).click();
            await popup.getByRole("textbox", {name: narrow.name, exact: true}).fill(value);
            await popup.getByRole("textbox", {name: bottom.name, exact: true}).fill(value);
            await printButton(popup, rt).click();
            await expectPrintCalls(page, 2);

            const sheets = await printSheets(page);
            expect(sheets, "one sheet").toHaveLength(1);
            const shown = sheets[0].items.narrow;
            expect(shown.contentHeightMm, "the value shows past its box").toBeGreaterThan(narrow.hMm + 1);
            expect(shown.hMm, "the box keeps its size").toBeLessThanOrEqual(narrow.hMm + 0.1);
            expect(sheets[0].overflow, "the sheet's edge cuts").toBe("hidden");
            const overflow = await sheetItem(page, 0, "narrow").evaluate(element => getComputedStyle(element).overflow);
            expect(overflow, "the box doesn't").toBe("visible");

            const {pages} = await printedPdf(page);
            expect(pages, "the long value at the bottom makes no page").toHaveLength(1);
            const lastWord = pages[0].items.filter(item => item.text.includes(words[21]) && item.sizePt < 20);
            expect(lastWord, "the value's end, printed").toHaveLength(1);
            expect(lastWord[0].yPt, "past the box's bottom").toBeGreaterThan(mmToPt(narrow.yMm + narrow.hMm));
            expect(lastWord[0].xPt, "inside the box's width").toBeGreaterThanOrEqual(mmToPt(narrow.xMm - 1));
            expect(lastWord[0].xPt + lastWord[0].widthPt, "inside the box's width").toBeLessThanOrEqual(mmToPt(narrow.xMm + narrow.wMm + 1));
        });

    test("HTML in a drug name, a note or the editor prints as text or is removed, and nothing runs @TPL-133 @smoke",
        async ({page, context, lang, data}) => {
            await context.grantPermissions(["clipboard-read", "clipboard-write"]);
            const u = unique();
            const name = `<b>Zname${u}</b>`;
            const note = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>Znote${u}`;
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem()]}), [{name}]);
            await rx.saveNote(rx.line(0), note);
            const root = printRoot(page);

            // Beside Copy: printed literally
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            const [sheet] = await printSheets(page);
            expect(linesOf(sheet.items.t.text)).toEqual([name, note]);
            for (const tag of ["img", "script", "b"]) await expect(root.locator(tag), `no <${tag}> element`).toHaveCount(0);
            await finishPrint(page);

            // In the editor: HTML pasted into it is cleaned
            const editor = await openEditor(page, rt);
            const quill = editor.locator(".ql-editor");
            const gif = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
            await putHtmlOnClipboard(page, `<p><img src="${gif}" onload="window.__pwned=3"><a href="javascript:window.__pwned=4">Zpasted${u}</a></p><script>window.__pwned=5</script>`);
            await quill.click();
            await page.keyboard.press("Control+End");
            // A real paste, the only one Quill 1 takes: it reads what the browser pastes, never the event's data. Chromium has
            // taken out the script, the handlers and the link's address by then; printHtml.test.ts proves those on their own
            await page.keyboard.press("Control+V");
            await expect(quill).toContainText(`Zpasted${u}`);
            await expect(quill.locator("img"), "the image is in the editor's HTML, for the print to remove").toHaveCount(1);
            await printButton(editor, rt).click();
            await expectPrintCalls(page, 2);
            await expect(root).toContainText(`Zpasted${u}`);
            for (const tag of ["img", "script", "a", "b"]) await expect(root.locator(tag), `no <${tag}> element`).toHaveCount(0);
            const attributes = await root.locator("[onerror], [onload], [onclick], [href], [src]").count();
            expect(attributes, "no handler or link attribute").toBe(0);
            expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned), "nothing ran").toBeUndefined();
            await finishPrint(page);
            await closeEditor(editor, rt);
        });

    test("drugs named 5-FU 1% and ALEMOX 1 GM 12 F.C.TABS., printed beside Copy and from the editor with no edit: the PDF reads them in that order, each ending at the box's right; a line of both scripts reads as before @TPL-349 @smoke",
        async ({page, lang, data}) => {
            const fu = "5-FU 1%";
            const alemox = "ALEMOX 1 GM 12 F.C.TABS.";
            const latin = `Zmix${unique()}`;
            const box = textItem();
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [box]}), [{name: fu}, {name: alemox}, {name: `قطرة ${latin}`}]);

            const expectPrintedText = async (where: string) => {
                const {pages} = await printedPdf(page);
                expect(pages, where).toHaveLength(1);
                const [sheet] = pages;
                expect(pdfText(sheet).split("\n").slice(0, 2), `${where}: the names read in order, on their own lines`).toEqual([fu, alemox]);
                for (const name of [fu, alemox]) expectRunEndsAtRight(pdfRun(sheet, name), box, `${where}: ${name}`);

                // The line of both scripts stays right to left: it starts with the Arabic word at the right edge, the Latin one on its left
                const word = pdfRun(sheet, latin);
                const arabic = sheet.items.filter(item => item !== word && Math.abs(item.yPt - word.yPt) < 1);
                expect(arabic.length, `${where}: the Arabic word on the Latin one's line`).toBeGreaterThan(0);
                for (const item of arabic) expect(item.xPt, `${where}: the Arabic word is right of the Latin one`).toBeGreaterThanOrEqual(word.xPt + word.widthPt - MM_PT);
                expectRunEndsAtRight(arabic.reduce((a, b) => (a.xPt > b.xPt ? a : b)), box, `${where}: the line of both scripts`);
            };

            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            await expectPrintedText("beside Copy");
            await finishPrint(page);

            const editor = await openEditor(page, rt);
            await printButton(editor, rt).click();
            await expectPrintCalls(page, 2);
            await expectPrintedText("from the editor");
            await finishPrint(page);
            await closeEditor(editor, rt);
        });

    test("a static text of Dr. Ahmed, دكتور أحمد and Consultant on three lines: under print media each line starts from its own language's side, the English at the box's left and the Arabic ending at its right @TPL-350",
        async ({page, lang, data}) => {
            const lines = ["Dr. Ahmed", "دكتور أحمد", "Consultant"];
            const fixed = staticItem({text: lines.join("\n"), xMm: 14, yMm: 20, wMm: 100, hMm: 24, fontSizePt: 11});
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem(), fixed]}), [{name: `Zname${unique()}`}]);
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);

            const edges = await itemLineEdges(sheetItem(page, 0, fixed.id));
            expect(edges.map(edge => edge.text)).toEqual(lines);
            const [doctor, arabic, consultant] = edges;
            for (const line of [doctor, consultant]) {
                expect(Math.abs(line.leftMm), `«${line.text}» starts ${line.leftMm} mm from the box's left`).toBeLessThanOrEqual(0.1);
            }
            expect(Math.abs(arabic.rightMm - fixed.wMm), `«${arabic.text}» ends at ${arabic.rightMm} mm of a ${fixed.wMm} mm box`).toBeLessThanOrEqual(0.1);
        });

    test("in the print layout 2026-11-05T14:30 and 2/3 read left to right inside the sheet, whatever the UI language @TPL-318",
        async ({page, lang, data}) => {
            await page.clock.setFixedTime(FROZEN());
            const u = unique();
            const iso = functionItem("isoDateTime", {id: "iso", xMm: 90, yMm: 20, wMm: 50, hMm: 8});
            const number = functionItem("pageNumber", {id: "pg", xMm: 120, yMm: 190, wMm: 20, hMm: 8});
            // Five lines at 12 pt: three drugs of three lines take a sheet each
            const box = textItem({hMm: boxForLines(5, 12), fontSizePt: 12});
            const drug = (word: string) => ({name: `${word}${u}`, description: "سطر1\nسطر2"});
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [box, iso, number]}), [drug("Za"), drug("Zb"), drug("Zc")]);
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);

            const sheets = await printSheets(page);
            expect(sheets).toHaveLength(3);
            for (const [index, sheet] of sheets.entries()) {
                expect(sheet.items.iso.text).toBe("2026-11-05T14:30");
                expect(sheet.items.pg.text).toBe(`${index + 1}/3`);
                for (const id of ["iso", "pg"]) {
                    const lefts = await characterLefts(sheetItem(page, index, id));
                    expect(lefts, `${id} on sheet ${index + 1} reads left to right`).toEqual([...lefts].sort((a, b) => a - b));
                }
            }
            const baseline = await baselineOffsetPt(page, 11);
            const {pages} = await printedPdf(page);
            expect(pages).toHaveLength(3);
            for (const [index, sheet] of pages.entries()) {
                expectRunAt(pdfRun(sheet, "2026-11-05T14:30"), iso, baseline, `ISO on page ${index + 1}`);
                expectRunAt(pdfRun(sheet, `${index + 1}/3`), number, baseline, `the number on page ${index + 1}`);
            }
        });

    test("in the English UI the printed text and values are Arabic, right to left, on a sheet that doesn't mirror @TPL-338",
        async ({page, lang, data}) => {
            test.skip(lang !== "en", "the English UI's project");
            await page.clock.setFixedTime(FROZEN());
            const u = unique();
            const name = `Zname${u}`;
            const fixed = staticItem({text: `Zstatic${u}`});
            const date = functionItem("fullDate", {id: "date", xMm: 14, yMm: 20, wMm: 60, hMm: 8});
            const day = functionItem("dayOfWeek", {id: "day", xMm: 14, yMm: 30, wMm: 60, hMm: 8});
            const time = functionItem("time", {id: "time", xMm: 14, yMm: 40, wMm: 60, hMm: 8});
            const text = textItem();
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [text, fixed, date, day, time]}),
                [{name, dosing: RX_DOSINGS.tabletEvery8Hours5Days.dosing}]);
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);

            const [sheet] = await printSheets(page);
            expect(sheet.dir, "the sheet never mirrors").toBe("ltr");
            expect(sheet.items.date.text).toBe("5 نوفمبر 2026");
            expect(sheet.items.day.text).toBe("الخميس");
            expect(sheet.items.time.text).toBe("2:30 م");
            expect(linesOf(sheet.items.t.text)).toEqual([name, RX_DOSINGS.tabletEvery8Hours5Days.sentence]);
            const directions = await sheetItem(page, 0, "t").locator("p").evaluateAll(ps => ps.map(p => getComputedStyle(p).direction));
            expect(new Set(directions), "the prescription text").toEqual(new Set(["rtl"]));
            const dateDirection = await sheetItem(page, 0, "date").locator("span").evaluate(element => getComputedStyle(element).direction);
            expect(dateDirection, "an Arabic value").toBe("rtl");
            const baseline = await baselineOffsetPt(page, fixed.fontSizePt);

            const {pages} = await printedPdf(page);
            // At its mm from the left, not mirrored to the right
            expectRunAt(pdfRun(pages[0], fixed.text ?? ""), fixed, baseline, "the static text");
            expectRunOnFirstLine(pdfRun(pages[0], name), text, await baselineOffsetPt(page, text.fontSizePt), "the prescription text");
        });

    test("at 375 px with no manual input: window.print runs, and the PDF page is the template's size with items at their mm @TPL-346",
        async ({page, lang, data, isMobile, healthy}) => {
            test.skip(!isMobile, "the phone project");
            const u = unique();
            const fixed = staticItem({text: `Zstatic${u}`});
            const number = functionItem("pageNumber", {id: "pg", xMm: 120, yMm: 190, wMm: 20, hMm: 8});
            const box = textItem();
            const name = `Zname${u}`;
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [box, fixed, number]}), [{name}]);
            await printButton(rx.panel, rt).click();
            await expect(printPopup(page, rt), "no pop-up").toHaveCount(0);
            await expectPrintCalls(page, 1);

            const [sheet] = await printSheets(page);
            expectClose({x: sheet.items.s.xMm, y: sheet.items.s.yMm, w: sheet.items.s.wMm, h: sheet.items.s.hMm},
                {x: fixed.xMm, y: fixed.yMm, w: fixed.wMm, h: fixed.hMm}, "the static text");
            await expectOnlySheetPrinted(page);
            const small = await baselineOffsetPt(page, fixed.fontSizePt);
            const large = await baselineOffsetPt(page, box.fontSizePt);
            const {pages} = await printedPdf(page);
            expect(pages).toHaveLength(1);
            expectPageSize(pages[0], A5.widthMm, A5.heightMm);
            expectRunAt(pdfRun(pages[0], fixed.text ?? ""), fixed, small, "the static text");
            expectRunOnFirstLine(pdfRun(pages[0], name), box, large, "the prescription text");
            await healthy();
        });
});
