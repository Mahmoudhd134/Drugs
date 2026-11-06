import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import {describe, expect, test} from "vitest";
import {expectToasts, isolate, toastTexts} from "../../../test";
import {
    aFile, apiRefusal, aStoredFile, closePreview, deferred, deleteConfirmed, expectSelected, expectStored, fakeAdapter, named,
    openPreview, pastPendingWork, pickFiles, press, renderLeavableManager, renderManager, selectedRow, setPdfViewer, stubDownloads,
    stubObjectUrls,
} from "../../../test/pages/attachments.tsx";

// The preview: design § 12 "Preview"; contract § 2 "Preview"; business.md «المعاينة».

const NO_PREVIEW = "No preview is available for this type of file. You can download it.";
const CANT_SHOW = "This file can't be shown. You can download it.";

const storedOf = (name: string, typeKey: string, sizeBytes = 2048) => aStoredFile({originalFileName: name, typeKey, sizeBytes});

describe("a file with no viewer @area:attachments", () => {
    test.each([
        ["scan.tiff", "tiff"], ["photo.heic", "heic"], ["letter.docx", "docx"], ["sheet.xlsx", "xlsx"], ["slides.pptx", "pptx"],
        ["old.doc", "doc"], ["old.xls", "xls"], ["old.ppt", "ppt"],
    ])("%s: name, size and Download, nothing fetched and no viewer @ATT-227", async (name, typeKey) => {
        const adapter = fakeAdapter({files: [storedOf(name, typeKey)]});
        const {user} = await renderManager({adapter});

        const dialog = await openPreview(user, name);

        expect(dialog).toHaveTextContent(NO_PREVIEW);
        expect(dialog).toHaveTextContent(name);
        expect(dialog).toHaveTextContent("2 KB");
        expect(within(dialog).getByRole("button", {name: "Download"})).toBeInTheDocument();
        expect(dialog.querySelector("img, iframe, pre")).toBeNull();
        await pastPendingWork();
        expect(adapter.download).not.toHaveBeenCalled();
    });

    test("its Download fetches and saves it under its name @ATT-227", async () => {
        const browser = stubDownloads();
        const adapter = fakeAdapter({files: [storedOf("letter.docx", "docx")]});
        const {user} = await renderManager({adapter});

        const dialog = await openPreview(user, "letter.docx");
        await user.click(within(dialog).getByRole("button", {name: "Download"}));

        await browser.saved(1);
        expect(browser.saves[0].name).toBe("letter.docx");
        expect(adapter.download).toHaveBeenCalledTimes(1);
    });

    test("in Arabic, in the business file's words @ATT-227", async () => {
        const {user} = await renderManager({adapter: fakeAdapter({files: [storedOf("letter.docx", "docx")]})}, {lang: "ar"});
        await press(user, `معاينة «${isolate("letter.docx")}»`);
        const dialog = await screen.findByRole("dialog", {name: `معاينة «${isolate("letter.docx")}»`});
        expect(dialog).toHaveTextContent("لا تتوفر معاينة لهذا النوع من الملفات. يمكنك تنزيله.");
        expect(dialog).toHaveTextContent("2 كيلوبايت");
        expect(within(dialog).getByRole("button", {name: "تنزيل"})).toBeInTheDocument();
    });

    test("a selected one too, its Download saving the File itself with no request @ATT-227", async () => {
        const browser = stubDownloads();
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter});
        const file = aFile("scan.tiff", 2048);
        await pickFiles(file);
        await expectSelected("scan.tiff");

        const dialog = await openPreview(user, "scan.tiff");

        expect(dialog).toHaveTextContent(NO_PREVIEW);
        expect(dialog).toHaveTextContent("2 KB");
        await user.click(within(dialog).getByRole("button", {name: "Download"}));
        await browser.saved(1);
        expect(browser.saves[0].name).toBe("scan.tiff");
        expect(browser.blobOf(browser.saves[0])).toBe(file);
        expect(adapter.download).not.toHaveBeenCalled();
    });
});

