import {type ReactNode, useEffect, useLayoutEffect, useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {getErrorMessage, toApiError} from "../../api/errors.ts";
import {useSingleFlight} from "../../hooks/useSingleFlight.ts";
import {useClinic} from "../auth/useAuth.ts";
import {htmlForPaste} from "../prescription/prescriptionText.ts";
import {readTemplateAtPrint, useClinicPrintTemplate} from "./clinicTemplate.ts";
import {PrintDialog} from "./components/PrintDialog.tsx";
import {type PrintJob, PrintRoot} from "./components/PrintRoot.tsx";
import {paginate} from "./pagination.ts";
import {cleanPrintHtml} from "./printHtml.ts";
import {createTextMeasurer, loadPrintFont} from "./printMeasure.ts";
import type {ManualInputItem, PrescriptionTextItem, PrintLayout} from "./types.ts";

export type PrescriptionPrinter = {
    /** The clinic has a template: Print shows. False while loading, with none, and after a failed read when the page opened */
    available: boolean;
    /** The flow of design § 4 for this editor HTML (`linesToHtml` or the editor's); a call while one runs is ignored */
    print: (html: string) => Promise<void>;
    /** The pop-up and the print root: rendered once, in the page */
    element: ReactNode;
};

type ManualValues = Record<string, string>;

const isManualInput = (item: PrintLayout["items"][number]): item is ManualInputItem => item.kind === "manualInput";
const isPrescriptionText = (item: PrintLayout["items"][number]): item is PrescriptionTextItem => item.kind === "prescriptionText";

/** One HTML string per sheet, measured in the print font. The hidden box is gone before `window.print`, also on an exception. */
const measureChunks = (html: string, layout: PrintLayout) => {
    const clean = cleanPrintHtml(htmlForPaste(html));
    // Every saved template holds one (the save rules); without it, nothing to measure against
    const textItem = layout.items.find(isPrescriptionText);
    if (!textItem) return paginate(clean, () => true);
    const measurer = createTextMeasurer(textItem);
    try {
        return paginate(clean, measurer.fits);
    } finally {
        measurer.dispose();
    }
};

/** The prescription page's printing (contract § 3.2). */
export const usePrintPrescription = (): PrescriptionPrinter => {
    const {t} = useTranslation();
    const {clinicId} = useClinic();
    const queryClient = useQueryClient();
    const template = useClinicPrintTemplate(clinicId);
    const once = useSingleFlight();
    const [asking, setAsking] = useState<ManualInputItem[] | null>(null);
    const [job, setJob] = useState<PrintJob | null>(null);
    /** The waiting flow's resolver: answers once, so a second confirm does nothing (TPL-116) */
    const answer = useRef<((values: ManualValues | null) => void) | null>(null);
    /** The page is gone: a flow still running stops at its next step (TPL-341) */
    const gone = useRef(false);

    const settle = (values: ManualValues | null) => {
        const resolve = answer.current;
        if (!resolve) return;
        answer.current = null;
        setAsking(null);
        resolve(values);
    };

    useEffect(() => {
        gone.current = false;
        return () => {
            gone.current = true;
            answer.current?.(null);
            answer.current = null;
        };
    }, []);

    // In one effect: `afterprint` fires inside `window.print` on a desktop browser, so the listener is there before it. It's the only thing that
    // clears a job but the next print and the page's unmount, since `window.print` may return at once on a phone (TPL-322)
    useLayoutEffect(() => {
        if (!job) return;
        const finish = () => setJob(null);
        window.addEventListener("afterprint", finish);
        window.print();
        return () => window.removeEventListener("afterprint", finish);
    }, [job]);

    const askValues = (items: ManualInputItem[]) => new Promise<ManualValues | null>(resolve => {
        answer.current = resolve;
        setAsking(items);
    });

    const runFlow = async (html: string) => {
        let current;
        try {
            current = await readTemplateAtPrint(queryClient, clinicId);
        } catch (error) {
            // The query cache already toasted a 403 (TPL-343)
            if (!gone.current && toApiError(error)?.status !== 403) toast.error(getErrorMessage(error));
            return;
        }
        if (gone.current) return;
        if (!current) {
            toast.error(t("printTemplates.print.gone"));
            return;
        }
        const {layout} = current;

        const manualInputs = layout.items.filter(isManualInput);
        let manualValues: ManualValues = {};
        if (manualInputs.length > 0) {
            const values = await askValues(manualInputs);
            if (!values || gone.current) return;
            manualValues = values;
        }
        // At the confirm: every sheet shows this value (TPL-316)
        const now = new Date();

        await loadPrintFont();
        if (gone.current) return;
        setJob({layout, chunks: measureChunks(html, layout), manualValues, now});
    };

    return {
        available: template.isSuccess && !!template.data,
        print: async html => {
            await once(() => runFlow(html));
        },
        element: (
            <>
                <PrintDialog items={asking} onConfirm={settle} onCancel={() => settle(null)}/>
                {job && <PrintRoot job={job}/>}
            </>
        ),
    };
};
