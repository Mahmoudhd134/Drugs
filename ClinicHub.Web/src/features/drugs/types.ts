import type {Dosing} from "../dosing/types.ts";

/** A category or subcategory as a drug carries it (design M1.7 D8): both names; show the UI language's. */
export interface CategoryName {
    id: number;
    nameEn: string;
    nameAr: string;
}

/**
 * A drug (`GET /drugs`, `GET /drugs/{id}`; design M1.7 D8): the clinic's own or a shared catalog drug. Never an
 * Arabic name (the hidden one is never exposed).
 */
export interface Drug {
    id: number;
    /** The only name ever shown */
    name: string;
    /** One line; null when none */
    activeIngredients: string | null;
    description?: string | null;
    /** Used when the drug is added to a prescription (always null for a shared drug) */
    defaultDosing?: Dosing | null;
    /** A platform catalog drug: read-only for clinics */
    isShared: boolean;
    /** «معطّل من الإدارة»: a withdrawn shared drug (reachable by id or through a protocol only) */
    withdrawn: boolean;
    category: CategoryName;
    /** Null = «بدون تصنيف فرعي» */
    subCategory: CategoryName | null;
}

/** The drug of a protocol line (`ProtocolDrugDto`: no category, design M1.7 D8). */
export type ProtocolDrug = Pick<Drug, "id" | "name" | "description" | "defaultDosing" | "isShared" | "withdrawn">;

/**
 * A prescription line's copy of its drug (design M1.7 D9): lines stored before M1.7 have no `isShared` / `withdrawn`
 * and keep working; the «معطّل من الإدارة» chip reads `withdrawn` of the snapshot.
 */
export type DrugSnapshot = Pick<Drug, "id" | "name" | "description" | "defaultDosing"> & Partial<Pick<Drug, "isShared" | "withdrawn">>;

/** An own drug's body (`POST`/`PUT /drugs`); no Arabic name. */
export type SaveDrug = {
    name: string;
    activeIngredients: string | null;
    description: string | null;
    defaultDosing: Dosing | null;
    /** Required (null → `categoryRequired`, checked in the dialog first) */
    categoryId: number | null;
    subCategoryId: number | null;
};

/** A subcategory of `GET /drug-categories` (`pinnedLast` only for «غير مصنف»). */
export interface SubCategory {
    id: number;
    nameEn: string;
    nameAr: string;
    pinnedLast: boolean;
}

/** `GET /drug-categories` (design M1.7 D5, D8): every category with all its subcategories, no counts. */
export interface Category {
    id: number;
    nameEn: string;
    nameAr: string;
    /** «أخرى» only: listed last (by id: a rename keeps it) */
    pinnedLast: boolean;
    subCategories: SubCategory[];
}

/** The `source` filter (design M1.7 D8; the drugs-page toggle and the tree come with M1.7c). */
export type DrugSource = "all" | "shared" | "own";

/** `subCategoryId` filter: an id, or "none" (the category's drugs without a subcategory); needs a category. */
export type SubCategoryFilter = number | "none";

/** The drug-list filters besides the search (all optional: absent = every drug). */
export type DrugFilters = {
    source?: DrugSource;
    categoryId?: number | null;
    subCategoryId?: SubCategoryFilter | null;
};

/** A subcategory of the drug tree (`GET /drugs/tree`, design M1.7 D8), or (id and names null) «بدون تصنيف فرعي». */
export interface DrugTreeSubCategory {
    id: number | null;
    nameEn: string | null;
    nameAr: string | null;
    pinnedLast: boolean;
    /** Matching drugs of this clinic (own + active shared) for the tree's search and source */
    count: number;
}

/** A category of the drug tree: only those with matches; `count` = the sum of its subcategories' counts. */
export interface DrugTreeCategory {
    id: number;
    nameEn: string;
    nameAr: string;
    pinnedLast: boolean;
    count: number;
    subCategories: DrugTreeSubCategory[];
}

/** `GET /drugs/tree?search=&source=` (unsorted: categories and subcategories by id, the bucket last). */
export interface DrugTreeData {
    categories: DrugTreeCategory[];
}
