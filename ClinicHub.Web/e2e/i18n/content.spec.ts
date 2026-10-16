import type {Locator, Page} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {unique, uniqueDigits} from "../support/phones.ts";
import type {Lang} from "../support/texts.ts";
import {DOSINGS, TEN_STEP_TAPER} from "../support/texts-ux.ts";
import {expectToast, toast} from "../support/ui.ts";
import {
    addDrugToRx,
    addGroupToRx,
    animationsDone,
    chooseLanguage,
    dialog,
    drugRow,
    drugWith,
    expectNoDialog,
    groupCard,
    groupWith,
    open,
    pageChecks,
    rxTab,
    searchBox,
    setLanguage,
    shownName,
    textRect,
    textsOf,
    tourClinic,
} from "../support/ux.ts";

/** Arabic-Indic digits (٠–٩) and their Persian forms (۰–۹): never in the UI. */
const EASTERN_DIGITS = /[٠-٩۰-۹]/;

const expectWesternDigits = async (page: Page, what: string) => {
    const text = await page.evaluate(() => document.body.innerText);
    expect(text.match(EASTERN_DIGITS), `${what}: Western digits only`).toBeNull();
};

/** Shown exactly as typed (whole text of a visible element). */
const expectShown = async (scope: Page | Locator, text: string, what: string) => {
    await expect(scope.getByText(text, {exact: true}).filter({visible: true}).first(), `${what}: «${text}»`).toBeVisible();
};

