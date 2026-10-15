using System.Net;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>
/// A super admin whose phone is removed from <c>Platform:SuperAdminPhones</c>: the restarted API (a variant app) demotes
/// them and revokes their sessions; every request after the restart goes through the variant.
/// </summary>
[Collection(AuthCollection5.Name)]
[Trait("Area", "auth")]
public class SuperAdminRestartTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "AUTH-112")]
    public async Task A_removed_super_admin_loses_the_flag_and_their_sessions_and_a_refresh_is_unauthorized()
    {
        var admin = await Login.SuperAdminAsync();
        var other = await Login.AsAsync(Login.SuperAdminPhone);
        var userId = int.Parse(AuthKit.Claims(admin.AccessToken).Claim("sub"));

        await using var variant = App.CreateVariant(new Dictionary<string, string> { ["Platform:SuperAdminPhones:0"] = Unique.Phone() });
        variant.Start();

        (await App.QueryDbAsync(db => db.Users.Where(u => u.Id == userId).Select(u => u.IsSuperAdmin).SingleAsync())).ShouldBeFalse();
        (await App.SessionOfAsync(admin.AccessToken)).RevokedAt.ShouldNotBeNull();
        (await App.SessionOfAsync(other.AccessToken)).RevokedAt.ShouldNotBeNull();
        var response = await AuthKit.Browser(variant, admin.RefreshCookie).RefreshAsync();
        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        response.ShouldClearRefreshCookie();
    }

    [Fact]
    [Trait("Case", "AUTH-196")]
    public async Task A_removed_super_admin_on_the_platform_is_refused_then_has_no_context_and_cannot_refresh()
    {
        var admin = await Login.SuperAdminAsync();
        await (await admin.GetAsync("/api/v1/admin/clinics")).ShouldBeOkAsync();

        await using var variant = App.CreateVariant(new Dictionary<string, string> { ["Platform:SuperAdminPhones:0"] = Unique.Phone() });
        variant.Start();
        var stale = AuthKit.Browser(variant, admin.RefreshCookie, admin.AccessToken);

        // The action: the old platform token still validates, but the user is no super admin any more
        await (await stale.GetAsync("/api/v1/admin/clinics")).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        var me = await stale.MeAsync();
        me.Context.ShouldBeNull();
        me.User.IsSuperAdmin.ShouldBeFalse();
        me.Permissions.ShouldBeEmpty();
        // The SPA's re-check: the session was revoked, so not noContexts but a plain 401 (→ /login with the message)
        await (await stale.RefreshAsync()).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }
}
