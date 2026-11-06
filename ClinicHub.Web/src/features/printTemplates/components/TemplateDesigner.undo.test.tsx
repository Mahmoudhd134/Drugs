import {describe, expect, test, vi} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {http, HttpResponse} from "msw";
import i18n from "../../../i18n";
import {
    aClinicContext,
    aClinicDetails,
    adminClinicsHandlers,
    anOwnerRole,
    aPrintLayout,
    aPrintTemplate,
    aTemplateItem,
    choose,
    expectToasts,
    PLATFORM_CONTEXT,
    paperImageHandlers,
    printTemplateHandlers,
    problem,
    recordRequests,
    rolesHandler,
    server,
    setViewportWidth,
    staffHandler,
    toastTexts,
} from "../../../test";
import type {RecordedRequest} from "../../../test";
import type {Context} from "../../auth/types.ts";
import {adminPrintTemplateApi} from "../../admin/adapters.ts";
import type {PrintLayout, TemplateItem} from "../types.ts";
import {
    answerQuestion,
    boxOf,
    deleteButton,
    designerShown,
    dialogsGone,
    dragGhost,
    expectFieldMessage,
    expectNoFieldMessage,
    expectNothingSent,
    FIELD_LABEL,
    focusOn,
    label,
    leaveQuestion,
    measuresOf,
    noLeaveQuestion,
    panelEntry,
    paperSize,
    pressKey,
    pressShortcut,
    REDO_KEYS,
    redoButton,
    renderDesigner,
    renderNewSheet,
    saveButton,
    selectedIds,
    settingsField,
    settingsPanel,
    sheetBoxes,
    sheetItem,
    sheetSize,
    sidePanel,
    startDrag,
    tabPath,
    templateUrl,
    theSheet,
    typeInField,
    UNDO_KEYS,
    undoButton,
    unloadAsks,
    zoomInButton,
    zoomPercent,
} from "../../../test/pages/printTemplate.tsx";

// Undo and redo: step 3 design § 3 "Undo and redo" and "Settled by the T0 reviews"; contract § 3.6, the rules behind them in layoutHistory.test.ts.

const layoutL = () => aPrintLayout({
    items: [
        aTemplateItem("prescriptionText", {id: "t"}),
        aTemplateItem("manualInput", {id: "m", xMm: 12.3, yMm: 20.3, wMm: 40, hMm: 8}),
        aTemplateItem("function", {id: "f", xMm: 70, yMm: 46}),
    ],
});

const ids = () => sheetBoxes().map(box => box.dataset.itemId);
const xOfM = () => boxOf("m").style.left;

/** The manual input selected and moved by one nudge: X 13.3, one step. */
const nudgeM = async (user: UserEvent) => {
    await user.click(sheetItem("الاسم"));
    pressKey(boxOf("m"), "ArrowRight");
    expect(xOfM()).toBe("13.3mm");
};

const overviewTab = () => screen.getByRole("tab", {name: "Overview"});
const puts = (requests: RecordedRequest[]) => requests.filter(r => r.method === "PUT");

const heldAnswer = () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    return {gate, release};
};

/** Confirms the delete question. */
const confirmDelete = async (user: UserEvent) => {
    await user.click(deleteButton());
    const dialog = await screen.findByRole("dialog", {name: label("printTemplates.deleteConfirm")});
    await user.click(within(dialog).getByRole("button", {name: "Delete"}));
};

