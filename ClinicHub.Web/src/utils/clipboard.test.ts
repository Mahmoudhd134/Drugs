import {describe, expect, test, vi} from "vitest";
import {copyRichText, copyText} from "./clipboard.ts";

// Rules: docs/features/prescription/tech.md "Clipboard (src/utils/clipboard.ts)".

/** What a `copy` event put on the clipboard (the browser fires it on execCommand("copy")). */
const fakeExecCommand = (succeeds = true) => {
    const clipboard: Record<string, string> = {};
    let prevented = false;
    let selected = "";
    const execCommand = vi.fn((command: string) => {
        if (command !== "copy") return false;
        // What a copy takes: the selected text of the hidden textarea
        const textarea = document.querySelector("textarea");
        selected = textarea ? textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) : "";
        const event = new Event("copy", {cancelable: true});
        Object.defineProperty(event, "clipboardData", {value: {setData: (type: string, data: string) => void (clipboard[type] = data)}});
        document.dispatchEvent(event);
        prevented = event.defaultPrevented;
        return succeeds;
    });
    Object.defineProperty(document, "execCommand", {value: execCommand, configurable: true, writable: true});
    return {clipboard, execCommand, prevented: () => prevented, selected: () => selected};
};

const readBlob = (blob: Blob) => new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
});

const insecure = () => {
    vi.stubGlobal("isSecureContext", false);
    Object.defineProperty(navigator, "clipboard", {value: undefined, configurable: true});
};

const secure = (clipboard: Partial<Clipboard>) => {
    vi.stubGlobal("isSecureContext", true);
    Object.defineProperty(navigator, "clipboard", {value: clipboard, configurable: true});
    vi.stubGlobal("ClipboardItem", class {
        items: Record<string, Blob>;

        constructor(items: Record<string, Blob>) {
            this.items = items;
        }
    });
};

describe("copyRichText @area:prescription", () => {
    test("plain http: the copy-event fallback puts both HTML and plain text on the clipboard @RX-074", async () => {
        insecure();
        const fake = fakeExecCommand();
        await expect(copyRichText("<p><strong>A</strong></p>", "A")).resolves.toBe(true);
        expect(fake.execCommand).toHaveBeenCalledWith("copy");
        expect(fake.clipboard).toEqual({"text/html": "<p><strong>A</strong></p>", "text/plain": "A"});
        expect(fake.prevented()).toBe(true);

        // The listener is gone afterwards: a later copy by the user is left alone
        const later = new Event("copy", {cancelable: true});
        Object.defineProperty(later, "clipboardData", {value: {setData: vi.fn()}});
        document.dispatchEvent(later);
        expect(later.defaultPrevented).toBe(false);
    });

    test("the fallback reports a refused copy", async () => {
        insecure();
        fakeExecCommand(false);
        await expect(copyRichText("<p>x</p>", "x")).resolves.toBe(false);
    });

    test("HTTPS: the async Clipboard API gets both formats", async () => {
        const write = vi.fn(async () => undefined);
        secure({write});
        const fake = fakeExecCommand();
        await expect(copyRichText("<p>x</p>", "x")).resolves.toBe(true);
        const [[[item]]] = write.mock.calls as unknown as [[[{ items: Record<string, Blob> }]]];
        expect(Object.keys(item.items)).toEqual(["text/html", "text/plain"]);
        expect(await readBlob(item.items["text/html"])).toBe("<p>x</p>");
        expect(item.items["text/html"].type).toBe("text/html");
        expect(await readBlob(item.items["text/plain"])).toBe("x");
        expect(item.items["text/plain"].type).toBe("text/plain");
        expect(fake.execCommand).not.toHaveBeenCalled();
    });

    test("plain http where the browser still has a Clipboard API: it is not used, the fallback is", async () => {
        const write = vi.fn(async () => undefined);
        secure({write});
        vi.stubGlobal("isSecureContext", false);
        const fake = fakeExecCommand();
        await expect(copyRichText("<p>x</p>", "x")).resolves.toBe(true);
        expect(write).not.toHaveBeenCalled();
        expect(fake.clipboard).toEqual({"text/html": "<p>x</p>", "text/plain": "x"});
    });

    test("HTTPS without ClipboardItem (older browser): the fallback is used", async () => {
        const write = vi.fn(async () => undefined);
        secure({write});
        vi.stubGlobal("ClipboardItem", undefined);
        const fake = fakeExecCommand();
        await expect(copyRichText("<p>x</p>", "x")).resolves.toBe(true);
        expect(write).not.toHaveBeenCalled();
        expect(fake.clipboard["text/html"]).toBe("<p>x</p>");
    });

    test("HTTPS but the Clipboard API refuses: the fallback is used", async () => {
        secure({write: vi.fn(async () => Promise.reject(new DOMException("denied", "NotAllowedError")))});
        const fake = fakeExecCommand();
        await expect(copyRichText("<p>x</p>", "x")).resolves.toBe(true);
        expect(fake.clipboard["text/plain"]).toBe("x");
    });
});

describe("copyText @area:prescription", () => {
    test("HTTPS: writeText", async () => {
        const writeText = vi.fn(async () => undefined);
        secure({writeText});
        await expect(copyText("hello")).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith("hello");
    });

    test("plain http where the browser still has writeText: it is not used", async () => {
        const writeText = vi.fn(async () => undefined);
        secure({writeText});
        vi.stubGlobal("isSecureContext", false);
        const fake = fakeExecCommand();
        await expect(copyText("hello")).resolves.toBe(true);
        expect(writeText).not.toHaveBeenCalled();
        expect(fake.selected()).toBe("hello");
    });

    test("plain http, or writeText refused: a hidden textarea is copied and removed", async () => {
        insecure();
        const fake = fakeExecCommand();
        await expect(copyText("hello")).resolves.toBe(true);
        expect(fake.selected()).toBe("hello");
        expect(document.querySelector("textarea")).toBeNull();

        secure({writeText: vi.fn(async () => Promise.reject(new Error("denied")))});
        const refused = fakeExecCommand(false);
        await expect(copyText("again")).resolves.toBe(false);
        expect(refused.selected()).toBe("again");
        expect(document.querySelector("textarea")).toBeNull();
    });
});
