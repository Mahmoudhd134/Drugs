import {StrictMode} from "react";
import {describe, expect, test} from "vitest";
import {act, renderHook} from "@testing-library/react";
import {aDrug, aLine, breakStorage, recordRequests} from "../../test";
import type {Dosing} from "../dosing/types.ts";
import type {Drug} from "../drugs/types.ts";
import {linesToPlainText} from "./prescriptionText.ts";
import type {PrescriptionLine} from "./types.ts";
import {lineIdentity, newLine, usePrescriptionLines} from "./usePrescriptionLines.ts";

// State rules: docs/features/prescription/tech.md "State: usePrescriptionLines.ts", business.md "القواعد التشغيلية".

const KEY = (clinicId: number) => `prescription.lines.${clinicId}`;
const stored = (clinicId: number): PrescriptionLine[] | null => JSON.parse(localStorage.getItem(KEY(clinicId)) ?? "null");
const store = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
const renderLines = (clinicId = 1) => renderHook(({id}) => usePrescriptionLines(id), {initialProps: {id: clinicId}});

const right: Dosing = {doseAmount: 1, doseUnit: "drop", eye: "right", frequency: "daily", frequencyValue: 4};
const tobradex = () => aDrug({name: "Tobradex", defaultDosing: right});

describe("usePrescriptionLines: adding @area:prescription", () => {
    test("a drug whose line moved to the left eye is added again for its default right eye @RX-008", () => {
        const drug = tobradex();
        const {result} = renderLines();
        act(() => void result.current.addDrugs([drug]));
        const line = result.current.lines[0];
        act(() => void expect(result.current.updateLine(line.key, {dosing: {...line.dosing, eye: "left"}, note: ""})).toBe(true));

        let outcome = {added: 0, skipped: 0};
        act(() => void (outcome = result.current.addDrugs([drug])));
        expect(outcome).toEqual({added: 1, skipped: 0});
        expect(result.current.lines.map(l => l.dosing.eye)).toEqual(["left", "right"]);
        // Once more: both eyes are taken now
        act(() => void (outcome = result.current.addDrugs([drug])));
        expect(outcome).toEqual({added: 0, skipped: 1});
        expect(result.current.lines).toHaveLength(2);
    });

    test("the same drug twice in one batch adds one line @RX-011", () => {
        const drug = tobradex();
        const {result} = renderLines();
        let outcome = {added: 0, skipped: 0};
        act(() => void (outcome = result.current.addDrugs([drug, drug])));
        expect(outcome).toEqual({added: 1, skipped: 1});
        expect(result.current.lines).toHaveLength(1);
    });

    test("two adds of the same drug before a re-render give one line @RX-014", () => {
        const drug = tobradex();
        const {result} = renderLines();
        const outcomes: { added: number; skipped: number }[] = [];
        act(() => {
            const {addDrugs} = result.current;
            outcomes.push(addDrugs([drug]), addDrugs([drug]));
        });
        expect(outcomes).toEqual([{added: 1, skipped: 0}, {added: 0, skipped: 1}]);
        expect(result.current.lines).toHaveLength(1);
    });

    test("a line starts as a copy of the drug's default dosing with an empty note", () => {
        const drug = tobradex();
        const line = newLine(drug);
        expect(line).toMatchObject({drug, dosing: right, note: ""});
        expect(line.dosing).not.toBe(drug.defaultDosing);
        expect(newLine(aDrug()).dosing).toEqual({});
        expect(newLine(drug).key).not.toBe(line.key);
        expect(lineIdentity(7, {eye: "left"})).toBe("7:left");
        expect(lineIdentity(7, {})).toBe("7:none");
    });

    test("drugIds lists the drugs that have a line", () => {
        const a = tobradex();
        const b = aDrug({name: "Vigamox"});
        const {result} = renderLines();
        act(() => void result.current.addDrugs([a, b]));
        expect([...result.current.drugIds]).toEqual([a.id, b.id]);
        act(() => result.current.removeLine(result.current.lines[0].key));
        expect([...result.current.drugIds]).toEqual([b.id]);
    });
});

