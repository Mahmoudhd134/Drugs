/*
 * The check `useUnsavedGuard` registers, for the exits that don't start as a navigation (contract § 3.8): logging out and
 * "Edit template clinic" change the session first, and a changed session is a forced move, which nothing blocks. Kept in
 * its own small file: the app bar's chunk imports it, and it must not pull in the designer.
 */

type LeaveCheck = () => Promise<boolean>;

let check: LeaveCheck | null = null;

/** The mounted guard's check; returns the unregister function. One guard at a time (one designer on screen). */
export const registerLeaveCheck = (leaveCheck: LeaveCheck) => {
    check = leaveCheck;
    return () => {
        if (check === leaveCheck) check = null;
    };
};

/** True when leaving is fine: no guard, nothing unsaved, or the user chose to leave. */
export const confirmLeave = () => (check ? check() : Promise.resolve(true));

/**
 * Whether the blocker stops a navigation: unsaved changes, the same session context as when the guard mounted (another one
 * is a forced move: session or clinic lost, nothing blocks it, TPL-249), and another path (a change of query or hash doesn't
 * leave the designer). Pure: the hook passes `currentContextKey()` and the blocker's locations.
 */
export const blocksExit = ({dirty, contextAtMount, contextNow, fromPath, toPath}: {
    dirty: boolean;
    contextAtMount: string;
    contextNow: string;
    fromPath: string;
    toPath: string;
}) => dirty && contextNow === contextAtMount && fromPath !== toPath;
