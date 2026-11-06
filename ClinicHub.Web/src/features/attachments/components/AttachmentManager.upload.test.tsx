import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import {describe, expect, test} from "vitest";
import {isolate, toastTexts} from "../../../test";
import {
    aFile, apiRefusal, aStoredFile, canRemove, deferred, expectAnnounced, expectSelected, expectStored, fakeAdapter, findRefusal,
    named, pastPendingWork, pickFiles, press, REASON, refuseUploadOf, renderLeavableManager, renderManager, selectedRow, storedRow,
    storedRows,
} from "../../../test/pages/attachments.tsx";
import type {Attachment} from "../types.ts";

// Uploading: design § 12 "Upload"; contract § 2 "Selecting and uploading", "Replacing and counting"; business.md «يضغط «رفع»».

const refused = () => apiRefusal(400, "attachmentTypeNotAllowed");
const upload = () => screen.getByRole("button", {name: "Upload"});

describe("what the server refuses @area:attachments", () => {
    test("its translated reason shows on that file, with Retry @ATT-205", async () => {
        const adapter = fakeAdapter();
        refuseUploadOf(adapter, "fake.png", refused());
        const {user} = await renderManager({canUpload: true, adapter});

        await pickFiles(aFile("fake.png", 10));
        await expectSelected("fake.png");
        await user.click(upload());

        await waitFor(() => expect(selectedRow("fake.png")).toHaveTextContent(REASON.typeNotAllowed));
        expect(within(selectedRow("fake.png")).getByRole("button", {name: named.retry("fake.png")})).toBeInTheDocument();
        await expectStored();
    });

    test("in Arabic, in the business file's words @ATT-205", async () => {
        const adapter = fakeAdapter();
        refuseUploadOf(adapter, "fake.png", refused());
        const {user} = await renderManager({canUpload: true, adapter}, {lang: "ar"});

        await pickFiles(aFile("fake.png", 10));
        await press(user, "رفع");

        expect(await screen.findByText("نوع هذا الملف غير مسموح به.")).toBeInTheDocument();
    });

    test("each code its own reason @ATT-205", async () => {
        const adapter = fakeAdapter();
        adapter.upload.mockImplementation(file => Promise.reject(apiRefusal(400, file.name === "large.png" ? "attachmentTooLarge" : "attachmentEmpty")));
        const {user} = await renderManager({canUpload: true, adapter});

        await pickFiles(aFile("large.png", 10), aFile("empty.png", 10));
        await expectSelected("large.png", "empty.png");
        await user.click(upload());

        await waitFor(() => expect(selectedRow("large.png")).toHaveTextContent(REASON.tooLarge));
        await waitFor(() => expect(selectedRow("empty.png")).toHaveTextContent(REASON.empty));
    });
});

