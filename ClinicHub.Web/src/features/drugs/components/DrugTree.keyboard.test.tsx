import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {aDrug} from "../../../test";
import {
    ANTI_INFECTIVES,
    CATARACT,
    findDrugRow,
    findNodeRow,
    labelsAt,
    nodeRow,
    PENICILLINS,
    renderTree,
    searchTree,
    theTree,
    treeSearch,
    treeTexts,
    type TreeLang,
} from "../../../test/pages/drugTree.tsx";

// The drug tree's keyboard: docs/design/m1.7c-contract.md § 3.3 "Keyboard" (roving focus, edges, ↓ from the search
// box, Enter on a drug), decision C3 (→ / ← / Esc, mirrored in Arabic), design M1.7 D9 (`DrugTree` keyboard keeps
// `SearchableList`'s conventions where they apply).

const ar = treeTexts("ar");

/** «العيون» (Timolol in «المياه الزرقاء», Tiopex in «المياه البيضاء») and «مضادات العدوى» (Amoxil). */
const twoCategories = () => [
    aDrug({name: "Timolol"}),
    aDrug({name: "Tiopex", subCategory: CATARACT}),
    aDrug({name: "Amoxil", category: ANTI_INFECTIVES, subCategory: PENICILLINS}),
];

/** The rows that are Tab stops (`tabindex="0"`). */
const tabStops = () => screen.queryAllByRole("treeitem").filter(row => row.getAttribute("tabindex") === "0");

/** Puts the focus in the search box, then ↓ into the tree. */
const enterTree = async (user: Awaited<ReturnType<typeof renderTree>>["user"], lang: TreeLang = "ar") => {
    await user.click(treeSearch(lang));
    await user.keyboard("{ArrowDown}");
};

describe("drug tree: moving with ↑ / ↓ @area:ux", () => {
    test("↓ in the search box focuses the first row, the tree's only Tab stop; ↑ / ↓ stop at the edges @UX-018", async () => {
        const {user} = await renderTree({drugs: twoCategories()});
        await findNodeRow("العيون");
        expect(labelsAt(1)).toEqual(["العيون، 2", "مضادات العدوى، 1"]);
        expect(tabStops()).toEqual([nodeRow("العيون")]);

        await enterTree(user);
        expect(nodeRow("العيون")).toHaveFocus();
        await user.keyboard("{ArrowUp}");
        expect(nodeRow("العيون")).toHaveFocus();
        await user.keyboard("{ArrowDown}");
        expect(nodeRow("مضادات العدوى")).toHaveFocus();
        expect(tabStops()).toEqual([nodeRow("مضادات العدوى")]);
        await user.keyboard("{ArrowDown}{ArrowDown}");
        expect(nodeRow("مضادات العدوى")).toHaveFocus();
        await user.keyboard("{ArrowUp}");
        expect(nodeRow("العيون")).toHaveFocus();
    });

    test("↓ / ↑ walk the open rows top to bottom: categories, subcategories, loaded drugs @UX-018", async () => {
        const {user} = await renderTree({drugs: twoCategories()});
        await findNodeRow("العيون");
        await enterTree(user);
        // → opens «العيون» (English) / ← in Arabic: here Arabic, so ←
        await user.keyboard("{ArrowLeft}");
        await waitFor(() => expect(nodeRow("العيون")).toHaveAttribute("aria-expanded", "true"));
        await user.keyboard("{ArrowDown}");
        expect(nodeRow("المياه البيضاء")).toHaveFocus();
        await user.keyboard("{ArrowLeft}");
        await findDrugRow("Tiopex");
        await user.keyboard("{ArrowDown}");
        expect(screen.getByRole("treeitem", {name: "Tiopex"})).toHaveFocus();
        await user.keyboard("{ArrowDown}");
        expect(nodeRow("المياه الزرقاء")).toHaveFocus();
        await user.keyboard("{ArrowDown}");
        expect(nodeRow("مضادات العدوى")).toHaveFocus();
        await user.keyboard("{ArrowUp}{ArrowUp}");
        expect(screen.getByRole("treeitem", {name: "Tiopex"})).toHaveFocus();
    });
});

