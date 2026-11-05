import {describe, expect, test} from "vitest";
import {fireEvent, screen, waitFor, within} from "@testing-library/react";
import {aClinicDetails, aPrintLayout, aTemplateItem, openSelect, recordRequests} from "../../../test";
import {
    answerQuestion,
    blurAll,
    boxOf,
    deleteButton,
    designerRoot,
    dialogsGone,
    expectFieldMessage,
    expectNothingSent,
    FIELD_LABEL,
    fitButton,
    focusOn,
    guideLines,
    label,
    leaveQuestion,
    measuresOf,
    noLeaveQuestion,
    panelEntry,
    paperSize,
    pressKey,
    pressKeyOnFocus,
    pressShortcut,
    REDO_KEYS,
    REDO_SHIFT_KEYS,
    redoButton,
    releaseKey,
    renderDesigner,
    renderNewSheet,
    saveButton,
    selectedIds,
    settingsField,
    settingsPanel,
    sheetArea,
    sheetBoxes,
    sheetItem,
    startDrag,
    dragGhost,
    tabPath,
    typeInField,
    UNDO_KEYS,
    undoButton,
    unloadAsks,
    zoomInButton,
    zoomOutButton,
} from "../../../test/pages/printTemplate.tsx";

// The keyboard: step 3 design § 3 "Keyboard" and "Settled by the T0 reviews"; contract § 3.5, § 3.7.

/** m, the manual input, at 12.3 × 20.3, 40 × 8; f, the function, far from it. */
const layoutL = () => aPrintLayout({
    items: [
        aTemplateItem("prescriptionText", {id: "t"}),
        aTemplateItem("manualInput", {id: "m", xMm: 12.3, yMm: 20.3, wMm: 40, hMm: 8}),
        aTemplateItem("function", {id: "f", xMm: 70, yMm: 46}),
        aTemplateItem("staticText", {id: "s", text: "ثابت", xMm: 70, yMm: 175}),
    ],
});

/** The manual input selected, by a click, its box focused. */
const selectM = async (user: { click: (element: Element) => Promise<void> }) => {
    await user.click(sheetItem("الاسم"));
    expect(boxOf("m")).toHaveFocus();
};

const placeOf = (id: string) => ({x: boxOf(id).style.left, y: boxOf(id).style.top});
const ids = () => sheetBoxes().map(box => box.dataset.itemId);

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

