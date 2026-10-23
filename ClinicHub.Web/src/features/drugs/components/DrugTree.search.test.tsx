import {describe, expect, test, vi} from "vitest";
import {act, screen, waitFor} from "@testing-library/react";
import {Dialog} from "@mui/material";
import i18n from "../../../i18n";
import {aDrug, aSharedDrug, createTestQueryClient, expectStillOpen, holdTimers, recordRequests} from "../../../test";
import {drugKeys} from "../api.ts";
import {
    ANTI_INFECTIVES,
    CATARACT,
    drugNamesUnder,
    findDrugRow,
    findNodeRow,
    holdRequests,
    labelsAt,
    nodeRow,
    openNode,
    closeNode,
    paramsOf,
    pastDebounce,
    PENICILLINS,
    renderTree,
    rowsAt,
    searchTree,
    sourceButton,
    theTree,
    thinBar,
    treeSearch,
    treeTexts,
} from "../../../test/pages/drugTree.tsx";

// The drug tree's search and source: docs/design/m1.7c-contract.md § 3.3 (debounced trimmed search, Esc, the source
// toggle, the thin bar, "everything closes", auto-open once per search and source, language switch), decisions C7 and
// C12, design M1.7 D7 ("Auto-open", "New search", "Source toggle in the tree").

const ar = treeTexts("ar");

/** «العيون»: Timolol and Xalatan in «المياه الزرقاء», Tiopex in «المياه البيضاء». */
const eyeDrugs = () => [aDrug({name: "Timolol"}), aDrug({name: "Xalatan"}), aDrug({name: "Tiopex", subCategory: CATARACT})];
/** The tree requests' search terms, in order. */
const treeSearches = (requests: Parameters<typeof paramsOf>[0]) => paramsOf(requests, "/drugs/tree").map(p => p.get("search") ?? "");

