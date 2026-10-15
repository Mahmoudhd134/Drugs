import {type FormEvent, useState} from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Stack,
    TextField,
    Typography,
    useMediaQuery,
} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {getErrorMessage} from "../../../api/errors.ts";
import {DialogForm} from "../../../components/common/DialogForm.tsx";
import {useSingleFlight} from "../../../hooks/useSingleFlight.ts";
import {useSaveDrug} from "../api.ts";
import type {Drug} from "../types.ts";
import {DrugText} from "./DrugText.tsx";
import {DosingFields} from "../../dosing/components/DosingFields.tsx";
import {dosingErrors, isDosingEmpty, normalizeDosing, type Dosing} from "../../dosing/types.ts";

type Props = {
    open: boolean;
    /** null to create a new drug */
    drug: Drug | null;
    /** Show the drug's details without editing (no edit permission) */
    readOnly?: boolean;
    onClose: () => void;
};

export const DrugFormDialog = ({open, drug, readOnly, onClose}: Props) => {
    const {t} = useTranslation();
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
            <DialogTitle>{drug === null ? t("drugs.new") : readOnly ? t("drugs.details") : t("drugs.edit")}</DialogTitle>
            {readOnly && drug !== null ? (
                <>
                    <DialogContent sx={{pt: 1}}>
                        <DrugText drug={drug} showDosing/>
                    </DialogContent>
                    <DialogActions sx={{px: 3, pb: 2}}>
                        <Button onClick={onClose}>{t("common.close")}</Button>
                    </DialogActions>
                </>
            ) : (
                // The dialog unmounts this after closing, so it starts from the given drug on each open
                <DrugForm drug={drug} onClose={onClose}/>
            )}
        </Dialog>
    );
};

const DrugForm = ({drug, onClose}: { drug: Drug | null; onClose: () => void }) => {
    const {t} = useTranslation();
    const saveDrug = useSaveDrug();
    const once = useSingleFlight();
    const [name, setName] = useState(drug?.name ?? "");
    const [description, setDescription] = useState(drug?.description ?? "");
    const [dosing, setDosing] = useState<Dosing>(drug?.defaultDosing ?? {});
    const [showNameRequired, setShowNameRequired] = useState(false);
    const [showDosingErrors, setShowDosingErrors] = useState(false);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        void once(save);
    };

    // One save at a time (a double click would add the drug twice)
    const save = async () => {
        if (!name.trim()) {
            setShowNameRequired(true);
            return;
        }
        if (dosingErrors(dosing).length) {
            setShowDosingErrors(true);
            return;
        }

        try {
            await saveDrug.mutateAsync({
                id: drug?.id ?? null,
                name: name.trim(),
                description: description.trim() || null,
                defaultDosing: isDosingEmpty(dosing) ? null : normalizeDosing(dosing),
            });
            toast.success(drug === null ? t("drugs.created") : t("drugs.updated"));
            onClose();
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const nameError = showNameRequired && !name.trim();

    return (
        <DialogForm onSubmit={handleSubmit}>
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
                        minRows={3}
                        fullWidth
                    />
                    <Divider/>
                    <div>
                        <Typography variant="subtitle2" sx={{fontWeight: 700}}>{t("dosing.title")}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{mb: 1.5}}>{t("dosing.hint")}</Typography>
                        <DosingFields value={dosing} onChange={setDosing} showErrors={showDosingErrors}/>
                    </div>
                </Stack>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onClose} disabled={saveDrug.isPending}>{t("common.cancel")}</Button>
                <Button type="submit" variant="contained" disabled={saveDrug.isPending}>
                    {saveDrug.isPending ? t("common.saving") : t("common.save")}
                </Button>
            </DialogActions>
        </DialogForm>
    );
};