describe("print template keys: moving the selected item @area:admin", () => {
    test.each([
        ["ArrowRight", {}, "13.3mm", "20.3mm"],
        ["ArrowLeft", {}, "11.3mm", "20.3mm"],
        ["ArrowDown", {}, "12.3mm", "21.3mm"],
        ["ArrowUp", {}, "12.3mm", "19.3mm"],
        ["ArrowRight", {shiftKey: true}, "17.3mm", "20.3mm"],
        ["ArrowLeft", {shiftKey: true}, "7.3mm", "20.3mm"],
        ["ArrowDown", {shiftKey: true}, "12.3mm", "25.3mm"],
        ["ArrowUp", {shiftKey: true}, "12.3mm", "15.3mm"],
        ["ArrowRight", {altKey: true}, "12.4mm", "20.3mm"],
        ["ArrowLeft", {altKey: true}, "12.2mm", "20.3mm"],
        ["ArrowDown", {altKey: true}, "12.3mm", "20.4mm"],
        ["ArrowUp", {altKey: true}, "12.3mm", "20.2mm"],
        // Alt wins over Shift (contract § 6.8)
        ["ArrowRight", {altKey: true, shiftKey: true}, "12.4mm", "20.3mm"],
    ])("%s with %j: from its current value, in tenths, on the sheet and in the fields; the other items stay @TPL-440 @smoke", async (key, modifiers, x, y) => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        const others = [measuresOf(boxOf("t")), measuresOf(boxOf("f")), measuresOf(boxOf("s"))];

        expect(pressKey(boxOf("m"), key, modifiers)).toBe(true);

        expect(placeOf("m")).toEqual({x, y});
        expect(settingsField(FIELD_LABEL.x)).toHaveValue(x.replace("mm", ""));
        expect(settingsField(FIELD_LABEL.y)).toHaveValue(y.replace("mm", ""));
        expect(selectedIds()).toEqual(["m"]);
        expect([measuresOf(boxOf("t")), measuresOf(boxOf("f")), measuresOf(boxOf("s"))]).toEqual(others);
    });

    test("each press counts from the last: left is left, in the English and in the Arabic UI alike @TPL-440", async () => {
        const {user} = await renderDesigner(layoutL(), {lang: "ar"});
        await user.click(boxOf("m"));
        pressKey(boxOf("m"), "ArrowLeft");
        pressKey(boxOf("m"), "ArrowLeft");
        pressKey(boxOf("m"), "ArrowRight", {altKey: true});
        expect(boxOf("m").style.left).toBe("10.4mm");
        expect(saveButton()).toBeEnabled();
    });

    test.each([
        ["the sheet's area", () => sheetArea()],
        ["a panel entry", () => panelEntry("Manual input")],
        ["a toolbar button", () => fitButton()],
    ])("the focus on %s: the arrows still move the selected item @TPL-440", async (_name, target) => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        focusOn(target());

        expect(pressKey(target(), "ArrowRight")).toBe(true);
        expect(boxOf("m").style.left).toBe("13.3mm");
    });

    test("the focus on the page's body (a focused box just left): the arrows still move the selected item @TPL-440", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        blurAll();

        expect(pressKey(document.body, "ArrowDown")).toBe(true);
        expect(boxOf("m").style.top).toBe("21.3mm");
    });

    test("after adding by a click the focus stays on the entry, and the arrows move the new item @TPL-440", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Manual input"));
        const entry = panelEntry("Manual input");
        expect(entry).toHaveFocus();

        expect(pressKey(entry, "ArrowRight")).toBe(true);
        expect(sheetBoxes()[1].style.left).toBe("12mm");
        expect(entry).toHaveFocus();
    });

    test.each([
        ["Ctrl", {ctrlKey: true}],
        ["Cmd", {metaKey: true}],
    ])("%s + arrows aren't the designer's: nothing moves, the browser keeps them @TPL-440", async (_name, modifiers) => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        for (const key of ARROWS) {
            expect(pressKey(boxOf("m"), key, modifiers)).toBe(false);
        }
        expect(placeOf("m")).toEqual({x: "12.3mm", y: "20.3mm"});
    });

    test.each([
        ["left", "ArrowLeft", {xMm: 0, yMm: 20}, {x: "0mm", y: "20mm"}],
        ["top", "ArrowUp", {xMm: 20, yMm: 0}, {x: "20mm", y: "0mm"}],
        // 148 - 40; 210 - 8
        ["right", "ArrowRight", {xMm: 108, yMm: 20}, {x: "108mm", y: "20mm"}],
        ["bottom", "ArrowDown", {xMm: 20, yMm: 202}, {x: "20mm", y: "202mm"}],
    ])("flush with the %s edge: handled, so the area doesn't scroll, and it stops; no step, nothing unsaved @TPL-556", async (_name, key, place, drawn) => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m", ...place, wMm: 40, hMm: 8})],
        }));
        await selectM(user);

        expect(pressKey(boxOf("m"), key)).toBe(true);

        expect(placeOf("m")).toEqual(drawn);
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test("a neighbour's line within 1 mm: an arrow moves exactly 1 mm, with no stick and no line @TPL-538", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [
                aTemplateItem("prescriptionText", {id: "t"}),
                aTemplateItem("manualInput", {id: "m", xMm: 12.3, yMm: 20, wMm: 40, hMm: 8}),
                aTemplateItem("function", {id: "f", xMm: 13.1, yMm: 100}),
            ],
        }));
        await selectM(user);

        pressKey(boxOf("m"), "ArrowRight");
        expect(boxOf("m").style.left).toBe("13.3mm");
        expect(guideLines()).toEqual([]);
    });

    test("a whole-mm item beside a line: the same, 21 and not the neighbour's 21.3 @TPL-538", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [
                aTemplateItem("prescriptionText", {id: "t"}),
                aTemplateItem("manualInput", {id: "m", xMm: 20, yMm: 20, wMm: 40, hMm: 8}),
                aTemplateItem("function", {id: "f", xMm: 21.3, yMm: 21.3}),
            ],
        }));
        await selectM(user);

        pressKey(boxOf("m"), "ArrowRight");
        expect(boxOf("m").style.left).toBe("21mm");
        pressKey(boxOf("m"), "ArrowDown");
        expect(boxOf("m").style.top).toBe("21mm");
        expect(guideLines()).toEqual([]);
    });

    test("Shift, Ctrl or Alt + arrows never change the width or the height; typing in those fields does @TPL-552", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);

        for (const modifiers of [{}, {shiftKey: true}, {ctrlKey: true}, {altKey: true}, {ctrlKey: true, shiftKey: true}, {altKey: true, shiftKey: true}]) {
            for (const key of ARROWS) {
                pressKey(boxOf("m"), key, modifiers);
                expect(boxOf("m").style.width).toBe("40mm");
                expect(boxOf("m").style.height).toBe("8mm");
            }
        }

        await typeInField(user, settingsField(FIELD_LABEL.width), "50");
        await typeInField(user, settingsField(FIELD_LABEL.height), "9");
        expect(boxOf("m").style.width).toBe("50mm");
        expect(boxOf("m").style.height).toBe("9mm");
    });
});

