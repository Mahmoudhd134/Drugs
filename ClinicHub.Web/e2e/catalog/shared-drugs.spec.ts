import type {Locator, Page} from "@playwright/test";
import {expect, settled, signIn, superAdminPhone, test} from "../support/fixtures.ts";
import {READ_ONLY} from "../support/data.ts";
import {unique} from "../support/phones.ts";
import {createProtocol, dialog, drugRow, DRUGS_LIST, editorLines, editorTree, protocolCard, search, viewButton} from "../support/catalog.ts";
import {RxPage} from "../support/rx.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {EYE, GLAUCOMA, IMPORTED, ownDrugIn, sharedByName, type ApiDrug} from "../support/shared.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";
import {expectContextLabel, expectToast} from "../support/ui.ts";

/**
 * Shared catalog drugs on a clinic's drugs page (design M1.7 D3, D7, D9; M1.7b contract "Drugs page (7b part only)"):
 * own rows have the chip «خاص بالعيادة», shared rows none (no «مشترك» anywhere, M1.7 review R2); the table is the page's
 * list view (`view=list`); shared rows have no ✎/🗑 (also on hover and a phone) and, with
 * `drugs.details`, a click or Enter/Space opens the read-only details. Imported drugs are read only (by exact name);
 * nothing here writes the shared catalog (design D12).
 */

const categoryOf = (drug: ApiDrug, lang: "ar" | "en") => {
    const name = (c: { nameEn: string; nameAr: string }) => lang === "ar" ? c.nameAr : c.nameEn;
    return drug.subCategory ? SHARED_TEXTS[lang].categoryPath(name(drug.category), name(drug.subCategory)) : name(drug.category);
};

/** Types `term` in the drugs page's search and waits for its answer. */
const searchDrugs = async (page: Page, placeholder: string, term: string) => search(page, page.getByPlaceholder(placeholder), term);

/** A chip of a row: «خاص بالعيادة», or the old «مشترك» (never shown any more, M1.7 review R2). */
const chipOf = (row: Locator, text: string) => row.getByText(text, {exact: true});

