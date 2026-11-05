import {type RefObject, useLayoutEffect, useRef} from "react";

/**
 * The value of the latest render, for listeners on `window` that live longer than one render (step 3: the drag, the keys).
 * Set before any later layout effect of the same component, and before the browser can deliver another event.
 */
export const useLatest = <T, >(value: T): RefObject<T> => {
    const latest = useRef(value);
    useLayoutEffect(() => {
        latest.current = value;
    });
    return latest;
};
