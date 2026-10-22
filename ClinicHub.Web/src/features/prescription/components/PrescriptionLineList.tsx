import {Box, Typography} from "@mui/material";
import {DosingLineList} from "../../dosing/components/DosingLineList.tsx";
import {LineDetails} from "../../dosing/components/LineDetails.tsx";
import {WithdrawnChip} from "../../drugs/components/WithdrawnChip.tsx";
import type {PrescriptionLine} from "../types.ts";

type Props = {
    lines: PrescriptionLine[];
    onReorder: (lines: PrescriptionLine[]) => void;
    onEdit: (line: PrescriptionLine) => void;
    onRemove: (line: PrescriptionLine) => void;
    canAddOtherEye: (line: PrescriptionLine) => boolean;
    onAddOtherEye: (line: PrescriptionLine) => void;
};

/**
 * Prescription lines: drug, dosing sentence (or the drug description when the dosing has no instructions; for a shared
 * drug a muted «لا توجد جرعة محددة» when there is neither, an own drug's line shows its name alone as before, RX-060),
 * note, and the «معطّل من الإدارة» chip on a line added from a protocol
 * while its drug was disabled by the admin (the line's snapshot; screen only, never copied).
 */
export const PrescriptionLineList = (props: Props) => (
    <DosingLineList
        {...props}
        renderDetails={(line) => (
            <>
                <LineDetails dosing={line.dosing} description={line.drug.description} showEmpty={line.drug.isShared === true}/>
                {line.note && (
                    <Typography variant="body2" color="text.secondary" dir="auto" sx={{fontStyle: "italic"}}>
                        {line.note}
                    </Typography>
                )}
                {line.drug.withdrawn === true && (
                    // A tap shows the tooltip, it doesn't open the line's dialog
                    <Box sx={{mt: 0.5, display: "flex"}} onClick={(e) => e.stopPropagation()}>
                        <WithdrawnChip/>
                    </Box>
                )}
            </>
        )}
    />
);
