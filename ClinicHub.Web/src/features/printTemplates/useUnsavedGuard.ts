import {type ReactNode, useCallback, useEffect, useRef} from "react";
import {useBlocker} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {useConfirm} from "../../components/common/useConfirm.tsx";
import {currentContextKey} from "../auth/session.ts";
import {blocksExit, registerLeaveCheck} from "./unsavedGuard.ts";

/**
 * Warns before unsaved changes are lost, on every exit of design D16 (contract § 3.8): `useBlocker` for every navigation
 * inside the app, `beforeunload` for closing or reloading, and `registerLeaveCheck` for logging out and "Edit template
 * clinic". A forced move (the session's context changed since the guard mounted) is never blocked. Render `dialog`.
 * Needs a data router: `useBlocker` throws under `MemoryRouter` (tests: `renderWithProviders`'s `dataRouter` option).
 */
export const useUnsavedGuard = (dirty: boolean): { dialog: ReactNode } => {
    const {t} = useTranslation();
    const {confirm, dialog} = useConfirm();
    const contextAtMount = useRef(currentContextKey());
    const openQuestion = useRef<Promise<boolean> | null>(null);

    // One question at a time: `useConfirm`'s second call would overwrite the first, whose promise would never resolve
    const ask = useCallback(() => {
        openQuestion.current ??= confirm({
            title: t("printTemplates.unsavedMessage"),
            confirmText: t("printTemplates.leave"),
            destructive: true,
        }).finally(() => {
            openQuestion.current = null;
        });
        return openQuestion.current;
    }, [confirm, t]);

    const blocker = useBlocker(({currentLocation, nextLocation}) => blocksExit({
        dirty,
        contextAtMount: contextAtMount.current,
        contextNow: currentContextKey(),
        fromPath: currentLocation.pathname,
        toPath: nextLocation.pathname,
    }));

    // Only the latest blocked navigation is answered: another one while the question is open replaces the blocker
    useEffect(() => {
        if (blocker.state !== "blocked") return;
        let latest = true;
        void ask().then(leave => {
            if (!latest) return;
            if (leave) blocker.proceed();
            else blocker.reset();
        });
        return () => {
            latest = false;
        };
    }, [blocker, ask]);

    useEffect(() => {
        if (!dirty) return;
        const handler = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [dirty]);

    useEffect(() => registerLeaveCheck(() => (dirty ? ask() : Promise.resolve(true))), [dirty, ask]);

    return {dialog};
};
