import {keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {api} from "../../api/client.ts";
import {hasNextPage, type PagedResult, type QueryOptions} from "../../api/types.ts";
import type {DrugGroup, SaveDrugGroupItem} from "./types.ts";

const PICKER_PAGE_SIZE = 30;

export const drugGroupKeys = {
    all: ["drugGroups"] as const,
    list: (search: string, page: number, pageSize: number) =>
        [...drugGroupKeys.all, "list", search, page, pageSize] as const,
    picker: (search: string) => [...drugGroupKeys.all, "picker", search] as const,
    detail: (id: number) => [...drugGroupKeys.all, "detail", id] as const,
};

const fetchDrugGroups = async (search: string, page: number, pageSize: number) =>
    (await api.get<PagedResult<DrugGroup>>("/drug-groups", {params: {search, page, pageSize}})).data;

export const useDrugGroups = (search: string, page: number, pageSize: number, {enabled = true}: QueryOptions = {}) =>
    useQuery({
        queryKey: drugGroupKeys.list(search, page, pageSize),
        queryFn: () => fetchDrugGroups(search, page, pageSize),
        placeholderData: keepPreviousData,
        enabled,
    });

export const useDrugGroupPicker = (search: string, {enabled = true}: QueryOptions = {}) =>
    useInfiniteQuery({
        queryKey: drugGroupKeys.picker(search),
        queryFn: ({pageParam}) => fetchDrugGroups(search, pageParam, PICKER_PAGE_SIZE),
        initialPageParam: 1,
        getNextPageParam: (last) => (hasNextPage(last) ? last.page + 1 : undefined),
        placeholderData: keepPreviousData,
        enabled,
    });

export const useDrugGroup = (id: number | null, {enabled = true}: QueryOptions = {}) =>
    useQuery({
        queryKey: drugGroupKeys.detail(id ?? 0),
        queryFn: async () => (await api.get<DrugGroup>(`/drug-groups/${id}`)).data,
        enabled: enabled && id !== null,
        // Always edit the latest version: fetched again each time the editor opens, even over a cached copy
        staleTime: 0,
        refetchOnMount: "always",
    });

type SaveDrugGroup = { id: number | null; name: string; items: SaveDrugGroupItem[] };

export const useSaveDrugGroup = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({id, ...body}: SaveDrugGroup) =>
            id === null
                ? (await api.post<DrugGroup>("/drug-groups", body)).data
                : (await api.put<DrugGroup>(`/drug-groups/${id}`, body)).data,
        onSuccess: () => void queryClient.invalidateQueries({queryKey: drugGroupKeys.all}),
    });
};

export const useDeleteDrugGroup = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.delete(`/drug-groups/${id}`),
        onSuccess: () => void queryClient.invalidateQueries({queryKey: drugGroupKeys.all}),
    });
};
