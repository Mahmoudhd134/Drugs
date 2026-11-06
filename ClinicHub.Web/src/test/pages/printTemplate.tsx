import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import type {RequestHandler} from "msw";
import {expect} from "vitest";
import i18n from "../../i18n";
import type {ClinicDetails} from "../../features/admin/types.ts";
import {adminPrintTemplateApi} from "../../features/admin/adapters.ts";
import type {Attachment, AttachmentRules} from "../../features/attachments/types.ts";
import {TemplateDesigner} from "../../features/printTemplates/components/TemplateDesigner.tsx";
import type {PrintLayout, PrintTemplate} from "../../features/printTemplates/types.ts";
import {aClinicDetails, aPrintTemplate} from "../data.ts";
import {adminClinicsHandlers, api, paperImageHandlers, printTemplateHandlers, type recordRequests} from "../msw.ts";
import {isRed} from "../mui.ts";
import {server} from "../server.ts";
import {renderWithProviders, type RenderWithProvidersOptions} from "../render.tsx";
import {renderAdmin} from "./admin.tsx";

/*
 * The print template tab as the super admin sees it (contract § 3): `/admin/clinics/{id}/print-template` in the admin
 * routes, on a data router (the designer's guard needs one), with the template API answered. Finds the designer's parts by
 * their accessible names in the current language.
 */

export type RenderPrintTemplateTabOptions = Omit<RenderWithProvidersOptions, "route" | "path" | "dataRouter"> & {
    clinic?: ClinicDetails;
    /** The clinic's template (default: none, `GET` answers 204) */
    template?: PrintTemplate | null;
    /** Writes change what the next `GET` answers (default true; `printTemplateHandlers`) */
    stateful?: boolean;
    /** AdminLayout's frame: app bar (logo, user menu) and sidebar (default false) */
    layout?: boolean;
    /** Answers of the test's own, in front of the default ones from the first request on (e.g. a held or failing `GET`) */
    handlers?: RequestHandler[];
    /** The clinic's stored paper images, newest first (default none); `paperImageHandlers` changes the array in place, and it comes back as `paperImages` */
    paperImages?: Attachment[];
    /** What `GET …/paper-image/rules` answers (default `PAPER_RULES`) */
    paperRules?: AttachmentRules;
    /** The row an upload stores (default `aPaperImage()`): jsdom can't read the picked file's name */
    paperStored?: () => Attachment;
};

export const renderPrintTemplateTab = async ({clinic = aClinicDetails(), template = null, stateful = true, handlers = [], paperImages = [], paperRules, paperStored, ...options}: RenderPrintTemplateTabOptions = {}) => {
    server.use(
        ...adminClinicsHandlers([clinic]),
        ...printTemplateHandlers(clinic.id, {template, stateful}),
        ...paperImageHandlers(clinic.id, paperImages, {rules: paperRules, stored: paperStored}),
    );
    // A later `server.use` goes in front; inside one call the first match wins
    server.use(...handlers);
    const rendered = await renderAdmin(`/admin/clinics/${clinic.id}/print-template`, {dataRouter: true, ...options});
    return {...rendered, clinic, paperImages};
};

/** A text of the locale files in the current language (to find a part of the screen, never to assert a message). */
export const label = (key: string) => i18n.t(key);

/** The side panel. */
export const sidePanel = () => screen.getByRole("region", {name: label("printTemplates.panel.label")});
/** The scrolling area holding the sheet. */
export const sheetArea = () => screen.getByRole("region", {name: label("printTemplates.sheet.label")});
/** The settings panel. */
export const settingsPanel = () => screen.getByRole("region", {name: label("printTemplates.config.label")});

/** An entry of the side panel, by its label (`printTemplates.kinds.*`, `printTemplates.functions.*`). */
export const panelEntry = (name: string) => within(sidePanel()).getByRole("button", {name});
/** An item's box on the sheet: named by its name, its static text, or (prescription text, empty text) its kind's label. */
export const sheetItem = (name: string) => within(sheetArea()).getByRole("button", {name});

/*
 * The settings' sections (step 4 contract § 4.3.1): at most one is open, and what's in a closed one is mounted but out of reach. A helper that reaches a field opens its section first,
 * with no focus moved, as a person would before using it, so a test of anything else doesn't depend on which one is open. A test of the sections themselves reads `openSections`,
 * `sectionButton` and `sectionMark`, which open nothing.
 */
const SECTION_TITLE = {
    page: "printTemplates.page.title",
    calibration: "printTemplates.calibration.title",
    item: "printTemplates.config.itemSection",
    paper: "printTemplates.paper.title",
} as const;
export type SettingsSectionName = keyof typeof SECTION_TITLE;

