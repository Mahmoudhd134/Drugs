import {describe, expect, test, vi} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {aPrintLayout, aTemplateItem, fillIn, recordRequests, renderWithProviders, toastTexts} from "../../test";
import {textOf} from "../../test/htmlShape.ts";
import {storedLines} from "../../test/pages/prescription.tsx";
import {TemplateSheet} from "./components/TemplateSheet.tsx";
import {paginate} from "./pagination.ts";
import {cleanPrintHtml} from "./printHtml.ts";
import {createTextMeasurer, printTextStyle} from "./printMeasure.ts";
import type {PrescriptionTextItem} from "./types.ts";
import {
    aPrintedLine,
    confirmButton,
    editorPrint,
    editorText,
    fn,
    findPopup,
    manual,
    openEditor,
    openWithTemplate,
    pageRules,
    popupFields,
    PRINT,
    queryPopup,
    settled,
    staticText,
    templateOf,
    textBox,
    typeInEditor,
    valueOn,
} from "../../test/pages/printFlow.tsx";

// What prints, jsdom's one sheet (page counts and geometry are e2e's): contract §§ 3.2, 3.4; design §§ 3, 4.4, 4.5.

describe("the printed values @area:prescription", () => {
    test("names never print: only values @TPL-132 @smoke", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "اسم الحقل"), fn("f1", "dayOfMonth")));
        await page.pressPrint();
        const popup = await findPopup();
        await page.user.type(popupFields(popup)[0], "أحمد");
        await page.user.click(confirmButton(popup));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const [sheet] = page.sheets();
        expect(valueOn(sheet, "m1")).toBe("أحمد");
        expect(valueOn(sheet, "f1")).toMatch(/^\d+$/);
        expect(sheet.textContent).not.toContain("اسم الحقل");
        expect(sheet.textContent).not.toContain("اسم dayOfMonth");
    });

    test("a manual input left empty shows nothing in its box, not its name @TPL-132", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "اسم الحقل")));
        await page.pressPrint();
        await page.user.click(confirmButton(await findPopup()));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        expect(valueOn(page.sheets()[0], "m1")).toBe("");
    });

    test.each([
        ["an image with onerror", "<img src=x onerror=window.__printed=1>"],
        ["bold", "<b>x</b>"],
        ["a script", "<script>window.__printed=1</script>"],
    ])("a manual value that looks like %s prints literally as text: no element, nothing runs @TPL-313 @smoke", async (_name, value) => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")));
        await page.pressPrint();
        const popup = await findPopup();
        await fillIn(page.user, popupFields(popup)[0], value);
        await page.user.click(confirmButton(popup));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const box = page.itemOn(page.sheets()[0], "m1")!;
        expect(box.textContent).toBe(value);
        expect(box.querySelector("img, b, script")).toBeNull();
        expect((window as unknown as Record<string, unknown>).__printed).toBeUndefined();
    });

    test.each([
        ["an image with onerror", "<img src=x onerror=window.__printed=1>"],
        ["bold", "<b>x</b>"],
    ])("static text that looks like %s prints literally as text @TPL-313", async (_name, text) => {
        const page = await openWithTemplate(templateOf(staticText("s1", text)));
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const box = page.itemOn(page.sheets()[0], "s1")!;
        expect(box.textContent).toBe(text);
        expect(box.querySelector("img, b")).toBeNull();
        expect((window as unknown as Record<string, unknown>).__printed).toBeUndefined();
    });
});

