import type {ReactNode} from "react";
import type {PrintLayout} from "./types.ts";

export type TestPrinter = {
    /**
     * One page of this layout, as it is (step 4 design A7, A9, § 3): `loadPrintFont`, then a job on `usePrintJob` with `chunks: [testPrintChunk(the prescription text's measurer's fits)]`, `manualValues: {}`, `now`
     * and `test: {values: testPrintValues(layout, now)}`. Sends no API request, shows no toast. A call while one runs is ignored; the page gone: it stops at its next step. Checks nothing: the designer's press validates first.
     */
    print: (layout: PrintLayout) => Promise<void>;
    /** `usePrintJob`'s root: `TemplateDesigner` renders it once */
    element: ReactNode;
};

/** **Stub (T1: frontend).** Test print on `usePrintJob`, so it works in a platform context, with no `useClinic()`. */
export const useTestPrint = (): TestPrinter => ({print: async () => undefined, element: null});