/** A section's accordion, or null: no such section (no paper adapter), or no designer. By its attribute, since these helpers run often and a role query over the page is slow. */
const sectionRoot = (section: SettingsSectionName) => document.querySelector<HTMLElement>(`[data-settings-section="${section}"]`);
/** A section's header, whose name `sectionButton` proves. */
const headerIn = (root: Element) => root.querySelector<HTMLElement>("[aria-expanded]")!;
/** Clicks the header of a closed section. */
const openRoot = (root: Element) => {
    const header = headerIn(root);
    if (header.getAttribute("aria-expanded") !== "true") fireEvent.click(header);
};
/** A section's header: a button named by its title, whether or not it's marked. */
export const sectionButton = (section: SettingsSectionName) => within(settingsPanel()).getByRole("button", {name: label(SECTION_TITLE[section])});
/** The open sections, in order. Opens nothing. */
export const openSections = () => (Object.keys(SECTION_TITLE) as SettingsSectionName[]).filter(section => {
    const root = sectionRoot(section);
    return !!root && headerIn(root).getAttribute("aria-expanded") === "true";
});
/** The mark on a section's header, or null. Opens nothing. */
export const sectionMark = (section: SettingsSectionName) => within(sectionButton(section)).queryByRole("img", {name: label("printTemplates.config.sectionError")});
/** Opens the section unless it's open: never closes one. */
export const openSection = (section: SettingsSectionName) => {
    const root = sectionRoot(section);
    if (!root) throw new Error(`No section ${section} in the settings`);
    openRoot(root);
    return root;
};
/** A field by its label, in a closed section too: no role query reaches that, and this opens nothing (`settingsField` is the one to use). */
export const fieldAnywhere = (name: string) => within(settingsPanel()).queryByLabelText(name, {selector: "input, textarea"});

/** A text field of the settings panel, by its label (`printTemplates.config.*`, `printTemplates.page.width|height`), its section opened first. */
export const settingsField = (name: string) => {
    const root = fieldAnywhere(name)?.closest<HTMLElement>("[data-settings-section]");
    if (root) openRoot(root);
    return within(root ?? settingsPanel()).getByRole("textbox", {name});
};

/** Replaces a field's text, as typing does. */
export const typeInField = async (user: UserEvent, field: HTMLElement, value: string) => {
    await user.clear(field);
    if (value) await user.type(field, value);
};

/** The labels of the settings fields in English, the tests' default language. */
export const FIELD_LABEL = {
    x: "X: from the left (mm)",
    y: "Y: from the top (mm)",
    width: "Width (mm)",
    height: "Height (mm)",
    font: "Font size (pt)",
    name: "Name",
    text: "Text",
    pageWidth: "Sheet width (mm)",
    pageHeight: "Sheet height (mm)",
} as const;

/** The tab's API path as `recordRequests` reports it. */
export const templatePath = (clinicId: number) => `/admin/clinics/${clinicId}/prescription-template`;
/** The tab's API URL for a handler of the test's own. */
export const templateUrl = (clinicId: number) => api(templatePath(clinicId));
/** The tab's page URL. */
export const tabPath = (clinicId: number) => `/admin/clinics/${clinicId}/print-template`;

/** Waits for the designer (a template loaded, or a new sheet). */
export const designerShown = () => screen.findByRole("region", {name: label("printTemplates.sheet.label")});

/** The tab with a saved template of `layout`, its designer on screen. */
export const renderDesigner = async (layout: PrintLayout, options: RenderPrintTemplateTabOptions = {}) => {
    const rendered = await renderPrintTemplateTab({template: aPrintTemplate({layout}), ...options});
    await designerShown();
    return rendered;
};

/** The tab of a clinic with no template, its «إنشاء قالب» pressed: a new sheet on screen. */
export const renderNewSheet = async (options: RenderPrintTemplateTabOptions = {}) => {
    const rendered = await renderPrintTemplateTab(options);
    await rendered.user.click(await screen.findByRole("button", {name: label("printTemplates.create")}));
    await designerShown();
    return rendered;
};

