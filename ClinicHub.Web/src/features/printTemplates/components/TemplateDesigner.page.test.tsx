import {describe, expect, test} from "vitest";
import {screen, within} from "@testing-library/react";
import {aPrintLayout, aTemplateItem, choose, optionsOf, recordRequests} from "../../../test";
import {
    boxOf,
    expectFieldMessage,
    expectNothingSent,
    FIELD_LABEL,
    measuresOf,
    paperSize,
    renderDesigner,
    renderNewSheet,
    saveButton,
    settingsField,
    settingsPanel,
    sheetBoxes,
    sheetItem,
    sheetSize,
    templatePath,
    typeInField,
} from "../../../test/pages/printTemplate.tsx";

// The sheet's size: contract § 3.3 (page width and height), § 2.2 `applyPageSize`; business.md «عند تغيير مقاس الورقة», «المقاس المخصص».

const A4 = {size: "A4", widthMm: 210, heightMm: 297} as const;
const custom = (widthMm: number, heightMm: number) => ({size: "custom", widthMm, heightMm}) as const;

const onA4 = (x = 140, width = 20) => aPrintLayout({
    page: A4,
    items: [
        aTemplateItem("prescriptionText", {id: "t"}),
        aTemplateItem("manualInput", {id: "m", xMm: x, yMm: 46, wMm: width, hMm: 8}),
    ],
});

describe("print template: the paper size @area:admin", () => {
    test("the choices, in order: A5, A4, Custom @TPL-047", async () => {
        const {user} = await renderNewSheet();
        expect(await optionsOf(user, paperSize())).toEqual(["A5", "A4", "Custom"]);
    });

    test("A5 to A4: the sheet resizes, items keep their mm @TPL-047", async () => {
        const {user} = await renderNewSheet();
        const before = measuresOf(sheetItem("Prescription text"));
        await choose(user, paperSize(), "A4");

        expect(sheetSize()).toEqual({w: "210mm", h: "297mm"});
        expect(paperSize()).toHaveTextContent("A4");
        expect(measuresOf(sheetItem("Prescription text"))).toEqual(before);
        expect(settingsField(FIELD_LABEL.pageWidth)).toHaveValue("210");
        expect(settingsField(FIELD_LABEL.pageHeight)).toHaveValue("297");
    });

    test("to a smaller size: an item that would fall off comes back, X 128, its width kept; items inside don't move @TPL-047", async () => {
        const {user} = await renderDesigner(onA4());
        const text = measuresOf(boxOf("t"));
        await choose(user, paperSize(), "A5");

        expect(sheetSize()).toEqual({w: "148mm", h: "210mm"});
        expect(measuresOf(boxOf("m"))).toEqual({x: "128mm", y: "46mm", w: "20mm", h: "8mm", font: "11pt"});
        expect(measuresOf(boxOf("t"))).toEqual(text);
    });

    test("going back to A4 doesn't restore the old X @TPL-047", async () => {
        const {user} = await renderDesigner(onA4());
        await choose(user, paperSize(), "A5");
        await choose(user, paperSize(), "A4");
        expect(boxOf("m").style.left).toBe("128mm");
    });

    test("Custom keeps the current measures; only then the width and height can be typed @TPL-047", async () => {
        const {user} = await renderNewSheet();
        expect(settingsField(FIELD_LABEL.pageWidth)).toBeDisabled();
        expect(settingsField(FIELD_LABEL.pageHeight)).toBeDisabled();
        expect(settingsField(FIELD_LABEL.pageWidth)).toHaveValue("148");
        expect(settingsField(FIELD_LABEL.pageHeight)).toHaveValue("210");

        await choose(user, paperSize(), "Custom");

        expect(settingsField(FIELD_LABEL.pageWidth)).toBeEnabled();
        expect(settingsField(FIELD_LABEL.pageHeight)).toBeEnabled();
        expect(sheetSize()).toEqual({w: "148mm", h: "210mm"});
    });

    test("a custom size is taken on blur, and moves what falls off @TPL-047", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            page: custom(300, 300),
            items: [aTemplateItem("prescriptionText", {id: "t", xMm: 10, yMm: 10, wMm: 100, hMm: 30}), aTemplateItem("manualInput", {id: "m", xMm: 250, yMm: 250, wMm: 40, hMm: 8})],
        }));
        await typeInField(user, settingsField(FIELD_LABEL.pageWidth), "200.5");
        await user.tab();
        expect(sheetSize()).toEqual({w: "200.5mm", h: "300mm"});
        expect(boxOf("m").style.left).toBe("160.5mm");

        await typeInField(user, settingsField(FIELD_LABEL.pageHeight), "100");
        await user.tab();
        expect(sheetSize()).toEqual({w: "200.5mm", h: "100mm"});
        expect(boxOf("m").style.top).toBe("92mm");
        expect(boxOf("t").style.left).toBe("10mm");
    });

    test("the size goes into the request @TPL-047", async () => {
        const {user, clinic} = await renderDesigner(onA4(10));
        const recorded = recordRequests();
        await choose(user, paperSize(), "Custom");
        await typeInField(user, settingsField(FIELD_LABEL.pageWidth), "200");
        await user.keyboard("{Enter}");
        await user.click(saveButton());

        expect(await screen.findByText("Template saved")).toBeInTheDocument();
        expect(recorded.writes()).toEqual([expect.objectContaining({
            method: "PUT",
            path: templatePath(clinic.id),
            body: expect.objectContaining({page: {size: "custom", widthMm: 200, heightMm: 297}}),
        })]);
    });
});

