import {expect, settled, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    addLines,
    closeEditor,
    embeddedFonts,
    expectPageSize,
    expectPrintCalls,
    finishPrint,
    MM_PT,
    mmToPt,
    openEditor,
    openPrescription,
    pageRules,
    pdfRun,
    printButton,
    printCalls,
    printedPdf,
    printMoments,
    printPopup,
    printRoot,
    printSheets,
    sheetItem,
    stubPrint,
    timesPrinted,
} from "../support/print.ts";
import {A4, layoutL, manualItem, putTemplate, staticItem, textItem} from "../support/print-template.ts";
import {markClipboard, readClipboard, RxPage, rxDrug} from "../support/rx.ts";
import {RX_DOSINGS, RX_TEXTS} from "../support/texts-rx.ts";
import {expectContextLabel, expectToast, openSwitchClinic, pickerEntry} from "../support/ui.ts";
import {expectNoCutOrOverlap, fitsTheScreen, noHorizontalScroll, setLanguage} from "../support/ux.ts";

/** The way to a print: the button, the pop-up, the font, the app around it. Business file «طباعة الروشتة»; contract step 2 § 3. */

test.describe("Printing: the flow @area:prescription", () => {
    test("a clinic with no template: no Print in the panel or the editor, Copy and «تعديل ونسخ» work as before @TPL-103 @smoke",
        async ({page, context, lang, data, healthy}) => {
            await context.grantPermissions(["clipboard-read", "clipboard-write"]);
            const name = `Zname${unique()}`;
            const {rx, rt} = await openPrescription(page, data, lang, null, [{name}]);

            await expect(rx.panel.getByRole("button", {name: rt.quickCopy, exact: true})).toBeVisible();
            await expect(printButton(rx.panel, rt)).toHaveCount(0);
            await healthy();
            await markClipboard(page);
            await rx.panel.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await expectToast(page, rt.copied);
            expect((await readClipboard(page)).text).toBe(name);

            const editor = await openEditor(page, rt);
            await expect(editor.locator(".ql-editor")).toContainText(name);
            await expect(printButton(editor, rt)).toHaveCount(0);
            await markClipboard(page);
            await editor.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await expectToast(page, rt.copied);
            expect((await readClipboard(page)).text).toBe(name);
            await closeEditor(editor, rt);
        });

    test("the pop-up with a field left empty: it prints, with that space blank @TPL-112 @smoke",
        async ({page, lang, data}) => {
            const u = unique();
            const age = `Zage${u}`;
            const first = manualItem({id: "m1", name: "الاسم", xMm: 58, yMm: 46, wMm: 72, hMm: 8});
            const second = manualItem({id: "m2", name: "السن", xMm: 58, yMm: 56, wMm: 72, hMm: 8});
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem(), first, second]}), [{name: `Zname${u}`}]);

            await printButton(rx.panel, rt).click();
            const popup = printPopup(page, rt);
            await popup.getByRole("textbox", {name: second.name, exact: true}).fill(age);
            await printButton(popup, rt).click();
            await expect(popup).toBeHidden();
            await expectPrintCalls(page, 1);

            const [sheet] = await printSheets(page);
            expect(sheet.items.m1.text, "the empty field").toBe("");
            expect(sheet.items.m2.text).toBe(age);
            const {pages} = await printedPdf(page);
            expect(pages).toHaveLength(1);
            const run = pdfRun(pages[0], age);
            expect(run.yPt, "on its own line").toBeGreaterThan(mmToPt(second.yMm));
            expect(pages[0].items.filter(item => item.yPt > mmToPt(first.yMm) && item.yPt < mmToPt(first.yMm + first.hMm)), "nothing in the blank's place").toEqual([]);
        });

    test("the pop-up on a phone fits at 375 px, its fields are reachable and text isn't cut @TPL-117",
        async ({page, lang, data, isMobile, healthy}) => {
            test.skip(!isMobile, "the phone project");
            const names = Array.from({length: 14}, (_, i) => `حقل يدوي بعنوان طويل نسبيًا ${i + 1}`);
            const items = names.map((name, i) => manualItem({id: `m${i}`, name, xMm: 10, yMm: 10 + i * 4, wMm: 60, hMm: 4}));
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem(), ...items]}), [{name: `Zname${unique()}`}]);

            await printButton(rx.panel, rt).click();
            const popup = printPopup(page, rt);
            await expect(popup).toBeVisible();
            const paper = page.locator(".MuiDialog-paper").filter({visible: true});
            await fitsTheScreen(page, paper, "the pop-up");
            await noHorizontalScroll(page, "the pop-up");
            await expectNoCutOrOverlap(popup, "the pop-up");
            await expect(popup.getByText(rt.printHint, {exact: true})).toBeVisible();

            const last = popup.getByRole("textbox", {name: names[13], exact: true});
            await last.scrollIntoViewIfNeeded();
            await expect(last, "the last field").toBeInViewport({ratio: 1});
            await last.fill("Zlast");
            await expect(printButton(popup, rt), "the buttons stay").toBeInViewport({ratio: 1});
            await expect(popup.getByRole("button", {name: rt.cancel, exact: true})).toBeInViewport({ratio: 1});
            await healthy();

            await printButton(popup, rt).click();
            await expect(popup).toBeHidden();
            await expectPrintCalls(page, 1);
        });

    test("the sheet's font under its own family name loads from the app, regular and bold, before window.print, with Google Fonts blocked @TPL-130",
        async ({page, lang, data}) => {
            await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.fulfill({status: 200, contentType: "text/css", body: ""}));
            const fontAnswers: { url: string; status: number }[] = [];
            page.on("response", response => {
                if (new URL(response.url()).pathname.startsWith("/fonts/print/")) fontAnswers.push({url: response.url(), status: response.status()});
            });
            const name = `Zname${unique()}`;
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem()]}),
                [{name, dosing: RX_DOSINGS.tabletEvery8Hours5Days.dosing}]);

            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            const [moment] = await printMoments(page);
            expect(moment.sheets, "the sheet is there when window.print is called").toBe(1);
            expect([...moment.fonts].sort(), "the four files loaded before window.print").toEqual(["400 loaded", "400 loaded", "700 loaded", "700 loaded"]);
            expect(fontAnswers.length, "from the app").toBeGreaterThanOrEqual(4);
            for (const answer of fontAnswers) {
                expect(answer.status, answer.url).toBe(200);
                expect(new URL(answer.url).origin, answer.url).toBe(new URL(page.url()).origin);
            }
            const [sheet] = await printSheets(page);
            expect(sheet.items.t.fontFamily).toContain("ClinicHub Print");

            const {bytes} = await printedPdf(page);
            const fonts = embeddedFonts(bytes);
            expect(fonts.some(font => /^IBMPlexSansArabic-Regular/.test(font)), `regular in ${fonts.join()}`).toBe(true);
            expect(fonts.some(font => /^IBMPlexSansArabic-Bold/.test(font)), `bold in ${fonts.join()}`).toBe(true);
        });

    test("the font file failing to load: the print still runs once with the fallback font, no text lost, the app stays usable @TPL-331",
        async ({page, lang, data, consoleErrors}) => {
            let asked = 0;
            await page.route("**/fonts/print/**", route => {
                asked += 1;
                return route.abort();
            });
            const name = `Zname${unique()}`;
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem()]}),
                [{name, dosing: RX_DOSINGS.tabletEvery8Hours5Days.dosing}]);

            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            const [sheet] = await printSheets(page);
            expect(sheet.items.t.text).toContain(RX_DOSINGS.tabletEvery8Hours5Days.sentence);
            const {pages} = await printedPdf(page);
            expect(timesPrinted(pages, name), "no text lost").toBe(1);

            // Still usable, and the second print runs too
            await finishPrint(page);
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 2);
            await expect(rx.panel.getByRole("button", {name: rt.quickCopy, exact: true})).toBeEnabled();

            // The browser's own lines for the files this test cut off are its subject; any other error still fails it
            expect(asked, "the font files were asked for").toBeGreaterThan(0);
            const others = consoleErrors.filter(error => !error.includes("/fonts/print/"));
            consoleErrors.splice(0, consoleErrors.length, ...others);
        });

    test("the font file delayed by 2 s: window.print isn't called before it has loaded @TPL-332",
        async ({page, lang, data}) => {
            const printsWhenAnswered: number[] = [];
            await page.route("**/fonts/print/**", async route => {
                await new Promise(resolve => setTimeout(resolve, 2_000));
                printsWhenAnswered.push(await printCalls(page));
                await route.continue();
            });
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem()]}), [{name: `Zname${unique()}`}]);

            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            expect(printsWhenAnswered.length, "the files were asked for").toBeGreaterThanOrEqual(4);
            expect(new Set(printsWhenAnswered), "no print before the font's answer").toEqual(new Set([0]));
            const [moment] = await printMoments(page);
            expect([...moment.fonts].sort(), "loaded at the call").toEqual(["400 loaded", "400 loaded", "700 loaded", "700 loaded"]);
        });

    test("a clinic switched: Print follows the new clinic's template, never the old one @TPL-153 @smoke",
        async ({page, t, lang, data}) => {
            const u = unique();
            const rt = RX_TEXTS[lang];
            const owner = await data.clinic({name: `A ${u}`});
            const none = await data.clinic({name: `B ${u}`, ownerPhone: owner.owner.phone});
            const other = await data.clinic({name: `C ${u}`, ownerPhone: owner.owner.phone});
            const static1 = staticItem({text: `ZtemplateA${u}`});
            const static3 = staticItem({text: `ZtemplateC${u}`});
            await putTemplate(data, owner, layoutL({items: [textItem(), static1]}));
            await putTemplate(data, other, layoutL({page: A4, items: [textItem(), static3]}));
            const drug = await rxDrug(data, other, {name: `Zdrug${u}`});

            await stubPrint(page);
            await signIn(page, owner.owner.phone, {clinicId: owner.id});
            const rx = new RxPage(page, rt);
            await expect(printButton(rx.panel, rt), "clinic A has a template").toBeVisible();

            await openSwitchClinic(page, t);
            await pickerEntry(page, none.name).click();
            await expectContextLabel(page, none.name);
            await expect(rx.panel.getByRole("button", {name: rt.quickCopy, exact: true})).toBeVisible();
            await settled(page);
            await expect(printButton(rx.panel, rt), "clinic B has none").toHaveCount(0);

            await openSwitchClinic(page, t);
            await pickerEntry(page, other.name).click();
            await expectContextLabel(page, other.name);
            await addLines(rx, data, other, [drug]);
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);
            const {pages} = await printedPdf(page);
            expect(timesPrinted(pages, static3.text ?? ""), "clinic C's template").toBe(1);
            expect(timesPrinted(pages, static1.text ?? ""), "never clinic A's").toBe(0);
            expectPageSize(pages[0], 210, 297);
        });

    test("at 375, 600, 900 and 1280 px in both languages the panel's three buttons and the editor's Close, Print and Copy fit, no cut or overlap @TPL-305",
        async ({page, lang, data, isMobile}) => {
            test.skip(isMobile || lang !== "ar", "one project: both languages and every width inside the test");
            test.slow();
            await openPrescription(page, data, lang, layoutL(), [{name: `Zname${unique()}`}]);

            for (const language of ["ar", "en"] as const) {
                await setLanguage(page, language);
                const rt = RX_TEXTS[language];
                const rx = new RxPage(page, rt);
                for (const width of [375, 600, 900, 1280]) {
                    await test.step(`${language} at ${width} px`, async () => {
                        await page.setViewportSize({width, height: 800});
                        await noHorizontalScroll(page, `${language} ${width}`);
                        const buttons = [rt.quickCopy, rt.print, rt.editAndCopy].map(name => rx.panel.getByRole("button", {name, exact: true}));
                        for (const button of buttons) {
                            await expect(button).toBeVisible();
                            await fitsTheScreen(page, button, `${language} ${width}: a panel button`);
                        }
                        await expectNoCutOrOverlap(rx.panel, `${language} ${width}: the panel`);

                        const editor = await openEditor(page, rt);
                        for (const name of [rt.close, rt.print, rt.quickCopy]) {
                            const button = editor.getByRole("button", {name, exact: true});
                            await expect(button).toBeInViewport({ratio: 1});
                            await fitsTheScreen(page, button, `${language} ${width}: ${name} in the editor`);
                        }
                        await expectNoCutOrOverlap(editor, `${language} ${width}: the editor`);
                        await closeEditor(editor, rt);
                    });
                }
            }
        });

    test("with the print element present nothing of it shows on screen, no horizontal scroll, nothing inside it takes the focus, and axe passes @TPL-321",
        async ({page, lang, data, healthy}) => {
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({items: [textItem()]}), [{name: `Zname${unique()}`}]);
            await printButton(rx.panel, rt).click();
            await expectPrintCalls(page, 1);

            const root = printRoot(page);
            await expect(root).toBeAttached();
            await expect(root, "on screen").toBeHidden();
            await noHorizontalScroll(page, "with the print element");
            await expect(root.locator("a, button, input, select, textarea, [tabindex]"), "nothing focusable").toHaveCount(0);
            for (let i = 0; i < 8; i++) {
                await page.keyboard.press("Tab");
                const inRoot = await page.evaluate(() => document.activeElement?.closest("#clinichub-print-root") != null);
                expect(inRoot, "the focus stays out of it").toBe(false);
            }
            await healthy();
            await expect(sheetItem(page, 0, "t")).toBeAttached();
        });

    test("a printed prescription with afterprint fired, or a clinic with no template: the browser's own Ctrl+P prints the app, not a blank page, not the last sheet, no leftover page size @TPL-323",
        async ({page, lang, data, newBrowser}) => {
            test.slow();
            const u = unique();
            const name = `Zname${u}`;
            const patient = `Zpatient${u}`;
            const manual = manualItem();
            const {rx, rt} = await openPrescription(page, data, lang, layoutL({
                page: {size: "custom", widthMm: 100, heightMm: 120},
                items: [textItem({xMm: 5, yMm: 20, wMm: 90, hMm: 40}), {...manual, xMm: 5, yMm: 5, wMm: 90}],
            }), [{name}]);

            await printButton(rx.panel, rt).click();
            const popup = printPopup(page, rt);
            await popup.getByRole("textbox", {name: manual.name, exact: true}).fill(patient);
            await printButton(popup, rt).click();
            await expectPrintCalls(page, 1);
            expect(await pageRules(page), "the template's @page rule while printing").toBe(1);

            await finishPrint(page);
            await expect(printRoot(page)).toHaveCount(0);
            expect(await pageRules(page), "no @page rule left").toBe(0);
            const after = await printedPdf(page);
            expect(timesPrinted(after.pages, name), "the app's own text").toBeGreaterThanOrEqual(1);
            expect(timesPrinted(after.pages, patient), "not the last patient's sheet").toBe(0);

            // The same in a clinic with no template: today's size
            const other = await newBrowser();
            const plain = `Zplain${u}`;
            await openPrescription(other.page, data, lang, null, [{name: plain}]);
            expect(await pageRules(other.page)).toBe(0);
            const today = await printedPdf(other.page);
            expect(timesPrinted(today.pages, plain), "the app's own text").toBeGreaterThanOrEqual(1);
            expect(Math.abs(after.pages[0].widthPt - today.pages[0].widthPt), "the size the app prints at today").toBeLessThanOrEqual(MM_PT);
            expect(Math.abs(after.pages[0].heightPt - today.pages[0].heightPt), "the size the app prints at today").toBeLessThanOrEqual(MM_PT);
            expect(Math.abs(after.pages[0].widthPt - mmToPt(100)), "not the template's").toBeGreaterThan(MM_PT);
        });
});
