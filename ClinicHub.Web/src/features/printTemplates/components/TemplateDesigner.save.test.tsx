import {describe, expect, test} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {http, HttpResponse} from "msw";
import {
    aClinicDetails,
    adminClinicsHandlers,
    aPrintLayout,
    aPrintTemplate,
    aTemplateItem,
    choose,
    expectToasts,
    fillIn,
    networkError,
    printTemplateHandlers,
    problem,
    recordRequests,
    server,
    toastTexts,
} from "../../../test";
import type {RecordedRequest} from "../../../test";
import type {PrintLayout, TemplateItem} from "../types.ts";
import {adminPrintTemplateApi} from "../../admin/adapters.ts";
import {
    boxOf,
    deleteButton,
    dialogsGone,
    expectFieldMessage,
    expectNoFieldMessage,
    expectNothingSent,
    FIELD_LABEL,
    focusOn,
    label,
    panelEntry,
    paperSize,
    renderDesigner,
    renderNewSheet,
    renderPrintTemplateTab,
    saveButton,
    selectedIds,
    settingsField,
    settingsPanel,
    sheetArea,
    sheetItem,
    templatePath,
    templateUrl,
    typeInField,
    unloadAsks,
} from "../../../test/pages/printTemplate.tsx";

// Saving and deleting: contract § 3.3 (Save, Delete), § 3.6; prescription-templates.business.md «القواعد», «الرسائل».

const text = (fields = {}) => aTemplateItem("prescriptionText", {id: "t", ...fields});
const manual = (fields = {}) => aTemplateItem("manualInput", {id: "m", ...fields});
const date = (fields = {}) => aTemplateItem("function", {id: "f", ...fields});
const fixed = (fields = {}) => aTemplateItem("staticText", {id: "s", text: "ثابت", ...fields});

const layoutL = (...more: TemplateItem[]) => aPrintLayout({items: [text(), manual(), date(), ...more]});

const puts = (requests: RecordedRequest[]) => requests.filter(r => r.method === "PUT");

/** Changes the manual input's X: the screen has something to save. */
const edit = async (user: UserEvent, x = "20") => {
    await user.click(sheetItem("الاسم"));
    await typeInField(user, settingsField(label("printTemplates.config.x")), x);
};

const heldAnswer = () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    return {gate, release};
};

describe("print template: Save @area:admin", () => {
    test("off with nothing changed; a change turns it on; the request holds the page and the items in order; «تم حفظ القالب» @TPL-049 @smoke", async () => {
        const layout = layoutL();
        const {user, clinic} = await renderDesigner(layout, {lang: "ar"});
        expect(saveButton()).toBeDisabled();
        const recorded = recordRequests();

        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField("X: من اليسار (مم)"), "20");
        expect(saveButton()).toBeEnabled();
        await user.click(saveButton());

        await expectToasts("تم حفظ القالب");
        expect(recorded.writes()).toEqual([{
            method: "PUT",
            path: templatePath(clinic.id),
            search: "",
            body: {...layout, items: [layout.items[0], {...layout.items[1], xMm: 20}, layout.items[2]]},
        }]);
        // Saved: nothing is left to save
        expect(saveButton()).toBeDisabled();
    });

    test.each([
        ["a double click", async (user: UserEvent, button: HTMLElement) => user.dblClick(button)],
        ["two clicks in the same moment", async (_user: UserEvent, button: HTMLElement) => act(() => {
            button.click();
            button.click();
        })],
    ])("%s: one request and one «تم حفظ القالب» @TPL-049", async (_name, press) => {
        const {user} = await renderDesigner(layoutL(), {lang: "ar"});
        const recorded = recordRequests();
        await edit(user);
        await press(user, saveButton());

        await expectToasts("تم حفظ القالب");
        expect(puts(recorded.requests)).toHaveLength(1);
    });

    test("off while saving @TPL-049", async () => {
        const clinic = aClinicDetails();
        const {gate, release} = heldAnswer();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(http.put(templateUrl(clinic.id), async ({request}) => {
            const layout = await request.json() as PrintLayout;
            await gate;
            return HttpResponse.json({layout, updatedAt: "2026-11-05T10:00:00Z"});
        }));
        await edit(user);
        await user.click(saveButton());

        await waitFor(() => expect(saveButton()).toBeDisabled());
        release();
        await expectToasts("Template saved");
    });

    test("a new sheet saves as it is, with no edit @TPL-041", async () => {
        const {user, clinic} = await renderNewSheet();
        const recorded = recordRequests();
        await user.click(saveButton());

        await expectToasts("Template saved");
        expect(recorded.writes()).toEqual([expect.objectContaining({
            path: templatePath(clinic.id),
            body: {
                schemaVersion: 1,
                page: {size: "A5", widthMm: 148, heightMm: 210},
                items: [{id: "i1", kind: "prescriptionText", xMm: 14, yMm: 80, wMm: 120, hMm: 90, fontSizePt: 11}],
            },
        })]);
    });

    test("a static text goes as typed, line breaks and spaces; a name goes trimmed @TPL-049", async () => {
        const {user} = await renderDesigner(aPrintLayout({items: [text(), manual(), fixed()]}));
        const recorded = recordRequests();
        await user.click(sheetItem("الاسم"));
        await fillIn(user, settingsField(FIELD_LABEL.name), "  السن  ");
        await user.click(sheetItem("ثابت"));
        await user.clear(settingsField(FIELD_LABEL.text));
        await user.click(settingsField(FIELD_LABEL.text));
        await user.keyboard(" سطر{Enter}ثان ");
        await user.click(saveButton());

        await expectToasts("Template saved");
        const body = puts(recorded.requests)[0].body as { items: { name?: string; text?: string }[] };
        expect(body.items[1].name).toBe("السن");
        expect(body.items[2].text).toBe(" سطر\nثان ");
    });
});

