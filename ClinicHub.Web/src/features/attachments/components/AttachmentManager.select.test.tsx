import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import {describe, expect, test, vi} from "vitest";
import {expectOwnDirection, isolate} from "../../../test";
import {installIntersectionObserver} from "../../../test/intersection.ts";
import {
    aDataTransfer, aFile, ALL_RULES, apiRefusal, aStoredFile, deferred, dropFiles, expectSelected, expectStored, fakeAdapter,
    filesCanBePicked, findRefusal, named, pastPendingWork, pickFiles, press, REASON, refusedLine, renderManager, selectedRow,
    selectedRows, stubObjectUrls,
} from "../../../test/pages/attachments.tsx";

// Selecting files: design § 12 "Upload", "Rules on the client"; contract § 2 "Selecting and uploading"; business.md
// «يختار المستخدم ملفًا أو أكثر».

const onlyPng = {maxFileSizeBytes: 1000, extensions: [".png"]};

describe("what the picker allows @area:attachments", () => {
    test("its accept holds exactly the rules' extensions, whatever they are @ATT-200", async () => {
        await renderManager({canUpload: true, adapter: fakeAdapter({rules: {maxFileSizeBytes: 1000, extensions: [".png", ".pdf"]}})});
        await waitFor(() => expect(screen.getByTestId("attachment-input")).toHaveAttribute("accept", ".png,.pdf"));
    });

    test("with the global rules, all of them and none else @ATT-200", async () => {
        await renderManager({canUpload: true});
        await waitFor(() => expect(screen.getByTestId("attachment-input")).toHaveAttribute("accept", ALL_RULES.extensions.join(",")));
    });
});

