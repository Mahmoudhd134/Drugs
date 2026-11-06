import {expect, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    addLines,
    attachPdf,
    attachScreenshot,
    expectPrintCalls,
    expectRunShift,
    functionItem,
    moveMouseOff,
    pdfDrawing,
    pdfRun,
    printButton,
    printedPdf,
    printPopup,
    printRoot,
    printSheet,
    printSheets,
    inPrintMedia,
    stubPrint,
} from "../support/print.ts";
import {
    A5,
    boxMm,
    COMPUTER_ONLY,
    designerOf,
    designerShown,
    expectClose,
    expectPaperFillsSheet,
    getTemplate,
    inlineStyle,
    type Layout,
    layoutL,
    manualItem,
    ONE_LANGUAGE,
    openDesigner,
    openDesignerWithPaper,
    opacityTo,
    PT_TEXTS,
    putTemplate,
    rulersOn,
    saveLayout,
    staticItem,
    tabPath,
    textItem,
    typeInto,
    uploadPaper,
} from "../support/print-template.ts";
import {corruptPng, paperPng} from "../support/paper-files.ts";
import {RxPage, rxDrug} from "../support/rx.ts";
import {TEXTS} from "../support/texts.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import {expectNoCutOrOverlap, pageChecks} from "../support/ux.ts";

/**
 * The step's "Done when" (step 4 design § 1), the whole journey with a real picture and a staff member printing. Its screenshots go to the ready report (contract § 9): the picture at 50%, the warning, the test page's root, in Arabic and English.
 */

const CORRECTION = {xMm: 2, yMm: -1.5};

