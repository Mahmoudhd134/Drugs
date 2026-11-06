import {describe, expect, test, vi} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {aPrintLayout, aTemplateItem, choose, expectOwnDirection, recordRequests} from "../../../test";
import type {TemplateItem} from "../types.ts";
import {
    boxOf,
    expectFieldMessage,
    expectNothingSent,
    FIELD_LABEL,
    measuresOf,
    panelEntry,
    paperSize,
    renderDesigner,
    renderNewSheet,
    saveButton,
    selectedIds,
    settingsField,
    settingsPanel,
    sheetArea,
    sheetBoxes,
    sheetItem,
    sheetSize,
    sidePanel,
    theSheet,
    typeInField,
} from "../../../test/pages/printTemplate.tsx";

// The side panel, the sheet and each kind's settings: contract § 3.3-§ 3.5; prescription-templates.business.md «عناصر القالب».

const layoutL = () => aPrintLayout({
    items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m"}), aTemplateItem("function", {id: "f"})],
});

const namesOf = (scope: HTMLElement, role: string) =>
    within(scope).getAllByRole(role).map(element => element.getAttribute("aria-label") ?? element.textContent ?? "");

/** The labels of the text fields of the settings panel, in order, after the sheet's two and the correction's two. */
const itemFieldLabels = () => within(settingsPanel()).getAllByRole("textbox")
    .map(field => settingsPanel().querySelector(`label[for="${field.id}"]`)?.textContent?.replace(/\s*\*$/, "") ?? "")
    .slice(4);

const ADDABLE: [entry: string, typeShown: string][] = [
    ["Manual input", "Manual input"],
    ["Full date", "Full date"],
    ["Time", "Time"],
    ["Day of week", "Day of week"],
    ["Day of month", "Day of month"],
    ["ISO date and time", "ISO date and time"],
    ["Page number", "Page number"],
    ["Static text", "Static text"],
];

