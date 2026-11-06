import {screen, waitFor, within} from "@testing-library/react";
import {describe, expect, test} from "vitest";
import {expectToasts, findToast, isolate, toastTexts} from "../../../test";
import {
    aFile, apiRefusal, aStoredFile, expectStored, fakeAdapter, named, pastPendingWork, pickReplacement, press, REASON,
    renderLeavableManager, renderManager, replaceWith, storedRow,
} from "../../../test/pages/attachments.tsx";

// A row's Replace: design § 12 "Replace"; contract § 2 "Replacing and counting"; business.md «يستبدل المستخدم ملفًا بآخر»,
// «عند رفض الملف الجديد في الاستبدال يبقى الملف القديم كما هو».

const files = () => [
    aStoredFile({originalFileName: "old.pdf"}),
    aStoredFile({originalFileName: "other.pdf"}),
];

const started = async () => {
    const stored = files();
    const adapter = fakeAdapter({files: stored});
    const gate = adapter.holdUploads();
    const rendered = await renderManager({canReplace: true, canDelete: true, adapter});
    await expectStored("old.pdf", "other.pdf");
    await replaceWith(rendered.user, "old.pdf", aFile("new.png", 10));
    const held = await gate.held("new.png");
    return {...rendered, adapter, gate, held, stored};
};

