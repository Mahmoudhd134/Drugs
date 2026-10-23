import type {Browser, BrowserContext, Locator, Page} from "@playwright/test";
import {type ConsolePolicy, watchConsole} from "../support/checks.ts";
import type {ApiSession} from "../support/api.ts";
import type {Data} from "../support/data.ts";
import {expect, settled, signIn, signInSuperAdmin, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {dialog as namedDialog, editorLines, protocolCard, search} from "../support/catalog.ts";
import {dragLine, dropDaily, expectProtocolToast, markClipboard, readClipboard, RxPage, rxDrug, type RxDrug, rxName, rxProtocol} from "../support/rx.ts";
import {runState} from "../support/run.ts";
import {
    type AdminDrug,
    listDrugs,
    restoreSharedDrug,
    sharedDrug,
    withdrawSharedDrug,
} from "../support/shared.ts";
import {CATALOG_TEXTS} from "../support/texts-catalog.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import {SHARED_TEXTS} from "../support/texts-shared.ts";
import type {Lang} from "../support/texts.ts";
import {adminDrugRow, pick, searchAdmin, statusSelect} from "../support/admin-catalog.ts";
import {setLanguage} from "../support/ux.ts";
import {toast} from "../support/ui.ts";
import {expectMarkTapTooltip, expectMarkTooltip, markIn} from "../support/withdrawn.ts";

/**
 * A shared drug disabled by the super admin (design M1.7 D6; contract "Protocol editor", "Protocol cards",
 * "Prescription"): it stays in the protocols that use it, with the mark «معطّل من الإدارة» (tooltip on hover, focus and
 * tap) and the editor's alert; adding such a protocol adds its disabled lines with the chip and a second ⚠ toast.
 * Every test disables a shared drug of its own (unique name), never an imported one (design D12): this project runs
 * last.
 */

/** A shared drug of the test's own, as a protocol line's drug. */
const asLineDrug = (drug: AdminDrug): RxDrug => ({id: drug.id, name: drug.name, description: drug.description, defaultDosing: null});

/** A clinic, a shared drug W of the test's own, an own drug O; protocol P = [O (right eye), W (right eye)]; W then disabled. */
const setUp = async (data: Data, admin: ApiSession) => {
    const clinic = await data.clinic();
    const w = await sharedDrug(admin, {name: `E2E DISABLED ${unique()} 5 ML`});
    const o = await rxDrug(data, clinic, {name: rxName("Own"), dosing: dropDaily(4, 1, "right")});
    const protocol = await rxProtocol(data, clinic, [{drug: o}, {drug: asLineDrug(w), dosing: dropDaily(2, 1, "right")}]);
    await withdrawSharedDrug(admin, w);
    return {clinic, w, o, protocol};
};

/** The ⚠ toast «أُضيف رغم تعطيله من الإدارة: n»: plain (no success icon) with the ⚠ icon. */
const expectWarningToast = async (page: Page, lang: Lang, n: number) => {
    const shown = toast(page, SHARED_TEXTS[lang].protocolWithdrawn(n));
    await expect(shown).toHaveText(SHARED_TEXTS[lang].protocolWithdrawn(n), {timeout: 20_000});
    await expect(shown.locator("xpath=..")).toContainText("⚠");
    return shown;
};

/** The × «إغلاق» of a toast. */
const closeToast = (shown: Locator, lang: Lang) =>
    shown.locator("xpath=..").getByRole("button", {name: lang === "ar" ? "إغلاق" : "Close"}).click();

/** Adds protocol `name` from the prescription's Protocols tab (searched by name). */
const addProtocol = async (rx: RxPage, name: string) => {
    await rx.openProtocolsTab();
    await rx.search("protocols").fill(name);
    await rx.addProtocol(name);
};

test.describe("A disabled shared drug in protocols and prescriptions @area:catalog", () => {
    test("the editor: the line's chip with its tooltip (hover, focus), no ⊕ on it while ✎, ✕ and drag work, the alert above the lines; removing the line removes the alert @CAT-156",
        async ({page, t, lang, data, admin, healthy}) => {
            const ct = CATALOG_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            const {clinic, w, o, protocol} = await setUp(data, admin);
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            const lines = editorLines(page, ct);
            await expect(lines).toHaveCount(2);
            const wLine = lines.filter({hasText: w.name});
            const oLine = lines.filter({hasText: o.name});
            const alert = page.getByText(st.withdrawnAlert, {exact: true});
            await expect(alert).toBeVisible();
            await expectMarkTooltip(page, markIn(wLine, st.withdrawnChip), lang, "editor line");
            await expect(oLine.getByText(st.withdrawnChip, {exact: true})).toHaveCount(0);
            await expect(oLine.getByRole("button", {name: ct.addOtherEye})).toBeVisible();
            await expect(wLine.getByRole("button", {name: ct.addOtherEye})).toHaveCount(0);
            await healthy();

            // ✎ opens the line's dialog
            await wLine.getByRole("button", {name: ct.editLine}).click();
            const lineDialog = page.getByRole("dialog").filter({hasText: ct.itemDosing});
            await expect(lineDialog).toBeVisible();
            await lineDialog.getByRole("button", {name: t.cancel, exact: true}).click();
            await expect(lineDialog).toHaveCount(0);
            // Drag: the disabled line to the top
            await dragLine(page, wLine, oLine);
            await expect(lines.nth(0)).toContainText(w.name);
            // ✕: the line goes, and the alert with it
            await lines.nth(0).getByRole("button", {name: ct.removeLine}).click();
            await expect(lines).toHaveCount(1);
            await expect(alert).toHaveCount(0);
        });

    test("added to the prescription: all 3 lines, the disabled one with its chip (tooltip; kept after a reload; never copied), the protocol toast as usual, then a plain ⚠ toast; each closes on its own @CAT-158",
        async ({page, lang, data, admin, context}) => {
            await context.grantPermissions(["clipboard-read", "clipboard-write"]);
            const rt = RX_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            const w = await sharedDrug(admin, {name: `E2E DISABLED ${unique()} 5 ML`});
            const a = await rxDrug(data, clinic, {name: rxName("Alpha"), dosing: dropDaily(4, 1, "right")});
            const b = await rxDrug(data, clinic, {name: rxName("Beta"), dosing: dropDaily(3, 2, "left")});
            const protocol = await rxProtocol(data, clinic, [{drug: a}, {drug: asLineDrug(w), dosing: dropDaily(2, 1, "both")}, {drug: b}]);
            await withdrawSharedDrug(admin, w);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await addProtocol(rx, protocol.name);

            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 3)], "success");
            const warning = await expectWarningToast(page, lang, 1);
            await expect(rx.lines).toHaveCount(3);
            await expectMarkTooltip(page, markIn(rx.linesOf(w.name), st.withdrawnChip), lang, "prescription line");
            for (const own of [a, b]) await expect(rx.linesOf(own.name).getByText(st.withdrawnChip, {exact: true})).toHaveCount(0);

            // Each toast closes on its own
            await closeToast(warning, lang);
            await expect(warning).toHaveCount(0);
            await expect(toast(page, rt.protocolAdded(protocol.name, 3))).toBeVisible();
            await closeToast(toast(page, rt.protocolAdded(protocol.name, 3)), lang);
            await expect(toast(page, rt.protocolAdded(protocol.name, 3))).toHaveCount(0);

            // Never in the copied text
            await markClipboard(page);
            await rx.panel.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            const copied = await readClipboard(page);
            expect(copied.text).toContain(w.name);
            for (const text of [st.withdrawnChip, st.withdrawnTooltip]) {
                expect(copied.text).not.toContain(text);
                expect(copied.html).not.toContain(text);
            }
            // Kept after a reload
            await page.reload();
            await settled(page);
            await expect(rx.linesOf(w.name).getByText(st.withdrawnChip, {exact: true})).toBeVisible();
        });

    test("a disabled line, an ask line, an identical line and a conflict: the eye and the conflict asked once each, the protocol toast in the RX-049 order, then the ⚠ toast @CAT-159",
        async ({page, lang, data, admin}) => {
            const rt = RX_TEXTS[lang];
            const clinic = await data.clinic();
            const w = await sharedDrug(admin, {name: `E2E DISABLED ${unique()} 5 ML`});
            const ask = await rxDrug(data, clinic, {name: rxName("Ask"), dosing: dropDaily(4, 1)});
            const same = await rxDrug(data, clinic, {name: rxName("Same"), dosing: dropDaily(3, 1, "right")});
            const clash = await rxDrug(data, clinic, {name: rxName("Clash"), dosing: dropDaily(2, 1, "left")});
            const protocol = await rxProtocol(data, clinic, [
                {drug: asLineDrug(w), dosing: dropDaily(2, 1, "right")},
                {drug: ask, dosing: {eye: "ask"}},
                {drug: same},
                {drug: clash, dosing: dropDaily(4, 2, "left")},
            ]);
            await withdrawSharedDrug(admin, w);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);
            await rx.addAlone([same, clash]);
            await addProtocol(rx, protocol.name);

            const eyeQuestion = rx.dialog(rt.chooseEyeTitle);
            await expect(eyeQuestion).toBeVisible();
            await eyeQuestion.getByRole("button", {name: rt.eyeLeft, exact: true}).click();
            const conflict = rx.dialog(rt.conflictTitle);
            await expect(conflict).toBeVisible();
            await conflict.getByRole("button", {name: rt.useProtocol, exact: true}).click();

            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 2), rt.protocolReplaced(1), rt.protocolSkipped(1)], "success");
            await expectWarningToast(page, lang, 1);
            await expect(eyeQuestion).toHaveCount(0);
            await expect(conflict).toHaveCount(0);
            await expect(rx.lines).toHaveCount(4);
        });

    test("a protocol whose only line is disabled: the line with the chip, «تمت الإضافة من «P»: 1» (success), then the ⚠ toast; a protocol with no disabled line shows no ⚠ toast @CAT-160",
        async ({page, lang, data, admin}) => {
            const rt = RX_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            const clinic = await data.clinic();
            const w = await sharedDrug(admin, {name: `E2E DISABLED ${unique()} 5 ML`});
            const own = await rxDrug(data, clinic, {name: rxName("Own"), dosing: dropDaily(4, 1, "right")});
            const only = await rxProtocol(data, clinic, [{drug: asLineDrug(w), dosing: dropDaily(2, 1, "right")}]);
            const plain = await rxProtocol(data, clinic, [{drug: own}]);
            await withdrawSharedDrug(admin, w);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, rt);

            await addProtocol(rx, plain.name);
            await expectProtocolToast(page, [rt.protocolAdded(plain.name, 1)], "success");
            await expect(toast(page, st.protocolWithdrawn(1))).toHaveCount(0);

            await addProtocol(rx, only.name);
            await expectProtocolToast(page, [rt.protocolAdded(only.name, 1)], "success");
            await expectWarningToast(page, lang, 1);
            await expect(rx.linesOf(w.name).getByText(st.withdrawnChip, {exact: true})).toBeVisible();
        });

    test("restored: back in the lists and search of every clinic; its protocol lines lose the chip and are added without the warning @CAT-163",
        async ({page, t, lang, data, admin}) => {
            const rt = RX_TEXTS[lang];
            const ct = CATALOG_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            const {clinic, w, protocol} = await setUp(data, admin);
            const other = await data.clinic();
            const apiA = await data.ownerApi(clinic);
            const apiB = await data.ownerApi(other);
            expect((await listDrugs(apiA, {search: w.name})).items.map(d => d.name)).not.toContain(w.name);

            await restoreSharedDrug(admin, w);
            for (const api of [apiA, apiB]) {
                const found = await listDrugs(api, {search: w.name});
                expect(found.items.map(d => d.name)).toContain(w.name);
            }
            // B's drugs page: found by search, the count the API's
            await signIn(page, other.owner.phone, "asIs", "/drugs");
            await search(page, page.getByPlaceholder(t.searchDrugs), w.name);
            await expect(page.getByRole("row").filter({has: page.getByText(w.name, {exact: true})})).toBeVisible();

            // A's protocol: no chip, no alert; added without the ⚠ toast
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            await expect(editorLines(page, ct)).toHaveCount(2);
            await expect(page.getByText(st.withdrawnChip, {exact: true})).toHaveCount(0);
            await expect(page.getByText(st.withdrawnAlert, {exact: true})).toHaveCount(0);
            await page.goto("/");
            const rx = new RxPage(page, rt);
            await addProtocol(rx, protocol.name);
            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 2)], "success");
            await expect(toast(page, st.protocolWithdrawn(1))).toHaveCount(0);
            await expect(rx.linesOf(w.name).getByText(st.withdrawnChip, {exact: true})).toHaveCount(0);
        });
});

