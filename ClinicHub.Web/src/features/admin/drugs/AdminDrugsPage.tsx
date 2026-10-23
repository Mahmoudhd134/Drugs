import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useSearchParams} from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    IconButton,
    LinearProgress,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/EditOutlined";
import BlockIcon from "@mui/icons-material/Block";
import RestoreIcon from "@mui/icons-material/SettingsBackupRestore";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {SearchField} from "../../../components/common/SearchField.tsx";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {ListPagination} from "../../../components/common/ListPagination.tsx";
import {PAGE_SIZES} from "../../../components/common/pageSizes.ts";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {getErrorMessage} from "../../../api/errors.ts";
import {categoryName, categoryPath, sortCategories} from "../../drugs/categories.ts";
import {WithdrawnChip} from "../../drugs/components/WithdrawnChip.tsx";
import type {SubCategoryFilter} from "../../drugs/types.ts";
import {useAdminCategories} from "../categories/api.ts";
import type {AdminCategory} from "../categories/types.ts";
import {type AdminDrugFilters, useAdminDrugs, useSetSharedDrugWithdrawn} from "./api.ts";
import {SharedDrugDialog} from "./SharedDrugDialog.tsx";
import type {AdminDrug, SharedDrugStatus} from "./types.ts";

const STATUSES: SharedDrugStatus[] = ["active", "withdrawn", "all"];
/** The "every category / subcategory" choice of a filter select (MUI needs a string value) */
const ALL = "";
const NONE = "none";

const positiveInt = (value: string | null) => (value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null);

/**
 * The category filters of the URL, kept only when they name a category and one of its subcategories (or «بدون تصنيف
 * فرعي») once the categories are known; a deleted one falls back to "all" (CAT-217). While they load, taken as given.
 */
const validFilters = (categoryParam: string | null, subCategoryParam: string | null, categories: AdminCategory[] | undefined) => {
    const categoryId = positiveInt(categoryParam);
    const category = categoryId === null ? undefined : categories?.find(c => c.id === categoryId);
    if (categoryId === null || (categories && !category)) return {categoryId: null, subCategoryId: null};
    let subCategoryId: SubCategoryFilter | null = subCategoryParam === NONE ? NONE : positiveInt(subCategoryParam);
    if (typeof subCategoryId === "number" && category && !category.subCategories.some(s => s.id === subCategoryId))
        subCategoryId = null;
    return {categoryId, subCategoryId};
};

/**
 * `/admin/drugs` (design M1.7 D6, D9): the shared catalog. Search, status «مفعّل» / «معطّل» / «الكل» (default
 * «مفعّل»), category and subcategory filters and paging, all in the URL; add/edit (the drug dialog without dosing),
 * «تعطيل الدواء» with a confirm, «تفعيل الدواء» without.
 */
