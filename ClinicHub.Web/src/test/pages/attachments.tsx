import {act, waitFor} from "@testing-library/react";
import {AxiosError, AxiosHeaders, CanceledError} from "axios";
import {http, HttpResponse} from "msw";
import {type Mock, onTestFinished, vi} from "vitest";
import type {DataScope} from "../../api/dataScope.ts";
import {AttachmentManager} from "../../features/attachments/components/AttachmentManager.tsx";
import type {
    Attachment, AttachmentManagerProps, AttachmentRules, AttachmentsAdapter, UploadOptions,
} from "../../features/attachments/types.ts";
import type {LanguageCode} from "../../i18n/languages.ts";
import {startApp} from "../app.tsx";
import {nextId} from "../data.ts";
import {api, problem, problemBody} from "../msw.ts";
import {renderWithProviders, type RenderWithProvidersOptions} from "../render.tsx";

/*
 * The attachment components (docs/design/attachments.components.contract.md) with a fake adapter or their routes:
 * builders, a real axios refusal, a gate over the uploads, a drop's data and object URLs for jsdom, a render of
 * `AttachmentManager` and the same in the whole app.
 */

/** A stored file (`AttachmentDto`): a PDF of 1 KB unless told otherwise; the id is new for each. */
export const aStoredFile = (overrides: Partial<Attachment> = {}): Attachment => ({
    id: `stored-${nextId()}`,
    originalFileName: "report.pdf",
    typeKey: "pdf",
    contentType: "application/pdf",
    sizeBytes: 1024,
    createdAt: "2026-11-06T10:00:00Z",
    ...overrides,
});

/** Every file of the helpers has this date: the same name and size is the same file (`fileKey`). */
const LAST_MODIFIED = Date.UTC(2026, 10, 6);

/** A picked file of exactly `sizeBytes` bytes (zeros). No `type` unless given: a browser may leave it empty too. */
export const aFile = (name: string, sizeBytes: number, type = "") =>
    new File([new Uint8Array(sizeBytes)], name, {type, lastModified: LAST_MODIFIED});

/** The global rules of design § 5: 20 MB and the extensions of the 17 types. */
export const ALL_RULES: AttachmentRules = {
    maxFileSizeBytes: 20 * 1_048_576,
    extensions: [
        ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif", ".tif", ".tiff", ".heic", ".heif", ".pdf",
        ".docx", ".xlsx", ".pptx", ".doc", ".xls", ".ppt", ".txt", ".csv",
    ],
};

/** The rejection of a request the API refused: a real AxiosError with a ProblemDetails, as `getErrorMessage` reads it. */
export const apiRefusal = (status: number, code: string, options?: Parameters<typeof problemBody>[2]) => {
    const config = {headers: new AxiosHeaders()};
    return new AxiosError(`Request failed with status code ${status}`, status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST", config, null, {
        status, statusText: "", headers: {}, config, data: problemBody(status, code, options),
    });
};

const TYPE_KEY_OF_EXTENSION: Readonly<Record<string, string>> = {jpg: "jpeg", tif: "tiff", heif: "heic"};

/** What the server stores for a picked file: its name, its size and the type its extension picks. */
const storedFrom = (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    return aStoredFile({
        originalFileName: file.name,
        typeKey: TYPE_KEY_OF_EXTENSION[extension] ?? extension,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
    });
};

/** An upload or a replace held by `holdUploads`, its request "running" until the test says. */
export type HeldUpload = {
    name: string;
    file: File;
    signal: AbortSignal | undefined;
    /** Reports progress, 0 to 100 */
    progress: (percent: number) => void;
    /** Reports 100, stores the file and answers it */
    finish: () => Promise<void>;
    /** Rejects with `error`, usually `apiRefusal(…)` */
    fail: (error: unknown) => Promise<void>;
};

