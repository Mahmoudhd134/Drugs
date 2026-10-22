import type {Category, DrugSource, SubCategoryFilter} from "../types.ts";

/*
 * The drugs page's state in the URL query (design M1.7 D9; CAT-134, CAT-135, CAT-143): `search`, `source`,
 * `categoryId`, `subCategoryId` (an id or "none") and `page` (1-based). Defaults are left out of the URL. Pure
 * (StrykerJS-mutated). M1.7c contract: names and signatures final, bodies are stubs (track web).
 */

export type DrugListParams = {
    search: string;
    source: DrugSource;
    categoryId: number | null;
    subCategoryId: SubCategoryFilter | null;
    /** 1-based */
    page: number;
};

export const DEFAULT_DRUG_LIST_PARAMS: DrugListParams = {search: "", source: "all", categoryId: null, subCategoryId: null, page: 1};

/**
 * The page's state read from the URL; invalid values are dropped silently (no error, no 400): an unknown `source`
 * (another case included) → "all"; a `categoryId` that isn't a positive integer, or (once `categories` is loaded) isn't
 * one of them → none, and its subcategory with it; a `subCategoryId` without a valid category, "none" alone, not a
 * positive integer or "none", or (once loaded) not of that category → none; `page` not a positive integer → 1.
 * While `categories` is undefined, syntactically valid ids are kept.
 */
export const readDrugListParams = (query: URLSearchParams, categories: Category[] | undefined): DrugListParams => {
    void categories;
    throw new Error(`M1.7c contract stub (track web): readDrugListParams ${query.size}`);
};

/** The URL query of a state (default values left out; the search as typed, untrimmed). */
export const writeDrugListParams = (params: DrugListParams): URLSearchParams => {
    throw new Error(`M1.7c contract stub (track web): writeDrugListParams ${params.page}`);
};

/** A page past the end shows the last page (CAT-143): `page` clamped to 1…ceil(totalCount / pageSize) (1 when empty). */
export const clampPage = (page: number, totalCount: number, pageSize: number): number => {
    throw new Error(`M1.7c contract stub (track web): clampPage ${page} ${totalCount} ${pageSize}`);
};

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
    throw new Error(`M1.7c contract stub (track web): drugListEmptyState ${params.source}`);
};
