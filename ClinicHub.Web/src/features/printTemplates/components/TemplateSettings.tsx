import {type ReactNode, type Ref, useId} from "react";
import {Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, MenuItem, Paper, TextField, Typography} from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {useTranslation} from "react-i18next";
import {PAGE_SIZE_OPTIONS} from "../constants.ts";
import type {PageSize, TemplateCalibration, TemplateItem, TemplatePage} from "../types.ts";
import type {BoxField, CalibrationField} from "../useDesignerDraft.ts";
import {MmField} from "./MmField.tsx";

const BOX_PAIRS: { field: BoxField; labelKey: string }[][] = [
    [{field: "xMm", labelKey: "printTemplates.config.x"}, {field: "yMm", labelKey: "printTemplates.config.y"}],
    [{field: "wMm", labelKey: "printTemplates.config.width"}, {field: "hMm", labelKey: "printTemplates.config.height"}],
];

/** The sheet's measures, which commit at blur or Enter. */
export type PageMeasure = "widthMm" | "heightMm";

/** The settings' sections, one open at a time (step 4 contract § 4.3.1). */
export type SettingsSection = "page" | "calibration" | "item" | "paper";

const stack = {display: "flex", flexDirection: "column", gap: 1.5} as const;
const pair = {display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", columnGap: 1} as const;

/** The keys of the fields the selected item shows: what can mark its section. */
const itemKeys = (item: TemplateItem) => {
    const text = item.kind === "staticText" ? ["text"] : item.kind === "prescriptionText" ? [] : ["name"];
    return [...text, ...BOX_PAIRS.flat().map(({field}) => field), "fontSizePt"].map(field => `${item.id}.${field}`);
};

type SectionProps = {
    section: SettingsSection;
    title: string;
    open: boolean;
    /** A field inside holds an error: marked while closed */
    hasError: boolean;
    onOpen: (section: SettingsSection | null) => void;
    /** Its opening animation ended */
    onOpened?: () => void;
    children: ReactNode;
};

/** One section. The button is named by its title alone, the mark describes it. Closed content stays mounted: a picked file, an upload and typed text live on (MUI's default). */
const Section = ({section, title, open, hasError, onOpen, onOpened, children}: SectionProps) => {
    const {t} = useTranslation();
    const id = useId();
    const marked = hasError && !open;

    return (
        <Accordion
            // Where a refused press finds the section of its first message
            data-settings-section={section}
            disableGutters
            square
            elevation={0}
            expanded={open}
            onChange={(_event, expanded) => onOpen(expanded ? section : null)}
            slotProps={{heading: {component: "h2"}, transition: {onEntered: onOpened}}}
            sx={{
                bgcolor: "transparent",
                "&::before": {display: "none"},
                "&:not(:first-of-type)": {borderTop: 1, borderColor: "divider"},
            }}
        >
            <AccordionSummary
                id={`${id}-header`}
                aria-controls={`${id}-content`}
                aria-labelledby={`${id}-title`}
                aria-describedby={marked ? `${id}-mark` : undefined}
                data-has-error={marked ? "true" : undefined}
                expandIcon={<ExpandMoreIcon fontSize="small"/>}
                sx={{
                    minHeight: 40,
                    px: 1.5,
                    "& .MuiAccordionSummary-content": {my: 1, alignItems: "center", gap: 0.75, minWidth: 0},
                }}
            >
                <Typography id={`${id}-title`} component="span" variant="subtitle2" sx={{fontWeight: 700, overflowWrap: "anywhere"}}>{title}</Typography>
                {marked && <ErrorOutlineIcon id={`${id}-mark`} color="error" fontSize="small" titleAccess={t("printTemplates.config.sectionError")}/>}
            </AccordionSummary>
            {/* Relative, so the closed part also clips a visually hidden input, which would otherwise give the panel a scrollbar for nothing */}
            <AccordionDetails sx={{position: "relative", px: 1.5, pt: 0.5, pb: 2}}>{children}</AccordionDetails>
        </Accordion>
    );
};

type Props = {
    page: TemplatePage;
    item: TemplateItem | null;
    /** The printer's correction (step 4 contract § 4.3) */
    calibration: TemplateCalibration;
    /** The correction pushes a box off the sheet: a warning only */
    cutsItems: boolean;
    onCalibration: (field: CalibrationField, text: string) => void;
    /** The "Paper image" section's content, last; null with no paper adapter */
    paperSection?: ReactNode;
    /** The panel, where a refused press finds its first message */
    panelRef?: Ref<HTMLElement>;
    /** The open section, null when all are closed; the workspace's, so it resets with each opening */
    openSection: SettingsSection | null;
    onOpenSection: (section: SettingsSection | null) => void;
    /** A section's opening animation ended: its fields can be scrolled to now */
    onSectionOpened: () => void;
    rawInputs: Record<string, string>;
    /** Text typed in a sheet measure and not committed yet */
    typedPage: Partial<Record<PageMeasure, string>>;
    /** The message a field shows, by its key (`<itemId>.<field>`, `page.size`, `page.widthMm`, `page.heightMm`) */
    messageOf: (key: string) => string | undefined;
    onPageSize: (size: PageSize) => void;
    onPageMeasureType: (field: PageMeasure, text: string) => void;
    onPageMeasure: (field: PageMeasure, text: string) => void;
    onItemNumber: (item: TemplateItem, field: BoxField, text: string) => void;
    onItemText: (item: TemplateItem, field: "name" | "text", value: string) => void;
    /** An item's field finished: one undo step however many keys were typed (step 3 contract § 3.6) */
    onItemCommit: () => void;
    onRemove: (item: TemplateItem) => void;
};

/**
 * The settings panel (step 4 contract § 4.3, § 4.3.1): the sheet's, the printer's correction, the selected item's and the picture's sections. From 1200 px it scrolls
 * inside itself, up to the area's height (set on the side column), so it never grows the page; from 900 to 1199 px the side column scrolls instead.
 */
export const TemplateSettings = ({page, item, calibration, cutsItems, onCalibration, paperSection, panelRef, openSection, onOpenSection, onSectionOpened, rawInputs, typedPage, messageOf, onPageSize, onPageMeasureType, onPageMeasure, onItemNumber, onItemText, onItemCommit, onRemove}: Props) => {
    const {t} = useTranslation();

    const typeLabel = (selected: TemplateItem) =>
        selected.kind === "function"
            ? t(`printTemplates.functions.${selected.function}`)
            : t(`printTemplates.kinds.${selected.kind}`);

    const anyMessage = (keys: string[]) => keys.some(key => !!messageOf(key));
    const sectionProps = (section: SettingsSection, title: string, keys: string[]) => ({
        section,
        title,
        open: openSection === section,
        hasError: anyMessage(keys),
        onOpen: onOpenSection,
        onOpened: onSectionOpened,
    });

    const boxField = (selected: TemplateItem, field: BoxField, labelKey: string) => (
        <MmField
            // Another item starts with its own numbers, not this one's typed text
            key={`${selected.id}.${field}`}
            label={t(labelKey)}
            paired={field !== "fontSizePt"}
            value={selected[field]}
            rawInput={rawInputs[`${selected.id}.${field}`]}
            error={messageOf(`${selected.id}.${field}`)}
            onType={(text) => onItemNumber(selected, field, text)}
            onCommit={onItemCommit}
        />
    );

    return (
        <Paper
            ref={panelRef}
            component="section"
            variant="outlined"
            aria-label={t("printTemplates.config.label")}
            sx={{
                minWidth: 0,
                maxHeight: {lg: "var(--template-area-height)"},
                overflowX: {lg: "hidden"},
                overflowY: {lg: "auto"},
            }}
        >
            <Section {...sectionProps("page", t("printTemplates.page.title"), ["page.size", "page.widthMm", "page.heightMm"])}>
                <Box sx={stack}>
                    <TextField
                        select
                        size="small"
                        fullWidth
                        label={t("printTemplates.page.size")}
                        value={page.size}
                        error={!!messageOf("page.size")}
                        helperText={messageOf("page.size")}
                        onChange={(e) => onPageSize(e.target.value as PageSize)}
                    >
                        {PAGE_SIZE_OPTIONS.map(size => <MenuItem key={size} value={size}>{t(`printTemplates.page.sizes.${size}`)}</MenuItem>)}
                    </TextField>
                    <Box sx={pair}>
                        <MmField
                            label={t("printTemplates.page.width")}
                            paired
                            value={page.widthMm}
                            rawInput={typedPage.widthMm ?? rawInputs["page.widthMm"]}
                            error={messageOf("page.widthMm")}
                            disabled={page.size !== "custom"}
                            onType={(text) => onPageMeasureType("widthMm", text)}
                            onCommit={(text) => onPageMeasure("widthMm", text)}
                        />
                        <MmField
                            label={t("printTemplates.page.height")}
                            paired
                            value={page.heightMm}
                            rawInput={typedPage.heightMm ?? rawInputs["page.heightMm"]}
                            error={messageOf("page.heightMm")}
                            disabled={page.size !== "custom"}
                            onType={(text) => onPageMeasureType("heightMm", text)}
                            onCommit={(text) => onPageMeasure("heightMm", text)}
                        />
                    </Box>
                </Box>
            </Section>

            <Section {...sectionProps("calibration", t("printTemplates.calibration.title"), ["calibration.xMm", "calibration.yMm"])}>
                <Box sx={stack}>
                    <MmField
                        label={t("printTemplates.calibration.x")}
                        value={calibration.xMm}
                        rawInput={rawInputs["calibration.xMm"]}
                        error={messageOf("calibration.xMm")}
                        onType={(text) => onCalibration("xMm", text)}
                        onCommit={onItemCommit}
                    />
                    <MmField
                        label={t("printTemplates.calibration.y")}
                        value={calibration.yMm}
                        rawInput={rawInputs["calibration.yMm"]}
                        error={messageOf("calibration.yMm")}
                        onType={(text) => onCalibration("yMm", text)}
                        onCommit={onItemCommit}
                    />
                </Box>
                <Typography component="div" variant="caption" color="text.secondary" sx={{mt: 1}}>
                    <div>{t("printTemplates.calibration.helper")}</div>
                    <div>{t("printTemplates.testPrint.hint")}</div>
                </Typography>
            </Section>
            {/* Outside the collapsing part, in view with the section closed: moving a box can raise it */}
            {cutsItems && <Alert severity="warning" data-testid="template-cut-warning" sx={{mx: 1.5, mb: 1.5}}>{t("printTemplates.calibration.cutWarning")}</Alert>}

            <Section {...sectionProps("item", t("printTemplates.config.itemSection"), item ? itemKeys(item) : [])}>
                {!item && <Typography variant="body2" color="text.secondary">{t("printTemplates.config.noSelection")}</Typography>}
                {item && (
                    <Box sx={stack}>
                        <Box>
                            <Typography variant="caption" color="text.secondary" component="div">{t("printTemplates.config.type")}</Typography>
                            <Typography variant="body2" sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{typeLabel(item)}</Typography>
                        </Box>
                        {(item.kind === "manualInput" || item.kind === "function") && (
                            <TextField
                                label={t("printTemplates.config.name")}
                                size="small"
                                fullWidth
                                value={item.name}
                                error={!!messageOf(`${item.id}.name`)}
                                helperText={messageOf(`${item.id}.name`) ?? (item.kind === "function" ? t("printTemplates.config.functionNameHint") : undefined)}
                                onChange={(e) => onItemText(item, "name", e.target.value)}
                                onBlur={onItemCommit}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") onItemCommit();
                                }}
                                slotProps={{htmlInput: {dir: "auto"}}}
                            />
                        )}
                        {item.kind === "staticText" && (
                            <TextField
                                label={t("printTemplates.config.text")}
                                size="small"
                                fullWidth
                                multiline
                                minRows={3}
                                value={item.text}
                                error={!!messageOf(`${item.id}.text`)}
                                helperText={messageOf(`${item.id}.text`)}
                                onChange={(e) => onItemText(item, "text", e.target.value)}
                                // Blur only: Enter is a new line here (TPL-564)
                                onBlur={onItemCommit}
                                slotProps={{htmlInput: {dir: "auto"}}}
                            />
                        )}
                        {BOX_PAIRS.map(fields => (
                            <Box key={fields[0].field} sx={pair}>
                                {fields.map(({field, labelKey}) => boxField(item, field, labelKey))}
                            </Box>
                        ))}
                        {boxField(item, "fontSizePt", "printTemplates.config.fontSize")}
                        {item.kind !== "prescriptionText" && (
                            <Box>
                                <Button color="error" onClick={() => onRemove(item)}>{t("printTemplates.config.remove")}</Button>
                            </Box>
                        )}
                    </Box>
                )}
            </Section>

            {paperSection && <Section {...sectionProps("paper", t("printTemplates.paper.title"), [])}>{paperSection}</Section>}
        </Paper>
    );
};