export type UploadGate = {
    /** The names of every upload started since the gate was installed, in order */
    started: string[];
    /** The names of the uploads running now (not finished, failed or aborted) */
    running: () => string[];
    /** Waits until an upload of `name` is running, and returns it */
    held: (name: string) => Promise<HeldUpload>;
};

export type FakeAdapter = DataScope & {
    rules: Mock<AttachmentsAdapter["rules"]>;
    list: Mock<AttachmentsAdapter["list"]>;
    upload: Mock<AttachmentsAdapter["upload"]>;
    replace: Mock<NonNullable<AttachmentsAdapter["replace"]>>;
    delete: Mock<NonNullable<AttachmentsAdapter["delete"]>>;
    download: Mock<AttachmentsAdapter["download"]>;
    /** The stored files, newest first (a replace's new file too): what the next `list` answers */
    files: Attachment[];
    /** From now on each upload and replace waits for the test; an abort rejects it with axios's cancel error */
    holdUploads: () => UploadGate;
};

export type FakeAdapterOptions = Partial<Omit<AttachmentsAdapter, "rules">> & {
    /** The stored files (copied) */
    files?: Attachment[];
    /** What `rules` answers (default `ALL_RULES`). A failure: `adapter.rules.mockRejectedValue(apiRefusal(…))` */
    rules?: AttachmentRules;
};

/**
 * An adapter in memory, every method a `vi.fn`: `list` answers the files, an upload stores its file at once and a
 * missing ID answers `apiRefusal(404, "notFound")`. A method given replaces that behaviour; `replace: undefined` or
 * `delete: undefined` leaves the method out, as a feature without it does.
 */
export const fakeAdapter = ({files: given = [], rules = ALL_RULES, ...overrides}: FakeAdapterOptions = {}): FakeAdapter => {
    const files = [...given];
    const indexOf = (id: string) => {
        const index = files.findIndex(file => file.id === id);
        if (index < 0) throw apiRefusal(404, "notFound");
        return index;
    };

    let hold: ((file: File, options: UploadOptions, store: () => Attachment) => Promise<Attachment>) | null = null;
    const send = (file: File, options: UploadOptions, store: () => Attachment) => {
        if (hold) return hold(file, options, store);
        options.onProgress?.(100);
        return Promise.resolve(store());
    };

    const holdUploads = (): UploadGate => {
        const started: string[] = [];
        const running: HeldUpload[] = [];
        const stop = (upload: HeldUpload) => {
            const index = running.indexOf(upload);
            // An abort after the end finds nothing left to stop
            if (index >= 0) running.splice(index, 1);
        };
        hold = (file, {onProgress, signal}, store) => new Promise<Attachment>((resolve, reject) => {
            started.push(file.name);
            if (signal?.aborted) {
                reject(new CanceledError());
                return;
            }
            const upload: HeldUpload = {
                name: file.name,
                file,
                signal,
                progress: percent => {
                    act(() => onProgress?.(percent));
                },
                finish: () => act(async () => {
                    stop(upload);
                    onProgress?.(100);
                    resolve(store());
                }),
                fail: error => act(async () => {
                    stop(upload);
                    reject(error);
                }),
            };
            running.push(upload);
            signal?.addEventListener("abort", () => {
                stop(upload);
                reject(new CanceledError());
            }, {once: true});
        });
        return {
            started,
            running: () => running.map(upload => upload.name),
            held: name => waitFor(() => {
                const upload = running.find(held => held.name === name);
                if (!upload) throw new Error(`No upload of "${name}" is running`);
                return upload;
            }),
        };
    };

    const leftOut = (name: "replace" | "delete") => name in overrides && overrides[name] === undefined;

    return {
        scope: overrides.scope ?? ["attachments-test"],
        affects: overrides.affects,
        container: overrides.container,
        files,
        holdUploads,
        rules: vi.fn<AttachmentsAdapter["rules"]>(async () => rules),
        list: vi.fn<AttachmentsAdapter["list"]>(overrides.list ?? (async () => [...files])),
        upload: vi.fn<AttachmentsAdapter["upload"]>(overrides.upload ?? ((file, options) => send(file, options, () => {
            const saved = storedFrom(file);
            files.unshift(saved);
            return saved;
        }))),
        ...(leftOut("replace") ? {} : {
            replace: vi.fn<NonNullable<AttachmentsAdapter["replace"]>>(overrides.replace ?? (async (id, file, options) => {
                indexOf(id);
                return send(file, options, () => {
                    const saved = storedFrom(file);
                    files.splice(indexOf(id), 1);
                    files.unshift(saved);
                    return saved;
                });
            })),
        }),
        ...(leftOut("delete") ? {} : {
            delete: vi.fn<NonNullable<AttachmentsAdapter["delete"]>>(overrides.delete ?? (async id => {
                files.splice(indexOf(id), 1);
            })),
        }),
        download: vi.fn<AttachmentsAdapter["download"]>(overrides.download ?? (async (id, signal) => {
            if (signal?.aborted) throw new CanceledError();
            return new Blob([`content of ${files[indexOf(id)].originalFileName}`]);
        })),
    } as FakeAdapter;
};

