import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {api} from "../../../api/client.ts";
import type {Category, SubCategory} from "../../drugs/types.ts";
import type {AdminCategory, SaveCategory} from "./types.ts";

export const adminCategoryKeys = {all: ["admin", "drugCategories"] as const};

/**
 * `GET /admin/drug-categories`: every category with its subcategories and counts. Also the admin drug screens' category
 * lists (a platform request can't call the clinic route `/drug-categories`).
 */
export const useAdminCategories = () =>
    useQuery({
        queryKey: adminCategoryKeys.all,
        queryFn: async () => (await api.get<AdminCategory[]>("/admin/drug-categories")).data,
        staleTime: 0,
    });

const useRefetch = () => {
    const queryClient = useQueryClient();
    return () => void queryClient.invalidateQueries({queryKey: adminCategoryKeys.all});
};

/** Creates (`id` null) or renames a category. */
export const useSaveCategory = () => {
    const refetch = useRefetch();
    return useMutation({
        mutationFn: async ({id, ...body}: SaveCategory & { id: number | null }) =>
            id === null
                ? (await api.post<Category>("/admin/drug-categories", body)).data
                : (await api.put<Category>(`/admin/drug-categories/${id}`, body)).data,
        onSuccess: refetch,
    });
};

/** Creates (`id` null, under `categoryId`) or renames a subcategory. */
export const useSaveSubCategory = () => {
    const refetch = useRefetch();
    return useMutation({
        mutationFn: async ({id, categoryId, ...body}: SaveCategory & { id: number | null; categoryId: number }) =>
            id === null
                ? (await api.post<SubCategory>(`/admin/drug-categories/${categoryId}/subcategories`, body)).data
                : (await api.put<SubCategory>(`/admin/drug-subcategories/${id}`, body)).data,
        onSuccess: refetch,
    });
};

/** Deletes a category (`kind` "category", with its empty subcategories) or a subcategory; 409 carries `drugCount`. */
export const useDeleteCategory = () => {
    const refetch = useRefetch();
    return useMutation({
        mutationFn: ({id, kind}: { id: number; kind: "category" | "subCategory" }) =>
            api.delete(kind === "category" ? `/admin/drug-categories/${id}` : `/admin/drug-subcategories/${id}`),
        // A 409 (a clinic added a drug meanwhile) reloads the counts too (CAT-215)
        onSettled: refetch,
    });
};