describe("print template: the side panel @area:admin", () => {
    test("manual input, the six functions and static text can be added; internal data and the JS expression are dimmed, not addable, explained @TPL-042 @smoke", async () => {
        await renderNewSheet();

        expect(within(sidePanel()).getByRole("heading", {name: "Add to the sheet"})).toBeInTheDocument();
        expect(namesOf(within(sidePanel()).getByRole("list", {name: "Manual"}), "button")).toEqual(["Manual input"]);
        expect(namesOf(within(sidePanel()).getByRole("list", {name: "Functions"}), "button"))
            .toEqual(["Full date", "Time", "Day of week", "Day of month", "ISO date and time", "Page number"]);
        expect(namesOf(within(sidePanel()).getByRole("list", {name: "Static"}), "button")).toEqual(["Static text"]);
        // Last in the panel, in this order
        expect(namesOf(within(sidePanel()).getByRole("list", {name: "Later"}), "button")).toEqual(["Internal data", "JavaScript expression"]);

        for (const [entry] of ADDABLE) expect(panelEntry(entry)).not.toHaveAttribute("aria-disabled", "true");

        const internal = panelEntry("Internal data");
        expect(internal).toHaveAttribute("aria-disabled", "true");
        expect(internal).toHaveAccessibleDescription("Comes after patient files are added.");
        const expression = panelEntry("JavaScript expression");
        expect(expression).toHaveAttribute("aria-disabled", "true");
        expect(expression).toHaveAccessibleDescription("The last to be added.");
        expect(within(sidePanel()).getByText("Comes after patient files are added.")).toBeVisible();
        expect(within(sidePanel()).getByText("The last to be added.")).toBeVisible();
    });

    test("in Arabic: the same panel in its own words @TPL-042", async () => {
        await renderNewSheet({lang: "ar"});
        const panel = within(sidePanel());
        expect(namesOf(panel.getByRole("list", {name: "دوال"}), "button"))
            .toEqual(["التاريخ الكامل", "الوقت", "يوم الأسبوع", "يوم الشهر", "التاريخ والوقت بصيغة ISO", "رقم الصفحة"]);
        expect(namesOf(panel.getByRole("list", {name: "يدوي"}), "button")).toEqual(["حقل يدوي"]);
        expect(namesOf(panel.getByRole("list", {name: "ثابت"}), "button")).toEqual(["نص ثابت"]);
        expect(namesOf(panel.getByRole("list", {name: "لاحقًا"}), "button")).toEqual(["بيانات داخلية", "تعبير JavaScript"]);
        expect(panelEntry("بيانات داخلية")).toHaveAccessibleDescription("يأتي بعد إضافة ملفات المرضى.");
        expect(panelEntry("تعبير JavaScript")).toHaveAccessibleDescription("آخر ما سيُضاف.");
    });

    test("the prescription text can't be added: every layout has it @TPL-042", async () => {
        await renderNewSheet();
        expect(within(sidePanel()).queryByRole("button", {name: "Prescription text"})).not.toBeInTheDocument();
    });

    test.each(ADDABLE)("a click on «%s»: on the sheet, selected, with its settings; its type is information, not a control @TPL-043 @smoke", async (entry, typeShown) => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry(entry));

        expect(sheetBoxes()).toHaveLength(2);
        const box = sheetBoxes()[1];
        expect(box).toHaveAttribute("aria-pressed", "true");
        expect(selectedIds()).toEqual([box.dataset.itemId]);
        const settings = within(settingsPanel());
        expect(settingsPanel()).toHaveTextContent(new RegExp(`Type\\W*${typeShown}`));
        expect(settings.queryByRole("textbox", {name: "Type"})).not.toBeInTheDocument();
        expect(settings.queryByRole("combobox", {name: "Type"})).not.toBeInTheDocument();
        // The paper size is the only select
        expect(settings.getAllByRole("combobox")).toHaveLength(1);
        expect(settingsField(FIELD_LABEL.x)).toHaveValue(box.style.left.replace("mm", ""));
        // The focus stays on the entry: the next item is one key away
        expect(panelEntry(entry)).toHaveFocus();
    });

    test("a double click adds one item, as on the prescription page @TPL-240", async () => {
        const {user} = await renderNewSheet();
        await user.dblClick(panelEntry("Manual input"));

        expect(sheetBoxes()).toHaveLength(2);
        expect(sheetItem("Manual input")).toBeInTheDocument();
        expect(within(sheetArea()).queryByRole("button", {name: "Manual input 2"})).not.toBeInTheDocument();
    });

    test("two separate clicks add two items @TPL-240", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Manual input"));
        await user.click(panelEntry("Manual input"));
        expect(sheetBoxes()).toHaveLength(3);
    });

    test("an item added: its box is scrolled into view, the nearest way, and the focus stays on the entry @TPL-253", async () => {
        const {user} = await renderDesigner(layoutL());
        // jsdom has no layout (setup.ts makes scrollIntoView a no-op): record what the screen scrolls to
        const scrolled: { element: Element; options: unknown }[] = [];
        vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element, options?: boolean | ScrollIntoViewOptions) {
            scrolled.push({element: this, options});
        });
        const scrollsOf = (box: HTMLElement) => scrolled.filter(({element}) => element === box).map(({options}) => options);
        const NEAREST = {block: "nearest", inline: "nearest"};

        await user.click(panelEntry("Manual input"));
        const added = sheetBoxes()[3];
        await waitFor(() => expect(scrollsOf(added)).toContainEqual(NEAREST));
        expect(panelEntry("Manual input")).toHaveFocus();

        // By the keyboard too: the next new box, the focus still on its entry
        act(() => panelEntry("Static text").focus());
        await user.keyboard("{Enter}");
        const next = sheetBoxes()[4];
        await waitFor(() => expect(scrollsOf(next)).toContainEqual(NEAREST));
        expect(panelEntry("Static text")).toHaveFocus();
    });

    test("at 50 items: a message says why, every addable entry is off, the sheet holds 50 @TPL-237", async () => {
        const items: TemplateItem[] = [
            aTemplateItem("prescriptionText", {id: "i1"}),
            ...Array.from({length: 49}, (_, n) => aTemplateItem("manualInput", {id: `i${n + 2}`, name: `Field ${n}`})),
        ];
        await renderDesigner(aPrintLayout({items}));

        expect(within(sidePanel()).getByRole("alert")).toHaveTextContent("A template can't have more than 50 items.");
        for (const [entry] of ADDABLE) expect(panelEntry(entry)).toHaveAttribute("aria-disabled", "true");
        expect(sheetBoxes()).toHaveLength(50);
    });

    test("the 50th item added turns the panel off @TPL-237", async () => {
        const items: TemplateItem[] = [
            aTemplateItem("prescriptionText", {id: "i1"}),
            ...Array.from({length: 48}, (_, n) => aTemplateItem("manualInput", {id: `i${n + 2}`, name: `Field ${n}`})),
        ];
        const {user} = await renderDesigner(aPrintLayout({items}));
        expect(within(sidePanel()).queryByRole("alert")).not.toBeInTheDocument();

        await user.click(panelEntry("Static text"));

        expect(sheetBoxes()).toHaveLength(50);
        expect(within(sidePanel()).getByRole("alert")).toHaveTextContent("A template can't have more than 50 items.");
        expect(panelEntry("Manual input")).toHaveAttribute("aria-disabled", "true");
    });
});