describe("a run of several files @area:attachments", () => {
    test("the second failing: the first and third succeed, the second stays with its reason and Retry, and Retry can succeed @ATT-206", async () => {
        const adapter = fakeAdapter();
        const refusal = refuseUploadOf(adapter, "b.png", refused());
        const {user} = await renderManager({canUpload: true, adapter});

        await pickFiles(aFile("a.png", 1), aFile("b.png", 1), aFile("c.png", 1));
        await expectSelected("a.png", "b.png", "c.png");
        await user.click(upload());

        await expectStored("a.png", "c.png");
        await expectSelected("b.png");
        expect(selectedRow("b.png")).toHaveTextContent(REASON.typeNotAllowed);
        expect(adapter.upload.mock.calls.map(([file]) => file.name)).toEqual(["a.png", "b.png", "c.png"]);

        refusal.stop();
        await press(user, named.retry("b.png"));

        await expectStored("a.png", "b.png", "c.png");
        await expectSelected();
        expect(adapter.upload.mock.calls.map(([file]) => file.name)).toEqual(["a.png", "b.png", "c.png", "b.png"]);
    });

    test("Retry that fails again stays with its reason and Retry @ATT-206", async () => {
        const adapter = fakeAdapter();
        refuseUploadOf(adapter, "b.png", refused());
        const {user} = await renderManager({canUpload: true, adapter});

        await pickFiles(aFile("b.png", 1));
        await expectSelected("b.png");
        await user.click(upload());
        await screen.findByRole("button", {name: named.retry("b.png")});
        await press(user, named.retry("b.png"));

        await waitFor(() => expect(adapter.upload).toHaveBeenCalledTimes(2));
        expect(await screen.findByRole("button", {name: named.retry("b.png")})).toBeInTheDocument();
        expect(selectedRow("b.png")).toHaveTextContent(REASON.typeNotAllowed);
    });

    test("one request at a time, each with its own progress @ATT-206", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("a.png", "b.png");

        await user.click(upload());
        const a = await gate.held("a.png");

        expect(gate.running()).toEqual(["a.png"]);
        a.progress(42);
        const bar = await within(selectedRow("a.png")).findByRole("progressbar", {name: named.uploading("a.png")});
        expect(bar).toHaveAttribute("aria-valuenow", "42");
        expect(within(selectedRow("b.png")).queryByRole("progressbar")).not.toBeInTheDocument();

        await a.finish();
        const b = await gate.held("b.png");
        expect(gate.running()).toEqual(["b.png"]);
        await b.finish();
        await expectStored("a.png", "b.png");
    });

    test("Upload skips a failed file: it goes only by Retry @ATT-206", async () => {
        const adapter = fakeAdapter();
        const refusal = refuseUploadOf(adapter, "failed.png", refused());
        const {user} = await renderManager({canUpload: true, adapter});

        await pickFiles(aFile("failed.png", 1));
        await expectSelected("failed.png");
        await user.click(upload());
        await screen.findByRole("button", {name: named.retry("failed.png")});
        expect(upload()).toBeDisabled();

        refusal.stop();
        await pickFiles(aFile("new.png", 1));
        await expectSelected("failed.png", "new.png");
        await waitFor(() => expect(upload()).toBeEnabled());
        await user.click(upload());

        await expectStored("new.png");
        await expectSelected("failed.png");
        expect(adapter.upload.mock.calls.map(([file]) => file.name)).toEqual(["failed.png", "new.png"]);
    });

    test("no success toast: the file moves to the list @ATT-206", async () => {
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await user.click(upload());
        await expectStored("a.png");
        await expectSelected();
        await expectAnnounced(`“${isolate("a.png")}” was uploaded.`);
        expect(toastTexts()).toEqual([]);
    });
});

describe("cancelling an upload @area:attachments", () => {
    test("the request is aborted, the file stays selected, the run goes on, and Upload sends it again @ATT-207", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("a.png", "b.png");

        await user.click(upload());
        const a = await gate.held("a.png");
        expect(a.signal?.aborted).toBe(false);
        await press(user, named.cancel("a.png"));

        expect(a.signal?.aborted).toBe(true);
        const b = await gate.held("b.png");
        await expectSelected("a.png", "b.png");
        await b.finish();
        await expectStored("b.png");
        await expectSelected("a.png");

        expect(screen.queryByRole("button", {name: named.retry("a.png")})).not.toBeInTheDocument();
        await waitFor(() => expect(upload()).toBeEnabled());
        await user.click(upload());
        await (await gate.held("a.png")).finish();

        await expectStored("a.png", "b.png");
        await expectSelected();
        expect(gate.started).toEqual(["a.png", "b.png", "a.png"]);
    });

    test("a queued file goes back to waiting: no request, and the next Upload sends it @ATT-207", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("a.png", "b.png");

        await user.click(upload());
        const a = await gate.held("a.png");
        await press(user, named.cancel("b.png"));
        await waitFor(() => expect(screen.queryByRole("button", {name: named.cancel("b.png")})).not.toBeInTheDocument());
        await a.finish();

        await expectSelected("b.png");
        await waitFor(() => expect(upload()).toBeEnabled());
        expect(gate.started).toEqual(["a.png"]);

        await user.click(upload());
        await (await gate.held("b.png")).finish();
        await expectStored("a.png", "b.png");
    });

    test("Remove works in every state but uploading; Cancel only on uploading and queued; Retry only on failed @ATT-207", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("failed.png", 1), aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("failed.png", "a.png", "b.png");
        expect(screen.queryByRole("button", {name: named.cancel("a.png")})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: named.retry("a.png")})).not.toBeInTheDocument();

        await user.click(upload());
        await (await gate.held("failed.png")).fail(refused());
        await gate.held("a.png");

        expect(await screen.findByRole("button", {name: named.retry("failed.png")})).toBeInTheDocument();
        expect(canRemove("failed.png")).toBe(true);
        expect(screen.queryByRole("button", {name: named.cancel("failed.png")})).not.toBeInTheDocument();

        expect(await screen.findByRole("button", {name: named.cancel("a.png")})).toBeInTheDocument();
        await waitFor(() => expect(canRemove("a.png")).toBe(false));

        expect(await screen.findByRole("button", {name: named.cancel("b.png")})).toBeInTheDocument();
        expect(canRemove("b.png")).toBe(true);

        await press(user, named.remove("b.png"));
        await expectSelected("failed.png", "a.png");
        await (await gate.held("a.png")).finish();
        await pastPendingWork();
        expect(gate.started).toEqual(["failed.png", "a.png"]);
    });

    test("no error shows and the list reloads @ATT-235", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await user.click(upload());
        await gate.held("a.png");
        const loads = adapter.list.mock.calls.length;

        await press(user, named.cancel("a.png"));

        await waitFor(() => expect(adapter.list.mock.calls.length).toBeGreaterThan(loads));
        await pastPendingWork();
        expect(toastTexts()).toEqual([]);
        expect(selectedRow("a.png")).not.toHaveTextContent("Something went wrong");
        expect(screen.queryByText("Can't reach the server. Check your connection.")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: named.retry("a.png")})).not.toBeInTheDocument();
    });

    test("whatever error the adapter throws on the abort, a cancel is silent @ATT-235", async () => {
        const adapter = fakeAdapter({
            upload: (_file, {signal}) => new Promise((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(new Error("the feature's own error")));
            }),
        });
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await user.click(upload());
        await screen.findByRole("button", {name: named.cancel("a.png")});

        await press(user, named.cancel("a.png"));

        await waitFor(() => expect(screen.queryByRole("button", {name: named.cancel("a.png")})).not.toBeInTheDocument());
        await pastPendingWork();
        expect(toastTexts()).toEqual([]);
        expect(screen.queryByRole("button", {name: named.retry("a.png")})).not.toBeInTheDocument();
        expect(selectedRow("a.png")).not.toHaveTextContent("Something went wrong");
    });

    test("the server had saved it: the reload shows it @ATT-235", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await user.click(upload());
        await gate.held("a.png");

        adapter.files.unshift(aStoredFile({originalFileName: "a.png", typeKey: "png"}));
        await press(user, named.cancel("a.png"));

        await waitFor(() => expect(storedRow("a.png")).toBeInTheDocument());
    });
});

