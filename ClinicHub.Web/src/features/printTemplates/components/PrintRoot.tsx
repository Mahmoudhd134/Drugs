import type {PrintLayout} from "../types.ts";

/** What one print shows: one sheet per chunk of prescription text. */
export type PrintJob = {
    layout: PrintLayout;
    /** One HTML string per sheet, from `paginate` */
    chunks: string[];
    manualValues: Readonly<Record<string, string>>;
    now: Date;
};

/** The element directly under `body` and the rules that exist only with it (contract § 3.4). */
export const PrintRoot: (props: { job: PrintJob }) => null = () => null;