describe("print template keys: Alt, the browser's Back and Forward @area:admin", () => {
    test.each(["ArrowLeft", "ArrowRight"])("a clean template, a selected and focused box, Alt + %s: handled, moved 0.1 mm, the URL stays, no question @TPL-515 @smoke", async key => {
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(layoutL(), {clinic});
        await selectM(user);
        expect(saveButton()).toBeDisabled();

        expect(pressKey(boxOf("m"), key, {altKey: true})).toBe(true);

        expect(boxOf("m").style.left).toBe(key === "ArrowLeft" ? "12.2mm" : "12.4mm");
        expect(location().pathname).toBe(tabPath(clinic.id));
        noLeaveQuestion();
    });

    test("the same at the sheet's edge, where nothing moves: still handled, or the browser would go Back @TPL-515", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m", xMm: 0, yMm: 20, wMm: 40, hMm: 8})],
        }));
        await selectM(user);

        expect(pressKey(boxOf("m"), "ArrowLeft", {altKey: true})).toBe(true);
        expect(boxOf("m").style.left).toBe("0mm");
    });

    test.each(["ArrowLeft", "ArrowRight"])("Alt + %s with the focus in a field: not handled, nothing moves @TPL-516", async key => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        await user.click(settingsField(FIELD_LABEL.x));

        expect(pressKey(settingsField(FIELD_LABEL.x), key, {altKey: true})).toBe(false);
        expect(placeOf("m")).toEqual({x: "12.3mm", y: "20.3mm"});
    });

    test.each(["ArrowLeft", "ArrowRight"])("Alt + %s on an unselected box, another one selected: not handled, nothing moves @TPL-516", async key => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        focusOn(boxOf("f"));

        expect(pressKey(boxOf("f"), key, {altKey: true})).toBe(false);
        expect(placeOf("m")).toEqual({x: "12.3mm", y: "20.3mm"});
        expect(boxOf("f").style.left).toBe("70mm");
    });

    test.each(["ArrowLeft", "ArrowRight"])("Alt + %s with nothing selected: not handled, on a box, on the area and on the page's body @TPL-516", async key => {
        await renderDesigner(layoutL());
        expect(selectedIds()).toEqual([]);

        focusOn(boxOf("m"));
        expect(pressKey(boxOf("m"), key, {altKey: true})).toBe(false);
        focusOn(sheetArea());
        expect(pressKey(sheetArea(), key, {altKey: true})).toBe(false);
        blurAll();
        expect(pressKey(document.body, key, {altKey: true})).toBe(false);

        expect(placeOf("m")).toEqual({x: "12.3mm", y: "20.3mm"});
    });

    test("with nothing selected on a dirty template, the same: the browser's Back runs, and the guard asks @TPL-516", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        pressKey(boxOf("m"), "ArrowRight");
        pressKey(boxOf("m"), "Escape");
        expect(selectedIds()).toEqual([]);

        expect(pressKey(boxOf("m"), "ArrowLeft", {altKey: true})).toBe(false);
        expect(boxOf("m").style.left).toBe("13.3mm");
        expect(unloadAsks()).toBe(true);
    });

    test("Alt's own keydown and keyup are handled while the box has the focus, and the next arrow still nudges @TPL-517", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);

        expect(pressKey(boxOf("m"), "Alt", {altKey: true})).toBe(true);
        expect(releaseKey(boxOf("m"), "Alt")).toBe(true);
        expect(placeOf("m")).toEqual({x: "12.3mm", y: "20.3mm"});

        pressKey(boxOf("m"), "Alt", {altKey: true});
        expect(pressKey(boxOf("m"), "ArrowRight", {altKey: true})).toBe(true);
        expect(boxOf("m").style.left).toBe("12.4mm");
        expect(releaseKey(boxOf("m"), "Alt")).toBe(true);
        expect(pressKey(boxOf("m"), "ArrowRight")).toBe(true);
        expect(boxOf("m").style.left).toBe("13.4mm");
    });

    test("Alt's own keys while a box drag runs: handled; the drag goes on, and Esc ends it, the box in its place @TPL-517", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        startDrag(boxOf("m"));

        expect(pressKey(boxOf("m"), "Alt", {altKey: true})).toBe(true);
        expect(releaseKey(boxOf("m"), "Alt")).toBe(true);

        expect(pressKey(boxOf("m"), "Escape")).toBe(true);
        expect(placeOf("m")).toEqual({x: "12.3mm", y: "20.3mm"});
        // The press's selection stays, and the drag has ended: the next arrow is an arrow
        expect(selectedIds()).toEqual(["m"]);
        expect(pressKey(boxOf("m"), "ArrowRight")).toBe(true);
        expect(boxOf("m").style.left).toBe("13.3mm");
    });

    test("Alt's own keys while a panel drag runs, nothing selected: handled; after Esc and the release they're the browser's again @TPL-517", async () => {
        await renderNewSheet();
        expect(selectedIds()).toEqual([]);
        const entry = panelEntry("Manual input");
        focusOn(entry);
        startDrag(entry);
        expect(dragGhost()).toBeInTheDocument();

        expect(pressKey(entry, "Alt", {altKey: true})).toBe(true);
        expect(releaseKey(entry, "Alt")).toBe(true);
        expect(dragGhost()).toBeInTheDocument();

        expect(pressKey(entry, "Escape")).toBe(true);
        expect(dragGhost()).not.toBeInTheDocument();
        expect(sheetBoxes()).toHaveLength(1);
        fireEvent.pointerUp(entry, {pointerId: 1, button: 0, buttons: 0, clientX: 130, clientY: 100});
        expect(pressKey(entry, "Alt", {altKey: true})).toBe(false);
        expect(releaseKey(entry, "Alt")).toBe(false);
    });

    test("Alt's own keys with the focus in a field, or nothing selected: not handled @TPL-517", async () => {
        const {user} = await renderDesigner(layoutL());
        focusOn(boxOf("m"));
        expect(pressKey(boxOf("m"), "Alt", {altKey: true})).toBe(false);
        expect(releaseKey(boxOf("m"), "Alt")).toBe(false);

        await selectM(user);
        await user.click(settingsField(FIELD_LABEL.x));
        expect(pressKey(settingsField(FIELD_LABEL.x), "Alt", {altKey: true})).toBe(false);
        expect(releaseKey(settingsField(FIELD_LABEL.x), "Alt")).toBe(false);
    });
});

