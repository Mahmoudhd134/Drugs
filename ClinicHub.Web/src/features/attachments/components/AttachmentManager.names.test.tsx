import {screen, waitFor, within} from "@testing-library/react";
import {describe, expect, test} from "vitest";
import {expectToasts, findToast, hoverTooltip, isolate, leaveTooltip} from "../../../test";
import {
    aDataTransfer, aFile, announcements, apiRefusal, aStoredFile, closePreview, deleteConfirmed, dropFiles, expectAnnounced, expectSelected, expectStored,
    fakeAdapter, filesCanBePicked, findRefusal, named, openPreview, pastPendingWork, pickFiles, press, REASON, refusedLine, refuseUploadOf, renderManager,
    replaceWith, selectedRow, setPdfViewer, storedRow, stubDownloads, stubObjectUrls, watchAnnouncements,
} from "../../../test/pages/attachments.tsx";

// A file name is user data (design § 12), and every control says which file it acts on (design § 12 "Text and layout",
// contract § 2 "Screen structure and names").

const HTML_NAME = "<img src=x onerror=alert(1)><b>x<b>.txt";

const nothingRendered = () => {
    expect(document.querySelector("[onerror]")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
};

describe("a file name holding HTML @area:attachments", () => {
    test("a stored row, its confirmation and its preview show it as literal text @ATT-229", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: HTML_NAME, typeKey: "txt"})]});
        const {user} = await renderManager({canDelete: true, canReplace: true, adapter});
        await expectStored(HTML_NAME);
        expect(within(storedRow(HTML_NAME)).getByText(HTML_NAME)).toBeInTheDocument();
        nothingRendered();

        await press(user, named.delete(HTML_NAME));
        const confirmation = await screen.findByRole("dialog");
        expect(confirmation).toHaveTextContent(`Delete “${isolate(HTML_NAME)}”?`);
        nothingRendered();
        await user.click(within(confirmation).getByRole("button", {name: "Cancel"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        const preview = await openPreview(user, HTML_NAME);
        expect(preview).toHaveTextContent(HTML_NAME);
        nothingRendered();
    });

    test("a selected row shows it as literal text, and its failure and announcement too @ATT-229", async () => {
        const adapter = fakeAdapter();
        refuseUploadOf(adapter, HTML_NAME, apiRefusal(400, "attachmentEmpty"));
        const {user} = await renderManager({canUpload: true, adapter});

        await pickFiles(aFile(HTML_NAME, 10));
        await expectSelected(HTML_NAME);
        expect(within(selectedRow(HTML_NAME)).getByText(HTML_NAME)).toBeInTheDocument();
        nothingRendered();

        await press(user, "Upload");

        await expectAnnounced(`“${isolate(HTML_NAME)}” wasn't uploaded: ${REASON.empty}`);
        nothingRendered();
    });

    test("a refusal shows it as literal text @ATT-229", async () => {
        const name = "<img src=x onerror=alert(1)><b>x<b>.exe";
        await renderManager({canUpload: true});
        await pickFiles(aFile(name, 10));
        await findRefusal(refusedLine(name, REASON.typeNotAllowed));
        nothingRendered();
    });

    test("a refused row Replace's toast renders nothing of it @ATT-229", async () => {
        const name = "<img src=x onerror=alert(1)><b>x<b>.exe";
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "a.pdf"})]});
        const {user} = await renderManager({canReplace: true, adapter});
        await expectStored("a.pdf");

        await replaceWith(user, "a.pdf", aFile(name, 10));

        expect(await findToast()).toContain(REASON.typeNotAllowed);
        nothingRendered();
    });
});

