import {describe, expect, test} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {useNavigate} from "react-router-dom";
import type {Drug, SaveDrug} from "../types.ts";
import {
    aDrug,
    api,
    aSharedDrug,
    choose,
    drugCategoriesHandler,
    drugsHandlers,
    drugTreeHandler,
    fillIn,
    manyDrugs,
    recordRequests,
    renderWithProviders,
    server,
} from "../../../test";
import {pickCategory} from "../../../test/pages/drugDialog.ts";
import {
    ACNE,
    categoryFilter,
    DRY_EYE,
    PAGE_CATEGORIES,
    pressedSource,
    pressedView,
    renderDrugsPage,
    rowOf,
    SKIN,
    sourceButton,
    subCategoryFilter,
    subtitle,
    viewButton,
    viewToggle,
} from "../../../test/pages/drugsPage.tsx";
import {drugNamesUnder, findDrugRow, findNodeRow, labelsAt, nodeRow, paramsOf, rowsAt, theTree} from "../../../test/pages/drugTree.tsx";
import {installIntersectionObserver} from "../../../test/intersection.ts";
import {DrugsPage} from "./DrugsPage.tsx";

// The drugs page's two views (docs/design/m1.7-review-contract.md R1, R2, R3; docs/features/drugs/business.md
// «طريقة العرض: شجرة أو قائمة», tech.md "Tree view"): the tree by default, `view=list` for the table, one filter bar
// for both, the tree's rows opening like the list's, no «مشترك» chip. Texts from the locale files as the contract
// quotes them.

const TREE = "كتالوج الأدوية";
const OWN_CHIP = "خاص بالعيادة";

/** Waits for the tree view's tree. */
const findTree = () => screen.findByRole("tree", {name: TREE});

/** A «رجوع» button beside the page (the browser's Back in a MemoryRouter). */
const Back = () => {
    const navigate = useNavigate();
    return <button onClick={() => navigate(-1)}>back</button>;
};

/** The page at `route` as is (no `view` added) with a Back button, over `drugs` and `PAGE_CATEGORIES`. */
const renderWithBack = async (drugs: Drug[], route = "/drugs") => {
    server.use(drugTreeHandler(drugs), ...drugsHandlers(drugs), drugCategoriesHandler(PAGE_CATEGORIES));
    installIntersectionObserver();
    return renderWithProviders(<><Back/><DrugsPage/></>, {lang: "ar", route, path: "/drugs"});
};

/** A row's MUI ⊕ icon (the pickers' add affordance). */
const addIconsIn = (row: HTMLElement) => row.querySelectorAll('[data-testid="AddIcon"]');

const SKIN_DRUG = () => aDrug({name: "Acnelyse", category: SKIN, subCategory: ACNE});

describe("drugs page: the tree is the default view @area:catalog", () => {
    test("opened without `view`: the tree (categories, no table), «شجرة» pressed, no `view` in the URL @CAT-270 @smoke", async () => {
        installIntersectionObserver();
        const {location} = await renderDrugsPage([aDrug({name: "Timolol"}), SKIN_DRUG()], {view: "tree"});
        expect(await findTree()).toBeInTheDocument();
        expect(await findNodeRow("العيون", "ar", 1)).toBeInTheDocument();
        expect(nodeRow("الجلدية", "ar", 1)).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(pressedView()).toBe("tree");
        expect(viewButton("list")).toHaveAttribute("aria-pressed", "false");
        // «إجمالي الأدوية: N» stays in the tree view
        expect(await screen.findByText(subtitle("2"))).toBeInTheDocument();
        await waitFor(() => expect(location().search).toBe(""));
    });

    test("in English: the toggle \"View\" with \"Tree\" (pressed) and \"List\" @CAT-270", async () => {
        installIntersectionObserver();
        await renderDrugsPage([aDrug({name: "Timolol"})], {view: "tree", lang: "en"});
        expect(await screen.findByRole("tree", {name: "Drug catalog"})).toBeInTheDocument();
        expect(within(viewToggle("en")).getAllByRole("button").map(b => b.textContent)).toEqual(["Tree", "List"]);
        expect(pressedView("en")).toBe("tree");
    });
});

