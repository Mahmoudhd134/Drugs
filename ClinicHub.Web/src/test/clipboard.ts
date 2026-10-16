import {vi} from "vitest";

export type ClipboardOptions = {
    /** The async clipboard refuses the copy (NotAllowedError) */
    fails?: boolean;
    /** What `document.execCommand("copy")` (the fallback) answers (default false) */
    execCommand?: boolean;
};

const restores: (() => void)[] = [];

/** Puts back `navigator.clipboard` and `document.execCommand` as they were before {@link stubClipboard} (setup.ts, after each test). */
export const restoreClipboard = () => {
    while (restores.length) restores.pop()!();
};

/**
 * A secure context whose async clipboard takes the copy (`written()` reads back each format), or refuses it (`fails`),
 * with `execCommand("copy")` answering `execCommand` (the fallback). userEvent.setup() installs its own clipboard on
 * `navigator`: call this after it, or let `renderWithProviders({clipboard})` / `startApp({clipboard})` do it.
 * Restored after each test (setup.ts).
 */
export const stubClipboard = (options: ClipboardOptions = {}) => {
    let items: Record<string, Blob> = {};
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("ClipboardItem", class {
        constructor(record: Record<string, Blob>) {
            items = record;
        }
    });
    const write = vi.fn(async () => {
        if (options.fails) throw new DOMException("Write permission denied.", "NotAllowedError");
    });
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const previousExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");
    Object.defineProperty(navigator, "clipboard", {value: {write}, configurable: true});
    const execCommand = vi.fn(() => options.execCommand ?? false);
    Object.defineProperty(document, "execCommand", {value: execCommand, configurable: true, writable: true});
    restores.push(() => {
        if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
        else Reflect.deleteProperty(navigator, "clipboard");
        if (previousExecCommand) Object.defineProperty(document, "execCommand", previousExecCommand);
        else Reflect.deleteProperty(document, "execCommand");
    });
    const read = (blob: Blob | undefined) => new Promise<string | null>(resolve => {
        if (!blob) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsText(blob);
    });
    return {
        write,
        execCommand,
        written: async () => ({html: await read(items["text/html"]), text: await read(items["text/plain"])}),
    };
};

export type StubbedClipboard = ReturnType<typeof stubClipboard>;
