import {describe, expect, test} from "vitest";
import {aDrug, aTreeCategory, aTreeSubCategory, EYE, GLAUCOMA} from "../../../test";
import type {Drug, DrugTreeCategory, DrugTreeData, DrugTreeSubCategory} from "../types.ts";
import {
    autoOpenBucket,
    bucketKey,
    type BucketKey,
    dedupeById,
    filterTree,
    singleDrugBuckets,
    sortTree,
    subCategoryFilterOf,
    treeKeyAction,
    type TreeRow,
    treeSearchTerm,
    treeTotal,
    visibleRows,
} from "./drugTreeModel.ts";

// The drug tree's pure logic: docs/design/m1.7c-contract.md § 2.3 (sortTree, treeTotal, autoOpenBucket, visibleRows,
// treeKeyAction, dedupeById, bucketKey, subCategoryFilterOf), design M1.7 D5 (order), D7 (auto-open, de-duplication),
// D9 (keyboard), decisions C3 (keys) and C4 (the bucket last); docs/design/m1.7-review-contract.md R1 (filterTree,
// the drugs page's category filters) and R3 (singleDrugBuckets).

const tree = (...categories: DrugTreeCategory[]): DrugTreeData => ({categories});
const sub = (id: number, nameEn: string, nameAr: string, count = 1, pinnedLast = false): DrugTreeSubCategory =>
    aTreeSubCategory({id, nameEn, nameAr, count, pinnedLast});
const bucket = (count = 1): DrugTreeSubCategory => aTreeSubCategory({id: null, nameEn: null, nameAr: null, count});
const cat = (id: number, nameEn: string, nameAr: string, fields: Partial<DrugTreeCategory> = {}): DrugTreeCategory =>
    aTreeCategory({id, nameEn, nameAr, subCategories: [sub(id * 10, `${nameEn} sub`, `${nameAr} فرعي`)], ...fields});

const ids = (categories: Array<{ id: number }>) => categories.map(c => c.id);
const subIds = (category: DrugTreeCategory) => category.subCategories.map(s => s.id);

