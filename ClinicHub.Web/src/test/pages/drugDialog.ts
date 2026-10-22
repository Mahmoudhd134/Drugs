import {within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import type {Category} from "../../features/drugs/types.ts";
import {aCategory, aSubCategory, EYE, GLAUCOMA, OTHER, UNCLASSIFIED} from "../data.ts";
import {choose} from "../mui.ts";

/*
 * The own-drug dialog's category fields (M1.7b contract "Own-drug dialog": a required category select `drugs.category`,
 * an optional subcategory select `drugs.subCategory` listing only the chosen category's, first option
 * `drugs.noSubCategory`). The selects are found by the start of their accessible name (a select's name may carry its
 * value; the category's never starts like the subcategory's).
 */

type Lang = "ar" | "en";

const LABELS = {
    ar: {category: "التصنيف", subCategory: "التصنيف الفرعي", eye: "العيون", glaucoma: "المياه الزرقاء"},
    en: {category: "Category", subCategory: "Subcategory", eye: "Eye", glaucoma: "Glaucoma"},
};

/** «العيون» with «المياه الزرقاء» and «مضادات العدوى للعين»; «مضادات العدوى» with two; «أخرى» (pinned) with «غير مصنف». */
export const DIALOG_CATEGORIES: Category[] = [
    aCategory({
        ...EYE, subCategories: [
            {...GLAUCOMA, pinnedLast: false},
            aSubCategory({id: 139, nameEn: "Eye anti-infectives", nameAr: "مضادات العدوى للعين"}),
        ],
    }),
    aCategory({
        id: 2, nameEn: "Anti-infectives", nameAr: "مضادات العدوى", subCategories: [
            aSubCategory({id: 21, nameEn: "Penicillins", nameAr: "البنسلينات"}),
            aSubCategory({id: 22, nameEn: "Quinolones", nameAr: "الكينولونات"}),
        ],
    }),
    aCategory({...OTHER, pinnedLast: true, subCategories: [{...UNCLASSIFIED, pinnedLast: true}]}),
];

/** The category select of the dialog (or of `scope`). */
export const categoryField = (scope: HTMLElement = document.body, lang: Lang = "ar", hidden = false) => {
    const {category, subCategory} = LABELS[lang];
    return within(scope).getByRole("combobox", {
        name: name => name.startsWith(category) && !name.startsWith(subCategory),
        hidden,
    });
};

/** The subcategory select. */
export const subCategoryField = (scope: HTMLElement = document.body, lang: Lang = "ar", hidden = false) =>
    within(scope).getByRole("combobox", {name: name => name.startsWith(LABELS[lang].subCategory), hidden});

/** The active ingredients field («المادة الفعالة» / "Active ingredients"). */
export const ingredientsField = (scope: HTMLElement = document.body, lang: Lang = "ar", hidden = false) =>
    within(scope).getByRole("textbox", {name: lang === "ar" ? "المادة الفعالة" : "Active ingredients", hidden});

/**
 * Picks the category (default «العيون» / "Eye") and, when given, the subcategory, in the dialog (or `scope`), as a user
 * would before saving a new drug (the category is required, CAT-049).
 */
export const pickCategory = async (user: UserEvent, options: {
    scope?: HTMLElement; lang?: Lang; category?: string; subCategory?: string; hidden?: boolean;
} = {}) => {
    const {scope = document.body, lang = "ar", hidden = false} = options;
    await choose(user, categoryField(scope, lang, hidden), options.category ?? LABELS[lang].eye);
    if (options.subCategory) await choose(user, subCategoryField(scope, lang, hidden), options.subCategory);
};
