import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {loadInScope, refreshScope, showsStaleData} from "../../api/dataScope.ts";
import type {AddStaff, StaffAdapter, StaffQuery, UpdateStaff} from "./types.ts";

/** One page of the adapter's clinic's staff (by name). */
export const useStaffList = (adapter: StaffAdapter, query: StaffQuery) => {
    const queryClient = useQueryClient();
    return useQuery({
        queryKey: [...adapter.scope, query.search, query.page, query.pageSize],
        queryFn: () => loadInScope(queryClient, adapter, () => adapter.list(query)),
        // The rows of the page before while the next loads (the component is remounted for another clinic)
        placeholderData: keepPreviousData,
        staleTime: 0,
    });
};

/**
 * After a change, or a refusal saying the data shown is out of date (also `roleNotFound`: a role deleted meanwhile),
 * the staff and what it affects (role counts, the clinic's staff count and owners) load again.
 */
const useRefresh = (adapter: StaffAdapter) => {
    const queryClient = useQueryClient();
    return {
        onSuccess: () => refreshScope(queryClient, adapter),
        onError: (error: unknown) => {
            if (showsStaleData(error, ["roleNotFound"])) refreshScope(queryClient, adapter);
        },
    };
};

/** Adds (`id` null, with a phone) or updates a staff member. */
export const useSaveStaff = (adapter: StaffAdapter) =>
    useMutation({
        mutationFn: (request: { id: null; body: AddStaff } | { id: number; body: UpdateStaff }) =>
            request.id === null ? adapter.create(request.body) : adapter.update(request.id, request.body),
        ...useRefresh(adapter),
    });

export const useRemoveStaff = (adapter: StaffAdapter) =>
    useMutation({
        mutationFn: (id: number) => adapter.delete(id),
        ...useRefresh(adapter),
    });
