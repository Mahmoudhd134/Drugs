import {expect, type Locator, type Page, test} from "@playwright/test";
import {expectHealthyPage} from "./checks.ts";
import type {ClinicHandle, Data, Drug, Group} from "./data.ts";
import {settled} from "./fixtures.ts";
import {unique, uniqueDigits} from "./phones.ts";
import {type Lang, TEXTS, type Texts} from "./texts.ts";
import {DOSINGS, LANGUAGE_NAMES, TEN_STEP_TAPER, UX_TEXTS, type UxTexts} from "./texts-ux.ts";

/** Helpers of the I18N and UX specs (e2e stage 2, track e2e-ux). */

export type FullDrug = Drug & { description: string | null; defaultDosing: unknown };
export type GroupItem = { drug: Drug; dosing?: unknown };

/** A drug with a description and a default dosing (the owner through the API). */
export const drugWith = async (data: Data, clinic: ClinicHandle,
                               options: { name?: string; description?: string | null; defaultDosing?: unknown } = {}) => {
    const api = await data.ownerApi(clinic);
    return api.ok<FullDrug>("POST", "/api/v1/drugs", {
        name: options.name ?? `Drug ${unique()}`,
        description: options.description ?? null,
        defaultDosing: options.defaultDosing ?? null,
    });
};

/** A group whose lines may carry dosing overrides. */
export const groupWith = async (data: Data, clinic: ClinicHandle, name: string, items: GroupItem[]) => {
    const api = await data.ownerApi(clinic);
    return api.ok<Group>("POST", "/api/v1/drug-groups", {
        name, items: items.map(i => ({drugId: i.drug.id, dosing: i.dosing ?? null})),
    });
};

/** How many drugs / groups of the clinic have exactly this name (through the API). */
export const countNamed = async (data: Data, clinic: ClinicHandle, what: "drugs" | "drug-groups", name: string) => {
    const api = await data.ownerApi(clinic);
    const page = await api.ok<{ items: { name: string }[] }>("GET", `/api/v1/${what}?search=${encodeURIComponent(name)}&pageSize=50`);
    return page.items.filter(i => i.name === name).length;
};

/**
 * A clinic with the data the tours need: Latin and Arabic drug names and descriptions, a drug with a 10-step taper,
 * and a group (Arabic name) whose first line overrides the times (GRP-068) and whose second asks for the eye.
 */
export const tourClinic = async (data: Data) => {
    const clinic = await data.clinic();
    const latin = await drugWith(data, clinic, {
        name: `Tobradex ${unique()}`, description: "Antibiotic and steroid eye drops", defaultDosing: DOSINGS.oneDropFour.dosing,
    });
    const arabic = await drugWith(data, clinic, {
        name: `قطرة مرطبة ${uniqueDigits()}`, description: "قطرة لترطيب العين", defaultDosing: DOSINGS.twoDropsLeft.dosing,
    });
    const taper = await drugWith(data, clinic, {name: `Pred Forte ${unique()}`, defaultDosing: TEN_STEP_TAPER});
    const group = await groupWith(data, clinic, `بعد عملية المياه البيضاء ${uniqueDigits()}`, [
        {drug: latin, dosing: DOSINGS.sixTimesOverride.dosing},
        {drug: arabic, dosing: {eye: "ask"}},
    ]);
    return {clinic, latin, arabic, taper, group};
};

export type Tour = Awaited<ReturnType<typeof tourClinic>>;

/** Both text sets of a language. */
export const textsOf = (lang: Lang): { t: Texts; u: UxTexts } => ({t: TEXTS[lang], u: UX_TEXTS[lang]});

/** The UI language now (`<html lang>`). */
export const uiLang = async (page: Page): Promise<Lang> =>
    (await page.locator("html").getAttribute("lang")) === "en" ? "en" : "ar";

/** Picks a language in the app bar's language menu (the button shows the current language's name). */
export const chooseLanguage = async (page: Page, lang: Lang) => {
    const current = await uiLang(page);
    await page.getByRole("button", {name: UX_TEXTS[current].language}).click();
    await page.getByRole("menuitem", {name: LANGUAGE_NAMES[lang]}).click();
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.getByRole("menu")).toHaveCount(0);
};

