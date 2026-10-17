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
import {dosingToText} from "../../dosing/dosingText.ts";
import type {Dosing, Eye} from "../../dosing/types.ts";

/** Eyes offered when a group's "ask" lines are added */
const CHOOSABLE_EYES: Eye[] = ["right", "left", "both"];

type EyeRequest = { groupName: string; resolve: (eye: Eye | null) => void };

type ConflictRequest = {
    /**
     * "prescription" (default): the group's line against the one already in the prescription. "group": two lines of the
     * group that give the same drug for the eye just chosen (an "ask" line and a line for that eye): first vs second.
     */
    variant?: "prescription" | "group";
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
    // Each request stays rendered until its dialog has faded out (onExited), so the closing dialog keeps its text;
    // `…Open` says whether it is still waiting for an answer
    const [eyeRequest, setEyeRequest] = useState<EyeRequest | null>(null);
    const [eyeOpen, setEyeOpen] = useState(false);
    const [conflict, setConflict] = useState<ConflictRequest | null>(null);
    const [conflictOpen, setConflictOpen] = useState(false);
    const [applyToRemaining, setApplyToRemaining] = useState(false);

    const askEye = useCallback(
        (groupName: string) => new Promise<Eye | null>(resolve => {
            setEyeRequest({groupName, resolve});
            setEyeOpen(true);
        }),
        []
    );

    const askConflict = useCallback(
        (request: Omit<ConflictRequest, "resolve">) => new Promise<ConflictAnswer>(resolve => {
            setApplyToRemaining(false);
            setConflict({...request, resolve});
            setConflictOpen(true);
        }),
        []
    );

    const answerEye = (eye: Eye | null) => {
        if (!eyeOpen) return;
        eyeRequest?.resolve(eye);
        setEyeOpen(false);
    };

    const answerConflict = (replace: boolean) => {
        if (!conflictOpen) return;
        conflict?.resolve({replace, applyToRemaining});
        setConflictOpen(false);
    };

    const inGroup = conflict?.variant === "group";

    const dosingBox = (label: string, dosing: Dosing) => (
        <Box sx={{flex: 1, p: 1.5, borderRadius: 2, bgcolor: "action.hover"}}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            {/* Nothing to write (empty, or only «بدون عين») */}
            {!dosingToText(dosing)
                ? <Typography color="text.secondary">{t("dosing.noDosing")}</Typography>
                : <DosingText dosing={dosing}/>}
        </Box>
    );

    const dialogs = (
        <>
            {/* A click outside doesn't answer (the second click of a double click on the group would cancel it): Cancel or Esc */}
            <Dialog open={eyeOpen} onClose={(_, reason) => reason !== "backdropClick" && answerEye(null)}
                    slotProps={{transition: {onExited: () => !eyeOpen && setEyeRequest(null)}}} maxWidth="xs" fullWidth>
                <DialogTitle>{t("prescription.chooseEyeTitle")}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{mb: 2, overflowWrap: "anywhere"}}>
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

            {/* Esc keeps the current line (the first, in the group variant); a click outside does nothing */}
            <Dialog open={conflictOpen} onClose={(_, reason) => reason !== "backdropClick" && answerConflict(false)}
                    slotProps={{transition: {onExited: () => !conflictOpen && setConflict(null)}}} maxWidth="sm" fullWidth>
                <DialogTitle>{t(inGroup ? "prescription.groupClashTitle" : "prescription.conflictTitle")}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{mb: 2, overflowWrap: "anywhere"}}>
                        {t(inGroup ? "prescription.groupClashMessage" : "prescription.conflictMessage", {name: conflict?.drugName})}
                    </DialogContentText>
                    {conflict && (
                        <Stack direction={{xs: "column", sm: "row"}} sx={{gap: 1.5}}>
                            {dosingBox(t(inGroup ? "prescription.groupClashFirst" : "prescription.conflictCurrent"), conflict.current)}
                            {dosingBox(t(inGroup ? "prescription.groupClashSecond" : "prescription.conflictIncoming"), conflict.incoming)}
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
                    <Button onClick={() => answerConflict(false)}>{t(inGroup ? "prescription.useFirst" : "prescription.keepCurrent")}</Button>
                    <Button variant="contained" onClick={() => answerConflict(true)}>
                        {t(inGroup ? "prescription.useSecond" : "prescription.useGroup")}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );

    return {askEye, askConflict, dialogs};
};
