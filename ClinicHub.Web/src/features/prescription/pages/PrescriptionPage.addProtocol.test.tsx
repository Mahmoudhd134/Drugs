import {describe, expect, test, vi} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import toast from "react-hot-toast";
import {
    aDrug,
    aProtocol,
    aLine,
    anItem,
    protocolsHandlers,
    drugsHandlers,
    findToast,
    isolate,
    renderWithProviders,
    server,
    toastTexts,
} from "../../../test";
import type {Dosing, TaperStep} from "../../dosing/types.ts";
import type {Protocol} from "../../protocols/types.ts";
import type {PrescriptionLine} from "../types.ts";
import {PrescriptionPage} from "./PrescriptionPage.tsx";

// The add-group algorithm: docs/features/prescription/tech.md "Page & components" (addGroup), business.md
// "القواعد التشغيلية" and "الرسائل التي تظهر للمستخدم". Arabic UI, clinic 1.

const KEY = "prescription.lines.1";
const added = (count: number, protocol = "Post cataract") => `تمت الإضافة من «${isolate(protocol)}»: ${count}`;

const storedLines = (): PrescriptionLine[] => JSON.parse(localStorage.getItem(KEY) ?? "[]");
const summary = () => storedLines().map(l => [l.drug.name, l.dosing.eye ?? null]);

const right: Dosing = {doseAmount: 1, doseUnit: "drop", eye: "right", frequency: "daily", frequencyValue: 4};
const week = {durationUnit: "weeks", durationValue: 1} as const;

/** Opens the page with `lines` already in the prescription and `groups` in the picker; `addGroup(name)` clicks one. */
const openPage = async (protocols: Protocol[], lines: PrescriptionLine[] = []) => {
    localStorage.setItem(KEY, JSON.stringify(lines));
    server.use(...protocolsHandlers(protocols), ...drugsHandlers([]));
    const success = vi.spyOn(toast, "success");
    const rendered = await renderWithProviders(<PrescriptionPage/>, {lang: "ar"});
    const addProtocol = async (name = "Post cataract") => rendered.user.click(await screen.findByText(name));
    const dialog = () => screen.getByRole("dialog");
    const answer = async (button: string) => rendered.user.click(within(await screen.findByRole("dialog")).getByRole("button", {name: button}));
    /** The summary toast's lines (one toast per group added). */
    const toastLines = async () => (await findToast()).split("\n");
    return {...rendered, addProtocol, dialog, answer, toastLines, success};
};