/** Stores the language as the app does and reloads (a test of something else in the other language). */
export const setLanguage = async (page: Page, lang: Lang) => {
    await page.evaluate(l => localStorage.setItem("language", l), lang);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await settled(page);
};

/** Opens a page and waits until it finished loading. */
export const open = async (page: Page, path: string) => {
    await page.goto(path);
    await settled(page);
};

/** Every finite animation or transition of the page has ended (a scan mid-fade reads pale colours). */
export const animationsDone = async (page: Page) => {
    await page.waitForFunction(() => document.getAnimations()
        .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
        .every(a => a.playState !== "running"), null, {timeout: 15_000});
};

/**
 * The page checks (support/checks.ts `expectHealthyPage`: dir/lang, loaded, no horizontal scroll, axe without
 * serious/critical violations but the known bugs, each on its documented elements only) in the UI language now, once
 * the animations ended.
 */
export const pageChecks = async (page: Page, what: string) => {
    await test.step(`page checks: ${what}`, async () => {
        await animationsDone(page);
        await expectHealthyPage(page, await uiLang(page), test.info());
    });
};

export const noHorizontalScroll = async (page: Page, what: string) => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        {message: `${what}: no horizontal scroll`}).toBeLessThanOrEqual(0);
};

/** Every element of `box` is inside the screen's width. */
export const fitsTheScreen = async (page: Page, box: Locator, what: string) => {
    const width = page.viewportSize()!.width;
    for (const element of await box.all()) {
        const rect = await element.boundingBox();
        if (!rect) continue;
        expect(rect.x, `${what} starts on screen`).toBeGreaterThanOrEqual(-1);
        expect(rect.x + rect.width, `${what} ends on screen`).toBeLessThanOrEqual(width + 1);
    }
};

/**
 * Why an element's text is not shown whole, or null: its content is wider than its box (ellipsis, `nowrap`, overflow),
 * or a clipping ancestor (`overflow` other than visible) hides part of its width. Runs in the page (`fn.toString()`):
 * self-contained.
 */
const cutReason = (e: Element): string | null => {
    const r = e.getBoundingClientRect();
    if (e.scrollWidth > e.clientWidth + 1) return `content ${e.scrollWidth} px in a ${e.clientWidth} px box`;
    let [left, right] = [r.left, r.right];
    for (let p = e.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowX === "visible") continue;
        const c = p.getBoundingClientRect();
        [left, right] = [Math.max(left, c.left), Math.min(right, c.right)];
    }
    return right - left < r.width - 1 ? `only ${Math.round(Math.max(0, right - left))} of ${Math.round(r.width)} px visible` : null;
};

/**
 * Cut text that is a known app bug (docs/testing/known-bugs.md), limited to its documented elements: reported in the
 * test's attachments, not failed (the bug's own test, `test.fail`, fails on it until it is fixed).
 */
const KNOWN_CUT = [
    // The groups list page (`/groups` exactly): its cards: the group name (h6) and the first four drug names (li) are one line with an ellipsis
    {bug: "BUG-591", path: "/groups", selector: "main .MuiCard-root h6.MuiTypography-noWrap, main .MuiCard-root li.MuiTypography-noWrap"},
];

/**
 * No cut UI text in `scope`, and no overlapping buttons. Checked: every visible button, tab, chip label, form label,
 * legend, h1/h2, dialog title and toggle; and any p/li/span/h3–h6 that can cut its text (`nowrap` or ellipsis; the
 * documented line clamps, `-webkit-line-clamp`, are left out). "Cut": see `cutReason` (own overflow, or clipped by a
 * scrolling/clipping ancestor in width). Not checked: overlaps between non-button elements, and text cut in height.
 */
