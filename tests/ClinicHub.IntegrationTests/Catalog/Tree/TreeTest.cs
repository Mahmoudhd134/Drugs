using System.Text.Json;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Catalog.Drugs.Queries.GetDrugTree;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Catalog.Tree;

/// <summary>
/// The tree tests' helpers (M1.7c contract § 1.1; design M1.7 D7, D8): <c>GET /drugs/tree?search=&amp;source=</c>, its
/// shape rules (only rows with a count, categories and their subcategories by id, the «بدون تصنيف فرعي» bucket last with
/// null names, a category's count = the sum of its rows) and the list totals it must agree with.
/// </summary>
public abstract class TreeTest(AppFixture app) : CatalogTest(app)
{
    protected const string TreeUrl = "/api/v1/drugs/tree";

    /// <summary>The tree's URL; a null or empty search or source is left out.</summary>
    protected static string TreeOf(string search = null, string source = null)
    {
        var query = new List<string>();
        if (!string.IsNullOrEmpty(search))
            query.Add($"search={Uri.EscapeDataString(search)}");
        if (!string.IsNullOrEmpty(source))
            query.Add($"source={source}");
        return query.Count == 0 ? TreeUrl : $"{TreeUrl}?{string.Join('&', query)}";
    }

    /// <summary>GET /drugs/tree, asserting 200 and the answer's shape (<see cref="ShouldBeWellFormed"/>).</summary>
    protected static async Task<DrugTreeDto> TreeAsync(ApiClient client, string search = null, string source = null)
    {
        var response = await client.GetAsync(TreeOf(search, source));
        await response.ShouldBeOkAsync();
        var tree = await response.ReadAsync<DrugTreeDto>();
        ShouldBeWellFormed(tree, $"search «{search}», source «{source}»");
        return tree;
    }

    /// <summary>
    /// The answer rules of the contract (§ 1.1): every listed row has a count above 0 (without a search too: CAT-084), a
    /// category's count is the sum of its rows, categories by id, their subcategories by id with the bucket (id null,
    /// names null, <c>pinnedLast</c> false) last and at most once.
    /// </summary>
    protected static void ShouldBeWellFormed(DrugTreeDto tree, string what)
    {
        tree.ShouldNotBeNull(what);
        tree.Categories.ShouldNotBeNull(what);
        tree.Categories.Select(c => c.Id).ShouldBe(tree.Categories.Select(c => c.Id).Order(), $"{what}: categories by id");
        foreach (var category in tree.Categories)
        {
            var at = $"{what}, category {category.Id}";
            category.Count.ShouldBeGreaterThan(0, at);
            category.SubCategories.ShouldNotBeEmpty(at);
            category.Count.ShouldBe(category.SubCategories.Sum(s => s.Count), $"{at}: the sum of its rows");
            category.SubCategories.ShouldAllBe(s => s.Count > 0, at);
            var withId = category.SubCategories.Where(s => s.Id != null).Select(s => s.Id!.Value).ToList();
            withId.ShouldBe(withId.Order().ToList(),$"{at}: subcategories by id");
            withId.Distinct().Count().ShouldBe(withId.Count, at);
            var buckets = category.SubCategories.Where(s => s.Id == null).ToList();
            buckets.Count.ShouldBeLessThanOrEqualTo(1, $"{at}: one «بدون تصنيف فرعي» bucket at most");
            if (buckets.Count == 1)
            {
                category.SubCategories[^1].Id.ShouldBeNull($"{at}: the bucket comes last");
                (buckets[0].NameEn, buckets[0].NameAr, buckets[0].PinnedLast).ShouldBe(((string)null, (string)null, false),$"{at}: the bucket");
            }
        }
    }

    /// <summary>The sum of the category counts («النتائج: N»).</summary>
    protected static int Total(DrugTreeDto tree) => tree.Categories.Sum(c => c.Count);

    /// <summary>The category with this id (fails when it is not in the tree).</summary>
    protected static DrugTreeCategoryDto CategoryOf(DrugTreeDto tree, int id) =>
        tree.Categories.Where(c => c.Id == id).ShouldHaveSingleItem($"category {id} in the tree");

    /// <summary>The row of this subcategory (null = the bucket) in the category (fails when it is not there).</summary>
    protected static DrugTreeSubCategoryDto RowOf(DrugTreeDto tree, int categoryId, int? subCategoryId) =>
        CategoryOf(tree, categoryId).SubCategories.Where(s => s.Id == subCategoryId)
            .ShouldHaveSingleItem($"subcategory {subCategoryId?.ToString() ?? "bucket"} of category {categoryId} in the tree");

    /// <summary>Whether the tree lists this subcategory (null = the bucket) of the category.</summary>
    protected static bool Lists(DrugTreeDto tree, int categoryId, int? subCategoryId) =>
        tree.Categories.Any(c => c.Id == categoryId && c.SubCategories.Any(s => s.Id == subCategoryId));

    /// <summary>The <c>GET /drugs</c> query of a tree row: the same search and source plus its category filters.</summary>
    protected static string ListQuery(string search, string source, int? categoryId = null, int? subCategoryId = null,
        bool bucket = false)
    {
        var query = new List<string>();
        if (!string.IsNullOrEmpty(search))
            query.Add($"search={Uri.EscapeDataString(search)}");
        if (!string.IsNullOrEmpty(source))
            query.Add($"source={source}");
        if (categoryId is { } category)
            query.Add($"categoryId={category}");
        if (bucket)
            query.Add("subCategoryId=none");
        else if (subCategoryId is { } sub)
            query.Add($"subCategoryId={sub}");
        return string.Join('&', query);
    }

    /// <summary><c>GET /drugs</c>'s <c>totalCount</c> for the query (one item asked).</summary>
    protected static async Task<int> ListTotalAsync(ApiClient client, string query) =>
        (await ListDrugsAsync(client, query == "" ? "pageSize=1" : $"{query}&pageSize=1")).TotalCount;

    /// <summary>The <c>GET /drugs</c> total of one tree row (same search and source, its category and subcategory or <c>none</c>).</summary>
    protected static Task<int> RowTotalAsync(ApiClient client, string search, string source, int categoryId, int? subCategoryId) =>
        ListTotalAsync(client, ListQuery(search, source, categoryId, subCategoryId, bucket: subCategoryId is null));

    /// <summary>Every page of the query, <paramref name="pageSize"/> per page (the tree's 30 by default), in order.</summary>
    protected static async Task<List<List<DrugDto>>> PagesAsync(ApiClient client, string query, int pageSize = 30)
    {
        var pages = new List<List<DrugDto>>();
        var seen = 0;
        for (var page = 1; ; page++)
        {
            var result = await ListDrugsAsync(client, $"{query}&pageSize={pageSize}&page={page}");
            if (result.Items.Count == 0)
                return pages;
            pages.Add(result.Items);
            seen += result.Items.Count;
            if (seen >= result.TotalCount || page > 10_000)
                return pages;
        }
    }

    /// <summary>The tree as JSON (to compare two answers whole).</summary>
    protected static string JsonOf(DrugTreeDto tree) => JsonSerializer.Serialize(tree, Harness.Assertions.Json.Options);
}
