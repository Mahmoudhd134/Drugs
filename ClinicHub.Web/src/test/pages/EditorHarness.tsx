import {useMemo, useState} from "react";
import {adminRolesApi, adminStaffApi} from "../../features/admin/adapters.ts";
import {RoleEditorDialog} from "../../features/roles/components/RoleEditorDialog.tsx";
import type {Role} from "../../features/roles/types.ts";
import {StaffEditorDialog} from "../../features/staff/components/StaffEditorDialog.tsx";
import type {StaffMember} from "../../features/staff/types.ts";

/*
 * The role and staff editors as their lists open them (docs/features/platform-admin/tech.md "Roles and staff
 * screens"), with the platform admin's adapters of `clinicId`, without the lists around them: open until they close.
 */

export const RoleEditorHarness = ({clinicId, role}: { clinicId: number; role: Role | null }) => {
    const [open, setOpen] = useState(true);
    const adapter = useMemo(() => adminRolesApi(clinicId), [clinicId]);
    return <RoleEditorDialog open={open} role={role} adapter={adapter} onClose={() => setOpen(false)}/>;
};

export const StaffEditorHarness = ({clinicId, member}: { clinicId: number; member: StaffMember | null }) => {
    const [open, setOpen] = useState(true);
    const adapter = useMemo(() => adminStaffApi(clinicId), [clinicId]);
    const rolesAdapter = useMemo(() => adminRolesApi(clinicId), [clinicId]);
    return <StaffEditorDialog open={open} member={member} adapter={adapter} rolesAdapter={rolesAdapter} onClose={() => setOpen(false)}/>;
};
