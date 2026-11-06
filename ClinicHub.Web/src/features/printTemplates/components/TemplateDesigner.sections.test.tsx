import {describe, expect, test, vi} from "vitest";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {api as client} from "../../../api/client.ts";
import {aClinicDetails, aPaperImage, aPrintLayout, aTemplateItem, recordRequests, setViewportWidth, toastTexts} from "../../../test";
import {aFile, stubObjectUrls} from "../../../test/pages/attachments.tsx";
import {
    boxOf,
    calibrationField,
    cutWarning,
    designerShown,
    expectFieldMessage,
    expectNothingSent,
    FIELD_LABEL,
    fieldAnywhere,
    focusOn,
    handleOf,
    label,
    openSections,
    paperUrl,
    pickPaper,
    pressKey,
    redoButton,
    renderDesigner,
    renderDesignerWithoutPaper,
    renderNewSheet,
    saveButton,
    sectionButton,
    sectionMark,
    selectedIds,
    settingsField,
    settingsPanel,
    sheetBoxes,
    testPrintButton,
    typeInField,
    undoButton,
} from "../../../test/pages/printTemplate.tsx";
import {settled} from "../../../test/pages/printFlow.tsx";
import {installPrint} from "../../../test/print.ts";
import type {PrintLayout} from "../types.ts";

// The settings' collapsible sections: step 4 contract § 4.3.1, § 10.28. The panel's height and what stays in view: e2e (TPL-734).

const layoutL = (fields: Partial<PrintLayout> = {}) => aPrintLayout({
    items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m", xMm: 40, yMm: 20}), aTemplateItem("function", {id: "f", xMm: 40, yMm: 40})],
    ...fields,
});

const NAME_REQUIRED = "Name is required.";
const RANGE = "The correction must be between −20 and +20 mm.";
const overviewTab = () => screen.getByRole("tab", {name: "Overview"});
const templateTab = () => screen.getByRole("tab", {name: "Print template"});
const theSheetWidth = () => screen.getByTestId("template-sheet").style.width;
const press =(element: Element) => fireEvent.pointerDown(element, {pointerId: 1, button: 0, buttons: 1, clientX: 100, clientY: 100});
const release = (element: Element) => fireEvent.pointerUp(element, {pointerId: 1, button: 0, buttons: 0, clientX: 100, clientY: 100});

/** What was scrolled into view from now on, each with its options. */
const recordScrolls = () => {
    const scrolled: { element: Element; options: boolean | ScrollIntoViewOptions | undefined }[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function record(this: Element, options?: boolean | ScrollIntoViewOptions) {
        scrolled.push({element: this, options});
    });
    return scrolled;
};

describe("one section at a time @area:admin", () => {
    test.each([
        ["en" as const, ["Sheet", "Printer correction", "Item", "Paper image"]],
        ["ar" as const, ["الورقة", "تصحيح الطابعة", "العنصر", "صورة الورقة"]],
    ])("in %s: named by their titles; the sheet's is open at first, one opens at a time, and pressing the open one leaves all closed @TPL-729", async (lang, titles) => {
        const {user} = await renderDesigner(layoutL(), {lang});

        expect(within(settingsPanel()).getAllByRole("button", {expanded: false}).map(button => button.textContent)).toEqual(titles.slice(1));
        expect(within(settingsPanel()).getAllByRole("button", {expanded: true}).map(button => button.textContent)).toEqual(titles.slice(0, 1));
        expect(openSections()).toEqual(["page"]);

        for (const section of ["calibration", "item", "paper", "page"] as const) {
            await user.click(sectionButton(section));
            expect(openSections(), `${section} pressed`).toEqual([section]);
        }

        await user.click(sectionButton("page"));

        expect(openSections(), "the open one pressed").toEqual([]);
    });

    test("closed, a section's fields aren't reachable; open, they are, and only its own @TPL-729", async () => {
        const {user} = await renderDesigner(layoutL());
        const sheetWidth = label("printTemplates.page.width");
        const correctionX = label("printTemplates.calibration.x");
        const panel = within(settingsPanel());

        expect(panel.getByRole("textbox", {name: sheetWidth})).toBeVisible();
        await waitFor(() => expect(panel.queryByRole("textbox", {name: correctionX})).not.toBeInTheDocument());

        await user.click(sectionButton("calibration"));

        expect(panel.getByRole("textbox", {name: correctionX})).toBeVisible();
        await waitFor(() => expect(panel.queryByRole("textbox", {name: sheetWidth})).not.toBeInTheDocument());
    });

    test("with no paper adapter: three sections @TPL-729", async () => {
        await renderDesignerWithoutPaper(layoutL());

        expect(openSections()).toEqual(["page"]);
        expect(within(settingsPanel()).getAllByRole("button", {expanded: false}).map(button => button.textContent)).toEqual(["Printer correction", "Item"]);
    });
});