export const expectNoCutOrOverlap = async (scope: Locator, what: string) => {
    const {problems, known} = await scope.evaluate((root, {reasonSource, knownCut}) => {
        const reasonOf = new Function(`return (${reasonSource})`)() as (e: Element) => string | null;
        const visible = (e: Element) => {
            const r = e.getBoundingClientRect();
            const style = getComputedStyle(e);
            return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const name = (e: Element) => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join(".")} «${(e.textContent ?? "").trim().slice(0, 40)}»`;
        const found: string[] = [];
        const knownFound: string[] = [];
        const always = [...root.querySelectorAll("button, [role=tab], .MuiChip-label, label, legend, h1, h2, .MuiDialogTitle-root, .MuiToggleButton-root")];
        const cutting = [...root.querySelectorAll("p, li, span, h3, h4, h5, h6")].filter(e => {
            const style = getComputedStyle(e);
            return (style.whiteSpace === "nowrap" || style.textOverflow === "ellipsis")
                && style.getPropertyValue("-webkit-line-clamp") === "none";
        });
        for (const e of new Set([...always, ...cutting])) {
            if (!visible(e) || !(e.textContent ?? "").trim()) continue;
            // MUI's notched-outline legend (and its span) is a visually hidden copy of the label
            if (e.closest("fieldset legend")) continue;
            const reason = reasonOf(e);
            if (!reason) continue;
            const bug = knownCut.find(k => location.pathname === k.path && e.matches(k.selector));
            if (bug) knownFound.push(`${bug.bug}: cut text: ${name(e)} (${reason})`);
            else found.push(`cut text: ${name(e)} (${reason})`);
        }
        // The part of an element on screen: its box cut by every scrolling or clipping ancestor (a dialog's content
        // scrolled under its buttons is hidden there, not overlapping)
        const shown = (e: Element) => {
            const r = e.getBoundingClientRect();
            let [left, top, right, bottom] = [r.left, r.top, r.right, r.bottom];
            for (let p = e.parentElement; p; p = p.parentElement) {
                const style = getComputedStyle(p);
                if (style.overflowX === "visible" && style.overflowY === "visible") continue;
                const c = p.getBoundingClientRect();
                [left, top, right, bottom] = [Math.max(left, c.left), Math.max(top, c.top), Math.min(right, c.right), Math.min(bottom, c.bottom)];
            }
            return {left, top, right, bottom};
        };
        const buttons = [...root.querySelectorAll("button, [role=button]")].filter(visible);
        for (let i = 0; i < buttons.length; i++) {
            for (let j = i + 1; j < buttons.length; j++) {
                const a = buttons[i], b = buttons[j];
                if (a.contains(b) || b.contains(a)) continue;
                const ra = shown(a), rb = shown(b);
                const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
                const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
                if (w > 1 && h > 1) found.push(`overlap: ${name(a)} and ${name(b)}`);
            }
        }
        return {problems: found, known: knownFound};
    }, {reasonSource: cutReason.toString(), knownCut: KNOWN_CUT});
    if (known.length) await test.info().attach(`known bugs (cut text): ${what}`, {body: known.join("\n"), contentType: "text/plain"});
    expect(problems, `${what}: no cut text, no overlapping buttons`).toEqual([]);
};

/** Each element of `elements` (e.g. a long name where it is shown) shows its whole text: wrapped, not cut or clipped. */
export const expectNotCut = async (elements: Locator, what: string) => {
    const count = await elements.count();
    expect(count, `${what}: shown`).toBeGreaterThan(0);
    const reasons = await elements.evaluateAll((all, reasonSource) => {
        const reasonOf = new Function(`return (${reasonSource})`)() as (e: Element) => string | null;
        return all.map(reasonOf).filter((r): r is string => r !== null);
    }, cutReason.toString());
    expect(reasons, `${what}: the whole text is shown (wrapped)`).toEqual([]);
};

/** The screen rectangle of the first occurrence of `text` inside the element (a Range over its text nodes). */
export const textRect = async (element: Locator, text: string) =>
    element.evaluate((root, wanted) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const index = (node.textContent ?? "").indexOf(wanted);
            if (index < 0) continue;
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + wanted.length);
            const r = range.getBoundingClientRect();
            return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width};
        }
        throw new Error(`"${wanted}" not found in ${root.textContent}`);
    }, text);

/** Clicks the prescription catalog's tab (Groups / Drugs). */
export const rxTab = async (page: Page, t: Texts, tab: "drugs" | "groups") => {
    await page.getByRole("tab", {name: tab === "drugs" ? t.rxTabDrugs : t.rxTabGroups}).click();
};

/** The visible search field of a picker (the prescription keeps both pickers mounted, one hidden). */
export const searchBox = (page: Page, placeholder: string) =>
    page.getByRole("searchbox", {name: placeholder}).filter({visible: true});

/** Searches a picker and clicks the result with this exact name (the list waits for the search's answer). */
export const pick = async (page: Page, placeholder: string, name: string) => {
    await searchBox(page, placeholder).fill(name);
    const option = page.getByRole("option").filter({visible: true}).filter({has: page.getByText(name, {exact: true})});
    await expect(option).toHaveCount(1);
    await option.click();
};

/** Adds a drug to the prescription from the Drugs tab. */
export const addDrugToRx = async (page: Page, t: Texts, name: string) => {
    await rxTab(page, t, "drugs");
    await pick(page, t.searchDrugs, name);
};

/** Clicks a group in the prescription's Groups tab (its dialogs, if any, are left to the caller). */
export const addGroupToRx = async (page: Page, t: Texts, name: string) => {
    await rxTab(page, t, "groups");
    await pick(page, t.searchGroups, name);
};

/** The prescription's lines panel («الأدوية المختارة»). */
export const linesPanel = (page: Page, u: UxTexts) => page.locator("main .MuiPaper-root").filter({hasText: u.rxSelected});

/** A drug name as shown in a line or list (visible copy only). */
export const shownName = (page: Page, name: string) => page.getByText(name, {exact: true}).filter({visible: true}).first();

/** The panel of a sortable list (prescription lines, group lines): the one with drag handles. */
export const sortablePanel = (page: Page, u: UxTexts) =>
    page.locator("main .MuiPaper-root").filter({has: page.getByRole("button", {name: u.dragToReorder})});

/** The names in their vertical order on screen, inside `scope`. */
export const orderOnScreen = async (scope: Locator, names: string[]) => {
    const tops = await Promise.all(names.map(async n => ({n, y: (await scope.getByText(n, {exact: true}).boundingBox())?.y ?? -1})));
    return tops.sort((a, b) => a.y - b.y).map(x => x.n);
};

/** A drugs-table row by the drug's name. */
export const drugRow = (page: Page, name: string) => page.getByRole("row").filter({has: page.getByText(name, {exact: true})});

/** A groups-list card by the group's name. */
export const groupCard = (page: Page, name: string) =>
    page.locator(".MuiCard-root").filter({has: page.getByText(name, {exact: true})});

/** The open dialog (MUI keeps a closing one in the DOM while it fades: the visible one). */
export const dialog = (page: Page) => page.getByRole("dialog").filter({visible: true});

export const expectNoDialog = async (page: Page) => {
    await expect(page.getByRole("dialog")).toHaveCount(0);
};

/**
 * Each page and dialog of the catalog and prescription areas, in turn (in the UI language now): `check(what)` runs on
 * each. Leaves the prescription with the tour's lines (latin from the drug, the group's lines).
 */
export const tourPages = async (page: Page, tour: Tour, check: (what: string) => Promise<void>) => {
    const lang = await uiLang(page);
    const {t, u} = textsOf(lang);

    // Drugs: the list, the taper drug's dialog, a delete confirmation
    await open(page, `/drugs`);
    await expect(drugRow(page, tour.latin.name)).toBeVisible();
    await check("drugs list");
    await drugRow(page, tour.taper.name).click();
    await expect(dialog(page).getByLabel(u.taperStep(10), {exact: true})).toBeAttached();
    await check("drug dialog with a 10-step taper");
    await dialog(page).getByRole("button", {name: t.cancel}).click();
    await expectNoDialog(page);
    await drugRow(page, tour.latin.name).getByRole("button", {name: t.delete}).click();
    await expect(dialog(page).getByText(u.deleteDrugTitle)).toBeVisible();
    await check("delete-drug confirmation");
    await dialog(page).getByRole("button", {name: t.cancel}).click();
    await expectNoDialog(page);
    await page.getByRole("button", {name: t.addDrug}).click();
    await expect(dialog(page).getByRole("textbox", {name: t.drugName})).toBeVisible();
    await check("new-drug dialog");
    await dialog(page).getByRole("button", {name: t.cancel}).click();
    await expectNoDialog(page);

    // Groups: the list, a delete confirmation, the editor, its line dialog, the discard question, a new group
    await open(page, "/groups");
    await expect(groupCard(page, tour.group.name)).toBeVisible();
    await check("groups list");
    await groupCard(page, tour.group.name).getByRole("button", {name: t.delete}).click();
    await expect(dialog(page).getByText(u.deleteGroupTitle)).toBeVisible();
    await check("delete-group confirmation");
    await dialog(page).getByRole("button", {name: t.cancel}).click();
    await expectNoDialog(page);
    await open(page, `/groups/${tour.group.id}`);
    await expect(page.getByRole("textbox", {name: t.groupName})).toHaveValue(tour.group.name);
    await expect(shownName(page, tour.latin.name)).toBeVisible();
    await check("group editor");
    await page.getByRole("button", {name: u.editLine}).first().click();
    await expect(dialog(page)).toBeVisible();
    await check("group line dialog");
    await dialog(page).getByRole("button", {name: t.cancel}).click();
    await expectNoDialog(page);
    const groupName = page.getByRole("textbox", {name: t.groupName});
    await groupName.fill(`${tour.group.name} x`);
    await page.getByRole("button", {name: t.back}).click();
    await expect(dialog(page).getByText(u.discardTitle)).toBeVisible();
    await check("discard question");
    await dialog(page).getByRole("button", {name: t.cancel}).click();
    await expectNoDialog(page);
    // Back to the saved name: nothing left to discard (no "leave the page?" prompt)
    await groupName.fill(tour.group.name);
    await open(page, "/groups/new");
    await expect(page.getByRole("textbox", {name: t.groupName})).toBeVisible();
    await check("new group editor");

    // Prescription: empty, then a drug, then the group (eye question, conflict), the line dialog, Edit & copy
    await open(page, "/");
    await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("prescription.")).forEach(k => localStorage.removeItem(k)));
    await open(page, "/");
    await expect(page.getByText(t.rxEmpty, {exact: true})).toBeVisible();
    await check("empty prescription");
    await addDrugToRx(page, t, tour.latin.name);
    await expect(shownName(page, DOSINGS.oneDropFour.text)).toBeVisible();
    await addGroupToRx(page, t, tour.group.name);
    await expect(dialog(page).getByText(u.chooseEyeTitle)).toBeVisible();
    await check("eye question");
    await dialog(page).getByRole("button", {name: u.eyeRight, exact: true}).click();
    await expect(dialog(page).getByText(u.conflictTitle)).toBeVisible();
    await check("conflict dialog");
    await dialog(page).getByRole("button", {name: u.keepCurrent}).click();
    await expectNoDialog(page);
    await expect(shownName(page, tour.arabic.name)).toBeVisible();
    await check("prescription with lines");
    await page.getByRole("button", {name: u.editLine}).first().click();
    await expect(dialog(page).getByRole("textbox", {name: u.lineNote})).toBeVisible();
    await check("line dialog");
    await dialog(page).getByRole("button", {name: t.cancel}).click();
    await expectNoDialog(page);
    await page.getByRole("button", {name: u.editAndCopy}).click();
    await expect(dialog(page).getByText(u.editorTitle)).toBeVisible();
    await expect(dialog(page).locator(".ql-editor")).toContainText(tour.arabic.name);
    await check("Edit & copy");
    await dialog(page).getByRole("button", {name: t.close}).click();
    await expectNoDialog(page);
};
