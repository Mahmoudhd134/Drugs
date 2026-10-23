import {describe, expect, test} from "vitest";
import type {Category} from "../types.ts";
import {
    clampPage, DEFAULT_DRUG_LIST_PARAMS, drugListEmptyState, type DrugListParams, readDrugListParams,
    writeDrugListParams,
} from "./drugListParams.ts";

/*
 * The drugs page's URL state (M1.7c contract § 2.3, decision C2; design M1.7 D9): read with invalid values dropped
 * silently (CAT-135), written with the defaults left out (CAT-134), the page clamped (CAT-143), the empty state chosen
 * (CAT-136, CAT-142). Expected values from the contract and the cases, never from the code.
 */

/** «العيون» (17) with «المياه الزرقاء» (138) and «جفاف العين» (139); «الجلدية» (5) with «حب الشباب» (40). */
const CATEGORIES: Category[] = [
    {
        id: 17, nameEn: "Eye", nameAr: "العيون", pinnedLast: false, subCategories: [
            {id: 138, nameEn: "Glaucoma", nameAr: "المياه الزرقاء", pinnedLast: false},
            {id: 139, nameEn: "Dry eye", nameAr: "جفاف العين", pinnedLast: false},
        ],
    },
    {
        id: 5, nameEn: "Skin", nameAr: "الجلدية", pinnedLast: false, subCategories: [
            {id: 40, nameEn: "Acne", nameAr: "حب الشباب", pinnedLast: false},
        ],
    },
];

/** Read with the categories loaded (`CATEGORIES`, or the given list). */
const read = (query: string, categories: Category[] = CATEGORIES) =>
    readDrugListParams(new URLSearchParams(query), categories);

/** Read while the categories load (`undefined`): a default parameter would swallow an explicit `undefined`. */
const readLoading = (query: string) => readDrugListParams(new URLSearchParams(query), undefined);

const params = (fields: Partial<DrugListParams> = {}): DrugListParams => ({...DEFAULT_DRUG_LIST_PARAMS, ...fields});

/** The URL query as sorted `key=value` pairs (the order of the keys is not part of the contract). */
const pairs = (query: URLSearchParams) => [...query.entries()].map(([k, v]) => `${k}=${v}`).sort();

