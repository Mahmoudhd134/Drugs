import type {TFunction} from "i18next";
import type {CategoryName} from "./types.ts";

/** The name of a category or subcategory in the UI language (`ar` → `nameAr`, else `nameEn`). */
export const categoryName = (category: Pick<CategoryName, "nameEn" | "nameAr">, language: string) =>
    language.startsWith("ar") ? category.nameAr : category.nameEn;

/**
 * Sorted for display (design M1.7 D5): by name with `Intl.Collator(language)`, the `pinnedLast` rows last (then by
 * name). The same order everywhere: drug dialog, admin screens, and in M1.7c the drugs-page filters and the tree.
 * Returns a new array (the given one is left as it is).
 */
export const sortCategories = <T extends { nameEn: string; nameAr: string; pinnedLast: boolean }>(rows: T[], language: string): T[] => {
    const collator = new Intl.Collator(language);
    return [...rows].sort((a, b) =>
        Number(a.pinnedLast) - Number(b.pinnedLast)
        || collator.compare(categoryName(a, language), categoryName(b, language)));
};

type Named = Pick<CategoryName, "nameEn" | "nameAr">;

/**
 * «الفئة › الفرعية» in the UI language (`drugs.categoryPath`), or the category alone when there is no subcategory
 * (design M1.7 D9). `t` is i18next's.
 */
export const categoryPath = (category: Named, subCategory: Named | null | undefined, language: string, t: TFunction) =>
    subCategory
        ? t("drugs.categoryPath", {category: categoryName(category, language), subCategory: categoryName(subCategory, language)})
        : categoryName(category, language);
