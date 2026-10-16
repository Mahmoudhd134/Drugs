import type {Locator, Page} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {READ_ONLY} from "../support/data.ts";
import {unique} from "../support/phones.ts";
import {
    choose,
    createDrug,
    createDrugs,
    createGroup,
    deleteDrug,
    deleteGroup,
    dialog,
    DOSINGS,
    editorLines,
    fillNumber,
    groupCard,
    option,
    sentenceIn,
    updateDrug,
} from "../support/catalog.ts";
import {CATALOG_TEXTS, SENTENCES} from "../support/texts-catalog.ts";
import {expectToast} from "../support/ui.ts";

/** The group editor: create, edit, keyboard, reorder, two eyes, clashes, delete, read-only (docs/features/drug-groups). */

const center = async (target: Locator) => {
    const box = await target.boundingBox();
    if (!box) throw new Error("not on screen");
    return {x: box.x + box.width / 2, y: box.y + box.height / 2, top: box.y};
};

/** Drags a line by its handle onto the top of another line (pointer moves in small steps, as a hand would). */
const dragLine = async (page: Page, handle: Locator, onto: Locator) => {
    await handle.scrollIntoViewIfNeeded();
    const from = await center(handle);
    const to = await center(onto);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y - 10, {steps: 4});
    await page.mouse.move(to.x, to.top - 5, {steps: 20});
    await page.mouse.up();
};

