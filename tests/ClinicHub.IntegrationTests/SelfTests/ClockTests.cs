using System.Net;
using ClinicHub.Application.Features.Identity.Login.Commands.RequestOtp;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>
/// The test clock is the app's only clock: frozen during a test, moved by <c>Clock.Advance</c> (no waiting), and every
/// stamp and check follows it (rows, OTP limits and expiry, access tokens), so time spans are exact.
/// </summary>
[Collection(InfraCollectionA.Name)]
[Trait("Area", "infra")]
public class ClockTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task The_clock_is_frozen_and_rows_are_stamped_with_it()
    {
        var now = Clock.GetUtcNow();
        (now - DateTimeOffset.UtcNow).Duration().ShouldBeLessThan(TimeSpan.FromSeconds(5));
        now.Ticks.ShouldBe(now.Ticks - now.Ticks % TimeSpan.TicksPerSecond);

        Clock.Advance(TimeSpan.FromDays(3));
        var clinic = await Data.Clinic();

        Clock.GetUtcNow().ShouldBe(now + TimeSpan.FromDays(3));
        var stamps = await App.QueryDbAsync(db => db.Clinics.Where(c => c.Id == clinic.Id)
            .Select(c => new { c.CreatedAt, c.UpdatedAt }).SingleAsync());
        stamps.CreatedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
        stamps.UpdatedAt.ShouldBe(Clock.GetUtcNow().UtcDateTime);
    }

    [Fact]
    public async Task A_code_expires_when_the_clock_passes_its_expiry()
    {
        var clinic = await Data.Clinic();
        var browser = Anonymous();
        var code = await Login.CodeAsync(browser, clinic.Owner.Phone);

        Clock.Advance(TimeSpan.FromMinutes(5) + TimeSpan.FromSeconds(1));

        (await (await browser.VerifyOtpAsync(clinic.Owner.Phone, code)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "codeExpired"))
            .Errors.ShouldHaveSingleItem();
    }

    [Fact]
    public async Task A_code_still_works_just_before_its_expiry()
    {
        var clinic = await Data.Clinic();
        var browser = Anonymous();
        var code = await Login.CodeAsync(browser, clinic.Owner.Phone);

        Clock.Advance(TimeSpan.FromMinutes(5) - TimeSpan.FromSeconds(1));

        await (await browser.VerifyOtpAsync(clinic.Owner.Phone, code)).ShouldBeOkAsync();
    }

    [Fact]
    public async Task The_resend_delay_follows_the_clock()
    {
        var browser = Anonymous();
        var phone = Unique.Phone();
        await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();

        Clock.Advance(TimeSpan.FromSeconds(20));
        var refused = await browser.RequestOtpAsync(phone);
        await refused.ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");
        refused.Headers.RetryAfter.ShouldNotBeNull();
        refused.Headers.RetryAfter.Delta.ShouldBe(TimeSpan.FromSeconds(40));

        Clock.Advance(TimeSpan.FromSeconds(40));
        (await (await browser.RequestOtpAsync(phone)).ReadAsync<OtpRequestResponse>()).ResendAfterSeconds.ShouldBe(60);
    }

    [Fact]
    public async Task The_resend_delay_still_holds_for_a_code_requested_after_an_advance()
    {
        var browser = Anonymous();
        var phone = Unique.Phone();
        Clock.Advance(TimeSpan.FromSeconds(60));
        await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();

        var refused = await browser.RequestOtpAsync(phone);

        await refused.ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");
        refused.Headers.RetryAfter.ShouldNotBeNull();
        refused.Headers.RetryAfter.Delta.ShouldBe(TimeSpan.FromSeconds(60));
    }

    [Fact]
    public async Task The_hourly_limit_still_holds_after_an_hour_advance()
    {
        var browser = Anonymous();
        var phone = Unique.Phone();
        Clock.Advance(TimeSpan.FromHours(1));
        for (var i = 0; i < 5; i++)
        {
            await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();
            Clock.Advance(TimeSpan.FromSeconds(61));
        }

        var refused = await browser.RequestOtpAsync(phone);

        await refused.ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");
        refused.Headers.RetryAfter.ShouldNotBeNull();
        // The oldest code is 5 × 61 s old: it leaves the hour 3600 - 305 s later
        refused.Headers.RetryAfter.Delta.ShouldBe(TimeSpan.FromSeconds(3600 - 305));
    }

    [Fact]
    public async Task A_token_issued_after_an_advance_is_accepted()
    {
        var clinic = await Data.Clinic();
        Clock.Advance(TimeSpan.FromDays(2));

        var owner = await Login.OwnerAsync(clinic);

        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }

    [Fact]
    public async Task An_access_token_expires_on_the_test_clock_after_its_lifetime_and_the_skew()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        // 15 min lifetime + 30 s clock skew
        Clock.Advance(TimeSpan.FromMinutes(15) + TimeSpan.FromSeconds(30));
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
        Clock.Advance(TimeSpan.FromSeconds(1));
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");

        // The session (30 days) is still alive: a refresh gives a working token again
        await (await owner.RefreshAsync()).ShouldBeOkAsync();
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();
    }
}
