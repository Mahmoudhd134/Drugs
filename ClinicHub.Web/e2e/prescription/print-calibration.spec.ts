import type {Page} from "@playwright/test";
import {expect, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    expectPageSize,
    expectPrintCalls,
    expectRunShift,
    functionItem,
    moveMouseOff,
    openPrescription,
    pdfDrawing,
    pdfRun,
    printButton,
    printedPdf,
    printPopup,
    printSheets,
} from "../support/print.ts";
import {A5, type Calibration, expectClose, type Layout, manualItem, ONE_LANGUAGE, putPaper, putTemplate, staticItem, textItem} from "../support/print-template.ts";
import {paperPng} from "../support/paper-files.ts";
import {RxPage} from "../support/rx.ts";
import {type Lang} from "../support/texts.ts";
import {RX_TEXTS, type RxTexts} from "../support/texts-rx.ts";
import {noHorizontalScroll, setLanguage} from "../support/ux.ts";

/**
 * A real print and the printer's correction, through the real API and page, printed by the browser's own engine: step 4 design §§ 1, 3, contract § 4.4. Every position is proved against a print of the same template at 0, 0.
 */

const CORRECTION: Calibration = {xMm: 2, yMm: -1.5};

/** A5: a prescription text, a manual input, a function and a static text, each with a Latin token the PDF prints as a whole run. */
const tokensLayout = (u: string): Layout => ({
    schemaVersion: 1,
    page: A5,
    items: [
        textItem(),
        manualItem({name: "الاسم"}),
        functionItem("isoDateTime", {id: "iso", name: "الوقت", xMm: 14, yMm: 20, wMm: 60, hMm: 8}),
        staticItem({text: `Zstatic${u}`, wMm: 80, fontSizePt: 11}),
    ],
});

/** Print, its pop-up when the template has a manual input: what the sheets and the PDF hold. The PDF ends the job, so a next print needs a new press. */
const printIt = async (page: Page, rx: RxPage, rt: RxTexts, calls: number, patient?: string) => {
    await moveMouseOff(page);
    await printButton(rx.panel, rt).click();
    if (patient) {
        const popup = printPopup(page, rt);
        await popup.getByRole("textbox").first().fill(patient);
        await printButton(popup, rt).click();
        await expect(popup).toBeHidden();
    }
    await expectPrintCalls(page, calls);
    const sheets = await printSheets(page);
    const pdf = await printedPdf(page);
    return {sheets, pdf};
};

