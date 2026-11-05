import {describe, expect, test, vi} from "vitest";
import {act, screen, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {aPrintLayout, aPrintTemplate, aTemplateItem, choose, expectToasts, recordRequests, setViewportWidth} from "../../../test";
import {CSS_PX_PER_MM} from "../constants.ts";
import type {PrintLayout} from "../types.ts";
import {
    boxOf,
    FIELD_LABEL,
    fitButton,
    handleIds,
    measuresOf,
    panelEntry,
    paperSize,
    pressKey,
    pressShortcut,
    REDO_KEYS,
    REDO_SHIFT_KEYS,
    redoButton,
    renderDesigner,
    renderPrintTemplateTab,
    saveButton,
    selectedIds,
    settingsField,
    settingsPanel,
    sheetBoxes,
    sheetItem,
    sheetSize,
    theSheet,
    typeInField,
    UNDO_KEYS,
    undoButton,
    zoomInButton,
    zoomOutButton,
    zoomPercent,
} from "../../../test/pages/printTemplate.tsx";

// Zoom and the handles' set: step 3 design § 3 "Zoom", "Geometry"; contract § 3.2, § 3.3, § 3.8. jsdom has no layout, so Fit shows 100% here.

const layoutL = () => aPrintLayout({
    items: [
        aTemplateItem("prescriptionText", {id: "t"}),
        aTemplateItem("manualInput", {id: "m", xMm: 12.3, yMm: 20.3, wMm: 40, hMm: 8}),
        aTemplateItem("function", {id: "f"}),
    ],
});

const frame = () => screen.getByTestId("template-sheet-frame");

/** The toolbar's buttons are these, by accessible name, in this order. */
const expectToolbarButtons = (names: string[]) => {
    const toolbar = within(screen.getByTestId("template-toolbar"));
    const shown = toolbar.getAllByRole("button");
    expect(shown).toHaveLength(names.length);
    names.forEach((name, index) => expect(shown[index]).toBe(toolbar.getByRole("button", {name})));
};

describe("print template zoom: minus and plus @area:admin", () => {
    test("it starts at Fit, 100% here; each plus 25% up to 200%, where it turns off; minus turns on @TPL-461 @smoke", async () => {
        const {user} = await renderDesigner(layoutL());
        expect(zoomPercent()).toBe("100%");
        expect(zoomInButton()).toBeEnabled();
        expect(zoomOutButton()).toBeEnabled();

        for (const shown of ["125%", "150%", "175%"]) {
            await user.click(zoomInButton());
            expect(zoomPercent()).toBe(shown);
            expect(zoomInButton()).toBeEnabled();
        }
        await user.click(zoomInButton());
        expect(zoomPercent()).toBe("200%");
        expect(zoomInButton()).toBeDisabled();
        expect(zoomOutButton()).toBeEnabled();
    });

    test("each minus 25% down to 50%, where it turns off; plus turns on @TPL-461", async () => {
        const {user} = await renderDesigner(layoutL());

        await user.click(zoomOutButton());
        expect(zoomPercent()).toBe("75%");
        expect(zoomOutButton()).toBeEnabled();

        await user.click(zoomOutButton());
        expect(zoomPercent()).toBe("50%");
        expect(zoomOutButton()).toBeDisabled();
        expect(zoomInButton()).toBeEnabled();

        await user.click(zoomInButton());
        expect(zoomPercent()).toBe("75%");
        expect(zoomOutButton()).toBeEnabled();
    });

    test("Fit is never off, and brings back the fitted zoom @TPL-461", async () => {
        const {user} = await renderDesigner(layoutL());
        expect(fitButton()).toBeEnabled();

        await user.click(zoomInButton());
        await user.click(fitButton());
        expect(zoomPercent()).toBe("100%");
        expect(fitButton()).toBeEnabled();

        await user.click(zoomOutButton());
        await user.click(zoomOutButton());
        await user.click(fitButton());
        expect(zoomPercent()).toBe("100%");
    });

    test("the toolbar in its order: Undo, Redo, minus, the percentage, plus, Fit @TPL-461", async () => {
        await renderDesigner(layoutL());

        expectToolbarButtons(["Undo", "Redo", "Zoom out", "Zoom in", "Fit"]);
        expect(screen.getByTestId("template-toolbar")).toHaveTextContent("100%");
        expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
        expect(screen.getByTestId("template-zoom-percent")).toHaveAttribute("dir", "ltr");
    });

    test("in Arabic: the same five, in its own words @TPL-461", async () => {
        await renderDesigner(layoutL(), {lang: "ar"});
        expectToolbarButtons(["تراجع", "إعادة", "تصغير", "تكبير", "ملاءمة"]);
    });

    test("changing the window keeps the zoom: it doesn't re-fit @TPL-461", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(zoomInButton());

        act(() => setViewportWidth(1100));

        expect(zoomPercent()).toBe("125%");
    });
});

