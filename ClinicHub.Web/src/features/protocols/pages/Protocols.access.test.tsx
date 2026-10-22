import {describe, expect, test} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aDrug,
    aProtocol,
    anItem,
    api,
    protocolsHandlers,
    drugsHandlers,
    hoverTooltip,
    leaveTooltip,
    renderWithProviders,
    server,
} from "../../../test";
import type {Permission} from "../../access/permissions.ts";
import type {Protocol} from "../types.ts";
import {ProtocolsPage} from "./ProtocolsPage.tsx";
import {ProtocolEditorPage} from "./ProtocolEditorPage.tsx";

// Protocols list and editor by permission: docs/features/access/tech.md "Frontend" (Pages: Protocols, Protocol editor),
// access business.md «الرسائل التي تظهر للمستخدم» («ليست لديك صلاحية»).


const tobradex = aDrug({name: "Tobradex"});
const protocol = aProtocol({name: "Post cataract", items: [anItem(tobradex)]});

const openList = async (permissions: Permission[], protocols: Protocol[] = [protocol]) => {
    server.use(...protocolsHandlers(protocols));
    const rendered = await renderWithProviders(<ProtocolsPage/>, {lang: "ar", route: "/protocols", user: {permissions}});
    await screen.findByText("Post cataract");
    return rendered;
};

describe("protocols list by permission @area:access", () => {
    test("without protocols.create / update / delete: no «بروتوكول جديد», no edit link, no delete icon, no actions bar @ACC-064", async () => {
        await openList(["protocols.list", "protocols.details"]);
        expect(screen.queryByRole("link", {name: "بروتوكول جديد"})).not.toBeInTheDocument();
        expect(screen.queryByRole("link", {name: "تعديل"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "حذف"})).not.toBeInTheDocument();
        // The card's actions bar (edit / delete) is not rendered at all
        expect(document.querySelector(".MuiCardActions-root")).toBeNull();
    });

    test("each control follows its own permission: create → «بروتوكول جديد», update → edit, delete → delete @ACC-064", async () => {
        const {unmount} = await openList(["protocols.list", "protocols.create"]);
        expect(screen.getByRole("link", {name: "بروتوكول جديد"})).toHaveAttribute("href", "/protocols/new");
        expect(document.querySelector(".MuiCardActions-root")).toBeNull();
        unmount();

        const second = await openList(["protocols.list", "protocols.details", "protocols.update"]);
        expect(screen.getByRole("link", {name: "تعديل"})).toHaveAttribute("href", `/protocols/${protocol.id}`);
        expect(screen.queryByRole("button", {name: "حذف"})).not.toBeInTheDocument();
        second.unmount();

        await openList(["protocols.list", "protocols.delete"]);
        expect(screen.getByRole("button", {name: "حذف"})).toBeEnabled();
        expect(screen.queryByRole("link", {name: "تعديل"})).not.toBeInTheDocument();
        expect(screen.queryByRole("link", {name: "بروتوكول جديد"})).not.toBeInTheDocument();
    });

    test("without protocols.details a card doesn't open the protocol @ACC-065", async () => {
        const {user, location} = await openList(["protocols.list"]);
        const card = screen.getByText("Post cataract").closest("button")!;
        expect(card).toBeDisabled();
        await user.click(card).catch(() => undefined);
        expect(location().pathname).toBe("/protocols");
    });

    test("with protocols.details a card opens the protocol", async () => {
        const {user, location} = await openList(["protocols.list", "protocols.details"]);
        await user.click(screen.getByText("Post cataract"));
        expect(location().pathname).toBe(`/protocols/${protocol.id}`);
    });
});

/** The editor of `protocol` (or a new protocol) for a role with `permissions`. */
const openEditor = async (permissions: Permission[], id: number | "new" = protocol.id) => {
    server.use(...protocolsHandlers([protocol]), ...drugsHandlers([tobradex]));
    const rendered = await renderWithProviders(<ProtocolEditorPage/>, {
        lang: "ar", route: `/protocols/${id}`, path: id === "new" ? "/protocols/new" : "/protocols/:id", user: {permissions},
    });
    return rendered;
};

const ASSISTANT: Permission[] = ["drugs.list", "drugs.details", "drugs.create", "drugs.update", "protocols.list", "protocols.details", "protocols.create", "protocols.update", "prescriptions.create"];

describe("protocol editor by permission @area:access", () => {
    test("an Assistant sees Delete disabled; hovering it shows «ليست لديك صلاحية» @ACC-066", async () => {
        await openEditor(ASSISTANT);
        const remove = await screen.findByRole("button", {name: "حذف"});
        expect(remove).toBeDisabled();
        expect(await hoverTooltip(remove.parentElement!)).toBe("ليست لديك صلاحية");
    });

    test("in English the tooltip says \"You don't have permission\" @ACC-066", async () => {
        server.use(...protocolsHandlers([protocol]), ...drugsHandlers([tobradex]));
        await renderWithProviders(<ProtocolEditorPage/>, {
            lang: "en", route: `/protocols/${protocol.id}`, path: "/protocols/:id", user: {permissions: ASSISTANT},
        });
        const remove = await screen.findByRole("button", {name: "Delete"});
        expect(await hoverTooltip(remove.parentElement!)).toBe("You don't have permission");
    });

    test("Save, Cancel and Back go to /protocols @ACC-067", async () => {
        server.use(http.put(api("/protocols/:id"), () => HttpResponse.json(protocol)));
        for (const button of ["حفظ", "إلغاء", "رجوع"]) {
            const {user, location, unmount} = await openEditor(ASSISTANT);
            await screen.findByDisplayValue("Post cataract");
            await user.click(screen.getByRole("button", {name: button}));
            await waitFor(() => expect(location().pathname).toBe("/protocols"));
            unmount();
        }
    });
});

describe("protocol card icon buttons @area:ux", () => {
    test("the card's edit ✎ and delete icons have a tooltip and an Arabic accessible name @UX-012", async () => {
        await openList(["protocols.list", "protocols.details", "protocols.update", "protocols.delete"]);
        for (const [role, name] of [["link", "تعديل"], ["button", "حذف"]] as const) {
            const control = screen.getByRole(role, {name});
            expect(await hoverTooltip(control)).toBe(name);
            await leaveTooltip(control);
        }
    });
});
