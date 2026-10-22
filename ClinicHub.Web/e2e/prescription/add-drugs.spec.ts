import {expect, loginViaUi, settled, signIn, test} from "../support/fixtures.ts";
import {RxPage, dropDaily, rxDrug, rxName} from "../support/rx.ts";
import {dropDailySentence, RX_TEXTS} from "../support/texts-rx.ts";
import {expectContextLabel, toast} from "../support/ui.ts";

test.describe("Prescription: the page and adding single drugs @area:prescription", () => {
    test("a doctor's login opens the prescription page first, Protocols tab selected with its search focused @RX-001 @RX-002 @smoke",
        async ({page, t, lang, data, healthy}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const doctor = await data.staff(clinic, {roles: ["Doctor"]});
            await loginViaUi(page, t, doctor.phone);

            await expect(page).toHaveURL(/\/$/);
            await expectContextLabel(page, clinic.name);
            await expect(page.getByText(rt.catalog, {exact: true})).toBeVisible();
            await expect(page.getByText(rt.selected, {exact: true})).toBeVisible();
            await expect(page.getByRole("tab", {name: rt.tabProtocols})).toHaveAttribute("aria-selected", "true");
            await expect(page.getByRole("tab", {name: rt.tabDrugs})).toHaveAttribute("aria-selected", "false");
            await expect(page.getByPlaceholder(rt.searchProtocols)).toBeFocused();
            await healthy();
        });

    test("clicking a drug appends its line with the default sentence, the count goes up, the picker marks it «مُضاف» @RX-005 @smoke",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const first = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            const second = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(3, 2, "left", 2)});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await expect(rx.count).toHaveText("0");

            await rx.openDrugsTab();
            await rx.addDrug(first.name);
            await rx.expectLines([[first.name, dropDailySentence(4, 1, "right")]]);
            await expect(rx.option(first.name)).toContainText(rt.added);
            await expect(rx.option(second.name)).not.toContainText(rt.added);

            await rx.addDrug(second.name);
            await rx.expectLines([[first.name, dropDailySentence(4, 1, "right")], [second.name, dropDailySentence(3, 2, "left", 2)]]);
            await expect(rx.option(second.name)).toContainText(rt.added);
        });

    test("arrows move the highlight and Enter adds it; Enter again: «… موجود بالفعل في القائمة», no second line @RX-006 @RX-013",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const alpha = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1)});
            const beta = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(2, 1)});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.openDrugsTab();
            await rx.search("drugs").click();
            await expect(rx.option(alpha.name)).toHaveAttribute("aria-selected", "true");

            await page.keyboard.press("ArrowDown");
            await expect(rx.option(beta.name)).toHaveAttribute("aria-selected", "true");
            await page.keyboard.press("ArrowDown");
            await expect(rx.option(beta.name)).toHaveAttribute("aria-selected", "false");
            await page.keyboard.press("ArrowUp");
            await expect(rx.option(beta.name)).toHaveAttribute("aria-selected", "true");
            await page.keyboard.press("Enter");
            await rx.expectLines([[beta.name, dropDailySentence(2, 1)]]);

            await expect(rx.option(beta.name)).toHaveAttribute("aria-selected", "true");
            await page.keyboard.press("Enter");
            await expect(toast(page, rt.alreadyAdded(beta.name))).toHaveText(rt.alreadyAdded(beta.name));
            await rx.expectLines([[beta.name, dropDailySentence(2, 1)]]);
        });

    test("a drug already in the list for its default eye: «… موجود بالفعل في القائمة» and no line added @RX-007",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await rxDrug(data, clinic, {name: rxName("Tobradex"), dosing: dropDaily(4, 1, "right")});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.openDrugsTab();
            await rx.addDrug(drug.name);
            await rx.expectLines([[drug.name, dropDailySentence(4, 1, "right")]]);

            await rx.addDrug(drug.name);
            await expect(toast(page, rt.alreadyAdded(drug.name))).toHaveText(rt.alreadyAdded(drug.name));
            await rx.expectLines([[drug.name, dropDailySentence(4, 1, "right")]]);
        });

    test("a drug without a default dosing shows its description, its lines kept @RX-009", async ({page, lang, data}) => {
        const rt = RX_TEXTS[lang];
        const clinic = await data.clinic();
        const drug = await rxDrug(data, clinic, {name: rxName("Gamma"), description: "سطر1\nسطر2"});
        await signIn(page, clinic.owner.phone);
        const rx = new RxPage(page, rt);
        await rx.openDrugsTab();
        await rx.addDrug(drug.name);

        await rx.expectLines([[drug.name, "سطر1", "سطر2"]]);
    });

    test("a double click on a drug adds one line and no «already in the list» toast @RX-012", async ({page, lang, data}) => {
        const rt = RX_TEXTS[lang];
        const clinic = await data.clinic();
        const drug = await rxDrug(data, clinic, {name: rxName("Delta"), dosing: dropDaily(4, 1)});
        await signIn(page, clinic.owner.phone);
        const rx = new RxPage(page, rt);
        await rx.openDrugsTab();

        await rx.option(drug.name).dblclick();
        await rx.expectLines([[drug.name, dropDailySentence(4, 1)]]);
        // The second click of the burst would toast at once (same handler): give it time to show if it were handled
        await page.waitForTimeout(1000);
        await expect(toast(page, rt.alreadyAdded(drug.name))).toHaveCount(0);
        await rx.expectLines([[drug.name, dropDailySentence(4, 1)]]);
    });

    test("✕ removes a line at once (no confirmation, no undo); «مُضاف» goes when the drug has no other line @RX-064",
        async ({page, lang, data}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await rxDrug(data, clinic, {name: rxName("Epsilon"), dosing: dropDaily(4, 1, "right")});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.openDrugsTab();
            await rx.addDrug(drug.name);
            await rx.line(0).getByRole("button", {name: rt.addOtherEye}).click();
            await rx.expectLines([[drug.name, dropDailySentence(4, 1, "right")], [drug.name, dropDailySentence(4, 1, "left")]]);

            await rx.line(1).getByRole("button", {name: rt.remove}).click();
            await rx.expectLines([[drug.name, dropDailySentence(4, 1, "right")]]);
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await expect(rx.option(drug.name)).toContainText(rt.added);

            await rx.line(0).getByRole("button", {name: rt.remove}).click();
            await expect(rx.lines).toHaveCount(0);
            await expect(rx.count).toHaveText("0");
            await expect(page.getByText(rt.emptyTitle, {exact: true})).toBeVisible();
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await expect(page.getByRole("button", {name: rt.undo})).toHaveCount(0);
            await expect(rx.option(drug.name)).not.toContainText(rt.added);
            await settled(page);
        });
});
