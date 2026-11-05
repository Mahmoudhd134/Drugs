import {afterEach, describe, expect, test} from "vitest";
import {blocksExit, confirmLeave, registerLeaveCheck} from "./unsavedGuard.ts";

// The guard's pure parts: contract § 3.8, D16. The module keeps one check: every test takes its own off again.

const unregister: (() => void)[] = [];
const register = (check: () => Promise<boolean>) => {
    const off = registerLeaveCheck(check);
    unregister.push(off);
    return off;
};

afterEach(() => {
    unregister.splice(0).forEach(off => off());
});

describe("confirmLeave @area:admin", () => {
    test("no guard on screen: leaving is fine @TPL-248", async () => {
        await expect(confirmLeave()).resolves.toBe(true);
    });

    test.each([[true], [false]])("the guard answers %s: that is the answer @TPL-248", async answer => {
        register(() => Promise.resolve(answer));
        await expect(confirmLeave()).resolves.toBe(answer);
    });

    test("once unregistered, nothing asks @TPL-248", async () => {
        const off = register(() => Promise.resolve(false));
        off();
        await expect(confirmLeave()).resolves.toBe(true);
    });

    test("the newest guard answers, and an older one's clean-up doesn't remove it @TPL-248", async () => {
        const offFirst = register(() => Promise.resolve(true));
        register(() => Promise.resolve(false));
        await expect(confirmLeave()).resolves.toBe(false);
        offFirst();
        await expect(confirmLeave()).resolves.toBe(false);
    });
});

describe("blocksExit @area:admin", () => {
    const exit = {dirty: true, contextAtMount: "platform", contextNow: "platform", fromPath: "/admin/clinics/1/print-template", toPath: "/admin"};

    test("unsaved changes, the same session, another path: blocked @TPL-232", () => {
        expect(blocksExit(exit)).toBe(true);
    });

    test("nothing unsaved: not blocked @TPL-233", () => {
        expect(blocksExit({...exit, dirty: false})).toBe(false);
    });

    test.each([
        ["logged out", "none"],
        ["another context", "clinic:7"],
    ])("%s since the guard mounted is a forced move: not blocked @TPL-249", (_name, contextNow) => {
        expect(blocksExit({...exit, contextNow})).toBe(false);
    });

    test("under no session at all (\"none\" both times) it blocks, as it should @TPL-232", () => {
        expect(blocksExit({...exit, contextAtMount: "none", contextNow: "none"})).toBe(true);
    });

    test("the same path (a query, a hash, the current tab again) isn't an exit @TPL-232", () => {
        expect(blocksExit({...exit, toPath: exit.fromPath})).toBe(false);
    });
});
