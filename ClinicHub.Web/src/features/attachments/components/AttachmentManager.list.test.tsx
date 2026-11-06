import {act, screen, waitFor, within} from "@testing-library/react";
import {AxiosError} from "axios";
import {describe, expect, test} from "vitest";
import {expectOwnDirection, expectToasts, isolate, toastTexts} from "../../../test";
import {
    aFile, apiRefusal, aStoredFile, deferred, deleteConfirmed, expectStored, fakeAdapter, filesCanBePicked, named, openPreview, pastPendingWork,
    press, renderManager, replaceWith, storedRow, stubDownloads,
} from "../../../test/pages/attachments.tsx";
import type {Attachment, AttachmentItemActions} from "../types.ts";

// The stored files: design § 12; contract § 2 "Actions on a stored file", "Screen structure and names"; business.md
// «تعرض الميزة ملفات السجل المرتبطة به».

describe("the stored files @area:attachments", () => {
    const files = () => [
        aStoredFile({originalFileName: "scan.png", typeKey: "png", contentType: "image/png", sizeBytes: 2048}),
        aStoredFile({originalFileName: "تقرير المريض.pdf", typeKey: "pdf", sizeBytes: 1_572_864, createdAt: "2026-01-15T10:00:00Z"}),
    ];

    test("each row shows the original name, type, size and date, and opening the list fetches no file @ATT-220", async () => {
        const adapter = fakeAdapter({files: files()});
        await renderManager({adapter});

        await expectStored("scan.png", "تقرير المريض.pdf");

        const scan = storedRow("scan.png");
        expect(scan).toHaveTextContent("PNG");
        expect(scan).toHaveTextContent("2 KB");
        expect(scan).toHaveTextContent("Nov 6, 2026");
        const report = storedRow("تقرير المريض.pdf");
        expect(report).toHaveTextContent("PDF");
        expect(report).toHaveTextContent("1.5 MB");
        expect(report).toHaveTextContent("Jan 15, 2026");

        await pastPendingWork();
        expect(adapter.download).not.toHaveBeenCalled();
        expect(adapter.list).toHaveBeenCalledTimes(1);
    });

    test("in Arabic: the list's name and the sizes in the language's units, the names as they are @ATT-220", async () => {
        await renderManager({adapter: fakeAdapter({files: files()})}, {lang: "ar"});
        const list = await screen.findByRole("list", {name: "الملفات المحفوظة"});
        expect(within(list).getByText("تقرير المريض.pdf")).toBeInTheDocument();
        expect(list).toHaveTextContent("2 كيلوبايت");
        expect(list).toHaveTextContent("1.5 ميجابايت");
    });

    test("a name keeps its own direction @ATT-220", async () => {
        await renderManager({adapter: fakeAdapter({files: files()})});
        await expectStored("scan.png", "تقرير المريض.pdf");
        expectOwnDirection(storedRow("تقرير المريض.pdf"), "تقرير المريض.pdf");
        expectOwnDirection(storedRow("scan.png"), "scan.png");
    });

    test("no files: the empty state shows, and no row @ATT-221", async () => {
        await renderManager();
        expect(await screen.findByText("No files yet.")).toBeInTheDocument();
        await expectStored();
    });

    test("no files in Arabic @ATT-221", async () => {
        await renderManager({}, {lang: "ar"});
        expect(await screen.findByText("لا توجد ملفات بعد.")).toBeInTheDocument();
    });

    test("files: no empty state @ATT-221", async () => {
        await renderManager({adapter: fakeAdapter({files: files()})});
        await expectStored("scan.png", "تقرير المريض.pdf");
        expect(screen.queryByText("No files yet.")).not.toBeInTheDocument();
    });

    test("loading: a named progress bar, no empty state yet @ATT-221", async () => {
        const answer = deferred<never[]>();
        await renderManager({adapter: fakeAdapter({list: () => answer.promise})});
        expect(await screen.findByRole("progressbar", {name: "Loading…"})).toBeInTheDocument();
        expect(screen.queryByText("No files yet.")).not.toBeInTheDocument();
    });

    test("a list that fails to load: a translated error and Retry, which can succeed @ATT-222", async () => {
        const stored = aStoredFile({originalFileName: "scan.png"});
        let broken = true;
        const adapter = fakeAdapter({
            list: async () => {
                if (broken) throw apiRefusal(500, "unexpected");
                return [stored];
            },
        });
        const {user} = await renderManager({adapter});

        expect(await screen.findByText("Couldn't load the files.")).toBeInTheDocument();
        expect(screen.queryByText("No files yet.")).not.toBeInTheDocument();
        expect(screen.queryByRole("list", {name: "Stored files"})).not.toBeInTheDocument();

        broken = false;
        await press(user, "Retry");

        await expectStored("scan.png");
        expect(screen.queryByText("Couldn't load the files.")).not.toBeInTheDocument();
    });

    test("a first load's Retry: the alert and its button leave, so focus goes to the list when it appears @ATT-274", async () => {
        const stored = aStoredFile({originalFileName: "scan.png"});
        const adapter = fakeAdapter({list: () => Promise.reject(apiRefusal(500, "unexpected"))});
        const {user} = await renderManager({adapter});
        await screen.findByText("Couldn't load the files.");

        const answer = deferred<Attachment[]>();
        adapter.list.mockImplementation(() => answer.promise);
        await press(user, "Retry");
        // The alert leaves while it loads, with no list yet to take the focus
        await pastPendingWork();
        await act(async () => answer.resolve([stored]));

        await expectStored("scan.png");
        await waitFor(() => expect(screen.getByRole("list", {name: "Stored files"})).toHaveFocus());
    });

    test("a first load's Retry failing again: the alert comes back, and its Retry takes the focus @ATT-274", async () => {
        const adapter = fakeAdapter({list: () => Promise.reject(apiRefusal(500, "unexpected"))});
        const {user} = await renderManager({adapter});
        await screen.findByText("Couldn't load the files.");
        const calls = adapter.list.mock.calls.length;

        await press(user, "Retry");
        await waitFor(() => expect(adapter.list.mock.calls.length).toBeGreaterThan(calls));

        await screen.findByText("Couldn't load the files.");
        await waitFor(() => expect(screen.getByRole("button", {name: "Retry"})).toHaveFocus());
    });

    test("a first load's Retry that finds no files: focus goes to the empty list all the same @ATT-274", async () => {
        const adapter = fakeAdapter({list: () => Promise.reject(apiRefusal(500, "unexpected"))});
        const {user} = await renderManager({adapter});
        await screen.findByText("Couldn't load the files.");

        adapter.list.mockImplementation(async () => []);
        await press(user, "Retry");

        await screen.findByText("No files yet.");
        await waitFor(() => expect(screen.getByRole("list", {name: "Stored files"})).toHaveFocus());
    });

    test("a reload that fails: the rows stay, the error and Retry show above them, row actions still work, and Retry brings the list back @ATT-270", async () => {
        const browser = stubDownloads();
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "keep.pdf"}), aStoredFile({originalFileName: "gone.pdf"})]});
        const {user} = await renderManager({canDelete: true, adapter});
        await expectStored("keep.pdf", "gone.pdf");

        adapter.list.mockRejectedValue(apiRefusal(500, "unexpected"));
        await deleteConfirmed(user, "gone.pdf");

        const alert = (await screen.findByText("Couldn't load the files.")).closest<HTMLElement>('[role="alert"]');
        expect(alert).not.toBeNull();
        await expectStored("keep.pdf", "gone.pdf");
        const list = screen.getByRole("list", {name: "Stored files"});
        expect(alert!.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        await press(user, named.download("keep.pdf"));
        await browser.saved(1);
        expect(browser.saves[0].name).toBe("keep.pdf");
        expect(screen.getByText("Couldn't load the files.")).toBeInTheDocument();

        adapter.list.mockImplementation(async () => [...adapter.files]);
        await user.click(within(alert!).getByRole("button", {name: "Retry"}));

        await expectStored("keep.pdf");
        expect(screen.queryByText("Couldn't load the files.")).not.toBeInTheDocument();
    });

    test("a list that fails in Arabic @ATT-222", async () => {
        const adapter = fakeAdapter({
            list: () => Promise.reject(apiRefusal(500, "unexpected")),
        });
        await renderManager({adapter}, {lang: "ar"});
        expect(await screen.findByText("تعذّر تحميل الملفات.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "إعادة المحاولة"})).toBeInTheDocument();
    });

    test("Download saves the file under its original name, Arabic names too", async () => {
        const browser = stubDownloads();
        const [, report] = files();
        const adapter = fakeAdapter({files: [report]});
        const {user} = await renderManager({adapter});

        await press(user, named.download("تقرير المريض.pdf"));

        await browser.saved(1);
        expect(browser.saves[0].name).toBe("تقرير المريض.pdf");
        await expect(browser.blobOf(browser.saves[0]).text()).resolves.toBe("content of تقرير المريض.pdf");
        expect(adapter.download).toHaveBeenCalledTimes(1);
        expect(adapter.download.mock.calls[0][0]).toBe(report.id);
    });

    test("Download all saves each file in turn, one request at a time @ATT-268", async () => {
        const browser = stubDownloads();
        const first = deferred<Blob>();
        const stored = files();
        const adapter = fakeAdapter({files: stored});
        adapter.download.mockImplementationOnce(() => first.promise);
        const {user} = await renderManager({adapter});
        await expectStored("scan.png", "تقرير المريض.pdf");

        await press(user, "Download all");

        await waitFor(() => expect(adapter.download).toHaveBeenCalledTimes(1));
        await pastPendingWork();
        expect(adapter.download).toHaveBeenCalledTimes(1);

        await act(async () => first.resolve(new Blob(["first"])));

        await browser.saved(2);
        expect(browser.saves.map(save => save.name)).toEqual(["scan.png", "تقرير المريض.pdf"]);
        expect(adapter.download.mock.calls.map(([id]) => id)).toEqual(stored.map(file => file.id));
    });

    test("Download all is disabled while it runs, and on again after @ATT-272", async () => {
        const browser = stubDownloads();
        const first = deferred<Blob>();
        const adapter = fakeAdapter({files: files()});
        adapter.download.mockImplementationOnce(() => first.promise);
        const {user} = await renderManager({adapter});
        await expectStored("scan.png", "تقرير المريض.pdf");

        await press(user, "Download all");

        await waitFor(() => expect(screen.getByRole("button", {name: "Download all"})).toBeDisabled());
        await act(async () => first.resolve(new Blob(["first"])));
        await browser.saved(2);
        await waitFor(() => expect(screen.getByRole("button", {name: "Download all"})).toBeEnabled());
    });

    test("a double click on a row's Download while it runs: one request, one save @ATT-272", async () => {
        const browser = stubDownloads();
        const answer = deferred<Blob>();
        const adapter = fakeAdapter({files: files().slice(0, 1), download: () => answer.promise});
        const {user} = await renderManager({adapter});
        await expectStored("scan.png");

        await user.dblClick(screen.getByRole("button", {name: named.download("scan.png")}));
        await pastPendingWork();
        expect(adapter.download).toHaveBeenCalledTimes(1);

        await act(async () => answer.resolve(new Blob(["x"])));
        await browser.saved(1);
        await pastPendingWork();
        expect(browser.saves).toHaveLength(1);
    });

    test("once a Download ended, the same file can be downloaded again @ATT-272", async () => {
        const browser = stubDownloads();
        const adapter = fakeAdapter({files: files().slice(0, 1)});
        const {user} = await renderManager({adapter});

        await press(user, named.download("scan.png"));
        await browser.saved(1);
        await press(user, named.download("scan.png"));

        await browser.saved(2);
        expect(adapter.download).toHaveBeenCalledTimes(2);
    });

    test("Download all with a row's Download running: that file isn't started again, the others are @ATT-272", async () => {
        const browser = stubDownloads();
        const first = deferred<Blob>();
        const stored = files();
        const adapter = fakeAdapter({files: stored});
        adapter.download.mockImplementationOnce(() => first.promise);
        const {user} = await renderManager({adapter});
        await expectStored("scan.png", "تقرير المريض.pdf");

        await press(user, named.download("scan.png"));
        await waitFor(() => expect(adapter.download).toHaveBeenCalledTimes(1));
        await press(user, "Download all");
        await waitFor(() => expect(adapter.download.mock.calls.length).toBeGreaterThan(1));

        await act(async () => first.resolve(new Blob(["first"])));
        await browser.saved(2);
        await pastPendingWork();

        expect(adapter.download.mock.calls.map(([id]) => id)).toEqual(stored.map(file => file.id));
        expect(browser.saves.map(save => save.name).sort()).toEqual(["scan.png", "تقرير المريض.pdf"].sort());
    });

    test("a failed download is a toast through the error's message", async () => {
        const stored = aStoredFile({originalFileName: "scan.png"});
        const adapter = fakeAdapter({files: [stored]});
        adapter.download.mockRejectedValue(new AxiosError("Network Error", AxiosError.ERR_NETWORK));
        const {user} = await renderManager({adapter});

        await press(user, named.download("scan.png"));

        await expectToasts("Can't reach the server. Check your connection.");
        await expectStored("scan.png");
    });
});

