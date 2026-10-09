import {useState} from "react";
import {
    Alert,
    Box,
    Button,
    IconButton,
    LinearProgress,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/EditOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import MedicationIcon from "@mui/icons-material/Medication";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {SearchField} from "../../../components/common/SearchField.tsx";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {getErrorMessage} from "../../../api/errors.ts";
import {fetchDrugGroupNames, useDeleteDrug, useDrugs} from "../api.ts";
import {DrugFormDialog} from "../components/DrugFormDialog.tsx";
import {DrugText} from "../components/DrugText.tsx";
import type {Drug} from "../types.ts";

const PAGE_SIZES = [10, 20, 50];

export const DrugsPage = () => {
    const {t} = useTranslation();
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search.trim());
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [dialog, setDialog] = useState<{ open: boolean; drug: Drug | null }>({open: false, drug: null});

    const drugs = useDrugs(debouncedSearch, page + 1, pageSize);
    const deleteDrug = useDeleteDrug();
    const {confirm, dialog: confirmDialog} = useConfirm();

    const items = drugs.data?.items ?? [];
    const totalCount = drugs.data?.totalCount ?? 0;

    const openCreate = () => setDialog({open: true, drug: null});
    const openEdit = (drug: Drug) => setDialog({open: true, drug});

    const handleDelete = async (drug: Drug) => {
        // Name the groups that will lose this drug; if the lookup fails, still allow deleting
        const groupNames = await fetchDrugGroupNames(drug.id).catch(() => [] as string[]);
        const confirmed = await confirm({
            title: t("drugs.deleteTitle"),
            message: [
                t("drugs.deleteMessage", {name: drug.name}),
                groupNames.length ? t("drugs.usedInGroups", {names: groupNames.join("، ")}) : null,
            ].filter(Boolean).join("\n"),
            destructive: true,
        });
        if (!confirmed) return;

        try {
            await deleteDrug.mutateAsync(drug.id);
            toast.success(t("drugs.deleted"));
            // Step back if the last row of the last page was deleted
            if (items.length === 1 && page > 0) setPage(p => p - 1);
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const hasNoDrugsAtAll = !drugs.isPending && !debouncedSearch && totalCount === 0;

    return (
        <>
            <PageHeader
                title={t("drugs.title")}
                subtitle={drugs.data && t("drugs.subtitle", {count: totalCount})}
                actions={<Button variant="contained" startIcon={<AddIcon/>} onClick={openCreate}>{t("drugs.add")}</Button>}
            />

            <Paper variant="outlined" sx={{overflow: "hidden"}}>
                <Box sx={{p: 2}}>
                    <SearchField
                        value={search}
                        onChange={(value) => {
                            setSearch(value);
                            setPage(0);
                        }}
                        placeholder={t("drugs.searchPlaceholder")}
                    />
                </Box>
                <Box sx={{height: 4}}>{drugs.isFetching && <LinearProgress/>}</Box>

                {drugs.isError ? (
                    <Alert
                        severity="error"
                        sx={{m: 2}}
                        action={<Button color="inherit" size="small" onClick={() => void drugs.refetch()}>{t("common.retry")}</Button>}
                    >
                        {t("common.loadFailed")}
                    </Alert>
                ) : hasNoDrugsAtAll ? (
                    <EmptyState
                        icon={<MedicationIcon/>}
                        title={t("drugs.emptyTitle")}
                        description={t("drugs.emptyDescription")}
                        action={<Button variant="contained" startIcon={<AddIcon/>} onClick={openCreate}>{t("drugs.add")}</Button>}
                    />
                ) : !drugs.isPending && items.length === 0 ? (
                    <EmptyState compact title={t("drugs.noResults")}/>
                ) : (
                    <>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t("drugs.name")}</TableCell>
                                        <TableCell align="right" sx={{width: 110}}>{t("drugs.actions")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.map(drug => (
                                        <TableRow
                                            key={drug.id}
                                            hover
                                            onClick={() => openEdit(drug)}
                                            sx={{cursor: "pointer", "& td": {py: 1.25}}}
                                        >
                                            <TableCell>
                                                <DrugText drug={drug} descriptionLines={2} showDosing/>
                                            </TableCell>
                                            <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                                <Tooltip title={t("common.edit")}>
                                                    <IconButton size="small" onClick={() => openEdit(drug)} aria-label={t("common.edit")}>
                                                        <EditIcon fontSize="small"/>
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title={t("common.delete")}>
                                                    <IconButton size="small" color="error" onClick={() => void handleDelete(drug)} aria-label={t("common.delete")}>
                                                        <DeleteIcon fontSize="small"/>
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <TablePagination
                            component="div"
                            count={totalCount}
                            page={page}
                            onPageChange={(_, p) => setPage(p)}
                            rowsPerPage={pageSize}
                            rowsPerPageOptions={PAGE_SIZES}
                            onRowsPerPageChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(0);
                            }}
                            labelRowsPerPage={t("drugs.rowsPerPage")}
                            labelDisplayedRows={({from, to, count}) => t("drugs.displayedRows", {from, to, count})}
                        />
                    </>
                )}
            </Paper>

            <DrugFormDialog
                open={dialog.open}
                drug={dialog.drug}
                onClose={() => setDialog(d => ({...d, open: false}))}
            />
            {confirmDialog}
        </>
    );
};