describe("drugs page URL: reading the query @area:catalog", () => {
    test("an empty query: the defaults (search empty, «الكل», no category, page 1, the tree view) @CAT-134 @CAT-270", () => {
        expect(DEFAULT_DRUG_LIST_PARAMS).toEqual({search: "", source: "all", categoryId: null, subCategoryId: null, page: 1, view: "tree"});
        expect(read("")).toEqual(DEFAULT_DRUG_LIST_PARAMS);
        expect(readLoading("")).toEqual(DEFAULT_DRUG_LIST_PARAMS);
    });

    test("every value set and valid is read as it is (the search as typed) @CAT-134", () => {
        expect(read("search=+amox+&source=own&categoryId=17&subCategoryId=138&page=3"))
            .toEqual({search: " amox ", source: "own", categoryId: 17, subCategoryId: 138, page: 3, view: "tree"});
        expect(read("search=+amox+&source=own&categoryId=17&subCategoryId=138&page=3&view=list"))
            .toEqual({search: " amox ", source: "own", categoryId: 17, subCategoryId: 138, page: 3, view: "list"});
        expect(read("source=shared&categoryId=5&subCategoryId=40"))
            .toEqual({search: "", source: "shared", categoryId: 5, subCategoryId: 40, page: 1, view: "tree"});
    });

    test("an Arabic search is read back as typed @CAT-134", () => {
        expect(read(`search=${encodeURIComponent("المياه الزرقاء")}`).search).toBe("المياه الزرقاء");
    });

    test.each(["all", "shared", "own"] as const)("source=%s is kept @CAT-134", (source) => {
        expect(read(`source=${source}`).source).toBe(source);
    });

    test.each(["bogus", "Shared", "OWN", "", " own", "own "])("an unknown source «%s» → «الكل», nothing else dropped @CAT-135", (source) => {
        expect(read(`source=${encodeURIComponent(source)}&categoryId=17&page=2`))
            .toEqual(params({source: "all", categoryId: 17, page: 2}));
    });

    test("subCategoryId=none with its category: «بدون تصنيف فرعي» @CAT-134", () => {
        expect(read("categoryId=17&subCategoryId=none")).toEqual(params({categoryId: 17, subCategoryId: "none"}));
    });

    test.each(["0", "-1", "-17", "1.5", "17.0", "abc", "", "17abc", "1e2", "0x11", "2147483648", "99999999999"])(
        "categoryId «%s» is not a positive 32-bit integer: no category, and its subcategory dropped with it @CAT-135",
        (value) => {
            expect(readLoading(`categoryId=${value}&subCategoryId=138`)).toEqual(DEFAULT_DRUG_LIST_PARAMS);
            expect(read(`categoryId=${value}&subCategoryId=138`)).toEqual(DEFAULT_DRUG_LIST_PARAMS);
        });

    test("the largest 32-bit id (2147483647) is a valid id while the categories load @CAT-135", () => {
        expect(readLoading("categoryId=2147483647&subCategoryId=2147483647"))
            .toEqual(params({categoryId: 2147483647, subCategoryId: 2147483647}));
    });

    test("a deleted category id (not in the loaded categories): no category, its subcategory dropped too, the rest kept @CAT-135", () => {
        expect(read("search=a&source=own&categoryId=99&subCategoryId=138&page=2"))
            .toEqual(params({search: "a", source: "own", page: 2}));
        expect(read("categoryId=99&subCategoryId=none")).toEqual(DEFAULT_DRUG_LIST_PARAMS);
    });

    test("loaded but empty categories: any category id is dropped @CAT-135", () => {
        expect(read("categoryId=17&subCategoryId=138", [])).toEqual(DEFAULT_DRUG_LIST_PARAMS);
    });

    test("subCategoryId without categoryId is dropped (loaded or not) @CAT-135", () => {
        expect(read("subCategoryId=138")).toEqual(DEFAULT_DRUG_LIST_PARAMS);
        expect(readLoading("subCategoryId=138")).toEqual(DEFAULT_DRUG_LIST_PARAMS);
    });

    test("subCategoryId=none alone is dropped (loaded or not) @CAT-135", () => {
        expect(read("subCategoryId=none")).toEqual(DEFAULT_DRUG_LIST_PARAMS);
        expect(readLoading("subCategoryId=none")).toEqual(DEFAULT_DRUG_LIST_PARAMS);
    });

    test("a subcategory of another category is dropped, the category kept @CAT-135", () => {
        expect(read("categoryId=17&subCategoryId=40")).toEqual(params({categoryId: 17}));
        expect(read("categoryId=5&subCategoryId=138")).toEqual(params({categoryId: 5}));
    });

    test("a subcategory id that exists nowhere is dropped, the category kept @CAT-135", () => {
        expect(read("categoryId=17&subCategoryId=777")).toEqual(params({categoryId: 17}));
    });

    test.each(["None", "NONE", "0", "-138", "1.5", "abc", "", "138x", "2147483648"])(
        "a malformed subCategoryId «%s» is dropped, the category kept (loaded or not) @CAT-135", (value) => {
            expect(read(`categoryId=17&subCategoryId=${value}`)).toEqual(params({categoryId: 17}));
            expect(readLoading(`categoryId=17&subCategoryId=${value}`)).toEqual(params({categoryId: 17}));
        });

    test("while the categories load (undefined), syntactically valid ids are kept, even unknown ones @CAT-135", () => {
        expect(readLoading("categoryId=99&subCategoryId=777")).toEqual(params({categoryId: 99, subCategoryId: 777}));
        expect(readLoading("categoryId=17&subCategoryId=40")).toEqual(params({categoryId: 17, subCategoryId: 40}));
        expect(readLoading("categoryId=99&subCategoryId=none")).toEqual(params({categoryId: 99, subCategoryId: "none"}));
    });

    test("the same URL once the categories are loaded: the unknown ids are dropped @CAT-135", () => {
        expect(read("categoryId=99&subCategoryId=777")).toEqual(DEFAULT_DRUG_LIST_PARAMS);
    });

    test.each(["0", "-1", "1.5", "abc", "", "2x", "1e1"])("page «%s» is not a positive integer → page 1, the rest kept @CAT-135", (value) => {
        expect(read(`source=shared&page=${value}`)).toEqual(params({source: "shared"}));
    });

    test.each([["1", 1], ["2", 2], ["900", 900]])("page=%s is read as page %i (a page past the end is clamped later) @CAT-143", (value, page) => {
        expect(read(`page=${value}`).page).toBe(page);
    });

    test("a missing search is the empty search @CAT-134", () => {
        expect(read("source=own").search).toBe("");
    });

    test("view=list: the list; no view: the tree (the default) @CAT-270 @CAT-271", () => {
        expect(read("view=list").view).toBe("list");
        expect(readLoading("view=list").view).toBe("list");
        expect(read("").view).toBe("tree");
        expect(read("source=own&categoryId=17&view=list")).toEqual(params({source: "own", categoryId: 17, view: "list"}));
    });

    test.each(["bogus", "TREE", "tree", "List", "LIST", "", " list", "list "])(
        "view «%s» other than \"list\" → the tree, nothing else dropped @CAT-273", (value) => {
            expect(read(`view=${encodeURIComponent(value)}&source=own&page=2`)).toEqual(params({source: "own", page: 2, view: "tree"}));
        });

    test("the given query is never changed @CAT-135", () => {
        const query = new URLSearchParams("source=bogus&categoryId=99&subCategoryId=none&page=0");
        readDrugListParams(query, CATEGORIES);
        expect(query.toString()).toBe("source=bogus&categoryId=99&subCategoryId=none&page=0");
    });
});