describe("print template: new items start valid @area:admin", () => {
    const inside = (box: HTMLElement, sheetW: number, sheetH: number) => {
        const {x, y, w, h} = measuresOf(box);
        const [left, top, width, height] = [x, y, w, h].map(value => parseFloat(value));
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(left + width).toBeLessThanOrEqual(sheetW);
        expect(top + height).toBeLessThanOrEqual(sheetH);
        return {width, height};
    };

    test.each([
        ["Manual input", {x: "11mm", y: "11mm", w: "40mm", h: "8mm", font: "11pt"}],
        ["Full date", {x: "11mm", y: "11mm", w: "30mm", h: "8mm", font: "11pt"}],
        ["Static text", {x: "11mm", y: "11mm", w: "40mm", h: "8mm", font: "11pt"}],
    ])("on A5, «%s» has its default box and font 11 @TPL-216", async (entry, measures) => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry(entry));

        const box = sheetBoxes()[1];
        expect(measuresOf(box)).toEqual(measures);
        const {width, height} = inside(box, 148, 210);
        expect(width).toBeGreaterThanOrEqual(5);
        expect(height).toBeGreaterThanOrEqual(4);
    });

    test("a manual input and each function save with no edit: their box, place and font pass the rules @TPL-216", async () => {
        const {user} = await renderNewSheet();
        const recorded = recordRequests();
        for (const entry of ["Manual input", "Full date", "Time", "Day of week", "Day of month", "ISO date and time", "Page number"]) {
            await user.click(panelEntry(entry));
        }
        await user.click(saveButton());

        expect(await screen.findByText("Template saved")).toBeInTheDocument();
        expect(recorded.writes()).toHaveLength(1);
        expect((recorded.writes()[0].body as { items: unknown[] }).items).toHaveLength(8);
    });

    test("a new static text only asks for its text: no size, place or font message @TPL-216", async () => {
        const {user} = await renderNewSheet();
        const recorded = recordRequests();
        await user.click(panelEntry("Static text"));
        await user.click(saveButton());

        expectFieldMessage(settingsField(FIELD_LABEL.text), "Enter the text.");
        for (const field of [FIELD_LABEL.x, FIELD_LABEL.y, FIELD_LABEL.width, FIELD_LABEL.height, FIELD_LABEL.font]) {
            expect(settingsField(field)).not.toHaveAccessibleDescription();
        }
        await expectNothingSent(recorded);
    });

    test("on a custom 50 x 50 mm page each kind stays inside, and the prescription text keeps 20 mm at least @TPL-217", async () => {
        const {user} = await renderNewSheet();
        await choose(user, paperSize(), "Custom");
        await typeInField(user, settingsField(FIELD_LABEL.pageWidth), "50");
        await user.keyboard("{Enter}");
        await typeInField(user, settingsField(FIELD_LABEL.pageHeight), "50");
        await user.keyboard("{Enter}");
        expect(sheetSize()).toEqual({w: "50mm", h: "50mm"});

        const {height} = inside(sheetItem("Prescription text"), 50, 50);
        expect(height).toBeGreaterThanOrEqual(20);
        for (const entry of ["Manual input", "Full date", "Static text"]) {
            await user.click(panelEntry(entry));
            inside(sheetBoxes()[sheetBoxes().length - 1], 50, 50);
        }
        expect(sheetBoxes()).toHaveLength(4);
    });

    test("two «Full date» added in a row: the second is «Full date 2»; two manual inputs: «Manual input 2» @TPL-218", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Full date"));
        expect(settingsField(FIELD_LABEL.name)).toHaveValue("Full date");
        await user.click(panelEntry("Full date"));
        expect(settingsField(FIELD_LABEL.name)).toHaveValue("Full date 2");
        await user.click(panelEntry("Manual input"));
        await user.click(panelEntry("Manual input"));
        expect(settingsField(FIELD_LABEL.name)).toHaveValue("Manual input 2");

        expect(sheetItem("Full date")).toBeInTheDocument();
        expect(sheetItem("Full date 2")).toBeInTheDocument();
        expect(sheetItem("Manual input")).toBeInTheDocument();
        expect(sheetItem("Manual input 2")).toBeInTheDocument();
    });

    test("in Arabic: «التاريخ الكامل» then «التاريخ الكامل 2», in the UI's language @TPL-218", async () => {
        const {user} = await renderNewSheet({lang: "ar"});
        await user.click(panelEntry("التاريخ الكامل"));
        await user.click(panelEntry("التاريخ الكامل"));
        expect(sheetItem("التاريخ الكامل")).toBeInTheDocument();
        expect(sheetItem("التاريخ الكامل 2")).toBeInTheDocument();
    });

    test("a new sheet's second item gets a distinct name even after the first is renamed back @TPL-218", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Manual input"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "Age");
        await user.click(panelEntry("Manual input"));
        // «Manual input» is free again
        expect(settingsField(FIELD_LABEL.name)).toHaveValue("Manual input");
    });
});

