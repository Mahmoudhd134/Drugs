import {keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {api} from "../../api/client.ts";
import {hasNextPage, type PagedResult, type QueryOptions} from "../../api/types.ts";
import type {Protocol, SaveProtocolItem} from "./types.ts";

const PICKER_PAGE_SIZE = 30;

export const protocolKeys = {
    all: ["protocols"] as const,
    list: (search: string, page: number, pageSize: number) =>
        [...protocolKeys.all, "list", search, page, pageSize] as const,
    picker: (search: string) => [...protocolKeys.all, "picker", search] as const,
    detail: (id: number) => [...protocolKeys.all, "detail", id] as const,
};

const fetchProtocols = async (search: string, page: number, pageSize: number) =>
    (await api.get<PagedResult<Protocol>>("/protocols", {params: {search, page, pageSize}})).data;

export const useProtocols = (search: string, page: number, pageSize: number, {enabled = true}: QueryOptions = {}) =>
    useQuery({
        queryKey: protocolKeys.list(search, page, pageSize),
        queryFn: () => fetchProtocols(search, page, pageSize),
        placeholderData: keepPreviousData,
        enabled,
    });

export const useProtocolPicker = (search: string, {enabled = true}: QueryOptions = {}) =>
    useInfiniteQuery({
        queryKey: protocolKeys.picker(search),
        queryFn: ({pageParam}) => fetchProtocols(search, pageParam, PICKER_PAGE_SIZE),
        initialPageParam: 1,
        getNextPageParam: (last) => (hasNextPage(last) ? last.page + 1 : undefined),
        placeholderData: keepPreviousData,
        enabled,
    });

export const useProtocol = (id: number | null, {enabled = true}: QueryOptions = {}) =>
    useQuery({
        queryKey: protocolKeys.detail(id ?? 0),
        queryFn: async () => (await api.get<Protocol>(`/protocols/${id}`)).data,
        enabled: enabled && id !== null,
        // Always edit the latest version: fetched again each time the editor opens, even over a cached copy
        staleTime: 0,
        refetchOnMount: "always",
    });

type SaveProtocol = { id: number | null; name: string; items: SaveProtocolItem[] };

export const useSaveProtocol = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({id, ...body}: SaveProtocol) =>
            id === null
                ? (await api.post<Protocol>("/protocols", body)).data
                : (await api.put<Protocol>(`/protocols/${id}`, body)).data,
        onSuccess: () => void queryClient.invalidateQueries({queryKey: protocolKeys.all}),
    });
};

export const useDeleteProtocol = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.delete(`/protocols/${id}`),
        onSuccess: () => void queryClient.invalidateQueries({queryKey: protocolKeys.all}),
    });
};