describe("a name holding bidi control characters @area:attachments", () => {
    // U+202A to U+202E, U+2066 to U+2069, U+200E, U+200F, U+061C, each of which can reorder or disguise a name
    const CONTROLS = "‪‫‬‭‮⁦⁧⁨⁩‎‏؜";
    const RAW = `a${CONTROLS}b.png`;
    const SHOWN = "ab.png";

    test("a selected row shows it without them: its name, tooltip and every control's name @ATT-273", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile(RAW, 1));

        await expectSelected(SHOWN);
        const row = within(selectedRow(SHOWN));
        expect(row.getByText(SHOWN)).toBeInTheDocument();
        expect(row.getByRole("button", {name: named.preview(SHOWN)})).toBeInTheDocument();
        expect(row.getByRole("button", {name: named.remove(SHOWN)})).toBeInTheDocument();
        await expect(hoverTooltip(row.getByText(SHOWN))).resolves.toBe(SHOWN);
        await leaveTooltip(row.getByText(SHOWN));

        await press(user, "Upload");
        const held = await gate.held(RAW);
        expect(within(selectedRow(SHOWN)).getByRole("progressbar", {name: named.uploading(SHOWN)})).toBeInTheDocument();
        expect(within(selectedRow(SHOWN)).getByRole("button", {name: named.cancel(SHOWN)})).toBeInTheDocument();

        await held.fail(apiRefusal(400, "attachmentTypeNotAllowed"));
        expect(await within(selectedRow(SHOWN)).findByRole("button", {name: named.retry(SHOWN)})).toBeInTheDocument();
        await expectAnnounced(`“${isolate(SHOWN)}” wasn't uploaded: ${REASON.typeNotAllowed}`);
    });

    test("what's sent keeps the original name, and the finish is announced without them @ATT-273", async () => {
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile(RAW, 1));
        await expectSelected(SHOWN);

        await press(user, "Upload");

        await expectAnnounced(`“${isolate(SHOWN)}” was uploaded.`);
        expect(adapter.upload.mock.calls[0][0].name).toBe(RAW);
    });

    test("every refusal's message shows it without them @ATT-273", async () => {
        const raw = `z${CONTROLS}.exe`;
        await renderManager({canUpload: true});
        await pickFiles(aFile(raw, 1));
        await findRefusal(refusedLine("z.exe", REASON.typeNotAllowed));
    });

    test("a refusal in Arabic shows it without them @ATT-273", async () => {
        await renderManager({canUpload: true}, {lang: "ar"});
        await pickFiles(aFile(`z${CONTROLS}.exe`, 1));
        await findRefusal(`«${isolate("z.exe")}»: نوع هذا الملف غير مسموح به.`);
    });

    test("too many, and only one, show it without them @ATT-273", async () => {
        const many = await renderManager({canUpload: true, maxFiles: 1});
        await pickFiles(aFile("first.png", 1), aFile(RAW, 1));
        await findRefusal(`“${isolate(SHOWN)}” wasn't added. Most files allowed: 1.`);
        many.unmount();

        await renderManager({canUpload: true, multiple: false});
        await filesCanBePicked();
        dropFiles(aDataTransfer({files: [aFile("first.png", 1), aFile(RAW, 1)]}));
        await findRefusal(`“${isolate(SHOWN)}”: only one file can be chosen.`);
    });

    test("a dropped folder's name shows without them @ATT-273", async () => {
        await renderManager({canUpload: true});
        await filesCanBePicked();
        dropFiles(aDataTransfer({folders: [`sc${CONTROLS}ans`]}));
        await findRefusal(`“${isolate("scans")}”: a folder can't be uploaded.`);
    });

    test("a stored row shows it without them: its name, tooltip, controls and confirmation @ATT-273", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: RAW, typeKey: "png"})]});
        const {user} = await renderManager({canReplace: true, canDelete: true, adapter});

        await expectStored(SHOWN);
        const row = within(storedRow(SHOWN));
        await expect(hoverTooltip(row.getByText(SHOWN))).resolves.toBe(SHOWN);
        await leaveTooltip(row.getByText(SHOWN));
        for (const name of [named.preview(SHOWN), named.download(SHOWN), named.replace(SHOWN), named.delete(SHOWN)])
            expect(row.getByRole("button", {name})).toBeInTheDocument();

        await press(user, named.delete(SHOWN));
        expect(await screen.findByRole("dialog")).toHaveTextContent(`Delete “${isolate(SHOWN)}”?`);
    });

    test("a row's Replace: a refusal's toast shows the new file's name without them, and what's sent keeps it @ATT-273", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "a.pdf"})]});
        const {user} = await renderManager({canReplace: true, adapter});
        await expectStored("a.pdf");

        await replaceWith(user, "a.pdf", aFile(`z${CONTROLS}.exe`, 1));
        expect(await findToast()).toBe(refusedLine("z.exe", REASON.typeNotAllowed));

        await replaceWith(user, "a.pdf", aFile(RAW, 1));
        await expectStored(SHOWN);
        expect(adapter.replace.mock.calls[0][1].name).toBe(RAW);
    });

    test("a stored file's preview shows it without them, and its Download keeps the original name @ATT-273", async () => {
        const browser = stubDownloads();
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: RAW, typeKey: "png"})]});
        const {user} = await renderManager({adapter});

        const dialog = await openPreview(user, SHOWN);
        expect(await within(dialog).findByRole("img", {name: named.previewOf(SHOWN)})).toBeInTheDocument();

        await user.click(within(dialog).getByRole("button", {name: "Download"}));
        await browser.saved(1);
        expect(browser.saves[0].name).toBe(RAW);
    });

    test("no viewer: the name shows without them, and a PDF's iframe title too @ATT-273", async () => {
        setPdfViewer(true);
        stubObjectUrls();
        const raw = `a${CONTROLS}b`;
        const adapter = fakeAdapter({files: [
            aStoredFile({originalFileName: `${raw}.docx`, typeKey: "docx"}),
            aStoredFile({originalFileName: `${raw}.pdf`, typeKey: "pdf"}),
        ]});
        const {user} = await renderManager({adapter});

        const noViewer = await openPreview(user, "ab.docx");
        expect(within(noViewer).getByText("ab.docx")).toBeInTheDocument();
        await closePreview(user, noViewer);

        const pdf = await openPreview(user, "ab.pdf");
        await waitFor(() => expect(pdf.querySelector("iframe")).toHaveAttribute("title", named.previewOf("ab.pdf")));
    });

    test("a row's Download, and Download all, keep the original name @ATT-273", async () => {
        const browser = stubDownloads();
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: RAW, typeKey: "png"})]});
        const {user} = await renderManager({adapter});

        await press(user, named.download(SHOWN));
        await browser.saved(1);
        await press(user, "Download all");
        await browser.saved(2);

        expect(browser.saves.map(save => save.name)).toEqual([RAW, RAW]);
    });

    test("a selected file's preview shows it without them, and its Download keeps the original name @ATT-273", async () => {
        const browser = stubDownloads();
        const {user} = await renderManager({canUpload: true});
        await pickFiles(aFile(RAW, 1, "image/png"));

        const dialog = await openPreview(user, SHOWN);
        await user.click(within(dialog).getByRole("button", {name: "Download"}));

        await waitFor(() => expect(browser.saves).toHaveLength(1));
        expect(browser.saves[0].name).toBe(RAW);
    });
});

