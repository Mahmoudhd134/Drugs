import type {Page, Request} from "@playwright/test";
import {expect, settled, signIn, test} from "../support/fixtures.ts";
import {unique} from "../support/phones.ts";
import {RxPage} from "../support/rx.ts";
import {EYE, grouped, ownDrugIn} from "../support/shared.ts";
import {typeSlowly} from "../support/catalog.ts";
import {RX_TEXTS} from "../support/texts-rx.ts";
import type {Lang} from "../support/texts.ts";
import {
    bucketPage,
    categoryIds,
    categoryName,
    categoryOf,
    sortedCategories,
    sortedSubCategories,
    subCategoryName,
    TREE_PAGE_SIZE,
    treeOf,
    treeTotal,
} from "../support/tree.ts";
import {recordRequests} from "../support/ui.ts";

/*
 * The drug tree of the prescription's «الأدوية» tab (design M1.7 D5, D7, D9; contract M1.7c § 3.3): categories with
 * counts in the UI language's order, subcategories from the same answer, auto-open, the source toggle, the requests.
 * Catalog counts are never literals (D12): the screen is compared with `GET /drugs/tree` for the same clinic, search and
 * source in the same run.
 */

/** The prescription page of a new clinic's owner, on its «الأدوية» tab, the tree loaded. */
const openTree = async (page: Page, lang: Lang, clinic: { owner: { phone: string } }) => {
    await signIn(page, clinic.owner.phone);
    const rx = new RxPage(page, RX_TEXTS[lang]);
    await rx.openDrugsTab();
    await rx.tree.settle();
    return rx;
};

/** The names shown by node labels («الاسم، العدد» → «الاسم»). */
const namesOf = (labels: string[], separator: string) => labels.map(label => label.slice(0, label.lastIndexOf(separator)));

