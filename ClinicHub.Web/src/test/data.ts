import type {PagedResult} from "../api/types.ts";
import type {PermissionDefinition} from "../features/access/api.ts";
import type {Permission} from "../features/access/permissions.ts";
import type {ClinicDetails, ClinicSummary} from "../features/admin/types.ts";
import type {AuthResult, ClinicContext, Context, Me, PlatformContext} from "../features/auth/types.ts";
import type {Dosing} from "../features/dosing/types.ts";
import type {DrugGroup, DrugGroupItem} from "../features/drugGroups/types.ts";
import type {Drug} from "../features/drugs/types.ts";
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

/** A drug (`GET /drugs`): `defaultDosing` null unless given. */
export const aDrug = (fields: Partial<Drug> = {}): Drug => ({
    id: nextId(),
    name: "Tobradex",
    description: null,
    defaultDosing: null,
    ...fields,
});

/** A group line: the drug and its override (`dosing`, null = the drug's default). */
export const anItem = (drug: Drug, dosing: Dosing | null = null): DrugGroupItem => ({drug, dosing});

/** A drug group with its lines in order (`GET /drug-groups`). */
export const aGroup = (fields: Partial<DrugGroup> = {}): DrugGroup => ({
    id: nextId(),
    name: "Post cataract",
    items: [],
    ...fields,
});

/** A prescription line as `usePrescriptionLines` stores it. */
export const aLine = (drug: Drug, dosing: Dosing = drug.defaultDosing ?? {}, note = ""): PrescriptionLine => ({
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
    {key: "groups.list", module: "catalog", resource: "groups", action: "list", requires: []},
    {key: "groups.details", module: "catalog", resource: "groups", action: "details", requires: ["groups.list"]},
    {key: "groups.create", module: "catalog", resource: "groups", action: "create", requires: ["groups.list", "drugs.list"]},
    {key: "groups.update", module: "catalog", resource: "groups", action: "update", requires: ["groups.details", "drugs.list"]},
    {key: "groups.delete", module: "catalog", resource: "groups", action: "delete", requires: ["groups.list"]},
    {key: "prescriptions.create", module: "prescription", resource: "prescriptions", action: "create", requires: ["drugs.list"]},
];

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
