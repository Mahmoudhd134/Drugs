import {type MouseEvent, type PointerEvent, type ReactNode, useId} from "react";
import {Alert, Box, List, ListItem, ListItemButton, ListItemText, Paper, Stack, Typography} from "@mui/material";
import {useTranslation} from "react-i18next";
import {TEMPLATE_FUNCTIONS} from "../constants.ts";
import type {AddableItem} from "../types.ts";

type Props = {
    /** False at 50 items: every entry is disabled and a message says why */
    canAdd: boolean;
    /** `defaultName`: the entry's label in the UI language */
    onAdd: (addable: AddableItem, defaultName: string) => void;
    /** A pointer pressed on an entry: it may become a drag to the sheet (step 3 contract § 3.4) */
    onEntryPress: (event: PointerEvent<HTMLElement>, addable: AddableItem, label: string) => void;
    /** True for the click that ends a drag, which adds nothing (TPL-501) */
    swallowClick: (event: MouseEvent) => boolean;
};

/**
 * The side panel (contract § 3.3): what can be placed on the sheet. The prescription text comes with every layout. From 1200 px it scrolls inside itself, up to the area's
 * height (set on the side column), as the settings do, so it never grows the page.
 */
export const TemplateSidePanel = ({canAdd, onAdd, onEntryPress, swallowClick}: Props) => {
    const {t} = useTranslation();
    const internalDataHintId = useId();
    const expressionHintId = useId();

    const entry = (addable: AddableItem, label: string) => (
        <ListItem key={label} disablePadding>
            <ListItemButton
                aria-label={label}
                disabled={!canAdd}
                sx={{touchAction: "none", userSelect: "none"}}
                onPointerDown={(event) => {
                    if (canAdd) onEntryPress(event, addable, label);
                }}
                // A double click adds one; a keyboard click's `detail` is 0
                onClick={(event) => {
                    if (!swallowClick(event) && event.detail <= 1) onAdd(addable, label);
                }}
            >
                <ListItemText primary={label}/>
            </ListItemButton>
        </ListItem>
    );

    const later = (label: string, hint: string, hintId: string) => (
        <ListItem key={label} disablePadding>
            <ListItemButton disabled aria-label={label} aria-describedby={hintId} sx={{"&.Mui-disabled": {opacity: 0.6}}}>
                <ListItemText primary={label} secondary={hint} slotProps={{secondary: {id: hintId}}}/>
            </ListItemButton>
        </ListItem>
    );

    const group = (label: string, entries: ReactNode) => (
        <Box>
            <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
            <List dense disablePadding aria-label={label}>{entries}</List>
        </Box>
    );

    return (
        <Paper
            component="section"
            variant="outlined"
            aria-label={t("printTemplates.panel.label")}
            sx={{
                p: 1.5,
                minWidth: 0,
                maxHeight: {lg: "var(--template-area-height)"},
                overflowX: {lg: "hidden"},
                overflowY: {lg: "auto"},
            }}
        >
            <Typography component="h2" variant="subtitle1" sx={{fontWeight: 700, mb: 1}}>{t("printTemplates.panel.label")}</Typography>
            {!canAdd && <Alert severity="info" sx={{mb: 1}}>{t("errors.templateTooManyItems")}</Alert>}
            <Stack sx={{gap: 1}}>
                {group(t("printTemplates.panel.manual"), entry({kind: "manualInput"}, t("printTemplates.kinds.manualInput")))}
                {group(t("printTemplates.panel.functions"), TEMPLATE_FUNCTIONS.map(fn =>
                    entry({kind: "function", function: fn}, t(`printTemplates.functions.${fn}`))))}
                {group(t("printTemplates.panel.static"), entry({kind: "staticText"}, t("printTemplates.kinds.staticText")))}
                {group(t("printTemplates.panel.later"), (
                    <>
                        {later(t("printTemplates.kinds.internalData"), t("printTemplates.panel.internalDataHint"), internalDataHintId)}
                        {later(t("printTemplates.kinds.expression"), t("printTemplates.panel.expressionHint"), expressionHintId)}
                    </>
                ))}
            </Stack>
        </Paper>
    );
};
