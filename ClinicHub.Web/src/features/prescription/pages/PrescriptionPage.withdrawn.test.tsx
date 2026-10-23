import {describe, expect, test, vi} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import toast from "react-hot-toast";
import {aDrug, aLine, anItem, aProtocol, aSharedDrug, aProtocolDrug, expectToasts, fillIn, findToast, isolate, pastExitTransition, toastTexts} from "../../../test";
import type {Dosing} from "../../dosing/types.ts";
import type {PrescriptionLine} from "../types.ts";
import {openPrescription, storedLines} from "../../../test/pages/prescription.tsx";
import {expectWithdrawnTooltip, WITHDRAWN, withdrawnMark} from "../../../test/pages/withdrawn.ts";

// Withdrawn shared drugs and the prescription (design M1.7 D6, D9; M1.7b contract "Prescription"): adding a protocol
// adds its withdrawn lines like the others (snapshot `withdrawn: true`, the chip on the line), then, when n > 0, a second
// plain toast with a ⚠ icon «أُضيف رغم تعطيله من الإدارة: n» after the unchanged protocol toast. Lines already in the
// prescription are snapshots: they keep their name and have no chip. These component tests also prove the unit level
// of CAT-159 and CAT-161 (the add-protocol logic is only reachable through the page; docs/testing/README.md).

const added = (count: number, protocol = "Post cataract") => `تمت الإضافة من «${isolate(protocol)}»: ${count}`;
const warning = (count: number) => `أُضيف رغم تعطيله من الإدارة: ${count}`;
const summary = () => storedLines().map(l => [l.drug.name, l.dosing.eye ?? null, l.drug.withdrawn === true]);
const drop = (fields: Dosing = {}): Dosing => ({doseAmount: 1, doseUnit: "drop", ...fields});
/** The prescription line of a drug (the `index`-th one; its row in «الأدوية المختارة»: the nearest element around the name holding a drag handle). */
const lineOf = (name: string, index = 0) => {
    const panel = (screen.queryByText("الأدوية المختارة") ?? screen.getByText("Selected drugs")).closest(".MuiPaper-root") as HTMLElement;
    let element: HTMLElement | null = within(panel).getAllByText(name, {exact: true})[index];
    while (element && !element.querySelector('[aria-roledescription="sortable"]')) element = element.parentElement;
    if (!element) throw new Error(`No prescription line of ${name}`);
    return element;
};