describe("print template keys: Delete and Esc @area:admin", () => {
    test("Delete on a manual input: it goes, nothing is selected, the focus is in the sheet's area @TPL-443 @smoke", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);

        expect(pressKey(boxOf("m"), "Delete")).toBe(true);

        expect(ids()).toEqual(["t", "f", "s"]);
        expect(selectedIds()).toEqual([]);
        expect(sheetArea()).toHaveFocus();
        expect(saveButton()).toBeEnabled();
    });

    test.each([
        ["a function", "التاريخ", "f", ["t", "m", "s"]],
        ["a static text", "ثابت", "s", ["t", "m", "f"]],
    ])("Delete on %s: it goes too @TPL-443", async (_name, name, id, left) => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem(name));

        expect(pressKey(boxOf(id), "Delete")).toBe(true);
        expect(ids()).toEqual(left);
    });

    test("Delete on the prescription text: handled, and nothing happens @TPL-443", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("Prescription text"));

        expect(pressKey(boxOf("t"), "Delete")).toBe(true);

        expect(ids()).toEqual(["t", "m", "f", "s"]);
        expect(selectedIds()).toEqual(["t"]);
        expect(boxOf("t")).toHaveFocus();
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test("Delete held: one item goes; a repeat on the area does nothing @TPL-560", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);

        expect(pressKey(boxOf("m"), "Delete")).toBe(true);
        expect(pressKey(sheetArea(), "Delete", {repeat: true})).toBe(false);
        expect(pressKey(sheetArea(), "Delete", {repeat: true})).toBe(false);

        expect(ids()).toEqual(["t", "f", "s"]);
    });

    test("Backspace removes nothing, and isn't the designer's @TPL-560", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);

        expect(pressKey(boxOf("m"), "Backspace")).toBe(false);

        expect(ids()).toEqual(["t", "m", "f", "s"]);
        expect(selectedIds()).toEqual(["m"]);
    });

    test("Esc on a selected item: deselected, the focus stays on its box; a second Esc isn't the designer's @TPL-444", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);

        expect(pressKey(boxOf("m"), "Escape")).toBe(true);
        expect(selectedIds()).toEqual([]);
        expect(boxOf("m")).toHaveFocus();
        expect(within(settingsPanel()).getByText("Select an item on the sheet to see its settings.")).toBeInTheDocument();
        expect(undoButton()).toBeDisabled();

        expect(pressKey(boxOf("m"), "Escape")).toBe(false);
    });
});

