import {useState} from "react";
import {TextField} from "@mui/material";
import {formatMm} from "../layout.ts";

type Props = {
    label: string;
    /** The field's number in the layout */
    value: number;
    /** Text the layout doesn't hold (not a usable number, or not committed yet): shown instead of the number */
    rawInput?: string;
    error?: string;
    disabled?: boolean;
    /** One of a side-by-side pair, in a grid: see `PAIRED_FIELD` */
    paired?: boolean;
    /** Every keystroke's text */
    onType?: (text: string) => void;
    /** The text once typing ends (blur or Enter), when it changed */
    onCommit?: (text: string) => void;
};

/**
 * A label doesn't fit on the border of a field half the panel wide, where it would be cut: it sits above the input and wraps. Its three rows (label, input, message) are the
 * pair's, so the two inputs stay level whichever label wraps or message shows (step 4 contract § 4.3.1).
 */
const PAIRED_FIELD = {display: "grid", gridRow: "span 3", gridTemplateRows: "subgrid"} as const;
const PAIRED_LABEL = {position: "static", transform: "none", maxWidth: "none", whiteSpace: "normal", overflow: "visible", fontSize: "0.75rem", lineHeight: 1.35, mb: 0.5} as const;

/**
 * A number in mm or pt (contract § 3.3): `type="text"` so Arabic digits and a comma can be read, left to right in both
 * languages. While it has the focus it shows what was typed; on blur, the number as formatted (or the raw text it couldn't use).
 */
export const MmField = ({label, value, rawInput, error, disabled, paired, onType, onCommit}: Props) => {
    const [typed, setTyped] = useState<string | null>(null);

    const commit = () => {
        if (typed === null) return;
        setTyped(null);
        onCommit?.(typed);
    };

    return (
        <TextField
            label={label}
            size="small"
            fullWidth
            disabled={disabled}
            value={typed ?? rawInput ?? formatMm(value)}
            error={!!error}
            helperText={error}
            onChange={(e) => {
                setTyped(e.target.value);
                onType?.(e.target.value);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === "Enter") commit();
            }}
            sx={paired ? PAIRED_FIELD : undefined}
            slotProps={{
                htmlInput: {inputMode: "decimal", dir: "ltr"},
                ...(paired ? {inputLabel: {shrink: true, sx: PAIRED_LABEL}, input: {notched: false}} : undefined),
            }}
        />
    );
};
