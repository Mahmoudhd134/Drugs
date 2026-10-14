import type {Drug} from "../drugs/types.ts";
import {eyeKey, isDosingEmpty, mergeDosing, normalizeDosing, type Dosing} from "../dosing/types.ts";
import type {DrugGroupItem, SaveDrugGroupItem} from "./types.ts";

/** A group line while editing a group. */
export interface EditorItem {
    key: string;
    drug: Drug;
    /** Override of the drug's default dosing (empty = use the default) */
    dosing: Dosing;
}

let nextKey = 0;
export const newItemKey = () => `item-${++nextKey}`;

export const toEditorItems = (items: DrugGroupItem[] | undefined): EditorItem[] =>
    (items ?? []).map(i => ({key: newItemKey(), drug: i.drug, dosing: normalizeDosing(i.dosing)}));

/** The dosing a line really gives: the drug default with the group override on top. */
export const effectiveDosing = (item: Pick<EditorItem, "drug" | "dosing">) =>
    mergeDosing(item.drug.defaultDosing, item.dosing);

/** A drug can appear once per (effective) eye in a group. */
export const itemIdentity = (item: Pick<EditorItem, "drug" | "dosing">) =>
    `${item.drug.id}:${eyeKey(effectiveDosing(item))}`;

export const toSaveItems = (items: EditorItem[]): SaveDrugGroupItem[] =>
    items.map(i => ({drugId: i.drug.id, dosing: isDosingEmpty(i.dosing) ? null : normalizeDosing(i.dosing)}));

/** Comparable snapshot for unsaved-changes detection. */
export const itemsSignature = (items: EditorItem[]) => JSON.stringify(toSaveItems(items));
