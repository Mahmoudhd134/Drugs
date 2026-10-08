export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    page: number;
    pageSize: number;
}

export const hasNextPage = (page: PagedResult<unknown>) => page.page * page.pageSize < page.totalCount;
