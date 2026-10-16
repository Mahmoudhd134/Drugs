import type {Locator} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {READ_ONLY} from "../support/data.ts";
import {unique} from "../support/phones.ts";
import {
    choose,
    createDrug,
    createGroup,
    deleteDrug,
    dialog,
    DOSINGS,
    drugRow,
    fillNumber,
    groupCard,
    option,
    search,
    sentenceIn,
} from "../support/catalog.ts";
import {CATALOG_TEXTS, type CatalogTexts, SENTENCES} from "../support/texts-catalog.ts";
import {expectToast, navTo} from "../support/ui.ts";

/** Drugs: add, open, edit, delete, read-only details, default dosing and tapering (docs/features/drugs, dosing, tapering). */

/** One step row of the tapering editor (its number badge is labelled «المرحلة n»). */
const stepRow = (scope: Locator, ct: CatalogTexts, n: number) =>
    scope.locator(".MuiStack-root").filter({has: scope.page().getByLabel(ct.taperStep(n), {exact: true})}).last();

const expectDosingForm = async (form: Locator, ct: CatalogTexts, values: {
    dose: string; unit: string; frequency: string; times: string; period: string; duration: string; eye: string;
}) => {
    await expect(form.getByRole("spinbutton", {name: ct.dose, exact: true}).first()).toHaveValue(values.dose);
    await expect(form.getByRole("combobox", {name: ct.unit})).toHaveText(values.unit);
    await expect(form.getByRole("combobox", {name: ct.frequency})).toHaveText(values.frequency);
    await expect(form.getByRole("spinbutton", {name: ct.timesPerDay, exact: true})).toHaveValue(values.times);
    await expect(form.getByRole("combobox", {name: ct.period})).toHaveText(values.period);
    await expect(form.getByRole("spinbutton", {name: ct.duration, exact: true})).toHaveValue(values.duration);
    await expect(form.getByRole("button", {name: values.eye, exact: true})).toHaveAttribute("aria-pressed", "true");
};

