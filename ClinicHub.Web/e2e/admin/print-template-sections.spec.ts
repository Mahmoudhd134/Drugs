import type {Page} from "@playwright/test";
import {expect, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    addLines,
    expectPrintCalls,
    functionItem,
    moveMouseOff,
    type PdfPage,
    type PdfText,
    printButton,
    printedPdf,
    printPopup,
    printSheets,
    runMm,
    stubPrint,
} from "../support/print.ts";
import {
    A5,
    COMPUTER_ONLY,
    type Designer,
    designerOf,
    designerShown,
    expectClose,
    type Layout,
    type LayoutItem,
    layoutL,
    manualItem,
    openDesigner,
    openDesignerWithPaper,
    openSection,
    putTemplate,
    staticItem,
    tabPath,
    textItem,
} from "../support/print-template.ts";
import {paperPng} from "../support/paper-files.ts";
import {RxPage, rxDrug} from "../support/rx.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import {expectNoCutOrOverlap, noHorizontalScroll, pageChecks} from "../support/ux.ts";

/** The settings' sections and an item's alignment through the real app, in real layout and real PDFs: step 4 contract § 4.3.1, § 4.3.2. The rules behind them: `TemplateDesigner.sections.test.tsx`, `TemplateDesigner.align.test.tsx`. */

const SECTIONS = ["page", "calibration", "item", "paper"] as const;

const pageScroll = (page: Page) => page.evaluate(() => {
    const {scrollHeight, clientHeight} = document.documentElement;
    return {y: window.scrollY, grows: scrollHeight - clientHeight};
});

/** Every section's header wholly in the window, and the sheet. */
const expectHeadersAndSheetInView = async (designer: Designer, what: string) => {
    for (const section of SECTIONS) await expect(designer.section(section), `${what}: the header of ${section}`).toBeInViewport({ratio: 1});
    await expect(designer.sheet, `${what}: the sheet`).toBeInViewport();
};

