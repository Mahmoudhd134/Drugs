import type {Dispatch, SetStateAction} from "react";
import {
    Box,
    FormControlLabel,
    Grid,
    MenuItem,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from "@mui/material";
import {useTranslation} from "react-i18next";
import {InfoTip} from "../../../components/common/InfoTip.tsx";
import {
    ASK_EYE,
    DOSE_UNITS,
    DURATION_UNITS,
    durationNeedsValue,
    dosingErrors,
    EYES,
    type Dosing,
    type DoseUnit,
    type DurationUnit,
    type DosingEye,
    FREQUENCIES,
    type Frequency,
    frequencyNeedsValue,
    MAX_FREQUENCY_TEXT_LENGTH,
    mergeDosing,
    normalizeDosing,
    type TaperStep,
} from "../types.ts";
import {dosingToText} from "../dosingText.ts";
import {startSchedule} from "../taper.ts";
import {TaperStepsEditor} from "./TaperStepsEditor.tsx";

type Props = {
    value: Dosing;
    /** A state setter: changes are merged into the latest value, so quick successive edits are kept */
    onChange: Dispatch<SetStateAction<Dosing>>;
    /** Highlight invalid fields (e.g. after a save attempt) */
    showErrors?: boolean;
    /**
     * Inherit mode (protocol lines): the value is an override of this base dosing. Empty fields
     * show as "Drug default" and the preview shows the merged result.
     */
    inheritFrom?: Dosing | null;
    /** Offer the "ask when adding" eye (protocol lines only) */
    allowAskEye?: boolean;
};

const toNumber = (text: string) => (text.trim() === "" ? null : Number(text));

/** Dose, frequency, duration and eye inputs with a live preview of the Arabic prescription text. */
export const DosingFields = ({value, onChange, showErrors, inheritFrom, allowAskEye}: Props) => {
    const {t} = useTranslation();
    const errors = showErrors ? dosingErrors(value) : [];
    const set = (patch: Partial<Dosing>) => onChange(current => ({...current, ...patch}));
    const inheritMode = inheritFrom !== undefined;
    const effective = inheritMode ? mergeDosing(inheritFrom, value) : value;
    const preview = dosingToText(effective);
    const emptyLabel = inheritMode ? t("dosing.inherit") : t("dosing.none");
    const eyes: DosingEye[] = allowAskEye ? [...EYES, ASK_EYE] : [...EYES];
    // In inherit mode an empty select shows "Drug default" instead of looking blank
    const inheritSelectProps = inheritMode
        ? {select: {displayEmpty: true}, inputLabel: {shrink: true}}
        : undefined;

    const tapering = !!value.taperSteps;
    const inheritsTaper = inheritMode && !tapering && !value.frequency && !value.durationUnit
        && !!normalizeDosing(inheritFrom).taperSteps;

    // On: the steps start from the current (or inherited) schedule. Off: the first step is kept.
    const toggleTaper = (on: boolean) => onChange(current => {
        if (on) {
            const from = inheritMode ? mergeDosing(inheritFrom, current) : normalizeDosing(current);
            return {
                ...current,
                frequency: null, frequencyValue: null, frequencyText: null, durationValue: null, durationUnit: null,
                taperSteps: from.taperSteps ? from.taperSteps.map(s => ({...s})) : startSchedule(from),
            };
        }
        const first: TaperStep = current.taperSteps?.[0] ?? {};
        return {
            ...current,
            taperSteps: null,
            frequency: first.frequency ?? null,
            frequencyValue: first.frequencyValue ?? null,
            durationValue: first.durationValue ?? null,
            durationUnit: first.durationUnit ?? null,
        };
    });
    const setSteps = (update: (steps: TaperStep[]) => TaperStep[]) =>
        onChange(current => ({...current, taperSteps: update(current.taperSteps ?? [])}));

    return (
        <Box>
            <Grid container spacing={1.5}>
                <Grid size={{xs: 5, sm: 4}}>
                    <Tooltip title={t("dosing.amountInfo")} placement="top" enterDelay={600}>
                        <TextField
                            label={t("dosing.amount")}
                            type="number"
                            size="small"
                            fullWidth
                            value={value.doseAmount ?? ""}
                            onChange={(e) => set({doseAmount: toNumber(e.target.value)})}
                            error={errors.includes("doseAmount")}
                            placeholder={inheritMode ? t("dosing.inherit") : undefined}
                            slotProps={{htmlInput: {min: 0, step: 0.5}, inputLabel: inheritMode ? {shrink: true} : undefined}}
                        />
                    </Tooltip>
                </Grid>
                <Grid size={{xs: 7, sm: 8}}>
                    <TextField
                        select
                        slotProps={inheritSelectProps}
                        label={t("dosing.unit")}
                        size="small"
                        fullWidth
                        value={value.doseUnit ?? ""}
                        onChange={(e) => set({doseUnit: (e.target.value || null) as DoseUnit | null})}
                        error={errors.includes("doseUnit")}
                    >
                        <MenuItem value="">{emptyLabel}</MenuItem>
                        {DOSE_UNITS.map(u => <MenuItem key={u} value={u}>{t(`dosing.units.${u}`)}</MenuItem>)}
                    </TextField>
                </Grid>

                <Grid size={12}>
                    <Stack direction="row" sx={{alignItems: "center"}}>
                        <FormControlLabel
                            control={<Switch checked={tapering} onChange={(e) => toggleTaper(e.target.checked)}/>}
                            label={t("dosing.taper.label")}
                            sx={{marginInlineEnd: 0}}
                        />
                        <InfoTip title={t("dosing.taper.info")}/>
                    </Stack>
                    {inheritsTaper && (
                        <Typography variant="caption" color="text.secondary" component="div">{t("dosing.taper.inherited")}</Typography>
                    )}
                </Grid>
                {tapering ? (
                    <Grid size={12}>
                        <TaperStepsEditor
                            steps={value.taperSteps ?? []}
                            onChange={setSteps}
                            errors={errors}
                            doseUnit={effective.doseUnit}
                            lineDose={effective.doseAmount}
                        />
                    </Grid>
                ) : (
                    <>
                    <Grid size={{xs: frequencyNeedsValue(value.frequency) ? 7 : 12, sm: frequencyNeedsValue(value.frequency) ? 8 : 12}}>
                        <TextField
                            select
                            slotProps={inheritSelectProps}
                            label={t("dosing.frequency")}
                            size="small"
                            fullWidth
                            value={value.frequency ?? ""}
                            onChange={(e) => set({frequency: (e.target.value || null) as Frequency | null})}
                        >
                            <MenuItem value="">{emptyLabel}</MenuItem>
                            {FREQUENCIES.map(f => <MenuItem key={f} value={f}>{t(`dosing.frequencies.${f}`)}</MenuItem>)}
                        </TextField>
                    </Grid>
                    {frequencyNeedsValue(value.frequency) && (
                        <Grid size={{xs: 5, sm: 4}}>
                            <TextField
                                label={value.frequency === "daily" ? t("dosing.timesPerDay") : t("dosing.hours")}
                                type="number"
                                size="small"
                                fullWidth
                                value={value.frequencyValue ?? ""}
                                onChange={(e) => set({frequencyValue: toNumber(e.target.value)})}
                                error={errors.includes("frequencyValue")}
                                slotProps={{htmlInput: {min: 1, step: 1}}}
                            />
                        </Grid>
                    )}
                    {value.frequency === "custom" && (
                        <Grid size={12}>
                            <TextField
                                label={t("dosing.customFrequency")}
                                size="small"
                                fullWidth
                                value={value.frequencyText ?? ""}
                                onChange={(e) => set({frequencyText: e.target.value})}
                                error={errors.includes("frequencyText")}
                                slotProps={{htmlInput: {dir: "auto", maxLength: MAX_FREQUENCY_TEXT_LENGTH}}}
                            />
                        </Grid>
                    )}

                    <Grid size={{xs: durationNeedsValue(value.durationUnit) ? 7 : 12, sm: durationNeedsValue(value.durationUnit) ? 8 : 12}}>
                        <TextField
                            select
                            slotProps={inheritSelectProps}
                            label={t("dosing.durationUnit")}
                            size="small"
                            fullWidth
                            value={value.durationUnit ?? ""}
                            onChange={(e) => set({durationUnit: (e.target.value || null) as DurationUnit | null})}
                        >
                            <MenuItem value="">{emptyLabel}</MenuItem>
                            {DURATION_UNITS.map(u => <MenuItem key={u} value={u}>{t(`dosing.durations.${u}`)}</MenuItem>)}
                        </TextField>
                    </Grid>

                    {durationNeedsValue(value.durationUnit) && (
                        <Grid size={{xs: 5, sm: 4}}>
                            <TextField
                                label={t("dosing.durationValue")}
                                type="number"
                                size="small"
                                fullWidth
                                value={value.durationValue ?? ""}
                                onChange={(e) => set({durationValue: toNumber(e.target.value)})}
                                error={errors.includes("durationValue")}
                                slotProps={{htmlInput: {min: 1, step: 1}}}
                            />
                        </Grid>
                    )}
                    </>
                )}
                <Grid size={12}>
                    <Typography variant="caption" color="text.secondary" component="div" sx={{mb: 0.5}}>
                        {t("dosing.eye")}
                    </Typography>
                    <ToggleButtonGroup
                        exclusive
                        size="small"
                        color="primary"
                        value={value.eye ?? null}
                        // Clicking the selected eye again clears it
                        onChange={(_, eye: DosingEye | null) => set({eye})}
                        sx={{flexWrap: "wrap"}}
                    >
                        {eyes.map(e => e === ASK_EYE ? (
                            <Tooltip key={e} title={t("dosing.askEyeInfo")}>
                                <ToggleButton value={e} sx={{px: 2}}>{t("dosing.askEye")}</ToggleButton>
                            </Tooltip>
                        ) : (
                            <ToggleButton key={e} value={e} sx={{px: 2}}>{t(`dosing.eyes.${e}`)}</ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                </Grid>
            </Grid>

            <Box sx={{mt: 2, p: 1.5, borderRadius: 2, bgcolor: "action.hover"}}>
                <Typography variant="caption" color="text.secondary">{t("dosing.preview")}</Typography>
                <Typography dir="rtl" lang="ar" sx={{fontWeight: 500}} color={preview ? "text.primary" : "text.secondary"}>
                    {preview || t("dosing.noDosing")}
                </Typography>
                {effective.eye === ASK_EYE && (
                    <Typography variant="caption" color="secondary.main">{t("dosing.askEyeHint")}</Typography>
                )}
            </Box>
        </Box>
    );
};