test.describe("Drugs: add, open, edit @area:catalog", () => {
    test("«إضافة دواء», a name, Save: the toast «تمت إضافة الدواء», the dialog closes and the drug is listed @DRUG-061 @smoke",
        async ({page, t, data, healthy}) => {
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            const name = `New drug ${unique()}`;
            await page.getByRole("button", {name: t.addDrug}).click();
            const form = dialog(page, t.newDrug);
            await expect(form).toBeVisible();
            await form.getByRole("textbox", {name: t.drugName}).fill(name);
            await healthy();
            await form.getByRole("button", {name: t.save}).click();
            await expectToast(page, t.drugAdded);
            await expect(form).toHaveCount(0);
            await expect(drugRow(page, name)).toBeVisible();
        });

    test("a row (or its ✎) opens «تعديل الدواء» filled with the name, description and default dosing @DRUG-066",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            const description = `Shake well ${unique()}\nKeep cold`;
            const drug = await createDrug(data, clinic, `Edit me ${unique()}`, {description, dosing: DOSINGS.dropRight4x7d});
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            for (const how of ["row", "edit button"] as const) {
                const row = drugRow(page, drug.name);
                if (how === "row") await row.getByRole("cell").first().click();
                else await row.getByRole("button", {name: t.edit}).click();
                const form = dialog(page, t.editDrug);
                await expect(form, how).toBeVisible();
                await expect(form.getByRole("textbox", {name: t.drugName})).toHaveValue(drug.name);
                await expect(form.getByRole("textbox", {name: ct.drugDescription})).toHaveValue(description);
                await expectDosingForm(form, ct, {
                    dose: "1", unit: ct.units.drop, frequency: ct.frequencies.daily, times: "4",
                    period: ct.durations.days, duration: "7", eye: ct.eyes.right,
                });
                await expect(sentenceIn(form)).toHaveText(SENTENCES.dropRight4x7d);
                if (how === "row") await healthy();
                await form.getByRole("button", {name: t.cancel}).click();
                await expect(form).toHaveCount(0);
            }
        });

    test("changing the name and saving: the toast «تم تحديث الدواء» and the row shows the new name @DRUG-067",
        async ({page, t, data}) => {
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Old name ${unique()}`);
            const renamed = `New name ${unique()}`;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await drugRow(page, drug.name).getByRole("cell").first().click();
            const form = dialog(page, t.editDrug);
            await form.getByRole("textbox", {name: t.drugName}).fill(renamed);
            await form.getByRole("button", {name: t.save}).click();
            await expectToast(page, t.drugUpdated);
            await expect(form).toHaveCount(0);
            await expect(drugRow(page, renamed)).toBeVisible();
            await expect(drugRow(page, drug.name)).toHaveCount(0);
        });

    test("saving an edit of a drug deleted in another window: the toast «هذا العنصر لم يعد موجودًا.» @DRUG-073", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const drug = await createDrug(data, clinic, `Gone ${unique()}`);
        await signIn(page, clinic.owner.phone, "asIs", "/drugs");
        await drugRow(page, drug.name).getByRole("cell").first().click();
        const form = dialog(page, t.editDrug);
        await form.getByRole("textbox", {name: t.drugName}).fill(`${drug.name} edited`);
        await deleteDrug(data, clinic, drug); // the other window
        await form.getByRole("button", {name: t.save}).click();
        await expectToast(page, t.notFound);
    });

    test("a read-only role: a row opens «تفاصيل الدواء» with the name, dosing sentence and description, and only «إغلاق» @DRUG-072 @DOSE-087",
        async ({page, t, data, healthy}) => {
            const clinic = await data.clinic();
            const description = `For dry eyes ${unique()}`;
            const drug = await createDrug(data, clinic, `Viewer drug ${unique()}`, {description, dosing: DOSINGS.dropRight4x7d});
            const viewer = await data.staff(clinic, {roles: [(await data.role(clinic, READ_ONLY)).id]});
            await signIn(page, viewer.phone, "asIs", "/drugs");
            await drugRow(page, drug.name).getByRole("cell").first().click();
            const details = dialog(page, t.drugDetails);
            await expect(details).toBeVisible();
            await expect(details.getByText(drug.name, {exact: true})).toBeVisible();
            await expect(sentenceIn(details)).toHaveText(SENTENCES.dropRight4x7d);
            await expect(details.getByText(description, {exact: true})).toBeVisible();
            await expect(details.getByRole("textbox")).toHaveCount(0);
            await expect(details.getByRole("button")).toHaveText([t.close]);
            await healthy();
            await details.getByRole("button", {name: t.close}).click();
            await expect(details).toHaveCount(0);
        });

    test("a default dosing's sentence shows under the drug's name in the drugs table and the drug pickers @DOSE-087",
        async ({page, t, data}) => {
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Sentence ${unique()}`, {dosing: DOSINGS.dropRight4x7d});
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await expect(sentenceIn(drugRow(page, drug.name))).toHaveText(SENTENCES.dropRight4x7d);

            // The group editor's picker
            await navTo(page, t, t.navGroups);
            await page.getByRole("link", {name: t.newGroup}).click();
            await search(page, page.getByPlaceholder(t.searchDrugs), drug.name);
            await expect(sentenceIn(option(page, drug.name))).toHaveText(SENTENCES.dropRight4x7d);

            // The prescription's picker
            await navTo(page, t, t.navPrescription);
            await page.getByRole("tab", {name: t.rxTabDrugs}).click();
            // Another term than the group editor's (a query of its own, not the one cached there: see the report)
            await search(page, page.getByPlaceholder(t.searchDrugs).filter({visible: true}), drug.name.toUpperCase());
            await expect(sentenceIn(option(page, drug.name).filter({visible: true}))).toHaveText(SENTENCES.dropRight4x7d);
        });
});