test.describe("The drug tree: categories, subcategories, search @area:catalog", () => {
    test("the Drugs tab opens on the categories in the UI language with their counts, in that language's order, «أخرى» last; a click on one shows its subcategories @CAT-095 @smoke",
        async ({page, lang, data, healthy}) => {
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            const rx = await openTree(page, lang, clinic);
            const tt = rx.tree.tt;
            const answer = await treeOf(api);
            const expected = (await sortedCategories(page, answer, lang, false)).map(c => tt.node(categoryName(c, lang), c.count));
            await expect.poll(() => rx.tree.labels(rx.tree.rows(1)), {message: "the categories, in order"}).toEqual(expected);
            expect(expected.at(-1)).toBe(tt.node(categoryName(categoryOf(answer, "Other"), lang), categoryOf(answer, "Other").count));
            // Each row shows its name and its count (grouped digits); all closed
            const eye = categoryOf(answer, EYE.en);
            const row = rx.tree.category(EYE[lang]);
            await expect(row).toContainText(EYE[lang]);
            await expect(row).toContainText(grouped(eye.count));
            for (const state of await rx.tree.rows(1).evaluateAll(els => els.map(el => el.getAttribute("aria-expanded")))) expect(state).toBe("false");
            await expect(rx.tree.rows(2)).toHaveCount(0);
            await expect(rx.tree.total).toHaveText(tt.results(treeTotal(answer)));
            await healthy();
        });

    test("Arabic: the 23 categories in Intl.Collator(\"ar\") order, «أخرى» pinned last; English: \"Anesthesia & Hospital\" first, \"Women's Health\" then \"Other\" last @I18N-025",
        async ({page, lang, data}) => {
            const clinic = await data.clinic();
            const rx = await openTree(page, lang, clinic);
            const names = () => rx.tree.labels(rx.tree.rows(1)).then(labels => namesOf(labels, rx.tree.tt.nodeSeparator));
            if (lang === "ar") {
                await expect.poll(names).toEqual([
                    "الأمراض الجلدية", "الأنف والأذن والحنجرة والفم", "الأورام", "التخدير ومستلزمات المستشفيات", "التغذية والأطفال",
                    "الجهاز التنفسي والحساسية", "الجهاز الهضمي والكبد", "السكر والغدد الصماء", "الطب النفسي", "العظام والمفاصل",
                    "العناية بالبشرة والشعر", "العيون", "الفيتامينات والمكملات الغذائية", "القلب والأوعية الدموية",
                    "الكلى والمسالك البولية", "المخ والأعصاب", "المسكنات ومضادات الالتهاب", "المناعة واللقاحات", "أمراض الدم",
                    "صحة الرجل والصحة الجنسية", "صحة المرأة", "مضادات العدوى", "أخرى",
                ]);
            } else {
                await expect.poll(async () => {
                    const shown = await names();
                    return [shown[0], ...shown.slice(-2)];
                }).toEqual(["Anesthesia & Hospital", "Women's Health", "Other"]);
            }
        });

    test("a category opened shows all its subcategories at once, with counts, from the loaded answer (no request, no spinner); «غير مصنف» and «بدون تصنيف فرعي» last @CAT-096",
        async ({page, lang, data}) => {
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            // An own drug in «أخرى» without a subcategory: «أخرى» then has its subcategories, «غير مصنف» (pinned) and the bucket
            const other = await categoryIds(api, "Other");
            await ownDrugIn(data, clinic, {name: `No sub ${unique()}`, categoryId: other.categoryId, subCategoryId: null});
            const rx = await openTree(page, lang, clinic);
            const tt = rx.tree.tt;
            const answer = await treeOf(api);
            await rx.tree.expectShows(answer);
            const drugRequests = recordRequests(page, "GET", /^\/api\/v1\/drugs(\/tree)?$/);

            for (const nameEn of [EYE.en, "Other"]) {
                const category = categoryOf(answer, nameEn);
                const name = categoryName(category, lang);
                const row = rx.tree.category(name);
                await rx.tree.nameOf(row, name).click();
                await rx.tree.expectOpen(row);
                // At once: the subcategories are there without a spinner or a request
                await expect(rx.tree.loading.filter({visible: true})).toHaveCount(0);
                const expected = (await sortedSubCategories(page, category, tt, false)).map(s => tt.node(subCategoryName(s, tt), s.count));
                expect(await rx.tree.labels(rx.tree.rows(2, row)), `${nameEn}'s subcategories`).toEqual(expected);
                if (nameEn === "Other") {
                    const pinned = category.subCategories.find(s => s.pinnedLast)!;
                    expect(namesOf(expected.slice(-2), tt.nodeSeparator)).toEqual([subCategoryName(pinned, tt), tt.noSubCategory]);
                }
            }
            await settled(page);
            expect(drugRequests.map(r => r.url()), "no request when a category opens").toEqual([]);
        });

    test("\"amox\": «النتائج: N» and the categories by match count (ties by name), as the API's tree for \"amox\"; nothing opens by itself @CAT-074",
        async ({page, lang, data}) => {
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            const rx = await openTree(page, lang, clinic);
            const tt = rx.tree.tt;
            await rx.tree.search("amox");
            const answer = await treeOf(api, "amox");
            const expected = (await sortedCategories(page, answer, lang, true)).map(c => tt.node(categoryName(c, lang), c.count));
            await expect.poll(() => rx.tree.labels(rx.tree.rows(1)), {message: "the categories by count"}).toEqual(expected);
            await expect(rx.tree.total).toHaveText(tt.results(treeTotal(answer)));
            expect(answer.categories.flatMap(c => c.subCategories).length, "more than one subcategory").toBeGreaterThan(1);
            for (const state of await rx.tree.rows(1).evaluateAll(els => els.map(el => el.getAttribute("aria-expanded")))) expect(state).toBe("false");
            await expect(rx.tree.rows(2)).toHaveCount(0);
        });

    test("\"glaucoma\" and «المياه الزرقاء» (no drug name holds them): the one subcategory «العيون › المياه الزرقاء» opens by itself under the API's count, its first drugs listed @CAT-073",
        async ({page, lang, data}) => {
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            const rx = await openTree(page, lang, clinic);
            const tt = rx.tree.tt;
            for (const term of ["glaucoma", "المياه الزرقاء"]) {
                await rx.tree.search(term);
                const answer = await treeOf(api, term);
                expect(answer.categories.map(c => c.subCategories.length), `"${term}": one category, one subcategory`).toEqual([1]);
                const [category] = answer.categories;
                const [sub] = category.subCategories;
                const subName = subCategoryName(sub, tt);
                const categoryRow = rx.tree.category(categoryName(category, lang));
                await expect(categoryRow).toHaveAttribute("aria-label", tt.node(categoryName(category, lang), category.count));
                await rx.tree.expectOpen(categoryRow);
                const subRow = rx.tree.subCategory(categoryName(category, lang), subName);
                await expect(subRow).toHaveAttribute("aria-label", tt.node(subName, sub.count));
                await rx.tree.expectOpen(subRow);
                await expect(rx.tree.drugsIn(subRow)).toHaveCount(Math.min(TREE_PAGE_SIZE, sub.count));
                await expect(rx.tree.total).toHaveText(tt.results(sub.count));
            }
        });

    test("«قطرة» in clinic B (no own drug; no shared Arabic name holds it): «لا توجد أدوية مطابقة للبحث.» instead of the tree @CAT-073",
        async ({page, lang, data, healthy}) => {
            const clinicB = await data.clinic();
            const rx = await openTree(page, lang, clinicB);
            const answer = await treeOf(await data.ownerApi(clinicB), "قطرة");
            expect(answer.categories).toEqual([]);
            await rx.tree.search("قطرة");
            await expect(rx.catalog.getByText(rx.tree.tt.noResults, {exact: true})).toBeVisible();
            await expect(rx.tree.rows(1)).toHaveCount(0);
            await expect(rx.tree.total).toHaveCount(0);
            await healthy();
        });

    test("\"amoxicillin\": «مضادات العدوى › البنسلينات» opens by itself with its first 30 drugs, under the API's count for that search @CAT-099",
        async ({page, lang, data}) => {
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            const rx = await openTree(page, lang, clinic);
            const tt = rx.tree.tt;
            await rx.tree.search("amoxicillin");
            const answer = await treeOf(api, "amoxicillin");
            const category = categoryOf(answer, "Anti-infectives");
            const sub = category.subCategories.find(s => s.nameEn === "Penicillins")!;
            expect(answer.categories.flatMap(c => c.subCategories), "the whole answer: that one subcategory").toEqual([sub]);
            if (lang === "ar") expect([category.nameAr, sub.nameAr]).toEqual(["مضادات العدوى", "البنسلينات"]);
            const categoryRow = rx.tree.category(categoryName(category, lang));
            await rx.tree.expectOpen(categoryRow);
            const subRow = rx.tree.subCategory(categoryName(category, lang), subCategoryName(sub, tt));
            await rx.tree.expectOpen(subRow);
            await expect(subRow).toHaveAttribute("aria-label", tt.node(subCategoryName(sub, tt), sub.count));
            await expect(rx.tree.drugsIn(subRow)).toHaveCount(Math.min(TREE_PAGE_SIZE, sub.count));
        });

    test("the source toggle on «أدوية العيادة»: only the categories with own drugs (as the API's own tree); back on «الكل»: the full tree again @CAT-115",
        async ({page, lang, data}) => {
            const clinic = await data.clinic();
            const api = await data.ownerApi(clinic);
            // Own drugs: the template's two in «العيون», one of the test's in «أخرى»
            const other = await categoryIds(api, "Other");
            await ownDrugIn(data, clinic, {name: `Own other ${unique()}`, categoryId: other.categoryId, subCategoryId: other.category.subCategories[0].id});
            const rx = await openTree(page, lang, clinic);
            const tt = rx.tree.tt;
            const all = await treeOf(api);
            const own = await treeOf(api, "", "own");
            await expect(rx.tree.sourceButton("all")).toHaveAttribute("aria-pressed", "true");
            await rx.tree.expectShows(all);

            await rx.tree.setSource("own");
            const ownLabels = (await sortedCategories(page, own, lang, false)).map(c => tt.node(categoryName(c, lang), c.count));
            expect(ownLabels.length).toBeLessThan(all.categories.length);
            await expect.poll(() => rx.tree.labels(rx.tree.rows(1))).toEqual(ownLabels);
            await expect(rx.tree.total).toHaveText(tt.results(treeTotal(own)));

            await rx.tree.setSource("all");
            const allLabels = (await sortedCategories(page, all, lang, false)).map(c => tt.node(categoryName(c, lang), c.count));
            await expect.poll(() => rx.tree.labels(rx.tree.rows(1))).toEqual(allLabels);
            await expect(rx.tree.total).toHaveText(tt.results(treeTotal(all)));
        });

    test("opening the prescription page: one tree request and the protocols' (nothing per category); \"amoxicillin\" typed: one tree request after the debounce and one page of the subcategory that opens @CAT-127",
        async ({page, lang, data}) => {
            const clinic = await data.clinic();
            const seen: Request[] = [];
            page.on("request", request => {
                if (request.method() === "GET" && /^\/api\/v1\/(drugs|drugs\/tree|protocols)$/.test(new URL(request.url()).pathname)) seen.push(request);
            });
            const of = (path: string) => seen.filter(r => new URL(r.url()).pathname === path);
            await signIn(page, clinic.owner.phone);
            const rx = new RxPage(page, RX_TEXTS[lang]);
            await rx.openDrugsTab();
            await rx.tree.settle();
            await settled(page);
            expect(of("/api/v1/drugs/tree").map(r => r.url()), "one tree request").toHaveLength(1);
            expect(of("/api/v1/drugs").map(r => r.url()), "no drug list request").toEqual([]);
            expect(of("/api/v1/protocols").map(r => r.url()), "the protocols' request").toHaveLength(1);
            seen.length = 0;

            const answer = await treeOf(await data.ownerApi(clinic), "amoxicillin");
            const [category] = answer.categories;
            const sub = category.subCategories[0];
            await typeSlowly(rx.tree.searchBox, "amoxicillin");
            await rx.tree.expectOpen(rx.tree.subCategory(categoryName(category, lang), subCategoryName(sub, rx.tree.tt)));
            await rx.tree.settle();
            await settled(page);
            expect(of("/api/v1/drugs/tree").map(r => new URL(r.url()).searchParams.get("search")), "one tree request, for the whole term").toEqual(["amoxicillin"]);
            expect(of("/api/v1/drugs").map(r => bucketPage(r.url(), category.id, sub.id)), "one page of the opened subcategory").toEqual([1]);
            expect(new URL(of("/api/v1/drugs")[0].url()).searchParams.get("search"), "the page of the same search").toBe("amoxicillin");
        });
});
