import type {Dispatch, SetStateAction} from "react";
import {Box, Grid, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography} from "@mui/material";
import {useTranslation} from "react-i18next";
import {
    DOSE_UNITS,
    DURATION_UNITS,
    durationNeedsValue,
    dosingErrors,
    EYES,
    type Dosing,
    type DoseUnit,
    type DurationUnit,
    type Eye,
    FREQUENCIES,
    type Frequency,
    frequencyNeedsValue,
    MAX_FREQUENCY_TEXT_LENGTH,
} from "../types.ts";
import {dosingToText} from "../dosingText.ts";

type Props = {
    value: Dosing;
    /** A state setter: changes are merged into the latest value, so quick successive edits are kept */
    onChange: Dispatch<SetStateAction<Dosing>>;
    /** Highlight invalid fields (e.g. after a save attempt) */
    showErrors?: boolean;
};

const toNumber = (text: string) => (text.trim() === "" ? null : Number(text));

/** Dose, frequency, duration and eye inputs with a live preview of the Arabic prescription text. */
export const DosingFields = ({value, onChange, showErrors}: Props) => {
    const {t} = useTranslation();
    const errors = showErrors ? dosingErrors(value) : [];
    const set = (patch: Partial<Dosing>) => onChange(current => ({...current, ...patch}));
    const preview = dosingToText(value);

    return (
        <Box>
            <Grid container spacing={1.5}>
                <Grid size={{xs: 5, sm: 4}}>
                    <TextField
                        label={t("dosing.amount")}
                        type="number"
                        size="small"
                        fullWidth
                        value={value.doseAmount ?? ""}
                        onChange={(e) => set({doseAmount: toNumber(e.target.value)})}
                        error={errors.includes("doseAmount")}
                        slotProps={{htmlInput: {min: 0, step: 0.5}}}
                    />
                </Grid>
                <Grid size={{xs: 7, sm: 8}}>
                    <TextField
                        select
                        label={t("dosing.unit")}
                        size="small"
                        fullWidth
                        value={value.doseUnit ?? ""}
                        onChange={(e) => set({doseUnit: (e.target.value || null) as DoseUnit | null})}
                        error={errors.includes("doseUnit")}
                    >
                        <MenuItem value="">{t("dosing.none")}</MenuItem>
                        {DOSE_UNITS.map(u => <MenuItem key={u} value={u}>{t(`dosing.units.${u}`)}</MenuItem>)}
                    </TextField>
                </Grid>

                <Grid size={{xs: frequencyNeedsValue(value.frequency) ? 7 : 12, sm: frequencyNeedsValue(value.frequency) ? 8 : 12}}>
                    <TextField
                        select
                        label={t("dosing.frequency")}
                        size="small"
                        fullWidth
                        value={value.frequency ?? ""}
                        onChange={(e) => set({frequency: (e.target.value || null) as Frequency | null})}
                    >
                        <MenuItem value="">{t("dosing.none")}</MenuItem>
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
                        label={t("dosing.durationUnit")}
                        size="small"
                        fullWidth
                        value={value.durationUnit ?? ""}
                        onChange={(e) => set({durationUnit: (e.target.value || null) as DurationUnit | null})}
                    >
                        <MenuItem value="">{t("dosing.none")}</MenuItem>
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
                        onChange={(_, eye: Eye | null) => set({eye})}
                        sx={{flexWrap: "wrap"}}
                    >
                        {EYES.map(e => <ToggleButton key={e} value={e} sx={{px: 2}}>{t(`dosing.eyes.${e}`)}</ToggleButton>)}
                    </ToggleButtonGroup>
                </Grid>
            </Grid>

            <Box sx={{mt: 2, p: 1.5, borderRadius: 2, bgcolor: "action.hover"}}>
                <Typography variant="caption" color="text.secondary">{t("dosing.preview")}</Typography>
                <Typography dir="rtl" lang="ar" sx={{fontWeight: 500}} color={preview ? "text.primary" : "text.disabled"}>
                    {preview || t("dosing.noDosing")}
                </Typography>
            </Box>
        </Box>
    );
};
