import {beforeEach, describe, expect, test, vi} from "vitest";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {http} from "msw";
import {
    aClinicDetails,
    aLayoutBeforeStep4,
    aPaperImage,
    aPrintLayout,
    aTemplateItem,
    expectToasts,
    problem,
    recordRequests,
    server,
    setViewportWidth,
    toastTexts,
} from "../../../test";
import {renderAdmin} from "../../../test/pages/admin.tsx";
import {stubObjectUrls} from "../../../test/pages/attachments.tsx";
import {
    answerQuestion,
    boxOf,
    calibrationField,
    calibrationSection,
    cutWarning,
    designerShown,
    expectFieldMessage,
    expectNoFieldMessage,
    expectNothingSent,
    FIELD_LABEL,
    leaveQuestion,
    noLeaveQuestion,
    paperLoadFailed,
    paperUrl,
    redoButton,
    renderDesigner,
    saveButton,
    selectedIds,
    settingsField,
    sheetBoxes,
    sheetItem,
    tabPath,
    templatePath,
    templateUrl,
    testPrintButton,
    theSheet,
    typeInField,
    undoButton,
    unloadAsks,
    zoomInButton,
    zoomPercent,
} from "../../../test/pages/printTemplate.tsx";
import {installPrint} from "../../../test/print.ts";
import {settled} from "../../../test/pages/printFlow.tsx";
import type {PrintLayout, TemplateItem} from "../types.ts";

// The printer's correction on the screen: step 4 design §§ 3, 5, 9; contract §§ 4.2, 4.3, 4.7. The values' rules: layout.test.ts.

const MESSAGES = {
    en: {
        helper: "For example: if the print landed 2 mm too low, type Y = −2.",
        hint: "Print at 100%, without \"Fit to page\".",
        range: "The correction must be between −20 and +20 mm.",
        cut: "With this correction, one or more items leave the sheet and their text may be cut.",
        loadFailed: "Couldn't show the paper image.",
    },
    ar: {
        helper: "مثال: إذا نزلت الطباعة 2 مم عن مكانها فاكتب Y = −2.",
        hint: "اطبع بمقياس 100% دون «ملاءمة للصفحة».",
        range: "يجب أن يكون التصحيح بين −20 و+20 مم.",
        cut: "بهذا التصحيح يخرج عنصر أو أكثر عن الورقة وقد يُقص نصه.",
        loadFailed: "تعذر عرض صورة الورقة.",
    },
} as const;

const NUMBER_REQUIRED = "Enter a number.";
const NAME_TAKEN = "Another item already uses this name.";
const DESKTOP_ONLY = "Open this page on a computer.";

const text = () => aTemplateItem("prescriptionText", {id: "t"});
const manual = (fields = {}) => aTemplateItem("manualInput", {id: "m", ...fields});
const date = (fields = {}) => aTemplateItem("function", {id: "f", ...fields});

const items = (...more: TemplateItem[]) => [text(), manual(), date(), ...more];
const layoutL = (fields: Partial<PrintLayout> = {}) => aPrintLayout({items: items(), ...fields});

const overviewTab = () => screen.getByRole("tab", {name: "Overview"});

/** The body of the only PUT sent. */
const savedBody = (recorded: ReturnType<typeof recordRequests>) => {
    const writes = recorded.writes();
    expect(writes.map(write => write.method)).toEqual(["PUT"]);
    return writes[0].body as PrintLayout;
};

describe("the correction on an old template @area:admin", () => {
    test("a row from before this step: the fields show 0, 0 and no box or print holds NaNmm @TPL-605", async () => {
        const printing = installPrint();
        const {user} = await renderDesigner(aLayoutBeforeStep4({items: items()}));

        expect(calibrationField("x")).toHaveValue("0");
        expect(calibrationField("y")).toHaveValue("0");
        expect(theSheet().outerHTML).not.toContain("NaN");
        expect(sheetBoxes().map(box => box.style.left)).toEqual(["14mm", "58mm", "14mm"]);

        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));
        const [sheet] = printing.sheets();
        expect(sheet.outerHTML).not.toContain("NaN");
        expect(printing.itemOn(sheet, "m")?.style.left).toBe("58mm");
        expect(printing.itemOn(sheet, "m")?.style.top).toBe("46mm");
        expect(printing.itemOn(sheet, "m")?.style.transform, "no transform at 0, 0").toBe("");
    });

    test("opened: Save is off, nothing to undo, and leaving asks nothing @TPL-612", async () => {
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(aLayoutBeforeStep4({items: items()}), {clinic});

        expect(saveButton()).toBeDisabled();
        expect(undoButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);

        await user.click(overviewTab());
        noLeaveQuestion();
        await waitFor(() => expect(location().pathname).toBe(`/admin/clinics/${clinic.id}`));
    });
});

