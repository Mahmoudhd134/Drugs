import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http} from "msw";
import {
    aDrug,
    api,
    aSharedDrug,
    EYE,
    manyDrugs,
    optionsOf,
    pastExitTransition,
    recordRequests,
    server,
    toastTexts,
    choose,
} from "../../../test";
import {
    ACNE,
    categoryFilter,
    LONG_CATEGORY_NAME,
    ORDER_CATEGORIES,
    sortedNames,
    lastListQuery,
    listQueries,
    pressedSource,
    renderDrugsPage,
    rowOf,
    SKIN,
    sourceButton,
    subCategoryFilter,
    subtitle,
    watchTexts,
} from "../../../test/pages/drugsPage.tsx";

// The drugs page's filters and their URL (M1.7c contract § 3.4, decision C2; design M1.7 D9; business «صفحة الأدوية»):
// invalid URL values dropped silently (CAT-135), the empty states (CAT-136, CAT-142), a page past the end (CAT-143),
// the last choice wins (CAT-144), the selects' order (CAT-145). Texts from the locale files as the contract quotes them.

const OWN_EYE = () => aDrug({name: "Tobradex"});
const SHARED_EYE = () => aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML"});

/** Waits until the list shows its subtitle «إجمالي الأدوية: N». */
const loaded = (count: number | string, lang: "ar" | "en" = "ar") => screen.findByText(subtitle(String(count), lang));

/** A gate: `wait` resolves once `open()` is called. */
const gate = () => {
    let open = () => {};
    const wait = new Promise<void>(resolve => (open = resolve));
    return {wait, open};
};

/** The mocked answers sent so far, by their request's query (to know when a held, older answer has arrived). */
const answeredQueries = () => {
    const answered: URLSearchParams[] = [];
    const listener = ({request}: { request: Request }) => {
        const url = new URL(request.url);
        if (url.pathname === "/api/v1/drugs") answered.push(url.searchParams);
    };
    server.events.on("response:mocked", listener);
    return {answered, stop: () => server.events.removeListener("response:mocked", listener)};
};

