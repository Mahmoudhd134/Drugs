import type {Locator, Page} from "@playwright/test";
import {expect, settled, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    createDrug,
    createProtocol,
    dialog,
    DOSINGS,
    drugRow,
    editorLines,
    editorTree,
    fillNumber,
    protocolCard,
    option,
    sentenceIn,
    showDrugsList,
} from "../support/catalog.ts";
import {RxPage} from "../support/rx.ts";
import {CATALOG_TEXTS, type CatalogTexts, SENTENCES} from "../support/texts-catalog.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import type {Texts} from "../support/texts.ts";
import {expectToast, navTo, toast} from "../support/ui.ts";

/**
 * A drug's default dosing flows into its protocols and the prescription (docs/features/dosing/business.md "كيف تعمل الجرعة
 * على ثلاثة مستويات", docs/features/protocols/business.md "القواعد التشغيلية", docs/features/tapering/business.md).
 */

/** Opens a drug's dialog from the drugs page, lets `edit` change it, saves. */
const editDrug = async (page: Page, t: Texts, name: string, edit: (form: Locator) => Promise<void>) => {
    await drugRow(page, name).getByRole("cell").first().click();
    const form = dialog(page, t.editDrug);
    await edit(form);
    await form.getByRole("button", {name: t.save}).click();
    await expectToast(page, t.drugUpdated);
    await expect(form).toHaveCount(0);
    // Gone before the next edit's toast (expectToast wants exactly one)
    await expect(toast(page, t.drugUpdated)).toHaveCount(0);
};

const openProtocol = async (page: Page, t: Texts, name: string) => {
    await navTo(page, t, t.navProtocols);
    await protocolCard(page, name).getByText(name, {exact: true}).click();
    await expect(page.getByRole("heading", {level: 1, name: t.editProtocol})).toBeVisible();
};

const lineOf = (page: Page, ct: CatalogTexts, drug: string) => editorLines(page, ct).filter({hasText: drug});

/** Marks the document: still there later = no page load in between (SPA navigation only). */
const markPage = (page: Page) => page.evaluate(() => { (window as unknown as { e2eMark?: boolean }).e2eMark = true; });
const expectSamePage = async (page: Page) =>
    expect(await page.evaluate(() => (window as unknown as { e2eMark?: boolean }).e2eMark ?? false), "no reload").toBe(true);

