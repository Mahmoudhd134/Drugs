import type {Drug} from "../drugs/types.ts";
import type {Dosing} from "../dosing/types.ts";

/**
 * A drug in a group. `dosing` overrides the drug's default dosing for this group: empty parts
 * fall back to the default (see mergeDosing). Its eye may be "ask" (chosen when the group is added).
 */
export interface DrugGroupItem {
    drug: Drug;
    dosing?: Dosing | null;
}

/** A group with its items in order. */
export interface DrugGroup {
    id: number;
    name: string;
    items: DrugGroupItem[];
}

export type SaveDrugGroupItem = { drugId: number; dosing: Dosing | null };