describe("print template: rounding to one decimal @area:admin", () => {
    test.each([
        [FIELD_LABEL.x, "xMm", "12.34", 12.3],
        [FIELD_LABEL.y, "yMm", "12.35", 12.4],
        [FIELD_LABEL.width, "wMm", "12.34", 12.3],
        [FIELD_LABEL.height, "hMm", "12.35", 12.4],
        [FIELD_LABEL.font, "fontSizePt", "12.34", 12.3],
    ])("%s typed with more decimals: the request holds one @TPL-209", async (field, key, typed, sent) => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(field), typed);
        await user.click(saveButton());

        await expectToasts("Template saved");
        const body = puts(recorded.requests)[0].body as { items: Record<string, unknown>[] };
        expect(body.items[1][key]).toBe(sent);
    });

    test("a valid field shows the number as it is taken once it loses the focus @TPL-209", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "12.34");
        await user.tab();
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("12.3");
        expect(boxOf("m").style.left).toBe("12.3mm");
    });
});

describe("print template: invalid values, on Save @area:admin", () => {
    const outside = "The item is outside the sheet.";
    const small = "The item is smaller than the allowed size.";
    const font = "The font size must be between 6 and 36.";
    const NAME = "الاسم";
    const DATE = "التاريخ";
    const FIXED = "ثابت";
    const TEXT = "Prescription text";

    test.each<[string, string, string, string, string]>([
        ["X past the right edge", NAME, FIELD_LABEL.x, "120", outside],
        ["Y past the bottom edge", NAME, FIELD_LABEL.y, "205", outside],
        ["a negative X", NAME, FIELD_LABEL.x, "-1", outside],
        ["a negative Y", NAME, FIELD_LABEL.y, "-1", outside],
        ["width 4.9", NAME, FIELD_LABEL.width, "4.9", small],
        ["height 3.9", NAME, FIELD_LABEL.height, "3.9", small],
        ["the prescription text's height 19.9", TEXT, FIELD_LABEL.height, "19.9", small],
        ["font 5.9", NAME, FIELD_LABEL.font, "5.9", font],
        ["font 36.1", NAME, FIELD_LABEL.font, "36.1", font],
        ["an empty name", NAME, FIELD_LABEL.name, "", "Name is required."],
        ["a name of only spaces", NAME, FIELD_LABEL.name, "   ", "Name is required."],
        ["a name of 61 characters", NAME, FIELD_LABEL.name, "ن".repeat(61), "Name is too long."],
        ["a name with a bidi override", NAME, FIELD_LABEL.name, "a‮b", "The name contains characters that aren't allowed."],
        ["another item's name", DATE, FIELD_LABEL.name, NAME, "Another item already uses this name."],
        ["another item's name, other case and spaces", DATE, FIELD_LABEL.name, ` ${NAME} `, "Another item already uses this name."],
        ["an empty static text", FIXED, FIELD_LABEL.text, "", "Enter the text."],
        ["a static text of only spaces", FIXED, FIELD_LABEL.text, "   ", "Enter the text."],
        ["a static text of 1001 characters", FIXED, FIELD_LABEL.text, "ن".repeat(1001), "The text is longer than 1000 characters."],
        ["a static text with a control character", FIXED, FIELD_LABEL.text, "a\u0001b", "The text contains characters that aren't allowed."],
    ])("%s: the message on the selected item's field, no request @TPL-048", async (_name, item, field, value, message) => {
        const {user} = await renderDesigner(layoutL(fixed()));
        const recorded = recordRequests();
        await user.click(sheetItem(item));
        await fillIn(user, settingsField(field), value);
        await user.click(saveButton());

        expectFieldMessage(settingsField(field), message);
        await expectNothingSent(recorded);
        // The field says it: no toast on top
        expect(toastTexts()).toEqual([]);
    });

    test.each([
        ["49 wide", FIELD_LABEL.pageWidth, "49"],
        ["421 wide", FIELD_LABEL.pageWidth, "421"],
        ["49 high", FIELD_LABEL.pageHeight, "49"],
        ["601 high", FIELD_LABEL.pageHeight, "601"],
    ])("a custom page %s: «The sheet size isn't valid.» on it, no request @TPL-048", async (_name, field, value) => {
        const {user} = await renderDesigner(aPrintLayout({
            page: {size: "custom", widthMm: 200, heightMm: 200},
            items: [text({xMm: 0, yMm: 0, wMm: 20, hMm: 20})],
        }));
        const recorded = recordRequests();
        await typeInField(user, settingsField(field), value);
        await user.tab();
        await user.click(saveButton());

        expectFieldMessage(settingsField(field), "The sheet size isn't valid.");
        await expectNothingSent(recorded);
    });

    test("more than 50 items (no field shows it): a toast, no request @TPL-048", async () => {
        const items: TemplateItem[] = [text(), ...Array.from({length: 50}, (_, n) => manual({id: `m${n}`, name: `Field ${n}`}))];
        const {user} = await renderDesigner(aPrintLayout({items}));
        const recorded = recordRequests();
        await user.click(sheetItem("Field 0"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "20");
        await user.click(saveButton());

        await expectToasts("A template can't have more than 50 items.");
        await expectNothingSent(recorded);
    });

    test("no prescription text (no field shows it): a toast, no request @TPL-048", async () => {
        const {user} = await renderDesigner(aPrintLayout({items: [manual()]}));
        const recorded = recordRequests();
        await edit(user);
        await user.click(saveButton());

        await expectToasts("The template must hold the prescription text exactly once.");
        await expectNothingSent(recorded);
    });

    test("a new static text doesn't start red: the message waits for a change or a Save @TPL-048", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Static text"));
        expectNoFieldMessage(settingsField(FIELD_LABEL.text));

        await user.click(saveButton());
        expectFieldMessage(settingsField(FIELD_LABEL.text), "Enter the text.");
    });

    test("a changed field shows its message at once, and it goes once fixed @TPL-048", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.width), "4");
        expectFieldMessage(settingsField(FIELD_LABEL.width), small);

        await typeInField(user, settingsField(FIELD_LABEL.width), "40");
        expectNoFieldMessage(settingsField(FIELD_LABEL.width));
    });
});

