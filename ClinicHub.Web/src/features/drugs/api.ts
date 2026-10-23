import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {api} from "../../api/client.ts";
import {type PagedResult, type QueryOptions} from "../../api/types.ts";
import type {Category, Drug, DrugFilters, SaveDrug} from "./types.ts";
import {protocolKeys} from "../protocols/api.ts";

/** Categories change rarely (design M1.7 D5): like the pickers; the drug dialog refetches on open. */
export const CATEGORIES_STALE_TIME = 30_000;

export const drugKeys = {
    all: ["drugs"] as const,
    list: (search: string, page: number, pageSize: number, filters: DrugFilters = {}) =>
        [...drugKeys.all, "list", search, page, pageSize, filters] as const,
    categories: ["drugCategories"] as const,
};

/** The query string of the filters: absent values are left out (the API's defaults). */
const filterParams = ({source, categoryId, subCategoryId}: DrugFilters = {}) => ({
    ...(source && source !== "all" ? {source} : {}),
    ...(categoryId != null ? {categoryId} : {}),
    ...(subCategoryId != null ? {subCategoryId} : {}),
});

export const fetchDrugs = async (search: string, page: number, pageSize: number, filters: DrugFilters = {}) =>
    (await api.get<PagedResult<Drug>>("/drugs", {params: {search, page, pageSize, ...filterParams(filters)}})).data;

/** `GET /drug-categories` (needs `drugs.list`). */
export const fetchDrugCategories = async () => (await api.get<Category[]>("/drug-categories")).data;

/**
 * Every category with its subcategories (unsorted: sort with `sortCategories`). `refetchOnMount: "always"`: fetched
 * again when the caller mounts, even over a fresh copy (the drug dialog, design M1.7 D5).
 */
export const useDrugCategories = ({enabled = true, refetchOnMount}: QueryOptions & { refetchOnMount?: "always" } = {}) =>
    useQuery({
        queryKey: drugKeys.categories,
        queryFn: fetchDrugCategories,
        staleTime: CATEGORIES_STALE_TIME,
        enabled,
        ...(refetchOnMount ? {refetchOnMount} : {}),
    });

/** Names of the protocols that contain the drug. */
export const fetchDrugProtocolNames = async (id: number) =>
    (await api.get<string[]>(`/drugs/${id}/protocols`)).data;

/**
 * One page of drugs, for tables (own first, then shared: design M1.7 D7). The previous page stays as placeholder while
 * the next loads, only while its query is still cached: after a context switch clears the cache, the other clinic's
 * rows are never shown (as `useDrugTree`, M1.7c C20).
 */
export const useDrugs = (search: string, page: number, pageSize: number, {enabled = true}: QueryOptions = {},
                         filters: DrugFilters = {}) => {
    const queryClient = useQueryClient();
    return useQuery({
        queryKey: drugKeys.list(search, page, pageSize, filters),
        queryFn: () => fetchDrugs(search, page, pageSize, filters),
        placeholderData: (previous, previousQuery) =>
            previousQuery && Object.is(queryClient.getQueryCache().get(previousQuery.queryHash), previousQuery) ? previous : undefined,
        enabled,
    });
};

export const useSaveDrug = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({id, ...body}: SaveDrug & { id: number | null }) =>
            id === null
                ? (await api.post<Drug>("/drugs", body)).data
                : (await api.put<Drug>(`/drugs/${id}`, body)).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: drugKeys.all});
            // Protocols embed drug names
            void queryClient.invalidateQueries({queryKey: protocolKeys.all});
        },
    });
};

export const useDeleteDrug = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.delete(`/drugs/${id}`),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: drugKeys.all});
            void queryClient.invalidateQueries({queryKey: protocolKeys.all});
        },
    });
};