describe("each line of a short item takes its own language's direction @area:prescription", () => {
    const THREE_LINES = "Dr. Ahmed\nدكتور أحمد\nConsultant";
    const valueSpan = (box: HTMLElement | null) => box?.querySelector("span") as HTMLElement;

    test("a static text in three languages' lines: dir=auto and `unicode-bidi: plaintext`, its lines as typed @TPL-350 @smoke", async () => {
        const page = await openWithTemplate(templateOf(staticText("s1", THREE_LINES)));
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const span = valueSpan(page.itemOn(page.sheets()[0], "s1"));
        expect(span).toHaveAttribute("dir", "auto");
        expect(span.style.unicodeBidi).toBe("plaintext");
        expect(span.textContent).toBe(THREE_LINES);
    });

    test("a manual value too @TPL-350", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")));
        await page.pressPrint();
        const popup = await findPopup();
        await page.user.type(popupFields(popup)[0], "Ahmed أحمد");
        await page.user.click(confirmButton(popup));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const span = valueSpan(page.itemOn(page.sheets()[0], "m1"));
        expect(span).toHaveAttribute("dir", "auto");
        expect(span.style.unicodeBidi).toBe("plaintext");
    });

    test.each(["fullDate", "time", "dayOfWeek", "dayOfMonth"] as const)("the function %s, which reads in its own direction, too @TPL-350", async name => {
        const page = await openWithTemplate(templateOf(fn("f1", name)));
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const span = valueSpan(page.itemOn(page.sheets()[0], "f1"));
        expect(span).toHaveAttribute("dir", "auto");
        expect(span.style.unicodeBidi).toBe("plaintext");
    });

    test.each([
        ["a page number", "pageNumber", "2/3"],
        ["an ISO date", "isoDateTime", "2026-11-05T14:30"],
    ] as const)("%s has dir=ltr, and no `unicode-bidi`, which would give it back to its letters @TPL-350 @TPL-318", async (_name, name, value) => {
        const layout = aPrintLayout({items: [aTemplateItem("function", {id: "f1", function: name})]});
        await renderWithProviders(<TemplateSheet layout={layout} sampleText="" print={{textHtml: "", values: {f1: value}}}/>);

        const span = valueSpan(screen.getByTestId("print-sheet").querySelector<HTMLElement>('[data-item-id="f1"]'));
        expect(span).toHaveAttribute("dir", "ltr");
        expect(span.textContent).toBe(value);
        expect(span.style.unicodeBidi).toBe("");
    });

    test.each([
        ["with a selection handler, as the designer has it", true],
        ["a preview with none", false],
    ])("the designer's sheet has it too: every item's text, %s @TPL-350", async (_name, designing) => {
        const items = [
            aTemplateItem("prescriptionText", {id: "text"}),
            aTemplateItem("staticText", {id: "s1", text: THREE_LINES}),
            aTemplateItem("manualInput", {id: "m1", name: "الاسم"}),
            aTemplateItem("function", {id: "f1", function: "fullDate", name: "التاريخ"}),
        ];
        await renderWithProviders(<TemplateSheet layout={aPrintLayout({items})} sampleText="نص" onSelect={designing ? vi.fn() : undefined}/>);

        const sheet = screen.getByTestId("template-sheet");
        for (const {id} of items) {
            const span = valueSpan(sheet.querySelector<HTMLElement>(`[data-item-id="${id}"]`));
            expect(span).toHaveAttribute("dir", "auto");
            expect(span.style.unicodeBidi).toBe("plaintext");
        }
    });
});