describe("usePrescriptionLines: editing @area:prescription", () => {
    test("changing a line's eye to one the drug already uses changes nothing", () => {
        const drug = tobradex();
        const {result} = renderLines();
        act(() => void result.current.addDrugs([drug]));
        act(() => result.current.addOtherEye(result.current.lines[0]));
        const [rightLine, leftLine] = result.current.lines;
        let saved = true;
        act(() => void (saved = result.current.updateLine(leftLine.key, {dosing: {...leftLine.dosing, eye: "right"}, note: "x"})));
        expect(saved).toBe(false);
        expect(result.current.lines).toEqual([rightLine, leftLine]);

        act(() => void (saved = result.current.updateLine(leftLine.key, {dosing: {...leftLine.dosing, frequencyValue: 2}, note: "رج"})));
        expect(saved).toBe(true);
        expect(result.current.lines[1]).toMatchObject({key: leftLine.key, note: "رج", dosing: {eye: "left", frequencyValue: 2}});
        expect(result.current.updateLine("missing", {dosing: {}, note: ""})).toBe(false);
    });

    test("other eye: offered for right/left lines whose other eye is free, inserted right after the line", () => {
        const a = tobradex();
        const b = aDrug({name: "Vigamox", defaultDosing: {eye: "both"}});
        const c = aDrug({name: "Pred Forte", defaultDosing: {eye: "left", doseUnit: "drop"}});
        const {result} = renderLines();
        act(() => void result.current.addDrugs([a, b, c]));
        const [aLine0, bLine, cLine] = result.current.lines;
        act(() => result.current.updateLine(aLine0.key, {dosing: aLine0.dosing, note: "رج الزجاجة"}));
        expect(result.current.canAddOtherEye(bLine)).toBe(false);
        expect(result.current.canAddOtherEye(result.current.lines[0])).toBe(true);

        act(() => result.current.addOtherEye(result.current.lines[0]));
        const lines = result.current.lines;
        expect(lines.map(l => [l.drug.name, l.dosing.eye])).toEqual([
            ["Tobradex", "right"], ["Tobradex", "left"], ["Vigamox", "both"], ["Pred Forte", "left"],
        ]);
        expect(lines[1]).toMatchObject({note: "رج الزجاجة", dosing: {...right, eye: "left"}});
        expect(lines[1].key).not.toBe(lines[0].key);
        expect(result.current.canAddOtherEye(lines[0])).toBe(false);
        expect(result.current.canAddOtherEye(lines[1])).toBe(false);

        // Nothing happens when the other eye is taken, or for both / no eye
        act(() => result.current.addOtherEye(lines[0]));
        act(() => result.current.addOtherEye(bLine));
        expect(result.current.lines).toHaveLength(4);
        expect(result.current.canAddOtherEye(cLine)).toBe(true);
    });

    test("the other eye of a later line goes right after that line", () => {
        const a = aDrug({name: "Vigamox"});
        const b = tobradex();
        const c = aDrug({name: "Pred Forte"});
        const {result} = renderLines();
        act(() => void result.current.addDrugs([a, b, c]));
        act(() => result.current.addOtherEye(result.current.lines[1]));
        expect(result.current.lines.map(l => [l.drug.name, l.dosing.eye ?? null]))
            .toEqual([["Vigamox", null], ["Tobradex", "right"], ["Tobradex", "left"], ["Pred Forte", null]]);
    });

    test("findLine, setLineDosing (keeps place and note), addLines, removeLine, reorder", () => {
        const a = tobradex();
        const b = aDrug({name: "Vigamox"});
        const {result} = renderLines();
        act(() => void result.current.addDrugs([a, b]));
        const [lineA, lineB] = result.current.lines;
        act(() => void result.current.updateLine(lineA.key, {dosing: lineA.dosing, note: "n"}));
        expect(result.current.findLine(a.id, {eye: "right"})?.key).toBe(lineA.key);
        expect(result.current.findLine(a.id, {eye: "left"})).toBeUndefined();
        expect(result.current.findLine(b.id, {eye: "none"})?.key).toBe(lineB.key);

        act(() => result.current.setLineDosing(lineA.key, {...right, frequencyValue: 6}));
        expect(result.current.lines[0]).toMatchObject({key: lineA.key, note: "n", dosing: {frequencyValue: 6}});

        const extra = aLine(aDrug({name: "Pred Forte"}));
        act(() => result.current.addLines([extra]));
        act(() => result.current.addLines([]));
        expect(result.current.lines.map(l => l.key)).toEqual([lineA.key, lineB.key, extra.key]);

        act(() => result.current.reorder([extra, result.current.lines[0], lineB]));
        expect(result.current.lines.map(l => l.key)).toEqual([extra.key, lineA.key, lineB.key]);
        act(() => result.current.removeLine(lineA.key));
        expect(result.current.lines.map(l => l.key)).toEqual([extra.key, lineB.key]);
    });

    test("undo after «مسح الكل» puts back exactly the cleared lines, dropping one added since @RX-086", () => {
        const a = tobradex();
        const b = aDrug({name: "Vigamox"});
        const {result} = renderLines();
        act(() => void result.current.addDrugs([a, b]));
        const before = result.current.lines;
        let restore = () => undefined as void;
        act(() => void (restore = result.current.clear()));
        expect(result.current.lines).toEqual([]);
        expect(stored(1)).toEqual([]);

        act(() => void result.current.addDrugs([aDrug({name: "Pred Forte"})]));
        act(() => restore());
        expect(result.current.lines).toEqual(before);
        expect(stored(1)).toEqual(before);
    });
});

