using System.Net;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>
/// A right code but nowhere to enter: the most specific reason (suspended clinics, then deactivated staff, else
/// <c>noAccess</c>), naming every clinic with that reason (ordinal, once each), never a deleted clinic; no session, no
/// cookie. A wrong code never reveals the reason.
/// </summary>
[Collection(AuthCollection4.Name)]
[Trait("Area", "auth")]
public class LoginRefusalTests(AppFixture app) : IntegrationTest(app)
{
    /// <summary>The verify response for <paramref name="phone"/>, asserting no session row and no cookie were made for it.</summary>
    private async Task<HttpResponseMessage> RefusedLoginAsync(string phone, HttpStatusCode status, string code)
    {
        var sessions = await App.QueryDbAsync(db => db.Sessions.CountAsync());
        var browser = Anonymous();

        var response = await Login.TryAsync(browser, phone);

        await response.ShouldBeProblemAsync(status, code);
        response.RefreshSetCookie().ShouldBeNull();
        browser.RefreshCookie.ShouldBeNull();
        (await App.QueryDbAsync(db => db.Sessions.CountAsync())).ShouldBe(sessions);
        return response;
    }

    private async Task<List<string>> ClinicNamesOfRefusalAsync(string phone, string code)
    {
        var response = await RefusedLoginAsync(phone, HttpStatusCode.Forbidden, code);
        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, code);
        problem.ClinicNames.ShouldNotBeNull();
        return problem.ClinicNames;
    }

    private async Task ShouldBeNoAccessWithoutNamesAsync(string phone)
    {
        var response = await RefusedLoginAsync(phone, HttpStatusCode.Forbidden, "noAccess");
        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        problem.Body.ContainsKey("clinicNames").ShouldBeFalse();
    }

    [Fact]
    [Trait("Case", "AUTH-060")]
    public async Task Staff_deactivated_in_their_only_clinic_is_told_so_with_the_clinic_name()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).Inactive();

        (await ClinicNamesOfRefusalAsync(staff.Phone, "staffInactive")).ShouldBe(new[] { clinic.Name });
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-061")]
    public async Task Staff_of_a_suspended_only_clinic_is_told_it_is_suspended()
    {
        var clinic = await Data.Clinic().Suspended();

        (await ClinicNamesOfRefusalAsync(clinic.Owner.Phone, "clinicSuspended")).ShouldBe(new[] { clinic.Name });
    }

    [Theory]
    [Trait("Case", "AUTH-062")]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Staff_of_a_deleted_only_clinic_gets_no_access_without_names(bool suspendedFirst)
    {
        var builder = Data.Clinic().Deleted();
        var clinic = suspendedFirst ? await builder.Suspended() : await builder;

        await ShouldBeNoAccessWithoutNamesAsync(clinic.Owner.Phone);
    }

    [Fact]
    [Trait("Case", "AUTH-063")]
    public async Task A_user_removed_from_their_only_clinic_gets_no_access_without_names()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic);
        await Data.RemoveStaffAsync(staff);

        await ShouldBeNoAccessWithoutNamesAsync(staff.Phone);
    }

    [Fact]
    [Trait("Case", "AUTH-064")]
    public async Task Suspended_wins_over_deactivated_and_only_the_suspended_clinic_is_named()
    {
        var suspended = await Data.Clinic().Suspended();
        var active = await Data.Clinic();
        await Data.Staff(active).WithPhone(suspended.Owner.Phone).Inactive();

        (await ClinicNamesOfRefusalAsync(suspended.Owner.Phone, "clinicSuspended")).ShouldBe(new[] { suspended.Name });
    }

    [Fact]
    [Trait("Case", "AUTH-065")]
    public async Task Staff_deactivated_in_a_suspended_clinic_is_told_the_clinic_is_suspended()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic).Inactive();
        await Data.SuspendClinicAsync(clinic);

        (await ClinicNamesOfRefusalAsync(staff.Phone, "clinicSuspended")).ShouldBe(new[] { clinic.Name });
    }

    [Fact]
    [Trait("Case", "AUTH-066")]
    public async Task Every_suspended_clinic_is_named_by_name()
    {
        var beta = await Data.Clinic().Named("Beta").Suspended();
        var alpha = await Data.Clinic().Named("Alpha").Suspended();
        await Data.Staff(alpha).WithPhone(beta.Owner.Phone);

        (await ClinicNamesOfRefusalAsync(beta.Owner.Phone, "clinicSuspended")).ShouldBe(new[] { "Alpha", "Beta" });
    }

    [Fact]
    [Trait("Case", "AUTH-067")]
    public async Task Every_clinic_where_the_staff_is_deactivated_is_named_by_name()
    {
        var b = await Data.Clinic().Named("B clinic");
        var a = await Data.Clinic().Named("A clinic");
        var staff = await Data.Staff(b).Inactive();
        await Data.Staff(a).WithPhone(staff.Phone).Inactive();

        (await ClinicNamesOfRefusalAsync(staff.Phone, "staffInactive")).ShouldBe(new[] { "A clinic", "B clinic" });
    }

    [Fact]
    [Trait("Case", "AUTH-068")]
    public async Task Two_suspended_clinics_with_the_same_name_are_named_once()
    {
        var first = await Data.Clinic().Named("Same").Suspended();
        var second = await Data.Clinic().Named("Same").Suspended();
        await Data.Staff(second).WithPhone(first.Owner.Phone);

        (await ClinicNamesOfRefusalAsync(first.Owner.Phone, "clinicSuspended")).ShouldBe(new[] { "Same" });
    }

    [Fact]
    [Trait("Case", "AUTH-069")]
    public async Task Clinic_names_are_in_ordinal_order()
    {
        var beta = await Data.Clinic().Named("beta").Suspended();
        var alpha = await Data.Clinic().Named("Alpha").Suspended();
        var arabic = await Data.Clinic().Named("النور").Suspended();
        // Ordinal puts every capital before every small letter ("Bravo" < "beta"); a culture order would not
        var bravo = await Data.Clinic().Named("Bravo").Suspended();
        await Data.Staff(alpha).WithPhone(beta.Owner.Phone);
        await Data.Staff(arabic).WithPhone(beta.Owner.Phone);
        await Data.Staff(bravo).WithPhone(beta.Owner.Phone);

        (await ClinicNamesOfRefusalAsync(beta.Owner.Phone, "clinicSuspended")).ShouldBe(new[] { "Alpha", "Bravo", "beta", "النور" });
    }

    [Theory]
    [Trait("Case", "AUTH-070")]
    [InlineData(true)]
    [InlineData(false)]
    public async Task A_deleted_clinic_or_a_removal_is_never_named_next_to_a_deactivation(bool deleted)
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        var staff = await Data.Staff(a).Inactive();
        var inB = await Data.Staff(b).WithPhone(staff.Phone);
        if (deleted)
            await Data.DeleteClinicAsync(b);
        else
            await Data.RemoveStaffAsync(inB);

        (await ClinicNamesOfRefusalAsync(staff.Phone, "staffInactive")).ShouldBe(new[] { a.Name });
    }

    [Fact]
    [Trait("Case", "AUTH-071")]
    public async Task Staff_of_a_deleted_clinic_and_removed_from_another_gets_no_access()
    {
        var a = await Data.Clinic().Deleted();
        var b = await Data.Clinic();
        var inB = await Data.Staff(b).WithPhone(a.Owner.Phone);
        await Data.RemoveStaffAsync(inB);

        await ShouldBeNoAccessWithoutNamesAsync(a.Owner.Phone);
    }

    [Fact]
    [Trait("Case", "AUTH-072")]
    public async Task An_active_clinic_is_entered_and_a_suspended_one_is_not_listed()
    {
        var active = await Data.Clinic();
        var suspended = await Data.Clinic().Suspended();
        await Data.Staff(suspended).WithPhone(active.Owner.Phone);
        var browser = Anonymous();

        var response = await Login.TryAsync(browser, active.Owner.Phone);

        await response.ShouldBeOkAsync();
        var auth = await response.ReadAsync<AuthResult>();
        auth.Context.ShouldNotBeNull();
        auth.Context.ClinicId.ShouldBe(active.Id);
        auth.Contexts.ShouldHaveSingleItem().ClinicId.ShouldBe(active.Id);
    }

    [Theory]
    [Trait("Case", "AUTH-073")]
    [InlineData("staffInactive")]
    [InlineData("clinicSuspended")]
    public async Task A_wrong_code_never_reveals_the_reason(string reason)
    {
        string phone;
        if (reason == "staffInactive")
            phone = (await Data.Staff(await Data.Clinic()).Inactive()).Phone;
        else
            phone = (await Data.Clinic().Suspended()).Owner.Phone;
        var browser = Anonymous();
        var code = await Login.CodeAsync(browser, phone);

        var response = await browser.VerifyOtpAsync(phone, AuthKit.WrongCode(code));

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
        problem.Body.ContainsKey("clinicNames").ShouldBeFalse();
    }
}