describe("print template undo: the buttons @area:admin", () => {
    test("a change: Undo on, Redo off; undone: the layout as it was, Undo off, Redo on; redone: as it came @TPL-450", async () => {
        const {user} = await renderDesigner(layoutL());
        expect(undoButton()).toBeDisabled();
        expect(redoButton()).toBeDisabled();

        await nudgeM(user);
        expect(undoButton()).toBeEnabled();
        expect(redoButton()).toBeDisabled();

        await user.click(undoButton());
        expect(xOfM()).toBe("12.3mm");
        expect(undoButton()).toBeDisabled();
        expect(redoButton()).toBeEnabled();

        await user.click(redoButton());
        expect(xOfM()).toBe("13.3mm");
        expect(undoButton()).toBeEnabled();
        expect(redoButton()).toBeDisabled();
    });

    test("a remove brought back: its place, its name and its order, selected @TPL-457 @TPL-576", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        const before = measuresOf(boxOf("m"));
        await user.click(within(settingsPanel()).getByRole("button", {name: "Remove item"}));
        expect(ids()).toEqual(["t", "f"]);

        await user.click(undoButton());

        expect(ids()).toEqual(["t", "m", "f"]);
        expect(measuresOf(boxOf("m"))).toEqual(before);
        expect(boxOf("m")).toHaveTextContent("الاسم");
        expect(selectedIds()).toEqual(["m"]);
        expect(saveButton()).toBeDisabled();
    });

    test("selecting or zooming is no step @TPL-458", async () => {
        const {user} = await renderDesigner(layoutL());

        await user.click(sheetItem("الاسم"));
        await user.click(sheetItem("التاريخ"));
        pressKey(boxOf("f"), "Escape");
        await user.click(zoomInButton());
        await user.click(screen.getByRole("button", {name: label("printTemplates.toolbar.fit")}));

        expect(undoButton()).toBeDisabled();
        expect(redoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test("selecting or zooming between steps leaves them one each: one undo takes back one change @TPL-458", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);
        await user.click(sheetItem("التاريخ"));
        await user.click(zoomInButton());

        await user.click(undoButton());

        expect(xOfM()).toBe("12.3mm");
        expect(undoButton()).toBeDisabled();
        expect(zoomPercent()).toBe("125%");
    });

    test("selecting ends a run of nudges: the next nudge is a step of its own @TPL-558", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);
        await user.click(sheetItem("التاريخ"));
        await user.click(sheetItem("الاسم"));
        pressKey(boxOf("m"), "ArrowRight");
        expect(xOfM()).toBe("14.3mm");

        await user.click(undoButton());
        expect(xOfM()).toBe("13.3mm");
    });

    test("a language change: history stays, undo works, the sheet doesn't mirror @TPL-575", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);

        await act(() => i18n.changeLanguage("ar"));

        const undo = screen.getByRole("button", {name: "تراجع"});
        expect(undo).toBeEnabled();
        expect(xOfM()).toBe("13.3mm");
        expect(theSheet()).toHaveAttribute("dir", "ltr");
        await user.click(undo);
        expect(xOfM()).toBe("12.3mm");
        expect(boxOf("m").style.right).toBe("");
        expect(screen.getByRole("button", {name: "إعادة"})).toBeEnabled();
    });
});

describe("print template undo: one run of nudges @area:admin", () => {
    const START = 1_000_000;

    /** The manual input selected and the clock in the test's hands: each nudge reads `Date.now()` (contract § 3.5). */
    const selectAndHoldClock = async (user: UserEvent) => {
        await user.click(boxOf("m"));
        const clock = vi.spyOn(Date, "now").mockReturnValue(START);
        return (at: number) => clock.mockReturnValue(START + at);
    };

    const nudge = () => pressKey(boxOf("m"), "ArrowRight");

    test("two arrows in a row, then one undo: back to the start @TPL-451", async () => {
        const {user} = await renderDesigner(layoutL());
        await selectAndHoldClock(user);
        nudge();
        nudge();
        expect(xOfM()).toBe("14.3mm");

        await user.click(undoButton());

        expect(xOfM()).toBe("12.3mm");
        expect(undoButton()).toBeDisabled();
    });

    test("two arrows 1000 ms apart, then one undo: back to the middle; a second undo: to the start @TPL-451", async () => {
        const {user} = await renderDesigner(layoutL());
        const clockAt = await selectAndHoldClock(user);
        nudge();
        clockAt(1000);
        nudge();
        expect(xOfM()).toBe("14.3mm");

        await user.click(undoButton());
        expect(xOfM()).toBe("13.3mm");

        await user.click(undoButton());
        expect(xOfM()).toBe("12.3mm");
        expect(undoButton()).toBeDisabled();
    });

    test("two arrows 999 ms apart join: one undo goes back to the start @TPL-451", async () => {
        const {user} = await renderDesigner(layoutL());
        const clockAt = await selectAndHoldClock(user);
        nudge();
        clockAt(999);
        nudge();
        expect(xOfM()).toBe("14.3mm");

        await user.click(undoButton());

        expect(xOfM()).toBe("12.3mm");
        expect(undoButton()).toBeDisabled();
    });

    test("a Save that's sent ends the run: a nudge within the second is a new step, and undo gives the saved X @TPL-558", async () => {
        const recorded = recordRequests();
        const {user} = await renderDesigner(layoutL());
        const clockAt = await selectAndHoldClock(user);
        nudge();
        expect(xOfM()).toBe("13.3mm");

        await user.click(saveButton());
        await waitFor(() => expect(saveButton()).toBeDisabled());
        expect(recorded.writes()).toHaveLength(1);

        clockAt(500);
        focusOn(boxOf("m"));
        nudge();
        expect(xOfM()).toBe("14.3mm");

        await user.click(undoButton());

        expect(xOfM()).toBe("13.3mm");
        expect(saveButton()).toBeDisabled();
    });

    test("a Save refused by validation ends the run too: a nudge within the second is a new step, and undo gives the X it refused @TPL-558", async () => {
        const recorded = recordRequests();
        // The item in the wrong is the one being nudged, so the refused Save leaves it selected: selecting another would end the run by itself
        const {user} = await renderDesigner(aPrintLayout({
            items: [
                aTemplateItem("prescriptionText", {id: "t"}),
                aTemplateItem("manualInput", {id: "m", name: "", xMm: 12.3, yMm: 20.3, wMm: 40, hMm: 8}),
            ],
        }));
        const clockAt = await selectAndHoldClock(user);
        nudge();
        expect(xOfM()).toBe("13.3mm");

        await user.click(saveButton());
        expectFieldMessage(settingsField(FIELD_LABEL.name), label("errors.nameRequired"));
        expect(selectedIds()).toEqual(["m"]);
        await expectNothingSent(recorded);

        clockAt(500);
        focusOn(boxOf("m"));
        nudge();
        expect(xOfM()).toBe("14.3mm");

        await user.click(undoButton());

        expect(xOfM()).toBe("13.3mm");
        expect(undoButton()).toBeEnabled();
    });
});

