import type {Dosing} from "../dosing/types.ts";

export interface Drug {
    id: number;
    name: string;
    description?: string | null;
    /** Used when the drug is added to a prescription */
    defaultDosing?: Dosing | null;
}

export type SaveDrug = { name: string; description: string | null; defaultDosing: Dosing | null };