describe("drug tree: a new search @area:catalog", () => {
    test("the old tree stays with a thin progress bar until the new answer, which replaces it with everything closed @CAT-101 @UX-035", async () => {
        const {user} = await renderTree({drugs: eyeDrugs()});
        await openNode(user, await findNodeRow("العيون", "ar", 3));
        const glaucoma = await openNode(user, nodeRow("المياه الزرقاء"));
        await findDrugRow("Xalatan");

        const answer = holdRequests("/drugs/tree", p => p.get("search") === "ti");
        await searchTree(user, "ti");
        await waitFor(() => expect(answer.held()).toBe(1));
        await waitFor(() => expect(thinBar()).not.toBeNull());
        expect(thinBar()).toHaveAccessibleName(ar.loading);
        expect(screen.getByRole("treeitem", {name: "Xalatan"})).toBeInTheDocument();
        expect(drugNamesUnder(glaucoma)).toEqual(["Timolol", "Xalatan"]);

        answer.release();
        await waitFor(() => expect(nodeRow("العيون", "ar", 2)).toBeInTheDocument());
        await waitFor(() => expect(thinBar()).toBeNull());
        await waitFor(() => expect(nodeRow("العيون", "ar", 2)).toHaveAttribute("aria-expanded", "false"));
        expect(rowsAt(2)).toEqual([]);
        expect(rowsAt(3)).toEqual([]);
        expect(screen.queryByRole("treeitem", {name: "Xalatan"})).not.toBeInTheDocument();
    });

    test("the first load shows a spinner, not the tree @UX-035", async () => {
        let answer!: ReturnType<typeof holdRequests>;
        await renderTree({drugs: eyeDrugs(), beforeRender: () => (answer = holdRequests("/drugs/tree"))});
        await waitFor(() => expect(answer.held()).toBe(1));
        expect(screen.getByRole("progressbar", {name: ar.loading})).toHaveClass("MuiCircularProgress-root");
        expect(screen.queryAllByRole("treeitem")).toEqual([]);
        answer.release();
        expect(await findNodeRow("العيون", "ar", 3)).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
    });

    test("typed fast (\"a\", \"am\", \"amo\"): one tree request, for the last term, after the 300 ms pause @CAT-102", async () => {
        const drugs = [aDrug({name: "Amoxil"}), aDrug({name: "Amikacin", subCategory: CATARACT}), aDrug({name: "Ampicillin", subCategory: CATARACT})];
        const {user} = await renderTree({drugs});
        await findNodeRow("العيون", "ar", 3);
        const recorded = recordRequests();
        // Its answer waits until the clock is real again (the timers held while typing)
        const answer = holdRequests("/drugs/tree", p => p.get("search") === "amo");

        const timers = holdTimers();
        await user.type(treeSearch(), "amo");
        await timers.advance(299);
        expect(treeSearches(recorded.requests)).toEqual([]);
        await timers.advance(1);
        await timers.release();
        await waitFor(() => expect(treeSearches(recorded.requests)).toEqual(["amo"]));
        await waitFor(() => expect(answer.held()).toBe(1));
        answer.release();
        expect(await screen.findByText(ar.results("1"))).toBeInTheDocument();
        expect(await findDrugRow("Amoxil")).toBeInTheDocument();
        await pastDebounce();
        expect(treeSearches(recorded.requests)).toEqual(["amo"]);
    });

    test("an older, slower answer never replaces the newer one @CAT-102", async () => {
        const drugs = [aDrug({name: "Amoxil"}), aDrug({name: "Amikacin", subCategory: CATARACT}), aDrug({name: "Ampicillin", subCategory: CATARACT})];
        const {user} = await renderTree({drugs});
        await findNodeRow("العيون", "ar", 3);
        const slow = holdRequests("/drugs/tree", p => p.get("search") === "am");
        await searchTree(user, "am");
        await waitFor(() => expect(slow.held()).toBe(1));

        await user.type(treeSearch(), "o");
        expect(await findDrugRow("Amoxil")).toBeInTheDocument();
        expect(screen.getByText(ar.results("1"))).toBeInTheDocument();

        slow.release();
        await pastDebounce();
        expect(screen.getByText(ar.results("1"))).toBeInTheDocument();
        expect(screen.queryByText(ar.results("3"))).not.toBeInTheDocument();
        expect(screen.queryByRole("treeitem", {name: /^المياه البيضاء، /})).not.toBeInTheDocument();
        expect(treeSearch()).toHaveValue("amo");
    });

    test("the search cleared with ✕, emptied, or only spaces or tatweel: the full tree, all closed, no search sent @CAT-125", async () => {
        const drugs = [...eyeDrugs(), aDrug({name: "Amoxil", category: ANTI_INFECTIVES, subCategory: PENICILLINS})];
        const recorded = recordRequests();
        const {user} = await renderTree({drugs});
        const full = ["العيون، 3", "مضادات العدوى، 1"];
        await waitFor(() => expect(labelsAt(1)).toEqual(full));

        await searchTree(user, "tim");
        expect(await findDrugRow("Timolol")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: ar.clear}));
        expect(treeSearch()).toHaveValue("");
        await waitFor(() => expect(labelsAt(1)).toEqual(full));
        await waitFor(() => expect(rowsAt(2)).toEqual([]));

        await searchTree(user, "tim");
        expect(await findDrugRow("Timolol")).toBeInTheDocument();
        await user.clear(treeSearch());
        await waitFor(() => expect(labelsAt(1)).toEqual(full));
        await waitFor(() => expect(rowsAt(2)).toEqual([]));

        for (const blank of ["   ", "ـــ", " ـ ـ "]) {
            await searchTree(user, blank);
            await pastDebounce();
            expect(labelsAt(1)).toEqual(full);
            expect(rowsAt(2)).toEqual([]);
            expect(screen.queryByText(ar.noResults)).not.toBeInTheDocument();
        }
        expect(new Set(treeSearches(recorded.requests))).toEqual(new Set(["", "tim"]));
    });

    test("Esc in the search box clears it and goes no further: the dialog around stays open, no parent sees the key @CAT-106", async () => {
        const onClose = vi.fn();
        const outsideKeys = vi.fn();
        const {user} = await renderTree({
            drugs: eyeDrugs(),
            wrap: tree => <div onKeyDown={e => outsideKeys(e.key)}><Dialog open onClose={onClose}>{tree}</Dialog></div>,
        });
        await findNodeRow("العيون");
        const dialog = screen.getByRole("dialog");
        await searchTree(user, "tim");
        expect(await findDrugRow("Timolol")).toBeInTheDocument();
        await user.keyboard("{Escape}");
        expect(treeSearch()).toHaveValue("");
        await expectStillOpen(dialog);
        expect(onClose).not.toHaveBeenCalled();
        expect(outsideKeys).not.toHaveBeenCalledWith("Escape");
        await waitFor(() => expect(labelsAt(1)).toEqual(["العيون، 3"]));
    });
});