describe("the correction is part of the layout @area:admin", () => {
    test("X changed: Save turns on and leaving asks; undone: the value back, Save off and leaving asks nothing @TPL-613", async () => {
        const {user} = await renderDesigner(layoutL());

        await typeInField(user, calibrationField("x"), "2");
        await user.tab();

        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);
        await user.click(overviewTab());
        await leaveQuestion();
        await answerQuestion(user, "stay");

        await user.click(undoButton());

        expect(calibrationField("x")).toHaveValue("0");
        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
    });

    test("saved and reloaded: the body holds both numbers and the fields show them @TPL-613", async () => {
        const clinic = aClinicDetails();
        const {user, unmount} = await renderDesigner(layoutL(), {clinic});
        const recorded = recordRequests();

        await typeInField(user, calibrationField("x"), "2");
        await typeInField(user, calibrationField("y"), "-1.5");
        await user.tab();
        await user.click(saveButton());
        await expectToasts("Template saved");

        expect(savedBody(recorded).calibration).toEqual({xMm: 2, yMm: -1.5});
        expect(saveButton()).toBeDisabled();

        unmount();
        await renderAdmin(tabPath(clinic.id), {dataRouter: true});
        await designerShown();
        expect(calibrationField("x")).toHaveValue("2");
        expect(calibrationField("y")).toHaveValue("-1.5");
        expect(saveButton()).toBeDisabled();
    });

    test.each([
        ["Arabic digits", "٢٫٥", "2.5", 2.5],
        ["a comma", "2,5", "2.5", 2.5],
        ["a leading minus", "-2", "-2", -2],
    ])("%s are read: the field shows it and the body holds the number @TPL-614", async (_name, typed, shown, sent) => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();

        await typeInField(user, calibrationField("x"), typed);
        expectNoFieldMessage(calibrationField("x"));
        await user.tab();
        expect(calibrationField("x")).toHaveValue(shown);

        await user.click(saveButton());
        await expectToasts("Template saved");
        expect(savedBody(recorded).calibration).toEqual({xMm: sent, yMm: 0});
    });

    test("«abc» keeps the text with «Enter a number.», the last number stays and Save sends nothing @TPL-614", async () => {
        const {user} = await renderDesigner(layoutL({calibration: {xMm: 3, yMm: 0}}));
        const recorded = recordRequests();

        await typeInField(user, calibrationField("x"), "abc");
        await user.tab();

        expectFieldMessage(calibrationField("x"), NUMBER_REQUIRED);
        expect(calibrationField("x")).toHaveValue("abc");

        await user.click(saveButton());
        await expectNothingSent(recorded);
        expectFieldMessage(calibrationField("x"), NUMBER_REQUIRED);
    });

    test.each([
        ["x", "21"],
        ["x", "-21"],
        ["y", "20.05"],
        ["y", "-20.05"],
    ] as const)("%s = %s: the range message at once, with the focus still there; Save and Test print refuse @TPL-615", async (axis, typed) => {
        const printing = installPrint();
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();

        await typeInField(user, calibrationField(axis), typed);
        expect(document.activeElement).toBe(calibrationField(axis));
        expectFieldMessage(calibrationField(axis), MESSAGES.en.range);

        await user.click(saveButton());
        await expectNothingSent(recorded);

        await user.click(testPrintButton());
        await settled();
        expect(printing.print).not.toHaveBeenCalled();
        expect(printing.printRoot()).toBeNull();
    });

    test.each([["x", "20"], ["x", "-20"], ["y", "20.04"]] as const)("%s = %s stays in range: no message @TPL-615", async (axis, typed) => {
        const {user} = await renderDesigner(layoutL());
        await typeInField(user, calibrationField(axis), typed);
        expectNoFieldMessage(calibrationField(axis));
    });

    test.each(["ar", "en"] as const)("in %s both fields read left to right @TPL-616", async lang => {
        await renderDesigner(layoutL(), {lang});
        expect(calibrationField("x")).toHaveAttribute("dir", "ltr");
        expect(calibrationField("y")).toHaveAttribute("dir", "ltr");
    });

    test.each([
        ["+2", "2", 2],
        ["−2", "-2", -2],
    ])("%s in X is a number: no message, the field shows %s and the body holds it @TPL-700", async (typed, shown, sent) => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();

        await typeInField(user, calibrationField("x"), typed);
        expectNoFieldMessage(calibrationField("x"));
        await user.tab();
        expect(calibrationField("x")).toHaveValue(shown);

        await user.click(saveButton());
        await expectToasts("Template saved");
        expect(savedBody(recorded).calibration).toEqual({xMm: sent, yMm: 0});
    });

    test("+20 in an item's X reads too: every field shares the parsing @TPL-700", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));

        await typeInField(user, settingsField(FIELD_LABEL.x), "+20");

        expectNoFieldMessage(settingsField(FIELD_LABEL.x));
        expect(boxOf("m").style.left).toBe("20mm");
    });

    test.each(["+-2", "2+", "- 2"])("%s isn't a sign: «Enter a number.» @TPL-700", async typed => {
        const {user} = await renderDesigner(layoutL());
        await typeInField(user, calibrationField("x"), typed);
        expectFieldMessage(calibrationField("x"), NUMBER_REQUIRED);
    });
});