describe("print template: an invalid item that isn't selected @area:admin", () => {
    test("Save selects it and its field shows the message @TPL-238", async () => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await user.click(sheetItem("الاسم"));
        await user.clear(settingsField(FIELD_LABEL.name));
        await user.click(sheetItem("التاريخ"));
        expect(selectedIds()).toEqual(["f"]);

        await user.click(saveButton());

        expect(selectedIds()).toEqual(["m"]);
        expectFieldMessage(settingsField(FIELD_LABEL.name), "Name is required.");
        await expectNothingSent(recorded);
    });

    test("several: the first problem's item @TPL-238", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("التاريخ"));
        await typeInField(user, settingsField(FIELD_LABEL.width), "1");
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.width), "1");
        await user.click(sheetItem("Prescription text"));

        await user.click(saveButton());

        expect(selectedIds()).toEqual(["m"]);
    });

    test("a field not a number on an unselected item counts as a problem @TPL-238", async () => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await user.click(sheetItem("الاسم"));
        await user.clear(settingsField(FIELD_LABEL.x));
        await user.click(sheetItem("التاريخ"));

        await user.click(saveButton());

        expect(selectedIds()).toEqual(["m"]);
        expectFieldMessage(settingsField(FIELD_LABEL.x), "Enter a number.");
        await expectNothingSent(recorded);
    });
});

