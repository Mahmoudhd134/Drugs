import {expect, type Locator, type Page} from "@playwright/test";
import type {ApiSession} from "./api.ts";
import type {ClinicHandle, Data} from "./data.ts";
import {unique} from "./phones.ts";

/*
 * The shared catalog in the e2e run (design M1.7 D12; M1.7b contract § 4.2, § 4.3): the imported catalog is loaded
 * by the global setup and shared by every test, so specs read imported drugs by exact name (never by id) and never
 * change them; a spec that writes the shared catalog or the categories lives in `e2e/shared-catalog-edits/` and uses
 * its own rows (`sharedDrug`, `category`, `subCategory`: unique names).
 */

/** The API's shapes (docs/design/m1.7b-contract.md § 2.5). */
export type CategoryName = { id: number; nameEn: string; nameAr: string };
export type CategoryRow = CategoryName & { pinnedLast: boolean; subCategories: (CategoryName & { pinnedLast: boolean })[] };
export type ApiDrug = {
    id: number; name: string; activeIngredients: string | null; description: string | null; defaultDosing: unknown;
    isShared: boolean; withdrawn: boolean; category: CategoryName; subCategory: CategoryName | null;
};
export type AdminDrug = {
    id: number; name: string; activeIngredients: string | null; description: string | null; withdrawn: boolean;
    withdrawnAt: string | null; category: CategoryName; subCategory: CategoryName | null;
};
export type AdminSubCategory = CategoryName & { pinnedLast: boolean; drugCount: number; deletedClinicsDrugCount: number };
export type AdminCategory = AdminSubCategory & { noSubCategoryDrugCount: number; subCategories: AdminSubCategory[] };
export type Paged<T> = { items: T[]; totalCount: number; page: number; pageSize: number };

/** Imported shared drugs used by the specs (contract § 4.3), by exact name. */
export const IMPORTED = {
    alemox1g: "ALEMOX 1 GM 12 F.C.TABS.",
    alemox750: "ALEMOX 750 MG 12 F.C.TABS.",
    vigamox: "VIGAMOX 0.5% EYE DROPS 5 ML",
    tobradexSusp: "TOBRADEX EYE SUSP. DROPS 5 ML",
    tobradexOint: "TOBRADEX EYE OINT. 3.5 GM",
    xalatan: "XALATAN 50MCG/ML EYE DROPS 2.5 ML",
    nailner: "NAILNER NAIL FUNGUS PEN 4 ML",
    carboplatin: `CARBOPLATIN "EBEWE" 150 MG VIAL`,
} as const;

/** «العيون» / "Eye" and «المياه الزرقاء» / "Glaucoma": the default category of the test data (D12), by English name. */
export const EYE = {en: "Eye", ar: "العيون"};
export const GLAUCOMA = {en: "Glaucoma", ar: "المياه الزرقاء"};

const eyeGlaucoma = new WeakMap<ApiSession, Promise<{ categoryId: number; subCategoryId: number }>>();

/** The ids of «العيون › المياه الزرقاء», read once per session from `GET /drug-categories` (clinic) or the admin list. */
export const defaultCategory = (api: ApiSession, platform = false) => {
    let ids = eyeGlaucoma.get(api);
    if (!ids) {
        ids = (async () => {
            const rows = await api.ok<CategoryRow[]>("GET", platform ? "/api/v1/admin/drug-categories" : "/api/v1/drug-categories");
            const eye = rows.find(c => c.nameEn === EYE.en);
            const glaucoma = eye?.subCategories.find(s => s.nameEn === GLAUCOMA.en);
            if (!eye || !glaucoma) throw new Error("The catalog has no Eye › Glaucoma (load_catalog.py not run?)");
            return {categoryId: eye.id, subCategoryId: glaucoma.id};
        })();
        eyeGlaucoma.set(api, ids);
    }
    return ids;
};

/** An own drug's body (`SaveDrugRequest`): «العيون › المياه الزرقاء» unless the fields say otherwise. */
export const ownDrugBody = async (api: ApiSession, fields: {
    name: string; description?: string | null; defaultDosing?: unknown; activeIngredients?: string | null;
    categoryId?: number; subCategoryId?: number | null;
}) => {
    const category = fields.categoryId === undefined ? await defaultCategory(api) : {categoryId: fields.categoryId, subCategoryId: fields.subCategoryId ?? null};
    return {
        name: fields.name,
        activeIngredients: fields.activeIngredients ?? null,
        description: fields.description ?? null,
        defaultDosing: fields.defaultDosing ?? null,
        ...category,
    };
};

/** The imported shared drug with exactly this name, as the clinic's API answers it (fails unless exactly one). */
export const sharedByName = async (api: ApiSession, name: string) => {
    const page = await api.ok<Paged<ApiDrug>>("GET", `/api/v1/drugs?search=${encodeURIComponent(name)}&source=shared&pageSize=100`);
    const found = page.items.filter(d => d.name === name);
    if (found.length !== 1) throw new Error(`Expected one shared drug named ${name}, found ${found.length}`);
    return found[0];
};

