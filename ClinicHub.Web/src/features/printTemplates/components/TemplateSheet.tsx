import type {CSSProperties} from "react";
import {useTranslation} from "react-i18next";
import "../printFont.css";
import {PRINT_FONT_FAMILY} from "../constants.ts";
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

/**
 * The sheet at true scale (contract § 3.4), one renderer for the designer's preview and for printing (step 2), so what is
 * designed is what prints: 1 mm = 1 CSS mm, never mirrored (`dir="ltr"`), its own font, positions as inline styles (the RTL
 * style cache flips `left` and `right` in `sx`).
 */
export const TemplateSheet = ({layout, selectedId, onSelect, sampleText}: Props) => {
    const {t} = useTranslation();
    const designing = !!onSelect;

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
            style={{
                position: "relative",
                width: `${layout.page.widthMm}mm`,
                height: `${layout.page.heightMm}mm`,
                fontFamily: PRINT_FONT_FAMILY,
                overflow: "hidden",
                color: "#000",
                backgroundColor: "#fff",
                ...(designing ? GRID : undefined),
            }}
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
                            position: "absolute",
                            left: `${item.xMm}mm`,
                            top: `${item.yMm}mm`,
                            width: `${item.wMm}mm`,
                            height: `${item.hMm}mm`,
                            fontSize: `${item.fontSizePt}pt`,
                            fontFamily: "inherit",
                            padding: 0,
                            border: 0,
                            background: "transparent",
                            color: "inherit",
                            textAlign: "start",
                            display: "block",
                            boxSizing: "border-box",
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
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                textAlign: "start",
                                whiteSpace: "pre-wrap",
                                overflowWrap: "anywhere",
                                color: dimmed ? DIMMED_COLOR : undefined,
                            }}
                        >
                            {text}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
