import {PREFETCH_LIST_ID} from "./chunkList.ts";

/*
 * Downloads the page chunks in the background once the user is in, so that opening a page for the first time is instant.
 * The files are only put in the browser's HTTP cache with fetch(), never import()ed: nothing runs on the page, and a failed
 * download can't fire `vite:preloadError` (chunkReload.ts) or leave a failed module behind for the real navigation.
 */

const MAX_DOWNLOADS = 2;

type Run = { controller: AbortController; downloading: Set<string>; cancelIdle?: () => void };

let remaining: string[] | undefined;
let run: Run | undefined;
/** A download failed (a new deployment, the server or network down): nothing more is tried until the page reloads. */
let gaveUp = false;

const listedUrls = () => JSON.parse(document.getElementById(PREFETCH_LIST_ID)?.textContent ?? "[]") as string[];

const alreadyFetched = () => new Set(performance.getEntriesByType("resource").map(entry => new URL(entry.name).pathname));

const mayDownload = () => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    return navigator.onLine && !connection?.saveData && connection?.effectiveType !== "slow-2g" && connection?.effectiveType !== "2g";
};

/** Calls `callback` when the page has loaded and the browser is idle (Safari has no idle callback: a short wait). */
const whenIdle = (callback: () => void) => {
    let cancel: () => void;
    const waitForIdle = () => {
        if ("requestIdleCallback" in window) {
            const id = requestIdleCallback(callback);
            cancel = () => cancelIdleCallback(id);
        } else {
            const id = setTimeout(callback, 200);
            cancel = () => clearTimeout(id);
        }
    };
    if (document.readyState === "complete") waitForIdle();
    else {
        window.addEventListener("load", waitForIdle, {once: true});
        cancel = () => window.removeEventListener("load", waitForIdle);
    }
    return () => cancel();
};

const schedule = (current: Run) => {
    current.cancelIdle ??= whenIdle(() => {
        current.cancelIdle = undefined;
        startDownloads(current);
    });
};

const startDownloads = (current: Run) => {
    if (!mayDownload()) {
        stopChunkPrefetch();
        return;
    }
    const fetched = alreadyFetched();
    while (current.downloading.size < MAX_DOWNLOADS && remaining?.length) {
        const url = remaining.shift()!;
        if (!fetched.has(url)) void download(current, url);
    }
};

const download = async (current: Run, url: string) => {
    current.downloading.add(url);
    let ok = false;
    try {
        const response = await fetch(url, {signal: current.controller.signal, priority: "low"});
        // Read to the end: the browser caches only a body that was read
        await response.blob();
        ok = response.ok;
    } catch {
        // Stays silent: the real navigation loads the chunk as usual, and handles its failure as usual
    }
    if (run !== current) return;
    current.downloading.delete(url);
    if (ok) schedule(current);
    else {
        stopChunkPrefetch();
        gaveUp = true;
    }
};

/** Starts, or carries on after a stop; does nothing while running, so a change of clinic doesn't download anything again. */
export const startChunkPrefetch = () => {
    if (run || gaveUp) return;
    remaining ??= listedUrls();
    if (remaining.length === 0) return;
    run = {controller: new AbortController(), downloading: new Set()};
    schedule(run);
};

/** Cancels the downloads under way; what they hadn't finished is downloaded by the next start. */
export const stopChunkPrefetch = () => {
    if (!run) return;
    run.cancelIdle?.();
    run.controller.abort();
    remaining = [...run.downloading, ...(remaining ?? [])];
    run = undefined;
};
