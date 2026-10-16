import {expect, type Locator, type Page, type TestInfo} from "@playwright/test";
import {expectHealthyPage} from "./checks.ts";
import type {ClinicHandle, Data} from "./data.ts";
import {unique} from "./phones.ts";
import type {RxTexts} from "./texts-rx.ts";
import {toast} from "./ui.ts";

/**
 * Helpers of the prescription journeys (RX): test data with descriptions and dosings (the stage-1 `data.drug` /
 * `data.group` builders make drugs without a description and group lines without an override), and the prescription
 * page's parts (pickers, lines, dialogs, toasts, clipboard).
 */

export type Dosing = Record<string, unknown>;
export type RxDrug = { id: number; name: string; description: string | null; defaultDosing: Dosing | null };
export type RxGroup = { id: number; name: string };
export type GroupLine = { drug: RxDrug; dosing?: Dosing | null };

/** 1 or 2 drops, N times a day for W weeks, an optional eye (sentence: texts-rx.ts `dropDailySentence`). */
export const dropDaily = (times: number, weeks: number, eye?: "right" | "left" | "both" | "none", drops: 1 | 2 = 1): Dosing => ({
    doseAmount: drops, doseUnit: "drop", frequency: "daily", frequencyValue: times, durationValue: weeks, durationUnit: "weeks",
    ...(eye ? {eye} : {}),
});

/** Names that are never a part of each other (a picker filtered by text finds exactly one). */
export const rxName = (word: string) => `${word} ${unique()}`;

/**
 * The clinic owner's API session, logged in once even when several helpers ask at the same time (`data.ownerApi`
 * caches the session only once its login is done: parallel calls would each log in and meet the 5 codes per hour).
 */
const pending = new WeakMap<Data, Map<number, Promise<unknown>>>();
const owner = (data: Data, clinic: ClinicHandle) => {
    let map = pending.get(data);
    if (!map) pending.set(data, map = new Map());
    let session = map.get(clinic.id) as ReturnType<Data["ownerApi"]> | undefined;
    if (!session) map.set(clinic.id, session = data.ownerApi(clinic));
    return session;
};

/** A drug of the clinic, through the owner's API (POST /drugs). */
export const rxDrug = async (data: Data, clinic: ClinicHandle,
                             options: { name?: string; description?: string | null; dosing?: Dosing | null } = {}): Promise<RxDrug> => {
    const api = await owner(data, clinic);
    return api.ok<RxDrug>("POST", "/api/v1/drugs", {
        name: options.name ?? rxName("Drug"), description: options.description ?? null, defaultDosing: options.dosing ?? null,
    });
};

export const rxUpdateDrug = async (data: Data, clinic: ClinicHandle, drug: RxDrug,
                                   changes: { name?: string; description?: string | null; dosing?: Dosing | null }) => {
    const api = await owner(data, clinic);
    return api.ok<RxDrug>("PUT", `/api/v1/drugs/${drug.id}`, {
        name: changes.name ?? drug.name,
        description: changes.description !== undefined ? changes.description : drug.description,
        defaultDosing: changes.dosing !== undefined ? changes.dosing : drug.defaultDosing,
    });
};

export const rxDeleteDrug = async (data: Data, clinic: ClinicHandle, drug: RxDrug) => {
    const api = await owner(data, clinic);
    await api.ok("DELETE", `/api/v1/drugs/${drug.id}`);
};

export const rxGetDrug = async (data: Data, clinic: ClinicHandle, drug: RxDrug) => {
    const api = await owner(data, clinic);
    return api.ok<RxDrug>("GET", `/api/v1/drugs/${drug.id}`);
};

/** A group of the clinic (POST /drug-groups): its lines in order, each with an optional override. */
export const rxGroup = async (data: Data, clinic: ClinicHandle, lines: GroupLine[], name = rxName("Group")): Promise<RxGroup> => {
    const api = await owner(data, clinic);
    return api.ok<RxGroup>("POST", "/api/v1/drug-groups", {name, items: lines.map(l => ({drugId: l.drug.id, dosing: l.dosing ?? null}))});
};

export const rxUpdateGroup = async (data: Data, clinic: ClinicHandle, group: RxGroup, lines: GroupLine[], name = group.name) => {
    const api = await owner(data, clinic);
    return api.ok<RxGroup>("PUT", `/api/v1/drug-groups/${group.id}`, {name, items: lines.map(l => ({drugId: l.drug.id, dosing: l.dosing ?? null}))});
};

export const rxGetGroup = async (data: Data, clinic: ClinicHandle, group: RxGroup) => {
    const api = await owner(data, clinic);
    return api.ok<{ id: number; name: string; items: { drug: RxDrug; dosing: Dosing | null }[] }>("GET", `/api/v1/drug-groups/${group.id}`);
};

/** The prescription page's parts, in the project's language. */
export class RxPage {
    readonly page: Page;
    readonly rt: RxTexts;

