import {keepPreviousData, type QueryClient, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {api} from "../../api/client.ts";
import {toApiError} from "../../api/errors.ts";
import type {PagedResult} from "../../api/types.ts";
import type {ClinicDetails, ClinicStatus, ClinicSummary, CreateClinic} from "./types.ts";

/** The clinics list filter: every status, or one. */
export type ClinicStatusFilter = ClinicStatus | "";

const all = ["admin", "clinics"] as const;

export const adminClinicKeys = {
    all,
    lists: [...all, "list"] as const,
    list: (search: string, status: ClinicStatusFilter, page: number, pageSize: number) =>
        [...adminClinicKeys.lists, search, status, page, pageSize] as const,
    detail: (id: number) => [...adminClinicKeys.all, "detail", id] as const,
};

/** One page of clinics (no template, no deleted ones). */
export const useAdminClinics = (search: string, status: ClinicStatusFilter, page: number, pageSize: number) =>
    useQuery({
        queryKey: adminClinicKeys.list(search, status, page, pageSize),
        queryFn: async () => (await api.get<PagedResult<ClinicSummary>>("/admin/clinics",
            {params: {search, status: status || undefined, page, pageSize}})).data,
        placeholderData: keepPreviousData,
    });

/** A clinic with its owners; 404 `notFound` for a missing, deleted or template clinic. Null id = nothing to load. */
export const useAdminClinic = (id: number | null) =>
    useQuery({
        queryKey: adminClinicKeys.detail(id ?? 0),
        queryFn: async () => (await api.get<ClinicDetails>(`/admin/clinics/${id}`)).data,
        enabled: id !== null,
        // Always show the latest (staff count, owners)
        staleTime: 0,
    });

/**
 * The lists load again, also those not shown now (the list left for the clinic's page): coming back shows the change
 * at once, not the old row first.
 */
const refetchLists = (queryClient: QueryClient) =>
    void queryClient.invalidateQueries({queryKey: adminClinicKeys.lists, refetchType: "all"});

/** After a change: the clinic's page gets the new state, the lists load again. */
const useOnClinicChanged = () => {
    const queryClient = useQueryClient();
    return (clinic: ClinicDetails) => {
        queryClient.setQueryData(adminClinicKeys.detail(clinic.id), clinic);
        refetchLists(queryClient);
    };
};

/**
 * A change answered 404 (the clinic was deleted meanwhile, e.g. in another tab): its page loads it again and shows
 * "not found", the lists drop it (the caller still toasts the error).
 */
const useOnClinicGone = () => {
    const queryClient = useQueryClient();
    return (error: unknown, id: number) => {
        if (toApiError(error)?.status !== 404) return;
        void queryClient.invalidateQueries({queryKey: adminClinicKeys.detail(id)});
        refetchLists(queryClient);
    };
};

/** Creates a clinic provisioned from the template, with its owner (all or nothing). */
export const useCreateClinic = () => {
    const onChanged = useOnClinicChanged();
    return useMutation({
        mutationFn: async (body: CreateClinic) => (await api.post<ClinicDetails>("/admin/clinics", body)).data,
        onSuccess: onChanged,
    });
};

export const useRenameClinic = () => {
    const onChanged = useOnClinicChanged();
    const onGone = useOnClinicGone();
    return useMutation({
        mutationFn: async ({id, name}: { id: number; name: string }) =>
            (await api.put<ClinicDetails>(`/admin/clinics/${id}`, {name})).data,
        onSuccess: onChanged,
        onError: (error, {id}) => onGone(error, id),
    });
};

/** Disables (suspends) or enables (activates) a clinic; idempotent. */
export const useSetClinicStatus = () => {
    const queryClient = useQueryClient();
    const onGone = useOnClinicGone();
    return useMutation({
        mutationFn: ({id, status}: { id: number; status: ClinicStatus }) =>
            api.post(`/admin/clinics/${id}/${status === "suspended" ? "suspend" : "activate"}`),
        onSuccess: (_, {id, status}) => {
            queryClient.setQueryData<ClinicDetails>(adminClinicKeys.detail(id), clinic => clinic && {...clinic, status});
            refetchLists(queryClient);
        },
        onError: (error, {id}) => onGone(error, id),
    });
};

/**
 * Soft delete, final. The cached lists are dropped (the next one shown loads without the clinic, never with it first);
 * the caller leaves the clinic's page, then drops its cached details with {@link useForgetClinic} (dropping them while
 * the page is shown would load it again: a 404).
 */
export const useDeleteClinic = () => {
    const queryClient = useQueryClient();
    const onGone = useOnClinicGone();
    return useMutation({
        mutationFn: (id: number) => api.delete(`/admin/clinics/${id}`),
        onSuccess: () => queryClient.removeQueries({queryKey: adminClinicKeys.lists}),
        onError: (error, id) => onGone(error, id),
    });
};

export const useForgetClinic = () => {
    const queryClient = useQueryClient();
    return (id: number) => queryClient.removeQueries({queryKey: adminClinicKeys.detail(id), exact: true});
};
