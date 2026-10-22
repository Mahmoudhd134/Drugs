import {describe, expect, test} from "vitest";
import {screen} from "@testing-library/react";
import {aDrug, aProtocol, anItem, protocolsHandlers, recordRequests, renderWithProviders, server} from "../../../test";
import type {Protocol} from "../types.ts";
import {ProtocolsPage} from "./ProtocolsPage.tsx";

// The protocols list: docs/features/protocols/tech.md "Frontend" (ProtocolsPage: card grid, 12 per page); texts from
// ar.ts / en.ts (protocols.*).

const manyProtocols = (count: number) =>
    Array.from({length: count}, (_, i) => aProtocol({name: `Protocol ${String(i + 1).padStart(2, "0")}`, items: [anItem(aDrug())]}));

const openPage = (protocols: Protocol[], lang: "ar" | "en" = "ar") => {
    server.use(...protocolsHandlers(protocols));
    return renderWithProviders(<ProtocolsPage/>, {lang, route: "/protocols"});
};

const cardNames = () => screen.queryAllByText(/^Protocol \d+$/).map(e => e.textContent);

describe("protocols list @area:catalog", () => {
    test("more than 12 protocols: 12 cards per page with page buttons @GRP-037", async () => {
        const recorded = recordRequests();
        const {user} = await openPage(manyProtocols(14));
        await screen.findByText("Protocol 01");
        expect(cardNames()).toHaveLength(12);
        await user.click(screen.getByRole("button", {name: "الذهاب إلى الصفحة 2"}));
        expect(await screen.findByText("Protocol 13")).toBeInTheDocument();
        expect(cardNames()).toEqual(["Protocol 13", "Protocol 14"]);
        expect(screen.getByRole("button", {name: "الصفحة 2"})).toHaveAttribute("aria-current", "page");
        expect(recorded.requests.map(r => r.search)).toEqual(["?search=&page=1&pageSize=12", "?search=&page=2&pageSize=12"]);
    });

    test("no protocols: «لا توجد بروتوكولات بعد» / «البروتوكولات تتيح لك…» with «بروتوكول جديد» @GRP-039", async () => {
        await openPage([]);
        const title = await screen.findByText("لا توجد بروتوكولات بعد");
        const empty = title.parentElement as HTMLElement;
        expect(empty).toHaveTextContent("البروتوكولات تتيح لك إضافة عدة أدوية إلى الروشتة بضغطة واحدة.");
        const links = screen.getAllByRole("link", {name: "بروتوكول جديد"});
        // In the header and in the empty state
        expect(links).toHaveLength(2);
        expect(empty.contains(links[1])).toBe(true);
        expect(links[1]).toHaveAttribute("href", "/protocols/new");
    });

    test("in English: \"No protocols yet\" with \"New protocol\" @GRP-039", async () => {
        await openPage([], "en");
        expect(await screen.findByText("No protocols yet")).toBeInTheDocument();
        expect(screen.getByText("Protocols let you add several drugs to a prescription with one click.")).toBeInTheDocument();
        expect(screen.getAllByRole("link", {name: "New protocol"})).toHaveLength(2);
    });

    test("the subtitle reads «إجمالي البروتوكولات: N» @GRP-040", async () => {
        await openPage(manyProtocols(14));
        expect(await screen.findByText("إجمالي البروتوكولات: 14")).toBeInTheDocument();
    });

    test("in English the subtitle reads \"Total protocols: N\" @GRP-040", async () => {
        await openPage(manyProtocols(3), "en");
        expect(await screen.findByText("Total protocols: 3")).toBeInTheDocument();
    });
});
