import {describe, expect, test} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import {aDrug, aProtocol, anItem, aSharedDrug, choose, findToast, hoverTooltip, isolate, pastExitTransition, tapTooltip, toastTexts} from "../../../test";
import type {Dosing} from "../../dosing/types.ts";
import type {Permission} from "../../access/permissions.ts";
import {dosingPreview} from "../../../test/pages/dosing.ts";
import {discardDialog, lineDetails, lineRows, lineSummary, openEditor, treeDrug} from "../../../test/pages/protocolEditor.tsx";
import {CATARACT} from "../../../test/pages/drugTree.tsx";

// The protocol editor's lines: docs/features/protocols/business.md ("إنشاء بروتوكول", "جرعة خاصة بالبروتوكول",
// "نفس الدواء للعينين", "الرسائل") and tech.md "Frontend" (editor page, DosingLineList, LineDetails, chips, ⊕).

const fourTimesTwoWeeks: Dosing = {doseAmount: 1, doseUnit: "drop", frequency: "daily", frequencyValue: 4, durationUnit: "weeks", durationValue: 2};
const alreadyThere = (name: string) => `«${isolate(name)}» موجود بالفعل في هذا البروتوكول لنفس العين`;

describe("protocol editor: adding drugs from the drug tree @area:catalog", () => {
    test("a drug clicked in the tree is appended with no override and marked «مُضاف»; an own drug shows its default sentence, a shared one «لا توجد جرعة محددة» or its description; no «مشترك» chip in the tree or the lines @GRP-051 @CAT-278 @smoke", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: fourTimesTwoWeeks});
        const vigamox = aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML", description: null});
        const alemox = aSharedDrug({name: "ALEMOX 1 GM 12 F.C.TABS.", description: "Antibiotic"});
        const {user, bodies} = await openEditor({drugs: [tobradex, vigamox, alemox]});
        await user.click(await treeDrug(vigamox.name));
        expect(screen.getByRole("tree", {name: "كتالوج الأدوية"})).toBeInTheDocument();
        await user.click(await treeDrug("Tobradex"));
        await user.click(await treeDrug(alemox.name));
        expect(lineSummary()).toEqual([["1", vigamox.name], ["2", "Tobradex"], ["3", alemox.name]]);
        const [shared, own, described] = lineRows();
        expect(within(shared).getByText("لا توجد جرعة محددة")).toBeInTheDocument();
        expect(lineDetails(own)).toBe("نقطة واحدة 4 مرات يوميًا لمدة أسبوعين");
        expect(within(described).getByText("Antibiotic")).toBeInTheDocument();
        expect(within(described).queryByText("لا توجد جرعة محددة")).not.toBeInTheDocument();
        for (const name of ["Tobradex", vigamox.name, alemox.name]) expect(within(await treeDrug(name)).getByText("مُضاف")).toBeInTheDocument();
        // M1.7 review R2: no «مشترك» chip anywhere (the tree's shared rows nor the lines); the own drug keeps «خاص بالعيادة»
        expect(screen.queryByText("مشترك")).not.toBeInTheDocument();
        expect(within(await treeDrug("Tobradex")).getByText("خاص بالعيادة")).toBeInTheDocument();

        await user.type(screen.getByRole("textbox", {name: "اسم البروتوكول"}), "Post cataract");
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(bodies).toHaveLength(1));
        expect(bodies[0]).toEqual({
            name: "Post cataract",
            items: [{drugId: vigamox.id, dosing: null}, {drugId: tobradex.id, dosing: null}, {drugId: alemox.id, dosing: null}],
        });
    });

    test("found through the tree's search: the drug's category and subcategory opened, then the drug clicked @GRP-051", async () => {
        // "Tears gel" alone opens its subcategory by itself; "Tears" also matches "Tears gel" in another subcategory
        const {addDrug} = await openEditor({drugs: [aDrug({name: "Tears"}), aDrug({name: "Tears gel", subCategory: CATARACT})]});
        await addDrug("Tears gel");
        await addDrug("Tears");
        expect(lineSummary()).toEqual([["1", "Tears gel"], ["2", "Tears"]]);
    });

    test("a drug already in the protocol for its eye, clicked again in the tree: ««Tobradex» موجود بالفعل في هذا البروتوكول لنفس العين», no line added @GRP-053", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: {eye: "right"}});
        const {user} = await openEditor({protocol: aProtocol({items: [anItem(tobradex)]})});
        await user.click(await treeDrug("Tobradex"));
        expect(await findToast()).toBe(alreadyThere("Tobradex"));
        expect(lineSummary()).toEqual([["1", "Tobradex"]]);
    });

    test("in English: \"“Tobradex” is already in this protocol for that eye\" @GRP-053", async () => {
        const tobradex = aDrug({name: "Tobradex"});
        const {user} = await openEditor({protocol: aProtocol({items: [anItem(tobradex)]}), lang: "en"});
        await user.click(await treeDrug("Tobradex"));
        expect(await findToast()).toBe(`“${isolate("Tobradex")}” is already in this protocol for that eye`);
    });

    test("a double click on a drug in the tree adds one line and no «موجود بالفعل» toast follows @GRP-054", async () => {
        const {user} = await openEditor({drugs: [aDrug({name: "Tobradex"})]});
        await user.dblClick(await treeDrug("Tobradex"));
        expect(lineSummary()).toEqual([["1", "Tobradex"]]);
        await act(() => new Promise(resolve => setTimeout(resolve, 50)));
        expect(toastTexts()).toEqual([]);
        expect(lineSummary()).toEqual([["1", "Tobradex"]]);
    });

    test("own drug A overridden to the left while its default is right: clicking A in the tree adds a right line with no override @GRP-055", async () => {
        const a = aDrug({name: "Tobradex", isShared: false, defaultDosing: {doseUnit: "drop", eye: "right"}});
        const {user, bodies} = await openEditor({protocol: aProtocol({items: [anItem(a, {eye: "left"})]})});
        await user.click(await treeDrug("Tobradex"));
        expect(lineSummary()).toEqual([["1", "Tobradex"], ["2", "Tobradex"]]);
        expect(lineDetails(lineRows()[1])).toBe("نقطة واحدة في العين اليمنى");
        expect(toastTexts()).toEqual([]);
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(bodies).toHaveLength(1));
        expect(bodies[0].items).toEqual([{drugId: a.id, dosing: expect.objectContaining({eye: "left"})}, {drugId: a.id, dosing: null}]);
    });

    test("Esc in the tree's search clears it and nothing else: no «تجاهل التغييرات؟», the editor and its changes stay @CAT-106", async () => {
        const protocol = aProtocol({name: "Post cataract", items: [anItem(aDrug({name: "Tobradex"}))]});
        const {user, location} = await openEditor({protocol});
        await user.type(screen.getByRole("textbox", {name: "اسم البروتوكول"}), " 2");
        const search = screen.getByRole("searchbox", {name: "ابحث بالاسم أو المادة الفعالة أو التصنيف…"});
        await user.click(search);
        await user.paste("Tob");
        await user.keyboard("{Escape}");
        expect(search).toHaveValue("");
        await pastExitTransition();
        expect(discardDialog()).not.toBeInTheDocument();
        expect(location().pathname).toBe(`/protocols/${protocol.id}`);
        expect(screen.getByRole("textbox", {name: "اسم البروتوكول"})).toHaveValue("Post cataract 2");
    });
});

