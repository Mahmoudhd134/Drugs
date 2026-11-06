import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import {describe, expect, test, vi} from "vitest";
import {expectToasts, renderWithProviders} from "../../../test";
import {
    aDataTransfer, aFile, apiRefusal, aStoredFile, deferred, expectSelected, fakeAdapter, filesCanBePicked, named, openPreview, pickFiles,
    pickReplacement, press, renderManager, stubDownloads, stubObjectUrls,
} from "../../../test/pages/attachments.tsx";
import type {
    Attachment, AttachmentItemActions, AttachmentPreviewState, AttachmentTriggerProps, SelectedFile, SelectedFileActions,
} from "../types.ts";
import {AttachmentList} from "./AttachmentList.tsx";
import {AttachmentPicker} from "./AttachmentPicker.tsx";
import {AttachmentPreview} from "./AttachmentPreview.tsx";
import {useAttachments} from "../useAttachments.ts";

// Customizing: design § 12 "Customizing (A13)".

describe("renderTrigger @area:attachments", () => {
    const trigger = {
        renderTrigger: ({open, dropProps, isDragActive, disabled}: AttachmentTriggerProps) => (
            <div data-testid="my-area" {...dropProps}>
                <button onClick={open} disabled={disabled}>My trigger</button>
                <span>{isDragActive ? "Dragging" : "Waiting"}</span>
            </div>
        ),
    };

    test("it replaces the button and the hint; open opens the file choice @ATT-250", async () => {
        const {user} = await renderManager({canUpload: true, ...trigger});
        await filesCanBePicked();

        expect(screen.queryByRole("button", {name: "Choose files"})).not.toBeInTheDocument();
        expect(screen.queryByText("or drop them here")).not.toBeInTheDocument();
        const opened = vi.fn();
        screen.getByTestId("attachment-input").addEventListener("click", opened);

        await user.click(screen.getByRole("button", {name: "My trigger"}));

        expect(opened).toHaveBeenCalledTimes(1);
    });

    test("a pick through its input still selects, and Upload is still there @ATT-250", async () => {
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter, ...trigger});

        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await press(user, "Upload");

        await waitFor(() => expect(adapter.upload).toHaveBeenCalledTimes(1));
    });

    test("dropProps take a drop and tell isDragActive @ATT-250", async () => {
        stubObjectUrls();
        await renderManager({canUpload: true, ...trigger});
        await filesCanBePicked();
        const area = screen.getByTestId("my-area");
        const dataTransfer = aDataTransfer({files: [aFile("a.png", 1)]});

        fireEvent.dragEnter(area, {dataTransfer});
        expect(await screen.findByText("Dragging")).toBeInTheDocument();
        fireEvent.dragLeave(area, {dataTransfer});
        expect(await screen.findByText("Waiting")).toBeInTheDocument();
        fireEvent.dragEnter(area, {dataTransfer});
        fireEvent.drop(area, {dataTransfer});

        await expectSelected("a.png");
        expect(await screen.findByText("Waiting")).toBeInTheDocument();
    });

    test("disabled is true while the rules failed @ATT-250", async () => {
        const adapter = fakeAdapter();
        adapter.rules.mockRejectedValue(apiRefusal(500, "unexpected"));
        await renderManager({canUpload: true, adapter, ...trigger});
        await screen.findByText("Couldn't load what can be uploaded.");
        expect(screen.getByRole("button", {name: "My trigger"})).toBeDisabled();
    });

    test("disabled is false once they load @ATT-250", async () => {
        await renderManager({canUpload: true, ...trigger});
        await filesCanBePicked();
        await waitFor(() => expect(screen.getByRole("button", {name: "My trigger"})).toBeEnabled());
    });
});

