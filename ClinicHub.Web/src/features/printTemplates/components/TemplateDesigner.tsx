import type {PrintTemplateAdapter} from "../types.ts";

/**
 * The print template designer (contract § 3): the data and the draft live here, above the desktop-only switch, so narrowing
 * the window keeps the edits (TPL-229). Mounted per clinic: `ClinicPage` keys its `PageBoundary` by the clinic (TPL-245).
 * Reusable (design D5): all its data comes through the adapter.
 *
 * Contract stub: track print-templates/frontend writes the body.
 */
export const TemplateDesigner = ({adapter}: { adapter: PrintTemplateAdapter }) => {
    void adapter;
    return null;
};
