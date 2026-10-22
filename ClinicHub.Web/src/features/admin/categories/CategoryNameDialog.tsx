import {useState} from "react";
import {Button, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography} from "@mui/material";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {splitFormErrors} from "../../../api/errors.ts";
import {DialogForm} from "../../../components/common/DialogForm.tsx";
import {FormDialog} from "../../../components/common/FormDialog.tsx";
import {useDialogSave} from "../../../hooks/useDialogSave.ts";
import {useOpeningKey} from "../../../hooks/useOpeningKey.ts";
import {useSaveCategory, useSaveSubCategory} from "./api.ts";
import type {SaveCategory} from "./types.ts";

/** What the dialog edits: a new or existing category, or a new or existing subcategory of `categoryId`. */
export type CategoryNameTarget =
    | { kind: "category"; id: number | null; names: SaveCategory | null }
    | { kind: "subCategory"; id: number | null; categoryId: number; parentName: string; names: SaveCategory | null };

type Props = {
    open: boolean;
    target: CategoryNameTarget | null;
    onClose: () => void;
};

/**
 * Adds or renames a category or a subcategory (design M1.7 D5, D9): both names required, the English one LTR, the
 * Arabic one RTL; `categoryNameTaken` / `subCategoryNameTaken` show on the name the API names. Locked while saving and
 * after a successful save; each opening starts from the given row (empty for a new one).
 */
export const CategoryNameDialog = ({open, target, onClose}: Props) => {
    const {t} = useTranslation();
    const opening = useOpeningKey(open);
    const isNew = target?.id === null;
    const title = target?.kind === "subCategory"
        ? t(isNew ? "adminCategories.newSubCategory" : "adminCategories.renameSubCategory")
        : t(isNew ? "adminCategories.newCategory" : "adminCategories.renameCategory");

    return (
        // Not closable while saving: the result would come after the dialog is gone
        <FormDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>
                {title}
                {target?.kind === "subCategory" && (
                    <Typography color="text.secondary" sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{target.parentName}</Typography>
                )}
            </DialogTitle>
            {target && <NameForm key={opening} target={target} onClose={onClose}/>}
        </FormDialog>
    );
};

const FIELDS = ["nameEn", "nameAr"] as const;
type Field = typeof FIELDS[number];

const NameForm = ({target, onClose}: { target: CategoryNameTarget; onClose: () => void }) => {
    const {t} = useTranslation();
    const saveCategory = useSaveCategory();
    const saveSubCategory = useSaveSubCategory();
    const isPending = saveCategory.isPending || saveSubCategory.isPending;
    const [names, setNames] = useState<SaveCategory>(target.names ?? {nameEn: "", nameAr: ""});
    const [showRequired, setShowRequired] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

    const {submit, done} = useDialogSave(async () => {
        if (!names.nameEn.trim() || !names.nameAr.trim()) {
            setShowRequired(true);
            return false;
        }
        const body = {nameEn: names.nameEn.trim(), nameAr: names.nameAr.trim()};
        const isNew = target.id === null;
        try {
            if (target.kind === "category") {
                await saveCategory.mutateAsync({id: target.id, ...body});
                toast.success(t(isNew ? "adminCategories.created" : "adminCategories.renamed"));
            } else {
                await saveSubCategory.mutateAsync({id: target.id, categoryId: target.categoryId, ...body});
                toast.success(t(isNew ? "adminCategories.subCreated" : "adminCategories.subRenamed"));
            }
            onClose();
            return true;
        } catch (error) {
            const {fields, others} = splitFormErrors(error, FIELDS);
            setErrors(fields);
            others.forEach(message => toast.error(message));
            return false;
        }
    });

    const errorOf = (field: Field) => (showRequired && !names[field].trim() ? t("errors.nameRequired") : errors[field]);
    const input = (field: Field, label: string, dir: "ltr" | "rtl", autoFocus: boolean) => (
        <TextField
            label={label}
            value={names[field]}
            onChange={(e) => {
                setNames(current => ({...current, [field]: e.target.value}));
                setErrors(current => ({...current, [field]: undefined}));
            }}
            error={!!errorOf(field)}
            helperText={errorOf(field)}
            slotProps={{htmlInput: {dir, maxLength: 100}}}
            required
            autoFocus={autoFocus}
            fullWidth
        />
    );

    return (
        <DialogForm onSubmit={submit}>
            <DialogContent sx={{pt: 1}}>
                <Stack sx={{gap: 2, pt: 1}}>
                    {input("nameEn", t("adminCategories.nameEn"), "ltr", true)}
                    {input("nameAr", t("adminCategories.nameAr"), "rtl", false)}
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