/** `GET /drugs?…` as the clinic's API answers it (the screen is compared with it in the same run, D12). */
export const listDrugs = (api: ApiSession, query: Record<string, string | number>) =>
    api.ok<Paged<ApiDrug>>("GET", `/api/v1/drugs?${new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]))}`);

/** Grouped Latin digits, as every count of the UI shows them (design M1.7 D9 "Numbers"): 23414 → "23,414". */
export const grouped = (n: number) => new Intl.NumberFormat("en-US").format(n);

// ---- The super admin's writes (shared-catalog-edits only: their own rows, unique names) ----

/** A shared drug of the test's own (`POST /admin/drugs`): unique name, «العيون › المياه الزرقاء» unless given. */
export const sharedDrug = async (admin: ApiSession, fields: {
    name?: string; activeIngredients?: string | null; description?: string | null; categoryId?: number; subCategoryId?: number | null;
} = {}) => {
    const category = fields.categoryId === undefined ? await defaultCategory(admin, true) : {categoryId: fields.categoryId, subCategoryId: fields.subCategoryId ?? null};
    return admin.ok<AdminDrug>("POST", "/api/v1/admin/drugs", {
        name: fields.name ?? `E2E SHARED ${unique()} 5 ML`,
        activeIngredients: fields.activeIngredients ?? null,
        description: fields.description ?? null,
        ...category,
    });
};

export const updateSharedDrug = (admin: ApiSession, drug: AdminDrug, changes: Partial<Pick<AdminDrug, "name" | "activeIngredients" | "description">>) =>
    admin.ok<AdminDrug>("PUT", `/api/v1/admin/drugs/${drug.id}`, {
        name: changes.name ?? drug.name,
        activeIngredients: changes.activeIngredients !== undefined ? changes.activeIngredients : drug.activeIngredients,
        description: changes.description !== undefined ? changes.description : drug.description,
        categoryId: drug.category.id,
        subCategoryId: drug.subCategory?.id ?? null,
    });

export const withdrawSharedDrug = (admin: ApiSession, drug: { id: number }) => admin.ok("POST", `/api/v1/admin/drugs/${drug.id}/withdraw`);
export const restoreSharedDrug = (admin: ApiSession, drug: { id: number }) => admin.ok("POST", `/api/v1/admin/drugs/${drug.id}/restore`);
export const getSharedDrug = (admin: ApiSession, drug: { id: number }) => admin.ok<AdminDrug>("GET", `/api/v1/admin/drugs/${drug.id}`);

/** A category of the test's own (unique names in both languages). */
export const category = (admin: ApiSession, names: { nameEn?: string; nameAr?: string } = {}) => {
    const u = unique();
    return admin.ok<CategoryName>("POST", "/api/v1/admin/drug-categories",
        {nameEn: names.nameEn ?? `E2E category ${u}`, nameAr: names.nameAr ?? `تصنيف تجريبي ${u}`});
};

export const subCategory = (admin: ApiSession, categoryId: number, names: { nameEn?: string; nameAr?: string } = {}) => {
    const u = unique();
    return admin.ok<CategoryName>("POST", `/api/v1/admin/drug-categories/${categoryId}/subcategories`,
        {nameEn: names.nameEn ?? `E2E subcategory ${u}`, nameAr: names.nameAr ?? `تصنيف فرعي تجريبي ${u}`});
};

export const deleteCategory = (admin: ApiSession, id: number) => admin.ok("DELETE", `/api/v1/admin/drug-categories/${id}`);
export const adminCategories = (admin: ApiSession) => admin.ok<AdminCategory[]>("GET", "/api/v1/admin/drug-categories");

/** An own drug of a clinic in a chosen category (the owner's API). */
export const ownDrugIn = async (data: Data, clinic: ClinicHandle, fields: Parameters<typeof ownDrugBody>[1]) => {
    const api = await data.ownerApi(clinic);
    return api.ok<ApiDrug>("POST", "/api/v1/drugs", await ownDrugBody(api, fields));
};

// ---- UI ----

/** The drug dialog's category / subcategory select (`drugs.category` / `drugs.subCategory`), by the start of its name. */
export const categorySelect = (form: Locator, lang: "ar" | "en") =>
    form.getByRole("combobox", {name: lang === "ar" ? /^التصنيف(?! الفرعي)/ : /^Category/});
export const subCategorySelect = (form: Locator, lang: "ar" | "en") =>
    form.getByRole("combobox", {name: lang === "ar" ? /^التصنيف الفرعي/ : /^Subcategory/});

/** Picks the category (default «العيون») and optionally the subcategory in a drug dialog, as a user does before saving. */
export const pickCategory = async (page: Page, form: Locator, lang: "ar" | "en",
                                   options: { category?: string; subCategory?: string } = {}) => {
    await categorySelect(form, lang).click();
    await page.getByRole("option", {name: options.category ?? EYE[lang], exact: true}).click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    if (options.subCategory) {
        await subCategorySelect(form, lang).click();
        await page.getByRole("option", {name: options.subCategory, exact: true}).click();
        await expect(page.getByRole("listbox")).toHaveCount(0);
    }
};