describe("print template undo: unsaved changes follow the layout @area:admin", () => {
    test("undone back to the saved layout: Save off and leaving asks nothing; a redo brings both back @TPL-455 @smoke", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);

        await user.click(undoButton());
        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);

        await user.click(redoButton());
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);
        await user.click(overviewTab());
        await answerQuestion(user, "stay");
    });

    test("undone back to the saved layout: a tab leaves with no question @TPL-455", async () => {
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(layoutL(), {clinic});
        await nudgeM(user);
        await user.click(undoButton());

        await user.click(overviewTab());

        await waitFor(() => expect(location().pathname).toBe(`/admin/clinics/${clinic.id}`));
        noLeaveQuestion();
    });

    test("a save and then an undo: Save is on, the saved layout is the new reference @TPL-456", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);
        await user.click(saveButton());
        await expectToasts("Template saved");
        expect(saveButton()).toBeDisabled();
        // Saving doesn't clear history
        expect(undoButton()).toBeEnabled();

        await user.click(undoButton());

        expect(xOfM()).toBe("12.3mm");
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);
    });

    test("saved at B after A, undone to A: Save on and leaving asks; redone to B: Save off, nothing asks @TPL-566", async () => {
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(layoutL(), {clinic});
        await nudgeM(user);
        await user.click(saveButton());
        await expectToasts("Template saved");

        await user.click(undoButton());
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);
        await user.click(overviewTab());
        await answerQuestion(user, "stay");

        await user.click(redoButton());
        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
        await user.click(overviewTab());
        await waitFor(() => expect(location().pathname).toBe(`/admin/clinics/${clinic.id}`));
        noLeaveQuestion();
    });

    test("saved at A after that undo, redone to B: Save on, history kept @TPL-566", async () => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await nudgeM(user);
        await user.click(saveButton());
        await expectToasts("Template saved");
        await user.click(undoButton());
        await user.click(saveButton());
        await waitFor(() => expect(puts(recorded.requests)).toHaveLength(2));
        await waitFor(() => expect(saveButton()).toBeDisabled());
        expect((puts(recorded.requests)[1].body as PrintLayout).items[1].xMm).toBe(12.3);

        await user.click(redoButton());

        expect(xOfM()).toBe("13.3mm");
        expect(saveButton()).toBeEnabled();
        expect(undoButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);
    });

    describe("each exit, undone to the saved layout, asks nothing", () => {
        test("a tab, through the blocker @TPL-567", async () => {
            const clinic = aClinicDetails();
            const {user, location} = await renderDesigner(layoutL(), {clinic});
            await nudgeM(user);
            await user.click(undoButton());
            await user.click(overviewTab());
            await waitFor(() => expect(location().pathname).toBe(`/admin/clinics/${clinic.id}`));
            noLeaveQuestion();
        });

        test("Back @TPL-567", async () => {
            const clinic = aClinicDetails();
            const {user, router, location} = await renderDesigner(layoutL(), {clinic});
            await act(() => router!.navigate(`/admin/clinics/${clinic.id}`));
            await act(() => router!.navigate(tabPath(clinic.id)));
            await designerShown();
            await within(await screen.findByRole("region", {name: label("printTemplates.sheet.label")})).findByRole("button", {name: "الاسم"});
            await nudgeM(user);
            await user.click(undoButton());

            await act(() => router!.navigate(-1));

            await waitFor(() => expect(location().pathname).toBe(`/admin/clinics/${clinic.id}`));
            noLeaveQuestion();
        });

        test("logout @TPL-567", async () => {
            const template = aClinicContext({clinicId: 99, clinicName: "Template", isTemplate: true});
            const testUser = {context: "platform" as const, contexts: [PLATFORM_CONTEXT, template] as Context[]};
            const {user, auth} = await renderDesigner(layoutL(), {layout: true, user: testUser});
            await nudgeM(user);
            await user.click(undoButton());

            await user.click(screen.getByRole("button", {name: "Account"}));
            await screen.findByRole("menu");
            await user.click(screen.getByRole("menuitem", {name: "Log out"}));

            await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
            noLeaveQuestion();
        });

        test("closing or reloading: no `beforeunload` question @TPL-567", async () => {
            const {user} = await renderDesigner(layoutL());
            await nudgeM(user);
            expect(unloadAsks()).toBe(true);
            await user.click(undoButton());
            expect(unloadAsks()).toBe(false);
        });

        test("but a raw input elsewhere keeps Save on and the question @TPL-567", async () => {
            const {user} = await renderDesigner(layoutL());
            await nudgeM(user);
            await user.click(undoButton());
            await user.click(sheetItem("التاريخ"));
            await typeInField(user, settingsField(FIELD_LABEL.x), "abc");
            await user.tab();

            expect(saveButton()).toBeEnabled();
            expect(unloadAsks()).toBe(true);
            await user.click(overviewTab());
            expect(await leaveQuestion()).toBeInTheDocument();
        });
    });

    test("a new sheet: an item added and undone leaves Save on, and leaving asks @TPL-569", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Manual input"));
        await user.click(undoButton());

        expect(sheetBoxes()).toHaveLength(1);
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);
        await user.click(overviewTab());
        expect(await leaveQuestion()).toBeInTheDocument();
    });

    test("after a new sheet's first save, an undo: Save on @TPL-569", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Manual input"));
        await user.click(saveButton());
        await expectToasts("Template saved");
        expect(saveButton()).toBeDisabled();

        await user.click(undoButton());

        expect(sheetBoxes()).toHaveLength(1);
        expect(saveButton()).toBeEnabled();
    });
});

