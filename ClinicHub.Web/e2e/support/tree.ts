import {expect, type Locator, type Page, type Response} from "@playwright/test";
import type {ApiSession} from "./api.ts";
import type {ApiDrug, CategoryRow, Paged} from "./shared.ts";
import type {Lang} from "./texts.ts";
import type {TreeTexts} from "./texts-rx.ts";

/*
 * The drug tree (`DrugTree`, design M1.7 D7 and D9; docs/design/m1.7c-contract.md § 3.2, § 3.3, § 4 "Page helpers
 * through the tree"): search + source toggle + «النتائج: N» + categories → subcategories → drugs (30 per page), in the
 * prescription's «الأدوية» tab and in the protocol editor. Locators use the contract's accessible names; catalog counts
 * are never literals: specs compare the screen with `treeOf` (the API's answer for the same search and source, D12).
 */

/** `GET /drugs/tree`'s answer (contract § 1.1; unsorted: categories by id, the bucket last). */
export type TreeSubCategory = { id: number | null; nameEn: string | null; nameAr: string | null; pinnedLast: boolean; count: number };
export type TreeCategory = { id: number; nameEn: string; nameAr: string; pinnedLast: boolean; count: number; subCategories: TreeSubCategory[] };
export type TreeAnswer = { categories: TreeCategory[] };
export type TreeSource = "all" | "shared" | "own";

const TREE_PATH = "/api/v1/drugs/tree";

/** Drugs per page of a subcategory (contract § 2.2 `TREE_PAGE_SIZE`). */
export const TREE_PAGE_SIZE = 30;

/** `GET /drug-categories` as the clinic's API answers it (ids of the categories and subcategories, by English name). */
export const drugCategories = (api: ApiSession) => api.ok<CategoryRow[]>("GET", "/api/v1/drug-categories");

/** The category (and optionally its subcategory) with these English names in `GET /drug-categories`. */
export const categoryIds = async (api: ApiSession, categoryEn: string, subCategoryEn?: string) => {
    const category = (await drugCategories(api)).find(c => c.nameEn === categoryEn);
    if (!category) throw new Error(`No category "${categoryEn}" (load_catalog.py not run?)`);
    const sub = subCategoryEn === undefined ? null : category.subCategories.find(s => s.nameEn === subCategoryEn);
    if (subCategoryEn !== undefined && !sub) throw new Error(`"${categoryEn}" has no subcategory "${subCategoryEn}"`);
    return {category, categoryId: category.id, subCategoryId: sub?.id ?? null};
};

/** Is this a `GET /drugs` page request of the bucket (categoryId, subCategoryId id or "none")? Its page number, else null. */
export const bucketPage = (url: string, categoryId: number, subCategoryId: number | null) => {
    const parsed = new URL(url);
    if (parsed.pathname !== "/api/v1/drugs") return null;
    const params = parsed.searchParams;
    if (params.get("categoryId") !== String(categoryId) || params.get("subCategoryId") !== String(subCategoryId ?? "none")) return null;
    return Number(params.get("page") ?? "1");
};

/** `GET /drugs/tree?search=&source=` as the clinic's API answers it (source "all" left out, as the SPA sends it). */
export const treeOf = (api: ApiSession, search = "", source: TreeSource = "all") => {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (source !== "all") query.set("source", source);
    return api.ok<TreeAnswer>("GET", `${TREE_PATH}${query.size ? `?${query}` : ""}`);
};

/** «النتائج: N»: the sum of the category counts. */
export const treeTotal = (tree: TreeAnswer) => tree.categories.reduce((sum, c) => sum + c.count, 0);

/** A category's name in the UI language. */
export const categoryName = (category: { nameEn: string | null; nameAr: string | null }, lang: Lang) =>
    (lang === "ar" ? category.nameAr : category.nameEn) ?? "";

/** A subcategory's name in the UI language; the bucket (id null) is «بدون تصنيف فرعي». */
export const subCategoryName = (sub: TreeSubCategory, tt: TreeTexts) => sub.id === null ? tt.noSubCategory : categoryName(sub, tt.lang);

