import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aDrug,
    ARABIC_DRUG_NAME,
    aSharedDrug,
    aTreeCategory,
    aTreeSubCategory,
    api,
    DIGITS_FIRST_NAME,
    drugsHandlers,
    expectOwnDirection,
    EYE,
    GLAUCOMA,
    hoverTooltip,
    leaveTooltip,
    OTHER,
    server,
    UNCLASSIFIED,
} from "../../../test";
import {
    CATARACT,
    childrenOf,
    drugNamesUnder,
    drugRow,
    failRequests,
    findDrugRow,
    findNodeRow,
    holdRequests,
    labelsAt,
    nodeRow,
    openNode,
    renderTree,
    rowsAt,
    searchTree,
    sourceButton,
    theTree,
    treeSearch,
    treeTexts,
} from "../../../test/pages/drugTree.tsx";

// The drug tree: what it shows. docs/design/m1.7c-contract.md § 3.3 (structure, accessible names, states), design
// M1.7 D9 (`DrugTree`: rows, chips, ARIA, states) and the business file «البحث عن دواء في الروشتة أو في البروتوكول».

const ar = treeTexts("ar");
const en = treeTexts("en");

/** «العيون» with «المياه الزرقاء» (Timolol, Xalatan) and «المياه البيضاء» (Tiopex): nothing opens by itself. */
const eyeDrugs = () => [
    aDrug({name: "Timolol"}),
    aDrug({name: "Xalatan"}),
    aDrug({name: "Tiopex", subCategory: CATARACT}),
];

describe("drug tree: structure and accessible names @area:catalog", () => {
    test("tree / treeitem with aria-level and aria-expanded; node names hold their counts; a page load sets aria-busy @CAT-107", async () => {
        const {user} = await renderTree({drugs: eyeDrugs()});
        const eye = await findNodeRow("العيون", "ar", 3);
        expect(theTree().contains(eye)).toBe(true);
        expect(eye).toHaveAttribute("aria-level", "1");
        expect(eye).toHaveAttribute("aria-expanded", "false");
        expect(rowsAt(2)).toEqual([]);

        await openNode(user, eye);
        // Without a search, by name: «المياه البيضاء» before «المياه الزرقاء» (CAT-096)
        expect(labelsAt(2)).toEqual(["المياه البيضاء، 1", "المياه الزرقاء، 2"]);
        const glaucoma = nodeRow("المياه الزرقاء", "ar", 2);
        expect(glaucoma).toHaveAttribute("aria-level", "2");
        expect(glaucoma).toHaveAttribute("aria-expanded", "false");

        const page = holdRequests("/drugs", p => p.get("subCategoryId") === String(GLAUCOMA.id));
        await user.click(glaucoma);
        await waitFor(() => expect(page.held()).toBe(1));
        expect(glaucoma).toHaveAttribute("aria-expanded", "true");
        await waitFor(() => expect(childrenOf(glaucoma)).toHaveAttribute("aria-busy", "true"));

        page.release();
        const timolol = await findDrugRow("Timolol");
        expect(timolol).toHaveAttribute("aria-level", "3");
        expect(timolol).not.toHaveAttribute("aria-expanded");
        expect(drugNamesUnder(glaucoma)).toEqual(["Timolol", "Xalatan"]);
        await waitFor(() => expect(childrenOf(glaucoma)).not.toHaveAttribute("aria-busy", "true"));
    });

    test("in English: \"Drug catalog\", nodes named \"Eye, 3\" and \"Glaucoma, 2\" @CAT-107", async () => {
        const {user} = await renderTree({drugs: eyeDrugs(), lang: "en"});
        const eye = await findNodeRow("Eye", "en", 3);
        expect(theTree("en").contains(eye)).toBe(true);
        await openNode(user, eye);
        expect(labelsAt(2)).toEqual(["Cataract, 1", "Glaucoma, 2"]);
    });

    test("the drugs without a subcategory are under «بدون تصنيف فرعي», last of their category @CAT-107", async () => {
        const {user} = await renderTree({drugs: [...eyeDrugs(), aDrug({name: "Loose", subCategory: null})]});
        await openNode(user, await findNodeRow("العيون", "ar", 4));
        expect(labelsAt(2)).toEqual(["المياه البيضاء، 1", "المياه الزرقاء، 2", "بدون تصنيف فرعي، 1"]);
        await openNode(user, nodeRow(ar.noSubCategory, "ar", 1));
        expect(await findDrugRow("Loose")).toHaveAttribute("aria-level", "3");
    });
});