/**
 * A drop's `DataTransfer`, which jsdom doesn't have, for `fireEvent.drop(area, {dataTransfer})`: as in a browser, a
 * folder is a `file` item too, its `getAsFile()` an empty file and only its entry saying it's a directory. `noEntries`:
 * every `webkitGetAsEntry()` answers null, as for a `DataTransfer` a script builds (`e2e/support/attachmentsDrop.ts`).
 */
export const aDataTransfer = ({files = [], folders = [], noEntries = false}: { files?: File[]; folders?: string[]; noEntries?: boolean }) => {
    const item = (file: File, isDirectory: boolean) => ({
        kind: "file",
        type: file.type,
        getAsFile: () => file,
        webkitGetAsEntry: () => (noEntries ? null : {name: file.name, isFile: !isDirectory, isDirectory}),
    });
    const folderFiles = folders.map(name => new File([], name));
    return {
        items: [...files.map(file => item(file, false)), ...folderFiles.map(file => item(file, true))],
        files: [...files, ...folderFiles],
        types: ["Files"],
        dropEffect: "none",
        effectAllowed: "all",
    } as unknown as DataTransfer;
};

/**
 * jsdom has no `URL.createObjectURL`: this one hands out `blob:test/<n>`. Removed after the test (setup.ts's
 * `vi.unstubAllGlobals()`). A test that clicks a download waits for its URL in `revoked` before it ends: the revoke runs
 * shortly after the click, and with the stub gone it would throw.
 */
export const stubObjectUrls = () => {
    const created: Blob[] = [];
    const revoked: string[] = [];
    const live = new Set<string>();
    class StubbedUrl extends URL {
        static createObjectURL(blob: Blob) {
            created.push(blob);
            const url = `blob:test/${created.length}`;
            live.add(url);
            return url;
        }

        static revokeObjectURL(url: string) {
            revoked.push(url);
            live.delete(url);
        }
    }
    vi.stubGlobal("URL", StubbedUrl);
    return {
        /** Every blob given to `createObjectURL`, in order */
        created,
        /** Every URL revoked, in order */
        revoked,
        /** The URLs created and not revoked yet */
        live: () => [...live],
    };
};

/**
 * `AttachmentManager` on `fakeAdapter()` or the adapter given, in the app's providers. Returns `renderWithProviders`'s
 * result plus `adapter`. `canUpload`, `canReplace` and `canDelete` stay off unless given, as for a feature.
 */
export const renderManager = async (
    {adapter = fakeAdapter(), ...props}: Partial<Omit<AttachmentManagerProps, "adapter">> & { adapter?: FakeAdapter } = {},
    options: RenderWithProvidersOptions = {},
) => {
    const rendered = await renderWithProviders(<AttachmentManager adapter={adapter} {...props}/>, options);
    return {...rendered, adapter};
};

