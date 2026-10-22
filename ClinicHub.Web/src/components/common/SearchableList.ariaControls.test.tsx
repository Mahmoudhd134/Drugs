import {describe, expect, test, vi} from "vitest";
import {screen} from "@testing-library/react";
import {renderWithProviders} from "../../test";
import {SearchableList} from "./SearchableList.tsx";

// WAI-ARIA combobox/listbox (UX-036 "no serious axe violation", GRP-102's axe check): the search field's
// aria-controls names the results listbox only while that listbox is in the DOM, never a missing element.

type Item = { id: number; name: string };
const ITEMS: Item[] = [{id: 1, name: "Atropine"}, {id: 2, name: "Cosopt"}];

const renderList = (state: { items?: Item[]; isLoading?: boolean; isError?: boolean }) =>
    renderWithProviders(
        <SearchableList<Item>
            search=""
            onSearchChange={vi.fn()}
            placeholder="Search…"
            items={state.items ?? []}
            getKey={item => item.id}
            renderItem={item => item.name}
            onSelect={vi.fn()}
            isLoading={state.isLoading ?? false}
            isError={state.isError ?? false}
            onRetry={vi.fn()}
            emptyText="Nothing found"
        />,
        {lang: "en"},
    );

describe("search lists: aria-controls points only at a rendered listbox @area:ux", () => {
    test("results shown: the field's aria-controls is the id of the results listbox @UX-036", async () => {
        await renderList({items: ITEMS});
        const listbox = screen.getByRole("listbox", {name: "Search results"});
        const controls = screen.getByRole("searchbox").getAttribute("aria-controls");
        expect(controls).toBeTruthy();
        expect(document.getElementById(controls!)).toBe(listbox);
    });

    test("loading: no listbox and the field has no aria-controls @UX-036", async () => {
        await renderList({items: ITEMS, isLoading: true});
        expect(screen.getByRole("progressbar", {name: "Loading…"})).toBeInTheDocument();
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        expect(screen.getByRole("searchbox")).not.toHaveAttribute("aria-controls");
    });

    test("load error: no listbox and the field has no aria-controls @UX-036", async () => {
        await renderList({items: ITEMS, isError: true});
        expect(screen.getByText("Couldn't load data.")).toBeInTheDocument();
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        expect(screen.getByRole("searchbox")).not.toHaveAttribute("aria-controls");
    });

    test("no results (empty text shown): no listbox and the field has no aria-controls @UX-036", async () => {
        await renderList({items: []});
        expect(screen.getByText("Nothing found")).toBeInTheDocument();
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
        expect(screen.getByRole("searchbox")).not.toHaveAttribute("aria-controls");
    });
});
