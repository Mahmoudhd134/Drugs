using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Tree;

/// <summary>
/// <c>GET /drugs/tree</c> on the imported catalog (design M1.7 D5, D7, D8, § 6, § 8; M1.7c contract § 1.1): counts per
/// category and subcategory through the drug list's own composition, so every count equals the list's
/// <c>totalCount</c> for the same search and source; only rows with matches; the clinic's own drugs counted in its tree
/// only. The catalog's numbers are asserted here, at the api level (D12). No test of this class writes the shared
/// catalog: own drugs, and test subcategories holding only own drugs, are per clinic and leave the shared counts as
/// imported.
/// </summary>
[Collection(CatalogTreeCollection.Name)]
[Trait("Area", "catalog")]
public class DrugTreeTests(AppFixture app) : TreeTest(app)
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-081")]
    public async Task Every_category_count_is_the_sum_of_its_rows_and_the_tree_total_is_the_lists_total_for_each_search_and_source()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).Named(Unique.Name("Zq amox own", "خاص"));
        await Data.Drug(clinic).InCategory(CategoryIds.Eye);
        await Data.Drug(clinic).InCategory(CategoryIds.Other);

        foreach (var (search, source) in new[] { ("", ""), ("amox", ""), ("a", ""), ("", "own"), ("", "shared") })
        {
            var what = $"search «{search}», source «{source}»";
            var tree = await TreeAsync(owner, search, source);

            Total(tree).ShouldBe(await ListTotalAsync(owner, ListQuery(search, source)), what);
            if (search == "amox" || source == "own")
                foreach (var category in tree.Categories)
                foreach (var row in category.SubCategories)
                    row.Count.ShouldBe(await RowTotalAsync(owner, search, source, category.Id, row.Id),
                        $"{what}: category {category.Id}, subcategory {row.Id?.ToString() ?? "none"}");
        }

        var full = await TreeAsync(owner);
        full.Categories.Count.ShouldBe(TestRun.Baseline.MaxCategoryId, "all the imported categories");
        full.Categories.Count.ShouldBe(23);
        full.Categories.Sum(c => c.SubCategories.Count(s => s.Id != null)).ShouldBe(182, "every imported subcategory holds active drugs");
        full.Categories.Where(c => c.SubCategories.Any(s => s.Id == null)).Select(c => c.Id)
            .ShouldBe([CategoryIds.Eye, CategoryIds.Other], ignoreOrder: true, "A's own buckets");
        Total(full).ShouldBe(BaselineSharedCount + 3);
        var shared = await TreeAsync(owner, source: "shared");
        Total(shared).ShouldBe(BaselineSharedCount);
        shared.Categories.ShouldAllBe(c => c.SubCategories.All(s => s.Id != null), "no imported drug lacks a subcategory");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-082")]
    public async Task Amoxicillin_gives_one_category_with_one_subcategory_holding_its_203_shared_drugs_and_the_own_match()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var antiInfectives = await CategoryIdAsync(owner, ImportedDrugs.AntiInfectivesAr);
        var penicillins = await SubCategoryIdAsync(owner, ImportedDrugs.AntiInfectivesAr, ImportedDrugs.PenicillinsAr);
        await Data.Drug(clinic).Named(Unique.Name("Zq capsules", "كبسول")).WithIngredients("AMOXICILLIN")
            .InCategory(antiInfectives, penicillins);

        var tree = await TreeAsync(owner, "amoxicillin");
        var shared = await TreeAsync(owner, "amoxicillin", "shared");

        var category = tree.Categories.ShouldHaveSingleItem();
        (category.Id, category.NameAr, category.Count).ShouldBe((antiInfectives, ImportedDrugs.AntiInfectivesAr, 204));
        var row = category.SubCategories.ShouldHaveSingleItem();
        (row.Id, row.NameAr, row.Count).ShouldBe((penicillins, ImportedDrugs.PenicillinsAr, 204));
        var sharedRow = shared.Categories.ShouldHaveSingleItem().SubCategories.ShouldHaveSingleItem();
        (sharedRow.Id, sharedRow.Count).ShouldBe((penicillins, 203));
    }

    [Fact]
    [Trait("Case", "CAT-083")]
    public async Task A_search_with_no_match_answers_an_empty_list_of_categories()
    {
        var owner = await OwnerAsync();

        var response = await owner.GetAsync(TreeOf($"zzqx{Unique.Next()}"));

        await response.ShouldBeOkAsync();
        var body = (await response.ReadNodeAsync()).AsObject();
        body.Select(p => p.Key).ShouldBe(["categories"]);
        body["categories"]!.AsArray().ShouldBeEmpty();
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-085")]
    public async Task An_own_drug_without_a_subcategory_makes_a_bucket_with_null_names_in_its_clinics_tree_only()
    {
        var (clinicA, ownerA) = await EmptyClinicAsync();
        var (_, ownerB) = await EmptyClinicAsync();
        await Data.Drug(clinicA).InCategory(CategoryIds.Eye);

        var response = await ownerA.GetAsync(TreeUrl);
        var treeB = await TreeAsync(ownerB);

        await response.ShouldBeOkAsync();
        var eye = (await response.ReadNodeAsync())["categories"]!.AsArray()
            .Single(c => c!["id"]!.GetValue<int>() == CategoryIds.Eye)!;
        var bucket = eye["subCategories"]!.AsArray()[^1]!;
        bucket.ShouldHaveNull("id").ShouldHaveNull("nameEn").ShouldHaveNull("nameAr");
        bucket["pinnedLast"]!.GetValue<bool>().ShouldBeFalse();
        bucket["count"]!.GetValue<int>().ShouldBe(1);
        Lists(treeB, CategoryIds.Eye, null).ShouldBeFalse("B has no own drug without a subcategory");
    }

    [Fact]
    [Trait("Case", "CAT-086")]
    public async Task Source_own_lists_only_the_categories_of_the_clinics_own_drugs_and_shared_ignores_them()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var (_, other) = await EmptyClinicAsync();
        await Data.Drug(clinic);
        await Data.Drug(clinic).InCategory(CategoryIds.Other);

        var own = await TreeAsync(owner, source: "own");
        var shared = await TreeAsync(owner, source: "shared");
        var all = await TreeAsync(owner);

        own.Categories.Select(c => c.Id).ShouldBe([CategoryIds.Eye, CategoryIds.Other]);
        CategoryOf(own, CategoryIds.Eye).SubCategories.Select(s => (s.Id, s.Count)).ShouldBe([((int?)SubCategoryIds.Glaucoma, 1)]);
        CategoryOf(own, CategoryIds.Other).SubCategories.Select(s => (s.Id, s.Count)).ShouldBe([((int?)null, 1)]);
        JsonOf(shared).ShouldBe(JsonOf(await TreeAsync(other, source: "shared")), "the same shared counts in every clinic");
        CategoryOf(shared, CategoryIds.Eye).Count.ShouldBe(541);
        RowOf(shared, CategoryIds.Eye, SubCategoryIds.Glaucoma).Count.ShouldBe(91);
        Lists(shared, CategoryIds.Other, null).ShouldBeFalse("the own drug without a subcategory isn't counted in source=shared");
        CategoryOf(all, CategoryIds.Eye).Count.ShouldBe(542);
        RowOf(all, CategoryIds.Eye, SubCategoryIds.Glaucoma).Count.ShouldBe(92);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-089")]
    public async Task Paging_a_rows_drugs_to_the_end_gives_exactly_its_count_without_duplicates_or_gaps()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic).InCategory(CategoryIds.Eye);
        await Data.Drug(clinic).InCategory(CategoryIds.Eye);
        var full = await TreeAsync(owner);
        var amox = await TreeAsync(owner, "amox");
        var largest = full.Categories.SelectMany(c => c.SubCategories.Where(s => s.Id != null).Select(s => (Category: c.Id, Row: s)))
            .MaxBy(x => x.Row.Count);
        var antiInfectives = await CategoryIdAsync(owner, ImportedDrugs.AntiInfectivesAr);
        var penicillins = await SubCategoryIdAsync(owner, ImportedDrugs.AntiInfectivesAr, ImportedDrugs.PenicillinsAr);

        var rows = new (string Search, int Category, int? Sub, int Count)[]
        {
            ("", CategoryIds.Eye, SubCategoryIds.Glaucoma, RowOf(full, CategoryIds.Eye, SubCategoryIds.Glaucoma).Count),
            ("", CategoryIds.Eye, null, RowOf(full, CategoryIds.Eye, null).Count),
            ("", largest.Category, largest.Row.Id, largest.Row.Count),
            ("amox", antiInfectives, penicillins, RowOf(amox, antiInfectives, penicillins).Count),
        };
        rows[0].Count.ShouldBe(91);
        rows[1].Count.ShouldBe(2);
        rows[2].Count.ShouldBeGreaterThan(1_000, "the largest subcategory (Multivitamins) spans many pages");
        rows[3].Count.ShouldBe(203);
        foreach (var (search, category, sub, count) in rows)
        {
            var what = $"search «{search}», category {category}, subcategory {sub?.ToString() ?? "none"}";
            var pages = await PagesAsync(owner, ListQuery(search, "", category, sub, bucket: sub is null));
            var ids = pages.SelectMany(p => p.Select(d => d.Id)).ToList();

            ids.Count.ShouldBe(count, what);
            ids.Distinct().Count().ShouldBe(count, $"{what}: a drug on two pages");
            pages.SkipLast(1).ShouldAllBe(p => p.Count == 30, $"{what}: a short page before the last one");
            pages.SelectMany(p => p).ShouldAllBe(d => d.Category.Id == category && (d.SubCategory == null ? sub == null : d.SubCategory.Id == sub), what);
        }
    }

    [Fact]
    [Trait("Case", "CAT-090")]
    public async Task An_own_drug_added_after_the_tree_loaded_is_paged_at_once_and_counted_at_the_next_tree_load()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var before = RowOf(await TreeAsync(owner), CategoryIds.Eye, SubCategoryIds.Glaucoma).Count;

        var added = await Data.Drug(clinic);

        var pages = await PagesAsync(owner, ListQuery("", "", CategoryIds.Eye, SubCategoryIds.Glaucoma));
        pages.Sum(p => p.Count).ShouldBe(before + 1);
        pages[0][0].Id.ShouldBe(added.Id, "own drugs first");
        RowOf(await TreeAsync(owner), CategoryIds.Eye, SubCategoryIds.Glaucoma).Count.ShouldBe(before + 1, "the next tree load");
    }

    [Theory]
    [Trait("Case", "CAT-091")]
    [InlineData("Own")]
    [InlineData("bogus")]
    [InlineData("Shared")]
    [InlineData("ALL")]
    [InlineData("1")]
    [InlineData("%00")]
    [InlineData("own%20")]
    public async Task A_source_other_than_the_exact_lower_case_values_is_400_invalidRequest_on_source(string source)
    {
        var owner = await OwnerAsync();

        var problem = await (await owner.GetAsync($"{TreeUrl}?source={source}")).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidRequest");

        problem.ShouldHaveError("source", "invalidRequest");
    }

    [Fact]
    [Trait("Case", "CAT-092")]
    public async Task Only_Other_and_Unclassified_are_pinned_last_by_id_and_a_subcategory_with_the_same_name_elsewhere_is_not()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var lookalike = await Data.SubCategory(CategoryIds.Eye).Named("Unclassified", "غير مصنف");
        await Data.Drug(clinic).InCategory(CategoryIds.Eye, lookalike.Id);

        var tree = await TreeAsync(owner);
        var categories = await CategoriesAsync(owner);

        tree.Categories.Where(c => c.PinnedLast).Select(c => c.Id).ShouldBe([CategoryIds.Other]);
        tree.Categories.SelectMany(c => c.SubCategories).Where(s => s.PinnedLast).Select(s => s.Id)
            .ShouldBe([(int?)SubCategoryIds.Unclassified]);
        RowOf(tree, CategoryIds.Eye, lookalike.Id).PinnedLast.ShouldBeFalse("pinned by id, not by name");
        categories.Where(c => c.PinnedLast).Select(c => c.Id).ShouldBe([CategoryIds.Other]);
        categories.SelectMany(c => c.SubCategories).Where(s => s.PinnedLast).Select(s => s.Id).ShouldBe([SubCategoryIds.Unclassified]);
        categories.Single(c => c.Id == CategoryIds.Eye).SubCategories.Single(s => s.Id == lookalike.Id).PinnedLast.ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "CAT-072")]
    public async Task A_single_letter_and_an_alef_answer_200_with_all_23_categories_and_the_baseline_counts()
    {
        var (_, owner) = await EmptyClinicAsync();

        var latin = await TreeAsync(owner, "a", "shared");
        var alef = await TreeAsync(owner, "ا", "shared");
        var latinAll = await TreeAsync(owner, "a");

        latin.Categories.Count.ShouldBe(23);
        Total(latin).ShouldBe(23_410);
        alef.Categories.Count.ShouldBe(23);
        Total(alef).ShouldBe(BaselineSharedCount);
        Total(alef).ShouldBe(23_414);
        JsonOf(latinAll).ShouldBe(JsonOf(latin), "a clinic without own drugs: source=all is the shared tree");
    }

    [Fact]
    [Trait("Case", "CAT-073")]
    public async Task Glaucoma_in_either_language_gives_the_one_Eye_Glaucoma_row_of_91_shared_drugs_and_the_own_ones_there()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        var (_, ownerB) = await EmptyClinicAsync();
        await Data.Drug(clinic);

        foreach (var search in new[] { "glaucoma", ImportedDrugs.GlaucomaAr })
        {
            var tree = await TreeAsync(owner, search);
            var shared = await TreeAsync(owner, search, "shared");

            var category = tree.Categories.ShouldHaveSingleItem(search);
            (category.Id, category.NameAr, category.Count).ShouldBe((CategoryIds.Eye, ImportedDrugs.EyeAr, 92), search);
            var row = category.SubCategories.ShouldHaveSingleItem(search);
            (row.Id, row.NameAr, row.Count).ShouldBe(((int?)SubCategoryIds.Glaucoma, ImportedDrugs.GlaucomaAr, 92), search);
            shared.Categories.ShouldHaveSingleItem(search).SubCategories.ShouldHaveSingleItem(search).Count.ShouldBe(91, search);
        }
        (await TreeAsync(ownerB, "قطرة")).Categories.ShouldBeEmpty("«قطرة» in B: no own drug, no shared Arabic name holds it");
    }

    [Fact]
    [Trait("Case", "CAT-074")]
    public async Task Amox_gives_219_drugs_in_6_categories_with_their_counts_and_the_subcategory_counts()
    {
        var (_, owner) = await EmptyClinicAsync();

        var tree = await TreeAsync(owner, "amox");

        Total(tree).ShouldBe(219);
        tree.Categories.ToDictionary(c => c.NameAr, c => c.Count).ShouldBe(new Dictionary<string, int>
        {
            [ImportedDrugs.AntiInfectivesAr] = 207, ["الأورام"] = 5, ["الأمراض الجلدية"] = 4,
            ["التخدير ومستلزمات المستشفيات"] = 1, [ImportedDrugs.EyeAr] = 1, ["الفيتامينات والمكملات الغذائية"] = 1,
        }, ignoreOrder: true);
        tree.Categories.Single(c => c.NameAr == ImportedDrugs.AntiInfectivesAr).SubCategories.ToDictionary(s => s.NameAr, s => s.Count)
            .ShouldBe(new Dictionary<string, int>
            {
                [ImportedDrugs.PenicillinsAr] = 203, ["الكينولونات"] = 2, ["طاردات الديدان"] = 1, ["مضادات الدرن"] = 1,
            }, ignoreOrder: true);
        tree.Categories.Sum(c => c.SubCategories.Count).ShouldBeGreaterThan(1, "more than one row: nothing auto-opens");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-055")]
    public async Task The_trees_count_for_Eye_is_the_lists_total_for_categoryId_Eye_541_shared_and_the_own_ones()
    {
        var (clinic, owner) = await EmptyClinicAsync();
        await Data.Drug(clinic);
        await Data.Drug(clinic).InCategory(CategoryIds.Eye);
        await Data.Drug(clinic).InCategory(CategoryIds.Other);

        var eye = CategoryOf(await TreeAsync(owner), CategoryIds.Eye);

        eye.Count.ShouldBe(541 + 2);
        eye.Count.ShouldBe((await ListDrugsAsync(owner, $"categoryId={CategoryIds.Eye}")).TotalCount);
        CategoryOf(await TreeAsync(owner, source: "shared"), CategoryIds.Eye).Count.ShouldBe(541);
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "CAT-009")]
    public async Task Two_clinics_trees_hold_the_same_shared_counts_and_never_count_each_others_own_drugs()
    {
        var (a, ownerA) = await EmptyClinicAsync();
        var (b, ownerB) = await EmptyClinicAsync();
        var aDrug = await Data.Drug(a).Named(Unique.Name("Zqa own drug", "خاص أ"));
        var bDrug = await Data.Drug(b).Named(Unique.Name("Zqb own drug", "خاص ب")).InCategory(CategoryIds.Other);

        var sharedA = await TreeAsync(ownerA, source: "shared");
        var sharedB = await TreeAsync(ownerB, source: "shared");
        JsonOf(sharedA).ShouldBe(JsonOf(sharedB));

        var allA = await TreeAsync(ownerA);
        var allB = await TreeAsync(ownerB);
        Total(allA).ShouldBe(Total(sharedA) + 1);
        Total(allB).ShouldBe(Total(sharedB) + 1);
        RowOf(allA, CategoryIds.Eye, SubCategoryIds.Glaucoma).Count.ShouldBe(RowOf(sharedA, CategoryIds.Eye, SubCategoryIds.Glaucoma).Count + 1);
        RowOf(allB, CategoryIds.Eye, SubCategoryIds.Glaucoma).Count.ShouldBe(RowOf(sharedB, CategoryIds.Eye, SubCategoryIds.Glaucoma).Count);
        Lists(allA, CategoryIds.Other, null).ShouldBeFalse("B's own drug in A's tree");
        RowOf(allB, CategoryIds.Other, null).Count.ShouldBe(1);

        var ownA = await TreeAsync(ownerA, source: "own");
        var ownB = await TreeAsync(ownerB, source: "own");
        ownA.Categories.Select(c => (c.Id, c.Count)).ShouldBe([(CategoryIds.Eye, 1)]);
        ownB.Categories.Select(c => (c.Id, c.Count)).ShouldBe([(CategoryIds.Other, 1)]);

        foreach (var source in new[] { "", "shared", "own" })
        {
            (await TreeAsync(ownerA, bDrug.Name, source)).Categories.ShouldBeEmpty($"A searching B's own drug, source «{source}»");
            (await TreeAsync(ownerB, aDrug.Name, source)).Categories.ShouldBeEmpty($"B searching A's own drug, source «{source}»");
        }
        Total(await TreeAsync(ownerA, aDrug.Name)).ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "CAT-048")]
    public async Task Without_drugs_list_the_tree_is_403_forbidden()
    {
        var clinic = await SharedClinicAsync();
        var withoutDrugs = await Login.WithPermissionsAsync(clinic, Permissions.Protocols.List);
        var withDrugs = await Login.WithPermissionsAsync(clinic, Permissions.Drugs.List);

        await (await withoutDrugs.GetAsync(TreeUrl)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await withoutDrugs.GetAsync(TreeOf("amox", "own"))).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");

        await (await withDrugs.GetAsync(TreeUrl)).ShouldBeOkAsync();
    }
}
