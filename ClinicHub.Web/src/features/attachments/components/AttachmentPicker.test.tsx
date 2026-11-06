import {screen, waitFor} from "@testing-library/react";
import {describe, expect, test} from "vitest";
import {renderWithProviders} from "../../../test";
import {
    aFile, apiRefusal, aStoredFile, expectSelected, fakeAdapter, type FakeAdapter, pastPendingWork, pickFiles, press, renderManager,
} from "../../../test/pages/attachments.tsx";
import type {UseAttachmentsOptions} from "../types.ts";
import {useAttachments} from "../useAttachments.ts";
import {AttachmentPicker} from "./AttachmentPicker.tsx";

// The picker with no list beside it: contract § 2 "The picker alone".

const LIST_FAILED = "Couldn't load the files.";

const PickerAlone = ({showListState, ...options}: UseAttachmentsOptions & { showListState?: boolean }) => {
    const files = useAttachments(options);
    return <AttachmentPicker files={files} canUpload canReplace={options.canReplace} showListState={showListState}/>;
};

const failedList = () => fakeAdapter({
    files: [aStoredFile({originalFileName: "stored.pdf"})],
    list: () => Promise.reject(apiRefusal(500, "unexpected")),
});

const answersNow = (adapter: FakeAdapter) => adapter.list.mockImplementation(async () => [...adapter.files]);

const upload = () => screen.getByRole("button", {name: "Upload"});

describe("the picker alone, the list failed @area:attachments", () => {
    test.each([
        ["one file replaced by Upload", {multiple: false, canReplace: true}],
        ["maxFiles", {maxFiles: 3}],
    ])("%s: Upload is held, so it shows the error and a Retry that turns Upload on @ATT-284", async (_what, options) => {
        const adapter = failedList();
        const {user} = await renderWithProviders(<PickerAlone adapter={adapter} {...options}/>);

        const message = await screen.findByText(LIST_FAILED);
        expect(message.closest('[role="alert"]')).not.toBeNull();
        await pickFiles(aFile("new.png", 1));
        await expectSelected("new.png");
        expect(upload()).toBeDisabled();

        answersNow(adapter);
        await press(user, "Retry");

        await waitFor(() => expect(upload()).toBeEnabled());
        expect(screen.queryByText(LIST_FAILED)).not.toBeInTheDocument();
    });

    test("in Arabic @ATT-284", async () => {
        await renderWithProviders(<PickerAlone adapter={failedList()} maxFiles={3}/>, {lang: "ar"});
        expect(await screen.findByText("تعذّر تحميل الملفات.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "إعادة المحاولة"})).toBeInTheDocument();
    });

    test("showListState false: it shows neither @ATT-284", async () => {
        const adapter = failedList();
        await renderWithProviders(<PickerAlone adapter={adapter} maxFiles={3} showListState={false}/>);
        await waitFor(() => expect(adapter.list).toHaveBeenCalled());
        await pastPendingWork();

        expect(screen.queryByText(LIST_FAILED)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Retry"})).not.toBeInTheDocument();
    });

    test("several files with no maxFiles: Upload isn't held, so it shows neither @ATT-284", async () => {
        const adapter = failedList();
        await renderWithProviders(<PickerAlone adapter={adapter}/>);
        await waitFor(() => expect(adapter.list).toHaveBeenCalled());
        await pastPendingWork();

        expect(screen.queryByText(LIST_FAILED)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Retry"})).not.toBeInTheDocument();
    });

    test("AttachmentManager shows them once, in its list @ATT-284", async () => {
        await renderManager({canUpload: true, maxFiles: 3, adapter: failedList()});

        await screen.findByText(LIST_FAILED);
        await pastPendingWork();

        expect(screen.getAllByText(LIST_FAILED)).toHaveLength(1);
        expect(screen.getAllByRole("button", {name: "Retry"})).toHaveLength(1);
    });
});
