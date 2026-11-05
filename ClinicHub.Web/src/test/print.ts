import {act} from "@testing-library/react";
import {vi} from "vitest";
import {PRINT_ROOT_ID} from "../features/printTemplates/constants.ts";

/**
 * A stubbed `window.print` for component tests (contract § 4.1). jsdom has no layout, so every text fits one sheet there: page
 * counts and geometry are e2e's. `print` is the spy; it fires no `afterprint`, like a browser whose print is still open. Call it
 * before the page renders; `vi.restoreAllMocks` or `print.mockRestore()` undoes it.
 */
export const installPrint = () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    return {
        print,
        /** The browser's dialog closed, printed or cancelled */
        finishPrint: () => act(() => {
            window.dispatchEvent(new Event("afterprint"));
        }),
        printRoot: () => document.getElementById(PRINT_ROOT_ID),
        printRoots: () => document.querySelectorAll(`#${PRINT_ROOT_ID}`),
        /** The sheets in order */
        sheets: () => Array.from(document.querySelectorAll<HTMLElement>(`#${PRINT_ROOT_ID} [data-testid=print-sheet]`)),
        /** An item's box on a sheet */
        itemOn: (sheet: HTMLElement, id: string) => sheet.querySelector<HTMLElement>(`[data-item-id="${id}"]`),
    };
};
