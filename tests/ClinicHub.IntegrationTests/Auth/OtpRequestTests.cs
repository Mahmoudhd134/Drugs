using System.Net;
using System.Security.Cryptography;
using System.Text;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Login;
using ClinicHub.Application.Features.Identity.Login.Commands.RequestOtp;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>
/// <c>POST /auth/otp/request</c>: phones accepted and refused, the resend wait and the hourly limit (exact boundaries on
/// the test clock), parallel requests, what is stored. Limits: the Testing settings (60 s, 5 per hour, 5 min).
/// </summary>
[Collection(AuthCollection2.Name)]
[Trait("Area", "auth")]
public class OtpRequestTests(AppFixture app) : IntegrationTest(app)
{
    private Task<int> CodeCountAsync() => App.QueryDbAsync(db => db.OtpCodes.CountAsync());

    private static string ArabicIndic(string digits) =>
        new(digits.Select(c => char.IsAsciiDigit(c) ? (char)('٠' + (c - '0')) : c).ToArray());

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-010")]
    public async Task A_valid_local_phone_gets_a_code_valid_5_minutes_with_a_60_s_resend_wait()
    {
        await Login.ClearCodesAsync("01001234567");

        var response = await Anonymous().RequestOtpAsync("01001234567");

        await response.ShouldBeOkAsync();
        var body = await response.ReadAsync<OtpRequestResponse>();
        body.ExpiresInSeconds.ShouldBe(300);
        body.ResendAfterSeconds.ShouldBe(60);
        body.DevCode.ShouldMatch(@"^[0-9]{6}$");
    }

    [Fact]
    [Trait("Case", "AUTH-011")]
    public async Task The_international_form_gets_a_code()
    {
        var phone = Unique.Phone();

        var response = await Anonymous().RequestOtpAsync(phone);

        await response.ShouldBeOkAsync();
        (await App.LatestCodeAsync(phone)).ShouldNotBeNull();
    }

    [Fact]
    [Trait("Case", "AUTH-011")]
    public async Task A_code_requested_with_the_local_form_verifies_with_the_international_form()
    {
        var clinic = await Data.Clinic();
        var browser = Anonymous();
        var code = (await (await browser.RequestOtpAsync(Unique.LocalPhone(clinic.Owner.Phone)))
            .ReadAsync<OtpRequestResponse>()).DevCode;

        var response = await browser.VerifyOtpAsync(clinic.Owner.Phone, code);

        await response.ShouldBeOkAsync();
    }

    [Theory]
    [Trait("Case", "AUTH-012")]
    [InlineData("")]
    [InlineData("abcdefghijk")]
    [InlineData("0100123")]
    [InlineData("010012345678")]
    public async Task An_invalid_phone_is_refused_and_no_code_is_stored(string phone)
    {
        var before = await CodeCountAsync();

        var response = await Anonymous().RequestOtpAsync(phone);

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidPhone");
        problem.Errors[0].Field.ShouldBe("phone");
        (await CodeCountAsync()).ShouldBe(before);
    }

    [Fact]
    [Trait("Case", "AUTH-013")]
    public async Task A_body_without_phone_is_an_invalid_phone()
    {
        var response = await Anonymous().PostAsync("/api/v1/auth/otp/request", new { });

        var problem = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidPhone");
        problem.Errors[0].Field.ShouldBe("phone");
    }

    public static TheoryData<int> Formats => new() { 0, 1, 2, 3 };

