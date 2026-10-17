import {useState} from "react";
import {describe, expect, test, vi} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {aDrug, aLine, holdTimers, renderWithProviders} from "../../../test";
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

    test("closed with «إغلاق» and reopened during its closing animation: rebuilt from the current lines, not the closing editor's text @RX-078",
        async () => {
            const first = [aLine(aDrug({name: "Tobradex"}), {doseUnit: "drop"})];
            const current = [aLine(aDrug({name: "Maxitrol"}), {doseUnit: "drop"})];
            const Page = () => {
                const [open, setOpen] = useState(true);
                const [lines, setLines] = useState(first);
                return (
                    <>
                        <button onClick={() => {
                            setLines(current);
                            setOpen(true);
                        }}>تعديل ونسخ</button>
                        <EditorDialog open={open} lines={lines} onClose={() => setOpen(false)}/>
                    </>
                );
            };
            const {user} = await renderWithProviders(<Page/>, {lang: "ar"});
            const editorText = () => document.querySelector(".ql-editor")?.textContent ?? "";
            await waitFor(() => expect(editorText()).toContain("Tobradex"));

            // The closing animation is held (its timers don't run) while the editor is reopened with other lines
            const timers = holdTimers();
            const dialog = screen.getByRole("dialog");
            await user.click(within(dialog).getByRole("button", {name: "إغلاق"}));
            await user.click(screen.getByRole("button", {name: "تعديل ونسخ", hidden: true}));
            expect(screen.getByRole("dialog", {hidden: true}), "the same, still closing dialog").toBe(dialog);
            expect(editorText()).toContain("Maxitrol");
            expect(editorText()).not.toContain("Tobradex");
            await timers.release();
        });
});
