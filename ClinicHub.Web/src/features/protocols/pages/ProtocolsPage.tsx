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
import {useDeleteProtocol, useProtocols} from "../api.ts";
import type {Protocol} from "../types.ts";
import {PERMISSIONS} from "../../access/permissions.ts";
import {usePermissions} from "../../access/usePermissions.ts";
import {Can} from "../../access/components/Can.tsx";
import {PermissionIconButton} from "../../access/components/PermissionControls.tsx";
import {WithdrawnChip} from "../../drugs/components/WithdrawnChip.tsx";

const PAGE_SIZE = 12;
const PREVIEW_DRUGS = 4;

/** Lines whose drug the admin disabled (they still count in «الأدوية: N»). */
const withdrawnCount = (protocol: Protocol) => protocol.items.filter(i => i.drug.withdrawn).length;

export const ProtocolsPage = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search.trim());
    const [page, setPage] = useState(1);

    const {can} = usePermissions();
    const canOpen = can(PERMISSIONS.protocols.details);
    const protocols = useProtocols(debouncedSearch, page, PAGE_SIZE, {enabled: can(PERMISSIONS.protocols.list)});
    const deleteProtocol = useDeleteProtocol();
    const {confirm, dialog: confirmDialog} = useConfirm();

    const items = protocols.data?.items ?? [];
    const totalCount = protocols.data?.totalCount ?? 0;
    const pageCount = Math.ceil(totalCount / PAGE_SIZE);

    const handleDelete = async (protocol: Protocol) => {
        const confirmed = await confirm({
            title: t("protocols.deleteTitle"),
            message: t("protocols.deleteMessage", {name: protocol.name}),
            destructive: true,
        });
        if (!confirmed) return;

        try {
            await deleteProtocol.mutateAsync(protocol.id);
            toast.success(t("protocols.deleted"));
            if (items.length === 1 && page > 1) setPage(p => p - 1);
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    // A link, so it is gated with <Can> (the Permission* controls take no component prop)
    const newProtocolButton = (
        <Can permission={PERMISSIONS.protocols.create}>
            <Button variant="contained" startIcon={<AddIcon/>} component={RouterLink} to="/protocols/new">
                {t("protocols.new")}
            </Button>
        </Can>
    );

    return (
        <>
            <PageHeader
                title={t("protocols.title")}
                subtitle={protocols.data && t("protocols.subtitle", {count: totalCount})}
                actions={newProtocolButton}
            />

            <Paper variant="outlined" sx={{p: 2, mb: 2}}>
                <SearchField
                    value={search}
                    onChange={(value) => {
                        setSearch(value);
                        setPage(1);
                    }}
                    placeholder={t("protocols.searchPlaceholder")}
                />
            </Paper>
            <Box sx={{height: 4, mb: 1}}>{protocols.isFetching && <LinearProgress aria-label={t("common.loading")}/>}</Box>

            {protocols.isError ? (
                <Alert
                    severity="error"
                    action={<Button color="inherit" size="small" onClick={() => void protocols.refetch()}>{t("common.retry")}</Button>}
                >
                    {t("common.loadFailed")}
                </Alert>
            ) : !protocols.isPending && totalCount === 0 ? (
                <Paper variant="outlined">
                    {debouncedSearch
                        ? <EmptyState compact title={t("protocols.noResults")}/>
                        : <EmptyState
                            icon={<CategoryIcon/>}
                            title={t("protocols.emptyTitle")}
                            description={t("protocols.emptyDescription")}
                            action={newProtocolButton}
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
                        {items.map(protocol => (
                            <Card key={protocol.id} variant="outlined" sx={{display: "flex", flexDirection: "column"}}>
                                <CardActionArea
                                    onClick={() => navigate(`/protocols/${protocol.id}`)}
                                    disabled={!canOpen}
                                    sx={{flexGrow: 1, alignItems: "flex-start", display: "flex"}}
                                >
                                    <CardContent sx={{width: "100%"}}>
                                        {/* Names wrap inside the card (even an unbroken 256-character one), never cut with "…" */}
                                        <Stack direction="row" sx={{gap: 1, alignItems: "flex-start", mb: 1.5}}>
                                            <Typography variant="h6" sx={{fontSize: 17, flex: 1, minWidth: 0, overflowWrap: "anywhere"}}>
                                                {protocol.name}
                                            </Typography>
                                            <Chip size="small" color="primary" variant="outlined"
                                                  label={t("protocols.drugCount", {count: protocol.items.length})}/>
                                        </Stack>
                                        <Box component="ol" sx={{m: 0, paddingInlineStart: 2.5, color: "text.secondary"}}>
                                            {protocol.items.slice(0, PREVIEW_DRUGS).map(({drug}, index) => (
                                                <Typography component="li" variant="body2" key={index} sx={{overflowWrap: "anywhere"}}>
                                                    {drug.name}
                                                </Typography>
                                            ))}
                                        </Box>
                                        {protocol.items.length > PREVIEW_DRUGS && (
                                            <Typography variant="caption" color="text.secondary">
                                                {t("protocols.more", {count: protocol.items.length - PREVIEW_DRUGS})}
                                            </Typography>
                                        )}
                                    </CardContent>
                                </CardActionArea>
                                {/* Outside the card's button: the chip is focusable for its tooltip (design M1.7 D6) */}
                                {withdrawnCount(protocol) > 0 && (
                                    <Box sx={{px: 2, pb: 1.5, mt: -0.5}}>
                                        <WithdrawnChip count={withdrawnCount(protocol)}/>
                                    </Box>
                                )}
                                <Can anyOf={[PERMISSIONS.protocols.update, PERMISSIONS.protocols.delete]}>
                                    <CardActions sx={{justifyContent: "flex-end", borderTop: 1, borderColor: "divider"}}>
                                        <Can permission={PERMISSIONS.protocols.update}>
                                            <Tooltip title={t("common.edit")}>
                                                <IconButton size="small" component={RouterLink} to={`/protocols/${protocol.id}`}
                                                            aria-label={t("common.edit")}>
                                                    <EditIcon fontSize="small"/>
                                                </IconButton>
                                            </Tooltip>
                                        </Can>
                                        <Tooltip title={t("common.delete")}>
                                            <PermissionIconButton permission={PERMISSIONS.protocols.delete} size="small" color="error"
                                                                  onClick={() => void handleDelete(protocol)}
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