describe("print template: a number field emptied or off the sheet @area:admin", () => {
    test.each([
        ["emptied", ""],
        ["not a number", "abc"],
    ])("%s: «Enter a number.», the item keeps its last number, Save sends nothing @TPL-224", async (_name, typed) => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), typed);

        expectFieldMessage(settingsField(FIELD_LABEL.x), "Enter a number.");
        expect(settingsField(FIELD_LABEL.x)).toHaveValue(typed);
        expect(boxOf("m").style.left).toBe("58mm");

        await user.click(saveButton());
        await expectNothingSent(recorded);
    });

    test.each([
        ["negative", "-5", "-5mm"],
        ["off the sheet", "500", "500mm"],
    ])("%s: applied as typed, never corrected, with its message; Save sends nothing @TPL-224", async (_name, typed, drawn) => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), typed);

        expectFieldMessage(settingsField(FIELD_LABEL.x), "The item is outside the sheet.");
        expect(settingsField(FIELD_LABEL.x)).toHaveValue(typed);
        expect(boxOf("m").style.left).toBe(drawn);

        await user.tab();
        await user.click(saveButton());
        expect(settingsField(FIELD_LABEL.x)).toHaveValue(typed);
        expect(boxOf("m").style.left).toBe(drawn);
        await expectNothingSent(recorded);
    });

    test("typed right again: the message goes and Save works @TPL-224", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await user.clear(settingsField(FIELD_LABEL.x));
        expectFieldMessage(settingsField(FIELD_LABEL.x), "Enter a number.");
        await user.type(settingsField(FIELD_LABEL.x), "20");
        expectNoFieldMessage(settingsField(FIELD_LABEL.x));

        await user.click(saveButton());
        await expectToasts("Template saved");
    });
});

describe("print template: a box made too big for the sheet, before any Save @area:admin", () => {
    test.each([
        ["width 200", "printTemplates.config.width", "200", "printTemplates.config.x"],
        ["a too-tall height", "printTemplates.config.height", "300", "printTemplates.config.y"],
    ])("on A5, %s typed: the field it pushes out shows «العنصر خارج حدود الورقة.»; it goes once the box fits again @TPL-224", async (_name, typedIn, typed, pushedOut) => {
        const {user} = await renderDesigner(layoutL(), {lang: "ar"});
        const recorded = recordRequests();
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(label(typedIn)), typed);

        expectFieldMessage(settingsField(label(pushedOut)), "العنصر خارج حدود الورقة.");
        await expectNothingSent(recorded);

        await typeInField(user, settingsField(label(typedIn)), "20");
        expectNoFieldMessage(settingsField(label(pushedOut)));
    });

    test("a new static text still doesn't start red: no field of it shows a message before a change or a Save @TPL-224", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Static text"));

        for (const field of [FIELD_LABEL.text, FIELD_LABEL.x, FIELD_LABEL.y, FIELD_LABEL.width, FIELD_LABEL.height, FIELD_LABEL.font]) {
            expectNoFieldMessage(settingsField(field));
        }
    });
});

describe("print template: typed text the layout couldn't take leaves with what it belonged to @area:admin", () => {
    test("«abc» typed in an item's field, the item removed: Save sends the layout without it @TPL-224 @TPL-046", async () => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "abc");
        expectFieldMessage(settingsField(FIELD_LABEL.x), "Enter a number.");

        await user.click(within(settingsPanel()).getByRole("button", {name: "Remove item"}));
        await user.click(saveButton());

        await expectToasts("Template saved");
        expect(puts(recorded.requests)).toHaveLength(1);
        expect((puts(recorded.requests)[0].body as PrintLayout).items.map(item => item.id)).toEqual(["t", "f"]);
    });

    test.each([
        ["out of range", "500", "The sheet size isn't valid."],
        ["not a number", "abc", "Enter a number."],
    ])("a page width %s, then A4 chosen: the text goes and Save sends A4 @TPL-221 @TPL-047", async (_name, typed, message) => {
        const {user} = await renderDesigner(aPrintLayout({
            page: {size: "custom", widthMm: 200, heightMm: 200},
            items: [text(), manual()],
        }));
        const recorded = recordRequests();
        await typeInField(user, settingsField(FIELD_LABEL.pageWidth), typed);
        await user.tab();
        expectFieldMessage(settingsField(FIELD_LABEL.pageWidth), message);

        await choose(user, paperSize(), "A4");
        expect(settingsField(FIELD_LABEL.pageWidth)).toHaveValue("210");
        expectNoFieldMessage(settingsField(FIELD_LABEL.pageWidth));
        await user.click(saveButton());

        await expectToasts("Template saved");
        expect(puts(recorded.requests)).toHaveLength(1);
        expect((puts(recorded.requests)[0].body as PrintLayout).page).toEqual({size: "A4", widthMm: 210, heightMm: 297});
    });
});

