import {type FormEvent, useState} from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    useMediaQuery,
} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {getErrorMessage} from "../../../api/errors.ts";
import {useSaveDrug} from "../api.ts";
import type {Drug} from "../types.ts";

type Props = {
    open: boolean;
    /** null to create a new drug */
    drug: Drug | null;
    onClose: () => void;
};

export const DrugFormDialog = ({open, drug, onClose}: Props) => {
    const {t} = useTranslation();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
            <DialogTitle>{drug === null ? t("drugs.new") : t("drugs.edit")}</DialogTitle>
            {/* The dialog unmounts this after closing, so it starts from the given drug on each open */}
            <DrugForm drug={drug} onClose={onClose}/>
        </Dialog>
    );
};

const DrugForm = ({drug, onClose}: { drug: Drug | null; onClose: () => void }) => {
    const {t} = useTranslation();
    const save = useSaveDrug();
    const [name, setName] = useState(drug?.name ?? "");
    const [description, setDescription] = useState(drug?.description ?? "");
    const [showNameRequired, setShowNameRequired] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setShowNameRequired(true);
            return;
        }

        try {
            await save.mutateAsync({
                id: drug?.id ?? null,
                name: name.trim(),
                description: description.trim() || null,
            });
            toast.success(drug === null ? t("drugs.created") : t("drugs.updated"));
            onClose();
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const nameError = showNameRequired && !name.trim();

    return (
        <form onSubmit={handleSubmit} noValidate>
            <DialogContent sx={{pt: 1}}>
                <Stack sx={{gap: 2, pt: 1}}>
                    <TextField
                        label={t("drugs.name")}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        error={nameError}
                        helperText={nameError ? t("errors.nameRequired") : undefined}
                        // Drug names may be typed in any language, so follow the text's direction
                        slotProps={{htmlInput: {dir: "auto", maxLength: 256}}}
                        required
                        autoFocus
                        fullWidth
                    />
                    <TextField
                        label={t("drugs.description")}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        slotProps={{htmlInput: {dir: "auto"}}}
                        multiline
                        minRows={4}
                        fullWidth
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onClose} disabled={save.isPending}>{t("common.cancel")}</Button>
                <Button type="submit" variant="contained" disabled={save.isPending}>
                    {save.isPending ? t("common.saving") : t("common.save")}
                </Button>
            </DialogActions>
        </form>
    );
};