    [Theory]
    [Trait("Case", "AUTH-014")]
    [MemberData(nameof(Formats))]
    public async Task A_phone_typed_with_spaces_dashes_0020_or_Arabic_digits_is_the_same_E164_phone(int format)
    {
        var clinic = await Data.Clinic();
        var e164 = clinic.Owner.Phone;                 // +2011xxxxxxxx
        var local = Unique.LocalPhone(e164);           // 011xxxxxxxx
        var typed = format switch
        {
            0 => $"{local[..3]} {local[3..7]} {local[7..]}",           // 011 xxxx xxxx
            1 => $"{local[..3]}-{local[3..7]}-{local[7..]}",           // 011-xxxx-xxxx
            2 => $"0020 {local[1..4]} {local[4..7]} {local[7..]}",     // 0020 11x xxx xxxx
            _ => ArabicIndic(local),                                   // ٠١١…
        };
        var browser = Anonymous();

        var response = await browser.RequestOtpAsync(typed);

        await response.ShouldBeOkAsync();
        var code = (await response.ReadAsync<OtpRequestResponse>()).DevCode;
        (await App.LatestCodeAsync(e164)).ShouldNotBeNull();
        await (await browser.VerifyOtpAsync(local, code)).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-015")]
    public async Task A_phone_input_longer_than_40_characters_is_refused()
    {
        var local = Unique.LocalPhone(Unique.Phone());
        var tooLong = new string(' ', 41 - local.Length) + local;
        var longest = new string(' ', 40 - local.Length) + local;

        await (await Anonymous().RequestOtpAsync(tooLong)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "invalidPhone");
        await (await Anonymous().RequestOtpAsync(longest)).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-016")]
    public async Task A_valid_landline_gets_a_code()
    {
        await Login.ClearCodesAsync("0223456789");

        var response = await Anonymous().RequestOtpAsync("0223456789");

        await response.ShouldBeOkAsync();
        (await App.LatestCodeAsync("+20223456789")).ShouldNotBeNull();
    }

    [Fact]
    [Trait("Case", "AUTH-019")]
    public async Task A_phone_without_a_user_gets_the_same_answer_and_no_user_is_created()
    {
        var clinic = await Data.Clinic();
        var users = await App.QueryDbAsync(db => db.Users.CountAsync());
        var unknown = Unique.Phone();

        var known = await Anonymous().RequestOtpAsync(clinic.Owner.Phone);
        var response = await Anonymous().RequestOtpAsync(unknown);

        await response.ShouldBeOkAsync();
        var shape = (await response.ReadNodeAsync()).AsObject().Select(p => p.Key).Order().ToList();
        shape.ShouldBe((await known.ReadNodeAsync()).AsObject().Select(p => p.Key).Order().ToList());
        shape.ShouldBe(new[] { "devCode", "expiresInSeconds", "resendAfterSeconds" });
        (await App.QueryDbAsync(db => db.Users.CountAsync())).ShouldBe(users);
        (await App.QueryDbAsync(db => db.Users.AnyAsync(u => u.Phone == unknown))).ShouldBeFalse();
    }

    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-020")]
    public async Task A_second_code_within_60_s_is_refused_with_the_seconds_to_wait()
    {
        var browser = Anonymous();
        var phone = Unique.Phone();
        await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();

        Clock.Advance(TimeSpan.FromSeconds(20));
        var response = await browser.RequestOtpAsync(phone);

        await response.ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");
        response.Headers.RetryAfter.ShouldNotBeNull();
        response.Headers.RetryAfter.Delta.ShouldBe(TimeSpan.FromSeconds(40));
    }

    [Fact]
    [Trait("Case", "AUTH-021")]
    public async Task At_59_s_the_wait_is_1_s_and_at_exactly_60_s_a_new_code_is_given()
    {
        var browser = Anonymous();
        var phone = Unique.Phone();
        await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();

        Clock.Advance(TimeSpan.FromSeconds(59));
        var refused = await browser.RequestOtpAsync(phone);
        await refused.ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");
        refused.Headers.RetryAfter.ShouldNotBeNull();
        refused.Headers.RetryAfter.Delta.ShouldBe(TimeSpan.FromSeconds(1));

        Clock.Advance(TimeSpan.FromSeconds(1));
        await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();
    }

    /// <summary>5 codes, 10 minutes apart (the oldest at the start).</summary>
    private async Task<string> FiveCodesTenMinutesApartAsync(ApiClient browser)
    {
        var phone = Unique.Phone();
        for (var i = 0; i < 5; i++)
        {
            if (i > 0)
                Clock.Advance(TimeSpan.FromMinutes(10));
            await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();
        }
        return phone;
    }

    [Fact]
    [Trait("Case", "AUTH-022")]
    public async Task A_6th_code_within_the_hour_is_refused_until_the_oldest_turns_an_hour_old()
    {
        var browser = Anonymous();
        var phone = await FiveCodesTenMinutesApartAsync(browser);   // codes at 0, 10, 20, 30, 40 min

        Clock.Advance(TimeSpan.FromMinutes(10));                     // the oldest is 50 min old
        var response = await browser.RequestOtpAsync(phone);

        await response.ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");
        response.Headers.RetryAfter.ShouldNotBeNull();
        response.Headers.RetryAfter.Delta.ShouldBe(TimeSpan.FromSeconds(600));
    }

    [Fact]
    [Trait("Case", "AUTH-023")]
    public async Task When_the_oldest_of_5_codes_is_exactly_an_hour_old_a_new_code_is_given()
    {
        var browser = Anonymous();
        var phone = await FiveCodesTenMinutesApartAsync(browser);

        Clock.Advance(TimeSpan.FromMinutes(20) - TimeSpan.FromSeconds(1));   // the oldest is 59 min 59 s old
        var refused = await browser.RequestOtpAsync(phone);
        await refused.ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");
        refused.Headers.RetryAfter.ShouldNotBeNull();
        refused.Headers.RetryAfter.Delta.ShouldBe(TimeSpan.FromSeconds(1));

        Clock.Advance(TimeSpan.FromSeconds(1));                              // exactly an hour
        await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-024")]
    public async Task Limits_are_per_phone()
    {
        var browser = Anonymous();
        var limited = Unique.Phone();
        await (await browser.RequestOtpAsync(limited)).ShouldBeOkAsync();
        await (await browser.RequestOtpAsync(limited)).ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");

        await (await browser.RequestOtpAsync(Unique.Phone())).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-025")]
    public async Task A_refused_request_stores_no_code_and_the_previous_code_still_works()
    {
        var clinic = await Data.Clinic();
        var browser = Anonymous();
        var code = (await (await browser.RequestOtpAsync(clinic.Owner.Phone)).ReadAsync<OtpRequestResponse>()).DevCode;
        var before = await CodeCountAsync();

        Clock.Advance(TimeSpan.FromSeconds(20));
        await (await browser.RequestOtpAsync(clinic.Owner.Phone)).ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");

        (await CodeCountAsync()).ShouldBe(before);
        await (await browser.VerifyOtpAsync(clinic.Owner.Phone, code)).ShouldBeOkAsync();
    }

    [Fact]
    [Trait("Case", "AUTH-026")]
    public async Task Eight_parallel_requests_for_one_phone_give_one_code_and_seven_429()
    {
        var phone = Unique.Phone();
        var browsers = Enumerable.Range(0, 8).Select(_ => Anonymous()).ToList();

        var responses = await Task.WhenAll(browsers.Select(b => b.RequestOtpAsync(phone)));

        responses.Count(r => r.StatusCode == HttpStatusCode.OK).ShouldBe(1);
        responses.Count(r => r.StatusCode == HttpStatusCode.TooManyRequests).ShouldBe(7);
        (await App.QueryDbAsync(db => db.OtpCodes.CountAsync(c => c.Phone == phone))).ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "AUTH-027")]
    public async Task Codes_older_than_a_day_are_deleted_when_any_code_is_requested()
    {
        var old = Unique.Phone();
        var recent = Unique.Phone();
        await (await Anonymous().RequestOtpAsync(old)).ShouldBeOkAsync();
        Clock.Advance(TimeSpan.FromHours(23));
        await (await Anonymous().RequestOtpAsync(recent)).ShouldBeOkAsync();

        Clock.Advance(TimeSpan.FromHours(1) + TimeSpan.FromSeconds(1));
        await (await Anonymous().RequestOtpAsync(Unique.Phone())).ShouldBeOkAsync();

        (await App.QueryDbAsync(db => db.OtpCodes.CountAsync(c => c.Phone == old))).ShouldBe(0);
        (await App.QueryDbAsync(db => db.OtpCodes.CountAsync(c => c.Phone == recent))).ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "AUTH-028")]
    public async Task Only_an_HMAC_of_the_code_is_stored_expiring_5_minutes_later()
    {
        var phone = Unique.Phone();
        var code = (await (await Anonymous().RequestOtpAsync(phone)).ReadAsync<OtpRequestResponse>()).DevCode;

        var row = await App.LatestCodeAsync(phone);

        row.ShouldNotBeNull();
        var key = App.Factory.Services.GetRequiredService<OtpSettings>().HashKey;
        var expected = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(key), Encoding.UTF8.GetBytes($"{phone}:{code}")));
        row.CodeHash.ShouldBe(expected, StringCompareShould.IgnoreCase);
        row.CodeHash.ShouldNotContain(code);
        row.ExpiresAt.ShouldBe(Clock.GetUtcNow().UtcDateTime.AddMinutes(5));
        row.Attempts.ShouldBe(0);
        row.ConsumedAt.ShouldBeNull();
    }

    [Fact]
    [Trait("Case", "AUTH-029")]
    public async Task A_sender_that_throws_gives_500_and_stores_no_code()
    {
        var phone = Unique.Phone();
        await using var variant = App.CreateVariant(services: services =>
        {
            services.RemoveAll<IOtpSender>();
            services.AddSingleton<IOtpSender, FailingSender>();
        });

        var response = await new ApiClient(variant).RequestOtpAsync(phone);

        await response.ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
        (await App.QueryDbAsync(db => db.OtpCodes.CountAsync(c => c.Phone == phone))).ShouldBe(0);
    }

    private sealed class FailingSender : IOtpSender
    {
        public bool RevealsCode => true;

        public Task SendAsync(string phone, string code, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("SMS gateway down");
    }
}
