import {expect, signIn, test} from "../support/fixtures.ts";
import {RxPage, dragLine, dropDaily, expectInOrder, rxDrug, rxGetDrug, rxGetGroup, rxGroup, rxName} from "../support/rx.ts";
import {dropDailySentence, RX_TEXTS} from "../support/texts-rx.ts";
import {toast} from "../support/ui.ts";

const NOTE = "رج الزجاجة قبل الاستعمال";

test.describe("Prescription: editing, other eye and order of the lines @area:prescription", () => {
    test("✎ or a click on the line opens «تعديل الجرعة» with the drug, the line's dosing and its note (empty for a new line) @RX-053",
        async ({page, lang, data, healthy}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a]);

            for (const open of ["pencil", "text"] as const) {
                if (open === "pencil") await rx.line(0).getByRole("button", {name: rt.editLine}).click();
                else await rx.line(0).getByText(a.name, {exact: true}).click();
                const dialog = rx.dialog(rt.editLine);
                await expect(dialog).toBeVisible();
                await expect(dialog.getByRole("heading")).toContainText(a.name);
                await expect(dialog.getByRole("spinbutton", {name: rt.amount, exact: true})).toHaveValue("1");
                await expect(dialog.getByRole("spinbutton", {name: rt.timesPerDay, exact: true})).toHaveValue("4");
                await expect(dialog.getByRole("spinbutton", {name: rt.durationValue, exact: true})).toHaveValue("1");
                await expect(dialog.getByRole("button", {name: rt.eyeRight, exact: true})).toHaveAttribute("aria-pressed", "true");
                await expectInOrder(dialog, [rt.preview, dropDailySentence(4, 1, "right")]);
                await expect(dialog.getByRole("textbox", {name: rt.lineNote})).toHaveValue("");
                if (open === "pencil") await healthy();
                await dialog.getByRole("button", {name: rt.cancel, exact: true}).click();
                await expect(dialog).toBeHidden();
            }

            // A line with a note: the dialog shows it; changing only the times keeps it
            await rx.saveNote(rx.line(0), NOTE);
            await rx.expectLines([[a.name, dropDailySentence(4, 1, "right"), NOTE]]);
            for (const open of ["pencil", "text"] as const) {
                if (open === "pencil") await rx.line(0).getByRole("button", {name: rt.editLine}).click();
                else await rx.line(0).getByText(a.name, {exact: true}).click();
                const dialog = rx.dialog(rt.editLine);
                await expect(dialog).toBeVisible();
                await expect(dialog.getByRole("textbox", {name: rt.lineNote}), `${open}: the line's note`).toHaveValue(NOTE);
                await expect(dialog.getByRole("spinbutton", {name: rt.timesPerDay, exact: true})).toHaveValue(open === "pencil" ? "4" : "6");
                if (open === "pencil") {
                    await dialog.getByRole("spinbutton", {name: rt.timesPerDay, exact: true}).fill("6");
                    await dialog.getByRole("button", {name: rt.save, exact: true}).click();
                    await expect(dialog).toBeHidden();
                    await rx.expectLines([[a.name, dropDailySentence(6, 1, "right"), NOTE]]);
                } else {
                    await dialog.getByRole("button", {name: rt.cancel, exact: true}).click();
                    await expect(dialog).toBeHidden();
                }
            }
        });

    test("times changed to 6 and a note typed: the line shows the new sentence and the note in italics under it @RX-054 @smoke",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a]);

            const dialog = await rx.editLine(rx.line(0));
            await dialog.getByRole("spinbutton", {name: rt.timesPerDay, exact: true}).fill("6");
            await dialog.getByRole("textbox", {name: rt.lineNote}).fill(NOTE);
            await dialog.getByRole("button", {name: rt.save, exact: true}).click();
            await expect(dialog).toBeHidden();

            await rx.expectLines([[a.name, dropDailySentence(6, 1, "right"), NOTE]]);
            const note = rx.line(0).getByText(NOTE, {exact: true});
            expect(await note.evaluate(el => getComputedStyle(el).fontStyle)).toBe("italic");
        });

    test("a line edited in the prescription leaves the drug's default dosing and its group unchanged @RX-055",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            const group = await rxGroup(data, clinic, [{drug: a, dosing: {frequency: "daily", frequencyValue: 3}}]);
            const drugBefore = await rxGetDrug(data, clinic, a);
            const groupBefore = await rxGetGroup(data, clinic, group);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addGroup(group.name);
            await rx.expectLines([[a.name, dropDailySentence(3, 1, "right")]]);

            const dialog = await rx.editLine(rx.line(0));
            await dialog.getByRole("spinbutton", {name: rt.timesPerDay, exact: true}).fill("6");
            await dialog.getByRole("button", {name: rt.eyeLeft, exact: true}).click();
            await dialog.getByRole("textbox", {name: rt.lineNote}).fill(NOTE);
            await dialog.getByRole("button", {name: rt.save, exact: true}).click();
            await rx.expectLines([[a.name, dropDailySentence(6, 1, "left"), NOTE]]);

            expect(await rxGetDrug(data, clinic, a)).toEqual(drugBefore);
            expect(await rxGetGroup(data, clinic, group)).toEqual(groupBefore);
            // and as the clinic sees it: a new add still gives the drug's own default
            await rx.addAlone([a]);
            await rx.expectLines([[a.name, dropDailySentence(6, 1, "left"), NOTE], [a.name, dropDailySentence(4, 1, "right")]]);
        });

    test("changing the left line's eye to right while A has a right line: «… موجود بالفعل في القائمة لنفس العين», the dialog stays, nothing changes @RX-058",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a]);
            await rx.line(0).getByRole("button", {name: rt.addOtherEye}).click();
            const before = [[a.name, dropDailySentence(4, 1, "right")], [a.name, dropDailySentence(4, 1, "left")]];
            await rx.expectLines(before);

            const dialog = await rx.editLine(rx.line(1));
            await dialog.getByRole("button", {name: rt.eyeRight, exact: true}).click();
            await dialog.getByRole("button", {name: rt.save, exact: true}).click();
            await expect(toast(page, rt.eyeTaken(a.name))).toHaveText(rt.eyeTaken(a.name));
            await expect(dialog).toBeVisible();
            await expect(dialog.getByRole("button", {name: rt.eyeRight, exact: true})).toHaveAttribute("aria-pressed", "true");
            // Esc (on a phone the error toast lies over the dialog's buttons for a while)
            await page.keyboard.press("Escape");
            await expect(dialog).toBeHidden();
            await rx.expectLines(before);
        });

    test("⊕ «إضافة للعين الأخرى» inserts the drug for the left eye right after the right line, same dosing and note @RX-061 @smoke",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(2, 1)});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a, b]);
            await rx.saveNote(rx.line(0), NOTE);
            // B has no eye: no other eye to add
            await expect(rx.line(1).getByRole("button", {name: rt.addOtherEye})).toHaveCount(0);

            await rx.line(0).getByRole("button", {name: rt.addOtherEye}).click();
            await rx.expectLines([
                [a.name, dropDailySentence(4, 1, "right"), NOTE],
                [a.name, dropDailySentence(4, 1, "left"), NOTE],
                [b.name, dropDailySentence(2, 1)],
            ]);
            await expect(rx.line(0).getByRole("button", {name: rt.addOtherEye})).toHaveCount(0);
            await expect(rx.line(1).getByRole("button", {name: rt.addOtherEye})).toHaveCount(0);
        });

    test("dragging the third line to the top changes the order and the numbers, and a reload keeps them @RX-063",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const [a, b, c] = await Promise.all(["Alpha", "Beta", "Gamma"].map((w, i) => rxDrug(data, clinic, {name: rxName(w), dosing: dropDaily(i + 2, 1)})));
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a, b, c]);
            await rx.expectLines([[a.name, dropDailySentence(2, 1)], [b.name, dropDailySentence(3, 1)], [c.name, dropDailySentence(4, 1)]]);

            await dragLine(page, rx.line(2), rx.line(0));
            const moved = [[c.name, dropDailySentence(4, 1)], [a.name, dropDailySentence(2, 1)], [b.name, dropDailySentence(3, 1)]];
            await rx.expectLines(moved);

            await page.reload();
            await rx.expectLines(moved);
        });
});