/** The sheet (`TemplateSheet`'s root). */
export const theSheet = () => within(sheetArea()).getByTestId("template-sheet");
/** Every item's box on the sheet, in the layout's order. */
export const sheetBoxes = () => Array.from(theSheet().querySelectorAll<HTMLElement>("[data-item-id]"));
/** An item's box by its id. */
export const boxOf = (id: string) => {
    const box = sheetBoxes().find(b => b.dataset.itemId === id);
    if (!box) throw new Error(`No item ${id} on the sheet: ${sheetBoxes().map(b => b.dataset.itemId).join(", ")}`);
    return box;
};
/** The ids of the selected items (`aria-pressed`). */
export const selectedIds = () => sheetBoxes().filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.dataset.itemId);
/** A box's place, size and font as the sheet draws them (inline styles: true mm, never flipped). */
export const measuresOf = ({style}: HTMLElement) =>
    ({x: style.left, y: style.top, w: style.width, h: style.height, font: style.fontSize});
/** The size of the sheet as drawn. */
export const sheetSize = () => ({w: theSheet().style.width, h: theSheet().style.height});

/** The toolbar's buttons (step 3 contract § 3.2). */
export const undoButton = () => screen.getByRole("button", {name: label("printTemplates.toolbar.undo")});
export const redoButton = () => screen.getByRole("button", {name: label("printTemplates.toolbar.redo")});
export const zoomOutButton = () => screen.getByRole("button", {name: label("printTemplates.toolbar.zoomOut")});
export const zoomInButton = () => screen.getByRole("button", {name: label("printTemplates.toolbar.zoomIn")});
export const fitButton = () => screen.getByRole("button", {name: label("printTemplates.toolbar.fit")});
/** The percentage as shown: jsdom has no layout, so Fit is 100 there (`fitZoom`). */
export const zoomPercent = () => screen.getByTestId("template-zoom-percent").textContent;
/** A resize handle of the selected item (step 3 contract § 3.3), or null. */
export const handleOf = (id: string) => screen.queryByTestId(`template-handle-${id}`);
/** Every resize handle on screen, by id. */
export const handleIds = () => screen.queryAllByTestId(/^template-handle-/).map(handle => handle.dataset.handle);
/** The guide lines on screen. */
export const guideLines = () => screen.queryAllByTestId("template-guide");
/** A panel drag's ghost, or null. */
export const dragGhost = () => screen.queryByTestId("template-drag-ghost");
/** The designer's root (step 3 contract § 3.5): the keys act on what is inside it. */
export const designerRoot = () => screen.getByTestId("template-designer");

/** The `code` of a key without a modifier, for the designer's listener; a test of the layouts sets its own `code` and `key`. */
const CODE_OF: Record<string, string> = {Alt: "AltLeft", Escape: "Escape", Delete: "Delete", Backspace: "Backspace"};

/**
 * A `keydown` on `target`, which must hold the focus as a real key's would (`focusOn`). True when the designer handled the key:
 * `fireEvent` answers false when `preventDefault` ran (step 3 contract § 4.1).
 */
export const pressKey = (target: Element, key: string, init: KeyboardEventInit = {}) =>
    !fireEvent.keyDown(target, {key, code: CODE_OF[key] ?? key, ...init});
/** A `keyup` on `target`; true when `preventDefault` ran. */
export const releaseKey = (target: Element, key: string, init: KeyboardEventInit = {}) =>
    !fireEvent.keyUp(target, {key, code: CODE_OF[key] ?? key, ...init});
/** `pressKey` on whatever has the focus. */
export const pressKeyOnFocus = (key: string, init: KeyboardEventInit = {}) =>
    pressKey(document.activeElement ?? document.body, key, init);
/** The three shortcuts on a Latin layout (contract § 3.5); `code` decides, whatever the layout's `key`. */
export const UNDO_KEYS = {key: "z", code: "KeyZ", ctrlKey: true} as const;
export const REDO_KEYS = {key: "y", code: "KeyY", ctrlKey: true} as const;
export const REDO_SHIFT_KEYS = {key: "z", code: "KeyZ", ctrlKey: true, shiftKey: true} as const;
/** A shortcut (`UNDO_KEYS`, …) on `target`; true when the designer handled it. */
export const pressShortcut = (target: Element, keys: KeyboardEventInit) => !fireEvent.keyDown(target, keys);

/** Moves the focus, as a Tab or a click would. */
export const focusOn = (element: HTMLElement) => act(() => element.focus());
/** Nothing focused: `document.activeElement` is `body` (a focused box just left). */
export const blurAll = () => act(() => (document.activeElement as HTMLElement | null)?.blur());

const pointer = (clientX: number, clientY: number) => ({pointerId: 1, button: 0, buttons: 1, clientX, clientY});
/**
 * The main button pressed on `element`, then moved past the threshold, button held: a drag in progress. jsdom has no layout, so
 * where it would land can't be read here (step 3 contract § 4.1), only that it runs. End it with Esc.
 */
