import {type FocusEvent, type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState} from "react";
import {Alert, Box, Button, CircularProgress, LinearProgress, Stack, ToggleButton, ToggleButtonGroup, Typography} from "@mui/material";
import {useQueryClient} from "@tanstack/react-query";
import {useTranslation} from "react-i18next";
import {SearchField} from "../../../components/common/SearchField.tsx";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {useLanguage} from "../../../hooks/useLanguage.ts";
import {categoryName} from "../categories.ts";
import {drugTreeKeys, useDrugTree} from "../treeApi.ts";
import {
    autoOpenBucket,
    type BucketKey,
    bucketKey,
    sortTree,
    type TreeRow,
    treeKeyAction,
    treeTotal,
    visibleRows,
} from "./drugTreeModel.ts";
import {DrugTreeNode, type TreeNav} from "./DrugTreeRows.tsx";
import {type BucketState, DrugTreeBucket} from "./DrugTreeBucket.tsx";
import type {Drug, DrugSource, DrugTreeSubCategory} from "../types.ts";

type Props = {
    /** A drug row clicked (or Enter on it); a double click adds once */
    onSelect: (drug: Drug) => void;
    /** Drugs already chosen: their rows carry «مُضاف» */
    selectedIds?: ReadonlySet<number>;
    autoFocus?: boolean;
    /** The scroll panel's max height (the page scrolls past it); default "58vh" */
    maxHeight?: number | string;
    /** False: never loads (no `drugs.list`: no request to `/drugs/tree` or `/drugs`) */
    enabled?: boolean;
};

/** The tree being shown: the search and source of its answer and what is open in it. */
type View = {
    key: string;
    search: string;
    source: DrugSource;
    openCategories: ReadonlySet<number>;
    openBuckets: ReadonlySet<BucketKey>;
};

const SOURCES: DrugSource[] = ["all", "shared", "own"];
const NOTHING_OPEN = new Set<never>();

/** Only spaces or tatweel: no search (CAT-125). */
const searchTerm = (text: string) => (text.replace(/[\sـ]/g, "") === "" ? "" : text);

const bucketQueryKey = (view: View, bucket: BucketKey) => {
    const [categoryId, subCategoryId] = bucket.split(":");
    return drugTreeKeys.bucket(view.search, view.source, Number(categoryId), subCategoryId === "none" ? "none" : Number(subCategoryId));
};

const without = <T, >(set: ReadonlySet<T>, value: T) => new Set([...set].filter(item => item !== value));

/**
 * The drug catalog as a tree (design M1.7 D7, D9): search + source toggle + «النتائج: N» + categories → subcategories →
 * drugs, 30 at a time while scrolling. Replaces `DrugPicker` in the prescription page and the protocol editor (same
 * props). Structure, keyboard and accessible names: docs/design/m1.7c-contract.md § 3.3.
 */