describe("drugs page: switching the view @area:catalog", () => {
    test("«قائمة»: the table and `view=list`; «شجرة»: the tree and no `view`; Back returns to the list @CAT-271", async () => {
        const {user, location} = await renderWithBack([aDrug({name: "Timolol"}), SKIN_DRUG()]);
        await findTree();

        await user.click(viewButton("list"));
        expect(await rowOf("Timolol")).toBeInTheDocument();
        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.queryByRole("tree")).not.toBeInTheDocument();
        expect(location().search).toBe("?view=list");
        expect(pressedView()).toBe("list");

        await user.click(viewButton("tree"));
        expect(await findTree()).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(location().search).toBe("");
        expect(pressedView()).toBe("tree");

        // The view change was a new history entry: Back shows the list again
        await user.click(screen.getByRole("button", {name: "back"}));
        await waitFor(() => expect(location().search).toBe("?view=list"));
        expect(await rowOf("Timolol")).toBeInTheDocument();
        expect(pressedView()).toBe("list");
    });

    test("clicking the pressed button keeps it: the view, the URL and the history unchanged @CAT-271", async () => {
        const {user, location} = await renderWithBack([aDrug({name: "Timolol"})], "/drugs?view=list");
        await rowOf("Timolol");
        await user.click(viewButton("list"));
        expect(pressedView()).toBe("list");
        expect(location().search).toBe("?view=list");
        expect(screen.getByRole("table")).toBeInTheDocument();

        await user.click(viewButton("tree"));
        await findTree();
        await user.click(viewButton("tree"));
        expect(pressedView()).toBe("tree");
        expect(location().search).toBe("");
        expect(screen.getByRole("tree", {name: TREE})).toBeInTheDocument();
        // One entry for the one real change: Back is the list
        await user.click(screen.getByRole("button", {name: "back"}));
        await waitFor(() => expect(location().search).toBe("?view=list"));
    });

    test("a search, «أدوية العيادة» and «العيون» on the list's page 2 are kept in the tree (only matching drugs) and back; the list's page is 1 @CAT-272",
        async () => {
            const drugs = [...manyDrugs(25, {}, "Tob"), aSharedDrug({name: "TOBSHARED"}), aDrug({name: "Tobacne", category: SKIN, subCategory: ACNE}),
                aDrug({name: "Xalatan"})];
            const {user, location} = await renderWithBack(drugs, "/drugs?view=list&search=Tob&source=own&categoryId=17&page=2");
            expect(await screen.findByText("21–25 من 25")).toBeInTheDocument();

            await user.click(viewButton("tree"));
            await findTree();
            await waitFor(() => {
                const query = new URLSearchParams(location().search);
                expect([query.get("search"), query.get("source"), query.get("categoryId"), query.get("page"), query.get("view")])
                    .toEqual(["Tob", "own", "17", null, null]);
            });
            expect(screen.getByRole("searchbox")).toHaveValue("Tob");
            expect(pressedSource()).toBe("own");
            expect(categoryFilter()).toHaveTextContent("العيون");
            expect(await screen.findByText(subtitle("25"))).toBeInTheDocument();
            // Only «العيون» (25 own «Tob…» drugs), opened down to its lone subcategory: no «الجلدية», no shared or «Xalatan»
            expect(labelsAt(1)).toEqual(["العيون، 25"]);
            const glaucoma = await findNodeRow("المياه الزرقاء", "ar", 25);
            await waitFor(() => expect(drugNamesUnder(glaucoma)).toHaveLength(25));
            expect(drugNamesUnder(glaucoma).every(name => name!.startsWith("Tob "))).toBe(true);
            expect(screen.queryByRole("treeitem", {name: "TOBSHARED"})).not.toBeInTheDocument();
            expect(screen.queryByRole("treeitem", {name: "Xalatan"})).not.toBeInTheDocument();

            await user.click(viewButton("list"));
            expect(await screen.findByText("1–20 من 25")).toBeInTheDocument();
            const query = new URLSearchParams(location().search);
            expect([query.get("search"), query.get("source"), query.get("categoryId"), query.get("page"), query.get("view")])
                .toEqual(["Tob", "own", "17", null, "list"]);
            expect(screen.getByRole("searchbox")).toHaveValue("Tob");
            expect(pressedSource()).toBe("own");
        });

    test.each(["bogus", "TREE"])("`view=%s` in the URL: the tree, the value dropped from the URL @CAT-273", async (value) => {
        installIntersectionObserver();
        const {location} = await renderDrugsPage([aDrug({name: "Timolol"})], {route: `/drugs?view=${value}`});
        expect(await findTree()).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(pressedView()).toBe("tree");
        await waitFor(() => expect(location().search).toBe(""));
    });
});

