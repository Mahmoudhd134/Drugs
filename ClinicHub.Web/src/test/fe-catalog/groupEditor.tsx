import {screen, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {vi} from "vitest";
import type {Permission} from "../../features/access/permissions.ts";
import {DrugGroupEditorPage} from "../../features/drugGroups/pages/DrugGroupEditorPage.tsx";
import type {DrugGroup, SaveDrugGroupItem} from "../../features/drugGroups/types.ts";
import type {Drug} from "../../features/drugs/types.ts";
import {api, drugGroupsHandlers, drugsHandlers, nextId, renderWithProviders, server} from "../index.ts";

/*
 * The group editor page (`/groups/new`, `/groups/:id`) with the API of docs/features/drug-groups/tech.md "API":
 * GET /drugs (the picker), GET /drug-groups/:id, and POST / PUT answering the saved group (`DrugGroupDto`: each item
 * with its `drug`, in the sent order).
 */

type SaveBody = { name: string; items: SaveDrugGroupItem[] };

/** POST /drug-groups (201) and PUT /drug-groups/:id answering the saved group; `bodies` collects what was sent. */
export const groupSaveHandlers = (drugs: Drug[]) => {
    const bodies: SaveBody[] = [];
    const toDto = (id: number, body: SaveBody): DrugGroup => ({
        id,
        name: body.name,
        items: body.items.map(i => ({drug: drugs.find(d => d.id === i.drugId)!, dosing: i.dosing})),
    });
    const handlers = [
        http.post(api("/drug-groups"), async ({request}) => {
            const body = await request.json() as SaveBody;
            bodies.push(body);
            return HttpResponse.json(toDto(nextId(), body), {status: 201});
        }),
        http.put(api("/drug-groups/:id"), async ({request, params}) => {
            const body = await request.json() as SaveBody;
            bodies.push(body);
            return HttpResponse.json(toDto(Number(params.id), body));
        }),
    ];
    return {handlers, bodies};
};

type EditorOptions = {
    /** The group to edit (none: a new group) */
    group?: DrugGroup;
    /** The drugs the picker lists (default: the group's) */
    drugs?: Drug[];
    lang?: "ar" | "en";
    /** `/me` permissions (default: the Owner's, every one) */
    permissions?: Permission[];
};

/**
 * jsdom has no `scrollIntoView`; SearchableList calls it when the highlight moves (hovering an option). A no-op is
 * enough here (nothing scrolls in jsdom).
 */
export const installScrollIntoView = () => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
};

/** Opens the editor and waits until its form shows. */
export const openEditor = async ({group, drugs, lang = "ar", permissions}: EditorOptions = {}) => {
    installScrollIntoView();
    const pickerDrugs = drugs ?? group?.items.map(i => i.drug).filter((d, i, all) => all.indexOf(d) === i) ?? [];
    const saves = groupSaveHandlers(pickerDrugs);
    server.use(...drugsHandlers(pickerDrugs), ...drugGroupsHandlers(group ? [group] : []), ...saves.handlers);
    const rendered = await renderWithProviders(<DrugGroupEditorPage/>, {
        lang,
        route: group ? `/groups/${group.id}` : "/groups/new",
        path: group ? "/groups/:id" : "/groups/new",
        user: permissions ? {permissions} : undefined,
    });
    // A text query: role queries are slow on a big page (the 1001-line group)
    await screen.findByText(lang === "ar" ? "أدوية هذه المجموعة" : "Drugs in this group");
    return {...rendered, bodies: saves.bodies};
};

/** The «أدوية هذه المجموعة» panel. */
export const linesPanel = (title = "أدوية هذه المجموعة") => screen.getByText(title).closest(".MuiPaper-root") as HTMLElement;

/** The lines of the group, in order: each is the row holding the number, the drug, its details and actions. */
export const lineRows = (title?: string) =>
    Array.from(linesPanel(title).querySelectorAll<HTMLElement>(".MuiAvatar-root")).map(avatar => avatar.parentElement as HTMLElement);

/** [number, drug name] of each line. */
export const lineSummary = (title?: string) =>
    lineRows(title).map(row => [row.querySelector(".MuiAvatar-root")!.textContent, row.querySelector("p")!.textContent]);

/** The text under a line's drug name (details and chips), as one string. */
export const lineDetails = (row: HTMLElement) => {
    const body = row.children[1] as HTMLElement;
    return Array.from(body.children).slice(1).map(c => c.textContent).join("");
};

/** The drug picker's option of a drug. */
export const pickerOption = (name: string) =>
    within(screen.getByRole("listbox")).getByText(name).closest("[role=option]") as HTMLElement;

/** The «تجاهل التغييرات؟» question (an MUI dialog), or null when it isn't shown. */
export const discardDialog = () => screen.queryByRole("dialog", {name: /تجاهل التغييرات؟|Discard changes\?/});

/**
 * jsdom has no layout: gives each sortable row (the parent of a drag handle) a box from its position in the list,
 * 60 px apart, and the list a box around them, so dnd-kit's keyboard sensor can move rows. Restored after the test (setup's `vi.restoreAllMocks`).
 */
export const layoutSortableRows = () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const box = (top: number, height: number) =>
            ({x: 0, y: top, top, left: 0, right: 500, bottom: top + height, width: 500, height, toJSON: () => ({})}) as DOMRect;
        // A row: its place in the list
        if (this.querySelector(":scope > [aria-roledescription=sortable]") && this.parentElement)
            return box(Array.from(this.parentElement.children).indexOf(this) * 60, 50);
        // The list itself (dnd-kit keeps a dragged row inside it)
        if (this.querySelector(":scope > * > [aria-roledescription=sortable]")) return box(0, this.children.length * 60);
        return original.call(this);
    });
};
