import {describe, expect, test} from "vitest";
import {fireEvent, screen} from "@testing-library/react";
import {aPrintLayout, aTemplateItem} from "../../../test";
import {
    boxOf,
    dragGhost,
    handleIds,
    measuresOf,
    panelEntry,
    pressAndRelease,
    pressMoveRelease,
    pressKey,
    renderDesigner,
    renderNewSheet,
    saveButton,
    selectedIds,
    sheetBoxes,
    sheetItem,
    undoButton,
    unloadAsks,
} from "../../../test/pages/printTemplate.tsx";

// A press: step 3 design § 3 "Dragging from the panel", "Moving", "Settled by the T0 reviews"; contract § 3.4. jsdom has no layout, so where a drag lands is e2e; a press and the threshold need none.

const layoutL = () => aPrintLayout({
    items: [
        aTemplateItem("prescriptionText", {id: "t"}),
        aTemplateItem("manualInput", {id: "m", xMm: 12.3, yMm: 20.3, wMm: 40, hMm: 8}),
        aTemplateItem("function", {id: "f", xMm: 70, yMm: 46}),
    ],
});

describe("print template press: on a panel entry @area:admin", () => {
    test("a press with no movement: added once, as a click adds, at the cascade's place, selected; the focus stays on the entry @TPL-402 @smoke", async () => {
        const {user} = await renderNewSheet();

        await user.click(panelEntry("Manual input"));

        expect(sheetBoxes()).toHaveLength(2);
        expect(measuresOf(sheetBoxes()[1])).toEqual({x: "11mm", y: "11mm", w: "40mm", h: "8mm", font: "11pt"});
        expect(selectedIds()).toEqual([sheetBoxes()[1].dataset.itemId]);
        expect(panelEntry("Manual input")).toHaveFocus();
        expect(dragGhost()).not.toBeInTheDocument();
    });

    test.each([0, 3, 4])("pressed and moved %s px, under the threshold: added once, no ghost @TPL-402", async distance => {
        await renderNewSheet();

        pressAndRelease(panelEntry("Manual input"), distance);

        expect(sheetBoxes()).toHaveLength(2);
        expect(sheetBoxes()[1].style.left).toBe("11mm");
        expect(dragGhost()).not.toBeInTheDocument();
    });

    test("one press is one undo step @TPL-402", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Manual input"));

        await user.click(undoButton());

        expect(sheetBoxes()).toHaveLength(1);
        expect(undoButton()).toBeDisabled();
    });

    test("moved past the threshold and released off the sheet: a drag; no item, not even from the `click` after it @TPL-402", async () => {
        await renderNewSheet();

        pressAndRelease(panelEntry("Manual input"), 30);

        expect(sheetBoxes()).toHaveLength(1);
        expect(dragGhost()).not.toBeInTheDocument();
        expect(undoButton()).toBeDisabled();
    });

    test("that swallowed `click` is one only: the next press adds, and a keyboard's click is never swallowed @TPL-402", async () => {
        await renderNewSheet();
        pressAndRelease(panelEntry("Manual input"), 30);
        expect(sheetBoxes()).toHaveLength(1);

        pressAndRelease(panelEntry("Manual input"), 0);
        expect(sheetBoxes()).toHaveLength(2);

        // A drag whose own `click` hasn't come, and then Enter on the entry: `detail` 0
        pressMoveRelease(panelEntry("Manual input"), 30);
        expect(sheetBoxes()).toHaveLength(2);
        fireEvent.click(panelEntry("Manual input"), {detail: 0});
        expect(sheetBoxes()).toHaveLength(3);
    });

    test("a drag only from the main button: another button shows no ghost and adds nothing @TPL-402", async () => {
        await renderNewSheet();
        const entry = panelEntry("Manual input");

        fireEvent.pointerDown(entry, {pointerId: 1, button: 2, buttons: 2, clientX: 100, clientY: 100});
        fireEvent.pointerMove(entry, {pointerId: 1, button: -1, buttons: 2, clientX: 130, clientY: 100});

        expect(dragGhost()).not.toBeInTheDocument();
        expect(sheetBoxes()).toHaveLength(1);
    });

    test("a dimmed entry: no ghost @TPL-402", async () => {
        await renderNewSheet();
        const dimmed = panelEntry("Internal data");

        fireEvent.pointerDown(dimmed, {pointerId: 1, button: 0, buttons: 1, clientX: 100, clientY: 100});
        fireEvent.pointerMove(dimmed, {pointerId: 1, button: -1, buttons: 1, clientX: 130, clientY: 100});

        expect(dragGhost()).not.toBeInTheDocument();
    });
});

describe("print template press: on a box @area:admin", () => {
    test("a press alone selects and focuses, and shows the handles at once, with no change to the layout @TPL-544", async () => {
        await renderDesigner(layoutL());
        const before = measuresOf(boxOf("m"));

        fireEvent.pointerDown(boxOf("m"), {pointerId: 1, button: 0, buttons: 1, clientX: 100, clientY: 100});

        expect(selectedIds()).toEqual(["m"]);
        expect(boxOf("m")).toHaveFocus();
        expect(handleIds()).toHaveLength(8);
        expect(measuresOf(boxOf("m"))).toEqual(before);
        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
        expect(pressKey(boxOf("m"), "Escape")).toBe(true);
    });

    test("a press and a release at 12.3: it stays at 12.3, no step, nothing unsaved @TPL-544", async () => {
        const {user} = await renderDesigner(layoutL());

        await user.click(sheetItem("الاسم"));

        expect(boxOf("m").style.left).toBe("12.3mm");
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test("a right or middle press: no selection @TPL-544", async () => {
        await renderDesigner(layoutL());

        fireEvent.pointerDown(boxOf("m"), {pointerId: 1, button: 2, buttons: 2, clientX: 100, clientY: 100});
        fireEvent.pointerDown(boxOf("f"), {pointerId: 1, button: 1, buttons: 4, clientX: 100, clientY: 100});

        expect(selectedIds()).toEqual([]);
        expect(screen.queryByTestId(/^template-handle-/)).not.toBeInTheDocument();
    });
});