describe("a double click on Upload @area:attachments", () => {
    test("two clicks in a row: one upload per file @ATT-208", async () => {
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("a.png", "b.png");

        await user.dblClick(upload());

        await expectStored("a.png", "b.png");
        expect(adapter.upload.mock.calls.map(([file]) => file.name)).toEqual(["a.png", "b.png"]);
    });

    test("two clicks before the screen can change: one upload per file @ATT-208", async () => {
        const adapter = fakeAdapter();
        await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        const button = upload();

        act(() => {
            fireEvent.click(button);
            fireEvent.click(button);
        });

        await expectStored("a.png");
        await pastPendingWork();
        expect(adapter.upload).toHaveBeenCalledTimes(1);
    });

    test("Upload is disabled during a run, and with nothing to send @ATT-208", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await waitFor(() => expect(upload()).toBeDisabled());

        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await waitFor(() => expect(upload()).toBeEnabled());

        await user.click(upload());
        const a = await gate.held("a.png");
        expect(upload()).toBeDisabled();

        await a.finish();
        await expectStored("a.png");
        await waitFor(() => expect(upload()).toBeDisabled());
    });
});

describe("leaving the page during a run @area:attachments", () => {
    test("the current upload aborts, no next request is sent, and no toast shows @ATT-215", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user, leave} = await renderLeavableManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("a.png", "b.png");
        await user.click(upload());
        const a = await gate.held("a.png");
        const loads = adapter.list.mock.calls.length;

        await leave();

        expect(a.signal?.aborted).toBe(true);
        await pastPendingWork();
        expect(gate.started).toEqual(["a.png"]);
        expect(gate.running()).toEqual([]);
        expect(toastTexts()).toEqual([]);
        expect(adapter.list.mock.calls.length).toBe(loads);
    });

    test("an adapter that answers after the abort sends no next request either @ATT-215", async () => {
        const answer = deferred<Attachment>();
        const adapter = fakeAdapter({upload: () => answer.promise});
        const {user, leave} = await renderLeavableManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("a.png", "b.png");
        await user.click(upload());
        await waitFor(() => expect(adapter.upload).toHaveBeenCalledTimes(1));

        await leave();
        await act(async () => answer.resolve(aStoredFile()));
        await pastPendingWork();

        expect(adapter.upload).toHaveBeenCalledTimes(1);
        expect(toastTexts()).toEqual([]);
    });

    test("a failure after the abort shows no toast @ATT-215", async () => {
        const answer = deferred<Attachment>();
        const adapter = fakeAdapter({upload: () => answer.promise});
        const {user, leave} = await renderLeavableManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await user.click(upload());
        await waitFor(() => expect(adapter.upload).toHaveBeenCalledTimes(1));

        await leave();
        await act(async () => answer.reject(refused()));
        await pastPendingWork();

        expect(toastTexts()).toEqual([]);
    });
});

