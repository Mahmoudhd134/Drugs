import type {PagedResult} from "../api/types.ts";
import type {PermissionDefinition} from "../features/access/api.ts";
import type {Permission} from "../features/access/permissions.ts";
import type {ClinicDetails, ClinicSummary} from "../features/admin/types.ts";
import type {AuthResult, ClinicContext, Context, Me, PlatformContext} from "../features/auth/types.ts";
import type {Dosing} from "../features/dosing/types.ts";
import type {Protocol, ProtocolItem} from "../features/protocols/types.ts";
import type {
    Category, CategoryName, Drug, DrugTreeCategory, DrugTreeSubCategory, ProtocolDrug, SubCategory,
} from "../features/drugs/types.ts";
import type {AdminDrug} from "../features/admin/drugs/types.ts";
import type {AdminCategory, AdminSubCategory} from "../features/admin/categories/types.ts";
import type {PrescriptionLine} from "../features/prescription/types.ts";
import type {Role} from "../features/roles/types.ts";
import type {StaffMember} from "../features/staff/types.ts";

/*
 * Builders for the API's shapes as the tech docs define them (docs/tech/overview.md "API", the features' tech.md).
 * Each takes the fields a test cares about; the rest get plain defaults. Ids count up per test file.
 */

let lastId = 1000;
/** A fresh id (unique within the test file). */
export const nextId = () => ++lastId;

/** «العيون» / "Eye" (imported id 17) and its «المياه الزرقاء» / "Glaucoma" (id 138): the default of the builders (D12). */
export const EYE: CategoryName = {id: 17, nameEn: "Eye", nameAr: "العيون"};
export const GLAUCOMA: CategoryName = {id: 138, nameEn: "Glaucoma", nameAr: "المياه الزرقاء"};
/** «أخرى» (23) and «غير مصنف» (182): the two `pinnedLast` rows. */
export const OTHER: CategoryName = {id: 23, nameEn: "Other", nameAr: "أخرى"};
export const UNCLASSIFIED: CategoryName = {id: 182, nameEn: "Unclassified", nameAr: "غير مصنف"};

/** An own drug (`GET /drugs`): «العيون › المياه الزرقاء», no ingredients, `defaultDosing` null unless given. */
export const aDrug = (fields: Partial<Drug> = {}): Drug => ({
    id: nextId(),
    name: "Tobradex",
    activeIngredients: null,
    description: null,
    defaultDosing: null,
    isShared: false,
    withdrawn: false,
    category: EYE,
    subCategory: GLAUCOMA,
    ...fields,
});

/** A shared catalog drug: `isShared`, never a dosing (e.g. `aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"})`). */
export const aSharedDrug = (fields: Partial<Drug> = {}): Drug =>
    aDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML", activeIngredients: "MOXIFLOXACIN", isShared: true, ...fields, defaultDosing: null});

/** The drug of a protocol line (`ProtocolDrugDto`: no category), from a full drug. */
export const aProtocolDrug = ({id, name, description, defaultDosing, isShared, withdrawn}: Drug | ProtocolDrug): ProtocolDrug =>
    ({id, name, description, defaultDosing, isShared, withdrawn});

/** A full drug from a protocol line's drug (category «العيون › المياه الزرقاء»), e.g. for the picker's `GET /drugs`. */
export const asDrug = (drug: Drug | ProtocolDrug): Drug => aDrug({...drug});

/** A protocol line: the drug (as `ProtocolDrugDto`) and its override (`dosing`, null = the drug's default). */
export const anItem = (drug: Drug | ProtocolDrug, dosing: Dosing | null = null): ProtocolItem => ({drug: aProtocolDrug(drug), dosing});

/** A subcategory of `GET /drug-categories`. */
export const aSubCategory = (fields: Partial<SubCategory> = {}): SubCategory => ({
    id: nextId(), nameEn: "Glaucoma", nameAr: "المياه الزرقاء", pinnedLast: false, ...fields,
});

/** A category of `GET /drug-categories` (default «العيون» with «المياه الزرقاء»). */
export const aCategory = (fields: Partial<Category> = {}): Category => ({
    ...EYE, pinnedLast: false, subCategories: [{...GLAUCOMA, pinnedLast: false}], ...fields,
});

/**
 * `count` drugs of one subcategory for paging tests (M1.7c tree): `aDrug` with names "<prefix> 001", "<prefix> 002"…
 * (zero-padded, so name order = creation order) and the given fields.
 */