describe("drugs page URL: writing the query @area:catalog", () => {
    test("the defaults: an empty query @CAT-134", () => {
        expect(writeDrugListParams(DEFAULT_DRUG_LIST_PARAMS).toString()).toBe("");
    });

    test("every value set: all six keys @CAT-134 @CAT-271", () => {
        expect(pairs(writeDrugListParams({search: "amox", source: "own", categoryId: 17, subCategoryId: 138, page: 3, view: "list"})))
            .toEqual(["categoryId=17", "page=3", "search=amox", "source=own", "subCategoryId=138", "view=list"]);
    });

    test("the view: `view=list` for the list, nothing for the tree (the default) @CAT-270 @CAT-271", () => {
        expect(writeDrugListParams(params({view: "list"})).toString()).toBe("view=list");
        expect(writeDrugListParams(params({view: "tree"})).toString()).toBe("");
        expect(writeDrugListParams(params({source: "own", view: "tree"})).has("view")).toBe(false);
    });

    test("only the values that differ from the defaults are written @CAT-134", () => {
        expect(pairs(writeDrugListParams(params({source: "shared"})))).toEqual(["source=shared"]);
        expect(pairs(writeDrugListParams(params({page: 2})))).toEqual(["page=2"]);
        expect(pairs(writeDrugListParams(params({search: "a"})))).toEqual(["search=a"]);
        expect(pairs(writeDrugListParams(params({categoryId: 17})))).toEqual(["categoryId=17"]);
        expect(pairs(writeDrugListParams(params({categoryId: 17, subCategoryId: "none"}))))
            .toEqual(["categoryId=17", "subCategoryId=none"]);
    });

    test("the search is written as typed, untrimmed @CAT-134", () => {
        expect(writeDrugListParams(params({search: " amox "})).get("search")).toBe(" amox ");
        expect(writeDrugListParams(params({search: "المياه الزرقاء"})).get("search")).toBe("المياه الزرقاء");
    });

    test.each([
        params(),
        params({search: "amox", source: "own", categoryId: 17, subCategoryId: 138, page: 3}),
        params({source: "shared", categoryId: 5, subCategoryId: 40}),
        params({categoryId: 17, subCategoryId: "none", page: 900}),
        params({search: " عين "}),
        params({view: "list"}),
        params({search: "amox", source: "shared", categoryId: 17, page: 2, view: "list"}),
    ])("what is written reads back the same (%o) @CAT-134", (state) => {
        expect(readDrugListParams(writeDrugListParams(state), CATEGORIES)).toEqual(state);
    });
});

