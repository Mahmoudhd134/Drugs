import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {createAppTheme} from "../../../app/theme.ts";
import {hoverTooltip, optionsOf, renderWithProviders, tapTooltip} from "../../../test";
import type {Dosing, TaperStep} from "../types.ts";
import {DosingHarness} from "../../../test/pages/DosingHarness.tsx";
import {dosingPreview, harnessValue, stepBadges, stepRow} from "../../../test/pages/dosing.ts";

// The tapering steps inside the dosing form: docs/features/tapering/business.md "سيناريوهات", "القواعد", "الرسائل"
// and tech.md "Frontend" (DosingFields switch, TaperStepsEditor, TaperGenerator). Sentences: rxTextAr.ts wording.

const week = {durationUnit: "weeks", durationValue: 1} as const;
const daily = (times: number, rest: Partial<TaperStep> = week): TaperStep => ({frequency: "daily", frequencyValue: times, ...rest});

const renderFields = (initial?: Dosing, lang: "ar" | "en" = "ar") =>
    renderWithProviders(<DosingHarness initial={initial}/>, {lang});

const taperSwitch = () => screen.getByRole("switch", {name: "تقليل تدريجي"});
/** What a step row shows: [frequency, its number, period, its number] ("" for a hidden number). */
const stepValues = (n: number) => {
    const row = within(stepRow(n));
    const [frequency, period] = row.getAllByRole("combobox").map(c => c.textContent);
    const times = row.getByRole("spinbutton", {name: /^(العدد|الساعات)$/}) as HTMLInputElement;
    const duration = row.queryByRole("spinbutton", {name: "المدة"}) as HTMLInputElement | null;
    return [frequency, times.value, period, duration?.value ?? ""];
};
// Its tooltip is its accessible name, so it is found by its text
const generateButton = () => screen.getByText("إنشاء تلقائي…").closest("button")!;
const stepCount = () => stepBadges().length;
/** The step's own dose field (step 1's is hidden on phones only). */
const stepDose = (n: number) => within(stepRow(n)).getByRole("spinbutton", {name: "الجرعة"});

describe("tapering: switching on and off @area:catalog", () => {
    test("daily 4 for 1 week + the switch: two steps (4 then 3 times a day, 1 week each) replace frequency and period @TAPER-064 @smoke", async () => {
        const {user} = await renderFields({frequency: "daily", frequencyValue: 4, ...week});
        expect(stepCount()).toBe(0);
        await user.click(taperSwitch());
        expect(stepCount()).toBe(2);
        expect(stepValues(1)).toEqual(["مرات في اليوم", "4", "أسابيع", "1"]);
        expect(stepValues(2)).toEqual(["مرات في اليوم", "3", "أسابيع", "1"]);
        // The frequency and period rows are gone: only the steps' own selects remain
        expect(screen.getAllByRole("combobox", {name: "عدد المرات"})).toHaveLength(2);
        expect(screen.getAllByRole("combobox", {name: "الفترة"})).toHaveLength(2);
        expect(dosingPreview()).toHaveTextContent(/^4 مرات يوميًا لمدة أسبوع، ثم 3 مرات يوميًا لمدة أسبوع، ثم يتوقف$/);
    });

    test("switching off: step 1 becomes the normal frequency and period @TAPER-065", async () => {
        const {user} = await renderFields({doseUnit: "drop", taperSteps: [daily(3, {durationUnit: "weeks", durationValue: 2}), daily(2)]});
        expect(taperSwitch()).toBeChecked();
        await user.click(taperSwitch());
        expect(stepCount()).toBe(0);
        expect(screen.getByRole("combobox", {name: "عدد المرات"})).toHaveTextContent("مرات في اليوم");
        expect(screen.getByRole("spinbutton", {name: "العدد"})).toHaveValue(3);
        expect(screen.getByRole("combobox", {name: "الفترة"})).toHaveTextContent("أسابيع");
        expect(screen.getByRole("spinbutton", {name: "المدة"})).toHaveValue(2);
        expect(harnessValue()).toMatchObject({taperSteps: null, frequency: "daily", frequencyValue: 3, durationUnit: "weeks", durationValue: 2});
        expect(dosingPreview()).toHaveTextContent(/^نقطة واحدة 3 مرات يوميًا لمدة أسبوعين$/);
    });
});

