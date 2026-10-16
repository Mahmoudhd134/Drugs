using System.Net;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// A super admin removed from <c>Platform:SuperAdminPhones</c> (design D1; platform-admin tech "Edge cases": the old
/// platform token gets 403 on <c>/admin/*</c>, their sessions are revoked by the seeder). Restart cases: a variant app
/// is the restarted API (README "Restart cases").
/// </summary>
[Collection(AdminCollection.Name)]
[Trait("Area", "admin")]
public class DemotedSuperAdminTests(AppFixture app) : IntegrationTest(app)
{
    private Dictionary<string, string> Demoted() => new() { ["Platform:SuperAdminPhones:0"] = Unique.Phone() };

    /// <summary>The same browser (token and refresh cookie) talking to the restarted API.</summary>
    private static ApiClient SameBrowserOn(ClinicHubFactory variant, ApiClient browser)
    {
        var moved = new ApiClient(variant) { AccessToken = browser.AccessToken };
        moved.Cookies.Add(browser.Cookies.GetAllCookies());
        return moved;
    }

    [Fact]
    [Trait("Case", "ADM-012")]
    [Trait("Tier", "Smoke")]
    public async Task After_a_restart_without_their_phone_the_old_platform_token_gets_403()
    {
        var admin = await Login.SuperAdminAsync();
        await (await admin.GetAsync(AdminRoutes.Clinics)).ShouldBeOkAsync();

        await using var variant = App.CreateVariant(Demoted());
        variant.Start();
        var stale = SameBrowserOn(variant, admin);

        await (await stale.GetAsync(AdminRoutes.Clinics)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
    }

    [Fact]
    public async Task After_the_demotion_the_old_token_cannot_change_a_clinic_and_the_session_is_revoked()
    {
        // Ported from accept-api.py "D1 demotion"
        var target = await Data.Clinic();
        var admin = await Login.SuperAdminAsync();

        await using var variant = App.CreateVariant(Demoted());
        variant.Start();
        var stale = SameBrowserOn(variant, admin);

        await (await stale.PostAsync(AdminRoutes.Suspend(target.Id))).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "forbidden");
        (await App.QueryDbAsync(db => db.Clinics.Where(c => c.Id == target.Id).Select(c => c.Status).SingleAsync()))
            .ShouldBe("active");
        var me = await stale.MeAsync();
        me.User.IsSuperAdmin.ShouldBeFalse();
        me.Context.ShouldBeNull();
        (await stale.MeNodeAsync()).ShouldHaveNull("context");
        (await stale.RefreshAsync()).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    [Trait("Case", "ADM-013")]
    public async Task A_demoted_super_admin_with_no_clinic_logging_in_gets_noAccess()
    {
        var phone = Login.SuperAdminPhone;

        await using var variant = App.CreateVariant(Demoted());
        variant.Start();
        var browser = new ApiClient(variant);

        var response = await Login.On(variant).TryAsync(browser, phone);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "ADM-014")]
    public async Task After_a_restart_with_the_phone_added_back_the_platform_context_is_offered_again()
    {
        await using (var demoted = App.CreateVariant(Demoted()))
            demoted.Start();

        await using var restored = App.CreateVariant();
        restored.Start();
        var browser = await Login.On(restored).AsAsync(Login.SuperAdminPhone);

        browser.Auth.Contexts.ShouldContain(c => c.Type == "platform");
        browser.Auth.Contexts.ShouldContain(c => c.Type == "clinic" && c.IsTemplate == true);
        await browser.EnterPlatformAsync();
        await (await browser.GetAsync(AdminRoutes.Clinics)).ShouldBeOkAsync();
    }
}
