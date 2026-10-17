import type {Locator, Page} from "@playwright/test";
import {expect, signIn, test} from "../support/fixtures.ts";
import {READ_ONLY} from "../support/data.ts";
import {unique, uniqueDigits} from "../support/phones.ts";
import {DOSINGS} from "../support/texts-ux.ts";
import {expectToast, recordRequests, toast} from "../support/ui.ts";
import {
    addDrugToRx,
    countNamed,
    dialog,
    drugRow,
    drugWith,
    expectNoDialog,
    expectNotCut,
    fitsTheScreen,
    groupCard,
    groupWith,
    linesPanel,
    noHorizontalScroll,
    open,
    orderOnScreen,
    pick,
    rxTab,
    searchBox,
    shownName,
    sortablePanel,
    textsOf,
} from "../support/ux.ts";

/** The confirmation starts with the focus on Cancel, and Enter there cancels (nothing deleted). */
const enterCancels = async (page: Page, cancel: string, what: string) => {
    const button = dialog(page).getByRole("button", {name: cancel, exact: true});
    await expect(button, `${what}: focus on Cancel`).toBeFocused();
    await page.keyboard.press("Enter");
    await expectNoDialog(page);
};

/** Moves the focus with Tab until `target` has it (at most `max` presses). */
const tabTo = async (page: Page, target: Locator, max = 8) => {
    for (let i = 0; i < max; i++) {
        await page.keyboard.press("Tab");
        if (await target.evaluate(e => e === document.activeElement)) return;
    }
    throw new Error("Tab never reached the element");
};

/**
 * A finger's tap on `target`: touchstart, held ~150 ms like a finger, touchend, as touch events of the page. (The
 * browser's touch emulation also sends its compatibility mouse events, ending with a `mouseleave` a real phone does
 * not send, which closes MUI's tooltip at once; the real phone itself is UX-011, manual.)
 */
const fingerTap = async (page: Page, target: Locator) => {
    const touch = (type: string) => target.evaluate((e, kind) => {
        const r = e.getBoundingClientRect();
        const point = new Touch({identifier: 1, target: e, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2});
        const touches = kind === "touchend" ? [] : [point];
        e.dispatchEvent(new TouchEvent(kind, {bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: [point]}));
    }, type);
    await touch("touchstart");
    await page.waitForTimeout(150);
    await touch("touchend");
};

/** Picks up the line's drag handle with Space, moves it one place down with ↓, drops it with Space. */
const moveDownWithKeyboard = async (page: Page, handle: Locator) => {
    await handle.focus();
    await page.keyboard.press("Space");
    // dnd-kit starts the keyboard drag on the next frame
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    await page.keyboard.press("Space");
};

