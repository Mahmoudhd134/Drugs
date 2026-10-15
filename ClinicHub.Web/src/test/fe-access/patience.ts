import {afterAll, beforeAll} from "vitest";
import {configure, getConfig} from "@testing-library/react";

/**
 * Lets this file's `findBy…` / `waitFor` wait up to 5 s instead of Testing Library's 1 s: MUI transitions (dialogs,
 * tooltips) and dialog forms take longer on a busy machine. A passing wait still returns as soon as it holds.
 * Call once at the top of a test file; restored after the file.
 */
export const patientWaits = (timeout = 5_000) => {
    let previous = getConfig().asyncUtilTimeout;
    beforeAll(() => {
        previous = getConfig().asyncUtilTimeout;
        configure({asyncUtilTimeout: timeout});
    });
    afterAll(() => configure({asyncUtilTimeout: previous}));
};
