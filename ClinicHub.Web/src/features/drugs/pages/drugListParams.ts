import type {Category, DrugSource, SubCategoryFilter} from "../types.ts";

/*
 * The drugs page's state in the URL query (design M1.7 D9; CAT-134, CAT-135, CAT-143): `search`, `source`,
 * `categoryId`, `subCategoryId` (an id or "none"), `page` (1-based) and `view` ("list"; the tree is the default, M1.7
 * review R1). Defaults are left out of the URL. Pure (StrykerJS-mutated).
 */

/** The drugs page's two views: the category tree (default) or the flat, paged list. */
export type DrugListView = "tree" | "list";

export type DrugListParams = {
    search: string;
    source: DrugSource;
    categoryId: number | null;
    subCategoryId: SubCategoryFilter | null;
    /** 1-based (the list's; the tree has no page) */
    page: number;
    view: DrugListView;
};

export const DEFAULT_DRUG_LIST_PARAMS: DrugListParams = {search: "", source: "all", categoryId: null, subCategoryId: null, page: 1, view: "tree"};

const SOURCES: DrugSource[] = ["all", "shared", "own"];
/** The largest id the API binds (an `int`): a larger one can't name a category */
const MAX_ID = 2_147_483_647;

/** A positive integer written in digits only ("1.5", "-1", "1e3", " 2" are not), else null. */
const positiveInt = (value: string | null) => {
    if (value === null || !/^\d+$/.test(value)) return null;
    const n = Number(value);
    return n > 0 && Number.isSafeInteger(n) ? n : null;
};

/** A positive integer the API can bind as an id, else null. */
const idOf = (value: string | null) => {
    const n = positiveInt(value);
    return n !== null && n <= MAX_ID ? n : null;
};

/**
 * The page's state read from the URL; invalid values are dropped silently (no error, no 400): an unknown `source`
 * (another case included) → "all"; a `categoryId` that isn't a positive integer, or (once `categories` is loaded) isn't
 * one of them → none, and its subcategory with it; a `subCategoryId` without a valid category, "none" alone, not a
 * positive integer or "none", or (once loaded) not of that category → none; `page` not a positive integer → 1; `view`
 * other than "list" (another case included) → "tree".
 * While `categories` is undefined, syntactically valid ids are kept.
 */
export const readDrugListParams = (query: URLSearchParams, categories: Category[] | undefined): DrugListParams => {
    const sourceParam = query.get("source");
    const source = SOURCES.find(s => s === sourceParam) ?? "all";

    let categoryId = idOf(query.get("categoryId"));
    const category = categoryId === null ? undefined : categories?.find(c => c.id === categoryId);
    if (categories && !category) categoryId = null;

    const subCategoryParam = query.get("subCategoryId");
    let subCategoryId: SubCategoryFilter | null = subCategoryParam === "none" ? "none" : idOf(subCategoryParam);
    if (categoryId === null || (typeof subCategoryId === "number" && category && !category.subCategories.some(s => s.id === subCategoryId)))
        subCategoryId = null;

    return {search: query.get("search") ?? "", source, categoryId, subCategoryId, page: positiveInt(query.get("page")) ?? 1,
        view: query.get("view") === "list" ? "list" : "tree"};
};

/** The URL query of a state (default values left out; the search as typed, untrimmed). */
export const writeDrugListParams = (params: DrugListParams): URLSearchParams => {
    const query = new URLSearchParams();
    if (params.search !== "") query.set("search", params.search);
    if (params.source !== "all") query.set("source", params.source);
    if (params.categoryId !== null) query.set("categoryId", String(params.categoryId));
    if (params.subCategoryId !== null) query.set("subCategoryId", String(params.subCategoryId));
    if (params.page !== 1) query.set("page", String(params.page));
    if (params.view !== "tree") query.set("view", params.view);
    return query;
};

/** A page past the end shows the last page (CAT-143): `page` clamped to 1…ceil(totalCount / pageSize) (1 when empty). */
export const clampPage = (page: number, totalCount: number, pageSize: number): number =>
    Math.max(1, Math.min(page, Math.ceil(totalCount / pageSize)));

/** Which empty state an empty list shows (D9). */
export type DrugListEmptyState =
/** A search typed: «لا توجد أدوية مطابقة للبحث.» (`drugs.noResults`) */
    | "noResults"
    /** «أدوية العيادة», no category, no search: «لا توجد أدوية خاصة بالعيادة بعد.» + «إضافة دواء» (with `drugs.create`) */
    | "noOwnDrugs"
    /** Other filters, no search: «لا توجد أدوية مطابقة للفلاتر.» + «مسح الفلاتر» */
    | "noFilterResults"
    /** Nothing filtered, nothing searched: the existing «لا توجد أدوية بعد» (`drugs.emptyTitle`) */
    | "empty";

export const drugListEmptyState = (params: Pick<DrugListParams, "search" | "source" | "categoryId" | "subCategoryId">): DrugListEmptyState => {
    if (params.search.trim() !== "") return "noResults";
    if (params.source === "own" && params.categoryId === null) return "noOwnDrugs";
    if (params.source !== "all" || params.categoryId !== null || params.subCategoryId !== null) return "noFilterResults";
    return "empty";
};
