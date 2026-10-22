/** A subcategory of `GET /admin/drug-categories` (design M1.7 D8). */
export interface AdminSubCategory {
    id: number;
    nameEn: string;
    nameAr: string;
    pinnedLast: boolean;
    /** Shared (withdrawn included) + every clinic's own drugs, deleted clinics included: > 0 blocks the delete */
    drugCount: number;
    /** The part held by deleted clinics («من عيادات محذوفة: N») */
    deletedClinicsDrugCount: number;
}

export interface AdminCategory extends Omit<AdminSubCategory, never> {
    /** The «بدون تصنيف فرعي» row: drugs of the category without a subcategory (shown when > 0) */
    noSubCategoryDrugCount: number;
    subCategories: AdminSubCategory[];
}

/** `POST`/`PUT` body of a category or subcategory: both names (each ≤ 100 characters). */
export type SaveCategory = { nameEn: string; nameAr: string };
