using System.Net;
using ClinicHub.Application.Features.Identity.Login.Commands.RequestOtp;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>Moving the test clock moves the app's time (OTP expiry and resend delay), without waiting.</summary>
[Collection(InfraCollectionA.Name)]
[Trait("Area", "infra")]
public class ClockTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task A_code_expires_when_the_clock_passes_its_expiry()
    {
        var clinic = await Data.Clinic();
        var browser = Anonymous();
        var code = await Login.CodeAsync(browser, clinic.Owner.Phone);

        Clock.Advance(TimeSpan.FromMinutes(5));

        (await (await browser.VerifyOtpAsync(clinic.Owner.Phone, code)).ShouldBeProblemAsync(HttpStatusCode.BadRequest, "codeExpired"))
            .Errors.ShouldHaveSingleItem();
    }

    [Fact]
    public async Task A_code_still_works_just_before_its_expiry()
    {
        var clinic = await Data.Clinic();
        var browser = Anonymous();
        var code = await Login.CodeAsync(browser, clinic.Owner.Phone);

        Clock.Advance(TimeSpan.FromMinutes(4) + TimeSpan.FromSeconds(55));

        await (await browser.VerifyOtpAsync(clinic.Owner.Phone, code)).ShouldBeOkAsync();
    }

    [Fact]
    public async Task The_resend_delay_follows_the_clock()
    {
        var browser = Anonymous();
        var phone = Harness.Builders.Unique.Phone();
        await (await browser.RequestOtpAsync(phone)).ShouldBeOkAsync();

        Clock.Advance(TimeSpan.FromSeconds(20));
        var refused = await browser.RequestOtpAsync(phone);
        await refused.ShouldBeProblemAsync(HttpStatusCode.TooManyRequests, "tooManyRequests");
        refused.Headers.RetryAfter?.Delta.ShouldBe(TimeSpan.FromSeconds(40));

        Clock.Advance(TimeSpan.FromSeconds(40));
        (await (await browser.RequestOtpAsync(phone)).ReadAsync<OtpRequestResponse>()).ResendAfterSeconds.ShouldBe(60);
    }
}
