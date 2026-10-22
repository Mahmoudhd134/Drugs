import {expect, test} from "../support/fixtures.ts";
import {signIn} from "../support/fixtures.ts";
import {RxPage, dropDaily, expectProtocolToast, expectInOrder, rxDrug, rxProtocol, rxName, rxUpdateDrug} from "../support/rx.ts";
import {dropDailySentence, RX_DOSINGS, RX_TEXTS} from "../support/texts-rx.ts";
import {toast, toasts} from "../support/ui.ts";


test.describe("Prescription: adding a group @area:prescription", () => {
    test("a group of 3 drugs: its lines in the group's order with each merged dosing, one toast «تمت الإضافة من …: 3» @RX-015 @RX-017 @smoke",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(3, 2)});
            const c = await rxDrug(data, clinic, {name: rxName("Gamma")});
            // Order C, A, B (not by name); B: the group overrides only the times (6), the rest from the drug
            const protocol = await rxProtocol(data, clinic, [
                {drug: c, dosing: RX_DOSINGS.ointmentBothBedtimeNextVisit.dosing},
                {drug: a},
                {drug: b, dosing: {frequency: "daily", frequencyValue: 6}},
            ]);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);

            await rx.addProtocol(protocol.name);
            await rx.expectLines([
                [c.name, RX_DOSINGS.ointmentBothBedtimeNextVisit.sentence],
                [a.name, dropDailySentence(4, 1, "right")],
                [b.name, dropDailySentence(6, 2)],
            ]);
            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 3)], "success");
            await expect(page.getByRole("dialog")).toHaveCount(0);
        });

    test("«أي عين؟» asks once; «اليسرى» gives the 3 ask lines the left eye, the right line stays right @RX-019 @RX-020 @smoke",
        async ({page, lang, data, healthy}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const [a, b, c] = await Promise.all(["Alpha", "Beta", "Gamma"].map(w => rxDrug(data, clinic, {name: rxName(w), dosing: dropDaily(4, 1)})));
            const d = await rxDrug(data, clinic, {name: rxName("Delta"), dosing: dropDaily(2, 1, "right")});
            const protocol = await rxProtocol(data, clinic, [
                {drug: a, dosing: {eye: "ask"}}, {drug: d}, {drug: b, dosing: {eye: "ask"}}, {drug: c, dosing: {eye: "ask"}},
            ]);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);

            await rx.addProtocol(protocol.name);
            const dialog = rx.dialog(rt.chooseEyeTitle);
            await expect(dialog).toBeVisible();
            await expect(dialog.getByText(rt.chooseEyeMessage(protocol.name), {exact: true})).toBeVisible();
            for (const name of [rt.eyeRight, rt.eyeLeft, rt.eyeBoth, rt.cancel]) {
                await expect(dialog.getByRole("button", {name, exact: true})).toBeVisible();
            }
            await healthy();
            await dialog.getByRole("button", {name: rt.eyeLeft, exact: true}).click();

            await rx.expectLines([
                [a.name, dropDailySentence(4, 1, "left")],
                [d.name, dropDailySentence(2, 1, "right")],
                [b.name, dropDailySentence(4, 1, "left")],
                [c.name, dropDailySentence(4, 1, "left")],
            ]);
            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 4)], "success");
            await expect(page.getByRole("dialog")).toHaveCount(0);
        });

    test("«إلغاء» or Esc on the eye question adds nothing and shows no toast; a click outside leaves it open @RX-022",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1)});
            const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(2, 1)});
            const protocol = await rxProtocol(data, clinic, [{drug: a, dosing: {eye: "ask"}}, {drug: b}]);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            const dialog = rx.dialog(rt.chooseEyeTitle);

            await rx.addProtocol(protocol.name);
            await expect(dialog).toBeVisible();
            await page.mouse.click(4, 4);
            await page.waitForTimeout(500);
            await expect(dialog).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(dialog).toBeHidden();
            await page.waitForTimeout(500);
            await expect(rx.lines).toHaveCount(0);
            await expect(rx.count).toHaveText("0");
            await expect(toasts(page)).toHaveCount(0);

            await rx.addProtocol(protocol.name);
            await expect(dialog).toBeVisible();
            await dialog.getByRole("button", {name: rt.cancel, exact: true}).click();
            await expect(dialog).toBeHidden();
            await page.waitForTimeout(500);
            await expect(rx.lines).toHaveCount(0);
            await expect(toasts(page)).toHaveCount(0);
        });

    test("a line already there with the group's dosing is skipped without a question: «موجود مسبقًا في القائمة: 1» @RX-024",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(2, 1)});
            const protocol = await rxProtocol(data, clinic, [{drug: a}, {drug: b}]);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.openDrugsTab();
            await rx.addDrug(a.name);
            await rx.expectLines([[a.name, dropDailySentence(4, 1, "right")]]);

            await rx.openProtocolsTab();
            await rx.addProtocol(protocol.name);
            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 1), rt.protocolSkipped(1)], "success");
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await rx.expectLines([[a.name, dropDailySentence(4, 1, "right")], [b.name, dropDailySentence(2, 1)]]);
        });

    test("the same group twice in a row: «تمت الإضافة من …: 0» and «موجود مسبقًا في القائمة: 2» in the neutral style @RX-027",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(2, 1)});
            const protocol = await rxProtocol(data, clinic, [{drug: a}, {drug: b}]);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);

            await rx.addProtocol(protocol.name);
            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 2)], "success");
            await expect(toast(page, rt.protocolAdded(protocol.name, 2))).toHaveCount(0, {timeout: 15_000});
            await rx.addProtocol(protocol.name);
            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 0), rt.protocolSkipped(2)], "neutral");
            await rx.expectLines([[a.name, dropDailySentence(4, 1, "right")], [b.name, dropDailySentence(2, 1)]]);
        });

    test("a double click on a group runs its flow once (one question, one toast, no drug twice); a click on it under the dialog does nothing @RX-028",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1)});
            const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(2, 1)});
            const asking = await rxProtocol(data, clinic, [{drug: a, dosing: {eye: "ask"}}, {drug: b}], rxName("Asking"));
            const plain = await rxProtocol(data, clinic, [{drug: b, dosing: {eye: "left"}}], rxName("Plain"));
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);

            const option = rx.option(asking.name);
            const box = await option.boundingBox();
            await option.dblclick();
            const dialog = rx.dialog(rt.chooseEyeTitle);
            await expect(dialog).toBeVisible();
            await expect(page.getByRole("dialog")).toHaveCount(1);
            // The group under the dialog's backdrop: clicking it again neither answers nor starts a second flow
            if (!box) throw new Error("the group is not on screen");
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            await page.waitForTimeout(500);
            await expect(page.getByRole("dialog")).toHaveCount(1);
            await dialog.getByRole("button", {name: rt.eyeRight, exact: true}).click();
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await rx.expectLines([[a.name, dropDailySentence(4, 1, "right")], [b.name, dropDailySentence(2, 1)]]);
            await expectProtocolToast(page, [rt.protocolAdded(asking.name, 2)], "success");
            await page.waitForTimeout(500);
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await expect(toast(page, rt.protocolAdded(asking.name, 0))).toHaveCount(0);

            await rx.option(plain.name).dblclick();
            await expectProtocolToast(page, [rt.protocolAdded(plain.name, 1)], "success");
            await page.waitForTimeout(500);
            await expect(toast(page, rt.protocolAdded(plain.name, 0))).toHaveCount(0);
            await rx.expectLines([
                [a.name, dropDailySentence(4, 1, "right")], [b.name, dropDailySentence(2, 1)], [b.name, dropDailySentence(2, 1, "left")],
            ]);
        });

    test("two lines of a saved group give one drug for one eye (its default eye changed): the first is added, «مكرر في المجموعة ولم يُضف: 1» @RX-029",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            // Saved while the lines were for left and right; then the drug's default eye becomes left: both left
            const protocol = await rxProtocol(data, clinic, [{drug: a, dosing: {eye: "left", frequency: "daily", frequencyValue: 6}}, {drug: a}]);
            await rxUpdateDrug(data, clinic, a, {dosing: dropDaily(4, 1, "left")});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);

            await rx.addProtocol(protocol.name);
            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 1), rt.protocolDuplicated(1)], "success");
            await rx.expectLines([[a.name, dropDailySentence(6, 1, "left")]]);
            await expect(page.getByRole("dialog")).toHaveCount(0);
        });

    for (const choice of ["first", "second"] as const) {
        test(`an "ask" line and a right line of one drug, «اليمنى» chosen: «جرعتان لنفس العين», «استخدام ${choice === "first" ? "الأولى" : "الثانية"}» keeps that dosing in the first line's place @RX-030 @RX-031`,
            async ({page, lang, data}) => {
                const rt = RX_TEXTS[lang];
                const clinic = await data.clinic();
                const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1)});
                const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(2, 1)});
                const protocol = await rxProtocol(data, clinic, [
                    {drug: a, dosing: {eye: "ask", frequency: "daily", frequencyValue: 6}}, {drug: b}, {drug: a, dosing: {eye: "right"}},
                ]);
                const firstSentence = dropDailySentence(6, 1, "right");
                const secondSentence = dropDailySentence(4, 1, "right");
                await signIn(page, clinic.owner.phone);
                const rx = new RxPage(page, rt);

                await rx.addProtocol(protocol.name);
                await rx.dialog(rt.chooseEyeTitle).getByRole("button", {name: rt.eyeRight, exact: true}).click();
                const clash = rx.dialog(rt.protocolClashTitle);
                await expect(clash).toBeVisible();
                await expect(clash.getByText(rt.protocolClashMessage(a.name), {exact: true})).toBeVisible();
                await expectInOrder(clash, [rt.protocolClashFirst, firstSentence, rt.protocolClashSecond, secondSentence]);
                await expect(clash.getByRole("button", {name: rt.useFirst, exact: true})).toBeVisible();
                await expect(clash.getByRole("button", {name: rt.useSecond, exact: true})).toBeVisible();
                await expect(clash.getByRole("checkbox")).toHaveCount(0);

                await clash.getByRole("button", {name: choice === "first" ? rt.useFirst : rt.useSecond, exact: true}).click();
                await expect(page.getByRole("dialog")).toHaveCount(0);
                await rx.expectLines([[a.name, choice === "first" ? firstSentence : secondSentence], [b.name, dropDailySentence(2, 1)]]);
                await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 2)], "success");
            });
    }
});
