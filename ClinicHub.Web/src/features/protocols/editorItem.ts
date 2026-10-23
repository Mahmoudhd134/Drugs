import type {ProtocolDrug} from "../drugs/types.ts";
import {eyeKey, isDosingEmpty, mergeDosing, normalizeDosing, type Dosing} from "../dosing/types.ts";
import type {ProtocolItem, SaveProtocolItem} from "./types.ts";

/** A protocol line while editing a protocol. */
export interface EditorItem {
    key: string;
    drug: ProtocolDrug;
    /** Override of the drug's default dosing (empty = use the default) */
    dosing: Dosing;
}

let nextKey = 0;
export const newItemKey = () => `item-${++nextKey}`;

export const toEditorItems = (items: ProtocolItem[] | undefined): EditorItem[] =>
    (items ?? []).map(i => ({key: newItemKey(), drug: i.drug, dosing: normalizeDosing(i.dosing)}));

/** The dosing a line really gives: the drug default with the protocol override on top. */
export const effectiveDosing = (item: Pick<EditorItem, "drug" | "dosing">) =>
    mergeDosing(item.drug.defaultDosing, item.dosing);

/** A drug can appear once per (effective) eye in a protocol. */
export const itemIdentity = (item: Pick<EditorItem, "drug" | "dosing">) =>
    `${item.drug.id}:${eyeKey(effectiveDosing(item))}`;

/**
 * Keys of the lines that give the same drug for the same effective eye as another line. The editor never makes such
 * lines, but a protocol saved before a drug's default eye changed can hold them; the API refuses to save them
 * (`duplicateProtocolItem`).
 */
export const clashingItemKeys = (items: EditorItem[]): Set<string> => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(itemIdentity(item), (counts.get(itemIdentity(item)) ?? 0) + 1);
    return new Set(items.filter(item => (counts.get(itemIdentity(item)) ?? 0) > 1).map(item => item.key));
};

export const toSaveItems = (items: EditorItem[]): SaveProtocolItem[] =>
    items.map(i => ({drugId: i.drug.id, dosing: isDosingEmpty(i.dosing) ? null : normalizeDosing(i.dosing)}));

/** Comparable snapshot for unsaved-changes detection. */
export const itemsSignature = (items: EditorItem[]) => JSON.stringify(toSaveItems(items));