describe("while a run is going on @area:attachments", () => {
    test("files added wait for it: the run doesn't send them, the next Upload does @ATT-236", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("a.png", "b.png");
        await user.click(upload());
        const a = await gate.held("a.png");

        await pickFiles(aFile("late.png", 1));
        await expectSelected("a.png", "b.png", "late.png");
        await a.finish();
        await (await gate.held("b.png")).finish();

        await expectStored("a.png", "b.png");
        await expectSelected("late.png");
        await waitFor(() => expect(upload()).toBeEnabled());
        expect(gate.started).toEqual(["a.png", "b.png"]);

        await user.click(upload());
        await (await gate.held("late.png")).finish();
        await expectStored("a.png", "b.png", "late.png");
    });

    test("Retry joins the run: it isn't silently ignored @ATT-236", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("a.png", "b.png");
        await user.click(upload());
        await (await gate.held("a.png")).fail(refused());
        const b = await gate.held("b.png");

        await press(user, named.retry("a.png"));
        await waitFor(() => expect(screen.queryByRole("button", {name: named.retry("a.png")})).not.toBeInTheDocument());
        expect(gate.running()).toEqual(["b.png"]);
        await b.finish();
        await (await gate.held("a.png")).finish();

        await expectStored("a.png", "b.png");
        await expectSelected();
        expect(gate.started).toEqual(["a.png", "b.png", "a.png"]);
    });

    test("Retry with no run starts one @ATT-236", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await user.click(upload());
        await (await gate.held("a.png")).fail(refused());

        await press(user, named.retry("a.png"));
        await (await gate.held("a.png")).finish();

        await expectStored("a.png");
    });

    test("multiple={false}: a new pick replaces every selected file but the one uploading @ATT-236", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, multiple: false, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await user.click(upload());
        const a = await gate.held("a.png");

        await pickFiles(aFile("b.png", 1));
        await expectSelected("a.png", "b.png");
        await pickFiles(aFile("c.png", 1));
        await expectSelected("a.png", "c.png");
        expect(a.signal?.aborted).toBe(false);

        await a.finish();
        await expectSelected("c.png");
    });
});

describe("an upload and a list refresh @area:attachments", () => {
    test("the upload finishing after a refresh that already shows it: in the list once, not in the selection @ATT-238", async () => {
        const answer = deferred<Attachment>();
        const adapter = fakeAdapter({upload: () => answer.promise});
        const {user, queryClient} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await user.click(upload());
        await waitFor(() => expect(adapter.upload).toHaveBeenCalledTimes(1));

        const saved = aStoredFile({originalFileName: "a.png", typeKey: "png"});
        adapter.files.unshift(saved);
        await act(() => queryClient.invalidateQueries());
        await waitFor(() => expect(storedRow("a.png")).toBeInTheDocument());
        await expectSelected("a.png");

        await act(async () => answer.resolve(saved));

        await expectSelected();
        await pastPendingWork();
        await expectStored("a.png");
        expect(storedRows()).toHaveLength(1);
    });

    test("a refresh older than the upload answering late doesn't lose the file @ATT-238", async () => {
        const answer = deferred<Attachment>();
        const adapter = fakeAdapter({upload: () => answer.promise});
        const {user, queryClient} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await user.click(upload());
        await waitFor(() => expect(adapter.upload).toHaveBeenCalledTimes(1));

        // This refresh reads the list before the file is saved, and answers after
        const late = deferred<Attachment[]>();
        adapter.list.mockImplementationOnce(() => late.promise);
        act(() => {
            void queryClient.invalidateQueries();
        });
        await waitFor(() => expect(adapter.list.mock.calls.length).toBeGreaterThan(1));

        const saved = aStoredFile({originalFileName: "a.png", typeKey: "png"});
        adapter.files.unshift(saved);
        await act(async () => answer.resolve(saved));
        await expectSelected();
        await act(async () => late.resolve([]));

        await expectStored("a.png");
        await pastPendingWork();
        await expectStored("a.png");
    });
});

