import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useSearchParams} from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    Chip,
    LinearProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
    useMediaQuery,
} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/EditOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import MedicationIcon from "@mui/icons-material/Medication";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {ListPagination} from "../../../components/common/ListPagination.tsx";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {getErrorMessage} from "../../../api/errors.ts";
import {fetchDrugProtocolNames, useDeleteDrug, useDrugCategories, useDrugs} from "../api.ts";
import {categoryPath} from "../categories.ts";
import {DrugFormDialog} from "../components/DrugFormDialog.tsx";
import {DrugListFilters} from "../components/DrugListFilters.tsx";
import {DrugText} from "../components/DrugText.tsx";
import {DrugTree} from "../components/DrugTree.tsx";
import {filterTree, treeSearchTerm, treeTotal} from "../components/drugTreeModel.ts";
import {useDrugTree} from "../treeApi.ts";
import type {Drug, DrugFilters} from "../types.ts";
import {
    clampPage,
    DEFAULT_DRUG_LIST_PARAMS,
    drugListEmptyState,
    type DrugListParams,
    type DrugListView,
    readDrugListParams,
    writeDrugListParams,
} from "./drugListParams.ts";
import {PERMISSIONS} from "../../access/permissions.ts";
import {usePermissions} from "../../access/usePermissions.ts";
import {PermissionButton, PermissionIconButton} from "../../access/components/PermissionControls.tsx";

/** The largest page sent to the API (an edited link's huge `page` is cut to it, then to the last page) */
const MAX_PAGE = 999_999;

/**
 * `/drugs` (design M1.7 D9): the clinic's own drugs and the shared catalog as a category tree (the default) or one paged
 * table (M1.7 review R1). Search, the source toggle, the category and subcategory filters and the list's page live in
 * the URL (`replace: true`, M1.7c C2), the view too (a new history entry: Back returns to the other view); the page size
 * is local. One filter bar drives both views.
 */