describe("adding a protocol with a disabled drug @area:prescription", () => {
    test("a disabled line, an ask line, an identical line and a conflict: each question once, the protocol toast as today, then the ⚠ toast @CAT-159",
        async () => {
            const success = vi.spyOn(toast, "success");
            const withdrawn = aSharedDrug({name: "TOBRADEX EYE SUSP. DROPS 5 ML", withdrawn: true});
            const ask = aDrug({name: "Nevanac", defaultDosing: drop()});
            const same = aDrug({name: "Same", defaultDosing: drop({frequency: "bedtime"})});
            const conflicting = aDrug({name: "Replaced", defaultDosing: drop({frequency: "daily", frequencyValue: 4})});
            const lines: PrescriptionLine[] = [aLine(same), aLine(conflicting, drop({frequency: "daily", frequencyValue: 1}))];
            const protocol = aProtocol({
                items: [anItem(withdrawn, drop({eye: "right"})), anItem(ask, {eye: "ask"}), anItem(same), anItem(conflicting)],
            });
            const page = await openPrescription({protocols: [protocol], lines});
            await page.addProtocol();

            expect(await screen.findByText("أي عين؟")).toBeInTheDocument();
            await page.answer("اليسرى");
            expect(await screen.findByText("موجود بالفعل في الروشتة")).toBeInTheDocument();
            await page.answer("استخدام جرعة البروتوكول");

            const protocolToast = [added(2), "تم الاستبدال بجرعة البروتوكول: 1", "موجود مسبقًا في القائمة: 1"].join("\n");
            // Newest first: the ⚠ toast follows the protocol toast
            await expectToasts(warning(1), protocolToast);
            expect(success).toHaveBeenCalledTimes(1);
            // Once the answered dialogs have finished closing, no question is open (none asked again)
            await pastExitTransition();
            expect(screen.queryByText("أي عين؟")).not.toBeInTheDocument();
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
            expect(summary()).toEqual([
                ["Same", null, false], ["Replaced", null, false], [withdrawn.name, "right", true], ["Nevanac", "left", false],
            ]);
        });

    test("a disabled line with eye «تُحدد عند الإضافة» and an active ask line: asked once for both, both added, the disabled one with the chip @CAT-161",
        async () => {
            const withdrawn = aSharedDrug({name: "XALATAN 50MCG/ML EYE DROPS 2.5 ML", withdrawn: true});
            const active = aDrug({name: "Tobradex", defaultDosing: drop()});
            const page = await openPrescription({protocols: [aProtocol({items: [anItem(withdrawn, {eye: "ask"}), anItem(active, {eye: "ask"})]})]});
            await page.addProtocol();
            expect(await screen.findByText("أي عين؟")).toBeInTheDocument();
            await page.answer("العينين");
            await expectToasts(warning(1), added(2));
            expect(summary()).toEqual([[withdrawn.name, "both", true], ["Tobradex", "both", false]]);
            expect(within(lineOf(withdrawn.name)).getByText(WITHDRAWN.ar.chip)).toBeInTheDocument();
            expect(within(lineOf("Tobradex")).queryByText(WITHDRAWN.ar.chip)).not.toBeInTheDocument();
        });

    test("the disabled line's chip shows its tooltip on hover and focus, and is kept after a reload @CAT-161", async () => {
        const withdrawn = aSharedDrug({name: "XALATAN 50MCG/ML EYE DROPS 2.5 ML", withdrawn: true});
        const page = await openPrescription({protocols: [aProtocol({items: [anItem(withdrawn, drop({eye: "right"}))]})]});
        await page.addProtocol();
        await expectToasts(warning(1), added(1));
        await expectWithdrawnTooltip(withdrawnMark(lineOf(withdrawn.name), WITHDRAWN.ar.chip));
        page.unmount();
        // The stored snapshot carries `withdrawn`: a reload shows the chip again
        await openPrescription({lines: storedLines()});
        expect(within(lineOf(withdrawn.name)).getByText(WITHDRAWN.ar.chip)).toBeInTheDocument();
    });
});

