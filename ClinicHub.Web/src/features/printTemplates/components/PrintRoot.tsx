import {createPortal} from "react-dom";
import {PRINT_ROOT_ID} from "../constants.ts";
import {itemValue} from "../functions.ts";
import type {PrintLayout} from "../types.ts";
import {TemplateSheet} from "./TemplateSheet.tsx";

/** What one print shows: one sheet per chunk of prescription text. */
export type PrintJob = {
    layout: PrintLayout;
    /** One HTML string per sheet, from `paginate` */
    chunks: string[];
    manualValues: Readonly<Record<string, string>>;
    now: Date;
    /**
     * A test print (step 4 design § 5): the sheet's values come from here, because this root computes them with `pages = chunks.length`, and a one-sheet page number is `""`.
     * The sheet gets `print.test` (T1: frontend).
     */
    test?: { values: Readonly<Record<string, string>> };
};

/**
 * The print rules, in the root's own `<style>`, so they live and die with it (TPL-323): Ctrl+P elsewhere prints the app as it does today.
 * `!important` beats the inline scroll lock MUI puts on `body` while a dialog is open (TPL-325).
 */
const printRules = ({widthMm, heightMm}: PrintLayout["page"]) => `@media print {
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; width: auto !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
  #${PRINT_ROOT_ID} { display: block !important; }
  .print-page { break-after: page; break-inside: avoid; }
  .print-page:last-child { break-after: auto; }
}`;

/** The element directly under `body` and the rules that exist only with it (contract § 3.4). On screen it never shows. */
export const PrintRoot = ({job}: { job: PrintJob }) => {
    const {layout, chunks, manualValues, now} = job;
    return createPortal(
        <div id={PRINT_ROOT_ID} style={{display: "none"}}>
            <style>{printRules(layout.page)}</style>
            {chunks.map((chunk, index) => {
                const context = {manualValues, now, page: index + 1, pages: chunks.length};
                const values = Object.fromEntries(layout.items.map(item => [item.id, itemValue(item, context)]));
                return (
                    <div key={index} className="print-page">
                        <TemplateSheet layout={layout} sampleText="" print={{textHtml: chunk, values}}/>
                    </div>
                );
            })}
        </div>,
        document.body,
    );
};
