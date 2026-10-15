import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {loadInScope, refreshScope, showsStaleData} from "../../api/dataScope.ts";
import type {RolesAdapter, SaveRole} from "./types.ts";

/** The roles of the adapter's clinic (Owner first, then by name). */
export const useRoles = (adapter: RolesAdapter) => {
    const queryClient = useQueryClient();
    return useQuery({
        queryKey: adapter.scope,
        queryFn: () => loadInScope(queryClient, adapter, () => adapter.list()),
        // Staff counts change from the staff tab too: always show the latest
        staleTime: 0,
    });
};

/**
 * Creates (`id` null) or updates a role. Afterwards, or after a refusal saying the list is out of date, the roles and
 * what they affect load again.
 */
export const useSaveRole = (adapter: RolesAdapter) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({id, ...body}: SaveRole & { id: number | null }) =>
            id === null ? adapter.create(body) : adapter.update(id, body),
        onSuccess: () => refreshScope(queryClient, adapter),
        onError: (error) => {
            if (showsStaleData(error)) refreshScope(queryClient, adapter);
        },
    });
};

export const useDeleteRole = (adapter: RolesAdapter) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => adapter.delete(id),
        onSuccess: () => refreshScope(queryClient, adapter),
        onError: (error) => {
            if (showsStaleData(error)) refreshScope(queryClient, adapter);
        },
    });
};
