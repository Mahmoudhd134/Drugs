import type {ReactNode} from "react";

export type PrescriptionPrinter = {
    /** The clinic has a template: Print shows. False while loading, with none, and after a failed read when the page opened */
    available: boolean;
    /** The flow of design § 4 for this editor HTML (`linesToHtml` or the editor's); a call while one runs is ignored */
    print: (html: string) => Promise<void>;
    /** The pop-up and the print root: rendered once, in the page */
    element: ReactNode;
};

/** The prescription page's printing (contract § 3.2). */
export const usePrintPrescription = (): PrescriptionPrinter => {
    throw new Error("contract stub");
};