describe("the files selected @area:attachments", () => {
    test("each shows its name and size, and an image a local preview of the File itself, with no request @ATT-201", async () => {
        const urls = stubObjectUrls();
        const adapter = fakeAdapter();
        await renderManager({canUpload: true, adapter});
        const image = aFile("scan.png", 2048, "image/png");

        await pickFiles(image, aFile("notes.txt", 500));

        await expectSelected("scan.png", "notes.txt");
        expect(selectedRow("scan.png")).toHaveTextContent("2 KB");
        expect(selectedRow("notes.txt")).toHaveTextContent("500 B");
        await waitFor(() => expect(selectedRow("scan.png").querySelector("img")).toHaveAttribute("src", "blob:test/1"));
        expect(selectedRow("scan.png").querySelector("img")).toHaveAttribute("alt", "");
        expect(urls.created).toHaveLength(1);
        expect(urls.created[0]).toBe(image);
        expect(selectedRow("notes.txt").querySelector("img")).toBeNull();
        expect(adapter.upload).not.toHaveBeenCalled();
        expect(adapter.download).not.toHaveBeenCalled();
    });

    test("a size in Arabic reads in its units, in Latin digits @ATT-201", async () => {
        await renderManager({canUpload: true}, {lang: "ar"});
        await pickFiles(aFile("scan.png", 2048));
        await waitFor(() => expect(screen.getByRole("list", {name: "الملفات المختارة"})).toHaveTextContent("2 كيلوبايت"));
    });

    test("one removed and another added: the selection holds exactly those @ATT-202", async () => {
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter});

        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await expectSelected("a.png", "b.png");
        await press(user, named.remove("b.png"));
        await expectSelected("a.png");
        await pickFiles(aFile("c.png", 1));

        await expectSelected("a.png", "c.png");
        expect(adapter.upload).not.toHaveBeenCalled();
    });

    test("the same file picked twice is listed once: in one pick, or in two @ATT-203", async () => {
        await renderManager({canUpload: true});
        await pickFiles(aFile("a.png", 5), aFile("a.png", 5), aFile("b.png", 5));
        await expectSelected("a.png", "b.png");

        await pickFiles(aFile("a.png", 5));
        await pastPendingWork();

        await expectSelected("a.png", "b.png");
    });

    test("the same name with another size or date is another file @ATT-203", async () => {
        await renderManager({canUpload: true});
        await pickFiles(aFile("a.png", 5), aFile("a.png", 6), new File(["12345"], "a.png", {lastModified: 1}));
        await waitFor(() => expect(selectedRows()).toHaveLength(3));
    });

    test("a file removed can be picked again: the very same File too, as a browser's dialog does @ATT-217", async () => {
        const {user} = await renderManager({canUpload: true});
        const file = aFile("a.png", 5);

        await pickFiles(file);
        await expectSelected("a.png");
        await press(user, named.remove("a.png"));
        await expectSelected();
        await pickFiles(file);

        await expectSelected("a.png");
    });

    test("500 files selected: their previews load only as they enter the view, and no request @ATT-237", async () => {
        const urls = stubObjectUrls();
        const view = installIntersectionObserver();
        const adapter = fakeAdapter();
        await renderManager({canUpload: true, adapter});
        const files = Array.from({length: 500}, (_, index) => aFile(`scan-${index}.png`, 1, "image/png"));

        await pickFiles(...files);

        await waitFor(() => expect(selectedRows()).toHaveLength(500));
        expect(urls.created).toEqual([]);
        expect(view.observed().length).toBeGreaterThan(0);

        const [first, second] = view.observed();
        view.enter(first, false);
        expect(urls.created).toEqual([]);
        view.enter(first);
        await waitFor(() => expect(urls.created).toHaveLength(1));
        view.enter(second);
        await waitFor(() => expect(urls.created).toHaveLength(2));

        expect(adapter.upload).not.toHaveBeenCalled();
        expect(adapter.download).not.toHaveBeenCalled();
    });

    test("a name with a bidi override shows without it, in its own direction, and doesn't reorder its row @ATT-244", async () => {
        const shown = "reportfdp.png";
        await renderManager({canUpload: true});

        await pickFiles(aFile("report\u202Efdp.png", 1024));

        await expectSelected(shown);
        const row = selectedRow(shown);
        // On its own element with its own direction, the size and the buttons outside it
        expectOwnDirection(row, shown);
        expect(within(row).getByText(shown)).not.toHaveTextContent("1 KB");
        expect(row).toHaveTextContent("1 KB");
        // In the buttons' names it sits inside the isolates
        expect(within(row).getByRole("button", {name: named.remove(shown)})).toBeInTheDocument();
    });

    test("a refused name with a bidi override shows without it, isolated in its message @ATT-244", async () => {
        await renderManager({canUpload: true});
        await pickFiles(aFile("report\u202Eexe.gnp", 10));
        await findRefusal(refusedLine("reportexe.gnp", REASON.typeNotAllowed));
    });

    test("a selected image the browser can't decode: the file icon takes the broken image's place, in that row only @ATT-283", async () => {
        stubObjectUrls();
        await renderManager({canUpload: true});
        await pickFiles(aFile("fake.png", 1), aFile("real.png", 1, "image/png"));
        await expectSelected("fake.png", "real.png");
        const place = (name: string) => selectedRow(name).firstElementChild!;
        await waitFor(() => expect(place("fake.png").querySelector("img")).not.toBeNull());

        fireEvent.error(place("fake.png").querySelector("img")!);

        await waitFor(() => expect(place("fake.png").querySelector("img")).toBeNull());
        expect(place("fake.png").querySelector("svg")).not.toBeNull();
        expect(selectedRow("fake.png")).toHaveTextContent("fake.png");
        expect(place("real.png").querySelector("img")).not.toBeNull();
        expect(place("real.png").querySelector("svg")).toBeNull();
    });

    test("a selected file with no thumbnail: a file icon holds its place, before the name @ATT-277", async () => {
        stubObjectUrls();
        await renderManager({canUpload: true});

        await pickFiles(aFile("notes.txt", 1), aFile("scan.png", 1, "image/png"));
        await expectSelected("notes.txt", "scan.png");

        const place = (name: string) => selectedRow(name).firstElementChild!;
        expect(place("notes.txt").querySelector("svg")).not.toBeNull();
        expect(place("notes.txt")).not.toHaveTextContent("notes.txt");
        await waitFor(() => expect(place("scan.png").querySelector("img")).not.toBeNull());
        expect(place("scan.png").querySelector("svg")).toBeNull();
    });
});