export const DrugsPage = () => {
    const {t, i18n} = useTranslation();
    const language = i18n.language;
    const [searchParams, setSearchParams] = useSearchParams();
    const [pageSize, setPageSize] = useState(20);
    const [dialog, setDialog] = useState<{ open: boolean; drug: Drug | null }>({open: false, drug: null});
    const {can, canAny} = usePermissions();
    const canList = can(PERMISSIONS.drugs.list);
    const showActions = canAny(PERMISSIONS.drugs.update, PERMISSIONS.drugs.delete);
    const canUpdate = can(PERMISSIONS.drugs.update);
    const canDetails = can(PERMISSIONS.drugs.details);
    // Without edit permission an own row opens read-only details; a shared row (read-only for clinics, design M1.7
    // D9) always opens them, with `drugs.details`
    const canOpen = (drug: Drug) => (drug.isShared ? canDetails : canUpdate || canDetails);
    // Below `sm` the category path goes under the name instead of its own column: one copy per row (M1.7c C14, C26)
    const phone = useMediaQuery(useTheme().breakpoints.down("sm"));

    const categories = useDrugCategories({enabled: canList});
    const params = readDrugListParams(searchParams, categories.data);
    const page = params.page;
    const isTree = params.view === "tree";

    /** Changes the URL's state in place (no new history entry); values that aren't valid are dropped. */
    const update = useCallback((change: (current: DrugListParams) => DrugListParams) =>
        setSearchParams(prev => writeDrugListParams(change(readDrugListParams(prev, categories.data))), {replace: true}),
    [setSearchParams, categories.data]);
    /** Any change other than the page goes back to page 1 */
    const setFilters = useCallback((changes: Partial<DrugListParams>) =>
        update(current => ({...current, ...changes, page: 1})), [update]);
    const setPage = useCallback((next: number) => update(current => ({...current, page: next})), [update]);
    /** The other view: the filters are kept, the list's page goes back to 1; a new history entry (CAT-271) */
    const setView = (view: DrugListView) =>
        setSearchParams(prev => writeDrugListParams({...readDrugListParams(prev, categories.data), view, page: 1}));

    const [search, setSearch] = useState(params.search);
    const debouncedSearch = useDebouncedValue(search.trim());
    // The search in the URL as this page last wrote it, or last took it from the URL, trimmed: a link's `search=amox%20`
    // is the same search as the typed "amox" (no rewrite, no jump to page 1)
    const lastSearch = useRef(params.search.trim());
    // The debounced value this page last acted on: only a new debounced value is sent. A re-run for another reason (the
    // categories refetched after a save, so `setFilters` changed) never sends a debounced value that was overtaken by a
    // search cleared or replaced since (CAT-137: the old term would come back after the switch to «أدوية العيادة»)
    const handledDebounce = useRef(debouncedSearch);
    // The typed search reaches the URL (and the query) once typing pauses, back on the first page
    useEffect(() => {
        if (debouncedSearch === handledDebounce.current) return;
        handledDebounce.current = debouncedSearch;
        if (debouncedSearch === lastSearch.current) return;
        lastSearch.current = debouncedSearch;
        setFilters({search: debouncedSearch});
    }, [debouncedSearch, setFilters]);
    // A search changed from outside (Back, a link, «مسح الفلاتر») wins over the typed one
    useEffect(() => {
        if (params.search.trim() === lastSearch.current) return;
        lastSearch.current = params.search.trim();
        setSearch(params.search);
    }, [params.search]);

    // Invalid values in the URL (an unknown source, a deleted category, a subcategory without or outside its category…)
    // are dropped from it once the categories are known: one rewrite, then the URL is canonical
    const staleUrl = categories.data !== undefined && writeDrugListParams(params).toString() !== searchParams.toString();
    useEffect(() => {
        if (staleUrl) update(current => current);
    }, [staleUrl, update]);

    // No request with a category id that isn't checked yet: the list waits for the categories
    const waitsForCategories = searchParams.has("categoryId") && categories.data === undefined && !categories.isError;
    const filters: DrugFilters = {source: params.source, categoryId: params.categoryId, subCategoryId: params.subCategoryId};
    const drugs = useDrugs(params.search.trim(), Math.min(page, MAX_PAGE), pageSize,
        {enabled: canList && !waitsForCategories && !isTree}, filters);
    // The tree view's counts: the same query (and cache entry) as the tree's own, for the subtitle and the empty states
    const tree = useDrugTree(treeSearchTerm(params.search.trim()), params.source, {enabled: canList && !waitsForCategories && isTree});
    const treeData = useMemo(() => tree.data && filterTree(tree.data, params.categoryId, params.subCategoryId),
        [tree.data, params.categoryId, params.subCategoryId]);
    const deleteDrug = useDeleteDrug();
    const {confirm, dialog: confirmDialog} = useConfirm();

    // The list's answer, never while the tree shows (a disabled query still returns its cached data)
    const listData = isTree ? undefined : drugs.data;
    const items = listData?.items ?? [];
    const totalCount = listData?.totalCount ?? 0;
    const lastPage = clampPage(page, totalCount, pageSize);
    // «إجمالي الأدوية: N» in both views: the drugs matching the filters
    const shownTotal = isTree ? treeData && treeTotal(treeData) : listData?.totalCount;

    // A page past the end (an old link, or its last rows deleted or filtered away): the last page instead (CAT-143)
    const pastTheEnd = listData !== undefined && !drugs.isPlaceholderData && page > lastPage;
    useEffect(() => {
        if (pastTheEnd) setPage(lastPage);
    }, [pastTheEnd, lastPage, setPage]);

    // Until the clamped page arrives, a page past the end shows no rows (an older page's, or none) and no range (CAT-143):
    // a page beyond the known total, or an empty page of a non-empty list
    const awaitingClamp = listData !== undefined && totalCount > 0 && (page > lastPage || items.length === 0);

    // Saving a new own drug while «المشتركة» is chosen switches to «أدوية العيادة», clears the search, page 1, so the
    // drug shows (CAT-137, M1.7c C35)
    const onSaved = (saved: Drug, created: boolean) => {
        if (!created || saved.isShared || params.source !== "shared") return;
        // The typed search too (even one not in the URL yet): it never comes back after the switch
        lastSearch.current = "";
        setSearch("");
        update(current => ({...current, source: "own", search: "", page: 1}));
    };

    const openCreate = () => setDialog({open: true, drug: null});
    const openEdit = (drug: Drug) => setDialog({open: true, drug});

    const handleDelete = async (drug: Drug) => {
        // Name the protocols that will lose this drug (needs drug details); if the lookup fails, still allow deleting
        const protocolNames = can(PERMISSIONS.drugs.details)
            ? await fetchDrugProtocolNames(drug.id).catch(() => [] as string[])
            : [];
        const confirmed = await confirm({
            title: t("drugs.deleteTitle"),
            message: [
                t("drugs.deleteMessage", {name: drug.name}),
                protocolNames.length ? t("drugs.usedInProtocols", {names: protocolNames.join("، ")}) : null,
            ].filter(Boolean).join("\n"),
            destructive: true,
        });
        if (!confirmed) return;

        try {
            await deleteDrug.mutateAsync(drug.id);
            toast.success(t("drugs.deleted"));
            // Step back if the last row of the last page was deleted
            if (items.length === 1 && page > 1) setPage(page - 1);
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const clearFilters = () => {
        setSearch("");
        // The view stays
        update(current => ({...DEFAULT_DRUG_LIST_PARAMS, view: current.view}));
    };

    // A clinic can't edit or delete a shared drug: no buttons at all (design M1.7 D9); the same in both views
    const rowActions = (drug: Drug) => !drug.isShared && <>
        <Tooltip title={t("common.edit")}>
            <PermissionIconButton permission={PERMISSIONS.drugs.update} size="small"
                                  onClick={() => openEdit(drug)} aria-label={t("common.edit")}>
                <EditIcon fontSize="small"/>
            </PermissionIconButton>
        </Tooltip>
        <Tooltip title={t("common.delete")}>
            <PermissionIconButton permission={PERMISSIONS.drugs.delete} size="small" color="error"
                                  onClick={() => void handleDelete(drug)} aria-label={t("common.delete")}>
                <DeleteIcon fontSize="small"/>
            </PermissionIconButton>
        </Tooltip>
    </>;

    const addButton = (
        <PermissionButton permission={PERMISSIONS.drugs.create} variant="contained" startIcon={<AddIcon/>} onClick={openCreate}>
            {t("drugs.add")}
        </PermissionButton>
    );
    // Only when nothing matches at all: an empty page of a non-empty list is a page past the end, being replaced
    const nothingMatches = isTree ? treeData !== undefined && treeData.categories.length === 0 : listData !== undefined && totalCount === 0;
    const emptyState = nothingMatches ? drugListEmptyState(params) : null;
    const failed = isTree ? tree.isError && tree.data === undefined : drugs.isError;
    const fetching = isTree ? tree.isFetching : drugs.isFetching;

    return (
        <>
            <PageHeader
                title={t("drugs.title")}
                subtitle={shownTotal !== undefined && t("drugs.subtitle", {count: shownTotal})}
                actions={addButton}
            />

            <Paper variant="outlined" sx={{overflow: "hidden"}}>
                <DrugListFilters
                    search={search}
                    onSearchChange={setSearch}
                    params={params}
                    categories={categories.data}
                    onChange={setFilters}
                    onViewChange={setView}
                />
                {/* Also while the typed search waits to be sent: the rows shown are not its results yet */}
                <Box sx={{height: 4}}>
                    {(fetching || search.trim() !== params.search.trim()) && <LinearProgress aria-label={t("common.loading")}/>}
                </Box>

                {failed ? (
                    <Alert
                        severity="error"
                        sx={{m: 2}}
                        action={<Button color="inherit" size="small" onClick={() => void (isTree ? tree.refetch() : drugs.refetch())}>
                            {t("common.retry")}
                        </Button>}
                    >
                        {t("common.loadFailed")}
                    </Alert>
                ) : emptyState === "empty" ? (
                    <EmptyState
                        icon={<MedicationIcon/>}
                        title={t("drugs.emptyTitle")}
                        description={t("drugs.emptyDescription")}
                        action={addButton}
                    />
                ) : emptyState === "noOwnDrugs" ? (
                    <EmptyState icon={<MedicationIcon/>} title={t("drugs.noOwnDrugs")} action={addButton}/>
                ) : emptyState === "noFilterResults" ? (
                    <EmptyState
                        compact
                        title={t("drugs.noFilterResults")}
                        action={<Button variant="outlined" onClick={clearFilters}>{t("drugs.clearFilters")}</Button>}
                    />
                ) : emptyState === "noResults" ? (
                    <EmptyState compact title={t("drugs.noResults")}/>
                ) : isTree ? (
                    <Box sx={{px: 2, pb: 2}}>
                        {/* The page's filters drive it: no search box or source toggle of its own; a click opens the
                            drug as a list row does (M1.7 review R1) */}
                        <DrugTree
                            filters={{search: params.search, source: params.source, categoryId: params.categoryId, subCategoryId: params.subCategoryId}}
                            rowMode="open"
                            rowActions={showActions ? rowActions : undefined}
                            onSelect={(drug) => {
                                if (canOpen(drug)) openEdit(drug);
                            }}
                            enabled={canList && !waitsForCategories}
                        />
                    </Box>
                ) : awaitingClamp ? null : (
                    <>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t("drugs.name")}</TableCell>
                                        {!phone && <TableCell sx={{width: "32%"}}>{t("drugs.category")}</TableCell>}
                                        {showActions && <TableCell align="right" sx={{width: 110}}>{t("drugs.actions")}</TableCell>}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.map(drug => {
                                        const opens = canOpen(drug);
                                        // «العيون › المياه الزرقاء» in the UI language, the category alone without a subcategory
                                        const path = categoryPath(drug.category, drug.subCategory, language, t);
                                        return (
                                            <TableRow
                                                key={drug.id}
                                                hover={opens}
                                                onClick={opens ? () => openEdit(drug) : undefined}
                                                // Keyboard path to the details too (a viewer and a shared row have no edit icon)
                                                tabIndex={opens ? 0 : undefined}
                                                onKeyDown={opens ? (e) => {
                                                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                                                        e.preventDefault();
                                                        openEdit(drug);
                                                    }
                                                } : undefined}
                                                sx={{cursor: opens ? "pointer" : undefined, "& td": {py: 1.25}, verticalAlign: "top"}}
                                            >
                                                <TableCell>
                                                    <Stack direction="row" sx={{gap: 1, alignItems: "flex-start"}}>
                                                        <Box sx={{flex: 1, minWidth: 0}}>
                                                            {/* Shared drugs have no dosing: DosingText renders nothing for them */}
                                                            <DrugText drug={drug} descriptionLines={2} showDosing/>
                                                            {/* On a phone the category goes under the name */}
                                                            {phone && (
                                                                <Typography variant="body2" color="text.secondary" sx={{overflowWrap: "anywhere"}}>
                                                                    {path}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                        {/* The clinic's own drug (design M1.7 D12); a shared drug has no chip (M1.7 review R2) */}
                                                        {!drug.isShared && (
                                                            <Chip size="small" variant="outlined" color="primary" label={t("drugs.chip.own")}
                                                                  sx={{flexShrink: 0, mt: 0.25}}/>
                                                        )}
                                                    </Stack>
                                                </TableCell>
                                                {!phone && <TableCell sx={{overflowWrap: "anywhere"}}>{path}</TableCell>}
                                                {showActions && <TableCell align="right" onClick={(e) => e.stopPropagation()} sx={{whiteSpace: "nowrap"}}>
                                                    {rowActions(drug)}
                                                </TableCell>}
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <ListPagination
                            count={totalCount}
                            page={Math.min(page, lastPage) - 1}
                            onPageChange={(p) => setPage(p + 1)}
                            rowsPerPage={pageSize}
                            onRowsPerPageChange={(size) => {
                                setPageSize(size);
                                setPage(1);
                            }}
                        />
                    </>
                )}
            </Paper>

            <DrugFormDialog
                open={dialog.open}
                drug={dialog.drug}
                readOnly={dialog.drug !== null && (dialog.drug.isShared || !canUpdate)}
                onClose={() => setDialog(d => ({...d, open: false}))}
                onSaved={onSaved}
            />
            {confirmDialog}
        </>
    );
};
