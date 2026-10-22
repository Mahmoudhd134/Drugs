import type {Locator, Page} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {DOSINGS, TEN_STEP_TAPER} from "../support/texts-ux.ts";
import {
    addDrugToRx,
    addProtocolToRx,
    dialog,
    drugRow,
    drugWith,
    expectNoCutOrOverlap,
    expectNoDialog,
    expectNotCut,
    fitsTheScreen,
    protocolWith,
    noHorizontalScroll,
    open,
    shownName,
    textsOf,
} from "../support/ux.ts";

const box = async (locator: Locator) => {
    const rect = await locator.boundingBox();
    expect(rect, "on screen").not.toBeNull();
    return rect!;
};

/**
 * The open dialog is full-screen, only its content scrolls (the paper itself does not), and its buttons stay on screen
 * also once the content is scrolled to its end.
 */
const expectFullScreenDialog = async (page: Page, buttons: string[], what: string) => {
    const paper = page.locator(".MuiDialog-paper").filter({visible: true});
    const {width, height} = page.viewportSize()!;
    await expect.poll(async () => {
        const rect = await box(paper);
        return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)];
    }, {message: `${what}: full-screen`}).toEqual([0, 0, width, height]);
    expect(await paper.evaluate(e => e.scrollHeight - e.clientHeight), `${what}: the dialog itself does not scroll`).toBeLessThanOrEqual(1);
    const content = paper.locator(".MuiDialogContent-root");
    expect(await content.evaluate(e => getComputedStyle(e).overflowY), `${what}: the content scrolls`).toBe("auto");
    for (const name of buttons) await expect(dialog(page).getByRole("button", {name, exact: true}), `${what}: ${name}`).toBeInViewport({ratio: 1});
    await content.evaluate(e => e.scrollTo(0, e.scrollHeight));
    for (const name of buttons) await expect(dialog(page).getByRole("button", {name, exact: true}), `${what}: ${name} after scrolling`).toBeInViewport({ratio: 1});
    await noHorizontalScroll(page, what);
};

