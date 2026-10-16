using System.Net;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>
/// <c>POST /auth/refresh</c>: rotation, the sliding 30-day staff session (exact boundaries), the 30 s grace for a rotated
/// cookie (409, cookie kept), races, and the context re-check (lost clinic → cleared, replaced or session ended).
/// </summary>
[Collection(AuthCollection5.Name)]
[Trait("Area", "auth")]
public class RefreshTests(AppFixture app) : IntegrationTest(app)
{
    /// <summary>A browser holding <paramref name="client"/>'s current cookie value, then <paramref name="client"/> refreshes (rotating it).</summary>
    private async Task<ApiClient> StaleCopyAfterRotationAsync(ApiClient client)
    {
        var stale = AuthKit.Browser(App.Factory, client.RefreshCookie);
        await (await client.RefreshAsync()).ShouldBeOkAsync();
        return stale;
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-098")]
    public async Task A_refresh_keeps_the_context_and_rotates_the_token_and_the_cookie()
    {
        var clinic = await Data.Clinic();
        var owner = await Login.OwnerAsync(clinic);
        var oldToken = owner.AccessToken;
        var oldCookie = owner.RefreshCookie;
        Clock.Advance(TimeSpan.FromMinutes(1));

        var response = await owner.RefreshAsync();

        await response.ShouldBeOkAsync();
        var auth = await response.ReadAsync<AuthResult>();
        auth.Context.ClinicId.ShouldBe(clinic.Id);
        auth.Context.Type.ShouldBe("clinic");
        auth.Contexts.ShouldHaveSingleItem().ClinicId.ShouldBe(clinic.Id);
        auth.AccessToken.ShouldNotBe(oldToken);
        auth.ExpiresAt.ShouldBe(Clock.GetUtcNow().UtcDateTime.AddMinutes(15));
        var cookie = response.ShouldSetRefreshCookie();
        cookie.Value.Value.ShouldNotBe(oldCookie);
        owner.RefreshCookie.ShouldBe(cookie.Value.Value);
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-099")]
    public async Task A_staff_session_used_29_days_23_hours_ago_slides_to_30_days_from_now()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        Clock.Advance(TimeSpan.FromDays(29) + TimeSpan.FromHours(23));
        var response = await owner.RefreshAsync();

        await response.ShouldBeOkAsync();
        response.ShouldSetRefreshCookie().Expires.ShouldBe(Clock.GetUtcNow().AddDays(30));
        (await App.SessionOfAsync(owner.AccessToken)).ExpiresAt.ShouldBe(Clock.GetUtcNow().UtcDateTime.AddDays(30));
    }

    [Theory]
    [Trait("Case", "AUTH-100")]
    [InlineData(0)]
    [InlineData(1)]
    public async Task A_staff_session_unused_for_30_days_has_ended_and_its_cookie_is_cleared(int extraSeconds)
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        Clock.Advance(TimeSpan.FromDays(30) + TimeSpan.FromSeconds(extraSeconds));
        var response = await owner.RefreshAsync();

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        response.ShouldClearRefreshCookie();
        owner.RefreshCookie.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "AUTH-102")]
    public async Task No_cookie_is_unauthorized()
    {
        var response = await Anonymous().RefreshAsync();

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "AUTH-103")]
    public async Task An_unknown_cookie_is_unauthorized_and_cleared()
    {
        var browser = AuthKit.Browser(App.Factory, "not-a-refresh-token");

        var response = await browser.RefreshAsync();

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        response.ShouldClearRefreshCookie();
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-104")]
    public async Task A_cookie_rotated_29_s_ago_answers_conflict_without_tokens_and_keeps_the_cookie()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        var stale = await StaleCopyAfterRotationAsync(owner);
        var staleValue = stale.RefreshCookie;

        Clock.Advance(TimeSpan.FromSeconds(29));
        var response = await stale.RefreshAsync();

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "conflict");
        problem.Body.ContainsKey("accessToken").ShouldBeFalse();
        stale.Auth.ShouldBeNull();
        response.ShouldKeepRefreshCookie();
        stale.RefreshCookie.ShouldBe(staleValue);
    }

    [Theory]
    [Trait("Case", "AUTH-105")]
    [InlineData(30)]
    [InlineData(31)]
    public async Task A_cookie_rotated_30_s_ago_or_more_is_unauthorized(int seconds)
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        var stale = await StaleCopyAfterRotationAsync(owner);

        Clock.Advance(TimeSpan.FromSeconds(seconds));
        var response = await stale.RefreshAsync();

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Theory]
    [Trait("Case", "AUTH-106")]
    [InlineData(10)]
    [InlineData(45)]
    public async Task Reusing_an_old_cookie_does_not_revoke_the_session(int seconds)
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        var stale = await StaleCopyAfterRotationAsync(owner);
        Clock.Advance(TimeSpan.FromSeconds(seconds));
        var reused = await stale.RefreshAsync();
        reused.StatusCode.ShouldBe(seconds < 30 ? HttpStatusCode.Conflict : HttpStatusCode.Unauthorized);

        var response = await owner.RefreshAsync();

        await response.ShouldBeOkAsync();
        (await App.SessionOfAsync(owner.AccessToken)).RevokedAt.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "AUTH-107")]
    public async Task Six_parallel_refreshes_with_one_cookie_give_one_winner_and_five_conflicts()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        var browsers = Enumerable.Range(0, 6).Select(_ => AuthKit.Browser(App.Factory, owner.RefreshCookie)).ToList();

        var responses = await Task.WhenAll(browsers.Select(b => b.RefreshAsync()));

        responses.Count(r => r.StatusCode == HttpStatusCode.OK).ShouldBe(1);
        responses.Count(r => r.StatusCode == HttpStatusCode.Conflict).ShouldBe(5);
        foreach (var response in responses.Where(r => r.StatusCode != HttpStatusCode.OK))
            response.ShouldKeepRefreshCookie();
        var winner = browsers[Array.FindIndex(responses, r => r.StatusCode == HttpStatusCode.OK)];
        await (await winner.RefreshAsync()).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-108")]
    public async Task A_logged_out_sessions_cookie_is_unauthorized_and_cleared()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        var cookie = owner.RefreshCookie;
        await (await owner.LogoutAsync()).ShouldBeAsync(HttpStatusCode.NoContent);
        var browser = AuthKit.Browser(App.Factory, cookie);

        var response = await browser.RefreshAsync();

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        response.ShouldClearRefreshCookie();
    }

    [Fact]
    [Trait("Case", "AUTH-109")]
    public async Task A_lost_clinic_with_two_or_more_places_left_clears_the_context()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var c = await Data.Clinic();
        var staffA = await Data.Staff(a);
        await Data.Staff(b).WithPhone(staffA.Phone);
        await Data.Staff(c).WithPhone(staffA.Phone);
        var user = await Login.StaffAsync(staffA);
        user.Auth.Context.ClinicId.ShouldBe(a.Id);
        await Data.DeactivateStaffAsync(staffA);

        var response = await user.RefreshAsync();

        await response.ShouldBeOkAsync();
        var auth = await response.ReadAsync<AuthResult>();
        auth.Context.ShouldBeNull();
        auth.Contexts.Select(x => x.ClinicId).ShouldBe(new int?[] { b.Id, c.Id }, ignoreOrder: true);
        AuthKit.Claims(auth.AccessToken).Has("clinic_id").ShouldBeFalse();
        (await App.SessionOfAsync(auth.AccessToken)).ContextType.ShouldBeNull();
    }

    [Theory]
    [Trait("Case", "AUTH-110")]
    [InlineData("deactivated")]
    [InlineData("removed")]
    [InlineData("suspended")]
    [InlineData("deleted")]
    public async Task A_lost_clinic_with_exactly_one_place_left_moves_the_session_there(string how)
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var staffA = await Data.Staff(a);
        await Data.Staff(b).WithPhone(staffA.Phone);
        var user = await Login.StaffAsync(staffA);
        await LoseAsync(a, staffA, how);

        var response = await user.RefreshAsync();

        await response.ShouldBeOkAsync();
        var auth = await response.ReadAsync<AuthResult>();
        auth.Context.ShouldNotBeNull();
        auth.Context.ClinicId.ShouldBe(b.Id);
        auth.Contexts.ShouldHaveSingleItem().ClinicId.ShouldBe(b.Id);
        AuthKit.Claims(auth.AccessToken).Claim("clinic_id").ShouldBe(b.Id.ToString());
    }

    [Theory]
    [Trait("Case", "AUTH-111")]
    [InlineData("deactivated")]
    [InlineData("removed")]
    [InlineData("suspended")]
    [InlineData("deleted")]
    public async Task No_place_left_ends_the_session_with_noContexts(string how)
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic);
        var user = await Login.StaffAsync(staff);
        var cookie = user.RefreshCookie;
        await LoseAsync(clinic, staff, how);

        var response = await user.RefreshAsync();

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "noContexts");
        response.ShouldClearRefreshCookie();
        (await App.SessionOfAsync(user.AccessToken)).RevokedAt.ShouldNotBeNull();
        var again = await AuthKit.Browser(App.Factory, cookie).RefreshAsync();
        await again.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    private async Task LoseAsync(ClinicHandle clinic, StaffHandle staff, string how)
    {
        switch (how)
        {
            case "deactivated":
                await Data.DeactivateStaffAsync(staff);
                break;
            case "removed":
                await Data.RemoveStaffAsync(staff);
                break;
            case "suspended":
                await Data.SuspendClinicAsync(clinic);
                break;
            default:
                await Data.DeleteClinicAsync(clinic);
                break;
        }
    }

    [Fact]
    [Trait("Case", "AUTH-113")]
    public async Task A_logout_racing_a_refresh_always_leaves_the_session_revoked()
    {
        var clinic = await Data.Clinic();
        for (var run = 0; run < 10; run++)
        {
            var user = await Login.OwnerAsync(clinic);
            var loggingOut = AuthKit.Browser(App.Factory, user.RefreshCookie);
            var refreshing = AuthKit.Browser(App.Factory, user.RefreshCookie);

            var logout = loggingOut.LogoutAsync();
            var refresh = refreshing.RefreshAsync();
            await Task.WhenAll(logout, refresh);

            (await logout).StatusCode.ShouldBe(HttpStatusCode.NoContent);
            (await App.SessionOfAsync(user.AccessToken)).RevokedAt.ShouldNotBeNull($"run {run}: refresh answered {(await refresh).StatusCode}");
            await (await refreshing.RefreshAsync()).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        }
    }
}