test.describe("Default dosing flowing into protocols and prescriptions @area:catalog", () => {
    test("a drug's new default: a line overriding only the frequency keeps it with the new duration; a line without override follows it all, no chip @GRP-072 @GRP-073 @smoke",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            // In the protocol: the drops at 6 times a day (their default: 4 times a day for 7 days), the tablets as their default
            const drops = await createDrug(data, clinic, `Drops ${u}`, {dosing: DOSINGS.drop4x7d});
            const tablets = await createDrug(data, clinic, `Tablets ${u}`, {dosing: DOSINGS.tablet2x1w});
            const protocol = await createProtocol(data, clinic, `Protocol ${u}`, [
                {drug: drops, dosing: {frequency: "daily", frequencyValue: 6}},
                {drug: tablets},
            ]);

            // The drugs page: the drops' duration 7 → 14 days; the tablets' 2 → 3 times a day for 2 weeks
            await signIn(page, clinic.owner.phone, "asIs", "/drugs?view=list");
            await editDrug(page, t, drops.name, form => fillNumber(form, ct.duration, 14));
            await editDrug(page, t, tablets.name, async form => {
                await fillNumber(form, ct.timesPerDay, 3);
                await fillNumber(form, ct.duration, 2);
            });
            await expect(sentenceIn(drugRow(page, drops.name))).toHaveText(SENTENCES.drop4x14d);
            await expect(sentenceIn(drugRow(page, tablets.name))).toHaveText(SENTENCES.tablet3x2w);

            await openProtocol(page, t, protocol.name);
            await expect(sentenceIn(lineOf(page, ct, drops.name))).toHaveText(SENTENCES.drop6x14d);
            await expect(lineOf(page, ct, drops.name).getByText(ct.protocolDosing, {exact: true})).toBeVisible();
            await expect(sentenceIn(lineOf(page, ct, tablets.name))).toHaveText(SENTENCES.tablet3x2w);
            await expect(lineOf(page, ct, tablets.name).getByText(ct.protocolDosing, {exact: true})).toHaveCount(0);
        });

    test("editing the name and default dosing of a drug in two protocols: the protocol cards, the protocol picker and the drug trees show the new name and sentence without a reload @DRUG-071",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Before ${u}`, {dosing: DOSINGS.drop4x});
            const g1 = await createProtocol(data, clinic, `First protocol ${u}`, [{drug}]);
            const g2 = await createProtocol(data, clinic, `Second protocol ${u}`, [{drug}]);
            const renamed = `After ${u}`;
            await signIn(page, clinic.owner.phone, "asIs", "/protocols");
            await markPage(page);
            const rx = new RxPage(page, RX_TEXTS[lang]);
            const editor = editorTree(page, lang);

            // Load the protocols, the protocol editor's drug tree and the prescription's lists first (in the app's cache)
            await expect(protocolCard(page, g1.name).locator("ol li")).toHaveText([drug.name]);
            await page.getByRole("link", {name: t.newProtocol}).click();
            await editor.show(drug.name);
            await expect(sentenceIn(editor.drug(drug.name))).toHaveText(SENTENCES.drop4x);
            await page.getByRole("button", {name: t.cancel, exact: true}).click();
            await navTo(page, t, t.navPrescription);
            await expect(option(page, g1.name).filter({visible: true})).toContainText(drug.name);
            await rx.openDrugsTab();
            // The tree also finds it by a part of its name, in capitals: its one subcategory opens by itself
            await rx.tree.search(u.toUpperCase());
            await expect(sentenceIn(rx.drug(drug.name))).toHaveText(SENTENCES.drop4x);

            await navTo(page, t, t.navDrugs);
            await showDrugsList(page, ct);
            await editDrug(page, t, drug.name, async form => {
                await form.getByRole("textbox", {name: t.drugName}).fill(renamed);
                await fillNumber(form, ct.timesPerDay, 3);
            });

            // The prescription's tree (the same search): the new name and sentence; the protocols list the new name
            await navTo(page, t, t.navPrescription);
            await rx.openDrugsTab();
            await rx.tree.search(u.toUpperCase());
            await expect(sentenceIn(rx.drug(renamed))).toHaveText(SENTENCES.drop3x);
            await expect(rx.drug(drug.name)).toHaveCount(0);
            await rx.openProtocolsTab();
            await expect(option(page, g1.name).filter({visible: true})).toContainText(renamed);
            await expect(option(page, g2.name).filter({visible: true})).toContainText(renamed);

            // The protocols' cards and the protocol editor's drug tree
            await navTo(page, t, t.navProtocols);
            for (const protocol of [g1, g2]) await expect(protocolCard(page, protocol.name).locator("ol li")).toHaveText([renamed]);
            await page.getByRole("link", {name: t.newProtocol}).click();
            await editor.search(u);
            await expect(sentenceIn(editor.drug(renamed))).toHaveText(SENTENCES.drop3x);
            await expect(editor.drug(drug.name)).toHaveCount(0);
            await expectSamePage(page);
            await settled(page);
        });

    test("editing the name and default dosing of a drug in two protocols: both protocols' editors, opened before, show the new name and sentence without a reload @DRUG-071",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Before ${u}`, {dosing: DOSINGS.drop4x});
            const g1 = await createProtocol(data, clinic, `First protocol ${u}`, [{drug}]);
            const g2 = await createProtocol(data, clinic, `Second protocol ${u}`, [{drug}]);
            const renamed = `After ${u}`;
            await signIn(page, clinic.owner.phone, "asIs", "/protocols");
            await markPage(page);
            for (const protocol of [g1, g2]) {
                await openProtocol(page, t, protocol.name);
                await expect(sentenceIn(lineOf(page, ct, drug.name))).toHaveText(SENTENCES.drop4x);
            }

            await navTo(page, t, t.navDrugs);
            await showDrugsList(page, ct);
            await editDrug(page, t, drug.name, async form => {
                await form.getByRole("textbox", {name: t.drugName}).fill(renamed);
                await fillNumber(form, ct.timesPerDay, 3);
            });

            for (const protocol of [g1, g2]) {
                await openProtocol(page, t, protocol.name);
                await expect(lineOf(page, ct, renamed), protocol.name).toHaveCount(1);
                await expect(sentenceIn(lineOf(page, ct, renamed))).toHaveText(SENTENCES.drop3x);
                await expect(page.getByText(drug.name, {exact: true})).toHaveCount(0);
            }
            await expectSamePage(page);
        });

    test("a drug with a taper default added to a prescription: the line shows the whole taper sentence and «تعديل الجرعة» opens with the steps @TAPER-079 @smoke",
        async ({page, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Taper rx ${unique()}`, {dosing: DOSINGS.taperOpenEnd});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, RX_TEXTS[lang]);
            await rx.openDrugsTab();
            await rx.addDrug(drug.name);

            const edit = page.getByRole("button", {name: ct.editLine}).filter({visible: true});
            await expect(edit).toHaveCount(1);
            const line = edit.locator("xpath=ancestor::div[contains(@class,'MuiStack-root')][2]");
            await expect(line).toContainText(drug.name);
            await expect(sentenceIn(line)).toHaveText(SENTENCES.taperOpenEnd);

            await edit.click();
            const form = page.getByRole("dialog").filter({hasText: ct.editLine});
            await expect(form).toContainText(drug.name);
            await expect(form.getByLabel(ct.taper, {exact: true})).toBeChecked();
            for (const [n, times, period] of [[1, "4", ct.durations.weeks], [2, "2", ct.durations.weeks], [3, "1", ct.durations.untilNextVisit]] as const) {
                const step = form.locator(".MuiStack-root").filter({has: page.getByLabel(ct.taperStep(n), {exact: true})}).last();
                await expect(step.getByRole("combobox", {name: ct.frequency})).toHaveText(ct.frequencies.daily);
                await expect(step.getByRole("spinbutton", {name: ct.timesPerDay, exact: true})).toHaveValue(times);
                await expect(step.getByRole("combobox", {name: ct.period})).toHaveText(period);
            }
            await expect(form.getByLabel(ct.taperStep(4), {exact: true})).toHaveCount(0);
            await expect(sentenceIn(form)).toHaveText(SENTENCES.taperOpenEnd);
            await healthy();
        });
});