describe("repeated spaces and tabs print as typed @area:prescription", () => {
    const TYPED = "a    b\tc";

    test("the printed text's style keeps them, beside its other rules @TPL-351", () => {
        expect(printTextStyle(14)).toMatchObject({whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: "start", fontSize: "14pt"});
    });

    test("the sheet's `.print-text` has white-space: pre-wrap @TPL-351 @smoke", async () => {
        const page = await openWithTemplate(templateOf());
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        expect(textBox(page.sheets()[0])?.style.whiteSpace).toBe("pre-wrap");
    });

    test("the hidden box that measures it has it too, so the two agree @TPL-351 @smoke", async () => {
        const item = aTemplateItem("prescriptionText", {id: "text", fontSizePt: 14}) as PrescriptionTextItem;
        const html = `<p>${TYPED}</p>`;
        await renderWithProviders(<TemplateSheet layout={aPrintLayout({items: [item]})} sampleText="" print={{textHtml: html, values: {}}}/>);
        const onTheSheet = screen.getByTestId("print-sheet").querySelector<HTMLElement>(".print-text")!;

        const measurer = createTextMeasurer(item);
        try {
            const measuring = Array.from(document.querySelectorAll<HTMLElement>(".print-text")).find(box => box !== onTheSheet)!;
            measurer.fits(html);
            expect(measuring.innerHTML).toBe(html);
            expect(measuring.style.whiteSpace).toBe("pre-wrap");
            expect(measuring.style.whiteSpace).toBe(onTheSheet.style.whiteSpace);
            expect(measuring.style.fontSize).toBe(onTheSheet.style.fontSize);
        } finally {
            measurer.dispose();
        }
    });

    test("they reach the sheet's HTML through the cleaning and `paginate`, as typed @TPL-351", () => {
        expect(paginate(cleanPrintHtml(`<p>${TYPED}</p>`), () => true)).toEqual([`<p>${TYPED}</p>`]);
    });

    test("spaces at a line's two ends and inside a bold tag stay too @TPL-351", () => {
        const html = "<p>  a  <strong>b    c</strong>\t</p>";
        expect(paginate(cleanPrintHtml(html), () => true)).toEqual([html]);
    });

    test.each([
        ["spaces", "<p>aaa    bbb\tccc</p>", 7, ["<p>aaa    </p>", "<p>bbb\tccc</p>"]],
        ["tabs", "<p>aaa\t\tbbb</p>", 5, ["<p>aaa\t\t</p>", "<p>bbb</p>"]],
        ["inside a kept tag", "<p><strong>aaa  bbb</strong></p>", 5, ["<p><strong>aaa  </strong></p>", "<p><strong>bbb</strong></p>"]],
    ])("across a cut, %s stay whole, on the first part: nothing is lost @TPL-351", (_name, html, characters, sheets) => {
        expect(paginate(cleanPrintHtml(html), sheet => textOf(sheet).length <= characters)).toEqual(sheets);
    });

    test("typed in the editor, they reach the sheet as typed @TPL-351", async () => {
        const page = await openWithTemplate(templateOf());
        const editor = await openEditor(page);
        typeInEditor(TYPED);
        await waitFor(() => expect(editorText()).toBe(TYPED));
        await waitFor(() => expect(editorPrint(editor)).toBeEnabled());

        await page.user.click(editorPrint(editor));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        expect(textBox(page.sheets()[0])?.textContent).toBe(TYPED);
    });
});

describe("the clock @area:prescription", () => {
    const CLOCK = () => templateOf(fn("date", "fullDate"), fn("time", "time"), fn("iso", "isoDateTime"));

    test("the pop-up opened at 23:59 and confirmed at 00:01: the new day, and the time `12:01 ص` @TPL-316 @smoke", async () => {
        vi.useFakeTimers({toFake: ["Date"]});
        vi.setSystemTime(new Date(2026, 10, 5, 23, 59));
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم"), fn("date", "fullDate"), fn("time", "time"), fn("day", "dayOfWeek"), fn("dom", "dayOfMonth"), fn("iso", "isoDateTime")));
        await page.pressPrint();
        const popup = await findPopup();

        vi.setSystemTime(new Date(2026, 10, 6, 0, 1));
        await page.user.click(confirmButton(popup));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const [sheet] = page.sheets();
        expect(valueOn(sheet, "date")).toBe("6 نوفمبر 2026");
        expect(valueOn(sheet, "time")).toBe("12:01 ص");
        expect(valueOn(sheet, "day")).toBe("الجمعة");
        expect(valueOn(sheet, "dom")).toBe("6");
        expect(valueOn(sheet, "iso")).toBe("2026-11-06T00:01");
    });

    test("with no pop-up, the time of the click, not of the page's load @TPL-316", async () => {
        vi.useFakeTimers({toFake: ["Date"]});
        vi.setSystemTime(new Date(2026, 10, 5, 8, 0));
        const page = await openWithTemplate(CLOCK());

        vi.setSystemTime(new Date(2026, 10, 5, 14, 30));
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const [sheet] = page.sheets();
        expect(valueOn(sheet, "date")).toBe("5 نوفمبر 2026");
        expect(valueOn(sheet, "time")).toBe("2:30 م");
        expect(valueOn(sheet, "iso")).toBe("2026-11-05T14:30");
    });

    test("a second print takes its own time @TPL-316", async () => {
        vi.useFakeTimers({toFake: ["Date"]});
        vi.setSystemTime(new Date(2026, 10, 5, 14, 30));
        const page = await openWithTemplate(CLOCK());
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(valueOn(page.sheets()[0], "time")).toBe("2:30 م");
        page.finishPrint();

        vi.setSystemTime(new Date(2026, 10, 5, 14, 45));
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(2));

        expect(valueOn(page.sheets()[0], "time")).toBe("2:45 م");
    });
});

