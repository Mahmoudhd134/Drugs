using System.Net;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Features.Identity.Login.Commands.RequestOtp;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>
/// <c>POST /auth/otp/verify</c>: the code's rules (latest only, single use, 5 tries, 5 min, digits), the session it
/// starts (token claims, the refresh cookie) and the housekeeping it does. Staff and unknown phones; the super admin's
/// logins are in <see cref="SuperAdminLoginTests"/>.
/// </summary>
[Collection(AuthCollection3.Name)]
[Trait("Area", "auth")]
public class OtpVerifyTests(AppFixture app) : IntegrationTest(app)
{
    private async Task<(ApiClient Browser, string Phone, string Code)> CodeForAsync(string phone = null)
    {
        phone ??= (await Data.Clinic()).Owner.Phone;
        var browser = Anonymous();
        var code = (await (await browser.RequestOtpAsync(phone)).ReadAsync<OtpRequestResponse>()).DevCode;
        return (browser, phone, code);
    }

    [Fact]
    [Trait("Case", "AUTH-037")]
    public async Task A_user_with_several_clinics_logs_in_without_a_context_and_sees_them_all()
    {
        var a = await Data.Clinic();
        var b = await Data.Clinic();
        await Data.Staff(b).WithPhone(a.Owner.Phone);
        var (browser, phone, code) = await CodeForAsync(a.Owner.Phone);

        var response = await browser.VerifyOtpAsync(phone, code);

        await response.ShouldBeOkAsync();
        var auth = await response.ReadAsync<AuthResult>();
        auth.Context.ShouldBeNull();
        auth.Contexts.Select(c => c.ClinicId).ShouldBe(new int?[] { a.Id, b.Id }, ignoreOrder: true);
        var claims = AuthKit.Claims(auth.AccessToken);
        claims.Has("ctx").ShouldBeFalse();
        claims.Has("clinic_id").ShouldBeFalse();
        claims.Has("staff_id").ShouldBeFalse();
        response.ShouldSetRefreshCookie();
    }

    [Fact]
    [Trait("Case", "AUTH-038")]
    public async Task The_refresh_cookie_is_http_only_secure_strict_on_the_auth_path_for_30_days()
    {
        var (browser, phone, code) = await CodeForAsync();

        var response = await browser.VerifyOtpAsync(phone, code);

        await response.ShouldBeOkAsync();
        var cookie = response.ShouldSetRefreshCookie();
        cookie.Name.Value.ShouldBe("clinichub_refresh");
        cookie.HttpOnly.ShouldBeTrue();
        cookie.Secure.ShouldBeTrue();
        cookie.SameSite.ShouldBe(SameSiteMode.Strict);
        cookie.Path.Value.ShouldBe("/api/v1/auth");
        cookie.Expires.ShouldBe(Clock.GetUtcNow().AddDays(30));
        browser.RefreshCookie.ShouldBe(cookie.Value.Value);
    }

