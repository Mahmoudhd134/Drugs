import {describe, expect, test, vi} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {aDrug, EYE, GLAUCOMA, manyDrugs, recordRequests} from "../../../test";
import type {CategoryName} from "../types.ts";
import {
    CATARACT,
    childrenOf,
    closeNode,
    drugNamesUnder,
    drugRow,
    findDrugRow,
    findNodeRow,
    holdRequests,
    nodeRow,
    openNode,
    pagesRequested,
    paramsOf,
    pastDebounce,
    renderTree,
    rowsAt,
    sentinelOf,
    theTree,
    treeSearch,
    treeTexts,
} from "../../../test/pages/drugTree.tsx";

// The drug tree's pages: docs/design/m1.7c-contract.md § 2.2 (`useDrugBucket`: 30 per page, closing removes the
// pages), § 3.3 (sentinel, «تحميل المزيد», infinite scroll, de-duplication, ↓ on the last loaded drug), design M1.7 D7
// (each open subcategory its own query) and D9.

const ar = treeTexts("ar");
const glaucomaRow = () => nodeRow("المياه الزرقاء");

/** Every name once: no drug shown twice. */
const expectUnique = (names: Array<string | null>) => expect(new Set(names).size).toBe(names.length);

describe("drug tree: pages of 30 while scrolling @area:catalog", () => {
    test("«النتائج: 70» is the sum of the counts; the next 30 load when the end comes into view, to the last @DRUG-058", async () => {
        const drugs = [...manyDrugs(65), ...manyDrugs(5, {subCategory: CATARACT}, "Other")];
        const recorded = recordRequests();
        const {user, io} = await renderTree({drugs});
        expect(await screen.findByText(ar.results("70"))).toBeInTheDocument();
        await openNode(user, await findNodeRow("العيون", "ar", 70));
        const glaucoma = await openNode(user, nodeRow("المياه الزرقاء", "ar", 65));
        await findDrugRow("Drug 030");
        expect(drugNamesUnder(glaucoma)).toHaveLength(30);

        io.enter(sentinelOf(glaucoma));
        await findDrugRow("Drug 060");
        expect(drugNamesUnder(glaucoma)).toHaveLength(60);
        io.enter(sentinelOf(glaucoma));
        await findDrugRow("Drug 065");
        expect(drugNamesUnder(glaucoma)).toHaveLength(65);
        expect(within(childrenOf(glaucoma)).queryByRole("button", {name: ar.loadMore})).not.toBeInTheDocument();

        const pages = paramsOf(recorded.requests, "/drugs");
        expect(pages.map(p => `${p.get("page")}/${p.get("pageSize")}`)).toEqual(["1/30", "2/30", "3/30"]);
        for (const p of pages) {
            expect(p.get("categoryId")).toBe(String(EYE.id));
            expect(p.get("subCategoryId")).toBe(String(GLAUCOMA.id));
        }
        expect(screen.getByText(ar.results("70"))).toBeInTheDocument();
    });

    test("in English: \"Results: 70\" @DRUG-058", async () => {
        await renderTree({drugs: [...manyDrugs(65), ...manyDrugs(5, {subCategory: CATARACT}, "Other")], lang: "en"});
        expect(await screen.findByText(treeTexts("en").results("70"))).toBeInTheDocument();
    });

    test("a subcategory of exactly 30: no request after the first page, no «تحميل المزيد» @CAT-098", async () => {
        const recorded = recordRequests();
        const {io} = await renderTree({drugs: manyDrugs(30)});
        await findDrugRow("Drug 030");
        expect(drugNamesUnder(glaucomaRow())).toHaveLength(30);
        io.enterAll();
        await pastDebounce();
        expect(pagesRequested(recorded.requests)).toEqual([`${GLAUCOMA.id}:1`]);
        expect(screen.queryByRole("button", {name: ar.loadMore})).not.toBeInTheDocument();
    });

    test("a subcategory of 31: one more request, with the 31st drug, then nothing more @CAT-098", async () => {
        const recorded = recordRequests();
        const {io} = await renderTree({drugs: manyDrugs(31)});
        await findDrugRow("Drug 030");
        io.enter(sentinelOf(glaucomaRow()));
        await findDrugRow("Drug 031");
        expect(drugNamesUnder(glaucomaRow())).toHaveLength(31);
        io.enterAll();
        await pastDebounce();
        expect(pagesRequested(recorded.requests)).toEqual([`${GLAUCOMA.id}:1`, `${GLAUCOMA.id}:2`]);
    });

    test("the end leaving and re-entering the view while the next page loads: that page is requested once, no duplicate rows @CAT-119", async () => {
        const recorded = recordRequests();
        const {io} = await renderTree({drugs: manyDrugs(65)});
        await findDrugRow("Drug 030");
        const nextPage = holdRequests("/drugs", p => p.get("page") === "2");
        io.enter(sentinelOf(glaucomaRow()));
        await waitFor(() => expect(nextPage.held()).toBe(1));

        // A fast scroll up and down while it loads
        const sentinel = within(childrenOf(glaucomaRow())).queryByTestId("drug-tree-sentinel");
        if (sentinel) {
            io.enter(sentinel, false);
            io.enter(sentinel);
        }
        io.enterAll();
        await pastDebounce();
        expect(nextPage.held()).toBe(1);

        nextPage.release();
        await findDrugRow("Drug 060");
        const names = drugNamesUnder(glaucomaRow());
        expect(names).toHaveLength(60);
        expectUnique(names);
        expect(pagesRequested(recorded.requests)).toEqual([`${GLAUCOMA.id}:1`, `${GLAUCOMA.id}:2`]);
    });

    test("a category opened: no drug request; 5 subcategories opened: exactly 5 first pages, each loading more only at its own end @CAT-120", async () => {
        const subs: CategoryName[] = [1, 2, 3, 4, 5].map(n => ({id: 200 + n, nameEn: `Sub ${n}`, nameAr: `فرعي ${n}`}));
        const drugs = subs.flatMap((subCategory, i) => manyDrugs(31, {subCategory}, `S${i + 1}`));
        const recorded = recordRequests();
        const {user, io} = await renderTree({drugs});
        await openNode(user, await findNodeRow("العيون", "ar", 155));
        await pastDebounce();
        expect(pagesRequested(recorded.requests)).toEqual([]);

        for (const sub of subs) await openNode(user, nodeRow(sub.nameAr, "ar", 31));
        for (const n of [1, 2, 3, 4, 5]) await findDrugRow(`S${n} 030`);
        expect(pagesRequested(recorded.requests).sort()).toEqual(subs.map(s => `${s.id}:1`).sort());
        for (const p of paramsOf(recorded.requests, "/drugs")) expect(p.get("categoryId")).toBe(String(EYE.id));

        io.enter(sentinelOf(nodeRow("فرعي 3")));
        await findDrugRow("S3 031");
        await pastDebounce();
        expect(pagesRequested(recorded.requests).filter(p => p.endsWith(":2"))).toEqual(["203:2"]);
        expect(drugNamesUnder(nodeRow("فرعي 2"))).toHaveLength(30);
    });

    test("a subcategory closed after 4 pages and opened again: its first page from the top, no duplicates, and its loading works again @CAT-121", async () => {
        const recorded = recordRequests();
        const {user, io} = await renderTree({drugs: manyDrugs(125)});
        await findDrugRow("Drug 030");
        for (const last of ["Drug 060", "Drug 090", "Drug 120"]) {
            io.enter(sentinelOf(glaucomaRow()));
            await findDrugRow(last);
        }
        expect(drugNamesUnder(glaucomaRow())).toHaveLength(120);

        await closeNode(user, glaucomaRow());
        expect(screen.queryByRole("treeitem", {name: "Drug 001"})).not.toBeInTheDocument();
        const before = recorded.requests.length;
        await openNode(user, glaucomaRow());
        await findDrugRow("Drug 030");
        let names = drugNamesUnder(glaucomaRow());
        expect(names[0]).toBe("Drug 001");
        expect(names).toHaveLength(30);
        expect(screen.queryByRole("treeitem", {name: "Drug 031"})).not.toBeInTheDocument();

        io.enter(sentinelOf(glaucomaRow()));
        await findDrugRow("Drug 060");
        names = drugNamesUnder(glaucomaRow());
        expect(names).toHaveLength(60);
        expectUnique(names);
        expect(pagesRequested(recorded.requests.slice(before))).toEqual([`${GLAUCOMA.id}:1`, `${GLAUCOMA.id}:2`]);
    });

    test("a category closed with a subcategory open: the subcategory closes too, its pages dropped; reopened, it starts from page 1 @CAT-121", async () => {
        // Decision C21: closing a category closes its subcategories like closing each of them
        const drugs = [...manyDrugs(65), aDrug({name: "Tiopex", subCategory: CATARACT})];
        const recorded = recordRequests();
        const {user, io} = await renderTree({drugs});
        const eye = await openNode(user, await findNodeRow("العيون", "ar", 66));
        await openNode(user, nodeRow("المياه الزرقاء", "ar", 65));
        await findDrugRow("Drug 030");
        io.enter(sentinelOf(glaucomaRow()));
        await findDrugRow("Drug 060");

        await closeNode(user, eye);
        expect(rowsAt(2)).toEqual([]);
        expect(rowsAt(3)).toEqual([]);
        await openNode(user, eye);
        expect(nodeRow("المياه الزرقاء", "ar", 65)).toHaveAttribute("aria-expanded", "false");
        expect(rowsAt(3)).toEqual([]);

        const before = recorded.requests.length;
        await openNode(user, glaucomaRow());
        await findDrugRow("Drug 030");
        const names = drugNamesUnder(glaucomaRow());
        expect(names[0]).toBe("Drug 001");
        expect(names).toHaveLength(30);
        expect(pagesRequested(recorded.requests.slice(before))).toEqual([`${GLAUCOMA.id}:1`]);
    });

    test("an own drug added between two page requests: no drug shown twice, no duplicate React key @CAT-122", async () => {
        const drugs = manyDrugs(31);
        const errors = vi.spyOn(console, "error");
        const {io} = await renderTree({drugs});
        await findDrugRow("Drug 030");
        // Added in another tab: own drugs come first, so page 2 now starts with page 1's last drug
        drugs.unshift(aDrug({name: "Added meanwhile"}));
        io.enter(sentinelOf(glaucomaRow()));
        await findDrugRow("Drug 031");
        const names = drugNamesUnder(glaucomaRow());
        expectUnique(names);
        expect(names.filter(n => n === "Drug 030")).toHaveLength(1);
        expect(names).toHaveLength(31);
        expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/i);
    });
});