describe("print template: typing a custom size never moves anything on the way @area:admin", () => {
    const openCustom = () => renderDesigner(aPrintLayout({
        page: custom(200, 200),
        items: [aTemplateItem("prescriptionText", {id: "t", xMm: 100, yMm: 100, wMm: 80, hMm: 30}), aTemplateItem("manualInput", {id: "m", xMm: 100, yMm: 20, wMm: 40, hMm: 8})],
    }));

    test("typed through 50 on its way to 500: no item has moved, and 500 itself is refused @TPL-221", async () => {
        const {user} = await openCustom();
        const before = sheetBoxes().map(measuresOf);
        const width = settingsField(FIELD_LABEL.pageWidth);
        await user.clear(width);
        await user.type(width, "50");

        expect(sheetBoxes().map(measuresOf)).toEqual(before);
        expect(sheetSize()).toEqual({w: "200mm", h: "200mm"});

        await user.type(width, "0");
        expect(sheetBoxes().map(measuresOf)).toEqual(before);
        await user.tab();

        expect(sheetBoxes().map(measuresOf)).toEqual(before);
        expect(sheetSize()).toEqual({w: "200mm", h: "200mm"});
        expectFieldMessage(settingsField(FIELD_LABEL.pageWidth), "The sheet size isn't valid.");
        expect(settingsField(FIELD_LABEL.pageWidth)).toHaveValue("500");
    });

    test("a typed value that isn't taken blocks Save: nothing is sent @TPL-221", async () => {
        const {user} = await openCustom();
        const recorded = recordRequests();
        await typeInField(user, settingsField(FIELD_LABEL.pageWidth), "500");
        await user.tab();
        await user.click(saveButton());

        expectFieldMessage(settingsField(FIELD_LABEL.pageWidth), "The sheet size isn't valid.");
        await expectNothingSent(recorded);
    });

    test("typed through 50 on its way to 300, then Enter: taken once, nothing moved @TPL-221", async () => {
        const {user} = await openCustom();
        const before = sheetBoxes().map(measuresOf);
        const width = settingsField(FIELD_LABEL.pageWidth);
        await user.clear(width);
        await user.type(width, "30");
        expect(sheetSize().w).toBe("200mm");
        await user.type(width, "0{Enter}");

        expect(sheetSize().w).toBe("300mm");
        expect(sheetBoxes().map(measuresOf)).toEqual(before);
    });

    test.each([
        ["not a number", "abc", "Enter a number."],
        ["empty", "", "Enter a number."],
        ["below the minimum", "49", "The sheet size isn't valid."],
        ["above the maximum", "421", "The sheet size isn't valid."],
    ])("%s, on blur: nothing moves, the text stays, with its message @TPL-221", async (_name, typed, message) => {
        const {user} = await openCustom();
        const before = sheetBoxes().map(measuresOf);
        await typeInField(user, settingsField(FIELD_LABEL.pageWidth), typed);
        await user.tab();

        expect(sheetBoxes().map(measuresOf)).toEqual(before);
        expect(sheetSize().w).toBe("200mm");
        expect(settingsField(FIELD_LABEL.pageWidth)).toHaveValue(typed);
        expectFieldMessage(settingsField(FIELD_LABEL.pageWidth), message);
    });

    test.each([
        ["width", FIELD_LABEL.pageWidth, "50", "420", (size: ReturnType<typeof sheetSize>) => size.w],
        ["height", FIELD_LABEL.pageHeight, "50", "600", (size: ReturnType<typeof sheetSize>) => size.h],
    ])("the %s's borders are taken @TPL-221", async (_name, field, low, high, read) => {
        const {user} = await renderDesigner(aPrintLayout({
            page: custom(100, 100),
            items: [aTemplateItem("prescriptionText", {id: "t", xMm: 0, yMm: 0, wMm: 20, hMm: 20})],
        }));
        await typeInField(user, settingsField(field), low);
        await user.tab();
        expect(read(sheetSize())).toBe(`${low}mm`);
        await typeInField(user, settingsField(field), high);
        await user.tab();
        expect(read(sheetSize())).toBe(`${high}mm`);
    });
});

