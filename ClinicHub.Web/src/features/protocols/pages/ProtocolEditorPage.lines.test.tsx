import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {aDrug, aProtocol, anItem, choose, findToast, hoverTooltip, isolate, tapTooltip, toastTexts} from "../../../test";
import type {Dosing} from "../../dosing/types.ts";
import type {Permission} from "../../access/permissions.ts";
import {dosingPreview} from "../../../test/pages/dosing.ts";
import {lineDetails, lineRows, lineSummary, openEditor, pickerOption} from "../../../test/pages/protocolEditor.tsx";

// The group editor's lines: docs/features/drug-groups/business.md ("إنشاء مجموعة", "جرعة خاصة بالمجموعة",
// "نفس الدواء للعينين", "الرسائل") and tech.md "Frontend" (editor page, DosingLineList, LineDetails, chips, ⊕).

const fourTimesTwoWeeks: Dosing = {doseAmount: 1, doseUnit: "drop", frequency: "daily", frequencyValue: 4, durationUnit: "weeks", durationValue: 2};
const alreadyThere = (name: string) => `«${isolate(name)}» موجود بالفعل في هذه المجموعة لنفس العين`;

describe("group editor: adding drugs from the picker @area:catalog", () => {
    test("a clicked drug is appended with no override (its default sentence) and marked «مُضاف» @GRP-051 @smoke", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: fourTimesTwoWeeks});
        const vigamox = aDrug({name: "Vigamox"});
        const {user, bodies} = await openEditor({drugs: [tobradex, vigamox]});
        await user.click(await screen.findByText("Vigamox"));
        await user.click(pickerOption("Tobradex"));
        expect(lineSummary()).toEqual([["1", "Vigamox"], ["2", "Tobradex"]]);
        expect(lineDetails(lineRows()[1])).toBe("نقطة واحدة 4 مرات يوميًا لمدة أسبوعين");
        expect(within(pickerOption("Tobradex")).getByText("مُضاف")).toBeInTheDocument();
        expect(within(pickerOption("Vigamox")).getByText("مُضاف")).toBeInTheDocument();

        await user.type(screen.getByRole("textbox", {name: "اسم المجموعة"}), "Post cataract");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(bodies).toHaveLength(1));
        expect(bodies[0]).toEqual({name: "Post cataract", items: [{drugId: vigamox.id, dosing: null}, {drugId: tobradex.id, dosing: null}]});
    });

    test("a drug already in the group for its eye: ««Tobradex» موجود بالفعل في هذه المجموعة لنفس العين», no line added @GRP-053", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: {eye: "right"}});
        const {user} = await openEditor({protocol: aProtocol({items: [anItem(tobradex)]})});
        await user.click(await screen.findByText("Tobradex", {selector: "[role=option] *"}));
        expect(await findToast()).toBe(alreadyThere("Tobradex"));
        expect(lineSummary()).toEqual([["1", "Tobradex"]]);
    });

    test("in English: \"“Tobradex” is already in this group for that eye\" @GRP-053", async () => {
        const tobradex = aDrug({name: "Tobradex"});
        const {user} = await openEditor({protocol: aProtocol({items: [anItem(tobradex)]}), lang: "en"});
        await user.click(await screen.findByText("Tobradex", {selector: "[role=option] *"}));
        expect(await findToast()).toBe(`“${isolate("Tobradex")}” is already in this group for that eye`);
    });

    test("a double click on a drug adds one line and no «موجود بالفعل» toast follows @GRP-054", async () => {
        const {user} = await openEditor({drugs: [aDrug({name: "Tobradex"})]});
        await screen.findByText("Tobradex");
        await user.dblClick(pickerOption("Tobradex"));
        expect(lineSummary()).toEqual([["1", "Tobradex"]]);
        expect(toastTexts()).toEqual([]);
    });

    test("drug A overridden to the left while its default is right: clicking A adds a right line with no override @GRP-055", async () => {
        const a = aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop", eye: "right"}});
        const {user, bodies} = await openEditor({protocol: aProtocol({items: [anItem(a, {eye: "left"})]})});
        await user.click(await screen.findByText("Tobradex", {selector: "[role=option] *"}));
        expect(lineSummary()).toEqual([["1", "Tobradex"], ["2", "Tobradex"]]);
        expect(lineDetails(lineRows()[1])).toBe("نقطة واحدة في العين اليمنى");
        expect(toastTexts()).toEqual([]);
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(bodies).toHaveLength(1));
        expect(bodies[0].items).toEqual([{drugId: a.id, dosing: expect.objectContaining({eye: "left"})}, {drugId: a.id, dosing: null}]);
    });
});