export const AdminDrugsPage = () => {
    const {t, i18n} = useTranslation();
    const language = i18n.language;
    const [params, setParams] = useSearchParams();
    const statusParam = params.get("status");
    const status = STATUSES.find(s => s === statusParam) ?? "active";
    const pageSizeParam = Number(params.get("pageSize"));
    const pageSize = PAGE_SIZES.includes(pageSizeParam) ? pageSizeParam : 20;
    // 0-based; a huge ?page (an edited link) is cut to what the API accepts, then to the last page below
    const page = Math.min(Math.max(0, Math.floor(Number(params.get("page")) || 1) - 1), 999_999);
    const urlSearch = params.get("search") ?? "";

    const categories = useAdminCategories();
    const sortedCategories = useMemo(() => sortCategories(categories.data ?? [], language), [categories.data, language]);
    const {categoryId, subCategoryId} = validFilters(params.get("categoryId"), params.get("subCategoryId"), categories.data);
    const selectedCategory = sortedCategories.find(c => c.id === categoryId);
    const subCategories = useMemo(
        () => (selectedCategory ? sortCategories(selectedCategory.subCategories, language) : []),
        [selectedCategory, language]);

    const [search, setSearch] = useState(urlSearch);
    const debouncedSearch = useDebouncedValue(search.trim());
    const [dialog, setDialog] = useState<{ open: boolean; drug: AdminDrug | null }>({open: false, drug: null});
    const setWithdrawn = useSetSharedDrugWithdrawn();
    const {confirm, dialog: confirmDialog} = useConfirm();
    // One withdraw or restore at a time: a double click sends one request (and opens one confirm)
    const once = useSingleFlight();

    /** Changes the URL's filters in place (no new history entry); `null` removes one. */
    const update = useCallback((changes: Record<string, string | null>) => setParams(prev => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }
        return next;
    }, {replace: true}), [setParams]);

    // The search in the URL as this page last wrote it, or last took it from the URL
    const lastSearch = useRef(urlSearch);
    // The typed search reaches the URL (and the query) once typing pauses, back on the first page
    useEffect(() => {
        if (debouncedSearch === lastSearch.current) return;
        lastSearch.current = debouncedSearch;
        update({search: debouncedSearch || null, page: null});
    }, [debouncedSearch, update]);
    // A search changed from outside (the sidebar, Back, a link) wins over the typed one
    useEffect(() => {
        if (urlSearch === lastSearch.current) return;
        lastSearch.current = urlSearch;
        setSearch(urlSearch);
    }, [urlSearch]);

    // Filters the URL holds but that are no longer valid (a deleted category or subcategory) are dropped from it
    const urlCategory = params.get("categoryId");
    const urlSubCategory = params.get("subCategoryId");
    const staleFilters = categories.data !== undefined
        && ((urlCategory ?? "") !== (categoryId === null ? "" : String(categoryId))
            || (urlSubCategory ?? "") !== (subCategoryId === null ? "" : String(subCategoryId)));
    useEffect(() => {
        if (staleFilters) update({
            categoryId: categoryId === null ? null : String(categoryId),
            subCategoryId: subCategoryId === null ? null : String(subCategoryId),
        });
    }, [staleFilters, categoryId, subCategoryId, update]);

    const filters: AdminDrugFilters = {status, categoryId, subCategoryId};
    const drugs = useAdminDrugs(urlSearch, filters, page + 1, pageSize);
    const items = drugs.data?.items ?? [];
    const totalCount = drugs.data?.totalCount ?? 0;
    const lastPage = Math.max(0, Math.ceil(totalCount / pageSize) - 1);

    // A page past the end (an old link, or its last rows disabled or filtered away): the last page instead
    const pastTheEnd = drugs.data !== undefined && !drugs.isPlaceholderData && page > lastPage;
    useEffect(() => {
        if (pastTheEnd) update({page: lastPage > 0 ? String(lastPage + 1) : null});
    }, [pastTheEnd, lastPage, update]);

    const openCreate = () => setDialog({open: true, drug: null});
    const openEdit = (drug: AdminDrug) => setDialog({open: true, drug});

    const toggleWithdrawn = (drug: AdminDrug) => once(async () => {
        const withdraw = !drug.withdrawn;
        if (withdraw && !await confirm({
            title: t("adminDrugs.withdrawTitle", {name: drug.name}),
            message: t("adminDrugs.withdrawMessage"),
            confirmText: t("adminDrugs.withdraw"),
            destructive: true,
        })) return;
        try {
            await setWithdrawn.mutateAsync({id: drug.id, withdrawn: withdraw});
            toast.success(withdraw ? t("adminDrugs.withdrawnToast") : t("adminDrugs.restoredToast"));
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    });

    const addButton = (
        <Button variant="contained" startIcon={<AddIcon/>} onClick={openCreate}>{t("adminDrugs.add")}</Button>
    );
    const filterSelectSx = {minWidth: {sm: 180}, maxWidth: {sm: 260}};
    const menuProps = {MenuProps: {slotProps: {paper: {sx: {maxHeight: 360}}}}};

    return (
        <>
            <PageHeader
                title={t("adminDrugs.title")}
                subtitle={drugs.data && t("adminDrugs.subtitle", {count: totalCount})}
                actions={addButton}
            />

            <Paper variant="outlined" sx={{overflow: "hidden"}}>
                {/* One row only when the search keeps room for its whole placeholder next to the three filters (with the
                    sidebar shown, a row below 1200 px squeezed it to "Search the sh…"); else the filters go under it */}
                <Stack direction={{xs: "column", lg: "row"}} sx={{p: 2, gap: 1.5}}>
                    <Box sx={{flex: 1, minWidth: {lg: 280}}}>
                        <SearchField value={search} onChange={setSearch} placeholder={t("adminDrugs.searchPlaceholder")}/>
                    </Box>
                    <Stack direction={{xs: "column", sm: "row"}} sx={{gap: 1.5}}>
                        <TextField
                            select
                            size="small"
                            label={t("adminDrugs.status.label")}
                            value={status}
                            onChange={(e) => update({status: e.target.value === "active" ? null : e.target.value, page: null})}
                            sx={{minWidth: {sm: 140}}}
                        >
                            {STATUSES.map(s => <MenuItem key={s} value={s}>{t(`adminDrugs.status.${s}`)}</MenuItem>)}
                        </TextField>
                        <TextField
                            select
                            size="small"
                            label={t("drugs.category")}
                            value={selectedCategory ? String(selectedCategory.id) : ALL}
                            onChange={(e) => update({categoryId: e.target.value || null, subCategoryId: null, page: null})}
                            sx={filterSelectSx}
                            slotProps={{inputLabel: {shrink: true}, select: {displayEmpty: true, ...menuProps}}}
                        >
                            <MenuItem value={ALL}>{t("drugs.allCategories")}</MenuItem>
                            {sortedCategories.map(c => (
                                <MenuItem key={c.id} value={String(c.id)} sx={{whiteSpace: "normal", overflowWrap: "anywhere"}}>
                                    {categoryName(c, language)}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            size="small"
                            label={t("drugs.subCategory")}
                            value={selectedCategory && subCategoryId !== null ? String(subCategoryId) : ALL}
                            onChange={(e) => update({subCategoryId: e.target.value || null, page: null})}
                            disabled={!selectedCategory}
                            sx={filterSelectSx}
                            slotProps={{inputLabel: {shrink: true}, select: {displayEmpty: true, ...menuProps}}}
                        >
                            <MenuItem value={ALL}>{t("drugs.allSubCategories")}</MenuItem>
                            <MenuItem value={NONE}>{t("drugs.noSubCategory")}</MenuItem>
                            {subCategories.map(s => (
                                <MenuItem key={s.id} value={String(s.id)} sx={{whiteSpace: "normal", overflowWrap: "anywhere"}}>
                                    {categoryName(s, language)}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Stack>
                </Stack>
                {/* Also while the typed search waits to be sent: the rows shown are not its results yet */}
                <Box sx={{height: 4}}>
                    {(drugs.isFetching || search.trim() !== urlSearch) && <LinearProgress aria-label={t("common.loading")}/>}
                </Box>

                {drugs.isError ? (
                    <Alert
                        severity="error"
                        sx={{m: 2}}
                        action={<Button color="inherit" size="small" onClick={() => void drugs.refetch()}>{t("common.retry")}</Button>}
                    >
                        {t("common.loadFailed")}
                    </Alert>
                ) : !drugs.isPending && items.length === 0 ? (
                    <EmptyState compact title={status === "withdrawn" ? t("adminDrugs.noWithdrawn") : t("drugs.noResults")}/>
                ) : (
                    <>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t("drugs.name")}</TableCell>
                                        <TableCell sx={{display: {xs: "none", md: "table-cell"}}}>{t("drugs.activeIngredients")}</TableCell>
                                        <TableCell sx={{display: {xs: "none", sm: "table-cell"}}}>{t("drugs.category")}</TableCell>
                                        <TableCell align="right" sx={{width: 96}}>{t("drugs.actions")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.map(drug => {
                                        const path = categoryPath(drug.category, drug.subCategory, language, t);
                                        return (
                                            <TableRow
                                                key={drug.id}
                                                hover
                                                onClick={() => openEdit(drug)}
                                                sx={{cursor: "pointer", "& td": {py: 1.25}, verticalAlign: "top"}}
                                            >
                                                <TableCell>
                                                    <Typography sx={{fontWeight: 600, overflowWrap: "anywhere"}}><bdi>{drug.name}</bdi></Typography>
                                                    {/* On a phone the ingredients and the category go under the name */}
                                                    {drug.activeIngredients && (
                                                        <Typography variant="body2" color="text.secondary" dir="auto"
                                                                    sx={{display: {md: "none"}, overflowWrap: "anywhere"}}>
                                                            {drug.activeIngredients}
                                                        </Typography>
                                                    )}
                                                    <Typography variant="body2" color="text.secondary"
                                                                sx={{display: {sm: "none"}, overflowWrap: "anywhere"}}>
                                                        {path}
                                                    </Typography>
                                                    {drug.withdrawn && (
                                                        <Box sx={{mt: 0.5}} onClick={(e) => e.stopPropagation()}><WithdrawnChip/></Box>
                                                    )}
                                                </TableCell>
                                                <TableCell sx={{display: {xs: "none", md: "table-cell"}, overflowWrap: "anywhere"}}>
                                                    <Box component="span" dir="auto">{drug.activeIngredients}</Box>
                                                </TableCell>
                                                <TableCell sx={{display: {xs: "none", sm: "table-cell"}, overflowWrap: "anywhere"}}>{path}</TableCell>
                                                <TableCell align="right" onClick={(e) => e.stopPropagation()} sx={{whiteSpace: "nowrap"}}>
                                                    <Tooltip title={t("adminDrugs.edit")}>
                                                        <IconButton size="small" onClick={() => openEdit(drug)} aria-label={t("adminDrugs.editNamed", {name: drug.name})}>
                                                            <EditIcon fontSize="small"/>
                                                        </IconButton>
                                                    </Tooltip>
                                                    {drug.withdrawn ? (
                                                        <Tooltip title={t("adminDrugs.restore")}>
                                                            <IconButton size="small" color="success" onClick={() => void toggleWithdrawn(drug)}
                                                                        aria-label={t("adminDrugs.restoreNamed", {name: drug.name})}>
                                                                <RestoreIcon fontSize="small"/>
                                                            </IconButton>
                                                        </Tooltip>
                                                    ) : (
                                                        <Tooltip title={t("adminDrugs.withdraw")}>
                                                            <IconButton size="small" color="error" onClick={() => void toggleWithdrawn(drug)}
                                                                        aria-label={t("adminDrugs.withdrawNamed", {name: drug.name})}>
                                                                <BlockIcon fontSize="small"/>
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <ListPagination
                            count={totalCount}
                            page={Math.min(page, lastPage)}
                            onPageChange={(p) => update({page: p > 0 ? String(p + 1) : null})}
                            rowsPerPage={pageSize}
                            onRowsPerPageChange={(size) => update({pageSize: String(size), page: null})}
                        />
                    </>
                )}
            </Paper>

            <SharedDrugDialog open={dialog.open} drug={dialog.drug} onClose={() => setDialog(d => ({...d, open: false}))}/>
            {confirmDialog}
        </>
    );
};