/** Sorts names with the browser's `Intl.Collator(language)` (the one the app sorts with, design D5). */
const collate = (page: Page, lang: Lang, names: string[]) =>
    page.evaluate(({names, lang}) => [...names].sort(new Intl.Collator(lang).compare), {names, lang});

/**
 * The order the tree shows (contract § 2.3 `sortTree`, CAT-095, CAT-096, CAT-074, I18N-025): not searching, by name in
 * the UI language; searching, by count (descending), ties by name; always the `pinnedLast` rows after the others (sorted
 * the same way among themselves) and the bucket last.
 */
const ordered = async <T extends { id: number | null; pinnedLast: boolean; count: number }>(
    page: Page, lang: Lang, rows: T[], nameOf: (row: T) => string, searching: boolean): Promise<T[]> => {
    const byName = await collate(page, lang, [...new Set(rows.map(nameOf))]);
    const rank = (row: T) => byName.indexOf(nameOf(row));
    const tier = (row: T) => row.id === null ? 2 : row.pinnedLast ? 1 : 0;
    return [...rows].sort((a, b) => tier(a) - tier(b) || (searching ? b.count - a.count : 0) || rank(a) - rank(b));
};

/** The categories in the tree's order. */
export const sortedCategories = (page: Page, tree: TreeAnswer, lang: Lang, searching: boolean) =>
    ordered(page, lang, tree.categories, c => categoryName(c, lang), searching);

/** A category's subcategories in the tree's order. */
export const sortedSubCategories = (page: Page, category: TreeCategory, tt: TreeTexts, searching: boolean) =>
    ordered(page, tt.lang, category.subCategories, s => subCategoryName(s, tt), searching);

/** The category of the answer whose English name is `nameEn` (fails when the answer has none). */
export const categoryOf = (tree: TreeAnswer, nameEn: string) => {
    const found = tree.categories.find(c => c.nameEn === nameEn);
    if (!found) throw new Error(`The tree answer has no category "${nameEn}": ${tree.categories.map(c => c.nameEn).join(", ")}`);
    return found;
};

