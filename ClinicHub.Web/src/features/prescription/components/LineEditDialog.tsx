import {useState} from "react";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
    useMediaQuery,
} from "@mui/material";
import {useTheme} from "@mui/material/styles";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {DosingFields} from "../../dosing/components/DosingFields.tsx";
import {dosingErrors, normalizeDosing, type Dosing} from "../../dosing/types.ts";
import type {PrescriptionLine} from "../types.ts";

type Props = {
    /** The line being edited; null when closed */
    line: PrescriptionLine | null;
    onClose: () => void;
    /** Returns false when the change clashes with another line (same drug, same eye) */
    onSave: (key: string, changes: Pick<PrescriptionLine, "dosing" | "note">) => boolean;
};

export const LineEditDialog = ({line, onClose, onSave}: Props) => {
    const fullScreen = useMediaQuery(useTheme().breakpoints.down("sm"));

    return (
        <Dialog open={!!line} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
            {/* Keyed so the form restarts from each line's values */}
            {line && <LineForm key={line.key} line={line} onClose={onClose} onSave={onSave}/>}
        </Dialog>
    );
};

const LineForm = ({line, onClose, onSave}: { line: PrescriptionLine } & Omit<Props, "line">) => {
    const {t} = useTranslation();
    const [dosing, setDosing] = useState<Dosing>(line.dosing);
    const [note, setNote] = useState(line.note);
    const [showErrors, setShowErrors] = useState(false);

    const handleSave = () => {
        if (dosingErrors(dosing).length) {
            setShowErrors(true);
            return;
        }
        if (!onSave(line.key, {dosing: normalizeDosing(dosing), note: note.trim()})) {
            toast.error(t("prescription.eyeTaken", {name: line.drug.name}));
            return;
        }
        onClose();
    };

    return (
        <>
            <DialogTitle>
                {t("prescription.editLine")}
                <Typography color="text.secondary" sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{line.drug.name}</Typography>
            </DialogTitle>
            <DialogContent>
                <Stack sx={{gap: 2, pt: 1}}>
                    <DosingFields value={dosing} onChange={setDosing} showErrors={showErrors}/>
                    <TextField
                        label={t("prescription.lineNote")}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        slotProps={{htmlInput: {dir: "auto"}}}
                        multiline
                        minRows={2}
                        fullWidth
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{px: 3, pb: 2}}>
                <Button onClick={onClose}>{t("common.cancel")}</Button>
                <Button variant="contained" onClick={handleSave}>{t("common.save")}</Button>
            </DialogActions>
        </>
    );
};
