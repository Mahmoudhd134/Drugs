import {act, screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse, type HttpHandler} from "msw";
import Quill from "quill";
import {expect} from "vitest";
import {PrescriptionPage} from "../../features/prescription/pages/PrescriptionPage.tsx";
import type {PrescriptionLine} from "../../features/prescription/types.ts";
import type {PrintTemplate, TemplateFunction, TemplateItem} from "../../features/printTemplates/types.ts";
import {aDrug, aLine, aPrintLayout, aPrintTemplate, aTemplateItem} from "../data.ts";
import {installIntersectionObserver} from "../intersection.ts";
import type {ClipboardOptions} from "../clipboard.ts";
import {api, drugsHandlers, drugTreeHandler, protocolsHandlers} from "../msw.ts";
import {pastExitTransition} from "../mui.ts";
import {installPrint} from "../print.ts";
import {renderWithProviders, type RenderWithProvidersOptions} from "../render.tsx";
import {server} from "../server.ts";
import {LINES_KEY, openPrescription} from "./prescription.tsx";

/*
 * The print flow of the prescription page (contract §§ 3.2–3.5) in Arabic: templates, the buttons, the pop-up, the sheets on
 * top of `openPrescription` and `installPrint`. jsdom has no layout, so one sheet per print here.
 */

export const PRINT = "طباعة";
export const POPUP_TITLE = "طباعة الروشتة";
export const HINT = "اطبع بمقياس 100% دون «ملاءمة للصفحة».";
export const GONE = "لم يعد لهذه العيادة قالب طباعة.";
export const CANCEL = "إلغاء";
export const TEMPLATE_PATH = "/prescription-template";

/** The template's prescription text is always this item. */
export const TEXT_ID = "text";

export const manual = (id: string, name: string) => aTemplateItem("manualInput", {id, name});
export const fn = (id: string, name: TemplateFunction) => aTemplateItem("function", {id, function: name, name: `اسم ${name}`});
export const staticText = (id: string, text: string) => aTemplateItem("staticText", {id, text});

/** A template of the prescription text and these items, in this order. */
export const templateOf = (...items: TemplateItem[]): PrintTemplate =>
    aPrintTemplate({layout: aPrintLayout({items: [aTemplateItem("prescriptionText", {id: TEXT_ID}), ...items]})});

/** One drug with a note: the name and the note are in the printed text. */
export const aPrintedLine = (name = "Tobradex", note = "رج الزجاجة"): PrescriptionLine => aLine(aDrug({name}), {}, note);

/** Whichever template the clinic has at each read: replaces what the page read when it opened. */
export const templateNowIs = (template: PrintTemplate | null) => server.use(
    http.get(api(TEMPLATE_PATH), () => (template ? HttpResponse.json(template) : new HttpResponse(null, {status: 204}))),
);

/** `GET /prescription-template` answered only when the test says so. */
export const heldRead = (template: PrintTemplate | null) => {
    let release = () => undefined as void;
    const held = new Promise<void>(resolve => {
        release = resolve;
    });
    let calls = 0;
    server.use(http.get(api(TEMPLATE_PATH), async () => {
        calls++;
        await held;
        return template ? HttpResponse.json(template) : new HttpResponse(null, {status: 204});
    }));
    return {release: () => release(), calls: () => calls};
};

/**
 * The page with `template` and `lines`, Print shown (when it has one), `window.print` stubbed. `print`, `finishPrint`, `sheets`… are
 * `installPrint`'s; `selection`, `user`, `clipboard`… `openPrescription`'s.
 */
export const openWithTemplate = async (template: PrintTemplate | null, options: {
    lines?: PrescriptionLine[];
    lang?: "ar" | "en";
    clipboard?: ClipboardOptions;
} = {}) => {
    const {lines = [aPrintedLine()], lang = "ar", clipboard} = options;
    const printName = lang === "ar" ? PRINT : "Print";
    const printing = installPrint();
    const page = await openPrescription({template, lines, lang, clipboard});
    const panelPrint = () => page.selection().getByRole("button", {name: printName, hidden: true});
    if (template) await waitFor(() => panelPrint());
    return {...page, ...printing, panelPrint, pressPrint: () => page.user.click(panelPrint())};
};

