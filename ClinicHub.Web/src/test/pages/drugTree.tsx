import type {ReactElement} from "react";
import {act, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {http} from "msw";
import {expect, vi} from "vitest";
import type {QueryClient} from "@tanstack/react-query";
import type {CategoryName, Drug} from "../../features/drugs/types.ts";
import type {Permission} from "../../features/access/permissions.ts";
import {installIntersectionObserver} from "../intersection.ts";
import {api, drugsHandlers, drugTreeHandler, problem, treeOf} from "../msw.ts";
import {renderWithProviders} from "../render.tsx";
import {server} from "../server.ts";
import {DrugTreeHarness} from "./DrugTreeHarness.tsx";
import {isolate} from "../text.ts";

/*
 * The drug tree (`DrugTree`, docs/design/m1.7c-contract.md § 3.2–3.3) with its API (`GET /drugs/tree` + each open
 * subcategory's `GET /drugs`): its texts (the locale files' values, written out), locators by role and accessible
 * name, request gates and failures, and a render with the IntersectionObserver fake.
 */

export type TreeLang = "ar" | "en";

/** Another subcategory of «العيون» and another category, for trees with several rows (ids are not the catalog's). */
export const CATARACT: CategoryName = {id: 139, nameEn: "Cataract", nameAr: "المياه البيضاء"};
export const ANTI_INFECTIVES: CategoryName = {id: 2, nameEn: "Anti-infectives", nameAr: "مضادات العدوى"};
export const PENICILLINS: CategoryName = {id: 9, nameEn: "Penicillins", nameAr: "البنسلينات"};

const TEXTS = {
    ar: {
        tree: "كتالوج الأدوية",
        search: "ابحث بالاسم أو المادة الفعالة أو التصنيف…",
        separator: "، ",
        results: (count: string) => `النتائج: ${count}`,
        loading: "جارٍ التحميل…",
        loadMore: "تحميل المزيد",
        loadFailed: "تعذّر تحميل البيانات.",
        retry: "إعادة المحاولة",
        noResults: "لا توجد أدوية مطابقة للبحث.",
        noOwnDrugs: "لا توجد أدوية خاصة بالعيادة بعد.",
        noSubCategory: "بدون تصنيف فرعي",
        added: "مُضاف",
        shared: "مشترك",
        own: "خاص بالعيادة",
        source: "الأدوية المعروضة",
        sourceAll: "الكل",
        sourceShared: "المشتركة",
        sourceOwn: "أدوية العيادة",
        clear: "مسح",
        open: (name: string) => `فتح «${isolate(name)}»`,
        close: (name: string) => `إغلاق «${isolate(name)}»`,
        noDosing: "لا توجد جرعة محددة",
    },
    en: {
        tree: "Drug catalog",
        search: "Search by name, active ingredient or category…",
        separator: ", ",
        results: (count: string) => `Results: ${count}`,
        loading: "Loading…",
        loadMore: "Load more",
        loadFailed: "Couldn't load data.",
        retry: "Retry",
        noResults: "No drugs match your search.",
        noOwnDrugs: "This clinic has no drugs of its own yet.",
        noSubCategory: "No subcategory",
        added: "Added",
        shared: "Shared",
        own: "Clinic",
        source: "Drugs to show",
        sourceAll: "All",
        sourceShared: "Shared",
        sourceOwn: "Clinic's own",
        clear: "Clear",
        open: (name: string) => `Open “${isolate(name)}”`,
        close: (name: string) => `Close “${isolate(name)}”`,
        noDosing: "No dosing set",
    },
} as const;

/** The tree's texts in `lang` (docs/design/m1.7c-contract.md § 3.1 and the reused keys). */
export const treeTexts = (lang: TreeLang = "ar") => TEXTS[lang];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The tree (`role="tree"`, «كتالوج الأدوية» / "Drug catalog"). */
export const theTree = (lang: TreeLang = "ar") => screen.getByRole("tree", {name: treeTexts(lang).tree});

/** The tree's search box. */
export const treeSearch = (lang: TreeLang = "ar") => screen.getByRole("searchbox", {name: treeTexts(lang).search});

/** A category's or subcategory's accessible name: «الاسم، العدد» / "Name, count". */
export const nodeLabel = (name: string, count: string | number, lang: TreeLang = "ar") => `${name}${treeTexts(lang).separator}${count}`;

/** The category or subcategory row named `name` (any count); `count` given: exactly that name. */
export const nodeRow = (name: string, lang: TreeLang = "ar", count?: string | number) =>
    screen.getByRole("treeitem", {name: count === undefined ? new RegExp(`^${escape(name)}${treeTexts(lang).separator}`) : nodeLabel(name, count, lang)});

/** Waits for the category or subcategory row named `name` (see `nodeRow`). */
export const findNodeRow = (name: string, lang: TreeLang = "ar", count?: string | number) =>
    screen.findByRole("treeitem", {name: count === undefined ? new RegExp(`^${escape(name)}${treeTexts(lang).separator}`) : nodeLabel(name, count, lang)});

/** A drug's row (its accessible name: the drug's name). */
export const drugRow = (name: string) => screen.getByRole("treeitem", {name});

/** Waits for a drug's row. */
export const findDrugRow = (name: string) => screen.findByRole("treeitem", {name});

/** The rows of the tree at `level` (1 categories, 2 subcategories, 3 drugs), top to bottom. */
export const rowsAt = (level: 1 | 2 | 3) =>
    screen.queryAllByRole("treeitem").filter(row => row.getAttribute("aria-level") === String(level));

/** The accessible names of the rows at `level`, top to bottom. */
export const labelsAt = (level: 1 | 2 | 3) => rowsAt(level).map(row => row.getAttribute("aria-label"));

/**
 * The `role="group"` holding a node's children: owned through `aria-owns`, inside the row, or right after it (the
 * WAI-ARIA tree patterns); null while it has none.
 */
export const groupOf = (row: HTMLElement): HTMLElement | null => {
    const owned = row.getAttribute("aria-owns");
    if (owned) return document.getElementById(owned);
    const inside = row.querySelector<HTMLElement>("[role=group]");
    if (inside) return inside;
    const next = row.nextElementSibling as HTMLElement | null;
    return next?.getAttribute("role") === "group" ? next : null;
};

/** The children group of a node, which must be there. */
export const childrenOf = (row: HTMLElement) => {
    const group = groupOf(row);
    expect(group, `the group of «${row.getAttribute("aria-label")}»`).not.toBeNull();
    return group!;
};

/** The drug names under a subcategory row (its level-3 rows), top to bottom. */
export const drugNamesUnder = (subRow: HTMLElement) => {
    const group = groupOf(subRow);
    if (!group) return [];
    return within(group).queryAllByRole("treeitem")
        .filter(row => row.getAttribute("aria-level") === "3")
        .map(row => row.getAttribute("aria-label"));
};

/** The infinite-scroll sentinel of an open subcategory (`data-testid="drug-tree-sentinel"` in its group). */
export const sentinelOf = (subRow: HTMLElement) => within(childrenOf(subRow)).getByTestId("drug-tree-sentinel");

/** Opens (clicks) a closed category or subcategory row; an open one is left open. Returns the row. */
export const openNode = async (user: UserEvent, row: HTMLElement) => {
    if (row.getAttribute("aria-expanded") !== "true") await user.click(row);
    await waitFor(() => expect(row).toHaveAttribute("aria-expanded", "true"));
    return row;
};

/** Closes (clicks) an open category or subcategory row. */
export const closeNode = async (user: UserEvent, row: HTMLElement) => {
    if (row.getAttribute("aria-expanded") === "true") await user.click(row);
    await waitFor(() => expect(row).toHaveAttribute("aria-expanded", "false"));
    return row;
};

/** The «الأدوية المعروضة» toggle's button `name`. */
export const sourceButton = (name: string, lang: TreeLang = "ar") =>
    within(screen.getByRole("group", {name: treeTexts(lang).source})).getByRole("button", {name});

/** The thin progress bar over the old tree (a new search or source loading). */
export const thinBar = () => screen.queryAllByRole("progressbar").find(bar => bar.classList.contains("MuiLinearProgress-root")) ?? null;

/** Lets the debounce (300 ms, like the pickers) and React finish: for "nothing else happened" checks. */
export const pastDebounce = () => act(() => new Promise(resolve => setTimeout(resolve, 400)));

/** The `GET` requests of `path` in `requests` (from `recordRequests`), as their query parameters. */
export const paramsOf = (requests: Array<{ method: string; path: string; search: string }>, path: string) =>
    requests.filter(r => r.method === "GET" && r.path === path).map(r => new URLSearchParams(r.search));

/** `page` of each `GET /drugs` request in `requests`, with its subcategory: ["138:1", "138:2"]. */
export const pagesRequested = (requests: Array<{ method: string; path: string; search: string }>) =>
    paramsOf(requests, "/drugs").map(p => `${p.get("subCategoryId")}:${p.get("page")}`);

/**
 * Holds the `GET <path>` requests whose query matches until `release()` (falls through to the next handler then):
 * register after the answering handlers. `held()` counts the requests held so far.
 */
export const holdRequests = (path: string, match: (params: URLSearchParams) => boolean = () => true) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    let held = 0;
    server.use(http.get(api(path), async ({request}) => {
        if (!match(new URL(request.url).searchParams)) return undefined;
        held++;
        await gate;
        return undefined;
    }));
    return {release: () => release(), held: () => held};
};