export const manyDrugs = (count: number, fields: Partial<Drug> = {}, prefix = "Drug"): Drug[] =>
    Array.from({length: count}, (_, i) => aDrug({name: `${prefix} ${String(i + 1).padStart(3, "0")}`, ...fields}));

/** A subcategory of `GET /drugs/tree` (default «المياه الزرقاء», count 1); `{id: null, nameEn: null, nameAr: null}` = the bucket. */
export const aTreeSubCategory = (fields: Partial<DrugTreeSubCategory> = {}): DrugTreeSubCategory => ({
    ...GLAUCOMA, pinnedLast: false, count: 1, ...fields,
});

/** A category of `GET /drugs/tree` (default «العيون» with one subcategory); `count` = the sum of its subcategories unless given. */
export const aTreeCategory = (fields: Partial<DrugTreeCategory> = {}): DrugTreeCategory => {
    const subCategories = fields.subCategories ?? [aTreeSubCategory()];
    return {...EYE, pinnedLast: false, count: subCategories.reduce((sum, s) => sum + s.count, 0), ...fields, subCategories};
};

/** A shared drug of the admin catalog (`GET /admin/drugs`): active unless given. */
export const anAdminDrug = (fields: Partial<AdminDrug> = {}): AdminDrug => ({
    id: nextId(),
    name: "VIGAMOX 0.5% EYE DROPS 5 ML",
    activeIngredients: "MOXIFLOXACIN",
    description: null,
    withdrawn: false,
    withdrawnAt: null,
    category: EYE,
    subCategory: GLAUCOMA,
    ...fields,
});

/** A subcategory of `GET /admin/drug-categories` (no drug unless given). */
export const anAdminSubCategory = (fields: Partial<AdminSubCategory> = {}): AdminSubCategory => ({
    ...aSubCategory(), drugCount: 0, deletedClinicsDrugCount: 0, ...fields,
});

/** A category of `GET /admin/drug-categories` (no drug unless given). */
export const anAdminCategory = (fields: Partial<AdminCategory> = {}): AdminCategory => ({
    id: nextId(), nameEn: "Test category", nameAr: "تصنيف تجريبي", pinnedLast: false,
    drugCount: 0, deletedClinicsDrugCount: 0, noSubCategoryDrugCount: 0, subCategories: [], ...fields,
});

/** A protocol with its lines in order (`GET /protocols`). */
export const aProtocol = (fields: Partial<Protocol> = {}): Protocol => ({
    id: nextId(),
    name: "Post cataract",
    items: [],
    ...fields,
});

/** A prescription line as `usePrescriptionLines` stores it (its drug a snapshot: any drug shape fits). */
export const aLine = (drug: Drug | ProtocolDrug, dosing: Dosing = drug.defaultDosing ?? {}, note = ""): PrescriptionLine => ({
    key: `line-${nextId()}`,
    drug,
    dosing,
    note,
});

/** A page of a paged list (`PagedResult`): every item on page 1 unless given. */
export const aPage = <T>(items: T[], fields: Partial<PagedResult<T>> = {}): PagedResult<T> => ({
    items,
    totalCount: items.length,
    page: 1,
    pageSize: 20,
    ...fields,
});

/**
 * The permission catalog (`GET /permissions`), as declared by the backend `Permissions` class (catalog order, direct
 * requirements only; docs/features/access/tech.md): the 11 keys.
 */
export const PERMISSION_CATALOG: PermissionDefinition[] = [
    {key: "drugs.list", module: "catalog", resource: "drugs", action: "list", requires: []},
    {key: "drugs.details", module: "catalog", resource: "drugs", action: "details", requires: ["drugs.list"]},
    {key: "drugs.create", module: "catalog", resource: "drugs", action: "create", requires: ["drugs.list"]},
    {key: "drugs.update", module: "catalog", resource: "drugs", action: "update", requires: ["drugs.details"]},
    {key: "drugs.delete", module: "catalog", resource: "drugs", action: "delete", requires: ["drugs.details"]},
    {key: "protocols.list", module: "catalog", resource: "protocols", action: "list", requires: []},
    {key: "protocols.details", module: "catalog", resource: "protocols", action: "details", requires: ["protocols.list"]},
    {key: "protocols.create", module: "catalog", resource: "protocols", action: "create", requires: ["protocols.list", "drugs.list"]},
    {key: "protocols.update", module: "catalog", resource: "protocols", action: "update", requires: ["protocols.details", "drugs.list"]},
    {key: "protocols.delete", module: "catalog", resource: "protocols", action: "delete", requires: ["protocols.list"]},
    {key: "prescriptions.create", module: "prescription", resource: "prescriptions", action: "create", requires: ["drugs.list"]},
];