describe("a file the client refuses @area:attachments", () => {
    test("a wrong type: an instant translated message, not selected, no request @ATT-204", async () => {
        const adapter = fakeAdapter({rules: onlyPng});
        await renderManager({canUpload: true, adapter});

        await pickFiles(aFile("virus.exe", 10));

        await findRefusal(refusedLine("virus.exe", REASON.typeNotAllowed));
        await expectSelected();
        expect(adapter.upload).not.toHaveBeenCalled();
    });

    test("over the limit by one byte: refused; exactly at it: selected @ATT-204", async () => {
        const adapter = fakeAdapter({rules: onlyPng});
        await renderManager({canUpload: true, adapter});

        await pickFiles(aFile("big.png", 1001), aFile("fits.png", 1000));

        await findRefusal(refusedLine("big.png", REASON.tooLarge));
        await expectSelected("fits.png");
        expect(adapter.upload).not.toHaveBeenCalled();
    });

    test("in Arabic, in the business file's words @ATT-204", async () => {
        await renderManager({canUpload: true, adapter: fakeAdapter({rules: onlyPng})}, {lang: "ar"});
        await pickFiles(aFile("virus.exe", 10), aFile("big.png", 1001));
        await findRefusal(`«${isolate("virus.exe")}»: نوع هذا الملف غير مسموح به.`);
        await findRefusal(`«${isolate("big.png")}»: حجم هذا الملف أكبر من المسموح به.`);
    });

    test("each refusal on its own line; the next pick clears them @ATT-204", async () => {
        await renderManager({canUpload: true, adapter: fakeAdapter({rules: onlyPng})});
        await pickFiles(aFile("one.exe", 10), aFile("two.exe", 10));
        await findRefusal(refusedLine("one.exe", REASON.typeNotAllowed));
        await findRefusal(refusedLine("two.exe", REASON.typeNotAllowed));

        await pickFiles(aFile("good.png", 10));

        await expectSelected("good.png");
        expect(screen.queryByText(refusedLine("one.exe", REASON.typeNotAllowed))).not.toBeInTheDocument();
        expect(screen.queryByText(refusedLine("two.exe", REASON.typeNotAllowed))).not.toBeInTheDocument();
    });

    test("a zero-byte file: the empty message, not selected, no request @ATT-213", async () => {
        const adapter = fakeAdapter();
        await renderManager({canUpload: true, adapter});

        await pickFiles(aFile("empty.txt", 0));

        await findRefusal(refusedLine("empty.txt", REASON.empty));
        await expectSelected();
        expect(adapter.upload).not.toHaveBeenCalled();
    });

    test("a zero-byte file in Arabic @ATT-213", async () => {
        await renderManager({canUpload: true}, {lang: "ar"});
        await pickFiles(aFile("empty.txt", 0));
        await findRefusal(`«${isolate("empty.txt")}»: هذا الملف فارغ.`);
    });
});

describe("a refusal showing @area:attachments", () => {
    const refused = refusedLine("virus.exe", REASON.typeNotAllowed);

    test("Upload clears it @ATT-275", async () => {
        const {user} = await renderManager({canUpload: true, adapter: fakeAdapter({rules: onlyPng})});
        await pickFiles(aFile("good.png", 1), aFile("virus.exe", 1));
        await findRefusal(refused);

        await press(user, "Upload");

        await expectStored("good.png");
        await waitFor(() => expect(screen.queryByText(refused)).not.toBeInTheDocument());
    });

    test("Remove clears it @ATT-275", async () => {
        const {user} = await renderManager({canUpload: true, adapter: fakeAdapter({rules: onlyPng})});
        await pickFiles(aFile("good.png", 1), aFile("virus.exe", 1));
        await findRefusal(refused);

        await press(user, named.remove("good.png"));

        await expectSelected();
        await waitFor(() => expect(screen.queryByText(refused)).not.toBeInTheDocument());
    });
});