describe("print template undo: at 50 items @area:admin", () => {
    const fortyNine = (): TemplateItem[] => [
        aTemplateItem("prescriptionText", {id: "i1"}),
        ...Array.from({length: 48}, (_, n) => aTemplateItem("manualInput", {id: `i${n + 2}`, name: `Field ${n}`})),
    ];
    const tooMany = "A template can't have more than 50 items.";

    test("the 50th added: the message and the entries off; undo: 49, entries on, a drag works again; redo: 50, off again @TPL-508", async () => {
        const {user} = await renderDesigner(aPrintLayout({items: fortyNine()}));
        expect(within(sidePanel()).queryByRole("alert")).not.toBeInTheDocument();

        await user.click(panelEntry("Static text"));
        expect(sheetBoxes()).toHaveLength(50);
        expect(within(sidePanel()).getByRole("alert")).toHaveTextContent(tooMany);
        expect(panelEntry("Manual input")).toHaveAttribute("aria-disabled", "true");

        await user.click(undoButton());
        expect(sheetBoxes()).toHaveLength(49);
        expect(within(sidePanel()).queryByRole("alert")).not.toBeInTheDocument();
        expect(panelEntry("Manual input")).not.toHaveAttribute("aria-disabled", "true");
        startDrag(panelEntry("Manual input"));
        expect(dragGhost()).toBeInTheDocument();
        expect(pressKey(panelEntry("Manual input"), "Escape")).toBe(true);
        expect(dragGhost()).not.toBeInTheDocument();
        expect(sheetBoxes()).toHaveLength(49);

        await user.click(redoButton());
        expect(sheetBoxes()).toHaveLength(50);
        expect(within(sidePanel()).getByRole("alert")).toHaveTextContent(tooMany);
        expect(panelEntry("Manual input")).toHaveAttribute("aria-disabled", "true");
        startDrag(panelEntry("Manual input"));
        expect(dragGhost()).not.toBeInTheDocument();
    });
});