describe("drug tree: opening by itself @area:catalog", () => {
    test("closed by the user, the opened subcategory stays closed after a refetch, until the search changes @CAT-100", async () => {
        const drugs = [aDrug({name: "Tobradex"}), aDrug({name: "Tobrex"}), aDrug({name: "Timolol", subCategory: CATARACT})];
        const queryClient = createTestQueryClient();
        const recorded = recordRequests();
        const {user} = await renderTree({drugs, queryClient});
        await findNodeRow("العيون", "ar", 3);
        expect(rowsAt(2)).toEqual([]);

        await searchTree(user, "tob");
        expect(await findDrugRow("Tobrex")).toBeInTheDocument();
        const glaucoma = nodeRow("المياه الزرقاء", "ar", 2);
        expect(glaucoma).toHaveAttribute("aria-expanded", "true");
        await closeNode(user, glaucoma);

        // A drug saved elsewhere refreshes the tree (same search and source): nothing opens or closes
        const before = treeSearches(recorded.requests).length;
        await act(() => queryClient.invalidateQueries({queryKey: drugKeys.all}));
        await waitFor(() => expect(treeSearches(recorded.requests).length).toBeGreaterThan(before));
        await pastDebounce();
        expect(nodeRow("المياه الزرقاء", "ar", 2)).toHaveAttribute("aria-expanded", "false");
        expect(nodeRow("العيون", "ar", 2)).toHaveAttribute("aria-expanded", "true");
        expect(screen.queryByRole("treeitem", {name: "Tobrex"})).not.toBeInTheDocument();

        await searchTree(user, "tobr");
        expect(await findDrugRow("Tobrex")).toBeInTheDocument();
        expect(nodeRow("المياه الزرقاء", "ar", 2)).toHaveAttribute("aria-expanded", "true");
    });

    test("a lone «بدون تصنيف فرعي» bucket opens by itself @CAT-100", async () => {
        await renderTree({drugs: [aDrug({name: "Loose 1", subCategory: null}), aDrug({name: "Loose 2", subCategory: null})]});
        expect(await findDrugRow("Loose 2")).toBeInTheDocument();
        expect(nodeRow("العيون", "ar", 2)).toHaveAttribute("aria-expanded", "true");
        expect(nodeRow(ar.noSubCategory, "ar", 2)).toHaveAttribute("aria-expanded", "true");
    });

    test("«أدوية العيادة» with one own drug and no search: its subcategory opens by itself @CAT-100", async () => {
        const drugs = [
            aDrug({name: "Tobradex"}),
            aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML", subCategory: CATARACT}),
            aSharedDrug({name: "ALEMOX 1 GM 12 F.C.TABS.", category: ANTI_INFECTIVES, subCategory: PENICILLINS}),
        ];
        const {user} = await renderTree({drugs});
        await findNodeRow("العيون", "ar", 2);
        expect(rowsAt(2)).toEqual([]);
        await user.click(sourceButton(ar.sourceOwn));
        expect(await findDrugRow("Tobradex")).toBeInTheDocument();
        expect(labelsAt(1)).toEqual(["العيون، 1"]);
        expect(nodeRow("المياه الزرقاء", "ar", 1)).toHaveAttribute("aria-expanded", "true");
    });
});