describe("the cut warning @area:admin", () => {
    test("a box pushed off the sheet: the warning shows; X back to 0: it goes @TPL-618", async () => {
        const {user} = await renderDesigner(layoutL());
        expect(cutWarning()).toBeNull();

        // The manual input ends at 130 mm on a sheet of 148 mm
        await typeInField(user, calibrationField("x"), "19");
        expect(cutWarning()).toHaveTextContent(MESSAGES.en.cut);

        await typeInField(user, calibrationField("x"), "0");
        expect(cutWarning()).toBeNull();
    });

    test("with the warning, Save still sends and answers «Template saved» @TPL-618", async () => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();

        await typeInField(user, calibrationField("x"), "19");
        await user.tab();
        expect(cutWarning()).toBeInTheDocument();

        await user.click(saveButton());
        await expectToasts("Template saved");
        expect(savedBody(recorded).calibration).toEqual({xMm: 19, yMm: 0});
        expect(cutWarning()).toBeInTheDocument();
    });

    test("with the warning, Test print still prints @TPL-618", async () => {
        const printing = installPrint();
        const {user} = await renderDesigner(layoutL());

        await typeInField(user, calibrationField("x"), "19");
        await user.tab();
        expect(cutWarning()).toBeInTheDocument();

        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));
        const box = printing.itemOn(printing.sheets()[0], "m");
        expect(box?.style.transform).toBe("translate(19mm, 0mm)");
        expect(box?.style.left, "the designed place").toBe("58mm");
        expect(box?.style.top, "the designed place").toBe("46mm");
    });
});