export const DrugTree = ({onSelect, selectedIds, autoFocus, maxHeight = "58vh", enabled = true}: Props) => {
    const {t} = useTranslation();
    const {language, dir} = useLanguage();
    const queryClient = useQueryClient();
    const treeId = useId();
    const panelRef = useRef<HTMLDivElement>(null);

    const [search, setSearch] = useState("");
    const [source, setSource] = useState<DrugSource>("all");
    const term = searchTerm(useDebouncedValue(search.trim()));
    const key = JSON.stringify([term, source]);
    const tree = useDrugTree(term, source, {enabled});
    const data = tree.data;

    const [view, setView] = useState<View | null>(null);
    const [activeId, setActiveId] = useState<string>();
    const [pendingFocus, setPendingFocus] = useState<{ bucket: BucketKey; index: number } | null>(null);
    // The first answer of a new search or source: everything closes, then the lone bucket opens by itself (D7). A
    // refetch of the same search and source (a drug saved) changes nothing (C12)
    if (data && !tree.isPlaceholderData && view?.key !== key) {
        const auto = autoOpenBucket(data);
        setView({
            key,
            search: term,
            source,
            openCategories: new Set(auto ? [auto.categoryId] : []),
            openBuckets: new Set(auto ? [auto.bucket] : []),
        });
        setActiveId(undefined);
        // Nothing of the old tree takes the focus later (R3-4)
        setPendingFocus(null);
    } else if (!data && view) {
        // The cache was cleared (context switch): nothing of the old tree stays
        setView(null);
    }

    // A closed bucket (or every bucket of the previous search) drops its pages: reopening starts at page 1 (CAT-121)
    const previousView = useRef<View | null>(null);
    useEffect(() => {
        const previous = previousView.current;
        previousView.current = view;
        if (!previous) return;
        for (const bucket of previous.openBuckets)
            if (view?.key !== previous.key || !view.openBuckets.has(bucket))
                queryClient.removeQueries({queryKey: bucketQueryKey(previous, bucket), exact: true});
    }, [view, queryClient]);

    const openCategories = view?.openCategories ?? NOTHING_OPEN;
    const openBuckets = view?.openBuckets ?? NOTHING_OPEN;
    const searching = (view?.search ?? term) !== "";
    // Sorted on render: a language switch re-sorts without a request (CAT-126)
    const categories = useMemo(() => (data ? sortTree(data, language, searching) : []), [data, language, searching]);

    const [bucketDrugs, setBucketDrugs] = useState<ReadonlyMap<BucketKey, Drug[]>>(new Map());
    const loaders = useRef(new Map<BucketKey, BucketState>());
    const onBucketState = useCallback((bucket: BucketKey, state: BucketState | null) => {
        if (state) loaders.current.set(bucket, state);
        else loaders.current.delete(bucket);
        setBucketDrugs(map => {
            if (map.get(bucket) === state?.drugs) return map;
            const next = new Map(map);
            if (state) next.set(bucket, state.drugs);
            else next.delete(bucket);
            return next;
        });
        // A failed or closed bucket never takes the focus later
        if (!state || state.isError) setPendingFocus(pending => (pending?.bucket === bucket ? null : pending));
    }, []);

    const rows = useMemo(() => visibleRows(categories, openCategories, openBuckets, bucketDrugs),
        [categories, openCategories, openBuckets, bucketDrugs]);
    // One Tab stop: the active row, else the first one (from the start and after each new tree)
    const tabStop = activeId !== undefined && rows.some(row => row.id === activeId) ? activeId : rows[0]?.id;

    const rowElements = useRef(new Map<string, HTMLElement>());
    const rowRef = useCallback((id: string, element: HTMLElement | null) => {
        if (element) rowElements.current.set(id, element);
        else rowElements.current.delete(id);
    }, []);
    const nav: TreeNav = useMemo(() => ({activeId: tabStop, rowRef}), [tabStop, rowRef]);

    // A row that isn't rendered yet gets the focus once it is (an open bucket's first drug, the first drug of a new page).
    // Dropped by anything else the user does: another key, another row focused, a new tree, a failed or closed bucket, the
    // focus leaving the tree (R3-4)
    useEffect(() => {
        if (!pendingFocus) return;
        const drug = bucketDrugs.get(pendingFocus.bucket)?.[pendingFocus.index];
        const id = drug && `d${pendingFocus.bucket}:${drug.id}`;
        const element = id && rowElements.current.get(id);
        if (!element) return;
        setPendingFocus(null);
        setActiveId(id);
        element.focus();
    }, [pendingFocus, bucketDrugs, rows]);

    const focusRow = (id: string) => {
        setPendingFocus(null);
        setActiveId(id);
        rowElements.current.get(id)?.focus();
    };

    const toggleCategory = (categoryId: number) => {
        setActiveId(`c${categoryId}`);
        setView(current => current && (current.openCategories.has(categoryId)
            ? {
                ...current,
                openCategories: without(current.openCategories, categoryId),
                // Its open subcategories close with it
                openBuckets: new Set([...current.openBuckets].filter(bucket => !bucket.startsWith(`${categoryId}:`))),
            }
            : {...current, openCategories: new Set([...current.openCategories, categoryId])}));
    };

    const toggleBucket = (bucket: BucketKey) => {
        setActiveId(`s${bucket}`);
        setView(current => current && {
            ...current,
            openBuckets: current.openBuckets.has(bucket) ? without(current.openBuckets, bucket) : new Set([...current.openBuckets, bucket]),
        });
    };

    const toggle = (row: TreeRow) => {
        if (row.kind === "category") toggleCategory(row.category.id);
        else if (row.kind === "subCategory") toggleBucket(row.bucket);
    };

    const pick = (drug: Drug, rowId: string) => {
        setActiveId(rowId);
        onSelect(drug);
    };

    const isExpanded = (row: TreeRow) =>
        row.kind === "category" ? openCategories.has(row.category.id) : row.kind === "subCategory" && openBuckets.has(row.bucket);

    const onTreeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        const target = event.target as HTMLElement;
        if (target.getAttribute("role") !== "treeitem") return;
        const index = rows.findIndex(row => row.id === target.dataset.rowId);
        const row = rows[index];
        if (!row) return;
        const action = treeKeyAction(event.key, row, isExpanded(row), dir === "rtl");
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        // Any other key action drops a focus still waiting for its row ("next" and "firstChild" may set a new one)
        setPendingFocus(null);
        const next = rows[index + 1];
        switch (action) {
            case "next": {
                // The last loaded drug of a bucket with more: its next page loads, the focus moves to its first new drug
                const lastOfBucket = row.kind === "drug" && (next?.kind !== "drug" || next.bucket !== row.bucket);
                const loader = lastOfBucket ? loaders.current.get(row.bucket) : undefined;
                if (loader?.hasNextPage && row.kind === "drug") {
                    loader.loadMore();
                    setPendingFocus({bucket: row.bucket, index: loader.drugs.length});
                } else if (next) focusRow(next.id);
                break;
            }
            case "previous":
                if (index > 0) focusRow(rows[index - 1].id);
                break;
            case "open":
            case "close":
                toggle(row);
                break;
            case "firstChild":
                if (next && next.level > row.level) focusRow(next.id);
                else if (row.kind === "subCategory") setPendingFocus({bucket: row.bucket, index: 0});
                break;
            case "closeParent":
                if (row.kind === "drug") {
                    toggleBucket(row.bucket);
                    focusRow(`s${row.bucket}`);
                } else if (row.kind === "subCategory") {
                    toggleCategory(row.categoryId);
                    focusRow(`c${row.categoryId}`);
                }
                break;
            case "activate":
                // A drug is added and keeps the focus (CAT-105); a node opens or closes
                if (row.kind === "drug") pick(row.drug, row.id);
                else toggle(row);
                break;
        }
    };

    const onTreeFocus = (event: FocusEvent<HTMLElement>) => {
        const id = event.target.getAttribute("role") === "treeitem" ? event.target.dataset.rowId : undefined;
        if (!id) return;
        setActiveId(id);
        // Another row focused (a click, a moved focus): no waiting focus takes it away later
        setPendingFocus(null);
    };

    const onTreeBlur = (event: FocusEvent<HTMLElement>) => {
        // The focus left the tree (another field, a button, the page): a waiting focus never comes back to steal it
        const to = event.relatedTarget;
        if (event.target.isConnected && !(to instanceof Node && panelRef.current?.contains(to))) setPendingFocus(null);
    };

    /**
     * «تحميل المزيد» / a retry: the focus stays in the bucket while its button is replaced by the spinner (R3-1); only
     * «تحميل المزيد» moves it on to the first new drug, a retry leaves it there (C33).
     */
    const holdFocus = (bucket: BucketKey, nextIndex: number | null) => {
        const drugs = loaders.current.get(bucket)?.drugs ?? [];
        const last = drugs[drugs.length - 1] as Drug | undefined;
        focusRow(last ? `d${bucket}:${last.id}` : `s${bucket}`);
        if (nextIndex !== null) setPendingFocus({bucket, index: nextIndex});
    };

    const searchRef = useRef<HTMLInputElement>(null);
    const retryTree = () => {
        // The retry button goes away while the tree loads: the focus waits in the search field, not on <body> (R3-1)
        searchRef.current?.focus();
        void tree.refetch();
    };

    const onSearchKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
            // Clears the search and nothing else: no dialog closes, no leave guard (CAT-106)
            event.preventDefault();
            event.stopPropagation();
            setSearch("");
        } else if (event.key === "ArrowDown" && tabStop) {
            event.preventDefault();
            rowElements.current.get(tabStop)?.focus();
        }
    };

    const subCategoryName = (subCategory: DrugTreeSubCategory) =>
        subCategory.id === null
            ? t("drugs.noSubCategory")
            : categoryName({nameEn: subCategory.nameEn ?? "", nameAr: subCategory.nameAr ?? ""}, language);

    const shownSource = view?.source ?? source;
    const shownSearch = view?.search ?? term;
    const hasTree = data !== undefined && data.categories.length > 0;

    return (
        <Box>
            <SearchField
                value={search}
                onChange={setSearch}
                placeholder={t("drugTree.searchPlaceholder")}
                autoFocus={autoFocus}
                inputRef={searchRef}
                onKeyDown={onSearchKeyDown}
                controls={hasTree ? treeId : undefined}
            />
            <Stack direction="row" sx={{mt: 1, gap: 1, alignItems: "center", flexWrap: "wrap"}}>
                <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={source}
                    // Never deselected to null
                    onChange={(_, value: DrugSource | null) => value && setSource(value)}
                    aria-label={t("drugs.source.label")}
                >
                    {SOURCES.map(value => <ToggleButton key={value} value={value}>{t(`drugs.source.${value}`)}</ToggleButton>)}
                </ToggleButtonGroup>
                {hasTree && (
                    <Typography variant="caption" color="text.secondary" sx={{marginInlineStart: "auto", px: 0.5}}>
                        {t("common.results", {count: treeTotal(data)})}
                    </Typography>
                )}
            </Stack>

            <Box sx={{height: 4, my: 1}}>
                {tree.isPlaceholderData && <LinearProgress sx={{borderRadius: 1}} aria-label={t("common.loading")}/>}
            </Box>

            {!enabled ? null : data === undefined ? (
                tree.isError ? (
                    <Alert
                        severity="error"
                        action={<Button color="inherit" size="small" onClick={retryTree}>{t("common.retry")}</Button>}
                    >
                        {t("common.loadFailed")}
                    </Alert>
                ) : (
                    <Box sx={{display: "flex", justifyContent: "center", py: 4}}>
                        <CircularProgress size={28} aria-label={t("common.loading")}/>
                    </Box>
                )
            ) : !hasTree ? (
                <Typography color="text.secondary" sx={{textAlign: "center", py: 4}}>
                    {shownSource === "own" && shownSearch === "" ? t("drugs.noOwnDrugs") : t("drugs.noResults")}
                </Typography>
            ) : (
                <Box ref={panelRef} sx={{maxHeight, overflowY: "auto", border: 1, borderColor: "divider", borderRadius: 2}}>
                    <Box role="tree" id={treeId} aria-label={t("drugTree.label")} onKeyDown={onTreeKeyDown} onFocus={onTreeFocus}
                         onBlur={onTreeBlur}
                         sx={{py: 0.5}}>
                        {categories.map(category => (
                            <DrugTreeNode
                                key={category.id}
                                id={`c${category.id}`}
                                level={1}
                                name={categoryName(category, language)}
                                count={category.count}
                                expanded={openCategories.has(category.id)}
                                nav={nav}
                                onToggle={() => toggleCategory(category.id)}
                            >
                                <Box role="group">
                                    {category.subCategories.map(subCategory => {
                                        const bucket = bucketKey(category.id, subCategory.id);
                                        return (
                                            <DrugTreeNode
                                                key={bucket}
                                                id={`s${bucket}`}
                                                level={2}
                                                name={subCategoryName(subCategory)}
                                                count={subCategory.count}
                                                expanded={openBuckets.has(bucket)}
                                                nav={nav}
                                                onToggle={() => toggleBucket(bucket)}
                                            >
                                                {view && (
                                                    <DrugTreeBucket
                                                        key={view.key}
                                                        search={view.search}
                                                        source={view.source}
                                                        categoryId={category.id}
                                                        subCategoryId={subCategory.id}
                                                        bucket={bucket}
                                                        panelRef={panelRef}
                                                        nav={nav}
                                                        selectedIds={selectedIds}
                                                        onPick={pick}
                                                        onState={onBucketState}
                                                        onHoldFocus={holdFocus}
                                                    />
                                                )}
                                            </DrugTreeNode>
                                        );
                                    })}
                                </Box>
                            </DrugTreeNode>
                        ))}
                    </Box>
                </Box>
            )}
        </Box>
    );
};