describe("drug tree: the order of categories and subcategories @area:catalog", () => {
    // English order: Antibiotics, Eye, zinc; Arabic order: «العيون» (ا), «زنك» (ز), «مضادات حيوية» (م)
    const antibiotics = () => cat(1, "Antibiotics", "مضادات حيوية");
    const eye = () => cat(2, "Eye", "العيون");
    const zinc = () => cat(3, "zinc", "زنك");

    test("without a search: categories by their English name in English, with the language's collator (case ignored) @CAT-095", () => {
        expect(ids(sortTree(tree(zinc(), eye(), antibiotics()), "en", false))).toEqual([1, 2, 3]);
    });

    test("without a search: categories by their Arabic name in Arabic @CAT-095", () => {
        expect(ids(sortTree(tree(antibiotics(), zinc(), eye()), "ar", false))).toEqual([2, 3, 1]);
    });

    test("without a search: a category's subcategories by name in the UI language @CAT-096", () => {
        const category = cat(2, "Eye", "العيون", {
            subCategories: [sub(1, "Retina", "الشبكية"), sub(2, "cataract", "المياه البيضاء"), sub(3, "Glaucoma", "جلوكوما")],
        });
        expect(subIds(sortTree(tree(category), "en", false)[0])).toEqual([2, 3, 1]);
        expect(subIds(sortTree(tree(category), "ar", false)[0])).toEqual([1, 2, 3]);
    });

    test("without a search, the count plays no part: a smaller count can come first @CAT-095", () => {
        const a = cat(1, "Alpha", "ألف", {subCategories: [sub(10, "x", "س", 1)]});
        const b = cat(2, "Beta", "باء", {subCategories: [sub(20, "y", "ص", 9)]});
        expect(ids(sortTree(tree(b, a), "en", false))).toEqual([1, 2]);
    });

    test("a pinnedLast category («أخرى») comes after the others even when its name sorts first, in both languages @CAT-095", () => {
        const other = cat(23, "Aaa other", "أأأ أخرى", {pinnedLast: true});
        expect(ids(sortTree(tree(other, zinc(), eye()), "en", false))).toEqual([2, 3, 23]);
        expect(ids(sortTree(tree(zinc(), other, eye()), "ar", false))).toEqual([2, 3, 23]);
    });

    test("several pinnedLast rows are sorted by name among themselves, after the others @CAT-095", () => {
        const p1 = cat(31, "Pinned b", "مثبت ب", {pinnedLast: true});
        const p2 = cat(32, "Pinned a", "مثبت أ", {pinnedLast: true});
        expect(ids(sortTree(tree(p1, eye(), p2), "en", false))).toEqual([2, 32, 31]);
    });

    test("«غير مصنف» (pinnedLast) and «بدون تصنيف فرعي» (the bucket) end the subcategories, the bucket last @CAT-096", () => {
        const category = cat(2, "Eye", "العيون", {
            subCategories: [bucket(), sub(182, "Aaa unclassified", "أأأ غير مصنف", 1, true), sub(5, "Zeta", "ياء"), sub(4, "Beta", "باء")],
        });
        expect(subIds(sortTree(tree(category), "en", false)[0])).toEqual([4, 5, 182, null]);
        expect(subIds(sortTree(tree(category), "ar", false)[0])).toEqual([4, 5, 182, null]);
    });

    test("the bucket is last even when it is the only other row, or first in the answer @CAT-096", () => {
        const category = cat(2, "Eye", "العيون", {subCategories: [bucket(), sub(9, "Zeta", "ياء")]});
        expect(subIds(sortTree(tree(category), "en", false)[0])).toEqual([9, null]);
        expect(subIds(sortTree(tree(cat(2, "Eye", "العيون", {subCategories: [bucket()]})), "en", false)[0])).toEqual([null]);
    });

    test("with a search: categories by count, largest first, whatever their names @CAT-074", () => {
        const a = cat(1, "Alpha", "ألف", {subCategories: [sub(10, "x", "س", 2)]});
        const b = cat(2, "Beta", "باء", {subCategories: [sub(20, "y", "ص", 219)]});
        const c = cat(3, "Gamma", "جيم", {subCategories: [sub(30, "z", "ع", 40)]});
        expect(ids(sortTree(tree(a, b, c), "en", true))).toEqual([2, 3, 1]);
        expect(ids(sortTree(tree(c, a, b), "ar", true))).toEqual([2, 3, 1]);
    });

    test("with a search: equal counts are ordered by name in the UI language @CAT-074", () => {
        const a = cat(1, "Beta", "ألف", {subCategories: [sub(10, "x", "س", 5)]});
        const b = cat(2, "alpha", "باء", {subCategories: [sub(20, "y", "ص", 5)]});
        const c = cat(3, "Gamma", "جيم", {subCategories: [sub(30, "z", "ع", 7)]});
        expect(ids(sortTree(tree(a, b, c), "en", true))).toEqual([3, 2, 1]);
        expect(ids(sortTree(tree(b, c, a), "ar", true))).toEqual([3, 1, 2]);
    });

    test("with a search: subcategories by count, ties by name; pinnedLast after the others, then the bucket @CAT-074 @CAT-096", () => {
        const category = cat(2, "Eye", "العيون", {
            subCategories: [
                bucket(500),
                sub(182, "Unclassified", "غير مصنف", 300, true),
                sub(4, "Small", "صغير", 3),
                sub(5, "big", "كبير", 90),
                sub(6, "Also small", "صغير أيضا", 3),
            ],
        });
        expect(subIds(sortTree(tree(category), "en", true)[0])).toEqual([5, 6, 4, 182, null]);
    });

    test("with a search: a pinnedLast category stays after the others even with the largest count @CAT-074", () => {
        const other = cat(23, "Other", "أخرى", {pinnedLast: true, subCategories: [sub(230, "o", "و", 900)]});
        const eyeSmall = cat(2, "Eye", "العيون", {subCategories: [sub(20, "e", "ه", 1)]});
        expect(ids(sortTree(tree(other, eyeSmall), "en", true))).toEqual([2, 23]);
    });

    test("with a search: several pinnedLast categories by count among themselves @CAT-074", () => {
        const p1 = cat(31, "Pinned a", "مثبت أ", {pinnedLast: true, subCategories: [sub(310, "o", "و", 1)]});
        const p2 = cat(32, "Pinned b", "مثبت ب", {pinnedLast: true, subCategories: [sub(320, "o", "و", 8)]});
        expect(ids(sortTree(tree(p1, p2, eye()), "en", true))).toEqual([2, 32, 31]);
    });

    test("the answer is left as it is: a new array, the categories' subcategory lists untouched @CAT-095", () => {
        const data = tree(zinc(), eye(), cat(4, "Ear", "الأذن", {subCategories: [bucket(), sub(41, "b", "ب"), sub(40, "a", "أ")]}));
        const before = structuredClone(data);
        const sorted = sortTree(data, "en", false);
        expect(data).toEqual(before);
        expect(sorted).not.toBe(data.categories);
        expect(ids(sorted)).toEqual([4, 2, 3]);
        expect(subIds(sorted[0])).toEqual([40, 41, null]);
        expect(data.categories[2].subCategories.map(s => s.id)).toEqual([null, 41, 40]);
    });

    test("the sorted rows keep every field of the answer (names, counts, pins) @CAT-095", () => {
        const category = cat(2, "Eye", "العيون", {subCategories: [sub(7, "Glaucoma", "المياه الزرقاء", 91)]});
        expect(sortTree(tree(category), "ar", false)).toEqual([category]);
    });

    test("an empty answer sorts to an empty list", () => {
        expect(sortTree(tree(), "ar", true)).toEqual([]);
        expect(sortTree(tree(), "en", false)).toEqual([]);
    });
});