describe("the correction's undo steps @area:admin", () => {
    test("X typed over several keys with A selected: one step; undo and redo keep A and the zoom @TPL-702", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await user.click(zoomInButton());
        const zoom = zoomPercent();

        await user.click(calibrationField("x"));
        await user.keyboard("{Control>}a{/Control}{Backspace}12.5");
        await user.tab();
        expect(calibrationField("x")).toHaveValue("12.5");
        expect(selectedIds()).toEqual(["m"]);

        await user.click(undoButton());
        expect(calibrationField("x")).toHaveValue("0");
        expect(selectedIds()).toEqual(["m"]);
        expect(zoomPercent()).toBe(zoom);
        expect(undoButton(), "it was one step").toBeDisabled();

        await user.click(redoButton());
        expect(calibrationField("x")).toHaveValue("12.5");
        expect(selectedIds()).toEqual(["m"]);
        expect(zoomPercent()).toBe(zoom);
        expect(redoButton()).toBeDisabled();
    });

    /** X changed and the focus still there, with no blur: the field is still open. The next press blurs it, as in a browser. */
    const openX = (value: string) => {
        calibrationField("x").focus();
        fireEvent.change(calibrationField("x"), {target: {value}});
    };

    test("X open, Undo clicked: a calibration step undone, the selection stays @TPL-703", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("التاريخ"));
        openX("3");

        await user.click(undoButton());

        expect(calibrationField("x")).toHaveValue("0");
        expect(selectedIds()).toEqual(["f"]);
        expect(undoButton()).toBeDisabled();
        await user.click(redoButton());
        expect(calibrationField("x")).toHaveValue("3");
        expect(selectedIds()).toEqual(["f"]);
    });

    test("X open, an item's field typed: two steps, the correction's keeps whatever is selected @TPL-703", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        openX("3");
        fireEvent.change(settingsField(FIELD_LABEL.x), {target: {value: "20"}});
        await user.click(sheetItem("التاريخ"));

        await user.click(undoButton());
        expect(boxOf("m").style.left).toBe("58mm");
        expect(calibrationField("x")).toHaveValue("3");

        await user.click(sheetItem("التاريخ"));
        await user.click(undoButton());
        expect(calibrationField("x")).toHaveValue("0");
        expect(selectedIds()).toEqual(["f"]);
        expect(undoButton()).toBeDisabled();
    });

    describe("with the sheet laid out", () => {
        const AREA = {left: 200, top: 100, width: 800, height: 900};
        const toDomRect = ({left, top, width, height}: typeof AREA) =>
            ({left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({})}) as DOMRect;

        // jsdom has no layout: the rectangles a browser would give, as TemplateDesigner.drag.test.tsx does
        beforeEach(() => {
            vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function stubLayout(this: Element) {
                if (this.querySelector(":scope > [data-testid='template-sheet-frame']")) return toDomRect(AREA);
                const frame = this.closest<HTMLElement>("[data-testid='template-sheet-frame']");
                if (frame && this.getAttribute("data-testid") === "template-sheet") {
                    return toDomRect({left: AREA.left, top: AREA.top, width: parseFloat(frame.style.width), height: parseFloat(frame.style.height)});
                }
                return toDomRect({left: 0, top: 0, width: 0, height: 0});
            });
        });

        const at = (xMm: number, yMm: number) => {
            const rect = theSheet().getBoundingClientRect();
            const pxPerMm = rect.width / parseFloat(theSheet().style.width);
            return {clientX: rect.left + xMm * pxPerMm, clientY: rect.top + yMm * pxPerMm};
        };

        test("X open, a box dragged: two steps, the drag's and then a calibration step that keeps the selection @TPL-703", async () => {
            const {user} = await renderDesigner(layoutL());
            await user.click(sheetItem("التاريخ"));
            openX("3");

            const box = boxOf("m");
            fireEvent.pointerDown(box, {pointerId: 1, button: 0, buttons: 1, ...at(60, 48)});
            fireEvent.pointerMove(box, {pointerId: 1, button: -1, buttons: 1, ...at(70, 60)});
            fireEvent.pointerUp(box, {pointerId: 1, button: 0, buttons: 0, ...at(70, 60)});
            expect(boxOf("m").style.left).not.toBe("58mm");
            expect(calibrationField("x")).toHaveValue("3");

            await user.click(undoButton());
            expect(boxOf("m").style.left).toBe("58mm");
            expect(calibrationField("x")).toHaveValue("3");

            await user.click(sheetItem("التاريخ"));
            await user.click(undoButton());
            expect(calibrationField("x")).toHaveValue("0");
            expect(selectedIds()).toEqual(["f"]);
            expect(undoButton()).toBeDisabled();
        });
    });

    test("«abc» in X after a change: undo restores the number, the text and its message go, nothing is unsaved @TPL-703", async () => {
        const {user} = await renderDesigner(layoutL());
        await typeInField(user, calibrationField("x"), "3");
        await user.tab();
        await typeInField(user, calibrationField("x"), "abc");
        await user.tab();
        expectFieldMessage(calibrationField("x"), NUMBER_REQUIRED);

        await user.click(undoButton());

        expect(calibrationField("x")).toHaveValue("0");
        expectNoFieldMessage(calibrationField("x"));
        expect(saveButton()).toBeDisabled();
    });
});

