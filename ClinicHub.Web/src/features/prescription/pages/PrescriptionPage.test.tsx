import {describe, expect, test, vi} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import {aDrug, aGroup, aLine, fillIn, findToast, hoverTooltip, toastTexts} from "../../../test";
import type {Dosing} from "../../dosing/types.ts";
import {openPrescription, storedLines} from "../../../test/pages/prescription.tsx";

// The prescription page: docs/features/prescription/business.md "تكوين روشتة", "البدء مع مريض جديد" and "الرسائل
// التي تظهر للمستخدم"; tech.md "Page & components" (SelectionPanel, PrescriptionLineList, LineEditDialog, clear with
// Undo for 6 s), "Text formats" (a dosing with no instructions: the description, then the eye part) and "Clipboard".

const isBefore = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("the prescription page @area:prescription", () => {
    test("a search in Groups, then Drugs and back: each tab keeps its own search @RX-003", async () => {
        const {user} = await openPrescription({groups: [aGroup()], drugs: [aDrug()]});
        await fillIn(user, screen.getByRole("searchbox"), "post");
        await user.click(screen.getByRole("tab", {name: "الأدوية"}));
        expect(screen.getByRole("searchbox")).toHaveValue("");
        await user.type(screen.getByRole("searchbox"), "tob");
        await user.click(screen.getByRole("tab", {name: "المجموعات"}));
        expect(screen.getByRole("searchbox")).toHaveValue("post");
        await user.click(screen.getByRole("tab", {name: "الأدوية"}));
        expect(screen.getByRole("searchbox")).toHaveValue("tob");
    });

    test("empty: «لم يتم اختيار شيء بعد» and its hint, the count 0, «مسح الكل», «نسخ», «تعديل ونسخ» disabled @RX-004", async () => {
        const {selection} = await openPrescription();
        expect(selection().getByText("لم يتم اختيار شيء بعد")).toBeInTheDocument();
        expect(selection().getByText("ابحث عن مجموعة أو دواء واضغط عليه لإضافته هنا.")).toBeInTheDocument();
        expect(selection().getByText("0")).toHaveClass("MuiChip-label");
        expect(selection().getByRole("button", {name: "مسح الكل"})).toBeDisabled();
        expect(selection().getByRole("button", {name: "نسخ"})).toBeDisabled();
        expect(selection().getByRole("button", {name: "تعديل ونسخ"})).toBeDisabled();
    });

    test("empty, in English: \"Nothing selected yet\" @RX-004", async () => {
        const {selection} = await openPrescription({lang: "en"});
        expect(selection().getByText("Nothing selected yet")).toBeInTheDocument();
        expect(selection().getByText("Search for a group or a drug and click it to add it here.")).toBeInTheDocument();
        expect(selection().getByRole("button", {name: "Clear all"})).toBeDisabled();
        expect(selection().getByRole("button", {name: "Copy"})).toBeDisabled();
        expect(selection().getByRole("button", {name: "Edit & copy"})).toBeDisabled();
    });

    test("a drug whose default dosing is only an eye: its description, then the eye part; «بدون عين»: the description alone; copied the same @RX-010", async () => {
        const tears = aDrug({name: "Tears", description: "قطرة مرطبة", defaultDosing: {eye: "right"}});
        const gel = aDrug({name: "Gel", description: "جل مرطب", defaultDosing: {eye: "none"}});
        const {user, selection, addDrug, clipboard} = await openPrescription({drugs: [tears, gel], clipboard: {}});
        await addDrug("Tears");
        await addDrug("Gel");

        const description = selection().getByText("قطرة مرطبة");
        const eye = selection().getByText("في العين اليمنى");
        expect(isBefore(description, eye)).toBe(true);
        expect(selection().getByText("جل مرطب")).toBeInTheDocument();
        expect(selection().queryByText(/بدون عين/)).not.toBeInTheDocument();
        expect(selection().getAllByText(/^في العين/)).toHaveLength(1);

        await user.click(selection().getByRole("button", {name: "نسخ"}));
        expect(await findToast()).toBe("تم النسخ");
        const {text, html} = await clipboard!.written();
        expect(text).toBe("Tears\nقطرة مرطبة\nفي العين اليمنى\n\nGel\nجل مرطب");
        expect(html).toContain("<strong>Tears</strong><br>قطرة مرطبة<br>في العين اليمنى");
        expect(html).toContain("<strong>Gel</strong><br>جل مرطب</p>");
    });
});

