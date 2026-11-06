import {type RefObject, useEffect, useRef} from "react";

/**
 * When a change takes the focused element away from inside `root`, or disables it, the focus would fall to the page:
 * it goes to `fallback` instead. Focus the user moved elsewhere isn't touched. Call it after the effects that place the
 * focus themselves. `paused`: something else will place it when it ends.
 */
export const useFocusFallback = (root: RefObject<HTMLElement | null>, fallback: RefObject<HTMLElement | null>, paused = false) => {
    // Read before this render's commit can remove it
    const held = root.current?.contains(document.activeElement) ?? false;
    useEffect(() => {
        const focused = document.activeElement;
        const fell = !focused || focused === document.body || focused.matches(":disabled");
        if (held && fell && !paused) fallback.current?.focus({preventScroll: true});
    });
};

/**
 * A Retry on a failed first load unmounts its alert and button. `failed`: the alert is back, so `retryButton` takes the
 * focus. `ready`: `target` can take it. Focus the user moved elsewhere stays. Answers the function to call on the press.
 */
export const useRetryFocus = (
    failed: boolean,
    ready: boolean,
    retryButton: RefObject<HTMLElement | null>,
    target: RefObject<HTMLElement | null>,
) => {
    // "pressed" until the alert has left: only then does `failed` mean it failed again
    const pending = useRef<"pressed" | "left" | null>(null);
    useEffect(() => {
        if (!failed && pending.current === "pressed") pending.current = "left";
        if (pending.current !== "left" || (!failed && !ready)) return;
        pending.current = null;
        const focused = document.activeElement;
        if (focused && focused !== document.body && !focused.matches(":disabled")) return;
        (failed ? retryButton : target).current?.focus({preventScroll: true});
    });
    return () => {
        pending.current = "pressed";
    };
};

/**
 * A preview closed after the row that opened it went: the dialog has no button to return the focus to, so it goes to
 * `fallback`. Answers the ref to set to the row's key on opening a preview from it.
 */
export const usePreviewOpener = (previewOpen: boolean, rows: RefObject<Map<string, HTMLLIElement>>, fallback: RefObject<HTMLElement | null>) => {
    const opener = useRef<string | null>(null);
    useEffect(() => {
        const key = opener.current;
        if (key === null || previewOpen) return;
        opener.current = null;
        if (!rows.current.has(key)) fallback.current?.focus({preventScroll: true});
    });
    return opener;
};
