import {act, screen, waitFor} from "@testing-library/react";
import {useEffect} from "react";
import {describe, expect, test} from "vitest";
import {expectToasts, findToast, isolate, renderWithProviders} from "../../test";
import {
    aDataTransfer, aFile, ALL_RULES, apiRefusal, aStoredFile, deferred, fakeAdapter, type FakeAdapter, pastPendingWork, REASON, refusedLine,
    setPdfViewer, stubDownloads, stubObjectUrls,
} from "../../test/pages/attachments.tsx";
import type {UseAttachments, UseAttachmentsOptions} from "./types.ts";
import {useAttachments} from "./useAttachments.ts";

// Level 3 of customizing (design § 12): the hook alone with the feature's own markup, every action with no component.

let hook: UseAttachments;

/** A page of its own: its markup is the feature's, and the test drives the hook as its buttons would. */
const OwnPage = (options: UseAttachmentsOptions) => {
    const files = useAttachments(options);
    useEffect(() => {
        hook = files;
    });
    return (
        <section aria-label="My files">
            <p>{files.isListLoading ? "My loading" : `I hold ${files.files.length}`}</p>
            <ul>{files.files.map(file => <li key={file.id}>{file.originalFileName}</li>)}</ul>
            <ol>{files.selected.map(item => <li key={item.key}>{item.file.name}</li>)}</ol>
        </section>
    );
};

const start = async (adapter: FakeAdapter = fakeAdapter(), options: Partial<UseAttachmentsOptions> = {}) => {
    const rendered = await renderWithProviders(<OwnPage adapter={adapter} {...options}/>);
    await waitFor(() => expect(hook.canPick).toBe(true));
    await waitFor(() => expect(hook.isListLoading).toBe(false));
    return {...rendered, adapter};
};

const selectedNames = () => hook.selected.map(item => item.file.name);
const storedNames = () => hook.files.map(file => file.originalFileName);
const stateOf = (name: string) => hook.selected.find(item => item.file.name === name);
const stored = (name: string, typeKey = "png") => aStoredFile({originalFileName: name, typeKey});

/** Runs an action of the hook and what it starts, with no markup of ours in the way. */
const run = (action: () => unknown) => act(async () => {
    await action();
});

/** Starts an action that doesn't end until the test says. */
const begin = (action: () => unknown) => act(() => {
    void action();
});

describe("useAttachments alone, Upload before the list has answered @area:attachments", () => {
    test.each([
        ["one file replaced by Upload", {multiple: false, canReplace: true}],
        ["maxFiles", {maxFiles: 3}],
    ])("the list failed, %s: upload sends nothing, and the file keeps waiting @ATT-260", async (_what, options) => {
        const adapter = fakeAdapter({files: [stored("a.png")], list: () => Promise.reject(apiRefusal(500, "unexpected"))});
        await start(adapter, options);
        await waitFor(() => expect(hook.listFailed).toBe(true));
        await run(() => hook.pick([aFile("new.png", 1)]));

        await run(() => hook.upload());
        await pastPendingWork();

        expect(adapter.upload).not.toHaveBeenCalled();
        expect(adapter.replace).not.toHaveBeenCalled();
        expect(stateOf("new.png")?.status).toBe("waiting");
    });

    test("the list failed, several files with no maxFiles: upload sends @ATT-260", async () => {
        const adapter = fakeAdapter({list: () => Promise.reject(apiRefusal(500, "unexpected"))});
        await start(adapter);
        await waitFor(() => expect(hook.listFailed).toBe(true));
        await run(() => hook.pick([aFile("new.png", 1)]));

        await run(() => hook.upload());

        expect(adapter.upload).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(selectedNames()).toEqual([]));
    });
});