describe("drugs page URL: invalid values are dropped silently @area:catalog", () => {
    test.each([
        ["source=bogus", "an unknown source"],
        ["source=Shared", "a source in another case"],
        ["categoryId=99&subCategoryId=138", "a deleted category (and its subcategory)"],
        ["categoryId=abc", "a category id that is not a number"],
        ["subCategoryId=138", "a subcategory without a category"],
        ["subCategoryId=none", "«بدون تصنيف فرعي» alone"],
        ["page=0", "page 0"],
        ["page=abc", "a page that is not a number"],
    ])("?%s (%s): the list loads on «الكل» with no category, the URL is rewritten without it, no error @CAT-135", async (query) => {
        const recorded = recordRequests();
        const {location} = await renderDrugsPage([OWN_EYE(), SHARED_EYE()], {route: `/drugs?${query}`});
        expect(await loaded(2)).toBeInTheDocument();
        expect(screen.getByText("Tobradex")).toBeInTheDocument();
        expect(screen.getByText("VIGAMOX 0.5% EYE DROPS 5 ML")).toBeInTheDocument();
        expect(pressedSource()).toBe("all");
        expect(categoryFilter()).toHaveTextContent("كل التصنيفات");
        expect(subCategoryFilter()).toHaveAttribute("aria-disabled", "true");

        // No request ever carried the invalid value (no 400 for the user to see)
        for (const sent of listQueries(recorded)) {
            expect(sent.get("source"), "source").toBeNull();
            expect(sent.get("categoryId"), "categoryId").toBeNull();
            expect(sent.get("subCategoryId"), "subCategoryId").toBeNull();
            expect(sent.get("page"), "page").toBe("1");
        }
        await waitFor(() => expect(location().search).toBe(""));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(toastTexts()).toEqual([]);
    });

    test("a subcategory of another category: the subcategory is dropped, its category kept @CAT-135", async () => {
        const recorded = recordRequests();
        const {location} = await renderDrugsPage([OWN_EYE(), SHARED_EYE()], {route: `/drugs?categoryId=17&subCategoryId=${ACNE.id}`});
        expect(await loaded(2)).toBeInTheDocument();
        expect(categoryFilter()).toHaveTextContent("العيون");
        expect(subCategoryFilter()).toHaveTextContent("كل التصنيفات الفرعية");
        for (const sent of listQueries(recorded)) expect(sent.get("subCategoryId")).toBeNull();
        expect(lastListQuery(recorded).get("categoryId")).toBe("17");
        await waitFor(() => expect(location().search).toBe("?categoryId=17"));
        expect(toastTexts()).toEqual([]);
    });

    test("valid values are kept: the search, «أدوية العيادة», the category and the subcategory are read from the URL and sent @CAT-135",
        async () => {
            const recorded = recordRequests();
            const {location} = await renderDrugsPage([OWN_EYE(), SHARED_EYE()],
                {route: "/drugs?search=Tob&source=own&categoryId=17&subCategoryId=138"});
            expect(await loaded(1)).toBeInTheDocument();
            expect(screen.getByRole("searchbox")).toHaveValue("Tob");
            expect(pressedSource()).toBe("own");
            expect(categoryFilter()).toHaveTextContent("العيون");
            expect(subCategoryFilter()).toHaveTextContent("المياه الزرقاء");
            const sent = lastListQuery(recorded);
            expect([sent.get("search"), sent.get("source"), sent.get("categoryId"), sent.get("subCategoryId"), sent.get("page")])
                .toEqual(["Tob", "own", "17", "138", "1"]);
            expect(new URLSearchParams(location().search).get("categoryId")).toBe("17");
        });

    test("subCategoryId=none with its category: «بدون تصنيف فرعي» is chosen and sent @CAT-135", async () => {
        const recorded = recordRequests();
        await renderDrugsPage([aDrug({name: "Eyelid wipes", subCategory: null}), OWN_EYE()], {route: "/drugs?categoryId=17&subCategoryId=none"});
        expect(await loaded(1)).toBeInTheDocument();
        expect(screen.getByText("Eyelid wipes")).toBeInTheDocument();
        expect(subCategoryFilter()).toHaveTextContent("بدون تصنيف فرعي");
        expect(lastListQuery(recorded).get("subCategoryId")).toBe("none");
    });

    test("while the categories load, a URL category is not sent unchecked: the list waits, then loads without the deleted id @CAT-135",
        async () => {
            const categories = gate();
            const recorded = recordRequests();
            const {location} = await renderDrugsPage([OWN_EYE()], {route: "/drugs?categoryId=99", categoriesHeld: categories.wait});
            await waitFor(() => expect(recorded.requests.some(r => r.path === "/drug-categories")).toBe(true));
            expect(listQueries(recorded).filter(q => q.get("categoryId") === "99")).toEqual([]);
            categories.open();
            expect(await loaded(1)).toBeInTheDocument();
            expect(listQueries(recorded).filter(q => q.get("categoryId") !== null)).toEqual([]);
            await waitFor(() => expect(location().search).toBe(""));
        });
});

