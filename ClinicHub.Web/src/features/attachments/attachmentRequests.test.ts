import {CanceledError, type AxiosProgressEvent, type InternalAxiosRequestConfig} from "axios";
import {describe, expect, onTestFinished, test} from "vitest";
import {api} from "../../api/client.ts";
import {isRequestCancelled, toApiError} from "../../api/errors.ts";
import {recordRequests, server} from "../../test";
import {aFile, aStoredFile, testFilesHandlers} from "../../test/pages/attachments.tsx";
import {attachmentRequests} from "./attachmentRequests.ts";

// The table of attachmentRequests.ts on the real client. Name and bytes on the wire are ATT-210's, in the browser.

const requests = attachmentRequests("/test-files");

/** The client's next requests reach this instead of the network: what axios hands over, before the browser's multipart. */
const captureRequests = (progress: Partial<AxiosProgressEvent>[] = []) => {
    const seen: InternalAxiosRequestConfig[] = [];
    const original = api.defaults.adapter;
    api.defaults.adapter = async config => {
        seen.push(config);
        for (const event of progress) config.onUploadProgress?.(event as AxiosProgressEvent);
        return {data: aStoredFile(), status: 200, statusText: "", headers: {}, config};
    };
    onTestFinished(() => void (api.defaults.adapter = original));
    return seen;
};

describe("an adapter's calls on a feature's routes @area:attachments", () => {
    test("list: GET {base} answers the files", async () => {
        const files = [aStoredFile()];
        server.use(...testFilesHandlers(files));
        const recorded = recordRequests();

        await expect(requests.list()).resolves.toEqual(files);
        expect(recorded.requests.map(r => [r.method, r.path])).toEqual([["GET", "/test-files"]]);
    });

    test("upload: POST {base} with a part named file answers the stored file", async () => {
        const files = [aStoredFile()];
        server.use(...testFilesHandlers(files));
        const recorded = recordRequests();

        const saved = await requests.upload(aFile("a.png", 10), {});

        expect(recorded.requests.map(r => [r.method, r.path])).toEqual([["POST", "/test-files"]]);
        expect(saved).toEqual(files[0]);
        expect(files).toHaveLength(2);
    });

    test("replace: PUT {base}/{id} with a part named file answers the new stored file", async () => {
        const old = aStoredFile();
        const files = [old];
        server.use(...testFilesHandlers(files));
        const recorded = recordRequests();

        const saved = await requests.replace(old.id, aFile("a.png", 10), {});

        expect(recorded.requests.map(r => [r.method, r.path])).toEqual([["PUT", `/test-files/${old.id}`]]);
        expect(saved).toEqual(files[0]);
        expect(files.map(file => file.id)).not.toContain(old.id);
    });

    test("delete: DELETE {base}/{id}", async () => {
        const file = aStoredFile();
        const files = [file];
        server.use(...testFilesHandlers(files));
        const recorded = recordRequests();

        await requests.delete(file.id);

        expect(recorded.requests.map(r => [r.method, r.path])).toEqual([["DELETE", `/test-files/${file.id}`]]);
        expect(files).toEqual([]);
    });

    test("download: GET {base}/{id} answers a Blob with the bytes", async () => {
        const file = aStoredFile({originalFileName: "report.pdf"});
        server.use(...testFilesHandlers([file]));
        const recorded = recordRequests();

        const blob = await requests.download(file.id);

        expect(recorded.requests.map(r => [r.method, r.path])).toEqual([["GET", `/test-files/${file.id}`]]);
        expect(blob).toBeInstanceOf(Blob);
        await expect(blob.text()).resolves.toBe("content of report.pdf");
    });

    test("a refusal rejects with the API's code", async () => {
        server.use(...testFilesHandlers([]));
        const error: unknown = await requests.delete("gone").catch((reason: unknown) => reason);
        expect(toApiError(error)).toMatchObject({status: 404, code: "notFound"});
    });

    test.each([
        ["upload", (file: File) => requests.upload(file, {}), "post", "/test-files"],
        ["replace", (file: File) => requests.replace("id-1", file, {}), "put", "/test-files/id-1"],
    ])("%s sends a FormData with one part, named file, holding the file: the client's JSON default would lose it @ATT-267", async (_call, send, method, url) => {
        const seen = captureRequests();
        const file = aFile("تقرير.png", 10);

        await send(file);

        expect(seen).toHaveLength(1);
        expect(seen[0].method).toBe(method);
        expect(seen[0].url).toBe(url);
        const form = seen[0].data as FormData;
        expect(Array.from(form.keys())).toEqual(["file"]);
        const part = form.get("file") as File;
        expect(part.name).toBe("تقرير.png");
        expect(part.size).toBe(10);
        expect(String(seen[0].headers.get("Content-Type"))).not.toContain("json");
    });

    test.each([
        ["upload", (options: Parameters<typeof requests.upload>[1]) => requests.upload(aFile("a.png", 10), options)],
        ["replace", (options: Parameters<typeof requests.upload>[1]) => requests.replace("id-1", aFile("a.png", 10), options)],
    ])("%s reports its progress in whole percents, 0 to 100", async (_call, send) => {
        captureRequests([
            {loaded: 0, total: 3, progress: 0, bytes: 0, upload: true},
            {loaded: 1, total: 3, progress: 1 / 3, bytes: 1, upload: true},
            {loaded: 3, total: 3, progress: 1, bytes: 2, upload: true},
        ]);
        const percents: number[] = [];

        await send({onProgress: percent => percents.push(percent)});

        expect(percents[0]).toBe(0);
        expect([33, 34]).toContain(percents[1]);
        expect(percents[percents.length - 1]).toBe(100);
        for (const percent of percents) expect(Number.isInteger(percent), `${percent}`).toBe(true);
    });

    test("an upload, a replace and a download stop with their signal: a cancel, never a refusal", async () => {
        const file = aStoredFile();
        server.use(...testFilesHandlers([file]));
        const stopped = new AbortController();
        stopped.abort();

        const answers = await Promise.all([
            requests.upload(aFile("a.png", 10), {signal: stopped.signal}).catch((reason: unknown) => reason),
            requests.replace(file.id, aFile("a.png", 10), {signal: stopped.signal}).catch((reason: unknown) => reason),
            requests.download(file.id, stopped.signal).catch((reason: unknown) => reason),
        ]);

        for (const answer of answers) {
            expect(answer).toBeInstanceOf(CanceledError);
            expect(isRequestCancelled(answer)).toBe(true);
        }
    });
});
