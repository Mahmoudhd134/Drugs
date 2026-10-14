import type {Drug} from "../drugs/types.ts";
import type {Dosing} from "../dosing/types.ts";

/** One drug in the current prescription, with the dosing for this patient. */
export interface PrescriptionLine {
    /** Unique per line (the same drug can appear once per eye) */
    key: string;
    /** Snapshot of the drug when it was added */
    drug: Drug;
    /** Starts from the drug's default dosing; edited per patient */
    dosing: Dosing;
    /** Extra note for this patient */
    note: string;
}
