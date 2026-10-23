import type {Locator, Page} from "@playwright/test";
import {expect, settled, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {editorLines, protocolCard} from "../support/catalog.ts";
import {adminDrugRow, pick, searchAdmin, statusSelect} from "../support/admin-catalog.ts";
import {markClipboard, readClipboard, RxPage, type RxDrug, rxProtocol} from "../support/rx.ts";
import {
    type AdminDrug,
    getSharedDrug,
    IMPORTED,
    type Paged,
    sharedDrug,
    updateSharedDrug,
    withdrawSharedDrug,
} from "../support/shared.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";
import {TEXTS} from "../support/texts.ts";
import {expectToast, recordRequests} from "../support/ui.ts";
import {expectMarkTooltip, markIn} from "../support/withdrawn.ts";

/**
 * The super admin edits the shared catalog (design M1.7 D6, D8, D9; M1.7b contract "Admin drugs page"): add, edit,
 * «تعطيل الدواء» (confirm), «تفعيل الدواء» (none), and what clinics then see. Every test works on shared drugs of its
 * own (unique names), never on imported ones (design D12); imported drugs are only read. Arabic UI (this project).
 */

const st = SHARED_TEXTS.ar;
const t = TEXTS.ar;
const asLineDrug = (drug: AdminDrug): RxDrug => ({id: drug.id, name: drug.name, description: drug.description, defaultDosing: null});

/** The admin drugs page on a status, searched for `name`. */
const openAdminOn = async (page: Page, name: string, status = st.statusActive) => {
    await page.goto("/admin/drugs");
    await settled(page);
    if (status !== st.statusActive) await pick(page, statusSelect(page, "ar"), status);
    await searchAdmin(page, "ar", name);
    await settled(page);
};

/** The confirmation's confirm button (the one that is not «إلغاء»). */
const confirmButton = (confirm: Locator) => confirm.getByRole("button").filter({hasNotText: t.cancel});

test.describe("The super admin's shared drugs @area:admin", () => {
    test("«تعطيل الدواء»: the confirmation names the drug, says where it disappears and stays, focus on «إلغاء»; confirmed: «تم تعطيل الدواء» and it leaves «مفعّل» @CAT-206",
        async ({page, admin, healthy}) => {
            const drug = await sharedDrug(admin);
            await signInSuperAdmin(page);
            await openAdminOn(page, drug.name);
            await adminDrugRow(page, drug.name).getByRole("button", {name: st.withdrawRow(drug.name)}).click();
            const confirm = page.getByRole("dialog", {name: st.withdrawTitle(drug.name)});
            await expect(confirm).toBeVisible();
            await expect(confirm).toContainText(st.withdrawMessage);
            await expect(confirm.getByRole("button", {name: t.cancel})).toBeFocused();
            await healthy();
            await confirmButton(confirm).click();
            await expectToast(page, st.withdrawnToast);
            await expect(adminDrugRow(page, drug.name)).toHaveCount(0);
            expect((await getSharedDrug(admin, drug)).withdrawn).toBe(true);
        });

    test("on «معطّل»: the row's chip with its tooltip (hover, focus) and «تفعيل الدواء» without a confirmation: «تم تفعيل الدواء» @CAT-207",
        async ({page, admin, healthy}) => {
            const drug = await sharedDrug(admin);
            await withdrawSharedDrug(admin, drug);
            await signInSuperAdmin(page);
            await openAdminOn(page, drug.name, st.statusWithdrawn);
            const row = adminDrugRow(page, drug.name);
            await expectMarkTooltip(page, markIn(row, st.withdrawnChip), "ar", "admin row");
            await healthy();
            await row.getByRole("button", {name: st.restoreRow(drug.name)}).click();
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await expectToast(page, st.restoredToast);
            await expect(adminDrugRow(page, drug.name)).toHaveCount(0);
            expect((await getSharedDrug(admin, drug)).withdrawn).toBe(false);
        });

    test("double clicks on Save and on the disable confirmation send one request each @CAT-216", async ({page}) => {
        const name = `E2E DOUBLE ${unique()} 5 ML`;
        await signInSuperAdmin(page, "/admin/drugs");
        const posts = recordRequests(page, "POST", /^\/api\/v1\/admin\/drugs$/);
        await page.getByRole("button", {name: st.adminAdd}).click();
        const form = page.getByRole("dialog", {name: st.adminNew});
        await form.getByRole("textbox", {name: t.drugName}).fill(name);
        await form.getByRole("combobox", {name: /^التصنيف(?! الفرعي)/}).click();
        await page.getByRole("option", {name: "العيون", exact: true}).click();
        await form.getByRole("button", {name: t.save}).dblclick();
        await expectToast(page, t.drugAdded);
        expect(posts).toHaveLength(1);

        const withdraws = recordRequests(page, "POST", /^\/api\/v1\/admin\/drugs\/\d+\/withdraw$/);
        await searchAdmin(page, "ar", name);
        await adminDrugRow(page, name).getByRole("button", {name: st.withdrawRow(name)}).click();
        await confirmButton(page.getByRole("dialog", {name: st.withdrawTitle(name)})).dblclick();
        await expectToast(page, st.withdrawnToast);
        expect(withdraws).toHaveLength(1);
    });

    /**
     * Demoted while on /admin/drugs (design CAT-218; platform-admin tech "Lost platform context"): the demotion takes a
     * restart of the API (Platform:SuperAdminPhones), which an e2e run can't do, so the API's answers after it are played
     * back: 403 on the admin call `write`, `/me` without a context, the refresh 401.
     */
    const demoteOn = async (page: Page, method: string, write: RegExp) => {
        await page.route(write, route => route.request().method() !== method ? route.fallback() : route.fulfill({
            status: 403, contentType: "application/problem+json",
            json: {status: 403, code: "forbidden", errors: [{code: "forbidden", description: "Forbidden"}]},
        }));
        await page.route(/\/api\/v1\/me$/, async route => {
            const real = await route.fetch();
            const body = await real.json() as { user: Record<string, unknown> };
            await route.fulfill({response: real, json: {...body, context: null, user: {...body.user, isSuperAdmin: false}, permissions: []}});
        });
        await page.route(/\/api\/v1\/auth\/refresh$/, route => route.fulfill({
            status: 401, contentType: "application/problem+json", json: {status: 401, code: "unauthorized"},
        }));
    };

    /** Out of the admin area, on /login, told «لم تعد لديك صلاحية دخول «إدارة المنصة». سجّل الدخول من جديد للمتابعة.» */
    const expectSignedOutOfPlatform = async (page: Page) => {
        await expect(page).not.toHaveURL(/\/admin/);
        await expect(page).toHaveURL(/\/login/);
        await expectToast(page, t.clinicLostSignedOut(t.platform));
    };

    test("demoted while on /admin/drugs: disabling a drug answers 403, the app leaves the admin area for /login with «لم تعد لديك صلاحية دخول «إدارة المنصة»…» @CAT-218",
        async ({page, admin, allowApiErrors}) => {
            allowApiErrors({status: 403, method: "POST", path: /^\/api\/v1\/admin\/drugs\/\d+\/withdraw$/},
                {status: 401, method: "POST", path: /^\/api\/v1\/auth\/refresh$/});
            const drug = await sharedDrug(admin);
            await signInSuperAdmin(page);
            await openAdminOn(page, drug.name);
            await demoteOn(page, "POST", /\/api\/v1\/admin\/drugs\/\d+\/withdraw$/);
            const forbidden = page.waitForResponse(r => /\/withdraw$/.test(r.url()) && r.status() === 403);
            await adminDrugRow(page, drug.name).getByRole("button", {name: st.withdrawRow(drug.name)}).click();
            await confirmButton(page.getByRole("dialog", {name: st.withdrawTitle(drug.name)})).click();
            await forbidden;
            await expectSignedOutOfPlatform(page);
            expect((await getSharedDrug(admin, drug)).withdrawn).toBe(false);
        });

    test("demoted while the shared drug dialog is open: saving answers 403, the app leaves the admin area for /login with the same message @CAT-218",
        async ({page, admin, allowApiErrors}) => {
            allowApiErrors({status: 403, method: "PUT", path: /^\/api\/v1\/admin\/drugs\/\d+$/},
                {status: 401, method: "POST", path: /^\/api\/v1\/auth\/refresh$/});
            const drug = await sharedDrug(admin);
            await signInSuperAdmin(page);
            await openAdminOn(page, drug.name);
            await adminDrugRow(page, drug.name).getByRole("button", {name: /^تعديل/}).click();
            const form = page.getByRole("dialog", {name: st.adminEdit});
            await form.getByRole("textbox", {name: "الوصف"}).fill("وصف لن يُحفظ");
            await demoteOn(page, "PUT", /\/api\/v1\/admin\/drugs\/\d+$/);
            const forbidden = page.waitForResponse(r => r.request().method() === "PUT" && /\/admin\/drugs\/\d+$/.test(r.url()) && r.status() === 403);
            await form.getByRole("button", {name: t.save}).click();
            await forbidden;
            await expectSignedOutOfPlatform(page);
            expect((await getSharedDrug(admin, drug)).description).toBe(drug.description);
        });

    test("renamed by the super admin while used in A's protocol: A's editor and card show the new name at their next load @CAT-175",
        async ({page, data, admin}) => {
            const ct = CATALOG_TEXTS.ar;
            const clinic = await data.clinic();
            const drug = await sharedDrug(admin);
            const protocol = await rxProtocol(data, clinic, [{drug: asLineDrug(drug)}]);
            const renamed = `${drug.name} RENAMED`;
            await updateSharedDrug(admin, drug, {name: renamed});
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            await expect(editorLines(page, ct).first()).toContainText(renamed);
            await page.goto("/protocols");
            await settled(page);
            await expect(protocolCard(page, protocol.name)).toContainText(renamed);
        });

    test("a test-made shared drug with an imported drug's exact fields (its pack-size name, its 397-character ingredients, its category), saved unchanged in the dialog: 200, nothing changes @CAT-187",
        async ({page, admin}) => {
            // The imported drug, read only (by exact name, design D12); the test's own copy carries its exact texts
            const found = await admin.ok<Paged<AdminDrug>>("GET",
                `/api/v1/admin/drugs?status=all&search=${encodeURIComponent(IMPORTED.longestIngredients)}`);
            const source = found.items.find(d => d.name === IMPORTED.longestIngredients)!;
            expect(source, IMPORTED.longestIngredients).toBeTruthy();
            const ingredients = source.activeIngredients!;
            expect(ingredients).toHaveLength(397);
            // Its pack-size name, made unique (D12): the imported name with the test's mark in front
            const drug = await sharedDrug(admin, {
                name: `E2E ${unique()} ${source.name}`, activeIngredients: ingredients,
                categoryId: source.category.id, subCategoryId: source.subCategory?.id ?? null,
            });
            expect(drug.activeIngredients).toBe(ingredients);
            await signInSuperAdmin(page);
            await openAdminOn(page, drug.name);
            const puts = recordRequests(page, "PUT", /^\/api\/v1\/admin\/drugs\/\d+$/);
            await adminDrugRow(page, drug.name).getByRole("button", {name: /^تعديل/}).click();
            const form = page.getByRole("dialog", {name: st.adminEdit});
            await expect(form.getByRole("textbox", {name: st.activeIngredients})).toHaveValue(ingredients);
            const answered = page.waitForResponse(r => /\/api\/v1\/admin\/drugs\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() === "PUT");
            await form.getByRole("button", {name: t.save}).click();
            expect((await answered).status()).toBe(200);
            await expectToast(page, t.drugUpdated);
            expect(puts).toHaveLength(1);
            const after = await getSharedDrug(admin, drug);
            expect({name: after.name, activeIngredients: after.activeIngredients, description: after.description, category: after.category, subCategory: after.subCategory})
                .toEqual({name: drug.name, activeIngredients: drug.activeIngredients, description: drug.description, category: drug.category, subCategory: drug.subCategory});
        });
});

test.describe("Shared drugs reach every clinic's prescription @area:prescription", () => {
    test.beforeEach(async ({context}) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    /** Adds a drug alone from the Drugs tab after searching its exact name. */
    const addAlone = async (rx: RxPage, name: string) => {
        await rx.openDrugsTab();
        await rx.search("drugs").fill(name);
        await rx.catalog.getByRole("option").filter({has: rx.page.getByText(name, {exact: true})}).click();
        await expect(rx.linesOf(name)).toHaveCount(1);
    };

    test("`CARBOPLATIN \"EBEWE\" 150 MG VIAL` and an admin-made `<b>X</b> & Y`: shown literally, copied with the HTML escaped @CAT-001",
        async ({page, data, admin}) => {
            const rt = RX_TEXTS.ar;
            const tagged = `<b>X ${unique()}</b> & Y`;
            await sharedDrug(admin, {name: tagged});
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await addAlone(rx, IMPORTED.carboplatin);
            await addAlone(rx, tagged);
            await expect(rx.panel.getByText(tagged, {exact: true})).toBeVisible();
            await expect(rx.panel.locator("b")).toHaveCount(0);

            await markClipboard(page);
            await rx.panel.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await expectToast(page, rt.copied);
            const copied = await readClipboard(page);
            expect(copied.text).toBe(`${IMPORTED.carboplatin}\n\n${tagged}`);
            // Decision D25: `<`, `>` and `&` escaped (no markup injected); a `"` may stay literal in a text node
            expect(copied.html).toContain(tagged.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
            expect(copied.html).not.toContain("<b>");
            // Read back as HTML, both names are the same text, and no element came from a name
            const parsed = await page.evaluate(html => {
                const body = new DOMParser().parseFromString(html, "text/html").body;
                return {strong: [...body.querySelectorAll("strong")].map(e => e.textContent), bold: body.querySelectorAll("b").length};
            }, copied.html ?? "");
            expect(parsed).toEqual({strong: [IMPORTED.carboplatin, tagged], bold: 0});
        });

    test("a shared drug with a description and no edit: the copied text is its full name and, under it, its description @RX-107",
        async ({page, data, admin}) => {
            const rt = RX_TEXTS.ar;
            const drug = await sharedDrug(admin, {description: "قطرة مضاد حيوي للعين"});
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await addAlone(rx, drug.name);
            await rx.expectLines([[drug.name, "قطرة مضاد حيوي للعين"]]);
            await markClipboard(page);
            await rx.panel.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            await expectToast(page, rt.copied);
            expect((await readClipboard(page)).text).toBe(`${drug.name}\nقطرة مضاد حيوي للعين`);
        });
});
