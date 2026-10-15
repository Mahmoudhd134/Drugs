using System.Net;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// A missing, deleted or template clinic → 404 <c>notFound</c> on every <c>{id}</c> route, before the body is read
/// (platform-admin tech "API" and "Roles and staff": the admin clinic filter); the template never listed nor changed.
/// </summary>
[Collection(AdminCollection.Name)]
[Trait("Area", "admin")]
public class ClinicNotFoundTests(AppFixture app) : IntegrationTest(app)
{
    private const int UnknownId = 999_999;

    private static async Task EveryClinicRouteIsNotFoundAsync(ApiClient admin, int clinicId, int roleId, int staffId)
    {
        foreach (var (method, url, body) in AdminRoutes.OnClinic(clinicId, roleId, staffId))
            await (await admin.CallAsync(method, url, body)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    private static async Task MalformedBodiesAreNotFoundAsync(ApiClient admin, int clinicId, int roleId, int staffId)
    {
        foreach (var (method, url) in new[]
                 {
                     (HttpMethod.Post, AdminRoutes.Roles(clinicId)), (HttpMethod.Put, AdminRoutes.Role(clinicId, roleId)),
                     (HttpMethod.Post, AdminRoutes.Staff(clinicId)), (HttpMethod.Put, AdminRoutes.StaffMember(clinicId, staffId)),
                 })
            await (await admin.SendRawAsync(method, url, "{bad json")).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "ADM-091")]
    public async Task An_unknown_clinic_id_is_notFound_on_get_rename_suspend_activate_and_delete()
    {
        var admin = await Login.SharedSuperAdminAsync();

        await (await admin.GetAsync(AdminRoutes.Clinic(UnknownId))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.PutAsync(AdminRoutes.Clinic(UnknownId), new { name = "New" })).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.PostAsync(AdminRoutes.Suspend(UnknownId))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.PostAsync(AdminRoutes.Activate(UnknownId))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.DeleteAsync(AdminRoutes.Clinic(UnknownId))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    public async Task Unknown_zero_and_negative_clinic_ids_are_notFound_on_every_clinic_route()
    {
        // Ported from accept-api.py "clinics delete/404" (unknown, zero, negative)
        var admin = await Login.SharedSuperAdminAsync();
        var other = await Data.Clinic();
        var before = await App.RowCountsAsync();

        foreach (var id in new[] { UnknownId, 0, -1 })
        {
            await EveryClinicRouteIsNotFoundAsync(admin, id, other.RoleId(DefaultRoles.Doctor), other.Owner.Id);
            await MalformedBodiesAreNotFoundAsync(admin, id, other.RoleId(DefaultRoles.Doctor), other.Owner.Id);
        }

        (await App.RowCountsAsync()).ShouldBe(before);
    }

    [Fact]
    public async Task A_clinic_id_that_is_not_a_number_is_not_found()
    {
        var admin = await Login.SharedSuperAdminAsync();

        // GET only (docs/tech/overview.md "Errors": a non-numeric id matches no route, GET → 404 notFound; other methods
        // are the ERR track's 405 case)
        foreach (var url in new[] { $"{AdminRoutes.Clinics}/abc", $"{AdminRoutes.Clinics}/abc/roles", $"{AdminRoutes.Clinics}/abc/staff" })
            await (await admin.GetAsync(url)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "ADM-125")]
    [Trait("Case", "ADM-140")]
    public async Task A_deleted_clinic_is_notFound_on_every_other_admin_route_even_with_a_malformed_body()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var doctor = clinic.RoleId(DefaultRoles.Doctor);
        await Data.DeleteClinicAsync(clinic);
        var before = await App.RowCountsAsync();

        await EveryClinicRouteIsNotFoundAsync(admin, clinic.Id, doctor, clinic.Owner.Id);
        await MalformedBodiesAreNotFoundAsync(admin, clinic.Id, doctor, clinic.Owner.Id);

        (await App.RowCountsAsync()).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ADM-140")]
    public async Task Unknown_and_template_clinics_with_a_malformed_body_on_post_roles_are_notFound()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var templateId = await App.TemplateClinicIdAsync();

        foreach (var id in new[] { UnknownId, templateId })
            await (await admin.SendRawAsync(HttpMethod.Post, AdminRoutes.Roles(id), "{bad json"))
                .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
    }

    [Fact]
    [Trait("Case", "ADM-137")]
    [Trait("Tier", "Smoke")]
    public async Task The_template_is_never_listed_whatever_the_search_or_status()
    {
        var admin = await Login.SharedSuperAdminAsync();
        await Data.Clinic();
        var template = await App.QueryDbAsync(db => db.Clinics.Where(c => c.IsTemplate).Select(c => new { c.Id, c.Name }).SingleAsync());

        foreach (var search in new[] { "", template.Name, template.Name.ToUpperInvariant(), template.Name[..3] })
            foreach (var status in new[] { "", "&status=active", "&status=suspended" })
                (await admin.SearchClinicIdsAsync(search, status)).ShouldNotContain(template.Id, $"search '{search}'{status}");
    }

    [Fact]
    [Trait("Case", "ADM-138")]
    public async Task The_templates_id_is_notFound_on_get_rename_suspend_activate_and_delete_and_it_stays_unchanged()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var before = await App.QueryDbAsync(db => db.Clinics.Where(c => c.IsTemplate)
            .Select(c => new { c.Id, c.Name, c.Status, c.DeletedAt }).SingleAsync());

        await (await admin.GetAsync(AdminRoutes.Clinic(before.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.PutAsync(AdminRoutes.Clinic(before.Id), new { name = "Renamed template" }))
            .ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.PostAsync(AdminRoutes.Suspend(before.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.PostAsync(AdminRoutes.Activate(before.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");
        await (await admin.DeleteAsync(AdminRoutes.Clinic(before.Id))).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        var after = await App.QueryDbAsync(db => db.Clinics.Where(c => c.Id == before.Id)
            .Select(c => new { c.Id, c.Name, c.Status, c.DeletedAt }).SingleAsync());
        after.ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "ADM-139")]
    public async Task The_templates_roles_and_staff_routes_are_notFound()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var templateId = await App.TemplateClinicIdAsync();
        var other = await Data.Clinic();
        var before = await App.RowCountsAsync();

        var routes = AdminRoutes.OnClinic(templateId, other.RoleId(DefaultRoles.Doctor), other.Owner.Id)
            .Where(r => r.Url.Contains("/roles") || r.Url.Contains("/staff")).ToList();
        routes.Count.ShouldBe(8);
        foreach (var (method, url, body) in routes)
            await (await admin.CallAsync(method, url, body)).ShouldBeProblemAsync(HttpStatusCode.NotFound, "notFound");

        (await App.RowCountsAsync()).ShouldBe(before);
    }
}
