import {act} from "@testing-library/react";
import {vi} from "vitest";

/**
 * Holds the page's timers (setTimeout: debounces, MUI transitions, toasts) so that what happens "before the timer
 * fires" is checked whatever the machine's speed; `advance(ms)` moves the clock, `release()` runs what is pending and
 * goes back to real timers. Testing Library waits with a 0 ms timeout between steps: it only knows Jest's fake timers,
 * so it is shown them under Jest's name (it then advances them by 0 ms itself).
 */
export const holdTimers = () => {
    vi.stubGlobal("jest", {advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms)});
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});
    return {
        advance: (ms: number) => act(async () => {
            vi.advanceTimersByTime(ms);
        }),
        release: async () => {
            await act(async () => {
                vi.runOnlyPendingTimers();
            });
            vi.useRealTimers();
            vi.stubGlobal("jest", undefined);
        },
    };
};
