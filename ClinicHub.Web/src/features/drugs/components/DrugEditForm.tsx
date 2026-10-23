import {useMemo, useState} from "react";
import {Button, DialogActions, DialogContent, Divider, Stack, TextField, Typography} from "@mui/material";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {splitFormErrors, toApiError} from "../../../api/errors.ts";
import {DialogForm} from "../../../components/common/DialogForm.tsx";
import {useDialogSave} from "../../../hooks/useDialogSave.ts";
import {CategoryFields} from "./CategoryFields.tsx";
import {DosingFields} from "../../dosing/components/DosingFields.tsx";
import {dosingErrors, isDosingEmpty, normalizeDosing, type Dosing} from "../../dosing/types.ts";
import type {CategoryName, SaveDrug} from "../types.ts";

/** What the form starts from: a drug (own or shared) or nothing for a new one. */
export type DrugFormInitial = {
    name: string;
    activeIngredients: string | null;
    description?: string | null;
    defaultDosing?: Dosing | null;
    category: CategoryName;
    subCategory: CategoryName | null;
};

type CategoryOption = { id: number; nameEn: string; nameAr: string; pinnedLast: boolean; subCategories: { id: number; nameEn: string; nameAr: string; pinnedLast: boolean }[] };

type Props = {
    /** null: a new drug (empty form) */
    initial: DrugFormInitial | null;
    categories: CategoryOption[];
    /** Reloads the categories (after `categoryNotFound` / `subCategoryNotFound`) */
    onReloadCategories: () => void;
    /** The clinic's own drug has a default dosing; the admin's shared drug has none (design M1.7 D3) */
    withDosing: boolean;
    /** Sends the body (POST or PUT); rejects with the API error */
    save: (body: SaveDrug) => Promise<unknown>;
    isPending: boolean;
    /** The success toast */
    savedText: string;
    onClose: () => void;
};

const INPUT_FIELDS = ["name", "activeIngredients", "description", "categoryId", "subCategoryId", "defaultDosing"] as const;
type Field = typeof INPUT_FIELDS[number];

/**
 * The drug dialog's form (design M1.7 D9): name, active ingredients (`dir="auto"`), category (required) and
 * subcategory, description and, for an own drug, the default dosing. Errors show on their inputs (`categoryRequired`
 * without a request); a category or subcategory deleted meanwhile reloads the lists. Mount it per opening
 * (`useOpeningKey`) inside a `FormDialog`: one save at a time, locked once saved (`useDialogSave`).
 */