describe("deleting a stored file @area:attachments", () => {
    const twoFiles = () => [aStoredFile({originalFileName: "keep.pdf"}), aStoredFile({originalFileName: "gone.pdf"})];

    test("the confirmation names the file; confirmed, it leaves the list and a toast says so @ATT-232", async () => {
        const files = twoFiles();
        const adapter = fakeAdapter({files});
        const goneId = files[1].id;
        const {user} = await renderManager({canDelete: true, adapter});
        await expectStored("keep.pdf", "gone.pdf");

        await press(user, named.delete("gone.pdf"));

        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent(`Delete “${isolate("gone.pdf")}”?`);
        expect(dialog).toHaveTextContent("It will no longer show here.");
        expect(adapter.delete).not.toHaveBeenCalled();

        await user.click(within(dialog).getByRole("button", {name: "Delete"}));

        await expectToasts("File deleted");
        await expectStored("keep.pdf");
        expect(adapter.delete).toHaveBeenCalledTimes(1);
        expect(adapter.delete).toHaveBeenCalledWith(goneId);
    });

    test("in Arabic: the confirmation and the toast @ATT-232", async () => {
        const {user} = await renderManager({canDelete: true, adapter: fakeAdapter({files: twoFiles()})}, {lang: "ar"});

        await press(user, `حذف «${isolate("gone.pdf")}»`);

        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent(`حذف «${isolate("gone.pdf")}»؟`);
        expect(dialog).toHaveTextContent("لن يظهر هنا بعد ذلك.");
        await user.click(within(dialog).getByRole("button", {name: "حذف"}));
        await expectToasts("تم حذف الملف");
    });

    test("Cancel changes nothing @ATT-232", async () => {
        const adapter = fakeAdapter({files: twoFiles()});
        const {user} = await renderManager({canDelete: true, adapter});

        await press(user, named.delete("gone.pdf"));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", {name: "Cancel"}));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await expectStored("keep.pdf", "gone.pdf");
        expect(adapter.delete).not.toHaveBeenCalled();
        await expectToasts();
    });

    test("a double click on the confirmation sends one request @ATT-232", async () => {
        const adapter = fakeAdapter({files: twoFiles()});
        const {user} = await renderManager({canDelete: true, adapter});

        await press(user, named.delete("gone.pdf"));
        const dialog = await screen.findByRole("dialog");
        await user.dblClick(within(dialog).getByRole("button", {name: "Delete"}));

        await expectStored("keep.pdf");
        await pastPendingWork();
        expect(adapter.delete).toHaveBeenCalledTimes(1);
        await expectToasts("File deleted");
    });

    test("a double click on the row's Delete, then the confirmation: one request @ATT-232", async () => {
        const adapter = fakeAdapter({files: twoFiles()});
        const {user} = await renderManager({canDelete: true, adapter});

        await user.dblClick(await screen.findByRole("button", {name: named.delete("gone.pdf")}));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", {name: "Delete"}));

        await expectStored("keep.pdf");
        await pastPendingWork();
        expect(adapter.delete).toHaveBeenCalledTimes(1);
    });
});