test.describe("Keyboard, focus and double clicks @area:ux", () => {
    test("delete confirmations (drug, group) and the discard question open with the focus on «إلغاء»: Enter deletes nothing @UX-016",
        async ({page, data, lang}) => {
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            const drug = await drugWith(data, clinic, {name: `Tobradex ${unique()}`});
            const group = await groupWith(data, clinic, `G ${unique()}`, [{drug}]);
            const deletes = recordRequests(page, "DELETE", /\/api\/v1\//);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            await drugRow(page, drug.name).getByRole("button", {name: t.delete}).click();
            await expect(dialog(page).getByText(u.deleteDrugTitle)).toBeVisible();
            await enterCancels(page, t.cancel, "delete drug");
            await expect(drugRow(page, drug.name)).toBeVisible();

            await open(page, "/groups");
            await groupCard(page, group.name).getByRole("button", {name: t.delete}).click();
            await expect(dialog(page).getByText(u.deleteGroupTitle)).toBeVisible();
            await enterCancels(page, t.cancel, "delete group (list)");
            await expect(groupCard(page, group.name)).toBeVisible();

            await open(page, `/groups/${group.id}`);
            await page.getByRole("button", {name: t.delete, exact: true}).click();
            await expect(dialog(page).getByText(u.deleteGroupTitle)).toBeVisible();
            await enterCancels(page, t.cancel, "delete group (editor)");
            await expect(page).toHaveURL(new RegExp(`/groups/${group.id}$`));

            const name = page.getByRole("textbox", {name: t.groupName});
            await name.fill(`${group.name} changed`);
            await page.getByRole("button", {name: t.back}).click();
            await expect(dialog(page).getByText(u.discardTitle)).toBeVisible();
            await enterCancels(page, t.cancel, "discard");
            await expect(page).toHaveURL(new RegExp(`/groups/${group.id}$`));
            await expect(name, "the changes are kept").toHaveValue(`${group.name} changed`);
            await name.fill(group.name);

            expect(deletes.map(r => r.url()), "no DELETE sent").toEqual([]);
            expect(await countNamed(data, clinic, "drugs", drug.name)).toBe(1);
            expect(await countNamed(data, clinic, "drug-groups", group.name)).toBe(1);
        });

    test("the drugs table: Tab to a row, then Enter or Space opens the drug (edit for an owner, details for a viewer) @UX-020",
        async ({page, data, lang, newBrowser}) => {
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            const drug = await drugWith(data, clinic, {name: `Tobradex ${unique()}`});
            const viewer = await data.staff(clinic, {roles: [(await data.role(clinic, READ_ONLY)).id]});

            const opensWithKeys = async (target: Page, title: string, closeWith: string) => {
                await target.getByRole("searchbox", {name: t.searchDrugs}).fill(drug.name);
                const row = drugRow(target, drug.name);
                await expect(target.getByRole("row")).toHaveCount(2);
                for (const key of ["Enter", "Space"]) {
                    await target.getByRole("searchbox", {name: t.searchDrugs}).focus();
                    await tabTo(target, row);
                    await target.keyboard.press(key);
                    await expect(dialog(target).getByRole("heading", {name: title}), `${key} opens ${title}`).toBeVisible();
                    await dialog(target).getByRole("button", {name: closeWith}).click();
                    await expectNoDialog(target);
                }
            };

            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await opensWithKeys(page, t.editDrug, t.cancel);

            const other = await newBrowser();
            await signIn(other.page, viewer.phone, "asIs", "/drugs");
            await opensWithKeys(other.page, t.drugDetails, t.close);
        });

    test("prescription lines and group lines move with the keyboard: focus the drag handle, Space, ↓, Space @UX-021",
        async ({page, data, lang}) => {
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            const [a, b, c] = [
                await drugWith(data, clinic, {name: `Alpha ${unique()}`}),
                await drugWith(data, clinic, {name: `Bravo ${unique()}`}),
                await drugWith(data, clinic, {name: `Charlie ${unique()}`}),
            ];
            const group = await groupWith(data, clinic, `G ${unique()}`, [{drug: a}, {drug: b}, {drug: c}]);
            await signIn(page, clinic.owner.phone);
            for (const drug of [a, b, c]) {
                await addDrugToRx(page, t, drug.name);
                await expect(shownName(page, drug.name)).toBeVisible();
            }
            const names = [a.name, b.name, c.name];
            expect(await orderOnScreen(sortablePanel(page, u), names)).toEqual(names);
            const handles = page.getByRole("button", {name: u.dragToReorder}).filter({visible: true});
            await moveDownWithKeyboard(page, handles.first());
            await expect.poll(() => orderOnScreen(sortablePanel(page, u), names), {message: "prescription: the first line moved down"}).toEqual([b.name, a.name, c.name]);
            // Kept (the prescription is stored per clinic)
            await page.reload();
            await expect(shownName(page, c.name)).toBeVisible();
            expect(await orderOnScreen(sortablePanel(page, u), names)).toEqual([b.name, a.name, c.name]);

            await open(page, `/groups/${group.id}`);
            expect(await orderOnScreen(sortablePanel(page, u), names)).toEqual(names);
            await moveDownWithKeyboard(page, handles.nth(1));
            await expect.poll(() => orderOnScreen(sortablePanel(page, u), names), {message: "group: the second line moved down"}).toEqual([a.name, c.name, b.name]);
            await page.getByRole("button", {name: t.save, exact: true}).click();
            await expectToast(page, t.groupUpdated);
            const api = await data.ownerApi(clinic);
            const saved = await api.ok<{ items: { drug: { name: string } }[] }>("GET", `/api/v1/drug-groups/${group.id}`);
            expect(saved.items.map(i => i.drug.name), "saved in the new order").toEqual([a.name, c.name, b.name]);
        });

    test("the new-drug dialog: a double click on Save creates exactly one drug @UX-024 @smoke", async ({page, data, lang}) => {
        const {t} = textsOf(lang);
        const clinic = await data.clinic();
        const posts = recordRequests(page, "POST", /^\/api\/v1\/drugs$/);
        await signIn(page, clinic.owner.phone, "asIs", "/drugs");

        const name = `Double ${unique()}`;
        await page.getByRole("button", {name: t.addDrug}).click();
        await dialog(page).getByRole("textbox", {name: t.drugName}).fill(name);
        await dialog(page).getByRole("button", {name: t.save, exact: true}).dblclick();
        await expectToast(page, t.drugAdded);
        await expectNoDialog(page);
        await expect(drugRow(page, name)).toHaveCount(1);
        expect(posts.length, "one POST").toBe(1);
        expect(await countNamed(data, clinic, "drugs", name)).toBe(1);
    });

    test("the new-drug dialog: Enter twice fast (the second right after the save's answer) creates exactly one drug @UX-024",
        async ({page, data, lang}) => {
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            const posts = recordRequests(page, "POST", /^\/api\/v1\/drugs$/);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            // Enter twice: the second one right after the first save's answer (a server on the LAN answers in ~20 ms)
            const entered = `Enter ${unique()}`;
            await page.getByRole("button", {name: t.addDrug}).click();
            const field = dialog(page).getByRole("textbox", {name: t.drugName});
            await field.fill(entered);
            const first = page.waitForResponse(r => r.request().method() === "POST" && /\/api\/v1\/drugs$/.test(r.url()));
            await field.press("Enter");
            await first;
            await page.waitForTimeout(30);
            await page.keyboard.press("Enter");
            await expectToast(page, t.drugAdded);
            await page.waitForTimeout(1500);
            // (The second Enter may land on «إضافة دواء» and open the dialog again, empty: DRUG-104, not this case)
            if (await dialog(page).count()) await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);

            expect(await countNamed(data, clinic, "drugs", entered), "Enter twice: one drug").toBe(1);
            expect(posts.length, "one POST").toBe(1);
        });

    test("a double click whose second click lands after a fast answer (the dialog fading out) creates the drug once @UX-024",
        async ({page, data, lang}) => {
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            const posts = recordRequests(page, "POST", /^\/api\/v1\/drugs$/);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            // A double click whose second click comes after the answer (the dialog is fading out)
            const clicked = `Double ${unique()}`;
            await page.getByRole("button", {name: t.addDrug}).click();
            await dialog(page).getByRole("textbox", {name: t.drugName}).fill(clicked);
            const save = dialog(page).getByRole("button", {name: t.save, exact: true});
            const at = (await save.boundingBox())!;
            const second = page.waitForResponse(r => r.request().method() === "POST" && /\/api\/v1\/drugs$/.test(r.url()));
            await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
            await second;
            await page.waitForTimeout(30);
            await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2, {clickCount: 2});
            await page.waitForTimeout(1500);
            if (await dialog(page).count()) await dialog(page).getByRole("button", {name: t.cancel}).click();

            expect(await countNamed(data, clinic, "drugs", clicked), "double click: one drug").toBe(1);
            expect(posts.length, "one POST").toBe(1);
        });

    test("the new-drug dialog reopened during its closing animation (a second Enter on «إضافة دواء») starts empty, not with the name just saved @DRUG-104",
        async ({page, data, lang}) => {
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            const name = `Saved ${unique()}`;
            await page.getByRole("button", {name: t.addDrug}).click();
            const field = dialog(page).getByRole("textbox", {name: t.drugName});
            await field.fill(name);
            const saved = page.waitForResponse(r => r.request().method() === "POST" && /\/api\/v1\/drugs$/.test(r.url()));
            await field.press("Enter");
            await saved;
            // The focus is back on «إضافة دواء» while the dialog fades out (the page behind it still aria-hidden): Enter
            // opens it again
            await expect(page.getByRole("button", {name: t.addDrug, includeHidden: true})).toBeFocused();
            await page.keyboard.press("Enter");
            await expect(dialog(page).getByRole("textbox", {name: t.drugName}), "a new drug starts empty").toHaveValue("");
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);
        });

    test("a new group: a double click on Save creates exactly one group @UX-025", async ({page, data, lang}) => {
        const {t} = textsOf(lang);
        const clinic = await data.clinic();
        const drug = await drugWith(data, clinic, {name: `Tobradex ${unique()}`});
        const posts = recordRequests(page, "POST", /^\/api\/v1\/drug-groups$/);
        await signIn(page, clinic.owner.phone, "asIs", "/groups/new");

        const name = `Double ${unique()}`;
        await page.getByRole("textbox", {name: t.groupName}).fill(name);
        await pick(page, t.searchDrugs, drug.name);
        await expect(shownName(page, drug.name)).toBeVisible();
        await page.getByRole("button", {name: t.save, exact: true}).dblclick();
        await expectToast(page, t.groupCreated);
        await expect(page).toHaveURL(/\/groups$/);
        await expect(groupCard(page, name)).toHaveCount(1);
        expect(posts.length, "one POST").toBe(1);
        expect(await countNamed(data, clinic, "drug-groups", name)).toBe(1);
    });

    test("ⓘ explains on hover and on keyboard focus (desktop), on a tap that keeps it about 5 s (phone) @UX-013",
        async ({page, data, lang, isMobile}) => {
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");
            await page.getByRole("button", {name: t.addDrug}).click();
            const info = dialog(page).getByRole("img", {name: u.taperInfo});
            const tip = page.getByRole("tooltip").filter({hasText: u.taperInfo});

            if (isMobile) {
                // The component's tap behaviour only (touch events sent from the page): a tap on a REAL phone is not
                // proven here (Chromium's emulated tap ends with a mouseleave that closes MUI's tooltip): dress
                // rehearsal, UX-013 / UX-011
                await fingerTap(page, info);
                await expect(tip).toBeVisible();
                // About 5 s: still shown after 4 s, gone by about 6.5 s
                await page.waitForTimeout(4000);
                await expect(tip, "still shown 4 s after the tap").toBeVisible();
                await expect(tip, "gone after about 5 s").toBeHidden({timeout: 2500});
            } else {
                await info.hover();
                await expect(tip, "on hover").toBeVisible();
                await page.mouse.move(0, 0);
                await expect(tip).toBeHidden();
                await dialog(page).getByLabel(u.taperLabel, {exact: true}).focus();
                await page.keyboard.press("Tab");
                await expect(info).toBeFocused();
                await expect(tip, "on keyboard focus").toBeVisible();
            }
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);
        });

    test("a 256-character unbroken name wraps in lists, lines, dialogs, confirmations and toasts without widening the page @UX-009",
        async ({page, data, lang}) => {
            test.slow();
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            const name = `L${unique()}`.padEnd(256, "W");
            expect(name).toHaveLength(256);
            const drug = await drugWith(data, clinic, {name, description: "D".repeat(300), defaultDosing: DOSINGS.oneDropFour.dosing});
            const group = await groupWith(data, clinic, `G${unique()}`.padEnd(256, "M"), [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", "/drugs");

            // The page keeps its width and an open dialog fits the screen; the name itself is shown whole (wrapped).
            // (Inputs holding the name scroll inside themselves: not checked. The groups list's cards: their own test
            // below; the Groups-tab picker and the line dialogs' titles: known bugs BUG-587 and BUG-589, below.)
            const fits = async (what: string, shown: Locator) => {
                await noHorizontalScroll(page, what);
                const open = dialog(page);
                if (await open.count()) await fitsTheScreen(page, open, what);
                await expectNotCut(shown, what);
            };

            await expect(drugRow(page, name)).toBeVisible();
            await fits("drugs list", drugRow(page, name).getByText(name, {exact: true}));
            await drugRow(page, name).getByRole("button", {name: t.delete}).click();
            const deleteDrug = dialog(page).getByText(u.deleteDrugMessage(name));
            await expect(deleteDrug).toBeVisible();
            await fits("delete-drug confirmation", deleteDrug);
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);

            await open(page, "/groups");
            await expect(groupCard(page, group.name)).toBeVisible();
            await noHorizontalScroll(page, "groups list");
            await groupCard(page, group.name).getByRole("button", {name: t.delete}).click();
            await expect(dialog(page)).toBeVisible();
            await fits("delete-group confirmation", dialog(page).locator("p").filter({hasText: group.name}));
            await dialog(page).getByRole("button", {name: t.cancel}).click();
            await expectNoDialog(page);
            await open(page, `/groups/${group.id}`);
            await fits("group editor line", sortablePanel(page, u).getByText(name, {exact: true}));

            await open(page, "/");
            await addDrugToRx(page, t, name);
            await expect(shownName(page, DOSINGS.oneDropFour.text)).toBeVisible();
            await fits("prescription line", linesPanel(page, u).getByText(name, {exact: true}));
            await fits("drug picker", page.getByRole("option").filter({visible: true}).getByText(name, {exact: true}));
            await addDrugToRx(page, t, name);
            await expectToast(page, u.alreadyAdded(name));
            await fits("already-added toast", toast(page, u.alreadyAdded(name)));
        });

    test.fail("BUG-589: the group line dialog and the prescription line dialog cut a 256-character drug name in their title instead of wrapping it @UX-009",
        async ({page, data, lang}) => {
            const {t, u} = textsOf(lang);
            const clinic = await data.clinic();
            const name = `L${unique()}`.padEnd(256, "W");
            const drug = await drugWith(data, clinic, {name, defaultDosing: DOSINGS.oneDropFour.dosing});
            const group = await groupWith(data, clinic, `G ${unique()}`, [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", `/groups/${group.id}`);
            const problems: string[] = [];
            const check = async (what: string) => {
                await expect(dialog(page)).toBeVisible();
                await noHorizontalScroll(page, what);
                await expectNotCut(dialog(page).getByText(name, {exact: true}), what).catch((e: Error) => problems.push(`${what}: ${e.message.slice(0, 200)}`));
                await dialog(page).getByRole("button", {name: t.cancel}).click();
                await expectNoDialog(page);
            };
            await page.getByRole("button", {name: u.editLine}).first().click();
            await check("group line dialog");
            await open(page, "/");
            await addDrugToRx(page, t, name);
            await linesPanel(page, u).getByRole("button", {name: u.editLine}).click();
            await check("prescription line dialog");
            expect(problems, "the drug name is shown whole in both dialog titles").toEqual([]);
        });

    test("the groups list's cards wrap a group name and a drug name inside the card, never cut them: a 256-character one, and an ordinary «بعد عملية المياه البيضاء …» @UX-009",
        async ({page, data, lang}) => {
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            const drugName = `L${unique()}`.padEnd(256, "W");
            const drug = await drugWith(data, clinic, {name: drugName});
            const group = await groupWith(data, clinic, `G${unique()}`.padEnd(256, "M"), [{drug}]);
            // A usual name (31 characters): already wider than a 1280 px screen's card title
            const usual = await groupWith(data, clinic, `بعد عملية المياه البيضاء ${uniqueDigits()}`, [{drug}]);
            await signIn(page, clinic.owner.phone, "asIs", "/groups");
            const card = groupCard(page, group.name);
            await expect(card).toBeVisible();
            await noHorizontalScroll(page, "groups list");
            const problems: string[] = [];
            const shown = [
                ["long group name", card.getByText(group.name, {exact: true})],
                ["long drug name", card.getByText(drugName, {exact: true})],
                ["usual group name", groupCard(page, usual.name).getByText(usual.name, {exact: true})],
            ] as const;
            for (const [what, element] of shown) {
                await expectNotCut(element, `groups list card: ${what}`).catch((e: Error) => problems.push(`${what}: ${e.message.slice(0, 200)}`));
            }
            expect(problems, "the cards show the groups' and the drug's whole names (wrapped)").toEqual([]);
            // The card still opens the editor (the names are not a separate control)
            await expect(card.getByRole("button", {name: t.delete})).toBeVisible();
        });

    test.fail("BUG-587: the prescription's Groups-tab picker cuts a 256-character group name instead of wrapping it @UX-009",
        async ({page, data, lang}) => {
            const {t} = textsOf(lang);
            const clinic = await data.clinic();
            const drug = await drugWith(data, clinic, {name: `Tobradex ${unique()}`});
            const group = await groupWith(data, clinic, `G${unique()}`.padEnd(256, "M"), [{drug}]);
            await signIn(page, clinic.owner.phone);
            await rxTab(page, t, "groups");
            await searchBox(page, t.searchGroups).fill(group.name);
            const shown = page.getByRole("option").filter({visible: true}).getByText(group.name, {exact: true});
            await expect(shown).toBeVisible();
            await noHorizontalScroll(page, "group picker");
            await expectNotCut(shown, "group picker");
        });
});
