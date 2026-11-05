import {beforeEach, describe, expect, test, vi} from "vitest";
import {waitFor} from "@testing-library/react";
import {pastExitTransition} from "../../test";
import {
    aPrintedLine,
    confirmButton,
    editorPrint,
    fn,
    findPopup,
    manual,
    openEditor,
    openWithTemplate,
    pasteInEditor,
    popupFields,
    staticText,
    TEXT_ID,
    templateNowIs,
    templateOf,
    textBox,
    valueOn,
} from "../../test/pages/printFlow.tsx";

// A print of several sheets, which jsdom's layout can't give: the box's measure is faked here (`printMeasure` is the only part that
// needs layout, contract § 2.5). The sheets: contract § 3.4, D14; the flow's order: § 3.2 step 5, design § 4.4.

const measure = vi.hoisted(() => ({fits: vi.fn<(html: string) => boolean>(), dispose: vi.fn(), create: vi.fn(), font: vi.fn()}));

vi.mock("./printMeasure.ts", async original => ({
    ...await original<typeof import("./printMeasure.ts")>(),
    createTextMeasurer: measure.create,
    loadPrintFont: measure.font,
}));

/** The box holds one drug. */
const oneDrugPerSheet = (html: string) => (html.match(/<strong/g) ?? []).length <= 1;

const threeDrugs = () => [aPrintedLine("Drug1", "ملاحظة 1"), aPrintedLine("Drug2", "ملاحظة 2"), aPrintedLine("Drug3", "ملاحظة 3")];

beforeEach(() => {
    measure.fits.mockReset().mockImplementation(oneDrugPerSheet);
    measure.dispose.mockReset();
    measure.create.mockReset().mockImplementation(() => ({fits: measure.fits, dispose: measure.dispose}));
    measure.font.mockReset().mockImplementation(async () => undefined);
});

describe("continuation sheets @area:prescription", () => {
    test("every other item repeats in the same place with the same value @TPL-142 @smoke", async () => {
        const name = {...manual("m1", "الاسم"), xMm: 58, yMm: 46, wMm: 72, hMm: 8};
        const page = await openWithTemplate(templateOf(name, staticText("s1", "ثابت"), fn("f1", "dayOfMonth")), {lines: threeDrugs()});
        await page.pressPrint();
        const popup = await findPopup();
        await page.user.type(popupFields(popup)[0], "أحمد");
        await page.user.click(confirmButton(popup));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const sheets = page.sheets();
        expect(sheets).toHaveLength(3);
        const dayOfMonth = valueOn(sheets[0], "f1");
        for (const sheet of sheets) {
            expect(valueOn(sheet, "m1")).toBe("أحمد");
            expect(valueOn(sheet, "s1")).toBe("ثابت");
            expect(valueOn(sheet, "f1")).toBe(dayOfMonth);
            const box = page.itemOn(sheet, "m1")!;
            expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual(["58mm", "46mm", "72mm", "8mm"]);
        }
    });

    test("each sheet holds its own part of the text, in order, each drug once @TPL-142", async () => {
        const page = await openWithTemplate(templateOf(), {lines: threeDrugs()});
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const texts = page.sheets().map(sheet => textBox(sheet)?.textContent);
        expect(texts).toEqual(["Drug1ملاحظة 1", "Drug2ملاحظة 2", "Drug3ملاحظة 3"]);
    });

    test("`window.print` runs once for all the sheets @TPL-142", async () => {
        const page = await openWithTemplate(templateOf(), {lines: threeDrugs()});
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        await pastExitTransition();
        expect(page.print).toHaveBeenCalledTimes(1);
    });

    test("the page number on three sheets: 1/3, 2/3, 3/3, left to right @TPL-145 @smoke", async () => {
        const page = await openWithTemplate(templateOf(fn("p1", "pageNumber")), {lines: threeDrugs()});
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        expect(page.sheets().map(sheet => valueOn(sheet, "p1"))).toEqual(["1/3", "2/3", "3/3"]);
        expect(page.itemOn(page.sheets()[0], "p1")!.querySelector("[dir=ltr]")).not.toBeNull();
    });

    test("one sheet: the page number prints nothing, its box stays empty @TPL-145", async () => {
        const page = await openWithTemplate(templateOf(fn("p1", "pageNumber")), {lines: [aPrintedLine()]});
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        expect(page.sheets()).toHaveLength(1);
        expect(valueOn(page.sheets()[0], "p1")).toBe("");
    });

    test("every page has the same date and time, from the one confirm @TPL-316", async () => {
        vi.useFakeTimers({toFake: ["Date"]});
        vi.setSystemTime(new Date(2026, 10, 5, 23, 59));
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم"), fn("d1", "fullDate"), fn("t1", "time")), {lines: threeDrugs()});
        await page.pressPrint();
        const popup = await findPopup();
        vi.setSystemTime(new Date(2026, 10, 6, 0, 1));
        await page.user.click(confirmButton(popup));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const sheets = page.sheets();
        expect(sheets).toHaveLength(3);
        for (const sheet of sheets) {
            expect(valueOn(sheet, "d1")).toBe("6 نوفمبر 2026");
            expect(valueOn(sheet, "t1")).toBe("12:01 ص");
        }
    });
});

