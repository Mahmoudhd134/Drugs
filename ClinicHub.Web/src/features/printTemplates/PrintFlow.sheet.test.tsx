import {describe, expect, test, vi} from "vitest";
import {act, waitFor} from "@testing-library/react";
import {fillIn, pastExitTransition, recordRequests, toastTexts} from "../../test";
import {storedLines} from "../../test/pages/prescription.tsx";
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

    test("an `afterprint` from nowhere, with no print running, changes nothing @TPL-322", async () => {
        const page = await openWithTemplate(templateOf());
        act(() => {
            window.dispatchEvent(new Event("afterprint"));
        });
        await pastExitTransition();
        expect(page.print).not.toHaveBeenCalled();
        expect(page.panelPrint()).toBeEnabled();
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
