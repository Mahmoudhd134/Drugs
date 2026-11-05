import {describe, expect, test, vi} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import i18n from "../../../i18n";
import {
    aClinicContext,
    aClinicDetails,
    adminClinicsHandlers,
    aPrintLayout,
    aPrintTemplate,
    aTemplateItem,
    choose,
    expectToasts,
    PLATFORM_CONTEXT,
    printTemplateHandlers,
    recordRequests,
    server,
    setViewportWidth,
} from "../../../test";
import type {Context} from "../../auth/types.ts";
import {
    answerQuestion,
    boxOf,
    designerShown,
    dialogsGone,
    expectFieldMessage,
    expectNothingSent,
    FIELD_LABEL,
    label,
    leaveQuestion,
    measuresOf,
    noLeaveQuestion,
    paperSize,
    renderDesigner,
    renderNewSheet,
    saveButton,
    selectedIds,
    settingsField,
    sheetBoxes,
    sheetItem,
    sheetSize,
    tabPath,
    templatePath,
    theSheet,
    typeInField,
    unloadAsks,
} from "../../../test/pages/printTemplate.tsx";

// Unsaved changes: contract § 3.6, § 3.8; business.md «التغييرات غير المحفوظة في المصمم».

const layoutL = () => aPrintLayout({
    items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m"}), aTemplateItem("function", {id: "f"})],
});

/** Changes the manual input's X to 20 (it stays selected). */
const edit = async (user: UserEvent) => {
    await user.click(sheetItem("الاسم"));
    await typeInField(user, settingsField(FIELD_LABEL.x), "20");
};

/** A sidebar entry (the permanent sidebar and the phone's drawer hold the same links) and the logo. */
const sidebarClinics = () => screen.getAllByRole("link", {name: "Clinics"})[0];
const logo = () => screen.getByRole("link", {name: "Go to the clinics list"});

const EXITS: [name: string, press: () => HTMLElement, leavesFor: "/admin" | "overview"][] = [
    ["the header's Back", () => screen.getByRole("button", {name: "Back"}), "/admin"],
    ["another clinic tab", () => screen.getByRole("tab", {name: "Overview"}), "overview"],
    ["a sidebar entry", sidebarClinics, "/admin"],
    ["the logo", logo, "/admin"],
];

describe("print template: closing or reloading the page @area:admin", () => {
    test("nothing changed: no prompt; changes: the prompt; after a save: no prompt @TPL-050", async () => {
        const {user} = await renderDesigner(layoutL());
        expect(unloadAsks()).toBe(false);

        await edit(user);
        expect(unloadAsks()).toBe(true);

        await user.click(saveButton());
        await expectToasts("Template saved");
        expect(unloadAsks()).toBe(false);
    });

    test("leaving the tab removes the prompt @TPL-050", async () => {
        const {user} = await renderDesigner(layoutL());
        await edit(user);
        await user.click(screen.getByRole("tab", {name: "Overview"}));
        await answerQuestion(user, "leave");

        await waitFor(() => expect(screen.queryByRole("region", {name: "Sheet preview"})).not.toBeInTheDocument());
        expect(unloadAsks()).toBe(false);
    });

    test("a number field being typed (not a number yet) counts as unsaved @TPL-050", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "abc");
        expect(unloadAsks()).toBe(true);
    });
});