    constructor(page: Page, rt: RxTexts) {
        this.page = page;
        this.rt = rt;
    }

    /** «الأدوية المختارة» panel (the picker of the hidden tab still holds drug names: never search the whole page). */
    get panel(): Locator {
        return this.page.locator(".MuiPaper-root").filter({has: this.page.getByText(this.rt.selected, {exact: true})});
    }

    /** The «إضافة إلى الروشتة» panel. */
    get catalog(): Locator {
        return this.page.locator(".MuiPaper-root").filter({has: this.page.getByText(this.rt.catalog, {exact: true})});
    }

    /** The count chip next to «الأدوية المختارة». */
    get count(): Locator {
        return this.panel.locator(".MuiChip-label").first();
    }

    /** The prescription's lines (each sortable row: drag handle, number, name, details, actions). */
    get lines(): Locator {
        return this.panel.locator('[aria-roledescription="sortable"]').locator("xpath=..");
    }

    line(index: number): Locator {
        return this.lines.nth(index);
    }

    /** The line(s) of a drug. */
    linesOf(name: string): Locator {
        return this.lines.filter({has: this.page.getByText(name, {exact: true})});
    }

    async openDrugsTab() {
        await this.page.getByRole("tab", {name: this.rt.tabDrugs}).click();
        await expect(this.page.getByRole("tab", {name: this.rt.tabDrugs})).toHaveAttribute("aria-selected", "true");
    }

    async openGroupsTab() {
        await this.page.getByRole("tab", {name: this.rt.tabGroups}).click();
        await expect(this.page.getByRole("tab", {name: this.rt.tabGroups})).toHaveAttribute("aria-selected", "true");
    }

    /** A result of the shown picker (the other tab's picker is hidden and out of the accessibility tree). */
    option(name: string): Locator {
        return this.catalog.getByRole("option").filter({hasText: name});
    }

    async addDrug(name: string) {
        const option = this.option(name);
        await option.click();
    }

    async addGroup(name: string) {
        await this.option(name).click();
    }

    /** Adds single drugs from the Drugs tab, then goes back to the Groups tab. */
    async addAlone(drugs: { name: string }[]) {
        await this.openDrugsTab();
        for (const drug of drugs) {
            const before = await this.lines.count();
            await this.addDrug(drug.name);
            await expect(this.lines).toHaveCount(before + 1);
        }
        await this.openGroupsTab();
    }

    /** Opens a line's «تعديل الجرعة» dialog (✎). */
    async editLine(line: Locator): Promise<Locator> {
        await line.getByRole("button", {name: this.rt.editLine}).click();
        const dialog = this.dialog(this.rt.editLine);
        await expect(dialog).toBeVisible();
        return dialog;
    }

    /** Saves a note on a line through its dosing dialog. */
    async saveNote(line: Locator, note: string) {
        const dialog = await this.editLine(line);
        await dialog.getByRole("textbox", {name: this.rt.lineNote}).fill(note);
        await dialog.getByRole("button", {name: this.rt.save, exact: true}).click();
        await expect(dialog).toBeHidden();
    }

    /** A tab's search box. */
    search(tab: "groups" | "drugs"): Locator {
        return this.catalog.getByPlaceholder(tab === "groups" ? this.rt.searchGroups : this.rt.searchDrugs);
    }

    /**
     * Each line as shown: [name, ...details] (details = the sentence or the description's lines, the eye part, the
     * note), without the number. Also checks the numbers read 1, 2, 3… in order.
     */
    async lineTexts(): Promise<string[][]> {
        const rows = await this.lines.evaluateAll(els => els.map(el => (el as HTMLElement).innerText));
        return rows.map((text, index) => {
            const parts = text.split("\n").map(s => s.trim()).filter(Boolean);
            if (parts[0] !== String(index + 1)) throw new Error(`Line ${index + 1} is numbered "${parts[0]}": ${text}`);
            return parts.slice(1);
        });
    }

    async expectLines(expected: string[][]) {
        await expect.poll(() => this.lineTexts(), {message: "the prescription's lines"}).toEqual(expected);
        await expect(this.count).toHaveText(String(expected.length));
    }

    /** The eye-question / conflict / line dialog on screen. */
    dialog(title: string): Locator {
        return this.page.getByRole("dialog").filter({has: this.page.getByRole("heading", {name: title})});
    }

    /** The lines as stored for the clinic (localStorage `prescription.lines.<clinicId>`). */
    async stored(clinicId: number): Promise<{ drug: { id: number; name: string }; dosing: Dosing; note: string; key: string }[] | null> {
        const raw = await this.page.evaluate(id => localStorage.getItem(`prescription.lines.${id}`), clinicId);
        return raw === null ? null : JSON.parse(raw) as never;
    }
}