describe("a row deleted meanwhile @area:attachments", () => {
    const stale = async (props: Parameters<typeof renderManager>[0] = {}) => {
        const adapter = fakeAdapter({files: [
            aStoredFile({originalFileName: "stale.png", typeKey: "png"}),
            aStoredFile({originalFileName: "other.png", typeKey: "png"}),
        ]});
        const rendered = await renderManager({...props, adapter});
        await expectStored("stale.png", "other.png");
        // Gone on the server, in another tab: this list hasn't reloaded
        adapter.files.splice(0, 1);
        return rendered;
    };

    test("Download: 404 reloads the list and says the item is gone @ATT-233", async () => {
        const {user} = await stale();
        await press(user, named.download("stale.png"));
        await expectToasts("This item no longer exists.");
        await expectStored("other.png");
    });

    test("Preview: 404 closes the dialog, reloads the list and says the item is gone @ATT-233", async () => {
        const {user} = await stale();
        await press(user, named.preview("stale.png"));
        await expectToasts("This item no longer exists.");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await expectStored("other.png");
    });

    test("Delete: 404 reloads the list and says the item is gone, not that it was deleted @ATT-233", async () => {
        const {user} = await stale({canDelete: true});
        await deleteConfirmed(user, "stale.png");
        await expectToasts("This item no longer exists.");
        await expectStored("other.png");
    });

    test("Replace: 404 reloads the list and says the item is gone @ATT-233", async () => {
        const {user} = await stale({canReplace: true});
        await replaceWith(user, "stale.png", aFile("new.png", 10));
        await expectToasts("This item no longer exists.");
        await expectStored("other.png");
    });

    test("Download with the row gone: focus isn't left on the body, it moves to the list @ATT-274", async () => {
        const {user} = await stale();

        await press(user, named.download("stale.png"));

        await expectStored("other.png");
        await waitFor(() => expect(screen.getByRole("list", {name: "Stored files"})).toHaveFocus());
    });

    test("Preview with the row gone: focus isn't left on the body, it moves to the list @ATT-274", async () => {
        const {user} = await stale();

        await press(user, named.preview("stale.png"));

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await expectStored("other.png");
        await waitFor(() => expect(screen.getByRole("list", {name: "Stored files"})).toHaveFocus());
    });

    test("Download all with every row gone: the same message toasts once @ATT-279", async () => {
        const stored = [
            aStoredFile({originalFileName: "a.png", typeKey: "png"}),
            aStoredFile({originalFileName: "b.png", typeKey: "png"}),
            aStoredFile({originalFileName: "c.png", typeKey: "png"}),
        ];
        const adapter = fakeAdapter({files: stored});
        const {user} = await renderManager({adapter});
        await expectStored("a.png", "b.png", "c.png");
        adapter.files.splice(0, 3);

        await press(user, "Download all");

        await expectStored();
        await waitFor(() => expect(adapter.download).toHaveBeenCalledTimes(3));
        await pastPendingWork();
        // Read now: every toast leaves after a few seconds, so waiting for this could pass or fail on their going
        expect(toastTexts()).toEqual(["This item no longer exists."]);
    });

    test("a different message toasts on its own @ATT-279", async () => {
        const stored = [
            aStoredFile({originalFileName: "a.png", typeKey: "png"}),
            aStoredFile({originalFileName: "b.png", typeKey: "png"}),
        ];
        const adapter = fakeAdapter({files: stored});
        adapter.download.mockRejectedValueOnce(apiRefusal(404, "notFound"));
        adapter.download.mockRejectedValueOnce(apiRefusal(500, "unexpected"));
        const {user} = await renderManager({adapter});
        await expectStored("a.png", "b.png");

        await press(user, "Download all");

        await waitFor(() => expect(toastTexts().sort()).toEqual(["Something went wrong. Please try again.", "This item no longer exists."]));
    });

    test("in Arabic, in the business file's words @ATT-233", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "stale.png"})]});
        const {user} = await renderManager({adapter}, {lang: "ar"});
        await screen.findByRole("list", {name: "الملفات المحفوظة"});
        adapter.files.splice(0, 1);

        await press(user, `تنزيل «${isolate("stale.png")}»`);

        await expectToasts("هذا العنصر لم يعد موجودًا.");
    });
});