describe("print template: leaving through the app @area:admin", () => {
    test.each(EXITS)("%s with unsaved changes: the question, with Cancel first and the focus on it @TPL-232", async (_name, press) => {
        const {user} = await renderDesigner(layoutL(), {layout: true});
        await edit(user);
        await user.click(press());

        const question = await leaveQuestion();
        const buttons = within(question).getAllByRole("button");
        expect(buttons.map(b => b.textContent)).toEqual(["Cancel", "Leave"]);
        expect(buttons[0]).toHaveFocus();
    });

    test.each(EXITS)("%s, then staying keeps the URL, the screen and the edits @TPL-232", async (_name, press) => {
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(layoutL(), {clinic, layout: true});
        await edit(user);
        await user.click(press());
        await answerQuestion(user, "stay");

        expect(location().pathname).toBe(tabPath(clinic.id));
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
        expect(boxOf("m").style.left).toBe("20mm");
        expect(selectedIds()).toEqual(["m"]);
        expect(saveButton()).toBeEnabled();
    });

    test.each(EXITS)("%s, then leaving drops the edits: back on the tab the saved template shows @TPL-232", async (_name, press, leavesFor) => {
        const clinic = aClinicDetails();
        const recorded = recordRequests();
        const {user, location, router} = await renderDesigner(layoutL(), {clinic, layout: true});
        await edit(user);
        await user.click(press());
        await answerQuestion(user, "leave");

        const target = leavesFor === "overview" ? `/admin/clinics/${clinic.id}` : leavesFor;
        await waitFor(() => expect(location().pathname).toBe(target));
        expect(screen.queryByRole("region", {name: "Sheet preview"})).not.toBeInTheDocument();
        expect(recorded.writes()).toEqual([]);

        await act(() => router!.navigate(tabPath(clinic.id)));
        await designerShown();
        expect(boxOf("m").style.left).toBe("58mm");
        expect(saveButton()).toBeDisabled();
    });

    test("in Arabic: «لديك تغييرات لم تُحفظ. هل تريد الخروج؟» with «إلغاء» and «خروج» @TPL-232", async () => {
        const {user} = await renderDesigner(layoutL(), {lang: "ar"});
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField("X: من اليسار (مم)"), "20");
        await user.click(screen.getByRole("tab", {name: "نظرة عامة"}));

        const question = await screen.findByRole("dialog", {name: "لديك تغييرات لم تُحفظ. هل تريد الخروج؟"});
        expect(within(question).getAllByRole("button").map(b => b.textContent)).toEqual(["إلغاء", "خروج"]);
    });

    test("Esc on the question stays @TPL-232", async () => {
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(layoutL(), {clinic});
        await edit(user);
        await user.click(screen.getByRole("tab", {name: "Overview"}));
        await leaveQuestion();
        await user.keyboard("{Escape}");

        await dialogsGone();
        expect(location().pathname).toBe(tabPath(clinic.id));
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
    });

    test.each(EXITS)("%s with nothing changed: no question @TPL-232", async (_name, press, leavesFor) => {
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(layoutL(), {clinic, layout: true});
        await user.click(press());

        const target = leavesFor === "overview" ? `/admin/clinics/${clinic.id}` : leavesFor;
        await waitFor(() => expect(location().pathname).toBe(target));
        noLeaveQuestion();
    });

    test("after a save, leaving asks nothing @TPL-232", async () => {
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(layoutL(), {clinic});
        await edit(user);
        await user.click(saveButton());
        await expectToasts("Template saved");
        await user.click(screen.getByRole("tab", {name: "Overview"}));

        await waitFor(() => expect(location().pathname).toBe(`/admin/clinics/${clinic.id}`));
        noLeaveQuestion();
    });

    test("the current tab pressed again, or a query added to the URL, isn't an exit @TPL-232", async () => {
        const clinic = aClinicDetails();
        const {user, location, router} = await renderDesigner(layoutL(), {clinic});
        await edit(user);

        await user.click(screen.getByRole("tab", {name: "Print template"}));
        await act(() => router!.navigate(`${tabPath(clinic.id)}?x=1`));

        expect(location().search).toBe("?x=1");
        noLeaveQuestion();
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
    });

    test("below 900 px the guard still stands: the question asks with the edits out of sight @TPL-229 @TPL-232", async () => {
        const {user} = await renderDesigner(layoutL());
        await edit(user);
        act(() => setViewportWidth(800));
        await screen.findByRole("alert");

        await user.click(screen.getByRole("tab", {name: "Overview"}));
        expect(await leaveQuestion()).toBeInTheDocument();
    });
});

describe("print template: a new sheet not saved @area:admin", () => {
    test("leaving or reloading warns; after confirming, the empty state returns and nothing was saved @TPL-230", async () => {
        const clinic = aClinicDetails();
        const recorded = recordRequests();
        const {user, location, router} = await renderNewSheet({clinic});
        expect(unloadAsks()).toBe(true);

        await user.click(screen.getByRole("tab", {name: "Overview"}));
        await answerQuestion(user, "leave");
        await waitFor(() => expect(location().pathname).toBe(`/admin/clinics/${clinic.id}`));
        expect(unloadAsks()).toBe(false);

        await act(() => router!.navigate(tabPath(clinic.id)));
        expect(await screen.findByText("This clinic has no print template.")).toBeInTheDocument();
        expect(recorded.writes()).toEqual([]);
        // The GET answered 204 (the tab asked it, opening)
        expect(recorded.requests.filter(r => r.method === "GET" && r.path === templatePath(clinic.id)).length).toBeGreaterThanOrEqual(1);
    });

    test("staying keeps the new sheet @TPL-230", async () => {
        const {user} = await renderNewSheet();
        await user.click(screen.getByRole("tab", {name: "Overview"}));
        await answerQuestion(user, "stay");
        expect(sheetItem("Prescription text")).toBeInTheDocument();
        expect(saveButton()).toBeEnabled();
    });
});

