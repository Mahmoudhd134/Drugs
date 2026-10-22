import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {aDrug, aProtocol, aLine, anItem, clickOutside, expectStillOpen, findToast, isolate, toastTexts} from "../../../test";
import type {Dosing, TaperStep} from "../../dosing/types.ts";
import {openPrescription, storedLines} from "../../../test/pages/prescription.tsx";

// The dialogs of adding a group: docs/features/prescription/business.md "القواعد التشغيلية" (أي عين؟, «جرعتان لنفس
// العين», the conflict question, Esc, a click outside answers nothing) and tech.md "Page & components" (addGroup steps
// 3 and 5, useGroupAddDialogs: each dialog keeps its request rendered until it has faded out; "apply to the remaining";
// a dosing with nothing to write shows «لا توجد جرعة محددة»). Sentences: the catalog's DOSE and TAPER cases.

const added = (count: number, protocol = "Post cataract") => `تمت الإضافة من «${isolate(protocol)}»: ${count}`;
const toastLines = async () => (await findToast()).split("\n");

const week = {durationUnit: "weeks", durationValue: 1} as const;

describe("«جرعتان لنفس العين» (an «ask» line and a line for the chosen eye) @area:prescription", () => {
    const first: Dosing = {eye: "ask", frequency: "daily", frequencyValue: 4};
    const second: Dosing = {eye: "right", frequency: "daily", frequencyValue: 2};

    test("a click outside does nothing; Esc counts as «استخدام الأولى» @RX-032", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}});
        const page = await openPrescription({protocols: [aProtocol({items: [anItem(tobradex, first), anItem(tobradex, second)]})]});
        await page.addProtocol();
        await page.answer("اليمنى");
        const dialog = await screen.findByRole("dialog", {name: "جرعتان لنفس العين"});

        await clickOutside(page.user, dialog);
        // Checked once a closing animation would be over: still asking, nothing added yet
        await expectStillOpen(dialog);
        expect(screen.getByRole("dialog", {name: "جرعتان لنفس العين"})).toBe(dialog);
        expect(toastTexts()).toEqual([]);
        await page.user.keyboard("{Escape}");

        expect(await toastLines()).toEqual([added(1)]);
        expect(storedLines().map(l => [l.dosing.eye, l.dosing.frequencyValue])).toEqual([["right", 4]]);
    });

    test("two such pairs: the first dialog offers «تطبيق على باقي التعارضات: 1»; ticked, the second pair takes the same choice @RX-035", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}});
        const vigamox = aDrug({name: "Vigamox", defaultDosing: {doseUnit: "drop"}});
        const page = await openPrescription({protocols: [aProtocol({items: [
            anItem(tobradex, first), anItem(tobradex, second), anItem(vigamox, first), anItem(vigamox, second),
        ]})]});
        await page.addProtocol();
        await page.answer("اليمنى");
        const dialog = await screen.findByRole("dialog", {name: "جرعتان لنفس العين"});
        await page.user.click(within(dialog).getByRole("checkbox", {name: "تطبيق على باقي التعارضات: 1"}));
        await page.answer("استخدام الثانية");

        expect(await toastLines()).toEqual([added(2)]);
        expect(storedLines().map(l => [l.drug.name, l.dosing.eye, l.dosing.frequencyValue]))
            .toEqual([["Tobradex", "right", 2], ["Vigamox", "right", 2]]);
    });
});

