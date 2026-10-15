import {Typography} from "@mui/material";
import {DosingLineList} from "../../dosing/components/DosingLineList.tsx";
import {LineDetails} from "../../dosing/components/LineDetails.tsx";
import type {PrescriptionLine} from "../types.ts";

type Props = {
    lines: PrescriptionLine[];
    onReorder: (lines: PrescriptionLine[]) => void;
    onEdit: (line: PrescriptionLine) => void;
    onRemove: (line: PrescriptionLine) => void;
    canAddOtherEye: (line: PrescriptionLine) => boolean;
    onAddOtherEye: (line: PrescriptionLine) => void;
};

/** Prescription lines: drug, dosing sentence (or the drug description when the dosing has no instructions), note. */
export const PrescriptionLineList = (props: Props) => (
    <DosingLineList
        {...props}
        renderDetails={(line) => (
            <>
                <LineDetails dosing={line.dosing} description={line.drug.description}/>
                {line.note && (
                    <Typography variant="body2" color="text.secondary" dir="auto" sx={{fontStyle: "italic"}}>
                        {line.note}
                    </Typography>
                )}
            </>
        )}
    />
);
