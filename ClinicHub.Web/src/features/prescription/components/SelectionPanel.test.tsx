import {describe, expect, test, vi} from "vitest";
import {screen} from "@testing-library/react";
import {
    aDrug,
    aLine,
    ARABIC_DRUG_NAME,
    aSharedDrug,
    DIGITS_FIRST_NAME,
    expectOwnDirection,
    hoverPastDelay,
    hoverTooltip,
    leaveTooltip,
    renderWithProviders,
} from "../../../test";
import type {PrescriptionLine} from "../types.ts";
import {SelectionPanel} from "./SelectionPanel.tsx";

// The selected lines' panel: tooltips (docs/features/tapering/tech.md "Frontend", docs/tech/overview.md
// "Code conventions": every icon-only button has a tooltip and an aria-label).

const openPanel = (lines: PrescriptionLine[], lang: "ar" | "en" = "ar") => renderWithProviders(
    <SelectionPanel
        lines={lines}
        onReorder={vi.fn()}
        onEditLine={vi.fn()}
        onRemove={vi.fn()}
        canAddOtherEye={() => true}
        onAddOtherEye={vi.fn()}
        onClear={vi.fn()}
        onEdit={vi.fn()}
        onQuickCopy={vi.fn()}
    />,
    {lang},
);

describe("prescription copy buttons @area:ux", () => {
    test("with lines, hovering «نسخ» / «تعديل ونسخ» shows their explanation @UX-014", async () => {
        await openPanel([aLine(aDrug({name: "Tobradex"}))]);
        expect(await hoverTooltip(screen.getByRole("button", {name: "نسخ"}))).toBe("نسخ الروشتة كما هي. اللصق في Word يحتفظ بالتنسيق.");
        await leaveTooltip(screen.getByRole("button", {name: "نسخ"}));

        expect(await hoverTooltip(screen.getByRole("button", {name: "تعديل ونسخ"}))).toBe("تعديل النص أولًا (عريض، قوائم، محاذاة) ثم نسخه.");
    });

    test("with an empty list the buttons are disabled and show no tooltip @UX-014", async () => {
        await openPanel([]);
        for (const name of ["نسخ", "تعديل ونسخ"]) {
            const button = screen.getByRole("button", {name});
            expect(button).toBeDisabled();
            // Past MUI's enter delay: a tooltip would be open by now
            hoverPastDelay(button.parentElement!);
            expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
        }
    });
});

describe("line icon buttons @area:ux", () => {
    test("edit ✎, other eye ⊕, remove ✕ and the drag handle each have a tooltip and an accessible name (ar, en) @UX-012", async () => {
        const line = aLine(aDrug({name: "Tobradex", defaultDosing: {eye: "right"}}));
        const {unmount} = await openPanel([line]);
        for (const name of ["تعديل الجرعة", "إضافة للعين الأخرى", "إزالة", "اسحب لتغيير الترتيب"]) {
            const button = screen.getByRole("button", {name});
            expect(await hoverTooltip(button)).toBe(name);
            await leaveTooltip(button);
        }
        unmount();

        await openPanel([line], "en");
        for (const name of ["Edit dosing", "Add for the other eye", "Remove", "Drag to reorder"])
            expect(screen.getByRole("button", {name})).toBeInTheDocument();
    });
});

describe("prescription lines: each name keeps its own direction @area:i18n", () => {
    test("in Arabic, the lines of «1 2 3 (ONE TWO THREE) 20 F.C.TABS.» and of an Arabic name each isolate the name with its own direction @CAT-233",
        async () => {
            await openPanel([aLine(aSharedDrug({name: DIGITS_FIRST_NAME}), {eye: "right"}), aLine(aDrug({name: ARABIC_DRUG_NAME}))]);
            // Every place the panel shows each name
            expectOwnDirection(document.body, DIGITS_FIRST_NAME);
            expectOwnDirection(document.body, ARABIC_DRUG_NAME);
        });
});
