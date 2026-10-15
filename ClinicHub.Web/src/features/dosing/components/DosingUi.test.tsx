import {describe, expect, test, vi} from "vitest";
import {act, screen, waitFor} from "@testing-library/react";
import {renderWithProviders} from "../../../test";
import type {Dosing, TaperStep} from "../types.ts";
import {DosingFields} from "./DosingFields.tsx";
import {TaperGenerator} from "./TaperGenerator.tsx";
import {TaperStepsEditor} from "./TaperStepsEditor.tsx";
import {patientWaits} from "../../../test/fe-access/patience.ts";

// Dosing inputs in the UI language: docs/features/dosing/tech.md "i18n", docs/features/tapering/tech.md "Frontend"
// (generator tooltips), docs/tech/overview.md "Code conventions" (icon-only buttons).

patientWaits();

const step = (frequencyValue: number): TaperStep => ({frequency: "daily", frequencyValue, durationValue: 1, durationUnit: "weeks"});

describe("dosing labels and sentence @area:i18n", () => {
    // DOSE-034's dosing: «نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين»
    const dosing: Dosing = {doseAmount: 2, doseUnit: "drop", eye: "left", frequency: "daily", frequencyValue: 6, durationUnit: "weeks", durationValue: 2};
    const sentence = "نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين";

    test("in English the options read Drop / Left while the generated sentence stays Arabic @I18N-020 @smoke", async () => {
        await renderWithProviders(<DosingFields value={dosing} onChange={vi.fn()}/>, {lang: "en"});
        expect(screen.getByRole("combobox", {name: "Unit"})).toHaveTextContent("Drop");
        expect(screen.getByRole("button", {name: "Left"})).toHaveAttribute("aria-pressed", "true");
        const preview = screen.getByText(sentence);
        expect(preview).toHaveAttribute("lang", "ar");
        expect(preview).toHaveAttribute("dir", "rtl");
    });

    test("in Arabic the options read نقطة / اليسرى and the sentence is the same @I18N-020", async () => {
        await renderWithProviders(<DosingFields value={dosing} onChange={vi.fn()}/>, {lang: "ar"});
        expect(screen.getByRole("combobox", {name: "الوحدة"})).toHaveTextContent("نقطة");
        expect(screen.getByRole("button", {name: "اليسرى"})).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByText(sentence)).toBeInTheDocument();
    });
});

describe("taper tooltips and buttons @area:ux", () => {
    test("hovering the generator's fields shows what each one means @UX-015", async () => {
        vi.useFakeTimers({shouldAdvanceTime: true});
        const {user} = await renderWithProviders(<TaperGenerator steps={[step(4)]} onGenerate={vi.fn()}/>, {lang: "ar"});
        await user.click(screen.getByText("إنشاء تلقائي…"));
        const fields: [string, string][] = [
            ["البداية", "عدد المرات في اليوم في المرحلة الأولى"],
            ["التقليل بمقدار", "عدد المرات التي تقل في كل مرحلة"],
            ["حتى", "عدد المرات في اليوم في المرحلة الأخيرة"],
            ["مدة كل مرحلة", "المدة التي تستمر فيها كل مرحلة"],
        ];
        for (const [label, info] of fields) {
            const field = await screen.findByRole("spinbutton", {name: label});
            await user.hover(field);
            await act(() => vi.advanceTimersByTimeAsync(500));
            expect(await screen.findByRole("tooltip")).toHaveTextContent(info);
            await user.unhover(field);
            await act(() => vi.advanceTimersByTimeAsync(500));
            await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
        }
    });

    test("the remove-step ✕ has a tooltip and an accessible name «حذف المرحلة» / \"Remove step\" @UX-012", async () => {
        const {user, unmount} = await renderWithProviders(
            <TaperStepsEditor steps={[step(4), step(2)]} onChange={vi.fn()} errors={[]} doseUnit="drop" lineDose={1}/>, {lang: "ar"});
        const [remove] = screen.getAllByRole("button", {name: "حذف المرحلة"});
        await user.hover(remove.parentElement!);
        expect(await screen.findByRole("tooltip")).toHaveTextContent("حذف المرحلة");
        unmount();

        await renderWithProviders(
            <TaperStepsEditor steps={[step(4), step(2)]} onChange={vi.fn()} errors={[]} doseUnit="drop" lineDose={1}/>, {lang: "en"});
        expect(screen.getAllByRole("button", {name: "Remove step"})).toHaveLength(2);
    });
});
