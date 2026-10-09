import {useState} from "react";
import {Box, Button, Grid, MenuItem, Popover, Stack, TextField, Tooltip, Typography} from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import {useTranslation} from "react-i18next";
import {MAX_TAPER_STEPS, TAPER_DEFAULT_TIMES_PER_DAY, TAPER_STEP_DURATIONS} from "../taperConfig.ts";
import {generateTaper, type TaperPlan} from "../taper.ts";
import type {DurationUnit, TaperStep} from "../types.ts";

type Props = {
    /** Current steps, used to pre-fill the plan */
    steps: TaperStep[];
    onGenerate: (steps: TaperStep[]) => void;
};

type Draft = Record<Exclude<keyof TaperPlan, "unit">, string> & { unit: DurationUnit };

const draftFrom = (steps: TaperStep[]): Draft => {
    const first = steps[0];
    const usable = first?.frequency === "daily" && first.frequencyValue != null;
    return {
        start: String(usable ? first.frequencyValue : TAPER_DEFAULT_TIMES_PER_DAY),
        reduceBy: "1",
        downTo: "1",
        every: String(first?.durationValue ?? 1),
        unit: first?.durationUnit && TAPER_STEP_DURATIONS.includes(first.durationUnit) ? first.durationUnit : "weeks",
    };
};

/** "Generate…" button + popover: start, reduce by, down to, each step → steps (which stay editable). */
export const TaperGenerator = ({steps, onGenerate}: Props) => {
    const {t} = useTranslation();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [draft, setDraft] = useState<Draft>(() => draftFrom(steps));

    const generated = generateTaper({
        start: Number(draft.start),
        reduceBy: Number(draft.reduceBy),
        downTo: Number(draft.downTo),
        every: Number(draft.every),
        unit: draft.unit,
    });

    const open = (el: HTMLElement) => {
        setDraft(draftFrom(steps));
        setAnchor(el);
    };

    const apply = () => {
        if (!generated) return;
        onGenerate(generated);
        setAnchor(null);
    };

    const numberField = (key: keyof Omit<Draft, "unit">, info: string) => (
        <Tooltip title={info} placement="top" enterDelay={400}>
            <TextField
                label={t(`dosing.taper.${key}`)}
                type="number"
                size="small"
                fullWidth
                value={draft[key]}
                onChange={(e) => setDraft(d => ({...d, [key]: e.target.value}))}
                slotProps={{htmlInput: {min: 1, step: 1}}}
            />
        </Tooltip>
    );

    return (
        <>
            <Tooltip title={t("dosing.taper.generateInfo")}>
                <Button size="small" startIcon={<AutoFixHighIcon/>} onClick={(e) => open(e.currentTarget)}>
                    {t("dosing.taper.generate")}
                </Button>
            </Tooltip>
            <Popover
                open={!!anchor}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{vertical: "bottom", horizontal: "center"}}
                transformOrigin={{vertical: "top", horizontal: "center"}}
            >
                <Box sx={{p: 2, width: 320, maxWidth: "calc(100vw - 32px)"}}>
                    <Typography variant="subtitle2" sx={{fontWeight: 700}}>{t("dosing.taper.generateTitle")}</Typography>
                    <Typography variant="caption" color="text.secondary" component="div" sx={{mb: 1.5}}>
                        {t("dosing.taper.generateHint")}
                    </Typography>
                    <Grid container spacing={1.5}>
                        <Grid size={4}>{numberField("start", t("dosing.taper.startInfo"))}</Grid>
                        <Grid size={4}>{numberField("reduceBy", t("dosing.taper.reduceByInfo"))}</Grid>
                        <Grid size={4}>{numberField("downTo", t("dosing.taper.downToInfo"))}</Grid>
                        <Grid size={5}>{numberField("every", t("dosing.taper.everyInfo"))}</Grid>
                        <Grid size={7}>
                            <TextField
                                select
                                label={t("dosing.durationUnit")}
                                size="small"
                                fullWidth
                                value={draft.unit}
                                onChange={(e) => setDraft(d => ({...d, unit: e.target.value as DurationUnit}))}
                            >
                                {TAPER_STEP_DURATIONS.map(u => <MenuItem key={u} value={u}>{t(`dosing.durations.${u}`)}</MenuItem>)}
                            </TextField>
                        </Grid>
                    </Grid>
                    <Stack direction="row" sx={{alignItems: "center", gap: 1, mt: 1.5}}>
                        <Typography variant="caption" color={generated ? "text.secondary" : "error"} sx={{flex: 1}}>
                            {generated
                                ? t("dosing.taper.preview", {count: generated.length})
                                : t("dosing.taper.invalid", {max: MAX_TAPER_STEPS})}
                        </Typography>
                        <Button size="small" onClick={() => setAnchor(null)}>{t("common.cancel")}</Button>
                        <Button size="small" variant="contained" onClick={apply} disabled={!generated}>
                            {t("dosing.taper.apply")}
                        </Button>
                    </Stack>
                </Box>
            </Popover>
        </>
    );
};