/** Opens every place the mark of `w` shows for the owner of `clinic` (and the super admin's rows), checking each. */
const visitMarks = async (page: Page, admin: Page, lang: Lang, w: AdminDrug, protocolId: number, protocolName: string,
                          check: (page: Page, mark: Locator, what: string, insideControl?: boolean) => Promise<void>) => {
    const ct = CATALOG_TEXTS[lang];
    const rt = RX_TEXTS[lang];
    const st = SHARED_TEXTS[lang];
    await page.goto(`/protocols/${protocolId}`);
    await settled(page);
    await check(page, markIn(editorLines(page, ct).filter({hasText: w.name}), st.withdrawnChip), "editor line");
    await page.goto("/protocols");
    await settled(page);
    await check(page, markIn(protocolCard(page, protocolName), st.withdrawnCount(1)), "protocols page card");
    await page.goto("/");
    await settled(page);
    const rx = new RxPage(page, rt);
    await rx.openProtocolsTab();
    await rx.search("protocols").fill(protocolName);
    const option = rx.option(protocolName);
    // Inside the picker option (a control): no Tab stop of its own (contract D17)
    await check(page, markIn(option, st.withdrawnCount(1)), "prescription tab card", true);
    if (await rx.linesOf(w.name).count() === 0) {
        await rx.addProtocol(protocolName);
        await expect(rx.linesOf(w.name)).toHaveCount(1);
    }
    await check(page, markIn(rx.linesOf(w.name), st.withdrawnChip), "prescription line");

    for (const status of [st.statusWithdrawn, st.statusAll]) {
        await admin.goto("/admin/drugs");
        await settled(admin);
        await pick(admin, statusSelect(admin, lang), status);
        await searchAdmin(admin, lang, w.name);
        await check(admin, markIn(adminDrugRow(admin, w.name), st.withdrawnChip), `admin row on ${status}`);
    }
};

