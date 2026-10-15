using System.Net;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// Who may call the admin routes (platform-admin tech "API": no/expired token → 401 <c>unauthorized</c>; anything but a
/// platform token of a user who is still a super admin → 403 <c>forbidden</c>), plus the M1.5 acceptance matrix's
/// forged-token rows.
/// </summary>
[Collection(AdminCollection.Name)]
[Trait("Area", "admin")]
public class AdminAuthorizationTests(AppFixture app) : IntegrationTest(app)
{
    /// <summary>Calls every admin route with <paramref name="client"/>'s token; asserts each answers status + code.</summary>
    private static async Task EveryRouteAnswersAsync(ApiClient client, ClinicHandle target, HttpStatusCode status, string code)
    {
        foreach (var (method, url, body) in AdminRoutes.Every(target.Id, target.RoleId(DefaultRoles.Doctor), target.Owner.Id))
            await (await client.CallAsync(method, url, body)).ShouldBeProblemAsync(status, code);
    }

    /// <summary>Every table, the target's details and roles as before the refused calls.</summary>
    private async Task<Func<Task>> SnapshotAsync(ClinicHandle target)
    {
        var admin = await Login.SharedSuperAdminAsync();
        var counts = await App.RowCountsAsync();
        var details = await admin.ClinicAsync(target.Id);
        var roles = await admin.RolesAsync(target.Id);
        return async () =>
        {
            (await App.RowCountsAsync()).ShouldBe(counts);
            var after = await admin.ClinicAsync(target.Id);
            after.ShouldBeEquivalentTo(details);
            (await admin.RolesAsync(target.Id)).ShouldBeEquivalentTo(roles);
        };
    }

