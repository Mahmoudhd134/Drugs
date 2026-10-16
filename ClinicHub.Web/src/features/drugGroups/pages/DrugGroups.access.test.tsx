import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aDrug,
    aGroup,
    anItem,
    api,
    drugGroupsHandlers,
    drugsHandlers,
    hoverTooltip,
    leaveTooltip,
    renderWithProviders,
    server,
} from "../../../test";
import type {Permission} from "../../access/permissions.ts";
import type {DrugGroup} from "../types.ts";
import {DrugGroupsPage} from "./DrugGroupsPage.tsx";
import {DrugGroupEditorPage} from "./DrugGroupEditorPage.tsx";

// Groups list and editor by permission: docs/features/access/tech.md "Frontend" (Pages: Groups, Group editor),
// access business.md «الرسائل التي تظهر للمستخدم» («ليست لديك صلاحية»).


const tobradex = aDrug({name: "Tobradex"});
const group = aGroup({name: "Post cataract", items: [anItem(tobradex)]});

const openList = async (permissions: Permission[], groups: DrugGroup[] = [group]) => {
    server.use(...drugGroupsHandlers(groups));
    const rendered = await renderWithProviders(<DrugGroupsPage/>, {lang: "ar", route: "/groups", user: {permissions}});
    await screen.findByText("Post cataract");
    return rendered;
};

describe("groups list by permission @area:access", () => {
    test("without groups.create / update / delete: no «مجموعة جديدة», no edit link, no delete icon, no actions bar @ACC-064", async () => {
        await openList(["groups.list", "groups.details"]);
        expect(screen.queryByRole("link", {name: "مجموعة جديدة"})).not.toBeInTheDocument();
        expect(screen.queryByRole("link", {name: "تعديل"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "حذف"})).not.toBeInTheDocument();
        // The card's actions bar (edit / delete) is not rendered at all
        expect(document.querySelector(".MuiCardActions-root")).toBeNull();
    });

    test("each control follows its own permission: create → «مجموعة جديدة», update → edit, delete → delete @ACC-064", async () => {
        const {unmount} = await openList(["groups.list", "groups.create"]);
        expect(screen.getByRole("link", {name: "مجموعة جديدة"})).toHaveAttribute("href", "/groups/new");
        expect(document.querySelector(".MuiCardActions-root")).toBeNull();
        unmount();

        const second = await openList(["groups.list", "groups.details", "groups.update"]);
        expect(screen.getByRole("link", {name: "تعديل"})).toHaveAttribute("href", `/groups/${group.id}`);
        expect(screen.queryByRole("button", {name: "حذف"})).not.toBeInTheDocument();
        second.unmount();

        await openList(["groups.list", "groups.delete"]);
        expect(screen.getByRole("button", {name: "حذف"})).toBeEnabled();
        expect(screen.queryByRole("link", {name: "تعديل"})).not.toBeInTheDocument();
        expect(screen.queryByRole("link", {name: "مجموعة جديدة"})).not.toBeInTheDocument();
    });

    test("without groups.details a card doesn't open the group @ACC-065", async () => {
        const {user, location} = await openList(["groups.list"]);
        const card = screen.getByText("Post cataract").closest("button")!;
        expect(card).toBeDisabled();
        await user.click(card).catch(() => undefined);
        expect(location().pathname).toBe("/groups");
    });

    test("with groups.details a card opens the group", async () => {
        const {user, location} = await openList(["groups.list", "groups.details"]);
        await user.click(screen.getByText("Post cataract"));
        expect(location().pathname).toBe(`/groups/${group.id}`);
    });
});

/** The editor of `group` (or a new group) for a role with `permissions`. */
const openEditor = async (permissions: Permission[], id: number | "new" = group.id) => {
    server.use(...drugGroupsHandlers([group]), ...drugsHandlers([tobradex]));
    const rendered = await renderWithProviders(<DrugGroupEditorPage/>, {
        lang: "ar", route: `/groups/${id}`, path: id === "new" ? "/groups/new" : "/groups/:id", user: {permissions},
    });
    return rendered;
};

const ASSISTANT: Permission[] = ["drugs.list", "drugs.details", "drugs.create", "drugs.update", "groups.list", "groups.details", "groups.create", "groups.update", "prescriptions.create"];

describe("group editor by permission @area:access", () => {
    test("an Assistant sees Delete disabled; hovering it shows «ليست لديك صلاحية» @ACC-066", async () => {
        await openEditor(ASSISTANT);
        const remove = await screen.findByRole("button", {name: "حذف"});
        expect(remove).toBeDisabled();
        expect(await hoverTooltip(remove.parentElement!)).toBe("ليست لديك صلاحية");
    });

    test("in English the tooltip says \"You don't have permission\" @ACC-066", async () => {
        server.use(...drugGroupsHandlers([group]), ...drugsHandlers([tobradex]));
        await renderWithProviders(<DrugGroupEditorPage/>, {
            lang: "en", route: `/groups/${group.id}`, path: "/groups/:id", user: {permissions: ASSISTANT},
        });
        const remove = await screen.findByRole("button", {name: "Delete"});
        expect(await hoverTooltip(remove.parentElement!)).toBe("You don't have permission");
    });

    test("Save, Cancel and Back go to /groups @ACC-067", async () => {
        server.use(http.put(api("/drug-groups/:id"), () => HttpResponse.json(group)));
        for (const button of ["حفظ", "إلغاء", "رجوع"]) {
            const {user, location, unmount} = await openEditor(ASSISTANT);
            await screen.findByDisplayValue("Post cataract");
            await user.click(screen.getByRole("button", {name: button}));
            await waitFor(() => expect(location().pathname).toBe("/groups"));
            unmount();
        }
    });

    test("for a role without groups.list, Save, Cancel and Back go to / @ACC-067", async () => {
        server.use(http.post(api("/drug-groups"), () => HttpResponse.json(group, {status: 201})));
        const canCreateOnly: Permission[] = ["drugs.list", "groups.create"];
        for (const button of ["إلغاء", "رجوع"]) {
            const {user, location, unmount} = await openEditor(canCreateOnly, "new");
            await user.click(await screen.findByRole("button", {name: button}));
            await waitFor(() => expect(location().pathname).toBe("/"));
            unmount();
        }
        const {user, location} = await openEditor(canCreateOnly, "new");
        await user.click(await screen.findByRole("textbox", {name: /اسم المجموعة/}));
        await user.paste("Post cataract");
        await user.click(await screen.findByText("Tobradex"));
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(location().pathname).toBe("/"));
        expect(within(document.body).queryByText("ليست لديك صلاحية")).not.toBeInTheDocument();
    });
});

describe("group card icon buttons @area:ux", () => {
    test("the card's edit ✎ and delete icons have a tooltip and an Arabic accessible name @UX-012", async () => {
        await openList(["groups.list", "groups.details", "groups.update", "groups.delete"]);
        for (const [role, name] of [["link", "تعديل"], ["button", "حذف"]] as const) {
            const control = screen.getByRole(role, {name});
            expect(await hoverTooltip(control)).toBe(name);
            await leaveTooltip(control);
        }
    });
});