describe("group editor: the lines @area:catalog", () => {
    test("✕ removes a line from the list; nothing is saved until Save @GRP-057", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex"})), anItem(aDrug({name: "Vigamox"}))]});
        const {user, bodies} = await openEditor({protocol});
        await user.click(within(lineRows()[0]).getByRole("button", {name: "إزالة"}));
        expect(lineSummary()).toEqual([["1", "Vigamox"]]);
        expect(bodies).toEqual([]);
    });

    test("lines are numbered 1..N with the effective sentence, or the description then the eye part @GRP-058", async () => {
        const protocol = aProtocol({items: [
            // drug default + override of the frequency
            anItem(aDrug({name: "Tobradex", defaultDosing: fourTimesTwoWeeks}), {frequency: "daily", frequencyValue: 6}),
            // no dosing at all: the description
            anItem(aDrug({name: "Artificial tears", description: "Use when needed"})),
            // only an eye: the description, then the eye part
            anItem(aDrug({name: "Vigamox", description: "Antibiotic"}), {eye: "left"}),
            // only «تُحدد عند الإضافة»: the description
            anItem(aDrug({name: "Nevanac", description: "Anti-inflammatory"}), {eye: "ask"}),
        ]});
        await openEditor({protocol});
        expect(lineSummary()).toEqual([["1", "Tobradex"], ["2", "Artificial tears"], ["3", "Vigamox"], ["4", "Nevanac"]]);
        const [first, second, third, fourth] = lineRows().map(lineDetails);
        expect(first).toBe("نقطة واحدة 6 مرات يوميًا لمدة أسبوعينجرعة خاصة بالمجموعة");
        expect(second).toBe("Use when needed");
        expect(third).toBe("Antibiotic" + "في العين اليسرى" + "جرعة خاصة بالمجموعة");
        expect(fourth).toBe("Anti-inflammatory" + "جرعة خاصة بالمجموعة" + "العين تُحدد عند إضافة المجموعة");
    });

    test("a default of only «اليمنى»: the description then «في العين اليمنى»; an override of only «تُحدد عند الإضافة»: the description and the chip @GRP-098", async () => {
        const protocol = aProtocol({items: [
            anItem(aDrug({name: "Tobradex", description: "Antibiotic + steroid", defaultDosing: {eye: "right"}})),
            anItem(aDrug({name: "Vigamox", description: "Antibiotic", defaultDosing: {eye: "left"}}), {eye: "ask"}),
        ]});
        await openEditor({protocol});
        const [first, second] = lineRows();
        expect(lineDetails(first)).toBe("Antibiotic + steroid" + "في العين اليمنى");
        expect(within(second).getByText("Antibiotic")).toBeInTheDocument();
        expect(within(second).queryByText(/في العين/)).not.toBeInTheDocument();
        expect(within(second).getByText("العين تُحدد عند إضافة المجموعة")).toBeInTheDocument();
    });

    test("a saved override shows «جرعة خاصة بالمجموعة» with its tooltip @GRP-069", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: fourTimesTwoWeeks}), {frequency: "daily", frequencyValue: 6}), anItem(aDrug({name: "Vigamox"}))]});
        await openEditor({protocol});
        const [first, second] = lineRows();
        const chip = within(first).getByText("جرعة خاصة بالمجموعة");
        expect(within(second).queryByText("جرعة خاصة بالمجموعة")).not.toBeInTheDocument();
        expect(await hoverTooltip(chip)).toBe("لهذا الدواء جرعة خاصة في هذه المجموعة بدل جرعته الافتراضية.");
    });

    // In the read-only view a tap on a line does nothing else, so it shows the chip's explanation at once (in edit mode
    // a tap on the line opens its dosing dialog, as before)
    const viewOnly: Permission[] = ["protocols.list", "protocols.details"];

    test("read-only on a phone: a quick tap on «جرعة خاصة بالمجموعة» shows its tooltip @GRP-069", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: fourTimesTwoWeeks}), {frequency: "daily", frequencyValue: 6})]});
        await openEditor({protocol, permissions: viewOnly});
        const chip = within(lineRows()[0]).getByText("جرعة خاصة بالمجموعة");
        expect(await tapTooltip(chip)).toBe("لهذا الدواء جرعة خاصة في هذه المجموعة بدل جرعته الافتراضية.");
    });

    test("read-only on a phone: a quick tap on «العين تُحدد عند إضافة المجموعة» shows its tooltip @GRP-079", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}}), {eye: "ask"})]});
        await openEditor({protocol, permissions: viewOnly});
        const chip = within(lineRows()[0]).getByText("العين تُحدد عند إضافة المجموعة");
        expect(await tapTooltip(chip))
            .toBe("العين غير محددة في المجموعة: تختار اليمنى أو اليسرى أو العينين في كل مرة تضيف فيها المجموعة.");
    });

    test("in English the chip reads \"Group dosing\" @GRP-069", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex"}), {frequency: "bedtime"})]});
        await openEditor({protocol, lang: "en"});
        expect(within(lineRows("Drugs in this group")[0]).getByText("Group dosing")).toBeInTheDocument();
    });

    test("«استخدام جرعة الدواء الافتراضية» + save: the override is cleared, the chip goes, the line shows the drug default @GRP-070", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: fourTimesTwoWeeks}), {frequency: "daily", frequencyValue: 6})]});
        const {user, bodies} = await openEditor({protocol});
        await user.click(within(lineRows()[0]).getByRole("button", {name: "تعديل الجرعة"}));
        const dialog = within(await screen.findByRole("dialog"));
        await user.click(dialog.getByRole("button", {name: "استخدام جرعة الدواء الافتراضية"}));
        expect(dosingPreview()).toHaveTextContent(/^نقطة واحدة 4 مرات يوميًا لمدة أسبوعين$/);
        await user.click(dialog.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(lineDetails(lineRows()[0])).toBe("نقطة واحدة 4 مرات يوميًا لمدة أسبوعين");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(bodies).toHaveLength(1));
        expect(bodies[0].items).toEqual([{drugId: protocol.items[0].drug.id, dosing: null}]);
    });

    test("a line with eye ask shows «العين تُحدد عند إضافة المجموعة» with the askEyeInfo tooltip @GRP-079", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}}), {eye: "ask"})]});
        await openEditor({protocol});
        const chip = within(lineRows()[0]).getByText("العين تُحدد عند إضافة المجموعة");
        expect(await hoverTooltip(chip))
            .toBe("العين غير محددة في المجموعة: تختار اليمنى أو اليسرى أو العينين في كل مرة تضيف فيها المجموعة.");
    });

    test("in English the chip reads \"Eye is chosen when the group is added\" with its tooltip @GRP-079", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex"}), {eye: "ask"})]});
        await openEditor({protocol, lang: "en"});
        const chip = within(lineRows("Drugs in this group")[0]).getByText("Eye is chosen when the group is added");
        expect(await hoverTooltip(chip))
            .toBe("The eye isn't fixed in the group: you choose right, left or both each time you add the group.");
    });

    test("the override dialog: an eye already used by another line of the drug toasts ««X» موجود بالفعل…» and stays open @GRP-076", async () => {
        const drug = aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop", eye: "right"}});
        const {user} = await openEditor({protocol: aProtocol({items: [anItem(drug), anItem(drug, {eye: "left"})]})});
        await user.click(within(lineRows()[1]).getByRole("button", {name: "تعديل الجرعة"}));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", {name: "اليمنى"}));
        await user.click(within(dialog).getByRole("button", {name: "حفظ"}));
        expect(await findToast()).toBe(alreadyThere("Tobradex"));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(lineDetails(lineRows()[1])).toContain("في العين اليسرى");
    });
});

