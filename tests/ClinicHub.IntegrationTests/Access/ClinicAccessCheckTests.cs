using ClinicHub.Application.Features.Catalog.Categories;
using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Access;

/// <summary>
/// The per-request clinic access check and its 403 codes (access tech § API): <c>forbidden</c> (not a clinic token),
/// <c>noAccess</c> (staff gone or inactive, clinic deleted), <c>clinicSuspended</c>; the most specific wins.
/// </summary>
[Collection(AccessCollection4.Name)]
[Trait("Area", "access")]
public class ClinicAccessCheckTests(AppFixture app) : IntegrationTest(app)
{
    /// <summary>A token and the rows its routes act on (built once per class).</summary>
    private sealed record Caller(ApiClient Client, CatalogTarget Target);

    [Theory]
    [MemberData(nameof(CatalogRoutes.All), MemberType = typeof(CatalogRoutes))]
    [Trait("Case", "ACC-034")]
    public async Task A_platform_token_is_forbidden_on_every_catalog_route(string endpoint)
    {
        var target = await App.PerClassAsync("target", async () => await CatalogRoutes.TargetAsync(Data, await Data.Clinic()));
        var platform = await Login.SharedSuperAdminAsync();

        var response = await CatalogRoutes.CallAsync(platform, endpoint, target);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Theory]
    [MemberData(nameof(CatalogRoutes.All), MemberType = typeof(CatalogRoutes))]
    [Trait("Case", "ACC-035")]
    public async Task A_no_context_token_is_forbidden_on_every_catalog_route(string endpoint)
    {
        var caller = await App.PerClassAsync("no-context", async () =>
        {
            var phone = Unique.Phone();
            var clinic = await Data.Clinic().OwnedBy(phone);
            await Data.Clinic().OwnedBy(phone);
            var client = await Login.AsAsync(phone);
            client.Auth.Context.ShouldBeNull();
            return new Caller(client, await CatalogRoutes.TargetAsync(Data, clinic));
        });

        var response = await CatalogRoutes.CallAsync(caller.Client, endpoint, caller.Target);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Theory]
    [MemberData(nameof(CatalogRoutes.All), MemberType = typeof(CatalogRoutes))]
    [Trait("Case", "ACC-036")]
    public async Task A_deactivated_staff_member_has_no_access_on_every_catalog_route(string endpoint)
    {
        var caller = await App.PerClassAsync("deactivated", () => LoggedInThenAsync(async (_, staff) => await Data.DeactivateStaffAsync(staff)));

        var response = await CatalogRoutes.CallAsync(caller.Client, endpoint, caller.Target);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Theory]
    [MemberData(nameof(CatalogRoutes.All), MemberType = typeof(CatalogRoutes))]
    [Trait("Case", "ACC-037")]
    public async Task A_removed_staff_member_has_no_access_on_every_catalog_route(string endpoint)
    {
        var caller = await App.PerClassAsync("removed", () => LoggedInThenAsync((_, staff) => Data.RemoveStaffAsync(staff)));

        var response = await CatalogRoutes.CallAsync(caller.Client, endpoint, caller.Target);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Theory]
    [MemberData(nameof(CatalogRoutes.All), MemberType = typeof(CatalogRoutes))]
    [Trait("Case", "ACC-038")]
    public async Task Staff_of_a_suspended_clinic_get_clinic_suspended_on_every_catalog_route(string endpoint)
    {
        var caller = await App.PerClassAsync("suspended", () => LoggedInThenAsync((clinic, _) => Data.SuspendClinicAsync(clinic)));

        var response = await CatalogRoutes.CallAsync(caller.Client, endpoint, caller.Target);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
    }