/**
 * `AttachmentManager` on `attachmentRequests("/test-files")` in the whole app (`startApp`: fresh modules, the real
 * session store, API client and `AppProviders`), for what only that shows: the refresh and replay, the clinic-lost flow,
 * and a mutation's 403 reloading `/me`. It takes the place of the drugs page in the app's own routes, so it opens on
 * `/drugs`; after a clinic is lost the app goes where it always goes. Give the answers first, as for `startApp`:
 * `server.use(refreshSequence(sessionIn(clinicA), …).handler, meByContext(), ...testFilesHandlers(files))`.
 */
export const startManager = async ({lang = "en", ...props}: Omit<AttachmentManagerProps, "adapter"> & { lang?: LanguageCode } = {}) => {
    vi.doMock("../../features/drugs/pages/DrugsPage.tsx", async () => {
        // The modules of this load, the ones the app runs on
        const {api: client} = await import("../../api/client.ts");
        const {attachmentRequests} = await import("../../features/attachments/attachmentRequests.ts");
        const {AttachmentManager: Manager} = await import("../../features/attachments/components/AttachmentManager.tsx");
        const adapter: AttachmentsAdapter = {
            ...attachmentRequests("/test-files"),
            scope: ["test-files"],
            rules: () => client.get<AttachmentRules>("/test-files/rules").then(response => response.data),
        };
        return {DrugsPage: () => <Manager adapter={adapter} {...props}/>};
    });
    onTestFinished(() => vi.doUnmock("../../features/drugs/pages/DrugsPage.tsx"));
    return startApp({route: "/drugs", lang});
};

/**
 * The routes `attachmentRequests("/test-files")` calls, kept in `files` (changed in place, newest first), and
 * `GET /test-files/rules`: the real client on MSW. A test's own answer goes in a later call, which wins (within one
 * call the first handler wins): `server.use(...testFilesHandlers(files));` then
 * `server.use(http.get(api("/test-files/:id"), () => problem(403, "noAccess")));`.
 *
 * jsdom can't carry a `File` through a multipart body (design § 12): the part arrives named `blob`, without its bytes,
 * and `request.formData()` throws. So an upload checks that a part named `file` came and stores `aStoredFile()`; the
 * real name and bytes are proved in the browser (ATT-210).
 */
export const testFilesHandlers = (files: Attachment[], rules: AttachmentRules = ALL_RULES) => {
    const url = api("/test-files");
    const indexOf = (id: unknown) => files.findIndex(file => file.id === id);
    /** A new row for the form's part named `file`, given to `store`; none answers 400 `attachmentEmpty`, as the API does */
    const stored = async (request: Request, store: (saved: Attachment) => void, status: number) => {
        if (!(await request.text()).includes('name="file"')) return problem(400, "attachmentEmpty");
        const saved = aStoredFile();
        store(saved);
        return HttpResponse.json(saved, {status});
    };
    return [
        // Before `:id`, which would match it too
        http.get(`${url}/rules`, () => HttpResponse.json(rules)),
        http.get(url, () => HttpResponse.json(files)),
        http.post(url, ({request}) => stored(request, saved => files.unshift(saved), 201)),
        http.put(`${url}/:id`, ({request, params}) => {
            const index = indexOf(params.id);
            return index < 0 ? problem(404, "notFound") : stored(request, saved => {
                files.splice(index, 1);
                files.unshift(saved);
            }, 200);
        }),
        http.delete(`${url}/:id`, ({params}) => {
            const index = indexOf(params.id);
            if (index < 0) return problem(404, "notFound");
            files.splice(index, 1);
            return new HttpResponse(null, {status: 204});
        }),
        http.get(`${url}/:id`, ({params}) => {
            const file = files[indexOf(params.id)];
            return file
                ? new HttpResponse(`content of ${file.originalFileName}`, {headers: {"Content-Type": file.contentType}})
                : problem(404, "notFound");
        }),
    ];
};
