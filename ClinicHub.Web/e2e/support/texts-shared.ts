import type {Lang} from "./texts.ts";

/**
 * The expected texts of the shared catalog and categories (M1.7b), written out like `texts.ts` (never imported from
 * the locale files, so a changed message fails a test). Source: docs/design/m1.7b-contract.md § 3.5 (final texts of
 * ar.ts / en.ts) and the cases of docs/design/m1.7-shared-catalog.test-cases.md. A name inside a message sits in the
 * bidi isolates U+2068/U+2069; counts are grouped Latin digits (design M1.7 D9 "Numbers").
 */
const iso = (name: string) => `⁨${name}⁩`;
/**
 * A row button's accessible name that ends with its row's name (decision D30, CAT-236): the action, then the name in
 * quotes («…» / “…”, bidi isolates allowed), e.g. «تعديل «⁨الاسم⁩»» / "Edit “⁨name⁩”".
 */
const rowAction = (verb: string, open: string, close: string) => (name: string) =>
    new RegExp(`^${verb}[^${open}]*${open}\u2068?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\u2069?${close}$`);
const group = (n: number) => new Intl.NumberFormat("en-US").format(n);

/** Arabic plural forms (CLDR: zero, one, two, few = 3–10, many = 11–99, other; by n mod 100). */
const arPlural = (n: number, forms: { zero: string; one: string; two: string; few: string; many: string; other: string }) => {
    const mod = n % 100;
    return n === 0 ? forms.zero : n === 1 ? forms.one : n === 2 ? forms.two
        : mod >= 3 && mod <= 10 ? forms.few : mod >= 11 && mod <= 99 ? forms.many : forms.other;
};

const arInUse = (what: string) => (n: number) => `لا يمكن حذف ${what}: ` + arPlural(n, {
    zero: `يستخدمه ${group(n)} دواء.`, one: "يستخدمه دواء واحد.", two: "يستخدمه دواءان.",
    few: `يستخدمه ${group(n)} أدوية.`, many: `يستخدمه ${group(n)} دواءً.`, other: `يستخدمه ${group(n)} دواء.`,
});

const ar = {
    // Drugs page, own-drug dialog, read-only details
    /** The old shared chip: no row shows it any more (M1.7 review R2), kept for absence checks */
    chipShared: "مشترك",
    chipOwn: "خاص بالعيادة",
    activeIngredients: "المادة الفعالة",
    category: "التصنيف",
    subCategory: "التصنيف الفرعي",
    noSubCategory: "بدون تصنيف فرعي",
    allCategories: "كل التصنيفات",
    allSubCategories: "كل التصنيفات الفرعية",
    categoryLine: (path: string) => `التصنيف: ${path}`,
    categoryPath: (category: string, sub: string) => `${category} › ${sub}`,
    categoryRequired: "التصنيف مطلوب.",
    categoryNotFound: "هذا التصنيف لم يعد موجودًا. اختر تصنيفًا آخر.",
    noDosing: "لا توجد جرعة محددة",
    defaultDosing: "الجرعة الافتراضية",
    // Withdrawn («معطّل من الإدارة», design M1.7 D6)
    withdrawnChip: "معطّل من الإدارة",
    withdrawnCount: (n: number) => `معطّل من الإدارة: ${group(n)}`,
    withdrawnTooltip: "عطّل مدير المنصة هذا الدواء في الكتالوج المشترك، فلا يظهر في البحث. يبقى في البروتوكولات التي تستخدمه.",
    withdrawnAlert: "بعض الأدوية عطّلها مدير المنصة في الكتالوج المشترك.",
    drugWithdrawnNamed: (name: string) => `«${iso(name)}» معطّل من الإدارة ولا يمكن إضافته.`,
    protocolWithdrawn: (n: number) => `أُضيف رغم تعطيله من الإدارة: ${group(n)}`,
    protocolAdded: (name: string, n: number) => `تمت الإضافة من «${iso(name)}»: ${group(n)}`,
    // Admin
    navDrugs: "الأدوية",
    navCategories: "التصنيفات",
    adminDrugsTitle: "الأدوية المشتركة",
    adminDrugsSubtitle: (n: number) => arPlural(n, {
        zero: `${group(n)} دواء`, one: "دواء واحد", two: "دواءان", few: `${group(n)} أدوية`, many: `${group(n)} دواءً`, other: `${group(n)} دواء`,
    }),
    adminAdd: "إضافة دواء",
    adminNew: "دواء مشترك جديد",
    adminEdit: "تعديل الدواء المشترك",
    adminSearch: "ابحث في الكتالوج المشترك…",
    statusLabel: "الحالة",
    statusActive: "مفعّل",
    statusWithdrawn: "معطّل",
    statusAll: "الكل",
    withdraw: "تعطيل الدواء",
    restore: "تفعيل الدواء",
    // The row buttons (D30): each ends with its row's name
    editRow: rowAction("تعديل", "«", "»"),
    withdrawRow: rowAction("تعطيل", "«", "»"),
    restoreRow: rowAction("تفعيل", "«", "»"),
    renameRow: rowAction("تعديل", "«", "»"),
    deleteRow: rowAction("حذف", "«", "»"),
    withdrawTitle: (name: string) => `تعطيل «${iso(name)}»؟`,
    withdrawMessage: "سيختفي من البحث في كل العيادات ويبقى في البروتوكولات التي تستخدمه. يمكنك تفعيله لاحقًا.",
    withdrawnToast: "تم تعطيل الدواء",
    restoredToast: "تم تفعيل الدواء",
    noWithdrawn: "لا توجد أدوية معطّلة.",
    categoriesTitle: "التصنيفات",
    addCategory: "إضافة تصنيف",
    addSubCategory: "إضافة تصنيف فرعي",
    newCategory: "تصنيف جديد",
    newSubCategory: "تصنيف فرعي جديد",
    renameCategory: "تعديل التصنيف",
    renameSubCategory: "تعديل التصنيف الفرعي",
    nameEn: "الاسم بالإنجليزية",
    nameAr: "الاسم بالعربية",
    drugCount: (n: number) => `الأدوية: ${group(n)}`,
    deletedClinics: (n: number) => `من عيادات محذوفة: ${group(n)}`,
    deleteCategory: "حذف التصنيف",
    deleteSubCategory: "حذف التصنيف الفرعي",
    deleteCategoryTitle: (name: string) => `حذف التصنيف «${iso(name)}»؟`,
    deleteCategoryMessage: "ستُحذف معه تصنيفاته الفرعية. لا يمكن التراجع عن ذلك.",
    deleteSubCategoryTitle: (name: string) => `حذف التصنيف الفرعي «${iso(name)}»؟`,
    categoryCreated: "تمت إضافة التصنيف",
    categoryRenamed: "تم تعديل التصنيف",
    categoryDeleted: "تم حذف التصنيف",
    subCategoryCreated: "تمت إضافة التصنيف الفرعي",
    subCategoryDeleted: "تم حذف التصنيف الفرعي",
    categoryInUse: arInUse("هذا التصنيف"),
    subCategoryInUse: arInUse("هذا التصنيف الفرعي"),
};

