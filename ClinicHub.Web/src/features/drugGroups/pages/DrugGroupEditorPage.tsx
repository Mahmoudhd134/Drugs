import {useEffect, useMemo, useState} from "react";
import {Navigate, useNavigate, useParams} from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Grid,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import MedicationIcon from "@mui/icons-material/Medication";
import ErrorIcon from "@mui/icons-material/ErrorOutline";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {BackButton} from "../../../components/common/BackButton.tsx";
import {EmptyState} from "../../../components/common/EmptyState.tsx";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {getErrorMessage} from "../../../api/errors.ts";
import {DrugPicker} from "../../drugs/components/DrugPicker.tsx";
import {DosingLineList} from "../../dosing/components/DosingLineList.tsx";
import {LineDetails} from "../../dosing/components/LineDetails.tsx";
import {ASK_EYE, eyeKey, isDosingEmpty, otherEye, type Dosing} from "../../dosing/types.ts";
import {GroupItemDialog} from "../components/GroupItemDialog.tsx";
import {
    clashingItemKeys,
    effectiveDosing,
    type EditorItem,
    itemIdentity,
    itemsSignature,
    newItemKey,
    toEditorItems,
    toSaveItems,
} from "../editorItem.ts";
import type {Drug} from "../../drugs/types.ts";
import {useDeleteDrugGroup, useDrugGroup, useSaveDrugGroup} from "../api.ts";
import type {DrugGroup} from "../types.ts";
import {PERMISSIONS} from "../../access/permissions.ts";
import {usePermissions} from "../../access/usePermissions.ts";
import {PermissionButton} from "../../access/components/PermissionControls.tsx";
import {TapTooltip} from "../../../components/common/TapTooltip.tsx";

// Long chip labels wrap onto a second line instead of being cut off on narrow screens
const wrappingChip = {maxWidth: "100%", height: "auto", "& .MuiChip-label": {whiteSpace: "normal", py: 0.25}};

export const DrugGroupEditorPage = () => {
    const {t} = useTranslation();
    const {id} = useParams();
    const groupId = id === undefined ? null : Number(id);
    const {can} = usePermissions();
    const details = useDrugGroup(Number.isInteger(groupId) ? groupId : null, {enabled: can(PERMISSIONS.groups.details)});
    // The group as answered by a fetch made since the editor opened: a cached copy (e.g. from before one of its drugs
    // was edited) is never shown. Kept once taken, so a later refetch neither resets the form nor moves its baseline;
    // dropped when the page shows another group, so coming back to this one waits for a fresh answer again.
    const fresh = details.isFetchedAfterMount && details.isSuccess ? details.data : undefined;
    const [opened, setOpened] = useState<{ groupId: number; group: DrugGroup } | null>(null);
    if (opened && opened.groupId !== groupId) setOpened(null);
    else if (!opened && fresh && groupId !== null) setOpened({groupId, group: fresh});
    const group = opened?.groupId === groupId ? opened.group : fresh;

    if (groupId !== null && !Number.isInteger(groupId)) return <Navigate to="/groups" replace/>;

    if (groupId !== null && !group) {
        return details.isError && details.isFetchedAfterMount ? (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void details.refetch()}>{t("common.retry")}</Button>}>
                {getErrorMessage(details.error)}
            </Alert>
        ) : (
            <Box sx={{display: "flex", justifyContent: "center", py: 8}}><CircularProgress aria-label={t("common.loading")}/></Box>
        );
    }

    // Remount per group so the form starts from that group's values
    return <GroupEditor key={groupId ?? "new"} groupId={groupId} initial={group}/>;
};