describe("print template: a save that fails @area:admin", () => {
    test.each([
        ["a network error", () => networkError(), "Can't reach the server. Check your connection."],
        ["a 500", () => problem(500, "unexpected"), "Something went wrong. Please try again."],
    ])("%s: the message, the edits stay on screen and Save works again @TPL-058", async (_name, answer, message) => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(http.put(templateUrl(clinic.id), answer));
        const recorded = recordRequests();
        await edit(user, "33");
        await user.click(saveButton());

        await expectToasts(message);
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("33");
        expect(boxOf("m").style.left).toBe("33mm");
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);

        server.use(...printTemplateHandlers(clinic.id));
        await user.click(saveButton());

        await waitFor(() => expect(toastTexts()).toContain("Template saved"));
        expect(puts(recorded.requests)).toHaveLength(2);
        expect((puts(recorded.requests)[1].body as PrintLayout).items[1].xMm).toBe(33);
    });

    test("a 400 on a rule the screen passed (an old screen, a new rule): its message, on the named field, the item selected; the edits stay and Save works again @TPL-236", async () => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(http.put(templateUrl(clinic.id), () => problem(400, "templateItemOutsidePage", {
            errors: [{code: "templateItemOutsidePage", field: "items[1].xMm"}],
        })));
        await edit(user, "33");
        await user.click(sheetItem("Prescription text"));
        await user.click(saveButton());

        await expectToasts("The item is outside the sheet.");
        expect(selectedIds()).toEqual(["m"]);
        expectFieldMessage(settingsField(FIELD_LABEL.x), "The item is outside the sheet.");
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("33");
        expect(saveButton()).toBeEnabled();

        // Until the next edit
        await typeInField(user, settingsField(FIELD_LABEL.x), "34");
        expectNoFieldMessage(settingsField(FIELD_LABEL.x));

        server.use(...printTemplateHandlers(clinic.id));
        await user.click(saveButton());
        await waitFor(() => expect(toastTexts()).toContain("Template saved"));
    });

    test("the clinic deleted meanwhile: Save answers 404, a message and the page's «Clinic not found» @TPL-235", async () => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(...adminClinicsHandlers([]), http.put(templateUrl(clinic.id), () => problem(404, "notFound")), http.get(templateUrl(clinic.id), () => problem(404, "notFound")));
        await edit(user);
        await user.click(saveButton());

        expect(await screen.findByText("Clinic not found")).toBeInTheDocument();
        await waitFor(() => expect(toastTexts()).toContain("This item no longer exists."));
        expect(screen.queryByRole("region", {name: "Sheet preview"})).not.toBeInTheDocument();
    });
});

describe("print template: a save in flight @area:admin", () => {
    test("a field edited before the answer: the edit stays, the screen still counts as unsaved, and what was sent is the older value @TPL-242", async () => {
        const clinic = aClinicDetails();
        const {gate, release} = heldAnswer();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(http.put(templateUrl(clinic.id), async ({request}) => {
            const layout = await request.json() as PrintLayout;
            await gate;
            return HttpResponse.json({layout, updatedAt: "2026-11-05T10:00:00Z"});
        }));
        const recorded = recordRequests();
        await edit(user, "20");
        await user.click(saveButton());
        await waitFor(() => expect(puts(recorded.requests)).toHaveLength(1));

        await typeInField(user, settingsField(FIELD_LABEL.x), "30");
        release();

        await expectToasts("Template saved");
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("30");
        expect(boxOf("m").style.left).toBe("30mm");
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);
        expect((puts(recorded.requests)[0].body as PrintLayout).items[1].xMm).toBe(20);
    });

    test("after a save, the baseline is what was sent: typing that value back leaves nothing unsaved @TPL-242", async () => {
        const clinic = aClinicDetails();
        const {gate, release} = heldAnswer();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(http.put(templateUrl(clinic.id), async ({request}) => {
            const layout = await request.json() as PrintLayout;
            await gate;
            return HttpResponse.json({layout, updatedAt: "2026-11-05T10:00:00Z"});
        }));
        await edit(user, "20");
        await user.click(saveButton());
        await waitFor(() => expect(saveButton()).toBeDisabled());
        await typeInField(user, settingsField(FIELD_LABEL.x), "30");
        release();
        await expectToasts("Template saved");

        await typeInField(user, settingsField(FIELD_LABEL.x), "20");

        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
    });
});

