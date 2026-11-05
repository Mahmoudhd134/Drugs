import {type QueryClient, useQuery} from "@tanstack/react-query";
import {api} from "../../api/client.ts";
import type {PrintTemplate} from "./types.ts";
import {readTemplate} from "./api.ts";

/** The clinic's own template, `GET /prescription-template`. The clinic comes from the token; the page re-mounts on a switch. */
export const clinicTemplateKeys = {
    current: (clinicId: number) => ["printTemplate", clinicId] as const,
    /** The read at a Print click: its own entry, so a failed click doesn't hide Print (TPL-105 vs TPL-344). */
    atPrint: (clinicId: number) => ["printTemplate", clinicId, "atPrint"] as const,
};

const getClinicTemplate = async () =>
    readTemplate((await api.get<PrintTemplate | "">("/prescription-template")).data);

/** Read when the page opens (`staleTime` 0). Print shows only on a successful answer holding a template. */
export const useClinicPrintTemplate = (clinicId: number) =>
    useQuery({queryKey: clinicTemplateKeys.current(clinicId), queryFn: getClinicTemplate, staleTime: 0});

/**
 * The read at a Print click, never from a cached copy and with no retry; its answer (null: removed) becomes the page's. Goes through
 * the query cache, so a 403 toasts once and reloads `/me` as every query does (TPL-343).
 */
export const readTemplateAtPrint = async (queryClient: QueryClient, clinicId: number) => {
    const template = await queryClient.fetchQuery({
        queryKey: clinicTemplateKeys.atPrint(clinicId),
        queryFn: getClinicTemplate,
        staleTime: 0,
        gcTime: 0,
        retry: false,
    });
    queryClient.setQueryData(clinicTemplateKeys.current(clinicId), template);
    return template;
};