describe("the correction's messages, word for word @area:admin", () => {
    test.each(["ar", "en"] as const)("in %s: the helper line, the range, the cut warning and the load failure @TPL-704", async lang => {
        const {helper, hint, range, cut, loadFailed} = MESSAGES[lang];
        stubObjectUrls();
        const clinic = aClinicDetails();
        const stored = aPaperImage();
        const {user} = await renderDesigner(layoutL(), {
            lang,
            clinic,
            paperImages: [stored],
            handlers: [http.get(`${paperUrl(clinic.id)}/${stored.id}`, () => problem(500, "unexpected"))],
        });

        expect(within(calibrationSection()).getByText(helper)).toBeInTheDocument();
        expect(within(calibrationSection()).getByText(hint)).toBeInTheDocument();
        await waitFor(() => expect(paperLoadFailed()).toHaveTextContent(loadFailed));

        await typeInField(user, calibrationField("x"), "21");
        expectFieldMessage(calibrationField("x"), range);

        await typeInField(user, calibrationField("x"), "19");
        expect(cutWarning()).toHaveTextContent(cut);
    });
});

describe("a correction that can't be saved @area:admin", () => {
    test.each([
        ["out of range", "21", MESSAGES.en.range],
        ["not a number", "abc", NUMBER_REQUIRED],
    ])("X %s, only: on Save the message is on the field, no toast, the selection unchanged, nothing sent @TPL-706", async (_name, typed, message) => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await user.click(sheetItem("التاريخ"));
        await typeInField(user, calibrationField("x"), typed);
        await user.tab();

        await user.click(saveButton());

        await expectNothingSent(recorded);
        expectFieldMessage(calibrationField("x"), message);
        expect(toastTexts()).toEqual([]);
        expect(selectedIds()).toEqual(["f"]);
    });

    test("the server's `calibration.xMm` shows on X; the selection unchanged, and the next edit clears it @TPL-706", async () => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(http.put(templateUrl(clinic.id), () => problem(400, "templateCalibrationInvalid", {
            errors: [{code: "templateCalibrationInvalid", field: "calibration.xMm"}],
        })));
        await user.click(sheetItem("التاريخ"));
        await typeInField(user, calibrationField("x"), "5");
        await user.tab();

        await user.click(saveButton());

        await waitFor(() => expectFieldMessage(calibrationField("x"), MESSAGES.en.range));
        expectNoFieldMessage(calibrationField("y"));
        expect(selectedIds()).toEqual(["f"]);
        expect(saveButton()).toBeEnabled();

        await typeInField(user, calibrationField("x"), "6");
        expectNoFieldMessage(calibrationField("x"));
    });
});

describe("a refused Save and the window narrowed @area:admin", () => {
    test("a refused Save, the window narrowed below 900 px and widened: nothing scrolls when the workspace mounts again @TPL-701", async () => {
        const {user} = await renderDesigner(layoutL());
        const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "");
        await user.tab();

        await user.click(saveButton());
        await waitFor(() => expect(scrolled, "the refusal scrolls to its message").toHaveBeenCalled());
        expect(settingsField(FIELD_LABEL.name)).toHaveAttribute("aria-invalid", "true");

        act(() => setViewportWidth(899));
        expect(await screen.findByText(DESKTOP_ONLY)).toBeInTheDocument();
        scrolled.mockClear();

        act(() => setViewportWidth(1000));
        await designerShown();
        expect(settingsField(FIELD_LABEL.name), "the field's still marked").toHaveAttribute("aria-invalid", "true");
        await settled();
        expect(scrolled, "no press, no scroll").not.toHaveBeenCalled();
    });
});

