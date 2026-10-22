import {describe, expect, test, vi} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {
    aDrug,
    aProtocol,
    protocolsHandlers,
    drugsHandlers,
    recordRequests,
    renderWithProviders,
    server,
} from "../../../test";
import type {Permission} from "../../access/permissions.ts";
import {CatalogPanel} from "./CatalogPanel.tsx";

// The prescription's catalog panel by permission: docs/features/access/tech.md "Frontend" (Pages: Prescription),
// access business.md «الصلاحيات». A picker the user can't use is neither shown nor loaded (an unhandled request fails).


const openPanel = (permissions: Permission[]) =>
    renderWithProviders(<CatalogPanel selectedIds={new Set()} onSelectProtocol={vi.fn()} onSelectDrug={vi.fn()}/>, {lang: "ar", user: {permissions}});

describe("catalog panel by permission @area:access", () => {
    test("with both: the Protocols and Drugs tabs, Protocols first with the focus @ACC-068 @smoke", async () => {
        server.use(...protocolsHandlers([aProtocol({name: "Post cataract"})]), ...drugsHandlers([aDrug({name: "Tobradex"})]));
        await openPanel(["protocols.list", "drugs.list", "prescriptions.create"]);
        expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["البروتوكولات", "الأدوية"]);
        expect(screen.getByRole("tab", {name: "البروتوكولات"})).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("searchbox", {name: "ابحث عن بروتوكول بالاسم…"})).toHaveFocus();
        expect(await screen.findByText("Post cataract")).toBeInTheDocument();
    });

    test("with drugs.list only: only the Drugs tab, its search has the focus, and protocols are never loaded @ACC-068", async () => {
        server.use(...drugsHandlers([aDrug({name: "Tobradex"})]));
        const requests = recordRequests();
        await openPanel(["drugs.list", "prescriptions.create"]);
        expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["الأدوية"]);
        expect(screen.getByRole("searchbox", {name: "ابحث عن دواء بالاسم…"})).toHaveFocus();
        expect(await screen.findByText("Tobradex")).toBeInTheDocument();
        expect(requests.requests.some(r => r.path === "/protocols")).toBe(false);
    });

    test("with protocols.list only: only the Protocols tab, with the focus, and drugs are never loaded @ACC-068", async () => {
        server.use(...protocolsHandlers([aProtocol({name: "Post cataract"})]));
        const requests = recordRequests();
        await openPanel(["protocols.list"]);
        expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["البروتوكولات"]);
        expect(screen.getByRole("searchbox", {name: "ابحث عن بروتوكول بالاسم…"})).toHaveFocus();
        expect(await screen.findByText("Post cataract")).toBeInTheDocument();
        await waitFor(() => expect(requests.requests.some(r => r.path === "/protocols")).toBe(true));
        expect(requests.requests.some(r => r.path === "/drugs")).toBe(false);
    });

    test("with neither: «ليست لديك صلاحية للبحث في الأدوية أو البروتوكولات.» and nothing loaded @ACC-069", async () => {
        const requests = recordRequests();
        await openPanel([]);
        expect(screen.getByText("ليست لديك صلاحية للبحث في الأدوية أو البروتوكولات.")).toBeInTheDocument();
        expect(screen.queryByRole("tab")).not.toBeInTheDocument();
        expect(requests.requests).toEqual([]);
    });

    test("with neither, in English: \"You don't have permission to search drugs or protocols.\" @ACC-069", async () => {
        await renderWithProviders(<CatalogPanel selectedIds={new Set()} onSelectProtocol={vi.fn()} onSelectDrug={vi.fn()}/>, {lang: "en", user: {permissions: []}});
        expect(screen.getByText("You don't have permission to search drugs or protocols.")).toBeInTheDocument();
    });
});
