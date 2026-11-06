import type {Locator, Page} from "@playwright/test";

/*
 * Dropping files on the attachments harness page (docs/design/attachments.components.contract.md § 3). The browser's own
 * `DataTransfer`, built in the page: Playwright can't drag a file from outside. Its items answer `webkitGetAsEntry()`
 * with null, and it can't hold a folder (ATT-218 is proved at level `ui`, with `aDataTransfer`).
 */

export type DroppedFile = { name: string; mimeType: string; bytes: number[] };

/** Drops `files` on `target`: dragenter, dragover, drop. */
export const dropFiles = async (target: Locator, files: DroppedFile[]) => {
    const dataTransfer = await target.page().evaluateHandle(list => {
        const data = new DataTransfer();
        for (const {name, mimeType, bytes} of list) data.items.add(new File([new Uint8Array(bytes)], name, {type: mimeType}));
        return data;
    }, files);
    for (const type of ["dragenter", "dragover", "drop"]) await target.dispatchEvent(type, {dataTransfer});
};

/**
 * A file dragged and dropped on the page's body, outside any drop area. A script's drop never navigates, so the proof
 * that a real one wouldn't is that the page cancelled both events (ATT-219).
 */
export const dropOutside = (page: Page) => page.evaluate(() => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(["x"], "outside.png", {type: "image/png"}));
    const prevented = (type: string) => {
        const event = new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer});
        document.body.dispatchEvent(event);
        return event.defaultPrevented;
    };
    return {dragover: prevented("dragover"), drop: prevented("drop")};
});