describe("print template: selecting an item @area:admin", () => {
    test("another item clicked: it becomes the selected one and the settings show its X, Y, width, height, font and name @TPL-219 @smoke", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [
                aTemplateItem("prescriptionText", {id: "t"}),
                aTemplateItem("manualInput", {id: "m", name: "السن", xMm: 10.5, yMm: 20.5, wMm: 30.5, hMm: 9.5, fontSizePt: 12.5}),
                aTemplateItem("function", {id: "f", name: "اليوم", xMm: 1, yMm: 2, wMm: 33, hMm: 7, fontSizePt: 9}),
            ],
        }));
        expect(within(settingsPanel()).getByText("Select an item on the sheet to see its settings.")).toBeInTheDocument();

        await user.click(sheetItem("السن"));
        expect(selectedIds()).toEqual(["m"]);
        expect(settingsField(FIELD_LABEL.name)).toHaveValue("السن");
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("10.5");
        expect(settingsField(FIELD_LABEL.y)).toHaveValue("20.5");
        expect(settingsField(FIELD_LABEL.width)).toHaveValue("30.5");
        expect(settingsField(FIELD_LABEL.height)).toHaveValue("9.5");
        expect(settingsField(FIELD_LABEL.font)).toHaveValue("12.5");
        expect(within(settingsPanel()).queryByText("Select an item on the sheet to see its settings.")).not.toBeInTheDocument();

        await user.click(sheetItem("اليوم"));
        expect(selectedIds()).toEqual(["f"]);
        expect(settingsField(FIELD_LABEL.name)).toHaveValue("اليوم");
        expect(settingsField(FIELD_LABEL.x)).toHaveValue("1");
        expect(settingsField(FIELD_LABEL.y)).toHaveValue("2");
        expect(settingsField(FIELD_LABEL.width)).toHaveValue("33");
        expect(settingsField(FIELD_LABEL.height)).toHaveValue("7");
        expect(settingsField(FIELD_LABEL.font)).toHaveValue("9");
    });

    test("a click on the bare sheet changes nothing @TPL-219", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await user.click(theSheet());
        expect(selectedIds()).toEqual(["m"]);
    });

    test("a changed name or static text shows on the sheet at once @TPL-219", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m"}), aTemplateItem("staticText", {id: "s", text: "قديم"})],
        }));
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.name), "New name");
        expect(boxOf("m")).toHaveTextContent("New name");
        expect(sheetItem("New name")).toBe(boxOf("m"));

        await user.click(sheetItem("قديم"));
        await typeInField(user, settingsField(FIELD_LABEL.text), "New text");
        expect(boxOf("s")).toHaveTextContent("New text");
    });

    test.each([
        ["a manual input", "Manual input", "Manual input"],
        ["a function", "Day of week", "Day of week"],
    ])("%s with its name emptied shows its kind's label on the sheet @TPL-219", async (_name, entry, shown) => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry(entry));
        await user.clear(settingsField(FIELD_LABEL.name));
        expect(sheetBoxes()[1]).toHaveTextContent(shown);
    });

    test("a new static text shows its kind's label until it has a text @TPL-219", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Static text"));
        expect(settingsField(FIELD_LABEL.text)).toHaveValue("");
        expect(sheetItem("Static text")).toBe(sheetBoxes()[1]);
    });
});

