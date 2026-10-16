using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Access;

/// <summary><c>GET /me</c>: user, context, staff and the expanded permissions (auth tech § API, access tech § API).</summary>
[Collection(AccessCollection.Name)]
[Trait("Area", "access")]
public class MeTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "ACC-079")]
    public async Task A_clinic_token_gets_the_user_context_staff_and_the_expanded_keys_in_catalog_order()
    {
        var clinic = await Data.Clinic();
        var role = await Data.Role(clinic).WithPermissions(Permissions.Groups.Create, Permissions.Drugs.Update);
        var staff = await Data.Staff(clinic).WithRoles(role.Id);
        var user = await Login.StaffAsync(staff);

        var response = await user.GetAsync("/api/v1/me");

        await response.ShouldBeOkAsync();
        var me = (await response.ReadNodeAsync()).AsObject();
        me.Select(p => p.Key).ShouldBe(["user", "context", "staff", "permissions"], ignoreOrder: true);
        var userNode = me["user"]!.AsObject();
        ((int)userNode["id"]).ShouldBe(staff.UserId);
        ((string)userNode["phone"]).ShouldBe(staff.Phone);
        ((string)userNode["phone"]).ShouldStartWith("+20");
        ((bool)userNode["isSuperAdmin"]).ShouldBeFalse();
        var context = me["context"]!.AsObject();
        ((string)context["type"]).ShouldBe("clinic");
        ((int)context["clinicId"]).ShouldBe(clinic.Id);
        ((string)context["clinicName"]).ShouldBe(clinic.Name);
        context["roles"]!.AsArray().Select(r => (string)r).ShouldBe([role.Name]);
        var staffNode = me["staff"]!.AsObject();
        ((int)staffNode["id"]).ShouldBe(staff.Id);
        ((string)staffNode["fullName"]).ShouldBe(staff.FullName);
        me["permissions"]!.AsArray().Select(p => (string)p).ShouldBe(
        [
            Permissions.Drugs.List, Permissions.Drugs.Details, Permissions.Drugs.Update,
            Permissions.Groups.List, Permissions.Groups.Create,
        ]);
    }

    [Fact]
    [Trait("Case", "ACC-080")]
    public async Task A_platform_token_is_a_super_admin_without_staff_or_permissions()
    {
        var admin = await Login.SuperAdminAsync();

        var me = await admin.MeAsync();

        me.User.IsSuperAdmin.ShouldBeTrue();
        me.Context.ShouldNotBeNull();
        me.Context.Type.ShouldBe("platform");
        me.Staff.ShouldBeNull();
        me.Permissions.ShouldBeEmpty();
        (await admin.MeNodeAsync()).ShouldHaveNull("staff");
    }

    [Fact]
    [Trait("Case", "ACC-081")]
    public async Task A_no_context_token_has_no_context_and_no_permissions()
    {
        var phone = Unique.Phone();
        await Data.Clinic().OwnedBy(phone);
        await Data.Clinic().OwnedBy(phone);
        var user = await Login.AsAsync(phone);
        user.Auth.Context.ShouldBeNull();

        var me = await user.MeAsync();

        me.Context.ShouldBeNull();
        me.Permissions.ShouldBeEmpty();
        (await user.MeNodeAsync()).ShouldHaveNull("context");
    }

    [Fact]
    [Trait("Case", "ACC-082")]
    public async Task Without_a_token_it_answers_401()
    {
        var response = await Anonymous().GetAsync("/api/v1/me");

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "ACC-083")]
    public async Task Context_roles_list_Owner_first_then_the_others_by_name()
    {
        var clinic = await Data.Clinic();
        var n = Unique.Next();
        var zulu = await Data.Role(clinic).Named($"Zulu {n}");
        var alpha = await Data.Role(clinic).Named($"Alpha {n}");
        var staff = await Data.Staff(clinic).WithRoles(zulu.Id, clinic.RoleId("Owner"), alpha.Id);
        var user = await Login.StaffAsync(staff);

        var me = await user.MeAsync();
        var contexts = await (await user.GetAsync("/api/v1/auth/contexts"))
            .ReadAsync<List<ContextDto>>();

        string[] expected = ["Owner", $"Alpha {n}", $"Zulu {n}"];
        me.Context.Roles.ShouldBe(expected);
        user.Auth.Context.Roles.ShouldBe(expected);
        contexts.Single(c => c.ClinicId == clinic.Id).Roles.ShouldBe(expected);
    }

    [Fact]
    [Trait("Case", "ACC-083")]
    public async Task In_the_template_the_context_has_no_roles()
    {
        var admin = await Login.SuperAdminInTemplateAsync();

        var me = await admin.MeAsync();

        me.Context.ShouldNotBeNull();
        me.Context.IsTemplate.ShouldBe(true);
        me.Context.Roles.ShouldBeEmpty();
    }
}