test.describe("Content in both languages @area:i18n", () => {
    test("drug and group names and descriptions show exactly as typed (Arabic and English) in both UI languages @I18N-008",
        async ({page, data, lang}) => {
            const tour = await tourClinic(data);
            const latinGroup = await groupWith(data, tour.clinic, `Post cataract ${unique()}`, [{drug: tour.arabic}]);
            await signIn(page, tour.clinic.owner.phone);

            for (const ui of [lang, lang === "ar" ? "en" : "ar"] as Lang[]) {
                await test.step(`UI ${ui}`, async () => {
                    if (ui !== lang) await chooseLanguage(page, ui);
                    const {t} = textsOf(ui);
                    await open(page, "/drugs");
                    for (const drug of [tour.latin, tour.arabic]) {
                        await expectShown(drugRow(page, drug.name), drug.name, "drugs table");
                        await expectShown(drugRow(page, drug.name), drug.description!, "drugs table");
                    }
                    await open(page, "/groups");
                    await expectShown(groupCard(page, tour.group.name), tour.group.name, "group card");
                    await expectShown(groupCard(page, tour.group.name), tour.latin.name, "group card drug");
                    await expectShown(groupCard(page, latinGroup.name), latinGroup.name, "group card");
                    await expectShown(groupCard(page, latinGroup.name), tour.arabic.name, "group card drug");
                    await open(page, `/groups/${tour.group.id}`);
                    await expect(page.getByRole("textbox", {name: t.groupName})).toHaveValue(tour.group.name);
                    await expectShown(page, tour.latin.name, "group line");
                    await expectShown(page, tour.arabic.name, "group line");
                    await open(page, "/");
                    await rxTab(page, t, "drugs");
                    await searchBox(page, t.searchDrugs).fill(tour.arabic.name);
                    const option = page.getByRole("option").filter({visible: true}).filter({hasText: tour.arabic.name});
                    await expectShown(option, tour.arabic.name, "drug picker");
                    await expectShown(option, tour.arabic.description!, "drug picker");
                    await rxTab(page, t, "groups");
                    await searchBox(page, t.searchGroups).fill(latinGroup.name);
                    await expectShown(page.getByRole("option").filter({visible: true}), latinGroup.name, "group picker");
                });
            }
        });

    test("in the English UI the dosing sentences are Arabic: drugs table, picker, dialog preview, group lines, prescription lines, conflict boxes and the copied text @I18N-009",
        async ({page, data}, testInfo) => {
            test.skip(testInfo.project.name === "ar-desktop", "the English UI (en-desktop, and the phone switched to English)");
            const tour = await tourClinic(data);
            await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
            await signIn(page, tour.clinic.owner.phone, "asIs", "/drugs");
            await setLanguage(page, "en");
            const {t, u} = textsOf("en");

            await expectShown(drugRow(page, tour.latin.name), DOSINGS.oneDropFour.text, "drugs table");
            await expectShown(drugRow(page, tour.arabic.name), DOSINGS.twoDropsLeft.text, "drugs table");
            await drugRow(page, tour.latin.name).click();
            await expectShown(dialog(page), DOSINGS.oneDropFour.text, "dialog preview");
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);

            await open(page, `/groups/${tour.group.id}`);
            await expectShown(page, DOSINGS.sixTimesOverride.text, "group line with an override");
            await page.getByRole("button", {name: u.editLine}).first().click();
            await expectShown(dialog(page), DOSINGS.sixTimesOverride.text, "group line dialog preview");
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);

            await open(page, "/");
            await rxTab(page, t, "drugs");
            await searchBox(page, t.searchDrugs).fill(tour.latin.name);
            await expectShown(page.getByRole("option").filter({visible: true}), DOSINGS.oneDropFour.text, "drug picker");
            await searchBox(page, t.searchDrugs).fill("");
            await addDrugToRx(page, t, tour.latin.name);
            await expectShown(page.locator("main"), DOSINGS.oneDropFour.text, "prescription line");
            await addGroupToRx(page, t, tour.group.name);
            await dialog(page).getByRole("button", {name: u.eyeLeft, exact: true}).click();
            await expect(dialog(page).getByText(u.conflictTitle)).toBeVisible();
            await expectShown(dialog(page), DOSINGS.oneDropFour.text, "conflict: current");
            await expectShown(dialog(page), DOSINGS.sixTimesOverride.text, "conflict: from the group");
            await dialog(page).getByRole("button", {name: u.useGroup}).click();
            await expectNoDialog(page);
            await expectShown(page.locator("main"), DOSINGS.sixTimesOverride.text, "prescription line replaced");
            await expectShown(page.locator("main"), DOSINGS.twoDropsLeft.text, "prescription line (ask eye: left chosen)");

            await page.getByRole("button", {name: u.quickCopy, exact: true}).click();
            await expectToast(page, u.copied);
            const copied = await page.evaluate(async () => {
                const [item] = await navigator.clipboard.read();
                return {plain: await (await item.getType("text/plain")).text(), html: await (await item.getType("text/html")).text()};
            });
            for (const sentence of [DOSINGS.sixTimesOverride.text, DOSINGS.twoDropsLeft.text]) {
                expect(copied.plain, "copied plain text").toContain(sentence);
                expect(copied.html, "copied HTML").toContain(sentence);
            }
            // Nothing of the English UI in the prescription text
            expect(copied.plain.replace(tour.latin.name, ""), "no Latin letters but the drug name").not.toMatch(/[A-Za-z]/);
            // On a phone the tap leaves the Copy button's tooltip open: let it go before the end-of-test scan
            await page.mouse.move(1, 1);
            await expect(page.getByRole("tooltip")).toHaveCount(0);
            await animationsDone(page);
        });

    test("numbers use Western digits: counts, pagination, results, line and step numbers, the taper total and the sentences @I18N-014",
        async ({page, data, lang}) => {
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            const drug = await drugWith(data, clinic, {name: `Tobradex ${unique()}`, defaultDosing: DOSINGS.twoDropsLeft.dosing});
            const taper = await drugWith(data, clinic, {name: `Pred Forte ${unique()}`, defaultDosing: TEN_STEP_TAPER});
            const group = await groupWith(data, clinic, `G ${uniqueDigits()}`, [{drug}, {drug: taper}]);
            const api = await data.ownerApi(clinic);
            const total = (await api.ok<{ totalCount: number }>("GET", "/api/v1/drugs?pageSize=20")).totalCount;
            const groups = (await api.ok<{ totalCount: number }>("GET", "/api/v1/drug-groups?pageSize=20")).totalCount;
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            await expect(page.getByText(u.drugsSubtitle(total), {exact: true})).toBeVisible();
            await expect(page.getByText(u.displayedRows(1, total, total), {exact: true})).toBeVisible();
            await expectShown(page, DOSINGS.twoDropsLeft.text, "sentence");
            await expectWesternDigits(page, "drugs");
            await drugRow(page, taper.name).click();
            for (const step of [1, 5, 10]) {
                await expect(dialog(page).getByLabel(u.taperStep(step), {exact: true})).toHaveText(String(step));
            }
            await expect(dialog(page).getByText(u.taperTotalWeeks10, {exact: true})).toBeVisible();
            await expectWesternDigits(page, "taper dialog");
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);

            await open(page, "/groups");
            await expect(page.getByText(u.groupsSubtitle(groups), {exact: true})).toBeVisible();
            await expect(groupCard(page, group.name).getByText(u.groupDrugCount(2), {exact: true})).toBeVisible();
            await expectWesternDigits(page, "groups");

            await open(page, "/");
            await rxTab(page, t, "drugs");
            await expect(page.getByText(u.results(total), {exact: true}).filter({visible: true})).toBeVisible();
            await addGroupToRx(page, t, group.name);
            await expectToast(page, u.groupAdded(group.name, 2));
            const lines = page.locator("main .MuiAvatar-root").filter({visible: true});
            await expect(lines.filter({hasText: /^1$/})).toHaveCount(1);
            await expect(lines.filter({hasText: /^2$/})).toHaveCount(1);
            await expectWesternDigits(page, "prescription");
        });

    test("a Latin name in an Arabic message and an Arabic name in an English message: the quotes stay around the name and the sentence keeps its order (bidi isolates) @I18N-015",
        async ({page, data, lang}) => {
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            // The other script than the UI's
            const name = lang === "ar" ? `Tobradex ${unique()}` : `قطرة مرطبة ${uniqueDigits()}`;
            const drug = await drugWith(data, clinic, {name});
            await signIn(page, clinic.owner.phone);
            const [opening, closing] = lang === "ar" ? ["«", "»"] : ["“", "”"];

            /** Quote, name, quote and the next word in reading order on screen (right to left in Arabic). */
            const expectInOrder = async (element: Locator, next: string, what: string) => {
                const before = await textRect(element, opening);
                const shown = await textRect(element, name);
                const after = await textRect(element, closing);
                const rest = await textRect(element, next);
                // Glyph boxes may touch or overlap a little (side bearings, fallback fonts): the quotes' middles are past
                // the name's middle and at most half a glyph inside its ends
                const mid = (r: { left: number; right: number }) => (r.left + r.right) / 2;
                const slack = 8;
                if (lang === "ar") {
                    expect(mid(before), `${what}: « right of the name`).toBeGreaterThan(Math.max(mid(shown), shown.right - slack));
                    expect(mid(after), `${what}: » left of the name`).toBeLessThan(Math.min(mid(shown), shown.left + slack));
                    expect(mid(rest), `${what}: the sentence goes on left of »`).toBeLessThan(mid(after));
                } else {
                    expect(mid(before), `${what}: “ left of the name`).toBeLessThan(Math.min(mid(shown), shown.left + slack));
                    expect(mid(after), `${what}: ” right of the name`).toBeGreaterThan(Math.max(mid(shown), shown.right - slack));
                    expect(mid(rest), `${what}: the sentence goes on right of ”`).toBeGreaterThan(mid(after));
                }
            };

            await addDrugToRx(page, t, name);
            await expect(shownName(page, name)).toBeVisible();
            await addDrugToRx(page, t, name);
            await expectToast(page, u.alreadyAdded(name));
            await expectInOrder(toast(page, u.alreadyAdded(name)), lang === "ar" ? "موجود" : "is already", "already-added toast");

            await open(page, "/drugs");
            await drugRow(page, drug.name).getByRole("button", {name: t.delete}).click();
            const message = dialog(page).getByText(u.deleteDrugMessage(name), {exact: true});
            await expect(message).toBeVisible();
            await expectInOrder(message, lang === "ar" ? "وإزالته" : "will be deleted", "delete confirmation");
            await pageChecks(page, "delete confirmation");
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);
        });

    test("name, description, group name, note and custom frequency inputs align by their own text (dir=auto) in either UI @I18N-018",
        async ({page, data, lang}) => {
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            const drug = await drugWith(data, clinic, {name: `Tobradex ${unique()}`});
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            const followsText = async (input: Locator, what: string) => {
                await expect(input).toHaveAttribute("dir", "auto");
                for (const [text, dir] of [["قطرة للعين", "rtl"], ["Eye drops", "ltr"]] as const) {
                    await input.fill(text);
                    expect(await input.evaluate((e, d) => e.matches(`:dir(${d})`) && getComputedStyle(e).direction === d, dir),
                        `${what}: «${text}» is ${dir}`).toBe(true);
                }
            };

            await page.getByRole("button", {name: t.addDrug}).click();
            await followsText(dialog(page).getByRole("textbox", {name: t.drugName}), "drug name");
            await followsText(dialog(page).getByRole("textbox", {name: u.drugDescription}), "drug description");
            await dialog(page).getByRole("combobox", {name: u.frequency}).click();
            await page.getByRole("option", {name: u.frequencyCustom}).click();
            await followsText(dialog(page).getByRole("textbox", {name: u.customFrequency}), "custom frequency");
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);

            await open(page, "/groups/new");
            const groupName = page.getByRole("textbox", {name: t.groupName});
            await followsText(groupName, "group name");
            await groupName.fill("");

            await open(page, "/");
            await addDrugToRx(page, t, drug.name);
            await page.getByRole("button", {name: u.editLine}).filter({visible: true}).first().click();
            await followsText(dialog(page).getByRole("textbox", {name: u.lineNote}), "line note");
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);
        });
});