describe("a text file holding markup @area:attachments", () => {
    const MARKUP = "<script>window.__attachmentRan = true</script><b>bold</b><img src=x onerror=\"window.__attachmentRan = true\">";

    test.each(["txt", "csv"])("%s: it shows as literal text and nothing runs @ATT-228", async typeKey => {
        const adapter = fakeAdapter({files: [storedOf(`notes.${typeKey}`, typeKey)], download: async () => new Blob([MARKUP], {type: "text/html"})});
        const {user} = await renderManager({adapter});

        const dialog = await openPreview(user, `notes.${typeKey}`);

        const shown = await within(dialog).findByText(MARKUP);
        expect(shown.closest("pre")).toHaveAttribute("dir", "auto");
        expect(dialog.querySelector("script, b, img, iframe")).toBeNull();
        expect((window as { __attachmentRan?: boolean }).__attachmentRan).toBeUndefined();
    });

    test("a selected one: the same, read from the File with no request @ATT-228", async () => {
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(new File([MARKUP], "notes.txt", {type: "text/html"}));
        await expectSelected("notes.txt");

        const dialog = await openPreview(user, "notes.txt");

        expect(await within(dialog).findByText(MARKUP)).toBeInTheDocument();
        expect(dialog.querySelector("script, b, img, iframe")).toBeNull();
        expect(adapter.download).not.toHaveBeenCalled();
    });

    test("over 1 MB: the first 1 MB with a note; exactly 1 MB: no note @ATT-230", async () => {
        const MB = 1_048_576;
        const adapter = fakeAdapter({files: [storedOf("long.txt", "txt"), storedOf("exact.txt", "txt")]});
        adapter.download.mockImplementation(async id =>
            new Blob([new Uint8Array(id === adapter.files[0].id ? MB + 1 : MB).fill(0x61)]));
        const {user} = await renderManager({adapter});

        const long = await openPreview(user, "long.txt");
        expect(await within(long).findByText("Showing the first 1 MB only.")).toBeInTheDocument();
        expect(long.querySelector("pre")?.textContent).toHaveLength(MB);
        await closePreview(user, long);

        const exact = await openPreview(user, "exact.txt");
        await waitFor(() => expect(exact.querySelector("pre")?.textContent).toHaveLength(MB));
        expect(within(exact).queryByText("Showing the first 1 MB only.")).not.toBeInTheDocument();
    });

    test("a failed fetch toasts and closes the dialog", async () => {
        const adapter = fakeAdapter({files: [storedOf("notes.txt", "txt")]});
        adapter.download.mockRejectedValue(apiRefusal(500, "unexpected"));
        const {user} = await renderManager({adapter});

        await press(user, named.preview("notes.txt"));

        await expectToasts("Something went wrong. Please try again.");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
});

describe("object URLs @area:attachments", () => {
    test("an image's, created when its preview opens, is revoked when it closes @ATT-231", async () => {
        const urls = stubObjectUrls();
        const adapter = fakeAdapter({files: [storedOf("scan.png", "png")]});
        const {user} = await renderManager({adapter});
        await expectStored("scan.png");
        expect(urls.created).toEqual([]);

        const dialog = await openPreview(user, "scan.png");

        const image = await within(dialog).findByRole("img", {name: named.previewOf("scan.png")});
        expect(image).toHaveAttribute("src", "blob:test/1");
        expect(urls.live()).toEqual(["blob:test/1"]);
        expect(adapter.download).toHaveBeenCalledTimes(1);

        await closePreview(user, dialog);

        expect(urls.live()).toEqual([]);
        expect(urls.revoked).toEqual(["blob:test/1"]);
    });

    test("a PDF's with the viewer on: a titled iframe with no sandbox, on a blob typed application/pdf, revoked when it closes @ATT-231", async () => {
        setPdfViewer(true);
        const urls = stubObjectUrls();
        const adapter = fakeAdapter({files: [storedOf("report.pdf", "pdf")], download: async () => new Blob(["%PDF-1.7"], {type: "text/html"})});
        const {user} = await renderManager({adapter});

        const dialog = await openPreview(user, "report.pdf");

        const frame = await waitFor(() => {
            const found = dialog.querySelector("iframe");
            if (!found) throw new Error("No iframe yet");
            return found;
        });
        expect(frame).toHaveAttribute("title", named.previewOf("report.pdf"));
        expect(frame).not.toHaveAttribute("sandbox");
        expect(frame).toHaveAttribute("src", "blob:test/1");
        expect(urls.created[0].type).toBe("application/pdf");
        await expect(urls.created[0].text()).resolves.toBe("%PDF-1.7");
        expect(within(dialog).getByRole("button", {name: "Download"})).toBeInTheDocument();

        await closePreview(user, dialog);

        expect(urls.live()).toEqual([]);
    });

    test("unmounted with a preview open: revoked @ATT-231", async () => {
        const urls = stubObjectUrls();
        const {user, unmount} = await renderManager({adapter: fakeAdapter({files: [storedOf("scan.png", "png")]})});
        const dialog = await openPreview(user, "scan.png");
        await within(dialog).findByRole("img");
        expect(urls.live()).toHaveLength(1);

        unmount();

        expect(urls.live()).toEqual([]);
    });

    test("unmounted while it's loading: the request is aborted, no toast, and a late answer makes no URL that stays @ATT-231", async () => {
        const urls = stubObjectUrls();
        const answer = deferred<Blob>();
        const adapter = fakeAdapter({files: [storedOf("scan.png", "png")], download: () => answer.promise});
        const {user, leave} = await renderLeavableManager({adapter});
        await openPreview(user, "scan.png");
        await waitFor(() => expect(adapter.download).toHaveBeenCalledTimes(1));
        const signal = adapter.download.mock.calls[0][1];

        await leave();

        expect(signal?.aborted).toBe(true);
        await act(async () => answer.resolve(new Blob(["x"])));
        await pastPendingWork();
        expect(urls.live()).toEqual([]);
        expect(toastTexts()).toEqual([]);
    });

    test("a selected image's thumbnail: revoked when removed @ATT-231", async () => {
        const urls = stubObjectUrls();
        const {user} = await renderManager({canUpload: true});
        await pickFiles(aFile("scan.png", 1, "image/png"));
        await waitFor(() => expect(urls.live()).toHaveLength(1));

        await press(user, named.remove("scan.png"));

        await expectSelected();
        await waitFor(() => expect(urls.live()).toEqual([]));
    });

    test("a selected image's thumbnail: revoked when unmounted @ATT-231", async () => {
        const urls = stubObjectUrls();
        const {unmount} = await renderManager({canUpload: true});
        await pickFiles(aFile("scan.png", 1, "image/png"));
        await waitFor(() => expect(urls.live()).toHaveLength(1));

        unmount();

        expect(urls.live()).toEqual([]);
    });

    test("a selected image's thumbnail: revoked when it's uploaded and leaves the selection @ATT-231", async () => {
        const urls = stubObjectUrls();
        const {user} = await renderManager({canUpload: true});
        await pickFiles(aFile("scan.png", 1, "image/png"));
        await waitFor(() => expect(urls.live()).toHaveLength(1));

        await press(user, "Upload");

        await expectSelected();
        await waitFor(() => expect(urls.live()).toEqual([]));
    });

    test("a selected image's preview, from the File with no request: revoked when closed; the thumbnail stays @ATT-231", async () => {
        const urls = stubObjectUrls();
        const file = aFile("scan.png", 1, "image/png");
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(file);
        await waitFor(() => expect(urls.live()).toHaveLength(1));

        const dialog = await openPreview(user, "scan.png");
        const image = await within(dialog).findByRole("img", {name: named.previewOf("scan.png")});
        expect(urls.created[Number(image.getAttribute("src")?.split("/").pop()) - 1]).toBe(file);
        expect(adapter.download).not.toHaveBeenCalled();

        await closePreview(user, dialog);

        await expectSelected("scan.png");
        expect(urls.live()).toEqual([selectedRow("scan.png").querySelector("img")?.getAttribute("src")]);
    });

    test("a ready preview's Download saves the bytes already here, with no second request @ATT-231", async () => {
        const browser = stubDownloads();
        const adapter = fakeAdapter({files: [storedOf("scan.png", "png")]});
        const {user} = await renderManager({adapter});

        const dialog = await openPreview(user, "scan.png");
        await within(dialog).findByRole("img");
        await user.click(within(dialog).getByRole("button", {name: "Download"}));

        await waitFor(() => expect(browser.saves).toHaveLength(1));
        expect(browser.saves[0].name).toBe("scan.png");
        expect(adapter.download).toHaveBeenCalledTimes(1);
        await closePreview(user, dialog);
        await browser.saved(1);
        expect(browser.live()).toEqual([]);
    });
});

describe("a preview's request @area:attachments", () => {
    test("a double click on Preview: one request @ATT-240", async () => {
        stubObjectUrls();
        const adapter = fakeAdapter({files: [storedOf("scan.png", "png")]});
        const {user} = await renderManager({adapter});

        await user.dblClick(await screen.findByRole("button", {name: named.preview("scan.png")}));

        const dialog = await screen.findByRole("dialog", {name: named.previewOf("scan.png")});
        await within(dialog).findByRole("img");
        expect(adapter.download).toHaveBeenCalledTimes(1);
    });

    test("two clicks before the screen can change: one request @ATT-240", async () => {
        stubObjectUrls();
        const adapter = fakeAdapter({files: [storedOf("scan.png", "png")]});
        await renderManager({adapter});
        const button = await screen.findByRole("button", {name: named.preview("scan.png")});

        act(() => {
            fireEvent.click(button);
            fireEvent.click(button);
        });

        const dialog = await screen.findByRole("dialog");
        await within(dialog).findByRole("img");
        expect(adapter.download).toHaveBeenCalledTimes(1);
    });

    test("closed while loading, the answer arrives late: ignored, no toast, and no URL stays @ATT-240", async () => {
        const urls = stubObjectUrls();
        const answer = deferred<Blob>();
        const adapter = fakeAdapter({files: [storedOf("scan.png", "png")], download: () => answer.promise});
        const {user} = await renderManager({adapter});

        const dialog = await openPreview(user, "scan.png");
        await closePreview(user, dialog);
        await act(async () => answer.resolve(new Blob(["late"])));
        await pastPendingWork();

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(urls.live()).toEqual([]);
        expect(toastTexts()).toEqual([]);
        expect(adapter.download).toHaveBeenCalledTimes(1);
    });

    test("closed while loading, the request fails late: no toast @ATT-240", async () => {
        stubObjectUrls();
        const answer = deferred<Blob>();
        const adapter = fakeAdapter({files: [storedOf("scan.png", "png")], download: () => answer.promise});
        const {user} = await renderManager({adapter});

        const dialog = await openPreview(user, "scan.png");
        await closePreview(user, dialog);
        await act(async () => answer.reject(apiRefusal(500, "unexpected")));
        await pastPendingWork();

        expect(toastTexts()).toEqual([]);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("a late answer of another file's preview doesn't show in this one @ATT-240", async () => {
        const urls = stubObjectUrls();
        const late = deferred<Blob>();
        const adapter = fakeAdapter({files: [storedOf("first.png", "png"), storedOf("second.png", "png")]});
        adapter.download.mockImplementationOnce(() => late.promise);
        const {user} = await renderManager({adapter});

        const first = await openPreview(user, "first.png");
        await closePreview(user, first);
        const second = await openPreview(user, "second.png");
        const image = await within(second).findByRole("img", {name: named.previewOf("second.png")});
        const shown = image.getAttribute("src");

        await act(async () => late.resolve(new Blob(["late"])));
        await pastPendingWork();

        expect(within(second).getByRole("img", {name: named.previewOf("second.png")})).toHaveAttribute("src", shown);
        expect(urls.live()).toEqual([shown]);
    });
});

describe("an image that can't be decoded @area:attachments", () => {
    test("stored: name, size, the message and Download show, and its URL is revoked on close @ATT-241", async () => {
        const urls = stubObjectUrls();
        const {user} = await renderManager({adapter: fakeAdapter({files: [storedOf("broken.png", "png")]})});

        const dialog = await openPreview(user, "broken.png");
        fireEvent.error(await within(dialog).findByRole("img"));

        expect(await within(dialog).findByText(CANT_SHOW)).toBeInTheDocument();
        expect(dialog).toHaveTextContent("broken.png");
        expect(dialog).toHaveTextContent("2 KB");
        expect(within(dialog).getByRole("button", {name: "Download"})).toBeInTheDocument();
        expect(within(dialog).queryByRole("img")).not.toBeInTheDocument();

        await closePreview(user, dialog);
        expect(urls.live()).toEqual([]);
    });

    test("in Arabic @ATT-241", async () => {
        stubObjectUrls();
        const {user} = await renderManager({adapter: fakeAdapter({files: [storedOf("broken.png", "png")]})}, {lang: "ar"});
        await press(user, `معاينة «${isolate("broken.png")}»`);
        const dialog = await screen.findByRole("dialog");
        fireEvent.error(await within(dialog).findByRole("img"));
        expect(await within(dialog).findByText("لا يمكن عرض هذا الملف. يمكنك تنزيله.")).toBeInTheDocument();
    });

    test("selected: the same, with no request @ATT-241", async () => {
        stubObjectUrls();
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("broken.png", 2048, "image/png"));
        await expectSelected("broken.png");

        const dialog = await openPreview(user, "broken.png");
        fireEvent.error(await within(dialog).findByRole("img", {name: named.previewOf("broken.png")}));

        expect(await within(dialog).findByText(CANT_SHOW)).toBeInTheDocument();
        expect(dialog).toHaveTextContent("2 KB");
        expect(within(dialog).getByRole("button", {name: "Download"})).toBeInTheDocument();
        expect(adapter.download).not.toHaveBeenCalled();
    });
});

describe("focus @area:attachments", () => {
    const three = () => fakeAdapter({files: [
        storedOf("first.png", "png"), storedOf("second.png", "png"), storedOf("third.png", "png"),
    ]});

    test("a preview closed by its button: focus returns to the button that opened it @ATT-242", async () => {
        stubObjectUrls();
        const {user} = await renderManager({adapter: three()});
        const dialog = await openPreview(user, "second.png");

        await closePreview(user, dialog);

        await waitFor(() => expect(screen.getByRole("button", {name: named.preview("second.png")})).toHaveFocus());
    });

    test("a preview closed by Esc: the same @ATT-242", async () => {
        stubObjectUrls();
        const {user} = await renderManager({adapter: three()});
        await openPreview(user, "second.png");

        await user.keyboard("{Escape}");

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await waitFor(() => expect(screen.getByRole("button", {name: named.preview("second.png")})).toHaveFocus());
    });

    test("after a delete, focus moves to the next row's first button @ATT-242", async () => {
        const {user} = await renderManager({canDelete: true, adapter: three()});

        await deleteConfirmed(user, "first.png");

        await expectStored("second.png", "third.png");
        await waitFor(() => expect(screen.getByRole("button", {name: named.preview("second.png")})).toHaveFocus());
    });

    test("after a delete in the middle: the row after it, not the one before @ATT-242", async () => {
        const {user} = await renderManager({canDelete: true, adapter: three()});

        await deleteConfirmed(user, "second.png");

        await expectStored("first.png", "third.png");
        await waitFor(() => expect(screen.getByRole("button", {name: named.preview("third.png")})).toHaveFocus());
    });

    test("after deleting the last row: focus moves to the list @ATT-242", async () => {
        const {user} = await renderManager({canDelete: true, adapter: three()});

        await deleteConfirmed(user, "third.png");

        await expectStored("first.png", "second.png");
        const list = screen.getByRole("list", {name: "Stored files"});
        await waitFor(() => expect(list).toHaveFocus());
        expect(list).toHaveAttribute("tabindex", "-1");
    });

    test("after deleting the only row: focus isn't lost on the page's body @ATT-242", async () => {
        const {user} = await renderManager({canDelete: true, adapter: fakeAdapter({files: [storedOf("only.png", "png")]})});

        await deleteConfirmed(user, "only.png");

        await screen.findByText("No files yet.");
        await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    });
});

describe("a PDF the browser can't show @area:attachments", () => {
    test.each([
        ["off", () => setPdfViewer(false)],
        ["unknown", () => undefined],
    ])("the viewer flag %s: name, size and Download, nothing fetched, no iframe @ATT-249", async (_flag, setFlag) => {
        setFlag();
        const adapter = fakeAdapter({files: [storedOf("report.pdf", "pdf")]});
        const {user} = await renderManager({adapter});

        const dialog = await openPreview(user, "report.pdf");

        expect(dialog).toHaveTextContent(NO_PREVIEW);
        expect(dialog).toHaveTextContent("report.pdf");
        expect(dialog).toHaveTextContent("2 KB");
        expect(within(dialog).getByRole("button", {name: "Download"})).toBeInTheDocument();
        expect(dialog.querySelector("iframe")).toBeNull();
        await pastPendingWork();
        expect(adapter.download).not.toHaveBeenCalled();
    });

    test("its Download fetches the file and saves it @ATT-249", async () => {
        setPdfViewer(false);
        const browser = stubDownloads();
        const adapter = fakeAdapter({files: [storedOf("report.pdf", "pdf")]});
        const {user} = await renderManager({adapter});

        const dialog = await openPreview(user, "report.pdf");
        await user.click(within(dialog).getByRole("button", {name: "Download"}));

        await browser.saved(1);
        expect(browser.saves[0].name).toBe("report.pdf");
        expect(adapter.download).toHaveBeenCalledTimes(1);
    });

    test("a selected PDF: the same, with no request @ATT-249", async () => {
        setPdfViewer(false);
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("report.pdf", 2048));
        await expectSelected("report.pdf");

        const dialog = await openPreview(user, "report.pdf");

        expect(dialog).toHaveTextContent(NO_PREVIEW);
        expect(dialog).toHaveTextContent("2 KB");
        expect(within(dialog).getByRole("button", {name: "Download"})).toBeInTheDocument();
        expect(dialog.querySelector("iframe")).toBeNull();
        expect(adapter.download).not.toHaveBeenCalled();
    });

    test("a selected PDF with the viewer on: an iframe on the File's bytes typed application/pdf @ATT-249", async () => {
        setPdfViewer(true);
        const urls = stubObjectUrls();
        const {user} = await renderManager({canUpload: true});
        await pickFiles(new File(["%PDF-1.7"], "report.pdf", {type: "text/html"}));
        await expectSelected("report.pdf");

        const dialog = await openPreview(user, "report.pdf");

        await waitFor(() => expect(dialog.querySelector("iframe")).not.toBeNull());
        const shown = urls.created.find(blob => blob.type === "application/pdf");
        expect(shown).toBeDefined();
        await expect(shown?.text()).resolves.toBe("%PDF-1.7");
    });
});