/**
 * A 375 px touch phone of the project's language, its own cookies; its console is watched and it joins the test's
 * opened pages (the end-of-test page checks run on it, then it closes), like `newBrowser`.
 */
const touchPhone = async (browser: Browser, lang: Lang, watch: {
    consoleErrors: string[]; consolePolicy: ConsolePolicy; opened: { pages: Page[]; contexts: BrowserContext[] };
}) => {
    const context = await browser.newContext({
        baseURL: runState().baseURL, viewport: {width: 375, height: 812}, isMobile: true, hasTouch: true,
        locale: lang === "ar" ? "ar-EG" : "en-US",
    });
    watch.opened.contexts.push(context);
    const page = await context.newPage();
    watchConsole(page, watch.consoleErrors, watch.consolePolicy);
    watch.opened.pages.push(page);
    return {context, page};
};

test.describe("The «معطّل من الإدارة» mark and its tooltip everywhere @area:catalog", () => {
    test("Arabic: in each place, hover and Tab focus show «عطّل مدير المنصة هذا الدواء…» (RTL, inside the viewport), Esc closes it; tapped at 375 px too; never copied @CAT-167",
        async ({page, data, admin, newBrowser, browser, context, healthy, consoleErrors, consolePolicy, opened}) => {
            test.slow();
            await context.grantPermissions(["clipboard-read", "clipboard-write"]);
            const lang: Lang = "ar";
            const {clinic, w, protocol} = await setUp(data, admin);
            await signIn(page, clinic.owner.phone);
            const adminBrowser = await newBrowser();
            await signInSuperAdmin(adminBrowser.page);
            await visitMarks(page, adminBrowser.page, lang, w, protocol.id, protocol.name,
                (target, mark, what, insideControl) => expectMarkTooltip(target, mark, lang, what, insideControl));

            // The copied prescription holds neither the chip nor the tooltip
            const rt = RX_TEXTS[lang];
            const st = SHARED_TEXTS[lang];
            await markClipboard(page);
            await new RxPage(page, rt).panel.getByRole("button", {name: rt.quickCopy, exact: true}).click();
            const copied = await readClipboard(page);
            for (const text of [st.withdrawnChip, st.withdrawnTooltip]) expect(copied.text ?? "").not.toContain(text);

            // A touch phone: a tap shows it at once, a tap elsewhere closes it; each 375 px page gets the page checks
            // (RTL, no sideways scroll, axe, cut text): no other project visits these pages on a phone
            const watch = {consoleErrors, consolePolicy, opened};
            const phone = await touchPhone(browser, lang, watch);
            const adminPhone = await touchPhone(browser, lang, watch);
            await signIn(phone.page, clinic.owner.phone);
            await signInSuperAdmin(adminPhone.page);
            await visitMarks(phone.page, adminPhone.page, lang, w, protocol.id, protocol.name, async (target, mark, what) => {
                await expectMarkTapTooltip(target, mark, lang, `375 px ${what}`);
                await healthy(target);
            });
        });

    test("English: \"Disabled by admin\" with its tooltip in each place, the editor alert, the ⚠ toast, \"Disable drug\" / \"Enable drug\", their toasts and the status filter @CAT-168",
        async ({page, data, admin, newBrowser}) => {
            test.slow();
            const lang: Lang = "en";
            const st = SHARED_TEXTS.en;
            const rt = RX_TEXTS.en;
            const {clinic, w, protocol} = await setUp(data, admin);
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            await setLanguage(page, "en");
            await expect(page.getByText(st.withdrawnAlert, {exact: true})).toBeVisible();

            // The ⚠ toast of the prescription
            await page.goto("/");
            await settled(page);
            const rx = new RxPage(page, rt);
            await addProtocol(rx, protocol.name);
            await expectProtocolToast(page, [rt.protocolAdded(protocol.name, 2)], "success");
            await expectWarningToast(page, lang, 1);

            const adminBrowser = await newBrowser();
            await signInSuperAdmin(adminBrowser.page);
            await setLanguage(adminBrowser.page, "en");
            await visitMarks(page, adminBrowser.page, lang, w, protocol.id, protocol.name,
                (target, mark, what, insideControl) => expectMarkTooltip(target, mark, lang, what, insideControl));

            // The admin's words: the status filter, «Enable drug» (no confirm) and «Disable drug» (confirm), their toasts
            const adm = adminBrowser.page;
            await statusSelect(adm, lang).click();
            await expect(adm.getByRole("option")).toHaveText([st.statusActive, st.statusWithdrawn, st.statusAll]);
            await adm.keyboard.press("Escape");
            const row = adminDrugRow(adm, w.name);
            await row.getByRole("button", {name: st.restoreRow(w.name)}).click();
            await expect(toast(adm, st.restoredToast)).toBeVisible();
            await row.getByRole("button", {name: st.withdrawRow(w.name)}).click();
            const confirm = namedDialog(adm, st.withdrawTitle(w.name));
            await expect(confirm).toBeVisible();
            await confirm.getByRole("button").filter({hasNotText: "Cancel"}).click();
            await expect(toast(adm, st.withdrawnToast)).toBeVisible();
        });
});