describe("drug tree: the total «النتائج: N» @area:catalog", () => {
    test("the sum of the category counts @DRUG-058", () => {
        expect(treeTotal(tree(
            aTreeCategory({id: 1, count: 1469}),
            aTreeCategory({id: 2, count: 1925}),
            aTreeCategory({id: 3, count: 20_023}),
        ))).toBe(23_417);
    });

    test("the category counts, not a recount of the subcategories @DRUG-058", () => {
        expect(treeTotal(tree(aTreeCategory({id: 1, count: 5, subCategories: [aTreeSubCategory({count: 2})]})))).toBe(5);
    });

    test("one category: its count; none: 0 @DRUG-058", () => {
        expect(treeTotal(tree(aTreeCategory({count: 7})))).toBe(7);
        expect(treeTotal(tree())).toBe(0);
    });
});

describe("drug tree: the bucket that opens by itself @area:catalog", () => {
    test("one category with one subcategory: that subcategory and its category @CAT-099", () => {
        expect(autoOpenBucket(tree(aTreeCategory({...EYE, subCategories: [aTreeSubCategory({...GLAUCOMA, count: 203})]}))))
            .toEqual({categoryId: EYE.id, bucket: `${EYE.id}:${GLAUCOMA.id}`});
    });

    test("a lone «بدون تصنيف فرعي» bucket opens too @CAT-100", () => {
        expect(autoOpenBucket(tree(aTreeCategory({id: 40, subCategories: [bucket(3)]})))).toEqual({categoryId: 40, bucket: "40:none"});
    });

    test("a category with two subcategories (one may be the bucket): nothing opens @CAT-099", () => {
        expect(autoOpenBucket(tree(aTreeCategory({subCategories: [sub(1, "a", "أ"), sub(2, "b", "ب")]})))).toBeNull();
        expect(autoOpenBucket(tree(aTreeCategory({subCategories: [sub(1, "a", "أ"), bucket()]})))).toBeNull();
    });

    test("two categories with one subcategory each: nothing opens @CAT-099", () => {
        expect(autoOpenBucket(tree(cat(1, "A", "أ"), cat(2, "B", "ب")))).toBeNull();
    });

    test("an empty answer: nothing opens @CAT-100", () => {
        expect(autoOpenBucket(tree())).toBeNull();
    });

    test("a subcategory with id 0 keeps its id in the key @CAT-099", () => {
        expect(autoOpenBucket(tree(aTreeCategory({id: 5, subCategories: [sub(0, "z", "ز")]})))).toEqual({categoryId: 5, bucket: "5:0"});
    });
});