export const startDrag = (element: HTMLElement) => {
    fireEvent.pointerDown(element, pointer(100, 100));
    fireEvent.pointerMove(element, pointer(130, 100));
};
/** A press, a move of `distance` px to the right, and the release, as a mouse gives them. */
export const pressMoveRelease = (element: HTMLElement, distance: number) => {
    fireEvent.pointerDown(element, pointer(100, 100));
    if (distance > 0) fireEvent.pointerMove(element, pointer(100 + distance, 100));
    fireEvent.pointerUp(element, {...pointer(100 + distance, 100), buttons: 0});
};
/** `pressMoveRelease` and the `click` a mouse's release gives (`detail` 1). */
export const pressAndRelease = (element: HTMLElement, distance: number) => {
    pressMoveRelease(element, distance);
    fireEvent.click(element, {detail: 1, clientX: 100 + distance, clientY: 100});
};

export const saveButton = () => screen.getByRole("button", {name: label("common.save")});
export const deleteButton = () => screen.getByRole("button", {name: label("common.delete")});
export const paperSize = () => within(openSection("page")).getByRole("combobox", {name: name => name.startsWith(label("printTemplates.page.size"))});

/** The field is red with `message` under it. */
export const expectFieldMessage = (field: HTMLElement, message: string) => {
    expect(isRed(field), `${field.getAttribute("aria-label") ?? "the field"} is red`).toBe(true);
    expect(field).toHaveAccessibleDescription(expect.stringContaining(message));
};

export const expectNoFieldMessage = (field: HTMLElement) => expect(isRed(field)).toBe(false);

/**
 * What a close or a reload meets: true when a listener asks for the browser's prompt (`preventDefault` on `beforeunload`,
 * the only thing a page can do; the prompt itself: e2e, TPL-232).
 */
export const unloadAsks = () => {
    const event = new Event("beforeunload", {cancelable: true});
    window.dispatchEvent(event);
    return event.defaultPrevented;
};

/** The unsaved-changes question. */
export const leaveQuestion = () => screen.findByRole("dialog", {name: label("printTemplates.unsavedMessage")});
export const noLeaveQuestion = () =>
    expect(screen.queryByRole("dialog", {name: label("printTemplates.unsavedMessage")})).not.toBeInTheDocument();
/**
 * Every dialog and menu has left the document. MUI hides the rest of the page from the accessibility tree until a closing
 * dialog's exit transition ends, so a role query on the page waits for this.
 */
export const dialogsGone = () => waitFor(() => expect(document.querySelector(".MuiDialog-root, .MuiMenu-root")).toBeNull());
/** Answers the question and waits until it has gone. */
export const answerQuestion = async (user: UserEvent, answer: "stay" | "leave") => {
    const question = await leaveQuestion();
    await user.click(within(question).getByRole("button", {name: label(answer === "stay" ? "common.cancel" : "printTemplates.leave")}));
    await dialogsGone();
};

/**
 * Nothing was sent: long enough for a request the click had started to reach the recorder (a request that isn't there can't
 * be waited for).
 */
export const expectNothingSent = async (recorded: ReturnType<typeof recordRequests>) => {
    await act(() => new Promise<void>(resolve => setTimeout(resolve, 50)));
    expect(recorded.writes()).toEqual([]);
};

/*
 * Step 4 (contract § 8.1): the printer's correction, Test print and the paper image. A test with a stored picture calls `stubObjectUrls()` of `pages/attachments.tsx` first: jsdom has no
 * `URL.createObjectURL`. jsdom draws nothing, so `img` never fires `load` or `error` by itself: `fireEvent.error(paperImage()!)` is a picture that won't decode (TPL-665).
 */

/** The labels of the correction's fields in English, the tests' default language. */
export const CALIBRATION_LABEL = {x: "X: + moves right (mm)", y: "Y: + moves down (mm)"} as const;

/** The "Printer correction" section, opened. */
export const calibrationSection = () => within(openSection("calibration")).getByRole("region", {name: label("printTemplates.calibration.title")});
/** X or Y of the correction (`printTemplates.calibration.x`, `.y`), in the current language. */
export const calibrationField = (axis: "x" | "y") => within(calibrationSection()).getByRole("textbox", {name: label(`printTemplates.calibration.${axis}`)});
/** The cut warning, or null (a warning, never an error). */
export const cutWarning = () => screen.queryByTestId("template-cut-warning");

/** The Test print button, beside Save. */
export const testPrintButton = () => screen.getByRole("button", {name: label("printTemplates.testPrint.button")});