describe("selecting opens the item's section @area:admin", () => {
    const INTO_ITEM: [string, (user: Awaited<ReturnType<typeof renderDesigner>>["user"]) => Promise<void> | void][] = [
        ["a press on a box", () => {
            press(boxOf("m"));
            release(boxOf("m"));
        }],
        ["a click on a box", user => user.click(boxOf("m"))],
        ["Enter on a box", async user => {
            focusOn(boxOf("m"));
            await user.keyboard("{Enter}");
        }],
        ["Space on a box", async user => {
            focusOn(boxOf("m"));
            await user.keyboard(" ");
        }],
    ];

    test.each(INTO_ITEM)("%s, with another section open @TPL-730 @smoke", async (_name, act_) => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sectionButton("calibration"));
        expect(selectedIds()).toEqual([]);

        await act_(user);

        expect(selectedIds()).toEqual(["m"]);
        expect(openSections()).toEqual(["item"]);
        expect(settingsField(FIELD_LABEL.x)).toBeVisible();
    });

    test.each(INTO_ITEM)("%s, on the item already selected, with another section open @TPL-730", async (_name, act_) => {
        const {user} = await renderDesigner(layoutL());
        await user.click(boxOf("m"));
        await user.click(sectionButton("paper"));
        expect(openSections()).toEqual(["paper"]);

        await act_(user);

        expect(selectedIds()).toEqual(["m"]);
        expect(openSections()).toEqual(["item"]);
    });

    test.each(INTO_ITEM)("%s, with all sections closed @TPL-730", async (_name, act_) => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sectionButton("page"));
        expect(openSections()).toEqual([]);

        await act_(user);

        expect(openSections()).toEqual(["item"]);
    });

    test("a press on a handle of the selected item, with another section open @TPL-730", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(boxOf("m"));
        await user.click(sectionButton("calibration"));

        press(handleOf("se")!);
        release(handleOf("se")!);

        expect(openSections()).toEqual(["item"]);
    });

    test("an item added by a click, with another section open; again with it closed by hand @TPL-730", async () => {
        const {user} = await renderNewSheet();
        expect(openSections()).toEqual(["page"]);

        await user.click(screen.getByRole("button", {name: "Manual input"}));

        expect(sheetBoxes()).toHaveLength(2);
        expect(openSections()).toEqual(["item"]);
        expect(settingsField(FIELD_LABEL.name)).toBeVisible();

        await user.click(sectionButton("item"));
        expect(openSections()).toEqual([]);
        await user.click(screen.getByRole("button", {name: "Static text"}));

        expect(sheetBoxes()).toHaveLength(3);
        expect(openSections()).toEqual(["item"]);
    });

    test("opening it by selecting brings it into view in its column, once; a section pressed by hand, or the item's already open, scrolls nothing to it @TPL-730", async () => {
        const {user} = await renderDesigner(layoutL());
        const scrolled = recordScrolls();
        const toItem = () => scrolled.filter(({element}) => element.getAttribute("data-settings-section") === "item");

        await user.click(sectionButton("item"));
        await user.click(boxOf("m"));
        await user.click(boxOf("f"));
        await user.click(sectionButton("calibration"));

        await user.click(boxOf("m"));

        await waitFor(() => expect(toItem().length).toBeGreaterThan(0));
        await settled();
        expect(toItem()).toHaveLength(1);
        expect(toItem()[0].options).toEqual({block: "nearest"});
    });

    test("undo and redo leave the open section as it is, also when they bring the selection back @TPL-730", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(boxOf("m"));
        expect(pressKey(boxOf("m"), "ArrowRight")).toBe(true);
        expect(boxOf("m").style.left).toBe("41mm");
        await user.click(sectionButton("calibration"));
        expect(openSections()).toEqual(["calibration"]);

        await user.click(undoButton());

        expect(boxOf("m").style.left).toBe("40mm");
        expect(selectedIds()).toEqual(["m"]);
        expect(openSections()).toEqual(["calibration"]);

        await user.click(redoButton());

        expect(boxOf("m").style.left).toBe("41mm");
        expect(openSections()).toEqual(["calibration"]);
    });

    test("a nudge leaves the open section as it is, also when all are closed @TPL-730", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(boxOf("m"));
        await user.click(sectionButton("paper"));
        focusOn(boxOf("m"));

        expect(pressKey(boxOf("m"), "ArrowDown")).toBe(true);

        expect(boxOf("m").style.top).toBe("21mm");
        expect(openSections()).toEqual(["paper"]);

        await user.click(sectionButton("paper"));
        focusOn(boxOf("m"));
        expect(pressKey(boxOf("m"), "ArrowDown")).toBe(true);

        expect(boxOf("m").style.top).toBe("22mm");
        expect(openSections()).toEqual([]);
    });

    test("typing in a field leaves the open section as it is: the sheet's, the correction's @TPL-730", async () => {
        const {user} = await renderDesigner(layoutL({page: {size: "custom", widthMm: 148, heightMm: 210}}));
        await user.click(boxOf("m"));
        await user.click(sectionButton("calibration"));

        await typeInField(user, within(settingsPanel()).getByRole("textbox", {name: label("printTemplates.calibration.x")}), "3");
        await user.tab();

        expect(saveButton()).toBeEnabled();
        expect(openSections()).toEqual(["calibration"]);

        await user.click(sectionButton("page"));
        await typeInField(user, within(settingsPanel()).getByRole("textbox", {name: FIELD_LABEL.pageWidth}), "150");
        await user.tab();

        expect(theSheetWidth()).toBe("150mm");
        expect(openSections()).toEqual(["page"]);
    });

    test("selecting nothing leaves the open section as it is @TPL-730", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(boxOf("m"));
        await user.click(sectionButton("calibration"));
        focusOn(boxOf("m"));

        expect(pressKey(boxOf("m"), "Escape")).toBe(true);

        expect(selectedIds()).toEqual([]);
        expect(openSections()).toEqual(["calibration"]);
    });
});

