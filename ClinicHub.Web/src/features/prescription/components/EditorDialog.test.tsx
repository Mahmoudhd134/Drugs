import {describe, expect, test, vi} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {aDrug, aLine, renderWithProviders} from "../../../test";
import {EditorDialog} from "./EditorDialog.tsx";

// The "Edit & copy" editor: docs/features/prescription/business.md "النسخ" (عريض، مائل، تسطير، قوائم مرقمة أو نقطية،
// اتجاه ومحاذاة) and tech.md "Page & components" (EditorDialog + EditorContent: Quill, loaded on first open).

describe("the Edit & copy editor @area:prescription", () => {
    test("its toolbar: bold, italic, underline, numbered and bulleted lists, direction, alignment, clear formatting @RX-076", async () => {
        await renderWithProviders(<EditorDialog open lines={[aLine(aDrug({name: "Tobradex"}), {doseUnit: "drop"})]} onClose={vi.fn()}/>, {lang: "ar"});
        expect(await screen.findByText("تعديل قبل النسخ")).toBeInTheDocument();
        const toolbar = await waitFor(() => {
            const found = document.querySelector(".ql-toolbar");
            if (!found) throw new Error("No toolbar yet");
            return found;
        });
        for (const selector of [
            "button.ql-bold", "button.ql-italic", "button.ql-underline",
            "button.ql-list[value=ordered]", "button.ql-list[value=bullet]",
            "button.ql-direction[value=rtl]", ".ql-align", "button.ql-clean",
        ]) expect(toolbar.querySelector(selector), selector).not.toBeNull();
        expect(toolbar.querySelectorAll(".ql-align .ql-picker-item")).toHaveLength(4);
    });
});