describe("drug tree: opening and closing with the keyboard @area:ux", () => {
    test("in Arabic: ← opens, then moves into the node; → or Esc closes it; on a drug, Esc closes its subcategory and focuses it @UX-019", async () => {
        const {user} = await renderTree({drugs: twoCategories()});
        const eye = await findNodeRow("العيون");
        await enterTree(user);

        await user.keyboard("{ArrowLeft}");
        await waitFor(() => expect(eye).toHaveAttribute("aria-expanded", "true"));
        expect(eye).toHaveFocus();
        await user.keyboard("{ArrowRight}");
        await waitFor(() => expect(eye).toHaveAttribute("aria-expanded", "false"));
        expect(eye).toHaveFocus();
        // Enter toggles a node like a click
        await user.keyboard("{Enter}");
        await waitFor(() => expect(eye).toHaveAttribute("aria-expanded", "true"));
        await user.keyboard("{Escape}");
        await waitFor(() => expect(eye).toHaveAttribute("aria-expanded", "false"));
        // On a closed category, the closing keys do nothing
        await user.keyboard("{Escape}{ArrowRight}");
        expect(eye).toHaveAttribute("aria-expanded", "false");
        expect(eye).toHaveFocus();

        await user.keyboard("{ArrowLeft}{ArrowLeft}");
        const cataract = nodeRow("المياه البيضاء");
        expect(cataract).toHaveFocus();
        await user.keyboard("{ArrowLeft}");
        await waitFor(() => expect(cataract).toHaveAttribute("aria-expanded", "true"));
        await findDrugRow("Tiopex");
        await user.keyboard("{ArrowLeft}");
        expect(screen.getByRole("treeitem", {name: "Tiopex"})).toHaveFocus();
        // The opening arrow on a drug does nothing
        await user.keyboard("{ArrowLeft}");
        expect(screen.getByRole("treeitem", {name: "Tiopex"})).toHaveFocus();

        await user.keyboard("{Escape}");
        await waitFor(() => expect(cataract).toHaveAttribute("aria-expanded", "false"));
        expect(cataract).toHaveFocus();
        expect(screen.queryByRole("treeitem", {name: "Tiopex"})).not.toBeInTheDocument();
        // On a closed subcategory: its category closes and gets the focus
        await user.keyboard("{ArrowRight}");
        await waitFor(() => expect(eye).toHaveAttribute("aria-expanded", "false"));
        expect(eye).toHaveFocus();
    });

    test("in English: → opens and moves in, ← closes, mirrored from Arabic @UX-019", async () => {
        const {user} = await renderTree({drugs: twoCategories(), lang: "en"});
        const eye = await findNodeRow("Eye", "en");
        // In English "Anti-infectives" comes first
        expect(labelsAt(1)).toEqual(["Anti-infectives, 1", "Eye, 2"]);
        await enterTree(user, "en");
        await user.keyboard("{ArrowDown}");
        expect(eye).toHaveFocus();
        await user.keyboard("{ArrowLeft}");
        expect(eye).toHaveAttribute("aria-expanded", "false");
        await user.keyboard("{ArrowRight}");
        await waitFor(() => expect(eye).toHaveAttribute("aria-expanded", "true"));
        await user.keyboard("{ArrowRight}");
        const cataract = nodeRow("Cataract", "en");
        expect(cataract).toHaveFocus();
        await user.keyboard("{ArrowRight}");
        await findDrugRow("Tiopex");
        await user.keyboard("{ArrowRight}");
        expect(screen.getByRole("treeitem", {name: "Tiopex"})).toHaveFocus();
        await user.keyboard("{ArrowLeft}");
        await waitFor(() => expect(cataract).toHaveAttribute("aria-expanded", "false"));
        expect(cataract).toHaveFocus();
        await user.keyboard("{ArrowUp}{ArrowLeft}");
        await waitFor(() => expect(eye).toHaveAttribute("aria-expanded", "false"));
        expect(eye).toHaveFocus();
    });

    test("Esc in the search box clears the search: the whole tree again, the first row active @UX-019", async () => {
        const {user} = await renderTree({drugs: twoCategories()});
        await findNodeRow("مضادات العدوى");
        await enterTree(user);
        await user.keyboard("{ArrowDown}");
        expect(tabStops()).toEqual([nodeRow("مضادات العدوى")]);

        await searchTree(user, "amox");
        await waitFor(() => expect(labelsAt(1)).toEqual(["مضادات العدوى، 1"]));
        await user.keyboard("{Escape}");
        expect(treeSearch()).toHaveValue("");
        await waitFor(() => expect(labelsAt(1)).toEqual(["العيون، 2", "مضادات العدوى، 1"]));
        await waitFor(() => expect(tabStops()).toEqual([nodeRow("العيون")]));
    });

    test("a new search makes the first row of the new tree the active one @UX-019", async () => {
        const {user} = await renderTree({drugs: twoCategories()});
        await findNodeRow("العيون");
        await enterTree(user);
        await user.keyboard("{ArrowDown}");
        expect(nodeRow("مضادات العدوى")).toHaveFocus();
        await searchTree(user, "ti");
        await waitFor(() => expect(labelsAt(1)).toEqual(["العيون، 2"]));
        await waitFor(() => expect(tabStops()).toEqual([nodeRow("العيون")]));
        await user.keyboard("{ArrowDown}");
        expect(nodeRow("العيون")).toHaveFocus();
    });
});

describe("drug tree: Enter on a drug @area:catalog", () => {
    test("Enter adds the drug and keeps the focus on its row, now «مُضاف»; ↓ Enter adds the next @CAT-105", async () => {
        const timolol = aDrug({name: "Timolol"});
        const xalatan = aDrug({name: "Xalatan"});
        const {user, onSelect} = await renderTree({drugs: [timolol, xalatan]});
        await findDrugRow("Xalatan");
        await enterTree(user);
        // «العيون» → «المياه الزرقاء» → Timolol
        await user.keyboard("{ArrowDown}{ArrowDown}");
        const first = screen.getByRole("treeitem", {name: "Timolol"});
        expect(first).toHaveFocus();

        await user.keyboard("{Enter}");
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({id: timolol.id, name: "Timolol"}));
        expect(await within(screen.getByRole("treeitem", {name: "Timolol"})).findByText(ar.added)).toBeInTheDocument();
        expect(screen.getByRole("treeitem", {name: "Timolol"})).toHaveFocus();

        await user.keyboard("{ArrowDown}{Enter}");
        expect(onSelect).toHaveBeenCalledTimes(2);
        expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({id: xalatan.id}));
        expect(screen.getByRole("treeitem", {name: "Xalatan"})).toHaveFocus();
        expect(theTree().contains(document.activeElement)).toBe(true);
    });
});
