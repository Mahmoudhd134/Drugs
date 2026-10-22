import type {CategoryName} from "./types.ts";

/** The name of a category or subcategory in the UI language (`ar` → `nameAr`, else `nameEn`). */
export const categoryName = (category: Pick<CategoryName, "nameEn" | "nameAr">, language: string) =>
    language.startsWith("ar") ? category.nameAr : category.nameEn;

/**
 * Sorted for display (design M1.7 D5): by name with `Intl.Collator(language)`, the `pinnedLast` rows last (then by
 * name). The same order everywhere: drug dialog, admin screens, and in M1.7c the drugs-page filters and the tree.
 * M1.7b contract stub (track `web`).
 */
export const sortCategories = <T extends { nameEn: string; nameAr: string; pinnedLast: boolean }>(rows: T[], language: string): T[] => {
    void language;
    throw new Error(`M1.7b contract stub (track web): ${rows.length}`);
};