describe("one stored file, replaced by Upload @area:attachments", () => {
    const stored = () => [
        aStoredFile({originalFileName: "newest.pdf", createdAt: "2026-11-06T12:00:00Z"}),
        aStoredFile({originalFileName: "older.pdf", createdAt: "2026-11-01T12:00:00Z"}),
    ];

    test("a pick is only selected; Upload calls replace on the newest stored file, not upload @ATT-245", async () => {
        const files = stored();
        const adapter = fakeAdapter({files});
        const {user} = await renderManager({canUpload: true, multiple: false, canReplace: true, adapter});
        await expectStored("newest.pdf", "older.pdf");

        await pickFiles(aFile("new.png", 1));
        await expectSelected("new.png");
        await pastPendingWork();
        expect(adapter.replace).not.toHaveBeenCalled();
        expect(adapter.upload).not.toHaveBeenCalled();
        await expectStored("newest.pdf", "older.pdf");

        await user.click(upload());

        await expectStored("new.png", "older.pdf");
        await expectSelected();
        expect(adapter.replace).toHaveBeenCalledTimes(1);
        expect(adapter.replace.mock.calls[0][0]).toBe(files[0].id);
        expect(adapter.replace.mock.calls[0][1].name).toBe("new.png");
        expect(adapter.upload).not.toHaveBeenCalled();
    });

    test("a refusal keeps the old file, and the new one stays selected with its reason and Retry @ATT-245", async () => {
        const adapter = fakeAdapter({files: stored()});
        const normal = adapter.replace.getMockImplementation()!;
        adapter.replace.mockImplementation(() => Promise.reject(refused()));
        const {user} = await renderManager({canUpload: true, multiple: false, canReplace: true, adapter});
        await pickFiles(aFile("new.png", 1));
        await expectSelected("new.png");

        await user.click(upload());

        await waitFor(() => expect(selectedRow("new.png")).toHaveTextContent(REASON.typeNotAllowed));
        expect(storedRow("newest.pdf")).toBeInTheDocument();
        await expectStored("newest.pdf", "older.pdf");

        adapter.replace.mockImplementation(normal);
        await press(user, named.retry("new.png"));

        await expectStored("new.png", "older.pdf");
        await expectSelected();
        expect(adapter.upload).not.toHaveBeenCalled();
    });

    test("a replacing pick takes the stored file's place: maxFiles 1 doesn't refuse it @ATT-245", async () => {
        const [only] = stored();
        const adapter = fakeAdapter({files: [only]});
        await renderManager({canUpload: true, multiple: false, canReplace: true, maxFiles: 1, adapter});
        await expectStored("newest.pdf");

        await pickFiles(aFile("new.png", 1));

        await expectSelected("new.png");
        expect(screen.queryByText(/wasn't added/)).not.toBeInTheDocument();
    });

    test("a pick the client refuses changes nothing @ATT-245", async () => {
        const adapter = fakeAdapter({files: stored(), rules: {maxFileSizeBytes: 10, extensions: [".png"]}});
        await renderManager({canUpload: true, multiple: false, canReplace: true, adapter});
        await pickFiles(aFile("big.png", 11));
        await findRefusal(`“${isolate("big.png")}”: ${REASON.tooLarge}`);
        await expectSelected();
        await expectStored("newest.pdf", "older.pdf");
        expect(adapter.replace).not.toHaveBeenCalled();
    });

    test.each([
        ["no stored file", {canUpload: true, multiple: false, canReplace: true}, () => []],
        ["no canReplace", {canUpload: true, multiple: false}, stored],
        ["several files allowed", {canUpload: true, canReplace: true}, stored],
    ])("%s: Upload adds it, replace isn't called @ATT-245", async (_what, props, files) => {
        const adapter = fakeAdapter({files: files()});
        const {user} = await renderManager({...props, adapter});
        await pickFiles(aFile("new.png", 1));
        await expectSelected("new.png");

        await user.click(upload());

        await expectSelected();
        expect(adapter.upload).toHaveBeenCalledTimes(1);
        expect(adapter.replace).not.toHaveBeenCalled();
    });

    test("the replace shows its progress on the selected file; cancelled, the old file stays @ATT-245", async () => {
        const adapter = fakeAdapter({files: stored()});
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, multiple: false, canReplace: true, adapter});
        await pickFiles(aFile("new.png", 1));
        await expectSelected("new.png");
        await user.click(upload());

        const held = await gate.held("new.png");
        held.progress(10);
        await waitFor(() => expect(within(selectedRow("new.png")).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10"));
        await press(user, named.cancel("new.png"));

        expect(held.signal?.aborted).toBe(true);
        await expectSelected("new.png");
        await expectStored("newest.pdf", "older.pdf");
    });
});