describe("drug tree: the source toggle @area:catalog", () => {
    const mixed = () => [
        aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"}),
        aSharedDrug({name: "ALEMOX 1 GM 12 F.C.TABS.", subCategory: CATARACT}),
        aDrug({name: "Tobradex"}),
        aDrug({name: "Tears", subCategory: CATARACT}),
    ];

    test("«الكل» by default; changed while a subcategory is open, the tree resets like a new search and never shows the old source's drugs @CAT-116", async () => {
        const recorded = recordRequests();
        const {user} = await renderTree({drugs: mixed()});
        await openNode(user, await findNodeRow("العيون", "ar", 4));
        expect(sourceButton(ar.sourceAll)).toHaveAttribute("aria-pressed", "true");
        const glaucoma = await openNode(user, nodeRow("المياه الزرقاء", "ar", 2));
        await findDrugRow("Tobradex");
        expect(drugNamesUnder(glaucoma)).toEqual(["VIGAMOX 0.5% EYE DROPS 5 ML", "Tobradex"]);

        const answer = holdRequests("/drugs/tree", p => p.get("source") === "own");
        await user.click(sourceButton(ar.sourceOwn));
        await waitFor(() => expect(answer.held()).toBe(1));
        await waitFor(() => expect(thinBar()).not.toBeNull());
        expect(sourceButton(ar.sourceOwn)).toHaveAttribute("aria-pressed", "true");

        answer.release();
        await waitFor(() => expect(nodeRow("العيون", "ar", 2)).toBeInTheDocument());
        await waitFor(() => expect(nodeRow("العيون", "ar", 2)).toHaveAttribute("aria-expanded", "false"));
        expect(rowsAt(3)).toEqual([]);
        await openNode(user, nodeRow("العيون", "ar", 2));
        expect(labelsAt(2)).toEqual(["المياه البيضاء، 1", "المياه الزرقاء، 1"]);
        await openNode(user, nodeRow("المياه الزرقاء", "ar", 1));
        await findDrugRow("Tobradex");
        expect(drugNamesUnder(nodeRow("المياه الزرقاء"))).toEqual(["Tobradex"]);
        expect(screen.queryByRole("treeitem", {name: "VIGAMOX 0.5% EYE DROPS 5 ML"})).not.toBeInTheDocument();
        const pages = paramsOf(recorded.requests, "/drugs");
        expect(pages[pages.length - 1].get("source")).toBe("own");
    });

    test("«المشتركة» then «الكل»: shared drugs only, then the full tree again; a click on the pressed button keeps it @CAT-116", async () => {
        const {user} = await renderTree({drugs: mixed()});
        await findNodeRow("العيون", "ar", 4);
        await user.click(sourceButton(ar.sourceShared));
        await waitFor(() => expect(labelsAt(1)).toEqual(["العيون، 2"]));
        await user.click(sourceButton(ar.sourceShared));
        expect(sourceButton(ar.sourceShared)).toHaveAttribute("aria-pressed", "true");
        await user.click(sourceButton(ar.sourceAll));
        await waitFor(() => expect(labelsAt(1)).toEqual(["العيون، 4"]));
    });
});

describe("drug tree: a new tree starts at the panel's top @area:catalog", () => {
    /** The scroll panel (contract § 3.3 item 5): the nearest element around the tree whose overflowY is auto. */
    const scrollPanel = (): HTMLElement => {
        for (let el: HTMLElement | null = theTree(); el; el = el.parentElement) if (getComputedStyle(el).overflowY === "auto") return el;
        throw new Error("no scroll panel around the tree");
    };
    /** «العيون، 4» (all): VIGAMOX (shared), Timolol and Xalatan in «المياه الزرقاء», Tiopex in «المياه البيضاء». */
    const mixed = () => [
        aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"}),
        aDrug({name: "Timolol"}),
        aDrug({name: "Xalatan"}),
        aDrug({name: "Tiopex", subCategory: CATARACT}),
    ];

    test("scrolled down an open subcategory, a new search: once its tree replaces the old one, the panel is at its top @CAT-264", async () => {
        const {user} = await renderTree({drugs: mixed()});
        await openNode(user, await findNodeRow("العيون", "ar", 4));
        await openNode(user, nodeRow("المياه الزرقاء", "ar", 3));
        await findDrugRow("Xalatan");
        scrollPanel().scrollTop = 150;

        await searchTree(user, "ti");
        await waitFor(() => expect(nodeRow("العيون", "ar", 2)).toBeInTheDocument());
        await waitFor(() => expect(scrollPanel().scrollTop).toBe(0));
    });

    test("scrolled down, the source changed: once its tree replaces the old one, the panel is at its top @CAT-264", async () => {
        const {user} = await renderTree({drugs: mixed()});
        await openNode(user, await findNodeRow("العيون", "ar", 4));
        await openNode(user, nodeRow("المياه الزرقاء", "ar", 3));
        await findDrugRow("Xalatan");
        scrollPanel().scrollTop = 150;

        await user.click(sourceButton(ar.sourceOwn));
        await waitFor(() => expect(nodeRow("العيون", "ar", 3)).toBeInTheDocument());
        await waitFor(() => expect(scrollPanel().scrollTop).toBe(0));
    });
});