describe("print template: a value typed back @area:admin", () => {
    test("no warning: a number typed back, in another form too @TPL-233", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "20");
        expect(saveButton()).toBeEnabled();
        await typeInField(user, settingsField(FIELD_LABEL.x), "58.0");

        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
        await user.click(screen.getByRole("tab", {name: "Overview"}));
        await waitFor(() => expect(screen.queryByRole("region", {name: "Sheet preview"})).not.toBeInTheDocument());
        noLeaveQuestion();
    });

    test("no warning: a name typed back, with spaces around it @TPL-233", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "x");
        expect(unloadAsks()).toBe(true);
        await typeInField(user, settingsField(FIELD_LABEL.name), " الاسم ");

        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
    });

    test("a page size chosen and chosen back, with nothing moved: no warning @TPL-233", async () => {
        const {user} = await renderDesigner(layoutL());
        await choose(user, paperSize(), "A4");
        expect(unloadAsks()).toBe(true);
        await choose(user, paperSize(), "A5");
        expect(unloadAsks()).toBe(false);
    });

    test("an item added and removed: no warning @TPL-233", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(within(screen.getByRole("region", {name: "Add to the sheet"})).getByRole("button", {name: "Static text"}));
        expect(unloadAsks()).toBe(true);
        await user.click(screen.getByRole("button", {name: "Remove item"}));
        expect(unloadAsks()).toBe(false);
    });
});

