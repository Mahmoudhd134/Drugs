import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {api} from "../../../api/client.ts";
import type {PagedResult} from "../../../api/types.ts";
import type {SubCategoryFilter} from "../../drugs/types.ts";
import type {AdminDrug, SaveSharedDrug, SharedDrugStatus} from "./types.ts";

export type AdminDrugFilters = { status: SharedDrugStatus; categoryId: number | null; subCategoryId: SubCategoryFilter | null };

const all = ["admin", "drugs"] as const;

export const adminDrugKeys = {
    all,
    lists: [...all, "list"] as const,
    list: (search: string, filters: AdminDrugFilters, page: number, pageSize: number) =>
        [...adminDrugKeys.lists, search, filters, page, pageSize] as const,
};

/** One page of the shared catalog (`GET /admin/drugs`; design M1.7 D7 order). */
export const useAdminDrugs = (search: string, filters: AdminDrugFilters, page: number, pageSize: number) =>
    useQuery({
        queryKey: adminDrugKeys.list(search, filters, page, pageSize),
        queryFn: async () => (await api.get<PagedResult<AdminDrug>>("/admin/drugs", {
            params: {
                search, page, pageSize,
                ...(filters.status !== "active" ? {status: filters.status} : {}),
                ...(filters.categoryId != null ? {categoryId: filters.categoryId} : {}),
                ...(filters.subCategoryId != null ? {subCategoryId: filters.subCategoryId} : {}),
            },
        })).data,
        placeholderData: keepPreviousData,
    });

const useRefetchLists = () => {
    const queryClient = useQueryClient();
    return () => void queryClient.invalidateQueries({queryKey: adminDrugKeys.all, refetchType: "all"});
};

/** Creates (`id` null) or updates a shared drug. */
export const useSaveSharedDrug = () => {
    const refetch = useRefetchLists();
    return useMutation({
        mutationFn: async ({id, ...body}: SaveSharedDrug & { id: number | null }) =>
            id === null
                ? (await api.post<AdminDrug>("/admin/drugs", body)).data
                : (await api.put<AdminDrug>(`/admin/drugs/${id}`, body)).data,
        onSuccess: refetch,
    });
};

/** «تعطيل الدواء» (`withdrawn` true) / «تفعيل الدواء» (false): 204, idempotent. */
export const useSetSharedDrugWithdrawn = () => {
    const refetch = useRefetchLists();
    return useMutation({
        mutationFn: ({id, withdrawn}: { id: number; withdrawn: boolean }) =>
            api.post(`/admin/drugs/${id}/${withdrawn ? "withdraw" : "restore"}`),
        onSuccess: refetch,
    });
};