describe("group editor: ⊕ the other eye @area:catalog", () => {
    test("a right line with no left line of the drug: ⊕ «إضافة للعين الأخرى» inserts a left line right after it, same dosing @GRP-081", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop", eye: "right"}});
        const protocol = aProtocol({items: [anItem(tobradex, {frequency: "daily", frequencyValue: 6}), anItem(aDrug({name: "Vigamox"}))]});
        const {user, bodies} = await openEditor({protocol});
        await user.click(within(lineRows()[0]).getByRole("button", {name: "إضافة للعين الأخرى"}));
        expect(lineSummary()).toEqual([["1", "Tobradex"], ["2", "Tobradex"], ["3", "Vigamox"]]);
        expect(lineDetails(lineRows()[1])).toBe("نقطة واحدة في العين اليسرى 6 مرات يوميًا" + "جرعة خاصة بالمجموعة");
        // Now both eyes exist: no ⊕ on either line
        for (const row of lineRows().slice(0, 2)) expect(within(row).queryByRole("button", {name: "إضافة للعين الأخرى"})).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(bodies).toHaveLength(1));
        expect(bodies[0].items[1]).toEqual({drugId: tobradex.id, dosing: expect.objectContaining({eye: "left", frequency: "daily", frequencyValue: 6})});
    });

    test("in English the ⊕ button reads \"Add for the other eye\" @GRP-081", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex"}), {eye: "left"})]});
        const {user} = await openEditor({protocol, lang: "en"});
        const row = lineRows("Drugs in this group")[0];
        await user.click(within(row).getByRole("button", {name: "Add for the other eye"}));
        expect(lineSummary("Drugs in this group")).toEqual([["1", "Tobradex"], ["2", "Tobradex"]]);
    });

    test("no ⊕ for a drug with both right and left lines, nor for both / none / ask / no eye @GRP-082", async () => {
        const a = aDrug({name: "Tobradex", defaultDosing: {eye: "right"}});
        const protocol = aProtocol({items: [
            anItem(a),
            anItem(a, {eye: "left"}),
            anItem(aDrug({name: "Both"}), {eye: "both"}),
            anItem(aDrug({name: "None"}), {eye: "none"}),
            anItem(aDrug({name: "Ask"}), {eye: "ask"}),
            anItem(aDrug({name: "Unset", defaultDosing: {doseUnit: "tablet"}})),
        ]});
        await openEditor({protocol});
        const rows = lineRows();
        expect(rows).toHaveLength(6);
        for (const row of rows) {
            expect(within(row).getByRole("button", {name: "تعديل الجرعة"})).toBeInTheDocument();
            expect(within(row).queryByRole("button", {name: "إضافة للعين الأخرى"})).not.toBeInTheDocument();
        }
    });
});

describe("group editor: overriding from the line @area:catalog", () => {
    test("only the times overridden to 6 in the line's dialog: the preview reads «نقطة واحدة 6 مرات يوميًا لمدة أسبوعين», then the line sentence and chip follow @GRP-068", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: fourTimesTwoWeeks}))]});
        const {user} = await openEditor({protocol});
        await user.click(within(lineRows()[0]).getByRole("button", {name: "تعديل الجرعة"}));
        const dialog = within(await screen.findByRole("dialog"));
        await choose(user, dialog.getByRole("combobox", {name: "عدد المرات"}), "مرات في اليوم");
        await user.type(dialog.getByRole("spinbutton", {name: "العدد"}), "6");
        expect(dosingPreview()).toHaveTextContent(/^نقطة واحدة 6 مرات يوميًا لمدة أسبوعين$/);
        await user.click(dialog.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(lineDetails(lineRows()[0])).toBe("نقطة واحدة 6 مرات يوميًا لمدة أسبوعين" + "جرعة خاصة بالمجموعة");
    });
});
