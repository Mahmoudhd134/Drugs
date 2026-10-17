import {describe, expect, test} from "vitest";
import {act, renderHook} from "@testing-library/react";
import {useDialogSave} from "./useDialogSave.ts";

// Rule: docs/tech/overview.md "Shared components" (useDialogSave).

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => {
        resolve = res;
    });
    return {promise, resolve};
};

/** The hook with a save whose answers the test gives one by one. */
const renderSave = () => {
    const answers: { resolve: (saved: boolean) => void }[] = [];
    const save = () => {
        const answer = deferred<boolean>();
        answers.push(answer);
        return answer.promise;
    };
    const hook = renderHook(() => useDialogSave(save));
    const submit = () => act(async () => hook.result.current.submit());
    const answer = (index: number, saved: boolean) => act(async () => answers[index].resolve(saved));
    return {hook, answers, submit, answer};
};

describe("useDialogSave @area:ux", () => {
    test("a submit while the save runs is ignored; after a save that succeeded every submit is ignored and `done` stays true @UX-040",
        async () => {
            const {hook, answers, submit, answer} = renderSave();
            expect(hook.result.current.done).toBe(false);

            await submit();
            await submit();
            expect(answers).toHaveLength(1);

            await answer(0, true);
            expect(hook.result.current.done).toBe(true);
            await submit();
            await submit();
            expect(answers, "locked until the form unmounts").toHaveLength(1);
            expect(hook.result.current.done).toBe(true);
        });

    test("a save that failed (resolved false) unlocks at once: the next submit saves again @UX-040", async () => {
        const {hook, answers, submit, answer} = renderSave();
        await submit();
        await answer(0, false);
        expect(hook.result.current.done).toBe(false);

        await submit();
        expect(answers).toHaveLength(2);
        await answer(1, true);
        expect(hook.result.current.done).toBe(true);
    });

    test("the submit event's default (the browser's form submit) is prevented @UX-040", async () => {
        const {hook} = renderSave();
        let prevented = false;
        const event = {preventDefault: () => (prevented = true)} as unknown as Parameters<typeof hook.result.current.submit>[0];
        await act(async () => hook.result.current.submit(event));
        expect(prevented).toBe(true);
    });
});