describe("print template: a sheet size typed, the focus still in its field @area:admin", () => {
    /** A saved custom 200 × 200 mm sheet: the manual input falls off when the sheet goes below 190 mm. */
    const customL = () => aPrintLayout({
        page: {size: "custom", widthMm: 200, heightMm: 200},
        items: [
            aTemplateItem("prescriptionText", {id: "t", xMm: 10, yMm: 10, wMm: 100, hMm: 30}),
            aTemplateItem("manualInput", {id: "m", xMm: 150, yMm: 150, wMm: 40, hMm: 8}),
        ],
    });

    /** Types in the field and checks the focus has stayed: nothing has committed it. */
    const typeAndStay = async (user: UserEvent, fieldLabel: string, value: string) => {
        await typeInField(user, settingsField(fieldLabel), value);
        expect(settingsField(fieldLabel)).toHaveFocus();
    };

    const MEASURES: [name: string, fieldLabel: string, page: { widthMm: number; heightMm: number }, moved: { xMm: number; yMm: number }][] = [
        ["width", FIELD_LABEL.pageWidth, {widthMm: 120, heightMm: 200}, {xMm: 80, yMm: 150}],
        ["height", FIELD_LABEL.pageHeight, {widthMm: 200, heightMm: 120}, {xMm: 150, yMm: 112}],
    ];

    test.each(MEASURES)("a new %s counts as unsaved: Save is on, the browser's prompt shows; the sheet hasn't resized and no item has moved @TPL-251 @TPL-221", async (_name, fieldLabel) => {
        const {user} = await renderDesigner(customL());
        const before = sheetBoxes().map(measuresOf);
        await typeAndStay(user, fieldLabel, "120");

        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);
        expect(settingsField(fieldLabel)).toHaveValue("120");
        expect(sheetSize()).toEqual({w: "200mm", h: "200mm"});
        expect(sheetBoxes().map(measuresOf)).toEqual(before);
    });

    test.each(EXITS)("%s: the question asks; staying keeps the size, leaving sends nothing @TPL-251", async (_name, press, leavesFor) => {
        const clinic = aClinicDetails();
        const recorded = recordRequests();
        const {user, location} = await renderDesigner(customL(), {clinic, layout: true});
        await typeAndStay(user, FIELD_LABEL.pageWidth, "300");
        expect(unloadAsks()).toBe(true);

        await user.click(press());
        await answerQuestion(user, "stay");
        expect(location().pathname).toBe(tabPath(clinic.id));
        expect(settingsField(FIELD_LABEL.pageWidth)).toHaveValue("300");
        expect(saveButton()).toBeEnabled();

        await user.click(press());
        await answerQuestion(user, "leave");
        const target = leavesFor === "overview" ? `/admin/clinics/${clinic.id}` : leavesFor;
        await waitFor(() => expect(location().pathname).toBe(target));
        expect(recorded.writes()).toEqual([]);
    });

    test("browser Back, which takes no focus from the field: the question asks; staying keeps the URL and the size @TPL-251", async () => {
        const clinic = aClinicDetails();
        const {user, router, location} = await renderDesigner(customL(), {clinic});
        await act(() => router!.navigate(`/admin/clinics/${clinic.id}`));
        await act(() => router!.navigate(tabPath(clinic.id)));
        await designerShown();
        await within(await screen.findByRole("region", {name: "Sheet preview"})).findByRole("button", {name: "الاسم"});
        await typeAndStay(user, FIELD_LABEL.pageWidth, "300");

        await act(() => router!.navigate(-1));
        await answerQuestion(user, "stay");

        expect(location().pathname).toBe(tabPath(clinic.id));
        expect(settingsField(FIELD_LABEL.pageWidth)).toHaveValue("300");
    });

    test.each([
        ["as it was", "200"],
        ["in another form", "200.0"],
    ])("typed back to the committed number, %s: clean again, and leaving asks nothing @TPL-251 @TPL-233", async (_name, typedBack) => {
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(customL(), {clinic});
        await typeAndStay(user, FIELD_LABEL.pageWidth, "300");
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);

        await typeAndStay(user, FIELD_LABEL.pageWidth, typedBack);

        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
        await user.click(screen.getByRole("tab", {name: "Overview"}));
        await waitFor(() => expect(location().pathname).toBe(`/admin/clinics/${clinic.id}`));
        noLeaveQuestion();
    });

    test.each(MEASURES)("a new %s, Save pressed once: the size is committed and saved, in one PUT and one toast @TPL-251", async (_name, fieldLabel, page, moved) => {
        const {user, clinic} = await renderDesigner(customL());
        const recorded = recordRequests();
        await typeAndStay(user, fieldLabel, "120");

        expect(saveButton()).toBeEnabled();
        await user.click(saveButton());

        // Exactly this toast: no «تم حذف», no message on top
        await expectToasts("Template saved");
        expect(recorded.writes()).toEqual([expect.objectContaining({
            method: "PUT",
            path: templatePath(clinic.id),
            body: expect.objectContaining({
                page: {size: "custom", ...page},
                items: [
                    expect.objectContaining({id: "t", xMm: 10, yMm: 10}),
                    expect.objectContaining({id: "m", ...moved}),
                ],
            }),
        })]);
        expect(sheetSize()).toEqual({w: `${page.widthMm}mm`, h: `${page.heightMm}mm`});
        expect(boxOf("m").style.left).toBe(`${moved.xMm}mm`);
        expect(boxOf("m").style.top).toBe(`${moved.yMm}mm`);
        expect(settingsField(fieldLabel)).toHaveValue("120");
        expect(saveButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
    });

    test("in Arabic, with Arabic digits: one press, «تم حفظ القالب» and no «تم حذف» @TPL-251", async () => {
        const {user, clinic} = await renderDesigner(customL(), {lang: "ar"});
        const recorded = recordRequests();
        await typeAndStay(user, "عرض الورقة (مم)", "١٢٠");

        expect(saveButton()).toBeEnabled();
        await user.click(saveButton());

        await expectToasts("تم حفظ القالب");
        expect(screen.queryByText(/تم حذف/)).not.toBeInTheDocument();
        expect(recorded.writes()).toEqual([expect.objectContaining({
            method: "PUT",
            path: templatePath(clinic.id),
            body: expect.objectContaining({page: {size: "custom", widthMm: 120, heightMm: 200}}),
        })]);
    });

    test.each([
        ["out of range", "500", "The sheet size isn't valid."],
        ["not a number", "abc", "Enter a number."],
    ])("a size %s, Save pressed: the field says why, nothing is sent and nothing moves @TPL-251 @TPL-221", async (_name, typed, message) => {
        const {user} = await renderDesigner(customL());
        const recorded = recordRequests();
        const before = sheetBoxes().map(measuresOf);
        await typeAndStay(user, FIELD_LABEL.pageWidth, typed);

        expect(saveButton()).toBeEnabled();
        await user.click(saveButton());

        expectFieldMessage(settingsField(FIELD_LABEL.pageWidth), message);
        await expectNothingSent(recorded);
        expect(sheetSize().w).toBe("200mm");
        expect(sheetBoxes().map(measuresOf)).toEqual(before);
    });
});