describe("print template: typing a place, a size or a font @area:admin", () => {
    test.each([
        [FIELD_LABEL.x, "x", "20.5", "20.5mm"],
        [FIELD_LABEL.y, "y", "30.5", "30.5mm"],
        [FIELD_LABEL.width, "w", "50.5", "50.5mm"],
        [FIELD_LABEL.height, "h", "9.5", "9.5mm"],
        [FIELD_LABEL.font, "font", "14.5", "14.5pt"],
    ] as const)("%s typed: the sheet follows at once, with no blur @TPL-044 @smoke", async (field, measure, typed, drawn) => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        const before = measuresOf(boxOf("m"));
        await typeInField(user, settingsField(field), typed);

        expect(settingsField(field)).toHaveFocus();
        expect(measuresOf(boxOf("m"))).toEqual({...before, [measure]: drawn});
    });

    test("the other items don't move @TPL-044", async () => {
        const {user} = await renderDesigner(layoutL());
        const others = [measuresOf(boxOf("t")), measuresOf(boxOf("f"))];
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "20");
        expect([measuresOf(boxOf("t")), measuresOf(boxOf("f"))]).toEqual(others);
    });
});

describe("print template: each kind's settings @area:admin", () => {
    const GEOMETRY = [FIELD_LABEL.x, FIELD_LABEL.y, FIELD_LABEL.width, FIELD_LABEL.height, FIELD_LABEL.font];

    test("the prescription text: geometry and font, no name and no remove action @TPL-045 @TPL-220", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("Prescription text"));

        expect(itemFieldLabels()).toEqual(GEOMETRY);
        expect(within(settingsPanel()).queryByRole("textbox", {name: FIELD_LABEL.name})).not.toBeInTheDocument();
        expect(within(settingsPanel()).queryByRole("button", {name: "Remove item"})).not.toBeInTheDocument();
        expect(settingsPanel()).toHaveTextContent(/Type\W*Prescription text/);
    });

    test("a manual input: name, geometry, font, remove @TPL-220", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));

        expect(itemFieldLabels()).toEqual([FIELD_LABEL.name, ...GEOMETRY]);
        expect(within(settingsPanel()).getByRole("button", {name: "Remove item"})).toBeInTheDocument();
        expect(within(settingsPanel()).queryByText("Shows in the designer only; it doesn't print.")).not.toBeInTheDocument();
    });

    test("a function: name with its hint, geometry, font, remove; the function's label as its type @TPL-220", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("التاريخ"));

        expect(itemFieldLabels()).toEqual([FIELD_LABEL.name, ...GEOMETRY]);
        expect(within(settingsPanel()).getByText("Shows in the designer only; it doesn't print.")).toBeInTheDocument();
        expect(settingsPanel()).toHaveTextContent(/Type\W*Full date/);
        expect(within(settingsPanel()).getByRole("button", {name: "Remove item"})).toBeInTheDocument();
    });

    test("a static text: text, geometry, font, remove, and no name @TPL-220", async () => {
        const {user} = await renderNewSheet();
        await user.click(panelEntry("Static text"));

        expect(itemFieldLabels()).toEqual([FIELD_LABEL.text, ...GEOMETRY]);
        expect(within(settingsPanel()).queryByRole("textbox", {name: FIELD_LABEL.name})).not.toBeInTheDocument();
        expect(within(settingsPanel()).getByRole("button", {name: "Remove item"})).toBeInTheDocument();
    });

    test("Enter in the static text adds a line, doesn't save, and the sheet keeps the line break @TPL-220", async () => {
        const {user} = await renderNewSheet();
        const recorded = recordRequests();
        await user.click(panelEntry("Static text"));
        await user.click(settingsField(FIELD_LABEL.text));
        await user.keyboard("first{Enter}second");

        expect(settingsField(FIELD_LABEL.text)).toHaveValue("first\nsecond");
        expect(sheetBoxes()[1].textContent).toContain("first\nsecond");
        await expectNothingSent(recorded);
    });

    test("remove: it leaves the sheet, the selection clears, no question @TPL-046", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await user.click(within(settingsPanel()).getByRole("button", {name: "Remove item"}));

        expect(sheetBoxes().map(box => box.dataset.itemId)).toEqual(["t", "f"]);
        expect(selectedIds()).toEqual([]);
        expect(within(settingsPanel()).getByText("Select an item on the sheet to see its settings.")).toBeInTheDocument();
        expect(within(settingsPanel()).queryByRole("textbox", {name: FIELD_LABEL.name})).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});

