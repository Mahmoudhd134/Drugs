import "../printFont.css";
import type {PrintLayout} from "../types.ts";

type Props = {
    layout: PrintLayout;
    /** The selected item: its box is marked and `aria-pressed` */
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    /** What the prescription text's box shows (the designer's sample; step 2 passes the real text) */
    sampleText: string;
};

/**
 * The sheet at true scale (contract § 3.4), one renderer for the designer's preview and for printing (step 2), so what is
 * designed is what prints: 1 mm = 1 CSS mm, never mirrored (`dir="ltr"`), its own font, positions as inline styles.
 *
 * Contract stub: track print-templates/frontend writes the body.
 */
export const TemplateSheet = ({layout, selectedId, onSelect, sampleText}: Props) => {
    void layout;
    void selectedId;
    void onSelect;
    void sampleText;
    return null;
};
