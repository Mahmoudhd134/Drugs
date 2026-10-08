import {createTheme} from "@mui/material/styles";
import type {Direction} from "../i18n/languages.ts";

const latinFont = '"Inter", "Segoe UI", system-ui, sans-serif';
const arabicFont = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';

export const createAppTheme = (direction: Direction) =>
    createTheme({
        direction,
        palette: {
            primary: {main: "#0f766e"},
            secondary: {main: "#4f46e5"},
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