describe("print template: the focus when Save turns off @area:admin", () => {
    /** What a press leaves behind has landed: a turned-off button's focus has gone where it goes. */
    const settled = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 50)));

    const expectFocusOnArea = () => {
        expect(document.activeElement).not.toBe(document.body);
        expect(sheetArea()).toHaveFocus();
    };

    /** Saving holds until `release`, then answers with what was sent. */
    const holdSave = (clinicId: number) => {
        const {gate, release} = heldAnswer();
        server.use(http.put(templateUrl(clinicId), async ({request}) => {
            const layout = await request.json() as PrintLayout;
            await gate;
            return HttpResponse.json({layout, updatedAt: "2026-11-05T10:00:00Z"});
        }));
        return release;
    };

    test.each([
        ["a click", async (user: UserEvent) => user.click(saveButton())],
        ["Enter", async (user: UserEvent) => {
            focusOn(saveButton());
            await user.keyboard("{Enter}");
        }],
    ])("a Save that goes, pressed by %s: the focus is in the area while it's held and after the answer, not on the body @TPL-596", async (_name, press) => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL(), {clinic});
        const release = holdSave(clinic.id);
        await edit(user);

        await press(user);

        await waitFor(() => expect(saveButton()).toBeDisabled());
        await settled();
        expectFocusOnArea();

        release();
        await expectToasts("Template saved");
        await settled();
        expect(saveButton()).toBeDisabled();
        expectFocusOnArea();
    });

    test("a new sheet's first Save: the focus is in the area @TPL-596", async () => {
        const {user} = await renderNewSheet();

        await user.click(saveButton());

        await expectToasts("Template saved");
        await settled();
        expect(saveButton()).toBeDisabled();
        expectFocusOnArea();
    });

    test.each([
        ["a field message", "-1"],
        ["a field that isn't a number", "abc"],
    ])("a Save the rules refuse, with %s: Save stays on and keeps the focus @TPL-596", async (_name, typed) => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await edit(user, typed);

        await user.click(saveButton());

        await expectNothingSent(recorded);
        expect(saveButton()).toBeEnabled();
        expect(saveButton()).toHaveFocus();
    });

    test("a Save refused with no field to show it: the toast, Save stays on and keeps the focus @TPL-596", async () => {
        const {user} = await renderDesigner(aPrintLayout({items: [manual()]}));
        const recorded = recordRequests();
        await edit(user);

        await user.click(saveButton());

        await expectToasts("The template must hold the prescription text exactly once.");
        await expectNothingSent(recorded);
        expect(saveButton()).toBeEnabled();
        expect(saveButton()).toHaveFocus();
    });

    test.each([
        ["a network error", () => networkError(), "Can't reach the server. Check your connection."],
        ["a 500", () => problem(500, "unexpected"), "Something went wrong. Please try again."],
    ])("a Save failing with %s: in the area while it's held; after the answer Save is on again and the focus isn't on the body @TPL-596", async (_name, answer, message) => {
        const clinic = aClinicDetails();
        const {gate, release} = heldAnswer();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(http.put(templateUrl(clinic.id), async () => {
            await gate;
            return answer();
        }));
        await edit(user);

        await user.click(saveButton());

        await waitFor(() => expect(saveButton()).toBeDisabled());
        await settled();
        expectFocusOnArea();

        release();
        await expectToasts(message);
        await settled();
        expect(saveButton()).toBeEnabled();
        expect(document.activeElement).not.toBe(document.body);
    });

    test("the focus moved to a field while the save is held: the answer leaves it there @TPL-596", async () => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL(), {clinic});
        const release = holdSave(clinic.id);
        await edit(user);
        await user.click(saveButton());
        await waitFor(() => expect(saveButton()).toBeDisabled());

        await user.click(settingsField(FIELD_LABEL.y));
        release();
        await expectToasts("Template saved");
        await settled();

        expect(settingsField(FIELD_LABEL.y)).toHaveFocus();
    });
});

