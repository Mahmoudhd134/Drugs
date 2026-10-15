import {useMemo} from "react";
import {RoleList} from "../../roles/components/RoleList.tsx";
import {adminRolesApi} from "../adapters.ts";
import {useTabClinic} from "../useTabClinic.ts";

/** The clinic page's Roles tab. */
export const ClinicRolesTab = () => {
    const {id} = useTabClinic();
    const adapter = useMemo(() => adminRolesApi(id), [id]);
    return <RoleList adapter={adapter}/>;
};
