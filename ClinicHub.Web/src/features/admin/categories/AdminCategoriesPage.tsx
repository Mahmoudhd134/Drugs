import {type ReactNode, useId, useMemo, useState} from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    IconButton,
    LinearProgress,
    Paper,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/EditOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";
import {TapTooltip} from "../../../components/common/TapTooltip.tsx";
import {useConfirm} from "../../../components/common/useConfirm.tsx";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {getErrorMessage} from "../../../api/errors.ts";
import {categoryName, sortCategories} from "../../drugs/categories.ts";
import {useAdminCategories, useDeleteCategory} from "./api.ts";
import {CategoryNameDialog, type CategoryNameTarget} from "./CategoryNameDialog.tsx";
import type {AdminCategory, AdminSubCategory} from "./types.ts";

type Kind = "category" | "subCategory";

/**
 * `/admin/categories` (design M1.7 D5, D9): every category with its subcategories (sorted, pinned rows last), a
 * «بدون تصنيف فرعي» row when the category holds drugs without a subcategory, drug counts; add, rename and delete. A
 * row with drugs can't be deleted: its delete button is disabled (still focusable) and its tooltip says why (and how
 * many drugs belong to deleted clinics); a 409 (a drug added meanwhile) is still handled and reloads the counts.
 */
export const AdminCategoriesPage = () => {
    const {t, i18n} = useTranslation();
    const language = i18n.language;
    const categories = useAdminCategories();
    const deleteCategory = useDeleteCategory();
    const {confirm, dialog: confirmDialog} = useConfirm();
    // One delete at a time: a double click opens one confirm and sends one request
    const once = useSingleFlight();
    const [dialog, setDialog] = useState<{ open: boolean; target: CategoryNameTarget | null }>({open: false, target: null});
    const sorted = useMemo(() => sortCategories(categories.data ?? [], language), [categories.data, language]);

    const open = (target: CategoryNameTarget) => setDialog({open: true, target});
    const namesOf = ({nameEn, nameAr}: { nameEn: string; nameAr: string }) => ({nameEn, nameAr});

    const handleDelete = (kind: Kind, row: AdminCategory | AdminSubCategory) => once(async () => {
        const name = categoryName(row, language);
        const confirmed = await confirm(kind === "category"
            ? {title: t("adminCategories.deleteCategoryTitle", {name}), message: t("adminCategories.deleteCategoryMessage"), destructive: true}
            : {title: t("adminCategories.deleteSubCategoryTitle", {name}), message: t("adminCategories.deleteSubCategoryMessage"), destructive: true});
        if (!confirmed) return;
        try {
            await deleteCategory.mutateAsync({id: row.id, kind});
            toast.success(t(kind === "category" ? "adminCategories.deleted" : "adminCategories.subDeleted"));
        } catch (error) {
            // `categoryInUse` / `subCategoryInUse` name the drug count; the list reloads either way
            toast.error(getErrorMessage(error));
        }
    });

    const addButton = (
        <Button variant="contained" startIcon={<AddIcon/>} onClick={() => open({kind: "category", id: null, names: null})}>
            {t("adminCategories.add")}
        </Button>
    );

    return (
        <>
            <PageHeader title={t("adminCategories.title")} actions={addButton}/>

            {categories.isError ? (
                <Alert
                    severity="error"
                    action={<Button color="inherit" size="small" onClick={() => void categories.refetch()}>{t("common.retry")}</Button>}
                >
                    {t("common.loadFailed")}
                </Alert>
            ) : categories.isPending ? (
                <Box sx={{display: "flex", justifyContent: "center", py: 8}}><CircularProgress aria-label={t("common.loading")}/></Box>
            ) : (
                <>
                    <Box sx={{height: 4, mb: 1}}>{categories.isFetching && <LinearProgress aria-label={t("common.loading")}/>}</Box>
                    <Stack sx={{gap: 2}}>
                        {sorted.map(category => (
                            <Paper key={category.id} variant="outlined" component="section" aria-label={categoryName(category, language)}>
                                <Row
                                    level={1}
                                    name={categoryName(category, language)}
                                    count={category.drugCount}
                                    actions={
                                        <>
                                            <Tooltip title={t("adminCategories.addSubCategory")}>
                                                <IconButton size="small" aria-label={t("adminCategories.addSubCategory")}
                                                            onClick={() => open({
                                                                kind: "subCategory", id: null, categoryId: category.id,
                                                                parentName: categoryName(category, language), names: null,
                                                            })}>
                                                    <AddIcon fontSize="small"/>
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={t("adminCategories.renameCategory")}>
                                                <IconButton size="small" aria-label={t("adminCategories.renameCategory")}
                                                            onClick={() => open({kind: "category", id: category.id, names: namesOf(category)})}>
                                                    <EditIcon fontSize="small"/>
                                                </IconButton>
                                            </Tooltip>
                                            <DeleteButton kind="category" row={category} onDelete={() => void handleDelete("category", category)}/>
                                        </>
                                    }
                                />
                                {sortCategories(category.subCategories, language).map(sub => (
                                    <Row
                                        key={sub.id}
                                        level={2}
                                        name={categoryName(sub, language)}
                                        count={sub.drugCount}
                                        actions={
                                            <>
                                                <Tooltip title={t("adminCategories.renameSubCategory")}>
                                                    <IconButton size="small" aria-label={t("adminCategories.renameSubCategory")}
                                                                onClick={() => open({
                                                                    kind: "subCategory", id: sub.id, categoryId: category.id,
                                                                    parentName: categoryName(category, language), names: namesOf(sub),
                                                                })}>
                                                        <EditIcon fontSize="small"/>
                                                    </IconButton>
                                                </Tooltip>
                                                <DeleteButton kind="subCategory" row={sub} onDelete={() => void handleDelete("subCategory", sub)}/>
                                            </>
                                        }
                                    />
                                ))}
                                {/* The drugs of the category without a subcategory: last, after the pinned rows */}
                                {category.noSubCategoryDrugCount > 0 && (
                                    <Row level={2} name={t("drugs.noSubCategory")} count={category.noSubCategoryDrugCount} muted/>
                                )}
                            </Paper>
                        ))}
                    </Stack>
                </>
            )}

            <CategoryNameDialog open={dialog.open} target={dialog.target} onClose={() => setDialog(d => ({...d, open: false}))}/>
            {confirmDialog}
        </>
    );
};

