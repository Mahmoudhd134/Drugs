import {useState} from "react";
import {
    Alert,
    Box,
    Button,
    LinearProgress,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
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
import {ListPagination} from "../../../components/common/ListPagination.tsx";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {getErrorMessage} from "../../../api/errors.ts";
import {fetchDrugGroupNames, useDeleteDrug, useDrugs} from "../api.ts";
import {DrugFormDialog} from "../components/DrugFormDialog.tsx";
import {DrugText} from "../components/DrugText.tsx";
import type {Drug} from "../types.ts";
import {PERMISSIONS} from "../../access/permissions.ts";
import {usePermissions} from "../../access/usePermissions.ts";
import {PermissionButton, PermissionIconButton} from "../../access/components/PermissionControls.tsx";

export const DrugsPage = () => {
    const {t} = useTranslation();
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search.trim());
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [dialog, setDialog] = useState<{ open: boolean; drug: Drug | null }>({open: false, drug: null});
    const {can, canAny} = usePermissions();
    const showActions = canAny(PERMISSIONS.drugs.update, PERMISSIONS.drugs.delete);
    const canUpdate = can(PERMISSIONS.drugs.update);
    // Without edit permission a row opens read-only details
    const canOpen = canUpdate || can(PERMISSIONS.drugs.details);

    const drugs = useDrugs(debouncedSearch, page + 1, pageSize, {enabled: can(PERMISSIONS.drugs.list)});
    const deleteDrug = useDeleteDrug();
    const {confirm, dialog: confirmDialog} = useConfirm();

    const items = drugs.data?.items ?? [];
    const totalCount = drugs.data?.totalCount ?? 0;

    const openCreate = () => setDialog({open: true, drug: null});
    const openEdit = (drug: Drug) => setDialog({open: true, drug});

    const handleDelete = async (drug: Drug) => {
        // Name the groups that will lose this drug (needs drug details); if the lookup fails, still allow deleting
        const groupNames = can(PERMISSIONS.drugs.details)
            ? await fetchDrugGroupNames(drug.id).catch(() => [] as string[])
            : [];
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
                actions={
                    <PermissionButton permission={PERMISSIONS.drugs.create} variant="contained" startIcon={<AddIcon/>} onClick={openCreate}>
                        {t("drugs.add")}
                    </PermissionButton>
                }
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
                <Box sx={{height: 4}}>{drugs.isFetching && <LinearProgress aria-label={t("common.loading")}/>}</Box>

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
                        action={
                            <PermissionButton permission={PERMISSIONS.drugs.create} variant="contained" startIcon={<AddIcon/>} onClick={openCreate}>
                                {t("drugs.add")}
                            </PermissionButton>
                        }
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
                                        {showActions && <TableCell align="right" sx={{width: 110}}>{t("drugs.actions")}</TableCell>}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.map(drug => (
                                        <TableRow
                                            key={drug.id}
                                            hover={canOpen}
                                            onClick={canOpen ? () => openEdit(drug) : undefined}
                                            // Keyboard path to the details too (a viewer has no edit icon)
                                            tabIndex={canOpen ? 0 : undefined}
                                            onKeyDown={canOpen ? (e) => {
                                                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                                                    e.preventDefault();
                                                    openEdit(drug);
                                                }
                                            } : undefined}
                                            sx={{cursor: canOpen ? "pointer" : undefined, "& td": {py: 1.25}}}
                                        >
                                            <TableCell>
                                                <DrugText drug={drug} descriptionLines={2} showDosing/>
                                            </TableCell>
                                            {showActions && <TableCell align="right" onClick={(e) => e.stopPropagation()}>
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
                                            </TableCell>}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <ListPagination
                            count={totalCount}
                            page={page}
                            onPageChange={setPage}
                            rowsPerPage={pageSize}
                            onRowsPerPageChange={(size) => {
                                setPageSize(size);
                                setPage(0);
                            }}
                        />
                    </>
                )}
            </Paper>

            <DrugFormDialog
                open={dialog.open}
                drug={dialog.drug}
                readOnly={dialog.drug !== null && !canUpdate}
                onClose={() => setDialog(d => ({...d, open: false}))}
            />
            {confirmDialog}
        </>
    );
};