describe("the print flow's order @area:prescription", () => {
    test("the font, then the measure with the fresh template's text box, then the print; the box is gone before it @TPL-150", async () => {
        const page = await openWithTemplate(templateOf());
        const fresh = templateOf();
        fresh.layout.items[0] = {...fresh.layout.items[0], wMm: 77, hMm: 44};
        templateNowIs(fresh);

        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        expect(measure.create).toHaveBeenCalledTimes(1);
        expect(measure.create.mock.calls[0][0]).toMatchObject({id: TEXT_ID, kind: "prescriptionText", wMm: 77, hMm: 44});
        const [font] = measure.font.mock.invocationCallOrder;
        const [created] = measure.create.mock.invocationCallOrder;
        const [disposed] = measure.dispose.mock.invocationCallOrder;
        const [printed] = page.print.mock.invocationCallOrder;
        expect(font).toBeLessThan(created);
        expect(created).toBeLessThan(disposed);
        expect(disposed).toBeLessThan(printed);
    });

    test("the print waits for the font @TPL-332", async () => {
        let fontLoaded = () => undefined as void;
        measure.font.mockImplementation(() => new Promise<void>(resolve => {
            fontLoaded = resolve;
        }));
        const page = await openWithTemplate(templateOf());

        await page.pressPrint();
        await waitFor(() => expect(measure.font).toHaveBeenCalledTimes(1));
        await pastExitTransition();
        expect(page.print).not.toHaveBeenCalled();

        fontLoaded();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
    });

    test("the page gone while the font loads: nothing is measured or printed @TPL-341", async () => {
        let fontLoaded = () => undefined as void;
        measure.font.mockImplementation(() => new Promise<void>(resolve => {
            fontLoaded = resolve;
        }));
        const page = await openWithTemplate(templateOf());
        await page.pressPrint();
        await waitFor(() => expect(measure.font).toHaveBeenCalledTimes(1));

        page.unmount();
        fontLoaded();
        await pastExitTransition();

        expect(measure.create).not.toHaveBeenCalled();
        expect(page.print).not.toHaveBeenCalled();
        expect(page.printRoot()).toBeNull();
    });

    test("what's measured and printed is the cleaned text: a link the editor holds leaves its tag behind, in both @TPL-133", async () => {
        const page = await openWithTemplate(templateOf());
        const editor = await openEditor(page);
        pasteInEditor('<p>قبل <a href="https://example.test/x">الرابط</a> بعد</p>');
        await waitFor(() => expect(document.querySelector(".ql-editor a")).not.toBeNull());
        await waitFor(() => expect(editorPrint(editor)).toBeEnabled());

        await page.user.click(editorPrint(editor));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        expect(measure.fits).toHaveBeenCalled();
        for (const [html] of measure.fits.mock.calls) expect(html).not.toMatch(/<a\b|href/);
        const box = textBox(page.sheets()[0])!;
        expect(box.querySelector("a")).toBeNull();
        expect(box.textContent).toBe("قبل الرابط بعد");
    });

    test("a name or a note that looks like tags prints as its text: no element is made @TPL-133", async () => {
        const page = await openWithTemplate(templateOf(), {lines: [aPrintedLine("<img src=x onerror=alert(1)>", "<script>alert(2)</script>")]});

        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        for (const [html] of measure.fits.mock.calls) expect(html).not.toMatch(/<(img|script)/);
        const box = textBox(page.sheets()[0])!;
        expect(box.querySelector("img, script")).toBeNull();
        expect(box.textContent).toBe("<img src=x onerror=alert(1)><script>alert(2)</script>");
    });
});