describe("print template undo: fields @area:admin", () => {
    const FIELDS_OF_M = [FIELD_LABEL.x, FIELD_LABEL.y, FIELD_LABEL.width, FIELD_LABEL.height, FIELD_LABEL.font, FIELD_LABEL.name];

    test("fields tabbed through with no change: no step @TPL-563", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        for (const field of FIELDS_OF_M) {
            await user.click(settingsField(field));
            await user.tab();
        }
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test("typed and taken back to the start: no step, on blur or on Enter @TPL-563", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.y), "33");
        await typeInField(user, settingsField(FIELD_LABEL.y), "20.3");
        await user.tab();
        expect(undoButton()).toBeDisabled();

        await typeInField(user, settingsField(FIELD_LABEL.name), "x");
        await typeInField(user, settingsField(FIELD_LABEL.name), "الاسم");
        await user.keyboard("{Enter}");
        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
    });

    test("12.34 typed on 12.3: no step @TPL-563", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "12.34");
        await user.tab();

        expect(undoButton()).toBeDisabled();
        expect(saveButton()).toBeDisabled();
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("12.3");
    });

    test.each([
        ["blur", "{Tab}"],
        ["Enter", "{Enter}"],
    ])("a number field, on %s: one step however many keys were typed @TPL-563", async (_name, ending) => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.y), "33.5");
        await user.keyboard(ending);
        expect(boxOf("m").style.top).toBe("33.5mm");

        await user.click(undoButton());

        expect(boxOf("m").style.top).toBe("20.3mm");
        expect(undoButton()).toBeDisabled();
    });

    test("a number field committed by Enter, then typed again: a second step @TPL-563", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.y), "33");
        await user.keyboard("{Enter}");
        await typeInField(user, settingsField(FIELD_LABEL.y), "44");
        await user.tab();

        await user.click(undoButton());
        expect(boxOf("m").style.top).toBe("33mm");
        await user.click(undoButton());
        expect(boxOf("m").style.top).toBe("20.3mm");
        expect(undoButton()).toBeDisabled();
    });

    test("a static text: Enter is a new line and no step; on blur, one step @TPL-564", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("staticText", {id: "s", text: "ثابت"})],
        }));
        await user.click(sheetItem("ثابت"));
        await user.click(settingsField(FIELD_LABEL.text));
        await user.keyboard("a{Enter}b");
        expect(settingsField(FIELD_LABEL.text)).toHaveValue("ثابتa\nb");
        await user.tab();

        await user.click(undoButton());

        expect(settingsField(FIELD_LABEL.text)).toHaveValue("ثابت");
        expect(undoButton()).toBeDisabled();
    });

    test.each([
        ["blur", "{Tab}"],
        ["Enter", "{Enter}"],
    ])("a name, on %s: one step however many keys were typed @TPL-564", async (_name, ending) => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "Patient");
        await user.keyboard(ending);
        expect(boxOf("m")).toHaveTextContent("Patient");

        await user.click(undoButton());

        expect(boxOf("m")).toHaveTextContent("الاسم");
        expect(undoButton()).toBeDisabled();
    });

    test("a name committed by Enter and then blurred: still one step @TPL-564", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "Patient");
        await user.keyboard("{Enter}");
        await user.tab();

        await user.click(undoButton());
        expect(undoButton()).toBeDisabled();
    });

    test("typed text in a focused field, the toolbar's Undo clicked: the blur commits, the undo reverts that, the field shows the layout's value @TPL-581", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.y), "33");
        // Undo counts a field with a real change, though no step is recorded yet (contract § 6.19)
        expect(undoButton()).toBeEnabled();

        await user.click(undoButton());

        expect(settingsField(FIELD_LABEL.y)).toHaveValue("20.3");
        expect(boxOf("m").style.top).toBe("20.3mm");
        expect(undoButton()).toBeDisabled();
        expect(redoButton()).toBeEnabled();
        expect(saveButton()).toBeDisabled();
    });

    test("a focused field with no real change: Undo reverts the step before it, and the field shows its value @TPL-581", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);
        await user.click(settingsField(FIELD_LABEL.x));

        await user.click(undoButton());

        expect(settingsField(FIELD_LABEL.x)).toHaveValue("12.3");
        expect(xOfM()).toBe("12.3mm");
    });

    test("«abc» in X and the item added before it undone: the raw text goes, and Save isn't left on with nothing to say @TPL-565", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(panelEntry("Static text"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "abc");
        await user.tab();
        expectFieldMessage(settingsField(FIELD_LABEL.x), "Enter a number.");

        await user.click(undoButton());

        expect(ids()).toEqual(["t", "m", "f"]);
        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
    });

    test("«abc» in X and a change to X before it undone: X is restored, the raw text goes, and nothing is unsaved @TPL-565", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "20");
        await user.tab();
        await typeInField(user, settingsField(FIELD_LABEL.x), "abc");
        await user.tab();
        expect(saveButton()).toBeEnabled();

        await user.click(undoButton());

        expect(settingsField(FIELD_LABEL.x)).toHaveValue("12.3");
        expectNoFieldMessage(settingsField(FIELD_LABEL.x));
        expect(xOfM()).toBe("12.3mm");
        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
    });

    test("an undo clears a raw sheet measure too @TPL-565", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            page: {size: "custom", widthMm: 200, heightMm: 200},
            items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m", xMm: 12.3, yMm: 20, wMm: 40, hMm: 8})],
        }));
        await user.click(sheetItem("الاسم"));
        pressKey(boxOf("m"), "ArrowRight");
        await typeInField(user, settingsField(FIELD_LABEL.pageWidth), "500");
        await user.tab();
        expectFieldMessage(settingsField(FIELD_LABEL.pageWidth), "The sheet size isn't valid.");

        await user.click(undoButton());

        expect(settingsField(FIELD_LABEL.pageWidth)).toHaveValue("200");
        expectNoFieldMessage(settingsField(FIELD_LABEL.pageWidth));
        expect(saveButton()).toBeDisabled();
    });
});