    [Fact]
    [Trait("Case", "AUTH-040")]
    public async Task A_clinic_token_has_the_user_session_clinic_and_staff_and_no_super_admin()
    {
        var clinic = await Data.Clinic();

        var owner = await Login.OwnerAsync(clinic);

        var claims = AuthKit.Claims(owner.AccessToken);
        claims.Claim("sub").ShouldBe(clinic.Owner.UserId.ToString());
        var session = await App.SessionOfAsync(owner.AccessToken);
        session.UserId.ShouldBe(clinic.Owner.UserId);
        claims.Claim("ctx").ShouldBe("clinic");
        claims.Claim("clinic_id").ShouldBe(clinic.Id.ToString());
        claims.Claim("staff_id").ShouldBe(clinic.Owner.Id.ToString());
        claims.Has("super_admin").ShouldBeFalse();
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-044")]
    public async Task A_wrong_code_is_refused_and_counted()
    {
        var (browser, phone, code) = await CodeForAsync();

        var response = await browser.VerifyOtpAsync(phone, AuthKit.WrongCode(code));

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
        (await App.LatestCodeAsync(phone)).Attempts.ShouldBe(1);
        response.RefreshSetCookie().ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "AUTH-045")]
    public async Task The_5th_wrong_code_answers_too_many_attempts()
    {
        var (browser, phone, code) = await CodeForAsync();
        for (var i = 1; i <= 4; i++)
        {
            await (await browser.VerifyOtpAsync(phone, AuthKit.WrongCode(code)))
                .ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
            (await App.LatestCodeAsync(phone)).Attempts.ShouldBe(i);
        }

        var response = await browser.VerifyOtpAsync(phone, AuthKit.WrongCode(code));

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "tooManyAttempts");
        (await App.LatestCodeAsync(phone)).Attempts.ShouldBe(5);
    }

    [Fact]
    [Trait("Case", "AUTH-046")]
    public async Task A_code_killed_by_5_wrong_tries_refuses_the_right_code_and_a_new_code_works()
    {
        var (browser, phone, code) = await CodeForAsync();
        for (var i = 0; i < 5; i++)
            await browser.VerifyOtpAsync(phone, AuthKit.WrongCode(code));

        await (await browser.VerifyOtpAsync(phone, code)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "tooManyAttempts");

        Clock.Advance(TimeSpan.FromSeconds(60));
        var fresh = (await (await browser.RequestOtpAsync(phone)).ReadAsync<OtpRequestResponse>()).DevCode;
        await (await browser.VerifyOtpAsync(phone, fresh)).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-047")]
    public async Task Eight_parallel_wrong_guesses_never_count_more_than_5_attempts()
    {
        var (_, phone, code) = await CodeForAsync();
        var browsers = Enumerable.Range(0, 8).Select(_ => Anonymous()).ToList();

        var responses = await Task.WhenAll(browsers.Select(b => b.VerifyOtpAsync(phone, AuthKit.WrongCode(code))));

        foreach (var response in responses)
            response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await App.LatestCodeAsync(phone)).Attempts.ShouldBeLessThanOrEqualTo(5);
        await (await Anonymous().VerifyOtpAsync(phone, code)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "tooManyAttempts");
    }

    [Fact]
    [Trait("Case", "AUTH-048")]
    public async Task A_code_4_min_59_s_old_still_logs_in()
    {
        var (browser, phone, code) = await CodeForAsync();

        Clock.Advance(TimeSpan.FromMinutes(5) - TimeSpan.FromSeconds(1));

        await (await browser.VerifyOtpAsync(phone, code)).ShouldBeOkAsync();
    }

    [Theory]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-049")]
    [InlineData(300)]
    [InlineData(301)]
    [InlineData(3600)]
    public async Task A_code_5_minutes_old_or_more_is_expired(int seconds)
    {
        var (browser, phone, code) = await CodeForAsync();

        Clock.Advance(TimeSpan.FromSeconds(seconds));

        await (await browser.VerifyOtpAsync(phone, code)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "codeExpired");
    }

    [Fact]
    [Trait("Case", "AUTH-050")]
    public async Task An_expired_code_with_its_attempts_used_up_answers_too_many_attempts()
    {
        var (browser, phone, code) = await CodeForAsync();
        for (var i = 0; i < 5; i++)
            await browser.VerifyOtpAsync(phone, AuthKit.WrongCode(code));

        Clock.Advance(TimeSpan.FromMinutes(6));

        await (await browser.VerifyOtpAsync(phone, code)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "tooManyAttempts");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-051")]
    public async Task A_code_already_used_is_refused()
    {
        var (browser, phone, code) = await CodeForAsync();
        await (await browser.VerifyOtpAsync(phone, code)).ShouldBeOkAsync();

        var response = await Anonymous().VerifyOtpAsync(phone, code);

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
    }

    [Fact]
    [Trait("Case", "AUTH-051")]
    public async Task The_right_code_sent_8_times_in_parallel_logs_in_once()
    {
        var (_, phone, code) = await CodeForAsync();
        var browsers = Enumerable.Range(0, 8).Select(_ => Anonymous()).ToList();

        var responses = await Task.WhenAll(browsers.Select(b => b.VerifyOtpAsync(phone, code)));

        responses.Count(r => r.StatusCode == HttpStatusCode.OK).ShouldBe(1);
        foreach (var refused in responses.Where(r => r.StatusCode != HttpStatusCode.OK))
            await refused.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
    }

    [Fact]
    [Trait("Case", "AUTH-052")]
    public async Task A_phone_that_never_requested_a_code_is_refused()
    {
        var clinic = await Data.Clinic();

        var response = await Anonymous().VerifyOtpAsync(clinic.Owner.Phone, "123456");

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
    }

    [Theory]
    [Trait("Case", "AUTH-053")]
    [InlineData("")]
    [InlineData("abcdef")]
    [InlineData("12345")]
    [InlineData("1234567")]
    public async Task An_empty_lettered_or_wrong_length_code_is_a_counted_wrong_code(string typed)
    {
        var (browser, phone, _) = await CodeForAsync();

        var response = await browser.VerifyOtpAsync(phone, typed);

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
        (await App.LatestCodeAsync(phone)).Attempts.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "AUTH-053")]
    public async Task A_verify_without_a_code_is_a_counted_wrong_code()
    {
        var (browser, phone, _) = await CodeForAsync();

        var response = await browser.PostAsync("/api/v1/auth/otp/verify", new { phone });

        await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
        (await App.LatestCodeAsync(phone)).Attempts.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "AUTH-055")]
    public async Task Of_two_codes_requested_at_the_same_instant_only_the_second_counts()
    {
        // No resend wait (a restart with Otp:ResendSeconds = 0), the clock frozen: both codes have the same time
        var clinic = await Data.Clinic();
        await using var variant = App.CreateVariant(new Dictionary<string, string> { ["Otp:ResendSeconds"] = "0" });
        variant.Start();
        var browser = new ApiClient(variant);
        var first = (await (await browser.RequestOtpAsync(clinic.Owner.Phone)).ReadAsync<OtpRequestResponse>()).DevCode;
        var second = await NewerCodeAsync(browser, clinic.Owner.Phone, first, () => { });

        await (await browser.VerifyOtpAsync(clinic.Owner.Phone, first)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
        await (await browser.VerifyOtpAsync(clinic.Owner.Phone, second)).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-054")]
    public async Task The_right_code_typed_with_spaces_is_accepted()
    {
        var (browser, phone, code) = await CodeForAsync();

        var response = await browser.VerifyOtpAsync(phone, $" {code[..3]} {code[3..]} ");

        await response.ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-055")]
    public async Task Only_the_latest_code_counts()
    {
        var (browser, phone, codeA) = await CodeForAsync();
        var codeB = await NewerCodeAsync(browser, phone, codeA, () => Clock.Advance(TimeSpan.FromSeconds(60)));

        await (await browser.VerifyOtpAsync(phone, codeA)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
        await (await browser.VerifyOtpAsync(phone, codeB)).ShouldBeOkAsync();
    }

    /// <summary>
    /// A newer code for <paramref name="phone"/> that differs from <paramref name="older"/>: requested again (at most 3
    /// times, within the 5 codes an hour) only when the random code repeats by chance (about 1 in a million), so the
    /// "older code refused" half always runs. A generator that keeps giving the same code fails here.
    /// </summary>
    private static async Task<string> NewerCodeAsync(ApiClient browser, string phone, string older, Action beforeEachRequest)
    {
        var newer = older;
        for (var i = 0; i < 3 && newer == older; i++)
        {
            beforeEachRequest();
            newer = (await (await browser.RequestOtpAsync(phone)).ReadAsync<OtpRequestResponse>()).DevCode;
        }

        newer.ShouldNotBe(older, "3 new codes in a row equal to the older one: the codes are not random");
        return newer;
    }

    [Fact]
    [Trait("Case", "AUTH-056")]
    public async Task The_right_code_in_Arabic_Indic_digits_is_accepted()
    {
        var (browser, phone, code) = await CodeForAsync();
        var arabic = new string(code.Select(c => (char)('٠' + (c - '0'))).ToArray());

        var response = await browser.VerifyOtpAsync(phone, arabic);

        await response.ShouldBeOkAsync();
    }

    [Theory]
    [Trait("Case", "AUTH-057")]
    [InlineData("")]
    [InlineData("0100123")]
    [InlineData("not a phone")]
    public async Task Verifying_with_an_invalid_phone_is_an_invalid_phone(string phone)
    {
        var response = await Anonymous().VerifyOtpAsync(phone, "123456");

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidPhone");
        problem.Errors[0].Field.ShouldBe("phone");
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-058")]
    [Trait("Case", "AUTH-059")]
    public async Task A_phone_without_a_user_gets_no_access_no_session_no_user_and_the_code_stays_used()
    {
        var phone = Unique.Phone();
        var users = await App.QueryDbAsync(db => db.Users.CountAsync());
        var sessions = await App.QueryDbAsync(db => db.Sessions.CountAsync());
        var (browser, _, code) = await CodeForAsync(phone);

        var response = await browser.VerifyOtpAsync(phone, code);

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.Forbidden, "noAccess");
        problem.Body.ContainsKey("clinicNames").ShouldBeFalse();
        response.RefreshSetCookie().ShouldBeNull();
        browser.RefreshCookie.ShouldBeNull();
        (await App.QueryDbAsync(db => db.Sessions.CountAsync())).ShouldBe(sessions);
        (await App.QueryDbAsync(db => db.Users.CountAsync())).ShouldBe(users);
        (await App.QueryDbAsync(db => db.Users.AnyAsync(u => u.Phone == phone))).ShouldBeFalse();
        (await App.LatestCodeAsync(phone)).ConsumedAt.ShouldNotBeNull();
        await (await browser.VerifyOtpAsync(phone, code)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidCode");
    }

    [Fact]
    [Trait("Case", "AUTH-086")]
    public async Task A_login_sets_the_users_last_login_time()
    {
        var clinic = await Data.Clinic();
        Clock.Advance(TimeSpan.FromHours(3));

        await Login.OwnerAsync(clinic);

        (await App.QueryDbAsync(db => db.Users.Where(u => u.Id == clinic.Owner.UserId).Select(u => u.LastLoginAt).SingleAsync()))
            .ShouldBe(Clock.GetUtcNow().UtcDateTime);
    }

    [Fact]
    [Trait("Case", "AUTH-087")]
    public async Task A_login_deletes_the_sessions_that_ended_more_than_a_week_ago()
    {
        var clinic = await Data.Clinic();
        var loggedOut = await Login.StaffAsync(await Data.Staff(clinic));
        var loggedOutId = (await App.SessionOfAsync(loggedOut.AccessToken)).Id;
        await (await loggedOut.LogoutAsync()).ShouldBeAsync(HttpStatusCode.NoContent);
        var live = await Login.StaffAsync(await Data.Staff(clinic));
        var liveId = (await App.SessionOfAsync(live.AccessToken)).Id;
        Clock.Advance(TimeSpan.FromDays(1));
        var weekOut = await Login.StaffAsync(await Data.Staff(clinic));
        var weekOutId = (await App.SessionOfAsync(weekOut.AccessToken)).Id;
        await (await weekOut.LogoutAsync()).ShouldBeAsync(HttpStatusCode.NoContent);
        Clock.Advance(TimeSpan.FromDays(1));
        var recentlyOut = await Login.StaffAsync(await Data.Staff(clinic));
        var recentlyOutId = (await App.SessionOfAsync(recentlyOut.AccessToken)).Id;
        await (await recentlyOut.LogoutAsync()).ShouldBeAsync(HttpStatusCode.NoContent);

        // 8 days after the first logout, exactly 7 (not more) after the second, 6 after the third
        Clock.Advance(TimeSpan.FromDays(6));
        await Login.OwnerAsync(clinic);

        (await App.QueryDbAsync(db => db.Sessions.AnyAsync(s => s.Id == loggedOutId))).ShouldBeFalse();
        (await App.QueryDbAsync(db => db.Sessions.AnyAsync(s => s.Id == weekOutId))).ShouldBeTrue();
        (await App.QueryDbAsync(db => db.Sessions.AnyAsync(s => s.Id == recentlyOutId))).ShouldBeTrue();
        (await App.QueryDbAsync(db => db.Sessions.AnyAsync(s => s.Id == liveId))).ShouldBeTrue();

        // The live one expires 30 days after its login: exactly 7 days after that it is kept, then gone
        Clock.Advance(TimeSpan.FromDays(29));
        await Login.OwnerAsync(clinic);
        (await App.QueryDbAsync(db => db.Sessions.AnyAsync(s => s.Id == liveId))).ShouldBeTrue();

        Clock.Advance(TimeSpan.FromSeconds(1));
        await Login.OwnerAsync(clinic);
        (await App.QueryDbAsync(db => db.Sessions.AnyAsync(s => s.Id == liveId))).ShouldBeFalse();
    }
}