describe("after the browser's dialog @area:prescription", () => {
    test("cancelled from the panel: the app is back, the lines unchanged, no toast, no write; Print works again and the pop-up starts empty @TPL-319 @smoke", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")), {lines: [aPrintedLine("Tobradex", "ملاحظة")]});
        const before = storedLines();
        const requests = recordRequests();
        await page.pressPrint();
        const popup = await findPopup();
        await page.user.type(popupFields(popup)[0], "أحمد");
        await page.user.click(confirmButton(popup));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        page.finishPrint();

        expect(page.printRoot()).toBeNull();
        expect(pageRules()).toEqual([]);
        await settled();
        expect(toastTexts()).toEqual([]);
        expect(requests.writes()).toEqual([]);
        expect(storedLines()).toEqual(before);
        expect(page.selection().getByText("Tobradex")).toBeInTheDocument();

        await page.pressPrint();
        const again = await findPopup();
        expect(popupFields(again)[0]).toHaveValue("");
        await page.user.click(confirmButton(again));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(2));
    });

    test("cancelled from the editor: the editor is there with its edits @TPL-319", async () => {
        const page = await openWithTemplate(templateOf());
        const editor = await openEditor(page);
        typeInEditor("نص معدل");
        await waitFor(() => expect(editorPrint(editor)).toBeEnabled());
        const requests = recordRequests();
        await page.user.click(editorPrint(editor));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        page.finishPrint();

        expect(page.printRoot()).toBeNull();
        expect(editorText()).toContain("نص معدل");
        await settled();
        expect(toastTexts()).toEqual([]);
        expect(requests.writes()).toEqual([]);
    });

    test("`afterprint` never fired, Print again: one print element, one `@page` rule, the new values and text, `window.print` called again @TPL-320 @smoke", async () => {
        const page = await openWithTemplate(templateOf(manual("m1", "الاسم")), {lines: [aPrintedLine("Tobradex", "ملاحظة")]});
        await page.pressPrint();
        let popup = await findPopup();
        await page.user.type(popupFields(popup)[0], "الأول");
        await page.user.click(confirmButton(popup));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(textBox(page.sheets()[0])?.textContent).toContain("Tobradex");
        await waitFor(() => expect(queryPopup()).not.toBeInTheDocument());

        const editor = await openEditor(page);
        typeInEditor("نص معدل");
        await waitFor(() => expect(editorPrint(editor)).toBeEnabled());
        await page.user.click(editorPrint(editor));
        popup = await findPopup();
        await page.user.type(popupFields(popup)[0], "الثاني");
        await page.user.click(confirmButton(popup));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(2));

        expect(page.printRoots()).toHaveLength(1);
        expect(pageRules()).toHaveLength(1);
        const sheets = page.sheets();
        expect(sheets).toHaveLength(1);
        expect(valueOn(sheets[0], "m1")).toBe("الثاني");
        expect(textBox(sheets[0])?.textContent).toContain("نص معدل");
        expect(textBox(sheets[0])?.textContent).not.toContain("Tobradex");
    });

    test("the `@page` rule is the template's size, with no margin @TPL-320", async () => {
        const template = templateOf();
        template.layout.page = {size: "custom", widthMm: 210, heightMm: 148};
        const page = await openWithTemplate(template);
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const css = page.printRoot()?.querySelector("style")?.textContent ?? "";
        expect(css).toMatch(/@page\s*\{\s*size:\s*210mm 148mm;\s*margin:\s*0;?\s*\}/);
    });

    test("`window.print` returning at once: the print element stays, so the page isn't emptied before it prints @TPL-322 @smoke", async () => {
        const page = await openWithTemplate(templateOf(fn("f1", "dayOfMonth")));
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        await settled();

        expect(page.printRoot()).not.toBeNull();
        expect(page.sheets()).toHaveLength(1);
        expect(pageRules()).toHaveLength(1);
    });

    test("it goes on `afterprint` @TPL-322", async () => {
        const page = await openWithTemplate(templateOf(fn("f1", "dayOfMonth")));
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        page.finishPrint();

        expect(page.printRoot()).toBeNull();
        expect(page.sheets()).toEqual([]);
    });

    test("it goes with the page @TPL-322", async () => {
        const page = await openWithTemplate(templateOf(fn("f1", "dayOfMonth")));
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        page.unmount();

        expect(page.printRoot()).toBeNull();
        expect(pageRules()).toEqual([]);
    });

    test("the `afterprint` listener is there only while a job exists @TPL-322", async () => {
        const added = vi.spyOn(window, "addEventListener");
        const removed = vi.spyOn(window, "removeEventListener");
        const listeners = (spy: typeof added | typeof removed) => spy.mock.calls.filter(([type]) => type === "afterprint").map(([, listener]) => listener);
        const page = await openWithTemplate(templateOf());
        expect(listeners(added)).toEqual([]);

        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(listeners(added)).toHaveLength(1);
        expect(listeners(removed)).toEqual([]);

        page.finishPrint();
        expect(listeners(removed)).toEqual(listeners(added));
    });
});

