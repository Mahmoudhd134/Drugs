import {keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {api} from "../../api/client.ts";
import {hasNextPage, type PagedResult, type QueryOptions} from "../../api/types.ts";
import type {Drug, SaveDrug} from "./types.ts";
import {drugGroupKeys} from "../drugGroups/api.ts";

const PICKER_PAGE_SIZE = 30;

export const drugKeys = {
    all: ["drugs"] as const,
    list: (search: string, page: number, pageSize: number) => [...drugKeys.all, "list", search, page, pageSize] as const,
    picker: (search: string) => [...drugKeys.all, "picker", search] as const,
};

const fetchDrugs = async (search: string, page: number, pageSize: number) =>
    (await api.get<PagedResult<Drug>>("/drugs", {params: {search, page, pageSize}})).data;

/** Names of the groups that contain the drug. */
export const fetchDrugGroupNames = async (id: number) =>
    (await api.get<string[]>(`/drugs/${id}/groups`)).data;

/** One page of drugs, for tables. */
export const useDrugs = (search: string, page: number, pageSize: number, {enabled = true}: QueryOptions = {}) =>
    useQuery({
        queryKey: drugKeys.list(search, page, pageSize),
        queryFn: () => fetchDrugs(search, page, pageSize),
        placeholderData: keepPreviousData,
        enabled,
    });

/** Growing list of drugs ("load more"), for pickers. */
export const useDrugPicker = (search: string, {enabled = true}: QueryOptions = {}) =>
    useInfiniteQuery({
        queryKey: drugKeys.picker(search),
        queryFn: ({pageParam}) => fetchDrugs(search, pageParam, PICKER_PAGE_SIZE),
        initialPageParam: 1,
        getNextPageParam: (last) => (hasNextPage(last) ? last.page + 1 : undefined),
        placeholderData: keepPreviousData,
        enabled,
    });

export const useSaveDrug = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({id, ...body}: SaveDrug & { id: number | null }) =>
            id === null
                ? (await api.post<Drug>("/drugs", body)).data
                : (await api.put<Drug>(`/drugs/${id}`, body)).data,
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: drugKeys.all});
            // Groups embed drug names
            void queryClient.invalidateQueries({queryKey: drugGroupKeys.all});
        },
    });
};

export const useDeleteDrug = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.delete(`/drugs/${id}`),
        onSuccess: () => {
            void queryClient.invalidateQueries({queryKey: drugKeys.all});
            void queryClient.invalidateQueries({queryKey: drugGroupKeys.all});
        },
    });
};
