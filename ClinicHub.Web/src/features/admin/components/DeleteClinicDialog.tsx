import {type FormEvent, useState} from "react";
import {Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography} from "@mui/material";
import {useTranslation} from "react-i18next";

type Props = {
    open: boolean;
    clinicName: string;
    pending: boolean;
    onConfirm: () => void;
    onClose: () => void;
};

/**
 * A name as it can be typed: the same Unicode form, no invisible format characters (e.g. a zero-width space), and
 * spaces as one (the page shows "a  b" as "a b").
 */
const typable = (name: string) => name.normalize("NFC").replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim();

/** Deleting is final (no restore in the app), so the clinic's name must be typed first. */
export const DeleteClinicDialog = ({open, clinicName, pending, onConfirm, onClose}: Props) => (
    <Dialog open={open} onClose={pending ? undefined : onClose} maxWidth="sm" fullWidth>
        {/* Unmounted after closing, so each open starts empty */}
        <DeleteForm clinicName={clinicName} pending={pending} onConfirm={onConfirm} onClose={onClose}/>
    </Dialog>
);

const DeleteForm = ({clinicName, pending, onConfirm, onClose}: Omit<Props, "open">) => {
    const {t} = useTranslation();
    const [typed, setTyped] = useState("");
    const matches = typable(typed) !== "" && typable(typed) === typable(clinicName);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (matches && !pending) onConfirm();
    };

    return (
        <form onSubmit={handleSubmit} noValidate>
            <DialogTitle>{t("admin.clinic.deleteTitle")}</DialogTitle>
            <DialogContent>
                <Stack sx={{gap: 2}}>
                    <Alert severity="error">{t("admin.clinic.deleteMessage")}</Alert>
                    <Typography variant="body2">
                        {t("admin.clinic.deleteTypeName")}{" "}
                        {/* A long unbroken name wraps instead of widening the dialog */}
                        <Typography component="span" variant="body2" dir="auto" sx={{fontWeight: 700, overflowWrap: "anywhere"}}>
                            {clinicName}
                        </Typography>
                    </Typography>
                    <TextField
                        label={t("admin.clinic.name")}
                        helperText={t("admin.clinic.deleteTypeHint")}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        disabled={pending}
                        autoComplete="off"
                        autoFocus
                        fullWidth
                        slotProps={{htmlInput: {dir: "auto", maxLength: 256}}}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onClose} disabled={pending}>{t("common.cancel")}</Button>
                <Button type="submit" variant="contained" color="error" disabled={!matches || pending}>
                    {pending ? t("admin.clinic.deleting") : t("admin.clinic.delete")}
                </Button>
            </DialogActions>
        </form>
    );
};