describe("print template zoom: only the view changes @area:admin", () => {
    test("at any zoom, the settings' mm and the boxes' mm are unchanged @TPL-463", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        const values = () => [FIELD_LABEL.x, FIELD_LABEL.y, FIELD_LABEL.width, FIELD_LABEL.height, FIELD_LABEL.pageWidth, FIELD_LABEL.pageHeight]
            .map(field => (settingsField(field) as HTMLInputElement).value);
        const before = values();
        const boxBefore = measuresOf(boxOf("m"));
        const sheetBefore = sheetSize();
        expect(before).toEqual(["12.3", "20.3", "40", "8", "148", "210"]);

        for (const zoomButton of [zoomInButton, zoomInButton, zoomInButton, zoomInButton, zoomOutButton, zoomOutButton, zoomOutButton, zoomOutButton, zoomOutButton, zoomOutButton]) {
            await user.click(zoomButton());
            expect(values()).toEqual(before);
            expect(measuresOf(boxOf("m"))).toEqual(boxBefore);
            expect(sheetSize()).toEqual(sheetBefore);
        }
        expect(saveButton()).toBeDisabled();
        expect(undoButton()).toBeDisabled();
        expect(redoButton()).toBeDisabled();
    });

    test("the saved layout holds no zoom: the request is the same at 200% as at 100% @TPL-463", async () => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        for (let press = 0; press < 4; press++) await user.click(zoomInButton());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.y), "33");
        await user.click(saveButton());
        await expectToasts("Template saved");

        const writes = recorded.writes();
        expect(writes).toHaveLength(1);
        const body = writes[0].body as PrintLayout & Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual(["items", "page", "schemaVersion"]);
        expect(Object.keys(body.page).sort()).toEqual(["heightMm", "size", "widthMm"]);
        expect(body.items[1]).toMatchObject({xMm: 12.3, yMm: 33, wMm: 40, hMm: 8});
        expect(JSON.stringify(body)).not.toMatch(/zoom/i);
    });

    test("the frame takes the scaled size, and the transform stays around the sheet, never on it @TPL-463", async () => {
        const {user} = await renderDesigner(layoutL());
        const atHundred = {width: parseFloat(frame().style.width), height: parseFloat(frame().style.height)};
        expect(atHundred.width).toBeCloseTo(148 * CSS_PX_PER_MM, 1);
        expect(atHundred.height).toBeCloseTo(210 * CSS_PX_PER_MM, 1);

        for (let press = 0; press < 4; press++) await user.click(zoomInButton());

        expect(parseFloat(frame().style.width)).toBeCloseTo(148 * CSS_PX_PER_MM * 2, 1);
        expect(parseFloat(frame().style.height)).toBeCloseTo(210 * CSS_PX_PER_MM * 2, 1);
        expect((theSheet().parentElement as HTMLElement).style.transform).toBe("scale(2)");
        expect(theSheet().style.transform).toBe("");
    });

    test("the area stays left to right in the Arabic UI too, at any zoom @TPL-463", async () => {
        const {user} = await renderDesigner(layoutL(), {lang: "ar"});
        await user.click(zoomInButton());
        expect(theSheet()).toHaveAttribute("dir", "ltr");
        expect(screen.getByRole("region", {name: "معاينة الورقة"})).toHaveAttribute("dir", "ltr");
    });
});