test.describe("Phone layout (375 px) @area:ux", () => {
    test.beforeEach(({isMobile}) => {
        test.skip(!isMobile, "the phone project");
    });

    test("the drug dialog, the protocol line dialog and the prescription line dialog are full-screen: only the content scrolls, Save and Cancel stay visible @UX-002",
        async ({page, data, lang}) => {
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            const taper = await drugWith(data, clinic, {name: `Pred Forte ${unique()}`, defaultDosing: TEN_STEP_TAPER});
            const protocol = await protocolWith(data, clinic, `G ${unique()}`, [{drug: taper}]);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            await drugRow(page, taper.name).click();
            await expect(dialog(page).getByLabel(u.taperStep(10), {exact: true})).toBeAttached();
            const content = page.locator(".MuiDialog-paper .MuiDialogContent-root").filter({visible: true});
            expect(await content.evaluate(e => e.scrollHeight > e.clientHeight), "a 10-step taper is taller than the screen").toBe(true);
            await expectFullScreenDialog(page, [t.save, t.cancel], "drug dialog");
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);

            await open(page, `/protocols/${protocol.id}`);
            await page.getByRole("button", {name: u.editLine}).first().click();
            await expectFullScreenDialog(page, [t.save, t.cancel], "protocol line dialog");
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);

            await open(page, "/");
            await addDrugToRx(page, t, taper.name);
            await page.getByRole("button", {name: u.editLine}).filter({visible: true}).first().click();
            await expectFullScreenDialog(page, [t.save, t.cancel], "prescription line dialog");
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);
        });

    test("a 10-step taper: each step wraps onto 2–3 lines with a divider between steps, step 1's dose field is hidden, nothing overflows @UX-003",
        async ({page, data, lang}) => {
            const {u} = textsOf(lang);
            const clinic = await data.clinic();
            const taper = await drugWith(data, clinic, {name: `Pred Forte ${unique()}`, defaultDosing: TEN_STEP_TAPER});
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await drugRow(page, taper.name).click();
            const paper = page.locator(".MuiDialog-paper").filter({visible: true});
            const dialogBox = await box(paper);

            for (let step = 1; step <= 10; step++) {
                const row = paper.locator(`[aria-label="${u.taperStep(step)}"]`).locator("xpath=..");
                await row.scrollIntoViewIfNeeded();
                const lines = await row.locator(":scope > .MuiGrid-container > .MuiGrid-root").evaluateAll(items => {
                    const tops = items.filter(i => i.getBoundingClientRect().height > 0).map(i => Math.round(i.getBoundingClientRect().top));
                    return [...new Set(tops)].sort((a, b) => a - b).filter((top, i, all) => i === 0 || top - all[i - 1] > 4).length;
                });
                expect(lines, `step ${step}: 2–3 lines`).toBeGreaterThanOrEqual(2);
                expect(lines, `step ${step}: 2–3 lines`).toBeLessThanOrEqual(3);
                const border = await row.evaluate(e => getComputedStyle(e).borderBottomWidth);
                expect(border, `step ${step}: divider below unless last`).toBe(step < 10 ? "1px" : "0px");
                const dose = row.getByRole("spinbutton", {name: u.dose});
                if (step === 1) await expect(dose, "step 1 shows the dose above").toBeHidden();
                else await expect(dose, `step ${step}: its own dose field`).toBeVisible();
                const rect = await box(row);
                expect(rect.x, `step ${step} inside the dialog`).toBeGreaterThanOrEqual(dialogBox.x - 1);
                expect(rect.x + rect.width, `step ${step} inside the dialog`).toBeLessThanOrEqual(dialogBox.x + dialogBox.width + 1);
            }
            expect(await paper.locator(".MuiDialogContent-root").evaluate(e => e.scrollWidth - e.clientWidth), "no sideways scroll in the dialog").toBeLessThanOrEqual(0);
            await expect(paper.getByText(u.taperTotalWeeks10, {exact: true})).toBeVisible();
            await expectNoCutOrOverlap(paper, "taper dialog");
            await noHorizontalScroll(page, "taper dialog");
        });

    test("the prescription columns stack (catalog above, lines below) and «نسخ» / «تعديل ونسخ» are full-width stacked buttons @UX-004",
        async ({page, data, lang}) => {
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            const drug = await drugWith(data, clinic, {name: `Tobradex ${unique()}`});
            await signIn(page, clinic.owner.phone);
            await addDrugToRx(page, t, drug.name);
            await expect(shownName(page, drug.name)).toBeVisible();

            const catalog = await box(page.locator("main .MuiPaper-root").filter({has: page.getByRole("tab", {name: t.rxTabProtocols})}));
            const selection = await box(page.locator("main .MuiPaper-root").filter({hasText: u.rxSelected}));
            expect(catalog.y + catalog.height, "catalog above the lines").toBeLessThanOrEqual(selection.y);
            expect(Math.abs(catalog.x - selection.x), "same column").toBeLessThanOrEqual(1);

            const copy = await box(page.getByRole("button", {name: u.quickCopy, exact: true}));
            const edit = await box(page.getByRole("button", {name: u.editAndCopy, exact: true}));
            expect(copy.y + copy.height, "Copy above Edit & copy").toBeLessThanOrEqual(edit.y);
            expect(Math.abs(copy.x - edit.x), "stacked").toBeLessThanOrEqual(1);
            expect(Math.abs(copy.width - edit.width), "same width").toBeLessThanOrEqual(1);
            // Full width: the panel's width less its padding (20 px each side) and border
            expect(copy.width, "full-width").toBeGreaterThanOrEqual(selection.width - 2 * 20 - 4);
        });

    test("the conflict dialog stacks «الحالي» above «من البروتوكول», and the eye dialog's three buttons fit @UX-005",
        async ({page, data, lang}) => {
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            const drug = await drugWith(data, clinic, {name: `Tobradex ${unique()}`, defaultDosing: DOSINGS.oneDropFour.dosing});
            const other = await drugWith(data, clinic, {name: `Vigamox ${unique()}`});
            const protocol = await protocolWith(data, clinic, `G ${unique()}`, [
                {drug, dosing: DOSINGS.sixTimesOverride.dosing}, {drug: other, dosing: {eye: "ask"}},
            ]);
            await signIn(page, clinic.owner.phone);
            await addDrugToRx(page, t, drug.name);
            await addProtocolToRx(page, t, protocol.name);

            await expect(dialog(page).getByText(u.chooseEyeTitle)).toBeVisible();
            const paper = await box(page.locator(".MuiDialog-paper").filter({visible: true}));
            for (const eye of [u.eyeRight, u.eyeLeft, u.eyeBoth]) {
                const button = dialog(page).getByRole("button", {name: eye, exact: true});
                await expect(button).toBeInViewport({ratio: 1});
                const rect = await box(button);
                expect(rect.x, `${eye} inside the dialog`).toBeGreaterThanOrEqual(paper.x);
                expect(rect.x + rect.width, `${eye} inside the dialog`).toBeLessThanOrEqual(paper.x + paper.width);
            }
            await expectNoCutOrOverlap(dialog(page), "eye dialog");
            await dialog(page).getByRole("button", {name: u.eyeRight, exact: true}).click();

            await expect(dialog(page).getByText(u.conflictTitle)).toBeVisible();
            const current = await box(dialog(page).getByText(u.conflictCurrent, {exact: true}));
            const incoming = await box(dialog(page).getByText(u.conflictIncoming, {exact: true}));
            const currentText = await box(dialog(page).getByText(DOSINGS.oneDropFour.text, {exact: true}));
            expect(currentText.y, "the current sentence under «الحالي»").toBeGreaterThan(current.y);
            expect(incoming.y, "«من البروتوكول» below the current box").toBeGreaterThanOrEqual(currentText.y + currentText.height);
            expect(Math.abs(incoming.x - current.x), "stacked, not side by side").toBeLessThanOrEqual(Math.max(current.width, incoming.width));
            await expectNoCutOrOverlap(dialog(page), "conflict dialog");
            await noHorizontalScroll(page, "conflict dialog");
            await dialog(page).getByRole("button", {name: u.keepCurrent}).click();
            await expectNoDialog(page);
        });

    test("the protocol-line chips «جرعة خاصة بالبروتوكول» and «العين تُحدد عند إضافة البروتوكول» wrap on the line instead of being cut @UX-006",
        async ({page, data, lang}) => {
            const {u} = textsOf(lang);
            const clinic = await data.clinic();
            const long = `Tobradexdexamethasonetobramycinophthalmicsuspension${unique()}`;
            const drug = await drugWith(data, clinic, {name: long, defaultDosing: DOSINGS.oneDropFour.dosing});
            const other = await drugWith(data, clinic, {name: `Vigamoxmoxifloxacinophthalmicsolution${unique()}`, defaultDosing: DOSINGS.oneDropFour.dosing});
            const third = await drugWith(data, clinic, {name: `Systanehydroxypropylguarlubricant${unique()}`, defaultDosing: DOSINGS.oneDropFour.dosing});
            // One line with both chips (an override that also asks for the eye), one with each chip alone
            const protocol = await protocolWith(data, clinic, `Chips ${unique()}`, [
                {drug, dosing: {...DOSINGS.sixTimesOverride.dosing, eye: "ask"}},
                {drug: other, dosing: DOSINGS.sixTimesOverride.dosing},
                {drug: third, dosing: {eye: "ask"}},
            ]);
            await signIn(page, clinic.owner.phone, "asIs", `/protocols/${protocol.id}`);
            const main = page.locator("main");
            const custom = main.locator(".MuiChip-label").filter({hasText: u.customDosingChip});
            const ask = main.locator(".MuiChip-label").filter({hasText: u.askEyeChip});
            await expect(custom.first()).toBeVisible();
            await expect(ask.first()).toBeVisible();
            await expect(ask, "«العين تُحدد عند إضافة البروتوكول» on the 2 lines that ask for the eye").toHaveCount(2);
            for (const chip of [...await custom.all(), ...await ask.all()]) {
                await chip.scrollIntoViewIfNeeded();
                await expect(chip).toBeVisible();
            }
            await expectNotCut(custom, "protocol dosing chip");
            await expectNotCut(ask, "eye chosen when added chip");
            await fitsTheScreen(page, main.locator(".MuiChip-root"), "protocol-line chip");
            await expectNoCutOrOverlap(main, "protocol editor at 375 px");
            await noHorizontalScroll(page, "protocol editor at 375 px");
        });

    test("the menu button (tooltip «فتح القائمة») opens the navigation drawer, and choosing an entry closes it @UX-008",
        async ({page, data, lang}) => {
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone);
            const menu = page.getByRole("button", {name: t.navMenu});
            await menu.hover();
            await expect(page.getByRole("tooltip", {name: t.navMenu})).toBeVisible();
            await menu.click();
            const drawer = page.locator(".MuiDrawer-modal");
            const nav = page.getByRole("navigation", {name: t.navMain}).filter({visible: true});
            await expect(nav).toBeVisible();
            await nav.getByRole("link", {name: t.navDrugs, exact: true}).click();
            await expect(page).toHaveURL(/\/drugs$/);
            await expect(drawer).toBeHidden();
            await expect(page.getByRole("heading", {level: 1, name: t.drugsTitle})).toBeVisible();

            await menu.click();
            await expect(nav).toBeVisible();
            await nav.getByRole("link", {name: t.navProtocols, exact: true}).click();
            await expect(page).toHaveURL(/\/protocols$/);
            await expect(drawer).toBeHidden();
        });
});
