import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import type {RequestHandler} from "msw";
import {expect} from "vitest";
import i18n from "../../i18n";
import type {ClinicDetails} from "../../features/admin/types.ts";
import type {PrintLayout, PrintTemplate} from "../../features/printTemplates/types.ts";
import {aClinicDetails, aPrintTemplate} from "../data.ts";
import {adminClinicsHandlers, api, printTemplateHandlers, type recordRequests} from "../msw.ts";
import {isRed} from "../mui.ts";
import {server} from "../server.ts";
import type {RenderWithProvidersOptions} from "../render.tsx";
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
};

export const renderPrintTemplateTab = async ({clinic = aClinicDetails(), template = null, stateful = true, handlers = [], ...options}: RenderPrintTemplateTabOptions = {}) => {
    server.use(...adminClinicsHandlers([clinic]), ...printTemplateHandlers(clinic.id, {template, stateful}));
    // A later `server.use` goes in front; inside one call the first match wins
    server.use(...handlers);
    const rendered = await renderAdmin(`/admin/clinics/${clinic.id}/print-template`, {dataRouter: true, ...options});
    return {...rendered, clinic};
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
/** A text field of the settings panel, by its label (`printTemplates.config.*`, `printTemplates.page.width|height`). */
export const settingsField = (name: string) => within(settingsPanel()).getByRole("textbox", {name});

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
export const paperSize = () => within(settingsPanel()).getByRole("combobox", {name: name => name.startsWith(label("printTemplates.page.size"))});

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
