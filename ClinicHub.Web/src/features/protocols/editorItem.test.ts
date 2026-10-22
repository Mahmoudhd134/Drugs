import {describe, expect, test} from "vitest";
import {aDrug, anItem} from "../../test";
import {normalizeDosing} from "../dosing/types.ts";
import {
    clashingItemKeys,
    effectiveDosing,
    itemIdentity,
    itemsSignature,
    newItemKey,
    toEditorItems,
    toSaveItems,
    type EditorItem,
} from "./editorItem.ts";

// Rules: docs/features/protocols/tech.md, design M1.6 § 5.3 (one drug per effective eye in a protocol).

const item = (fields: Omit<EditorItem, "key">): EditorItem => ({key: newItemKey(), ...fields});

describe("protocol editor items @area:catalog", () => {
    test("the effective dosing is the drug default with the override on top; the identity uses its eye", () => {
        const drug = aDrug({defaultDosing: {doseUnit: "drop", eye: "right", frequency: "daily", frequencyValue: 4}});
        const line = item({drug, dosing: {frequencyValue: 6, frequency: "daily"}});
        expect(effectiveDosing(line)).toEqual(normalizeDosing({doseUnit: "drop", eye: "right", frequency: "daily", frequencyValue: 6}));
        expect(itemIdentity(line)).toBe(`${drug.id}:right`);
        expect(itemIdentity(item({drug, dosing: {eye: "ask"}}))).toBe(`${drug.id}:ask`);
        expect(itemIdentity(item({drug: aDrug({id: 9}), dosing: {}}))).toBe("9:none");
    });

    test("lines giving the same drug for the same effective eye are marked as clashing", () => {
        const rightByDefault = aDrug({name: "Tobradex", defaultDosing: {eye: "right"}});
        const other = aDrug({name: "Vigamox"});
        const inherits = item({drug: rightByDefault, dosing: {}});
        const explicitRight = item({drug: rightByDefault, dosing: {eye: "right", frequency: "bedtime"}});
        const left = item({drug: rightByDefault, dosing: {eye: "left"}});
        const ask = item({drug: rightByDefault, dosing: {eye: "ask"}});
        const otherDrug = item({drug: other, dosing: {}});
        const otherDrugNone = item({drug: other, dosing: {eye: "none", frequency: "bedtime"}});

        expect(clashingItemKeys([inherits, explicitRight, left, ask, otherDrug, otherDrugNone]))
            .toEqual(new Set([inherits.key, explicitRight.key, otherDrug.key, otherDrugNone.key]));
        expect(clashingItemKeys([inherits, left, ask, otherDrug])).toEqual(new Set());
        expect(clashingItemKeys([])).toEqual(new Set());
    });

    test("loading a protocol: one editor line per item, the override normalized, a new key each", () => {
        const drug = aDrug();
        const items = toEditorItems([anItem(drug, {frequency: "bedtime", frequencyValue: 3}), anItem(drug, null)]);
        expect(items.map(i => i.dosing)).toEqual([normalizeDosing({frequency: "bedtime"}), normalizeDosing(null)]);
        expect(items[0].key).not.toBe(items[1].key);
        expect(toEditorItems(undefined)).toEqual([]);
    });

    test("saving: the drug id and the normalized override, null when empty", () => {
        const drug = aDrug({id: 5});
        const items = [item({drug, dosing: {}}), item({drug, dosing: {frequency: "custom", frequencyText: " x ", frequencyValue: 2}})];
        expect(toSaveItems(items)).toEqual([
            {drugId: 5, dosing: null},
            {drugId: 5, dosing: normalizeDosing({frequency: "custom", frequencyText: "x"})},
        ]);
        expect(itemsSignature(items)).toBe(JSON.stringify(toSaveItems(items)));
        // Keys don't count as a change
        expect(itemsSignature(items.map(i => ({...i, key: newItemKey()})))).toBe(itemsSignature(items));
    });
});
