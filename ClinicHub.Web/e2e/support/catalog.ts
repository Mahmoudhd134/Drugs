import {expect, type Locator, type Page} from "@playwright/test";
import type {ClinicHandle, Data} from "./data.ts";
import type {CatalogTexts} from "./texts-catalog.ts";
import {ownDrugBody} from "./shared.ts";

/**
 * Helpers of the catalog journeys (drugs, protocols, dosing, tapering): data through the API as an owner (with
 * descriptions, default dosings and protocol overrides, which `Data.drug` / `Data.protocol` don't take) and UI locators.
 */

/** The API's dosing (docs/features/dosing/tech.md "Data model"); every field optional. */
export type TaperStep = {
    doseAmount?: number | null; frequency?: string | null; frequencyValue?: number | null;
    durationValue?: number | null; durationUnit?: string | null;
};
export type Dosing = {
    doseAmount?: number | null; doseUnit?: string | null; frequency?: string | null; frequencyValue?: number | null;
    frequencyText?: string | null; durationValue?: number | null; durationUnit?: string | null; eye?: string | null;
    taperSteps?: TaperStep[] | null;
};
export type CatalogDrug = { id: number; name: string; description: string | null; defaultDosing: Dosing | null };
export type ProtocolLine = { drug: { id: number }; dosing?: Dosing | null };
export type CatalogProtocol = { id: number; name: string; items: { drug: CatalogDrug; dosing: Dosing | null }[] };

/** Dosings used by the specs (their sentences are in `SENTENCES`). */
export const DOSINGS = {
    dropRight4x7d: {doseAmount: 1, doseUnit: "drop", eye: "right", frequency: "daily", frequencyValue: 4, durationUnit: "days", durationValue: 7},
    drop4x7d: {doseAmount: 1, doseUnit: "drop", frequency: "daily", frequencyValue: 4, durationUnit: "days", durationValue: 7},
    tablet2x1w: {doseAmount: 1, doseUnit: "tablet", frequency: "daily", frequencyValue: 2, durationUnit: "weeks", durationValue: 1},
    drop4x: {doseAmount: 1, doseUnit: "drop", frequency: "daily", frequencyValue: 4},
    dropRight4x: {doseAmount: 1, doseUnit: "drop", eye: "right", frequency: "daily", frequencyValue: 4},
    taperOpenEnd: {
        doseAmount: 1, doseUnit: "drop", eye: "both", taperSteps: [
            {frequency: "daily", frequencyValue: 4, durationUnit: "weeks", durationValue: 1},
            {frequency: "daily", frequencyValue: 2, durationUnit: "weeks", durationValue: 1},
            {frequency: "daily", frequencyValue: 1, durationUnit: "untilNextVisit"},
        ],
    },
} satisfies Record<string, Dosing>;

export const createDrug = async (data: Data, clinic: ClinicHandle, name: string,
                                 options: { description?: string | null; dosing?: Dosing | null } = {}) => {
    const api = await data.ownerApi(clinic);
    return api.ok<CatalogDrug>("POST", "/api/v1/drugs",
        await ownDrugBody(api, {name, description: options.description ?? null, defaultDosing: options.dosing ?? null}));
};

/** Many drugs at once (a few requests in parallel, after the owner's one login: 5 codes per phone per hour). */
export const createDrugs = async (data: Data, clinic: ClinicHandle, names: string[]) => {
    await data.ownerApi(clinic);
    const made: CatalogDrug[] = [];
    for (let i = 0; i < names.length; i += 8) {
        made.push(...await Promise.all(names.slice(i, i + 8).map(n => createDrug(data, clinic, n))));
    }
    return made;
};

export const updateDrug = async (data: Data, clinic: ClinicHandle, drug: CatalogDrug, changes: Partial<Omit<CatalogDrug, "id">>) => {
    const api = await data.ownerApi(clinic);
    const body = {name: drug.name, description: drug.description, defaultDosing: drug.defaultDosing, ...changes};
    return api.ok<CatalogDrug>("PUT", `/api/v1/drugs/${drug.id}`, await ownDrugBody(api, body));
};

export const deleteDrug = async (data: Data, clinic: ClinicHandle, drug: { id: number }) => {
    const api = await data.ownerApi(clinic);
    await api.ok("DELETE", `/api/v1/drugs/${drug.id}`);
};

export const createProtocol = async (data: Data, clinic: ClinicHandle, name: string, lines: ProtocolLine[]) => {
    const api = await data.ownerApi(clinic);
    return api.ok<CatalogProtocol>("POST", "/api/v1/protocols",
        {name, items: lines.map(l => ({drugId: l.drug.id, dosing: l.dosing ?? null}))});
};

export const getProtocol = async (data: Data, clinic: ClinicHandle, id: number) => {
    const api = await data.ownerApi(clinic);
    return api.ok<CatalogProtocol>("GET", `/api/v1/protocols/${id}`);
};

export const deleteProtocol = async (data: Data, clinic: ClinicHandle, protocol: { id: number }) => {
    const api = await data.ownerApi(clinic);
    await api.ok("DELETE", `/api/v1/protocols/${protocol.id}`);
};

// ---- UI ----

/** The drugs table's row of a drug (names are unique per test). */
export const drugRow = (page: Page, name: string) => page.getByRole("row").filter({hasText: name});

/** The drugs table's body rows, in order. */
export const drugRows = (page: Page) => page.locator("tbody tr");

/** The Arabic dosing sentence(s) inside an element (`DosingText`: lang="ar"). */
export const sentenceIn = (scope: Locator) => scope.locator("[lang=ar]");

/** A protocol's card on the protocols page. */
export const protocolCard = (page: Page, name: string) =>
    page.locator(".MuiCard-root").filter({has: page.getByText(name, {exact: true})});

export const protocolCards = (page: Page) => page.locator(".MuiCard-root");

/** The protocol editor's lines (editable: each has a drag handle), in order. */
export const editorLines = (page: Page, ct: CatalogTexts) =>
    page.getByRole("button", {name: ct.dragToReorder}).locator("..");

/** A picker option (drug or protocol) by its name. */
export const option = (page: Page, name: string) =>
    page.getByRole("option").filter({has: page.getByText(name, {exact: true})});

/** Chooses `value` in the MUI select labelled `label` (nth when several). */
export const choose = async (page: Page, scope: Locator, label: string, value: string, nth = 0) => {
    await scope.getByRole("combobox", {name: label}).nth(nth).click();
    await page.getByRole("option", {name: value, exact: true}).click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
};

/** Types into a number field (replacing its value). */
export const fillNumber = async (scope: Locator, label: string, value: number, nth = 0) => {
    await scope.getByRole("spinbutton", {name: label, exact: true}).nth(nth).fill(String(value));
};

/** A confirmation (`useConfirm`) or form dialog by its title. */
export const dialog = (page: Page, title: string) => page.getByRole("dialog", {name: title});

/**
 * Types a search term and waits for its list request's answer (searches are debounced 300 ms: without this, an
 * assertion can pass on the list shown before, and the request lands later, e.g. during the page checks). The term
 * must not be cached yet (or the cache must have been invalidated), else no request is sent.
 */
export const search = async (page: Page, field: Locator, term: string) => {
    const answered = page.waitForResponse(r => /\/api\/v1\/(drugs|protocols)$/.test(new URL(r.url()).pathname)
        && new URL(r.url()).searchParams.get("search") === term.trim());
    await field.fill(term);
    await answered;
};

/** Types like a person (one key at a time). */
export const typeSlowly = async (field: Locator, text: string, delay = 40) => {
    await field.click();
    await field.pressSequentially(text, {delay});
};
