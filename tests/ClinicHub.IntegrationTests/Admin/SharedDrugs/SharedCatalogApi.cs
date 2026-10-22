using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Platform.DrugCategories;
using ClinicHub.Application.Features.Platform.SharedDrugs;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin.SharedDrugs;

/// <summary>The shared catalog's routes (design M1.7 D8; M1.7b contract § 2.7).</summary>
public static class SharedCatalogRoutes
{
    public const string AdminDrugs = "/api/v1/admin/drugs";
    public const string AdminCategories = "/api/v1/admin/drug-categories";
    public const string ClinicDrugs = "/api/v1/drugs";
    public const string ClinicCategories = "/api/v1/drug-categories";
    public const string ProtocolsUrl = "/api/v1/protocols";

    public static string AdminDrug(int id) => $"{AdminDrugs}/{id}";
    public static string Withdraw(int id) => $"{AdminDrugs}/{id}/withdraw";
    public static string Restore(int id) => $"{AdminDrugs}/{id}/restore";
    public static string AdminCategory(int id) => $"{AdminCategories}/{id}";
    public static string SubCategories(int categoryId) => $"{AdminCategories}/{categoryId}/subcategories";
    public static string AdminSubCategory(int id) => $"/api/v1/admin/drug-subcategories/{id}";
    public static string ClinicDrug(int id) => $"{ClinicDrugs}/{id}";
    public static string Protocol(int id) => $"{ProtocolsUrl}/{id}";

    /// <summary>An id no row has (ids are positive and grow from 1 inside a run).</summary>
    public const int UnknownId = int.MaxValue;
}

/// <summary>Calls of the shared catalog's API (each <c>…Async</c> reader asserts its success status).</summary>
public static class SharedCatalogApi
{
    /// <summary>The body of <c>POST/PUT /admin/drugs</c> (<c>SaveSharedDrugRequest</c>).</summary>
    public static object SharedDrugBody(string name, string activeIngredients = null, string description = null,
        int? categoryId = CategoryIds.Eye, int? subCategoryId = SubCategoryIds.Glaucoma) =>
        new { name, activeIngredients, description, categoryId, subCategoryId };

    /// <summary>The body of <c>POST/PUT /drugs</c> (<c>SaveDrugRequest</c>, an own drug).</summary>
    public static object OwnDrugBody(string name, string activeIngredients = null, string description = null,
        object defaultDosing = null, int? categoryId = CategoryIds.Eye, int? subCategoryId = SubCategoryIds.Glaucoma) =>
        new { name, activeIngredients, description, defaultDosing, categoryId, subCategoryId };

    public static object CategoryBody(string nameEn, string nameAr) => new { nameEn, nameAr };

    public static object Item(int drugId, object dosing = null) => new { drugId, dosing };

    public static object ProtocolBody(string name, params object[] items) => new { name, items };

    /// <summary>POST /admin/drugs, asserting 201.</summary>
    public static async Task<AdminDrugDto> CreateSharedDrugAsync(this ApiClient admin, object body)
    {
        var response = await admin.PostAsync(SharedCatalogRoutes.AdminDrugs, body);
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return await response.ReadAsync<AdminDrugDto>();
    }

    /// <summary>GET /admin/drugs/{id}, asserting 200.</summary>
    public static async Task<AdminDrugDto> AdminDrugAsync(this ApiClient admin, int id)
    {
        var response = await admin.GetAsync(SharedCatalogRoutes.AdminDrug(id));
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<AdminDrugDto>();
    }