export type PrintPage = Awaited<ReturnType<typeof openWithTemplate>>;

/**
 * The page's own providers with any answer to the read when the page opens (a failure, say), for a page opened again on the same
 * QueryClient (`queryClient`), as a navigation does.
 */
export const openWithRead = async (read: HttpHandler, lines: PrescriptionLine[] = [aPrintedLine()], options: RenderWithProvidersOptions = {}) => {
    localStorage.setItem(LINES_KEY, JSON.stringify(lines));
    server.use(...protocolsHandlers([]), drugTreeHandler([]), ...drugsHandlers([]), read);
    installIntersectionObserver();
    return renderWithProviders(<PrescriptionPage/>, {lang: "ar", ...options});
};

/** The pop-up, once it shows. */
export const findPopup = () => screen.findByRole("dialog", {name: POPUP_TITLE});
export const queryPopup = () => screen.queryByRole("dialog", {name: POPUP_TITLE});

/** The pop-up's fields, in order. */
export const popupFields = (popup: HTMLElement) => within(popup).getAllByRole("textbox") as HTMLInputElement[];
export const confirmButton = (popup: HTMLElement) => within(popup).getByRole("button", {name: PRINT});
export const cancelButton = (popup: HTMLElement) => within(popup).getByRole("button", {name: CANCEL});

/** The dialog of «تعديل ونسخ», after the click that opens it, with its text loaded. */
export const openEditor = async (page: Pick<PrintPage, "user" | "selection">) => {
    await page.user.click(page.selection().getByRole("button", {name: "تعديل ونسخ"}));
    await waitFor(() => expect(document.querySelector(".ql-editor")).not.toBeNull());
    return screen.findByRole("dialog", {name: "تعديل قبل النسخ أو الطباعة"});
};

const quill = () => Quill.find(document.querySelector(".ql-container") as HTMLElement) as Quill;

/** The editor's text, in plain text. */
export const editorText = () => document.querySelector(".ql-editor")?.textContent ?? "";

/** Replaces the editor's text, as the doctor typing it. */
export const typeInEditor = (text: string) => act(() => {
    quill().setText(text, "user");
});

/** Empties the editor and leaves one empty numbered item. */
export const oneEmptyListItem = () => act(() => {
    quill().setContents([{insert: "\n", attributes: {list: "ordered"}}] as never, "user");
});

/** The buttons of the editor's or pop-up's actions, in order. */
export const actionsOf = (dialog: HTMLElement) =>
    within(dialog.querySelector(".MuiDialogActions-root") as HTMLElement).getAllByRole("button");

/** The Print button of the editor. */
export const editorPrint = (editor: HTMLElement, name = PRINT) =>
    within(editor.querySelector(".MuiDialogActions-root") as HTMLElement).getByRole("button", {name});

/** What a short item shows on a sheet. */
export const valueOn = (sheet: HTMLElement, id: string) => sheet.querySelector(`[data-item-id="${id}"]`)?.textContent;

/** The HTML of the prescription text's box on a sheet. */
export const textBox = (sheet: HTMLElement) => sheet.querySelector<HTMLElement>(`[data-item-id="${TEXT_ID}"] .print-text`);

/** Past the transitions and anything in flight: then "nothing printed" means nothing is coming. */
export const settled = async () => {
    await pastExitTransition();
    await pastExitTransition();
};

/** The rules of the `@page` kind on the page now. */
export const pageRules = () => Array.from(document.querySelectorAll("style"))
    .flatMap(style => (style.textContent ?? "").match(/@page\b/g) ?? []);
