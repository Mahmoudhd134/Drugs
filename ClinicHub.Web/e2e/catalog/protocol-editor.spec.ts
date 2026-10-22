import type {Locator, Page} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {READ_ONLY} from "../support/data.ts";
import {unique} from "../support/phones.ts";
import {
    choose,
    createDrug,
    createDrugs,
    createProtocol,
    deleteDrug,
    deleteProtocol,
    dialog,
    DOSINGS,
    editorLines,
    fillNumber,
    protocolCard,
    option,
    sentenceIn,
    updateDrug,
} from "../support/catalog.ts";
import {CATALOG_TEXTS, SENTENCES} from "../support/texts-catalog.ts";
import {expectToast, recordRequests} from "../support/ui.ts";

/** The protocol editor: create, edit, keyboard, reorder, two eyes, clashes, delete, read-only (docs/features/protocols). */

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

test.describe("The protocol editor @area:catalog", () => {
    test("«بروتوكول جديد»: a name, 3 drugs clicked in «إضافة أدوية», Save: «تم إنشاء البروتوكول» and the list shows «الأدوية: 3» @GRP-046 @smoke",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drugs = await createDrugs(data, clinic, [`One ${u}`, `Two ${u}`, `Three ${u}`]);
            const name = `New protocol ${u}`;
            await signIn(page, clinic.owner.phone, "asIs", "/protocols");
            await page.getByRole("link", {name: t.newProtocol}).click();
            await expect(page).toHaveURL(/\/protocols\/new$/);
            await expect(page.getByRole("heading", {level: 1, name: t.newProtocol})).toBeVisible();
            await page.getByRole("textbox", {name: t.protocolName}).fill(name);
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
            await expectToast(page, t.protocolCreated);
            await expect(page).toHaveURL(/\/protocols$/);
            await expect(protocolCard(page, name).getByText(ct.drugCount(3), {exact: true})).toBeVisible();
        });

    test("changing a protocol and saving: «تم تحديث البروتوكول» and back to the list @GRP-048", async ({page, t, data}) => {
        const clinic = await data.clinic();
        const drug = await createDrug(data, clinic, `Drug ${unique()}`);
        const protocol = await createProtocol(data, clinic, `Before ${unique()}`, [{drug}]);
        const renamed = `After ${unique()}`;
        await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
        await page.getByRole("textbox", {name: t.protocolName}).fill(renamed);
        await page.getByRole("button", {name: t.save, exact: true}).click();
        await expectToast(page, t.protocolUpdated);
        await expect(page).toHaveURL(/\/protocols$/);
        await expect(protocolCard(page, renamed)).toBeVisible();
        await expect(protocolCard(page, protocol.name)).toHaveCount(0);
    });

    test("the picker with ↓/↑ and Enter adds the highlighted drug @GRP-052", async ({page, t, lang, data}) => {
        const ct = CATALOG_TEXTS[lang];
        const u = unique();
        const clinic = await data.clinic();
        await createDrugs(data, clinic, [`Kbd ${u} A`, `Kbd ${u} B`, `Kbd ${u} C`]);
        await signIn(page, clinic.owner.phone, "asIs", "/protocols/new");
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
            const protocol = await createProtocol(data, clinic, `Order ${u}`, drugs.map(drug => ({drug})));
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            const lines = editorLines(page, ct);
            await expect(lines).toHaveCount(3);
            await dragLine(page, lines.nth(2).getByRole("button", {name: ct.dragToReorder}), lines.nth(0));
            await expect(lines.nth(0)).toContainText(drugs[2].name);
            await expect(lines.nth(1)).toContainText(drugs[0].name);
            await expect(lines.nth(2)).toContainText(drugs[1].name);
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.protocolUpdated);

            await protocolCard(page, protocol.name).getByText(protocol.name, {exact: true}).click();
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
            await signIn(page, clinic.owner.phone, "asIs", "/protocols/new");
            await page.getByRole("textbox", {name: t.protocolName}).fill(name);
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
            await expectToast(page, t.protocolCreated);

            await protocolCard(page, name).getByText(name, {exact: true}).click();
            await expect(lines).toHaveCount(2);
            await expect(sentenceIn(lines.nth(0))).toHaveText(SENTENCES.dropRight4x);
            await expect(sentenceIn(lines.nth(1))).toHaveText(SENTENCES.dropsLeft2x4x);
            await expect(lines.nth(1).getByText(ct.protocolDosing, {exact: true})).toBeVisible();
        });

    test("two lines of a drug that now have the same eye (its default eye changed): both get «نفس الدواء والعين في سطر آخر» and the alert shows @GRP-084",
        async ({page, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Eye moved ${u}`, {dosing: DOSINGS.dropRight4x});
            const protocol = await createProtocol(data, clinic, `Clash ${u}`, [{drug}, {drug, dosing: {eye: "left"}}]);
            await updateDrug(data, clinic, drug, {defaultDosing: {...DOSINGS.dropRight4x, eye: "left"}});
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            const lines = editorLines(page, ct);
            await expect(lines).toHaveCount(2);
            for (const i of [0, 1]) await expect(lines.nth(i).getByText(ct.eyeClash, {exact: true}), `line ${i + 1}`).toBeVisible();
            const alert = page.getByRole("alert").filter({hasText: ct.eyeClashSave});
            await expect(alert).toHaveText(ct.eyeClashSave);
            // Above the lines
            expect((await alert.boundingBox())!.y).toBeLessThan((await lines.nth(0).boundingBox())!.y);
            await healthy();
        });

    test("clashing lines: Save shows the alert's text as an error toast and sends nothing; one line's eye changed in its dialog, the chips and the alert go and Save succeeds @GRP-085",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Eye clash ${u}`, {dosing: DOSINGS.dropRight4x});
            const protocol = await createProtocol(data, clinic, `Clash ${u}`, [{drug}, {drug, dosing: {eye: "left"}}]);
            await updateDrug(data, clinic, drug, {defaultDosing: {...DOSINGS.dropRight4x, eye: "left"}});
            const puts = recordRequests(page, "PUT", new RegExp(`/api/v1/protocols/${protocol.id}$`));
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            const lines = editorLines(page, ct);
            await expect(lines).toHaveCount(2);
            const chips = page.getByText(ct.eyeClash, {exact: true});
            const alert = page.getByRole("alert").filter({hasText: ct.eyeClashSave});
            await expect(chips).toHaveCount(2);

            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, ct.eyeClashSave);
            expect(puts, "no request").toHaveLength(0);

            // The first line (the drug's default eye, now left) gets the right eye in its dialog
            await lines.nth(0).getByRole("button", {name: ct.editLine}).click();
            const lineDialog = page.getByRole("dialog").filter({hasText: ct.itemDosing});
            await lineDialog.getByRole("button", {name: ct.eyes.right, exact: true}).click();
            await lineDialog.getByRole("button", {name: t.save, exact: true}).click();
            await expect(lineDialog).toHaveCount(0);
            await expect(chips, "the chips go").toHaveCount(0);
            await expect(alert, "the alert goes").toHaveCount(0);

            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.protocolUpdated);
            expect(puts, "one save").toHaveLength(1);
            const items = (puts[0].postDataJSON() as { items: { dosing: { eye?: string } | null }[] }).items;
            expect(items.map(i => i.dosing?.eye ?? null), "the eyes sent").toEqual(["right", "left"]);
        });

    test("saving a protocol after one of its drugs was deleted in another window: «أحد الأدوية لم يعد موجودًا.» and the editor keeps the changes @GRP-034",
        async ({page, t, lang, data, allowApiErrors}) => {
            // The save refused (drugNotFound): the test's subject
            allowApiErrors({status: 400, method: "PUT", path: /^\/api\/v1\/protocols\/\d+$/});
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const [kept, gone] = await createDrugs(data, clinic, [`Kept ${u}`, `Gone ${u}`]);
            const protocol = await createProtocol(data, clinic, `Protocol ${u}`, [{drug: kept}, {drug: gone}]);
            const renamed = `Renamed ${u}`;
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            await page.getByRole("textbox", {name: t.protocolName}).fill(renamed);
            await deleteDrug(data, clinic, gone); // the other window
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, ct.drugNotFound);
            await expect(page).toHaveURL(new RegExp(`/protocols/${protocol.id}$`));
            await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveValue(renamed);
            await expect(editorLines(page, ct)).toHaveCount(2);
        });

    test("/protocols/{id} of a deleted or unknown protocol: «هذا العنصر لم يعد موجودًا.» with «إعادة المحاولة» instead of the form @GRP-061",
        async ({page, t, data, allowApiErrors}) => {
            // A deleted or unknown protocol: the test's subject
            allowApiErrors({status: 404, method: "GET", path: /^\/api\/v1\/protocols\/\d+$/});
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Drug ${unique()}`);
            const protocol = await createProtocol(data, clinic, `Deleted ${unique()}`, [{drug}]);
            await deleteProtocol(data, clinic, protocol);
            await signIn(page, clinic.owner.phone);
            for (const id of [protocol.id, 987654321]) {
                await page.goto(`/protocols/${id}`);
                const alert = page.getByRole("alert");
                await expect(alert, `protocol ${id}`).toContainText(t.notFound);
                await expect(alert.getByRole("button", {name: t.retry})).toBeVisible();
                await expect(page.getByRole("textbox", {name: t.protocolName})).toHaveCount(0);
            }
        });

    test("the editor's Delete, confirmed: «تم حذف البروتوكول» and back to the list @GRP-062", async ({page, t, lang, data, allowApiErrors}) => {
        // After the delete the editor's own query of the deleted protocol is fetched once more as it closes (404, answer unused)
        allowApiErrors({status: 404, method: "GET", path: /^\/api\/v1\/protocols\/\d+$/});
        const ct = CATALOG_TEXTS[lang];
        const clinic = await data.clinic();
        const drug = await createDrug(data, clinic, `Drug ${unique()}`);
        const protocol = await createProtocol(data, clinic, `Delete here ${unique()}`, [{drug}]);
        await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
        await page.getByRole("button", {name: t.delete}).click();
        const confirm = dialog(page, ct.protocolDeleteTitle);
        await expect(confirm.locator(".MuiDialogContentText-root")).toHaveText(ct.protocolDeleteMessage(protocol.name));
        await confirm.getByRole("button", {name: t.delete}).click();
        await expectToast(page, ct.protocolDeleted);
        await expect(page).toHaveURL(/\/protocols$/);
        await expect(protocolCard(page, protocol.name)).toHaveCount(0);
    });

    test("a read-only role opens a protocol: «البروتوكول», a read-only name, no picker, Save, Cancel, ✎, ⊕, ✕ or drag handle @GRP-064",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            const drug = await createDrug(data, clinic, `Seen ${unique()}`, {dosing: DOSINGS.dropRight4x});
            const protocol = await createProtocol(data, clinic, `Look only ${unique()}`, [{drug}]);
            const viewer = await data.staff(clinic, {roles: [(await data.role(clinic, READ_ONLY)).id]});
            await signIn(page, viewer.phone, "asIs", "/protocols");
            await protocolCard(page, protocol.name).getByText(protocol.name, {exact: true}).click();
            await expect(page.getByRole("heading", {level: 1, name: t.viewProtocol, exact: true})).toBeVisible();
            const name = page.getByRole("textbox", {name: t.protocolName});
            await expect(name).toHaveValue(protocol.name);
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