describe("print template keys: in a field they keep their normal behaviour @area:admin", () => {
    const FIELDS: [string, string, string][] = [
        ["a number field", "الاسم", FIELD_LABEL.x],
        ["the name", "الاسم", FIELD_LABEL.name],
        ["the static text", "ثابت", FIELD_LABEL.text],
    ];

    test.each(FIELDS)("%s: arrows, Shift or Alt + arrows, Delete and Esc aren't handled and change nothing @TPL-445 @smoke", async (_name, item, field) => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem(item));
        const selected = selectedIds();
        const before = sheetBoxes().map(measuresOf);
        await user.click(settingsField(field));

        for (const key of [...ARROWS, "Delete", "Escape", "Backspace"]) {
            expect(pressKey(settingsField(field), key), key).toBe(false);
        }
        for (const key of ARROWS) {
            expect(pressKey(settingsField(field), key, {shiftKey: true}), `Shift + ${key}`).toBe(false);
            expect(pressKey(settingsField(field), key, {altKey: true}), `Alt + ${key}`).toBe(false);
        }

        expect(sheetBoxes().map(measuresOf)).toEqual(before);
        expect(selectedIds()).toEqual(selected);
        expect(settingsField(field)).toHaveFocus();
    });

    test.each(FIELDS)("%s: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z stay with the field; the layout doesn't change @TPL-445", async (_name, item, field) => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem(item));
        const id = selectedIds()[0] as string;
        pressKey(boxOf(id), "ArrowRight");
        const moved = measuresOf(boxOf(id));
        await user.click(settingsField(field));

        for (const keys of [UNDO_KEYS, REDO_KEYS, REDO_SHIFT_KEYS]) {
            expect(pressShortcut(settingsField(field), keys)).toBe(false);
            expect(measuresOf(boxOf(id))).toEqual(moved);
        }
        expect(undoButton()).toBeEnabled();
    });

    test("typing still works with those keys around it: the text is the field's @TPL-445", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        await user.click(settingsField(FIELD_LABEL.x));
        await user.keyboard("{Backspace}");

        expect(settingsField(FIELD_LABEL.x)).toHaveValue("12.");
    });
});

describe("print template keys: the shortcuts on any keyboard @area:admin", () => {
    /** The manual input moved by one nudge: X 13.3; one step to undo. */
    const moved = async () => {
        const rendered = await renderDesigner(layoutL());
        await selectM(rendered.user);
        pressKey(boxOf("m"), "ArrowRight");
        expect(boxOf("m").style.left).toBe("13.3mm");
        return rendered;
    };

    test.each([
        ["an Arabic layout, Ctrl+Z", {code: "KeyZ", key: "ئ", ctrlKey: true}],
        ["Caps Lock, Ctrl+Z", {code: "KeyZ", key: "Z", ctrlKey: true}],
        ["a Latin layout, Ctrl+Z", {code: "KeyZ", key: "z", ctrlKey: true}],
        ["Cmd+Z", {code: "KeyZ", key: "z", metaKey: true}],
    ])("%s: undo runs, handled @TPL-519", async (_name, keys) => {
        await moved();

        expect(pressShortcut(boxOf("m"), keys)).toBe(true);

        expect(boxOf("m").style.left).toBe("12.3mm");
        expect(redoButton()).toBeEnabled();
    });

    test.each([
        ["an Arabic layout, Ctrl+Y", {code: "KeyY", key: "غ", ctrlKey: true}],
        ["Caps Lock, Ctrl+Y", {code: "KeyY", key: "Y", ctrlKey: true}],
        ["an Arabic layout, Ctrl+Shift+Z", {code: "KeyZ", key: "ئ", ctrlKey: true, shiftKey: true}],
        ["Caps Lock, Ctrl+Shift+Z", {code: "KeyZ", key: "Z", ctrlKey: true, shiftKey: true}],
        ["a Latin layout, Ctrl+Y", {code: "KeyY", key: "y", ctrlKey: true}],
        ["Cmd+Y", {code: "KeyY", key: "y", metaKey: true}],
        ["Cmd+Shift+Z", {code: "KeyZ", key: "z", metaKey: true, shiftKey: true}],
    ])("%s: redo runs, handled @TPL-519", async (_name, keys) => {
        await moved();
        pressShortcut(boxOf("m"), UNDO_KEYS);
        expect(boxOf("m").style.left).toBe("12.3mm");

        expect(pressShortcut(boxOf("m"), keys)).toBe(true);

        expect(boxOf("m").style.left).toBe("13.3mm");
    });

    test.each([
        ["Z alone", {code: "KeyZ", key: "z"}],
        ["Y alone", {code: "KeyY", key: "y"}],
        ["Shift+Z", {code: "KeyZ", key: "Z", shiftKey: true}],
        ["Alt+Z", {code: "KeyZ", key: "z", altKey: true}],
        ["Ctrl+A", {code: "KeyA", key: "a", ctrlKey: true}],
    ])("%s isn't a shortcut: not handled, nothing changes @TPL-519", async (_name, keys) => {
        await moved();

        expect(pressShortcut(boxOf("m"), keys)).toBe(false);

        expect(boxOf("m").style.left).toBe("13.3mm");
    });

    test("nothing to undo or redo: nothing changes @TPL-519", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        pressShortcut(boxOf("m"), UNDO_KEYS);
        pressShortcut(boxOf("m"), REDO_KEYS);
        expect(placeOf("m")).toEqual({x: "12.3mm", y: "20.3mm"});
    });

    test.each<[string, () => HTMLElement]>([
        ["a panel entry", () => panelEntry("Manual input")],
        ["the sheet's area", () => sheetArea()],
        ["a toolbar button", () => fitButton()],
        ["the page-size combobox", () => paperSize()],
        ["another box", () => boxOf("f")],
    ])("the focus on %s: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z run @TPL-520", async (_name, target) => {
        await moved();
        focusOn(target());

        expect(pressShortcut(target(), UNDO_KEYS)).toBe(true);
        expect(boxOf("m").style.left).toBe("12.3mm");
        expect(pressShortcut(target(), REDO_KEYS)).toBe(true);
        expect(boxOf("m").style.left).toBe("13.3mm");
        expect(pressShortcut(target(), UNDO_KEYS)).toBe(true);
        expect(pressShortcut(target(), REDO_SHIFT_KEYS)).toBe(true);
        expect(boxOf("m").style.left).toBe("13.3mm");
    });

    test("the focus on the page's body (a focused box just left): they run @TPL-520", async () => {
        await moved();
        blurAll();

        expect(pressShortcut(document.body, UNDO_KEYS)).toBe(true);
        expect(boxOf("m").style.left).toBe("12.3mm");
        expect(pressShortcut(document.body, REDO_KEYS)).toBe(true);
        expect(boxOf("m").style.left).toBe("13.3mm");
    });

    test.each<[string, string]>([
        ["an input", FIELD_LABEL.x],
        ["another input", FIELD_LABEL.name],
    ])("the focus in %s: they don't run @TPL-520", async (_name, field) => {
        await moved();
        focusOn(settingsField(field));

        expect(pressShortcut(settingsField(field), UNDO_KEYS)).toBe(false);
        expect(boxOf("m").style.left).toBe("13.3mm");
    });

    test("the focus in a textarea: they don't run @TPL-520", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("ثابت"));
        pressKey(boxOf("s"), "ArrowRight");
        focusOn(settingsField(FIELD_LABEL.text));
        expect(settingsField(FIELD_LABEL.text).tagName).toBe("TEXTAREA");

        expect(pressShortcut(settingsField(FIELD_LABEL.text), UNDO_KEYS)).toBe(false);
        expect(boxOf("s").style.left).toBe("71mm");
    });

    test("the focus in a contenteditable: they don't run @TPL-520", async () => {
        await moved();
        // None on this screen today: jsdom has no `isContentEditable` of its own, so the element states both
        const editable = document.createElement("div");
        editable.setAttribute("contenteditable", "true");
        editable.tabIndex = 0;
        Object.defineProperty(editable, "isContentEditable", {value: true});
        designerRoot().append(editable);
        try {
            focusOn(editable);
            expect(pressShortcut(editable, UNDO_KEYS)).toBe(false);
            expect(boxOf("m").style.left).toBe("13.3mm");
        } finally {
            editable.remove();
        }
    });

    test("the focus outside the designer, on the clinic's tabs: they don't run, nor do the arrows @TPL-520", async () => {
        await moved();
        const tab = screen.getByRole("tab", {name: "Overview"});
        focusOn(tab);

        expect(pressShortcut(tab, UNDO_KEYS)).toBe(false);
        expect(pressKey(tab, "ArrowRight")).toBe(false);
        expect(pressKey(tab, "Delete")).toBe(false);
        expect(boxOf("m").style.left).toBe("13.3mm");
    });

    test("the size select: the shortcuts run, but its arrows are its own @TPL-520", async () => {
        await moved();
        focusOn(paperSize());

        expect(pressKey(paperSize(), "ArrowLeft")).toBe(false);
        expect(boxOf("m").style.left).toBe("13.3mm");
    });
});