/** The one toast of an added group: its lines in order (catalog RX-049), and whether it is the success style. */
export const expectGroupToast = async (page: Page, lines: string[], style: "success" | "neutral") => {
    const shown = toast(page, lines[0]);
    await expect(shown).toHaveText(lines.join("\n"), {timeout: 20_000});
    await expect(shown).toHaveCount(1);
    // react-hot-toast: a success toast has its icon next to the message, a plain `toast()` none
    const hasIcon = await shown.evaluate(el => (el.parentElement?.children.length ?? 0) > 1);
    expect(hasIcon, `the toast is in the ${style} style`).toBe(style === "success");
};

/** What the clipboard holds: plain text and HTML (the test's context needs clipboard-read). */
export const readClipboard = async (page: Page) => {
    const read = await readClipboardRaw(page);
    // Windows' clipboard stores plain text with CRLF line ends: compare the lines, not the platform's separator
    return {...read, text: read.text === null ? null : read.text.split("\r\n").join("\n")};
};

const readClipboardRaw = async (page: Page) => page.evaluate(async () => {
    // The HTML as the app wrote it (Chromium sanitizes text/html on a plain read)
    const read = navigator.clipboard.read as (options?: { unsanitized?: string[] }) => Promise<ClipboardItems>;
    const items = await read.call(navigator.clipboard, {unsanitized: ["text/html"]});
    const out: { text: string | null; html: string | null; types: string[] } = {text: null, html: null, types: []};
    for (const item of items) {
        out.types.push(...item.types);
        if (item.types.includes("text/plain")) out.text = await (await item.getType("text/plain")).text();
        if (item.types.includes("text/html")) out.html = await (await item.getType("text/html")).text();
    }
    return out;
});

/** Puts a marker on the clipboard, so a copy that writes nothing can't pass on an earlier test's content. */
export const markClipboard = async (page: Page) => page.evaluate(async () => {
    await navigator.clipboard.writeText(`marker ${Math.random()}`);
});

export type HtmlParagraph = { tag: string; dir: string | null; className: string | null; style: Record<string, string>; html: string; text: string };

/** The copied HTML's top-level elements, parsed by the browser (attributes, inline styles, inner HTML). */
export const parseHtml = async (page: Page, html: string): Promise<HtmlParagraph[]> => page.evaluate(source => {
    const body = new DOMParser().parseFromString(source, "text/html").body;
    return Array.from(body.children).filter(el => el.tagName !== "META").map(el => {
        const style: Record<string, string> = {};
        const element = el as HTMLElement;
        for (let i = 0; i < element.style.length; i++) {
            const name = element.style.item(i);
            style[name] = element.style.getPropertyValue(name);
        }
        return {
            tag: el.tagName.toLowerCase(), dir: el.getAttribute("dir"), className: el.getAttribute("class"), style,
            html: el.innerHTML, text: (el as HTMLElement).innerText ?? el.textContent ?? "",
        };
    });
}, html);

/** Drags a line by its handle onto another line's place (dnd-kit pointer sensor: a few moves past 5 px). */
export const dragLine = async (page: Page, from: Locator, to: Locator) => {
    const handle = from.locator('[aria-roledescription="sortable"]');
    const source = await handle.boundingBox();
    const target = await to.boundingBox();
    if (!source || !target) throw new Error("drag: a line is not on screen");
    const x = source.x + source.width / 2;
    const y = source.y + source.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + (target.y < source.y ? -10 : 10), {steps: 5});
    const ty = target.y + (target.y < source.y ? target.height * 0.25 : target.height * 0.75);
    await page.mouse.move(x, ty, {steps: 15});
    await page.mouse.move(x, ty + (target.y < source.y ? -2 : 2), {steps: 3});
    await page.mouse.up();
};

/** The element's text as read (top to bottom) holds these parts in this order (e.g. each label above its sentence). */
export const expectInOrder = async (element: Locator, parts: string[]) => {
    const text = await element.innerText();
    let from = 0;
    for (const part of parts) {
        const at = text.indexOf(part, from);
        expect(at, `"${part}" after position ${from} in: ${text}`).toBeGreaterThanOrEqual(0);
        from = at + part.length;
    }
};

/**
 * The page checks (support/checks.ts `expectHealthyPage`) with the rich-text editor open, its Quill toolbar hidden
 * (`visibility: hidden`, so axe skips it) during the scan only: its icon buttons have no accessible name (BUG-570,
 * `prescription/editor-axe.spec.ts`). Everything else is checked as usual.
 */
export const expectEditorHealthy = async (page: Page, lang: "ar" | "en", testInfo: TestInfo) => {
    const toolbar = page.locator(".ql-toolbar");
    await toolbar.evaluateAll(els => els.forEach(el => ((el as HTMLElement).style.visibility = "hidden")));
    try {
        await testInfo.attach("axe known bugs (editor)", {body: "BUG-570: .ql-toolbar hidden from the scan", contentType: "text/plain"});
        await expectHealthyPage(page, lang, testInfo);
    } finally {
        await toolbar.evaluateAll(els => els.forEach(el => ((el as HTMLElement).style.visibility = "")));
    }
};