describe("renderSelectedItem @area:attachments", () => {
    const row = (item: SelectedFile, actions: SelectedFileActions) => {
        const name = item.file.name;
        return (
            <div data-testid={`my-${name}`}>
                <span>{`${name}: ${item.status} ${item.percent}% ${item.error ?? ""}`}</span>
                <button onClick={actions.remove}>{`Mine remove ${name}`}</button>
                <button onClick={actions.cancel}>{`Mine cancel ${name}`}</button>
                <button onClick={actions.retry}>{`Mine retry ${name}`}</button>
                <button onClick={actions.preview}>{`Mine preview ${name}`}</button>
            </div>
        );
    };

    test("it replaces the row, and remove works @ATT-250", async () => {
        const {user} = await renderManager({canUpload: true, renderSelectedItem: row});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));

        expect(await screen.findByText(/^a\.png: waiting/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: named.remove("a.png")})).not.toBeInTheDocument();

        await press(user, "Mine remove a.png");

        await waitFor(() => expect(screen.queryByTestId("my-a.png")).not.toBeInTheDocument());
        expect(screen.getByTestId("my-b.png")).toBeInTheDocument();
    });

    test("it receives the status and percent, and cancel works @ATT-250", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter, renderSelectedItem: row});
        await pickFiles(aFile("a.png", 1));
        await screen.findByTestId("my-a.png");
        await press(user, "Upload");
        const held = await gate.held("a.png");

        held.progress(25);
        expect(await screen.findByText(/^a\.png: uploading 25%/)).toBeInTheDocument();

        await press(user, "Mine cancel a.png");

        expect(held.signal?.aborted).toBe(true);
        expect(await screen.findByText(/^a\.png: cancelled/)).toBeInTheDocument();
    });

    test("it receives the translated reason, and retry works @ATT-250", async () => {
        const adapter = fakeAdapter();
        adapter.upload.mockImplementationOnce(() => Promise.reject(apiRefusal(400, "attachmentEmpty")));
        const {user} = await renderManager({canUpload: true, adapter, renderSelectedItem: row});
        await pickFiles(aFile("a.png", 1));
        await screen.findByTestId("my-a.png");
        await press(user, "Upload");
        expect(await screen.findByText(/^a\.png: failed .*This file is empty\./)).toBeInTheDocument();

        await press(user, "Mine retry a.png");

        await waitFor(() => expect(screen.queryByTestId("my-a.png")).not.toBeInTheDocument());
        expect(adapter.upload).toHaveBeenCalledTimes(2);
    });

    test("preview works, with no request @ATT-250", async () => {
        stubObjectUrls();
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter, renderSelectedItem: row});
        await pickFiles(aFile("a.png", 1, "image/png"));
        await screen.findByTestId("my-a.png");

        await press(user, "Mine preview a.png");

        expect(await screen.findByRole("dialog", {name: named.previewOf("a.png")})).toBeInTheDocument();
        expect(adapter.download).not.toHaveBeenCalled();
    });
});

describe("renderItem @area:attachments", () => {
    const row = (file: Attachment, actions: AttachmentItemActions) => {
        const name = file.originalFileName;
        return (
            <div data-testid={`my-${name}`}>
                <span>{name}</span>
                <button onClick={actions.download}>{`Mine download ${name}`}</button>
                <button onClick={actions.preview}>{`Mine preview ${name}`}</button>
                {actions.replace && <button onClick={actions.replace}>{`Mine replace ${name}`}</button>}
                {actions.cancelReplace && <button onClick={actions.cancelReplace}>{`Mine stop ${name}`}</button>}
                {actions.delete && <button onClick={actions.delete}>{`Mine delete ${name}`}</button>}
            </div>
        );
    };
    const stored = () => fakeAdapter({files: [aStoredFile({originalFileName: "a.png", typeKey: "png"})]});

    test("it replaces the row, and download and preview work @ATT-250", async () => {
        const browser = stubDownloads();
        const adapter = stored();
        const {user} = await renderManager({adapter, renderItem: row});
        await screen.findByTestId("my-a.png");
        expect(screen.queryByRole("button", {name: named.download("a.png")})).not.toBeInTheDocument();

        await press(user, "Mine download a.png");
        await browser.saved(1);
        expect(browser.saves[0].name).toBe("a.png");

        await press(user, "Mine preview a.png");
        expect(await screen.findByRole("dialog", {name: named.previewOf("a.png")})).toBeInTheDocument();
    });

    test("replace and delete exist only with canReplace and canDelete @ATT-250", async () => {
        await renderManager({adapter: stored(), renderItem: row});
        await screen.findByTestId("my-a.png");
        expect(screen.queryByRole("button", {name: "Mine replace a.png"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Mine delete a.png"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Mine stop a.png"})).not.toBeInTheDocument();
    });

    test("delete includes the confirmation: Cancel sends nothing, Delete sends it @ATT-250", async () => {
        const adapter = stored();
        const {user} = await renderManager({canDelete: true, adapter, renderItem: row});

        await press(user, "Mine delete a.png");
        let dialog = await screen.findByRole("dialog");
        expect(adapter.delete).not.toHaveBeenCalled();
        await user.click(within(dialog).getByRole("button", {name: "Cancel"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(adapter.delete).not.toHaveBeenCalled();

        await press(user, "Mine delete a.png");
        dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", {name: "Delete"}));

        await expectToasts("File deleted");
        expect(adapter.delete).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.queryByTestId("my-a.png")).not.toBeInTheDocument());
    });

    test("replace opens the choice of one file and sends it; cancelReplace exists while it runs and stops it @ATT-250", async () => {
        const adapter = stored();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canReplace: true, adapter, renderItem: row});
        await screen.findByTestId("my-a.png");
        const opened = vi.fn();
        screen.getByTestId("attachment-replace-input").addEventListener("click", opened);

        await press(user, "Mine replace a.png");
        expect(opened).toHaveBeenCalledTimes(1);

        await pickReplacement(aFile("new.png", 1));
        const held = await gate.held("new.png");
        await press(user, "Mine stop a.png");

        expect(held.signal?.aborted).toBe(true);
        await waitFor(() => expect(screen.queryByRole("button", {name: "Mine stop a.png"})).not.toBeInTheDocument());
        expect(screen.getByTestId("my-a.png")).toBeInTheDocument();
    });
});