describe("print template zoom: below 900 px @area:admin", () => {
    test("still the desktop-only message: no sheet, box, handle or toolbar in the page @TPL-482", async () => {
        setViewportWidth(899);
        await renderPrintTemplateTab({template: aPrintTemplate({layout: layoutL()})});

        expect(await screen.findByText("Open this page on a computer.")).toBeInTheDocument();
        expect(screen.queryByTestId("template-sheet")).not.toBeInTheDocument();
        expect(screen.queryByTestId("template-sheet-frame")).not.toBeInTheDocument();
        expect(document.querySelectorAll("[data-item-id]")).toHaveLength(0);
        expect(handleIds()).toEqual([]);
        expect(screen.queryByTestId("template-overlay")).not.toBeInTheDocument();
        expect(screen.queryByTestId("template-toolbar")).not.toBeInTheDocument();
    });

    test("narrowed with an item selected: its handles leave too; widened, they're back @TPL-482", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        expect(handleIds()).toHaveLength(8);

        act(() => setViewportWidth(899));
        expect(await screen.findByText("Open this page on a computer.")).toBeInTheDocument();
        expect(handleIds()).toEqual([]);
        expect(screen.queryByTestId("template-sheet")).not.toBeInTheDocument();

        act(() => setViewportWidth(1280));
        await screen.findByTestId("template-sheet");
        expect(selectedIds()).toEqual(["m"]);
        expect(handleIds()).toHaveLength(8);
    });
});

describe("print template zoom: the handles' set @area:admin", () => {
    test("only the selected item shows handles, all eight, in the drawn order; none once deselected @TPL-551", async () => {
        const {user} = await renderDesigner(layoutL());
        expect(handleIds()).toEqual([]);

        await user.click(sheetItem("الاسم"));
        expect(handleIds()).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);

        pressKey(boxOf("m"), "Escape");
        expect(handleIds()).toEqual([]);
    });

    test("a box with both sides below 36 px at this zoom: the corners only; zoomed in past it, all eight @TPL-551", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m", xMm: 20, yMm: 20, wMm: 9, hMm: 9})],
        }));
        await user.click(sheetItem("الاسم"));
        // 9 mm at 100% is 34 px
        expect(handleIds()).toEqual(["nw", "ne", "se", "sw"]);

        // 42.5 px at 125%
        await user.click(zoomInButton());
        expect(handleIds()).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);

        // 25.5 px at 75%
        await user.click(zoomOutButton());
        await user.click(zoomOutButton());
        expect(handleIds()).toEqual(["nw", "ne", "se", "sw"]);
    });
});

