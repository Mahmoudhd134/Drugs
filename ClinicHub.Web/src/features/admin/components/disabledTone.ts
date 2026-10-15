import {alpha} from "@mui/material/styles";

/**
 * "Disabled" text and outlines: a darker amber than the theme's warning (#ed6c02 is ≈ 3:1 on white), ≈ 5:1 so small
 * text passes WCAG AA.
 */
const DISABLED_COLOR = "#b45309";

export const disabledChipSx = {color: DISABLED_COLOR, borderColor: alpha(DISABLED_COLOR, 0.6)};

/** An outlined button in {@link DISABLED_COLOR} (e.g. "Disable"). */
export const disabledToneSx = {
    ...disabledChipSx,
    "&:hover": {borderColor: DISABLED_COLOR, bgcolor: alpha(DISABLED_COLOR, 0.06)},
};
