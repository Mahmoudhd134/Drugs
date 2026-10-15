import {describe, expect, test, vi} from "vitest";
import {screen, within} from "@testing-library/react";
import {renderWithProviders} from "../../../test";
import {normalizeDosing, type TaperStep} from "../types.ts";
import {TaperStepsEditor} from "./TaperStepsEditor.tsx";
import {TaperGenerator} from "./TaperGenerator.tsx";

// The total chip and the generator's 1-step plan: docs/features/tapering/business.md + tech.md "Frontend".

const step = (durationValue: number | null, durationUnit: TaperStep["durationUnit"] = "weeks", frequencyValue = 2): TaperStep =>
    ({frequency: "daily", frequencyValue, durationValue, durationUnit});

const renderEditor = (steps: TaperStep[], lang: "ar" | "en" = "ar") =>
    renderWithProviders(<TaperStepsEditor steps={steps} onChange={vi.fn()} errors={[]} doseUnit="drop" lineDose={1}/>, {lang});

describe("TaperStepsEditor: total duration @area:catalog", () => {
    test("1 week + 1 week reads «المدة الإجمالية: أسبوعين» / \"Total: 2 weeks\" @TAPER-046", async () => {
        await renderEditor([step(1), step(1)]);
        expect(screen.getByText("المدة الإجمالية: أسبوعين")).toBeInTheDocument();
    });

    test("1 week + 1 week in English @TAPER-046", async () => {
        await renderEditor([step(1), step(1)], "en");
        expect(screen.getByText("Total: 2 weeks")).toBeInTheDocument();
    });

    test("totals in whole weeks: 7 / 14 / 21 / 77 days @TAPER-047", async () => {
        const cases: [TaperStep[], string][] = [
            [[step(4, "days"), step(3, "days")], "المدة الإجمالية: أسبوع"],
            [[step(7, "days"), step(1, "weeks")], "المدة الإجمالية: أسبوعين"],
            [[step(2, "weeks"), step(1, "weeks")], "المدة الإجمالية: 3 أسابيع"],
            [[step(10, "weeks"), step(7, "days")], "المدة الإجمالية: 11 أسبوعًا"],
        ];
        for (const [steps, text] of cases) {
            const {unmount} = await renderEditor(steps);
            expect(screen.getByText(text)).toBeInTheDocument();
            unmount();
        }
    });

    test("totals in days: 10 days, and 1 / 2 / 15 / 100 days @TAPER-048", async () => {
        const cases: [TaperStep[], string][] = [
            [[step(1, "weeks"), step(3, "days")], "المدة الإجمالية: 10 أيام"],
            [[step(null, "weeks"), step(1, "days")], "المدة الإجمالية: يوم واحد"],
            [[step(1, "days"), step(1, "days")], "المدة الإجمالية: يومين"],
            [[step(1, "weeks"), step(8, "days")], "المدة الإجمالية: 15 يومًا"],
            [[step(50, "days"), step(50, "days")], "المدة الإجمالية: 100 يوم"],
        ];
        for (const [steps, text] of cases) {
            const {unmount} = await renderEditor(steps);
            expect(screen.getByText(text)).toBeInTheDocument();
            unmount();
        }
    });

    test("2 weeks then continuous reads «…أسبوعين، ثم بصفة مستمرة» / \"Total: 2 weeks, then: Continuous\" @TAPER-049", async () => {
        const steps = [step(1), step(1), step(null, "continuous")];
        const {unmount} = await renderEditor(steps);
        expect(screen.getByText("المدة الإجمالية: أسبوعين، ثم بصفة مستمرة")).toBeInTheDocument();
        unmount();
        await renderEditor(steps, "en");
        expect(screen.getByText("Total: 2 weeks, then: Continuous")).toBeInTheDocument();
    });
});

describe("TaperGenerator: a one-step plan @area:catalog", () => {
    test("start = down to gives one step, «إنشاء» enabled, saved as a plain dosing @TAPER-058", async () => {
        const onGenerate = vi.fn();
        const {user} = await renderWithProviders(<TaperGenerator steps={[step(1, "weeks", 4)]} onGenerate={onGenerate}/>, {lang: "ar"});
        await user.click(screen.getByText("إنشاء تلقائي…"));
        const popover = screen.getByRole("presentation");
        const start = within(popover).getByRole("spinbutton", {name: "البداية"});
        const downTo = within(popover).getByRole("spinbutton", {name: "حتى"});
        await user.clear(start);
        await user.type(start, "2");
        await user.clear(downTo);
        await user.type(downTo, "2");

        expect(within(popover).getByText("عدد المراحل: 1")).toBeInTheDocument();
        const create = within(popover).getByRole("button", {name: "إنشاء"});
        expect(create).toBeEnabled();
        await user.click(create);

        const generated: TaperStep[] = onGenerate.mock.calls[0][0];
        expect(generated).toEqual([{frequency: "daily", frequencyValue: 2, durationValue: 1, durationUnit: "weeks"}]);
        expect(normalizeDosing({doseUnit: "drop", taperSteps: generated}))
            .toMatchObject({taperSteps: null, frequency: "daily", frequencyValue: 2, durationUnit: "weeks", durationValue: 1});
    });
});
