import type {Request} from "@playwright/test";
import {expect, settled, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {addToProtocol, editorLines, protocolCard} from "../support/catalog.ts";
import {markClipboard, readClipboard, RxPage, rxDrug, type RxDrug, rxProtocol} from "../support/rx.ts";
import {type AdminDrug, IMPORTED, sharedByName, sharedDrug, updateSharedDrug, withdrawSharedDrug} from "../support/shared.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";
import {categoryName, categoryOf, subCategoryName, treeOf} from "../support/tree.ts";
import {expectToast, navTo, toasts} from "../support/ui.ts";

/*
 * The shared catalog through the drug tree, end to end (design M1.7 § 1 "done when"; CAT-130), and a role without
 * `drugs.list` reading a protocol (ACC-090). Both write the shared catalog (a shared drug of the test's own, renamed or
 * disabled; never an imported one, D12), so they live in this last-running project.
 */

/** A shared drug of the test's own, as a protocol line's drug. */
const asLineDrug = (drug: AdminDrug): RxDrug => ({id: drug.id, name: drug.name, description: drug.description, defaultDosing: null});

test.describe("The shared catalog through the drug tree @area:catalog", () => {
    test.beforeEach(async ({context}) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("clinic A: \"amoxicillin\" opens «مضادات العدوى › البنسلينات» by itself; a protocol of ALEMOX (shared), «قطرة مرطبة» (own) and a test shared drug built through the tree, added and copied: all in the copy; the shared drug renamed by the super admin shows in A at its next load @CAT-130",
        async ({page, t, lang, data, admin}) => {
            const rt = RX_TEXTS[lang];
            const ct = CATALOG_TEXTS[lang];
            const u = unique();
            const clinic = await data.clinic();
            const own = await rxDrug(data, clinic, {name: "قطرة مرطبة"});
            const mine = await sharedDrug(admin, {name: `E2E TREE ${u} 5 ML`});
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            const tt = rt.tree;

            // The tree: "amoxicillin" → its one subcategory opens by itself
            await rx.openDrugsTab();
            await rx.tree.search("amoxicillin");
            const answer = await treeOf(await data.ownerApi(clinic), "amoxicillin");
            const category = categoryOf(answer, "Anti-infectives");
            const sub = category.subCategories.find(s => s.nameEn === "Penicillins")!;
            expect([category.nameAr, sub.nameAr]).toEqual(["مضادات العدوى", "البنسلينات"]);
            await rx.tree.expectOpen(rx.tree.subCategory(categoryName(category, lang), subCategoryName(sub, tt)));
            await expect(rx.drug(IMPORTED.alemox1g)).toBeVisible();

            // The protocol, built through the editor's tree
            const name = `Done when ${u}`;
            await navTo(page, t, t.navProtocols);
            await page.getByRole("link", {name: t.newProtocol}).click();
            await page.getByRole("textbox", {name: t.protocolName}).fill(name);
            for (const drug of [IMPORTED.alemox1g, own.name, mine.name]) await addToProtocol(page, lang, drug);
            await expect(editorLines(page, ct)).toHaveCount(3);
            const created = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/protocols");
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.protocolCreated);
            const {id} = await (await created).json() as { id: number };
            await expect(protocolCard(page, name)).toBeVisible();

            // Added to a prescription and copied: every line in the copy
            await navTo(page, t, t.navPrescription);
            await rx.openProtocolsTab();
            await rx.search("protocols").fill(name);
            await rx.addProtocol(name);
            for (const drug of [IMPORTED.alemox1g, own.name, mine.name]) await expect(rx.linesOf(drug)).toHaveCount(1);
            await markClipboard(page);
            await rx.panel.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await expectToast(page, rt.copied);
            const copied = (await readClipboard(page)).text ?? "";
            for (const drug of [IMPORTED.alemox1g, own.name, mine.name]) expect(copied, `${drug} in the copy`).toContain(drug);

            // The super admin renames the test's shared drug: A sees the new name at its next load
            const renamed = `E2E TREE ${u} RENAMED 5 ML`;
            await updateSharedDrug(admin, mine, {name: renamed});
            await page.goto(`/protocols/${id}`);
            await settled(page);
            await expect(editorLines(page, ct).filter({hasText: renamed})).toHaveCount(1);
            await expect(page.getByText(mine.name, {exact: true})).toHaveCount(0);
            await navTo(page, t, t.navPrescription);
            await rx.openDrugsTab();
            await rx.tree.show(renamed);
            await expect(rx.drug(renamed).getByText(tt.chipShared, {exact: true})).toBeVisible();
        });

    test("a role with protocols.list + protocols.details only: a protocol of shared, own and disabled lines opens read-only with the disabled chip and the alert, no drug tree, and no request to /drugs/tree or /drug-categories (no 403) @ACC-090",
        async ({page, t, lang, data, admin, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            const vigamox = await sharedByName(await data.ownerApi(clinic), IMPORTED.vigamox);
            const own = await rxDrug(data, clinic, {name: `Own ${unique()}`});
            const disabled = await sharedDrug(admin, {name: `E2E DISABLED ${unique()} 5 ML`});
            const protocol = await rxProtocol(data, clinic, [
                {drug: {id: vigamox.id, name: vigamox.name, description: null, defaultDosing: null}}, {drug: own}, {drug: asLineDrug(disabled)},
            ]);
            await withdrawSharedDrug(admin, disabled);
            const reader = await data.staff(clinic, {roles: [(await data.role(clinic, ["protocols.list", "protocols.details"])).id]});
            const catalogRequests: Request[] = [];
            page.on("request", request => {
                if (/^\/api\/v1\/(drugs\/tree|drug-categories)$/.test(new URL(request.url()).pathname)) catalogRequests.push(request);
            });

            await signIn(page, reader.phone, "asIs", `/protocols/${protocol.id}`);
            await expect(page.getByRole("heading", {level: 1, name: t.viewProtocol, exact: true})).toBeVisible();
            await expect(page.getByRole("textbox", {name: t.protocolName})).not.toBeEditable();
            for (const drug of [vigamox.name, own.name, disabled.name]) await expect(page.getByText(drug, {exact: true}), drug).toBeVisible();
            // The disabled line's chip (only that line is disabled)
            await expect(page.getByText(st.withdrawnChip, {exact: true})).toHaveCount(1);
            await expect(page.getByText(st.withdrawnChip, {exact: true})).toBeVisible();
            await expect(page.getByText(st.withdrawnAlert, {exact: true})).toBeVisible();
            await expect(page.getByRole("tree")).toHaveCount(0);
            await expect(page.getByPlaceholder(RX_TEXTS[lang].tree.searchPlaceholder)).toHaveCount(0);
            await expect(page.getByText(ct.addDrugs, {exact: true})).toHaveCount(0);
            await settled(page);
            expect(catalogRequests.map(r => r.url()), "no request to /drugs/tree or /drug-categories").toEqual([]);
            await expect(toasts(page)).toHaveCount(0);
            await healthy();
        });
});