describe("print template undo: the page size @area:admin", () => {
    const onA4 = () => aPrintLayout({
        page: {size: "A4", widthMm: 210, heightMm: 297},
        items: [
            aTemplateItem("prescriptionText", {id: "t", xMm: 15, yMm: 40, wMm: 180, hMm: 50}),
            aTemplateItem("manualInput", {id: "m", xMm: 140, yMm: 46, wMm: 60, hMm: 8}),
        ],
    });

    test("a change that moved and shrank items, undone: each exact, unlike going back by the select; redone: moved again @TPL-579 @TPL-450", async () => {
        const {user} = await renderDesigner(onA4());
        const before = [measuresOf(boxOf("t")), measuresOf(boxOf("m"))];

        await choose(user, paperSize(), "A5");
        expect(measuresOf(boxOf("t"))).toEqual({x: "0mm", y: "40mm", w: "148mm", h: "50mm", font: "11pt"});
        expect(measuresOf(boxOf("m"))).toEqual({x: "88mm", y: "46mm", w: "60mm", h: "8mm", font: "11pt"});

        await user.click(undoButton());
        expect([measuresOf(boxOf("t")), measuresOf(boxOf("m"))]).toEqual(before);
        expect(sheetSize()).toEqual({w: "210mm", h: "297mm"});
        expect(paperSize()).toHaveTextContent("A4");
        expect(saveButton()).toBeDisabled();

        await user.click(redoButton());
        expect(measuresOf(boxOf("t"))).toEqual({x: "0mm", y: "40mm", w: "148mm", h: "50mm", font: "11pt"});
        expect(sheetSize()).toEqual({w: "148mm", h: "210mm"});
    });

    test("a real page-size change re-fits, and so do its undo and its redo @TPL-579", async () => {
        const {user} = await renderDesigner(onA4());
        await user.click(zoomInButton());
        expect(zoomPercent()).toBe("125%");

        await choose(user, paperSize(), "A5");
        expect(zoomPercent()).toBe("100%");

        await user.click(zoomInButton());
        await user.click(undoButton());
        expect(zoomPercent()).toBe("100%");

        await user.click(zoomInButton());
        await user.click(redoButton());
        expect(zoomPercent()).toBe("100%");
    });

    test("an undo of an item's change doesn't re-fit @TPL-579", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);
        await user.click(zoomInButton());

        await user.click(undoButton());

        expect(zoomPercent()).toBe("125%");
    });

    describe("a custom sheet", () => {
        const custom = () => aPrintLayout({
            page: {size: "custom", widthMm: 200, heightMm: 200},
            items: [aTemplateItem("prescriptionText", {id: "t", xMm: 0, yMm: 0, wMm: 20, hMm: 20})],
        });

        test("the same size committed: no step, no re-fit @TPL-579", async () => {
            const {user} = await renderDesigner(custom());
            await user.click(zoomInButton());

            await typeInField(user, settingsField(FIELD_LABEL.pageWidth), "200");
            await user.keyboard("{Enter}");

            expect(undoButton()).toBeDisabled();
            expect(zoomPercent()).toBe("125%");
            expect(saveButton()).toBeDisabled();
        });

        test("an invalid measure: no step, no re-fit @TPL-579", async () => {
            const {user} = await renderDesigner(custom());
            await user.click(zoomInButton());

            await typeInField(user, settingsField(FIELD_LABEL.pageWidth), "500");
            await user.keyboard("{Enter}");

            expect(undoButton()).toBeDisabled();
            expect(zoomPercent()).toBe("125%");
            expect(sheetSize().w).toBe("200mm");
        });

        test("a real measure: one step and a re-fit; undone, the measure as it was @TPL-579", async () => {
            const {user} = await renderDesigner(custom());
            await user.click(zoomInButton());

            await typeInField(user, settingsField(FIELD_LABEL.pageWidth), "300");
            await user.keyboard("{Enter}");
            expect(sheetSize().w).toBe("300mm");
            expect(zoomPercent()).toBe("100%");

            await user.click(undoButton());
            expect(sheetSize().w).toBe("200mm");
            expect(settingsField(FIELD_LABEL.pageWidth)).toHaveValue("200");
            expect(undoButton()).toBeDisabled();
        });
    });

    test("the selection is kept if the item is there @TPL-579", async () => {
        const {user} = await renderDesigner(onA4());
        await user.click(sheetItem("الاسم"));
        await choose(user, paperSize(), "A5");
        await user.click(undoButton());
        expect(selectedIds()).toEqual(["m"]);
    });
});

