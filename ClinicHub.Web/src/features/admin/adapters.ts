import {api} from "../../api/client.ts";
import type {PagedResult} from "../../api/types.ts";
import {attachmentRequests} from "../attachments/attachmentRequests.ts";
import type {AttachmentRules, AttachmentsAdapter} from "../attachments/types.ts";
import {readTemplate} from "../printTemplates/api.ts";
import type {PrintTemplate, PrintTemplateAdapter} from "../printTemplates/types.ts";
import type {Role, RolesAdapter} from "../roles/types.ts";
import type {StaffAdapter, StaffMember} from "../staff/types.ts";
import {adminClinicKeys} from "./api.ts";

/*
 * The platform admin's data for the reusable role and staff components (design D9): one clinic's roles and staff
 * through `/admin/clinics/{clinicId}/…`. A clinic-side screen (after the MVP) passes its own adapters instead.
 */

/**
 * Cache keys under the clinic's details, so whatever reloads the clinic reloads them too. A 404 loading them reloads
 * the clinic (`container`): its page then shows "not found".
 */
const rolesScope = (clinicId: number) => [...adminClinicKeys.detail(clinicId), "roles"] as const;
const staffScope = (clinicId: number) => [...adminClinicKeys.detail(clinicId), "staff"] as const;

export const adminRolesApi = (clinicId: number): RolesAdapter => {
    const base = `/admin/clinics/${clinicId}/roles`;
    return {
        scope: rolesScope(clinicId),
        // A rename shows in the staff's role chips; the clinic loads again too (a 404: it is gone, its page says so)
        affects: [staffScope(clinicId), adminClinicKeys.detail(clinicId)],
        container: adminClinicKeys.detail(clinicId),
        list: async () => (await api.get<Role[]>(base)).data,
        create: async (body) => (await api.post<Role>(base, body)).data,
        update: async (id, body) => (await api.put<Role>(`${base}/${id}`, body)).data,
        delete: async (id) => {
            await api.delete(`${base}/${id}`);
        },
    };
};

/**
 * One clinic's print template (design prescription-templates D5). Under the clinic's details, as the roles and staff; a
 * 404 (the clinic is gone) reloads the clinic, whose page then says "not found" (TPL-235).
 */
export const adminPrintTemplateApi = (clinicId: number): PrintTemplateAdapter => {
    const base = `/admin/clinics/${clinicId}/prescription-template`;
    return {
        scope: [...adminClinicKeys.detail(clinicId), "printTemplate"] as const,
        affects: [adminClinicKeys.detail(clinicId)],
        container: adminClinicKeys.detail(clinicId),
        get: async () => readTemplate((await api.get<PrintTemplate | "">(base)).data),
        save: async (layout) => (await api.put<PrintTemplate>(base, layout)).data,
        remove: async () => {
            await api.delete(base);
        },
    };
};

export const adminStaffApi = (clinicId: number): StaffAdapter => {
    const base = `/admin/clinics/${clinicId}/staff`;
    return {
        scope: staffScope(clinicId),
        // Role staff counts; the clinic's active staff count and owners (its page and the clinics lists)
        affects: [rolesScope(clinicId), adminClinicKeys.detail(clinicId), adminClinicKeys.lists],
        container: adminClinicKeys.detail(clinicId),
        list: async ({search, page, pageSize}) =>
            (await api.get<PagedResult<StaffMember>>(base, {params: {search: search || undefined, page, pageSize}})).data,
        create: async (body) => (await api.post<StaffMember>(base, body)).data,
        update: async (id, body) => (await api.put<StaffMember>(`${base}/${id}`, body)).data,
        delete: async (id) => {
            await api.delete(`${base}/${id}`);
        },
    };
};

/**
 * The picture of one clinic's paper (step 4 design § 4, § 5): part 2's requests on its routes, plus `rules`. Under the clinic's details, as the template; a 404 loading it reloads the clinic.
 * Part 2's hook uses no `useClinic()`, so it works in this platform context.
 */
export const adminPaperImageApi = (clinicId: number): AttachmentsAdapter => {
    const base = `/admin/clinics/${clinicId}/prescription-template/paper-image`;
    return {
        ...attachmentRequests(base),
        scope: [...adminClinicKeys.detail(clinicId), "paperImage"] as const,
        container: adminClinicKeys.detail(clinicId),
        rules: async () => (await api.get<AttachmentRules>(`${base}/rules`)).data,
    };
};