describe("the conflict question @area:prescription", () => {
    const drop4: Dosing = {doseUnit: "drop", frequency: "daily", frequencyValue: 4};

    test("one side with no dosing: its box shows «لا توجد جرعة محددة» @RX-039", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: drop4});
        const page = await openPrescription({protocols: [aProtocol({items: [anItem(tobradex)]})], lines: [aLine(tobradex, {})]});
        await page.addProtocol();
        const dialog = await screen.findByRole("dialog", {name: "موجود بالفعل في الروشتة"});
        const current = within(dialog).getByText("الحالي").parentElement as HTMLElement;
        const incoming = within(dialog).getByText("من المجموعة").parentElement as HTMLElement;
        expect(current).toHaveTextContent("الحاليلا توجد جرعة محددة");
        expect(incoming).toHaveTextContent("نقطة واحدة 4 مرات يوميًا");
    });

    test("a dosing of only «بدون عين»: its box shows «لا توجد جرعة محددة» @RX-105", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: drop4});
        const page = await openPrescription({protocols: [aProtocol({items: [anItem(tobradex)]})], lines: [aLine(tobradex, {eye: "none"})]});
        await page.addProtocol();
        const dialog = await screen.findByRole("dialog", {name: "موجود بالفعل في الروشتة"});
        expect(within(dialog).getByText("الحالي").parentElement).toHaveTextContent("الحاليلا توجد جرعة محددة");
    });

    test("only «بدون عين», in English: \"No dosing set\" @RX-105", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: drop4});
        const page = await openPrescription({protocols: [aProtocol({items: [anItem(tobradex)]})], lines: [aLine(tobradex, {eye: "none"})], lang: "en"});
        await page.addProtocol();
        const dialog = await screen.findByRole("dialog", {name: "Already in the prescription"});
        expect(within(dialog).getByText("Current").parentElement).toHaveTextContent("CurrentNo dosing set");
    });

    test("different taper schedules: both full schedule sentences @RX-040", async () => {
        const protocolSteps: TaperStep[] = [{frequency: "daily", frequencyValue: 4, ...week}, {doseAmount: 1, frequency: "daily", frequencyValue: 3, ...week}];
        const currentSteps: TaperStep[] = [{frequency: "daily", frequencyValue: 4, ...week}, {frequency: "daily", frequencyValue: 3, ...week}];
        const pred = aDrug({name: "Pred Forte", defaultDosing: {doseAmount: 2, doseUnit: "drop", eye: "right", taperSteps: protocolSteps}});
        const page = await openPrescription({
            protocols: [aProtocol({items: [anItem(pred)]})],
            lines: [aLine(pred, {doseAmount: 1, doseUnit: "drop", eye: "right", taperSteps: currentSteps})],
        });
        await page.addProtocol();
        const dialog = await screen.findByRole("dialog", {name: "موجود بالفعل في الروشتة"});
        // TAPER-034 + TAPER-026 (the eye once, the dose once) and TAPER-025
        expect(within(dialog).getByText("نقطة واحدة في العين اليمنى 4 مرات يوميًا لمدة أسبوع، ثم 3 مرات يوميًا لمدة أسبوع، ثم يتوقف"))
            .toBeInTheDocument();
        expect(within(dialog).getByText("نقطتين في العين اليمنى 4 مرات يوميًا لمدة أسبوع، ثم نقطة واحدة 3 مرات يوميًا لمدة أسبوع، ثم يتوقف"))
            .toBeInTheDocument();
    });

    test("a click outside does nothing (the dialog stays); Esc counts as «الإبقاء على الحالي» @RX-043", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: drop4});
        const existing = aLine(tobradex, {doseUnit: "drop", frequency: "bedtime"});
        const page = await openPrescription({protocols: [aProtocol({items: [anItem(tobradex)]})], lines: [existing]});
        await page.addProtocol();
        const dialog = await screen.findByRole("dialog", {name: "موجود بالفعل في الروشتة"});

        await clickOutside(page.user, dialog);
        // Checked once a closing animation would be over: still asking, nothing added yet
        await expectStillOpen(dialog);
        expect(screen.getByRole("dialog", {name: "موجود بالفعل في الروشتة"})).toBe(dialog);
        expect(toastTexts()).toEqual([]);
        await page.user.keyboard("{Escape}");

        expect(await toastLines()).toEqual([added(0), "تم الإبقاء على الجرعة الحالية: 1"]);
        expect(storedLines()).toEqual([existing]);
    });

    test("a single conflict: no «تطبيق على باقي التعارضات» checkbox @RX-048", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: drop4});
        const page = await openPrescription({protocols: [aProtocol({items: [anItem(tobradex), anItem(aDrug({name: "Vigamox"}))]})],
            lines: [aLine(tobradex, {doseUnit: "tablet"})]});
        await page.addProtocol();
        const dialog = await screen.findByRole("dialog", {name: "موجود بالفعل في الروشتة"});
        expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
        expect(within(dialog).queryByText(/تطبيق على باقي التعارضات/)).not.toBeInTheDocument();
    });

    test("ticked on a «جرعتان لنفس العين» dialog: the conflict dialogs that follow start unticked @RX-047", async () => {
        const ask: Dosing = {eye: "ask", frequency: "daily", frequencyValue: 4};
        const right: Dosing = {eye: "right", frequency: "daily", frequencyValue: 2};
        const a = aDrug({name: "A", defaultDosing: {doseUnit: "drop"}});
        const b = aDrug({name: "B", defaultDosing: {doseUnit: "drop"}});
        const c = aDrug({name: "C", defaultDosing: {doseUnit: "tablet", eye: "right"}});
        const d = aDrug({name: "D", defaultDosing: {doseUnit: "tablet", eye: "right"}});
        const e = aDrug({name: "E", defaultDosing: {doseUnit: "tablet", eye: "right"}});
        const page = await openPrescription({
            protocols: [aProtocol({items: [anItem(a, ask), anItem(a, right), anItem(b, ask), anItem(b, right), anItem(c), anItem(d), anItem(e)]})],
            lines: [c, d, e].map(drug => aLine(drug, {doseUnit: "drop", eye: "right"})),
        });
        await page.addProtocol();
        await page.answer("اليمنى");
        const pair = await screen.findByRole("dialog", {name: "جرعتان لنفس العين"});
        await page.user.click(within(pair).getByRole("checkbox", {name: "تطبيق على باقي التعارضات: 1"}));
        await page.answer("استخدام الأولى");

        const conflict = await screen.findByRole("dialog", {name: "موجود بالفعل في الروشتة"});
        await waitFor(() => expect(within(conflict).getByRole("checkbox", {name: "تطبيق على باقي التعارضات: 2"})).not.toBeChecked());
        await page.answer("الإبقاء على الحالي");
        await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("checkbox", {name: "تطبيق على باقي التعارضات: 1"})).not.toBeChecked());
        await page.answer("الإبقاء على الحالي");
        await page.answer("الإبقاء على الحالي");
        expect(await toastLines()).toEqual([added(2), "تم الإبقاء على الجرعة الحالية: 3"]);
    });
});