test.describe("Shared drugs on the drugs page @area:catalog", () => {
    test("shared rows have no edit or delete button (also on hover and on a phone), own rows have both; an own row has «خاص بالعيادة», a shared row no chip @CAT-032 @CAT-278 @smoke",
        async ({page, t, lang, data, isMobile, healthy}) => {
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            const own = await ownDrugIn(data, clinic, {name: `XALATAN own ${unique()}`});
            await signIn(page, clinic.owner.phone, "asIs", DRUGS_LIST);
            await searchDrugs(page, t.searchDrugs, "XALATAN");
            const ownRow = drugRow(page, own.name);
            const sharedRow = page.getByRole("row").filter({has: page.getByText(IMPORTED.xalatan, {exact: true})});
            await expect(ownRow).toBeVisible();
            await expect(sharedRow).toBeVisible();
            await expect(ownRow.getByRole("button", {name: t.edit})).toBeVisible();
            await expect(ownRow.getByRole("button", {name: t.delete})).toBeVisible();
            await expect(chipOf(ownRow, st.chipOwn)).toBeVisible();
            await expect(chipOf(sharedRow, st.chipShared)).toHaveCount(0);
            await expect(chipOf(sharedRow, st.chipOwn)).toHaveCount(0);

            // On a desktop the row's buttons would show on hover; a phone shows them always
            if (!isMobile) await sharedRow.hover();
            await expect(sharedRow.getByRole("button", {name: t.edit})).toHaveCount(0);
            await expect(sharedRow.getByRole("button", {name: t.delete})).toHaveCount(0);
            await healthy();
        });

    test("a viewer clicks «ALEMOX 1 GM 12 F.C.TABS.»: read-only details with «AMOXICILLIN», «التصنيف: مضادات العدوى › البنسلينات», only «إغلاق», no dosing, no Arabic name @CAT-033 @DRUG-072",
        async ({page, t, lang, data, healthy}) => {
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            const alemox = await sharedByName(await data.ownerApi(clinic), IMPORTED.alemox1g);
            const viewer = await data.staff(clinic, {roles: [(await data.role(clinic, READ_ONLY)).id]});
            await signIn(page, viewer.phone, "asIs", DRUGS_LIST);
            await searchDrugs(page, t.searchDrugs, IMPORTED.alemox1g);
            await drugRow(page, IMPORTED.alemox1g).getByRole("cell").first().click();

            const details = dialog(page, t.drugDetails);
            await expect(details).toBeVisible();
            await expect(details.getByText(IMPORTED.alemox1g, {exact: true})).toBeVisible();
            // Decision D23: one inline line «المادة الفعالة: AMOXICILLIN»
            await expect(details.getByText(`${st.activeIngredients}: AMOXICILLIN`, {exact: true})).toBeVisible();
            if (lang === "ar") await expect(details.getByText("التصنيف: مضادات العدوى › البنسلينات", {exact: true})).toBeVisible();
            await expect(details.getByText(st.categoryLine(categoryOf(alemox, lang)), {exact: true})).toBeVisible();
            // Exactly these lines: no description imported (no empty row), no dosing on a shared drug, never the hidden Arabic name
            const lines = details.getByText(IMPORTED.alemox1g, {exact: true}).locator("xpath=../*");
            await expect(lines).toHaveText([IMPORTED.alemox1g, `${st.activeIngredients}: AMOXICILLIN`, st.categoryLine(categoryOf(alemox, lang))]);
            await expect(details.getByText(st.defaultDosing)).toHaveCount(0);
            await expect(details).not.toContainText("أليموكس");
            await expect(details.getByRole("button")).toHaveText([t.close]);
            await healthy();
            await details.getByRole("button", {name: t.close}).click();
            await expect(details).toHaveCount(0);
        });

    test("a user with drugs.update: a shared row clicked, or focused with Enter / Space, opens the read-only details, never the edit dialog @CAT-034 @DRUG-072 @UX-020",
        async ({page, t, data}) => {
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone, "asIs", DRUGS_LIST);
            await searchDrugs(page, t.searchDrugs, IMPORTED.tobradexOint);
            const row = drugRow(page, IMPORTED.tobradexOint);
            for (const how of ["click", "Enter", "Space"] as const) {
                if (how === "click") await row.getByRole("cell").first().click();
                else {
                    await row.focus();
                    await page.keyboard.press(how);
                }
                await expect(dialog(page, t.drugDetails), how).toBeVisible();
                await expect(dialog(page, t.editDrug), how).toHaveCount(0);
                await expect(dialog(page, t.drugDetails).getByRole("textbox")).toHaveCount(0);
                await dialog(page, t.drugDetails).getByRole("button", {name: t.close}).click();
                await expect(dialog(page, t.drugDetails)).toHaveCount(0);
            }
        });

    test("«أليموكس» (ALEMOX's hidden Arabic name) finds both ALEMOX drugs, and the rows show only the English names @CAT-062",
        async ({page, t, data, healthy}) => {
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone, "asIs", DRUGS_LIST);
            await searchDrugs(page, t.searchDrugs, "أليموكس");
            await expect(drugRow(page, IMPORTED.alemox1g)).toBeVisible();
            await expect(drugRow(page, IMPORTED.alemox750)).toBeVisible();
            await expect(page.locator("tbody")).not.toContainText("أليموكس");
            for (const name of [IMPORTED.alemox1g, IMPORTED.alemox750]) {
                await expect(drugRow(page, name).getByRole("cell").first()).toContainText(name);
            }
            await healthy();
        });

    test("«قطرة» in a clinic without own drugs matching it (no shared Arabic name contains it): «لا توجد أدوية مطابقة للبحث.» @CAT-073",
        async ({page, t, lang, data, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinicB = await data.clinic();
            await signIn(page, clinicB.owner.phone, "asIs", DRUGS_LIST);
            await searchDrugs(page, t.searchDrugs, "قطرة");
            await expect(page.getByText(ct.drugsNoResults, {exact: true})).toBeVisible();
            await healthy();
        });

    test("an own drug edited: the dialog opens with its ingredients, category and subcategory in the UI language; no Arabic name field @CAT-051 @DRUG-066",
        async ({page, t, lang, data, healthy}) => {
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            const own = await ownDrugIn(data, clinic, {name: `Own drops ${unique()}`, activeIngredients: "TOBRAMYCIN + DEXAMETHASONE"});
            await signIn(page, clinic.owner.phone, "asIs", DRUGS_LIST);
            await searchDrugs(page, t.searchDrugs, own.name);
            await drugRow(page, own.name).getByRole("cell").first().click();
            const form = dialog(page, t.editDrug);
            await expect(form).toBeVisible();
            await expect(form.getByRole("textbox", {name: t.drugName})).toHaveValue(own.name);
            await expect(form.getByRole("textbox", {name: st.activeIngredients})).toHaveValue("TOBRAMYCIN + DEXAMETHASONE");
            await expect(form.getByRole("combobox", {name: lang === "ar" ? /^التصنيف(?! الفرعي)/ : /^Category/})).toContainText(EYE[lang]);
            await expect(form.getByRole("combobox", {name: lang === "ar" ? /^التصنيف الفرعي/ : /^Subcategory/})).toContainText(GLAUCOMA[lang]);
            await expect(form.getByRole("textbox", {name: /عربي|Arabic/})).toHaveCount(0);
            await healthy();
            await form.getByRole("button", {name: t.cancel}).click();
            await expect(form).toHaveCount(0);
        });

    test("the super admin in the template: shared drugs are read-only there, with no «مشترك» chip @ADM-293", async ({page, t, lang, healthy}) => {
        const st = SHARED_TEXTS[lang];
        await signIn(page, superAdminPhone(), "template", DRUGS_LIST);
        await expectContextLabel(page, t.template);
        await searchDrugs(page, t.searchDrugs, IMPORTED.vigamox);
        const row = drugRow(page, IMPORTED.vigamox);
        await expect(row).toBeVisible();
        await expect(chipOf(row, st.chipShared)).toHaveCount(0);
        await expect(row.getByRole("button", {name: t.edit})).toHaveCount(0);
        await expect(row.getByRole("button", {name: t.delete})).toHaveCount(0);
        await row.getByRole("cell").first().click();
        await expect(dialog(page, t.drugDetails)).toBeVisible();
        await expect(dialog(page, t.editDrug)).toHaveCount(0);
        await healthy();
        await dialog(page, t.drugDetails).getByRole("button", {name: t.close}).click();
    });

    test("no «مشترك» / \"Shared\" chip anywhere: the drugs page (tree and list views), the prescription's tree and lines, a protocol card, the protocol editor's lines and tree; an own drug shows «خاص بالعيادة» @CAT-278",
        async ({page, t, lang, data, healthy}) => {
            const st = SHARED_TEXTS[lang];
            const ct = CATALOG_TEXTS[lang];
            const tt = RX_TEXTS[lang].tree;
            const clinic = await data.clinic();
            const own = await ownDrugIn(data, clinic, {name: `Own ${unique()}`});
            const vigamox = await sharedByName(await data.ownerApi(clinic), IMPORTED.vigamox);
            const protocol = await createProtocol(data, clinic, `Chips ${unique()}`, [{drug: vigamox}, {drug: own}]);
            /** A shared drug's row or line: no chip at all (no «مشترك», no «خاص بالعيادة») */
            const expectNoChip = async (shared: Locator, where: string) => {
                await expect(shared, where).toBeVisible();
                await expect(chipOf(shared, st.chipShared), `${where}: no «مشترك»`).toHaveCount(0);
                await expect(chipOf(shared, st.chipOwn), `${where}: not «خاص بالعيادة»`).toHaveCount(0);
            };
            /** The own drug's row or line: «خاص بالعيادة» */
            const expectOwnChip = (ownOne: Locator, where: string) => expect(chipOf(ownOne, st.chipOwn), where).toBeVisible();

            // The drugs page opens in its tree view: the searched drug's lone subcategory opens by itself
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            const treeRow = (name: string) => page.getByRole("tree", {name: tt.label}).getByRole("treeitem", {name, exact: true});
            await searchDrugs(page, t.searchDrugs, IMPORTED.vigamox);
            await expectNoChip(treeRow(IMPORTED.vigamox), "drugs page tree");
            await searchDrugs(page, t.searchDrugs, own.name);
            await expectOwnChip(treeRow(own.name), "drugs page tree, own drug");
            await viewButton(page, ct, "list").click();
            await expectOwnChip(drugRow(page, own.name), "drugs page list, own drug");
            await searchDrugs(page, t.searchDrugs, IMPORTED.vigamox);
            await expectNoChip(drugRow(page, IMPORTED.vigamox), "drugs page list");
            await healthy();

            // The prescription: the tree's rows, then the lines added from it
            await page.goto("/");
            const rx = new RxPage(page, RX_TEXTS[lang]);
            await rx.openDrugsTab();
            await rx.addDrug(IMPORTED.vigamox);
            await expectNoChip(rx.drug(IMPORTED.vigamox), "prescription tree");
            await rx.addDrug(own.name);
            await expectOwnChip(rx.drug(own.name), "prescription tree, own drug");
            await expectNoChip(rx.linesOf(IMPORTED.vigamox), "prescription line");
            await expect(chipOf(rx.linesOf(own.name), st.chipShared), "prescription line, own drug").toHaveCount(0);
            await healthy();

            // A protocol card (the protocols page)
            await page.goto("/protocols");
            await expect(protocolCard(page, protocol.name)).toBeVisible();
            await expect(chipOf(protocolCard(page, protocol.name), st.chipShared), "protocol card").toHaveCount(0);

            // The protocol editor: its lines and its tree
            await page.goto(`/protocols/${protocol.id}`);
            const lines = editorLines(page, ct);
            await expect(lines).toHaveCount(2);
            await expectNoChip(lines.filter({hasText: IMPORTED.vigamox}), "protocol editor line");
            const tree = editorTree(page, lang);
            await expectNoChip(await tree.show(IMPORTED.vigamox), "protocol editor tree");
            await expectOwnChip(await tree.show(own.name), "protocol editor tree, own drug");
            await healthy();
        });

    test("an own drug used in a protocol with shared drugs, deleted: the confirmation names the protocol and only its line goes @DRUG-106",
        async ({page, t, lang, data}) => {
            const ct = CATALOG_TEXTS[lang];
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            const own = await ownDrugIn(data, clinic, {name: `Own ${unique()}`});
            const vigamox = await sharedByName(api, IMPORTED.vigamox);
            const xalatan = await sharedByName(api, IMPORTED.xalatan);
            const protocol = await createProtocol(data, clinic, `Mixed ${unique()}`, [{drug: vigamox}, {drug: own}, {drug: xalatan}]);
            await signIn(page, clinic.owner.phone, "asIs", DRUGS_LIST);
            await searchDrugs(page, t.searchDrugs, own.name);
            await drugRow(page, own.name).getByRole("button", {name: t.delete}).click();
            const confirm = dialog(page, ct.drugDeleteTitle);
            // One message: the delete sentence, then the protocols using it on the next line
            await expect(confirm.locator(".MuiDialogContentText-root"))
                .toHaveText(`${ct.drugDeleteMessage(own.name)}\n${ct.drugUsedInProtocols([protocol.name])}`);
            await confirm.getByRole("button", {name: t.delete}).click();
            await expectToast(page, ct.drugDeleted);

            const after = await api.ok<{ items: { drug: { id: number; name: string } }[] }>("GET", `/api/v1/protocols/${protocol.id}`);
            expect(after.items.map(i => i.drug.name)).toEqual([IMPORTED.vigamox, IMPORTED.xalatan]);
            await settled(page);
        });
});
