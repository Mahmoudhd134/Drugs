import {useState} from "react";
import {Button, DialogActions, DialogContent, DialogTitle, TextField} from "@mui/material";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {getErrorMessage, getFieldErrors} from "../../../api/errors.ts";
import {FormDialog} from "../../../components/common/FormDialog.tsx";
import {useDialogSave} from "../../../hooks/useDialogSave.ts";
import {useOpeningKey} from "../../../hooks/useOpeningKey.ts";
import {useRenameClinic} from "../api.ts";
import type {ClinicDetails} from "../types.ts";

type Props = { open: boolean; clinic: ClinicDetails; onClose: () => void };

export const RenameClinicDialog = ({open, clinic, onClose}: Props) => {
    const {t} = useTranslation();
    const rename = useRenameClinic();
    // Each opening starts from the current name, also when reopened during the closing animation
    const opening = useOpeningKey(open);

    return (
        // Not closable while saving: the result would come after the dialog is gone
        <FormDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{t("admin.clinic.renameTitle")}</DialogTitle>
            <RenameForm key={opening} clinic={clinic} rename={rename} onClose={onClose}/>
        </FormDialog>
    );
};

type FormProps = { clinic: ClinicDetails; rename: ReturnType<typeof useRenameClinic>; onClose: () => void };

const RenameForm = ({clinic, rename, onClose}: FormProps) => {
    const {t} = useTranslation();
    const [name, setName] = useState(clinic.name);
    const [error, setError] = useState<string | null>(null);

    // One save at a time, locked once saved (a double click would send it twice)
    const {submit, done} = useDialogSave(async () => {
        if (!name.trim()) {
            setError(t("errors.nameRequired"));
            return false;
        }
        try {
            await rename.mutateAsync({id: clinic.id, name: name.trim()});
            toast.success(t("admin.clinic.renamed"));
            onClose();
            return true;
        } catch (err) {
            const fieldError = getFieldErrors(err).name;
            if (fieldError) setError(fieldError);
            else toast.error(getErrorMessage(err));
            return false;
        }
    });

    return (
        <form onSubmit={submit} noValidate>
            <DialogContent sx={{pt: 1}}>
                <TextField
                    label={t("admin.clinic.name")}
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        setError(null);
                    }}
                    error={error !== null}
                    helperText={error}
                    slotProps={{htmlInput: {dir: "auto", maxLength: 256}}}
                    required
                    autoFocus
                    fullWidth
                    sx={{mt: 1}}
                />
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onClose} disabled={rename.isPending}>{t("common.cancel")}</Button>
                <Button type="submit" variant="contained" disabled={rename.isPending || done}>
                    {rename.isPending ? t("common.saving") : t("common.save")}
                </Button>
            </DialogActions>
        </form>
    );
};