describe("tapering: the steps editor @area:catalog", () => {
    test("only the last step offers the open-ended periods; steps offer times a day / every N hours only @TAPER-069", async () => {
        const {user} = await renderFields({taperSteps: [daily(4), daily(3), daily(2)]});
        for (const n of [1, 2]) {
            const [, period] = within(stepRow(n)).getAllByRole("combobox");
            expect(await optionsOf(user, period)).toEqual(["أيام", "أسابيع"]);
        }
        const [frequency, lastPeriod] = within(stepRow(3)).getAllByRole("combobox");
        expect(await optionsOf(user, lastPeriod)).toEqual(["أيام", "أسابيع", "بصفة مستمرة", "حتى الزيارة القادمة"]);
        expect(await optionsOf(user, frequency)).toEqual(["مرات في اليوم", "كل عدد ساعات"]);
    });

    test("9 steps + «إضافة مرحلة»: 10 steps, the button disabled with «أقصى عدد للمراحل: 10» @TAPER-066", async () => {
        const steps = [9, 9, 8, 7, 6, 5, 4, 3, 2].map(times => daily(times));
        const {user} = await renderFields({taperSteps: steps});
        const add = screen.getByRole("button", {name: "إضافة مرحلة"});
        expect(add).toBeEnabled();
        await user.click(add);
        expect(stepCount()).toBe(10);
        expect(add).toBeDisabled();
        expect(await hoverTooltip(add)).toBe("أقصى عدد للمراحل: 10");
    });

    test("a quick tap on the disabled «إضافة مرحلة» (phone) shows «أقصى عدد للمراحل: 10» at once @TAPER-066", async () => {
        await renderFields({taperSteps: [10, 9, 9, 8, 7, 6, 5, 4, 3, 2].map(times => daily(times))});
        const add = screen.getByRole("button", {name: "إضافة مرحلة"});
        expect(add).toBeDisabled();
        expect(await tapTooltip(add)).toBe("أقصى عدد للمراحل: 10");
    });

    test("hovering an enabled «إضافة مرحلة» explains it @TAPER-067", async () => {
        await renderFields({taperSteps: [daily(4), daily(3)]});
        expect(await hoverTooltip(screen.getByRole("button", {name: "إضافة مرحلة"})))
            .toBe("تضيف مرحلة في النهاية بمرة أقل في اليوم. يمكنك تعديلها بعد ذلك.");
    });

    test("a step's ✕ «حذف المرحلة» removes it; with one step left the ✕ is disabled @TAPER-068", async () => {
        const {user} = await renderFields({taperSteps: [daily(4), daily(3), daily(2)]});
        await user.click(within(stepRow(2)).getByRole("button", {name: "حذف المرحلة"}));
        expect(stepCount()).toBe(2);
        expect(stepValues(1)[1]).toBe("4");
        expect(stepValues(2)[1]).toBe("2");
        await user.click(within(stepRow(2)).getByRole("button", {name: "حذف المرحلة"}));
        expect(stepCount()).toBe(1);
        expect(within(stepRow(1)).getByRole("button", {name: "حذف المرحلة"})).toBeDisabled();
    });

    test("no fixed duration yet: no total chip @TAPER-050", async () => {
        await renderFields({taperSteps: [daily(4, {}), daily(3, {durationUnit: "continuous"})]});
        expect(stepCount()).toBe(2);
        expect(screen.queryByText(/المدة الإجمالية/)).not.toBeInTheDocument();
    });

    test("an open-ended step that is not last: its value stays visible with the hint under the steps @TAPER-070", async () => {
        await renderFields({taperSteps: [daily(4, {durationUnit: "continuous"}), daily(3)]});
        expect(within(stepRow(1)).getAllByRole("combobox")[1]).toHaveTextContent("بصفة مستمرة");
        const hint = screen.getByText("المرحلة الأخيرة فقط يمكن أن تكون «بصفة مستمرة» أو «حتى الزيارة القادمة».");
        expect(hint).toHaveStyle({color: createAppTheme("rtl").palette.error.main});
    });
});