test.describe("Printing: the printer's correction @area:prescription", () => {
    test("X = 2, Y = −1.5: every item of the PDF 2 mm right and 1.5 mm up of its place at 0, 0, within 0.1 mm, the same in Arabic and in English @TPL-600 @smoke",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile || lang !== "ar", ONE_LANGUAGE);
            await page.clock.setFixedTime(new Date(2026, 10, 5, 14, 30));
            const u = unique();
            const layout = tokensLayout(u);
            const [patient, drug, fixed] = [`Zpatient${u}`, `Zdrug${u}`, `Zstatic${u}`];
            const iso = "2026-11-05T14:30";
            const {clinic, rx, rt} = await openPrescription(page, data, lang, layout, [{name: drug}]);

            const atZero = await printIt(page, rx, rt, 1, patient);
            await putTemplate(data, clinic, {...layout, calibration: CORRECTION});

            const read = async (shown: Lang, rxNow: RxPage, rtNow: RxTexts, calls: number) => {
                const {sheets, pdf} = await printIt(page, rxNow, rtNow, calls, patient);
                expect(sheets, `${shown}: one sheet`).toHaveLength(1);
                for (const item of layout.items) {
                    const shownItem = sheets[0].items[item.id];
                    expectClose(
                        {x: shownItem.xMm, y: shownItem.yMm, w: shownItem.wMm, h: shownItem.hMm},
                        {x: item.xMm + CORRECTION.xMm, y: item.yMm + CORRECTION.yMm, w: item.wMm, h: item.hMm},
                        `${shown}: the box ${item.id}`,
                    );
                }
                for (const token of [patient, fixed, iso, drug]) {
                    expectRunShift(pdfRun(atZero.pdf.pages[0], token), pdfRun(pdf.pages[0], token), CORRECTION.xMm, CORRECTION.yMm, `${shown}: «${token}»`);
                }
                return pdf.pages[0];
            };

            const arabic = await read("ar", rx, rt, 2);

            await setLanguage(page, "en");
            const rtEn = RX_TEXTS.en;
            // The reload restarted the stub's count
            const english = await read("en", new RxPage(page, rtEn), rtEn, 1);

            for (const token of [patient, fixed, iso, drug]) {
                expectRunShift(pdfRun(arabic, token), pdfRun(english, token), 0, 0, `«${token}», English against Arabic`);
            }
        });

    test("a 40-drug prescription: the same page size and page count with the correction as at 0, 0 @TPL-602",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile, "the same engine as on a computer: TPL-720 prints on the phone");
            test.slow();
            const u = unique();
            const layout: Layout = {schemaVersion: 1, page: A5, items: [textItem()]};
            const names = Array.from({length: 40}, (_, i) => ({name: `Zdrug${String(i + 1).padStart(2, "0")}${u}`}));
            const {clinic, rx, rt} = await openPrescription(page, data, lang, layout, names);

            const atZero = await printIt(page, rx, rt, 1);
            expect(atZero.pdf.pages.length, "40 drugs need several pages").toBeGreaterThan(1);

            await putTemplate(data, clinic, {...layout, calibration: {xMm: 20, yMm: 20}});
            const moved = await printIt(page, rx, rt, 2);

            expect(moved.pdf.pages.length).toBe(atZero.pdf.pages.length);
            expect(moved.sheets.length).toBe(atZero.sheets.length);
            for (const pdfPage of moved.pdf.pages) expectPageSize(pdfPage, A5.widthMm, A5.heightMm);
        });

    test("a box pushed off the paper: the sheet still clips it and the PDF has no extra page @TPL-620",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile, "the same engine as on a computer: TPL-720 prints on the phone");
            const u = unique();
            const fixed = staticItem({text: `Zstatic${u}`, xMm: 100, yMm: 195, wMm: 40, hMm: 8});
            const layout: Layout = {schemaVersion: 1, page: A5, items: [textItem(), fixed]};
            const {rx, rt} = await openPrescription(page, data, lang, {...layout, calibration: {xMm: 20, yMm: 20}}, [{name: `Zdrug${u}`}]);

            const {sheets, pdf} = await printIt(page, rx, rt, 1);

            expect(sheets).toHaveLength(1);
            expect(sheets[0].overflow, "the sheet clips what leaves it").toBe("hidden");
            expect(sheets[0].items[fixed.id].xMm + sheets[0].items[fixed.id].wMm, "the box leaves the sheet").toBeGreaterThan(A5.widthMm);
            expect(pdf.pages, "one page, no extra").toHaveLength(1);
            expectPageSize(pdf.pages[0], A5.widthMm, A5.heightMm);
        });

    test("with a paper image stored, a real print: no image operations in the PDF, and a staff member's page never asks for `paper-image` @TPL-666",
        async ({page, data, lang, isMobile}) => {
            test.skip(isMobile, "the same engine as on a computer: TPL-720 prints on the phone");
            const asked: string[] = [];
            page.on("request", request => {
                if (new URL(request.url()).pathname.includes("paper-image")) asked.push(request.url());
            });
            const u = unique();
            const {clinic, rx, rt} = await openPrescription(page, data, lang, tokensLayout(u), [{name: `Zdrug${u}`}]);
            await putPaper(data, clinic, paperPng());
            await page.reload();
            await expect(rx.lines).toHaveCount(1);

            const {pdf} = await printIt(page, rx, rt, 1, `Zpatient${u}`);

            const drawing = await pdfDrawing(pdf.bytes);
            expect(drawing.map(pageDrawing => pageDrawing.images), "no image in the PDF").toEqual([0]);
            await expect(page.getByTestId("template-paper-image")).toHaveCount(0);
            expect(asked).toEqual([]);
        });

    for (const [name, widthMm, heightMm, boxes] of [
        ["a landscape 210 x 148", 210, 148, {text: {xMm: 14, yMm: 40, wMm: 120, hMm: 60}, fixed: {xMm: 14, yMm: 120, wMm: 80, hMm: 8}}],
        ["a custom 50 x 50", 50, 50, {text: {xMm: 5, yMm: 5, wMm: 40, hMm: 20}, fixed: {xMm: 5, yMm: 30, wMm: 40, hMm: 8}}],
    ] as const) {
        test(`${name} with the correction: the items shift, the page size unchanged @TPL-717`,
            async ({page, data, lang, isMobile}) => {
                test.skip(isMobile, "the same engine as on a computer: TPL-720 prints on the phone");
                const u = unique();
                const [drug, fixed] = [`Z${u}`, `Y${u}`];
                const layout: Layout = {
                    schemaVersion: 1,
                    page: {size: "custom", widthMm, heightMm},
                    items: [textItem(boxes.text), staticItem({text: fixed, fontSizePt: 8, ...boxes.fixed})],
                };
                const {clinic, rx, rt} = await openPrescription(page, data, lang, layout, [{name: drug}]);

                const atZero = await printIt(page, rx, rt, 1);
                await putTemplate(data, clinic, {...layout, calibration: CORRECTION});
                const moved = await printIt(page, rx, rt, 2);

                expect(moved.pdf.pages).toHaveLength(1);
                expectPageSize(moved.pdf.pages[0], widthMm, heightMm);
                expectPageSize(atZero.pdf.pages[0], widthMm, heightMm);
                for (const token of [drug, fixed]) {
                    expectRunShift(pdfRun(atZero.pdf.pages[0], token), pdfRun(moved.pdf.pages[0], token), CORRECTION.xMm, CORRECTION.yMm, `«${token}»`);
                }
            });
    }

    test("at 375 px: the PDF's items shift by the correction, with no horizontal scroll @TPL-720",
        async ({page, data, lang, isMobile}) => {
            test.skip(!isMobile, "the phone project");
            const u = unique();
            const layout = tokensLayout(u);
            const [patient, drug, fixed] = [`Zpatient${u}`, `Zdrug${u}`, `Zstatic${u}`];
            const {clinic, rx, rt} = await openPrescription(page, data, lang, layout, [{name: drug}]);

            const atZero = await printIt(page, rx, rt, 1, patient);
            await putTemplate(data, clinic, {...layout, calibration: CORRECTION});
            const moved = await printIt(page, rx, rt, 2, patient);

            for (const token of [patient, fixed, drug]) {
                expectRunShift(pdfRun(atZero.pdf.pages[0], token), pdfRun(moved.pdf.pages[0], token), CORRECTION.xMm, CORRECTION.yMm, `«${token}»`);
            }
            expectPageSize(moved.pdf.pages[0], A5.widthMm, A5.heightMm);
            await noHorizontalScroll(page, "the prescription page at 375 px");
        });
});
