import {keepPreviousData, useInfiniteQuery, useQuery} from "@tanstack/react-query";
import {api} from "../../api/client.ts";
import {hasNextPage, type QueryOptions} from "../../api/types.ts";
import {drugKeys, fetchDrugs} from "./api.ts";
import type {DrugSource, DrugTreeData, SubCategoryFilter} from "./types.ts";

/** Drugs per tree page (design M1.7 D7): the next 30 load when the end of an open subcategory scrolls into view. */
export const TREE_PAGE_SIZE = 30;

/**
 * Under `drugKeys.all`, so a drug save or delete refreshes the tree too. No language in the keys: switching language
 * re-sorts the loaded tree without a request (CAT-126).
 */
export const drugTreeKeys = {
    tree: (search: string, source: DrugSource) => [...drugKeys.all, "tree", search, source] as const,
    /** One open subcategory's pages ("none" = the category's drugs without a subcategory) */
    bucket: (search: string, source: DrugSource, categoryId: number, subCategoryId: SubCategoryFilter) =>
        [...drugKeys.all, "bucket", search, source, categoryId, subCategoryId] as const,
};

/** `GET /drugs/tree` (needs `drugs.list`); `source` "all" is left out (the API's default). */
export const fetchDrugTree = async (search: string, source: DrugSource) =>
    (await api.get<DrugTreeData>("/drugs/tree", {params: {search, ...(source !== "all" ? {source} : {})}})).data;

/**
 * The tree's counts. `keepPreviousData`: while a new search or source loads, the old tree stays (with the thin progress
 * bar) and an older, slower answer never replaces a newer one (CAT-101, CAT-102). M1.7c contract (track web may tune
 * the options, not the signature).
 */
export const useDrugTree = (search: string, source: DrugSource, {enabled = true}: QueryOptions = {}) =>
    useQuery({
        queryKey: drugTreeKeys.tree(search, source),
        queryFn: () => fetchDrugTree(search, source),
        placeholderData: keepPreviousData,
        enabled,
    });

/**
 * One open subcategory's drugs: `GET /drugs?categoryId=&subCategoryId=` + the tree's search and source, 30 per page, in
 * the D7 order. Closing the subcategory removes this query (`queryClient.removeQueries`), so reopening starts from its
 * first page (CAT-121).
 */
export const useDrugBucket = (search: string, source: DrugSource, categoryId: number, subCategoryId: SubCategoryFilter,
                              {enabled = true}: QueryOptions = {}) =>
    useInfiniteQuery({
        queryKey: drugTreeKeys.bucket(search, source, categoryId, subCategoryId),
        queryFn: ({pageParam}) => fetchDrugs(search, pageParam, TREE_PAGE_SIZE, {source, categoryId, subCategoryId}),
        initialPageParam: 1,
        getNextPageParam: (last) => (hasNextPage(last) ? last.page + 1 : undefined),
        enabled,
    });
