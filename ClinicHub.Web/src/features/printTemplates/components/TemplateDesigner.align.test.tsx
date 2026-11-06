import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {aClinicDetails, aPrintLayout, aTemplateItem, recordRequests} from "../../../test";
import {
    alignButton,
    alignButtons,
    alignGroup,
    boxOf,
    designerShown,
    focusOn,
    label,
    redoButton,
    renderDesigner,
    saveButton,
    selectedIds,
    settingsPanel,
    templatePath,
    testPrintButton,
    undoButton,
    unloadAsks,
} from "../../../test/pages/printTemplate.tsx";
import {installPrint} from "../../../test/print.ts";
import type {PrintLayout, TemplateItem} from "../types.ts";

// Horizontal alignment per item on the screen: step 4 contract § 4.3.2, § 10.29. Where a value really lands in a PDF: e2e (TPL-740). The value's rules: layout.test.ts, the API's tests.

const SHORT_ITEMS: [string, (fields?: object) => TemplateItem][] = [
    ["a manual input", fields => aTemplateItem("manualInput", {id: "i", ...fields})],
    ["a function", fields => aTemplateItem("function", {id: "i", ...fields})],
    ["a static text", fields => aTemplateItem("staticText", {id: "i", text: "Zfixed", ...fields})],
];

const layoutOf = (item: TemplateItem, fields: Partial<PrintLayout> = {}) => aPrintLayout({
    items: [aTemplateItem("prescriptionText", {id: "t"}), item],
    ...fields,
});

/** The physical alignment the sheet's value holds, inline: the renderer the print shares. */
const sheetAlign = (id: string) => boxOf(id).querySelector("span")!.style.textAlign;
const pressedAlign = () => (["left", "center", "right"] as const).filter(align => alignButton(align).getAttribute("aria-pressed") === "true");

const overviewTab = () => screen.getByRole("tab", {name: "Overview"});
const templateTab = () => screen.getByRole("tab", {name: "Print template"});

describe("an item's alignment @area:admin", () => {
    test.each(SHORT_ITEMS)("%s: right by default, on the control and on the sheet; old templates aren't dirty @TPL-737 @smoke", async (_name, item) => {
        const {user} = await renderDesigner(layoutOf(item()));
        expect(sheetAlign("i")).toBe("right");

        await user.click(boxOf("i"));

        expect(pressedAlign()).toEqual(["right"]);
        expect(saveButton(), "opening one isn't dirty").toBeDisabled();
        expect(undoButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
    });

    test.each(SHORT_ITEMS)("%s: a press on center or left applies at once, is one undo step and turns Save on; undone, it's clean again @TPL-737 @smoke", async (_name, item) => {
        const {user} = await renderDesigner(layoutOf(item()));
        await user.click(boxOf("i"));

        await user.click(alignButton("center"));

        expect(sheetAlign("i")).toBe("center");
        expect(pressedAlign()).toEqual(["center"]);
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);

        await user.click(alignButton("left"));

        expect(sheetAlign("i")).toBe("left");
        expect(pressedAlign()).toEqual(["left"]);

        await user.click(undoButton());

        expect(sheetAlign("i"), "one step back: center").toBe("center");
        expect(pressedAlign()).toEqual(["center"]);
        expect(saveButton()).toBeEnabled();

        await user.click(undoButton());

        expect(sheetAlign("i")).toBe("right");
        expect(pressedAlign()).toEqual(["right"]);
        expect(saveButton(), "the saved layout again").toBeDisabled();
        expect(undoButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);

        await user.click(redoButton());

        expect(sheetAlign("i")).toBe("center");
        expect(saveButton()).toBeEnabled();
    });

    test("the button that's on, pressed again: one stays on, no step, nothing unsaved @TPL-737", async () => {
        const {user} = await renderDesigner(layoutOf(SHORT_ITEMS[0][1]()));
        await user.click(boxOf("i"));

        await user.click(alignButton("right"));

        expect(pressedAlign()).toEqual(["right"]);
        expect(sheetAlign("i")).toBe("right");
        expect(saveButton()).toBeDisabled();
        expect(undoButton()).toBeDisabled();
    });

    test.each(SHORT_ITEMS)("%s: saved and reloaded, it stays; the PUT holds it @TPL-737", async (_name, item) => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutOf(item()), {clinic});
        const recorded = recordRequests();
        await user.click(boxOf("i"));
        await user.click(alignButton("left"));

        await user.click(saveButton());

        await waitFor(() => expect(saveButton()).toBeDisabled());
        const [put] = recorded.writes();
        expect(put.path).toBe(templatePath(clinic.id));
        expect((put.body as PrintLayout).items.map(sent => [sent.id, (sent as { align?: string }).align])).toEqual([["t", undefined], ["i", "left"]]);

        await user.click(overviewTab());
        await waitFor(() => expect(screen.queryByTestId("template-sheet")).not.toBeInTheDocument());
        await user.click(templateTab());
        await designerShown();

        expect(sheetAlign("i")).toBe("left");
        await user.click(boxOf("i"));
        expect(pressedAlign()).toEqual(["left"]);
        expect(saveButton(), "and it's clean").toBeDisabled();
    });

    test("each item has its own: another item keeps right, and selecting it shows right @TPL-737", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [
                aTemplateItem("prescriptionText", {id: "t"}),
                aTemplateItem("manualInput", {id: "a", xMm: 10, yMm: 10}),
                aTemplateItem("manualInput", {id: "b", xMm: 10, yMm: 30, name: "السن"}),
            ],
        }));
        await user.click(boxOf("a"));
        await user.click(alignButton("center"));

        await user.click(boxOf("b"));

        expect(selectedIds()).toEqual(["b"]);
        expect(pressedAlign()).toEqual(["right"]);
        expect(sheetAlign("a")).toBe("center");
        expect(sheetAlign("b")).toBe("right");
    });

    test.each(["left", "center", "right"] as const)("saved as %s: the designer, the control and Test print's box all show it, and the box's place doesn't move @TPL-737", async align => {
        const printing = installPrint();
        const item = aTemplateItem("staticText", {id: "i", text: "Zfixed", xMm: 20, yMm: 30, wMm: 60, hMm: 8, align});
        const {user} = await renderDesigner(layoutOf(item));

        expect(sheetAlign("i")).toBe(align);
        expect(boxOf("i").style.left).toBe("20mm");
        expect(boxOf("i").style.width).toBe("60mm");
        await user.click(boxOf("i"));
        expect(pressedAlign()).toEqual([align]);

        await user.click(testPrintButton());

        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));
        const printed = printing.itemOn(printing.sheets()[0], "i")!;
        expect((printed.firstElementChild as HTMLElement).style.textAlign).toBe(align);
        expect((printed.firstElementChild as HTMLElement).style.width, "the value takes the box's full width").toBe("100%");
        expect(printed.style.left).toBe("20mm");
        expect(printed.style.width).toBe("60mm");
    });
});