/**
 * Every text `element` shows from now until it leaves the page (a closing dialog fades out for a moment; on a busy
 * machine it may be gone before the test looks, so each change is recorded as it happens).
 */
const recordTexts = (element: HTMLElement) => {
    const texts = [element.textContent ?? ""];
    const observer = new MutationObserver(() => {
        if (element.isConnected) texts.push(element.textContent ?? "");
    });
    observer.observe(document.body, {childList: true, subtree: true, characterData: true});
    return {texts, stop: () => observer.disconnect()};
};

describe("closing dialogs keep their text @area:prescription", () => {
    test("the eye question and the conflict question keep their own text while they fade out @RX-037", async () => {
        const tobradex = aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop", frequency: "daily", frequencyValue: 4}});
        const vigamox = aDrug({name: "Vigamox", defaultDosing: {doseUnit: "drop"}});
        const page = await openPrescription({
            protocols: [aProtocol({name: "G", items: [anItem(tobradex), anItem(vigamox, {eye: "ask"})]})],
            lines: [aLine(tobradex, {doseUnit: "drop", frequency: "bedtime"})],
        });
        await page.addProtocol("G");
        const eyeDialog = await screen.findByRole("dialog", {name: "أي عين؟"});
        const eyeTexts = recordTexts(eyeDialog);
        await page.user.click(within(eyeDialog).getByRole("button", {name: "اليمنى"}));

        const conflict = await screen.findByRole("dialog", {name: "موجود بالفعل في الروشتة"});
        const conflictTexts = recordTexts(conflict);
        await page.user.click(within(conflict).getByRole("button", {name: "استخدام جرعة المجموعة"}));
        await waitFor(() => expect(screen.queryByRole("dialog", {hidden: true})).not.toBeInTheDocument());
        eyeTexts.stop();
        conflictTexts.stop();

        // From the answer until it was gone: always its own title and message
        for (const text of eyeTexts.texts) {
            expect(text).toContain("أي عين؟");
            expect(text).toContain(`بعض أدوية «${isolate("G")}» تُعطى للعين التي تختارها الآن.`);
        }
        for (const text of conflictTexts.texts) {
            expect(text).toContain("موجود بالفعل في الروشتة");
            expect(text).toContain(`«${isolate("Tobradex")}» موجود بالفعل في القائمة بجرعة مختلفة.`);
            expect(text).toContain("قبل النوم");
            expect(text).toContain("نقطة واحدة 4 مرات يوميًا");
        }
        expect(await toastLines()).toEqual([added(1, "G"), "تم الاستبدال بجرعة المجموعة: 1"]);
    });
});
