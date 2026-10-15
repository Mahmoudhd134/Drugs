import type {DataScope} from "../../api/dataScope.ts";

/** A clinic's role (design M1.5 § 6). */
export type Role = {
    id: number;
    name: string;
    /** The Owner role: locked (can't be edited or deleted), always every permission */
    isOwner: boolean;
    /** Catalog order, requirements included; the Owner's = every catalog key */
    permissions: string[];
    /** Staff holding it, active or not (a role held by anyone can't be deleted) */
    staffCount: number;
};

export type SaveRole = { name: string; permissions: string[] };

/**
 * Where the role components get and save a clinic's roles (design D9): they never build URLs. The platform admin
 * passes `adminRolesApi(clinicId)` (features/admin/adapters.ts); a clinic-side screen later passes its own.
 */
export type RolesAdapter = DataScope & {
    /** Owner first, then by name */
    list: () => Promise<Role[]>;
    create: (body: SaveRole) => Promise<Role>;
    update: (id: number, body: SaveRole) => Promise<Role>;
    delete: (id: number) => Promise<void>;
};
