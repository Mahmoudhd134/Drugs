import {describe, expect, test} from "vitest";
import {fireEvent, screen, waitFor} from "@testing-library/react";
import {aPrintLayout, aTemplateItem, choose, hoverTooltip, recordRequests, toastTexts} from "../../../test";
import {pageRules, settled} from "../../../test/pages/printFlow.tsx";
import {
    answerQuestion,
    expectFieldMessage,
    FIELD_LABEL,
    paperSize,
    renderDesigner,
    saveButton,
    selectedIds,
    settingsField,
    sheetItem,
    sheetSize,
    testPrintButton,
    typeInField,
    undoButton,
    unloadAsks,
    zoomInButton,
    zoomPercent,
    calibrationField,
} from "../../../test/pages/printTemplate.tsx";
import {installPrint} from "../../../test/print.ts";
import type {TemplatePage} from "../types.ts";

// Test print: step 4 design §§ 2 (A7, A9), 3, P3, P4; contract §§ 4.2, 4.4. Geometry and the PDF: e2e.

const text = () => aTemplateItem("prescriptionText", {id: "t"});
const manual = (fields = {}) => aTemplateItem("manualInput", {id: "m", ...fields});
const date = (fields = {}) => aTemplateItem("function", {id: "f", ...fields});

const layoutL = () => aPrintLayout({items: [text(), manual(), date()]});

const overviewTab = () => screen.getByRole("tab", {name: "Overview"});

describe("Test print with nothing to save @area:admin", () => {
    test("Save stays off and leaving asks nothing @TPL-631", async () => {
        const printing = installPrint();
        const {user} = await renderDesigner(layoutL());

        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));

        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
    });

    test("no request, no undo step, no toast; the zoom and the selection unchanged @TPL-643", async () => {
        const printing = installPrint();
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await user.click(zoomInButton());
        const zoom = zoomPercent();
        const recorded = recordRequests();

        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));
        await settled();

        expect(recorded.requests).toEqual([]);
        expect(undoButton()).toBeDisabled();
        expect(toastTexts()).toEqual([]);
        expect(zoomPercent()).toBe(zoom);
        expect(selectedIds()).toEqual(["m"]);
    });
});

describe("Test print with a problem on the screen @area:admin", () => {
    test.each([
        ["an item's raw text", FIELD_LABEL.x, "abc", "Enter a number."],
        ["a box off the sheet", FIELD_LABEL.x, "500", "The item is outside the sheet."],
        ["an empty name", FIELD_LABEL.name, "", "Name is required."],
    ])("%s: its message shows, the first problem is selected, nothing prints @TPL-632", async (_name, field, typed, message) => {
        const printing = installPrint();
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(field), typed);
        await user.tab();
        await user.click(sheetItem("التاريخ"));
        expect(selectedIds()).toEqual(["f"]);

        await user.click(testPrintButton());
        await settled();

        expect(selectedIds()).toEqual(["m"]);
        expectFieldMessage(settingsField(field), message);
        expect(printing.print).not.toHaveBeenCalled();
        expect(printing.printRoot()).toBeNull();
    });

    test("the same press once it's fixed prints @TPL-632", async () => {
        const printing = installPrint();
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "abc");
        await user.click(testPrintButton());
        await settled();
        expect(printing.print).not.toHaveBeenCalled();

        await typeInField(user, settingsField(FIELD_LABEL.x), "20");
        await user.tab();
        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));
    });
});

describe("Test print's values come from the screen @area:admin", () => {
    const custom: TemplatePage = {size: "custom", widthMm: 148, heightMm: 210};

    test("a sheet width still being typed commits first and prints the new size, one page step in the history @TPL-633", async () => {
        const printing = installPrint();
        const {user} = await renderDesigner(aPrintLayout({page: custom, items: [text(), manual(), date()]}));

        fireEvent.change(settingsField(FIELD_LABEL.pageWidth), {target: {value: "160"}});
        fireEvent.click(testPrintButton(), {detail: 1});
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));

        expect(sheetSize().w).toBe("160mm");
        const [sheet] = printing.sheets();
        expect(sheet.style.width).toBe("160mm");
        expect(sheet.style.height).toBe("210mm");
        expect(printing.printRoot()?.textContent).toContain("size: 160mm 210mm");

        await user.click(undoButton());
        expect(sheetSize().w).toBe("148mm");
        expect(undoButton(), "one step: the sheet's width").toBeDisabled();
    });
});

