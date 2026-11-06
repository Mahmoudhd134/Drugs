import {expect, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    attachPdf,
    attachScreenshot,
    baselineOffsetPt,
    expectOnlySheetPrinted,
    expectOnlyTemplateText,
    expectPageSize,
    expectPrintCalls,
    expectRunAt,
    expectRunEndsAtRight,
    expectRunOnFirstLine,
    functionItem,
    linesOf,
    mmToPt,
    openPrescription,
    pdfRun,
    pdfText,
    printButton,
    printPopup,
    printedPdf,
    printSheets,
    timesPrinted,
} from "../support/print.ts";
import {A5, expectClose, type Layout, manualItem, staticItem, textItem} from "../support/print-template.ts";
import {RX_DOSINGS} from "../support/texts-rx.ts";

/**
 * The proof of step 2 (contract § 5): a real template and 40 drugs with unique Latin names, through the real API and the real
 * page, printed by the browser's own engine: what the PDF holds and where, against the template's mm. The screenshots and the
 * PDFs it attaches go to the ready report (Arabic, English, phone).
 */

const SENTENCE = RX_DOSINGS.tabletEvery8Hours5Days.sentence;

test.describe("Printing: the proof @area:prescription", () => {
    test("a real A5 template and 40 drugs: the PDF page is the sheet's size with no margin, every item within 1 mm of its template mm on every page, every drug exactly once, the short items and the page number on each @TPL-120 @TPL-121 @TPL-141 @TPL-142",
        async ({page, lang, data, healthy}, testInfo) => {
            test.slow();
            await page.clock.setFixedTime(new Date(2026, 10, 5, 14, 30));

            const u = unique();
            const staticToken = `Zstatic${u}`;
            const patient = `Zpatient${u}`;
            const text = textItem();
            // Left aligned, so a Latin run's start is the box's own left edge (the default is right: step 4 contract § 10.29); the Arabic date stays at the default
            const name = manualItem({align: "left"});
            const date = functionItem("fullDate", {id: "date", name: "التاريخ", xMm: 14, yMm: 46, wMm: 40, hMm: 8});
            const iso = functionItem("isoDateTime", {id: "iso", name: "الوقت", xMm: 14, yMm: 20, wMm: 60, hMm: 8, align: "left"});
            const number = functionItem("pageNumber", {id: "pg", name: "الصفحة", xMm: 120, yMm: 190, wMm: 20, hMm: 8, align: "left"});
            const fixed = staticItem({text: staticToken, wMm: 80, fontSizePt: 11, align: "left"});
            const layout: Layout = {schemaVersion: 1, page: A5, items: [text, name, date, iso, number, fixed]};
            const names = Array.from({length: 40}, (_, i) => `Zdrug${String(i + 1).padStart(2, "0")}${u}`);

            const {rx, rt} = await openPrescription(page, data, lang, layout,
                names.map(drug => ({name: drug, dosing: RX_DOSINGS.tabletEvery8Hours5Days.dosing})));
            await healthy();
            await attachScreenshot(page, testInfo, "the page with Print");

            await printButton(rx.panel, rt).click();
            const popup = printPopup(page, rt);
            await popup.getByRole("textbox", {name: name.name, exact: true}).fill(patient);
            await attachScreenshot(page, testInfo, "the pop-up");
            await printButton(popup, rt).click();
            await expect(popup).toBeHidden();
            await expectPrintCalls(page, 1);

            // The sheets as laid out for print: each box at its mm within 0.1 mm, the short items repeated with the same value
            const sheets = await printSheets(page);
            expect(sheets.length, "40 drugs need several sheets").toBeGreaterThan(1);
            for (const [index, sheet] of sheets.entries()) {
                const where = `sheet ${index + 1}`;
                expect(Math.abs(sheet.widthMm - A5.widthMm), `${where}: its width`).toBeLessThanOrEqual(0.1);
                expect(Math.abs(sheet.heightMm - A5.heightMm), `${where}: its height`).toBeLessThanOrEqual(0.1);
                for (const item of layout.items) {
                    const shown = sheet.items[item.id];
                    expect(shown, `${where}: ${item.id}`).toBeDefined();
                    expectClose({x: shown.xMm, y: shown.yMm, w: shown.wMm, h: shown.hMm}, {x: item.xMm, y: item.yMm, w: item.wMm, h: item.hMm}, `${where}: ${item.id}`);
                }
                expect(sheet.items[name.id].text).toBe(patient);
                expect(sheet.items[date.id].text).toBe("5 نوفمبر 2026");
                expect(sheet.items[iso.id].text).toBe("2026-11-05T14:30");
                expect(sheet.items[fixed.id].text).toBe(staticToken);
                expect(sheet.items[number.id].text).toBe(`${index + 1}/${sheets.length}`);
                expect(sheet.items[text.id].contentHeightMm, `${where}: its text fits the box, none cut`).toBeLessThanOrEqual(text.hMm + 0.1);
            }
            // Every drug's text whole, in the prescription's order
            const printed = sheets.flatMap(sheet => linesOf(sheet.items[text.id].text));
            expect(printed).toEqual(names.flatMap(drug => [drug, SENTENCE]));

            await expectOnlySheetPrinted(page);
            await attachScreenshot(page, testInfo, "the sheets under print media", "print");
            const baseline = await baselineOffsetPt(page, text.fontSizePt);

            // The PDF, read back: this ends the print job
            const pdf = await printedPdf(page);
            await attachPdf(pdf, testInfo, "the prescription");
            expect(pdf.pages.length, "one PDF page per sheet").toBe(sheets.length);
            for (const drug of names) expect(timesPrinted(pdf.pages, drug), `${drug} on the PDF`).toBe(1);

            for (const [index, sheet] of pdf.pages.entries()) {
                const where = `PDF page ${index + 1}`;
                expectPageSize(sheet, A5.widthMm, A5.heightMm, where);
                expectOnlyTemplateText(sheet, layout, where);
                expectRunAt(pdfRun(sheet, patient), name, baseline, `${where}: the manual input`);
                expectRunAt(pdfRun(sheet, staticToken), fixed, baseline, `${where}: the static text`);
                expectRunAt(pdfRun(sheet, "2026-11-05T14:30"), iso, baseline, `${where}: the ISO date`);
                expectRunAt(pdfRun(sheet, `${index + 1}/${pdf.pages.length}`), number, baseline, `${where}: the page number`);
                // An Arabic date starts at its box's right edge: the day ends there and the year sits on the same first line, inside the box
                const year = sheet.items.find(item => item.text === "2026");
                if (!year) throw new Error(`${where}: no year in ${pdfText(sheet)}`);
                expectRunOnFirstLine(year, date, baseline, `${where}: the date`);
                expect(year.xPt, `${where}: the date inside its box`).toBeGreaterThanOrEqual(mmToPt(date.xMm - 1));
                const day = sheet.items.find(item => item.text === "5" && Math.abs(item.yPt - year.yPt) < 1);
                if (!day) throw new Error(`${where}: no day on the date's line in ${pdfText(sheet)}`);
                expectRunEndsAtRight(day, date, `${where}: the date`);

                // The sheet's first drug: on the text box's first line, its Latin name ending at the right edge
                const first = names.filter(drug => pdfText(sheet).includes(drug))[0];
                const run = pdfRun(sheet, first);
                expectRunOnFirstLine(run, text, baseline, `${where}: the prescription text`);
                expectRunEndsAtRight(run, text, `${where}: the prescription text`);
            }
            await attachScreenshot(page, testInfo, "the app after printing");
        });
});