describe("editing a line @area:prescription", () => {
    const openLine = async (dosing: Dosing, options: { description?: string | null; note?: string; lang?: "ar" | "en" } = {}) => {
        const line = aLine(aDrug({name: "Tears", description: options.description === undefined ? "قطرة مرطبة" : options.description}), dosing, options.note);
        const page = await openPrescription({lines: [line], lang: options.lang});
        await page.user.click(page.selection().getByRole("button", {name: options.lang === "en" ? "Edit dosing" : "تعديل الجرعة"}));
        const dialog = await screen.findByRole("dialog");
        return {...page, line, dialog};
    };

    const clearFrequency = async (user: Awaited<ReturnType<typeof openLine>>["user"], dialog: HTMLElement) => {
        await user.click(within(dialog).getByRole("combobox", {name: /^عدد المرات/}));
        await user.click(within(await screen.findByRole("listbox")).getByRole("option", {name: "—"}));
    };

    test("invalid dosing (25 times a day): the field turns red, the dialog stays open, the line unchanged @RX-057", async () => {
        const {user, dialog, line} = await openLine({doseUnit: "drop", frequency: "daily", frequencyValue: 4});
        const times = within(dialog).getByRole("spinbutton", {name: "العدد"});
        expect(times).not.toHaveAttribute("aria-invalid", "true");
        await user.clear(times);
        await user.type(times, "25");
        await user.click(within(dialog).getByRole("button", {name: "حفظ"}));

        expect(times).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(storedLines()).toEqual([line]);
    });

    test("«إلغاء»: the line is unchanged @RX-059", async () => {
        const {user, dialog, line, selection} = await openLine({doseUnit: "drop", frequency: "daily", frequencyValue: 4}, {note: "رج الزجاجة"});
        const note = within(dialog).getByRole("textbox", {name: "ملاحظة لهذه الروشتة"});
        await user.clear(note);
        await fillIn(user, note, "ملاحظة أخرى");
        await user.click(within(dialog).getByRole("spinbutton", {name: "العدد"}));
        await user.keyboard("{Backspace}6");
        await user.click(within(dialog).getByRole("button", {name: "إلغاء"}));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(storedLines()).toEqual([line]);
        expect(selection().getByText("رج الزجاجة")).toBeInTheDocument();
        expect(selection().getByText("نقطة واحدة 4 مرات يوميًا")).toBeInTheDocument();
    });

    test("the dosing cleared completely: the line shows the drug's description @RX-060", async () => {
        const {user, dialog, selection} = await openLine({frequency: "bedtime"});
        expect(selection().getByText("قبل النوم")).toBeInTheDocument();
        expect(selection().queryByText("قطرة مرطبة")).not.toBeInTheDocument();
        await clearFrequency(user, dialog);
        await user.click(within(dialog).getByRole("button", {name: "حفظ"}));

        await waitFor(() => expect(selection().getByText("قطرة مرطبة")).toBeInTheDocument());
        expect(selection().queryByText("قبل النوم")).not.toBeInTheDocument();
    });

    test("the dosing cleared completely, no description: only the name @RX-060", async () => {
        const {user, dialog, selection} = await openLine({frequency: "bedtime"}, {description: null});
        await clearFrequency(user, dialog);
        await user.click(within(dialog).getByRole("button", {name: "حفظ"}));

        await waitFor(() => expect(selection().queryByText("قبل النوم")).not.toBeInTheDocument());
        const name = selection().getByText("Tears");
        expect(name.parentElement?.textContent).toBe("Tears");
    });

    test("edited to keep only an eye: the description, then the eye part @RX-104", async () => {
        const {user, dialog, selection} = await openLine({eye: "right", frequency: "bedtime"});
        expect(selection().getByText("في العين اليمنى قبل النوم")).toBeInTheDocument();
        await clearFrequency(user, dialog);
        await user.click(within(dialog).getByRole("button", {name: "حفظ"}));

        const description = await selection().findByText("قطرة مرطبة");
        const eye = selection().getByText("في العين اليمنى");
        expect(isBefore(description, eye)).toBe(true);
    });
});