describe("drug tree: the branches a search opens by themselves @area:catalog", () => {
    const one = (id: number, subId: number | null, count = 1) =>
        aTreeCategory({id, subCategories: [subId === null ? bucket(count) : sub(subId, `s${subId}`, `ف${subId}`, count)]});

    test("three categories, each with one subcategory of one drug: all three open, in the answer's order @CAT-279", () => {
        expect(singleDrugBuckets(tree(one(1, 10), one(2, 20), one(3, 30)))).toEqual([
            {categoryId: 1, bucket: "1:10"}, {categoryId: 2, bucket: "2:20"}, {categoryId: 3, bucket: "3:30"},
        ]);
    });

    test("a category with one subcategory of 2 drugs, or with 2 subcategories, stays closed; the others open @CAT-279", () => {
        const twoDrugs = one(4, 40, 2);
        const twoSubs = aTreeCategory({id: 5, subCategories: [sub(50, "a", "أ"), sub(51, "b", "ب")]});
        expect(singleDrugBuckets(tree(one(1, 10), twoDrugs, twoSubs, one(3, 30))))
            .toEqual([{categoryId: 1, bucket: "1:10"}, {categoryId: 3, bucket: "3:30"}]);
        expect(singleDrugBuckets(tree(twoDrugs, twoSubs))).toEqual([]);
    });

    test("a lone «بدون تصنيف فرعي» of one drug is that category's only subcategory: it opens too @CAT-279", () => {
        expect(singleDrugBuckets(tree(one(7, null), one(8, 80)))).toEqual([{categoryId: 7, bucket: "7:none"}, {categoryId: 8, bucket: "8:80"}]);
    });

    test("a subcategory with id 0 keeps its id in the key @CAT-279", () => {
        expect(singleDrugBuckets(tree(one(5, 0)))).toEqual([{categoryId: 5, bucket: "5:0"}]);
    });

    test("an empty answer, or one category of one drug (the D7 lone bucket, opened anyway): nothing more than that bucket @CAT-279 @CAT-280", () => {
        expect(singleDrugBuckets(tree())).toEqual([]);
        expect(singleDrugBuckets(tree(one(1, 10)))).toEqual([autoOpenBucket(tree(one(1, 10)))]);
    });

    test("the answer is left as it is @CAT-279", () => {
        const data = tree(one(1, 10), one(2, 20, 3));
        const before = structuredClone(data);
        singleDrugBuckets(data);
        expect(data).toEqual(before);
    });
});

describe("drug tree: the search term @area:catalog", () => {
    test("only spaces or tatweel is no search; anything else is kept as given @CAT-125", () => {
        expect(treeSearchTerm("")).toBe("");
        expect(treeSearchTerm("   ")).toBe("");
        expect(treeSearchTerm("ـــ")).toBe("");
        expect(treeSearchTerm(" ـ 	 ـ ")).toBe("");
        expect(treeSearchTerm("amox")).toBe("amox");
        expect(treeSearchTerm("عين")).toBe("عين");
        expect(treeSearchTerm("ـعـ")).toBe("ـعـ");
        expect(treeSearchTerm(" a ")).toBe(" a ");
    });
});