describe("closing a section loses nothing @area:admin", () => {
    test("a picked file stays, ready to upload, and nothing was sent @TPL-731", async () => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await user.click(sectionButton("paper"));
        const upload = within(settingsPanel()).getByRole("button", {name: label("attachments.upload")});
        await screen.findByTestId("template-paper-rules");

        pickPaper(aFile("scan.png", 2048, "image/png"));
        const picked = await screen.findByRole("list", {name: label("attachments.selectedLabel")});
        expect(within(picked).getAllByRole("listitem")).toHaveLength(1);
        await waitFor(() => expect(upload).toBeEnabled());

        await user.click(sectionButton("paper"));
        expect(openSections()).toEqual([]);
        expect(picked, "the same list, still mounted").toBeInTheDocument();

        await user.click(sectionButton("calibration"));
        await user.click(sectionButton("paper"));

        expect(within(picked).getAllByRole("listitem")).toHaveLength(1);
        expect(within(picked).getAllByRole("listitem")[0]).toBeVisible();
        expect(upload).toBeEnabled();
        await expectNothingSent(recorded);
    });

    test("a running upload isn't aborted, and it ends with its row, also with another section open @TPL-731", async () => {
        const urls = stubObjectUrls();
        const clinic = aClinicDetails();
        const stored = aPaperImage({originalFileName: "stored.png"});
        const paperImages: ReturnType<typeof aPaperImage>[] = [];
        let finish = () => undefined as void;
        const held = new Promise<void>(resolve => {
            finish = resolve;
        });
        const {user} = await renderDesigner(layoutL(), {
            clinic,
            paperImages,
            handlers: [http.post(paperUrl(clinic.id), async () => {
                await held;
                paperImages.unshift(stored);
                return HttpResponse.json(stored);
            })],
        });
        const post = vi.spyOn(client, "post");
        await user.click(sectionButton("paper"));
        await screen.findByTestId("template-paper-rules");
        pickPaper(aFile("scan.png", 2048, "image/png"));
        const upload = within(settingsPanel()).getByRole("button", {name: label("attachments.upload")});
        await waitFor(() => expect(upload).toBeEnabled());
        await user.click(upload);
        await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
        const signal = post.mock.calls[0][2]?.signal as AbortSignal;

        await user.click(sectionButton("calibration"));
        expect(openSections()).toEqual(["calibration"]);

        await settled();
        expect(signal.aborted, "closing the section doesn't abort it").toBe(false);

        act(() => finish());
        await waitFor(() => expect(screen.getByTestId("template-paper-image")).toBeInTheDocument());
        expect(signal.aborted).toBe(false);
        expect(paperImages).toEqual([stored]);
        expect(urls.live()).toHaveLength(1);

        await user.click(sectionButton("paper"));
        expect(within(await screen.findByRole("list", {name: label("attachments.storedLabel")})).getByText("stored.png")).toBeVisible();
    });

    test("text typed in a field stays: one the layout can't hold, and one not committed yet @TPL-731", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(boxOf("m"));
        const x = settingsField(FIELD_LABEL.x);
        const name = settingsField(FIELD_LABEL.name);
        await typeInField(user, name, "السن");
        await typeInField(user, x, "abc");

        await user.click(sectionButton("item"));
        expect(openSections()).toEqual([]);
        expect(x, "the same field, still mounted").toBeInTheDocument();

        await user.click(sectionButton("calibration"));
        await user.click(sectionButton("item"));

        expect(settingsField(FIELD_LABEL.x)).toBe(x);
        expect(x).toHaveValue("abc");
        expect(name).toHaveValue("السن");
        expect(saveButton()).toBeEnabled();
    });
});

