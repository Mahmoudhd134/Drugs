import {describe, expect, test} from "vitest";
import {screen} from "@testing-library/react";
import {aDrug, aProtocol, anItem, protocolsHandlers, recordRequests, renderWithProviders, server} from "../../../test";
import type {Protocol} from "../types.ts";
import {ProtocolsPage} from "./ProtocolsPage.tsx";

// The groups list: docs/features/drug-groups/tech.md "Frontend" (DrugGroupsPage: card grid, 12 per page); texts from
// ar.ts / en.ts (groups.*).

const manyProtocols = (count: number) =>
    Array.from({length: count}, (_, i) => aProtocol({name: `Group ${String(i + 1).padStart(2, "0")}`, items: [anItem(aDrug())]}));

const openPage = (protocols: Protocol[], lang: "ar" | "en" = "ar") => {
    server.use(...protocolsHandlers(protocols));
    return renderWithProviders(<ProtocolsPage/>, {lang, route: "/groups"});
};

const cardNames = () => screen.queryAllByText(/^Group \d+$/).map(e => e.textContent);

describe("groups list @area:catalog", () => {
    test("more than 12 groups: 12 cards per page with page buttons @GRP-037", async () => {
        const recorded = recordRequests();
        const {user} = await openPage(manyProtocols(14));
        await screen.findByText("Group 01");
        expect(cardNames()).toHaveLength(12);
        await user.click(screen.getByRole("button", {name: "الذهاب إلى الصفحة 2"}));
        expect(await screen.findByText("Group 13")).toBeInTheDocument();
        expect(cardNames()).toEqual(["Group 13", "Group 14"]);
        expect(screen.getByRole("button", {name: "الصفحة 2"})).toHaveAttribute("aria-current", "page");
        expect(recorded.requests.map(r => r.search)).toEqual(["?search=&page=1&pageSize=12", "?search=&page=2&pageSize=12"]);
    });

    test("no groups: «لا توجد مجموعات بعد» / «المجموعات تتيح لك…» with «مجموعة جديدة» @GRP-039", async () => {
        await openPage([]);
        const title = await screen.findByText("لا توجد مجموعات بعد");
        const empty = title.parentElement as HTMLElement;
        expect(empty).toHaveTextContent("المجموعات تتيح لك إضافة عدة أدوية إلى الروشتة بضغطة واحدة.");
        const links = screen.getAllByRole("link", {name: "مجموعة جديدة"});
        // In the header and in the empty state
        expect(links).toHaveLength(2);
        expect(empty.contains(links[1])).toBe(true);
        expect(links[1]).toHaveAttribute("href", "/groups/new");
    });

    test("in English: \"No groups yet\" with \"New group\" @GRP-039", async () => {
        await openPage([], "en");
        expect(await screen.findByText("No groups yet")).toBeInTheDocument();
        expect(screen.getByText("Groups let you add several drugs to a prescription with one click.")).toBeInTheDocument();
        expect(screen.getAllByRole("link", {name: "New group"})).toHaveLength(2);
    });

    test("the subtitle reads «إجمالي المجموعات: N» @GRP-040", async () => {
        await openPage(manyProtocols(14));
        expect(await screen.findByText("إجمالي المجموعات: 14")).toBeInTheDocument();
    });

    test("in English the subtitle reads \"Total groups: N\" @GRP-040", async () => {
        await openPage(manyProtocols(3), "en");
        expect(await screen.findByText("Total groups: 3")).toBeInTheDocument();
    });
});
