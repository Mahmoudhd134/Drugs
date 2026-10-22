import {describe, expect, test, vi} from "vitest";
import {screen, within} from "@testing-library/react";
import {aDrug, drugsHandlers, recordRequests, renderWithProviders, server} from "../../../test";
import type {Drug} from "../types.ts";
import {DrugPicker} from "./DrugPicker.tsx";

// The drug picker (protocols editor, prescription): docs/features/drugs/tech.md "Frontend" (DrugPicker, DrugText) and
// docs/tech/overview.md "Data fetching" (pickers: "load more", 30 per page).

const renderPicker = async (drugs: Drug[], selectedIds?: Set<number>, lang: "ar" | "en" = "ar") => {
    server.use(...drugsHandlers(drugs));
    const onSelect = vi.fn();
    const rendered = await renderWithProviders(<DrugPicker onSelect={onSelect} selectedIds={selectedIds}/>, {lang});
    await screen.findByRole("listbox");
    return {...rendered, onSelect};
};

const options = () => screen.getAllByRole("option");
const optionOf = (name: string) => screen.getByText(name).closest("[role=option]") as HTMLElement;

describe("drug picker @area:catalog", () => {
    test("30 results at a time: «تحميل المزيد» loads the next 30, «النتائج: N» shows the total @DRUG-058", async () => {
        const drugs = Array.from({length: 65}, (_, i) => aDrug({name: `Drug ${i + 1}`}));
        const recorded = recordRequests();
        const {user} = await renderPicker(drugs);
        expect(options()).toHaveLength(30);
        expect(screen.getByText("النتائج: 65")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "تحميل المزيد"}));
        expect(await screen.findByText("Drug 60")).toBeInTheDocument();
        expect(options()).toHaveLength(60);
        await user.click(screen.getByRole("button", {name: "تحميل المزيد"}));
        expect(await screen.findByText("Drug 65")).toBeInTheDocument();
        expect(options()).toHaveLength(65);
        expect(screen.queryByRole("button", {name: "تحميل المزيد"})).not.toBeInTheDocument();
        expect(screen.getByText("النتائج: 65")).toBeInTheDocument();
        expect(recorded.requests.map(r => new URLSearchParams(r.search).get("page") + "/" + new URLSearchParams(r.search).get("pageSize")))
            .toEqual(["1/30", "2/30", "3/30"]);
    });

    test("in English: \"Results: N\" and \"Load more\" @DRUG-058", async () => {
        await renderPicker(Array.from({length: 31}, (_, i) => aDrug({name: `Drug ${i + 1}`})), undefined, "en");
        expect(screen.getByText("Results: 31")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Load more"})).toBeInTheDocument();
    });

    test("each drug shows its name, default dosing sentence and description; chosen drugs show «مُضاف» @DRUG-059", async () => {
        const tobradex = aDrug({name: "Tobradex", description: "Antibiotic + steroid", defaultDosing: {doseUnit: "drop", frequency: "daily", frequencyValue: 4}});
        const vigamox = aDrug({name: "Vigamox", description: "Antibiotic"});
        await renderPicker([tobradex, vigamox], new Set([tobradex.id]));
        const first = within(optionOf("Tobradex"));
        expect(first.getByText("نقطة واحدة 4 مرات يوميًا")).toBeInTheDocument();
        expect(first.getByText("Antibiotic + steroid")).toBeInTheDocument();
        expect(first.getByText("مُضاف")).toBeInTheDocument();
        const second = within(optionOf("Vigamox"));
        expect(second.getByText("Antibiotic")).toBeInTheDocument();
        expect(second.queryByText("مُضاف")).not.toBeInTheDocument();
    });

    test("in English the chip reads \"Added\" @DRUG-059", async () => {
        const drug = aDrug({name: "Tobradex"});
        await renderPicker([drug], new Set([drug.id]), "en");
        expect(within(optionOf("Tobradex")).getByText("Added")).toBeInTheDocument();
    });

    test("a default dosing of only «اليمنى»: «في العين اليمنى» and the description in the picker @DRUG-103", async () => {
        await renderPicker([aDrug({name: "Tobradex", description: "Antibiotic + steroid", defaultDosing: {eye: "right"}})]);
        const option = within(optionOf("Tobradex"));
        expect(option.getByText("في العين اليمنى")).toBeInTheDocument();
        expect(option.getByText("Antibiotic + steroid")).toBeInTheDocument();
    });

    test("selecting a drug with a search typed clears the search box @DRUG-060", async () => {
        const tobradex = aDrug({name: "Tobradex"});
        const {user, onSelect} = await renderPicker([tobradex, aDrug({name: "Vigamox"})]);
        const search = screen.getByRole("searchbox", {name: "ابحث عن دواء بالاسم…"});
        await user.type(search, "Tob");
        await user.click(optionOf("Tobradex"));
        expect(onSelect).toHaveBeenCalledWith(tobradex);
        expect(search).toHaveValue("");
    });
});