describe("drug tree: «تحميل المزيد» @area:catalog", () => {
    test("follows the last loaded row while more pages exist, is reached by Tab, loads the next page, and is gone once all are loaded @CAT-108", async () => {
        const {user} = await renderTree({drugs: manyDrugs(65)});
        await findDrugRow("Drug 030");
        const more = within(childrenOf(glaucomaRow())).getByRole("button", {name: ar.loadMore});
        expect(drugRow("Drug 030").compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        // The tree is one Tab stop: from its row, Tab reaches the button
        await user.click(treeSearch());
        await user.keyboard("{ArrowDown}");
        expect(theTree().contains(document.activeElement)).toBe(true);
        await user.tab();
        expect(more).toHaveFocus();
        await user.keyboard("{Enter}");
        await findDrugRow("Drug 060");
        expect(drugNamesUnder(glaucomaRow())).toHaveLength(60);

        await user.click(within(childrenOf(glaucomaRow())).getByRole("button", {name: ar.loadMore}));
        await findDrugRow("Drug 065");
        expect(within(childrenOf(glaucomaRow())).queryByRole("button", {name: ar.loadMore})).not.toBeInTheDocument();
    });

    test("in English: \"Load more\" @CAT-108", async () => {
        await renderTree({drugs: manyDrugs(31), lang: "en"});
        await findDrugRow("Drug 030");
        expect(within(childrenOf(nodeRow("Glaucoma", "en"))).getByRole("button", {name: treeTexts("en").loadMore})).toBeInTheDocument();
    });

    test("while the next page loads: a spinner in that subcategory instead of the button @CAT-108", async () => {
        const {user} = await renderTree({drugs: manyDrugs(65)});
        await findDrugRow("Drug 030");
        const nextPage = holdRequests("/drugs", p => p.get("page") === "2");
        await user.click(within(childrenOf(glaucomaRow())).getByRole("button", {name: ar.loadMore}));
        await waitFor(() => expect(nextPage.held()).toBe(1));
        expect(within(childrenOf(glaucomaRow())).getByRole("progressbar", {name: ar.loading})).toBeInTheDocument();
        expect(within(childrenOf(glaucomaRow())).queryByRole("button", {name: ar.loadMore})).not.toBeInTheDocument();
        nextPage.release();
        await findDrugRow("Drug 060");
    });
});

describe("drug tree: ↓ on the last loaded drug @area:catalog", () => {
    test("loads the next page and moves the focus to its first new drug, never to <body> @CAT-104", async () => {
        const recorded = recordRequests();
        const {user} = await renderTree({drugs: manyDrugs(31)});
        await findDrugRow("Drug 030");
        await user.click(treeSearch());
        // Into the tree («العيون»), then «المياه الزرقاء» and its 30 drugs
        await user.keyboard("{ArrowDown}");
        await user.keyboard("{ArrowDown}".repeat(31));
        expect(drugRow("Drug 030")).toHaveFocus();

        const nextPage = holdRequests("/drugs", p => p.get("page") === "2");
        await user.keyboard("{ArrowDown}");
        await waitFor(() => expect(nextPage.held()).toBe(1));
        expect(document.activeElement).not.toBe(document.body);
        expect(theTree().contains(document.activeElement)).toBe(true);

        nextPage.release();
        await waitFor(() => expect(drugRow("Drug 031")).toHaveFocus());
        expect(pagesRequested(recorded.requests)).toEqual([`${GLAUCOMA.id}:1`, `${GLAUCOMA.id}:2`]);
    });

    test("on the last drug of a subcategory with no more pages, ↓ goes on to the next row without a request @CAT-104", async () => {
        const recorded = recordRequests();
        const {user} = await renderTree({drugs: [aDrug({name: "Timolol"}), aDrug({name: "Tiopex", subCategory: CATARACT})]});
        await findNodeRow("العيون");
        await user.click(treeSearch());
        // Into «العيون», ← opens it (Arabic), ↓ «المياه البيضاء», ← opens it, ↓ Tiopex
        await user.keyboard("{ArrowDown}{ArrowLeft}");
        await waitFor(() => expect(nodeRow("العيون")).toHaveAttribute("aria-expanded", "true"));
        await user.keyboard("{ArrowDown}{ArrowLeft}");
        await findDrugRow("Tiopex");
        await user.keyboard("{ArrowDown}");
        expect(drugRow("Tiopex")).toHaveFocus();
        await user.keyboard("{ArrowDown}");
        expect(nodeRow("المياه الزرقاء")).toHaveFocus();
        expect(pagesRequested(recorded.requests)).toEqual([`${CATARACT.id}:1`]);
    });
});
