import {describe, expect, test, vi} from "vitest";
import {screen} from "@testing-library/react";
import {aDrug, aLine, fillIn, renderWithProviders} from "../../../test";
import {LineEditDialog} from "./LineEditDialog.tsx";

// The line's note: docs/features/prescription/tech.md "Page & components" (LineEditDialog).

describe("line dialog: the note @area:prescription", () => {
    test("a note is saved trimmed; a note of only spaces is removed @RX-056", async () => {
        const line = aLine(aDrug({name: "Tobradex"}), {doseUnit: "drop"}, "old");
        for (const [typed, saved] of [["  رج الزجاجة قبل الاستعمال  ", "رج الزجاجة قبل الاستعمال"], ["    ", ""]] as const) {
            const onSave = vi.fn(() => true);
            const onClose = vi.fn();
            const {user, unmount} = await renderWithProviders(<LineEditDialog line={line} onClose={onClose} onSave={onSave}/>);
            const note = screen.getByRole("textbox", {name: "Note for this prescription"});
            // Pasted: typing it key by key is slow, and the keystrokes are not what this case is about
            await fillIn(user, note, typed);
            await user.click(screen.getByRole("button", {name: "Save"}));
            expect(onSave).toHaveBeenCalledWith(line.key, {dosing: expect.objectContaining({doseUnit: "drop"}), note: saved});
            expect(onClose).toHaveBeenCalled();
            unmount();
        }
    });
});