describe("print template: two windows @area:admin", () => {
    test("window 1 saved first; window 2 saves its older copy: 200, no conflict message, and GET answers window 2's @TPL-207", async () => {
        const layout = layoutL();
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layout, {clinic});
        const url = new URL(templateUrl(clinic.id), window.location.href).href;

        // Window 1, a moment after this one opened
        const fromWindow1 = {...layout, items: [layout.items[0], {...layout.items[1], xMm: 1}, layout.items[2]]};
        await fetch(url, {method: "PUT", body: JSON.stringify(fromWindow1)});

        await edit(user, "20");
        await user.click(saveButton());

        await expectToasts("Template saved");
        const stored = await (await fetch(url)).json() as { layout: PrintLayout };
        expect(stored.layout.items[1].xMm).toBe(20);
    });

    test("a refetch in the background never overwrites the draft @TPL-207", async () => {
        const clinic = aClinicDetails();
        const layout = layoutL();
        const {user, queryClient} = await renderDesigner(layout, {clinic});
        await edit(user, "20");

        const changed = {...layout, items: [layout.items[0]]};
        server.use(http.get(templateUrl(clinic.id), () => HttpResponse.json(aPrintTemplate({layout: changed}))));
        await act(() => queryClient.invalidateQueries({queryKey: adminPrintTemplateApi(clinic.id).scope}));

        expect(boxOf("m").style.left).toBe("20mm");
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
        expect(saveButton()).toBeEnabled();
    });
});

describe("print template: Delete @area:admin", () => {
    const question = "حذف قالب الطباعة؟ سيختفي زر «طباعة» من العيادة، ولا يمكن التراجع عن ذلك.";

    test("a destructive question that starts on Cancel; Cancel keeps the template @TPL-052", async () => {
        const {user} = await renderDesigner(layoutL(), {lang: "ar"});
        const recorded = recordRequests();
        await user.click(deleteButton());

        const dialog = await screen.findByRole("dialog", {name: question});
        const buttons = within(dialog).getAllByRole("button");
        expect(buttons.map(b => b.textContent)).toEqual(["إلغاء", "حذف"]);
        expect(buttons[0]).toHaveFocus();

        await user.click(buttons[0]);
        await dialogsGone();
        expect(sheetItem("الاسم")).toBeInTheDocument();
        expect(recorded.writes()).toEqual([]);
    });

    test("Esc keeps it too @TPL-052", async () => {
        const {user} = await renderDesigner(layoutL(), {lang: "ar"});
        const recorded = recordRequests();
        await user.click(deleteButton());
        await screen.findByRole("dialog", {name: question});
        await user.keyboard("{Escape}");

        await dialogsGone();
        expect(sheetItem("الاسم")).toBeInTheDocument();
        await expectNothingSent(recorded);
    });

    test("confirmed: one DELETE, «تم حذف القالب», the empty state, and GET answers none @TPL-052", async () => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL(), {clinic, lang: "ar"});
        const recorded = recordRequests();
        await user.click(deleteButton());
        const dialog = await screen.findByRole("dialog", {name: question});
        await user.click(within(dialog).getByRole("button", {name: "حذف"}));

        await expectToasts("تم حذف القالب");
        expect(await screen.findByText("لا يوجد قالب طباعة لهذه العيادة.")).toBeInTheDocument();
        await dialogsGone();
        expect(screen.getByRole("button", {name: "إنشاء قالب"})).toBeInTheDocument();
        expect(screen.queryByRole("region", {name: "معاينة الورقة"})).not.toBeInTheDocument();
        expect(recorded.writes()).toEqual([{method: "DELETE", path: templatePath(clinic.id), search: "", body: null}]);
        const answer = await fetch(new URL(templateUrl(clinic.id), window.location.href).href);
        expect(answer.status).toBe(204);
        // Nothing is left to lose
        expect(unloadAsks()).toBe(false);
    });

    test("a failed delete: the message, nothing changes @TPL-052", async () => {
        const clinic = aClinicDetails();
        const {user} = await renderDesigner(layoutL(), {clinic});
        server.use(http.delete(templateUrl(clinic.id), () => problem(500, "unexpected")));
        await user.click(deleteButton());
        const dialog = await screen.findByRole("dialog", {name: label("printTemplates.deleteConfirm")});
        await user.click(within(dialog).getByRole("button", {name: "Delete"}));

        await expectToasts("Something went wrong. Please try again.");
        await dialogsGone();
        expect(sheetItem("الاسم")).toBeInTheDocument();
        expect(deleteButton()).toBeInTheDocument();
    });

    test("the delete confirm double-clicked: one DELETE and no error toast @TPL-241", async () => {
        const {user} = await renderDesigner(layoutL());
        const recorded = recordRequests();
        await user.click(deleteButton());
        const dialog = await screen.findByRole("dialog", {name: label("printTemplates.deleteConfirm")});
        await user.dblClick(within(dialog).getByRole("button", {name: "Delete"}));

        await expectToasts("Template deleted");
        expect(recorded.writes().filter(r => r.method === "DELETE")).toHaveLength(1);
    });

    test("«إنشاء قالب» double-clicked: one new sheet, nothing sent @TPL-241", async () => {
        const recorded = recordRequests();
        const {user} = await renderPrintTemplateTab({lang: "ar"});
        await user.dblClick(await screen.findByRole("button", {name: "إنشاء قالب"}));

        await screen.findByRole("region", {name: "معاينة الورقة"});
        expect(sheetItem("نص الروشتة")).toBeInTheDocument();
        expect(selectedIds()).toEqual([]);
        await expectNothingSent(recorded);
    });

    test("a new sheet after a delete starts over @TPL-052", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(deleteButton());
        const dialog = await screen.findByRole("dialog", {name: label("printTemplates.deleteConfirm")});
        await user.click(within(dialog).getByRole("button", {name: "Delete"}));
        await user.click(await screen.findByRole("button", {name: "Create template"}));

        expect(selectedIds()).toEqual([]);
        expect(within(screen.getByTestId("template-sheet")).getAllByRole("button")).toHaveLength(1);
        expect(screen.queryByRole("button", {name: "Delete"})).not.toBeInTheDocument();
    });
});