describe("drugs page: the empty states @area:catalog", () => {
    test("«أدوية العيادة» in a clinic with no own drug: «لا توجد أدوية خاصة بالعيادة بعد.» with «إضافة دواء», not «لا توجد أدوية بعد» @CAT-136",
        async () => {
            await renderDrugsPage([SHARED_EYE()], {route: "/drugs?source=own"});
            expect(await screen.findByText("لا توجد أدوية خاصة بالعيادة بعد.")).toBeInTheDocument();
            expect(screen.queryByText("لا توجد أدوية بعد")).not.toBeInTheDocument();
            expect(screen.queryByText("لا توجد أدوية مطابقة للفلاتر.")).not.toBeInTheDocument();
            expect(screen.queryByText("VIGAMOX 0.5% EYE DROPS 5 ML")).not.toBeInTheDocument();
            // The header's «إضافة دواء» and the empty state's own
            expect(screen.getAllByRole("button", {name: "إضافة دواء"})).toHaveLength(2);
        });

    test("the same reached with the toggle, in English: \"This clinic has no drugs of its own yet.\" @CAT-136", async () => {
        const {user} = await renderDrugsPage([SHARED_EYE()], {lang: "en"});
        expect(await loaded(1, "en")).toBeInTheDocument();
        await user.click(sourceButton("own", "en"));
        expect(await screen.findByText("This clinic has no drugs of its own yet.")).toBeInTheDocument();
        expect(screen.queryByText("No drugs yet")).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", {name: "Add drug"})).toHaveLength(2);
    });

    test("without drugs.create: the message without any «إضافة دواء» @CAT-136", async () => {
        await renderDrugsPage([SHARED_EYE()], {route: "/drugs?source=own", permissions: ["drugs.list", "drugs.details"]});
        expect(await screen.findByText("لا توجد أدوية خاصة بالعيادة بعد.")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "إضافة دواء"})).not.toBeInTheDocument();
    });

    test("the empty state's «إضافة دواء» opens the new drug dialog @CAT-136", async () => {
        const {user} = await renderDrugsPage([SHARED_EYE()], {route: "/drugs?source=own"});
        const message = await screen.findByText("لا توجد أدوية خاصة بالعيادة بعد.");
        const buttons = screen.getAllByRole("button", {name: "إضافة دواء"});
        // The one after the message in the page (the header's comes before it)
        const inEmptyState = buttons.find(b => message.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        expect(inEmptyState).toBeDefined();
        await user.click(inEmptyState!);
        expect(await screen.findByRole("dialog", {name: "دواء جديد"})).toBeInTheDocument();
    });

    test("«أدوية العيادة» + «العيون» with no own eye drug, no search: «لا توجد أدوية مطابقة للفلاتر.» with «مسح الفلاتر» @CAT-142",
        async () => {
            await renderDrugsPage([SHARED_EYE(), aDrug({name: "Acnelyse", category: SKIN, subCategory: ACNE})],
                {route: "/drugs?source=own&categoryId=17"});
            expect(await screen.findByText("لا توجد أدوية مطابقة للفلاتر.")).toBeInTheDocument();
            expect(screen.getByRole("button", {name: "مسح الفلاتر"})).toBeInTheDocument();
            expect(screen.queryByText("لا توجد أدوية مطابقة للبحث.")).not.toBeInTheDocument();
            expect(screen.queryByText("لا توجد أدوية خاصة بالعيادة بعد.")).not.toBeInTheDocument();
            expect(screen.queryByText("لا توجد أدوية بعد")).not.toBeInTheDocument();
        });

    test("«مسح الفلاتر» goes back to the defaults: «الكل», every category, the URL empty, the list back @CAT-142", async () => {
        const recorded = recordRequests();
        const {user, location} = await renderDrugsPage([SHARED_EYE(), aDrug({name: "Acnelyse", category: SKIN, subCategory: ACNE})],
            {route: "/drugs?source=own&categoryId=17&subCategoryId=138"});
        await user.click(await screen.findByRole("button", {name: "مسح الفلاتر"}));
        expect(await loaded(2)).toBeInTheDocument();
        expect(screen.getByText("Acnelyse")).toBeInTheDocument();
        expect(pressedSource()).toBe("all");
        expect(categoryFilter()).toHaveTextContent("كل التصنيفات");
        expect(subCategoryFilter()).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByRole("searchbox")).toHaveValue("");
        await waitFor(() => expect(location().search).toBe(""));
        const sent = lastListQuery(recorded);
        expect([sent.get("source"), sent.get("categoryId"), sent.get("subCategoryId"), sent.get("search") ?? ""]).toEqual([null, null, null, ""]);
    });

    test("in English: \"No drugs match the filters.\" with \"Clear filters\" @CAT-142", async () => {
        await renderDrugsPage([aDrug({name: "Acnelyse", category: SKIN, subCategory: ACNE})], {lang: "en", route: "/drugs?source=shared"});
        expect(await screen.findByText("No drugs match the filters.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Clear filters"})).toBeInTheDocument();
    });

    test("filters with a search typed: «لا توجد أدوية مطابقة للبحث.», not the filters' message @CAT-142", async () => {
        await renderDrugsPage([SHARED_EYE()], {route: "/drugs?source=own&categoryId=17&search=zzz"});
        expect(await screen.findByText("لا توجد أدوية مطابقة للبحث.")).toBeInTheDocument();
        expect(screen.queryByText("لا توجد أدوية مطابقة للفلاتر.")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "مسح الفلاتر"})).not.toBeInTheDocument();
    });
});

