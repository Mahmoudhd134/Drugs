import type {ReactElement} from "react";
import {describe, expect, test, vi} from "vitest";
import {screen, within} from "@testing-library/react";
import {aDrug, aLine, renderWithProviders} from "../../../test";
import {DrugFormDialog} from "../../drugs/components/DrugFormDialog.tsx";
import {GroupItemDialog} from "../../drugGroups/components/GroupItemDialog.tsx";
import {newItemKey} from "../../drugGroups/editorItem.ts";
import {LineEditDialog} from "../../prescription/components/LineEditDialog.tsx";

// The three dosing dialogs (drug default, group line, prescription line): docs/features/tapering/business.md
// "سيناريوهات" (the switch in every dosing dialog) and docs/features/drug-groups/tech.md "Data model" («تُحدد عند
// الإضافة» only on group lines).

const drug = () => aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop"}});
const dialogs: [string, () => ReactElement][] = [
    ["drug", () => <DrugFormDialog open drug={drug()} onClose={vi.fn()}/>],
    ["group line", () => <GroupItemDialog item={{key: newItemKey(), drug: drug(), dosing: {}}} onClose={vi.fn()} onSave={vi.fn(() => true)}/>],
    ["prescription line", () => <LineEditDialog line={aLine(drug())} onClose={vi.fn()} onSave={vi.fn(() => true)}/>],
];

const eyeChoices = () => within(screen.getByText("العين").nextElementSibling as HTMLElement).getAllByRole("button").map(b => b.textContent);

describe("the dosing dialogs @area:catalog", () => {
    test("every dosing dialog shows the «تقليل تدريجي» switch with its ⓘ «تقليل الجرعة على مراحل، …» @TAPER-063", async () => {
        for (const [name, dialog] of dialogs) {
            const {unmount} = await renderWithProviders(dialog(), {lang: "ar"});
            expect(screen.getByRole("switch", {name: "تقليل تدريجي"}), name).toBeInTheDocument();
            expect(screen.getByRole("img", {name: "تقليل الجرعة على مراحل، مثلًا 4 مرات يوميًا لمدة أسبوع، ثم 3 مرات يوميًا لمدة أسبوع، وهكذا."}), name)
                .toBeInTheDocument();
            unmount();
        }
    });

    test("in English the switch reads \"Tapering schedule\" with its explanation @TAPER-063", async () => {
        await renderWithProviders(dialogs[0][1](), {lang: "en"});
        expect(screen.getByRole("switch", {name: "Tapering schedule"})).toBeInTheDocument();
        expect(screen.getByRole("img", {name: "Reduce the dose step by step, e.g. 4 times a day for a week, then 3 times a day for a week, and so on."}))
            .toBeInTheDocument();
    });

    test("the drug dialog and the prescription line dialog don't offer «تُحدد عند الإضافة» @GRP-080", async () => {
        for (const [name, dialog] of [dialogs[0], dialogs[2]]) {
            const {unmount} = await renderWithProviders(dialog(), {lang: "ar"});
            expect(eyeChoices(), name).toEqual(["اليمنى", "اليسرى", "العينين", "بدون عين"]);
            expect(screen.queryByText("تُحدد عند الإضافة"), name).not.toBeInTheDocument();
            unmount();
        }
        // The group line dialog does
        await renderWithProviders(dialogs[1][1](), {lang: "ar"});
        expect(eyeChoices()).toContain("تُحدد عند الإضافة");
    });
});