describe("prescription lines already there when a drug is disabled or renamed @area:prescription", () => {
    test("a line added before the drug was disabled: no chip, editable, its ⊕ adds the other eye, and it is copied @CAT-162", async () => {
        // The snapshot was taken while the drug was active; the catalog now says it is disabled
        const before = aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"});
        const line = aLine(aProtocolDrug(before), drop({eye: "right"}));
        const page = await openPrescription({drugs: [{...before, withdrawn: true}], lines: [line], clipboard: {}});
        const row = lineOf(before.name);
        expect(within(row).queryByText(WITHDRAWN.ar.chip)).not.toBeInTheDocument();

        await page.user.click(within(row).getByRole("button", {name: "إضافة للعين الأخرى"}));
        await waitFor(() => expect(storedLines().map(l => l.dosing.eye)).toEqual(["right", "left"]));

        // Edited: a note saved on the first line is stored and copied
        await page.user.click(within(lineOf(before.name, 0)).getByRole("button", {name: "تعديل الجرعة"}));
        const dialog = await screen.findByRole("dialog");
        await fillIn(page.user, within(dialog).getByRole("textbox", {name: "ملاحظة لهذه الروشتة"}), "رج الزجاجة");
        await page.user.click(within(dialog).getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(storedLines().map(l => [l.dosing.eye, l.note || null, l.drug.withdrawn === true]))
            .toEqual([["right", "رج الزجاجة", false], ["left", null, false]]);
        expect(within(lineOf(before.name, 0)).queryByText(WITHDRAWN.ar.chip)).not.toBeInTheDocument();

        await page.user.click(page.selection().getByRole("button", {name: "نسخ"}));
        expect(await findToast()).toBe("تم النسخ");
        const {text} = await page.clipboard!.written();
        expect(text).toBe(`${before.name}\nنقطة واحدة في العين اليمنى\nرج الزجاجة\n\n${before.name}\nنقطة واحدة في العين اليسرى`);
    });

    test("a shared drug renamed by the super admin: the line keeps the old name until removed and added again @RX-109", async () => {
        const old = aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"});
        const renamed = {...old, name: "VIGAMOX 0.5% EYE DROPS 5 ML (NEW PACK)"};
        const page = await openPrescription({drugs: [renamed], lines: [aLine(aProtocolDrug(old))], clipboard: {}});
        expect(page.selection().getByText(old.name, {exact: true})).toBeInTheDocument();
        expect(page.selection().queryByText(renamed.name)).not.toBeInTheDocument();
        await page.user.click(page.selection().getByRole("button", {name: "نسخ"}));
        await findToast();
        expect((await page.clipboard!.written()).text).toBe(old.name);

        // Removed and added again: the current name
        await page.user.click(within(lineOf(old.name)).getByRole("button", {name: "إزالة"}));
        await page.addDrug(renamed.name);
        await waitFor(() => expect(storedLines().map(l => l.drug.name)).toEqual([renamed.name]));
    });

    test("lines stored before M1.7 (no `isShared`, no `withdrawn`) load, edit and copy @RX-109", async () => {
        const legacy = {
            key: "line-legacy", note: "رج الزجاجة",
            drug: {id: 7, name: "Tobradex", description: null, defaultDosing: drop({eye: "left"})},
            dosing: drop({eye: "left"}),
        } as PrescriptionLine;
        const page = await openPrescription({lines: [legacy], clipboard: {}});
        const row = lineOf("Tobradex");
        expect(within(row).getByText("نقطة واحدة في العين اليسرى")).toBeInTheDocument();
        expect(within(row).queryByText(WITHDRAWN.ar.chip)).not.toBeInTheDocument();

        await page.user.click(within(row).getByRole("button", {name: "تعديل الجرعة"}));
        const dialog = await screen.findByRole("dialog");
        await page.user.click(within(dialog).getByRole("button", {name: "اليمنى"}));
        await page.user.click(within(dialog).getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(storedLines()[0].dosing.eye).toBe("right"));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        await page.user.click(page.selection().getByRole("button", {name: "نسخ"}));
        await findToast();
        expect((await page.clipboard!.written()).text).toBe("Tobradex\nنقطة واحدة في العين اليمنى\nرج الزجاجة");
    });
});

describe("the ⚠ toast can be dismissed @area:ux", () => {
    test("its × «إغلاق» closes it at once, the protocol toast stays @UX-045", async () => {
        const withdrawn = aSharedDrug({withdrawn: true});
        const page = await openPrescription({protocols: [aProtocol({items: [anItem(withdrawn, drop({eye: "right"})), anItem(aDrug(), drop())]})]});
        await page.addProtocol();
        await expectToasts(warning(1), added(2));
        const shown = screen.getByText(warning(1)).closest("[role=status]")!.parentElement!;
        await act(async () => within(shown).getByRole("button", {name: "إغلاق"}).click());
        await waitFor(() => expect(toastTexts()).toEqual([added(2)]), {timeout: 1000});
    });

    test("in English the ⚠ toast reads \"Added although disabled by admin: 1\" and its × is \"Close\" @UX-045", async () => {
        const withdrawn = aSharedDrug({withdrawn: true});
        const page = await openPrescription({lang: "en", protocols: [aProtocol({items: [anItem(withdrawn, drop({eye: "right"}))]})]});
        await page.addProtocol();
        await waitFor(() => expect(toastTexts()[0]).toBe("Added although disabled by admin: 1"));
        const shown = screen.getByText("Added although disabled by admin: 1").closest("[role=status]")!.parentElement!;
        await act(async () => within(shown).getByRole("button", {name: "Close"}).click());
        await waitFor(() => expect(toastTexts()).not.toContain("Added although disabled by admin: 1"), {timeout: 1000});
    });
});

describe("a shared drug added through a protocol @area:prescription", () => {
    test("only an `ask` override, «اليمنى» chosen: the line is the name and «في العين اليمنى», copied the same @CAT-172", async () => {
        const vigamox = aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"});
        const page = await openPrescription({protocols: [aProtocol({items: [anItem(vigamox, {eye: "ask"})]})], clipboard: {}});
        await page.addProtocol();
        await page.answer("اليمنى");
        await waitFor(() => expect(storedLines().map(l => [l.drug.name, l.dosing.eye])).toEqual([[vigamox.name, "right"]]));
        expect(within(lineOf(vigamox.name)).getByText("في العين اليمنى")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await page.user.click(page.selection().getByRole("button", {name: "نسخ"}));
        await waitFor(() => expect(toastTexts()).toContain("تم النسخ"));
        expect((await page.clipboard!.written()).text).toBe("VIGAMOX 0.5% EYE DROPS 5 ML\nفي العين اليمنى");
    });
});
