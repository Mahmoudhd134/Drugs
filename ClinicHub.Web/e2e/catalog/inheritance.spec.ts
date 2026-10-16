import type {Locator, Page} from "@playwright/test";
import {expect, settled, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {
    createDrug,
    createGroup,
    dialog,
    DOSINGS,
    drugRow,
    editorLines,
    fillNumber,
    groupCard,
    option,
    search,
    sentenceIn,
} from "../support/catalog.ts";
import {CATALOG_TEXTS, type CatalogTexts, SENTENCES} from "../support/texts-catalog.ts";
import type {Texts} from "../support/texts.ts";
import {expectToast, navTo, toast} from "../support/ui.ts";

/**
 * A drug's default dosing flows into its groups and the prescription (docs/features/dosing/business.md "كيف تعمل الجرعة
 * على ثلاثة مستويات", docs/features/drug-groups/business.md "القواعد التشغيلية", docs/features/tapering/business.md).
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

const openGroup = async (page: Page, t: Texts, name: string) => {
    await navTo(page, t, t.navGroups);
    await groupCard(page, name).getByText(name, {exact: true}).click();
    await expect(page.getByRole("heading", {level: 1, name: t.editGroup})).toBeVisible();
};

const lineOf = (page: Page, ct: CatalogTexts, drug: string) => editorLines(page, ct).filter({hasText: drug});

/** Marks the document: still there later = no page load in between (SPA navigation only). */
const markPage = (page: Page) => page.evaluate(() => { (window as unknown as { e2eMark?: boolean }).e2eMark = true; });
const expectSamePage = async (page: Page) =>
    expect(await page.evaluate(() => (window as unknown as { e2eMark?: boolean }).e2eMark ?? false), "no reload").toBe(true);

test.describe("Default dosing flowing into groups and prescriptions @area:catalog", () => {
    test("a drug's new default: a line overriding only the frequency keeps it with the new duration; a line without override follows it all, no chip @GRP-072 @GRP-073 @smoke",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            // In the group: the drops at 6 times a day (their default: 4 times a day for 7 days), the tablets as their default
            const drops = await createDrug(data, clinic, `Drops ${u}`, {dosing: DOSINGS.drop4x7d});
            const tablets = await createDrug(data, clinic, `Tablets ${u}`, {dosing: DOSINGS.tablet2x1w});
            const group = await createGroup(data, clinic, `Protocol ${u}`, [
                {drug: drops, dosing: {frequency: "daily", frequencyValue: 6}},
                {drug: tablets},
            ]);

            // The drugs page: the drops' duration 7 → 14 days; the tablets' 2 → 3 times a day for 2 weeks
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await editDrug(page, t, drops.name, form => fillNumber(form, ct.duration, 14));
            await editDrug(page, t, tablets.name, async form => {
                await fillNumber(form, ct.timesPerDay, 3);
                await fillNumber(form, ct.duration, 2);
            });
            await expect(sentenceIn(drugRow(page, drops.name))).toHaveText(SENTENCES.drop4x14d);
            await expect(sentenceIn(drugRow(page, tablets.name))).toHaveText(SENTENCES.tablet3x2w);

            await openGroup(page, t, group.name);
            await expect(sentenceIn(lineOf(page, ct, drops.name))).toHaveText(SENTENCES.drop6x14d);
            await expect(lineOf(page, ct, drops.name).getByText(ct.groupDosing, {exact: true})).toBeVisible();
            await expect(sentenceIn(lineOf(page, ct, tablets.name))).toHaveText(SENTENCES.tablet3x2w);
            await expect(lineOf(page, ct, tablets.name).getByText(ct.groupDosing, {exact: true})).toHaveCount(0);
        });

    test("editing the name and default dosing of a drug in two groups: the group cards and the pickers show the new name and sentence without a reload (no case tag: the case also needs the editors, see BUG-550 below)",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Before ${u}`, {dosing: DOSINGS.drop4x});
            const g1 = await createGroup(data, clinic, `First group ${u}`, [{drug}]);
            const g2 = await createGroup(data, clinic, `Second group ${u}`, [{drug}]);
            const renamed = `After ${u}`;
            await signIn(page, clinic.owner.phone, "asIs", "/groups");
            await markPage(page);

            // Load the groups, the group editor's drug picker and the prescription's pickers first (in the app's cache)
            await expect(groupCard(page, g1.name).locator("ol li")).toHaveText([drug.name]);
            await page.getByRole("link", {name: t.newGroup}).click();
            await search(page, page.getByPlaceholder(t.searchDrugs), u);
            await expect(sentenceIn(option(page, drug.name))).toHaveText(SENTENCES.drop4x);
            await page.getByRole("button", {name: t.cancel, exact: true}).click();
            await navTo(page, t, t.navPrescription);
            await expect(option(page, g1.name).filter({visible: true})).toContainText(drug.name);
            await page.getByRole("tab", {name: t.rxTabDrugs}).click();
            await search(page, page.getByPlaceholder(t.searchDrugs).filter({visible: true}), u.toUpperCase());
            await expect(sentenceIn(option(page, drug.name).filter({visible: true}))).toHaveText(SENTENCES.drop4x);

            await navTo(page, t, t.navDrugs);
            await editDrug(page, t, drug.name, async form => {
                await form.getByRole("textbox", {name: t.drugName}).fill(renamed);
                await fillNumber(form, ct.timesPerDay, 3);
            });

            // The prescription's pickers (each tab kept its search): the groups list the new name, the drug its new sentence
            await navTo(page, t, t.navPrescription);
            await page.getByRole("tab", {name: t.rxTabDrugs}).click();
            await search(page, page.getByPlaceholder(t.searchDrugs).filter({visible: true}), u.toUpperCase());
            await expect(sentenceIn(option(page, renamed).filter({visible: true}))).toHaveText(SENTENCES.drop3x);
            await expect(option(page, drug.name).filter({visible: true})).toHaveCount(0);
            await page.getByRole("tab", {name: t.rxTabGroups}).click();
            await expect(option(page, g1.name).filter({visible: true})).toContainText(renamed);
            await expect(option(page, g2.name).filter({visible: true})).toContainText(renamed);

            // The groups' cards and the group editor's drug picker
            await navTo(page, t, t.navGroups);
            for (const group of [g1, g2]) await expect(groupCard(page, group.name).locator("ol li")).toHaveText([renamed]);
            await page.getByRole("link", {name: t.newGroup}).click();
            await search(page, page.getByPlaceholder(t.searchDrugs), u);
            await expect(sentenceIn(option(page, renamed))).toHaveText(SENTENCES.drop3x);
            await expect(option(page, drug.name)).toHaveCount(0);
            await expectSamePage(page);
            await settled(page);
        });

    test.fail("BUG-550: editing the name and default dosing of a drug in two groups: both groups' editors, opened before, show the new name and sentence without a reload @DRUG-071",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Before ${u}`, {dosing: DOSINGS.drop4x});
            const g1 = await createGroup(data, clinic, `First group ${u}`, [{drug}]);
            const g2 = await createGroup(data, clinic, `Second group ${u}`, [{drug}]);
            const renamed = `After ${u}`;
            await signIn(page, clinic.owner.phone, "asIs", "/groups");
            await markPage(page);
            for (const group of [g1, g2]) {
                await openGroup(page, t, group.name);
                await expect(sentenceIn(lineOf(page, ct, drug.name))).toHaveText(SENTENCES.drop4x);
            }

            await navTo(page, t, t.navDrugs);
            await editDrug(page, t, drug.name, async form => {
                await form.getByRole("textbox", {name: t.drugName}).fill(renamed);
                await fillNumber(form, ct.timesPerDay, 3);
            });

            for (const group of [g1, g2]) {
                await openGroup(page, t, group.name);
                await expect(lineOf(page, ct, renamed), group.name).toHaveCount(1);
                await expect(sentenceIn(lineOf(page, ct, renamed))).toHaveText(SENTENCES.drop3x);
                await expect(page.getByText(drug.name, {exact: true})).toHaveCount(0);
            }
            await expectSamePage(page);
        });

    test("a drug with a taper default added to a prescription: the line shows the whole taper sentence and «تعديل الجرعة» opens with the steps @TAPER-079 @smoke",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Taper rx ${unique()}`, {dosing: DOSINGS.taperOpenEnd});
            await signIn(page, clinic.owner.phone);
            await page.getByRole("tab", {name: t.rxTabDrugs}).click();
            await page.getByPlaceholder(t.searchDrugs).filter({visible: true}).fill(drug.name);
            await option(page, drug.name).filter({visible: true}).click();

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
