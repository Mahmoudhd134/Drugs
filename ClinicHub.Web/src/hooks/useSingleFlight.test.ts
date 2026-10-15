import {describe, expect, test} from "vitest";
import {act, renderHook} from "@testing-library/react";
import {useSingleFlight} from "./useSingleFlight.ts";

// Rule: docs/tech/overview.md "Shared components" (useSingleFlight).

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
};

describe("useSingleFlight @area:ux", () => {
    test("a call while the previous one runs is ignored; after it finishes or throws, a new call runs @UX-026", async () => {
        const {result} = renderHook(() => useSingleFlight());
        const once = result.current;
        const first = deferred<string>();
        let runs = 0;
        const action = () => {
            runs++;
            return first.promise;
        };

        const firstCall = once(action);
        const secondCall = once(action);
        expect(runs).toBe(1);
        await expect(secondCall).resolves.toBeUndefined();
        first.resolve("saved");
        await expect(firstCall).resolves.toBe("saved");

        // Finished: a new call runs
        const failing = deferred<string>();
        const thirdCall = once(() => {
            runs++;
            return failing.promise;
        });
        expect(runs).toBe(2);
        await expect(once(action)).resolves.toBeUndefined();
        failing.reject(new Error("API down"));
        await expect(thirdCall).rejects.toThrow("API down");

        // Threw: a new call runs too
        await expect(once(async () => {
            runs++;
            return 42;
        })).resolves.toBe(42);
        expect(runs).toBe(3);
    });

    test("the same function across renders", async () => {
        const {result, rerender} = renderHook(() => useSingleFlight());
        const before = result.current;
        await act(async () => rerender());
        expect(result.current).toBe(before);
    });
});