test.describe("The settings' sections, on the screen @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("1280 x 800, an item selected: its header, its fields and the sheet are in view with no page scroll; the settings scroll inside themselves to every other header; closed, all four show together; the sheet stays while the opacity moves @TPL-734",
        async ({page, data, lang, healthy}) => {
            await page.setViewportSize({width: 1280, height: 800});
            const {designer, pt} = await openDesignerWithPaper(page, data, lang, layoutL(), paperPng());

            await designer.box("m").click();
            await expect(designer.section("item")).toHaveAttribute("aria-expanded", "true");
            await expect(designer.field(pt.x)).toBeVisible();

            // Selecting brought the section into view in its column (contract § 4.3.1), and the page never moved
            await expect(designer.section("item")).toBeInViewport({ratio: 1});
            await expect(designer.field(pt.x)).toBeInViewport({ratio: 1});
            await expect(designer.sheet).toBeInViewport();
            expect(await pageScroll(page), "no page scroll").toEqual({y: 0, grows: 0});

            // The settings scroll inside themselves, never growing past the area
            const [settings, area] = [(await designer.settings.boundingBox())!, (await designer.area.boundingBox())!];
            expect(settings.y + settings.height, "the settings end with the area").toBeLessThanOrEqual(area.y + area.height + 1);
            await expect(designer.settings).toHaveCSS("overflow-y", "auto");
            expect(await designer.settings.evaluate(panel => panel.scrollHeight - panel.clientHeight), "the item's section is more than the panel shows").toBeGreaterThan(0);

            // Each header by the settings' own scroll: the page and the sheet stay
            const sheetAt = await designer.sheet.boundingBox();
            for (const section of SECTIONS) {
                await designer.section(section).scrollIntoViewIfNeeded();
                await expect(designer.section(section), `the header of ${section}`).toBeInViewport({ratio: 1});
                expect(await designer.sheet.boundingBox(), `the sheet, with the header of ${section} in view`).toEqual(sheetAt);
                expect(await pageScroll(page), `no page scroll, with the header of ${section} in view`).toEqual({y: 0, grows: 0});
            }

            // Closed: the item stays selected, and all four headers show at once
            await designer.section("item").click();
            await expect(designer.section("item")).toHaveAttribute("aria-expanded", "false");
            await expect(designer.box("m")).toHaveAttribute("aria-pressed", "true");
            await expectHeadersAndSheetInView(designer, "the item selected, its section closed");
            expect(await pageScroll(page), "no page scroll").toEqual({y: 0, grows: 0});

            // The opacity by hand, watching the sheet
            await openSection(designer, "paper");
            await expect(designer.paperOpacity).toBeVisible();
            await designer.paperOpacity.scrollIntoViewIfNeeded();
            await expectHeadersAndSheetInViewWhileMoving(page, designer);
            await healthy();
        });

    for (const width of [1000, 1280]) {
        test(`the paired number fields at ${width} px: labels whole, the inputs level, no axe failure @TPL-735`,
            async ({page, data, lang}) => {
                await page.setViewportSize({width, height: 800});
                const {designer, pt} = await openDesigner(page, data, lang, {
                    ...layoutL(),
                    page: {size: "custom", widthMm: 160, heightMm: 220},
                });
                const main = page.locator("main");

                // The sheet's pair, both on: a custom size
                await expect(designer.section("page")).toHaveAttribute("aria-expanded", "true");
                await expectLevel(designer.field(pt.pageWidth), designer.field(pt.pageHeight), "the sheet's width and height");
                await expectNoCutOrOverlap(main, `the sheet's section at ${width} px`);
                await noHorizontalScroll(page, `the sheet's section at ${width} px`);
                await pageChecks(page, `the sheet's section at ${width} px`);

                // The item's two pairs
                await designer.box("m").click();
                await expect(designer.section("item")).toHaveAttribute("aria-expanded", "true");
                await expect(designer.field(pt.x)).toBeVisible();
                await expectLevel(designer.field(pt.x), designer.field(pt.y), "the item's X and Y");
                await expectLevel(designer.field(pt.width), designer.field(pt.height), "the item's width and height");
                await expectNoCutOrOverlap(main, `the item's section at ${width} px`);
                await noHorizontalScroll(page, `the item's section at ${width} px`);
                await pageChecks(page, `the item's section at ${width} px`);

                // With a message under one of a pair: the two inputs stay level
                await designer.field(pt.x).fill("500");
                await expect(designer.settings.getByText(pt.outside, {exact: true})).toBeVisible();
                await expectLevel(designer.field(pt.x), designer.field(pt.y), "X with its message, and Y");
                await expectNoCutOrOverlap(main, `a message in a pair at ${width} px`);
                await pageChecks(page, `a message in a pair at ${width} px`);
            });
    }
});

/** Two fields of a pair, side by side in one column's width, at one height. */
const expectLevel = async (a: ReturnType<Designer["field"]>, b: ReturnType<Designer["field"]>, what: string) => {
    await expect.poll(async () => {
        const [first, second] = [await a.boundingBox(), await b.boundingBox()];
        if (!first || !second) return null;
        return {level: Math.abs(first.y - second.y) <= 1, apart: first.x + first.width <= second.x + 1 || second.x + second.width <= first.x + 1};
    }, {message: `${what}: level and side by side`}).toEqual({level: true, apart: true});
};

/** The slider moved by keys and by a press on its track: the opacity follows, and the sheet doesn't move on the screen. */
const expectHeadersAndSheetInViewWhileMoving = async (page: Page, designer: Designer) => {
    const before = (await designer.sheet.boundingBox())!;
    await designer.paperOpacity.focus();
    await expect(designer.paperOpacity).toHaveAttribute("aria-valuetext", "50%");
    await designer.paperOpacity.press("ArrowUp");
    await expect(designer.paperOpacity).toHaveAttribute("aria-valuetext", "60%");
    await expect(designer.paperImage).toHaveCSS("opacity", "0.6");
    expect(await designer.sheet.boundingBox(), "the sheet stays where it was").toEqual(before);
    await expect(designer.sheet).toBeInViewport();

    // The track by the panel's own scroll: at 1280 x 800 it can sit below the panel's fold, where a press would land outside the panel
    const slider = designer.settings.locator(".MuiSlider-root");
    await slider.scrollIntoViewIfNeeded();
    await expect(slider, "the track is in the window").toBeInViewport();
    const [track, panel] = [await slider.boundingBox(), await designer.settings.boundingBox()];
    if (!track || !panel) throw new Error("the slider isn't on screen");
    const press = {x: track.x + track.width * 0.9, y: track.y + track.height / 2};
    expect(press.y, "the press lands inside the panel").toBeGreaterThanOrEqual(panel.y);
    expect(press.y, "the press lands inside the panel").toBeLessThanOrEqual(panel.y + panel.height);
    await page.mouse.click(press.x, press.y);
    await expect.poll(async () => designer.paperOpacity.getAttribute("aria-valuetext"), {message: "a press near the track's far end"}).not.toBe("60%");
    expect(await designer.sheet.boundingBox(), "the sheet stays where it was").toEqual(before);
    await expect(designer.sheet).toBeInViewport();
    expect((await pageScroll(page)).y, "the page isn't scrolled").toBe(0);
};

