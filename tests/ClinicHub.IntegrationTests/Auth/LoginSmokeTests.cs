using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>The happy login (the example to copy: collection, area, tier and case tags, builders, a raw client).</summary>
[Collection(AuthCollection.Name)]
[Trait("Area", "auth")]
public class LoginSmokeTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "AUTH-036")]
    public async Task Staff_of_one_clinic_is_logged_straight_into_it()
    {
        var clinic = await Data.Clinic();
        var browser = Anonymous();
        var code = await Login.CodeAsync(browser, clinic.Owner.Phone);

        var response = await browser.VerifyOtpAsync(clinic.Owner.Phone, code);

        var auth = await response.ReadAsync<AuthResult>();
        auth.AccessToken.ShouldNotBeNullOrEmpty();
        auth.ExpiresAt.ShouldBe(Clock.GetUtcNow().UtcDateTime.AddMinutes(15), TimeSpan.FromSeconds(10));
        auth.Context.Type.ShouldBe("clinic");
        auth.Context.ClinicId.ShouldBe(clinic.Id);
        auth.Context.ClinicName.ShouldBe(clinic.Name);
        auth.Contexts.ShouldHaveSingleItem().ClinicId.ShouldBe(clinic.Id);
        response.Headers.GetValues("Set-Cookie").ShouldContain(c => c.StartsWith(AuthController.RefreshCookie + "="));
        browser.RefreshCookie.ShouldNotBeNullOrEmpty();
    }
}
