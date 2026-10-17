import "@testing-library/jest-dom/vitest";
import {afterAll, afterEach, beforeAll, beforeEach, vi} from "vitest";
import {cleanup, configure, fireEvent} from "@testing-library/react";
import toast from "react-hot-toast";
import i18n from "../i18n";
import {restoreClipboard} from "./clipboard.ts";
import {takeForbiddenQueries} from "./render.tsx";
import {server} from "./server.ts";
import {resetStorage} from "./storage.ts";
import {installMatchMedia, setViewportWidth} from "./viewport.ts";

// The real i18next set-up (src/i18n: en.ts + ar.ts, the language detector); tests start in English
await i18n.changeLanguage("en");

// findBy… / waitFor wait up to 20 s instead of Testing Library's 1 s: a whole-app load (session, /me, the page, its
// data), MUI transitions and dialog forms take several times longer on a busy machine (another run beside this one;
// 5 s and then 10 s were seen to fail there). A passing wait still returns at once; only a failing test waits longer.
configure({asyncUtilTimeout: 20_000});

// jsdom has no layout, hence no scrollIntoView (the pickers scroll the highlighted row into view): nothing to scroll.
// A test that checks the calls spies on it (vi.spyOn), restored after the test.
Element.prototype.scrollIntoView = () => undefined;

installMatchMedia();
setViewportWidth();

// A request no handler answers fails (a network error for the app) and fails the test after it ends
const unhandled: string[] = [];
beforeAll(() => server.listen({
    onUnhandledRequest: (request, print) => {
        unhandled.push(`${request.method} ${request.url}`);
        print.error();
    },
}));

// The requests in flight: a test's last request (e.g. a debounced search) is answered by its own handlers, not
// counted as unhandled in the next test once the handlers are reset
let inFlight = new Set<string>();
beforeEach(() => {
    inFlight = new Set();
    server.events.on("request:start", ({requestId}) => void inFlight.add(requestId));
    server.events.on("request:end", ({requestId}) => void inFlight.delete(requestId));
    server.events.on("request:unhandled", ({requestId}) => void inFlight.delete(requestId));
});
/** Waits (up to 1 s: a handler may never answer on purpose) until the requests in flight are answered. */
const settleRequests = async () => {
    const until = Date.now() + 1_000;
    do await new Promise(resolve => setTimeout(resolve, 10));
    while (inFlight.size && Date.now() < until);
};

afterEach(async () => {
    // react-hot-toast pauses every toast's timer while a mouse is over the toaster (`AppToaster`; a click on a toast's
    // button leaves it there) and keeps that pause in its module store: end it while the toaster is still mounted, so
    // the next test's toasts time out as they should
    document.querySelectorAll("[data-rht-toaster]").forEach(toaster => fireEvent.pointerLeave(toaster));
    cleanup();
    vi.useRealTimers();
    await settleRequests();
    // react-hot-toast keeps its toasts in a module store: never let one leak into the next test
    toast.remove();
    server.resetHandlers();
    server.events.removeAllListeners();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreClipboard();
    await i18n.changeLanguage("en");
    resetStorage();
    setViewportWidth();
    // Both lists are emptied before either fails the test, so neither leaks into the next one
    const missed = unhandled.splice(0);
    const forbidden = takeForbiddenQueries();
    const problems = [
        ...(missed.length ? [`Requests without a handler (add one with server.use): ${missed.join(", ")}`] : []),
        ...(forbidden.length ? [`Queries answered 403 under renderWithProviders, which lacks the app's 403 handling ` +
            `(a toast and /me reloaded): use startApp for this case. ${forbidden.join(", ")}`] : []),
    ];
    if (problems.length) throw new Error(problems.join(" | "));
});

afterAll(() => server.close());