const ALIGNS = ["right", "center", "left"] as const;
type Align = (typeof ALIGNS)[number];

/** 0.5 mm, the case's reach, in mm. */
const WITHIN_MM = 0.5;

/**
 * A static text, a manual input and an ISO value at each alignment, each on its row, far from the rulers and from the prescription text. The boxes are far wider than their runs, so the three
 * alignments lie far apart, and a value at the wrong one fails by much more than the reach. An Arabic static text too, whose letters come out of the PDF in runs of their own.
 */
const alignmentLayout = (u: string) => {
    const box = {xMm: 30, wMm: 100, hMm: 7, fontSizePt: 11};
    const rows: { item: LayoutItem; align: Align; token: RegExp }[] = [];
    let yMm = 15;
    for (const align of ALIGNS) {
        const add = (item: LayoutItem, token: RegExp) => {
            rows.push({item: {...item, ...box, yMm, align}, align, token});
            yMm += 8;
        };
        add(staticItem({id: `s-${align}`, text: `Zs${align}${u}`}), new RegExp(`Zs${align}${u}`));
        add(manualItem({id: `m-${align}`, name: `Zm${align}${u}`}), new RegExp(`Zm${align}${u}`));
        add(functionItem("isoDateTime", {id: `i-${align}`, name: `iso ${align}`}), /2026-11-05T14:30/);
        add(staticItem({id: `a-${align}`, text: "يُصرف"}), /[؀-ۿﭐ-﷿ﹰ-ﻼ]/);
    }
    const layout: Layout = {schemaVersion: 1, page: A5, items: [textItem({xMm: 14, yMm: 130, wMm: 120, hMm: 70}), ...rows.map(row => row.item)]};
    return {layout, rows};
};

/** The row's value on the PDF's page: where its first run starts and its last ends, in mm, among the runs on the box's height. */
const rowEdges = (pdf: PdfPage, {item, token}: { item: LayoutItem; token: RegExp }) => {
    const runs = pdf.items.filter((run: PdfText) => {
        const {y} = runMm(run);
        return y >= item.yMm && y <= item.yMm + item.hMm && token.test(run.text);
    });
    expect(runs.length, `${item.id}: its value is printed on its row`).toBeGreaterThan(0);
    return {
        start: Math.min(...runs.map(run => run.xPt)) / (72 / 25.4),
        end: Math.max(...runs.map(run => run.xPt + run.widthPt)) / (72 / 25.4),
    };
};

/** Each row's run ends at its box's right, centers on it, or starts at its left, within the reach, and the run is short enough for that to mean something. */
const expectAligned = (pdf: PdfPage, rows: ReturnType<typeof alignmentLayout>["rows"], what: string) => {
    for (const row of rows) {
        const {start, end} = rowEdges(pdf, row);
        const [left, right] = [row.item.xMm, row.item.xMm + row.item.wMm];
        const where = `${what}: ${row.item.id}, from ${start} to ${end} mm in a box from ${left} to ${right}`;
        expect(right - left - (end - start), `${where}: its run leaves room to tell the sides apart`).toBeGreaterThan(20);
        const off = {right: end - right, center: (start + end) / 2 - (left + right) / 2, left: start - left}[row.align];
        expect(Math.abs(off), `${where}: at ${row.align}`).toBeLessThanOrEqual(WITHIN_MM);
    }
};