describe("drug tree: the drugs page's category filters @area:catalog", () => {
    const eye = () => aTreeCategory({id: 17, count: 6, subCategories: [sub(138, "Glaucoma", "المياه الزرقاء", 3), sub(139, "Dry eye", "جفاف العين", 2), bucket(1)]});
    const skin = () => aTreeCategory({id: 5, count: 4, subCategories: [sub(40, "Acne", "حب الشباب", 4)]});

    test("no category: the whole tree @CAT-274", () => {
        const data = tree(eye(), skin());
        expect(filterTree(data, null, null)).toEqual(data);
    });

    test("a category: only its node, with all its subcategories and its count @CAT-274", () => {
        expect(filterTree(tree(eye(), skin()), 5, null)).toEqual(tree(skin()));
        expect(filterTree(tree(eye(), skin()), 17, null)).toEqual(tree(eye()));
    });

    test("a subcategory: only it under its category, the category's count becoming the subcategory's @CAT-274", () => {
        expect(filterTree(tree(eye(), skin()), 17, 139))
            .toEqual(tree({...eye(), count: 2, subCategories: [sub(139, "Dry eye", "جفاف العين", 2)]}));
    });

    test("«بدون تصنيف فرعي» (\"none\"): only the bucket under its category @CAT-274", () => {
        expect(filterTree(tree(eye(), skin()), 17, "none")).toEqual(tree({...eye(), count: 1, subCategories: [bucket(1)]}));
    });

    test("a category or subcategory with no matching drug (not in the answer): no node at all @CAT-274", () => {
        expect(filterTree(tree(eye(), skin()), 99, null)).toEqual(tree());
        expect(filterTree(tree(eye(), skin()), 5, 41)).toEqual(tree());
        expect(filterTree(tree(skin()), 5, "none")).toEqual(tree());
        expect(filterTree(tree(), 17, null)).toEqual(tree());
    });

    test("the answer is left as it is @CAT-274", () => {
        const data = tree(eye(), skin());
        const before = structuredClone(data);
        filterTree(data, 17, 138);
        filterTree(data, 5, null);
        expect(data).toEqual(before);
    });
});

describe("drug tree: bucket keys and filters @area:catalog", () => {
    test("bucketKey: \"<category>:<subcategory>\", \"<category>:none\" for the bucket; 0 is an id", () => {
        expect(bucketKey(17, 138)).toBe("17:138");
        expect(bucketKey(17, null)).toBe("17:none");
        expect(bucketKey(17, 0)).toBe("17:0");
    });

    test("subCategoryFilterOf: the id, or \"none\" for the bucket; 0 is an id", () => {
        expect(subCategoryFilterOf(138)).toBe(138);
        expect(subCategoryFilterOf(null)).toBe("none");
        expect(subCategoryFilterOf(0)).toBe(0);
    });
});

