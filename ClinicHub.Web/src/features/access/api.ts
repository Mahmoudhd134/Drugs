import {useQuery} from "@tanstack/react-query";
import {api} from "../../api/client.ts";

/** One permission of the catalog (`GET /permissions`, catalog order); labels are `permissions.<key>` in the locales. */
export type PermissionDefinition = {
    key: string;
    /** e.g. `catalog`, `prescription` (labels: `permissionModules.<module>`) */
    module: string;
    /** e.g. `drugs` (labels: `permissionResources.<resource>`) */
    resource: string;
    action: string;
    /** The permissions this one needs (direct ones only) */
    requires: string[];
};

/** The permission catalog: fixed in code, so loaded once per app run. */
export const usePermissionCatalog = () =>
    useQuery({
        queryKey: ["access", "permissionCatalog"] as const,
        queryFn: async () => (await api.get<PermissionDefinition[]>("/permissions")).data,
        staleTime: Infinity,
    });