describe("drug tree: the drug rows @area:catalog", () => {
    const tobradex = () => aDrug({
        name: "Tobradex",
        activeIngredients: "TOBRAMYCIN + DEXAMETHASONE",
        description: "Antibiotic + steroid",
        defaultDosing: {doseUnit: "drop", frequency: "daily", frequencyValue: 4},
    });
    const vigamox = () => aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML", activeIngredients: "MOXIFLOXACIN", description: "Antibiotic"});

    test("a row: the name, the ingredients, an own drug's dosing sentence, «خاص بالعيادة» / «مشترك», «مُضاف» when chosen; never the description @DRUG-059", async () => {
        const own = tobradex();
        await renderTree({drugs: [own, vigamox()], selectedIds: [own.id]});
        const ownRow = within(await findDrugRow("Tobradex"));
        expect(ownRow.getByText("Tobradex")).toBeInTheDocument();
        expect(ownRow.getByText("TOBRAMYCIN + DEXAMETHASONE")).toBeInTheDocument();
        expect(ownRow.getByText("نقطة واحدة 4 مرات يوميًا")).toBeInTheDocument();
        expect(ownRow.getByText(ar.own)).toBeInTheDocument();
        expect(ownRow.getByText(ar.added)).toBeInTheDocument();
        expect(ownRow.queryByText("Antibiotic + steroid")).not.toBeInTheDocument();

        const sharedRow = within(drugRow("VIGAMOX 0.5% EYE DROPS 5 ML"));
        expect(sharedRow.getByText("VIGAMOX 0.5% EYE DROPS 5 ML")).toBeInTheDocument();
        expect(sharedRow.getByText("MOXIFLOXACIN")).toBeInTheDocument();
        expect(sharedRow.getByText(ar.shared)).toBeInTheDocument();
        expect(sharedRow.queryByText(ar.added)).not.toBeInTheDocument();
        expect(sharedRow.queryByText("Antibiotic")).not.toBeInTheDocument();
        expect(sharedRow.queryByText(ar.own)).not.toBeInTheDocument();
    });

    test("in English: \"Clinic\", \"Shared\" and \"Added\" @DRUG-059", async () => {
        const own = tobradex();
        await renderTree({drugs: [own, vigamox()], selectedIds: [own.id], lang: "en"});
        expect(within(await findDrugRow("Tobradex")).getByText(en.own)).toBeInTheDocument();
        expect(within(drugRow("Tobradex")).getByText(en.added)).toBeInTheDocument();
        expect(within(drugRow("VIGAMOX 0.5% EYE DROPS 5 ML")).getByText(en.shared)).toBeInTheDocument();
    });

    test("the ingredients' full text in a tooltip on hover (desktop) @DRUG-059", async () => {
        await renderTree({drugs: [tobradex()]});
        const ingredients = within(await findDrugRow("Tobradex")).getByText("TOBRAMYCIN + DEXAMETHASONE");
        expect(await hoverTooltip(ingredients)).toBe("TOBRAMYCIN + DEXAMETHASONE");
        await leaveTooltip(ingredients);
    });

    test("a drug without ingredients shows no ingredients line, never \"null\" @DRUG-059", async () => {
        await renderTree({drugs: [aDrug({name: "Tears", activeIngredients: null}), aDrug({name: "Gel", activeIngredients: null})]});
        const row = await findDrugRow("Tears");
        expect(row).not.toHaveTextContent(/null|undefined/);
    });

    test("an own drug's default dosing sentence in its row; a shared drug's row has none (no «لا توجد جرعة محددة») @DRUG-105", async () => {
        const own = aDrug({name: "Tobradex", defaultDosing: {doseAmount: 2, doseUnit: "drop", frequency: "daily", frequencyValue: 3}});
        await renderTree({drugs: [own, aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML", activeIngredients: null})]});
        expect(within(await findDrugRow("Tobradex")).getByText("نقطتين 3 مرات يوميًا")).toBeInTheDocument();
        const shared = drugRow("VIGAMOX 0.5% EYE DROPS 5 ML");
        expect(within(shared).queryByText(ar.noDosing)).not.toBeInTheDocument();
        expect(shared).not.toHaveTextContent(/مرات|مرة|نقطة|نقطتين/);
    });

    test("a default dosing of only «اليمنى»: «في العين اليمنى» in the row, without the description @DRUG-103", async () => {
        await renderTree({drugs: [aDrug({name: "Tobradex", description: "Antibiotic + steroid", defaultDosing: {eye: "right"}})]});
        const row = within(await findDrugRow("Tobradex"));
        expect(row.getByText("في العين اليمنى")).toBeInTheDocument();
        expect(row.queryByText("Antibiotic + steroid")).not.toBeInTheDocument();
    });
});

describe("drug tree: the open / close chevrons @area:ux", () => {
    test("each node's chevron has the tooltip and accessible name «فتح «…»», then «إغلاق «…»» once open; not a Tab stop @UX-042", async () => {
        const {user} = await renderTree({drugs: eyeDrugs()});
        const eye = await findNodeRow("العيون");
        const chevron = within(eye).getByRole("button", {name: ar.open("العيون")});
        expect(chevron).toHaveAttribute("tabindex", "-1");
        expect(await hoverTooltip(chevron)).toBe(ar.open("العيون"));
        await leaveTooltip(chevron);

        await user.click(chevron);
        await waitFor(() => expect(eye).toHaveAttribute("aria-expanded", "true"));
        const closing = within(eye).getByRole("button", {name: ar.close("العيون")});
        expect(await hoverTooltip(closing)).toBe(ar.close("العيون"));
        await leaveTooltip(closing);

        const glaucoma = nodeRow("المياه الزرقاء");
        expect(within(glaucoma).getByRole("button", {name: ar.open("المياه الزرقاء")})).toBeInTheDocument();
    });

    test("in English: \"Open “Eye”\" and \"Close “Eye”\" @UX-042", async () => {
        const {user} = await renderTree({drugs: eyeDrugs(), lang: "en"});
        const eye = await findNodeRow("Eye", "en");
        const chevron = within(eye).getByRole("button", {name: en.open("Eye")});
        expect(await hoverTooltip(chevron)).toBe(en.open("Eye"));
        await leaveTooltip(chevron);
        await user.click(chevron);
        expect(await hoverTooltip(within(eye).getByRole("button", {name: en.close("Eye")}))).toBe(en.close("Eye"));
    });

    test("a closed node's chevron points the reading direction (← in Arabic, → in English); an open one points down @UX-042", async () => {
        const {user, unmount} = await renderTree({drugs: eyeDrugs()});
        const eye = await findNodeRow("العيون");
        expect(within(eye).getByTestId("ChevronLeftIcon")).toBeInTheDocument();
        await openNode(user, eye);
        expect(within(within(eye).getByRole("button", {name: ar.close("العيون")})).getByTestId("ExpandMoreIcon")).toBeInTheDocument();
        unmount();

        await renderTree({drugs: eyeDrugs(), lang: "en"});
        expect(within(within(await findNodeRow("Eye", "en")).getByRole("button", {name: en.open("Eye")})).getByTestId("ChevronRightIcon"))
            .toBeInTheDocument();
    });
});

describe("drug tree: counts and the total @area:i18n", () => {
    /** An answer with large counts: «العيون» 3,394 (1,469 + 1,925) and «أخرى» 20,023: 23,417 in all. */
    const bigTree = () => http.get(api("/drugs/tree"), () => HttpResponse.json({
        categories: [
            aTreeCategory({...EYE, subCategories: [
                aTreeSubCategory({...GLAUCOMA, count: 1469}),
                aTreeSubCategory({...CATARACT, count: 1925}),
            ]}),
            aTreeCategory({...OTHER, pinnedLast: true, subCategories: [aTreeSubCategory({...UNCLASSIFIED, pinnedLast: true, count: 20_023})]}),
        ],
    }));

    test("«النتائج: 23,417» and the node counts in Latin digits with a thousands separator, in Arabic @I18N-026 @DRUG-058", async () => {
        server.use(bigTree(), ...drugsHandlers([]));
        const {user} = await renderTree({ownHandlers: true});
        expect(await screen.findByText(ar.results("23,417"))).toBeInTheDocument();
        const eye = await findNodeRow("العيون", "ar", "3,394");
        expect(within(eye).getByText("3,394")).toBeInTheDocument();
        expect(nodeRow("أخرى", "ar", "20,023")).toBeInTheDocument();
        await openNode(user, eye);
        expect(labelsAt(2)).toEqual(["المياه البيضاء، 1,925", "المياه الزرقاء، 1,469"]);
        expect(within(nodeRow("المياه الزرقاء")).getByText("1,469")).toBeInTheDocument();
    });

    test("in English: \"Results: 23,417\", \"Eye, 3,394\", \"Other, 20,023\" @I18N-026 @DRUG-058", async () => {
        server.use(bigTree(), ...drugsHandlers([]));
        await renderTree({ownHandlers: true, lang: "en"});
        expect(await screen.findByText(en.results("23,417"))).toBeInTheDocument();
        expect(labelsAt(1)).toEqual(["Eye, 3,394", "Other, 20,023"]);
    });
});

describe("drug tree: the states instead of the tree @area:catalog", () => {
    test("a search with no match: «لا توجد أدوية مطابقة للبحث.» instead of the tree (no row, no total) @CAT-110", async () => {
        const {user} = await renderTree({drugs: eyeDrugs()});
        await findNodeRow("العيون");
        await searchTree(user, "zzqx");
        expect(await screen.findByText(ar.noResults)).toBeInTheDocument();
        await waitFor(() => expect(screen.queryAllByRole("treeitem")).toEqual([]));
        expect(screen.queryByText(/^النتائج:/)).not.toBeInTheDocument();
        expect(screen.queryByText(ar.noOwnDrugs)).not.toBeInTheDocument();
    });

    test("in English: \"No drugs match your search.\" @CAT-110", async () => {
        const {user} = await renderTree({drugs: eyeDrugs(), lang: "en"});
        await findNodeRow("Eye", "en");
        await searchTree(user, "zzqx", "en");
        expect(await screen.findByText(en.noResults)).toBeInTheDocument();
    });

    test("«أدوية العيادة» with no search and no own drug: «لا توجد أدوية خاصة بالعيادة بعد.», not the no-match message @CAT-111", async () => {
        const {user} = await renderTree({drugs: [aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"}), aSharedDrug({name: "ALEMOX 1 GM 12 F.C.TABS.", subCategory: CATARACT})]});
        await findNodeRow("العيون");
        await user.click(sourceButton(ar.sourceOwn));
        expect(await screen.findByText(ar.noOwnDrugs)).toBeInTheDocument();
        expect(screen.queryByText(ar.noResults)).not.toBeInTheDocument();
        expect(screen.queryAllByRole("treeitem")).toEqual([]);

        // With a search, the same empty answer is a no-match
        await searchTree(user, "vig");
        expect(await screen.findByText(ar.noResults)).toBeInTheDocument();
        expect(screen.queryByText(ar.noOwnDrugs)).not.toBeInTheDocument();
    });

    test("in English: \"This clinic has no drugs of its own yet.\" @CAT-111", async () => {
        const {user} = await renderTree({drugs: [aSharedDrug()], lang: "en"});
        await findDrugRow("VIGAMOX 0.5% EYE DROPS 5 ML");
        await user.click(sourceButton(en.sourceOwn, "en"));
        expect(await screen.findByText(en.noOwnDrugs)).toBeInTheDocument();
    });

    test("the tree request fails: «تعذّر تحميل البيانات.» + «إعادة المحاولة», which loads it @CAT-109", async () => {
        let failing!: ReturnType<typeof failRequests>;
        const {user} = await renderTree({drugs: eyeDrugs(), beforeRender: () => (failing = failRequests("/drugs/tree"))});
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(ar.loadFailed);
        expect(screen.queryAllByRole("treeitem")).toEqual([]);
        failing.stop();
        await user.click(screen.getByRole("button", {name: ar.retry}));
        expect(await findNodeRow("العيون", "ar", 3)).toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test("in English: \"Couldn't load data.\" and \"Retry\" @CAT-109", async () => {
        await renderTree({drugs: eyeDrugs(), lang: "en", beforeRender: () => failRequests("/drugs/tree")});
        expect(await screen.findByRole("alert")).toHaveTextContent(en.loadFailed);
        expect(screen.getByRole("button", {name: en.retry})).toBeInTheDocument();
    });

    test("a subcategory's page fails: the message and «إعادة المحاولة» inside that subcategory only; its retry loads it @CAT-109", async () => {
        let failing!: ReturnType<typeof failRequests>;
        const {user} = await renderTree({
            drugs: eyeDrugs(),
            beforeRender: () => (failing = failRequests("/drugs", p => p.get("subCategoryId") === String(GLAUCOMA.id))),
        });
        await openNode(user, await findNodeRow("العيون"));
        const glaucoma = await openNode(user, nodeRow("المياه الزرقاء"));
        const cataract = await openNode(user, nodeRow("المياه البيضاء"));

        expect(await within(childrenOf(glaucoma)).findByText(ar.loadFailed)).toBeInTheDocument();
        expect(await findDrugRow("Tiopex")).toBeInTheDocument();
        expect(within(childrenOf(cataract)).queryByText(ar.loadFailed)).not.toBeInTheDocument();
        expect(screen.getAllByText(ar.loadFailed)).toHaveLength(1);
        expect(screen.getAllByRole("button", {name: ar.retry})).toHaveLength(1);
        // The tree itself is still there
        expect(nodeRow("العيون")).toBeInTheDocument();

        failing.stop();
        await user.click(within(childrenOf(glaucoma)).getByRole("button", {name: ar.retry}));
        expect(await findDrugRow("Timolol")).toBeInTheDocument();
        expect(screen.queryByText(ar.loadFailed)).not.toBeInTheDocument();
    });
});

describe("drug tree: each name keeps its own direction @area:i18n", () => {
    // Both drugs in «العيون › المياه الزرقاء», the one subcategory: it opens by itself (D7)
    test("in Arabic (protocol editor and prescription), «1 2 3 (ONE TWO THREE) 20 F.C.TABS.» and an Arabic name are each isolated with their own direction in their tree row @CAT-233",
        async () => {
            await renderTree({drugs: [aSharedDrug({name: DIGITS_FIRST_NAME}), aDrug({name: ARABIC_DRUG_NAME})]});
            expectOwnDirection(await findDrugRow(DIGITS_FIRST_NAME), DIGITS_FIRST_NAME);
            expectOwnDirection(await findDrugRow(ARABIC_DRUG_NAME), ARABIC_DRUG_NAME);
        });

    test("in Arabic, Latin and Arabic active ingredients are each isolated with their own direction in their tree row @CAT-262",
        async () => {
            const latin = "TIMOLOL MALEATE 0.5% (AS BASE).";
            const arabic = "كلوريد الصوديوم 0.9٪.";
            await renderTree({drugs: [aDrug({name: "Timolol", activeIngredients: latin}), aDrug({name: "Saline", activeIngredients: arabic})]});
            expectOwnDirection(await findDrugRow("Timolol"), latin);
            expectOwnDirection(await findDrugRow("Saline"), arabic);
        });
});

describe("drug tree: the search's placeholder @area:catalog", () => {
    test("the tree's search (protocol editor, prescription) says what it matches: «ابحث بالاسم أو المادة الفعالة أو التصنيف…» / \"Search by name, active ingredient or category…\" @CAT-235",
        async () => {
            const {unmount} = await renderTree({drugs: eyeDrugs()});
            expect(treeSearch()).toHaveAttribute("placeholder", "ابحث بالاسم أو المادة الفعالة أو التصنيف…");
            unmount();
            await renderTree({drugs: eyeDrugs(), lang: "en"});
            expect(treeSearch("en")).toHaveAttribute("placeholder", "Search by name, active ingredient or category…");
        });
});
