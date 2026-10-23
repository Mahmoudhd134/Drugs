import {describe, expect, test} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {aDrug, aProtocol, aSharedDrug, recordRequests} from "../../../test";
import {openPrescription, storedLines} from "../../../test/pages/prescription.tsx";
import {
    CATARACT,
    drugNamesUnder,
    findDrugRow,
    findNodeRow,
    nodeRow,
    openNode,
    pastDebounce,
    searchTree,
    treeSearch,
    treeTexts,
} from "../../../test/pages/drugTree.tsx";

// The drug tree in the prescription's «الأدوية» tab: docs/design/m1.7c-contract.md § 3.2 (both tabs stay mounted,
// «البروتوكولات» the default), § 3.3 "Selecting a drug", design M1.7 D9 (the two tabs keep the search, open nodes and
// scroll) and § 8 (a drug withdrawn after the tree loaded it is still added: accepted stale picker).

const ar = treeTexts("ar");

describe("the prescription's drug tree @area:prescription", () => {
    test("«البروتوكولات» and back: the tree's search, open nodes and scroll position are kept, nothing reloaded @CAT-124", async () => {
        const drugs = [aDrug({name: "Timolol"}), aDrug({name: "Tiopex", subCategory: CATARACT}), aDrug({name: "Xalatan"})];
        const {user, io} = await openPrescription({protocols: [aProtocol({name: "Post cataract"})], drugs});
        await screen.findByText("Post cataract");
        await user.click(screen.getByRole("tab", {name: "الأدوية"}));
        await searchTree(user, "ti");
        await openNode(user, await findNodeRow("العيون", "ar", 2));
        const glaucoma = await openNode(user, nodeRow("المياه الزرقاء", "ar", 1));
        await findDrugRow("Timolol");
        const panel = io.roots().find((root): root is HTMLElement => root instanceof HTMLElement);
        expect(panel, "the scroll panel (the observers' root)").toBeDefined();
        panel!.scrollTop = 120;
        const recorded = recordRequests();

        await user.click(screen.getByRole("tab", {name: "البروتوكولات"}));
        expect(screen.getByRole("tab", {name: "البروتوكولات"})).toHaveAttribute("aria-selected", "true");
        await user.click(screen.getByRole("tab", {name: "الأدوية"}));

        expect(treeSearch()).toHaveValue("ti");
        expect(nodeRow("العيون", "ar", 2)).toHaveAttribute("aria-expanded", "true");
        expect(glaucoma).toHaveAttribute("aria-expanded", "true");
        expect(drugNamesUnder(glaucoma)).toEqual(["Timolol"]);
        expect(panel).toBeInTheDocument();
        expect(panel!.scrollTop).toBe(120);
        await pastDebounce();
        expect(recorded.requests.filter(r => r.path.startsWith("/drugs"))).toEqual([]);
    });

    test("a drug picked keeps the tree's search, its open nodes and its loaded rows @CAT-117", async () => {
        // Xalatan doesn't match "ti": the search's tree («العيون، 2») is told apart from the full one («العيون، 3»)
        const drugs = [aDrug({name: "Timolol"}), aDrug({name: "Tiopex", subCategory: CATARACT}), aDrug({name: "Xalatan"})];
        const {user} = await openPrescription({drugs});
        await user.click(screen.getByRole("tab", {name: "الأدوية"}));
        await searchTree(user, "ti");
        await openNode(user, await findNodeRow("العيون", "ar", 2));
        await openNode(user, nodeRow("المياه الزرقاء", "ar", 1));
        await user.click(await findDrugRow("Timolol"));
        await waitFor(() => expect(storedLines().map(l => l.drug.name)).toEqual(["Timolol"]));
        expect(treeSearch()).toHaveValue("ti");
        expect(nodeRow("المياه الزرقاء")).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("treeitem", {name: "Timolol"})).toBeInTheDocument();
    });

    test("a drug withdrawn after the tree loaded it: clicked, it is added; the next tree load hides it @CAT-166", async () => {
        const vigamox = aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"});
        const {user} = await openPrescription({drugs: [vigamox]});
        await user.click(screen.getByRole("tab", {name: "الأدوية"}));
        const row = await findDrugRow(vigamox.name);
        // The super admin disables it now; this tree still shows it
        vigamox.withdrawn = true;
        await user.click(row);
        await waitFor(() => expect(storedLines().map(l => l.drug.name)).toEqual([vigamox.name]));

        await searchTree(user, "vig");
        expect(await screen.findByText(ar.noResults)).toBeInTheDocument();
        expect(screen.queryByRole("treeitem", {name: vigamox.name})).not.toBeInTheDocument();
    });
});