test.describe("An item's alignment, in real PDFs @area:admin", () => {
    test.skip(({isMobile}) => isMobile, COMPUTER_ONLY);

    test("a static text, a manual input and an ISO value at right, center and left: in the real print's PDF and in Test print's, each run lands there within 0.5 mm, the box itself unmoved @TPL-740 @smoke",
        async ({page, data, lang, newBrowser}) => {
            test.slow();
            const u = unique();
            const {layout, rows} = alignmentLayout(u);
            const when = new Date(2026, 10, 5, 14, 30);
            const clinic = await data.clinic();
            await putTemplate(data, clinic, layout);
            const member = await data.staff(clinic, {roles: ["Doctor"]});
            const drug = await rxDrug(data, clinic, {name: `Zdrug${u}`});

            // The real print, a staff member in a browser of their own
            const staff = await newBrowser();
            await stubPrint(staff.page);
            await staff.page.clock.setFixedTime(when);
            await signIn(staff.page, member.phone);
            const rt = RX_TEXTS[lang];
            const rx = new RxPage(staff.page, rt);
            await addLines(rx, data, clinic, [drug]);
            await moveMouseOff(staff.page);
            await printButton(rx.panel, rt).click();
            const popup = printPopup(staff.page, rt);
            // The value typed is the name, so the run is the one Test print shows
            for (const {item} of rows.filter(row => row.item.kind === "manualInput")) await popup.getByRole("textbox", {name: item.name, exact: true}).fill(item.name ?? "");
            await printButton(popup, rt).click();
            await expect(popup).toBeHidden();
            await expectPrintCalls(staff.page, 1);
            const [real] = await printSheets(staff.page);
            const realPdf = await printedPdf(staff.page);
            expect(realPdf.pages).toHaveLength(1);

            // Test print, the super admin
            await stubPrint(page);
            await page.clock.setFixedTime(when);
            const designer = designerOf(page, lang);
            await signInSuperAdmin(page, tabPath(clinic));
            await designerShown(designer);
            await moveMouseOff(page);
            await designer.testPrint.click();
            await expectPrintCalls(page, 1);
            const [sample] = await printSheets(page);
            const samplePdf = await printedPdf(page);
            expect(samplePdf.pages).toHaveLength(1);

            expectAligned(realPdf.pages[0], rows, "the real print");
            expectAligned(samplePdf.pages[0], rows, "Test print");

            for (const {item} of rows) {
                const expected = {x: item.xMm, y: item.yMm, w: item.wMm, h: item.hMm};
                for (const [sheet, what] of [[real, "the real print"], [sample, "Test print"]] as const) {
                    const shown = sheet.items[item.id];
                    expectClose({x: shown.xMm, y: shown.yMm, w: shown.wMm, h: shown.hMm}, expected, `${what}: the box ${item.id} stays where it's designed`);
                }
            }
        });

    test("the buttons on the screen read left, center, right from the screen's left, and each one's value lands on its side of the box on the sheet @TPL-741",
        async ({page, data, lang}) => {
            const {designer} = await openDesigner(page, data, lang, {
                schemaVersion: 1,
                page: A5,
                items: [textItem({yMm: 100}), staticItem({id: "s", text: "Zvalue", xMm: 30, yMm: 20, wMm: 100, hMm: 8})],
            });
            await designer.box("s").click();
            await expect(designer.alignGroup).toBeVisible();

            const xOf = async (align: Align) => (await designer.alignButton(align).boundingBox())!.x;
            const [left, center, right] = [await xOf("left"), await xOf("center"), await xOf("right")];
            expect(left, "left, then center, from the screen's left").toBeLessThan(center);
            expect(center, "center, then right").toBeLessThan(right);

            /** Where the value's text sits in its box, measured on the screen. */
            const valueSide = () => designer.box("s").evaluate(box => {
                const range = document.createRange();
                range.selectNodeContents(box.querySelector("span")!);
                const [text, outer] = [range.getBoundingClientRect(), box.getBoundingClientRect()];
                return {fromLeft: text.left - outer.left, fromRight: outer.right - text.right};
            });
            await expect.poll(async () => {
                const {fromLeft, fromRight} = await valueSide();
                return fromRight < fromLeft;
            }, {message: "right by default: nearer the box's right"}).toBe(true);

            await designer.alignButton("left").click();
            await expect.poll(async () => {
                const {fromLeft, fromRight} = await valueSide();
                return fromLeft < fromRight;
            }, {message: "the left button: nearer the box's left"}).toBe(true);
        });
});