describe("Print and the editor @area:prescription", () => {
    test("edits in the editor, closed without printing, then Print beside Copy: the generated text prints @TPL-125 @smoke", async () => {
        const page = await openWithTemplate(templateOf(), {lines: [aPrintedLine("Tobradex", "ملاحظة")]});
        const editor = await openEditor(page);
        typeInEditor("نص معدل");
        await waitFor(() => expect(editorText()).toContain("نص معدل"));
        await page.user.click(editor.querySelector<HTMLElement>(".MuiDialogActions-root button")!);
        await waitFor(() => expect(document.querySelector(".ql-editor")).toBeNull());

        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const text = textBox(page.sheets()[0])?.textContent;
        expect(text).toContain("Tobradex");
        expect(text).toContain("ملاحظة");
        expect(text).not.toContain("نص معدل");
    });

    test("when the print ends the editor stays open with its edits, and printing again uses them @TPL-324 @smoke", async () => {
        const page = await openWithTemplate(templateOf());
        const editor = await openEditor(page);
        typeInEditor("نص معدل");
        await waitFor(() => expect(editorText()).toContain("نص معدل"));

        await page.user.click(editorPrint(editor));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(textBox(page.sheets()[0])?.textContent).toContain("نص معدل");
        page.finishPrint();

        expect(document.querySelector(".ql-editor")).not.toBeNull();
        expect(editorText()).toContain("نص معدل");

        await page.user.click(editorPrint(editor, PRINT));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(2));
        expect(textBox(page.sheets()[0])?.textContent).toContain("نص معدل");
    });

    test("printing doesn't change the lines @TPL-324", async () => {
        const page = await openWithTemplate(templateOf(), {lines: [aPrintedLine("Tobradex", "ملاحظة")]});
        const before = storedLines();
        const editor = await openEditor(page);
        typeInEditor("نص معدل");
        await waitFor(() => expect(editorPrint(editor)).toBeEnabled());

        await page.user.click(editorPrint(editor));
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        expect(storedLines()).toEqual(before);
    });
});
