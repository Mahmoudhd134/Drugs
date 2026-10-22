import type {Drug} from "../drugs/types.ts";
import type {Dosing} from "../dosing/types.ts";

/**
 * A drug in a protocol. `dosing` overrides the drug's default dosing for this protocol: empty parts
 * fall back to the default (see mergeDosing). Its eye may be "ask" (chosen when the protocol is added).
 */
export interface ProtocolItem {
    drug: Drug;
    dosing?: Dosing | null;
}

/** A protocol with its items in order. */
export interface Protocol {
    id: number;
    name: string;
    items: ProtocolItem[];
}

export type SaveProtocolItem = { drugId: number; dosing: Dosing | null };
