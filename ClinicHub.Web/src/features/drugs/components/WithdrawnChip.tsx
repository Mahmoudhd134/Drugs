import {Chip} from "@mui/material";
import {useTranslation} from "react-i18next";

export type WithdrawnChipProps = {
    /** A count ("Disabled by admin: N", protocol cards); none = the line's or row's mark */
    count?: number;
};

/**
 * The one «معطّل من الإدارة» / "Disabled by admin" mark (design M1.7 D6): protocol editor lines, protocol cards
 * (`count`), prescription lines, admin drug rows. Focusable; its tooltip `drugs.withdrawn.tooltip` opens on hover,
 * keyboard focus and at once on tap (`TapTooltip`), closes on Esc or a tap elsewhere, and is also its accessible
 * description. Screen only: never in the copied prescription text.
 * M1.7b contract: name and props are final; the body (tooltip, focus, description) is track `web`'s.
 */
export const WithdrawnChip = ({count}: WithdrawnChipProps) => {
    const {t} = useTranslation();
    return <Chip size="small" label={count === undefined ? t("drugs.withdrawn.chip") : t("drugs.withdrawn.count", {count})}/>;
};