describe("drugs page URL: a page past the end @area:catalog", () => {
    test.each([
        // page, totalCount, pageSize → shown page
        [900, 41, 20, 3],
        [4, 41, 20, 3],
        [3, 41, 20, 3],
        [2, 41, 20, 2],
        [1, 41, 20, 1],
        [3, 40, 20, 2],
        [2, 40, 20, 2],
        [2, 21, 20, 2],
        [2, 20, 20, 1],
        [2, 19, 20, 1],
        [1, 1, 20, 1],
        [5, 23414, 50, 5],
        [900, 23414, 50, 469],
        [469, 23414, 50, 469],
        [470, 23414, 50, 469],
        [7, 100, 10, 7],
        [11, 100, 10, 10],
    ])("page %i of %i drugs at %i per page → page %i @CAT-143", (page, totalCount, pageSize, expected) => {
        expect(clampPage(page, totalCount, pageSize)).toBe(expected);
    });

    test.each([[1], [2], [900]])("an empty list: page 1 (asked %i) @CAT-143", (page) => {
        expect(clampPage(page, 0, 20)).toBe(1);
    });

    test.each([[0], [-3]])("a page below 1 (%i) → page 1 @CAT-143", (page) => {
        expect(clampPage(page, 41, 20)).toBe(1);
    });
});

describe("drugs page: which empty state @area:catalog", () => {
    const state = (fields: Partial<DrugListParams>) => {
        const {search, source, categoryId, subCategoryId} = params(fields);
        return drugListEmptyState({search, source, categoryId, subCategoryId});
    };

    test("nothing filtered, nothing searched: the existing «لا توجد أدوية بعد» @CAT-136", () => {
        expect(state({})).toBe("empty");
    });

    test("a search typed: «لا توجد أدوية مطابقة للبحث.», whatever the filters @CAT-142", () => {
        expect(state({search: "zzz"})).toBe("noResults");
        expect(state({search: " zzz "})).toBe("noResults");
        expect(state({search: "a", source: "own"})).toBe("noResults");
        expect(state({search: "a", source: "shared"})).toBe("noResults");
        expect(state({search: "a", source: "own", categoryId: 17, subCategoryId: 138})).toBe("noResults");
        expect(state({search: "a", categoryId: 17})).toBe("noResults");
    });

    test("a search of spaces only counts as no search @CAT-142", () => {
        expect(state({search: "   "})).toBe("empty");
        expect(state({search: "   ", source: "own"})).toBe("noOwnDrugs");
        expect(state({search: "  ", categoryId: 17})).toBe("noFilterResults");
    });

    test("«أدوية العيادة», no category, no search: «لا توجد أدوية خاصة بالعيادة بعد.» @CAT-136", () => {
        expect(state({source: "own"})).toBe("noOwnDrugs");
    });

    test("«أدوية العيادة» + «العيون», no search: «لا توجد أدوية مطابقة للفلاتر.» (not the no-own-drugs text) @CAT-142", () => {
        expect(state({source: "own", categoryId: 17})).toBe("noFilterResults");
        expect(state({source: "own", categoryId: 17, subCategoryId: 138})).toBe("noFilterResults");
        expect(state({source: "own", categoryId: 17, subCategoryId: "none"})).toBe("noFilterResults");
    });

    test("any other filter without a search: «لا توجد أدوية مطابقة للفلاتر.» @CAT-142", () => {
        expect(state({source: "shared"})).toBe("noFilterResults");
        expect(state({source: "shared", categoryId: 17})).toBe("noFilterResults");
        expect(state({categoryId: 17})).toBe("noFilterResults");
        expect(state({categoryId: 17, subCategoryId: "none"})).toBe("noFilterResults");
        expect(state({subCategoryId: 138})).toBe("noFilterResults");
    });
});
