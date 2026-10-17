import {useState} from "react";
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
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/EditOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import LockIcon from "@mui/icons-material/LockOutlined";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {getErrorMessage} from "../../../api/errors.ts";
import {TapTooltip} from "../../../components/common/TapTooltip.tsx";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {usePermissionCatalog} from "../../access/api.ts";
import {useDeleteRole, useRoles} from "../useRoles.ts";
import {usePermissionLabels} from "../usePermissionLabels.ts";
import {useRoleLabel} from "../roleLabel.ts";
import type {Role, RolesAdapter} from "../types.ts";
import {RoleEditorDialog} from "./RoleEditorDialog.tsx";

/**
 * A clinic's roles (Owner first, then by name): name, staff holding it, what it grants; create, edit, delete. The
 * Owner role is locked (always every permission). Data comes from the adapter only (design D9).
 */
export const RoleList = ({adapter}: { adapter: RolesAdapter }) => {
    const {t} = useTranslation();
    const labels = usePermissionLabels();
    const roleLabel = useRoleLabel();
    const roles = useRoles(adapter);
    const catalog = usePermissionCatalog();
    const deleteRole = useDeleteRole(adapter);
    const {confirm, dialog: confirmDialog} = useConfirm();
    const [editor, setEditor] = useState<{ open: boolean; role: Role | null }>({open: false, role: null});
    // One delete at a time (a double click would send it twice)
    const once = useSingleFlight();

    const openCreate = () => setEditor({open: true, role: null});
    const openEdit = (role: Role) => setEditor({open: true, role});

    const handleDelete = (role: Role) => once(async () => {
        const confirmed = await confirm({
            title: t("roles.deleteTitle", {name: role.name}),
            message: t("roles.deleteMessage"),
            destructive: true,
        });
        if (!confirmed) return;
        try {
            await deleteRole.mutateAsync(role.id);
            toast.success(t("roles.deleted", {name: role.name}));
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    });

    /** What a role grants, in one line: "all", "none", or how many and on what (once the catalog is loaded). */
    const summary = (role: Role) => {
        if (role.isOwner) return t("roles.ownerSummary");
        if (role.permissions.length === 0) return t("roles.noPermissions");
        if (!catalog.data) return " ";
        if (role.permissions.length >= catalog.data.length) return t("roles.allPermissions");
        const resources = [...new Set(catalog.data.filter(p => role.permissions.includes(p.key)).map(p => p.resource))];
        return t("roles.permissionSummary", {
            count: role.permissions.length,
            resources: resources.map(labels.resource).join(t("common.listSeparator")),
        });
    };

    const items = roles.data ?? [];

    return (
        <Stack sx={{gap: 2}}>
            <Stack direction="row" sx={{alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap"}}>
                <Box sx={{minWidth: 0}}>
                    <Typography variant="h6" component="h2">{t("roles.title")}</Typography>
                    <Typography variant="body2" color="text.secondary">{t("roles.subtitle")}</Typography>
                </Box>
                <Button variant="contained" startIcon={<AddIcon/>} onClick={openCreate}>{t("roles.add")}</Button>
            </Stack>

            <Paper variant="outlined" sx={{overflow: "hidden"}}>
                <Box sx={{height: 4}}>{roles.isFetching && <LinearProgress aria-label={t("common.loading")}/>}</Box>
                {roles.isError && !roles.data ? (
                    <Alert
                        severity="error"
                        sx={{m: 2}}
                        action={<Button color="inherit" size="small" onClick={() => void roles.refetch()}>{t("common.retry")}</Button>}
                    >
                        {t("common.loadFailed")}
                    </Alert>
                ) : (
                    <TableContainer>
                        {/* Narrower cell padding on phones, so the table fits without scrolling */}
                        <Table size="small" sx={{"& th, & td": {px: {xs: 1, sm: 2}}}}>
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t("roles.name")}</TableCell>
                                    <TableCell align="right">{t("roles.staff")}</TableCell>
                                    <TableCell align="right" sx={{width: "1%", whiteSpace: "nowrap"}}>{t("roles.actions")}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map(role => (
                                    <TableRow key={role.id} sx={{"& td": {py: 1.25}}}>
                                        <TableCell sx={{minWidth: 0}}>
                                            <Stack direction="row" sx={{alignItems: "center", gap: 1, flexWrap: "wrap"}}>
                                                <Box component="span" dir="auto" sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{roleLabel(role)}</Box>
                                                {role.isOwner && (
                                                    <Chip size="small" variant="outlined" icon={<LockIcon/>} label={t("roles.locked")}/>
                                                )}
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary">{summary(role)}</Typography>
                                        </TableCell>
                                        <TableCell align="right">{role.staffCount}</TableCell>
                                        <TableCell align="right" sx={{whiteSpace: "nowrap"}}>
                                            {/* The Owner role has no actions: it is locked */}
                                            {!role.isOwner && (
                                                <>
                                                    <Tooltip title={t("roles.edit")}>
                                                        <IconButton onClick={() => openEdit(role)} aria-label={t("roles.editNamed", {name: role.name})}>
                                                            <EditIcon fontSize="small"/>
                                                        </IconButton>
                                                    </Tooltip>
                                                    {role.staffCount > 0 ? (
                                                        // Held by someone: can't be deleted. Focusable (aria-disabled), so the reason is reached and said
                                                        <TapTooltip title={t("roles.deleteHeld", {count: role.staffCount})} describeChild>
                                                            <IconButton
                                                                aria-disabled
                                                                disableTouchRipple
                                                                sx={{color: "action.disabled", cursor: "default", "&:hover": {backgroundColor: "transparent"}}}
                                                                aria-label={t("roles.deleteNamed", {name: role.name})}
                                                            >
                                                                <DeleteIcon fontSize="small"/>
                                                            </IconButton>
                                                        </TapTooltip>
                                                    ) : (
                                                        <Tooltip title={t("roles.delete")}>
                                                            <IconButton
                                                                color="error"
                                                                onClick={() => void handleDelete(role)}
                                                                aria-label={t("roles.deleteNamed", {name: role.name})}
                                                            >
                                                                <DeleteIcon fontSize="small"/>
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <RoleEditorDialog
                open={editor.open}
                role={editor.role}
                adapter={adapter}
                onClose={() => setEditor(e => ({...e, open: false}))}
            />
            {confirmDialog}
        </Stack>
    );
};
