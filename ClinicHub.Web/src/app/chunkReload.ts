const RELOADED_AT = "clinichub:chunkReloadAt";

/** Reads or writes the last reload time; null without session storage (then the app never reloads by itself). */
const lastReload = (now?: number): number | null => {
    try {
        if (now !== undefined) sessionStorage.setItem(RELOADED_AT, String(now));
        return Number(sessionStorage.getItem(RELOADED_AT)) || 0;
    } catch {
        return null;
    }
};

/**
 * A page's chunk failed to load (`vite:preloadError`). After a new deployment the old chunk names are gone: the app
 * reloads once to get the new ones. If the server can't be reached, or the app reloaded for this a moment ago, it
 * doesn't: the page shows "Couldn't load — Reload" (`PageBoundary`).
 */
export const reloadOnChunkError = () => {
    window.addEventListener("vite:preloadError", () => {
        const last = lastReload();
        if (last === null || Date.now() - last < 30_000) return;
        void fetch("/", {cache: "no-store"}).then(response => {
            if (!response.ok) return;
            lastReload(Date.now());
            window.location.reload();
        }, () => undefined);
    });
};