/** `GET <path>` requests whose query matches answer 500 until `stop()` (a 5xx is retried once by the app). */
export const failRequests = (path: string, match: (params: URLSearchParams) => boolean = () => true) => {
    let failing = true;
    let failed = 0;
    server.use(http.get(api(path), ({request}) => {
        if (!failing || !match(new URL(request.url).searchParams)) return undefined;
        failed++;
        return problem(500, "unexpected");
    }));
    return {stop: () => void (failing = false), failed: () => failed};
};

type TreeOptions = {
    drugs?: Drug[];
    lang?: TreeLang;
    /** Drugs already chosen (they carry «مُضاف»); a selected drug joins them, as on the pages */
    selectedIds?: number[];
    autoFocus?: boolean;
    enabled?: boolean;
    maxHeight?: number | string;
    queryClient?: QueryClient;
    permissions?: Permission[];
    /** No default handlers: the test registers its own `GET /drugs/tree` and `GET /drugs` */
    ownHandlers?: boolean;
    /** Wraps the tree (e.g. in a dialog) */
    wrap?: (tree: ReactElement) => ReactElement;
    /** Runs after the default handlers are registered, before the render (e.g. `holdRequests` for the first answer) */
    beforeRender?: () => void;
};

/**
 * Renders `DrugTree` over `drugs` (`drugsHandlers` + `drugTreeHandler`, unless `ownHandlers`), with the
 * IntersectionObserver fake (`io`). Returns the render, `onSelect` (a spy) and `io`; it does not wait for anything.
 */