/** The subcategory of a category whose English name is `nameEn` (null: the bucket). */
export const subCategoryOf = (category: TreeCategory, nameEn: string | null) => {
    const found = category.subCategories.find(s => s.nameEn === nameEn);
    if (!found) throw new Error(`"${category.nameEn}" has no subcategory "${nameEn}" in the tree answer`);
    return found;
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isTreeResponse = (response: Response) => new URL(response.url()).pathname === TREE_PATH && response.request().method() === "GET";

/** The (search, source) of a tree request, as the SPA sends them (trimmed search; "all" left out). */
const treeKey = (search: string, source: TreeSource) => `${search}\u0000${source}`;
const keyOf = (url: string) => {
    const params = new URL(url).searchParams;
    return treeKey(params.get("search") ?? "", (params.get("source") ?? "all") as TreeSource);
};

/**
 * What a page received, shared by every tree helper of that page: its tree answers by (search, source) since its last
 * full load (a reload empties the SPA's cache too), and its last bearer token (to look a drug up like the page does).
 */
type Watch = { answers: Map<string, Promise<TreeAnswer | null>>; authorization: string | null };
const watches = new WeakMap<Page, Watch>();
const watch = (page: Page): Watch => {
    const found = watches.get(page);
    if (found) return found;
    const created: Watch = {answers: new Map(), authorization: null};
    watches.set(page, created);
    page.on("load", () => created.answers.clear());
    page.on("request", request => {
        const value = request.headers()["authorization"];
        if (value && new URL(request.url()).pathname.startsWith("/api/v1/")) created.authorization = value;
    });
    page.on("response", response => {
        if (!isTreeResponse(response) || !response.ok()) return;
        created.answers.set(keyOf(response.url()), response.json().then(body => body as TreeAnswer, () => null));
    });
    return created;
};

/** The drug tree inside `scope` (the prescription's catalog panel, the protocol editor's page). */
export class DrugTreeUi {
    readonly page: Page;
    readonly scope: Locator;
    readonly tt: TreeTexts;
    private readonly watch: Watch;

    constructor(page: Page, scope: Locator, tt: TreeTexts) {
        this.page = page;
        this.scope = scope;
        this.tt = tt;
        this.watch = watch(page);
    }

    private get answers() {
        return this.watch.answers;
    }

    /**
     * Waits for the page's tree request of (search, source) after a change: always when its answer isn't known yet; when
     * it is (the term came back), the SPA may answer from its cache, so at most a moment (its debounce and a refetch).
     */
    private nextAnswer(key: string): Promise<unknown> {
        const response = this.page.waitForResponse(r => isTreeResponse(r) && keyOf(r.url()) === key, {timeout: 20_000});
        if (!this.answers.has(key)) return response;
        return Promise.race([response.catch(() => null), this.page.waitForTimeout(1_500)]);
    }

    /** `role="tree"` named «كتالوج الأدوية» */
    get tree(): Locator {
        return this.scope.getByRole("tree", {name: this.tt.label, exact: true});
    }

    get searchBox(): Locator {
        return this.scope.getByPlaceholder(this.tt.searchPlaceholder, {exact: true});
    }

    /** The source toggle (`ToggleButtonGroup` named «الأدوية المعروضة») */
    get sourceToggle(): Locator {
        return this.scope.getByRole("group", {name: this.tt.sourceLabel, exact: true});
    }

    sourceButton(source: TreeSource): Locator {
        const label = {all: this.tt.sourceAll, shared: this.tt.sourceShared, own: this.tt.sourceOwn}[source];
        return this.sourceToggle.getByRole("button", {name: label, exact: true});
    }

    /** «النتائج: N» above the tree */
    get total(): Locator {
        return this.scope.getByText(new RegExp(`^${escape(this.tt.resultsPrefix)}[\\d,]+$`));
    }

    /** The thin progress bar over the old tree / the spinners («جارٍ التحميل…») */
    get loading(): Locator {
        return this.scope.getByRole("progressbar", {name: this.tt.loading});
    }

    /** Every row of a level (1 categories, 2 subcategories, 3 drugs) shown, top to bottom */
    rows(level: 1 | 2 | 3, within: Locator = this.tree): Locator {
        return within.locator(`[role="treeitem"][aria-level="${level}"]`);
    }

    /** A category row by its name in the UI language (its accessible name is «الاسم، العدد») */
    category(name: string): Locator {
        return this.rows(1).and(this.named(name));
    }

    /** A subcategory row of a category (the bucket's name: «بدون تصنيف فرعي») */
    subCategory(categoryName: string, name: string): Locator {
        return this.rows(2, this.category(categoryName)).and(this.named(name));
    }

    /** A drug row by the drug's name (its accessible name) */
    drug(name: string, within: Locator = this.tree): Locator {
        return this.rows(3, within).and(this.page.getByRole("treeitem", {name, exact: true}));
    }

    /** The drug rows loaded under a subcategory row */
    drugsIn(subCategoryRow: Locator): Locator {
        return this.rows(3, subCategoryRow);
    }

    /** A node's own children (`role="group"`: the first group inside the row) */
    groupOf(row: Locator): Locator {
        return row.getByRole("group").first();
    }

    /** The sentinel after a bucket's last loaded drug (observed: entering the panel's view loads the next page) */
    sentinelOf(subCategoryRow: Locator): Locator {
        return this.groupOf(subCategoryRow).getByTestId("drug-tree-sentinel");
    }

    /**
     * The tree's scroll panel (contract § 3.3 item 5: the nearest element around the tree, or the tree itself, whose
     * `overflowY` is auto): where it is and how far it is scrolled.
     */
    panelState() {
        return this.tree.evaluate(tree => {
            let panel: HTMLElement | null = tree as HTMLElement;
            while (panel && !["auto", "scroll"].includes(getComputedStyle(panel).overflowY)) panel = panel.parentElement;
            if (!panel) throw new Error("no scroll panel around the tree");
            const box = panel.getBoundingClientRect();
            return {
                scrollTop: panel.scrollTop, clientHeight: panel.clientHeight, scrollHeight: panel.scrollHeight,
                clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth, top: box.top, bottom: box.bottom,
                left: box.left, right: box.right, maxHeight: getComputedStyle(panel).maxHeight,
            };
        });
    }

    /** The accessible names of rows, top to bottom */
    labels(rows: Locator): Promise<string[]> {
        return rows.evaluateAll(els => els.map(el => el.getAttribute("aria-label") ?? ""));
    }

    /** A node's accessible name: `node(name, count)` */
    private named(name: string): Locator {
        return this.page.getByRole("treeitem", {name: new RegExp(`^${escape(name)}${escape(this.tt.nodeSeparator)}[\\d,]+$`)});
    }

    /** The node's own name text (a click on it toggles the node; the row's centre may sit on its children) */
    nameOf(row: Locator, name: string): Locator {
        return row.getByText(name, {exact: true}).first();
    }

    async expectOpen(row: Locator, open = true) {
        await expect(row).toHaveAttribute("aria-expanded", open ? "true" : "false");
    }

    /** Opens a category or subcategory row (a click on its name) unless it is open already. */
    async open(row: Locator, name: string) {
        await expect(row).toBeVisible();
        if (await row.getAttribute("aria-expanded") !== "true") await this.nameOf(row, name).click();
        await this.expectOpen(row);
    }

    async close(row: Locator, name: string) {
        if (await row.getAttribute("aria-expanded") === "true") await this.nameOf(row, name).click();
        await this.expectOpen(row, false);
    }

    /** Opens a category, then one of its subcategories; returns the subcategory row. */
    async openPath(categoryName: string, subCategoryName: string) {
        await this.open(this.category(categoryName), categoryName);
        const sub = this.subCategory(categoryName, subCategoryName);
        await this.open(sub, subCategoryName);
        return sub;
    }

    /** Waits until the tree finished loading (no progress bar, no spinner). */
    async settle() {
        await expect(this.loading.filter({visible: true}), "the tree finished loading").toHaveCount(0, {timeout: 20_000});
    }

    /** The source the toggle shows. */
    async shownSource(): Promise<TreeSource> {
        for (const source of ["all", "shared", "own"] as const) {
            if (await this.sourceButton(source).getAttribute("aria-pressed") === "true") return source;
        }
        throw new Error("no source pressed in the tree's toggle");
    }

    /** "ok" when the tree shows this answer (its categories' names and counts, any order, or the empty-state message). */
    private async showing(answer: TreeAnswer, source: TreeSource): Promise<string> {
        const shown = (await this.labels(this.rows(1))).sort();
        if (!answer.categories.length) {
            const search = (await this.searchBox.inputValue()).trim();
            const message = source === "own" && !search ? this.tt.noOwnDrugs : this.tt.noResults;
            const visible = await this.scope.getByText(message, {exact: true}).isVisible();
            return !shown.length && visible ? "ok" : `expected «${message}», shown ${JSON.stringify(shown)}`;
        }
        const expected = answer.categories.map(c => this.tt.node(categoryName(c, this.tt.lang), c.count)).sort();
        return JSON.stringify(shown) === JSON.stringify(expected) ? "ok" : `expected ${JSON.stringify(expected)}, shown ${JSON.stringify(shown)}`;
    }

    /** The tree shows this answer (e.g. the API's for the same search and source). */
    async expectShows(answer: TreeAnswer, source?: TreeSource) {
        const shownSource = source ?? await this.shownSource();
        await expect.poll(() => this.showing(answer, shownSource), {message: "the tree shows the answer's categories"}).toBe("ok");
    }

    /** Waits until the tree shows the page's latest answer for (search, source); returns it. */
    private async expectLatest(search: string, source: TreeSource): Promise<TreeAnswer | null> {
        const key = treeKey(search, source);
        let latest: TreeAnswer | null = null;
        await expect.poll(async () => {
            latest = await (this.answers.get(key) ?? Promise.resolve(null));
            return latest ? this.showing(latest, source) : `no answer yet for "${search}" (${source})`;
        }, {message: "the tree shows its answer", timeout: 20_000}).toBe("ok");
        return latest;
    }

    /**
     * Types a term in the tree's search and waits until the tree shows its answer (debounced; trimmed; for the source the
     * toggle shows). Returns the tree the page received for it (null when the term was the search already and its
     * answer came before any tree helper of the page).
     */
    async search(term: string): Promise<TreeAnswer | null> {
        const trimmed = term.trim();
        const source = await this.shownSource();
        const key = treeKey(trimmed, source);
        if ((await this.searchBox.inputValue()).trim() !== trimmed) {
            const answered = this.nextAnswer(key);
            await this.searchBox.fill(term);
            await answered;
        } else if (!this.answers.has(key)) {
            await this.settle();
            return null;
        }
        await this.settle();
        return this.expectLatest(trimmed, source);
    }

    /** Sets the source toggle and waits until the tree shows its answer. */
    async setSource(source: TreeSource) {
        const search = (await this.searchBox.inputValue()).trim();
        const answered = this.nextAnswer(treeKey(search, source));
        await this.sourceButton(source).click();
        await expect(this.sourceButton(source)).toHaveAttribute("aria-pressed", "true");
        await answered;
        await this.settle();
        return this.expectLatest(search, source);
    }

    /** Looks a drug up through the API like the page (its own token): its category and subcategory names. */
    private async whereIs(name: string): Promise<{ category: string; subCategory: string }> {
        const authorization = this.watch.authorization;
        if (!authorization) throw new Error(`addDrug(${name}): the page made no API request to borrow its token from`);
        const response = await this.page.request.get(`/api/v1/drugs?${new URLSearchParams({search: name, pageSize: "100"})}`,
            {headers: {Authorization: authorization}});
        expect(response.ok(), `GET /drugs?search=${name}`).toBe(true);
        const found = (await response.json() as Paged<ApiDrug>).items.filter(d => d.name === name);
        if (found.length !== 1) throw new Error(`addDrug(${name}): ${found.length} drugs with that name`);
        const drug = found[0];
        return {
            category: categoryName(drug.category, this.tt.lang),
            subCategory: drug.subCategory ? categoryName(drug.subCategory, this.tt.lang) : this.tt.noSubCategory,
        };
    }

    /** Scrolls a bucket's end into the panel's view until the drug row is loaded (at most `pages` more pages). */
    async loadUntil(subCategoryRow: Locator, drug: Locator, pages = 5) {
        for (let i = 0; i < pages && !await drug.isVisible(); i++) {
            const sentinel = this.sentinelOf(subCategoryRow);
            if (await sentinel.count() === 0) break;
            const before = await this.drugsIn(subCategoryRow).count();
            await sentinel.evaluate(el => el.scrollIntoView({block: "end"}));
            await expect.poll(async () => await drug.isVisible() || await this.drugsIn(subCategoryRow).count() > before,
                {message: "the next page of the bucket"}).toBe(true);
        }
        await expect(drug).toBeVisible();
    }

    /**
     * Makes the drug's row visible: types its name in the search; when one bucket opens by itself the row is there;
     * otherwise opens its category and subcategory (given, or looked up through the API).
     */
    async show(name: string, where?: { category: string; subCategory: string }): Promise<Locator> {
        const answer = await this.search(name);
        const row = this.drug(name);
        const subs = answer?.categories.flatMap(c => c.subCategories) ?? [];
        if (!where && subs.length === 1 && answer) {
            const category = answer.categories[0];
            where = {category: categoryName(category, this.tt.lang), subCategory: subCategoryName(subs[0], this.tt)};
            // It opens by itself (auto-open, D7)
            await this.expectOpen(this.subCategory(where.category, where.subCategory));
        }
        if (await row.isVisible()) return row;
        where ??= await this.whereIs(name);
        const sub = await this.openPath(where.category, where.subCategory);
        await this.loadUntil(sub, row);
        return row;
    }

    /** Clicks a drug row shown (on its name). */
    async select(name: string) {
        await this.drug(name).getByText(name, {exact: true}).first().click();
    }

    /** Adds a drug through the tree: shows its row (`show`) and clicks its name. */
    async addDrug(name: string, where?: { category: string; subCategory: string }) {
        await this.show(name, where);
        await this.select(name);
    }
}
