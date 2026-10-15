import {partialMatchKey, type QueryClient, type QueryKey} from "@tanstack/react-query";
import {toApiError} from "./errors.ts";

/**
 * Where a reusable component's data lives in the query cache, given by its adapter (e.g. the role list of one clinic).
 * The component never builds keys or URLs itself.
 */
export type DataScope = {
    /** Prefix of every query key the component's data uses */
    scope: QueryKey;
    /** Other data a change also changes (e.g. a staff change: the role counts, the clinic's staff count and owners) */
    affects?: readonly QueryKey[];
    /**
     * The data the scope belongs to (e.g. the clinic's details): when loading the scope answers 404, it loads again
     * (that key only), so a page whose clinic is gone says "not found".
     */
    container?: QueryKey;
};

/**
 * After a change: the scope and everything it affects load again, also queries not shown now (e.g. a list left for
 * another tab), so coming back shows the change at once, not the old rows first. One call, so a query under several
 * of the keys (one prefixes another) loads once.
 */
export const refreshScope = (queryClient: QueryClient, {scope, affects = []}: DataScope) => {
    const keys = [scope, ...affects];
    void queryClient.invalidateQueries({
        predicate: query => keys.some(key => partialMatchKey(query.queryKey, key)),
        refetchType: "all",
    });
};

/**
 * A query function of the scope: when it answers 404 (e.g. its clinic is gone meanwhile), the container loads again,
 * unless it is loading already or already answered 404 (a change reloads both at once: one request each).
 */
export const loadInScope = async <T>(queryClient: QueryClient, {container}: DataScope, load: () => Promise<T>) => {
    try {
        return await load();
    } catch (error) {
        if (container && toApiError(error)?.status === 404
            && toApiError(queryClient.getQueryState(container)?.error)?.status !== 404) {
            void queryClient.invalidateQueries({queryKey: container, exact: true}, {cancelRefetch: false});
        }
        throw error;
    }
};

/**
 * A refused change that says the data shown is out of date, so it should load again: 404 (the item, or its clinic, is
 * gone meanwhile, e.g. changed in another tab: the list drops it, a page whose clinic is gone shows "not found"), 409
 * (it conflicts with data changed meanwhile, e.g. a role given to someone since), or one of `codes`. The caller still
 * says why.
 */
export const showsStaleData = (error: unknown, codes: readonly string[] = []) => {
    const apiError = toApiError(error);
    return apiError?.status === 404 || apiError?.status === 409 || codes.includes(apiError?.code ?? "");
};