test.describe("The group editor @area:catalog", () => {
    test("«مجموعة جديدة»: a name, 3 drugs clicked in «إضافة أدوية», Save: «تم إنشاء المجموعة» and the list shows «الأدوية: 3» @GRP-046 @smoke",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drugs = await createDrugs(data, clinic, [`One ${u}`, `Two ${u}`, `Three ${u}`]);
            const name = `New group ${u}`;
            await signIn(page, clinic.owner.phone, "asIs", "/groups");
            await page.getByRole("link", {name: t.newGroup}).click();
            await expect(page).toHaveURL(/\/groups\/new$/);
            await expect(page.getByRole("heading", {level: 1, name: t.newGroup})).toBeVisible();
            await page.getByRole("textbox", {name: t.groupName}).fill(name);
            for (const drug of drugs) {
                await page.getByPlaceholder(t.searchDrugs).fill(drug.name);
                await option(page, drug.name).click();
                await page.getByPlaceholder(t.searchDrugs).fill(drug.name);
                await expect(option(page, drug.name).getByText(ct.added, {exact: true})).toBeVisible();
                await page.getByPlaceholder(t.searchDrugs).fill("");
            }
            await expect(editorLines(page, ct)).toHaveCount(3);
            await healthy();
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.groupCreated);
            await expect(page).toHaveURL(/\/groups$/);
            await expect(groupCard(page, name).getByText(ct.drugCount(3), {exact: true})).toBeVisible();
        });

    test("changing a group and saving: «تم تحديث المجموعة» and back to the list @GRP-048", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const drug = await createDrug(data, clinic, `Drug ${unique()}`);
        const group = await createGroup(data, clinic, `Before ${unique()}`, [{drug}]);
        const renamed = `After ${unique()}`;
        await signIn(page, clinic.owner.phone, "asIs", `/groups/${group.id}`);
        await page.getByRole("textbox", {name: t.groupName}).fill(renamed);
        await page.getByRole("button", {name: t.save, exact: true}).click();
        await expectToast(page, t.groupUpdated);
        await expect(page).toHaveURL(/\/groups$/);
        await expect(groupCard(page, renamed)).toBeVisible();
        await expect(groupCard(page, group.name)).toHaveCount(0);
    });

    test("the picker with ↓/↑ and Enter adds the highlighted drug @GRP-052", async ({page, t, lang, data}) => {
        const ct = CATALOG_TEXTS[lang];
        const u = unique();
        const clinic = await data.clinic();
        await createDrugs(data, clinic, [`Kbd ${u} A`, `Kbd ${u} B`, `Kbd ${u} C`]);
        await signIn(page, clinic.owner.phone, "asIs", "/groups/new");
        const search = page.getByPlaceholder(t.searchDrugs);
        await search.fill(`Kbd ${u}`);
        await expect(page.getByRole("option")).toHaveCount(3);
        await search.press("ArrowDown");
        await search.press("ArrowDown");
        await search.press("ArrowUp");
        await expect(option(page, `Kbd ${u} B`)).toHaveAttribute("aria-selected", "true");
        await search.press("Enter");
        await expect(editorLines(page, ct)).toHaveCount(1);
        await expect(editorLines(page, ct).first()).toContainText(`Kbd ${u} B`);
    });

    test("dragging the third line to the top by its handle, then saving: reopened, the new order is kept @GRP-056",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drugs = await createDrugs(data, clinic, [`First ${u}`, `Second ${u}`, `Third ${u}`]);
            const group = await createGroup(data, clinic, `Order ${u}`, drugs.map(drug => ({drug})));
            await signIn(page, clinic.owner.phone, "asIs", `/groups/${group.id}`);
            const lines = editorLines(page, ct);
            await expect(lines).toHaveCount(3);
            await dragLine(page, lines.nth(2).getByRole("button", {name: ct.dragToReorder}), lines.nth(0));
            await expect(lines.nth(0)).toContainText(drugs[2].name);
            await expect(lines.nth(1)).toContainText(drugs[0].name);
            await expect(lines.nth(2)).toContainText(drugs[1].name);
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.groupUpdated);

            await groupCard(page, group.name).getByText(group.name, {exact: true}).click();
            await expect(lines).toHaveCount(3);
            await expect(lines.nth(0)).toContainText(drugs[2].name);
            await expect(lines.nth(1)).toContainText(drugs[0].name);
            await expect(lines.nth(2)).toContainText(drugs[1].name);
        });

    test("the right and left lines of one drug with different doses keep their own dosing once saved and reopened @GRP-083",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Both eyes ${u}`, {dosing: DOSINGS.dropRight4x});
            const name = `Two eyes ${u}`;
            await signIn(page, clinic.owner.phone, "asIs", "/groups/new");
            await page.getByRole("textbox", {name: t.groupName}).fill(name);
            await page.getByPlaceholder(t.searchDrugs).fill(drug.name);
            await option(page, drug.name).click();
            const lines = editorLines(page, ct);
            await expect(sentenceIn(lines.nth(0))).toHaveText(SENTENCES.dropRight4x);

            // ⊕: the same drug for the other eye, then its own dose (2 drops)
            await lines.nth(0).getByRole("button", {name: ct.addOtherEye}).click();
            await expect(lines).toHaveCount(2);
            await lines.nth(1).getByRole("button", {name: ct.editLine}).click();
            const lineDialog = page.getByRole("dialog").filter({hasText: ct.itemDosing});
            await expect(lineDialog).toContainText(drug.name);
            await fillNumber(lineDialog, ct.dose, 2);
            await choose(page, lineDialog, ct.unit, ct.units.drop);
            await expect(sentenceIn(lineDialog)).toHaveText(SENTENCES.dropsLeft2x4x);
            await lineDialog.getByRole("button", {name: t.save, exact: true}).click();
            await expect(lineDialog).toHaveCount(0);
            await expect(sentenceIn(lines.nth(1))).toHaveText(SENTENCES.dropsLeft2x4x);
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.groupCreated);

            await groupCard(page, name).getByText(name, {exact: true}).click();
            await expect(lines).toHaveCount(2);
            await expect(sentenceIn(lines.nth(0))).toHaveText(SENTENCES.dropRight4x);
            await expect(sentenceIn(lines.nth(1))).toHaveText(SENTENCES.dropsLeft2x4x);
            await expect(lines.nth(1).getByText(ct.groupDosing, {exact: true})).toBeVisible();
        });

    test("two lines of a drug that now have the same eye (its default eye changed): both get «نفس الدواء والعين في سطر آخر» and the alert shows @GRP-084",
        async ({page, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Eye moved ${u}`, {dosing: DOSINGS.dropRight4x});
            const group = await createGroup(data, clinic, `Clash ${u}`, [{drug}, {drug, dosing: {eye: "left"}}]);
            await updateDrug(data, clinic, drug, {defaultDosing: {...DOSINGS.dropRight4x, eye: "left"}});
            await signIn(page, clinic.owner.phone, "asIs", `/groups/${group.id}`);
            const lines = editorLines(page, ct);
            await expect(lines).toHaveCount(2);
            for (const i of [0, 1]) await expect(lines.nth(i).getByText(ct.eyeClash, {exact: true}), `line ${i + 1}`).toBeVisible();
            const alert = page.getByRole("alert").filter({hasText: ct.eyeClashSave});
            await expect(alert).toHaveText(ct.eyeClashSave);
            // Above the lines
            expect((await alert.boundingBox())!.y).toBeLessThan((await lines.nth(0).boundingBox())!.y);
            await healthy();
        });

    test("saving a group after one of its drugs was deleted in another window: «أحد الأدوية لم يعد موجودًا.» and the editor keeps the changes @GRP-034",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const [kept, gone] = await createDrugs(data, clinic, [`Kept ${u}`, `Gone ${u}`]);
            const group = await createGroup(data, clinic, `Group ${u}`, [{drug: kept}, {drug: gone}]);
            const renamed = `Renamed ${u}`;
            await signIn(page, clinic.owner.phone, "asIs", `/groups/${group.id}`);
            await page.getByRole("textbox", {name: t.groupName}).fill(renamed);
            await deleteDrug(data, clinic, gone); // the other window
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, ct.drugNotFound);
            await expect(page).toHaveURL(new RegExp(`/groups/${group.id}$`));
            await expect(page.getByRole("textbox", {name: t.groupName})).toHaveValue(renamed);
            await expect(editorLines(page, ct)).toHaveCount(2);
        });

    test("/groups/{id} of a deleted or unknown group: «هذا العنصر لم يعد موجودًا.» with «إعادة المحاولة» instead of the form @GRP-061",
        async ({page, t, data}) => {
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Drug ${unique()}`);
            const group = await createGroup(data, clinic, `Deleted ${unique()}`, [{drug}]);
            await deleteGroup(data, clinic, group);
            await signIn(page, clinic.owner.phone);
            for (const id of [group.id, 987654321]) {
                await page.goto(`/groups/${id}`);
                const alert = page.getByRole("alert");
                await expect(alert, `group ${id}`).toContainText(t.notFound);
                await expect(alert.getByRole("button", {name: t.retry})).toBeVisible();
                await expect(page.getByRole("textbox", {name: t.groupName})).toHaveCount(0);
            }
        });

    test("the editor's Delete, confirmed: «تم حذف المجموعة» and back to the list @GRP-062", async ({page, t, lang, data}) => {
        const ct = CATALOG_TEXTS[lang];
        const clinic = await data.clinic();
        const drug = await createDrug(data, clinic, `Drug ${unique()}`);
        const group = await createGroup(data, clinic, `Delete here ${unique()}`, [{drug}]);
        await signIn(page, clinic.owner.phone, "asIs", `/groups/${group.id}`);
        await page.getByRole("button", {name: t.delete}).click();
        const confirm = dialog(page, ct.groupDeleteTitle);
        await expect(confirm.locator(".MuiDialogContentText-root")).toHaveText(ct.groupDeleteMessage(group.name));
        await confirm.getByRole("button", {name: t.delete}).click();
        await expectToast(page, ct.groupDeleted);
        await expect(page).toHaveURL(/\/groups$/);
        await expect(groupCard(page, group.name)).toHaveCount(0);
    });

    test("a read-only role opens a group: «المجموعة», a read-only name, no picker, Save, Cancel, ✎, ⊕, ✕ or drag handle @GRP-064",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Seen ${unique()}`, {dosing: DOSINGS.dropRight4x});
            const group = await createGroup(data, clinic, `Look only ${unique()}`, [{drug}]);
            const viewer = await data.staff(clinic, {roles: [(await data.role(clinic, READ_ONLY)).id]});
            await signIn(page, viewer.phone, "asIs", "/groups");
            await groupCard(page, group.name).getByText(group.name, {exact: true}).click();
            await expect(page.getByRole("heading", {level: 1, name: t.viewGroup, exact: true})).toBeVisible();
            const name = page.getByRole("textbox", {name: t.groupName});
            await expect(name).toHaveValue(group.name);
            await expect(name).not.toBeEditable();
            await expect(page.getByText(drug.name, {exact: true})).toBeVisible();
            await expect(page.getByPlaceholder(t.searchDrugs)).toHaveCount(0);
            await expect(page.getByText(ct.addDrugs, {exact: true})).toHaveCount(0);
            for (const label of [t.save, t.cancel, t.delete, ct.editLine, ct.addOtherEye, ct.removeLine, ct.dragToReorder]) {
                await expect(page.getByRole("button", {name: label, exact: true}), label).toHaveCount(0);
            }
            await healthy();
        });
});
