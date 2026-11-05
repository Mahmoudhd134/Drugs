import type {DataScope} from "../../api/dataScope.ts";

/*
 * A clinic's print layout (design prescription-templates § 3, § 5; contract § 2.1). The API's JSON as it is: millimetres
 * from the sheet's top-left corner whatever the language; numbers keep one decimal.
 */

export type PageSize = "A5" | "A4" | "custom";

export type TemplatePage = { size: PageSize; widthMm: number; heightMm: number };

/** The functions of the side panel. Values come with printing (step 2); the designer only shows their names. */
export type TemplateFunction = "fullDate" | "time" | "dayOfWeek" | "dayOfMonth" | "isoDateTime" | "pageNumber";

/** Every item's place, size and font. */
export type ItemBox = {
    /** Letters, digits, `_` and `-`, up to 40, unique in the template; never shown */
    id: string;
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
    fontSizePt: number;
};

export type PrescriptionTextItem = ItemBox & { kind: "prescriptionText" };
export type ManualInputItem = ItemBox & { kind: "manualInput"; name: string };
export type FunctionItem = ItemBox & { kind: "function"; function: TemplateFunction; name: string };
export type StaticTextItem = ItemBox & { kind: "staticText"; text: string };

export type TemplateItem = PrescriptionTextItem | ManualInputItem | FunctionItem | StaticTextItem;

export type TemplateItemKind = TemplateItem["kind"];

export type PrintLayout = { schemaVersion: 1; page: TemplatePage; items: TemplateItem[] };

/** `GET`/`PUT …/prescription-template`. */
export type PrintTemplate = { layout: PrintLayout; updatedAt: string };

/** What a click in the side panel adds (the prescription text comes with every new layout and is never added). */
export type AddableItem =
    | { kind: "manualInput" }
    | { kind: "function"; function: TemplateFunction }
    | { kind: "staticText" };

/** A broken rule, as the API names it: `{field: "items[2].name", code: "nameRequired"}`. */
export type LayoutError = { field: string; code: string };

/**
 * Where the designer gets and saves a clinic's template (design D5, M1.5 D9): it never builds URLs. The platform admin
 * passes `adminPrintTemplateApi(clinicId)` (features/admin/adapters.ts); a clinic-side screen later passes its own.
 */
export type PrintTemplateAdapter = DataScope & {
    /** null: the clinic has no template (204) */
    get: () => Promise<PrintTemplate | null>;
    save: (layout: PrintLayout) => Promise<PrintTemplate>;
    remove: () => Promise<void>;
};
