import {describe, expect, test} from "vitest";
import {renderHook} from "@testing-library/react";
import {useOpeningKey} from "./useOpeningKey.ts";

// Rule: docs/tech/overview.md "Shared components" (useOpeningKey).

describe("useOpeningKey @area:ux", () => {
    test("changes each time `open` turns true (also right after it turned false), never while it stays the same @UX-041", () => {
        const {result, rerender} = renderHook(({open}) => useOpeningKey(open), {initialProps: {open: false}});
        const closed = result.current;
        rerender({open: false});
        expect(result.current).toBe(closed);

        rerender({open: true});
        const first = result.current;
        expect(first).not.toBe(closed);
        rerender({open: true});
        expect(result.current, "the same opening").toBe(first);

        // Closed and reopened at once (during the closing animation): a new key
        rerender({open: false});
        expect(result.current, "closing keeps the form until it has faded out").toBe(first);
        rerender({open: true});
        expect(result.current).not.toBe(first);
    });

    test("a dialog rendered open starts with a key of its own, and its first close does not change it @UX-041", () => {
        const {result, rerender} = renderHook(({open}) => useOpeningKey(open), {initialProps: {open: true}});
        const first = result.current;
        rerender({open: false});
        expect(result.current).toBe(first);
    });
});
