import {describe, expect, test, vi} from "vitest";
import {screen, within} from "@testing-library/react";
import {aDrug, aProtocol, anItem, protocolsHandlers, renderWithProviders, server} from "../../../test";
import type {Protocol} from "../types.ts";
import {ProtocolPicker} from "./ProtocolPicker.tsx";

// The prescription's protocol picker: docs/features/protocols/tech.md "Frontend" (ProtocolPicker: name, line count, drug
// names); texts from ar.ts / en.ts (protocols.*).

const renderPicker = (protocols: Protocol[], lang: "ar" | "en" = "ar") => {
    server.use(...protocolsHandlers(protocols));
    return renderWithProviders(<ProtocolPicker onSelect={vi.fn()}/>, {lang});
};

describe("protocol picker @area:catalog", () => {
    test("each protocol shows its name, «الأدوية: N» and its drug names joined with \" · \" @GRP-044", async () => {
        await renderPicker([aProtocol({name: "Post cataract", items: [anItem(aDrug({name: "Tobradex"})), anItem(aDrug({name: "Vigamox"})), anItem(aDrug({name: "قطرة مرطبة"}))]})]);
        const option = within((await screen.findByText("Post cataract")).closest("[role=option]") as HTMLElement);
        expect(option.getByText("الأدوية: 3")).toBeInTheDocument();
        expect(option.getByText("Tobradex · Vigamox · قطرة مرطبة")).toBeInTheDocument();
    });

    test("in English the count reads \"Drugs: N\" @GRP-044", async () => {
        await renderPicker([aProtocol({name: "Post cataract", items: [anItem(aDrug({name: "Tobradex"}))]})], "en");
        const option = within((await screen.findByText("Post cataract")).closest("[role=option]") as HTMLElement);
        expect(option.getByText("Drugs: 1")).toBeInTheDocument();
    });

    test("no protocols and no search: «لا توجد بروتوكولات في هذه العيادة بعد.»; a search with no match: «لا توجد بروتوكولات مطابقة للبحث.» @GRP-045", async () => {
        const {user} = await renderPicker([]);
        expect(await screen.findByText("لا توجد بروتوكولات في هذه العيادة بعد.")).toBeInTheDocument();
        await user.type(screen.getByRole("searchbox", {name: "ابحث عن بروتوكول بالاسم…"}), "xyz");
        expect(await screen.findByText("لا توجد بروتوكولات مطابقة للبحث.")).toBeInTheDocument();
        expect(screen.queryByText("لا توجد بروتوكولات في هذه العيادة بعد.")).not.toBeInTheDocument();
    });

    test("in English: \"This clinic has no protocols yet.\" / \"No protocols match your search.\" @GRP-045", async () => {
        const {user, unmount} = await renderPicker([aProtocol({name: "Post cataract"})], "en");
        await screen.findByText("Post cataract");
        await user.type(screen.getByRole("searchbox", {name: "Search protocols by name…"}), "xyz");
        expect(await screen.findByText("No protocols match your search.")).toBeInTheDocument();
        unmount();
        await renderPicker([], "en");
        expect(await screen.findByText("This clinic has no protocols yet.")).toBeInTheDocument();
    });
});
