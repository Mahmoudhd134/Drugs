import {describe, expect, test, vi} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {aDrug, aLine, renderWithProviders} from "../../test";
import {LineEditDialog} from "../../features/prescription/components/LineEditDialog.tsx";
import {ProtocolItemDialog} from "../../features/protocols/components/ProtocolItemDialog.tsx";

// Dialogs and Esc: docs/tech/overview.md "Shared components" (dialogs close without saving). The drug dialog's Esc is in
// DrugsPage.crossCutting.test.tsx.


describe("Esc in the line dialogs @area:ux", () => {
    test("the prescription line dialog closes without saving @UX-023", async () => {
        const onSave = vi.fn(() => true);
        const onClose = vi.fn();
        const line = aLine(aDrug({name: "Tobradex"}), {doseUnit: "drop"});
        const {user} = await renderWithProviders(<LineEditDialog line={line} onClose={onClose} onSave={onSave}/>, {lang: "ar"});
        const dialog = await screen.findByRole("dialog");
        await user.click(screen.getByRole("textbox", {name: /ملاحظة/}));
        await user.paste("changed");
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();
    });

    test("the protocol line dialog closes without saving @UX-023", async () => {
        const onSave = vi.fn(() => true);
        const onClose = vi.fn();
        const item = {key: "k1", drug: aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}}), dosing: {}};
        const {user} = await renderWithProviders(<ProtocolItemDialog item={item} onClose={onClose} onSave={onSave}/>, {lang: "ar"});
        const dialog = await screen.findByRole("dialog");
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();
    });
});
