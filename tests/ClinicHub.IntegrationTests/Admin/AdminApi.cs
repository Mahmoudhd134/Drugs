using System.Net;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Application.Features.Catalog.DrugGroups;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Application.Features.Platform.Clinics;
using ClinicHub.Domain.Access;
using ClinicHub.Domain.Catalog;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>The admin routes (docs/features/platform-admin/tech.md "API").</summary>
public static class AdminRoutes
{
    public const string Clinics = "/api/v1/admin/clinics";

    public static string Clinic(int id) => $"{Clinics}/{id}";
    public static string Suspend(int id) => $"{Clinics}/{id}/suspend";
    public static string Activate(int id) => $"{Clinics}/{id}/activate";
    public static string Roles(int clinicId) => $"{Clinics}/{clinicId}/roles";
    public static string Role(int clinicId, int roleId) => $"{Roles(clinicId)}/{roleId}";
    public static string Staff(int clinicId) => $"{Clinics}/{clinicId}/staff";
    public static string StaffMember(int clinicId, int staffId) => $"{Staff(clinicId)}/{staffId}";

    /// <summary>
    /// "Every admin route" of the catalog (ADM header): the 15 routes with a valid body, on clinic
    /// <paramref name="clinicId"/>, role <paramref name="roleId"/> and staff member <paramref name="staffId"/>.
    /// </summary>
    public static IReadOnlyList<(HttpMethod Method, string Url, object Body)> Every(int clinicId, int roleId, int staffId) =>
    [
        (HttpMethod.Get, Clinics, null),
        (HttpMethod.Post, Clinics, new { name = Unique.Name("Refused", "مرفوضة"), owner = new { phone = Unique.Phone(), fullName = "X" } }),
        (HttpMethod.Get, Clinic(clinicId), null),
        (HttpMethod.Put, Clinic(clinicId), new { name = "Hacked" }),
        (HttpMethod.Post, Suspend(clinicId), null),
        (HttpMethod.Post, Activate(clinicId), null),
        (HttpMethod.Delete, Clinic(clinicId), null),
        (HttpMethod.Get, Roles(clinicId), null),
        (HttpMethod.Post, Roles(clinicId), new { name = "Hacked", permissions = Array.Empty<string>() }),
        (HttpMethod.Put, Role(clinicId, roleId), new { name = "Hacked", permissions = Array.Empty<string>() }),
        (HttpMethod.Delete, Role(clinicId, roleId), null),
        (HttpMethod.Get, Staff(clinicId), null),
        (HttpMethod.Post, Staff(clinicId), new { phone = Unique.Phone(), fullName = "X", roleIds = new[] { roleId } }),
        (HttpMethod.Put, StaffMember(clinicId, staffId), new { fullName = "Hacked", isActive = false, roleIds = new[] { roleId } }),
        (HttpMethod.Delete, StaffMember(clinicId, staffId), null),
    ];

    /// <summary>The 13 routes that name a clinic id (every route but the list and the create).</summary>
    public static IReadOnlyList<(HttpMethod Method, string Url, object Body)> OnClinic(int clinicId, int roleId, int staffId) =>
        Every(clinicId, roleId, staffId).Where(r => r.Url != Clinics).ToList();

    public static Task<HttpResponseMessage> CallAsync(this ApiClient client, HttpMethod method, string url, object body) =>
        method == HttpMethod.Get ? client.GetAsync(url)
        : method == HttpMethod.Delete ? client.DeleteAsync(url)
        : method == HttpMethod.Put ? client.PutAsync(url, body)
        : client.PostAsync(url, body);
}

/// <summary>Reading the admin API (each asserts 200).</summary>
public static class AdminClientExtensions
{
    public static async Task<PagedResult<ClinicSummary>> ListClinicsAsync(this ApiClient admin, string query = "")
    {
        var response = await admin.GetAsync(AdminRoutes.Clinics + (query.Length > 0 ? "?" + query : ""));
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<ClinicSummary>>();
    }

    /// <summary>The ids listed for <c>search</c> (URL-encoded here), every page of 100.</summary>
    public static async Task<List<int>> SearchClinicIdsAsync(this ApiClient admin, string search, string more = "") =>
        (await admin.ListClinicsAsync($"search={Uri.EscapeDataString(search)}&pageSize=100{more}")).Items.Select(c => c.Id).ToList();

    public static async Task<ClinicDetails> ClinicAsync(this ApiClient admin, int id)
    {
        var response = await admin.GetAsync(AdminRoutes.Clinic(id));
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<ClinicDetails>();
    }

    public static async Task<List<RoleDto>> RolesAsync(this ApiClient admin, int clinicId)
    {
        var response = await admin.GetAsync(AdminRoutes.Roles(clinicId));
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<List<RoleDto>>();
    }

    public static async Task<PagedResult<StaffMemberDto>> StaffPageAsync(this ApiClient admin, int clinicId, string query = "")
    {
        var response = await admin.GetAsync(AdminRoutes.Staff(clinicId) + (query.Length > 0 ? "?" + query : ""));
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<StaffMemberDto>>();
    }

