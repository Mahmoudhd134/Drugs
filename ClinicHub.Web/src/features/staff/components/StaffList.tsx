import {useEffect, useState} from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    IconButton,
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
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1Outlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import PersonRemoveIcon from "@mui/icons-material/PersonRemoveOutlined";
import GroupsIcon from "@mui/icons-material/GroupsOutlined";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {getErrorMessage, toApiError} from "../../../api/errors.ts";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {ListPagination} from "../../../components/common/ListPagination.tsx";
import {SearchField} from "../../../components/common/SearchField.tsx";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import type {RolesAdapter} from "../../roles/types.ts";
import {useRemoveStaff, useStaffList} from "../useStaff.ts";
import type {StaffAdapter, StaffMember} from "../types.ts";
import {StaffEditorDialog} from "./StaffEditorDialog.tsx";

type Props = {
    adapter: StaffAdapter;
    /** The clinic's roles, for the editor's role choice */
    rolesAdapter: RolesAdapter;
};

/**
 * A clinic's staff, active or not, by name: search (name or phone), paging; add by phone, edit, remove. Data comes
 * from the adapters only (design D9).
 */
export const StaffList = ({adapter, rolesAdapter}: Props) => {
    const {t} = useTranslation();
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search.trim());
    // The page goes with the search it was picked for: a new search, once sent, asks for its first page at once (not
    // first the old search's first page)
    const [paging, setPaging] = useState({search: "", page: 0});
    if (paging.search !== debouncedSearch) setPaging({search: debouncedSearch, page: 0});
    const page = paging.search === debouncedSearch ? paging.page : 0;
    const setPage = (next: number) => setPaging({search: debouncedSearch, page: next});
    const [pageSize, setPageSize] = useState(20);
    const [editor, setEditor] = useState<{ open: boolean; member: StaffMember | null }>({open: false, member: null});
    const staff = useStaffList(adapter, {search: debouncedSearch, page: page + 1, pageSize});
    const remove = useRemoveStaff(adapter);
    const {confirm, dialog: confirmDialog} = useConfirm();
    // One removal at a time (a double click would send it twice)
    const once = useSingleFlight();

    const items = staff.data?.items ?? [];
    const totalCount = staff.data?.totalCount ?? 0;
    const lastPage = Math.max(0, Math.ceil(totalCount / pageSize) - 1);
    // A page past the end (its last rows removed, here or elsewhere): the last page instead
    const pastTheEnd = staff.data !== undefined && !staff.isPlaceholderData && page > lastPage;
    useEffect(() => {
        if (pastTheEnd) setPaging({search: debouncedSearch, page: lastPage});
    }, [pastTheEnd, lastPage, debouncedSearch]);
    // No rows yet for what is shown (a page past the end, or the rows of the query before): loading, not "none found"
    const settling = items.length === 0 && (staff.isPlaceholderData || page > lastPage);

    const openAdd = () => setEditor({open: true, member: null});
    const openEdit = (member: StaffMember) => setEditor({open: true, member});

    const handleRemove = (member: StaffMember) => once(async () => {
        const confirmed = await confirm({
            title: t("staff.removeTitle", {name: member.fullName}),
            message: t("staff.removeMessage"),
            confirmText: t("staff.remove"),
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await remove.mutateAsync(member.id);
            toast.success(t("staff.removed", {name: member.fullName}));
        } catch (error) {
            const lastOwner = toApiError(error)?.code === "lastOwner";
            toast.error(lastOwner ? `${getErrorMessage(error)}\n${t("staff.lastOwnerHint")}` : getErrorMessage(error),
                {duration: lastOwner ? 8000 : undefined});
        }
    });

    const hasNoStaffAtAll = !staff.isPending && !settling && !debouncedSearch && totalCount === 0;
    const addButton = <Button variant="contained" startIcon={<PersonAddIcon/>} onClick={openAdd}>{t("staff.add")}</Button>;

    return (
        <Stack sx={{gap: 2}}>
            <Stack direction="row" sx={{alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap"}}>
                <Box sx={{minWidth: 0}}>
                    <Typography variant="h6" component="h2">{t("staff.title")}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {/* While searching: how many match */}
                        {staff.data ? t(debouncedSearch ? "staff.resultCount" : "staff.subtitle", {count: totalCount}) : " "}
                    </Typography>
                </Box>
                {addButton}
            </Stack>

            <Paper variant="outlined" sx={{overflow: "hidden"}}>
                <Box sx={{p: 2}}>
                    <SearchField
                        value={search}
                        onChange={setSearch}
                        placeholder={t("staff.searchPlaceholder")}
                    />
                </Box>
                {/* Also while the typed search waits to be sent: the rows shown are not its results yet */}
                <Box sx={{height: 4}}>
                    {(staff.isFetching || search.trim() !== debouncedSearch) && <LinearProgress aria-label={t("common.loading")}/>}
                </Box>

                {staff.isError && !staff.data ? (
                    <Alert
                        severity="error"
                        sx={{m: 2}}
                        action={<Button color="inherit" size="small" onClick={() => void staff.refetch()}>{t("common.retry")}</Button>}
                    >
                        {t("common.loadFailed")}
                    </Alert>
                ) : hasNoStaffAtAll ? (
                    <EmptyState icon={<GroupsIcon/>} title={t("staff.emptyTitle")} description={t("staff.emptyDescription")} action={addButton}/>
                ) : !staff.isPending && !settling && items.length === 0 ? (
                    <EmptyState compact title={t("staff.noResults")}/>
                ) : (
                    <>
                        <TableContainer>
                            {/* Narrower cell padding on phones, so the table fits without scrolling */}
                            <Table size="small" sx={{"& th, & td": {px: {xs: 1, sm: 2}}}}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t("staff.name")}</TableCell>
                                        <TableCell sx={{display: {xs: "none", sm: "table-cell"}}}>{t("staff.phone")}</TableCell>
                                        <TableCell>{t("staff.roles")}</TableCell>
                                        <TableCell sx={{display: {xs: "none", md: "table-cell"}}}>{t("staff.status")}</TableCell>
                                        <TableCell align="right" sx={{width: "1%", whiteSpace: "nowrap"}}>{t("staff.actions")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.map(member => (
                                        <TableRow key={member.id} sx={{"& td": {py: 1.25}}}>
                                            {/* A minimum width, so long role names wrap in their column rather than squeeze the name */}
                                            <TableCell sx={{minWidth: {xs: 120, sm: 160}}}>
                                                <Box component="span" dir="auto" sx={{fontWeight: 600, overflowWrap: "anywhere"}}>
                                                    {member.fullName}
                                                </Box>
                                                {/* On narrow screens the phone and the status sit under the name */}
                                                <Box sx={{display: {xs: "block", sm: "none"}, color: "text.secondary", typography: "body2"}}>
                                                    <span dir="ltr">{member.phone}</span>
                                                </Box>
                                                <Box sx={{display: {xs: "block", md: "none"}, mt: 0.5}}>
                                                    <StaffStatusChip active={member.isActive}/>
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{display: {xs: "none", sm: "table-cell"}, whiteSpace: "nowrap"}}>
                                                {/* Phones stay left to right in Arabic (else the "+" moves to the end) */}
                                                <span dir="ltr">{member.phone}</span>
                                            </TableCell>
                                            <TableCell sx={{minWidth: 96}}>
                                                <Stack direction="row" sx={{gap: 0.5, flexWrap: "wrap"}}>
                                                    {member.roles.map(role => (
                                                        <Chip
                                                            key={role.id}
                                                            size="small"
                                                            label={<span dir="auto">{role.name}</span>}
                                                            color={role.isOwner ? "primary" : "default"}
                                                            variant={role.isOwner ? "filled" : "outlined"}
                                                            // Long names wrap (a chip never widens the table past the screen)
                                                            sx={{
                                                                maxWidth: "100%",
                                                                height: "auto",
                                                                "& .MuiChip-label": {whiteSpace: "normal", overflowWrap: "anywhere", py: 0.25},
                                                            }}
                                                        />
                                                    ))}
                                                </Stack>
                                            </TableCell>
                                            <TableCell sx={{display: {xs: "none", md: "table-cell"}}}>
                                                <StaffStatusChip active={member.isActive}/>
                                            </TableCell>
                                            <TableCell align="right" sx={{whiteSpace: "nowrap"}}>
                                                <Tooltip title={t("staff.edit")}>
                                                    <IconButton onClick={() => openEdit(member)} aria-label={t("staff.editNamed", {name: member.fullName})}>
                                                        <EditIcon fontSize="small"/>
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title={t("staff.remove")}>
                                                    <IconButton
                                                        color="error"
                                                        onClick={() => void handleRemove(member)}
                                                        aria-label={t("staff.removeNamed", {name: member.fullName})}
                                                    >
                                                        <PersonRemoveIcon fontSize="small"/>
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <ListPagination
                            count={totalCount}
                            page={Math.min(page, lastPage)}
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

            <StaffEditorDialog
                open={editor.open}
                member={editor.member}
                adapter={adapter}
                rolesAdapter={rolesAdapter}
                onClose={() => setEditor(e => ({...e, open: false}))}
            />
            {confirmDialog}
        </Stack>
    );
};

const StaffStatusChip = ({active}: { active: boolean }) => {
    const {t} = useTranslation();
    return active
        ? <Chip size="small" variant="outlined" color="success" label={t("staff.active")}/>
        : <Chip size="small" variant="outlined" label={t("staff.inactive")}/>;
};
