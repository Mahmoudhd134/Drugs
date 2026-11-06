import {describe, expect, test} from "vitest";
import {waitFor} from "@testing-library/react";
import {aLayoutBeforeStep4, aPrintLayout, aPrintTemplate, aTemplateItem} from "../../test";
import {staticText, templateNowIs, TEXT_ID, openWithTemplate} from "../../test/pages/printFlow.tsx";
import type {PrintTemplate, TemplateCalibration, TemplateItem} from "./types.ts";

// What a staff member's print does with the printer's correction: step 4 design §§ 3, 4; contract § 4.4. The PDF's positions: e2e.

const text = () => aTemplateItem("prescriptionText", {id: TEXT_ID, xMm: 14, yMm: 80, wMm: 120, hMm: 90});

const withCalibration = (calibration: TemplateCalibration, ...items: TemplateItem[]): PrintTemplate =>
    aPrintTemplate({layout: aPrintLayout({items: [text(), ...items], calibration})});

const fixed = (fields = {}) => ({...staticText("s1", "ثابت"), xMm: 14.1, yMm: 175.2, wMm: 60, hMm: 8, ...fields});

describe("a print and the correction @area:prescription", () => {
    test("a row from before the correction: every box at its own place, no NaNmm @TPL-605", async () => {
        const page = await openWithTemplate(aPrintTemplate({layout: aLayoutBeforeStep4({items: [text(), fixed()]})}));

        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const [sheet] = page.sheets();
        expect(sheet.outerHTML).not.toContain("NaN");
        expect(page.itemOn(sheet, "s1")?.style.left).toBe("14.1mm");
        expect(page.itemOn(sheet, "s1")?.style.top).toBe("175.2mm");
        expect(page.itemOn(sheet, "s1")?.style.transform, "no transform at 0, 0").toBe("");
    });

    test("a correction pushing a box off the sheet: the print still runs, with the box where the correction puts it @TPL-618", async () => {
        const page = await openWithTemplate(withCalibration({xMm: 20, yMm: 0}, fixed({xMm: 100, wMm: 40})));

        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));

        const box = page.itemOn(page.sheets()[0], "s1");
        expect(box?.style.transform).toBe("translate(20mm, 0mm)");
        expect(box?.style.left, "the designed place").toBe("100mm");
    });

    test("a correction saved elsewhere: the next print uses it, with no reload, in whole tenths @TPL-723", async () => {
        const page = await openWithTemplate(withCalibration({xMm: 0, yMm: 0}, fixed()));

        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(1));
        expect(page.itemOn(page.sheets()[0], "s1")?.style.left).toBe("14.1mm");
        expect(page.itemOn(page.sheets()[0], "s1")?.style.top).toBe("175.2mm");
        expect(page.itemOn(page.sheets()[0], "s1")?.style.transform, "no transform at 0, 0").toBe("");
        page.finishPrint();
        await waitFor(() => expect(page.printRoot()).toBeNull());

        templateNowIs(withCalibration({xMm: 0.2, yMm: -1.5}, fixed()));
        await page.pressPrint();
        await waitFor(() => expect(page.print).toHaveBeenCalledTimes(2));

        const [sheet] = page.sheets();
        for (const [id, left, top] of [["s1", "14.1mm", "175.2mm"], [TEXT_ID, "14mm", "80mm"]]) {
            const box = page.itemOn(sheet, id);
            expect(box?.style.transform, `${id}: moved`).toBe("translate(0.2mm, -1.5mm)");
            expect(box?.style.left, `${id}: the designed place`).toBe(left);
            expect(box?.style.top, `${id}: the designed place`).toBe(top);
        }
        expect(sheet.style.width).toBe("148mm");
    });
});