    /// <summary>Every staff member (one page of 100).</summary>
    public static async Task<List<StaffMemberDto>> StaffAsync(this ApiClient admin, int clinicId) =>
        (await admin.StaffPageAsync(clinicId, "pageSize=100")).Items;

    /// <summary>The ids found by a staff <c>search</c> (URL-encoded here).</summary>
    public static async Task<List<int>> SearchStaffIdsAsync(this ApiClient admin, int clinicId, string search) =>
        (await admin.StaffPageAsync(clinicId, $"pageSize=100&search={Uri.EscapeDataString(search)}")).Items.Select(s => s.Id).ToList();

    public static async Task<PagedResult<DrugDto>> DrugsAsync(this ApiClient client)
    {
        var response = await client.GetAsync("/api/v1/drugs?pageSize=100");
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<PagedResult<DrugDto>>();
    }

    public static async Task<List<DrugGroupDto>> GroupsAsync(this ApiClient client)
    {
        var response = await client.GetAsync("/api/v1/drug-groups?pageSize=100");
        await response.ShouldBeOkAsync();
        var page = await response.ReadAsync<PagedResult<DrugGroupDto>>();
        var groups = new List<DrugGroupDto>();
        foreach (var group in page.Items)
        {
            var one = await client.GetAsync($"/api/v1/drug-groups/{group.Id}");
            await one.ShouldBeOkAsync();
            groups.Add(await one.ReadAsync<DrugGroupDto>());
        }
        return groups;
    }
}

/// <summary>The permission catalog in its order (docs/features/access/business.md "الصلاحيات", the 11 keys).</summary>
public static class PermissionKeys
{
    public static readonly IReadOnlyList<string> CatalogOrder =
    [
        "drugs.list", "drugs.details", "drugs.create", "drugs.update", "drugs.delete",
        "groups.list", "groups.details", "groups.create", "groups.update", "groups.delete",
        "prescriptions.create",
    ];

    /// <summary>The Assistant's 9: everything but deleting drugs and groups.</summary>
    public static readonly IReadOnlyList<string> Assistant =
        CatalogOrder.Where(k => k is not ("drugs.delete" or "groups.delete")).ToList();

    /// <summary>Keys put in catalog order (what the API answers).</summary>
    public static List<string> InCatalogOrder(params string[] keys) => CatalogOrder.Where(keys.Contains).ToList();
}

/// <summary>Row counts of every table a create clinic writes ("nothing written" / "nothing is left").</summary>
public sealed record RowCounts(int Clinics, int Users, int Staff, int Roles, int RolePermissions, int StaffRoles,
    int Drugs, int Groups, int GroupItems);

public static class AdminDb
{
    public static Task<RowCounts> RowCountsAsync(this AppFixture app) => app.QueryDbAsync(async db => new RowCounts(
        await db.Clinics.CountAsync(),
        await db.Users.CountAsync(),
        await db.Staff.IgnoreQueryFilters().CountAsync(),
        await db.Roles.IgnoreQueryFilters().CountAsync(),
        await db.Set<RolePermission>().CountAsync(),
        await db.StaffRoles.IgnoreQueryFilters().CountAsync(),
        await db.Drugs.IgnoreQueryFilters().CountAsync(),
        await db.DrugGroups.IgnoreQueryFilters().CountAsync(),
        await db.DrugGroupItems.IgnoreQueryFilters().CountAsync()));

    public static Task<int> UserCountAsync(this AppFixture app) => app.QueryDbAsync(db => db.Users.CountAsync());
}

/// <summary>
/// The catalog's template fixture (ADM header): 2 drugs (the second with a taper default dosing) and 1 group whose
/// line 2 overrides the dosing (taper 4→3→2→1, eye <c>ask</c>, the dose from the drug), built in the template through
/// the real use cases.
/// </summary>
public sealed record TemplateCatalog(int TemplateId, DrugDto First, DrugDto Second, DrugGroupDto Group)
{
    public static Dosing TaperOverride() => new()
    {
        Eye = DosingCodes.AskEye,
        TaperSteps = new[] { 4, 3, 2, 1 }.Select(times => new TaperStep
        {
            Frequency = "daily", FrequencyValue = times, DurationValue = 1, DurationUnit = "weeks",
        }).ToList(),
    };

    public static async Task<TemplateCatalog> CreateAsync(AppFixture app)
    {
        var templateId = await app.TemplateClinicIdAsync();
        var first = await app.Data.Drug(templateId).Named(Unique.Name("Moxifloxacin", "موكسي"))
            .Described("Antibiotic eye drops").WithDosing(Dosings.Drops(weeks: 1));
        var second = await app.Data.Drug(templateId).Named(Unique.Name("Prednisolone", "بريدنيزولون"))
            .Described("Steroid eye drops").WithDosing(Dosings.Taper("both", 3, 2, 1));
        var group = await app.Data.Group(templateId).Named(Unique.Name("After cataract", "بعد المياه البيضاء"))
            .With(first).With(second, TaperOverride());
        return new TemplateCatalog(templateId, first, second, group);
    }
}
