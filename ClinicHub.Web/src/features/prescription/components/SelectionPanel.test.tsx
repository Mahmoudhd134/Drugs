import {describe, expect, test, vi} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {aDrug, aLine, renderWithProviders} from "../../../test";
import type {PrescriptionLine} from "../types.ts";
import {SelectionPanel} from "./SelectionPanel.tsx";
import {patientWaits} from "../../../test/fe-access/patience.ts";

// The selected lines' panel: tooltips (docs/features/tapering/tech.md "Frontend", docs/tech/overview.md
// "Code conventions": every icon-only button has a tooltip and an aria-label).

patientWaits();

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
        const {user} = await openPanel([aLine(aDrug({name: "Tobradex"}))]);
        await user.hover(screen.getByRole("button", {name: "نسخ"}));
        expect(await screen.findByRole("tooltip")).toHaveTextContent("نسخ الروشتة كما هي. اللصق في Word يحتفظ بالتنسيق.");
        await user.unhover(screen.getByRole("button", {name: "نسخ"}));
        await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

        await user.hover(screen.getByRole("button", {name: "تعديل ونسخ"}));
        expect(await screen.findByRole("tooltip")).toHaveTextContent("تعديل النص أولًا (عريض، قوائم، محاذاة) ثم نسخه.");
    });

    test("with an empty list the buttons are disabled and show no tooltip @UX-014", async () => {
        const {user} = await openPanel([]);
        for (const name of ["نسخ", "تعديل ونسخ"]) {
            const button = screen.getByRole("button", {name});
            expect(button).toBeDisabled();
            await user.hover(button.parentElement!);
        }
        // Give a tooltip time to open (MUI waits 100 ms)
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
});

describe("line icon buttons @area:ux", () => {
    test("edit ✎, other eye ⊕, remove ✕ and the drag handle each have a tooltip and an accessible name (ar, en) @UX-012", async () => {
        const line = aLine(aDrug({name: "Tobradex", defaultDosing: {eye: "right"}}));
        const {user, unmount} = await openPanel([line]);
        for (const name of ["تعديل الجرعة", "إضافة للعين الأخرى", "إزالة", "اسحب لتغيير الترتيب"]) {
            const button = screen.getByRole("button", {name});
            await user.hover(button);
            expect(await screen.findByRole("tooltip")).toHaveTextContent(name);
            await user.unhover(button);
            await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
        }
        unmount();

        await openPanel([line], "en");
        for (const name of ["Edit dosing", "Add for the other eye", "Remove", "Drag to reorder"])
            expect(screen.getByRole("button", {name})).toBeInTheDocument();
    });
});