describe("drug tree: switching the language @area:i18n", () => {
    test("names change language and re-sort, open nodes stay open, nothing is requested again @CAT-126", async () => {
        const drugs = [...eyeDrugs(), aDrug({name: "Amoxil", category: ANTI_INFECTIVES, subCategory: PENICILLINS})];
        const {user} = await renderTree({drugs});
        await openNode(user, await findNodeRow("العيون", "ar", 3));
        await openNode(user, nodeRow("المياه الزرقاء"));
        await findDrugRow("Xalatan");
        expect(labelsAt(1)).toEqual(["العيون، 3", "مضادات العدوى، 1"]);
        const recorded = recordRequests();

        await act(async () => {
            await i18n.changeLanguage("en");
        });
        await waitFor(() => expect(labelsAt(1)).toEqual(["Anti-infectives, 1", "Eye, 3"]));
        expect(nodeRow("Eye", "en")).toHaveAttribute("aria-expanded", "true");
        expect(labelsAt(2)).toEqual(["Cataract, 1", "Glaucoma, 2"]);
        expect(nodeRow("Glaucoma", "en")).toHaveAttribute("aria-expanded", "true");
        expect(drugNamesUnder(nodeRow("Glaucoma", "en"))).toEqual(["Timolol", "Xalatan"]);
        await pastDebounce();
        expect(recorded.requests).toEqual([]);
    });
});

