import {Avatar, Box, Button, Chip, Grid, IconButton, MenuItem, Stack, TextField, Tooltip, Typography} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import {useTranslation} from "react-i18next";
import {TapTooltip} from "../../../components/common/TapTooltip.tsx";
import {
    ALLOW_STEP_DOSE,
    ENABLE_TAPER_GENERATOR,
    MAX_TAPER_STEPS,
    TAPER_LAST_STEP_DURATIONS,
    TAPER_STEP_DURATIONS,
    TAPER_STEP_FREQUENCIES,
} from "../taperConfig.ts";
import {addStep, taperTotal} from "../taper.ts";
import {
    type DoseUnit,
    durationNeedsValue,
    type DosingField,
    type DurationUnit,
    type Frequency,
    type TaperStep,
    type TaperStepField,
} from "../types.ts";
import {TaperGenerator} from "./TaperGenerator.tsx";

type Props = {
    steps: TaperStep[];
    /** Receives an updater, so quick successive edits are kept */
    onChange: (update: (steps: TaperStep[]) => TaperStep[]) => void;
    errors: DosingField[];
    /** The line's (or inherited) unit and dose: step doses use this unit, and empty means this dose */
    doseUnit?: DoseUnit | null;
    lineDose?: number | null;
};

const toNumber = (text: string) => (text.trim() === "" ? null : Number(text));

