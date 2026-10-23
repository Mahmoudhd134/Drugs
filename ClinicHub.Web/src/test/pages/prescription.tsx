import {screen, within} from "@testing-library/react";
import type {LanguageCode} from "../../i18n/languages.ts";
import type {Protocol} from "../../features/protocols/types.ts";
import type {Drug} from "../../features/drugs/types.ts";
import type {PrescriptionLine} from "../../features/prescription/types.ts";
import {PrescriptionPage} from "../../features/prescription/pages/PrescriptionPage.tsx";
import {protocolsHandlers, drugsHandlers, drugTreeHandler} from "../msw.ts";
import {installIntersectionObserver} from "../intersection.ts";
import {addDrugThroughTree, treeTexts} from "./drugTree.tsx";
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

/**
 * Opens the page with `lines` already in the prescription, `protocols` in the protocol picker and `drugs` in the drug
 * tree (`GET /drugs/tree` + `GET /drugs`), with the IntersectionObserver fake (`io`).
 */
export const openPrescription = async (options: {
    protocols?: Protocol[];
    drugs?: Drug[];
    lines?: PrescriptionLine[];
    lang?: LanguageCode;
    /** A stubbed clipboard (returned as `clipboard`) */
    clipboard?: ClipboardOptions;
} = {}) => {
    const {protocols = [], drugs = [], lines = [], lang = "ar", clipboard} = options;
    localStorage.setItem(LINES_KEY, JSON.stringify(lines));
    server.use(...protocolsHandlers(protocols), drugTreeHandler(drugs), ...drugsHandlers(drugs));
    const io = installIntersectionObserver();
    const rendered = await renderWithProviders(<PrescriptionPage/>, {lang, clipboard});
    const texts = lang === "ar"
        ? {selected: "الأدوية المختارة", drugsTab: "الأدوية", protocolsTab: "البروتوكولات", treeSearch: treeTexts("ar").search}
        : {selected: "Selected drugs", drugsTab: "Drugs", protocolsTab: "Protocols", treeSearch: treeTexts("en").search};
    /** The «الأدوية المختارة» panel (the lines, the count, Clear all, Copy, Edit & copy). */
    const selection = () => within(screen.getByText(texts.selected).closest(".MuiPaper-root") as HTMLElement);
    const addProtocol = async (name = "Post cataract") => rendered.user.click(await screen.findByText(name));
    /** Opens «الأدوية» and adds `name` through the tree (searched by its name; see `addDrugThroughTree`). */
    const addDrug = async (name: string) => {
        await rendered.user.click(screen.getByRole("tab", {name: texts.drugsTab}));
        await addDrugThroughTree(rendered.user, drugs, name, lang);
    };
    /** Clicks a button of the open dialog. */
    const answer = async (button: string) =>
        rendered.user.click(within(await screen.findByRole("dialog")).getByRole("button", {name: button}));
    return {...rendered, selection, addProtocol, addDrug, answer, texts, io};
};