describe("what the feature allows @area:attachments", () => {
    const stored = () => fakeAdapter({files: [aStoredFile({originalFileName: "scan.png"})]});

    test("canUpload, canReplace and canDelete left out: those controls aren't shown; preview and download are @ATT-234", async () => {
        await renderManager({adapter: stored()});
        await expectStored("scan.png");

        expect(screen.queryByRole("button", {name: "Choose files"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Choose a file"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Upload"})).not.toBeInTheDocument();
        expect(screen.queryByTestId("attachment-input")).not.toBeInTheDocument();
        expect(screen.queryByTestId("attachment-drop-area")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: named.delete("scan.png")})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: named.replace("scan.png")})).not.toBeInTheDocument();
        expect(screen.queryByTestId("attachment-replace-input")).not.toBeInTheDocument();

        expect(screen.getByRole("button", {name: named.preview("scan.png")})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: named.download("scan.png")})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Download all"})).toBeInTheDocument();
    });

    test("each given shows its own control, and only it @ATT-234", async () => {
        const uploading = await renderManager({canUpload: true, adapter: stored()});
        await filesCanBePicked();
        expect(screen.getByRole("button", {name: "Choose files"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Upload"})).toBeInTheDocument();
        expect(screen.getByTestId("attachment-drop-area")).toBeInTheDocument();
        await expectStored("scan.png");
        expect(screen.queryByRole("button", {name: named.delete("scan.png")})).not.toBeInTheDocument();
        uploading.unmount();

        const deleting = await renderManager({canDelete: true, adapter: stored()});
        await expectStored("scan.png");
        expect(screen.getByRole("button", {name: named.delete("scan.png")})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Choose files"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: named.replace("scan.png")})).not.toBeInTheDocument();
        deleting.unmount();

        await renderManager({canReplace: true, adapter: stored()});
        await expectStored("scan.png");
        expect(screen.getByRole("button", {name: named.replace("scan.png")})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: named.delete("scan.png")})).not.toBeInTheDocument();
    });

    test("canReplace alone shows the trigger and Upload only with multiple={false} and a stored file @ATT-234", async () => {
        const one = await renderManager({canReplace: true, multiple: false, adapter: stored()});
        await filesCanBePicked();
        expect(screen.getByRole("button", {name: "Choose a file"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Upload"})).toBeInTheDocument();
        one.unmount();

        const noFile = await renderManager({canReplace: true, multiple: false});
        await screen.findByText("No files yet.");
        expect(screen.queryByRole("button", {name: "Choose a file"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Upload"})).not.toBeInTheDocument();
        noFile.unmount();

        await renderManager({canReplace: true, adapter: stored()});
        await expectStored("scan.png");
        expect(screen.queryByRole("button", {name: "Choose files"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Upload"})).not.toBeInTheDocument();
    });

    test("a preview can still be opened with nothing allowed @ATT-234", async () => {
        const {user} = await renderManager({adapter: stored()});
        await expect(openPreview(user, "scan.png")).resolves.toBeInTheDocument();
    });

    const scan = () => [aStoredFile({originalFileName: "scan.png"})];

    test.each([
        ["one stored file", () => scan(), ["scan.png"]],
        ["two stored files", () => [...scan(), aStoredFile({originalFileName: "old.pdf"})], ["scan.png", "old.pdf"]],
    ])("multiple={false} with %s: no Download all, and each row's Download stays @ATT-269", async (_what, stored, names) => {
        await renderManager({multiple: false, adapter: fakeAdapter({files: stored()})});
        await expectStored(...names);

        expect(screen.queryByRole("button", {name: "Download all"})).not.toBeInTheDocument();
        for (const name of names) expect(screen.getByRole("button", {name: named.download(name)})).toBeInTheDocument();
    });

    test.each([
        ["left out", {}],
        ["true", {multiple: true}],
    ])("multiple %s: Download all shows, with one stored file too @ATT-269", async (_what, props) => {
        await renderManager({...props, adapter: fakeAdapter({files: scan()})});
        await expectStored("scan.png");

        expect(screen.getByRole("button", {name: "Download all"})).toBeInTheDocument();
    });

    test("canDelete with no delete call: no Delete button @ATT-264", async () => {
        await renderManager({canDelete: true, adapter: fakeAdapter({files: scan(), delete: undefined})});
        await expectStored("scan.png");

        expect(screen.queryByRole("button", {name: named.delete("scan.png")})).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: named.download("scan.png")})).toBeInTheDocument();
    });

    test("canReplace with no replace call: no Replace button and no input for it @ATT-264", async () => {
        await renderManager({canReplace: true, adapter: fakeAdapter({files: scan(), replace: undefined})});
        await expectStored("scan.png");

        expect(screen.queryByRole("button", {name: named.replace("scan.png")})).not.toBeInTheDocument();
        expect(screen.queryByTestId("attachment-replace-input")).not.toBeInTheDocument();
    });

    test("renderItem gets no delete and no replace with no such call, whatever the permissions @ATT-264", async () => {
        const seen: AttachmentItemActions[] = [];
        const renderItem = (file: Attachment, actions: AttachmentItemActions) => {
            seen.push(actions);
            return <span>{file.originalFileName}</span>;
        };
        await renderManager({canReplace: true, canDelete: true, renderItem, adapter: fakeAdapter({files: scan(), replace: undefined, delete: undefined})});
        await expectStored("scan.png");

        expect(seen.length).toBeGreaterThan(0);
        expect(seen.filter(actions => actions.replace || actions.delete)).toEqual([]);
    });

    test("multiple={false} and canReplace alone with no replace call: Upload wouldn't be a replace, so no picker shows @ATT-264", async () => {
        const adapter = fakeAdapter({files: scan(), replace: undefined});
        await renderManager({canReplace: true, multiple: false, adapter});
        await expectStored("scan.png");
        await waitFor(() => expect(adapter.rules).toHaveBeenCalled());
        await pastPendingWork();

        expect(screen.queryByRole("button", {name: "Choose a file"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Upload"})).not.toBeInTheDocument();
        expect(screen.queryByTestId("attachment-input")).not.toBeInTheDocument();
        expect(screen.queryByTestId("attachment-drop-area")).not.toBeInTheDocument();
    });
});
