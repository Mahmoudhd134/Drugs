import {useMemo} from "react";
import {MenuItem, Stack, TextField} from "@mui/material";
import {useTranslation} from "react-i18next";
import {categoryName, sortCategories} from "../categories.ts";

type Named = { id: number; nameEn: string; nameAr: string; pinnedLast: boolean };
type CategoryOption = Named & { subCategories: Named[] };

type Props = {
    /** Every category with its subcategories (unsorted; `GET /drug-categories` or the admin list) */
    categories: CategoryOption[];
    categoryId: number | null;
    subCategoryId: number | null;
    /** Changing the category clears the subcategory */
    onChange: (value: { categoryId: number | null; subCategoryId: number | null }) => void;
    categoryError?: string | null;
    subCategoryError?: string | null;
    disabled?: boolean;
};

/** "None" in a select (MUI needs a string value). */
const NONE = "";

/**
 * The drug dialog's category (required) and subcategory (optional, only the chosen category's, first option
 * «بدون تصنيف فرعي») selects, names in the UI language, sorted with the pinned rows last (design M1.7 D5, D9).
 * Used by the clinic's own-drug dialog and the admin shared-drug dialog.
 */
export const CategoryFields = (props: Props) => {
    const {categories, categoryId, subCategoryId, onChange, categoryError, subCategoryError, disabled} = props;
    const {t, i18n} = useTranslation();
    const language = i18n.language;
    const sorted = useMemo(() => sortCategories(categories, language), [categories, language]);
    const category = categories.find(c => c.id === categoryId);
    const subCategories = useMemo(
        () => (category ? sortCategories(category.subCategories, language) : []),
        [category, language]);
    // A value not (yet) in the lists (loading, or deleted meanwhile) shows as empty instead of an out-of-range value
    const categoryValue = category ? String(category.id) : NONE;
    const subCategoryValue = subCategories.some(s => s.id === subCategoryId) ? String(subCategoryId) : NONE;

    return (
        <Stack direction={{xs: "column", sm: "row"}} sx={{gap: 2}}>
            <TextField
                select
                label={t("drugs.category")}
                value={categoryValue}
                onChange={(e) => onChange({categoryId: e.target.value ? Number(e.target.value) : null, subCategoryId: null})}
                error={!!categoryError}
                helperText={categoryError || undefined}
                required
                disabled={disabled}
                fullWidth
                slotProps={{select: {MenuProps: {slotProps: {paper: {sx: {maxHeight: 360}}}}}}}
            >
                {sorted.map(c => (
                    <MenuItem key={c.id} value={String(c.id)} sx={{whiteSpace: "normal", overflowWrap: "anywhere"}}>
                        {categoryName(c, language)}
                    </MenuItem>
                ))}
            </TextField>
            <TextField
                select
                label={t("drugs.subCategory")}
                value={subCategoryValue}
                onChange={(e) => onChange({categoryId, subCategoryId: e.target.value ? Number(e.target.value) : null})}
                error={!!subCategoryError}
                helperText={subCategoryError || undefined}
                disabled={disabled || !category}
                fullWidth
                slotProps={{
                    // The empty value shows its option's text, not a blank field
                    inputLabel: {shrink: true},
                    select: {displayEmpty: true, MenuProps: {slotProps: {paper: {sx: {maxHeight: 360}}}}},
                }}
            >
                <MenuItem value={NONE}>{t("drugs.noSubCategory")}</MenuItem>
                {subCategories.map(s => (
                    <MenuItem key={s.id} value={String(s.id)} sx={{whiteSpace: "normal", overflowWrap: "anywhere"}}>
                        {categoryName(s, language)}
                    </MenuItem>
                ))}
            </TextField>
        </Stack>
    );
};
