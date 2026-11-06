import {type ReactNode, useEffect, useRef} from "react";
import {useSingleFlight} from "../../hooks/useSingleFlight.ts";
import {normalizeLayout} from "./layout.ts";
import {createTextMeasurer, loadPrintFont} from "./printMeasure.ts";
import {testPrintChunk, testPrintValues} from "./testPrintSample.ts";
import type {PrintLayout} from "./types.ts";
import {prescriptionTextOf, usePrintJob} from "./usePrintJob.tsx";

export type TestPrinter = {
    /**
     * One page of this layout, as it is (step 4 design A7, A9, § 3): `loadPrintFont`, then a job on `usePrintJob` with `chunks: [testPrintChunk(the prescription text's measurer's fits)]`, `manualValues: {}`, `now`
     * and `test: {values: testPrintValues(layout, now)}`. Sends no API request, shows no toast. A call while one runs is ignored; the page gone: it stops at its next step. Checks nothing: the designer's press validates first.
     */
    print: (layout: PrintLayout) => Promise<void>;
    /** `usePrintJob`'s root: `TemplateDesigner` renders it once */
    element: ReactNode;
};

/** The sample's one chunk, measured in the print font; the hidden box is gone before `window.print`, also on an exception. */
const measureSample = (layout: PrintLayout) => {
    const textItem = prescriptionTextOf(layout);
    if (!textItem) return testPrintChunk(() => true);
    const measurer = createTextMeasurer(textItem);
    try {
        return testPrintChunk(measurer.fits);
    } finally {
        measurer.dispose();
    }
};

/** Test print on `usePrintJob`, so it works in a platform context, with no `useClinic()`. */
export const useTestPrint = (): TestPrinter => {
    const {start, element} = usePrintJob();
    const once = useSingleFlight();
    /** The page is gone: a flow still waiting for the font stops there */
    const gone = useRef(false);

    useEffect(() => {
        gone.current = false;
        return () => {
            gone.current = true;
        };
    }, []);

    const runFlow = async (asPressed: PrintLayout) => {
        await loadPrintFont();
        if (gone.current) return;
        const layout = normalizeLayout(asPressed);
        const now = new Date();
        start({layout, chunks: [measureSample(layout)], manualValues: {}, now, test: {values: testPrintValues(layout, now)}});
    };

    return {
        print: async layout => {
            await once(() => runFlow(layout));
        },
        element,
    };
};
