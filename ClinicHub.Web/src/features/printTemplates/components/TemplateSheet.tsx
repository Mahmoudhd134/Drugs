import type {CSSProperties} from "react";
import {useTranslation} from "react-i18next";
import "../printFont.css";
import "../printSheet.css";
import {PRINT_FONT_FAMILY, PRINT_LINE_HEIGHT} from "../constants.ts";
import {isLeftToRightValue} from "../functions.ts";
import {printTextStyle} from "../printMeasure.ts";
import type {PrintLayout, TemplateItem} from "../types.ts";

/** One printed sheet: the prescription text's chunk (clean HTML) and each short item's value by item id. */
export type SheetPrintContent = { textHtml: string; values: Readonly<Record<string, string>> };

type Props = {
    layout: PrintLayout;
    /** The selected item: its box is marked and `aria-pressed` */
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    /** What the prescription text's box shows in the designer; ignored with `print` */
    sampleText: string;
    /** Printing (contract § 3.4): items render as plain boxes with these values, not as buttons */
    print?: SheetPrintContent;
};

/** The designer's mm grid: a faint line every 1 mm and a stronger one every 10 mm. */
const GRID: CSSProperties = {
    backgroundImage: [
        "linear-gradient(to right, rgba(15, 118, 110, 0.22) 1px, transparent 1px)",
        "linear-gradient(to bottom, rgba(15, 118, 110, 0.22) 1px, transparent 1px)",
        "linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px)",
        "linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px)",
    ].join(", "),
    backgroundSize: "10mm 10mm, 10mm 10mm, 1mm 1mm, 1mm 1mm",
};

/** Text standing in for a value not set yet (≈ 7:1 on white). */
const DIMMED_COLOR = "#595959";

/** The sheet itself, in both modes. Its `overflow` cuts at the edge, so a long value can't make a page (TPL-339). */
const sheetStyle = (layout: PrintLayout): CSSProperties => ({
    position: "relative",
    width: `${layout.page.widthMm}mm`,
    height: `${layout.page.heightMm}mm`,
    fontFamily: PRINT_FONT_FAMILY,
    overflow: "hidden",
    color: "#000",
    backgroundColor: "#fff",
});

/** An item's box, in both modes: positions always inline. The line height too, since a `button` resets it and the designer shows what prints. */
const boxStyle = (item: TemplateItem): CSSProperties => ({
    position: "absolute",
    left: `${item.xMm}mm`,
    top: `${item.yMm}mm`,
    width: `${item.wMm}mm`,
    height: `${item.hMm}mm`,
    fontSize: `${item.fontSizePt}pt`,
    lineHeight: PRINT_LINE_HEIGHT,
    boxSizing: "border-box",
    textAlign: "start",
});

/** A short item's text: at the box's top, wrapping, never clipped by the box. */
const VALUE_STYLE: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    textAlign: "start",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
};

/** A printed sheet (contract § 3.4): plain boxes holding values, set as text but for the cleaned prescription text. A name never prints. */
const PrintedSheet = ({layout, print}: { layout: PrintLayout; print: SheetPrintContent }) => (
    <div data-testid="print-sheet" dir="ltr" style={sheetStyle(layout)}>
        {layout.items.map(item => {
            const value = print.values[item.id];
            return (
                <div key={item.id} data-item-id={item.id} style={boxStyle(item)}>
                    {item.kind === "prescriptionText" ? (
                        <div className="print-text" style={printTextStyle(item.fontSizePt)} dangerouslySetInnerHTML={{__html: print.textHtml}}/>
                    ) : value ? (
                        <span dir={item.kind === "function" && isLeftToRightValue(item.function) ? "ltr" : "auto"} style={VALUE_STYLE}>
                            {value}
                        </span>
                    ) : null}
                </div>
            );
        })}
    </div>
);

/**
 * The sheet at true scale (contract § 3.4), one renderer for the designer's preview and for printing, so what is
 * designed is what prints: 1 mm = 1 CSS mm, never mirrored (`dir="ltr"`), its own font, positions as inline styles (the RTL
 * style cache flips `left` and `right` in `sx`).
 */
export const TemplateSheet = ({layout, selectedId, onSelect, sampleText, print}: Props) => {
    const {t} = useTranslation();
    const designing = !!onSelect;

    if (print) return <PrintedSheet layout={layout} print={print}/>;

    /** What a box shows; `placeholder`: nothing set yet, so its kind's label, dimmed. */
    const contentOf = (item: TemplateItem) => {
        const shown = (value: string, placeholder: string) =>
            value.trim() ? {text: value, dimmed: false} : {text: placeholder, dimmed: true};
        switch (item.kind) {
            case "prescriptionText":
                return {text: sampleText, dimmed: false};
            case "manualInput":
                return shown(item.name, t("printTemplates.kinds.manualInput"));
            case "function":
                return shown(item.name, t(`printTemplates.functions.${item.function}`));
            case "staticText":
                return shown(item.text, t("printTemplates.kinds.staticText"));
        }
    };

    return (
        <div
            data-testid="template-sheet"
            dir="ltr"
            style={{...sheetStyle(layout), ...(designing ? GRID : undefined)}}
        >
            {layout.items.map(item => {
                const {text, dimmed} = contentOf(item);
                const selected = item.id === selectedId;
                return (
                    <button
                        key={item.id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={item.kind === "prescriptionText" ? t("printTemplates.kinds.prescriptionText") : undefined}
                        data-item-id={item.id}
                        onClick={() => onSelect?.(item.id)}
                        style={{
                            ...boxStyle(item),
                            fontFamily: "inherit",
                            padding: 0,
                            border: 0,
                            background: "transparent",
                            color: "inherit",
                            display: "block",
                            overflow: "visible",
                            cursor: designing ? "pointer" : undefined,
                            // Marks stay outside the layout: a box keeps exactly its size (TPL-228). No inline
                            // outline: the browser's focus ring is an outline and must still show (TPL-057)
                            ...(designing ? {boxShadow: selected ? "inset 0 0 0 2px #0f766e" : "inset 0 0 0 1px rgba(15, 118, 110, 0.45)"} : undefined),
                        }}
                    >
                        {/* Out of the button's flow: a button centers its content, this starts at the box's top */}
                        <span
                            dir="auto"
                            style={{...VALUE_STYLE, color: dimmed ? DIMMED_COLOR : undefined}}
                        >
                            {text}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