describe("one file, or at most some @area:attachments", () => {
    test("multiple={false}: a second pick replaces the first, and the control says one file @ATT-209", async () => {
        await renderManager({canUpload: true, multiple: false});
        await filesCanBePicked();
        expect(screen.getByRole("button", {name: "Choose a file"})).toBeInTheDocument();
        expect(screen.getByText("or drop it here")).toBeInTheDocument();
        expect(screen.getByTestId("attachment-input")).not.toHaveAttribute("multiple");

        await pickFiles(aFile("first.png", 1));
        await expectSelected("first.png");
        await pickFiles(aFile("second.png", 1));

        await expectSelected("second.png");
    });

    test("by default several files can be picked, and the control says so @ATT-209", async () => {
        await renderManager({canUpload: true});
        await filesCanBePicked();
        expect(screen.getByRole("button", {name: "Choose files"})).toBeInTheDocument();
        expect(screen.getByText("or drop them here")).toBeInTheDocument();
        expect(screen.getByTestId("attachment-input")).toHaveAttribute("multiple");
    });

    test("multiple={false}: several dropped, the first is kept and the rest are refused @ATT-209", async () => {
        await renderManager({canUpload: true, multiple: false});
        await filesCanBePicked();

        dropFiles(aDataTransfer({files: [aFile("a.png", 1), aFile("b.png", 1), aFile("c.png", 1)]}));

        await expectSelected("a.png");
        await findRefusal(`“${isolate("b.png")}”: only one file can be chosen.`);
        await findRefusal(`“${isolate("c.png")}”: only one file can be chosen.`);
    });

    test("maxFiles: the picks over it are refused with a message naming the limit @ATT-209", async () => {
        const adapter = fakeAdapter();
        await renderManager({canUpload: true, adapter, maxFiles: 2});

        await pickFiles(aFile("a.png", 1), aFile("b.png", 1), aFile("c.png", 1));

        await expectSelected("a.png", "b.png");
        await findRefusal(`“${isolate("c.png")}” wasn't added. Most files allowed: 2.`);
        expect(adapter.upload).not.toHaveBeenCalled();
    });

    test("maxFiles in Arabic @ATT-209", async () => {
        await renderManager({canUpload: true, maxFiles: 1}, {lang: "ar"});
        await pickFiles(aFile("a.png", 1), aFile("b.png", 1));
        await findRefusal(`لم يُضف «${isolate("b.png")}». الحد الأقصى لعدد الملفات: 1.`);
    });

    test("maxFiles counts stored + selected: exactly at it passes, one more is refused @ATT-209", async () => {
        await renderManager({canUpload: true, maxFiles: 2, adapter: fakeAdapter({files: [aStoredFile({originalFileName: "stored.pdf"})]})});
        await expectStored("stored.pdf");

        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await pickFiles(aFile("b.png", 1));

        await expectSelected("a.png");
        await findRefusal(`“${isolate("b.png")}” wasn't added. Most files allowed: 2.`);
    });

    test("maxFiles: a file removed frees its place; the same file again doesn't count twice @ATT-209", async () => {
        const {user} = await renderManager({canUpload: true, maxFiles: 1});
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");

        await pickFiles(aFile("a.png", 1));
        await pastPendingWork();
        await expectSelected("a.png");
        expect(screen.queryByText(/wasn't added/)).not.toBeInTheDocument();

        await press(user, named.remove("a.png"));
        await expectSelected();
        await pickFiles(aFile("b.png", 1));
        await expectSelected("b.png");
    });

    test("multiple={false} with maxFiles 1: the new pick takes the selected file's place, so it isn't refused @ATT-209", async () => {
        await renderManager({canUpload: true, multiple: false, maxFiles: 1});
        await pickFiles(aFile("first.png", 1));
        await expectSelected("first.png");
        await pickFiles(aFile("second.png", 1));
        await expectSelected("second.png");
        expect(screen.queryByText(/wasn't added/)).not.toBeInTheDocument();
    });

    test("multiple={false} without Replace: a stored file counts, so maxFiles 1 is full @ATT-209", async () => {
        await renderManager({canUpload: true, multiple: false, maxFiles: 1, adapter: fakeAdapter({files: [aStoredFile({originalFileName: "stored.pdf"})]})});
        await expectStored("stored.pdf");
        await pickFiles(aFile("a.png", 1));
        await findRefusal(`“${isolate("a.png")}” wasn't added. Most files allowed: 1.`);
        await expectSelected();
    });
});

describe("the keyboard @area:attachments", () => {
    test("the pick control is a real button, and a file can be picked and uploaded with keys only @ATT-212", async () => {
        const adapter = fakeAdapter();
        const {user} = await renderManager({canUpload: true, adapter});
        await filesCanBePicked();
        const pick = screen.getByRole("button", {name: "Choose files"});
        expect(pick.tagName).toBe("BUTTON");

        const opened = vi.fn();
        screen.getByTestId("attachment-input").addEventListener("click", opened);
        const tabTo = async (target: HTMLElement) => {
            for (let tabs = 0; tabs < 30 && document.activeElement !== target; tabs++) await user.tab();
            expect(target).toHaveFocus();
        };

        await tabTo(pick);
        await user.keyboard("{Enter}");
        expect(opened).toHaveBeenCalledTimes(1);
        await user.keyboard(" ");
        expect(opened).toHaveBeenCalledTimes(2);

        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
        await tabTo(screen.getByRole("button", {name: "Upload"}));
        await user.keyboard("{Enter}");

        await expectStored("a.png");
        expect(adapter.upload).toHaveBeenCalledTimes(1);
    });
});

describe("rules that fail to load @area:attachments", () => {
    test("an error and Retry show, picking is off, a drop is ignored and the list still works @ATT-216", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "stored.pdf"})]});
        adapter.rules.mockRejectedValue(apiRefusal(500, "unexpected"));
        await renderManager({canUpload: true, adapter});

        const alert = (await screen.findByText("Couldn't load what can be uploaded.")).closest<HTMLElement>('[role="alert"]');
        expect(alert).not.toBeNull();
        expect(within(alert!).getByRole("button", {name: "Retry"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Choose files"})).toBeDisabled();

        dropFiles(aDataTransfer({files: [aFile("a.png", 1)]}));
        await pastPendingWork();
        await expectSelected();

        await expectStored("stored.pdf");
        expect(screen.getByRole("button", {name: named.download("stored.pdf")})).toBeEnabled();
    });

    test("in Arabic @ATT-216", async () => {
        const adapter = fakeAdapter();
        adapter.rules.mockRejectedValue(apiRefusal(500, "unexpected"));
        await renderManager({canUpload: true, adapter}, {lang: "ar"});
        expect(await screen.findByText("تعذّر تحميل ما يمكن رفعه.")).toBeInTheDocument();
    });

    test("Retry loads them: the error leaves and picking is on again @ATT-216", async () => {
        const adapter = fakeAdapter();
        adapter.rules.mockRejectedValue(apiRefusal(500, "unexpected"));
        const {user} = await renderManager({canUpload: true, adapter});
        await screen.findByText("Couldn't load what can be uploaded.");

        adapter.rules.mockResolvedValue(ALL_RULES);
        await press(user, "Retry");

        await waitFor(() => expect(screen.getByRole("button", {name: "Choose files"})).toBeEnabled());
        expect(screen.queryByText("Couldn't load what can be uploaded.")).not.toBeInTheDocument();
        await pickFiles(aFile("a.png", 1));
        await expectSelected("a.png");
    });

    test("Retry answers late: focus goes to the Choose files button once it's enabled, since the alert and its button leave @ATT-274", async () => {
        const adapter = fakeAdapter();
        adapter.rules.mockRejectedValue(apiRefusal(500, "unexpected"));
        const {user} = await renderManager({canUpload: true, adapter});
        await screen.findByText("Couldn't load what can be uploaded.");

        const answer = deferred<typeof ALL_RULES>();
        adapter.rules.mockImplementation(() => answer.promise);
        await press(user, "Retry");
        // The alert leaves while it loads, and the button can't take the focus yet
        await pastPendingWork();
        await act(async () => answer.resolve(ALL_RULES));

        await waitFor(() => expect(screen.getByRole("button", {name: "Choose files"})).toBeEnabled());
        await waitFor(() => expect(screen.getByRole("button", {name: "Choose files"})).toHaveFocus());
    });

    test("Retry failing again: the alert comes back, and its Retry takes the focus @ATT-274", async () => {
        const adapter = fakeAdapter();
        adapter.rules.mockRejectedValue(apiRefusal(500, "unexpected"));
        const {user} = await renderManager({canUpload: true, adapter});
        await screen.findByText("Couldn't load what can be uploaded.");
        const calls = adapter.rules.mock.calls.length;

        await press(user, "Retry");
        await waitFor(() => expect(adapter.rules.mock.calls.length).toBeGreaterThan(calls));

        await screen.findByText("Couldn't load what can be uploaded.");
        await waitFor(() => expect(screen.getByRole("button", {name: "Retry"})).toHaveFocus());
    });

    test("a user with only a row's Replace: the error and Retry show with no trigger, and Retry turns Replace on @ATT-216", async () => {
        const adapter = fakeAdapter({files: [aStoredFile({originalFileName: "stored.pdf"})]});
        adapter.rules.mockRejectedValue(apiRefusal(500, "unexpected"));
        const {user} = await renderManager({canReplace: true, adapter});

        const message = await screen.findByText("Couldn't load what can be uploaded.");
        const alert = message.closest<HTMLElement>('[role="alert"]');
        expect(alert).not.toBeNull();
        expect(screen.getByRole("button", {name: named.replace("stored.pdf")})).toBeDisabled();
        expect(screen.queryByRole("button", {name: "Choose files"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Upload"})).not.toBeInTheDocument();
        expect(screen.queryByTestId("attachment-drop-area")).not.toBeInTheDocument();

        adapter.rules.mockResolvedValue(ALL_RULES);
        await user.click(within(alert!).getByRole("button", {name: "Retry"}));

        await waitFor(() => expect(screen.getByRole("button", {name: named.replace("stored.pdf")})).toBeEnabled());
        expect(screen.queryByText("Couldn't load what can be uploaded.")).not.toBeInTheDocument();
    });

    test.each([
        ["nothing allowed", {}, {}],
        ["only Delete", {canDelete: true}, {}],
        ["canReplace with no replace call", {canReplace: true}, {replace: undefined}],
    ])("%s: nothing needs the rules, so their failure shows nothing @ATT-216", async (_what, props, overrides) => {
        const adapter = fakeAdapter({...overrides, files: [aStoredFile({originalFileName: "stored.pdf"})]});
        adapter.rules.mockRejectedValue(apiRefusal(500, "unexpected"));
        await renderManager({...props, adapter});

        await expectStored("stored.pdf");
        await waitFor(() => expect(adapter.rules).toHaveBeenCalled());
        await pastPendingWork();

        expect(screen.queryByText("Couldn't load what can be uploaded.")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Retry"})).not.toBeInTheDocument();
    });
});

describe("a drop @area:attachments", () => {
    test("a folder: a refusal shows and no request is sent @ATT-218", async () => {
        const adapter = fakeAdapter();
        await renderManager({canUpload: true, adapter});
        await filesCanBePicked();

        dropFiles(aDataTransfer({folders: ["scans"]}));

        await findRefusal(`“${isolate("scans")}”: a folder can't be uploaded.`);
        await expectSelected();
        expect(adapter.upload).not.toHaveBeenCalled();
    });

    test("a folder in Arabic @ATT-218", async () => {
        await renderManager({canUpload: true}, {lang: "ar"});
        await filesCanBePicked();
        dropFiles(aDataTransfer({folders: ["scans"]}));
        await findRefusal(`«${isolate("scans")}»: لا يمكن رفع مجلد.`);
    });

    test("a folder with files: the files are selected, the folder refused @ATT-218", async () => {
        await renderManager({canUpload: true});
        await filesCanBePicked();
        dropFiles(aDataTransfer({files: [aFile("a.png", 1)], folders: ["scans"]}));
        await expectSelected("a.png");
        await findRefusal(`“${isolate("scans")}”: a folder can't be uploaded.`);
    });

    test("dropped files follow the same rules as picked ones", async () => {
        await renderManager({canUpload: true, adapter: fakeAdapter({rules: onlyPng})});
        await filesCanBePicked();
        dropFiles(aDataTransfer({files: [aFile("a.png", 1), aFile("virus.exe", 1)]}));
        await expectSelected("a.png");
        await findRefusal(refusedLine("virus.exe", REASON.typeNotAllowed));
    });

    test("the drop area says so while files are dragged over it", async () => {
        await renderManager({canUpload: true});
        await filesCanBePicked();
        const area = screen.getByTestId("attachment-drop-area");

        fireEvent.dragEnter(area, {dataTransfer: aDataTransfer({files: [aFile("a.png", 1)]})});
        expect(await screen.findByText("Drop here")).toBeInTheDocument();

        fireEvent.dragLeave(area, {dataTransfer: aDataTransfer({files: [aFile("a.png", 1)]})});
        await waitFor(() => expect(screen.queryByText("Drop here")).not.toBeInTheDocument());
        expect(screen.getByText("or drop them here")).toBeInTheDocument();
    });

    test("a drop anywhere on the window is stopped while the hook is mounted, not after", async () => {
        const {unmount} = await renderManager({canUpload: true});
        await filesCanBePicked();
        const fire = (type: string) => {
            const event = new Event(type, {bubbles: true, cancelable: true});
            act(() => void window.dispatchEvent(event));
            return event.defaultPrevented;
        };
        expect(fire("dragover")).toBe(true);
        expect(fire("drop")).toBe(true);

        unmount();

        expect(fire("dragover")).toBe(false);
        expect(fire("drop")).toBe(false);
    });
});