describe("print template undo: a save around it @area:admin", () => {
    test("a Save in flight and an undo: the answer sets the baseline to what was sent, the layout stays undone, Save is on @TPL-583", async () => {
        const clinic = aClinicDetails();
        const {gate, release} = heldAnswer();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(http.put(templateUrl(clinic.id), async ({request}) => {
            const layout = await request.json() as PrintLayout;
            await gate;
            return HttpResponse.json({layout, updatedAt: "2026-11-05T10:00:00Z"});
        }));
        const recorded = recordRequests();
        await nudgeM(user);
        await user.click(saveButton());
        await waitFor(() => expect(puts(recorded.requests)).toHaveLength(1));

        await user.click(undoButton());
        release();
        await expectToasts("Template saved");

        expect(xOfM()).toBe("12.3mm");
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);

        // The baseline is what was sent: going forward to it leaves nothing to save
        await user.click(redoButton());
        expect(xOfM()).toBe("13.3mm");
        expect(saveButton()).toBeDisabled();
    });

    test("a Save refused naming items[2].name, then undone so the indexes shift: the message doesn't land on another item @TPL-572", async () => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(aPrintLayout({
            items: [
                aTemplateItem("prescriptionText", {id: "t"}),
                aTemplateItem("manualInput", {id: "a", name: "أ"}),
                aTemplateItem("manualInput", {id: "b", name: "ب"}),
                aTemplateItem("manualInput", {id: "c", name: "ج"}),
            ],
        }), {clinic});
        server.use(http.put(templateUrl(clinic.id), () => problem(400, "templateItemNameTaken", {
            errors: [{code: "templateItemNameTaken", field: "items[2].name"}],
        })));
        await user.click(sheetItem("أ"));
        await user.click(within(settingsPanel()).getByRole("button", {name: "Remove item"}));
        await user.click(saveButton());
        await expectToasts("Another item already uses this name.");
        expect(selectedIds()).toEqual(["c"]);
        expectFieldMessage(settingsField(FIELD_LABEL.name), "Another item already uses this name.");

        await user.click(undoButton());

        expect(ids()).toEqual(["t", "a", "b", "c"]);
        expectNoFieldMessage(settingsField(FIELD_LABEL.name));
        for (const name of ["ب", "ج"]) {
            await user.click(sheetItem(name));
            expectNoFieldMessage(settingsField(FIELD_LABEL.name));
        }
    });

    test("a refetch answering another layout: draft, baseline, selection and history don't change, and undo uses the local steps @TPL-570", async () => {
        const clinic = aClinicDetails();
        const layout = layoutL();
        const {user, queryClient} = await renderDesigner(layout, {clinic});
        await nudgeM(user);

        const changed = {...layout, items: [layout.items[0]]};
        server.use(http.get(templateUrl(clinic.id), () => HttpResponse.json(aPrintTemplate({layout: changed}))));
        await act(() => queryClient.invalidateQueries({queryKey: adminPrintTemplateApi(clinic.id).scope}));

        expect(ids()).toEqual(["t", "m", "f"]);
        expect(xOfM()).toBe("13.3mm");
        expect(selectedIds()).toEqual(["m"]);
        expect(undoButton()).toBeEnabled();

        await user.click(undoButton());
        expect(ids()).toEqual(["t", "m", "f"]);
        expect(xOfM()).toBe("12.3mm");
        // Back on the layout loaded first: nothing to save
        expect(saveButton()).toBeDisabled();
    });
});

