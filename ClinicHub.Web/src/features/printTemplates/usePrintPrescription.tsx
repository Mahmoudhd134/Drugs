import {type ReactNode, useEffect, useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import toast from "react-hot-toast";
import {useTranslation} from "react-i18next";
import {getErrorMessage, toApiError} from "../../api/errors.ts";
import {useSingleFlight} from "../../hooks/useSingleFlight.ts";
import {useClinic} from "../auth/useAuth.ts";
import {readTemplateAtPrint, useClinicPrintTemplate} from "./clinicTemplate.ts";
import {PrintDialog} from "./components/PrintDialog.tsx";
import {normalizeLayout} from "./layout.ts";
import {loadPrintFont} from "./printMeasure.ts";
import type {ManualInputItem, PrintLayout} from "./types.ts";
import {measureChunks, usePrintJob} from "./usePrintJob.tsx";

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
/** The prescription page's printing (contract § 3.2). */
export const usePrintPrescription = (): PrescriptionPrinter => {
    const {t} = useTranslation();
    const {clinicId} = useClinic();
    const queryClient = useQueryClient();
    const template = useClinicPrintTemplate(clinicId);
    const once = useSingleFlight();
    const [asking, setAsking] = useState<ManualInputItem[] | null>(null);
    const printJob = usePrintJob();
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
        // A copy cached before step 4 has no calibration: it prints at 0, 0, never at `NaNmm` (TPL-605)
        const layout = normalizeLayout(current.layout);

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
        printJob.start({layout, chunks: measureChunks(html, layout), manualValues, now});
    };

    return {
        available: template.isSuccess && !!template.data,
        print: async html => {
            await once(() => runFlow(html));
        },
        element: (
            <>
                <PrintDialog items={asking} onConfirm={settle} onCancel={() => settle(null)}/>
                {printJob.element}
            </>
        ),
    };
};