describe("useAttachments alone, the rules and the list @area:attachments", () => {
    test("it gives the rules, the accept, the stored files and its options, and renders nothing of its own @ATT-251", async () => {
        const adapter = fakeAdapter({files: [stored("a.png")]});
        await start(adapter);

        expect(hook.rules).toEqual(ALL_RULES);
        expect(hook.rulesFailed).toBe(false);
        expect(hook.accept).toBe(ALL_RULES.extensions.join(","));
        expect(hook.multiple).toBe(true);
        expect(storedNames()).toEqual(["a.png"]);
        expect(hook.listFailed).toBe(false);
        expect(hook.isUploading).toBe(false);
        expect(hook.selected).toEqual([]);
        expect(hook.preview).toBeNull();
        expect(hook.replacing).toBeNull();
        expect(screen.getByRole("region", {name: "My files"})).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(screen.queryByTestId("attachment-input")).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("multiple false is given back @ATT-251", async () => {
        await start(fakeAdapter(), {multiple: false});
        expect(hook.multiple).toBe(false);
    });

    test("rules failing: rulesFailed, no accept, no picking; retryRules loads them @ATT-251", async () => {
        const adapter = fakeAdapter();
        adapter.rules.mockRejectedValue(apiRefusal(500, "unexpected"));
        await renderWithProviders(<OwnPage adapter={adapter}/>);
        await waitFor(() => expect(hook.rulesFailed).toBe(true));
        expect(hook.canPick).toBe(false);
        expect(hook.accept).toBe("");
        expect(hook.rules).toBeNull();

        adapter.rules.mockResolvedValue(ALL_RULES);
        await run(() => hook.retryRules());

        await waitFor(() => expect(hook.canPick).toBe(true));
        expect(hook.rulesFailed).toBe(false);
    });

    test("a list failing: listFailed; retryList loads it @ATT-251", async () => {
        let broken = true;
        const adapter = fakeAdapter({
            list: async () => {
                if (broken) throw apiRefusal(500, "unexpected");
                return [stored("a.png")];
            },
        });
        await renderWithProviders(<OwnPage adapter={adapter}/>);
        await waitFor(() => expect(hook.listFailed).toBe(true));

        broken = false;
        await run(() => hook.retryList());

        await waitFor(() => expect(storedNames()).toEqual(["a.png"]));
        expect(hook.listFailed).toBe(false);
    });
});

describe("useAttachments alone, the selection @area:attachments", () => {
    test("pick adds waiting files with their key, once each, with no request; removeSelected takes one out @ATT-251", async () => {
        const {adapter} = await start();

        await run(() => hook.pick([aFile("a.png", 1), aFile("b.png", 1), aFile("a.png", 1)]));

        expect(selectedNames()).toEqual(["a.png", "b.png"]);
        expect(stateOf("a.png")).toMatchObject({status: "waiting", percent: 0, error: null});
        expect(stateOf("a.png")?.key).not.toBe(stateOf("b.png")?.key);
        expect(adapter.upload).not.toHaveBeenCalled();

        await run(() => hook.removeSelected(stateOf("a.png")!.key));

        expect(selectedNames()).toEqual(["b.png"]);
    });

    test("pick refuses with refusals; the next pick clears them; clearRefusals too @ATT-251", async () => {
        await start();

        await run(() => hook.pick([aFile("virus.exe", 1), aFile("empty.png", 0)]));

        expect(hook.selected).toEqual([]);
        expect(hook.refusals.map(refusal => refusal.message)).toEqual([
            refusedLine("virus.exe", REASON.typeNotAllowed),
            refusedLine("empty.png", REASON.empty),
        ]);
        expect(new Set(hook.refusals.map(refusal => refusal.key)).size).toBe(2);

        await run(() => hook.pick([aFile("good.png", 1)]));
        expect(hook.refusals).toEqual([]);

        await run(() => hook.pick([aFile("virus.exe", 1)]));
        expect(hook.refusals).toHaveLength(1);
        await run(() => hook.clearRefusals());
        expect(hook.refusals).toEqual([]);
    });

    test("drop selects the files and refuses the folders @ATT-251", async () => {
        await start();

        await run(() => hook.drop(aDataTransfer({files: [aFile("a.png", 1)], folders: ["scans"]})));

        expect(selectedNames()).toEqual(["a.png"]);
        expect(hook.refusals.map(refusal => refusal.message)).toEqual([`“${isolate("scans")}”: a folder can't be uploaded.`]);
    });

    test("multiple false: the new pick replaces @ATT-251", async () => {
        await start(fakeAdapter(), {multiple: false});
        await run(() => hook.pick([aFile("a.png", 1)]));
        await run(() => hook.pick([aFile("b.png", 1)]));
        expect(selectedNames()).toEqual(["b.png"]);
    });

    test("maxFiles: stored + selected @ATT-251", async () => {
        await start(fakeAdapter({files: [stored("s.png")]}), {maxFiles: 2});
        await run(() => hook.pick([aFile("a.png", 1), aFile("b.png", 1)]));
        expect(selectedNames()).toEqual(["a.png"]);
        expect(hook.refusals.map(refusal => refusal.message)).toEqual([`“${isolate("b.png")}” wasn't added. Most files allowed: 2.`]);
    });
});

describe("useAttachments alone, uploading @area:attachments", () => {
    test("upload runs one at a time through its states; a file done leaves the selection and enters the list @ATT-251", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        await start(adapter);
        await run(() => hook.pick([aFile("a.png", 1), aFile("b.png", 1)]));

        begin(() => hook.upload());
        const a = await gate.held("a.png");

        await waitFor(() => expect(stateOf("a.png")?.status).toBe("uploading"));
        expect(stateOf("b.png")?.status).toBe("queued");
        expect(hook.isUploading).toBe(true);
        a.progress(40);
        await waitFor(() => expect(stateOf("a.png")?.percent).toBe(40));

        await a.finish();
        await waitFor(() => expect(hook.announcement).toBe(`“${isolate("a.png")}” was uploaded.`));
        await (await gate.held("b.png")).finish();

        await waitFor(() => expect(hook.isUploading).toBe(false));
        await waitFor(() => expect(storedNames().sort()).toEqual(["a.png", "b.png"]));
        expect(hook.selected).toEqual([]);
    });

    test("cancel: an uploading file becomes cancelled, a queued one waits again; upload sends both @ATT-251", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        await start(adapter);
        await run(() => hook.pick([aFile("a.png", 1), aFile("b.png", 1)]));
        begin(() => hook.upload());
        const a = await gate.held("a.png");
        await waitFor(() => expect(stateOf("b.png")?.status).toBe("queued"));

        await run(() => hook.cancel(stateOf("b.png")!.key));
        expect(stateOf("b.png")?.status).toBe("waiting");
        await run(() => hook.cancel(stateOf("a.png")!.key));

        expect(a.signal?.aborted).toBe(true);
        await waitFor(() => expect(stateOf("a.png")?.status).toBe("cancelled"));
        expect(stateOf("a.png")?.error).toBeNull();
        await waitFor(() => expect(hook.isUploading).toBe(false));
        expect(gate.started).toEqual(["a.png"]);

        begin(() => hook.upload());
        await (await gate.held("a.png")).finish();
        await (await gate.held("b.png")).finish();
        await waitFor(() => expect(hook.selected).toEqual([]));
    });

    test("a refused upload: failed with the translated reason, announced; retry sends it again @ATT-251", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        await start(adapter);
        await run(() => hook.pick([aFile("a.png", 1)]));
        begin(() => hook.upload());
        await (await gate.held("a.png")).fail(apiRefusal(400, "attachmentTooLarge"));

        await waitFor(() => expect(stateOf("a.png")).toMatchObject({status: "failed", error: REASON.tooLarge}));
        expect(hook.announcement).toBe(`“${isolate("a.png")}” wasn't uploaded: ${REASON.tooLarge}`);

        await run(() => hook.retry(stateOf("a.png")!.key));
        await (await gate.held("a.png")).finish();

        await waitFor(() => expect(hook.selected).toEqual([]));
        expect(gate.started).toEqual(["a.png", "a.png"]);
    });

    test("canReplace with multiple false: upload goes through replace @ATT-251", async () => {
        const file = stored("old.png");
        const adapter = fakeAdapter({files: [file]});
        await start(adapter, {multiple: false, canReplace: true});

        await run(() => hook.pick([aFile("new.png", 1)]));
        expect(adapter.replace).not.toHaveBeenCalled();
        await run(() => hook.upload());

        await waitFor(() => expect(storedNames()).toEqual(["new.png"]));
        expect(adapter.replace.mock.calls[0][0]).toBe(file.id);
        expect(adapter.upload).not.toHaveBeenCalled();
    });

    test("unmounted during a run: the upload is aborted and the queue stops @ATT-251", async () => {
        const adapter = fakeAdapter();
        const gate = adapter.holdUploads();
        const {unmount} = await start(adapter);
        await run(() => hook.pick([aFile("a.png", 1), aFile("b.png", 1)]));
        begin(() => hook.upload());
        const a = await gate.held("a.png");

        unmount();

        expect(a.signal?.aborted).toBe(true);
        await pastPendingWork();
        expect(gate.started).toEqual(["a.png"]);
    });
});

