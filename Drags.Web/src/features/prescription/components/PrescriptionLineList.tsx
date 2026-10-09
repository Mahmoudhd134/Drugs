import {Typography} from "@mui/material";
import {DosingLineList} from "../../dosing/components/DosingLineList.tsx";
import {DosingText} from "../../dosing/components/DosingText.tsx";
import {isDosingEmpty} from "../../dosing/types.ts";
import type {PrescriptionLine} from "../types.ts";

type Props = {
    lines: PrescriptionLine[];
    onReorder: (lines: PrescriptionLine[]) => void;
    onEdit: (line: PrescriptionLine) => void;
    onRemove: (line: PrescriptionLine) => void;
    canAddOtherEye: (line: PrescriptionLine) => boolean;
    onAddOtherEye: (line: PrescriptionLine) => void;
};

/** Prescription lines: drug, dosing sentence (or the drug description when no dosing), note. */
export const PrescriptionLineList = (props: Props) => (
    <DosingLineList
        {...props}
        renderDetails={(line) => (
            <>
                {isDosingEmpty(line.dosing) ? (
                    line.drug.description && (
                        <Typography variant="body2" color="text.secondary" sx={{whiteSpace: "pre-line"}}>
                            {line.drug.description}
                        </Typography>
                    )
                ) : (
                    <DosingText dosing={line.dosing}/>
                )}
                {line.note && (
                    <Typography variant="body2" color="text.secondary" dir="auto" sx={{fontStyle: "italic"}}>
                        {line.note}
                    </Typography>
                )}
            </>
        )}
    />
);