describe("drugs page: the category filters in the tree view @area:catalog", () => {
    const drugs = () => [aDrug({name: "Timolol"}), aDrug({name: "Tiopex", subCategory: DRY_EYE}), aDrug({name: "Lid wipes", subCategory: null}),
        SKIN_DRUG()];

    test("a category chosen: only its node, opened (its subcategories shown) @CAT-274", async () => {
        installIntersectionObserver();
        await renderDrugsPage(drugs(), {view: "tree", route: "/drugs?categoryId=17"});
        const eye = await findNodeRow("العيون", "ar", 3);
        await waitFor(() => expect(eye).toHaveAttribute("aria-expanded", "true"));
        expect(labelsAt(1)).toEqual(["العيون، 3"]);
        // By name, the bucket last (CAT-096)
        expect(labelsAt(2)).toEqual(["المياه الزرقاء، 1", "جفاف العين، 1", "بدون تصنيف فرعي، 1"]);
        expect(screen.queryByRole("treeitem", {name: /^الجلدية، /})).not.toBeInTheDocument();
        expect(screen.getByText(subtitle("3"))).toBeInTheDocument();
    });

    test("a subcategory chosen: only it under its category, opened with its drugs; «بدون تصنيف فرعي» the same @CAT-274", async () => {
        installIntersectionObserver();
        const {unmount} = await renderDrugsPage(drugs(), {view: "tree", route: `/drugs?categoryId=17&subCategoryId=${DRY_EYE.id}`});
        const dryEye = await findNodeRow("جفاف العين", "ar", 1);
        await waitFor(() => expect(dryEye).toHaveAttribute("aria-expanded", "true"));
        expect(labelsAt(1)).toEqual(["العيون، 1"]);
        expect(labelsAt(2)).toEqual(["جفاف العين، 1"]);
        await waitFor(() => expect(drugNamesUnder(dryEye)).toEqual(["Tiopex"]));
        expect(screen.getByText(subtitle("1"))).toBeInTheDocument();
        unmount();

        await renderDrugsPage(drugs(), {view: "tree", route: "/drugs?categoryId=17&subCategoryId=none"});
        const bucket = await findNodeRow("بدون تصنيف فرعي", "ar", 1);
        await waitFor(() => expect(drugNamesUnder(bucket)).toEqual(["Lid wipes"]));
        expect(labelsAt(2)).toEqual(["بدون تصنيف فرعي، 1"]);
    });

    test("chosen in the selects, then cleared: one node, then the whole tree again @CAT-274", async () => {
        installIntersectionObserver();
        const {user} = await renderDrugsPage(drugs(), {view: "tree"});
        await findNodeRow("الجلدية", "ar", 1);
        await choose(user, categoryFilter(), "العيون");
        await waitFor(() => expect(labelsAt(1)).toEqual(["العيون، 3"]));
        await choose(user, subCategoryFilter(), "المياه الزرقاء");
        await waitFor(() => expect(labelsAt(2)).toEqual(["المياه الزرقاء، 1"]));
        expect(await findDrugRow("Timolol")).toBeInTheDocument();

        await choose(user, categoryFilter(), "كل التصنيفات");
        await waitFor(() => expect(labelsAt(1)).toHaveLength(2));
        expect(nodeRow("الجلدية", "ar", 1)).toBeInTheDocument();
        expect(nodeRow("العيون", "ar", 3)).toBeInTheDocument();
    });
});

describe("drugs page: one filter bar for both views @area:catalog", () => {
    test("the tree view has no search box, source toggle or «النتائج: N» of its own: one of each on the page @CAT-275", async () => {
        installIntersectionObserver();
        await renderDrugsPage([aDrug({name: "Timolol"}), aSharedDrug()], {view: "tree"});
        await findNodeRow("العيون", "ar", 2);
        expect(screen.getAllByRole("searchbox")).toHaveLength(1);
        expect(screen.getAllByRole("group", {name: "الأدوية المعروضة"})).toHaveLength(1);
        expect(screen.queryByText(/^النتائج:/)).not.toBeInTheDocument();
        expect(within(theTree()).queryByRole("searchbox")).not.toBeInTheDocument();
    });

    test("the page's search and source drive the tree @CAT-275", async () => {
        installIntersectionObserver();
        const recorded = recordRequests();
        const {user} = await renderDrugsPage([aDrug({name: "Timolol"}), aSharedDrug(), SKIN_DRUG()], {view: "tree"});
        await findNodeRow("العيون", "ar", 2);
        await user.click(sourceButton("shared"));
        await waitFor(() => expect(labelsAt(1)).toEqual(["العيون، 1"]));
        await user.click(sourceButton("all"));
        await user.type(screen.getByRole("searchbox"), "acne");
        await waitFor(() => expect(labelsAt(1)).toEqual(["الجلدية، 1"]));
        const sent = paramsOf(recorded.requests, "/drugs/tree").map(p => [p.get("search") ?? "", p.get("source") ?? "all"].join("|"));
        expect(sent).toContain("|shared");
        expect(sent).toContain("acne|all");
    });
});

