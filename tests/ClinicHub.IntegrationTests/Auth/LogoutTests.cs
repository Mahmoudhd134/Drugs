using System.Net;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary><c>POST /auth/logout</c> (always 204), and what a request after losing the clinic can and cannot do.</summary>
[Collection(AuthCollection6.Name)]
[Trait("Area", "auth")]
public class LogoutTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-152")]
    public async Task A_logout_revokes_the_session_and_clears_the_cookie()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        var cookie = owner.RefreshCookie;

        var response = await owner.LogoutAsync();

        await response.ShouldBeAsync(HttpStatusCode.NoContent);
        response.ShouldClearRefreshCookie();
        owner.RefreshCookie.ShouldBeNull();
        (await App.SessionOfAsync(owner.AccessToken)).RevokedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
        await (await AuthKit.Browser(App.Factory, cookie).RefreshAsync()).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Theory]
    [Trait("Case", "AUTH-153")]
    [InlineData(null)]
    [InlineData("not-a-refresh-token")]
    public async Task A_logout_without_a_live_cookie_still_succeeds(string cookie)
    {
        var response = await AuthKit.Browser(App.Factory, cookie).LogoutAsync();

        await response.ShouldBeAsync(HttpStatusCode.NoContent);
    }

    [Fact]
    [Trait("Case", "AUTH-154")]
    public async Task A_logout_with_a_cookie_rotated_less_than_30_s_ago_revokes_the_session()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        var stale = AuthKit.Browser(App.Factory, owner.RefreshCookie);
        await (await owner.RefreshAsync()).ShouldBeOkAsync();

        Clock.Advance(TimeSpan.FromSeconds(29));
        await (await stale.LogoutAsync()).ShouldBeAsync(HttpStatusCode.NoContent);

        (await App.SessionOfAsync(owner.AccessToken)).RevokedAt.ShouldNotBeNull();
        await (await owner.RefreshAsync()).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "AUTH-155")]
    public async Task After_a_logout_the_old_access_token_works_until_it_expires()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        await (await owner.LogoutAsync()).ShouldBeAsync(HttpStatusCode.NoContent);

        Clock.Advance(TimeSpan.FromMinutes(14));
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        Clock.Advance(TimeSpan.FromMinutes(1) + TimeSpan.FromSeconds(31));
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "AUTH-189")]
    public async Task A_save_sent_after_the_clinic_was_lost_is_refused_and_written_nowhere()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var inA = await Data.Staff(a);
        await Data.Staff(b).WithPhone(inA.Phone);
        var user = await Login.StaffAsync(inA);
        await (await user.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();   // the access is cached
        await Data.DeactivateStaffAsync(inA);
        var name = Unique.Name("Lost", "مفقود");

        var response = await user.PostAsync("/api/v1/drugs", new { name, description = (string)null, defaultDosing = (object)null });

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        // The refresh moves the session to B; nothing was written in A, in B or anywhere
        await (await user.RefreshAsync()).ShouldBeOkAsync();
        user.Auth.Context.ClinicId.ShouldBe(b.Id);
        (await App.QueryDbAsync(db => db.Drugs.IgnoreQueryFilters().CountAsync(d => d.Name == name))).ShouldBe(0);
    }
}
