import {type ReactNode, useLayoutEffect, useState} from "react";
import {htmlForPaste} from "../prescription/prescriptionText.ts";
import {type PrintJob, PrintRoot} from "./components/PrintRoot.tsx";
import {paginate} from "./pagination.ts";
import {cleanPrintHtml} from "./printHtml.ts";
import {createTextMeasurer} from "./printMeasure.ts";
import type {PrescriptionTextItem, PrintLayout} from "./types.ts";

export type PrintJobRunner = {
    /** Replaces any job left behind (one root, one `@page`: TPL-709) and calls `window.print` from a layout effect, with `afterprint` listening first; the job stays until `afterprint`, the next job or the unmount */
    start: (job: PrintJob) => void;
    /** The print root while a job exists: rendered once, in the page. It never shows on screen */
    element: ReactNode;
};

/** Extracted from `usePrintPrescription`, which calls `useClinic()` and so throws in a platform context (step 4 design § 5): the job, `afterprint` and the root. */
export const usePrintJob = (): PrintJobRunner => {
    const [job, setJob] = useState<PrintJob | null>(null);

    // In one effect: `afterprint` fires inside `window.print` on a desktop browser, so the listener is there before it. It's the only thing that
    // clears a job but the next print and the page's unmount, since `window.print` may return at once on a phone (TPL-322)
    useLayoutEffect(() => {
        if (!job) return;
        const finish = () => setJob(null);
        window.addEventListener("afterprint", finish);
        window.print();
        return () => window.removeEventListener("afterprint", finish);
    }, [job]);

    return {start: setJob, element: job && <PrintRoot job={job}/>};
};

/** The prescription text's box of a layout; every saved template holds one (the save rules). */
export const prescriptionTextOf = (layout: PrintLayout) =>
    layout.items.find((item): item is PrescriptionTextItem => item.kind === "prescriptionText");

/** One HTML string per sheet of this editor HTML, measured in the print font. The hidden box is gone before `window.print`, also on an exception. */
export const measureChunks = (html: string, layout: PrintLayout): string[] => {
    const clean = cleanPrintHtml(htmlForPaste(html));
    // Without a prescription text, nothing to measure against
    const textItem = prescriptionTextOf(layout);
    if (!textItem) return paginate(clean, () => true);
    const measurer = createTextMeasurer(textItem);
    try {
        return paginate(clean, measurer.fits);
    } finally {
        measurer.dispose();
    }
};