describe("print template keys: nothing behind a dialog or a menu @area:admin", () => {
    const nudged = async () => {
        const rendered = await renderDesigner(layoutL());
        await selectM(rendered.user);
        pressKey(boxOf("m"), "ArrowRight");
        return rendered;
    };

    /** None of these reach the layout behind what's open. */
    const expectNothingBehind = () => {
        pressKeyOnFocus(UNDO_KEYS.key, UNDO_KEYS);
        pressKeyOnFocus(REDO_KEYS.key, REDO_KEYS);
        pressKeyOnFocus("ArrowRight");
        pressKeyOnFocus("Delete");
        expect(ids()).toEqual(["t", "m", "f", "s"]);
        expect(placeOf("m")).toEqual({x: "13.3mm", y: "20.3mm"});
    };

    test("the delete question open: the layout behind doesn't change; closed, Ctrl+Z works again @TPL-521", async () => {
        const {user} = await nudged();
        await user.click(deleteButton());
        const dialog = await screen.findByRole("dialog", {name: label("printTemplates.deleteConfirm")});

        expectNothingBehind();
        expect(dialog).toBeInTheDocument();

        await user.click(within(dialog).getByRole("button", {name: "Cancel"}));
        await dialogsGone();
        blurAll();
        expect(pressShortcut(document.body, UNDO_KEYS)).toBe(true);
        expect(boxOf("m").style.left).toBe("12.3mm");
    });

    test("the unsaved-changes question open: the layout behind doesn't change @TPL-521", async () => {
        const {user} = await nudged();
        await user.click(screen.getByRole("tab", {name: "Overview"}));
        await leaveQuestion();

        expectNothingBehind();

        await answerQuestion(user, "stay");
        expect(boxOf("m").style.left).toBe("13.3mm");
    });

    test("the page-size menu open: the layout behind doesn't change @TPL-521", async () => {
        const {user} = await nudged();
        await openSelect(user, paperSize());

        expectNothingBehind();

        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
        expect(boxOf("m").style.left).toBe("13.3mm");
        expect(paperSize()).toHaveTextContent("A5");
    });
});

