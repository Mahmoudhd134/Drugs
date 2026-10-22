import type {ProtocolDrug} from "../drugs/types.ts";
import type {Dosing} from "../dosing/types.ts";

/**
 * A drug in a protocol. `dosing` overrides the drug's default dosing for this protocol: empty parts
 * fall back to the default (see mergeDosing). Its eye may be "ask" (chosen when the protocol is added).
 */
export interface ProtocolItem {
    /** Shared or own; a withdrawn one keeps its line with the «معطّل من الإدارة» chip (design M1.7 D6) */
    drug: ProtocolDrug;
    dosing?: Dosing | null;
}

/** A protocol with its items in order. */
export interface Protocol {
    id: number;
    name: string;
    items: ProtocolItem[];
}

export type SaveProtocolItem = { drugId: number; dosing: Dosing | null };