/**
 * `keys` with their requirements, transitively, in catalog order: the expanded set `/me` returns (access tech:
 * `PermissionSet.Of` adds the requirements; roles are stored closed). A role can't hold `protocols.create` without
 * `protocols.list` and `drugs.list`, so neither can a test user.
 */
export const withRequirements = (keys: readonly string[]): Permission[] => {
    const held = new Set<string>();
    const add = (key: string) => {
        if (held.has(key)) return;
        held.add(key);
        PERMISSION_CATALOG.find(p => p.key === key)?.requires.forEach(add);
    };
    keys.forEach(add);
    return PERMISSION_CATALOG.filter(p => held.has(p.key)).map(p => p.key as Permission);
};

/** Every permission key (what the Owner gets in `/me`). */
export const ALL_PERMISSIONS = PERMISSION_CATALOG.map(p => p.key as Permission);

/** A clinic context (login, refresh, switch, `/auth/contexts`). */
export const aClinicContext = (fields: Partial<ClinicContext> = {}): ClinicContext => ({
    type: "clinic",
    clinicId: 1,
    clinicName: "Clinic A",
    isTemplate: false,
    roles: ["Owner"],
    ...fields,
});

export const PLATFORM_CONTEXT: PlatformContext = {type: "platform"};

/**
 * An access token the SPA can read the user from (`sub`); not signed (the SPA never checks it, the API does).
 * Base64url, like a real JWT.
 */
export const anAccessToken = (userId: number | string = 1) => {
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    return `${encode({alg: "HS256", typ: "JWT"})}.${encode({sub: String(userId)})}.signature`;
};

/** An `AuthResult` (login, refresh, switch): in `context` by default, which is also its only context. */
export const anAuthResult = (fields: Partial<AuthResult> & { userId?: number } = {}): AuthResult => {
    const {userId = 1, ...rest} = fields;
    const context = rest.context === undefined ? aClinicContext() : rest.context;
    return {
        accessToken: anAccessToken(userId),
        expiresAt: "2026-10-15T12:15:00Z",
        context,
        contexts: context ? [context] : [],
        ...rest,
    };
};

/** `GET /me` in a context: the expanded permission keys (every key by default, as for the Owner). */
export const aMe = (fields: Partial<Omit<Me, "user">> & { user?: Partial<Me["user"]> } = {}): Me => {
    const {user, ...rest} = fields;
    const context: Context | null = rest.context === undefined ? aClinicContext() : rest.context;
    return {
        user: {id: 1, phone: "+201001234567", isSuperAdmin: false, ...user},
        context,
        staff: context?.type === "clinic" ? {id: 1, fullName: "Dr. Sara"} : null,
        permissions: context?.type === "clinic" ? [...ALL_PERMISSIONS] : [],
        ...rest,
    };
};

/** A clinic's role (`GET /admin/clinics/{id}/roles`). */
export const aRole = (fields: Partial<Role> = {}): Role => ({
    id: nextId(),
    name: "Doctor",
    isOwner: false,
    permissions: [],
    staffCount: 0,
    ...fields,
});

/** The Owner role: locked, every permission. */
export const anOwnerRole = (fields: Partial<Role> = {}): Role =>
    aRole({name: "Owner", isOwner: true, permissions: [...ALL_PERMISSIONS], staffCount: 1, ...fields});

/** A staff member (`GET /admin/clinics/{id}/staff`). */
export const aStaffMember = (fields: Partial<StaffMember> = {}): StaffMember => {
    const id = nextId();
    return {
        id,
        userId: id,
        phone: "+201001234567",
        fullName: "Dr. Sara",
        isActive: true,
        roles: [],
        ...fields,
    };
};

/** A clinic of the admin list (`GET /admin/clinics`). */
export const aClinicSummary = (fields: Partial<ClinicSummary> = {}): ClinicSummary => ({
    id: nextId(),
    name: "Clinic A",
    status: "active",
    staffCount: 1,
    createdAt: "2026-10-01T09:00:00Z",
    ...fields,
});

/** A clinic's details (`GET /admin/clinics/{id}`). */
export const aClinicDetails = (fields: Partial<ClinicDetails> = {}): ClinicDetails => ({
    ...aClinicSummary(),
    owners: [{staffId: 1, fullName: "Dr. Sara", phone: "+201001234567"}],
    ...fields,
});