describe("every control says which file @area:attachments", () => {
    test("a selected row: Preview and Remove; uploading, its progress bar and Cancel; failed, Retry @ATT-243", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("a.png", "b.png");

        const a = within(selectedRow("a.png"));
        expect(a.getByRole("button", {name: named.preview("a.png")})).toBeInTheDocument();
        expect(a.getByRole("button", {name: named.remove("a.png")})).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Upload"}));
        const held = await gate.held("a.png");
        held.progress(50);

        await waitFor(() => expect(within(selectedRow("a.png")).getByRole("progressbar", {name: named.uploading("a.png")})).toHaveAttribute("aria-valuenow", "50"));
        expect(within(selectedRow("a.png")).getByRole("button", {name: named.cancel("a.png")})).toBeInTheDocument();

        await held.fail(apiRefusal(400, "attachmentEmpty"));

        expect(await within(selectedRow("a.png")).findByRole("button", {name: named.retry("a.png")})).toBeInTheDocument();
    });

    test("a stored row: Preview, Download, Replace and Delete @ATT-243", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "a.pdf"})]});
        await renderManager({canReplace: true, canDelete: true, adapter});
        await expectStored("a.pdf");

        const row = within(storedRow("a.pdf"));
        expect(row.getByRole("button", {name: named.preview("a.pdf")})).toBeInTheDocument();
        expect(row.getByRole("button", {name: named.download("a.pdf")})).toBeInTheDocument();
        expect(row.getByRole("button", {name: named.replace("a.pdf")})).toBeInTheDocument();
        expect(row.getByRole("button", {name: named.delete("a.pdf")})).toBeInTheDocument();
    });

    test("in Arabic @ATT-243", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "a.pdf"})]});
        await renderManager({canUpload: true, canReplace: true, canDelete: true, adapter}, {lang: "ar"});
        const name = isolate("a.pdf");
        for (const label of [`معاينة «${name}»`, `تنزيل «${name}»`, `استبدال «${name}»`, `حذف «${name}»`])
            expect(await screen.findByRole("button", {name: label})).toBeInTheDocument();

        await pickFiles(aFile("b.png", 1));
        const selected = isolate("b.png");
        expect(await screen.findByRole("button", {name: `إزالة «${selected}»`})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: `معاينة «${selected}»`})).toBeInTheDocument();
    });

    test("an icon button has a tooltip with its name @ATT-243", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "a.pdf"})]});
        await renderManager({canDelete: true, adapter});
        await expectStored("a.pdf");

        for (const name of [named.preview("a.pdf"), named.download("a.pdf"), named.delete("a.pdf")]) {
            const button = screen.getByRole("button", {name});
            await expect(hoverTooltip(button)).resolves.toBe(name);
            await leaveTooltip(button);
        }
    });

    test("a name has a tooltip with the whole name @ATT-243", async () => {
        const name = `${"a very long name ".repeat(12)}.pdf`.replace(/ +/g, " ");
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: name})]});
        await renderManager({adapter});
        await expectStored(name);

        await expect(hoverTooltip(within(storedRow(name)).getByText(name))).resolves.toBe(name);
    });
});

