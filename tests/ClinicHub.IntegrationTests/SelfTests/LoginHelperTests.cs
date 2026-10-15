using System.Net;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>The login helpers give each kind of user the session the real OTP flow gives them.</summary>
[Collection(InfraCollectionA.Name)]
[Trait("Area", "infra")]
public class LoginHelperTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task The_super_admin_is_in_the_platform_context()
    {
        var admin = await Login.SuperAdminAsync();

        var me = await admin.MeAsync();
        me.User.Phone.ShouldBe(App.SuperAdminPhone);
        me.User.IsSuperAdmin.ShouldBeTrue();
        me.Context.Type.ShouldBe("platform");
        admin.RefreshCookie.ShouldNotBeNullOrEmpty();
        await (await admin.GetAsync("/api/v1/admin/clinics")).ShouldBeOkAsync();
    }

    [Fact]
    public async Task The_super_admin_can_be_in_the_template_clinic()
    {
        var admin = await Login.SuperAdminInTemplateAsync();

        var me = await admin.MeAsync();
        me.Context.ClinicId.ShouldBe(await App.TemplateClinicIdAsync());
        me.Context.IsTemplate.ShouldBe(true);
        await (await admin.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    public async Task The_owner_is_in_the_clinic_with_every_permission()
    {
        var clinic = await Data.Clinic();

        var owner = await Login.OwnerAsync(clinic);

        var me = await owner.MeAsync();
        me.Context.ClinicId.ShouldBe(clinic.Id);
        me.Staff.Id.ShouldBe(clinic.Owner.Id);
        me.Permissions.ShouldBe(PermissionCatalog.All.Select(p => p.Key).ToList(), ignoreOrder: true);
    }

    [Fact]
    public async Task A_staff_member_gets_the_permissions_of_a_default_role()
    {
        var clinic = await Data.Clinic();

        var assistant = await Login.WithRoleAsync(clinic, "Assistant");

        var me = await assistant.MeAsync();
        me.Context.Roles.ShouldBe(["Assistant"]);
        me.Permissions.ShouldNotContain(Permissions.Drugs.Delete);
        me.Permissions.ShouldContain(Permissions.Drugs.Create);
    }

    [Fact]
    public async Task A_staff_member_with_a_custom_role_gets_exactly_its_permissions()
    {
        var clinic = await Data.Clinic();

        var reader = await Login.WithPermissionsAsync(clinic, Permissions.Drugs.List);

        (await reader.MeAsync()).Permissions.ShouldBe([Permissions.Drugs.List]);
        await (await reader.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        await (await reader.GetAsync("/api/v1/drug-groups")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    public async Task Two_logins_of_one_user_are_two_independent_sessions()
    {
        var clinic = await Data.Clinic();

        var first = await Login.OwnerAsync(clinic);
        var second = await Login.OwnerAsync(clinic);

        second.RefreshCookie.ShouldNotBe(first.RefreshCookie);
        (await first.LogoutAsync()).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await (await second.RefreshAsync()).ShouldBeOkAsync();
        await (await first.RefreshAsync()).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    public async Task A_user_of_two_clinics_picks_and_switches_clinics()
    {
        var clinicA = await Data.Clinic();
        var clinicB = await Data.Clinic();
        var staffB = await Data.Staff(clinicB).WithPhone(clinicA.Owner.Phone).WithRole("Assistant");

        var user = await Login.AsAsync(clinicA.Owner.Phone);
        user.Auth.Context.ShouldBeNull();
        user.Auth.Contexts.Select(c => c.ClinicId).ShouldBe([clinicA.Id, clinicB.Id], ignoreOrder: true);

        await user.EnterClinicAsync(clinicA.Id);
        (await user.MeAsync()).Context.ClinicId.ShouldBe(clinicA.Id);
        await user.EnterClinicAsync(clinicB.Id);
        var me = await user.MeAsync();
        me.Context.ClinicId.ShouldBe(clinicB.Id);
        me.Staff.Id.ShouldBe(staffB.Id);

        // The staff helper lands in the staff member's own clinic
        (await (await Login.StaffAsync(staffB)).MeAsync()).Context.ClinicId.ShouldBe(clinicB.Id);
    }

    [Fact]
    public async Task A_shared_session_is_kept_for_the_class()
    {
        var first = await Login.SharedSuperAdminAsync();
        var again = await Login.SharedSuperAdminAsync();

        again.ShouldBeSameAs(first);
        await (await again.GetAsync("/api/v1/admin/clinics")).ShouldBeOkAsync();
    }

    [Fact]
    public async Task A_login_refused_after_a_correct_code_is_returned_as_is()
    {
        var clinic = await Data.Clinic().Suspended();
        var browser = Anonymous();

        var verify = await Login.TryAsync(browser, clinic.Owner.Phone);

        (await verify.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended")).ClinicNames.ShouldBe([clinic.Name]);
        browser.AccessToken.ShouldBeNull();
        browser.RefreshCookie.ShouldBeNull();
    }

    [Fact]
    public async Task A_reissued_token_carries_the_chosen_time()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        owner.AccessToken = await App.Tokens.ReissueAsync(owner, DateTimeOffset.UtcNow.AddMinutes(-10));
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        owner.AccessToken = await App.Tokens.ReissueAsync(owner, DateTimeOffset.UtcNow.AddMinutes(-16));
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }
}
