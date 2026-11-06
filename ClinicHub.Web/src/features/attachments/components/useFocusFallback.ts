import {type RefObject, useEffect} from "react";

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
        const fell = !focused || focused === document.body || focused.matches(":disabled");        if (held && fell && !paused) fallback.current?.focus();
    });
};
