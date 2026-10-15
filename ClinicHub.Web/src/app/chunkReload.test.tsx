import {lazy} from "react";
import {describe, expect, onTestFinished, test, vi} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {breakStorage, renderWithProviders} from "../test";
import {PageBoundary} from "../components/common/PageBoundary.tsx";
import {reloadOnChunkError} from "./chunkReload.ts";

// Rules: docs/tech/overview.md "App shell" (PageBoundary), "Browser storage" (clinichub:chunkReloadAt);
// docs/features/platform-admin/tech.md "A failed page chunk".

const RELOADED_AT = "clinichub:chunkReloadAt";

/** Starts the listener the way main.tsx does; returns what a failed chunk triggers, and the mocks. */
const start = (server: "up" | "down" | "error") => {
    let onPreloadError: (() => void) | undefined;
    // Kept here instead of on the window, so no listener outlives the test
    const addEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((...args: Parameters<typeof window.addEventListener>) => {
        if (args[0] === "vite:preloadError") onPreloadError = args[1] as () => void;
        else addEventListener(...args);
    });
    const reload = vi.fn();
    vi.stubGlobal("location", {...window.location, reload});
    const fetch = vi.fn(async () => {
        if (server === "down") throw new TypeError("Failed to fetch");
        return new Response(null, {status: server === "up" ? 200 : 503});
    });
    vi.stubGlobal("fetch", fetch);
    reloadOnChunkError();
    const chunkFails = async () => {
        onPreloadError?.();
        // Let the server check answer
        await new Promise(resolve => setTimeout(resolve, 0));
    };
    return {chunkFails, reload, fetch};
};

/** A page whose chunk can't be loaded. */
const BrokenPage = lazy(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));

const renderFailedPage = async () => {
    // React reports the caught error (console, and a window "error" event in development): expected here
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const silence = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener("error", silence);
    onTestFinished(() => window.removeEventListener("error", silence));
    return renderWithProviders(<PageBoundary><BrokenPage/></PageBoundary>, {lang: "ar"});
};

const expectCouldNotLoad = async () => {
    expect(await screen.findByText("تعذّر تحميل هذه الصفحة.")).toBeInTheDocument();
    expect(screen.getByText("تحقّق من الاتصال، ثم أعد تحميل الصفحة.")).toBeInTheDocument();
    return screen.getByRole("button", {name: "إعادة التحميل"});
};

describe("a page's chunk fails to load @area:ux", () => {
    test("after a new deployment (server answers): the app reloads once and remembers when", async () => {
        const {chunkFails, reload, fetch} = start("up");
        const before = Date.now();
        await chunkFails();
        expect(fetch).toHaveBeenCalledWith("/", {cache: "no-store"});
        expect(reload).toHaveBeenCalledTimes(1);
        expect(Number(sessionStorage.getItem(RELOADED_AT))).toBeGreaterThanOrEqual(before);
    });

    test("a reload less than 30 s ago: no second reload, the page says it couldn't load @UX-030", async () => {
        sessionStorage.setItem(RELOADED_AT, String(Date.now() - 20_000));
        const {chunkFails, reload, fetch} = start("up");
        await chunkFails();
        expect(fetch).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
        await renderFailedPage();
        await expectCouldNotLoad();
    });

    test("a reload 30 s ago or more allows a new one", async () => {
        const now = Date.now();
        vi.spyOn(Date, "now").mockReturnValue(now);
        sessionStorage.setItem(RELOADED_AT, String(now - 30_000));
        const {chunkFails, reload} = start("up");
        await chunkFails();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    test("server unreachable: no automatic reload; «إعادة التحميل» reloads @UX-031", async () => {
        const {chunkFails, reload, fetch} = start("down");
        await chunkFails();
        expect(fetch).toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(RELOADED_AT)).toBeNull();

        const {user} = await renderFailedPage();
        await user.click(await expectCouldNotLoad());
        expect(reload).toHaveBeenCalledTimes(1);
    });

    test("server answering an error: no automatic reload", async () => {
        const {chunkFails, reload} = start("error");
        await chunkFails();
        expect(reload).not.toHaveBeenCalled();
    });

    test("without sessionStorage the app never reloads by itself and shows the couldn't-load state @UX-032", async () => {
        const {chunkFails, reload, fetch} = start("up");
        const restore = breakStorage();
        await chunkFails();
        expect(fetch).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
        restore();
        await renderFailedPage();
        await waitFor(expectCouldNotLoad);
    });
});