describe("renderEmpty @area:attachments", () => {
    test("it replaces the empty state @ATT-250", async () => {
        await renderManager({renderEmpty: () => <p>Nothing here, mine</p>});
        expect(await screen.findByText("Nothing here, mine")).toBeInTheDocument();
        expect(screen.queryByText("No files yet.")).not.toBeInTheDocument();
    });

    test("with files it doesn't show @ATT-250", async () => {
        await renderManager({
            adapter: fakeAdapter({files: [aStoredFile({originalFileName: "a.pdf"})]}),
            renderEmpty: () => <p>Nothing here, mine</p>,
        });
        await screen.findByText("a.pdf");
        expect(screen.queryByText("Nothing here, mine")).not.toBeInTheDocument();
    });
});

describe("renderPreview @area:attachments", () => {
    const content = (preview: AttachmentPreviewState) => (
        <div>
            <span>{`${preview.name} ${preview.sizeBytes} ${preview.kind} ${preview.status}`}</span>
            {preview.url && <span>{`at ${preview.url}`}</span>}
            {preview.text !== null && <span>{`says ${preview.text}${preview.textCut ? " (cut)" : ""}`}</span>}
            <button onClick={preview.download}>Mine download</button>
            <button onClick={preview.reportFailed}>Mine failed</button>
        </div>
    );

    test("it replaces the content only: the dialog's name stays and the default content goes @ATT-250", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "letter.docx", typeKey: "docx", sizeBytes: 77})]});
        const {user} = await renderManager({adapter, renderPreview: content});

        const dialog = await openPreview(user, "letter.docx");

        expect(within(dialog).getByText("letter.docx 77 none ready")).toBeInTheDocument();
        expect(within(dialog).queryByText("No preview is available for this type of file. You can download it.")).not.toBeInTheDocument();
    });

    test("it receives the loading and the ready states, with the URL @ATT-250", async () => {
        stubObjectUrls();
        const answer = deferred<Blob>();
        const adapter = fakeAdapter({
            files: [aStoredFile({originalFileName: "a.png", typeKey: "png", sizeBytes: 5})],
            download: () => answer.promise,
        });
        const {user} = await renderManager({adapter, renderPreview: content});

        const dialog = await openPreview(user, "a.png");

        expect(await within(dialog).findByText("a.png 5 image loading")).toBeInTheDocument();
        await act(async () => answer.resolve(new Blob(["x"])));
        expect(await within(dialog).findByText("a.png 5 image ready")).toBeInTheDocument();
        expect(within(dialog).getByText("at blob:test/1")).toBeInTheDocument();
    });

    test("it receives a text file's text @ATT-250", async () => {
        const adapter = fakeAdapter({
            files: [aStoredFile({originalFileName: "a.txt", typeKey: "txt", sizeBytes: 5})],
            download: async () => new Blob(["hello"]),
        });
        const {user} = await renderManager({adapter, renderPreview: content});

        const dialog = await openPreview(user, "a.txt");

        expect(await within(dialog).findByText("says hello")).toBeInTheDocument();
    });

    test("download and reportFailed work @ATT-250", async () => {
        const browser = stubDownloads();
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "a.png", typeKey: "png", sizeBytes: 5})]});
        const {user} = await renderManager({adapter, renderPreview: content});
        const dialog = await openPreview(user, "a.png");
        await within(dialog).findByText("a.png 5 image ready");

        await user.click(within(dialog).getByRole("button", {name: "Mine download"}));
        await browser.saved(1);
        expect(browser.saves[0].name).toBe("a.png");

        await user.click(within(dialog).getByRole("button", {name: "Mine failed"}));
        expect(await within(dialog).findByText("a.png 5 image failed")).toBeInTheDocument();
    });

    test("the dialog still closes by Esc, and focus returns to its button @ATT-250", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "letter.docx", typeKey: "docx"})]});
        const {user} = await renderManager({adapter, renderPreview: content});
        await openPreview(user, "letter.docx");

        await user.keyboard("{Escape}");

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await waitFor(() => expect(screen.getByRole("button", {name: named.preview("letter.docx")})).toHaveFocus());
    });
});

describe("the pieces composed by hand @area:attachments", () => {
    const Composed = ({adapter}: { adapter: ReturnType<typeof fakeAdapter> }) => {
        const files = useAttachments({adapter});
        return (
            <>
                <AttachmentPicker files={files} canUpload/>
                <AttachmentList files={files} canDelete/>
                <AttachmentPreview files={files}/>
            </>
        );
    };

    test("the picker, the list and one preview work on one hook, with no manager @ATT-250", async () => {
        stubObjectUrls();
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "stored.png", typeKey: "png"})]});
        const {user} = await renderWithProviders(<Composed adapter={adapter}/>);

        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await press(user, "Upload");
        await screen.findByRole("button", {name: named.delete("a.png")});

        await openPreview(user, "stored.png");
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });
});