describe("print template keys: only the selected box's @area:admin", () => {
    test("A selected and the focus tabbed to unselected B: an arrow moves nothing and isn't handled, so the area may scroll @TPL-556", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        focusOn(boxOf("f"));

        for (const key of ARROWS) expect(pressKey(boxOf("f"), key)).toBe(false);

        expect(placeOf("m")).toEqual({x: "12.3mm", y: "20.3mm"});
        expect(boxOf("f").style.left).toBe("70mm");
        expect(selectedIds()).toEqual(["m"]);
    });

    test("Delete and Esc there: not handled either, nothing goes and A stays selected @TPL-556", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        focusOn(boxOf("f"));

        expect(pressKey(boxOf("f"), "Delete")).toBe(false);
        expect(pressKey(boxOf("f"), "Escape")).toBe(false);

        expect(ids()).toEqual(["t", "m", "f", "s"]);
        expect(selectedIds()).toEqual(["m"]);
    });

    test("Enter on B selects it, and then the arrows move B @TPL-556", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        focusOn(boxOf("f"));
        await user.keyboard("{Enter}");
        expect(selectedIds()).toEqual(["f"]);

        expect(pressKey(boxOf("f"), "ArrowRight")).toBe(true);
        expect(boxOf("f").style.left).toBe("71mm");
        expect(boxOf("m").style.left).toBe("12.3mm");
    });

    test("nothing selected: arrows, Delete and Esc aren't handled, on a box or the area @TPL-556", async () => {
        await renderDesigner(layoutL());
        focusOn(boxOf("m"));
        for (const key of [...ARROWS, "Delete", "Escape"]) {
            expect(pressKey(boxOf("m"), key), key).toBe(false);
        }
        focusOn(sheetArea());
        for (const key of [...ARROWS, "Delete", "Escape"]) {
            expect(pressKey(sheetArea(), key), key).toBe(false);
        }
        expect(ids()).toEqual(["t", "m", "f", "s"]);
    });
});

describe("print template keys: where the focus goes @area:admin", () => {
    test("Esc: it stays on the box @TPL-557", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        pressKey(boxOf("m"), "Escape");
        expect(boxOf("m")).toHaveFocus();
    });

    test("Delete: the sheet's area @TPL-557", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        pressKey(boxOf("m"), "Delete");
        expect(sheetArea()).toHaveFocus();
    });

    test("the settings' Remove: the sheet's area @TPL-557", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        await user.click(within(settingsPanel()).getByRole("button", {name: "Remove item"}));
        await waitFor(() => expect(sheetArea()).toHaveFocus());
    });

    test("an undo that removes the focused box: the sheet's area, not the page's body @TPL-557", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Manual input"));
        const added = sheetBoxes()[1];
        focusOn(added);

        expect(pressShortcut(added, UNDO_KEYS)).toBe(true);

        expect(sheetBoxes()).toHaveLength(1);
        await waitFor(() => expect(sheetArea()).toHaveFocus());
    });

    test("a redo that removes the focused box: the sheet's area @TPL-557", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        pressKey(boxOf("m"), "Delete");
        pressShortcut(sheetArea(), UNDO_KEYS);
        expect(selectedIds()).toEqual(["m"]);
        focusOn(boxOf("m"));

        expect(pressShortcut(boxOf("m"), REDO_KEYS)).toBe(true);

        expect(ids()).toEqual(["t", "f", "s"]);
        await waitFor(() => expect(sheetArea()).toHaveFocus());
    });

    test("an undo that keeps the focused box: the focus stays on it @TPL-557", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        pressKey(boxOf("m"), "ArrowRight");

        pressShortcut(boxOf("m"), UNDO_KEYS);

        expect(boxOf("m")).toHaveFocus();
    });

    test("a panel click: it stays on the entry @TPL-557", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Manual input"));
        expect(panelEntry("Manual input")).toHaveFocus();
    });

    test("the last undo by a focused toolbar button, which turns off: the sheet's area, not lost to the body @TPL-557", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        pressKey(boxOf("m"), "ArrowRight");

        await user.click(undoButton());

        expect(undoButton()).toBeDisabled();
        await waitFor(() => expect(sheetArea()).toHaveFocus());
    });

    test("the last undo pressed from the keyboard: the same @TPL-557", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        pressKey(boxOf("m"), "ArrowRight");
        focusOn(undoButton());

        await user.keyboard("{Enter}");

        expect(undoButton()).toBeDisabled();
        await waitFor(() => expect(sheetArea()).toHaveFocus());
    });

    test("an undo that leaves more to undo: the button stays on, and keeps the focus @TPL-557", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        pressKey(boxOf("m"), "Delete");
        await user.click(sheetItem("التاريخ"));
        pressKey(boxOf("f"), "Delete");

        await user.click(undoButton());

        expect(undoButton()).toBeEnabled();
        expect(undoButton()).toHaveFocus();
    });

    test("the last redo by its button, which turns off: the sheet's area @TPL-557", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectM(user);
        pressKey(boxOf("m"), "ArrowRight");
        pressShortcut(boxOf("m"), UNDO_KEYS);

        await user.click(redoButton());

        expect(redoButton()).toBeDisabled();
        await waitFor(() => expect(sheetArea()).toHaveFocus());
    });

    test("plus at 200% and minus at 50%, which turn off: the sheet's area @TPL-557", async () => {
        const {user} = await renderDesigner(layoutL());
        for (let press = 0; press < 4; press++) await user.click(zoomInButton());
        expect(zoomInButton()).toBeDisabled();
        await waitFor(() => expect(sheetArea()).toHaveFocus());

        for (let press = 0; press < 6; press++) await user.click(zoomOutButton());
        expect(zoomOutButton()).toBeDisabled();
        await waitFor(() => expect(sheetArea()).toHaveFocus());
    });
});