type RowProps = { level: 1 | 2; name: string; count: number; actions?: ReactNode; muted?: boolean };

const Row = ({level, name, count, actions, muted}: RowProps) => {
    const {t} = useTranslation();
    return (
        <Stack
            direction="row"
            sx={{
                alignItems: "center",
                gap: 1,
                px: 2,
                py: level === 1 ? 1.25 : 0.75,
                paddingInlineStart: level === 1 ? 2 : 5,
                borderTop: level === 1 ? 0 : 1,
                borderColor: "divider",
                bgcolor: level === 1 ? "action.hover" : undefined,
                minHeight: 44,
            }}
        >
            <Box sx={{flex: 1, minWidth: 0}}>
                <Typography
                    component={level === 1 ? "h2" : "div"}
                    sx={{fontWeight: level === 1 ? 700 : 500, fontSize: level === 1 ? 16 : 15, overflowWrap: "anywhere",
                        fontStyle: muted ? "italic" : undefined}}
                    color={muted ? "text.secondary" : undefined}
                >
                    {name}
                </Typography>
                <Typography variant="body2" color="text.secondary">{t("adminCategories.drugCount", {count})}</Typography>
            </Box>
            {actions && <Stack direction="row" sx={{flexShrink: 0}}>{actions}</Stack>}
        </Stack>
    );
};

type DeleteButtonProps = { kind: Kind; row: AdminCategory | AdminSubCategory; onDelete: () => void };

/**
 * Delete, or, while drugs use the row, a disabled-looking delete that stays focusable (`aria-disabled`) and explains
 * on hover, focus and tap: «لا يمكن حذف هذا التصنيف: يستخدمه N دواء.» (+ «من عيادات محذوفة: N»).
 */
const DeleteButton = ({kind, row, onDelete}: DeleteButtonProps) => {
    const {t} = useTranslation();
    const reasonId = useId();
    const label = t(kind === "category" ? "adminCategories.deleteCategory" : "adminCategories.deleteSubCategory");
    if (row.drugCount === 0) return (
        <Tooltip title={label}>
            <IconButton size="small" color="error" aria-label={label} onClick={onDelete}>
                <DeleteIcon fontSize="small"/>
            </IconButton>
        </Tooltip>
    );
    const reason = [
        t(kind === "category" ? "errors.categoryInUse_counted" : "errors.subCategoryInUse_counted", {count: row.drugCount}),
        row.deletedClinicsDrugCount > 0 ? t("adminCategories.deletedClinics", {count: row.deletedClinicsDrugCount}) : null,
    ].filter(Boolean).join("\n");
    return (
        <>
            <TapTooltip title={<Box component="span" sx={{whiteSpace: "pre-line"}}>{reason}</Box>} describeChild>
                <IconButton
                    size="small"
                    aria-label={label}
                    aria-disabled="true"
                    // The reason is its description at all times, not only while the tooltip is open
                    aria-describedby={reasonId}
                    // Focusable (the tooltip opens on focus) but does nothing
                    onClick={(e) => e.preventDefault()}
                    disableRipple
                    sx={{color: "action.disabled", cursor: "default"}}
                >
                    <DeleteIcon fontSize="small"/>
                </IconButton>
            </TapTooltip>
            <Box component="span" id={reasonId} hidden>{reason}</Box>
        </>
    );
};