describe("print template zoom: the selected box stays in view @area:admin", () => {
    const NEAREST = {block: "nearest", inline: "nearest"};
    const WIDTH_AT_100 = 148 * CSS_PX_PER_MM;

    /** Records each box asked to scroll into view, with what the screen showed at that moment. jsdom has no layout (setup.ts makes the call a no-op). */
    const watchBoxes = () => {
        const asked: { id: string; options: unknown; left: string; frameWidth: number }[] = [];
        vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element, options?: boolean | ScrollIntoViewOptions) {
            const id = this.getAttribute("data-item-id");
            if (id) asked.push({id, options, left: (this as HTMLElement).style.left, frameWidth: parseFloat(frame().style.width)});
        });
        return asked;
    };

    /** What a press leaves behind has landed. */
    const settled = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 50)));

    type Asked = ReturnType<typeof watchBoxes>;

    /** Only this box was asked, the nearest way; the last time, after the press had rendered (`left` and `frameWidth` as the screen shows them now). */
    const expectOnlyAsked = async (asked: Asked, id: string) => {
        await settled();
        expect(asked.length, `the box ${id} was asked to scroll into view`).toBeGreaterThan(0);
        for (const one of asked) expect({id: one.id, options: one.options}).toEqual({id, options: NEAREST});
        const last = asked[asked.length - 1];
        expect(last.left).toBe(boxOf(id).style.left);
        expect(last.frameWidth).toBeCloseTo(parseFloat(frame().style.width), 1);
    };

    const expectNoneAsked = async (asked: Asked) => {
        await settled();
        expect(asked.map(one => one.id)).toEqual([]);
    };

    /** The manual input selected and moved by one nudge: X 13.3, one step. Its own scroll (TPL-561) comes before the watch. */
    const nudgeM = async (user: UserEvent) => {
        await user.click(sheetItem("الاسم"));
        pressKey(boxOf("m"), "ArrowRight");
        expect(boxOf("m").style.left).toBe("13.3mm");
    };

    const onA4 = () => aPrintLayout({
        page: {size: "A4", widthMm: 210, heightMm: 297},
        items: [
            aTemplateItem("prescriptionText", {id: "t", xMm: 15, yMm: 40, wMm: 180, hMm: 50}),
            aTemplateItem("manualInput", {id: "m", xMm: 140, yMm: 46, wMm: 60, hMm: 8}),
        ],
    });

    describe("a zoom press and Fit", () => {
        test.each([
            ["plus", zoomInButton, 1.25],
            ["minus", zoomOutButton, 0.75],
        ])("%s, an item selected: its box is asked, the nearest way, once the new zoom shows @TPL-595", async (_name, button, scale) => {
            const {user} = await renderDesigner(layoutL());
            await user.click(sheetItem("الاسم"));
            const asked = watchBoxes();

            await user.click(button());

            await expectOnlyAsked(asked, "m");
            expect(asked[asked.length - 1].frameWidth).toBeCloseTo(WIDTH_AT_100 * scale, 1);
        });

        test("Fit, an item selected: its box is asked, the nearest way, once the fitted zoom shows @TPL-595", async () => {
            const {user} = await renderDesigner(layoutL());
            await user.click(sheetItem("الاسم"));
            await user.click(zoomInButton());
            const asked = watchBoxes();

            await user.click(fitButton());

            await expectOnlyAsked(asked, "m");
            expect(asked[asked.length - 1].frameWidth).toBeCloseTo(WIDTH_AT_100, 1);
        });

        test("the plus that reaches 200% and turns off: the box is still asked @TPL-595", async () => {
            const {user} = await renderDesigner(layoutL());
            await user.click(sheetItem("الاسم"));
            for (let press = 0; press < 3; press++) await user.click(zoomInButton());
            const asked = watchBoxes();

            await user.click(zoomInButton());

            expect(zoomInButton()).toBeDisabled();
            await expectOnlyAsked(asked, "m");
            expect(asked[asked.length - 1].frameWidth).toBeCloseTo(WIDTH_AT_100 * 2, 1);
        });

        test("nothing selected: plus, minus and Fit ask no box @TPL-595", async () => {
            const {user} = await renderDesigner(layoutL());
            const asked = watchBoxes();

            await user.click(zoomInButton());
            await user.click(zoomOutButton());
            await user.click(zoomInButton());
            await user.click(fitButton());

            await expectNoneAsked(asked);
        });

        test("deselected by Esc: no box is asked @TPL-595", async () => {
            const {user} = await renderDesigner(layoutL());
            await user.click(sheetItem("الاسم"));
            pressKey(boxOf("m"), "Escape");
            const asked = watchBoxes();

            await user.click(zoomInButton());

            await expectNoneAsked(asked);
        });
    });

    describe("undo and redo", () => {
        test.each([
            ["the button", async (user: UserEvent) => user.click(undoButton())],
            ["Ctrl+Z", async () => pressShortcut(boxOf("m"), UNDO_KEYS)],
        ])("an undo by %s: the selected box is asked, where the undo put it @TPL-595", async (_name, undo) => {
            const {user} = await renderDesigner(layoutL());
            await nudgeM(user);
            const asked = watchBoxes();

            await undo(user);

            await expectOnlyAsked(asked, "m");
            expect(asked[asked.length - 1].left).toBe("12.3mm");
        });

        test.each([
            ["the button", async (user: UserEvent) => user.click(redoButton())],
            ["Ctrl+Y", async () => pressShortcut(boxOf("m"), REDO_KEYS)],
            ["Ctrl+Shift+Z", async () => pressShortcut(boxOf("m"), REDO_SHIFT_KEYS)],
        ])("a redo by %s: the selected box is asked, where the redo put it @TPL-595", async (_name, redo) => {
            const {user} = await renderDesigner(layoutL());
            await nudgeM(user);
            await user.click(undoButton());
            const asked = watchBoxes();

            await redo(user);

            await expectOnlyAsked(asked, "m");
            expect(asked[asked.length - 1].left).toBe("13.3mm");
        });

        test("a removed item brought back by an undo is selected: its box is asked @TPL-595", async () => {
            const {user} = await renderDesigner(layoutL());
            await user.click(sheetItem("الاسم"));
            await user.click(within(settingsPanel()).getByRole("button", {name: "Remove item"}));
            const asked = watchBoxes();

            await user.click(undoButton());

            expect(selectedIds()).toEqual(["m"]);
            await expectOnlyAsked(asked, "m");
        });

        test("an added item undone leaves nothing selected: no box is asked; its redo selects it: its box is asked @TPL-595", async () => {
            const {user} = await renderDesigner(layoutL());
            await user.click(panelEntry("Manual input"));
            const asked = watchBoxes();

            await user.click(undoButton());
            expect(selectedIds()).toEqual([]);
            await expectNoneAsked(asked);

            await user.click(redoButton());
            const added = sheetBoxes()[3].dataset.itemId as string;
            expect(selectedIds()).toEqual([added]);
            await expectOnlyAsked(asked, added);
        });

        test("a page-size change undone and redone, an item selected: its box is asked, on the sheet that step shows @TPL-595", async () => {
            const {user} = await renderDesigner(onA4());
            await user.click(sheetItem("الاسم"));
            await choose(user, paperSize(), "A5");
            const asked = watchBoxes();

            await user.click(undoButton());
            await expectOnlyAsked(asked, "m");
            expect(asked[asked.length - 1].frameWidth).toBeCloseTo(210 * CSS_PX_PER_MM, 1);
            asked.length = 0;

            await user.click(redoButton());
            await expectOnlyAsked(asked, "m");
            expect(asked[asked.length - 1].frameWidth).toBeCloseTo(WIDTH_AT_100, 1);
        });

        test("a page-size change undone and redone, nothing selected: no box is asked @TPL-595", async () => {
            const {user} = await renderDesigner(onA4());
            await choose(user, paperSize(), "A5");
            const asked = watchBoxes();

            await user.click(undoButton());
            await user.click(redoButton());

            await expectNoneAsked(asked);
        });
    });

    describe("nothing else moves the scroll", () => {
        test("opening and selecting ask no box @TPL-595", async () => {
            const asked = watchBoxes();
            const {user} = await renderDesigner(layoutL());
            await expectNoneAsked(asked);

            await user.click(sheetItem("الاسم"));
            await user.click(sheetItem("التاريخ"));
            pressKey(boxOf("f"), "Escape");

            await expectNoneAsked(asked);
        });

        test("a window resize, and narrowing below 900 px and widening again, an item selected: no box is asked @TPL-595", async () => {
            const {user} = await renderDesigner(layoutL());
            await user.click(sheetItem("الاسم"));
            const asked = watchBoxes();

            act(() => setViewportWidth(1100));
            await expectNoneAsked(asked);

            act(() => setViewportWidth(899));
            expect(await screen.findByText("Open this page on a computer.")).toBeInTheDocument();
            act(() => setViewportWidth(1280));
            await screen.findByTestId("template-sheet");
            expect(selectedIds()).toEqual(["m"]);

            await expectNoneAsked(asked);
        });

        test("a page-size change that isn't an undo or a redo, an item selected: no box is asked @TPL-595", async () => {
            const {user} = await renderDesigner(onA4());
            await user.click(sheetItem("الاسم"));
            const asked = watchBoxes();

            await choose(user, paperSize(), "A5");

            expect(selectedIds()).toEqual(["m"]);
            await expectNoneAsked(asked);
        });
    });
});