describe("useAttachments alone, a stored file @area:attachments", () => {
    test("download saves one, downloadAll each in turn @ATT-251", async () => {
        const browser = stubDownloads();
        await start(fakeAdapter({files: [stored("a.png"), stored("b.png")]}));

        await run(() => hook.download(hook.files[0]));
        await browser.saved(1);
        expect(browser.saves.map(save => save.name)).toEqual(["a.png"]);

        await run(() => hook.downloadAll());
        await browser.saved(3);
        expect(browser.saves.map(save => save.name)).toEqual(["a.png", "a.png", "b.png"]);
    });

    test("isDownloadingAll tells while it runs @ATT-251", async () => {
        const answer = deferred<Blob>();
        const browser = stubDownloads();
        const adapter = fakeAdapter({files: [stored("a.png")], download: () => answer.promise});
        await start(adapter);
        expect(hook.isDownloadingAll).toBe(false);

        begin(() => hook.downloadAll());
        await waitFor(() => expect(hook.isDownloadingAll).toBe(true));

        await run(() => answer.resolve(new Blob(["x"])));
        await waitFor(() => expect(hook.isDownloadingAll).toBe(false));
        await browser.saved(1);
    });

    test("delete has no confirmation: it deletes, toasts and reloads @ATT-251", async () => {
        const file = stored("a.png");
        const adapter = fakeAdapter({files: [file, stored("b.png")]});
        await start(adapter);

        await run(() => hook.delete(file));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(adapter.delete).toHaveBeenCalledWith(file.id);
        await expectToasts("File deleted");
        await waitFor(() => expect(storedNames()).toEqual(["b.png"]));
    });

    test("a failure is a toast; a 404 also reloads @ATT-251", async () => {
        const file = stored("a.png");
        const adapter = fakeAdapter({files: [file]});
        await start(adapter);
        adapter.files.splice(0, 1);

        await run(() => hook.download(file));

        await expectToasts("This item no longer exists.");
        await waitFor(() => expect(storedNames()).toEqual([]));
    });

    test("replace checks the rules, then sends: replacing tells its progress, and a toast the end @ATT-251", async () => {
        const file = stored("old.png");
        const adapter = fakeAdapter({files: [file]});
        const gate = adapter.holdUploads();
        await start(adapter);

        begin(() => hook.replace(file, aFile("new.png", 1)));
        const held = await gate.held("new.png");
        await waitFor(() => expect(hook.replacing?.id).toBe(file.id));
        held.progress(60);
        await waitFor(() => expect(hook.replacing).toEqual({id: file.id, percent: 60}));
        await held.finish();

        await expectToasts("File replaced");
        await waitFor(() => expect(hook.replacing).toBeNull());
        await waitFor(() => expect(storedNames()).toEqual(["new.png"]));
    });

    test("replace with a file the rules refuse: a toast, nothing sent @ATT-251", async () => {
        const file = stored("old.png");
        const adapter = fakeAdapter({files: [file]});
        await start(adapter);

        await run(() => hook.replace(file, aFile("virus.exe", 1)));

        expect(await findToast()).toContain(REASON.typeNotAllowed);
        expect(adapter.replace).not.toHaveBeenCalled();
        expect(storedNames()).toEqual(["old.png"]);
    });

    test("cancelReplace aborts it: the old file stays and the list reloads @ATT-251", async () => {
        const file = stored("old.png");
        const adapter = fakeAdapter({files: [file]});
        const gate = adapter.holdUploads();
        await start(adapter);
        begin(() => hook.replace(file, aFile("new.png", 1)));
        const held = await gate.held("new.png");
        await waitFor(() => expect(hook.replacing).not.toBeNull());
        const loads = adapter.list.mock.calls.length;

        await run(() => hook.cancelReplace());

        expect(held.signal?.aborted).toBe(true);
        await waitFor(() => expect(hook.replacing).toBeNull());
        await waitFor(() => expect(adapter.list.mock.calls.length).toBeGreaterThan(loads));
        expect(storedNames()).toEqual(["old.png"]);
        await expectToasts();
    });
});