describe("tapering: step doses @area:catalog", () => {
    test("with a unit and a dose above, step 1's dose is locked to it with «المرحلة الأولى تأخذ الجرعة المكتوبة بالأعلى.» @TAPER-072", async () => {
        await renderFields({doseAmount: 2, doseUnit: "drop", taperSteps: [daily(4), daily(3)]});
        const first = stepDose(1);
        expect(first).toBeDisabled();
        expect(first).toHaveValue(2);
        expect(await hoverTooltip(first)).toBe("المرحلة الأولى تأخذ الجرعة المكتوبة بالأعلى.");
    });

    test("without a unit above, the step doses are disabled with «اختر الوحدة بالأعلى لتحديد جرعة خاصة لكل مرحلة.» @TAPER-073", async () => {
        await renderFields({taperSteps: [daily(4), daily(3), daily(2)]});
        for (const n of [2, 3]) expect(stepDose(n)).toBeDisabled();
        expect(await hoverTooltip(stepDose(2))).toBe("اختر الوحدة بالأعلى لتحديد جرعة خاصة لكل مرحلة.");
    });

    test("a quick tap on a disabled step dose (phone) shows «اختر الوحدة بالأعلى لتحديد جرعة خاصة لكل مرحلة.» at once @TAPER-073", async () => {
        await renderFields({taperSteps: [daily(4), daily(3)]});
        expect(stepDose(2)).toBeDisabled();
        expect(await tapTooltip(stepDose(2))).toBe("اختر الوحدة بالأعلى لتحديد جرعة خاصة لكل مرحلة.");
    });

    test("with a unit, steps 2+ take a dose: placeholder = the dose above (or 1) and the «جرعة هذه المرحلة…» tooltip @TAPER-074", async () => {
        const {unmount} = await renderFields({doseAmount: 2, doseUnit: "drop", taperSteps: [daily(4), daily(3), daily(2)]});
        for (const n of [2, 3]) {
            expect(stepDose(n)).toBeEnabled();
            expect(stepDose(n)).toHaveAttribute("placeholder", "2");
        }
        expect(await hoverTooltip(stepDose(2)))
            .toBe("جرعة هذه المرحلة بنفس الوحدة المختارة بالأعلى. اتركها فارغة لتبقى الجرعة كما بالأعلى.");
        unmount();
        await renderFields({doseUnit: "tablet", taperSteps: [daily(4), daily(3)]});
        expect(stepDose(2)).toHaveAttribute("placeholder", "1");
    });

    test("a step dose typed (step 2 = 1 drop) shows in the preview @TAPER-075", async () => {
        const {user} = await renderFields({doseAmount: 2, doseUnit: "drop", frequency: "daily", frequencyValue: 4, ...week});
        await user.click(taperSwitch());
        await user.type(stepDose(2), "1");
        expect(dosingPreview())
            .toHaveTextContent(/^نقطتين 4 مرات يوميًا لمدة أسبوع، ثم نقطة واحدة 3 مرات يوميًا لمدة أسبوع، ثم يتوقف$/);
    });
});

describe("tapering: the generator @area:catalog", () => {
    const openGenerator = async (initial: Dosing) => {
        const rendered = await renderFields(initial);
        await rendered.user.click(generateButton());
        const popover = within(await screen.findByRole("presentation"));
        const field = (name: string) => popover.getByRole("spinbutton", {name});
        const setField = async (name: string, text: string) => {
            await rendered.user.clear(field(name));
            await rendered.user.type(field(name), text);
        };
        return {...rendered, popover, field, setField};
    };

    test("opened: pre-filled from step 1 (start, reduce 1, down to 1, each = its period) with the replace warning @TAPER-059", async () => {
        const {popover, field} = await openGenerator({taperSteps: [daily(6, {durationUnit: "days", durationValue: 3}), daily(5, {durationUnit: "days", durationValue: 3})]});
        expect(field("البداية")).toHaveValue(6);
        expect(field("التقليل بمقدار")).toHaveValue(1);
        expect(field("حتى")).toHaveValue(1);
        expect(field("مدة كل مرحلة")).toHaveValue(3);
        expect(popover.getByRole("combobox", {name: "الفترة"})).toHaveTextContent("أيام");
        expect(popover.getByText("سيتم استبدال المراحل الحالية. يمكنك تعديل كل مرحلة بعد ذلك.")).toBeInTheDocument();
    });

    test("a valid plan shows «عدد المراحل: N»; «إنشاء» replaces the steps and closes it @TAPER-060", async () => {
        const {user, popover, setField} = await openGenerator({taperSteps: [daily(4), daily(3)]});
        await setField("البداية", "6");
        await setField("التقليل بمقدار", "2");
        expect(popover.getByText("عدد المراحل: 4")).toBeInTheDocument();
        await user.click(popover.getByRole("button", {name: "إنشاء"}));
        await waitFor(() => expect(screen.queryByRole("presentation")).not.toBeInTheDocument());
        expect(stepCount()).toBe(4);
        expect([1, 2, 3, 4].map(n => stepValues(n))).toEqual([
            ["مرات في اليوم", "6", "أسابيع", "1"],
            ["مرات في اليوم", "4", "أسابيع", "1"],
            ["مرات في اليوم", "2", "أسابيع", "1"],
            ["مرات في اليوم", "1", "أسابيع", "1"],
        ]);
    });

    test("an invalid plan: «راجع الأرقام. أقصى عدد للمراحل 10.» in red and «إنشاء» disabled @TAPER-061", async () => {
        const {popover, setField} = await openGenerator({taperSteps: [daily(4), daily(3)]});
        await setField("البداية", "11");
        const message = popover.getByText("راجع الأرقام. أقصى عدد للمراحل 10.");
        expect(message).toHaveStyle({color: createAppTheme("rtl").palette.error.main});
        expect(popover.getByRole("button", {name: "إنشاء"})).toBeDisabled();
    });

    test("«إلغاء» or a click outside leaves the steps unchanged @TAPER-062", async () => {
        const steps = [daily(4), daily(3)];
        const {user, popover, setField} = await openGenerator({taperSteps: steps});
        await setField("البداية", "8");
        await user.click(popover.getByRole("button", {name: "إلغاء"}));
        await waitFor(() => expect(screen.queryByRole("presentation")).not.toBeInTheDocument());
        expect(harnessValue().taperSteps).toEqual(steps);

        await user.click(generateButton());
        const again = within(await screen.findByRole("presentation"));
        await user.clear(again.getByRole("spinbutton", {name: "البداية"}));
        await user.type(again.getByRole("spinbutton", {name: "البداية"}), "8");
        // The popover's backdrop: a click outside it
        await user.click(document.querySelector(".MuiBackdrop-root")!);
        await waitFor(() => expect(screen.queryByRole("presentation")).not.toBeInTheDocument());
        expect(harnessValue().taperSteps).toEqual(steps);
        expect(stepCount()).toBe(2);
    });
});

