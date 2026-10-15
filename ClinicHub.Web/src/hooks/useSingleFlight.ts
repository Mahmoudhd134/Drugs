import {useCallback, useRef} from "react";

/**
 * Runs one action at a time: a call made while the previous one still runs (e.g. a double click, which comes before
 * a mutation's `isPending` re-renders the button as disabled) is ignored and resolves to undefined.
 */
export const useSingleFlight = () => {
    const running = useRef(false);
    return useCallback(async <T, >(action: () => Promise<T>): Promise<T | undefined> => {
        if (running.current) return undefined;
        running.current = true;
        try {
            return await action();
        } finally {
            running.current = false;
        }
    }, []);
};