describe("drugs page: the tree view's rows @area:catalog", () => {
    const own = () => aDrug({name: "Tobradex"});
    const shared = () => aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"});

    test("a click on an own drug opens its edit dialog, on a shared drug the read-only details; Enter too @CAT-276", async () => {
        installIntersectionObserver();
        const {user} = await renderDrugsPage([own(), shared()], {view: "tree"});
        await user.click(await findDrugRow("Tobradex"));
        const edit = await screen.findByRole("dialog");
        expect(within(edit).getByRole("heading", {name: "تعديل الدواء"})).toBeInTheDocument();
        expect(within(edit).getByRole("textbox", {name: "الاسم"})).toHaveValue("Tobradex");
        await user.click(within(edit).getByRole("button", {name: "إلغاء"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        await user.click(await findDrugRow("VIGAMOX 0.5% EYE DROPS 5 ML"));
        const details = await screen.findByRole("dialog", {name: "تفاصيل الدواء"});
        expect(within(details).queryByRole("textbox")).not.toBeInTheDocument();
        await user.click(within(details).getByRole("button", {name: "إغلاق"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        act(() => screen.getByRole("treeitem", {name: "VIGAMOX 0.5% EYE DROPS 5 ML"}).focus());
        await user.keyboard("{Enter}");
        expect(await screen.findByRole("dialog", {name: "تفاصيل الدواء"})).toBeInTheDocument();
    });

    test("own rows show ✎ and 🗑, shared rows neither; no «مُضاف», no ⊕ @CAT-276", async () => {
        installIntersectionObserver();
        await renderDrugsPage([own(), shared()], {view: "tree"});
        const ownRow = await findDrugRow("Tobradex");
        const sharedRow = await findDrugRow("VIGAMOX 0.5% EYE DROPS 5 ML");
        expect(within(ownRow).getByRole("button", {name: "تعديل"})).toBeInTheDocument();
        expect(within(ownRow).getByRole("button", {name: "حذف"})).toBeInTheDocument();
        expect(within(sharedRow).queryByRole("button")).not.toBeInTheDocument();
        for (const row of [ownRow, sharedRow]) {
            expect(within(row).queryByText("مُضاف")).not.toBeInTheDocument();
            expect(addIconsIn(row)).toHaveLength(0);
        }
    });

    test("✎ opens the edit dialog; 🗑 confirms, deletes and the tree drops the drug @CAT-276", async () => {
        installIntersectionObserver();
        const drugs = [own(), aDrug({name: "Timolol"}), shared()];
        server.use(
            http.get(api("/drugs/:id/protocols"), () => HttpResponse.json([])),
            http.delete(api("/drugs/:id"), ({params}) => {
                drugs.splice(drugs.findIndex(d => d.id === Number(params.id)), 1);
                return new HttpResponse(null, {status: 204});
            }),
        );
        const {user} = await renderDrugsPage(drugs, {view: "tree"});
        await user.click(within(await findDrugRow("Tobradex")).getByRole("button", {name: "تعديل"}));
        expect(await screen.findByRole("heading", {name: "تعديل الدواء"})).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "إلغاء"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        await user.click(within(screen.getByRole("treeitem", {name: "Tobradex"})).getByRole("button", {name: "حذف"}));
        const confirm = await screen.findByRole("dialog", {name: "حذف الدواء؟"});
        await user.click(within(confirm).getByRole("button", {name: "حذف"}));
        await waitFor(() => expect(screen.queryByRole("treeitem", {name: "Tobradex"})).not.toBeInTheDocument());
        expect(await findDrugRow("Timolol")).toBeInTheDocument();
        expect(await screen.findByText(subtitle("2"))).toBeInTheDocument();
    });

    test("the list's permissions: drugs.list only → no ✎/🗑 and no dialog; drugs.details → the own drug's read-only details; drugs.delete → 🗑 without ✎ @CAT-276",
        async () => {
            installIntersectionObserver();
            const first = await renderDrugsPage([own(), shared()], {view: "tree", permissions: ["drugs.list"]});
            await first.user.click(await findDrugRow("Tobradex"));
            await first.user.click(screen.getByRole("treeitem", {name: "VIGAMOX 0.5% EYE DROPS 5 ML"}));
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
            for (const name of ["Tobradex", "VIGAMOX 0.5% EYE DROPS 5 ML"])
                expect(within(screen.getByRole("treeitem", {name})).queryAllByRole("button"), name).toEqual([]);
            first.unmount();

            const second = await renderDrugsPage([own(), shared()], {view: "tree", permissions: ["drugs.list", "drugs.details"]});
            expect(within(await findDrugRow("Tobradex")).queryAllByRole("button")).toEqual([]);
            await second.user.click(screen.getByRole("treeitem", {name: "Tobradex"}));
            expect(await screen.findByRole("dialog", {name: "تفاصيل الدواء"})).toBeInTheDocument();
            second.unmount();

            await renderDrugsPage([own(), shared()], {view: "tree", permissions: ["drugs.list", "drugs.delete"]});
            const ownRow = await findDrugRow("Tobradex");
            expect(within(ownRow).getByRole("button", {name: "حذف"})).toBeInTheDocument();
            expect(within(ownRow).queryByRole("button", {name: "تعديل"})).not.toBeInTheDocument();
            expect(within(screen.getByRole("treeitem", {name: "VIGAMOX 0.5% EYE DROPS 5 ML"})).queryAllByRole("button")).toEqual([]);
        });
});

describe("drugs page: an own drug saved from the tree view @area:catalog", () => {
    test("saved while «المشتركة» is chosen: «أدوية العيادة», the search cleared, still the tree, the new drug in it @CAT-277", async () => {
        installIntersectionObserver();
        const drugs = [aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"}), aDrug({name: "Tobradex"})];
        server.use(http.post(api("/drugs"), async ({request}) => {
            const body = await request.json() as SaveDrug;
            const created = aDrug({name: body.name});
            drugs.push(created);
            return HttpResponse.json(created, {status: 201});
        }));
        const {user, location} = await renderDrugsPage(drugs, {view: "tree", route: "/drugs?source=shared&search=vig"});
        expect(await findDrugRow("VIGAMOX 0.5% EYE DROPS 5 ML")).toBeInTheDocument();

        await user.click(screen.getAllByRole("button", {name: "إضافة دواء"})[0]);
        const form = await screen.findByRole("dialog");
        await fillIn(user, within(form).getByRole("textbox", {name: "الاسم"}), "Tears New");
        await pickCategory(user, {scope: form});
        await user.click(within(form).getByRole("button", {name: "حفظ"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        await waitFor(() => expect(pressedSource()).toBe("own"));
        expect(screen.getByRole("searchbox")).toHaveValue("");
        expect(pressedView()).toBe("tree");
        expect(await findDrugRow("Tears New")).toBeInTheDocument();
        expect(screen.getByRole("tree", {name: TREE})).toBeInTheDocument();
        expect(screen.queryByRole("treeitem", {name: "VIGAMOX 0.5% EYE DROPS 5 ML"})).not.toBeInTheDocument();
        const query = new URLSearchParams(location().search);
        expect([query.get("source"), query.get("search"), query.get("view")]).toEqual(["own", null, null]);
    });

    test("«مسح الفلاتر» in the tree view keeps the tree @CAT-134 @CAT-142", async () => {
        installIntersectionObserver();
        const {user, location} = await renderDrugsPage([aSharedDrug(), SKIN_DRUG()], {view: "tree", route: "/drugs?source=shared&categoryId=5"});
        await user.click(await screen.findByRole("button", {name: "مسح الفلاتر"}));
        expect(await findNodeRow("الجلدية", "ar", 1)).toBeInTheDocument();
        expect(pressedView()).toBe("tree");
        await waitFor(() => expect(location().search).toBe(""));
    });
});

describe("drugs page: the tree view's empty states @area:catalog", () => {
    test.each([
        ["/drugs?search=zzz", "لا توجد أدوية مطابقة للبحث.", () => [aSharedDrug(), SKIN_DRUG()]],
        ["/drugs?source=own", "لا توجد أدوية خاصة بالعيادة بعد.", () => [aSharedDrug()]],
        ["/drugs?source=own&categoryId=17", "لا توجد أدوية مطابقة للفلاتر.", () => [aSharedDrug(), SKIN_DRUG()]],
    ])("%s: «%s», no tree @CAT-136 @CAT-142", async (route, message, drugs) => {
        installIntersectionObserver();
        await renderDrugsPage(drugs(), {view: "tree", route});
        expect(await screen.findByText(message)).toBeInTheDocument();
        expect(screen.queryByRole("tree")).not.toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
});

describe("drugs page: no «مشترك» chip @area:catalog", () => {
    test("in both views a shared drug has no «مشترك» chip; an own drug shows «خاص بالعيادة» @CAT-278", async () => {
        installIntersectionObserver();
        const {user} = await renderDrugsPage([aDrug({name: "Tobradex"}), aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"})], {view: "tree"});
        const sharedRow = await findDrugRow("VIGAMOX 0.5% EYE DROPS 5 ML");
        expect(within(sharedRow).queryByText("مشترك")).not.toBeInTheDocument();
        expect(within(sharedRow).queryByText(OWN_CHIP)).not.toBeInTheDocument();
        expect(within(screen.getByRole("treeitem", {name: "Tobradex"})).getByText(OWN_CHIP)).toBeInTheDocument();
        expect(screen.queryByText("مشترك")).not.toBeInTheDocument();

        await user.click(viewButton("list"));
        const listRow = await rowOf("VIGAMOX 0.5% EYE DROPS 5 ML");
        expect(within(listRow).queryByText("مشترك")).not.toBeInTheDocument();
        expect(within(listRow).queryByText(OWN_CHIP)).not.toBeInTheDocument();
        expect(within(await rowOf("Tobradex")).getByText(OWN_CHIP)).toBeInTheDocument();
        expect(screen.queryByText("مشترك")).not.toBeInTheDocument();
    });

    test("in English: no \"Shared\" chip on a shared row (the «المشتركة» toggle button stays), \"Clinic\" on an own row @CAT-278", async () => {
        installIntersectionObserver();
        await renderDrugsPage([aDrug({name: "Tobradex"}), aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"})], {lang: "en", view: "tree"});
        const sharedRow = await findDrugRow("VIGAMOX 0.5% EYE DROPS 5 ML");
        expect(within(sharedRow).queryByText("Shared")).not.toBeInTheDocument();
        expect(within(screen.getByRole("treeitem", {name: "Tobradex"})).getByText("Clinic")).toBeInTheDocument();
        expect(sourceButton("shared", "en")).toBeInTheDocument();
        // The only "Shared" on the page is the toggle's button
        expect(screen.getAllByText("Shared")).toHaveLength(1);
    });
});

describe("drugs page: a search opens single-drug branches in the tree view @area:catalog", () => {
    test("each category whose only subcategory holds one drug opens with it; one with 2 subcategories stays closed @CAT-279", async () => {
        installIntersectionObserver();
        const drugs = [aDrug({name: "Timolol"}), aDrug({name: "Tiopex", subCategory: DRY_EYE}), aDrug({name: "Xalatan"}),
            aDrug({name: "Tretinoin", category: SKIN, subCategory: ACNE})];
        await renderDrugsPage(drugs, {view: "tree", route: "/drugs?search=ti"});
        // «الجلدية» has one subcategory with one «ti» drug: open; «العيون» has two subcategories: closed
        expect(await findDrugRow("Tretinoin")).toBeInTheDocument();
        expect(nodeRow("الجلدية", "ar", 1)).toHaveAttribute("aria-expanded", "true");
        expect(nodeRow("حب الشباب", "ar", 1)).toHaveAttribute("aria-expanded", "true");
        expect(nodeRow("العيون", "ar", 2)).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("treeitem", {name: "Timolol"})).not.toBeInTheDocument();
    });

    test("no search: nothing opens by itself, even categories of one drug @CAT-280", async () => {
        installIntersectionObserver();
        const recorded = recordRequests();
        await renderDrugsPage([aDrug({name: "Timolol"}), aDrug({name: "Tretinoin", category: SKIN, subCategory: ACNE})], {view: "tree"});
        await findNodeRow("الجلدية", "ar", 1);
        expect(rowsAt(1).map(row => row.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
        expect(rowsAt(2)).toEqual([]);
        expect(paramsOf(recorded.requests, "/drugs")).toEqual([]);
    });
});