describe("the alignment's control @area:admin", () => {
    test.each([
        ["en" as const, "Alignment", ["Left", "Center", "Right"]],
        // An RTL page lays buttons out from the right: last in the tree is the screen's left (where it lands on screen: e2e, TPL-741)
        ["ar" as const, "المحاذاة", ["يمين", "وسط", "يسار"]],
    ])("in %s: the group and its buttons are named, each on the side it aligns to @TPL-741", async (lang, group, names) => {
        const {user} = await renderDesigner(layoutOf(SHORT_ITEMS[0][1]()), {lang});
        await user.click(boxOf("i"));

        expect(alignGroup()).toHaveAccessibleName(group);
        expect(alignButtons().map(button => button.getAttribute("aria-label"))).toEqual(names);
        for (const [index, name] of names.entries()) expect(alignButtons()[index]).toHaveAccessibleName(name);
    });

    test.each([
        ["en" as const, {left: "Left", center: "Center", right: "Right"}],
        ["ar" as const, {left: "يسار", center: "وسط", right: "يمين"}],
    ])("in %s: each button has its tooltip, and its name is the one it aligns to @TPL-741", async (lang, names) => {
        const {user} = await renderDesigner(layoutOf(SHORT_ITEMS[0][1]()), {lang});
        await user.click(boxOf("i"));

        for (const align of ["left", "center", "right"] as const) {
            await user.hover(alignButton(align));
            expect(await screen.findByRole("tooltip", {name: names[align]})).toBeInTheDocument();
            await user.unhover(alignButton(align));
            await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

            await user.click(alignButton(align));
            expect(sheetAlign("i"), `${names[align]} aligns to the ${align}`).toBe(align);
        }
    });

    test("reachable by keyboard: Tab comes to each button, Enter and Space press it @TPL-741", async () => {
        const {user} = await renderDesigner(layoutOf(SHORT_ITEMS[0][1]()));
        await user.click(boxOf("i"));
        focusOn(boxOf("i"));

        for (const align of ["left", "center", "right"] as const) {
            for (let presses = 0; presses < 40 && document.activeElement !== alignButton(align); presses++) await user.tab();
            expect(alignButton(align), `${align} by Tab`).toHaveFocus();
        }

        await user.tab({shift: true});
        expect(alignButton("center")).toHaveFocus();
        await user.keyboard("{Enter}");
        expect(sheetAlign("i")).toBe("center");

        await user.tab({shift: true});
        expect(alignButton("left")).toHaveFocus();
        await user.keyboard(" ");
        expect(sheetAlign("i")).toBe("left");
        expect(alignButton("left")).toHaveFocus();
    });
});

describe("the prescription text has no alignment @area:admin", () => {
    test("selected: no group and no button, in the DOM at all; another kind then shows it @TPL-742", async () => {
        const {user} = await renderDesigner(aPrintLayout({items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m"})]}));
        const panel = within(settingsPanel());
        const names = [label("printTemplates.config.alignLeft"), label("printTemplates.config.alignCenter"), label("printTemplates.config.alignRight")];

        await user.click(boxOf("t"));

        expect(selectedIds()).toEqual(["t"]);
        expect(panel.queryByRole("group", {name: label("printTemplates.config.align"), hidden: true})).not.toBeInTheDocument();
        for (const name of names) expect(panel.queryByLabelText(name)).not.toBeInTheDocument();
        expect(panel.queryByText(label("printTemplates.config.align"))).not.toBeInTheDocument();

        await user.click(boxOf("m"));

        expect(alignGroup()).toBeVisible();
    });

    test("with nothing selected: no control either @TPL-742", async () => {
        await renderDesigner(aPrintLayout());

        expect(within(settingsPanel()).queryByText(label("printTemplates.config.align"))).not.toBeInTheDocument();
    });

    test("on the sheet, its text takes no physical alignment @TPL-742", async () => {
        await renderDesigner(aPrintLayout({items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m"})]}));

        expect(sheetAlign("t")).toBe("start");
        expect(sheetAlign("m")).toBe("right");
    });
});
