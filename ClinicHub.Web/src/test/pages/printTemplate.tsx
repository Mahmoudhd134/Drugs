import {screen, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import i18n from "../../i18n";
import type {ClinicDetails} from "../../features/admin/types.ts";
import type {PrintTemplate} from "../../features/printTemplates/types.ts";
import {aClinicDetails} from "../data.ts";
import {adminClinicsHandlers, printTemplateHandlers} from "../msw.ts";
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
};

export const renderPrintTemplateTab = async ({clinic = aClinicDetails(), template = null, stateful = true, ...options}: RenderPrintTemplateTabOptions = {}) => {
    server.use(...adminClinicsHandlers([clinic]), ...printTemplateHandlers(clinic.id, {template, stateful}));
    const rendered = await renderAdmin(`/admin/clinics/${clinic.id}/print-template`, {dataRouter: true, ...options});
    return {...rendered, clinic};
};

const text = (key: string) => i18n.t(key);

/** The side panel. */
export const sidePanel = () => screen.getByRole("region", {name: text("printTemplates.panel.label")});
/** The scrolling area holding the sheet. */
export const sheetArea = () => screen.getByRole("region", {name: text("printTemplates.sheet.label")});
/** The settings panel. */
export const settingsPanel = () => screen.getByRole("region", {name: text("printTemplates.config.label")});

/** An entry of the side panel, by its label (`printTemplates.kinds.*`, `printTemplates.functions.*`). */
export const panelEntry = (label: string) => within(sidePanel()).getByRole("button", {name: label});
/** An item's box on the sheet: named by its name, its static text, or (prescription text, empty text) its kind's label. */
export const sheetItem = (name: string) => within(sheetArea()).getByRole("button", {name});
/** A text field of the settings panel, by its label (`printTemplates.config.*`, `printTemplates.page.width|height`). */
export const settingsField = (label: string) => within(settingsPanel()).getByRole("textbox", {name: label});

/** Replaces a field's text, as typing does. */
export const typeInField = async (user: UserEvent, field: HTMLElement, value: string) => {
    await user.clear(field);
    if (value) await user.type(field, value);
};