describe("drug tree: a search opens single-drug branches by themselves @area:catalog", () => {
    // docs/design/m1.7-review-contract.md R3: on a search's first answer, every category whose only subcategory holds a
    // single drug opens with that subcategory; the D7 lone bucket unchanged; nothing of it without a search
    const SKIN = {id: 5, nameEn: "Skin", nameAr: "الجلدية"};
    const ACNE = {id: 40, nameEn: "Acne", nameAr: "حب الشباب"};
    const EAR = {id: 7, nameEn: "Ear", nameAr: "الأذن"};
    const OTIC = {id: 70, nameEn: "Otic drops", nameAr: "قطرات الأذن"};
    const NOSE = {id: 8, nameEn: "Nose", nameAr: "الأنف"};
    const SPRAYS = {id: 80, nameEn: "Sprays", nameAr: "بخاخات"};
    const NOSE_DROPS = {id: 81, nameEn: "Nose drops", nameAr: "نقط الأنف"};

    /** «ti» matches one drug in each of «العيون», «مضادات العدوى» and «الجلدية»; «الأذن» 2 in one subcategory; «الأنف» 1 in each of 2. */
    const drugs = () => [
        aDrug({name: "Timolol"}),
        aDrug({name: "Amoxil", subCategory: CATARACT}),
        aDrug({name: "Tazocin Ti", category: ANTI_INFECTIVES, subCategory: PENICILLINS}),
        aDrug({name: "Tretinoin", category: SKIN, subCategory: ACNE}),
        aDrug({name: "Otic Ti A", category: EAR, subCategory: OTIC}),
        aDrug({name: "Otic Ti B", category: EAR, subCategory: OTIC}),
        aDrug({name: "Spray Ti", category: NOSE, subCategory: SPRAYS}),
        aDrug({name: "Drops Ti", category: NOSE, subCategory: NOSE_DROPS}),
    ];

    test("three categories with one subcategory of one drug each open with it and show the drug; one subcategory of 2 drugs, or 2 subcategories, stay closed @CAT-279",
        async () => {
            const {user} = await renderTree({drugs: drugs()});
            await findNodeRow("العيون", "ar", 2);
            await searchTree(user, "ti");
            expect(await findDrugRow("Timolol")).toBeInTheDocument();
            expect(await findDrugRow("Tazocin Ti")).toBeInTheDocument();
            expect(await findDrugRow("Tretinoin")).toBeInTheDocument();
            for (const [category, sub] of [["العيون", "المياه الزرقاء"], ["مضادات العدوى", "البنسلينات"], ["الجلدية", "حب الشباب"]]) {
                expect(nodeRow(category, "ar", 1), category).toHaveAttribute("aria-expanded", "true");
                expect(nodeRow(sub, "ar", 1), sub).toHaveAttribute("aria-expanded", "true");
            }
            expect(nodeRow("الأذن", "ar", 2)).toHaveAttribute("aria-expanded", "false");
            expect(nodeRow("الأنف", "ar", 2)).toHaveAttribute("aria-expanded", "false");
            expect(screen.queryByRole("treeitem", {name: "Otic Ti A"})).not.toBeInTheDocument();
            expect(screen.queryByRole("treeitem", {name: "Spray Ti"})).not.toBeInTheDocument();
        });

    test("a branch the user closes stays closed until the search changes; a new search opens its own single-drug branches @CAT-279", async () => {
        const {user} = await renderTree({drugs: drugs()});
        await findNodeRow("العيون", "ar", 2);
        await searchTree(user, "ti");
        await findDrugRow("Tretinoin");
        await closeNode(user, nodeRow("الجلدية", "ar", 1));
        await pastDebounce();
        expect(nodeRow("الجلدية", "ar", 1)).toHaveAttribute("aria-expanded", "false");
        expect(nodeRow("العيون", "ar", 1)).toHaveAttribute("aria-expanded", "true");

        await searchTree(user, "tretinoin");
        // One category of one drug: open (D7 and R3 alike)
        expect(await findDrugRow("Tretinoin")).toBeInTheDocument();
        await waitFor(() => expect(nodeRow("الجلدية", "ar", 1)).toHaveAttribute("aria-expanded", "true"));
    });

    test("no search: the full tree opens nothing, even categories of one drug @CAT-280", async () => {
        const recorded = recordRequests();
        await renderTree({drugs: drugs()});
        await findNodeRow("الجلدية", "ar", 1);
        await pastDebounce();
        expect(rowsAt(1).every(row => row.getAttribute("aria-expanded") === "false")).toBe(true);
        expect(rowsAt(2)).toEqual([]);
        expect(paramsOf(recorded.requests, "/drugs")).toEqual([]);
    });

    test("no search, «أدوية العيادة» with own drugs each alone in a category: nothing opens; one own drug alone: the D7 lone bucket opens @CAT-280",
        async () => {
            const own = [aDrug({name: "Timolol"}), aDrug({name: "Tretinoin", category: SKIN, subCategory: ACNE})];
            const shared = [aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML", subCategory: CATARACT}), aSharedDrug({name: "ACNE GEL", category: SKIN, subCategory: ACNE})];
            const {user, unmount} = await renderTree({drugs: [...own, ...shared]});
            await findNodeRow("العيون", "ar", 2);
            await user.click(sourceButton(ar.sourceOwn));
            await waitFor(() => expect(nodeRow("العيون", "ar", 1)).toBeInTheDocument());
            await pastDebounce();
            expect(nodeRow("العيون", "ar", 1)).toHaveAttribute("aria-expanded", "false");
            expect(nodeRow("الجلدية", "ar", 1)).toHaveAttribute("aria-expanded", "false");
            expect(rowsAt(3)).toEqual([]);
            unmount();

            const alone = await renderTree({drugs: [own[0], ...shared]});
            await findNodeRow("العيون", "ar", 2);
            await alone.user.click(sourceButton(ar.sourceOwn));
            expect(await findDrugRow("Timolol")).toBeInTheDocument();
            expect(nodeRow("العيون", "ar", 1)).toHaveAttribute("aria-expanded", "true");
        });
});