/** The "Paper image" section, opened, or null with no paper adapter (TPL-644), and before `paperSectionShown`. */
export const paperSection = () => {
    const root = sectionRoot("paper");
    if (!root) return null;
    openRoot(root);
    return within(root).queryByRole("region", {name: label("printTemplates.paper.title")});
};
/** Waits for the section, opened, and its rules: the picker works from then on. */
export const paperSectionShown = async () => {
    await waitFor(() => expect(paperSection()).toBeInTheDocument());
    await screen.findByTestId("template-paper-rules");
    return paperSection()!;
};
/** What's in the "Paper image" section by role, the section opened; null with no paper adapter. */
const inPaperSection = <T,>(find: (section: ReturnType<typeof within>) => T) => {
    const root = sectionRoot("paper");
    if (!root) return null;
    openRoot(root);
    return find(within(root));
};
/** The line naming the rules. */
export const paperRulesLine = () => screen.queryByTestId("template-paper-rules");
/** The picture in the sheet, or null: hidden, loading, failed or none. */
export const paperImage = () => screen.queryByTestId("template-paper-image");
/** The sheet's grid, now a child above the picture (design § 3). */
export const sheetGrid = () => screen.getByTestId("template-sheet-grid");
/** The show or hide switch, or null with no picture. */
export const paperShowSwitch = () => inPaperSection(section => section.queryByRole("switch", {name: label("printTemplates.paper.show")}));
/** The opacity slider, or null with no picture: its value in percent, `aria-valuetext` `50%`. */
export const paperOpacitySlider = () => inPaperSection(section => section.queryByRole("slider", {name: label("printTemplates.paper.opacity")}));
/** The load failure's alert, or null; its Retry is `within(paperLoadFailed()!).getByRole("button", {name: label("common.retry")})`. */
export const paperLoadFailed = () => inPaperSection(section => section.queryByTestId("template-paper-load-failed"));
/** Part 2's Upload, in the section. */
export const paperUploadButton = () => within(paperSection()!).getByRole("button", {name: label("attachments.upload")});
/** Part 2's stored row of this file, or null. */
export const paperRow = (name: string) => {
    const rows = within(paperSection()!).queryByRole("list", {name: label("attachments.storedLabel")});
    return rows ? within(rows).queryAllByRole("listitem").find(row => row.textContent?.includes(name)) ?? null : null;
};
/** A button of that row: `previewFile`, `downloadFile`, `deleteFile`, or null (`replaceFile` is never there: TPL-725). */
export const paperRowButton = (name: string, action: "previewFile" | "downloadFile" | "deleteFile" | "replaceFile") => {
    const row = paperRow(name);
    return row ? within(row).queryByRole("button", {name: i18n.t(`attachments.${action}`, {name})}) : null;
};
/** A file picked in part 2's input, past the browser's own `accept` filter, as a drop would be. */
export const pickPaper = (file: File) => {
    openSection("paper");
    return fireEvent.change(screen.getByTestId("attachment-input"), {target: {files: [file]}});
};

/** The picture's API path as `recordRequests` reports it. */
export const paperPath = (clinicId: number) => `${templatePath(clinicId)}/paper-image`;
/** The picture's API URL for a handler of the test's own. */
export const paperUrl = (clinicId: number) => api(paperPath(clinicId));

/** `TemplateDesigner` alone, with a template and no paper adapter, as a later clinic-side screen could mount it (TPL-644). */
export const renderDesignerWithoutPaper = async (layout: PrintLayout, options: Omit<RenderWithProvidersOptions, "dataRouter"> = {}) => {
    const clinic = aClinicDetails();
    server.use(...adminClinicsHandlers([clinic]), ...printTemplateHandlers(clinic.id, {template: aPrintTemplate({layout})}));
    const rendered = await renderWithProviders(<TemplateDesigner adapter={adminPrintTemplateApi(clinic.id)}/>, {dataRouter: true, ...options});
    await designerShown();
    return {...rendered, clinic};
};

/* Step 4 at the walkthrough (contract § 4.3.2): an item's alignment. */

export type ItemAlignName = "left" | "center" | "right";
const ALIGN_LABEL: Record<ItemAlignName, string> = {left: "printTemplates.config.alignLeft", center: "printTemplates.config.alignCenter", right: "printTemplates.config.alignRight"};
/** The selected item's alignment group, its section opened. */
export const alignGroup = () => within(openSection("item")).getByRole("group", {name: label("printTemplates.config.align")});
/** The group's buttons, in the tree's order. */
export const alignButtons = () => within(alignGroup()).getAllByRole("button");
/** The button that aligns to this side, by its name in the current language. */
export const alignButton = (align: ItemAlignName) => within(alignGroup()).getByRole("button", {name: label(ALIGN_LABEL[align])});
