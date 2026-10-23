import {categoryName} from "../categories.ts";
import type {Drug, DrugTreeCategory, DrugTreeData, DrugTreeSubCategory, SubCategoryFilter} from "../types.ts";

/*
 * The drug tree's pure logic (design M1.7 D5, D7, D9): order, auto-open, the visible rows and the keyboard. No React,
 * no requests (StrykerJS-mutated, PURE_LOGIC coverage gate). Names and signatures: M1.7c contract § 2.3.
 */

/** One open subcategory: `"<categoryId>:<subCategoryId>"`, or `"<categoryId>:none"` for «بدون تصنيف فرعي». */
export type BucketKey = `${number}:${number | "none"}`;

/** The key of a category's subcategory (null = the bucket of its drugs without one). */
export const bucketKey = (categoryId: number, subCategoryId: number | null): BucketKey =>
    `${categoryId}:${subCategoryId ?? "none"}`;

/** The `subCategoryId` filter of a bucket's drug requests (null → "none"). */
export const subCategoryFilterOf = (subCategoryId: number | null): SubCategoryFilter => subCategoryId ?? "none";

/**
 * The tree as shown (a new array; the answer is left as it is). Without a search: categories and subcategories by name
 * with `Intl.Collator(language)` (`sortCategories`' order). With one: by count, largest first, ties by name. In both,
 * the `pinnedLast` rows («أخرى», «غير مصنف») come after the others, and the «بدون تصنيف فرعي» bucket (id null) is
 * always the last subcategory of its category.
 */
export const sortTree = (tree: DrugTreeData, language: string, searching: boolean): DrugTreeCategory[] => {
    const collator = new Intl.Collator(language);
    const name = (row: { nameEn: string | null; nameAr: string | null }) =>
        categoryName({nameEn: row.nameEn ?? "", nameAr: row.nameAr ?? ""}, language);
    const compare = (a: DrugTreeCategory | DrugTreeSubCategory, b: DrugTreeCategory | DrugTreeSubCategory) =>
        Number(a.pinnedLast) - Number(b.pinnedLast)
        || (searching ? b.count - a.count : 0)
        || collator.compare(name(a), name(b));
    return tree.categories
        .map(category => ({
            ...category,
            subCategories: [...category.subCategories].sort((a, b) =>
                Number(a.id === null) - Number(b.id === null) || compare(a, b)),
        }))
        .sort(compare);
};

/** «النتائج: N» above the tree: the sum of the category counts. */
export const treeTotal = (tree: DrugTreeData): number =>
    tree.categories.reduce((sum, category) => sum + category.count, 0);

/**
 * The bucket that opens by itself (D7): when the whole answer holds exactly one subcategory bucket (a «بدون تصنيف
 * فرعي» bucket included), that one; else null. Its category opens with it.
 */
export const autoOpenBucket = (tree: DrugTreeData): { categoryId: number; bucket: BucketKey } | null => {
    const buckets = tree.categories.flatMap(category =>
        category.subCategories.map(subCategory => ({categoryId: category.id, bucket: bucketKey(category.id, subCategory.id)})));
    return buckets.length === 1 ? buckets[0] : null;
};

/** A focusable row of the tree, in display order (`visibleRows`). */
export type TreeRow =
    | { kind: "category"; id: string; level: 1; category: DrugTreeCategory }
    | { kind: "subCategory"; id: string; level: 2; categoryId: number; bucket: BucketKey; subCategory: DrugTreeSubCategory }
    | { kind: "drug"; id: string; level: 3; categoryId: number; bucket: BucketKey; drug: Drug };

/**
 * The rows a keyboard user can reach, top to bottom: every category; under an open one its subcategories; under an
 * open subcategory its loaded drugs (`drugs` holds each open bucket's rows, already de-duplicated). Row ids are unique
 * and stable across renders: `c<categoryId>`, `s<bucketKey>`, `d<bucketKey>:<drugId>`.
 */
export const visibleRows = (categories: DrugTreeCategory[], openCategories: ReadonlySet<number>,
                            openBuckets: ReadonlySet<BucketKey>, drugs: ReadonlyMap<BucketKey, Drug[]>): TreeRow[] =>
    categories.flatMap((category): TreeRow[] => [
        {kind: "category", id: `c${category.id}`, level: 1, category},
        ...(openCategories.has(category.id)
            ? category.subCategories.flatMap((subCategory): TreeRow[] => {
                const bucket = bucketKey(category.id, subCategory.id);
                return [
                    {kind: "subCategory", id: `s${bucket}`, level: 2, categoryId: category.id, bucket, subCategory},
                    ...(openBuckets.has(bucket)
                        ? (drugs.get(bucket) ?? []).map((drug): TreeRow =>
                            ({kind: "drug", id: `d${bucket}:${drug.id}`, level: 3, categoryId: category.id, bucket, drug}))
                        : []),
                ];
            })
            : []),
    ]);

/** What a key does on a focused tree row (`treeKeyAction`). */
export type TreeKeyAction =
/** ↓: the next row (at the last loaded drug of a bucket with more pages, the component loads the next page first) */
    | "next"
    /** ↑: the previous row (stops at the first) */
    | "previous"
    /** → (← in RTL) on a closed category or subcategory: open it */
    | "open"
    /** → (← in RTL) on an open node: move to its first child */
    | "firstChild"
    /** ← (→ in RTL) or Esc on an open node: close it */
    | "close"
    /** ← (→ in RTL) or Esc on a drug or a closed subcategory: close the parent and move the focus to it */
    | "closeParent"
    /** Enter: a node opens or closes (like a click), a drug is added */
    | "activate";

/**
 * The action of a key on a row (D9): ↑/↓ move; → / Enter open and ← closes (mirrored when `rtl`: ← opens, → closes);
 * Esc acts like the closing arrow; Enter activates. A key with no action here (letters, Tab, Home…) → null, and the
 * component lets it through. On a closed category the closing arrow and Esc do nothing (null).
 */
export const treeKeyAction = (key: string, row: TreeRow, expanded: boolean, rtl: boolean): TreeKeyAction | null => {
    const isDrug = row.kind === "drug";
    switch (key) {
        case "ArrowDown":
            return "next";
        case "ArrowUp":
            return "previous";
        case "Enter":
            return "activate";
        case rtl ? "ArrowLeft" : "ArrowRight":
            if (isDrug) return null;
            return expanded ? "firstChild" : "open";
        case rtl ? "ArrowRight" : "ArrowLeft":
        case "Escape":
            if (!isDrug && expanded) return "close";
            return row.kind === "category" ? null : "closeParent";
        default:
            return null;
    }
};

/** The drugs of a bucket's pages, the first copy of each id kept (a drug added between two pages, CAT-122). */
export const dedupeById = (pages: Drug[][]): Drug[] => {
    const seen = new Set<number>();
    return pages.flat().filter(drug => !seen.has(drug.id) && Boolean(seen.add(drug.id)));
};