describe("a row's Replace @area:attachments", () => {
    test("it's sent at once through replace, on that row's file @ATT-259", async () => {
        const {adapter, stored} = await started();
        expect(adapter.replace).toHaveBeenCalledTimes(1);
        expect(adapter.replace.mock.calls[0][0]).toBe(stored[0].id);
        expect(adapter.replace.mock.calls[0][1].name).toBe("new.png");
        expect(adapter.upload).not.toHaveBeenCalled();
    });

    test("it picks one file @ATT-259", async () => {
        await renderManager({canReplace: true, adapter: fakeAdapter({files: files()})});
        await expectStored("old.pdf", "other.pdf");
        expect(screen.getByTestId("attachment-replace-input")).not.toHaveAttribute("multiple");
    });

    test("running: its row shows its progress and Cancel, both with the row's name @ATT-259", async () => {
        const {held} = await started();

        held.progress(30);

        const row = within(storedRow("old.pdf"));
        await waitFor(() => expect(row.getByRole("progressbar", {name: named.uploading("old.pdf")})).toHaveAttribute("aria-valuenow", "30"));
        expect(row.getByRole("button", {name: named.cancel("old.pdf")})).toBeInTheDocument();
        expect(within(storedRow("other.pdf")).queryByRole("progressbar")).not.toBeInTheDocument();
        expect(within(storedRow("other.pdf")).queryByRole("button", {name: named.cancel("other.pdf")})).not.toBeInTheDocument();
    });

    test("cancelled: the request is aborted, the old file stays, no error shows and the list reloads @ATT-259", async () => {
        const {user, adapter, held} = await started();
        const loads = adapter.list.mock.calls.length;

        await press(user, named.cancel("old.pdf"));

        expect(held.signal?.aborted).toBe(true);
        await waitFor(() => expect(adapter.list.mock.calls.length).toBeGreaterThan(loads));
        await expectStored("old.pdf", "other.pdf");
        await waitFor(() => expect(screen.queryByRole("progressbar", {name: named.uploading("old.pdf")})).not.toBeInTheDocument());
        await pastPendingWork();
        expect(toastTexts()).toEqual([]);
        expect(screen.queryByRole("button", {name: named.retry("new.png")})).not.toBeInTheDocument();
        expect(adapter.replace).toHaveBeenCalledTimes(1);
    });

    test("whatever error the adapter throws on the abort, a cancel is silent @ATT-259", async () => {
        const adapter = fakeAdapter({
            files: files(),
            replace: (_id, _file, {signal}) => new Promise((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(new Error("the feature's own error")));
            }),
        });
        const {user} = await renderManager({canReplace: true, adapter});
        await expectStored("old.pdf", "other.pdf");
        await replaceWith(user, "old.pdf", aFile("new.png", 10));

        await press(user, named.cancel("old.pdf"));

        await waitFor(() => expect(screen.queryByRole("button", {name: named.cancel("old.pdf")})).not.toBeInTheDocument());
        await pastPendingWork();
        expect(toastTexts()).toEqual([]);
    });

    test("failed: a translated toast with no Retry, and the old file stays @ATT-259", async () => {
        const {held} = await started();

        await held.fail(apiRefusal(400, "attachmentTypeNotAllowed"));

        expect(await findToast()).toContain(REASON.typeNotAllowed);
        await expectStored("old.pdf", "other.pdf");
        await waitFor(() => expect(screen.queryByRole("progressbar", {name: named.uploading("old.pdf")})).not.toBeInTheDocument());
        expect(screen.queryByRole("button", {name: named.retry("old.pdf")})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: named.retry("new.png")})).not.toBeInTheDocument();
        expect(screen.queryByRole("list", {name: "Selected files"})).not.toBeInTheDocument();
    });

    test("failed in Arabic, in the business file's words @ATT-259", async () => {
        const adapter = fakeAdapter({files: files()});
        adapter.replace.mockRejectedValue(apiRefusal(400, "attachmentTooLarge"));
        const {user} = await renderManager({canReplace: true, adapter}, {lang: "ar"});
        await press(user, `استبدال «${isolate("old.pdf")}»`);
        await pickReplacement(aFile("new.png", 10));

        expect(await findToast()).toContain("حجم هذا الملف أكبر من المسموح به.");
    });

    test("finished: a toast says so and the new file takes the row's place @ATT-259", async () => {
        const {held} = await started();

        await held.finish();

        await expectToasts("File replaced");
        await expectStored("new.png", "other.pdf");
    });

    test("a refused pick is a toast with no Retry: nothing is sent and the old file stays @ATT-259", async () => {
        const adapter = fakeAdapter({files: files(), rules: {maxFileSizeBytes: 100, extensions: [".png"]}});
        const {user} = await renderManager({canReplace: true, adapter});
        await expectStored("old.pdf", "other.pdf");

        await replaceWith(user, "old.pdf", aFile("wrong.exe", 10));
        expect(await findToast()).toContain(REASON.typeNotAllowed);
        await replaceWith(user, "old.pdf", aFile("big.png", 101));
        await waitFor(() => expect(toastTexts().join()).toContain(REASON.tooLarge));
        await replaceWith(user, "old.pdf", aFile("empty.png", 0));
        await waitFor(() => expect(toastTexts().join()).toContain(REASON.empty));

        expect(adapter.replace).not.toHaveBeenCalled();
        await expectStored("old.pdf", "other.pdf");
        expect(screen.queryByRole("button", {name: named.retry("wrong.exe")})).not.toBeInTheDocument();
    });

    test("one at a time: while it runs every row's Replace is disabled, and its own row's Delete @ATT-259", async () => {
        const {held} = await started();

        await waitFor(() => expect(screen.getByRole("button", {name: named.replace("old.pdf")})).toBeDisabled());
        expect(screen.getByRole("button", {name: named.replace("other.pdf")})).toBeDisabled();
        expect(screen.getByRole("button", {name: named.delete("old.pdf")})).toBeDisabled();
        expect(screen.getByRole("button", {name: named.delete("other.pdf")})).toBeEnabled();

        await held.finish();

        await expectStored("new.png", "other.pdf");
        await waitFor(() => expect(screen.getByRole("button", {name: named.replace("other.pdf")})).toBeEnabled());
        expect(screen.getByRole("button", {name: named.replace("new.png")})).toBeEnabled();
        expect(screen.getByRole("button", {name: named.delete("new.png")})).toBeEnabled();
    });

    test("after a cancel or a failure, Replace can be used again @ATT-259", async () => {
        const {user, gate, held} = await started();
        await press(user, named.cancel("old.pdf"));
        await waitFor(() => expect(screen.getByRole("button", {name: named.replace("old.pdf")})).toBeEnabled());
        expect(held.signal?.aborted).toBe(true);

        await replaceWith(user, "old.pdf", aFile("again.png", 10));
        await (await gate.held("again.png")).finish();

        await expectStored("again.png", "other.pdf");
        expect(gate.started).toEqual(["new.png", "again.png"]);
    });

    test("leaving the page aborts it, with no toast and no reload @ATT-215", async () => {
        const adapter = fakeAdapter({files: files()});
        const gate = adapter.holdUploads();
        const {user, leave} = await renderLeavableManager({canReplace: true, adapter});
        await expectStored("old.pdf", "other.pdf");
        await replaceWith(user, "old.pdf", aFile("new.png", 10));
        const held = await gate.held("new.png");
        const loads = adapter.list.mock.calls.length;

        await leave();

        expect(held.signal?.aborted).toBe(true);
        await pastPendingWork();
        expect(toastTexts()).toEqual([]);
        expect(adapter.list.mock.calls.length).toBe(loads);
    });
});