test.describe("Drugs: delete @area:catalog", () => {
    test("deleting a drug used in two groups: «حذف الدواء؟» names it and the groups; «إلغاء» keeps it, «حذف» deletes it @DRUG-079 @DRUG-083 @DRUG-084 @smoke",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Tobradex ${u}`);
            const other = await createDrug(data, clinic, `Other ${u}`);
            // Created B first: the names are listed by name, not by creation
            await createGroup(data, clinic, `B group ${u}`, [{drug}, {drug: other}]);
            await createGroup(data, clinic, `A group ${u}`, [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            const askDelete = async () => {
                await drugRow(page, drug.name).getByRole("button", {name: t.delete, exact: true}).click();
                const confirm = dialog(page, ct.drugDeleteTitle);
                await expect(confirm).toBeVisible();
                return confirm;
            };
            let confirm = await askDelete();
            await expect(confirm.locator(".MuiDialogContentText-root"))
                .toHaveText(`${ct.drugDeleteMessage(drug.name)}\n${ct.drugUsedInGroups([`A group ${u}`, `B group ${u}`])}`);
            await healthy();

            // «إلغاء»: nothing is deleted (still listed after a reload)
            await confirm.getByRole("button", {name: t.cancel}).click();
            await expect(confirm).toHaveCount(0);
            await page.reload();
            await expect(drugRow(page, drug.name)).toBeVisible();

            // «حذف»: deleted
            confirm = await askDelete();
            await confirm.getByRole("button", {name: t.delete}).click();
            await expectToast(page, ct.drugDeleted);
            await expect(drugRow(page, drug.name)).toHaveCount(0);
            await expect(drugRow(page, other.name)).toBeVisible();
        });

    test("a group whose only drug was deleted shows «الأدوية: 0» and can't be saved («أضف دواءً واحدًا على الأقل.») until a drug is added @DRUG-086",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Only ${u}`);
            const replacement = await createDrug(data, clinic, `Replacement ${u}`);
            const group = await createGroup(data, clinic, `Emptied ${u}`, [{drug}]);
            await deleteDrug(data, clinic, drug);
            await signIn(page, clinic.owner.phone, "asIs", "/groups");

            const card = groupCard(page, group.name);
            await expect(card.getByText(ct.drugCount(0), {exact: true})).toBeVisible();
            await card.getByText(group.name, {exact: true}).click();
            await expect(page).toHaveURL(new RegExp(`/groups/${group.id}$`));
            await expect(page.getByText(ct.noDrugsInGroup, {exact: true})).toBeVisible();
            const save = page.getByRole("button", {name: t.save, exact: true});
            await save.click();
            await expectToast(page, ct.drugsRequired);
            await expect(page).toHaveURL(new RegExp(`/groups/${group.id}$`));

            await page.getByPlaceholder(t.searchDrugs).fill(replacement.name);
            await option(page, replacement.name).click();
            await save.click();
            await expectToast(page, t.groupUpdated);
            await expect(groupCard(page, group.name).getByText(ct.drugCount(1), {exact: true})).toBeVisible();
        });
});

test.describe("Tapering in the drug dialog @area:catalog", () => {
    test("a drug saved with a taper: reopened, the switch is on and the steps are as saved @TAPER-078",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            const name = `Pred taper ${unique()}`;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await page.getByRole("button", {name: t.addDrug}).click();
            let form = dialog(page, t.newDrug);
            await form.getByRole("textbox", {name: t.drugName}).fill(name);
            await fillNumber(form, ct.dose, 2);
            await choose(page, form, ct.unit, ct.units.drop);
            await form.getByRole("button", {name: ct.eyes.right, exact: true}).click();
            // On: two steps from the default schedule (4 times a day for a week, then 3), the second one with 1 drop
            await form.getByLabel(ct.taper, {exact: true}).check();
            await fillNumber(stepRow(form, ct, 2), ct.dose, 1);
            await expect(sentenceIn(form)).toHaveText(SENTENCES.taperExample);
            await healthy();
            await form.getByRole("button", {name: t.save}).click();
            await expectToast(page, t.drugAdded);
            await expect(sentenceIn(drugRow(page, name))).toHaveText(SENTENCES.taperExample);

            await page.reload();
            await drugRow(page, name).getByRole("cell").first().click();
            form = dialog(page, t.editDrug);
            await expect(form.getByLabel(ct.taper, {exact: true})).toBeChecked();
            for (const [n, times, dose] of [[1, "4", "2"], [2, "3", "1"]] as const) {
                const step = stepRow(form, ct, n);
                await expect(step.getByRole("combobox", {name: ct.frequency})).toHaveText(ct.frequencies.daily);
                await expect(step.getByRole("spinbutton", {name: ct.timesPerDay, exact: true})).toHaveValue(times);
                await expect(step.getByRole("combobox", {name: ct.period})).toHaveText(ct.durations.weeks);
                await expect(step.getByRole("spinbutton", {name: ct.duration, exact: true})).toHaveValue("1");
                // Step 1 shows the dose above (hidden on a phone)
                const stepDose = step.getByRole("spinbutton", {name: ct.dose, exact: true});
                if (n === 2 || await stepDose.isVisible()) await expect(stepDose).toHaveValue(dose);
            }
            await expect(form.getByLabel(ct.taperStep(3), {exact: true})).toHaveCount(0);
            await expect(form.getByRole("spinbutton", {name: ct.dose, exact: true}).first()).toHaveValue("2");
            await expect(sentenceIn(form)).toHaveText(SENTENCES.taperExample);
        });
});