const GroupEditor = ({groupId, initial}: { groupId: number | null; initial?: DrugGroup }) => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const save = useSaveDrugGroup();
    const once = useSingleFlight();
    const deleteGroup = useDeleteDrugGroup();
    const {confirm, dialog: confirmDialog} = useConfirm();
    const {can} = usePermissions();
    // Without the permission to save, the group is only shown
    const readOnly = !can(groupId === null ? PERMISSIONS.groups.create : PERMISSIONS.groups.update);
    const canPickDrugs = !readOnly && can(PERMISSIONS.drugs.list);
    // The list, or the start page for a role that may create groups but not list them
    const exitTo = can(PERMISSIONS.groups.list) ? "/groups" : "/";

    const [name, setName] = useState(initial?.name ?? "");
    const initialItems = useMemo(() => toEditorItems(initial?.items), [initial]);
    const initialSignature = useMemo(() => itemsSignature(initialItems), [initialItems]);
    const [items, setItems] = useState<EditorItem[]>(initialItems);
    const [editingItem, setEditingItem] = useState<EditorItem | null>(null);
    const [showNameRequired, setShowNameRequired] = useState(false);

    const selectedIds = useMemo(() => new Set(items.map(i => i.drug.id)), [items]);
    // Lines giving the same drug for the same eye (possible after a drug's default eye changed): marked, and Save is
    // blocked until they are fixed
    const clashingKeys = useMemo(() => clashingItemKeys(items), [items]);
    const isDirty = name.trim() !== (initial?.name ?? "") || itemsSignature(items) !== initialSignature;

    // Warn before closing the tab with unsaved changes
    useEffect(() => {
        if (!isDirty) return;
        const handler = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [isDirty]);

    const nameError = showNameRequired && !name.trim();

    /** A new line uses the drug's default dosing (empty override). */
    const addDrug = (drug: Drug) => {
        const item: EditorItem = {key: newItemKey(), drug, dosing: {}};
        if (items.some(i => itemIdentity(i) === itemIdentity(item))) {
            toast(t("groups.alreadyInGroupForEye", {name: drug.name}));
            return;
        }
        setItems(current => [...current, item]);
    };

    /** Returns false (no change) when the new eye clashes with another line of the same drug. */
    const updateItem = (key: string, dosing: Dosing) => {
        const item = items.find(i => i.key === key);
        if (!item) return false;
        const identity = itemIdentity({drug: item.drug, dosing});
        if (items.some(i => i.key !== key && itemIdentity(i) === identity)) return false;
        setItems(current => current.map(i => (i.key === key ? {...i, dosing} : i)));
        return true;
    };

    const canAddOtherEye = (item: EditorItem) => {
        const eye = otherEye(effectiveDosing(item).eye);
        return eye !== null && !items.some(i => i.drug.id === item.drug.id && eyeKey(effectiveDosing(i)) === eye);
    };

    const addOtherEye = (item: EditorItem) => {
        const eye = otherEye(effectiveDosing(item).eye);
        if (!eye || !canAddOtherEye(item)) return;
        const copy: EditorItem = {...item, key: newItemKey(), dosing: {...item.dosing, eye}};
        setItems(current => {
            const index = current.findIndex(i => i.key === item.key);
            return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
        });
    };

    const leave = async () => {
        if (isDirty) {
            const confirmed = await confirm({
                title: t("groups.discardTitle"),
                message: t("groups.discardMessage"),
                confirmText: t("groups.discard"),
                destructive: true,
            });
            if (!confirmed) return;
        }
        navigate(exitTo);
    };

    const handleSave = () => once(async () => {
        if (!name.trim()) {
            setShowNameRequired(true);
            return;
        }
        if (items.length === 0) {
            toast.error(t("errors.drugsRequired"));
            return;
        }
        if (clashingKeys.size > 0) {
            toast.error(t("groups.eyeClashSave"));
            return;
        }

        try {
            await save.mutateAsync({
                id: groupId,
                name: name.trim(),
                items: toSaveItems(items),
            });
            toast.success(groupId === null ? t("groups.created") : t("groups.updated"));
            navigate(exitTo);
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    });

    const handleDelete = async () => {
        if (groupId === null) return;
        const confirmed = await confirm({
            title: t("groups.deleteTitle"),
            message: t("groups.deleteMessage", {name: initial?.name}),
            destructive: true,
        });
        if (!confirmed) return;

        try {
            await deleteGroup.mutateAsync(groupId);
            toast.success(t("groups.deleted"));
            navigate(exitTo);
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    return (
        <>
            <PageHeader
                leading={<BackButton onClick={() => void leave()}/>}
                title={groupId === null ? t("groups.new") : readOnly ? t("groups.view") : t("groups.edit")}
                actions={
                    <>
                        {groupId !== null && (
                            // Shown disabled (with a tooltip) to editors who can't delete, so they know why
                            <PermissionButton permission={PERMISSIONS.groups.delete} whenDenied={readOnly ? "hide" : "disable"}
                                              color="error" startIcon={<DeleteIcon/>} onClick={() => void handleDelete()}>
                                {t("common.delete")}
                            </PermissionButton>
                        )}
                        {!readOnly && (
                            <>
                                <Button variant="outlined" onClick={() => void leave()}>{t("common.cancel")}</Button>
                                <Button variant="contained" onClick={() => void handleSave()} disabled={save.isPending}>
                                    {save.isPending ? t("common.saving") : t("common.save")}
                                </Button>
                            </>
                        )}
                    </>
                }
            />

            <Grid container spacing={2}>
                <Grid size={{xs: 12, md: canPickDrugs ? 7 : 12}}>
                    <Stack sx={{gap: 2}}>
                        <Paper variant="outlined" sx={{p: 2.5}}>
                            <Typography variant="subtitle1" sx={{fontWeight: 700, mb: 2}}>{t("groups.details")}</Typography>
                            <TextField
                                label={t("groups.name")}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                error={nameError}
                                helperText={nameError ? t("errors.nameRequired") : undefined}
                                slotProps={{htmlInput: {dir: "auto", maxLength: 256, readOnly}}}
                                required={!readOnly}
                                autoFocus={groupId === null}
                                fullWidth
                            />
                        </Paper>

                        <Paper variant="outlined" sx={{p: 2.5}}>
                            <Stack direction="row" sx={{alignItems: "center", gap: 1, mb: 2}}>
                                <Typography variant="subtitle1" sx={{fontWeight: 700}}>{t("groups.drugsInGroup")}</Typography>
                                <Chip size="small" label={items.length}/>
                            </Stack>
                            {!readOnly && clashingKeys.size > 0 && (
                                <Alert severity="error" sx={{mb: 2}}>{t("groups.eyeClashSave")}</Alert>
                            )}
                            {items.length === 0 ? (
                                <EmptyState
                                    compact
                                    icon={<MedicationIcon/>}
                                    title={t("groups.noDrugsTitle")}
                                    description={t("groups.noDrugsDescription")}
                                />
                            ) : (
                                <DosingLineList
                                    readOnly={readOnly}
                                    lines={items}
                                    onReorder={setItems}
                                    onEdit={setEditingItem}
                                    onRemove={(item) => setItems(current => current.filter(i => i.key !== item.key))}
                                    canAddOtherEye={canAddOtherEye}
                                    onAddOtherEye={addOtherEye}
                                    renderDetails={(item) => {
                                        const effective = effectiveDosing(item);
                                        return (
                                            <>
                                                <LineDetails dosing={effective} description={item.drug.description}/>
                                                <Stack direction="row" sx={{gap: 0.5, flexWrap: "wrap", mt: 0.5}}>
                                                    {clashingKeys.has(item.key) && (
                                                        <Chip size="small" color="error" icon={<ErrorIcon/>} label={t("groups.eyeClash")} sx={wrappingChip}/>
                                                    )}
                                                    {!isDosingEmpty(item.dosing) && (
                                                        <TapTooltip title={t("groups.customDosingInfo")} tap={readOnly}>
                                                            <Chip size="small" variant="outlined" color="primary" label={t("groups.customDosing")} sx={wrappingChip}/>
                                                        </TapTooltip>
                                                    )}
                                                    {effective.eye === ASK_EYE && (
                                                        <TapTooltip title={t("dosing.askEyeInfo")} tap={readOnly}>
                                                            <Chip size="small" variant="outlined" color="secondary" label={t("dosing.askEyeHint")} sx={wrappingChip}/>
                                                        </TapTooltip>
                                                    )}
                                                </Stack>
                                            </>
                                        );
                                    }}
                                />
                            )}
                        </Paper>
                    </Stack>
                </Grid>

                {canPickDrugs && (
                    <Grid size={{xs: 12, md: 5}}>
                        <Paper variant="outlined" sx={{p: 2.5, position: {md: "sticky"}, top: {md: 88}}}>
                            <Typography variant="subtitle1" sx={{fontWeight: 700}}>{t("groups.addDrugs")}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>{t("groups.addDrugsHint")}</Typography>
                            <DrugPicker onSelect={addDrug} selectedIds={selectedIds} maxHeight="55vh"/>
                        </Paper>
                    </Grid>
                )}
            </Grid>
            <GroupItemDialog item={editingItem} onClose={() => setEditingItem(null)} onSave={updateItem}/>
            {confirmDialog}
        </>
    );
};