describe("drug tree: the reachable rows @area:catalog", () => {
    const glaucoma = sub(138, "Glaucoma", "المياه الزرقاء", 2);
    const eye = aTreeCategory({...EYE, subCategories: [glaucoma, bucket(1)]});
    const ear = aTreeCategory({id: 30, nameEn: "Ear", nameAr: "الأذن", subCategories: [sub(300, "Drops", "قطرات", 4)]});
    const timolol = aDrug({id: 501, name: "Timolol"});
    const xalatan = aDrug({id: 502, name: "Xalatan"});
    const loose = aDrug({id: 503, name: "Loose", subCategory: null});
    const glaucomaKey: BucketKey = `${EYE.id}:${GLAUCOMA.id}`;
    const bucketOfEye: BucketKey = `${EYE.id}:none`;
    const none = new Set<number>();
    const noBuckets = new Set<BucketKey>();
    const noDrugs = new Map<BucketKey, Drug[]>();

    test("everything closed: one row per category, in the given order, level 1 @CAT-107", () => {
        expect(visibleRows([eye, ear], none, noBuckets, noDrugs)).toEqual<TreeRow[]>([
            {kind: "category", id: `c${EYE.id}`, level: 1, category: eye},
            {kind: "category", id: "c30", level: 1, category: ear},
        ]);
        expect(visibleRows([ear, eye], none, noBuckets, noDrugs).map(r => r.id)).toEqual(["c30", `c${EYE.id}`]);
    });

    test("an open category shows its subcategories (the bucket included) right under it, level 2 @CAT-096", () => {
        expect(visibleRows([eye, ear], new Set([EYE.id]), noBuckets, noDrugs)).toEqual<TreeRow[]>([
            {kind: "category", id: `c${EYE.id}`, level: 1, category: eye},
            {kind: "subCategory", id: `s${glaucomaKey}`, level: 2, categoryId: EYE.id, bucket: glaucomaKey, subCategory: glaucoma},
            {kind: "subCategory", id: `s${bucketOfEye}`, level: 2, categoryId: EYE.id, bucket: bucketOfEye, subCategory: eye.subCategories[1]},
            {kind: "category", id: "c30", level: 1, category: ear},
        ]);
    });

    test("an open subcategory shows its loaded drugs under it, level 3, ids by bucket and drug @CAT-120", () => {
        const rows = visibleRows([eye, ear], new Set([EYE.id]), new Set([glaucomaKey]), new Map([[glaucomaKey, [timolol, xalatan]]]));
        expect(rows.map(r => r.id)).toEqual([`c${EYE.id}`, `s${glaucomaKey}`, `d${glaucomaKey}:501`, `d${glaucomaKey}:502`, `s${bucketOfEye}`, "c30"]);
        expect(rows[2]).toEqual<TreeRow>({kind: "drug", id: `d${glaucomaKey}:501`, level: 3, categoryId: EYE.id, bucket: glaucomaKey, drug: timolol});
        expect(rows[3]).toEqual<TreeRow>({kind: "drug", id: `d${glaucomaKey}:502`, level: 3, categoryId: EYE.id, bucket: glaucomaKey, drug: xalatan});
    });

    test("the bucket's drugs: ids `d<category>:none:<drug>` @CAT-100", () => {
        const rows = visibleRows([eye], new Set([EYE.id]), new Set([bucketOfEye]), new Map([[bucketOfEye, [loose]]]));
        expect(rows.map(r => r.id)).toEqual([`c${EYE.id}`, `s${glaucomaKey}`, `s${bucketOfEye}`, `d${bucketOfEye}:503`]);
        expect(rows[3]).toEqual<TreeRow>({kind: "drug", id: `d${bucketOfEye}:503`, level: 3, categoryId: EYE.id, bucket: bucketOfEye, drug: loose});
    });

    test("an open subcategory inside a closed category shows nothing of it @CAT-120", () => {
        const rows = visibleRows([eye, ear], none, new Set([glaucomaKey]), new Map([[glaucomaKey, [timolol]]]));
        expect(rows.map(r => r.id)).toEqual([`c${EYE.id}`, "c30"]);
    });

    test("loaded drugs of a closed subcategory are not shown; an open one with nothing loaded yet shows no drug @CAT-121", () => {
        const closed = visibleRows([eye], new Set([EYE.id]), noBuckets, new Map([[glaucomaKey, [timolol]]]));
        expect(closed.map(r => r.id)).toEqual([`c${EYE.id}`, `s${glaucomaKey}`, `s${bucketOfEye}`]);
        const loading = visibleRows([eye], new Set([EYE.id]), new Set([glaucomaKey]), noDrugs);
        expect(loading.map(r => r.id)).toEqual([`c${EYE.id}`, `s${glaucomaKey}`, `s${bucketOfEye}`]);
    });

    test("several open categories and subcategories, top to bottom @CAT-120", () => {
        const drops: BucketKey = "30:300";
        const rows = visibleRows([eye, ear], new Set([EYE.id, 30]), new Set([glaucomaKey, bucketOfEye, drops]),
            new Map([[glaucomaKey, [timolol]], [bucketOfEye, [loose]], [drops, [xalatan]]]));
        expect(rows.map(r => r.id)).toEqual([
            `c${EYE.id}`, `s${glaucomaKey}`, `d${glaucomaKey}:501`, `s${bucketOfEye}`, `d${bucketOfEye}:503`,
            "c30", `s${drops}`, `d${drops}:502`,
        ]);
        expect(new Set(rows.map(r => r.id)).size).toBe(rows.length);
    });

    test("no category: no row", () => {
        expect(visibleRows([], new Set([1]), noBuckets, noDrugs)).toEqual([]);
    });
});

