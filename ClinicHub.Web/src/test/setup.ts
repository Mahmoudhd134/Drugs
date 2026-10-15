import "@testing-library/jest-dom/vitest";
import {afterAll, afterEach, beforeAll, vi} from "vitest";
import {cleanup} from "@testing-library/react";
import toast from "react-hot-toast";
import i18n from "../i18n";
import {server} from "./server.ts";
import {resetStorage} from "./storage.ts";
import {installMatchMedia, setViewportWidth} from "./viewport.ts";

// The real i18next set-up (src/i18n: en.ts + ar.ts, the language detector); tests start in English
await i18n.changeLanguage("en");

installMatchMedia();
setViewportWidth();

beforeAll(() => server.listen({onUnhandledRequest: "error"}));

afterEach(async () => {
    cleanup();
    // react-hot-toast keeps its toasts in a module store: never let one leak into the next test
    toast.remove();
    server.resetHandlers();
    server.events.removeAllListeners();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    await i18n.changeLanguage("en");
    resetStorage();
    setViewportWidth();
});

afterAll(() => server.close());
