import {useMemo} from "react";
import {Box, MenuItem, TextField, ToggleButton, ToggleButtonGroup} from "@mui/material";
import {useTranslation} from "react-i18next";
import {SearchField} from "../../../components/common/SearchField.tsx";
import {categoryName, sortCategories} from "../categories.ts";
import type {DrugListParams} from "../pages/drugListParams.ts";
import type {Category, DrugSource, SubCategoryFilter} from "../types.ts";

const SOURCES: DrugSource[] = ["all", "shared", "own"];
/** The "every category / subcategory" choice of a select (MUI needs a string value) */
const ALL = "";
const NONE = "none";

type Props = {
    /** The search as typed (it reaches the URL once typing pauses) */
    search: string;
    onSearchChange: (search: string) => void;
    /** The URL's filters (already checked against the categories) */
    params: DrugListParams;
    /** `GET /drug-categories` (unsorted), undefined while loading */
    categories: Category[] | undefined;
    /** A filter changed (the page goes back to page 1) */
    onChange: (changes: Partial<Pick<DrugListParams, "source" | "categoryId" | "subCategoryId">>) => void;
};

/**
 * The drugs page's filter bar (design M1.7 D9): the search, the source toggle «الكل» / «المشتركة» / «أدوية العيادة»,
 * the category select and the subcategory select (disabled until a category is chosen; its subcategories sorted, then
 * «بدون تصنيف فرعي»). A row from `sm`; below it the filters wrap under the search, one per line.
 */
export const DrugListFilters = ({search, onSearchChange, params, categories, onChange}: Props) => {
    const {t, i18n} = useTranslation();
    const language = i18n.language;
    const sortedCategories = useMemo(() => sortCategories(categories ?? [], language), [categories, language]);
    const selectedCategory = sortedCategories.find(c => c.id === params.categoryId);
    const subCategories = useMemo(
        () => (selectedCategory ? sortCategories(selectedCategory.subCategories, language) : []),
        [selectedCategory, language]);

    const selectSx = {flex: {sm: "1 1 180px"}, minWidth: {sm: 180}, maxWidth: {sm: 280}};
    const selectSlotProps = {
        inputLabel: {shrink: true},
        select: {displayEmpty: true, MenuProps: {slotProps: {paper: {sx: {maxHeight: 360, maxWidth: "calc(100vw - 32px)"}}}}},
    };
    const optionSx = {whiteSpace: "normal", overflowWrap: "anywhere"} as const;

    return (
        <Box sx={{p: 2, display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center"}}>
            <Box sx={{flex: {xs: "1 1 100%", sm: "1 1 260px"}, minWidth: 0}}>
                <SearchField value={search} onChange={onSearchChange} placeholder={t("drugs.searchPlaceholder")}/>
            </Box>
            <Box sx={{display: "flex", flexDirection: {xs: "column", sm: "row"}, flexWrap: "wrap", gap: 1.5, flex: {xs: "1 1 100%", sm: "0 1 auto"}, minWidth: 0}}>
                <ToggleButtonGroup
                    exclusive
                    size="small"
                    color="primary"
                    aria-label={t("drugs.source.label")}
                    value={params.source}
                    // Never deselected: a click on the selected button keeps it
                    onChange={(_, value: DrugSource | null) => {
                        if (value !== null && value !== params.source) onChange({source: value});
                    }}
                    sx={{"& .MuiToggleButton-root": {flex: {xs: 1, sm: "0 0 auto"}, px: 1.5, whiteSpace: "nowrap"}}}
                >
                    {SOURCES.map(s => <ToggleButton key={s} value={s}>{t(`drugs.source.${s}`)}</ToggleButton>)}
                </ToggleButtonGroup>
                <TextField
                    select
                    size="small"
                    label={t("drugs.category")}
                    value={selectedCategory ? String(selectedCategory.id) : ALL}
                    // Changing the category resets the subcategory
                    onChange={(e) => onChange({categoryId: e.target.value ? Number(e.target.value) : null, subCategoryId: null})}
                    sx={selectSx}
                    slotProps={selectSlotProps}
                >
                    <MenuItem value={ALL}>{t("drugs.allCategories")}</MenuItem>
                    {sortedCategories.map(c => (
                        <MenuItem key={c.id} value={String(c.id)} sx={optionSx}>{categoryName(c, language)}</MenuItem>
                    ))}
                </TextField>
                <TextField
                    select
                    size="small"
                    label={t("drugs.subCategory")}
                    value={selectedCategory && params.subCategoryId !== null ? String(params.subCategoryId) : ALL}
                    onChange={(e) => onChange({subCategoryId: subCategoryOf(e.target.value)})}
                    disabled={!selectedCategory}
                    sx={selectSx}
                    slotProps={selectSlotProps}
                >
                    <MenuItem value={ALL}>{t("drugs.allSubCategories")}</MenuItem>
                    {subCategories.map(s => (
                        <MenuItem key={s.id} value={String(s.id)} sx={optionSx}>{categoryName(s, language)}</MenuItem>
                    ))}
                    <MenuItem value={NONE}>{t("drugs.noSubCategory")}</MenuItem>
                </TextField>
            </Box>
        </Box>
    );
};

const subCategoryOf = (value: string): SubCategoryFilter | null =>
    value === ALL ? null : value === NONE ? NONE : Number(value);
