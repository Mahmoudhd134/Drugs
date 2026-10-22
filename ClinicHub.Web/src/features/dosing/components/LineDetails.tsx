import {Typography} from "@mui/material";
import {useTranslation} from "react-i18next";
import {DosingText} from "./DosingText.tsx";
import {dosingToText} from "../dosingText.ts";
import {hasDosingInstructions, type Dosing} from "../types.ts";

type Props = {
    dosing: Dosing | null | undefined;
    /** The drug's description */
    description: string | null | undefined;
    /**
     * With neither a dosing sentence nor a description, show a muted «لا توجد جرعة محددة» (screen only, never in the
     * copied text; e.g. an imported shared drug, which has no default dosing: design M1.7 D9)
     */
    showEmpty?: boolean;
};

/**
 * What a prescription or protocol line shows under the drug name: the dosing sentence; when the dosing has no dose,
 * frequency, duration or tapering (empty, or only an eye), the drug's description followed by the eye part
 * («في العين اليمنى»; nothing for «بدون عين»). The copied text follows the same rule (`prescriptionText.ts`).
 */
export const LineDetails = ({dosing, description, showEmpty}: Props) => {
    const {t} = useTranslation();
    const showDescription = !hasDosingInstructions(dosing) && !!description;
    return (
        <>
            {showDescription && (
                <Typography variant="body2" color="text.secondary" sx={{whiteSpace: "pre-line", overflowWrap: "anywhere"}}>
                    {description}
                </Typography>
            )}
            <DosingText dosing={dosing}/>
            {showEmpty && !showDescription && !dosingToText(dosing) && (
                <Typography variant="body2" color="text.secondary" sx={{fontStyle: "italic"}}>{t("dosing.noDosing")}</Typography>
            )}
        </>
    );
};
