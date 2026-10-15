import {vi} from "vitest";

/** Empties `localStorage` and `sessionStorage` (also done after every test by setup.ts). */
export const resetStorage = () => {
    localStorage.clear();
    sessionStorage.clear();
};

/**
 * Makes `localStorage` and `sessionStorage` throw on every access (private mode, quota exceeded, storage blocked by
 * the browser) until the returned function is called; setup.ts restores them after each test anyway.
 */
export const breakStorage = () => {
    const fail = () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
    const spies = (["getItem", "setItem", "removeItem", "clear", "key"] as const)
        .map(method => vi.spyOn(Storage.prototype, method).mockImplementation(fail));
    return () => spies.forEach(spy => spy.mockRestore());
};
