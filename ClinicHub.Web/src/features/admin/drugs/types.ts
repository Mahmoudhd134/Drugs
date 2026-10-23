import type {CategoryName} from "../../drugs/types.ts";

/** `GET /admin/drugs` status filter (design M1.7 D8): «مفعّل» / «معطّل» / «الكل»; default active. */
export type SharedDrugStatus = "active" | "withdrawn" | "all";

/** A shared drug in the admin catalog (`AdminDrugDto`): no dosing, no `isShared`, no Arabic name. */
export interface AdminDrug {
    id: number;
    name: string;
    activeIngredients: string | null;
    description: string | null;
    withdrawn: boolean;
    /** ISO UTC; null while active */
    withdrawnAt: string | null;
    category: CategoryName;
    subCategory: CategoryName | null;
}

/** `POST`/`PUT /admin/drugs` body: the clinic drug's fields without dosing. */
export type SaveSharedDrug = {
    name: string;
    activeIngredients: string | null;
    description: string | null;
    categoryId: number | null;
    subCategoryId: number | null;
};
