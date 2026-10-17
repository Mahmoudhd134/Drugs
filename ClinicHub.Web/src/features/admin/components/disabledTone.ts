import {alpha} from "@mui/material/styles";
import {WARNING_COLOR} from "../../../app/theme.ts";

/** "Disabled" text and outlines: the theme's warning amber (≈ 5:1 on white, so small text passes WCAG AA). */
const DISABLED_COLOR = WARNING_COLOR;

export const disabledChipSx = {color: DISABLED_COLOR, borderColor: alpha(DISABLED_COLOR, 0.6)};

/** An outlined button in {@link DISABLED_COLOR} (e.g. "Disable"). */
export const disabledToneSx = {
    ...disabledChipSx,
    "&:hover": {borderColor: DISABLED_COLOR, bgcolor: alpha(DISABLED_COLOR, 0.06)},
};
