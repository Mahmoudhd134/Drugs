import {useCallback, useState} from "react";
import {
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    Stack,
    Typography,
} from "@mui/material";
import {useTranslation} from "react-i18next";
import {DosingText} from "../../dosing/components/DosingText.tsx";
import {isDosingEmpty, type Dosing, type Eye} from "../../dosing/types.ts";

/** Eyes offered when a group's "ask" lines are added */
const CHOOSABLE_EYES: Eye[] = ["right", "left", "both"];

type EyeRequest = { groupName: string; resolve: (eye: Eye | null) => void };

type ConflictRequest = {
    drugName: string;
    current: Dosing;
    incoming: Dosing;
    /** Conflicts still to come after this one */
    remaining: number;
    resolve: (answer: ConflictAnswer) => void;
};

export type ConflictAnswer = { replace: boolean; applyToRemaining: boolean };

/**
 * Promise-based dialogs used while adding a group to a prescription:
 * `await askEye(groupName)` and `await askConflict({...})`. Render `dialogs` in the page.
 */
export const useGroupAddDialogs = () => {
    const {t} = useTranslation();
    const [eyeRequest, setEyeRequest] = useState<EyeRequest | null>(null);
    const [conflict, setConflict] = useState<ConflictRequest | null>(null);
    const [applyToRemaining, setApplyToRemaining] = useState(false);

    const askEye = useCallback(
        (groupName: string) => new Promise<Eye | null>(resolve => setEyeRequest({groupName, resolve})),
        []
    );

    const askConflict = useCallback(
        (request: Omit<ConflictRequest, "resolve">) => new Promise<ConflictAnswer>(resolve => {
            setApplyToRemaining(false);
            setConflict({...request, resolve});
        }),
        []
    );

    const answerEye = (eye: Eye | null) => {
        eyeRequest?.resolve(eye);
        setEyeRequest(null);
    };

    const answerConflict = (replace: boolean) => {
        conflict?.resolve({replace, applyToRemaining});
        setConflict(null);
    };

    const dosingBox = (label: string, dosing: Dosing) => (
        <Box sx={{flex: 1, p: 1.5, borderRadius: 2, bgcolor: "action.hover"}}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            {isDosingEmpty(dosing)
                ? <Typography color="text.disabled">{t("dosing.noDosing")}</Typography>
                : <DosingText dosing={dosing}/>}
        </Box>
    );

    const dialogs = (
        <>
            <Dialog open={!!eyeRequest} onClose={() => answerEye(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{t("prescription.chooseEyeTitle")}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{mb: 2}}>
                        {t("prescription.chooseEyeMessage", {name: eyeRequest?.groupName})}
                    </DialogContentText>
                    <Stack direction="row" sx={{gap: 1}}>
                        {CHOOSABLE_EYES.map(eye => (
                            <Button key={eye} variant="contained" fullWidth size="large" onClick={() => answerEye(eye)}>
                                {t(`dosing.eyes.${eye}`)}
                            </Button>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{px: 3, pb: 2}}>
                    <Button onClick={() => answerEye(null)}>{t("common.cancel")}</Button>
                </DialogActions>
            </Dialog>

            {/* Closing without choosing keeps the current line */}
            <Dialog open={!!conflict} onClose={() => answerConflict(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{t("prescription.conflictTitle")}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{mb: 2}}>
                        {t("prescription.conflictMessage", {name: conflict?.drugName})}
                    </DialogContentText>
                    {conflict && (
                        <Stack direction={{xs: "column", sm: "row"}} sx={{gap: 1.5}}>
                            {dosingBox(t("prescription.conflictCurrent"), conflict.current)}
                            {dosingBox(t("prescription.conflictIncoming"), conflict.incoming)}
                        </Stack>
                    )}
                    {!!conflict?.remaining && (
                        <FormControlLabel
                            sx={{mt: 1.5}}
                            control={<Checkbox checked={applyToRemaining} onChange={(e) => setApplyToRemaining(e.target.checked)}/>}
                            label={t("prescription.applyToRemaining", {count: conflict.remaining})}
                        />
                    )}
                </DialogContent>
                <DialogActions sx={{px: 3, pb: 2}}>
                    <Button onClick={() => answerConflict(false)}>{t("prescription.keepCurrent")}</Button>
                    <Button variant="contained" onClick={() => answerConflict(true)}>{t("prescription.useGroup")}</Button>
                </DialogActions>
            </Dialog>
        </>
    );

    return {askEye, askConflict, dialogs};
};