describe("print template keys: an item off the sheet @area:admin", () => {
    /** X typed past the edge: applied uncorrected (step 1's TPL-224). */
    const typedOff = async () => {
        const rendered = await renderDesigner(aPrintLayout({
            items: [
                aTemplateItem("prescriptionText", {id: "t"}),
                aTemplateItem("manualInput", {id: "m", xMm: 58, yMm: 46, wMm: 72, hMm: 8}),
            ],
        }));
        await rendered.user.click(sheetItem("الاسم"));
        await typeInField(rendered.user, settingsField(FIELD_LABEL.x), "140");
        await rendered.user.tab();
        return rendered;
    };

    test("pressed without moving: it stays where it is, and Save still refuses it @TPL-544", async () => {
        const {user} = await typedOff();
        const recorded = recordRequests();

        await user.click(boxOf("m"));
        expect(boxOf("m").style.left).toBe("140mm");

        await user.click(saveButton());
        expectFieldMessage(settingsField(FIELD_LABEL.x), "The item is outside the sheet.");
        await expectNothingSent(recorded);
    });

    test("an arrow: at the nearest inside position; undo: the off-sheet value exactly @TPL-544", async () => {
        const {user} = await typedOff();
        await user.click(boxOf("m"));

        expect(pressKey(boxOf("m"), "ArrowRight")).toBe(true);
        // 148 - 72
        expect(boxOf("m").style.left).toBe("76mm");
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("76");

        pressShortcut(boxOf("m"), UNDO_KEYS);
        expect(boxOf("m").style.left).toBe("140mm");
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("140");
    });

    test("a hand-made layout from the server: a press leaves it clean; an arrow brings it in, and undo is clean again @TPL-544", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [
                aTemplateItem("prescriptionText", {id: "t"}),
                aTemplateItem("manualInput", {id: "m", xMm: 140, yMm: 46, wMm: 72, hMm: 8}),
            ],
        }));

        await user.click(boxOf("m"));
        expect(boxOf("m").style.left).toBe("140mm");
        expect(saveButton()).toBeDisabled();
        expect(undoButton()).toBeDisabled();

        pressKey(boxOf("m"), "ArrowLeft");
        expect(boxOf("m").style.left).toBe("76mm");
        expect(saveButton()).toBeEnabled();

        pressShortcut(boxOf("m"), UNDO_KEYS);
        expect(boxOf("m").style.left).toBe("140mm");
        expect(saveButton()).toBeDisabled();
    });
});

describe("print template keys: while a drag runs @area:admin", () => {
    test("a drag selects and focuses its box; Esc ends it and keeps the selection, a second Esc deselects @TPL-517", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(boxOf("f"));
        expect(selectedIds()).toEqual(["f"]);
        startDrag(boxOf("m"));
        expect(selectedIds()).toEqual(["m"]);
        expect(boxOf("m")).toHaveFocus();

        expect(pressKey(boxOf("m"), "Escape")).toBe(true);
        expect(selectedIds()).toEqual(["m"]);
        expect(pressKey(boxOf("m"), "Escape")).toBe(true);
        expect(selectedIds()).toEqual([]);
    });
});
