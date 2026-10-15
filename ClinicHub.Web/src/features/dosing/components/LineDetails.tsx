import {Typography} from "@mui/material";
import {DosingText} from "./DosingText.tsx";
import {hasDosingInstructions, type Dosing} from "../types.ts";

type Props = {
    dosing: Dosing | null | undefined;
    /** The drug's description */
    description: string | null | undefined;
};

/**
 * What a prescription or group line shows under the drug name: the dosing sentence; when the dosing has no dose,
 * frequency, duration or tapering (empty, or only an eye), the drug's description followed by the eye part
 * («في العين اليمنى»; nothing for «بدون عين»). The copied text follows the same rule (`prescriptionText.ts`).
 */
export const LineDetails = ({dosing, description}: Props) => (
    <>
        {!hasDosingInstructions(dosing) && description && (
            <Typography variant="body2" color="text.secondary" sx={{whiteSpace: "pre-line"}}>
                {description}
            </Typography>
        )}
        <DosingText dosing={dosing}/>
    </>
);