describe("a refused press and the closed sections @area:admin", () => {
    const REFUSING = [
        ["Save", saveButton],
        ["Test print", testPrintButton],
    ] as const;

    test.each(REFUSING)("%s: the correction's problem before the item's: the correction opens, its message is scrolled into view; the item's section shows the mark; fixing each clears it @TPL-732 @smoke", async (_name, button) => {
        const printing = installPrint();
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await user.click(sectionButton("calibration"));
        await typeInField(user, calibrationField("x"), "21");
        await user.click(boxOf("m"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "");
        await user.tab();
        expect(openSections()).toEqual(["item"]);
        const scrolled = recordScrolls();

        await user.click(button());

        await waitFor(() => expect(openSections()).toEqual(["calibration"]));
        await waitFor(() => expect(scrolled.some(({element}) => element.contains(calibrationField("x")))).toBe(true));
        const scroll = scrolled.find(({element}) => element.contains(calibrationField("x")))!;
        expect(scroll.options).toEqual({block: "nearest"});
        expect(scroll.element.textContent, "the whole field, so the message below the input shows").toContain(RANGE);
        expectFieldMessage(calibrationField("x"), RANGE);
        expect(printing.print).not.toHaveBeenCalled();
        await expectNothingSent(recorded);

        expect(sectionMark("item"), "the item's closed section is marked").toBeVisible();
        expect(sectionButton("item")).toHaveAttribute("data-has-error", "true");
        expect(sectionMark("calibration"), "an open section has no mark").toBeNull();
        expect(sectionMark("page"), "a section with no error has no mark").toBeNull();
        expect(sectionButton("page")).not.toHaveAttribute("data-has-error");

        await typeInField(user, calibrationField("x"), "2");

        await user.click(sectionButton("item"));
        expect(sectionMark("calibration"), "fixed: no mark when it closes").toBeNull();
        expect(sectionMark("item")).toBeNull();
        await user.click(sectionButton("calibration"));
        expect(sectionMark("item"), "its error stands while closed").toBeVisible();
        await user.click(sectionButton("item"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "السن");
        await user.click(sectionButton("page"));

        expect(sectionMark("item"), "fixed: the mark goes").toBeNull();
        expect(sectionButton("item")).not.toHaveAttribute("data-has-error");
        expect(toastTexts()).toEqual([]);
    });

    test.each(REFUSING)("%s: the sheet's problem comes first: the sheet's section opens, and the correction's and the item's are marked @TPL-732", async (_name, button) => {
        installPrint();
        const {user} = await renderDesigner(layoutL({page: {size: "custom", widthMm: 148, heightMm: 210}}));
        await typeInField(user, within(settingsPanel()).getByRole("textbox", {name: FIELD_LABEL.pageWidth}), "abc");
        await user.tab();
        await user.click(sectionButton("calibration"));
        await typeInField(user, calibrationField("y"), "21");
        await user.click(boxOf("m"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "");
        await user.tab();
        expect(openSections()).toEqual(["item"]);

        await user.click(button());

        await waitFor(() => expect(openSections()).toEqual(["page"]));
        expect(sectionMark("calibration")).toBeVisible();
        expect(sectionMark("item")).toBeVisible();
    });

    test.each(REFUSING)("%s: only the item's problem, the selection elsewhere: the item's section opens, on the first problem's item @TPL-732 @TPL-701", async (_name, button) => {
        installPrint();
        const layout = layoutL({items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m", xMm: 40, yMm: 20, name: ""}), aTemplateItem("function", {id: "f", xMm: 40, yMm: 40})]});
        const {user} = await renderDesigner(layout);
        await user.click(boxOf("f"));
        await user.click(sectionButton("calibration"));
        // Something to save, so Save is on
        await typeInField(user, calibrationField("x"), "1");
        await user.tab();
        const scrolled = recordScrolls();

        await user.click(button());

        await waitFor(() => expect(openSections()).toEqual(["item"]));
        expect(selectedIds()).toEqual(["m"]);
        expectFieldMessage(settingsField(FIELD_LABEL.name), NAME_REQUIRED);
        await waitFor(() => expect(scrolled.some(({element}) => element.contains(settingsField(FIELD_LABEL.name)) && element.textContent?.includes(NAME_REQUIRED))).toBe(true));
    });

    test.each(REFUSING)("%s, the problem's section already open: it stays open, and its message is scrolled to @TPL-732", async (_name, button) => {
        installPrint();
        const {user} = await renderDesigner(layoutL());
        await user.click(boxOf("m"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "");
        await user.tab();
        const scrolled = recordScrolls();

        await user.click(button());

        await waitFor(() => expect(scrolled.some(({element}) => element.contains(settingsField(FIELD_LABEL.name)))).toBe(true));
        expect(openSections()).toEqual(["item"]);
    });

    test.each(REFUSING)("%s: an error no field shows opens nothing: 51 items answer a toast, and the open section stays @TPL-732", async (_name, button) => {
        installPrint();
        const many = Array.from({length: 50}, (_, index) => aTemplateItem("staticText", {id: `s${index}`, text: `s${index}`, xMm: 1, yMm: 1, wMm: 10, hMm: 5}));
        const {user} = await renderDesigner(layoutL({items: [aTemplateItem("prescriptionText", {id: "t"}), ...many]}));
        await user.click(sectionButton("calibration"));
        await typeInField(user, calibrationField("x"), "1");
        await user.tab();

        await user.click(button());

        await waitFor(() => expect(toastTexts().length).toBeGreaterThan(0));
        await settled();
        expect(openSections()).toEqual(["calibration"]);
    });

    test("a closed section's error shows the mark with no press: X out of range, its section closed by hand @TPL-732", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sectionButton("calibration"));
        await typeInField(user, calibrationField("x"), "21");
        expect(sectionMark("calibration"), "open: none").toBeNull();

        await user.click(sectionButton("calibration"));

        expect(sectionMark("calibration")).toBeVisible();
        expect(sectionMark("calibration")).toHaveAccessibleName("Has an error");
        expect(sectionButton("calibration"), "the mark describes the button, whose name stays its title").toHaveAccessibleName("Printer correction");
        expect(sectionButton("calibration")).toHaveAccessibleDescription("Has an error");
    });
});

describe("the cut warning with the sections closed @area:admin", () => {
    const nearEdge = () => layoutL({
        calibration: {xMm: 20, yMm: 0},
        items: [aTemplateItem("prescriptionText", {id: "t", xMm: 10, wMm: 100}), aTemplateItem("manualInput", {id: "m", xMm: 100, yMm: 20, wMm: 40, hMm: 8})],
    });

    test("the correction's section closed and a box pushed off by it: the warning shows, right after that section @TPL-733 @smoke", async () => {
        await renderDesigner(nearEdge());
        expect(openSections()).toEqual(["page"]);

        const warning = cutWarning()!;

        expect(warning).toBeVisible();
        const correction = sectionButton("calibration").closest("[data-settings-section]")!;
        expect(correction.nextElementSibling, "right after the correction's section").toBe(warning);
        expect(correction.contains(warning), "outside what collapses").toBe(false);
    });

    test("all sections closed: it still shows @TPL-733", async () => {
        const {user} = await renderDesigner(nearEdge());

        await user.click(sectionButton("page"));

        expect(openSections()).toEqual([]);
        expect(cutWarning()).toBeVisible();
    });

    test("moving a box raises it, with the correction's section closed, and moving back takes it away @TPL-733", async () => {
        const {user} = await renderDesigner(layoutL({calibration: {xMm: 20, yMm: 0}, items: [aTemplateItem("prescriptionText", {id: "t", xMm: 10, wMm: 100}), aTemplateItem("manualInput", {id: "m", xMm: 80, yMm: 20, wMm: 40, hMm: 8})]}));
        await user.click(boxOf("m"));
        expect(openSections()).toEqual(["item"]);
        expect(cutWarning()).toBeNull();

        await typeInField(user, settingsField(FIELD_LABEL.x), "100");

        expect(cutWarning()).toBeVisible();

        await typeInField(user, settingsField(FIELD_LABEL.x), "80");

        expect(cutWarning()).toBeNull();
    });

    test("no box pushed off: no warning, with the section closed too @TPL-733", async () => {
        await renderDesigner(layoutL({calibration: {xMm: 1, yMm: 1}}));

        expect(cutWarning()).toBeNull();
    });
});

describe("every opening starts on the sheet's section @area:admin", () => {
    test("reopened, by leaving the tab and coming back: the sheet's section is open @TPL-736", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sectionButton("calibration"));
        expect(openSections()).toEqual(["calibration"]);

        await user.click(overviewTab());
        await waitFor(() => expect(screen.queryByTestId("template-sheet")).not.toBeInTheDocument());
        await user.click(templateTab());
        await designerShown();

        expect(openSections()).toEqual(["page"]);
    });

    test("widened from below 900 px: the sheet's section is open, whichever was, with the item still selected @TPL-736", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(boxOf("m"));
        expect(openSections()).toEqual(["item"]);

        act(() => setViewportWidth(899));
        await waitFor(() => expect(screen.queryByTestId("template-sheet")).not.toBeInTheDocument());
        act(() => setViewportWidth(1000));
        await designerShown();

        expect(selectedIds()).toEqual(["m"]);
        expect(openSections()).toEqual(["page"]);
    });

    test("all closed, and widened: the sheet's section is open @TPL-736", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sectionButton("page"));
        expect(openSections()).toEqual([]);

        act(() => setViewportWidth(899));
        await waitFor(() => expect(screen.queryByTestId("template-sheet")).not.toBeInTheDocument());
        act(() => setViewportWidth(1280));
        await designerShown();

        expect(openSections()).toEqual(["page"]);
    });

    test("a width crossing 1200 px, which is no opening, leaves the open section as it is @TPL-736", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sectionButton("calibration"));
        const x = fieldAnywhere(label("printTemplates.calibration.x"));

        act(() => setViewportWidth(1000));
        await settled();

        expect(openSections()).toEqual(["calibration"]);
        expect(fieldAnywhere(label("printTemplates.calibration.x")), "the same field: nothing mounted anew").toBe(x);
    });
});
