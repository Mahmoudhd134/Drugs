import {ApiSession, type Target} from "./api.ts";
import {claimSuperAdminPhone, unique, uniquePhone} from "./phones.ts";
import {runState} from "./run.ts";

/** API shapes (docs/features/platform-admin/tech.md "API"). */
export type ClinicDetails = {
    id: number; name: string; status: "active" | "suspended"; staffCount: number; createdAt: string;
    owners: { staffId: number; fullName: string; phone: string }[];
};
export type Role = { id: number; name: string; isOwner: boolean; permissions: string[]; staffCount: number };
export type StaffMember = {
    id: number; userId: number; phone: string; fullName: string; isActive: boolean;
    roles: { id: number; name: string; isOwner: boolean }[];
};
export type Drug = { id: number; name: string };
export type Group = { id: number; name: string };

/** A clinic made for a test: its owner and roles (the default ones: Owner, Doctor, Assistant). */
export type ClinicHandle = {
    id: number;
    name: string;
    owner: { phone: string; fullName: string; staffId: number };
    roles: Role[];
};

export type StaffHandle = { id: number; phone: string; fullName: string; clinic: ClinicHandle };

/** Every permission key (docs/features/access/business.md "الصلاحيات"; the API's catalog). */
export const PERMISSION_KEYS = [
    "drugs.list", "drugs.details", "drugs.create", "drugs.update", "drugs.delete",
    "groups.list", "groups.details", "groups.create", "groups.update", "groups.delete",
    "prescriptions.create",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** The read-only role of the dev seed's "Viewer" (docs/features/access/tech.md "Dev seed"). */
export const READ_ONLY: PermissionKey[] = ["drugs.list", "drugs.details", "groups.list", "groups.details"];

/**
 * Test data through the API, as the docs prescribe: the super admin (platform) creates clinics, staff and roles; an
 * owner (clinic context) creates drugs and groups. Every name and phone is unique in the run, so tests run in
 * parallel without seeing each other's data.
 */
export class Data {
    private owners = new Map<number, ApiSession>();

    readonly admin: ApiSession;

    constructor(admin: ApiSession) {
        this.admin = admin;
    }

    /** A super admin API session on the platform (its own pool phone). */
    static async superAdmin(): Promise<ApiSession> {
        return ApiSession.login(runState().baseURL, claimSuperAdminPhone(), "platform");
    }

    async clinic(options: { name?: string; ownerPhone?: string; ownerName?: string } = {}): Promise<ClinicHandle> {
        const name = options.name ?? `Clinic ${unique()}`;
        const owner = {phone: options.ownerPhone ?? uniquePhone(), fullName: options.ownerName ?? `Owner ${unique()}`};
        const details = await this.admin.ok<ClinicDetails>("POST", "/api/v1/admin/clinics", {name, owner});
        const roles = await this.roles(details.id);
        return {id: details.id, name, owner: {...owner, staffId: details.owners[0]?.staffId ?? 0}, roles};
    }

    async details(clinicId: number) {
        return this.admin.ok<ClinicDetails>("GET", `/api/v1/admin/clinics/${clinicId}`);
    }

    async roles(clinicId: number) {
        return this.admin.ok<Role[]>("GET", `/api/v1/admin/clinics/${clinicId}/roles`);
    }

    roleId(clinic: ClinicHandle, name: string) {
        const role = clinic.roles.find(r => r.name === name);
        if (!role) throw new Error(`No role ${name} in ${clinic.name}`);
        return role.id;
    }

    async role(clinic: ClinicHandle, permissions: readonly PermissionKey[], name = `Role ${unique()}`): Promise<Role> {
        const role = await this.admin.ok<Role>("POST", `/api/v1/admin/clinics/${clinic.id}/roles`, {name, permissions});
        clinic.roles.push(role);
        return role;
    }

    async updateRole(clinic: ClinicHandle, role: Role, permissions: readonly PermissionKey[], name = role.name) {
        return this.admin.ok<Role>("PUT", `/api/v1/admin/clinics/${clinic.id}/roles/${role.id}`, {name, permissions});
    }

    async deleteRole(clinic: ClinicHandle, role: Role) {
        await this.admin.ok("DELETE", `/api/v1/admin/clinics/${clinic.id}/roles/${role.id}`);
    }

    /** A staff member; `roles` are role names or ids (default: Doctor). */
    async staff(clinic: ClinicHandle, options: { phone?: string; fullName?: string; roles?: (string | number)[]; active?: boolean } = {})
        : Promise<StaffHandle> {
        const phone = options.phone ?? uniquePhone();
        const fullName = options.fullName ?? `Staff ${unique()}`;
        const roleIds = (options.roles ?? ["Doctor"]).map(r => typeof r === "number" ? r : this.roleId(clinic, r));
        const member = await this.admin.ok<StaffMember>("POST", `/api/v1/admin/clinics/${clinic.id}/staff`, {phone, fullName, roleIds});
        if (options.active === false) await this.updateStaff(clinic, member.id, {fullName, isActive: false, roleIds});
        return {id: member.id, phone, fullName, clinic};
    }

    async staffMember(clinic: ClinicHandle, staffId: number) {
        const page = await this.admin.ok<{ items: StaffMember[] }>("GET", `/api/v1/admin/clinics/${clinic.id}/staff?pageSize=100`);
        const member = page.items.find(s => s.id === staffId);
        if (!member) throw new Error(`No staff ${staffId} in ${clinic.name}`);
        return member;
    }

    async updateStaff(clinic: ClinicHandle, staffId: number, body: { fullName: string; isActive: boolean; roleIds: number[] }) {
        return this.admin.ok<StaffMember>("PUT", `/api/v1/admin/clinics/${clinic.id}/staff/${staffId}`, body);
    }

    async deactivate(staff: StaffHandle) {
        const member = await this.staffMember(staff.clinic, staff.id);
        await this.updateStaff(staff.clinic, staff.id, {fullName: member.fullName, isActive: false, roleIds: member.roles.map(r => r.id)});
    }

    async setRoles(staff: StaffHandle, roleIds: number[]) {
        const member = await this.staffMember(staff.clinic, staff.id);
        await this.updateStaff(staff.clinic, staff.id, {fullName: member.fullName, isActive: member.isActive, roleIds});
    }

    async removeStaff(staff: { id: number; clinic: ClinicHandle }) {
        await this.admin.ok("DELETE", `/api/v1/admin/clinics/${staff.clinic.id}/staff/${staff.id}`);
    }

    async suspend(clinic: { id: number }) {
        await this.admin.ok("POST", `/api/v1/admin/clinics/${clinic.id}/suspend`);
    }

    async activate(clinic: { id: number }) {
        await this.admin.ok("POST", `/api/v1/admin/clinics/${clinic.id}/activate`);
    }

    async deleteClinic(clinic: { id: number }) {
        await this.admin.ok("DELETE", `/api/v1/admin/clinics/${clinic.id}`);
    }

    async rename(clinic: { id: number }, name: string) {
        await this.admin.ok("PUT", `/api/v1/admin/clinics/${clinic.id}`, {name});
    }

    /** The clinic's owner, logged in through the API in that clinic (to build its drugs and groups). */
    async ownerApi(clinic: ClinicHandle): Promise<ApiSession> {
        let session = this.owners.get(clinic.id);
        if (!session) {
            session = await ApiSession.login(runState().baseURL, clinic.owner.phone, {clinicId: clinic.id} satisfies Target);
            this.owners.set(clinic.id, session);
        }
        return session;
    }

    async drug(clinic: ClinicHandle, name = `Drug ${unique()}`, defaultDosing: unknown = null): Promise<Drug> {
        const api = await this.ownerApi(clinic);
        return api.ok<Drug>("POST", "/api/v1/drugs", {name, description: null, defaultDosing});
    }

    async group(clinic: ClinicHandle, drugs: Drug[], name = `Group ${unique()}`): Promise<Group> {
        const api = await this.ownerApi(clinic);
        return api.ok<Group>("POST", "/api/v1/drug-groups", {name, items: drugs.map(d => ({drugId: d.id, dosing: null}))});
    }

    async dispose() {
        for (const session of this.owners.values()) await session.dispose();
        this.owners.clear();
    }
}
