import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {loadInScope, refreshScope, showsStaleData} from "../../api/dataScope.ts";
import type {PrintLayout, PrintTemplate, PrintTemplateAdapter} from "./types.ts";

/** A template answer: a 204 (no template) reaches axios as `""`. */
export const readTemplate = (data: PrintTemplate | "") => data || null;

/**
 * The adapter's template (null: none). `staleTime` 0: the tab always asks when it opens. The designer takes its draft
 * from the first answer since it mounted (contract § 3.6): a later refetch never overwrites the draft.
 */
export const usePrintTemplate = (adapter: PrintTemplateAdapter) => {
    const queryClient = useQueryClient();
    return useQuery({
        queryKey: adapter.scope,
        queryFn: () => loadInScope(queryClient, adapter, () => adapter.get()),
        staleTime: 0,
    });
};

/** Creates or replaces. A refusal saying the data is out of date (e.g. 404: the clinic is gone) reloads the scope. */
export const useSavePrintTemplate = (adapter: PrintTemplateAdapter) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (layout: PrintLayout) => adapter.save(layout),
        onSuccess: (saved) => queryClient.setQueryData(adapter.scope, saved),
        onError: (error) => {
            if (showsStaleData(error)) refreshScope(queryClient, adapter);
        },
    });
};

/** Removes it. A read in flight (with the old template) is cancelled, so it can't bring the template back on screen. */
export const useDeletePrintTemplate = (adapter: PrintTemplateAdapter) => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => adapter.remove(),
        onSuccess: async () => {
            await queryClient.cancelQueries({queryKey: adapter.scope});
            queryClient.setQueryData(adapter.scope, null);
        },
        onError: (error) => {
            if (showsStaleData(error)) refreshScope(queryClient, adapter);
        },
    });
};