describe("usePrescriptionLines: storage @area:prescription", () => {
    test("lines are stored only in localStorage under the clinic's key; nothing is sent to the API @RX-090", async () => {
        const recorder = recordRequests();
        const {result} = renderLines(7);
        act(() => void result.current.addDrugs([tobradex(), aDrug({name: "Vigamox"})]));
        act(() => result.current.removeLine(result.current.lines[1].key));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(Object.keys(localStorage).filter(key => key.startsWith("prescription"))).toEqual([KEY(7)]);
        expect(stored(7)).toEqual(result.current.lines);
        expect(recorder.requests).toEqual([]);
    });

    test("the stored lines come back on the next visit, per clinic", () => {
        const first = renderLines(1);
        act(() => void first.result.current.addDrugs([tobradex()]));
        const lines = first.result.current.lines;
        first.unmount();

        expect(renderLines(1).result.current.lines).toEqual(lines);
        expect(renderLines(2).result.current.lines).toEqual([]);
    });

    test("corrupt JSON or a non-array starts empty without an error @RX-092", () => {
        localStorage.setItem(KEY(1), "{not json");
        expect(renderLines(1).result.current.lines).toEqual([]);
        store(KEY(2), {lines: []});
        expect(renderLines(2).result.current.lines).toEqual([]);
        store(KEY(3), "text");
        expect(renderLines(3).result.current.lines).toEqual([]);
    });

    test("without localStorage (private mode, quota) the page still works, only persistence is lost @RX-093", () => {
        const restoreStorage = breakStorage();
        const {result} = renderLines();
        expect(result.current.lines).toEqual([]);
        act(() => void result.current.addDrugs([tobradex()]));
        expect(result.current.lines).toHaveLength(1);
        restoreStorage();
        expect(stored(1)).toBeNull();
    });

    test("the old unscoped key moves to the first clinic opened, then is removed @RX-094", () => {
        const lines = [aLine(tobradex()), aLine(aDrug({name: "Vigamox"}))];
        store("prescription.lines", lines);
        const {result} = renderLines(5);
        expect(result.current.lines).toEqual(lines);
        expect(stored(5)).toEqual(lines);
        expect(localStorage.getItem("prescription.lines")).toBeNull();
    });

    test("the legacy drug list becomes lines with each drug's default dosing, under the clinic key @RX-095", () => {
        const withDosing = tobradex();
        const withDescription: Drug = aDrug({name: "Artificial tears", description: "قطرة مرطبة\nعند الحاجة"});
        store("prescription.selection", [withDosing, withDescription]);
        const {result} = renderLines(3);

        expect(result.current.lines.map(l => [l.drug, l.dosing, l.note])).toEqual([
            [withDosing, right, ""],
            [withDescription, {}, ""],
        ]);
        expect(stored(3)).toEqual(result.current.lines);
        expect(localStorage.getItem("prescription.selection")).toBeNull();
        expect(linesToPlainText(result.current.lines))
            .toBe("Tobradex\nنقطة واحدة في العين اليمنى 4 مرات يوميًا\n\nArtificial tears\nقطرة مرطبة\nعند الحاجة");
    });

    test("the migration survives its initializer running twice (React strict mode) @RX-096", () => {
        store("prescription.selection", [tobradex()]);
        const {result} = renderHook(() => usePrescriptionLines(4), {wrapper: StrictMode});
        expect(result.current.lines).toHaveLength(1);
        expect(stored(4)).toHaveLength(1);
        expect(localStorage.getItem("prescription.selection")).toBeNull();

        store("prescription.lines", [aLine(aDrug({name: "Vigamox"}))]);
        const second = renderHook(() => usePrescriptionLines(8), {wrapper: StrictMode});
        expect(second.result.current.lines.map(l => l.drug.name)).toEqual(["Vigamox"]);
        expect(stored(8)).toHaveLength(1);
    });

    test("a clinic with its own key keeps its lines; the old key is left for another clinic @RX-097", () => {
        const own = [aLine(tobradex())];
        const old = [aLine(aDrug({name: "Vigamox"}))];
        store(KEY(1), own);
        store("prescription.lines", old);
        expect(renderLines(1).result.current.lines).toEqual(own);
        expect(JSON.parse(localStorage.getItem("prescription.lines")!)).toEqual(old);
        expect(renderLines(2).result.current.lines).toEqual(old);
    });

    test("both old keys: the unscoped lines go to the first clinic, the drug list to the next one @RX-098", () => {
        const unscoped = [aLine(tobradex())];
        const legacyDrug = aDrug({name: "Vigamox", defaultDosing: {doseUnit: "drop"}});
        store("prescription.lines", unscoped);
        store("prescription.selection", [legacyDrug]);

        expect(renderLines(1).result.current.lines).toEqual(unscoped);
        expect(localStorage.getItem("prescription.selection")).not.toBeNull();
        const next = renderLines(2).result.current.lines;
        expect(next.map(l => [l.drug.name, l.dosing])).toEqual([["Vigamox", {doseUnit: "drop"}]]);
        expect(localStorage.getItem("prescription.selection")).toBeNull();
        expect(renderLines(3).result.current.lines).toEqual([]);
    });

    test("a line stored before tapering (no taperSteps) loads and reads as before @TAPER-024", () => {
        const drug = aDrug({name: "Tobradex"});
        const old = {key: "old-1", drug, note: "", dosing: {doseAmount: 2, doseUnit: "drop", eye: "left", frequency: "daily", frequencyValue: 6, durationUnit: "weeks", durationValue: 2}};
        store(KEY(1), [old]);
        const {result} = renderLines(1);
        expect(result.current.lines).toEqual([old]);
        expect(linesToPlainText(result.current.lines)).toBe("Tobradex\nنقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين");
    });
});