describe("what's announced @area:attachments", () => {
    test("finishing, in a polite live region and not as a toast @ATT-243", async () => {
        const {user} = await renderManager({canUpload: true});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");

        await press(user, "Upload");

        await expectAnnounced(`“${isolate("a.png")}” was uploaded.`);
        await expectToasts();
    });

    test("failing, with the translated reason @ATT-243", async () => {
        const adapter = fakeAdapter();
        refuseUploadOf(adapter, "a.png", apiRefusal(400, "attachmentTypeNotAllowed"));
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");

        await press(user, "Upload");

        await expectAnnounced(`“${isolate("a.png")}” wasn't uploaded: ${REASON.typeNotAllowed}`);
    });

    test("in Arabic @ATT-243", async () => {
        const adapter = fakeAdapter();
        refuseUploadOf(adapter, "b.png", apiRefusal(400, "attachmentTypeNotAllowed"));
        const {user} = await renderManager({canUpload: true, adapter}, {lang: "ar"});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await screen.findByRole("list", {name: "الملفات المختارة"});

        await press(user, "رفع");

        await expectAnnounced(`لم يُرفع «${isolate("b.png")}»: نوع هذا الملف غير مسموح به.`);
    });

    test("in Arabic, a finished upload @ATT-243", async () => {
        const {user} = await renderManager({canUpload: true}, {lang: "ar"});
        await pickFiles(aFile("a.png", 1));
        await screen.findByRole("list", {name: "الملفات المختارة"});

        await press(user, "رفع");

        await expectAnnounced(`تم رفع «${isolate("a.png")}».`);
    });

    test("a cancel announces no failure @ATT-243", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await press(user, "Upload");
        await gate.held("a.png");

        await press(user, named.cancel("a.png"));

        await waitFor(() => expect(screen.queryByRole("button", {name: named.cancel("a.png")})).not.toBeInTheDocument());
        expect(announcements().join()).not.toContain("wasn't uploaded");
    });

    /** The sentence came again, and the region's text changed between the two: only then does a screen reader speak. */
    const announcedAgain = async (texts: string[], sentence: string) => {
        await waitFor(() => expect(texts[texts.length - 1]).toBe(sentence));
        expect(texts.length).toBeGreaterThanOrEqual(2);
        expect(texts[texts.length - 2]).not.toBe(sentence);
    };

    test("a Retry failing with the same reason is announced again @ATT-243", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        const sentence = `“${isolate("a.png")}” wasn't uploaded: ${REASON.typeNotAllowed}`;

        await press(user, "Upload");
        await (await gate.held("a.png")).fail(apiRefusal(400, "attachmentTypeNotAllowed"));
        await expectAnnounced(sentence);
        const texts = watchAnnouncements();

        await press(user, named.retry("a.png"));
        const again = await gate.held("a.png");
        await pastPendingWork();
        await again.fail(apiRefusal(400, "attachmentTypeNotAllowed"));

        await announcedAgain(texts, sentence);
    });

    test("a same-named file uploaded twice is announced again @ATT-243", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {user} = await renderManager({canUpload: true, canDelete: true, adapter});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        const sentence = `“${isolate("a.png")}” was uploaded.`;

        await press(user, "Upload");
        await (await gate.held("a.png")).finish();
        await expectAnnounced(sentence);
        await expectStored("a.png");
        await deleteConfirmed(user, "a.png");
        await expectStored();
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        const texts = watchAnnouncements();

        await press(user, "Upload");
        const again = await gate.held("a.png");
        await pastPendingWork();
        await again.finish();

        await announcedAgain(texts, sentence);
    });
});
