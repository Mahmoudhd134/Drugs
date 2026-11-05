/**
 * Measure and move (design § 4.6, contract § 2.4): the sheets' prescription text. `cleanHtml` is `cleanPrintHtml`'s output;
 * `fits` says whether a sheet's HTML fits the box (`printMeasure`'s in the app, a fake in unit tests). Answers one HTML string per
 * sheet, at least one. Pure logic over the DOM parser, no layout of its own.
 */
export const paginate: (cleanHtml: string, fits: (html: string) => boolean) => string[] = () => {
    throw new Error("contract stub");
};
