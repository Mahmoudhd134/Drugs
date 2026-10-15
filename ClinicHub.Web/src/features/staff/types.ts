import type {DataScope} from "../../api/dataScope.ts";
import type {PagedResult} from "../../api/types.ts";

/** A clinic's staff member (design M1.5 § 6). */
export type StaffMember = {
    id: number;
    userId: number;
    /** E.164; can't be changed (remove and add again) */
    phone: string;
    /** Per clinic */
    fullName: string;
    isActive: boolean;
    /** Owner first, then by name */
    roles: { id: number; name: string; isOwner: boolean }[];
};

export type AddStaff = { phone: string; fullName: string; roleIds: number[] };
export type UpdateStaff = { fullName: string; isActive: boolean; roleIds: number[] };

/** The staff list's query: `search` matches the name, or the phone's digits. */
export type StaffQuery = { search: string; page: number; pageSize: number };

/**
 * Where the staff components get and save a clinic's staff (design D9): they never build URLs. The platform admin
 * passes `adminStaffApi(clinicId)` (features/admin/adapters.ts); a clinic-side screen later passes its own.
 */
export type StaffAdapter = DataScope & {
    list: (query: StaffQuery) => Promise<PagedResult<StaffMember>>;
    create: (body: AddStaff) => Promise<StaffMember>;
    update: (id: number, body: UpdateStaff) => Promise<StaffMember>;
    delete: (id: number) => Promise<void>;
};
