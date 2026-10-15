import {useMemo} from "react";
import {StaffList} from "../../staff/components/StaffList.tsx";
import {adminRolesApi, adminStaffApi} from "../adapters.ts";
import {useTabClinic} from "../useTabClinic.ts";

/** The clinic page's Staff tab. */
export const ClinicStaffTab = () => {
    const {id} = useTabClinic();
    const adapter = useMemo(() => adminStaffApi(id), [id]);
    const rolesAdapter = useMemo(() => adminRolesApi(id), [id]);
    return <StaffList adapter={adapter} rolesAdapter={rolesAdapter}/>;
};
