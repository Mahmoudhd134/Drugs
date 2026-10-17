import {useState} from "react";
import {Link as RouterLink, useNavigate} from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    Card,
    CardActionArea,
    CardActions,
    CardContent,
    Chip,
    IconButton,
    LinearProgress,
    Pagination,
    Paper,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/EditOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import CategoryIcon from "@mui/icons-material/Category";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {SearchField} from "../../../components/common/SearchField.tsx";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {getErrorMessage} from "../../../api/errors.ts";
import {useDeleteDrugGroup, useDrugGroups} from "../api.ts";
import type {DrugGroup} from "../types.ts";
import {PERMISSIONS} from "../../access/permissions.ts";
import {usePermissions} from "../../access/usePermissions.ts";
import {Can} from "../../access/components/Can.tsx";
import {PermissionIconButton} from "../../access/components/PermissionControls.tsx";

const PAGE_SIZE = 12;
const PREVIEW_DRUGS = 4;

export const DrugGroupsPage = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search.trim());
    const [page, setPage] = useState(1);

    const {can} = usePermissions();
    const canOpen = can(PERMISSIONS.groups.details);
    const groups = useDrugGroups(debouncedSearch, page, PAGE_SIZE, {enabled: can(PERMISSIONS.groups.list)});
    const deleteGroup = useDeleteDrugGroup();
    const {confirm, dialog: confirmDialog} = useConfirm();

    const items = groups.data?.items ?? [];
    const totalCount = groups.data?.totalCount ?? 0;
    const pageCount = Math.ceil(totalCount / PAGE_SIZE);

    const handleDelete = async (group: DrugGroup) => {
        const confirmed = await confirm({
            title: t("groups.deleteTitle"),
            message: t("groups.deleteMessage", {name: group.name}),
            destructive: true,
        });
        if (!confirmed) return;

        try {
            await deleteGroup.mutateAsync(group.id);
            toast.success(t("groups.deleted"));
            if (items.length === 1 && page > 1) setPage(p => p - 1);
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    // A link, so it is gated with <Can> (the Permission* controls take no component prop)
    const newGroupButton = (
        <Can permission={PERMISSIONS.groups.create}>
            <Button variant="contained" startIcon={<AddIcon/>} component={RouterLink} to="/groups/new">
                {t("groups.new")}
            </Button>
        </Can>
    );

    return (
        <>
            <PageHeader
                title={t("groups.title")}
                subtitle={groups.data && t("groups.subtitle", {count: totalCount})}
                actions={newGroupButton}
            />

            <Paper variant="outlined" sx={{p: 2, mb: 2}}>
                <SearchField
                    value={search}
                    onChange={(value) => {
                        setSearch(value);
                        setPage(1);
                    }}
                    placeholder={t("groups.searchPlaceholder")}
                />
            </Paper>
            <Box sx={{height: 4, mb: 1}}>{groups.isFetching && <LinearProgress/>}</Box>

            {groups.isError ? (
                <Alert
                    severity="error"
                    action={<Button color="inherit" size="small" onClick={() => void groups.refetch()}>{t("common.retry")}</Button>}
                >
                    {t("common.loadFailed")}
                </Alert>
            ) : !groups.isPending && totalCount === 0 ? (
                <Paper variant="outlined">
                    {debouncedSearch
                        ? <EmptyState compact title={t("groups.noResults")}/>
                        : <EmptyState
                            icon={<CategoryIcon/>}
                            title={t("groups.emptyTitle")}
                            description={t("groups.emptyDescription")}
                            action={newGroupButton}
                        />}
                </Paper>
            ) : (
                <>
                    <Box
                        sx={{
                            display: "grid",
                            gap: 2,
                            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                        }}
                    >
                        {items.map(group => (
                            <Card key={group.id} variant="outlined" sx={{display: "flex", flexDirection: "column"}}>
                                <CardActionArea
                                    onClick={() => navigate(`/groups/${group.id}`)}
                                    disabled={!canOpen}
                                    sx={{flexGrow: 1, alignItems: "flex-start", display: "flex"}}
                                >
                                    <CardContent sx={{width: "100%"}}>
                                        {/* Names wrap inside the card (even an unbroken 256-character one), never cut with "…" */}
                                        <Stack direction="row" sx={{gap: 1, alignItems: "flex-start", mb: 1.5}}>
                                            <Typography variant="h6" sx={{fontSize: 17, flex: 1, minWidth: 0, overflowWrap: "anywhere"}}>
                                                {group.name}
                                            </Typography>
                                            <Chip size="small" color="primary" variant="outlined"
                                                  label={t("groups.drugCount", {count: group.items.length})}/>
                                        </Stack>
                                        <Box component="ol" sx={{m: 0, paddingInlineStart: 2.5, color: "text.secondary"}}>
                                            {group.items.slice(0, PREVIEW_DRUGS).map(({drug}, index) => (
                                                <Typography component="li" variant="body2" key={index} sx={{overflowWrap: "anywhere"}}>
                                                    {drug.name}
                                                </Typography>
                                            ))}
                                        </Box>
                                        {group.items.length > PREVIEW_DRUGS && (
                                            <Typography variant="caption" color="text.secondary">
                                                {t("groups.more", {count: group.items.length - PREVIEW_DRUGS})}
                                            </Typography>
                                        )}
                                    </CardContent>
                                </CardActionArea>
                                <Can anyOf={[PERMISSIONS.groups.update, PERMISSIONS.groups.delete]}>
                                    <CardActions sx={{justifyContent: "flex-end", borderTop: 1, borderColor: "divider"}}>
                                        <Can permission={PERMISSIONS.groups.update}>
                                            <Tooltip title={t("common.edit")}>
                                                <IconButton size="small" component={RouterLink} to={`/groups/${group.id}`}
                                                            aria-label={t("common.edit")}>
                                                    <EditIcon fontSize="small"/>
                                                </IconButton>
                                            </Tooltip>
                                        </Can>
                                        <Tooltip title={t("common.delete")}>
                                            <PermissionIconButton permission={PERMISSIONS.groups.delete} size="small" color="error"
                                                                  onClick={() => void handleDelete(group)}
                                                                  aria-label={t("common.delete")}>
                                                <DeleteIcon fontSize="small"/>
                                            </PermissionIconButton>
                                        </Tooltip>
                                    </CardActions>
                                </Can>
                            </Card>
                        ))}
                    </Box>
                    {pageCount > 1 && (
                        <Stack sx={{alignItems: "center", mt: 3}}>
                            <Pagination
                                count={pageCount} page={page} onChange={(_, p) => setPage(p)} color="primary"
                                getItemAriaLabel={(type, itemPage, selected) => {
                                    if (type === "page")
                                        return t(selected ? "common.pagination.page" : "common.pagination.goToPage", {page: itemPage});
                                    if (type === "start-ellipsis" || type === "end-ellipsis")
                                        return t("common.pagination.morePages");
                                    return t(`common.pagination.${type}`);
                                }}
                            />
                        </Stack>
                    )}
                </>
            )}
            {confirmDialog}
        </>
    );
};
