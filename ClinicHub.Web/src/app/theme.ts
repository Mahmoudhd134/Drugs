import {createTheme} from "@mui/material/styles";
import type {Direction} from "../i18n/languages.ts";

const latinFont = '"Inter", "Segoe UI", system-ui, sans-serif';
const arabicFont = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';

/**
 * The warning amber: darker than MUI's (#ed6c02, ≈ 3:1 on white), ≈ 5:1 on white, so white text on it (filled alerts,
 * contained buttons) and small amber text (the "Disabled" chip and button, `disabledTone.ts`) pass WCAG AA.
 */
export const WARNING_COLOR = "#b45309";

export const createAppTheme = (direction: Direction) =>
    createTheme({
        direction,
        palette: {
            primary: {main: "#0f766e"},
            secondary: {main: "#4f46e5"},
            warning: {main: WARNING_COLOR},
            background: {default: "#f5f7f9", paper: "#ffffff"},
        },
        shape: {borderRadius: 10},
        typography: {
            fontFamily: direction === "rtl" ? `${arabicFont}, ${latinFont}` : `${latinFont}, ${arabicFont}`,
            button: {textTransform: "none", fontWeight: 600},
            h5: {fontWeight: 700},
            h6: {fontWeight: 700},
        },
        components: {
            MuiButton: {defaultProps: {disableElevation: true}},
            MuiPaper: {styleOverrides: {outlined: {borderColor: "#e3e8ee"}}},
            MuiTooltip: {defaultProps: {arrow: true}},
            MuiDialogTitle: {styleOverrides: {root: {fontWeight: 700}}},
        },
    });