describe("print template: an item bigger than the new page @area:admin", () => {
    test("a 180 mm box on A4, going to A5: fully inside, reduced only as far as needed, and the layout saves @TPL-222", async () => {
        const {user, clinic} = await renderDesigner(aPrintLayout({
            page: A4,
            items: [aTemplateItem("prescriptionText", {id: "t", xMm: 15, yMm: 40, wMm: 180, hMm: 50})],
        }));
        const recorded = recordRequests();
        await choose(user, paperSize(), "A5");

        expect(measuresOf(boxOf("t"))).toEqual({x: "0mm", y: "40mm", w: "148mm", h: "50mm", font: "11pt"});

        await user.click(saveButton());
        expect(await screen.findByText("Template saved")).toBeInTheDocument();
        expect(recorded.writes()).toEqual([expect.objectContaining({
            path: templatePath(clinic.id),
            body: {
                schemaVersion: 1,
                page: {size: "A5", widthMm: 148, heightMm: 210},
                items: [{id: "t", kind: "prescriptionText", xMm: 0, yMm: 40, wMm: 148, hMm: 50, fontSizePt: 11}],
            },
        })]);
    });
});

describe("print template: millimetres in Arabic @area:admin", () => {
    test("every mm field reads left to right in the Arabic UI, as text that takes Arabic digits; X still means from the left edge @TPL-226", async () => {
        const {user} = await renderDesigner(aPrintLayout({
            page: custom(200, 200),
            items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m"})],
        }), {lang: "ar"});
        await user.click(sheetItem("الاسم"));

        const labels = ["X: من اليسار (مم)", "Y: من الأعلى (مم)", "العرض (مم)", "الارتفاع (مم)", "حجم الخط (نقطة)", "عرض الورقة (مم)", "ارتفاع الورقة (مم)"];
        for (const fieldLabel of labels) {
            const field = settingsField(fieldLabel);
            expect(field, fieldLabel).toHaveAttribute("dir", "ltr");
            expect(field, fieldLabel).toHaveAttribute("type", "text");
            expect(field, fieldLabel).toHaveAttribute("inputmode", "decimal");
        }

        await typeInField(user, settingsField("X: من اليسار (مم)"), "20");
        expect(boxOf("m").style.left).toBe("20mm");
    });

    test("the Type and the settings' titles follow the language @TPL-226", async () => {
        const {user} = await renderDesigner(aPrintLayout(), {lang: "ar"});
        await user.click(sheetItem("الاسم"));
        expect(settingsPanel()).toHaveTextContent(/النوع.*حقل يدوي/);
        expect(within(settingsPanel()).getByRole("heading", {name: "الورقة"})).toBeInTheDocument();
    });
});