describe("print template: the messages in both languages @area:admin", () => {
    const TEXTS = {
        en: {
            empty: "This clinic has no print template.",
            deleteConfirm: "Delete the print template? The Print button will disappear from this clinic, and this can't be undone.",
            nameRequired: "Name is required.",
            nameTaken: "Another item already uses this name.",
            nameTooLong: "Name is too long.",
            textRequired: "Enter the text.",
            textTooLong: "The text is longer than 1000 characters.",
            outside: "The item is outside the sheet.",
            small: "The item is smaller than the allowed size.",
            font: "The font size must be between 6 and 36.",
            saved: "Template saved",
        },
        ar: {
            empty: "لا يوجد قالب طباعة لهذه العيادة.",
            deleteConfirm: "حذف قالب الطباعة؟ سيختفي زر «طباعة» من العيادة، ولا يمكن التراجع عن ذلك.",
            nameRequired: "الاسم مطلوب.",
            nameTaken: "هذا الاسم مستخدم في عنصر آخر.",
            nameTooLong: "الاسم طويل جدًا.",
            textRequired: "اكتب النص.",
            textTooLong: "النص أطول من 1000 حرف.",
            outside: "العنصر خارج حدود الورقة.",
            small: "مقاس العنصر أصغر من الحد المسموح.",
            font: "حجم الخط يجب أن يكون بين 6 و36.",
            saved: "تم حفظ القالب",
        },
    } as const;

    describe.each(["en", "ar"] as const)("%s", lang => {
        const say = TEXTS[lang];
        const field = (key: string) => settingsField(label(`printTemplates.config.${key}`));

        test("the empty state @TPL-243", async () => {
            await renderPrintTemplateTab({lang});
            expect(await screen.findByText(say.empty)).toBeInTheDocument();
        });

        test("the delete question @TPL-243", async () => {
            const {user} = await renderDesigner(layoutL(), {lang});
            await user.click(deleteButton());
            expect(await screen.findByRole("dialog", {name: say.deleteConfirm})).toBeInTheDocument();
        });

        test("every field's message @TPL-243", async () => {
            const {user} = await renderDesigner(layoutL(fixed()), {lang});
            // The later of two items with one name is the one refused
            await user.click(sheetItem("التاريخ"));
            await user.clear(field("name"));
            expectFieldMessage(field("name"), say.nameRequired);
            await fillIn(user, field("name"), "الاسم");
            expectFieldMessage(field("name"), say.nameTaken);
            await fillIn(user, field("name"), "ن".repeat(61));
            expectFieldMessage(field("name"), say.nameTooLong);
            await fillIn(user, field("name"), "السن");

            await typeInField(user, field("x"), "500");
            expectFieldMessage(field("x"), say.outside);
            await typeInField(user, field("x"), "1");
            await typeInField(user, field("width"), "1");
            expectFieldMessage(field("width"), say.small);
            await typeInField(user, field("width"), "30");
            await typeInField(user, field("fontSize"), "99");
            expectFieldMessage(field("fontSize"), say.font);
            await typeInField(user, field("fontSize"), "11");

            await user.click(sheetItem("ثابت"));
            await user.clear(field("text"));
            expectFieldMessage(field("text"), say.textRequired);
            await fillIn(user, field("text"), "ن".repeat(1001));
            expectFieldMessage(field("text"), say.textTooLong);
            await fillIn(user, field("text"), "ثابت");

            await user.click(saveButton());
            await expectToasts(say.saved);
        });
    });
});