describe("print template undo: until the page is left @area:admin", () => {
    test("the template removed: the history is gone; «إنشاء قالب»: both buttons off, Ctrl+Z changes nothing @TPL-459 @TPL-573", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);

        await confirmDelete(user);
        await user.click(await screen.findByRole("button", {name: "Create template"}));
        await dialogsGone();

        expect(undoButton()).toBeDisabled();
        expect(redoButton()).toBeDisabled();
        const before = sheetBoxes().map(measuresOf);
        pressShortcut(sheetBoxes()[0], UNDO_KEYS);
        expect(sheetBoxes().map(measuresOf)).toEqual(before);
    });

    test("the empty state after a removal: no toolbar left to press @TPL-459", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);

        await confirmDelete(user);

        expect(await screen.findByRole("button", {name: "Create template"})).toBeInTheDocument();
        expect(screen.queryByTestId("template-toolbar")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: label("printTemplates.toolbar.undo")})).not.toBeInTheDocument();
    });

    test("the delete cancelled: history stays @TPL-573", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);

        await user.click(deleteButton());
        const dialog = await screen.findByRole("dialog", {name: label("printTemplates.deleteConfirm")});
        await user.click(within(dialog).getByRole("button", {name: "Cancel"}));
        await dialogsGone();

        expect(undoButton()).toBeEnabled();
        await user.click(undoButton());
        expect(xOfM()).toBe("12.3mm");
    });

    test("the delete failed: history stays @TPL-573", async () => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(http.delete(templateUrl(clinic.id), () => problem(500, "unexpected")));
        await nudgeM(user);

        await confirmDelete(user);
        await expectToasts("Something went wrong. Please try again.");
        await dialogsGone();

        expect(undoButton()).toBeEnabled();
        await user.click(undoButton());
        expect(xOfM()).toBe("12.3mm");
    });

    test("going to clinic B: B's undo is off and Ctrl+Z changes nothing there @TPL-571", async () => {
        const clinicB = aClinicDetails({name: "Clinic B"});
        const clinicA = aClinicDetails({name: "Clinic A"});
        const layoutB = aPrintLayout({items: [aTemplateItem("prescriptionText", {id: "tB"}), aTemplateItem("manualInput", {id: "mB", name: "من ب", xMm: 33})]});
        const {user, router, location} = await renderDesigner(layoutB, {clinic: clinicB});
        server.use(...adminClinicsHandlers([clinicA, clinicB]), ...printTemplateHandlers(clinicA.id, {template: aPrintTemplate({layout: layoutL()})}), ...paperImageHandlers(clinicA.id));

        await act(() => router!.navigate(tabPath(clinicA.id)));
        await screen.findByRole("heading", {name: "Clinic A"});
        await designerShown();
        await within(await screen.findByRole("region", {name: label("printTemplates.sheet.label")})).findByRole("button", {name: "الاسم"});
        await nudgeM(user);

        await act(() => router!.navigate(-1));
        await answerQuestion(user, "leave");
        await waitFor(() => expect(location().pathname).toBe(tabPath(clinicB.id)));
        await screen.findByRole("heading", {name: "Clinic B"});
        await designerShown();
        await within(screen.getByRole("region", {name: label("printTemplates.sheet.label")})).findByRole("button", {name: "من ب"});

        expect(undoButton()).toBeDisabled();
        expect(redoButton()).toBeDisabled();
        pressShortcut(document.body, UNDO_KEYS);
        pressShortcut(document.body, REDO_KEYS);
        expect(boxOf("mB").style.left).toBe("33mm");
    });

    test("leaving to the Staff tab and back: undo is off, the saved layout shows @TPL-571", async () => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(staffHandler(clinic.id, []), rolesHandler(clinic.id, [anOwnerRole()]));
        await nudgeM(user);

        await user.click(screen.getByRole("tab", {name: "Staff"}));
        await answerQuestion(user, "leave");
        await waitFor(() => expect(screen.queryByRole("region", {name: label("printTemplates.sheet.label")})).not.toBeInTheDocument());

        await user.click(screen.getByRole("tab", {name: "Print template"}));
        await designerShown();
        await within(await screen.findByRole("region", {name: label("printTemplates.sheet.label")})).findByRole("button", {name: "الاسم"});

        expect(undoButton()).toBeDisabled();
        expect(redoButton()).toBeDisabled();
        expect(xOfM()).toBe("12.3mm");
        pressShortcut(document.body, UNDO_KEYS);
        expect(xOfM()).toBe("12.3mm");
    });

    test("the window narrowed below 900 px: shortcuts and Delete change nothing behind the message; widened, history and selection are there @TPL-574", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);

        act(() => setViewportWidth(800));
        expect(await screen.findByText("Open this page on a computer.")).toBeInTheDocument();
        expect(pressShortcut(document.body, UNDO_KEYS)).toBe(false);
        expect(pressKey(document.body, "Delete")).toBe(false);
        expect(pressKey(document.body, "ArrowRight")).toBe(false);

        act(() => setViewportWidth(1280));
        await designerShown();
        expect(ids()).toEqual(["t", "m", "f"]);
        expect(xOfM()).toBe("13.3mm");
        expect(selectedIds()).toEqual(["m"]);
        expect(undoButton()).toBeEnabled();

        await user.click(undoButton());
        expect(xOfM()).toBe("12.3mm");
    });

    test("no toast of its own: an undo says nothing @TPL-450", async () => {
        const {user} = await renderDesigner(layoutL());
        await nudgeM(user);
        await user.click(undoButton());
        await user.click(redoButton());
        expect(toastTexts()).toEqual([]);
    });
});
