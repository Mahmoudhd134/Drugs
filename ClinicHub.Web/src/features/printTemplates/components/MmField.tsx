import {useState} from "react";
import {TextField} from "@mui/material";
import {formatMm} from "../layout.ts";

type Props = {
    label: string;
    /** The field's number in the layout */
    value: number;
    /** What was typed that isn't a usable number: shown instead of the number */
    rawInput?: string;
    error?: string;
    disabled?: boolean;
    /** Every keystroke's text */
    onType?: (text: string) => void;
    /** The text once typing ends (blur or Enter), when it changed */
    onCommit?: (text: string) => void;
};

/**
 * A number in mm or pt (contract § 3.3): `type="text"` so Arabic digits and a comma can be read, left to right in both
 * languages. While it has the focus it shows what was typed; on blur, the number as formatted (or the raw text it couldn't use).
 */
export const MmField = ({label, value, rawInput, error, disabled, onType, onCommit}: Props) => {
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
            slotProps={{htmlInput: {inputMode: "decimal", dir: "ltr"}}}
        />
    );
};