describe("drugs page URL: a page past the end @area:catalog", () => {
    test("page=900 of 45 drugs: the last page (41–45 من 45) shows, never an empty table, and the URL says page 3 @CAT-143", async () => {
        const watch = watchTexts("لا توجد أدوية", "17981–");
        const {location} = await renderDrugsPage(manyDrugs(45), {route: "/drugs?page=900"});
        expect(await screen.findByText("41–45 من 45")).toBeInTheDocument();
        expect(screen.getByText("Drug 041")).toBeInTheDocument();
        expect(screen.getByText("Drug 045")).toBeInTheDocument();
        expect(screen.queryByText("Drug 040")).not.toBeInTheDocument();
        await waitFor(() => expect(new URLSearchParams(location().search).get("page")).toBe("3"));
        expect(watch.seen(), "no empty state or empty range, even for a moment").toEqual([]);
        watch.stop();
    });

    test("with filters: the last page of the filtered list, the filters kept in the URL @CAT-143", async () => {
        const own = manyDrugs(25, {}, "Own");
        const {location} = await renderDrugsPage([...own, ...manyDrugs(30, {isShared: true}, "SHARED")],
            {route: "/drugs?source=own&categoryId=17&page=900"});
        expect(await screen.findByText("21–25 من 25")).toBeInTheDocument();
        expect(screen.getByText("Own 025")).toBeInTheDocument();
        await waitFor(() => {
            const query = new URLSearchParams(location().search);
            expect([query.get("source"), query.get("categoryId"), query.get("page")]).toEqual(["own", "17", "2"]);
        });
    });

    test("an empty list asked at page 5: page 1 with the empty state, the page dropped from the URL @CAT-143", async () => {
        const {location} = await renderDrugsPage([SHARED_EYE()], {route: "/drugs?source=own&page=5"});
        expect(await screen.findByText("لا توجد أدوية خاصة بالعيادة بعد.")).toBeInTheDocument();
        await waitFor(() => expect(location().search).toBe("?source=own"));
    });
});

describe("drugs page: the last choice wins @area:catalog", () => {
    test("«الكل» → «المشتركة» → «أدوية العيادة» clicked fast, the shared answer slower: the table and «إجمالي الأدوية: N» show «أدوية العيادة» only @CAT-144",
        async () => {
            const shared = gate();
            const answers = answeredQueries();
            const drugs = [aDrug({name: "Own drug 1"}), aDrug({name: "Own drug 2"}),
                aSharedDrug({name: "SHARED DRUG 1"}), aSharedDrug({name: "SHARED DRUG 2"}), aSharedDrug({name: "SHARED DRUG 3"})];
            const {user, location} = await renderDrugsPage(drugs);
            expect(await loaded(5)).toBeInTheDocument();
            server.use(http.get(api("/drugs"), async ({request}) => {
                if (new URL(request.url).searchParams.get("source") === "shared") await shared.wait;
                return undefined;
            }));

            await user.click(sourceButton("shared"));
            await user.click(sourceButton("own"));
            expect(await loaded(2)).toBeInTheDocument();
            expect(screen.getByText("Own drug 1")).toBeInTheDocument();
            expect(screen.queryByText("SHARED DRUG 1")).not.toBeInTheDocument();

            // The older «المشتركة» answer arrives last
            shared.open();
            await waitFor(() => expect(answers.answered.some(q => q.get("source") === "shared")).toBe(true));
            await pastExitTransition();
            expect(screen.getByText(subtitle("2"))).toBeInTheDocument();
            expect(screen.getByText("Own drug 2")).toBeInTheDocument();
            expect(screen.queryByText("SHARED DRUG 1")).not.toBeInTheDocument();
            expect(pressedSource()).toBe("own");
            expect(new URLSearchParams(location().search).get("source")).toBe("own");
            answers.stop();
        });

    test("«العيون» then «الجلدية» picked fast, the eye answer slower: only «الجلدية»'s drugs and count @CAT-144", async () => {
        const eye = gate();
        const answers = answeredQueries();
        const drugs = [aDrug({name: "Tobradex"}), aDrug({name: "Xalatan"}), aDrug({name: "Acnelyse", category: SKIN, subCategory: ACNE})];
        const {user} = await renderDrugsPage(drugs);
        expect(await loaded(3)).toBeInTheDocument();
        server.use(http.get(api("/drugs"), async ({request}) => {
            if (new URL(request.url).searchParams.get("categoryId") === "17") await eye.wait;
            return undefined;
        }));

        await choose(user, categoryFilter(), "العيون");
        await choose(user, categoryFilter(), "الجلدية");
        expect(await loaded(1)).toBeInTheDocument();
        expect(screen.getByText("Acnelyse")).toBeInTheDocument();

        eye.open();
        await waitFor(() => expect(answers.answered.some(q => q.get("categoryId") === "17")).toBe(true));
        await pastExitTransition();
        expect(screen.getByText(subtitle("1"))).toBeInTheDocument();
        expect(screen.getByText("Acnelyse")).toBeInTheDocument();
        expect(screen.queryByText("Tobradex")).not.toBeInTheDocument();
        expect(categoryFilter()).toHaveTextContent("الجلدية");
        answers.stop();
    });
});