describe("print template: the language changes under the edits @area:admin", () => {
    test("the edits and the selection stay, the labels follow, the sheet doesn't mirror @TPL-234", async () => {
        const {user} = await renderDesigner(layoutL());
        await edit(user);
        const before = boxOf("m").style.left;

        await act(() => i18n.changeLanguage("ar"));

        expect(screen.getByRole("region", {name: "معاينة الورقة"})).toBeInTheDocument();
        expect(settingsField("X: من اليسار (مم)")).toHaveValue("20");
        expect(boxOf("m").style.left).toBe(before);
        expect(theSheet()).toHaveAttribute("dir", "ltr");
        expect(selectedIds()).toEqual(["m"]);
        expect(screen.getByRole("button", {name: "حفظ"})).toBeEnabled();
        expect(unloadAsks()).toBe(true);
    });
});

describe("print template: narrowing the window @area:admin", () => {
    test("below 900 px and back: the edits and the selection are there, still unsaved @TPL-229", async () => {
        const {user} = await renderDesigner(layoutL());
        await edit(user);

        act(() => setViewportWidth(800));
        expect(await screen.findByText("Open this page on a computer.")).toBeInTheDocument();
        expect(screen.queryByRole("region", {name: "Sheet preview"})).not.toBeInTheDocument();
        expect(unloadAsks()).toBe(true);

        act(() => setViewportWidth(1280));
        await designerShown();
        expect(screen.queryByText("Open this page on a computer.")).not.toBeInTheDocument();
        expect(boxOf("m").style.left).toBe("20mm");
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
        expect(selectedIds()).toEqual(["m"]);
        expect(saveButton()).toBeEnabled();
        expect(unloadAsks()).toBe(true);
    });

    test("a number being typed survives too @TPL-229", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "abc");

        act(() => setViewportWidth(800));
        await screen.findByText("Open this page on a computer.");
        act(() => setViewportWidth(1280));
        await designerShown();

        expect(settingsField(FIELD_LABEL.x)).toHaveValue("abc");
    });
});

describe("print template: another clinic by history @area:admin", () => {
    test("Back from A's unsaved edits to B's tab: nothing of A's sheet, selection or edits shows under B @TPL-245", async () => {
        const clinicB = aClinicDetails({name: "Clinic B"});
        const clinicA = aClinicDetails({name: "Clinic A"});
        const templateB = aPrintTemplate({layout: aPrintLayout({items: [aTemplateItem("prescriptionText", {id: "tB"}), aTemplateItem("manualInput", {id: "mB", name: "من ب"})]})});
        const {user, router, location} = await renderDesigner(templateB.layout, {clinic: clinicB});
        server.use(...adminClinicsHandlers([clinicA, clinicB]), ...printTemplateHandlers(clinicA.id, {template: aPrintTemplate({layout: layoutL()})}));

        await act(() => router!.navigate(tabPath(clinicA.id)));
        await screen.findByRole("heading", {name: "Clinic A"});
        await designerShown();
        await within(await screen.findByRole("region", {name: "Sheet preview"})).findByRole("button", {name: "الاسم"});
        await edit(user);

        await act(() => router!.navigate(-1));
        await answerQuestion(user, "leave");

        await waitFor(() => expect(location().pathname).toBe(tabPath(clinicB.id)));
        await screen.findByRole("heading", {name: "Clinic B"});
        await designerShown();
        await within(screen.getByRole("region", {name: "Sheet preview"})).findByRole("button", {name: "من ب"});
        expect(within(screen.getByRole("region", {name: "Sheet preview"})).queryByRole("button", {name: "الاسم"})).not.toBeInTheDocument();
        expect(selectedIds()).toEqual([]);
        expect(saveButton()).toBeDisabled();
        expect(screen.queryByRole("textbox", {name: FIELD_LABEL.x})).not.toBeInTheDocument();
    });
});

