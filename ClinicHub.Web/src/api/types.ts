export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    page: number;
    pageSize: number;
}

export const hasNextPage = (page: PagedResult<unknown>) => page.page * page.pageSize < page.totalCount;

/** Options every query hook takes, e.g. `{enabled: can(PERMISSIONS.drugs.list)}` so a page never calls an endpoint the user can't use. */
export type QueryOptions = { enabled?: boolean };
