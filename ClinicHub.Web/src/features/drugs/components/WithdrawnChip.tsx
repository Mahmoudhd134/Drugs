import {useContext, useId} from "react";
import {Box, Chip} from "@mui/material";
import BlockIcon from "@mui/icons-material/Block";
import {useTranslation} from "react-i18next";
import {TapTooltip} from "../../../components/common/TapTooltip.tsx";
import {WithdrawnChipInsideControl} from "./withdrawnChipContext.ts";

export type WithdrawnChipProps = {
    /** A count ("Disabled by admin: N", protocol cards); none = the line's or row's mark */
    count?: number;
};

/**
 * The one «معطّل من الإدارة» / "Disabled by admin" mark (design M1.7 D6): protocol editor lines, protocol cards
 * (`count`), prescription lines, admin drug rows. Focusable; its tooltip `drugs.withdrawn.tooltip` opens on hover,
 * keyboard focus and at once on tap (`TapTooltip`), closes on Esc or a tap elsewhere, and is also its accessible
 * description (always, not only while the tooltip is open). Screen only: never in the copied prescription text.
 * Inside a clickable control (`WithdrawnChipInsideControl`) it is not a Tab stop of its own.
 */
export const WithdrawnChip = ({count}: WithdrawnChipProps) => {
    const {t} = useTranslation();
    const descriptionId = useId();
    const insideControl = useContext(WithdrawnChipInsideControl);
    const tooltip = t("drugs.withdrawn.tooltip");
    return (
        <>
            <TapTooltip title={tooltip} arrow describeChild>
                <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    icon={<BlockIcon/>}
                    label={count === undefined ? t("drugs.withdrawn.chip") : t("drugs.withdrawn.count", {count})}
                    tabIndex={insideControl ? undefined : 0}
                    aria-describedby={descriptionId}
                    // No native title tooltip next to MUI's
                    title={undefined}
                    sx={{
                        maxWidth: "100%",
                        height: "auto",
                        cursor: "help",
                        "& .MuiChip-label": {whiteSpace: "normal", overflowWrap: "anywhere", py: 0.25},
                        "&:focus-visible": {outline: "2px solid", outlineColor: "warning.main", outlineOffset: 1},
                    }}
                />
            </TapTooltip>
            <Box component="span" id={descriptionId} hidden>{tooltip}</Box>
        </>
    );
};