export type SharedTexts = typeof ar;

const enInUse = (what: string) => (n: number) =>
    `Can't delete this ${what}: ${group(n)} ${n === 1 ? "drug uses" : "drugs use"} it.`;

const en: SharedTexts = {
    chipShared: "Shared",
    chipOwn: "Clinic",
    activeIngredients: "Active ingredients",
    category: "Category",
    subCategory: "Subcategory",
    noSubCategory: "No subcategory",
    allCategories: "All categories",
    allSubCategories: "All subcategories",
    categoryLine: path => `Category: ${path}`,
    categoryPath: (category, sub) => `${category} › ${sub}`,
    categoryRequired: "Category is required.",
    categoryNotFound: "This category no longer exists. Choose another category.",
    noDosing: "No dosing set",
    defaultDosing: "Default dosing",
    withdrawnChip: "Disabled by admin",
    withdrawnCount: n => `Disabled by admin: ${group(n)}`,
    withdrawnTooltip: "The platform admin disabled this drug in the shared catalog, so it no longer appears in search. It stays in the protocols that use it.",
    withdrawnAlert: "Some drugs were disabled by the platform admin in the shared catalog.",
    drugWithdrawnNamed: name => `“${iso(name)}” was disabled by the admin and can't be added.`,
    protocolWithdrawn: n => `Added although disabled by admin: ${group(n)}`,
    protocolAdded: (name, n) => `Added from “${iso(name)}”: ${group(n)}`,
    navDrugs: "Drugs",
    navCategories: "Categories",
    adminDrugsTitle: "Shared drugs",
    adminDrugsSubtitle: n => `${group(n)} ${n === 1 ? "drug" : "drugs"}`,
    adminAdd: "Add drug",
    adminNew: "New shared drug",
    adminEdit: "Edit shared drug",
    adminSearch: "Search the shared catalog…",
    statusLabel: "Status",
    statusActive: "Enabled",
    statusWithdrawn: "Disabled",
    statusAll: "All",
    withdraw: "Disable drug",
    restore: "Enable drug",
    editRow: rowAction("Edit", "“", "”"),
    withdrawRow: rowAction("Disable", "“", "”"),
    restoreRow: rowAction("Enable", "“", "”"),
    renameRow: rowAction("(?:Rename|Edit)", "“", "”"),
    deleteRow: rowAction("Delete", "“", "”"),
    withdrawTitle: name => `Disable “${iso(name)}”?`,
    withdrawMessage: "It disappears from search in every clinic and stays in the protocols that use it. You can enable it later.",
    withdrawnToast: "Drug disabled",
    restoredToast: "Drug enabled",
    noWithdrawn: "No disabled drugs.",
    categoriesTitle: "Categories",
    addCategory: "Add category",
    addSubCategory: "Add subcategory",
    newCategory: "New category",
    newSubCategory: "New subcategory",
    renameCategory: "Rename category",
    renameSubCategory: "Rename subcategory",
    nameEn: "English name",
    nameAr: "Arabic name",
    drugCount: n => `Drugs: ${group(n)}`,
    deletedClinics: n => `From deleted clinics: ${group(n)}`,
    deleteCategory: "Delete category",
    deleteSubCategory: "Delete subcategory",
    deleteCategoryTitle: name => `Delete the category “${iso(name)}”?`,
    deleteCategoryMessage: "Its subcategories are deleted with it. This can't be undone.",
    deleteSubCategoryTitle: name => `Delete the subcategory “${iso(name)}”?`,
    categoryCreated: "Category added",
    categoryRenamed: "Category renamed",
    categoryDeleted: "Category deleted",
    subCategoryCreated: "Subcategory added",
    subCategoryDeleted: "Subcategory deleted",
    categoryInUse: enInUse("category"),
    subCategoryInUse: enInUse("subcategory"),
};

export const SHARED_TEXTS: Record<Lang, SharedTexts> = {ar, en};
