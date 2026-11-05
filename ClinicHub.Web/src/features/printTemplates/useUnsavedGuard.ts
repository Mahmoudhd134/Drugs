import type {ReactNode} from "react";

/**
 * Warns before unsaved changes are lost, on every exit of design D16 (contract § 3.8): `useBlocker` for every navigation
 * inside the app, `beforeunload` for closing or reloading, and `registerLeaveCheck` for logging out and "Edit template
 * clinic". A forced move (the session's context changed since the guard mounted) is never blocked. Render `dialog`.
 * Needs a data router: `useBlocker` throws under `MemoryRouter` (tests: `renderWithProviders`'s `dataRouter` option).
 *
 * Contract stub: track print-templates/frontend writes the body.
 */
export const useUnsavedGuard = (dirty: boolean): { dialog: ReactNode } => {
    void dirty;
    throw new Error("contract stub");
};
