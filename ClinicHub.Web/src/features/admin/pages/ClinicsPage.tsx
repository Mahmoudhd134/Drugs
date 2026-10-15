import {useCallback, useEffect, useRef, useState} from "react";
import {Link as RouterLink, useNavigate, useSearchParams} from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    LinearProgress,
    Link,
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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {SearchField} from "../../../components/common/SearchField.tsx";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {ListPagination} from "../../../components/common/ListPagination.tsx";
import {PAGE_SIZES} from "../../../components/common/pageSizes.ts";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {useFormatDate} from "../../../hooks/useFormatDate.ts";
import {type ClinicStatusFilter, useAdminClinics} from "../api.ts";
import {ClinicStatusChip} from "../components/ClinicStatusChip.tsx";
import type {ClinicSummary} from "../types.ts";
import type {ClinicsListState} from "../listState.ts";

const STATUS_FILTERS: ClinicStatusFilter[] = ["", "active", "suspended"];

/**
 * The clinics (no template, no deleted ones): search, status filter, paging, all kept in the URL so coming back from
 * a clinic shows the same page.
 */
export const ClinicsPage = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const formatDate = useFormatDate();
    const [params, setParams] = useSearchParams();
    const statusParam = params.get("status") ?? "";
    const status = STATUS_FILTERS.find(s => s === statusParam) ?? "";
    const pageSizeParam = Number(params.get("pageSize"));
    const pageSize = PAGE_SIZES.includes(pageSizeParam) ? pageSizeParam : 20;
    // 0-based; a huge ?page (an edited link) is cut to what the API accepts, then to the last page below
    const page = Math.min(Math.max(0, Math.floor(Number(params.get("page")) || 1) - 1), 999_999);
    const urlSearch = params.get("search") ?? "";

    const [search, setSearch] = useState(urlSearch);
    const debouncedSearch = useDebouncedValue(search.trim());

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
    // A search changed from outside (the sidebar's "Clinics" or the logo open /admin, Back, a link) wins over the typed one
    useEffect(() => {
        if (urlSearch === lastSearch.current) return;
        lastSearch.current = urlSearch;
        setSearch(urlSearch);
    }, [urlSearch]);

    const clinics = useAdminClinics(urlSearch, status, page + 1, pageSize);
    const items = clinics.data?.items ?? [];
    const totalCount = clinics.data?.totalCount ?? 0;
    const lastPage = Math.max(0, Math.ceil(totalCount / pageSize) - 1);

    // A page past the end (an old link, or its last clinics deleted or filtered away): the last page instead
    const pastTheEnd = clinics.data !== undefined && !clinics.isPlaceholderData && page > lastPage;
    useEffect(() => {
        if (pastTheEnd) update({page: lastPage > 0 ? String(lastPage + 1) : null});
    }, [pastTheEnd, lastPage, update]);

    const linkTo = (clinic: ClinicSummary) => `/admin/clinics/${clinic.id}`;
    const linkState: ClinicsListState = {listSearch: params.toString()};

    const newClinicButton = (
        <Button component={RouterLink} to="/admin/clinics/new" variant="contained" startIcon={<AddIcon/>}>
            {t("admin.clinics.add")}
        </Button>
    );
    const hasNoClinicsAtAll = !clinics.isPending && !urlSearch && !status && totalCount === 0;

    return (
        <>
            <PageHeader
                title={t("admin.clinics.title")}
                subtitle={clinics.data && t("admin.clinics.subtitle", {count: totalCount})}
                actions={newClinicButton}
            />

            <Paper variant="outlined" sx={{overflow: "hidden"}}>
                <Stack direction={{xs: "column", sm: "row"}} sx={{p: 2, gap: 1.5}}>
                    <SearchField
                        value={search}
                        onChange={setSearch}
                        placeholder={t("admin.clinics.searchPlaceholder")}
                    />
                    <TextField
                        select
                        size="small"
                        label={t("admin.clinics.statusFilter")}
                        value={status || "all"}
                        onChange={(e) => update({status: e.target.value === "all" ? null : e.target.value, page: null})}
                        sx={{minWidth: {sm: 180}}}
                    >
                        {STATUS_FILTERS.map(s => (
                            <MenuItem key={s || "all"} value={s || "all"}>
                                {s ? t(`admin.status.${s}`) : t("admin.clinics.allStatuses")}
                            </MenuItem>
                        ))}
                    </TextField>
                </Stack>
                {/* Also while the typed search waits to be sent: the rows shown are not its results yet */}
                <Box sx={{height: 4}}>
                    {(clinics.isFetching || search.trim() !== urlSearch) && <LinearProgress aria-label={t("common.loading")}/>}
                </Box>

                {clinics.isError ? (
                    <Alert
                        severity="error"
                        sx={{m: 2}}
                        action={<Button color="inherit" size="small" onClick={() => void clinics.refetch()}>{t("common.retry")}</Button>}
                    >
                        {t("common.loadFailed")}
                    </Alert>
                ) : hasNoClinicsAtAll ? (
                    <EmptyState
                        icon={<LocalHospitalIcon/>}
                        title={t("admin.clinics.emptyTitle")}
                        description={t("admin.clinics.emptyDescription")}
                        action={newClinicButton}
                    />
                ) : !clinics.isPending && items.length === 0 ? (
                    <EmptyState compact title={t("admin.clinics.noResults")}/>
                ) : (
                    <>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t("admin.clinics.name")}</TableCell>
                                        <TableCell>{t("admin.clinics.status")}</TableCell>
                                        <TableCell align="right">{t("admin.clinics.staff")}</TableCell>
                                        <TableCell sx={{display: {xs: "none", sm: "table-cell"}}}>{t("admin.clinics.created")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.map(clinic => (
                                        <TableRow
                                            key={clinic.id}
                                            hover
                                            // The whole row opens the clinic for the mouse; the name is the link
                                            // (keyboard, screen readers, open in a new tab)
                                            onClick={(e) => {
                                                if (!(e.target as HTMLElement).closest("a")) navigate(linkTo(clinic), {state: linkState});
                                            }}
                                            sx={{cursor: "pointer", "& td": {py: 1.25}}}
                                        >
                                            <TableCell sx={{fontWeight: 600}}>
                                                <Link
                                                    component={RouterLink}
                                                    to={linkTo(clinic)}
                                                    state={linkState}
                                                    color="inherit"
                                                    underline="hover"
                                                    dir="auto"
                                                    // A long name: 2 lines, all of it in the tooltip
                                                    title={clinic.name}
                                                    sx={{
                                                        overflowWrap: "anywhere",
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: 2,
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                        borderRadius: 0.5,
                                                        "&:focus-visible": {outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2},
                                                    }}
                                                >
                                                    {clinic.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell><ClinicStatusChip status={clinic.status}/></TableCell>
                                            <TableCell align="right">{clinic.staffCount}</TableCell>
                                            <TableCell sx={{display: {xs: "none", sm: "table-cell"}, whiteSpace: "nowrap"}}>
                                                {formatDate(clinic.createdAt)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
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
        </>
    );
};