export const renderTree = async (options: TreeOptions = {}) => {
    const {drugs = [], lang = "ar", selectedIds = [], autoFocus, enabled, maxHeight, queryClient, permissions, ownHandlers, wrap, beforeRender} = options;
    if (!ownHandlers) server.use(drugTreeHandler(drugs), ...drugsHandlers(drugs));
    beforeRender?.();
    const io = installIntersectionObserver();
    const onSelect = vi.fn<(drug: Drug) => void>();
    const tree = <DrugTreeHarness onSelect={onSelect} initial={selectedIds} autoFocus={autoFocus} enabled={enabled} maxHeight={maxHeight}/>;
    const rendered = await renderWithProviders(wrap ? wrap(tree) : tree, {lang, queryClient, user: permissions ? {permissions} : undefined});
    return {...rendered, onSelect, io, texts: treeTexts(lang)};
};

/** Types `text` in the tree's search box (one paste, after clearing it). */
export const searchTree = async (user: UserEvent, text: string, lang: TreeLang = "ar") => {
    const box = treeSearch(lang);
    await user.clear(box);
    if (text) {
        await user.click(box);
        await user.paste(text);
    }
};

/**
 * Adds `name` through the tree as a user does (docs/design/m1.7c-contract.md § 4 "Page helpers through the tree"):
 * a row already shown is clicked; else it types the name in the tree's search and, when one subcategory opens by
 * itself, clicks the drug's row, else opens the drug's category and subcategory first. `drugs` are the drugs the
 * page's handlers serve (`treeOf` tells which case).
 */
export const addDrugThroughTree = async (user: UserEvent, drugs: Drug[], name: string, lang: TreeLang = "ar") => {
    const drug = drugs.find(d => d.name === name);
    expect(drug, `"${name}" among the tree's drugs`).toBeDefined();
    // Already shown (its subcategory open, e.g. opened by itself): one click, as a user would
    const shown = screen.queryByRole("treeitem", {name});
    if (shown) {
        await user.click(shown);
        return;
    }
    const box = treeSearch(lang);
    if ((box as HTMLInputElement).value !== name) {
        await searchTree(user, name, lang);
        // The new tree replaces the old one (the debounce, then its answer) with everything closed: never click a row of
        // the old tree, which the new one detaches
        await pastDebounce();
        await waitFor(() => expect(thinBar()).toBeNull());
        await act(async () => undefined);
    }
    const expected = treeOf(drugs, name);
    const opensByItself = expected.categories.length === 1 && expected.categories[0].subCategories.length === 1;
    if (!opensByItself) {
        const {category, subCategory} = drug!;
        const pick = (named: { nameEn: string; nameAr: string }) => (lang === "ar" ? named.nameAr : named.nameEn);
        await openNode(user, await findNodeRow(pick(category), lang));
        await openNode(user, await findNodeRow(subCategory ? pick(subCategory) : treeTexts(lang).noSubCategory, lang));
    }
    await user.click(await findDrugRow(name));
};