describe("protocol editor: the lines @area:catalog", () => {
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
        expect(first).toBe("نقطة واحدة 6 مرات يوميًا لمدة أسبوعينجرعة خاصة بالبروتوكول");
        expect(second).toBe("Use when needed");
        expect(third).toBe("Antibiotic" + "في العين اليسرى" + "جرعة خاصة بالبروتوكول");
        expect(fourth).toBe("Anti-inflammatory" + "جرعة خاصة بالبروتوكول" + "العين تُحدد عند إضافة البروتوكول");
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
        expect(within(second).getByText("العين تُحدد عند إضافة البروتوكول")).toBeInTheDocument();
    });

    test("a saved override shows «جرعة خاصة بالبروتوكول» with its tooltip @GRP-069", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: fourTimesTwoWeeks}), {frequency: "daily", frequencyValue: 6}), anItem(aDrug({name: "Vigamox"}))]});
        await openEditor({protocol});
        const [first, second] = lineRows();
        const chip = within(first).getByText("جرعة خاصة بالبروتوكول");
        expect(within(second).queryByText("جرعة خاصة بالبروتوكول")).not.toBeInTheDocument();
        expect(await hoverTooltip(chip)).toBe("لهذا الدواء جرعة خاصة في هذا البروتوكول بدل جرعته الافتراضية.");
    });

    // In the read-only view a tap on a line does nothing else, so it shows the chip's explanation at once (in edit mode
    // a tap on the line opens its dosing dialog, as before)
    const viewOnly: Permission[] = ["protocols.list", "protocols.details"];

    test("read-only on a phone: a quick tap on «جرعة خاصة بالبروتوكول» shows its tooltip @GRP-069", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: fourTimesTwoWeeks}), {frequency: "daily", frequencyValue: 6})]});
        await openEditor({protocol, permissions: viewOnly});
        const chip = within(lineRows()[0]).getByText("جرعة خاصة بالبروتوكول");
        expect(await tapTooltip(chip)).toBe("لهذا الدواء جرعة خاصة في هذا البروتوكول بدل جرعته الافتراضية.");
    });

    test("read-only on a phone: a quick tap on «العين تُحدد عند إضافة البروتوكول» shows its tooltip @GRP-079", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}}), {eye: "ask"})]});
        await openEditor({protocol, permissions: viewOnly});
        const chip = within(lineRows()[0]).getByText("العين تُحدد عند إضافة البروتوكول");
        expect(await tapTooltip(chip))
            .toBe("العين غير محددة في البروتوكول: تختار اليمنى أو اليسرى أو العينين في كل مرة تضيف فيها البروتوكول.");
    });

    test("in English the chip reads \"Protocol dosing\" @GRP-069", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex"}), {frequency: "bedtime"})]});
        await openEditor({protocol, lang: "en"});
        expect(within(lineRows("Drugs in this protocol")[0]).getByText("Protocol dosing")).toBeInTheDocument();
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

    test("a line with eye ask shows «العين تُحدد عند إضافة البروتوكول» with the askEyeInfo tooltip @GRP-079", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}}), {eye: "ask"})]});
        await openEditor({protocol});
        const chip = within(lineRows()[0]).getByText("العين تُحدد عند إضافة البروتوكول");
        expect(await hoverTooltip(chip))
            .toBe("العين غير محددة في البروتوكول: تختار اليمنى أو اليسرى أو العينين في كل مرة تضيف فيها البروتوكول.");
    });

    test("in English the chip reads \"Eye is chosen when the protocol is added\" with its tooltip @GRP-079", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex"}), {eye: "ask"})]});
        await openEditor({protocol, lang: "en"});
        const chip = within(lineRows("Drugs in this protocol")[0]).getByText("Eye is chosen when the protocol is added");
        expect(await hoverTooltip(chip))
            .toBe("The eye isn't fixed in the protocol: you choose right, left or both each time you add the protocol.");
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

describe("protocol editor: ⊕ the other eye @area:catalog", () => {
    test("a right line with no left line of the drug: ⊕ «إضافة للعين الأخرى» inserts a left line right after it, same dosing @GRP-081", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop", eye: "right"}});
        const protocol = aProtocol({items: [anItem(tobradex, {frequency: "daily", frequencyValue: 6}), anItem(aDrug({name: "Vigamox"}))]});
        const {user, bodies} = await openEditor({protocol});
        await user.click(within(lineRows()[0]).getByRole("button", {name: "إضافة للعين الأخرى"}));
        expect(lineSummary()).toEqual([["1", "Tobradex"], ["2", "Tobradex"], ["3", "Vigamox"]]);
        expect(lineDetails(lineRows()[1])).toBe("نقطة واحدة في العين اليسرى 6 مرات يوميًا" + "جرعة خاصة بالبروتوكول");
        // Now both eyes exist: no ⊕ on either line
        for (const row of lineRows().slice(0, 2)) expect(within(row).queryByRole("button", {name: "إضافة للعين الأخرى"})).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(bodies).toHaveLength(1));
        expect(bodies[0].items[1]).toEqual({drugId: tobradex.id, dosing: expect.objectContaining({eye: "left", frequency: "daily", frequencyValue: 6})});
    });

    test("in English the ⊕ button reads \"Add for the other eye\" @GRP-081", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex"}), {eye: "left"})]});
        const {user} = await openEditor({protocol, lang: "en"});
        const row = lineRows("Drugs in this protocol")[0];
        await user.click(within(row).getByRole("button", {name: "Add for the other eye"}));
        expect(lineSummary("Drugs in this protocol")).toEqual([["1", "Tobradex"], ["2", "Tobradex"]]);
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

describe("protocol editor: overriding from the line @area:catalog", () => {
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
        expect(lineDetails(lineRows()[0])).toBe("نقطة واحدة 6 مرات يوميًا لمدة أسبوعين" + "جرعة خاصة بالبروتوكول");
    });
});