describe("drugs page: the order of the category selects @area:catalog", () => {
    test.each(["ar", "en"] as const)("(%s) categories by Intl.Collator, «أخرى» last; subcategories the same, «غير مصنف» then «بدون تصنيف فرعي» last @CAT-145",
        async (lang) => {
            const {user} = await renderDrugsPage([OWN_EYE()], {lang, categories: ORDER_CATEGORIES});
            expect(await loaded(1, lang)).toBeInTheDocument();
            const all = lang === "ar" ? ["كل التصنيفات", "كل التصنيفات الفرعية", "بدون تصنيف فرعي"] : ["All categories", "All subcategories", "No subcategory"];
            expect(await optionsOf(user, categoryFilter(lang))).toEqual([all[0], ...sortedNames(ORDER_CATEGORIES, lang)]);
            await choose(user, categoryFilter(lang), lang === "ar" ? EYE.nameAr : EYE.nameEn);
            expect(await optionsOf(user, subCategoryFilter(lang)))
                .toEqual([all[1], ...sortedNames(ORDER_CATEGORIES[3].subCategories, lang), all[2]]);
        });

    test("the 37-character «مكافحة الشيخوخة وشد البشرة وحول العين» is offered whole (never cut) @CAT-145", async () => {
        const {user} = await renderDrugsPage([OWN_EYE()], {categories: ORDER_CATEGORIES});
        expect(await loaded(1)).toBeInTheDocument();
        await user.click(categoryFilter());
        const option = within(await screen.findByRole("listbox")).getByRole("option", {name: LONG_CATEGORY_NAME});
        expect(option).toHaveTextContent(LONG_CATEGORY_NAME);
        expect(getComputedStyle(option).textOverflow).not.toBe("ellipsis");
    });
});

describe("drugs page: the subcategory select follows the category @area:catalog", () => {
    test("disabled until a category is chosen; changing the category resets it to «كل التصنيفات الفرعية» and goes to page 1 @CAT-133",
        async () => {
            const recorded = recordRequests();
            const {user, location} = await renderDrugsPage([...manyDrugs(25), aDrug({name: "Acnelyse", category: SKIN, subCategory: ACNE})],
                {route: "/drugs?categoryId=17&subCategoryId=138&page=2"});
            expect(await screen.findByText("21–25 من 25")).toBeInTheDocument();
            await choose(user, categoryFilter(), "الجلدية");
            expect(await loaded(1)).toBeInTheDocument();
            expect(subCategoryFilter()).toHaveTextContent("كل التصنيفات الفرعية");
            const sent = lastListQuery(recorded);
            expect([sent.get("categoryId"), sent.get("subCategoryId"), sent.get("page")]).toEqual(["5", null, "1"]);
            await waitFor(() => expect(location().search).toBe("?categoryId=5"));
        });

    test("«كل التصنيفات» again: the subcategory select is disabled again @CAT-133", async () => {
        const {user} = await renderDrugsPage([OWN_EYE()], {route: "/drugs?categoryId=17"});
        expect(await loaded(1)).toBeInTheDocument();
        expect(subCategoryFilter()).not.toHaveAttribute("aria-disabled", "true");
        await choose(user, categoryFilter(), "كل التصنيفات");
        await waitFor(() => expect(subCategoryFilter()).toHaveAttribute("aria-disabled", "true"));
    });
});

describe("drugs page: a row of each source @area:catalog", () => {
    test("«المشتركة» lists only rows with «مشترك»; the row's category reads «العيون › المياه الزرقاء» @CAT-132", async () => {
        await renderDrugsPage([OWN_EYE(), SHARED_EYE()], {route: "/drugs?source=shared"});
        expect(await loaded(1)).toBeInTheDocument();
        const row = await rowOf("VIGAMOX 0.5% EYE DROPS 5 ML");
        expect(within(row).getByText("مشترك")).toBeInTheDocument();
        expect(within(row).getByText("العيون › المياه الزرقاء")).toBeInTheDocument();
        expect(screen.queryByText("Tobradex")).not.toBeInTheDocument();
    });
});