/** One row per step (dose, frequency, duration), with add / remove / generate. */
export const TaperStepsEditor = ({steps, onChange, errors, doseUnit, lineDose}: Props) => {
    const {t} = useTranslation();
    const hasError = (i: number, field: TaperStepField) => errors.includes(`taperSteps.${i}.${field}`);
    const setStep = (index: number, patch: Partial<TaperStep>) =>
        onChange(current => current.map((s, i) => (i === index ? {...s, ...patch} : s)));
    const removeStep = (index: number) => onChange(current => current.filter((_, i) => i !== index));
    const canAdd = steps.length < MAX_TAPER_STEPS;
    // "Continuous" / "until next visit" on a step that is no longer the last one
    const misplacedOpenEnd = steps.some((s, i) =>
        i < steps.length - 1 && !!s.durationUnit && !TAPER_STEP_DURATIONS.includes(s.durationUnit));

    return (
        <Stack sx={{gap: 1.5}}>
            {steps.map((step, i) => {
                const isLast = i === steps.length - 1;
                const units = isLast ? TAPER_LAST_STEP_DURATIONS : TAPER_STEP_DURATIONS;
                const needsDuration = durationNeedsValue(step.durationUnit);
                return (
                    <Stack
                        key={i}
                        direction="row"
                        // On phones each step takes two lines, so a thin line separates the steps
                        sx={{gap: 1, alignItems: "flex-start", pb: {xs: isLast ? 0 : 1.5, sm: 0}, borderBottom: {xs: isLast ? 0 : 1, sm: 0}, borderColor: "divider"}}
                    >
                        <Avatar
                            aria-label={t("dosing.taper.step", {number: i + 1})}
                            sx={{width: 24, height: 24, fontSize: 12, mt: 1, bgcolor: "secondary.main"}}
                        >
                            {i + 1}
                        </Avatar>
                        <Grid container spacing={1} columns={{xs: 12, sm: ALLOW_STEP_DOSE ? 14 : 12}} sx={{flex: 1, minWidth: 0}}>
                            {ALLOW_STEP_DOSE && (
                                // Last on phones (third line), first on wider screens; step 1 shows the dose above
                                <Grid size={{xs: 5, sm: 2}} sx={{order: {xs: 1, sm: 0}, display: {xs: i === 0 ? "none" : "block", sm: "block"}}}>
                                    <TapTooltip
                                        title={i === 0
                                            ? t("dosing.taper.firstStepDose")
                                            : doseUnit ? t("dosing.taper.stepDoseInfo") : t("dosing.taper.stepDoseNoUnit")}
                                        placement="top"
                                        enterDelay={400}
                                        tap={i === 0 || !doseUnit}
                                    >
                                        {/* span: a disabled field can't show a tooltip */}
                                        <span>
                                            <TextField
                                                label={t("dosing.amount")}
                                                type="number"
                                                size="small"
                                                fullWidth
                                                disabled={i === 0 || !doseUnit}
                                                value={(i === 0 ? lineDose : step.doseAmount) ?? ""}
                                                placeholder={doseUnit ? String(lineDose ?? 1) : undefined}
                                                onChange={(e) => setStep(i, {doseAmount: toNumber(e.target.value)})}
                                                error={hasError(i, "doseAmount")}
                                                slotProps={{htmlInput: {min: 0, step: 0.5}, inputLabel: {shrink: true}}}
                                            />
                                        </span>
                                    </TapTooltip>
                                </Grid>
                            )}
                            <Grid size={{xs: 7, sm: 4}}>
                                <TextField
                                    select
                                    label={t("dosing.frequency")}
                                    size="small"
                                    fullWidth
                                    value={step.frequency ?? ""}
                                    onChange={(e) => setStep(i, {frequency: (e.target.value || null) as Frequency | null})}
                                    error={hasError(i, "frequency")}
                                >
                                    {TAPER_STEP_FREQUENCIES.map(f => <MenuItem key={f} value={f}>{t(`dosing.frequencies.${f}`)}</MenuItem>)}
                                </TextField>
                            </Grid>
                            <Grid size={{xs: 5, sm: 2}}>
                                <TextField
                                    label={step.frequency === "everyHours" ? t("dosing.hours") : t("dosing.timesPerDay")}
                                    type="number"
                                    size="small"
                                    fullWidth
                                    value={step.frequencyValue ?? ""}
                                    onChange={(e) => setStep(i, {frequencyValue: toNumber(e.target.value)})}
                                    error={hasError(i, "frequencyValue")}
                                    slotProps={{htmlInput: {min: 1, step: 1}}}
                                />
                            </Grid>
                            <Grid size={{xs: needsDuration ? 7 : 12, sm: needsDuration ? 4 : 6}}>
                                <TextField
                                    select
                                    label={t("dosing.durationUnit")}
                                    size="small"
                                    fullWidth
                                    value={step.durationUnit ?? ""}
                                    onChange={(e) => setStep(i, {durationUnit: (e.target.value || null) as DurationUnit | null})}
                                    error={hasError(i, "durationUnit")}
                                >
                                    {/* Keep showing a value that is no longer allowed here, so the error is visible */}
                                    {step.durationUnit && !units.includes(step.durationUnit) && (
                                        <MenuItem value={step.durationUnit} disabled>{t(`dosing.durations.${step.durationUnit}`)}</MenuItem>
                                    )}
                                    {units.map(u => <MenuItem key={u} value={u}>{t(`dosing.durations.${u}`)}</MenuItem>)}
                                </TextField>
                            </Grid>
                            {needsDuration && (
                                <Grid size={{xs: 5, sm: 2}}>
                                    <TextField
                                        label={t("dosing.durationValue")}
                                        type="number"
                                        size="small"
                                        fullWidth
                                        value={step.durationValue ?? ""}
                                        onChange={(e) => setStep(i, {durationValue: toNumber(e.target.value)})}
                                        error={hasError(i, "durationValue")}
                                        slotProps={{htmlInput: {min: 1, step: 1}}}
                                    />
                                </Grid>
                            )}
                        </Grid>
                        <Tooltip title={t("dosing.taper.removeStep")}>
                            {/* span: a disabled button can't show a tooltip */}
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={() => removeStep(i)}
                                    disabled={steps.length <= 1}
                                    aria-label={t("dosing.taper.removeStep")}
                                    sx={{mt: 0.5}}
                                >
                                    <CloseIcon fontSize="small"/>
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                );
            })}

            <Stack direction="row" sx={{gap: 1, alignItems: "center", flexWrap: "wrap"}}>
                <TapTooltip title={canAdd ? t("dosing.taper.addStepInfo") : t("dosing.taper.maxSteps", {count: MAX_TAPER_STEPS})} tap={!canAdd}>
                    <span>
                        <Button size="small" startIcon={<AddIcon/>} onClick={() => onChange(addStep)} disabled={!canAdd}>
                            {t("dosing.taper.addStep")}
                        </Button>
                    </span>
                </TapTooltip>
                {ENABLE_TAPER_GENERATOR && <TaperGenerator steps={steps} onGenerate={(generated) => onChange(() => generated)}/>}
                <Box sx={{flex: 1}}/>
                <TotalChip steps={steps}/>
            </Stack>
            {misplacedOpenEnd && (
                <Typography variant="caption" color="error">{t("dosing.taper.lastStepInfo")}</Typography>
            )}
        </Stack>
    );
};

const TotalChip = ({steps}: { steps: TaperStep[] }) => {
    const {t} = useTranslation();
    const {days, openEnded} = taperTotal(steps);
    if (!days) return null;

    const total = days % 7 === 0
        ? t("dosing.taper.totalWeeks", {count: days / 7})
        : t("dosing.taper.totalDays", {count: days});
    const label = openEnded
        ? t("dosing.taper.totalThen", {total, period: t(`dosing.durations.${openEnded}`)})
        : total;
    return <Chip size="small" variant="outlined" label={label} sx={{height: "auto", py: 0.25, "& .MuiChip-label": {whiteSpace: "normal"}}}/>;
};