export const DrugEditForm = (props: Props) => {
    const {initial, categories, onReloadCategories, withDosing, save, isPending, savedText, onClose} = props;
    const {t} = useTranslation();
    const [name, setName] = useState(initial?.name ?? "");
    const [activeIngredients, setActiveIngredients] = useState(initial?.activeIngredients ?? "");
    const [description, setDescription] = useState(initial?.description ?? "");
    const [dosing, setDosing] = useState<Dosing>(initial?.defaultDosing ?? {});
    const [chosen, setCategory] = useState({
        categoryId: initial?.category.id ?? null as number | null,
        subCategoryId: initial?.subCategory?.id ?? null as number | null,
    });
    // What the selects show and Save sends: an id the (re)loaded lists no longer hold (deleted meanwhile, e.g. after
    // `subCategoryNotFound`) counts as not chosen, so saving again doesn't resend it; kept as is while the lists load
    const category = useMemo(() => {
        if (categories.length === 0)
            return chosen;
        const listed = categories.find(c => c.id === chosen.categoryId);
        return {
            categoryId: listed ? listed.id : null,
            subCategoryId: listed?.subCategories.some(s => s.id === chosen.subCategoryId) ? chosen.subCategoryId : null,
        };
    }, [categories, chosen]);
    const [showRequired, setShowRequired] = useState(false);
    const [showDosingErrors, setShowDosingErrors] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

    const clearError = (field: Field) => setErrors(current => (current[field] ? {...current, [field]: undefined} : current));

    const {submit, done} = useDialogSave(async () => {
        if (!name.trim() || category.categoryId === null) {
            setShowRequired(true);
            return false;
        }
        if (withDosing && dosingErrors(dosing).length) {
            setShowDosingErrors(true);
            return false;
        }

        try {
            await save({
                name: name.trim(),
                activeIngredients: activeIngredients.trim() || null,
                description: description.trim() || null,
                defaultDosing: withDosing && !isDosingEmpty(dosing) ? normalizeDosing(dosing) : null,
                categoryId: category.categoryId,
                subCategoryId: category.subCategoryId,
            });
            toast.success(savedText);
            onClose();
            return true;
        } catch (error) {
            const {fields, others} = splitFormErrors(error, INPUT_FIELDS);
            setErrors(fields);
            others.forEach(message => toast.error(message));
            // The lists were stale: a category or subcategory was deleted meanwhile
            const codes = toApiError(error)?.errors.map(e => e.code) ?? [];
            if (codes.includes("categoryNotFound") || codes.includes("subCategoryNotFound")) onReloadCategories();
            return false;
        }
    });

    const nameError = showRequired && !name.trim() ? t("errors.nameRequired") : errors.name;
    const categoryError = showRequired && category.categoryId === null ? t("errors.categoryRequired") : errors.categoryId;
    const wrap = {"& textarea, & input": {overflowWrap: "anywhere"}};

    return (
        <DialogForm onSubmit={submit}>
            <DialogContent sx={{pt: 1}}>
                <Stack sx={{gap: 2, pt: 1}}>
                    <TextField
                        label={t("drugs.name")}
                        value={name}
                        onChange={(e) => {
                            setName(e.target.value);
                            clearError("name");
                        }}
                        error={!!nameError}
                        helperText={nameError}
                        // Drug names may be typed in any language, so follow the text's direction
                        slotProps={{htmlInput: {dir: "auto", maxLength: 256}}}
                        required
                        autoFocus
                        fullWidth
                    />
                    <TextField
                        label={t("drugs.activeIngredients")}
                        value={activeIngredients}
                        onChange={(e) => {
                            setActiveIngredients(e.target.value);
                            clearError("activeIngredients");
                        }}
                        error={!!errors.activeIngredients}
                        helperText={errors.activeIngredients}
                        slotProps={{htmlInput: {dir: "auto", maxLength: 1000}}}
                        fullWidth
                        sx={wrap}
                    />
                    <CategoryFields
                        categories={categories}
                        categoryId={category.categoryId}
                        subCategoryId={category.subCategoryId}
                        onChange={(value) => {
                            setCategory(value);
                            setErrors(current => ({...current, categoryId: undefined, subCategoryId: undefined}));
                        }}
                        categoryError={categoryError}
                        subCategoryError={errors.subCategoryId}
                    />
                    <TextField
                        label={t("drugs.description")}
                        value={description}
                        onChange={(e) => {
                            setDescription(e.target.value);
                            clearError("description");
                        }}
                        error={!!errors.description}
                        helperText={errors.description}
                        slotProps={{htmlInput: {dir: "auto"}}}
                        multiline
                        minRows={3}
                        fullWidth
                        sx={wrap}
                    />
                    {withDosing && (
                        <>
                            <Divider/>
                            <div>
                                <Typography variant="subtitle2" sx={{fontWeight: 700}}>{t("dosing.title")}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{mb: 1.5}}>{t("dosing.hint")}</Typography>
                                <DosingFields value={dosing} onChange={(value) => {
                                    setDosing(value);
                                    clearError("defaultDosing");
                                }} showErrors={showDosingErrors}/>
                                {errors.defaultDosing && (
                                    <Typography variant="body2" color="error" role="alert" sx={{mt: 1}}>{errors.defaultDosing}</Typography>
                                )}
                            </div>
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onClose} disabled={isPending}>{t("common.cancel")}</Button>
                <Button type="submit" variant="contained" disabled={isPending || done}>
                    {isPending ? t("common.saving") : t("common.save")}
                </Button>
            </DialogActions>
        </DialogForm>
    );
};