test.describe("Paper alignment: the whole journey @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("upload, 50%, opacity, hide; Test print: one page, framed, with rulers, no picture; X = 2, Y = −1.5 saved; staff's print 2 mm right and 1.5 mm up; the designer's numbers unchanged; staff never sees the picture @TPL-719",
        async ({page, data, lang, newBrowser, healthy}, testInfo) => {
            test.slow();
            const u = unique();
            const [patient, drugName, fixedText] = [`Zpatient${u}`, `Zdrug${u}`, `Zstatic${u}`];
            const iso = "2026-11-05T14:30";
            const when = new Date(2026, 10, 5, 14, 30);
            const fixed = staticItem({text: fixedText, xMm: 60, yMm: 175, wMm: 60, hMm: 8, fontSizePt: 11});
            const manual = manualItem({xMm: 58, yMm: 46, wMm: 72, hMm: 8});
            const time = functionItem("isoDateTime", {id: "iso", name: "الوقت", xMm: 14, yMm: 20, wMm: 60, hMm: 8});
            const layout: Layout = {schemaVersion: 1, page: A5, items: [textItem(), manual, time, fixed]};

            const clinic = await data.clinic();
            await putTemplate(data, clinic, layout);
            const member = await data.staff(clinic, {roles: ["Doctor"]});
            const drug = await rxDrug(data, clinic, {name: drugName});
            await stubPrint(page);

            // A staff member's print before any correction: where everything sits at 0, 0
            const staff = await newBrowser();
            const askedByStaff: string[] = [];
            staff.page.on("request", request => {
                if (new URL(request.url()).pathname.includes("paper-image")) askedByStaff.push(request.url());
            });
            await stubPrint(staff.page);
            await staff.page.clock.setFixedTime(when);
            await signIn(staff.page, member.phone);
            const rt = RX_TEXTS[lang];
            const rx = new RxPage(staff.page, rt);
            await addLines(rx, data, clinic, [drug]);

            const staffPrints = async (calls: number) => {
                await moveMouseOff(staff.page);
                await printButton(rx.panel, rt).click();
                const popup = printPopup(staff.page, rt);
                await popup.getByRole("textbox").first().fill(patient);
                await printButton(popup, rt).click();
                await expect(popup).toBeHidden();
                await expectPrintCalls(staff.page, calls);
                const [sheet] = await printSheets(staff.page);
                const pdf = await printedPdf(staff.page);
                return {sheet, pdf};
            };
            const atZero = await staffPrints(1);

            // The super admin: the picture
            const designer = designerOf(page, lang);
            const {pt} = designer;
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);
            await uploadPaper(designer, paperPng());
            await expect(designer.paperRow("paper.png")).toBeVisible();
            await expect(designer.paperImage).toBeVisible();
            await expectPaperFillsSheet(designer, "the picture");
            await expect(designer.paperImage).toHaveCSS("opacity", "0.5");
            await expect(designer.save, "the picture needs no Save").toBeDisabled();
            await healthy();
            await attachScreenshot(page, testInfo, "the picture at 50%", "screen", "viewport");

            await opacityTo(designer, 70);
            await expect(designer.paperImage).toHaveCSS("opacity", "0.7");
            await designer.paperShow.click();
            await expect(designer.paperImage).toHaveCount(0);
            await designer.paperShow.click();
            await expect(designer.paperImage).toBeVisible();

            // Test print: one page, every box framed, rulers, no picture
            await moveMouseOff(page);
            await designer.testPrint.click();
            await expectPrintCalls(page, 1);
            await expect(printRoot(page).locator("img")).toHaveCount(0);
            await expect(printRoot(page).getByTestId("test-print-frame")).toHaveCount(layout.items.length);
            const testSheets = await printSheets(page);
            expect(testSheets, "one page").toHaveLength(1);
            const rulers = await inPrintMedia(page, () => rulersOn(printSheet(page)));
            expect(Math.abs(rulers.top.lineMm - 6)).toBeLessThanOrEqual(0.1);
            expect(rulers.top.labels).toContain("10");
            await attachScreenshot(page, testInfo, "the test page's root", "print");
            const testPdf = await printedPdf(page);
            await attachPdf(testPdf, testInfo, "the test page");
            expect(testPdf.pages).toHaveLength(1);
            expect((await pdfDrawing(testPdf.bytes)).map(drawing => drawing.images), "no picture printed").toEqual([0]);
            await expect(designer.save, "it saved nothing").toBeDisabled();

            // The warning, then the correction
            await typeInto(designer.calibrationX, "20");
            await expect(designer.cutWarning).toHaveText(pt.cutWarning);
            await designer.cutWarning.scrollIntoViewIfNeeded();
            await attachScreenshot(page, testInfo, "the cut warning", "screen", "viewport");

            await typeInto(designer.calibrationX, String(CORRECTION.xMm));
            await typeInto(designer.calibrationY, "−1.5");
            await designer.calibrationX.click();
            await expect(designer.cutWarning).toHaveCount(0);
            await expect(designer.calibrationY).toHaveValue("-1.5");
            await saveLayout(page, designer);
            expect((await getTemplate(data, clinic))?.layout.calibration).toEqual(CORRECTION);

            // The designer's numbers haven't changed
            for (const item of layout.items) {
                expect(await boxMm(designer.box(item.id)), `the box ${item.id} on the designer`).toEqual({x: item.xMm, y: item.yMm, w: item.wMm, h: item.hMm});
            }
            expect(await inlineStyle(designer.box("m"), "left")).toBe(`${manual.xMm}mm`);
            await designer.box("m").click();
            await expect(designer.field(pt.x)).toHaveValue(String(manual.xMm));
            await expect(designer.field(pt.y)).toHaveValue(String(manual.yMm));

            // The staff member's next print, with no reload
            const moved = await staffPrints(2);
            for (const item of layout.items) {
                const shown = moved.sheet.items[item.id];
                expectClose(
                    {x: shown.xMm, y: shown.yMm, w: shown.wMm, h: shown.hMm},
                    {x: item.xMm + CORRECTION.xMm, y: item.yMm + CORRECTION.yMm, w: item.wMm, h: item.hMm},
                    `staff's print: the box ${item.id}`,
                );
            }
            for (const token of [patient, drugName, fixedText, iso]) {
                expectRunShift(pdfRun(atZero.pdf.pages[0], token), pdfRun(moved.pdf.pages[0], token), CORRECTION.xMm, CORRECTION.yMm, `staff's PDF: «${token}»`);
            }
            await attachPdf(moved.pdf, testInfo, "staff's print with the correction");
            expect((await pdfDrawing(moved.pdf.bytes)).map(drawing => drawing.images), "no picture in staff's print").toEqual([0]);
            await expect(staff.page.getByTestId("template-paper-image")).toHaveCount(0);
            expect(askedByStaff, "staff's pages never ask for the picture").toEqual([]);
        });

    test("in Arabic: the new labels, messages and hints show translated, with no cut text and no axe failure on the designer @TPL-686",
        async ({page, data, lang}) => {
            test.skip(lang !== "ar", ONE_LANGUAGE);
            const main = page.locator("main");
            const ar = PT_TEXTS.ar;
            const {designer} = await openDesignerWithPaper(page, data, lang, layoutL(), paperPng());

            await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
            await expect(designer.calibration.getByRole("heading", {name: ar.calibrationTitle, exact: true})).toBeVisible();
            await expect(designer.calibrationX).toBeVisible();
            await expect(designer.calibrationY).toBeVisible();
            await expect(designer.calibration.getByText(ar.calibrationHelper, {exact: true})).toBeVisible();
            await expect(designer.calibration.getByText(ar.testPrintHint, {exact: true})).toBeVisible();
            await expect(designer.testPrint).toBeVisible();
            await expect(designer.paperSection.getByRole("heading", {name: ar.paperTitle, exact: true})).toBeVisible();
            await expect(designer.paperRules).toHaveText(ar.paperRules);
            await expect(designer.paperShow).toBeVisible();
            await expect(designer.paperOpacity).toBeVisible();
            await pageChecks(page, "the designer with a picture");
            await expectNoCutOrOverlap(main, "the designer with a picture");

            await typeInto(designer.calibrationX, "21");
            await expect(designer.calibration.getByText(ar.calibrationInvalid, {exact: true})).toBeVisible();
            await pageChecks(page, "the range message");
            await expectNoCutOrOverlap(main, "the range message");

            await typeInto(designer.calibrationX, "20");
            await expect(designer.cutWarning).toHaveText(ar.cutWarning);
            await pageChecks(page, "the cut warning");
            await expectNoCutOrOverlap(main, "the cut warning");

            await designer.testPrint.hover();
            await expect(page.getByRole("tooltip")).toHaveText(ar.testPrintHint);
            await moveMouseOff(page);

            await uploadPaper(designer, corruptPng());
            await expect(designer.paperLoadFailed).toContainText(ar.paperLoadFailed);
            await expect(designer.paperLoadFailed.getByRole("button", {name: TEXTS.ar.retry, exact: true})).toBeVisible();
            await pageChecks(page, "the load failure");
            await expectNoCutOrOverlap(main, "the load failure");
        });

    test("at 1280 x 800, Save refusing an item scrolls its message into view; X and Y stay reachable @TPL-701",
        async ({page, data, lang}) => {
            const {designer, pt} = await openDesigner(page, data, lang, layoutL());
            await designer.box("m").click();
            await designer.field(pt.name).fill("");
            await page.evaluate(() => window.scrollTo(0, 0));

            await designer.save.click();

            await expect(designer.field(pt.name)).toHaveAttribute("aria-invalid", "true");
            await expect(designer.settings.getByText(pt.nameRequired, {exact: true})).toBeInViewport();

            await designer.calibrationX.scrollIntoViewIfNeeded();
            await expect(designer.calibrationX).toBeInViewport();
            await typeInto(designer.calibrationX, "1");
            await designer.calibrationY.scrollIntoViewIfNeeded();
            await expect(designer.calibrationY).toBeInViewport();
            await typeInto(designer.calibrationY, "1");
            await expect(designer.calibrationX).toHaveValue("1");

            // Test print refuses the same way
            await page.evaluate(() => window.scrollTo(0, 0));
            await moveMouseOff(page);
            await designer.testPrint.click();
            await expect(designer.settings.getByText(pt.nameRequired, {exact: true})).toBeInViewport();
        });

    test("the template deleted and created again: no correction, and the picture shows @TPL-621",
        async ({page, data, lang}) => {
            const {clinic, designer, pt} = await openDesignerWithPaper(page, data, lang, {...layoutL(), calibration: {xMm: 2, yMm: -1.5}}, paperPng());
            await expect(designer.calibrationX).toHaveValue("2");

            await page.getByRole("button", {name: TEXTS[lang].delete, exact: true}).click();
            await designer.deleteQuestion.getByRole("button", {name: TEXTS[lang].delete, exact: true}).click();
            await expect(page.getByText(pt.empty, {exact: true})).toBeVisible();
            await expect(designer.paperSection, "the empty state has no picture section").toHaveCount(0);

            await designer.create.click();
            await designerShown(designer);
            await expect(designer.calibrationX).toHaveValue("0");
            await expect(designer.calibrationY).toHaveValue("0");
            await expect(designer.paperImage).toBeVisible();
            await expect(designer.paperRow("paper.png")).toBeVisible();

            await saveLayout(page, designer);
            expect((await getTemplate(data, clinic))?.layout.calibration).toEqual({xMm: 0, yMm: 0});
        });

    test("a template with a correction: the designer's items and boxes stay at their numbers, the fields show the correction @TPL-601",
        async ({page, data, lang}) => {
            const layout = layoutL({calibration: {xMm: 2, yMm: -1.5}});
            const {designer, pt} = await openDesigner(page, data, lang, layout);

            await expect(designer.calibrationX).toHaveValue("2");
            await expect(designer.calibrationY).toHaveValue("-1.5");
            for (const item of layout.items) {
                expect(await boxMm(designer.box(item.id)), `the box ${item.id}`).toEqual({x: item.xMm, y: item.yMm, w: item.wMm, h: item.hMm});
                await designer.box(item.id).click();
                await expect(designer.field(pt.x)).toHaveValue(String(item.xMm));
                await expect(designer.field(pt.y)).toHaveValue(String(item.yMm));
            }
            await expect(designer.save, "nothing to save").toBeDisabled();
        });
});
