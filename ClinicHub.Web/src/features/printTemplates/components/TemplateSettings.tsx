import {Box, Button, MenuItem, Paper, TextField, Typography} from "@mui/material";
import {useTranslation} from "react-i18next";
import {PAGE_SIZE_OPTIONS} from "../constants.ts";
import type {PageSize, TemplateItem, TemplatePage} from "../types.ts";
import type {BoxField} from "../useDesignerDraft.ts";
import {MmField} from "./MmField.tsx";

const BOX_FIELDS: { field: BoxField; labelKey: string }[] = [
    {field: "xMm", labelKey: "printTemplates.config.x"},
    {field: "yMm", labelKey: "printTemplates.config.y"},
    {field: "wMm", labelKey: "printTemplates.config.width"},
    {field: "hMm", labelKey: "printTemplates.config.height"},
    {field: "fontSizePt", labelKey: "printTemplates.config.fontSize"},
];

/** The sheet's measures, which commit at blur or Enter. */
export type PageMeasure = "widthMm" | "heightMm";

/** One column in the side column, as many as fit when the settings sit below the sheet. */
const fieldGrid = {display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 1.5} as const;

type Props = {
    page: TemplatePage;
    item: TemplateItem | null;
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

/** The settings panel (contract § 3.3): the sheet's, then the selected item's. */
export const TemplateSettings = ({page, item, rawInputs, messageOf, onPageSize, onPageMeasure, onItemNumber, onItemText, onItemCommit, onRemove}: Props) => {
    const {t} = useTranslation();

    const typeLabel = (selected: TemplateItem) =>
        selected.kind === "function"
            ? t(`printTemplates.functions.${selected.function}`)
            : t(`printTemplates.kinds.${selected.kind}`);

    return (
        <Paper component="section" variant="outlined" aria-label={t("printTemplates.config.label")}
               sx={{p: 2, minWidth: 0, gridColumn: {md: "1 / -1", lg: "auto"}}}>
            <Typography component="h2" variant="subtitle1" sx={{fontWeight: 700, mb: 1.5}}>{t("printTemplates.page.title")}</Typography>
            <Box sx={fieldGrid}>
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
                <MmField
                    label={t("printTemplates.page.width")}
                    value={page.widthMm}
                    rawInput={typedPage.widthMm ?? rawInputs["page.widthMm"]}
                    error={messageOf("page.widthMm")}
                    disabled={page.size !== "custom"}
                    onType={(text) => onPageMeasureType("widthMm", text)}
                    onCommit={(text) => onPageMeasure("widthMm", text)}
                />
                <MmField
                    label={t("printTemplates.page.height")}
                    value={page.heightMm}
                    rawInput={typedPage.heightMm ?? rawInputs["page.heightMm"]}
                    error={messageOf("page.heightMm")}
                    disabled={page.size !== "custom"}
                    onType={(text) => onPageMeasureType("heightMm", text)}
                    onCommit={(text) => onPageMeasure("heightMm", text)}
                />
            </Box>

            <Box sx={{mt: 2.5}}>
                {!item && <Typography variant="body2" color="text.secondary">{t("printTemplates.config.noSelection")}</Typography>}
                {item && (
                    <>
                        <Box sx={{mb: 1.5}}>
                            <Typography variant="caption" color="text.secondary" component="div">{t("printTemplates.config.type")}</Typography>
                            <Typography variant="body2" sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{typeLabel(item)}</Typography>
                        </Box>
                        {(item.kind === "manualInput" || item.kind === "function") && (
                            <TextField
                                label={t("printTemplates.config.name")}
                                size="small"
                                fullWidth
                                sx={{mb: 1.5}}
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
                                sx={{mb: 1.5}}
                                value={item.text}
                                error={!!messageOf(`${item.id}.text`)}
                                helperText={messageOf(`${item.id}.text`)}
                                onChange={(e) => onItemText(item, "text", e.target.value)}
                                // Blur only: Enter is a new line here (TPL-564)
                                onBlur={onItemCommit}
                                slotProps={{htmlInput: {dir: "auto"}}}
                            />
                        )}
                        <Box sx={fieldGrid}>
                            {BOX_FIELDS.map(({field, labelKey}) => (
                                <MmField
                                    // Another item starts with its own numbers, not this one's typed text
                                    key={`${item.id}.${field}`}
                                    label={t(labelKey)}
                                    value={item[field]}
                                    rawInput={rawInputs[`${item.id}.${field}`]}
                                    error={messageOf(`${item.id}.${field}`)}
                                    onType={(text) => onItemNumber(item, field, text)}
                                    onCommit={onItemCommit}
                                />
                            ))}
                        </Box>
                        {item.kind !== "prescriptionText" && (
                            <Button color="error" sx={{mt: 1.5}} onClick={() => onRemove(item)}>{t("printTemplates.config.remove")}</Button>
                        )}
                    </>
                )}
            </Box>
        </Paper>
    );
};