describe("print template: names and texts in their own direction @area:admin", () => {
    test.each([
        ["en" as const, "Name", "Text"],
        ["ar" as const, "الاسم", "النص"],
    ])("%s UI: Arabic and English names and static texts keep their own direction, on the sheet and in the settings @TPL-055", async (lang, nameLabel, textLabel) => {
        const {user} = await renderDesigner(aPrintLayout({
            items: [
                aTemplateItem("prescriptionText", {id: "t"}),
                aTemplateItem("manualInput", {id: "ar", name: "اسم المريض"}),
                aTemplateItem("manualInput", {id: "en", name: "Patient"}),
                aTemplateItem("staticText", {id: "sa", text: "نص عربي"}),
                aTemplateItem("staticText", {id: "se", text: "English text"}),
            ],
        }), {lang});

        for (const shown of ["اسم المريض", "Patient", "نص عربي", "English text"]) expectOwnDirection(theSheet(), shown);
        await user.click(boxOf("ar"));
        expect(settingsField(nameLabel)).toHaveAttribute("dir", "auto");
        await user.click(boxOf("en"));
        expect(settingsField(nameLabel)).toHaveAttribute("dir", "auto");
        await user.click(boxOf("sa"));
        expect(settingsField(textLabel)).toHaveAttribute("dir", "auto");
    });
});

describe("print template: the keyboard and accessible names @area:admin", () => {
    const tabTo = async (user: UserEvent, target: () => HTMLElement) => {
        for (let presses = 0; presses < 60; presses++) {
            if (document.activeElement === target()) return;
            await user.tab();
        }
        throw new Error("Not reachable with Tab");
    };

    test("every control has an accessible name @TPL-057", async () => {
        const {user} = await renderDesigner(layoutL());
        for (const box of ["الاسم", "التاريخ", "Prescription text"]) {
            await user.click(sheetItem(box));
            for (const role of ["button", "textbox", "combobox", "region", "list"]) {
                expect(screen.queryAllByRole(role, {name: /\S/}), role).toHaveLength(screen.queryAllByRole(role).length);
            }
        }
    });

    test("an item can be added, selected and placed with the keyboard alone @TPL-057", async () => {
        const {user} = await renderNewSheet();

        // Added: Enter and Space on an entry, the focus stays there
        act(() => panelEntry("Manual input").focus());
        await user.keyboard("{Enter}");
        expect(sheetBoxes()).toHaveLength(2);
        expect(panelEntry("Manual input")).toHaveFocus();
        await user.keyboard(" ");
        expect(sheetBoxes()).toHaveLength(3);
        expect(panelEntry("Manual input")).toHaveFocus();
        expect(selectedIds()).toEqual([sheetBoxes()[2].dataset.itemId]);

        // Selected: Tab to the sheet's box, then Enter or Space
        const first = sheetBoxes()[1];
        await tabTo(user, () => first);
        await user.keyboard("{Enter}");
        expect(selectedIds()).toEqual([first.dataset.itemId]);
        const text = sheetItem("Prescription text");
        await tabTo(user, () => text);
        await user.keyboard(" ");
        expect(selectedIds()).toEqual([text.dataset.itemId]);

        // Placed: Tab to the field, then type
        await tabTo(user, () => settingsField(FIELD_LABEL.x));
        await user.keyboard("{Control>}a{/Control}33");
        expect(text.style.left).toBe("33mm");
    });

    test("the sheet's area takes the focus: it scrolls, so the keyboard must reach it @TPL-057", async () => {
        await renderDesigner(layoutL());
        expect(sheetArea()).toHaveAttribute("tabindex", "0");
    });

    test("a selected box keeps the browser's focus ring: no inline outline, and its mark is an inset shadow of its own @TPL-057", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));

        const selected = boxOf("m");
        const unselected = boxOf("f");
        expect(selected.getAttribute("style")).not.toMatch(/outline/);
        expect(selected.style.boxShadow).toContain("inset");
        expect(selected.style.boxShadow).not.toBe(unselected.style.boxShadow);
    });

    test("after Remove item the focus lands on the sheet's region, not on the page's body @TPL-057", async () => {
        const {user} = await renderDesigner(layoutL());
        await user.click(sheetItem("الاسم"));
        await user.click(within(settingsPanel()).getByRole("button", {name: "Remove item"}));

        await waitFor(() => expect(sheetArea()).toHaveFocus());
    });
});
