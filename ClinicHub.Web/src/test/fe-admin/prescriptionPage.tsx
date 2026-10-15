import {screen, within} from "@testing-library/react";
import {vi} from "vitest";
import type {LanguageCode} from "../../i18n/languages.ts";
import type {DrugGroup} from "../../features/drugGroups/types.ts";
import type {Drug} from "../../features/drugs/types.ts";
import type {PrescriptionLine} from "../../features/prescription/types.ts";
import {PrescriptionPage} from "../../features/prescription/pages/PrescriptionPage.tsx";
import {drugGroupsHandlers, drugsHandlers} from "../msw.ts";
import {renderWithProviders} from "../render.tsx";
import {server} from "../server.ts";
import "./patience.ts";

/*
 * The prescription page (docs/features/prescription/tech.md "Page & components") of clinic 1, its lines kept in
 * localStorage["prescription.lines.1"] (tech.md "State").
 */

export const LINES_KEY = "prescription.lines.1";

// jsdom has no layout: the pickers scroll the highlighted row into view
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;

/** The lines as the page stored them. */
export const storedLines = (): PrescriptionLine[] => JSON.parse(localStorage.getItem(LINES_KEY) ?? "[]");

/** Opens the page with `lines` already in the prescription, `groups` and `drugs` in the pickers. */
export const openPrescription = async (options: {
    groups?: DrugGroup[];
    drugs?: Drug[];
    lines?: PrescriptionLine[];
    lang?: LanguageCode;
} = {}) => {
    const {groups = [], drugs = [], lines = [], lang = "ar"} = options;
    localStorage.setItem(LINES_KEY, JSON.stringify(lines));
    server.use(...drugGroupsHandlers(groups), ...drugsHandlers(drugs));
    const rendered = await renderWithProviders(<PrescriptionPage/>, {lang});
    const texts = lang === "ar"
        ? {selected: "الأدوية المختارة", drugsTab: "الأدوية", groupsTab: "المجموعات"}
        : {selected: "Selected drugs", drugsTab: "Drugs", groupsTab: "Groups"};
    /** The «الأدوية المختارة» panel (the lines, the count, Clear all, Copy, Edit & copy). */
    const selection = () => within(screen.getByText(texts.selected).closest(".MuiPaper-root") as HTMLElement);
    const addGroup = async (name = "Post cataract") => rendered.user.click(await screen.findByText(name));
    const addDrug = async (name: string) => {
        await rendered.user.click(screen.getByRole("tab", {name: texts.drugsTab}));
        const list = screen.getByRole("tab", {name: texts.drugsTab}).closest(".MuiPaper-root") as HTMLElement;
        await rendered.user.click(await within(list).findByText(name));
    };
    /** Clicks a button of the open dialog. */
    const answer = async (button: string) =>
        rendered.user.click(within(await screen.findByRole("dialog")).getByRole("button", {name: button}));
    return {...rendered, selection, addGroup, addDrug, answer, texts};
};

/**
 * Call it after rendering (userEvent.setup() installs its own clipboard on `navigator`).
 * A secure context whose async clipboard takes the copy (`written()` reads back each format), or refuses it
 * (`fails`), with execCommand("copy") answering `execCommand` (the fallback). Restored after each test (setup.ts).
 */
export const stubClipboard = (options: { fails?: boolean; execCommand?: boolean } = {}) => {
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
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {value: {write}, configurable: true});
    const execCommand = vi.fn(() => options.execCommand ?? false);
    Object.defineProperty(document, "execCommand", {value: execCommand, configurable: true, writable: true});
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
        restore: () => {
            if (previous) Object.defineProperty(navigator, "clipboard", previous);
            else Object.defineProperty(navigator, "clipboard", {value: undefined, configurable: true});
        },
    };
};
