import {describe, expect, test, vi} from "vitest";
import {screen} from "@testing-library/react";
import {renderWithProviders} from "../../../test";
import {DeleteClinicDialog} from "./DeleteClinicDialog.tsx";

// The typed name: docs/features/platform-admin/tech.md "Frontend" (/admin/clinics/:id Overview, Delete): both sides
// compared as typable text (NFC, invisible format characters removed, white space runs as one space, trimmed; case kept).

const renderDialog = (clinicName: string) => {
    const onConfirm = vi.fn();
    return renderWithProviders(
        <DeleteClinicDialog open clinicName={clinicName} pending={false} onConfirm={onConfirm} onClose={vi.fn()}/>,
    ).then(rendered => ({...rendered, onConfirm}));
};

const typeName = async (user: Awaited<ReturnType<typeof renderDialog>>["user"], text: string) => {
    const input = screen.getByRole("textbox", {name: "Clinic name"});
    await user.clear(input);
    if (text) await user.type(input, text);
};

const deleteButton = () => screen.getByRole("button", {name: "Delete clinic"});

describe("delete clinic: the typed name @area:admin", () => {
    test("white space runs, trailing spaces and invisible format characters are ignored; case is not @ADM-131", async () => {
        const {user, onConfirm} = await renderDialog("Two  spaces\u200bzw");
        expect(deleteButton()).toBeDisabled();

        await typeName(user, "Two   spaceszw ");
        expect(deleteButton()).toBeEnabled();
        await user.click(deleteButton());
        expect(onConfirm).toHaveBeenCalledTimes(1);

        await typeName(user, "two spaceszw");
        expect(deleteButton()).toBeDisabled();
        await typeName(user, "Two spaces");
        expect(deleteButton()).toBeDisabled();
        await typeName(user, "   ");
        expect(deleteButton()).toBeDisabled();
    });

    test("a name stored in NFC and typed in NFD (decomposed accents) matches @ADM-132", async () => {
        const stored = "Clinique Médicale".normalize("NFC");
        const typed = stored.normalize("NFD");
        expect(typed).not.toBe(stored);
        const {user} = await renderDialog(stored);
        await typeName(user, typed);
        expect(deleteButton()).toBeEnabled();
    });

    test("Arabic names with an invisible mark typed without it", async () => {
        const {user} = await renderDialog("عيادة\u200f النور");
        await typeName(user, "عيادة النور");
        expect(deleteButton()).toBeEnabled();
    });
});
