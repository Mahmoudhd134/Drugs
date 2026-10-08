import type {Drug} from "../drugs/types.ts";

/** A group with its drugs in order. */
export interface DrugGroup {
    id: number;
    name: string;
    drugs: Drug[];
}
