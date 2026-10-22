import {expect, signIn, test} from "../support/fixtures.ts";
import {RxPage, dropDaily, expectProtocolToast, expectInOrder, rxDrug, rxProtocol, rxName} from "../support/rx.ts";
import {dropDailySentence, RX_TEXTS} from "../support/texts-rx.ts";

test.describe("Prescription: conflicts with the lines already there @area:prescription", () => {
    test("a conflict asks «موجود بالفعل في الروشتة» with both sentences; «استخدام جرعة المجموعة» replaces the line in place, note kept @RX-038 @RX-041 @smoke",
        async ({page, lang, data, healthy}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            const x = await rxDrug(data, clinic, {name: rxName("Xi"), dosing: dropDaily(2, 1)});
            const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(3, 2)});
            const protocol = await rxProtocol(data, clinic, [{drug: b}, {drug: a, dosing: {frequency: "daily", frequencyValue: 6}}]);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a, x]);
            await rx.saveNote(rx.line(0), "رج الزجاجة قبل الاستعمال");
            await rx.expectLines([[a.name, dropDailySentence(4, 1, "right"), "رج الزجاجة قبل الاستعمال"], [x.name, dropDailySentence(2, 1)]]);

            await rx.addProtocol(protocol.name);
            const conflict = rx.dialog(rt.conflictTitle);
            await expect(conflict).toBeVisible();
            await expect(conflict.getByText(rt.conflictMessage(a.name), {exact: true})).toBeVisible();
            await expectInOrder(conflict, [rt.conflictCurrent, dropDailySentence(4, 1, "right"), rt.conflictIncoming, dropDailySentence(6, 1, "right")]);
            await expect(conflict.getByRole("checkbox")).toHaveCount(0);
            await healthy();
            await conflict.getByRole("button", {name: rt.useProtocol, exact: true}).click();

            await expect(page.getByRole("dialog")).toHaveCount(0);
            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 1), rt.protocolReplaced(1)], "success");
            await rx.expectLines([
                [a.name, dropDailySentence(6, 1, "right"), "رج الزجاجة قبل الاستعمال"],
                [x.name, dropDailySentence(2, 1)],
                [b.name, dropDailySentence(3, 2)],
            ]);
        });

    test("«الإبقاء على الحالي» leaves the line as it was: «تم الإبقاء على الجرعة الحالية: 1» @RX-042", async ({page, lang, data}) => {
        const rt = RX_TEXTS[lang];
        const clinic = await data.clinic();
        const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
        const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(3, 2)});
        const protocol = await rxProtocol(data, clinic, [{drug: a, dosing: {frequency: "daily", frequencyValue: 6}}, {drug: b}]);
        await signIn(page, clinic.owner.phone);
        const rx = new RxPage(page, rt);
        await rx.addAlone([a]);

        await rx.addProtocol(protocol.name);
        await rx.dialog(rt.conflictTitle).getByRole("button", {name: rt.keepCurrent, exact: true}).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 1), rt.protocolKept(1)], "success");
        await rx.expectLines([[a.name, dropDailySentence(4, 1, "right")], [b.name, dropDailySentence(3, 2)]]);
    });

    test("3 conflicts are asked one by one in the group's order, «تطبيق على باقي التعارضات» counting 2, 1, then none @RX-044",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const [a, b, c] = await Promise.all(["Alpha", "Beta", "Gamma"].map(w => rxDrug(data, clinic, {name: rxName(w), dosing: dropDaily(4, 1)})));
            const six = {frequency: "daily", frequencyValue: 6};
            const protocol = await rxProtocol(data, clinic, [{drug: c, dosing: six}, {drug: a, dosing: six}, {drug: b, dosing: six}]);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a, b, c]);

            await rx.addProtocol(protocol.name);
            const conflict = rx.dialog(rt.conflictTitle);
            for (const [drug, remaining] of [[c, 2], [a, 1], [b, 0]] as const) {
                await expect(conflict.getByText(rt.conflictMessage(drug.name), {exact: true})).toBeVisible();
                await expect(page.getByRole("dialog")).toHaveCount(1);
                if (remaining) {
                    await expect(conflict.getByRole("checkbox", {name: rt.applyToRemaining(remaining), exact: true})).not.toBeChecked();
                } else {
                    await expect(conflict.getByRole("checkbox")).toHaveCount(0);
                }
                await conflict.getByRole("button", {name: rt.keepCurrent, exact: true}).click();
                if (remaining) await expect(conflict.getByText(rt.conflictMessage(drug.name), {exact: true})).toBeHidden();
            }
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 0), rt.protocolKept(3)], "neutral");
            await rx.expectLines([a, b, c].map(d => [d.name, dropDailySentence(4, 1)]));
        });

    test("the first of 3 conflicts answered «استخدام جرعة المجموعة» with the box ticked: no more questions, all 3 replaced @RX-045",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const [a, b, c] = await Promise.all(["Alpha", "Beta", "Gamma"].map(w => rxDrug(data, clinic, {name: rxName(w), dosing: dropDaily(4, 1)})));
            const six = {frequency: "daily", frequencyValue: 6};
            const protocol = await rxProtocol(data, clinic, [{drug: a, dosing: six}, {drug: b, dosing: six}, {drug: c, dosing: six}]);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a, b, c]);

            await rx.addProtocol(protocol.name);
            const conflict = rx.dialog(rt.conflictTitle);
            await conflict.getByRole("checkbox", {name: rt.applyToRemaining(2), exact: true}).check();
            await conflict.getByRole("button", {name: rt.useProtocol, exact: true}).click();

            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 0), rt.protocolReplaced(3)], "success");
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await rx.expectLines([a, b, c].map(d => [d.name, dropDailySentence(6, 1)]));
        });

    test("a group of 4 lines (new, replaced, kept, identical): one toast with the 4 counts in this order @RX-049",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const [a, b, c, d] = await Promise.all(["Alpha", "Beta", "Gamma", "Delta"]
                .map(w => rxDrug(data, clinic, {name: rxName(w), dosing: dropDaily(4, 1)})));
            const six = {frequency: "daily", frequencyValue: 6};
            const protocol = await rxProtocol(data, clinic, [{drug: d}, {drug: a, dosing: six}, {drug: b, dosing: six}, {drug: c}]);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([a, b, c]);

            await rx.addProtocol(protocol.name);
            const conflict = rx.dialog(rt.conflictTitle);
            await expect(conflict.getByText(rt.conflictMessage(a.name), {exact: true})).toBeVisible();
            await conflict.getByRole("button", {name: rt.useProtocol, exact: true}).click();
            await expect(conflict.getByText(rt.conflictMessage(b.name), {exact: true})).toBeVisible();
            await conflict.getByRole("button", {name: rt.keepCurrent, exact: true}).click();

            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 1), rt.protocolReplaced(1), rt.protocolKept(1), rt.protocolSkipped(1)], "success");
            await rx.expectLines([
                [a.name, dropDailySentence(6, 1)], [b.name, dropDailySentence(4, 1)], [c.name, dropDailySentence(4, 1)], [d.name, dropDailySentence(4, 1)],
            ]);
        });
});