describe("⊕ add for the other eye @area:prescription", () => {
    const otherEye = "إضافة للعين الأخرى";

    test("A right and A left: no ⊕; after removing the left line, ⊕ shows on the right one @RX-062", async () => {
        const a = aDrug({name: "Tobradex"});
        const {user, selection} = await openPrescription({
            lines: [aLine(a, {doseUnit: "drop", eye: "right"}), aLine(a, {doseUnit: "drop", eye: "left"})],
        });
        expect(selection().queryByRole("button", {name: otherEye})).not.toBeInTheDocument();
        await user.click(selection().getAllByRole("button", {name: "إزالة"})[1]);
        await waitFor(() => expect(storedLines()).toHaveLength(1));
        expect(selection().getByRole("button", {name: otherEye})).toBeInTheDocument();
    });

    test("a line for both eyes or with no eye: no ⊕ @RX-062", async () => {
        await openPrescription({
            lines: [aLine(aDrug({name: "A"}), {doseUnit: "drop", eye: "both"}), aLine(aDrug({name: "B"}), {doseUnit: "drop", eye: "none"}),
                aLine(aDrug({name: "C"}), {doseUnit: "drop"})],
        });
        expect(screen.queryByRole("button", {name: otherEye})).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", {name: "تعديل الجرعة"})).toHaveLength(3);
    });
});

describe("copy @area:prescription", () => {
    test("the clipboard refuses and execCommand fails: «تعذّر النسخ. حدّد النص وانسخه يدويًا.» @RX-073", async () => {
        const {user, selection, clipboard} = await openPrescription({
            lines: [aLine(aDrug({name: "Tobradex"}), {doseUnit: "drop"})],
            clipboard: {fails: true, execCommand: false},
        });
        await user.click(selection().getByRole("button", {name: "نسخ"}));
        expect(await findToast()).toBe("تعذّر النسخ. حدّد النص وانسخه يدويًا.");
        expect(clipboard!.write).toHaveBeenCalled();
        expect(clipboard!.execCommand).toHaveBeenCalledWith("copy");
    });

    test("the copy failure in English: \"Couldn't copy. Select the text and copy it manually.\" @RX-073", async () => {
        const {user, selection} = await openPrescription({
            lines: [aLine(aDrug({name: "Tobradex"}), {doseUnit: "drop"})],
            lang: "en",
            clipboard: {fails: true, execCommand: false},
        });
        await user.click(selection().getByRole("button", {name: "Copy"}));
        expect(await findToast()).toBe("Couldn't copy. Select the text and copy it manually.");
    });
});

describe("clear all @area:prescription", () => {
    test("6 s after a clear: the toast is gone and the lines can't be restored @RX-085", async () => {
        vi.useFakeTimers({shouldAdvanceTime: true});
        const lines = [aLine(aDrug({name: "Tobradex"}), {doseUnit: "drop"}), aLine(aDrug({name: "Vigamox"}))];
        const {user, selection} = await openPrescription({lines});
        await user.click(selection().getByRole("button", {name: "مسح الكل"}));
        expect(await screen.findByRole("button", {name: "تراجع"})).toBeInTheDocument();
        expect(toastTexts()[0]).toContain("تم مسح القائمة");
        expect(storedLines()).toEqual([]);

        await act(async () => {
            vi.advanceTimersByTime(5_500);
        });
        expect(screen.getByRole("button", {name: "تراجع"})).toBeInTheDocument();
        await act(async () => {
            vi.advanceTimersByTime(2_000);
        });
        await waitFor(() => expect(screen.queryByRole("button", {name: "تراجع"})).not.toBeInTheDocument());
        expect(toastTexts().some(text => text.includes("تم مسح القائمة"))).toBe(false);
        expect(storedLines()).toEqual([]);
        expect(selection().getByText("لم يتم اختيار شيء بعد")).toBeInTheDocument();
    });

    test("hovering «مسح الكل» with lines: «حذف كل الأدوية للبدء مع المريض التالي. يمكنك التراجع.» @RX-087", async () => {
        const {selection} = await openPrescription({lines: [aLine(aDrug({name: "Tobradex"}))]});
        expect(await hoverTooltip(selection().getByRole("button", {name: "مسح الكل"}))).toBe("حذف كل الأدوية للبدء مع المريض التالي. يمكنك التراجع.");
    });

    test("the hint in English: \"Remove all drugs to start the next patient. You can undo.\" @RX-087", async () => {
        const {selection} = await openPrescription({lines: [aLine(aDrug({name: "Tobradex"}))], lang: "en"});
        expect(await hoverTooltip(selection().getByRole("button", {name: "Clear all"}))).toBe("Remove all drugs to start the next patient. You can undo.");
    });
});