describe("tapering: the English UI @area:catalog", () => {
    const englishStep = (n: number) => stepRow(n, `Step ${n}`);

    test("the generator in English: the warning, \"Steps: N\" and \"Check the numbers…\" @TAPER-059 @TAPER-060 @TAPER-061", async () => {
        const {user} = await renderFields({taperSteps: [daily(4), daily(3)]}, "en");
        await user.click(screen.getByText("Generate…").closest("button")!);
        const popover = within(await screen.findByRole("presentation"));
        expect(popover.getByText("Replaces the current steps. You can still edit each step after.")).toBeInTheDocument();
        expect(popover.getByText("Steps: 4")).toBeInTheDocument();
        await user.clear(popover.getByRole("spinbutton", {name: "Start"}));
        await user.type(popover.getByRole("spinbutton", {name: "Start"}), "11");
        expect(popover.getByText("Check the numbers. A schedule can have up to 10 steps.")).toBeInTheDocument();
        expect(popover.getByRole("button", {name: "Generate"})).toBeDisabled();
    });

    test("\"Add step\" tooltips in English: \"Adds a step…\" and \"Maximum steps: 10\" @TAPER-066 @TAPER-067", async () => {
        const {unmount} = await renderFields({taperSteps: [daily(4), daily(3)]}, "en");
        expect(await hoverTooltip(screen.getByRole("button", {name: "Add step"})))
            .toBe("Adds a step at the end with one time a day less. You can change it after.");
        unmount();
        await renderFields({taperSteps: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(times => daily(times))}, "en");
        const add = screen.getByRole("button", {name: "Add step"});
        expect(add).toBeDisabled();
        expect(await hoverTooltip(add)).toBe("Maximum steps: 10");
    });

    test("the open-ended hint in English: \"Only the last step can be…\" @TAPER-070", async () => {
        await renderFields({taperSteps: [daily(4, {durationUnit: "untilNextVisit"}), daily(3)]}, "en");
        expect(screen.getByText("Only the last step can be \"Continuous\" or \"Until next visit\".")).toBeInTheDocument();
    });

    test("the step dose tooltips in English @TAPER-072 @TAPER-073 @TAPER-074", async () => {
        const {unmount} = await renderFields({doseAmount: 2, doseUnit: "drop", taperSteps: [daily(4), daily(3)]}, "en");
        const dose = (n: number) => within(englishStep(n)).getByRole("spinbutton", {name: "Dose"});
        expect(await hoverTooltip(dose(1))).toBe("The first step uses the dose above.");
        unmount();
        const second = await renderFields({doseAmount: 2, doseUnit: "drop", taperSteps: [daily(4), daily(3)]}, "en");
        expect(await hoverTooltip(dose(2))).toBe("Dose for this step, in the unit above. Leave empty to keep the dose above.");
        second.unmount();
        await renderFields({taperSteps: [daily(4), daily(3)]}, "en");
        expect(await hoverTooltip(dose(2))).toBe("Choose a unit above to give a step its own dose.");
    });
});