describe("useAttachments alone, the preview @area:attachments", () => {
    test("a stored image: fetched only now, once, with its state; closePreview revokes it @ATT-251", async () => {
        const urls = stubObjectUrls();
        const file = {...stored("a.png"), sizeBytes: 9};
        const adapter = fakeAdapter({files: [file]});
        await start(adapter);
        expect(adapter.download).not.toHaveBeenCalled();

        await run(() => {
            hook.openPreview(file);
            hook.openPreview(file);
        });

        await waitFor(() => expect(hook.preview?.status).toBe("ready"));
        expect(hook.preview).toMatchObject({name: "a.png", sizeBytes: 9, kind: "image", url: "blob:test/1", text: null});
        expect(adapter.download).toHaveBeenCalledTimes(1);

        await run(() => hook.closePreview());

        expect(hook.preview).toBeNull();
        expect(urls.live()).toEqual([]);
    });

    test("a stored file with no viewer: ready at once, nothing fetched; its download fetches and saves it @ATT-251", async () => {
        const browser = stubDownloads();
        const file = stored("letter.docx", "docx");
        const adapter = fakeAdapter({files: [file]});
        await start(adapter);

        await run(() => hook.openPreview(file));

        expect(hook.preview).toMatchObject({kind: "none", status: "ready", url: null, text: null, textCut: false});
        expect(adapter.download).not.toHaveBeenCalled();

        await run(() => hook.preview?.download());
        await browser.saved(1);
        expect(browser.saves[0].name).toBe("letter.docx");
    });

    test("a selected text file: read from the File with no request, marked when cut @ATT-251", async () => {
        const adapter = fakeAdapter();
        await start(adapter);
        await run(() => hook.pick([new File([new Uint8Array(1_048_577).fill(0x61)], "long.txt")]));

        await run(() => hook.openPreview(hook.selected[0]));

        await waitFor(() => expect(hook.preview?.status).toBe("ready"));
        expect(hook.preview).toMatchObject({name: "long.txt", sizeBytes: 1_048_577, kind: "text", textCut: true, url: null});
        expect(hook.preview?.text).toHaveLength(1_048_576);
        expect(adapter.download).not.toHaveBeenCalled();
    });

    test("reportFailed: an image that can't be decoded tells the state @ATT-251", async () => {
        stubObjectUrls();
        const file = stored("a.png");
        await start(fakeAdapter({files: [file]}));
        await run(() => hook.openPreview(file));
        await waitFor(() => expect(hook.preview?.status).toBe("ready"));

        await run(() => hook.preview?.reportFailed());

        expect(hook.preview?.status).toBe("failed");
    });

    test("loading while its bytes are on their way @ATT-251", async () => {
        stubObjectUrls();
        const answer = deferred<Blob>();
        const file = stored("a.png");
        await start(fakeAdapter({files: [file], download: () => answer.promise}));

        await run(() => hook.openPreview(file));
        expect(hook.preview).toMatchObject({status: "loading", url: null});

        await run(() => answer.resolve(new Blob(["x"])));
        await waitFor(() => expect(hook.preview?.status).toBe("ready"));
    });

    test("a PDF with the viewer off: kind none, nothing fetched @ATT-251", async () => {
        setPdfViewer(false);
        const file = stored("report.pdf", "pdf");
        const adapter = fakeAdapter({files: [file]});
        await start(adapter);

        await run(() => hook.openPreview(file));

        expect(hook.preview).toMatchObject({kind: "none", status: "ready"});
        expect(adapter.download).not.toHaveBeenCalled();
    });
});