    /// <summary>GET /admin/drugs?{query}, asserting 200.</summary>
    public static async Task<PagedResult<AdminDrugDto>> AdminDrugsAsync(this ApiClient admin, string query = "")
    {
        var response = await admin.GetAsync(query == "" ? SharedCatalogRoutes.AdminDrugs : $"{SharedCatalogRoutes.AdminDrugs}?{query}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<AdminDrugDto>>();
    }

    /// <summary>The admin list for <paramref name="search"/> (URL-encoded here) plus <paramref name="more"/>, one page of 100.</summary>
    public static Task<PagedResult<AdminDrugDto>> SearchAdminDrugsAsync(this ApiClient admin, string search, string more = "") =>
        admin.AdminDrugsAsync($"search={Uri.EscapeDataString(search)}&pageSize=100{more}");

    /// <summary>GET /admin/drug-categories, asserting 200.</summary>
    public static async Task<List<AdminCategoryDto>> AdminCategoriesAsync(this ApiClient admin)
    {
        var response = await admin.GetAsync(SharedCatalogRoutes.AdminCategories);
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<List<AdminCategoryDto>>();
    }

    /// <summary>One category of GET /admin/drug-categories (fails when it is not listed).</summary>
    public static async Task<AdminCategoryDto> AdminCategoryAsync(this ApiClient admin, int categoryId)
    {
        var categories = await admin.AdminCategoriesAsync();
        return categories.Where(c => c.Id == categoryId).ShouldHaveSingleItem($"category {categoryId} in GET /admin/drug-categories");
    }

    /// <summary>POST /admin/drug-categories, asserting 201.</summary>
    public static async Task<CategoryDto> CreateCategoryAsync(this ApiClient admin, string nameEn, string nameAr)
    {
        var response = await admin.PostAsync(SharedCatalogRoutes.AdminCategories, CategoryBody(nameEn, nameAr));
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return await response.ReadAsync<CategoryDto>();
    }

    /// <summary>POST /admin/drug-categories/{id}/subcategories, asserting 201.</summary>
    public static async Task<SubCategoryDto> CreateSubCategoryAsync(this ApiClient admin, int categoryId, string nameEn, string nameAr)
    {
        var response = await admin.PostAsync(SharedCatalogRoutes.SubCategories(categoryId), CategoryBody(nameEn, nameAr));
        await response.ShouldBeAsync(HttpStatusCode.Created);
        return await response.ReadAsync<SubCategoryDto>();
    }

    /// <summary>GET /drugs?{query} in a clinic, asserting 200.</summary>
    public static async Task<PagedResult<DrugDto>> ClinicDrugsAsync(this ApiClient client, string query = "")
    {
        var response = await client.GetAsync(query == "" ? SharedCatalogRoutes.ClinicDrugs : $"{SharedCatalogRoutes.ClinicDrugs}?{query}");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<DrugDto>>();
    }

    /// <summary>A clinic's drug search (URL-encoded here) plus <paramref name="more"/>, one page of 100.</summary>
    public static Task<PagedResult<DrugDto>> SearchClinicDrugsAsync(this ApiClient client, string search, string more = "") =>
        client.ClinicDrugsAsync($"search={Uri.EscapeDataString(search)}&pageSize=100{more}");

    /// <summary>The clinic's own drugs only (<c>source=own</c>), one page of 100.</summary>
    public static Task<PagedResult<DrugDto>> OwnDrugsAsync(this ApiClient client) => client.ClinicDrugsAsync("source=own&pageSize=100");

    /// <summary>GET /drugs/{id} in a clinic, asserting 200.</summary>
    public static async Task<DrugDto> ClinicDrugAsync(this ApiClient client, int id)
    {
        var response = await client.GetAsync(SharedCatalogRoutes.ClinicDrug(id));
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<DrugDto>();
    }

    /// <summary>GET /drug-categories in a clinic, asserting 200.</summary>
    public static async Task<List<CategoryDto>> ClinicCategoriesAsync(this ApiClient client)
    {
        var response = await client.GetAsync(SharedCatalogRoutes.ClinicCategories);
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<List<CategoryDto>>();
    }

    /// <summary>The <c>drugCount</c> of a 409 <c>categoryInUse</c> / <c>subCategoryInUse</c> body.</summary>
    public static int DrugCount(this Problem problem)
    {
        problem.Body.ContainsKey("drugCount").ShouldBeTrue($"no drugCount in {problem.Body.ToJsonString()}");
        return problem.Body["drugCount"]!.GetValue<int>();
    }

    /// <summary>
    /// A JSON body with its non-ASCII characters unescaped (the API writes Arabic as escapes), so a text check
    /// (<c>ShouldNotContain("زوكالين")</c>) sees what a client reads.
    /// </summary>
    public static string Readable(string json) =>
        System.Text.Json.Nodes.JsonNode.Parse(json)!.ToJsonString(new System.Text.Json.JsonSerializerOptions
        {
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        });

    /// <summary>A text of exactly <paramref name="length"/> characters that starts with a unique number.</summary>
    public static string TextOfLength(int length, char fill = 'x')
    {
        var prefix = $"{Harness.Builders.Unique.Next()} ";
        return prefix + new string(fill, length - prefix.Length);
    }

    /// <summary>The number of active (not withdrawn) shared drugs in the collection's database.</summary>
    public static Task<int> ActiveSharedCountAsync(this AppFixture app) =>
        app.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == null && !d.IsWithdrawn));
}