describe("Test print pressed more than once @area:admin", () => {
    test("a double click: one print @TPL-634", async () => {
        const printing = installPrint();
        const {user} = await renderDesigner(layoutL());

        await user.dblClick(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));
        await settled();

        expect(printing.print).toHaveBeenCalledTimes(1);
        expect(printing.printRoots()).toHaveLength(1);
    });

    test("the double click's second click, `detail` 2, after the first flow ended: still one print; a keyboard's, `detail` 0, prints @TPL-708", async () => {
        const printing = installPrint();
        await renderDesigner(layoutL());

        fireEvent.click(testPrintButton(), {detail: 1});
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));
        printing.finishPrint();
        await waitFor(() => expect(printing.printRoot()).toBeNull());

        fireEvent.click(testPrintButton(), {detail: 2});
        await settled();
        expect(printing.print).toHaveBeenCalledTimes(1);

        fireEvent.click(testPrintButton(), {detail: 0});
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(2));
    });

    test("a job left behind, pressed again after a size change: one root, one @page, the new values; later edits don't alter the job; leaving removes it @TPL-709", async () => {
        const printing = installPrint();
        const {user} = await renderDesigner(layoutL());

        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));
        expect(printing.sheets()[0].style.width).toBe("148mm");

        await choose(user, paperSize(), "A4");
        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(2));

        expect(printing.printRoots()).toHaveLength(1);
        expect(pageRules()).toHaveLength(1);
        expect(printing.sheets()).toHaveLength(1);
        expect(printing.sheets()[0].style.width).toBe("210mm");
        expect(printing.printRoot()?.textContent).toContain("size: 210mm 297mm");
        expect(printing.itemOn(printing.sheets()[0], "m")?.textContent).toBe("الاسم");

        // The job holds what was pressed
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "السن");
        await typeInField(user, calibrationField("x"), "5");
        await user.tab();
        expect(printing.itemOn(printing.sheets()[0], "m")?.textContent).toBe("الاسم");
        expect(printing.itemOn(printing.sheets()[0], "m")?.style.left).toBe("58mm");

        await user.click(overviewTab());
        await answerQuestion(user, "leave");
        await waitFor(() => expect(printing.printRoot()).toBeNull());
        expect(pageRules()).toHaveLength(0);
    });
});

describe("the test page's rulers @area:admin", () => {
    const smallBox = aTemplateItem("prescriptionText", {id: "t", xMm: 10, yMm: 15, wMm: 30, hMm: 20});
    const onlyText = (widthMm: number, heightMm: number, size: TemplatePage["size"]) =>
        aPrintLayout({page: {size, widthMm, heightMm}, items: [smallBox]});

    const ruler = (root: HTMLElement | null, side: "top" | "left", tag: "line" | "text") =>
        Array.from(root?.querySelectorAll(`${tag}[data-ruler="${side}"]`) ?? []);
    const numbers = (lengthMm: number) => Array.from({length: Math.floor(lengthMm / 10)}, (_, index) => String((index + 1) * 10));

    test.each([
        ["A4 in Arabic", 210, 297, "A4", "ar"],
        ["A4 in English", 210, 297, "A4", "en"],
        ["a custom 50 x 50 in Arabic", 50, 50, "custom", "ar"],
    ] as const)("%s: a tick for every mm to the sheet's end, a number every 10 from the corner, in Latin digits, none on 0 @TPL-640", async (_name, widthMm, heightMm, size, lang) => {
        const printing = installPrint();
        const {user} = await renderDesigner(onlyText(widthMm, heightMm, size), {lang});

        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));

        const rulers = printing.printRoot()!.querySelector<HTMLElement>("[data-testid=test-print-rulers]");
        expect(rulers).toHaveAttribute("aria-hidden", "true");
        for (const [side, lengthMm] of [["top", widthMm], ["left", heightMm]] as const) {
            const ticks = ruler(rulers as HTMLElement, side, "line").map(tick => Number(tick.getAttribute("data-mm")));
            expect(ticks).toEqual(Array.from({length: lengthMm + 1}, (_, mm) => mm));

            const labels = ruler(rulers as HTMLElement, side, "text");
            expect(labels.map(label => label.textContent)).toEqual(numbers(lengthMm));
            expect(labels.map(label => label.getAttribute("data-mm"))).toEqual(numbers(lengthMm));
        }
    });

    test("a tick is 1.5 mm long, and 3 mm every 5 mm @TPL-640", async () => {
        const printing = installPrint();
        const {user} = await renderDesigner(onlyText(50, 50, "custom"));

        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));

        const rulers = printing.printRoot()!.querySelector<HTMLElement>("[data-testid=test-print-rulers]")!;
        const length = (side: "top" | "left", mm: number) => {
            const tick = rulers.querySelector(`line[data-ruler="${side}"][data-mm="${mm}"]`)!;
            const [from, to] = side === "top" ? ["y1", "y2"] : ["x1", "x2"];
            return Math.abs(Number(tick.getAttribute(to)) - Number(tick.getAttribute(from)));
        };
        for (const side of ["top", "left"] as const) {
            expect(length(side, 1)).toBe(1.5);
            expect(length(side, 4)).toBe(1.5);
            expect(length(side, 5)).toBe(3);
            expect(length(side, 10)).toBe(3);
        }
    });

    test("no test print: no rulers anywhere, the designer's sheet never holds them @TPL-640", async () => {
        const printing = installPrint();
        const {user} = await renderDesigner(layoutL());
        expect(screen.queryByTestId("test-print-rulers")).toBeNull();

        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));

        const inDesigner = screen.getByTestId("template-sheet").querySelector("[data-testid=test-print-rulers]");
        expect(inDesigner).toBeNull();
    });
});

describe("the button's hint @area:admin", () => {
    test.each([
        ["en", "Print at 100%, without \"Fit to page\"."],
        ["ar", "اطبع بمقياس 100% دون «ملاءمة للصفحة»."],
    ] as const)("in %s the tooltip shows the 100%% hint, and the button keeps its own name @TPL-641", async (lang, hint) => {
        await renderDesigner(layoutL(), {lang});

        expect(await hoverTooltip(testPrintButton())).toBe(hint);
        expect(testPrintButton()).toBeEnabled();
    });
});