describe("adding a group to the prescription @area:prescription", () => {
    test("new lines are appended after the lines already there @RX-016", async () => {
        const a = aDrug({name: "Tobradex", defaultDosing: right});
        const b = aDrug({name: "Vigamox"});
        const existing = aLine(aDrug({name: "Pred Forte"}));
        const page = await openPage([aProtocol({items: [anItem(a), anItem(b)]})], [existing]);
        await page.addProtocol();
        expect(await page.toastLines()).toEqual([added(2)]);
        expect(summary()).toEqual([["Pred Forte", null], ["Tobradex", "right"], ["Vigamox", null]]);
        expect(storedLines()[0]).toEqual(existing);
    });

    test("a group without «تُحدد عند الإضافة» lines asks no eye @RX-018", async () => {
        const page = await openPage([aProtocol({items: [anItem(aDrug({defaultDosing: right})), anItem(aDrug({name: "Vigamox"}), {eye: "left"})]})]);
        await page.addProtocol();
        expect(await page.toastLines()).toEqual([added(2)]);
        expect(screen.queryByText("أي عين؟")).not.toBeInTheDocument();
        expect(summary()).toEqual([["Tobradex", "right"], ["Vigamox", "left"]]);
    });

    test("3 «ask» lines and 1 right line: asked once, the ask lines get the chosen eye, the right line stays @RX-020 @smoke", async () => {
        const protocol = aProtocol({items: [
            anItem(aDrug({name: "Tobradex"}), {eye: "ask"}),
            anItem(aDrug({name: "Vigamox"}), {eye: "ask", doseUnit: "drop"}),
            anItem(aDrug({name: "Nevanac", defaultDosing: {eye: "both"}}), {eye: "ask"}),
            anItem(aDrug({name: "Pred Forte", defaultDosing: right})),
        ]});
        const page = await openPage([protocol]);
        await page.addProtocol();
        expect(await screen.findByText("أي عين؟")).toBeInTheDocument();
        await page.answer("اليسرى");
        expect(await page.toastLines()).toEqual([added(4)]);
        // Asked once: a second question would have stopped the flow before its toast
        expect(screen.queryAllByText("أي عين؟").length).toBeLessThanOrEqual(1);
        expect(summary()).toEqual([["Tobradex", "left"], ["Vigamox", "left"], ["Nevanac", "left"], ["Pred Forte", "right"]]);
    });

    test("choosing «العينين»: the ask lines read «في العينين» @RX-021", async () => {
        const page = await openPage([aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}}), {eye: "ask"})]})]);
        await page.addProtocol();
        await page.answer("العينين");
        await page.toastLines();
        expect(summary()).toEqual([["Tobradex", "both"]]);
        expect(screen.getByText("نقطة واحدة في العينين")).toBeInTheDocument();
    });

    test("the same group added for the right eye, then the left: separate lines per eye @RX-023", async () => {
        const protocol = aProtocol({items: [anItem(aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}}), {eye: "ask"})]});
        const page = await openPage([protocol]);
        await page.addProtocol();
        await page.answer("اليمنى");
        await waitFor(() => expect(summary()).toEqual([["Tobradex", "right"]]));
        await page.addProtocol();
        await page.answer("اليسرى");
        await waitFor(() => expect(summary()).toEqual([["Tobradex", "right"], ["Tobradex", "left"]]));
    });

    test("a line equal to the group's only after normalization counts as identical @RX-025", async () => {
        const drug = aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop", frequency: "bedtime"}});
        // Stored with a leftover value of a frequency that takes none
        const existing = aLine(drug, {doseUnit: "drop", frequency: "bedtime", frequencyValue: 3});
        const page = await openPage([aProtocol({items: [anItem(drug)]})], [existing]);
        await page.addProtocol();
        expect(await page.toastLines()).toEqual([added(0), "موجود مسبقًا في القائمة: 1"]);
        expect(screen.queryByText("موجود بالفعل في الروشتة")).not.toBeInTheDocument();
        expect(storedLines()).toEqual([existing]);
    });

    test("an identical taper schedule already in the list is skipped, no conflict @RX-026", async () => {
        const taperSteps: TaperStep[] = [{frequency: "daily", frequencyValue: 4, ...week}, {frequency: "daily", frequencyValue: 3, ...week}];
        const drug = aDrug({name: "Pred Forte", defaultDosing: {doseUnit: "drop", eye: "right", taperSteps}});
        const page = await openPage([aProtocol({items: [anItem(drug)]})]);
        await page.addProtocol();
        expect(await page.toastLines()).toEqual([added(1)]);
        await page.addProtocol();
        await waitFor(() => expect(toastTexts()[0]).toBe(`${added(0)}\nموجود مسبقًا في القائمة: 1`));
        expect(screen.queryByText("موجود بالفعل في الروشتة")).not.toBeInTheDocument();
        expect(storedLines()).toHaveLength(1);
    });

    test("two saved lines of a drug for the same eye after merging: the first is added, the other counted @RX-029", async () => {
        // Saved when the drug's default eye was left; it is right now, so both lines give the right eye
        const drug = aDrug({name: "Tobradex", defaultDosing: {eye: "right", doseUnit: "drop"}});
        const page = await openPage([aProtocol({items: [anItem(drug, {frequency: "daily", frequencyValue: 2}), anItem(drug, {eye: "right", frequency: "bedtime"})]})]);
        await page.addProtocol();
        expect(await page.toastLines()).toEqual([added(1), "مكرر في المجموعة ولم يُضف: 1"]);
        expect(storedLines().map(l => l.dosing)).toEqual([expect.objectContaining({eye: "right", frequency: "daily", frequencyValue: 2})]);
    });

    test("in English the duplicated line reads \"Duplicated in the group, not added: 1\" @RX-029", async () => {
        const drug = aDrug({name: "Tobradex", defaultDosing: {eye: "right"}});
        server.use(...protocolsHandlers([aProtocol({items: [anItem(drug), anItem(drug, {eye: "right", doseUnit: "drop"})]})]), ...drugsHandlers([]));
        const {user} = await renderWithProviders(<PrescriptionPage/>, {lang: "en"});
        await user.click(await screen.findByText("Post cataract"));
        expect(await findToast())
            .toBe(`Added from “${isolate("Post cataract")}”: 1\nDuplicated in the group, not added: 1`);
    });

    describe("an «ask» line and a line for the chosen eye", () => {
        const drug = () => aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}});
        const first: Dosing = {eye: "ask", frequency: "daily", frequencyValue: 4};
        const second: Dosing = {eye: "right", frequency: "daily", frequencyValue: 2};
        const other = () => aDrug({name: "Vigamox"});

        test("«استخدام الأولى» / «استخدام الثانية»: one line with that dosing, in the first line's place, counted as added @RX-031", async () => {
            for (const [button, frequencyValue] of [["استخدام الأولى", 4], ["استخدام الثانية", 2]] as const) {
                const tobradex = drug();
                const page = await openPage([aProtocol({items: [anItem(tobradex, first), anItem(other()), anItem(tobradex, second)]})]);
                await page.addProtocol();
                await page.answer("اليمنى");
                expect(await screen.findByText("جرعتان لنفس العين")).toBeInTheDocument();
                await page.answer(button);
                expect(await page.toastLines()).toEqual([added(2)]);
                expect(storedLines().map(l => [l.drug.name, l.dosing.eye, l.dosing.frequencyValue ?? null]))
                    .toEqual([["Tobradex", "right", frequencyValue], ["Vigamox", null, null]]);
                page.unmount();
                toast.remove();
            }
        });

        test("the same dosing: one line, no question @RX-033", async () => {
            const tobradex = drug();
            const page = await openPage([aProtocol({items: [anItem(tobradex, {...second, eye: "ask"}), anItem(tobradex, second)]})]);
            await page.addProtocol();
            await page.answer("اليمنى");
            expect(await page.toastLines()).toEqual([added(1)]);
            expect(screen.queryByText("جرعتان لنفس العين")).not.toBeInTheDocument();
            expect(summary()).toEqual([["Tobradex", "right"]]);
        });

        test("the other eye chosen: two lines and no question @RX-034", async () => {
            const tobradex = drug();
            const page = await openPage([aProtocol({items: [anItem(tobradex, first), anItem(tobradex, second)]})]);
            await page.addProtocol();
            await page.answer("اليسرى");
            expect(await page.toastLines()).toEqual([added(2)]);
            expect(screen.queryByText("جرعتان لنفس العين")).not.toBeInTheDocument();
            expect(storedLines().map(l => [l.dosing.eye, l.dosing.frequencyValue])).toEqual([["left", 4], ["right", 2]]);
        });

        test("the chosen line clashing with one already in the prescription: the usual question follows @RX-036", async () => {
            const tobradex = drug();
            const existing = aLine(tobradex, {doseUnit: "drop", eye: "right", frequency: "bedtime"});
            const page = await openPage([aProtocol({items: [anItem(tobradex, first), anItem(tobradex, second)]})], [existing]);
            await page.addProtocol();
            await page.answer("اليمنى");
            await page.answer("استخدام الثانية");
            expect(await screen.findByText("موجود بالفعل في الروشتة")).toBeInTheDocument();
            await page.answer("استخدام جرعة المجموعة");
            expect(await page.toastLines()).toEqual([added(0), "تم الاستبدال بجرعة المجموعة: 1"]);
            expect(storedLines().map(l => [l.key, l.dosing.frequency, l.dosing.frequencyValue]))
                .toEqual([[existing.key, "daily", 2]]);
        });
    });

    test("3 conflicts, «الإبقاء على الحالي» with «تطبيق على باقي التعارضات» ticked: all kept, no more questions @RX-046", async () => {
        const drugs = ["A", "B", "C"].map(name => aDrug({name, defaultDosing: {doseUnit: "tablet", frequency: "daily", frequencyValue: 2}}));
        const existing = drugs.map(d => aLine(d, {doseUnit: "tablet", frequency: "bedtime"}));
        const page = await openPage([aProtocol({items: drugs.map(d => anItem(d))})], existing);
        await page.addProtocol();
        expect(await screen.findByText("موجود بالفعل في الروشتة")).toBeInTheDocument();
        await page.user.click(within(page.dialog()).getByRole("checkbox", {name: "تطبيق على باقي التعارضات: 2"}));
        await page.answer("الإبقاء على الحالي");
        expect(await page.toastLines()).toEqual([added(0), "تم الإبقاء على الجرعة الحالية: 3"]);
        expect(storedLines()).toEqual(existing);
        expect(page.success).not.toHaveBeenCalled();
    });

    test("1 new, 1 replaced, 1 kept, 1 identical: one toast with 4 lines in this order @RX-049 @smoke", async () => {
        const fresh = aDrug({name: "New"});
        const replaced = aDrug({name: "Replaced", defaultDosing: {doseUnit: "drop", frequency: "daily", frequencyValue: 4}});
        const kept = aDrug({name: "Kept", defaultDosing: {doseUnit: "drop", frequency: "daily", frequencyValue: 3}});
        const same = aDrug({name: "Same", defaultDosing: {doseUnit: "drop", frequency: "bedtime"}});
        const lines = [
            aLine(replaced, {doseUnit: "drop", frequency: "daily", frequencyValue: 1}, "رج الزجاجة"),
            aLine(kept, {doseUnit: "drop", frequency: "daily", frequencyValue: 1}),
            aLine(same),
        ];
        const page = await openPage([aProtocol({name: "G", items: [anItem(fresh), anItem(replaced), anItem(kept), anItem(same)]})], lines);
        await page.addProtocol("G");
        await page.answer("استخدام جرعة المجموعة");
        await page.answer("الإبقاء على الحالي");
        expect(await page.toastLines()).toEqual([
            added(1, "G"), "تم الاستبدال بجرعة المجموعة: 1", "تم الإبقاء على الجرعة الحالية: 1", "موجود مسبقًا في القائمة: 1",
        ]);
        expect(page.success).toHaveBeenCalledTimes(1);
        // Replaced in place, its note kept; the new line appended
        expect(storedLines().map(l => [l.drug.name, l.dosing.frequencyValue ?? null, l.note]))
            .toEqual([["Replaced", 4, "رج الزجاجة"], ["Kept", 1, ""], ["Same", null, ""], ["New", null, ""]]);
    });

    test("only new lines: the toast holds only the «تمت الإضافة» line @RX-050", async () => {
        const page = await openPage([aProtocol({items: [anItem(aDrug({name: "A"})), anItem(aDrug({name: "B"}))]})]);
        await page.addProtocol();
        expect(await page.toastLines()).toEqual([added(2)]);
        expect(page.success).toHaveBeenCalledTimes(1);
    });

    test("a group whose lines are all gone: nothing added, «…: 0» in the neutral style @RX-051", async () => {
        const existing = aLine(aDrug({name: "Pred Forte"}));
        const page = await openPage([aProtocol({name: "G", items: []})], [existing]);
        await page.addProtocol("G");
        expect(await page.toastLines()).toEqual([added(0, "G")]);
        expect(page.success).not.toHaveBeenCalled();
        expect(storedLines()).toEqual([existing]);
    });

    test("new lines are appended only after every conflict is answered @RX-052", async () => {
        const conflicting = aDrug({name: "A", defaultDosing: {doseUnit: "drop"}});
        const existing = aLine(conflicting, {doseUnit: "tablet"});
        const page = await openPage([aProtocol({items: [anItem(conflicting), anItem(aDrug({name: "B"}))]})], [existing]);
        await page.addProtocol();
        expect(await screen.findByText("موجود بالفعل في الروشتة")).toBeInTheDocument();
        expect(summary()).toEqual([["A", null]]);
        expect(screen.queryByText("B", {selector: "p, span, h6"})).not.toBeInTheDocument();
        await page.answer("الإبقاء على الحالي");
        expect(await page.toastLines()).toEqual([added(1), "تم الإبقاء على الجرعة الحالية: 1"]);
        expect(summary()).toEqual([["A", null], ["B", null]]);
    });

    test("a line with no dosing and the group's «بدون عين» only: no conflict, counted as unchanged @RX-106", async () => {
        const drug = aDrug({name: "Tears", description: "قطرة مرطبة"});
        const alone = aLine(drug, {});
        const page = await openPage([aProtocol({items: [anItem(drug, {eye: "none"})]})], [alone]);
        await page.addProtocol();
        expect(await page.toastLines()).toEqual([added(0), "موجود مسبقًا في القائمة: 1"]);
        expect(screen.queryByText("موجود بالفعل في الروشتة")).not.toBeInTheDocument();
        expect(storedLines()).toEqual([alone]);
    });
});