describe("print template: the user menu and the template clinic's button @area:admin", () => {
    const template = aClinicContext({clinicId: 99, clinicName: "Template", isTemplate: true});
    const user = {context: "platform" as const, contexts: [PLATFORM_CONTEXT, template] as Context[]};

    const openMenu = async (events: UserEvent) => {
        await events.click(screen.getByRole("button", {name: "Account"}));
        await screen.findByRole("menu");
    };

    test("switching clinic: the question first; staying does nothing and keeps the edits @TPL-248", async () => {
        const clinic = aClinicDetails();
        const {user: events, location} = await renderDesigner(layoutL(), {clinic, layout: true, user});
        await edit(events);
        await openMenu(events);
        await events.click(screen.getByRole("menuitem", {name: "Switch clinic"}));

        await answerQuestion(events, "stay");
        expect(location().pathname).toBe(tabPath(clinic.id));
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
    });

    test("switching clinic: leaving opens the picker @TPL-248", async () => {
        const {user: events, location} = await renderDesigner(layoutL(), {layout: true, user});
        await edit(events);
        await openMenu(events);
        await events.click(screen.getByRole("menuitem", {name: "Switch clinic"}));

        await answerQuestion(events, "leave");
        await waitFor(() => expect(location().pathname).toBe("/select-clinic"));
    });

    test("logging out: the question first; staying doesn't log out and keeps the edits @TPL-248", async () => {
        const {user: events, auth} = await renderDesigner(layoutL(), {layout: true, user});
        await edit(events);
        await openMenu(events);
        await events.click(screen.getByRole("menuitem", {name: "Log out"}));

        await answerQuestion(events, "stay");
        expect(auth.logout).not.toHaveBeenCalled();
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
    });

    test("logging out: leaving logs out, once @TPL-248", async () => {
        const {user: events, auth} = await renderDesigner(layoutL(), {layout: true, user});
        await edit(events);
        await openMenu(events);
        await events.click(screen.getByRole("menuitem", {name: "Log out"}));
        expect(auth.logout).not.toHaveBeenCalled();

        await answerQuestion(events, "leave");
        await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
    });

    test("nothing changed: logging out asks nothing @TPL-248", async () => {
        const {user: events, auth} = await renderDesigner(layoutL(), {layout: true, user});
        await openMenu(events);
        await events.click(screen.getByRole("menuitem", {name: "Log out"}));

        await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1));
        noLeaveQuestion();
    });

    test("«تعديل العيادة النموذجية»: the question first; staying doesn't switch and keeps the edits @TPL-248", async () => {
        const {user: events, auth} = await renderDesigner(layoutL(), {layout: true, user});
        await edit(events);
        await events.click(screen.getByRole("button", {name: "Edit template clinic"}));

        await answerQuestion(events, "stay");
        expect(auth.switchContext).not.toHaveBeenCalled();
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
        // It can be pressed again
        expect(screen.getByRole("button", {name: "Edit template clinic"})).not.toHaveAttribute("aria-disabled", "true");
    });

    test("«تعديل العيادة النموذجية»: leaving switches, once @TPL-248", async () => {
        // Never answers: what follows a real switch (the app opens /drugs) needs the real session: App.printTemplate.test.tsx
        const switchContext = vi.fn(() => new Promise<never>(() => undefined));
        const {user: events} = await renderDesigner(layoutL(), {layout: true, user, auth: {switchContext}});
        await edit(events);
        await events.click(screen.getByRole("button", {name: "Edit template clinic"}));

        await answerQuestion(events, "leave");
        await waitFor(() => expect(switchContext).toHaveBeenCalledTimes(1));
        expect(switchContext).toHaveBeenCalledWith(template);
    });

    test("one question at a time: browser Back while the logout question is open doesn't open a second, and one answer settles both @TPL-248", async () => {
        const clinic = aClinicDetails();
        const {user: events, auth, router, location} = await renderDesigner(layoutL(), {clinic, layout: true, user});
        await act(() => router!.navigate(`/admin/clinics/${clinic.id}`));
        await act(() => router!.navigate(tabPath(clinic.id)));
        await designerShown();
        await within(await screen.findByRole("region", {name: "Sheet preview"})).findByRole("button", {name: "الاسم"});
        await edit(events);

        await openMenu(events);
        await events.click(screen.getByRole("menuitem", {name: "Log out"}));
        await leaveQuestion();
        await act(() => router!.navigate(-1));

        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        await answerQuestion(events, "stay");

        expect(auth.logout).not.toHaveBeenCalled();
        expect(location().pathname).toBe(tabPath(clinic.id));
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
        // Nothing is left hanging: the next exit asks afresh
        await events.click(screen.getByRole("tab", {name: "Overview"}));
        expect(await screen.findByRole("dialog", {name: label("printTemplates.unsavedMessage")})).toBeInTheDocument();
    });
});