    [Theory]
    [MemberData(nameof(CatalogRoutes.All), MemberType = typeof(CatalogRoutes))]
    [Trait("Case", "ACC-039")]
    public async Task Staff_of_a_deleted_clinic_have_no_access_on_every_catalog_route(string endpoint)
    {
        var caller = await App.PerClassAsync("deleted", () => LoggedInThenAsync((clinic, _) => Data.DeleteClinicAsync(clinic)));

        var response = await CatalogRoutes.CallAsync(caller.Client, endpoint, caller.Target);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Theory]
    [MemberData(nameof(CatalogRoutes.All), MemberType = typeof(CatalogRoutes))]
    [Trait("Case", "ACC-039")]
    public async Task Staff_of_a_suspended_then_deleted_clinic_have_no_access_never_clinic_suspended(string endpoint)
    {
        var caller = await App.PerClassAsync("suspended-deleted", () => LoggedInThenAsync(async (clinic, _) =>
        {
            await Data.SuspendClinicAsync(clinic);
            await Data.DeleteClinicAsync(clinic);
        }));

        var response = await CatalogRoutes.CallAsync(caller.Client, endpoint, caller.Target);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "ACC-040")]
    public async Task A_deactivated_staff_member_of_a_suspended_clinic_gets_clinic_suspended_then_no_access_once_it_is_active()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic);
        var user = await Login.StaffAsync(staff);
        await Data.DeactivateStaffAsync(staff);
        await Data.SuspendClinicAsync(clinic);

        await (await user.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");

        await Data.ActivateClinicAsync(clinic);

        await (await user.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "ACC-041")]
    public async Task Clinic_suspended_wins_over_a_missing_permission()
    {
        var clinic = await Data.Clinic();
        var role = await Data.Role(clinic).WithPermissions(Permissions.Drugs.List);
        var staff = await Data.Staff(clinic).WithRoles(role.Id);
        var user = await Login.StaffAsync(staff);
        await (await user.PostAsync("/api/v1/drugs", new { categoryId = CategoryIds.Eye, name = "Vigamox " + Guid.NewGuid() }))
            .ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await Data.SuspendClinicAsync(clinic);

        var response = await user.PostAsync("/api/v1/drugs", new { categoryId = CategoryIds.Eye, name = "Vigamox " + Guid.NewGuid() });

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
    }

    [Fact]
    [Trait("Case", "ACC-041")]
    public async Task No_access_wins_over_a_missing_permission()
    {
        var clinic = await Data.Clinic();
        var role = await Data.Role(clinic).WithPermissions(Permissions.Drugs.List);
        var staff = await Data.Staff(clinic).WithRoles(role.Id);
        var user = await Login.StaffAsync(staff);
        await Data.DeactivateStaffAsync(staff);

        var response = await user.PostAsync("/api/v1/drugs", new { categoryId = CategoryIds.Eye, name = "Vigamox " + Guid.NewGuid() });

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "ACC-042")]
    public async Task A_template_token_of_a_user_who_is_no_longer_super_admin_has_no_access()
    {
        var admin = await Login.SuperAdminInTemplateAsync();
        await (await admin.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        // Restarted with another super admin phone: the startup seeder demotes the old one
        await using var variant = App.CreateVariant(new Dictionary<string, string>
        {
            ["Platform:SuperAdminPhones:0"] = Unique.Phone(),
        });
        variant.Start();
        using var restarted = new ApiClient(variant) { AccessToken = admin.AccessToken };

        var response = await restarted.GetAsync("/api/v1/drugs");

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "ACC-044")]
    public async Task A_forged_token_with_mismatching_ids_does_not_spoil_the_real_owners_access()
    {
        var clinic = await Data.Clinic();
        var other = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        // The owner's staff id and clinic, but another user: only possible with the signing key
        var forged = new ApiClient(App.Factory)
        {
            AccessToken = ForgedTokens.Clinic(App, other.Owner.UserId, clinic.Id, clinic.Owner.Id),
        };

        await (await forged.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");

        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        (await owner.MeAsync()).Permissions.Count.ShouldBe(11);
    }

    [Theory]
    [InlineData("deactivated")]
    [InlineData("removed")]
    [InlineData("suspended")]
    [InlineData("deleted")]
    [Trait("Case", "ACC-045")]
    public async Task Me_with_a_token_of_a_lost_clinic_has_no_context_staff_or_permissions(string loss)
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic);
        var user = await Login.StaffAsync(staff);
        (await user.MeAsync()).Context.ShouldNotBeNull();

        await (loss switch
        {
            "deactivated" => Data.DeactivateStaffAsync(staff),
            "removed" => Data.RemoveStaffAsync(staff),
            "suspended" => Data.SuspendClinicAsync(clinic),
            _ => Data.DeleteClinicAsync(clinic),
        });
        var response = await user.GetAsync("/api/v1/me");

        await response.ShouldBeOkAsync();
        var me = await response.ReadNodeAsync();
        me.ShouldHaveNull("context").ShouldHaveNull("staff");
        me["permissions"]!.AsArray().ShouldBeEmpty();
    }

    /// <summary>A new Doctor of a new clinic (with a catalog target) logs in, then <paramref name="change"/> happens.</summary>
    private async Task<Caller> LoggedInThenAsync(Func<ClinicHandle, StaffHandle, Task> change)
    {
        var clinic = await Data.Clinic();
        var target = await CatalogRoutes.TargetAsync(Data, clinic);
        var staff = await Data.Staff(clinic).WithRole("Doctor");
        var client = await Login.StaffAsync(staff);
        await (await client.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        await change(clinic, staff);
        return new Caller(client, target);
    }
}

/// <summary>ACC-043 on its own class: the template's cached clinic entry must not exist before the hand edit.</summary>
[Collection(AccessCollection4.Name)]
[Trait("Area", "access")]
public class TemplateSuspendedTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ACC-043")]
    public async Task The_super_admin_in_a_template_suspended_in_the_database_gets_clinic_suspended()
    {
        var templateId = await App.TemplateClinicIdAsync();
        var admin = await Login.SuperAdminInTemplateAsync();
        // By hand (the admin screens can't suspend the template), before anything cached the template's entry
        await App.OutsideTheApp.ExecuteAsync("""UPDATE "Clinics" SET "Status" = 'suspended' WHERE "Id" = @p0""", templateId);

        var response = await admin.GetAsync("/api/v1/drugs");

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
    }
}
