import {screen, within} from "@testing-library/react";
import type {LanguageCode} from "../../i18n/languages.ts";
import type {DrugGroup} from "../../features/drugGroups/types.ts";
import type {Drug} from "../../features/drugs/types.ts";
import type {PrescriptionLine} from "../../features/prescription/types.ts";
import {PrescriptionPage} from "../../features/prescription/pages/PrescriptionPage.tsx";
import {drugGroupsHandlers, drugsHandlers} from "../msw.ts";
import type {ClipboardOptions} from "../clipboard.ts";
import {renderWithProviders} from "../render.tsx";
import {server} from "../server.ts";

/*
 * The prescription page (docs/features/prescription/tech.md "Page & components") of clinic 1, its lines kept in
 * localStorage["prescription.lines.1"] (tech.md "State").
 */

export const LINES_KEY = "prescription.lines.1";

/** The lines as the page stored them. */
export const storedLines = (): PrescriptionLine[] => JSON.parse(localStorage.getItem(LINES_KEY) ?? "[]");

/** Opens the page with `lines` already in the prescription, `groups` and `drugs` in the pickers. */
export const openPrescription = async (options: {
    groups?: DrugGroup[];
    drugs?: Drug[];
    lines?: PrescriptionLine[];
    lang?: LanguageCode;
    /** A stubbed clipboard (returned as `clipboard`) */
    clipboard?: ClipboardOptions;
} = {}) => {
    const {groups = [], drugs = [], lines = [], lang = "ar", clipboard} = options;
    localStorage.setItem(LINES_KEY, JSON.stringify(lines));
    server.use(...drugGroupsHandlers(groups), ...drugsHandlers(drugs));
    const rendered = await renderWithProviders(<PrescriptionPage/>, {lang, clipboard});
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