    [Fact]
    [Trait("Case", "ADM-001")]
    public async Task No_token_gets_401_on_every_admin_route_and_nothing_changes()
    {
        await Login.SharedSuperAdminAsync();
        var target = await Data.Clinic();
        var nothingChanged = await SnapshotAsync(target);

        await EveryRouteAnswersAsync(Anonymous(), target, HttpStatusCode.Unauthorized, "unauthorized");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "ADM-002")]
    public async Task An_expired_super_admin_platform_token_gets_401()
    {
        var admin = await Login.SuperAdminAsync();

        // 15 min lifetime + 30 s skew (README "Time and tokens")
        Clock.Advance(TimeSpan.FromMinutes(15) + TimeSpan.FromSeconds(31));

        await (await admin.GetAsync(AdminRoutes.Clinics)).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "ADM-003")]
    [Trait("Tier", "Smoke")]
    public async Task An_owners_clinic_token_gets_403_on_every_admin_route_and_nothing_is_written()
    {
        await Login.SharedSuperAdminAsync();
        var target = await Data.Clinic();
        var owner = await Login.OwnerAsync(target);
        var nothingChanged = await SnapshotAsync(target);

        await EveryRouteAnswersAsync(owner, target, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "ADM-004")]
    public async Task An_assistants_clinic_token_gets_403_on_every_admin_route()
    {
        await Login.SharedSuperAdminAsync();
        var target = await Data.Clinic();
        var assistant = await Login.WithRoleAsync(target, DefaultRoles.Assistant);
        var nothingChanged = await SnapshotAsync(target);

        await EveryRouteAnswersAsync(assistant, target, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "ADM-005")]
    public async Task An_owners_no_context_token_gets_403()
    {
        var phone = Unique.Phone();
        await Data.Clinic().OwnedBy(phone);
        await Data.Clinic().OwnedBy(phone);

        var owner = await Login.AsAsync(phone);

        owner.Auth.Context.ShouldBeNull("two clinics: no context before picking one");
        await (await owner.GetAsync(AdminRoutes.Clinics)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    [Trait("Case", "ADM-006")]
    public async Task A_super_admins_template_context_token_gets_403_on_every_admin_route()
    {
        await Login.SharedSuperAdminAsync();
        var target = await Data.Clinic();
        var inTemplate = await Login.SuperAdminInTemplateAsync();
        var nothingChanged = await SnapshotAsync(target);

        await EveryRouteAnswersAsync(inTemplate, target, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "ADM-007")]
    public async Task An_owner_cannot_manage_their_own_clinics_roles_and_staff()
    {
        await Login.SharedSuperAdminAsync();
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        var nothingChanged = await SnapshotAsync(clinic);
        var ownClinicRoutes = AdminRoutes.Every(clinic.Id, clinic.RoleId(DefaultRoles.Doctor), clinic.Owner.Id)
            .Where(r => r.Url.Contains("/roles") || r.Url.Contains("/staff")).ToList();
        ownClinicRoutes.Count.ShouldBe(8);

        foreach (var (method, url, body) in ownClinicRoutes)
            await (await owner.CallAsync(method, url, body)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    [Trait("Case", "ADM-008")]
    public async Task A_staff_token_on_an_unknown_clinics_roles_gets_403_not_404()
    {
        var clinic = await Data.Clinic();
        var staff = await Login.WithRoleAsync(clinic, DefaultRoles.Doctor);

        await (await staff.GetAsync(AdminRoutes.Roles(999_999))).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        await (await staff.PostAsync(AdminRoutes.Roles(999_999), new { name = "X", permissions = Array.Empty<string>() }))
            .ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    [Trait("Case", "ADM-009")]
    [Trait("Tier", "Smoke")]
    public async Task The_super_admin_in_the_platform_context_lists_clinics()
    {
        var admin = await Login.SuperAdminAsync();

        await (await admin.GetAsync(AdminRoutes.Clinics)).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "ADM-015")]
    public async Task After_logout_the_platform_access_token_still_works_until_it_expires()
    {
        var admin = await Login.SuperAdminAsync();
        await (await admin.LogoutAsync()).ShouldBeAsync(HttpStatusCode.NoContent);

        Clock.Advance(TimeSpan.FromMinutes(14));

        await (await admin.GetAsync(AdminRoutes.Clinics)).ShouldBeOkAsync();
    }

    // ---- Ported from the M1.5 acceptance matrix (accept-api.py "auth on every /admin endpoint") ----

    [Fact]
    public async Task Garbage_and_forged_tokens_get_401_on_every_admin_route()
    {
        var admin = await Login.SharedSuperAdminAsync();
        var target = await Data.Clinic();
        var nothingChanged = await SnapshotAsync(target);
        var client = Anonymous();

        foreach (var token in new[] { "abc.def.ghi", ForgedTokens.WithOtherKey(admin.AccessToken), ForgedTokens.Unsigned(admin.AccessToken) })
        {
            client.AccessToken = token;
            await EveryRouteAnswersAsync(client, target, HttpStatusCode.Unauthorized, "unauthorized");
        }

        await nothingChanged();
    }

    [Fact]
    public async Task A_token_made_with_the_apps_key_and_the_super_admins_claims_is_accepted()
    {
        // Control for the forged-token rows: the forging itself works
        var admin = await Login.SharedSuperAdminAsync();
        var client = Anonymous();
        client.AccessToken = ForgedTokens.WithAppKey(App, admin.AccessToken);

        await (await client.GetAsync(AdminRoutes.Clinics)).ShouldBeOkAsync();
    }

    [Fact]
    public async Task A_platform_token_signed_with_the_apps_key_for_a_user_who_is_not_super_admin_gets_403()
    {
        await Login.SharedSuperAdminAsync();
        var target = await Data.Clinic();
        var phone = Unique.Phone();
        await Data.Clinic().OwnedBy(phone);
        await Data.Clinic().OwnedBy(phone);
        var owner = await Login.AsAsync(phone);
        var nothingChanged = await SnapshotAsync(target);
        var client = Anonymous();
        client.AccessToken = ForgedTokens.WithAppKey(App, owner.AccessToken, payload =>
        {
            payload["ctx"] = "platform";
            payload["super_admin"] = "true";
        });

        await EveryRouteAnswersAsync(client, target, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }

    [Fact]
    public async Task The_super_admins_no_context_token_gets_403_on_every_admin_route()
    {
        await Login.SharedSuperAdminAsync();
        var target = await Data.Clinic();
        var admin = await Login.AsAsync(Login.SuperAdminPhone);
        admin.Auth.Context.ShouldBeNull("platform + template: the login shows the picker");
        var nothingChanged = await SnapshotAsync(target);

        await EveryRouteAnswersAsync(admin, target, HttpStatusCode.Forbidden, "forbidden");

        await nothingChanged();
    }
}