describe("a name shared by several items @area:admin", () => {
    const named = (id: string, name: string, yMm: number) => aTemplateItem("manualInput", {id, name, xMm: 10, yMm, wMm: 40, hMm: 8});
    const threeSharing = () => aPrintLayout({items: [text(), named("a", "الاسم", 10), named("b", "الاسم", 20), named("c", "الاسم", 30)]});
    const twoSharing = () => aPrintLayout({items: [text(), named("a", "الاسم", 10), named("b", "الاسم", 20)]});

    const nameField = () => settingsField(FIELD_LABEL.name);
    const select = (user: UserEvent, id: string) => user.click(boxOf(id));

    test("Save: both items show «Another item already uses this name.», nothing is sent @TPL-683", async () => {
        const {user} = await renderDesigner(twoSharing());
        const recorded = recordRequests();
        await select(user, "a");
        await typeInField(user, settingsField(FIELD_LABEL.x), "11");
        await user.tab();

        await user.click(saveButton());

        await expectNothingSent(recorded);
        for (const id of ["a", "b"]) {
            await select(user, id);
            expectFieldMessage(nameField(), NAME_TAKEN);
        }
    });

    test("with another item selected, Save selects the first problem: the lower item of the two, though the server's rule names the later @TPL-683", async () => {
        const {user} = await renderDesigner(twoSharing());
        const recorded = recordRequests();
        await select(user, "a");
        await typeInField(user, settingsField(FIELD_LABEL.x), "11");
        await user.tab();
        await select(user, "b");
        expect(selectedIds()).toEqual(["b"]);

        await user.click(saveButton());

        await expectNothingSent(recorded);
        expect(selectedIds()).toEqual(["a"]);
        expectFieldMessage(nameField(), NAME_TAKEN);
    });

    test.each(["a", "b"])("fixing %s clears both, and Save sends @TPL-683", async fixed => {
        const {user} = await renderDesigner(twoSharing());
        const recorded = recordRequests();
        await select(user, "a");
        await typeInField(user, settingsField(FIELD_LABEL.x), "11");
        await user.tab();
        await user.click(saveButton());
        await expectNothingSent(recorded);

        await select(user, fixed);
        await typeInField(user, nameField(), "السن");
        expectNoFieldMessage(nameField());
        await select(user, fixed === "a" ? "b" : "a");
        expectNoFieldMessage(nameField());

        await user.click(saveButton());
        await expectToasts("Template saved");
    });

    test("a function and a manual input sharing a name: both are marked @TPL-683", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [text(), named("a", "التاريخ", 10), aTemplateItem("function", {id: "f", name: "التاريخ", xMm: 10, yMm: 20})],
        }));
        await select(user, "a");
        await typeInField(user, settingsField(FIELD_LABEL.x), "11");
        await user.tab();
        await user.click(saveButton());

        for (const id of ["a", "f"]) {
            await select(user, id);
            expectFieldMessage(nameField(), NAME_TAKEN);
        }
    });

    test("three sharing a name: all are marked; fixing one keeps the other two, and Save still refuses @TPL-722", async () => {
        const {user} = await renderDesigner(threeSharing());
        const recorded = recordRequests();
        await select(user, "a");
        await typeInField(user, settingsField(FIELD_LABEL.x), "11");
        await user.tab();
        await user.click(saveButton());
        await expectNothingSent(recorded);

        for (const id of ["a", "b", "c"]) {
            await select(user, id);
            expectFieldMessage(nameField(), NAME_TAKEN);
        }

        await select(user, "b");
        await typeInField(user, nameField(), "السن");
        expectNoFieldMessage(nameField());
        for (const id of ["a", "c"]) {
            await select(user, id);
            expectFieldMessage(nameField(), NAME_TAKEN);
        }

        await user.click(saveButton());
        await expectNothingSent(recorded);
    });
});

describe("a saved correction and other edits @area:admin", () => {
    test("an item's edit saved: the correction goes back in the body unchanged, and the designer's boxes don't move by it @TPL-613", async () => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL({calibration: {xMm: 4, yMm: -3}}), {clinic});
        const recorded = recordRequests();

        expect(boxOf("f").style.left).toBe("14mm");
        expect(boxOf("f").style.transform, "designer mode never moves a box").toBe("");
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "20");
        await user.tab();
        await user.click(saveButton());
        await expectToasts("Template saved");

        const [write] = recorded.writes();
        expect(write.path).toBe(templatePath(clinic.id));
        expect((write.body as PrintLayout).calibration).toEqual({xMm: 4, yMm: -3});
        expect(boxOf("m").style.left).toBe("20mm");
    });
});
