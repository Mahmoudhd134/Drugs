using System.Net;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>
/// <c>POST /auth/context</c> (needs the access token and this session's current cookie) and <c>GET /auth/contexts</c>:
/// which places can be entered, the refusal reasons for the picked clinic, and what happens to the cookie.
/// </summary>
[Collection(AuthCollection6.Name)]
[Trait("Area", "auth")]
public class ContextSwitchTests(AppFixture app) : IntegrationTest(app)
{
    /// <summary>A staff member of clinics A and B (a new one each), logged in and in A.</summary>
    private async Task<(ClinicHandle A, ClinicHandle B, StaffHandle InA, StaffHandle InB, Harness.Clients.ApiClient User)> StaffOfTwoAsync()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var inA = await Data.Staff(a);
        var inB = await Data.Staff(b).WithPhone(inA.Phone);
        var user = await Login.StaffAsync(inA);
        return (a, b, inA, inB, user);
    }

    [Fact]
    [Trait("Case", "AUTH-114")]
    public async Task A_staff_member_lists_their_clinics_by_name_with_their_roles()
    {
        var zeta = await Data.Clinic().Named(Unique.Name("Zeta", "ز"));
        var alpha = await Data.Clinic().Named(Unique.Name("Alpha", "أ"));
        var staff = await Data.Staff(zeta).WithRole("Doctor");
        // Owner first, then by name (access tech § API)
        await Data.Staff(alpha).WithPhone(staff.Phone).WithRole("Doctor").WithRole("Owner").WithRole("Assistant");
        var user = await Login.StaffAsync(staff);

        var response = await user.GetAsync("/api/v1/auth/contexts");

        await response.ShouldBeOkAsync();
        var list = (await response.ReadNodeAsync()).AsArray();
        list.Count.ShouldBe(2);
        var first = list[0]!.AsObject();
        first.Select(p => p.Key).Order().ShouldBe(new[] { "clinicId", "clinicName", "isTemplate", "roles", "type" });
        first["type"]!.GetValue<string>().ShouldBe("clinic");
        first["clinicId"]!.GetValue<int>().ShouldBe(alpha.Id);
        first["clinicName"]!.GetValue<string>().ShouldBe(alpha.Name);
        first["isTemplate"]!.GetValue<bool>().ShouldBeFalse();
        first["roles"]!.AsArray().Select(r => r!.GetValue<string>()).ShouldBe(new[] { "Owner", "Assistant", "Doctor" });
        var second = list[1]!.AsObject();
        second["clinicId"]!.GetValue<int>().ShouldBe(zeta.Id);
        second["roles"]!.AsArray().Select(r => r!.GetValue<string>()).ShouldBe(new[] { "Doctor" });
    }

    [Fact]
    [Trait("Case", "AUTH-116")]
    public async Task Suspended_deleted_and_deactivated_memberships_are_not_listed()
    {
        var active = await Data.Clinic();
        var staff = await Data.Staff(active);
        var suspended = await Data.Clinic();
        await Data.Staff(suspended).WithPhone(staff.Phone);
        await Data.SuspendClinicAsync(suspended);
        var deleted = await Data.Clinic();
        await Data.Staff(deleted).WithPhone(staff.Phone);
        await Data.DeleteClinicAsync(deleted);
        var deactivated = await Data.Clinic();
        await Data.Staff(deactivated).WithPhone(staff.Phone).Inactive();
        var user = await Login.StaffAsync(staff);

        var contexts = await (await user.GetAsync("/api/v1/auth/contexts")).ReadAsync<List<ContextDto>>();

        contexts.ShouldHaveSingleItem().ClinicId.ShouldBe(active.Id);
        user.Auth.Contexts.ShouldHaveSingleItem().ClinicId.ShouldBe(active.Id);
    }

    [Fact]
    [Trait("Case", "AUTH-117")]
    public async Task Contexts_without_a_token_is_unauthorized()
    {
        await (await Anonymous().GetAsync("/api/v1/auth/contexts")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-133")]
    public async Task A_staff_member_switches_clinic_the_cookie_rotates_and_a_refresh_stays_there()
    {
        var (a, b, _, inB, user) = await StaffOfTwoAsync();
        var oldCookie = user.RefreshCookie;
        user.Auth.Context.ClinicId.ShouldBe(a.Id);

        var response = await user.SwitchContextAsync("clinic", b.Id);

        await response.ShouldBeOkAsync();
        var auth = await response.ReadAsync<AuthResult>();
        auth.Context.ClinicId.ShouldBe(b.Id);
        var claims = AuthKit.Claims(auth.AccessToken);
        claims.Claim("clinic_id").ShouldBe(b.Id.ToString());
        claims.Claim("staff_id").ShouldBe(inB.Id.ToString());
        response.ShouldSetRefreshCookie().Value.Value.ShouldNotBe(oldCookie);
        var refreshed = await user.RefreshAsync();
        await refreshed.ShouldBeOkAsync();
        user.Auth.Context.ClinicId.ShouldBe(b.Id);
    }

    [Fact]
    [Trait("Case", "AUTH-134")]
    public async Task A_token_without_a_context_may_switch()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        await Data.Staff(b).WithPhone(a.Owner.Phone);
        var user = await Login.AsAsync(a.Owner.Phone);
        user.Auth.Context.ShouldBeNull();

        var response = await user.SwitchContextAsync("clinic", b.Id);

        await response.ShouldBeOkAsync();
        user.Auth.Context.ClinicId.ShouldBe(b.Id);
    }

    [Fact]
    [Trait("Case", "AUTH-137")]
    public async Task A_staff_member_cannot_switch_to_the_platform()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        var response = await owner.SwitchContextAsync("platform");

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        response.ShouldKeepRefreshCookie();
    }

    [Fact]
    [Trait("Case", "AUTH-138")]
    public async Task A_staff_member_cannot_switch_to_the_template()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        var response = await owner.SwitchContextAsync("clinic", await App.TemplateClinicIdAsync());

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "AUTH-139")]
    public async Task A_staff_member_cannot_switch_to_another_clinic()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        var other = await Data.Clinic();

        var response = await owner.SwitchContextAsync("clinic", other.Id);

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        problem.Body.ContainsKey("clinicNames").ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "AUTH-140")]
    public async Task A_clinic_that_does_not_exist_is_no_access()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        var response = await owner.SwitchContextAsync("clinic", int.MaxValue);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "AUTH-141")]
    public async Task A_suspended_clinic_is_refused_by_name_and_the_cookie_is_kept()
    {
        var (a, b, inA, _, user) = await StaffOfTwoAsync();
        var c = await Data.Clinic();
        await Data.Staff(c).WithPhone(inA.Phone);
        await user.EnterClinicAsync(b.Id);
        var cookie = user.RefreshCookie;
        await Data.SuspendClinicAsync(a);
        await Data.SuspendClinicAsync(c);   // another suspended clinic of the user: only the picked one is named

        var response = await user.SwitchContextAsync("clinic", a.Id);

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        problem.ClinicNames.ShouldBe(new[] { a.Name });
        response.ShouldKeepRefreshCookie();
        user.RefreshCookie.ShouldBe(cookie);
    }

    [Theory]
    [Trait("Case", "AUTH-142")]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_deleted_clinic_is_no_access_without_names(bool suspendedFirst)
    {
        var (a, b, _, _, user) = await StaffOfTwoAsync();
        await user.EnterClinicAsync(b.Id);
        if (suspendedFirst)
            await Data.SuspendClinicAsync(a);
        await Data.DeleteClinicAsync(a);

        var response = await user.SwitchContextAsync("clinic", a.Id);

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        problem.Body.ContainsKey("clinicNames").ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "AUTH-143")]
    public async Task A_clinic_where_the_user_was_deactivated_is_refused_by_name()
    {
        var (a, b, inA, _, user) = await StaffOfTwoAsync();
        await user.EnterClinicAsync(b.Id);
        await Data.DeactivateStaffAsync(inA);

        var response = await user.SwitchContextAsync("clinic", a.Id);

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "staffInactive");
        problem.ClinicNames.ShouldBe(new[] { a.Name });
        response.ShouldKeepRefreshCookie();
    }

    [Fact]
    [Trait("Case", "AUTH-144")]
    public async Task A_suspended_clinic_where_the_user_is_also_deactivated_is_refused_as_suspended()
    {
        var (a, b, inA, _, user) = await StaffOfTwoAsync();
        await user.EnterClinicAsync(b.Id);
        await Data.DeactivateStaffAsync(inA);
        await Data.SuspendClinicAsync(a);

        var response = await user.SwitchContextAsync("clinic", a.Id);

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");
        problem.ClinicNames.ShouldBe(new[] { a.Name });
    }

    [Theory]
    [Trait("Case", "AUTH-145")]
    [InlineData("pharmacy", true)]
    [InlineData("clinic", false)]
    public async Task An_unknown_type_or_a_clinic_without_id_is_no_access(string type, bool withId)
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        var response = await owner.SwitchContextAsync(type, withId ? owner.Auth.Context.ClinicId : null);

        await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
    }

    [Fact]
    [Trait("Case", "AUTH-146")]
    public async Task A_refused_switch_leaves_the_session_in_its_context()
    {
        // A third active clinic: with two places left, a context cleared or overwritten by the refused switch would
        // refresh to no context instead of being replaced by the only one left
        var (a, b, inA, _, user) = await StaffOfTwoAsync();
        var c = await Data.Clinic();
        await Data.Staff(c).WithPhone(inA.Phone);
        await Data.SuspendClinicAsync(b);
        await (await user.SwitchContextAsync("clinic", b.Id)).ShouldBeProblemAsync(HttpStatusCode.Forbidden, "clinicSuspended");

        var session = await App.SessionOfAsync(user.AccessToken);
        session.ContextType.ShouldBe("clinic");
        session.ClinicId.ShouldBe(a.Id);
        var response = await user.RefreshAsync();

        await response.ShouldBeOkAsync();
        user.Auth.Context.ShouldNotBeNull();
        user.Auth.Context.ClinicId.ShouldBe(a.Id);
    }

    [Fact]
    [Trait("Case", "AUTH-147")]
    public async Task A_switch_without_the_cookie_is_unauthorized_and_sets_no_cookie()
    {
        var (_, b, _, _, user) = await StaffOfTwoAsync();
        var tokenOnly = AuthKit.Browser(App.Factory, null, user.AccessToken);

        var response = await tokenOnly.SwitchContextAsync("clinic", b.Id);

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        response.Headers.Contains("Set-Cookie").ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "AUTH-148")]
    public async Task A_switch_with_another_live_sessions_cookie_is_unauthorized_and_that_cookie_is_kept()
    {
        var (_, b, inA, _, user) = await StaffOfTwoAsync();
        var otherSession = await Login.StaffAsync(inA);
        var mixed = AuthKit.Browser(App.Factory, otherSession.RefreshCookie, user.AccessToken);

        var response = await mixed.SwitchContextAsync("clinic", b.Id);

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        response.ShouldKeepRefreshCookie();
        await (await otherSession.RefreshAsync()).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-149")]
    public async Task A_switch_with_a_cookie_rotated_less_than_30_s_ago_is_a_conflict()
    {
        var (_, b, _, _, user) = await StaffOfTwoAsync();
        var old = user.RefreshCookie;
        await (await user.RefreshAsync()).ShouldBeOkAsync();
        var stale = AuthKit.Browser(App.Factory, old, user.AccessToken);

        Clock.Advance(TimeSpan.FromSeconds(29));
        var response = await stale.SwitchContextAsync("clinic", b.Id);

        await response.ShouldBeProblemAsync(HttpStatusCode.Conflict, "conflict");
        response.ShouldKeepRefreshCookie();
    }

    [Theory]
    [Trait("Case", "AUTH-150")]
    [InlineData(true)]
    [InlineData(false)]
    public async Task An_ended_sessions_token_with_its_own_or_an_unknown_cookie_is_unauthorized_and_cleared(bool ownCookie)
    {
        var (_, b, _, _, user) = await StaffOfTwoAsync();
        var token = user.AccessToken;
        var cookie = user.RefreshCookie;
        await (await user.LogoutAsync()).ShouldBeAsync(HttpStatusCode.NoContent);
        var stale = AuthKit.Browser(App.Factory, ownCookie ? cookie : "not-a-refresh-token", token);

        var response = await stale.SwitchContextAsync("clinic", b.Id);

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        response.ShouldClearRefreshCookie();
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-151")]
    public async Task An_ended_sessions_token_with_a_new_live_sessions_cookie_keeps_that_cookie()
    {
        var (_, b, inA, _, user) = await StaffOfTwoAsync();
        var staleToken = user.AccessToken;
        await (await user.LogoutAsync()).ShouldBeAsync(HttpStatusCode.NoContent);
        var again = await Login.StaffAsync(inA);
        var staleTab = AuthKit.Browser(App.Factory, again.RefreshCookie, staleToken);

        var response = await staleTab.SwitchContextAsync("clinic", b.Id);

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        response.ShouldKeepRefreshCookie();
        staleTab.RefreshCookie.ShouldBe(again.RefreshCookie);
        await (await staleTab.RefreshAsync()).ShouldBeOkAsync();
    }
}
