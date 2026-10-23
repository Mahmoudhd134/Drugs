import {type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef} from "react";
import {Alert, Box, Button, CircularProgress} from "@mui/material";
import {useTranslation} from "react-i18next";
import {useDrugBucket} from "../treeApi.ts";
import {type BucketKey, dedupeById, subCategoryFilterOf} from "./drugTreeModel.ts";
import {type DrugRowMode, DrugTreeDrug, type TreeNav} from "./DrugTreeRows.tsx";
import type {Drug, DrugSource} from "../types.ts";

/** What the tree needs of an open bucket for the keyboard (↓ on its last loaded drug loads the next page). */
export type BucketState = {
    drugs: Drug[];
    hasNextPage: boolean;
    loadMore: () => void;
    /** Its last page request failed */
    isError: boolean;
};

type Props = {
    search: string;
    source: DrugSource;
    categoryId: number;
    subCategoryId: number | null;
    bucket: BucketKey;
    /** The tree's scroll panel: the root of the end-of-list observer (CAT-118) */
    panelRef: RefObject<HTMLElement | null>;
    nav: TreeNav;
    selectedIds?: ReadonlySet<number>;
    rowMode: DrugRowMode;
    rowActions?: (drug: Drug) => ReactNode;
    onPick: (drug: Drug, rowId: string) => void;
    /** Its loaded drugs and loader, null once it closes */
    onState: (bucket: BucketKey, state: BucketState | null) => void;
    /**
     * Before «تحميل المزيد» or a retry (whose button goes away while it loads): the focus moves to the bucket's last loaded
     * drug (else its subcategory row), then to the first new drug at `nextIndex` once it shows (null: stays there, as
     * after a retry, C33)
     */
    onHoldFocus: (bucket: BucketKey, nextIndex: number | null) => void;
};

/**
 * An open subcategory's `role="group"`: its drugs 30 at a time (the next page when the sentinel after the last loaded
 * drug scrolls into the panel's view, or with «تحميل المزيد»), a spinner while a page loads, a retry for a failed page.
 */
export const DrugTreeBucket = ({search, source, categoryId, subCategoryId, bucket, panelRef, nav, selectedIds, rowMode, rowActions, onPick, onState, onHoldFocus}: Props) => {
    const {t} = useTranslation();
    const query = useDrugBucket(search, source, categoryId, subCategoryFilterOf(subCategoryId));
    const {data, hasNextPage, isFetchingNextPage, isPending, isError, isFetchNextPageError, fetchNextPage, refetch} = query;
    const drugs = useMemo(() => dedupeById(data?.pages.map(page => page.items) ?? []), [data]);
    // An in-flight page is never asked for again (CAT-119)
    const loadMore = useCallback(() => void fetchNextPage({cancelRefetch: false}), [fetchNextPage]);

    useEffect(() => onState(bucket, {drugs, hasNextPage, loadMore, isError}), [bucket, drugs, hasNextPage, loadMore, isError, onState]);
    useEffect(() => () => onState(bucket, null), [bucket, onState]);

    const sentinelRef = useRef<HTMLDivElement>(null);
    const canLoad = hasNextPage && !isFetchingNextPage && !isError;
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!canLoad || !sentinel || typeof IntersectionObserver === "undefined") return;
        // A new observer after each page: it reports at once whether the end is still in view
        const observer = new IntersectionObserver(
            (entries) => entries.some(entry => entry.isIntersecting) && loadMore(),
            {root: panelRef.current},
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [canLoad, loadMore, panelRef, drugs.length]);

    const busy = isPending || isFetchingNextPage;
    return (
        <Box role="group" aria-busy={busy}>
            {drugs.map(drug => {
                const id = `d${bucket}:${drug.id}`;
                return <DrugTreeDrug key={drug.id} id={id} drug={drug} added={selectedIds?.has(drug.id) ?? false} mode={rowMode}
                                     actions={rowActions?.(drug)} nav={nav} onPick={() => onPick(drug, id)}/>;
            })}
            <div data-testid="drug-tree-sentinel" ref={sentinelRef}/>
            {busy ? (
                <Box sx={{display: "flex", justifyContent: "center", py: 1.5}}>
                    <CircularProgress size={22} aria-label={t("common.loading")}/>
                </Box>
            ) : isError ? (
                <Alert
                    severity="error"
                    sx={{my: 1, ml: 7, mr: 1.5}}
                    action={
                        <Button color="inherit" size="small"
                                onClick={() => {
                                    // The focus waits on the last loaded drug (else the subcategory row) and stays there
                                    // when the page arrives: an arriving page never takes the focus (C33)
                                    onHoldFocus(bucket, null);
                                    if (isFetchNextPageError) void fetchNextPage({cancelRefetch: false});
                                    else void refetch();
                                }}>
                            {t("common.retry")}
                        </Button>
                    }
                >
                    {t("common.loadFailed")}
                </Alert>
            ) : hasNextPage ? (
                <Box sx={{py: 1, textAlign: "center"}}>
                    <Button size="small" onClick={() => {
                        // As ↓ on the last loaded drug: the focus goes to the first new drug (R3-1)
                        onHoldFocus(bucket, drugs.length);
                        loadMore();
                    }}>{t("common.loadMore")}</Button>
                </Box>
            ) : null}
        </Box>
    );
};