describe("drug tree: what a key does on a row @area:catalog", () => {
    const category: TreeRow = {kind: "category", id: "c17", level: 1, category: aTreeCategory()};
    const subCategory: TreeRow = {kind: "subCategory", id: "s17:138", level: 2, categoryId: 17, bucket: "17:138", subCategory: aTreeSubCategory()};
    const drug: TreeRow = {kind: "drug", id: "d17:138:1", level: 3, categoryId: 17, bucket: "17:138", drug: aDrug()};
    const rows = [category, subCategory, drug];
    const nodes = [category, subCategory];

    test.each([false, true])("↓ is \"next\" and ↑ \"previous\" on every row, open or closed (rtl: %s) @CAT-103", (rtl) => {
        for (const row of rows) for (const expanded of [false, true]) {
            expect(treeKeyAction("ArrowDown", row, expanded, rtl)).toBe("next");
            expect(treeKeyAction("ArrowUp", row, expanded, rtl)).toBe("previous");
        }
    });

    test("→ in English: opens a closed category or subcategory, moves into an open one @CAT-103", () => {
        for (const row of nodes) {
            expect(treeKeyAction("ArrowRight", row, false, false)).toBe("open");
            expect(treeKeyAction("ArrowRight", row, true, false)).toBe("firstChild");
        }
    });

    test("← in Arabic (mirrored): opens a closed node, moves into an open one @CAT-103", () => {
        for (const row of nodes) {
            expect(treeKeyAction("ArrowLeft", row, false, true)).toBe("open");
            expect(treeKeyAction("ArrowLeft", row, true, true)).toBe("firstChild");
        }
    });

    test("the opening arrow on a drug does nothing, in both directions @CAT-103", () => {
        for (const expanded of [false, true]) {
            expect(treeKeyAction("ArrowRight", drug, expanded, false)).toBeNull();
            expect(treeKeyAction("ArrowLeft", drug, expanded, true)).toBeNull();
        }
    });

    test.each([
        ["ArrowLeft", false],
        ["ArrowRight", true],
        ["Escape", false],
        ["Escape", true],
    ] as const)("%s (rtl: %s) closes an open category or subcategory @CAT-103 @UX-019", (key, rtl) => {
        for (const row of nodes) expect(treeKeyAction(key, row, true, rtl)).toBe("close");
    });

    test.each([
        ["ArrowLeft", false],
        ["ArrowRight", true],
        ["Escape", false],
        ["Escape", true],
    ] as const)("%s (rtl: %s) on a drug or a closed subcategory closes the parent @CAT-103 @UX-019", (key, rtl) => {
        expect(treeKeyAction(key, subCategory, false, rtl)).toBe("closeParent");
        expect(treeKeyAction(key, drug, false, rtl)).toBe("closeParent");
        expect(treeKeyAction(key, drug, true, rtl)).toBe("closeParent");
    });

    test.each([
        ["ArrowLeft", false],
        ["ArrowRight", true],
        ["Escape", false],
        ["Escape", true],
    ] as const)("%s (rtl: %s) on a closed category does nothing @CAT-103", (key, rtl) => {
        expect(treeKeyAction(key, category, false, rtl)).toBeNull();
    });

    test.each([false, true])("Enter activates every row, open or closed (rtl: %s) @CAT-103", (rtl) => {
        for (const row of rows) for (const expanded of [false, true]) expect(treeKeyAction("Enter", row, expanded, rtl)).toBe("activate");
    });

    test.each(["a", "Tab", "Home", "End", " ", "PageDown", "Backspace", "arrowdown", "Shift"])("%j: no action, the key goes through @CAT-103", (key) => {
        for (const row of rows) for (const expanded of [false, true]) for (const rtl of [false, true]) {
            expect(treeKeyAction(key, row, expanded, rtl)).toBeNull();
        }
    });
});

describe("drug tree: rows de-duplicated across pages @area:catalog", () => {
    test("a drug on two pages shows once, its first copy kept, in page order @CAT-122", () => {
        const a = aDrug({id: 1, name: "A"});
        const b = aDrug({id: 2, name: "B"});
        const c = aDrug({id: 3, name: "C"});
        const bAgain = {...b, name: "B (page 2 copy)"};
        expect(dedupeById([[a, b], [bAgain, c]])).toEqual([a, b, c]);
    });

    test("duplicates inside one page, and on later pages, are dropped too @CAT-122", () => {
        const a = aDrug({id: 1});
        const b = aDrug({id: 2});
        expect(dedupeById([[a, a, b], [b], [a, b]])).toEqual([a, b]);
    });

    test("no duplicates: every drug of every page, in order; no page: nothing @CAT-122", () => {
        const drugs = [1, 2, 3, 4].map(id => aDrug({id}));
        expect(dedupeById([drugs.slice(0, 2), [], drugs.slice(2)])).toEqual(drugs);
        expect(dedupeById([])).toEqual([]);
        expect(dedupeById([[]])).toEqual([]);
    });
});
