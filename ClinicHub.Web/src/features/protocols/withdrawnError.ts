import {toApiError} from "../../api/errors.ts";

/**
 * The drug name of the line a protocol save's `drugWithdrawn` error points at (field `items[i].drugId`, `i` = the
 * index in the request), from the lines the editor sent; null for any other error or an index out of range (the
 * generic `errors.drugWithdrawn` text then). Design M1.7 D6, § 7.
 */
export const withdrawnLineName = (error: unknown, sent: ReadonlyArray<{ drug: { name: string } }>): string | null => {
    const item = toApiError(error)?.errors.find(e => e.code === "drugWithdrawn");
    const index = item?.field?.match(/^items\[(\d+)]/)?.[1];
    if (index === undefined) return null;
    return sent[Number(index)]?.drug.name ?? null;
};
