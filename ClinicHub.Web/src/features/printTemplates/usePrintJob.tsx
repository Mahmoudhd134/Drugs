import type {ReactNode} from "react";
import type {PrintJob} from "./components/PrintRoot.tsx";
import type {PrintLayout} from "./types.ts";

export type PrintJobRunner = {
    /** Replaces any job left behind (one root, one `@page`: TPL-709) and calls `window.print` from a layout effect, with `afterprint` listening first; the job stays until `afterprint`, the next job or the unmount */
    start: (job: PrintJob) => void;
    /** The print root while a job exists: rendered once, in the page. It never shows on screen */
    element: ReactNode;
};

/**
 * **Stub (T1: frontend).** Extracted from `usePrintPrescription`, which calls `useClinic()` and so throws in a platform context (step 4 design § 5): the job, `afterprint` and the root.
 * `usePrintPrescription` then uses this and its behaviour doesn't change.
 */
export const usePrintJob = (): PrintJobRunner => ({start: () => undefined, element: null});

/**
 * **Stub (T1: frontend).** Moved here from `usePrintPrescription`: one HTML string per sheet of this editor HTML, measured in the print font; the hidden box is gone before `window.print`, also on an exception.
 */
export const measureChunks: (html: string, layout: PrintLayout) => string[] = () => [];
