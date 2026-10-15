using System.Net;
using System.Text;
using ClinicHub.Application.Common.Settings;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>The access token check on protected routes: missing, garbage, forged, wrong issuer/audience, expired, unknown user.</summary>
[Collection(AuthCollection4.Name)]
[Trait("Area", "auth")]
public class AccessTokenTests(AppFixture app) : IntegrationTest(app)
{
    public static TheoryData<string> ProtectedRoutes => new() { "/api/v1/drugs", "/api/v1/me", "/api/v1/auth/contexts" };

    /// <summary>A token with the claims of <paramref name="client"/>'s token, signed and addressed as given.</summary>
    private string Forge(ApiClient client, string signingKey = null, string issuer = null, string audience = null)
    {
        var settings = App.Factory.Services.GetRequiredService<AuthSettings>();
        var original = AuthKit.Claims(client.AccessToken);
        var now = Clock.GetUtcNow().UtcDateTime;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer ?? settings.Jwt.Issuer,
            Audience = audience ?? settings.Jwt.Audience,
            Claims = original.Claims.Where(c => c.Type is "sub" or "sid" or "ctx" or "clinic_id" or "staff_id")
                .ToDictionary(c => c.Type, c => (object)c.Value),
            IssuedAt = now,
            NotBefore = now,
            Expires = now.AddMinutes(15),
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey ?? settings.Jwt.SigningKey)), SecurityAlgorithms.HmacSha256),
        });
    }

    [Theory]
    [Trait("Case", "AUTH-092")]
    [MemberData(nameof(ProtectedRoutes))]
    public async Task No_token_is_unauthorized(string route)
    {
        var response = await Anonymous().GetAsync(route);

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Theory]
    [Trait("Case", "AUTH-093")]
    [MemberData(nameof(ProtectedRoutes))]
    public async Task A_garbage_token_is_unauthorized(string route)
    {
        var browser = Anonymous();
        browser.AccessToken = "not.a.token";

        var response = await browser.GetAsync(route);

        await response.ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "AUTH-094")]
    public async Task A_token_signed_with_another_key_is_unauthorized()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        // Control: the same claims with the app's key pass
        owner.AccessToken = Forge(owner);
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        owner.AccessToken = Forge(owner, signingKey: "another-key-of-at-least-32-bytes-long-0123456789");

        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        await (await owner.GetAsync("/api/v1/me")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "AUTH-094")]
    public async Task An_unsigned_alg_none_token_is_unauthorized()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        var payload = owner.AccessToken.Split('.')[1];
        owner.AccessToken = $"{Base64UrlEncoder.Encode("{\"alg\":\"none\",\"typ\":\"JWT\"}")}.{payload}.";

        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        await (await owner.GetAsync("/api/v1/me")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Theory]
    [Trait("Case", "AUTH-095")]
    [InlineData("someone-else", null)]
    [InlineData(null, "someone-else")]
    public async Task A_token_with_a_wrong_issuer_or_audience_is_unauthorized(string issuer, string audience)
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());
        owner.AccessToken = Forge(owner, issuer: issuer, audience: audience);

        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "AUTH-096")]
    public async Task A_token_is_accepted_until_15_min_plus_the_30_s_skew()
    {
        var owner = await Login.OwnerAsync(await Data.Clinic());

        Clock.Advance(TimeSpan.FromMinutes(15) + TimeSpan.FromSeconds(29));
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeOkAsync();

        Clock.Advance(TimeSpan.FromSeconds(2));
        await (await owner.GetAsync("/api/v1/drugs")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }

    [Fact]
    [Trait("Case", "AUTH-097")]
    public async Task A_valid_token_of_a_user_that_no_longer_exists_is_unauthorized_on_me_and_contexts()
    {
        var clinic = await Data.Clinic();
        var staff = await Data.Staff(clinic);
        var browser = await Login.StaffAsync(staff);
        await Data.RemoveStaffAsync(staff);
        // Deleted by hand (the app never deletes users); its sessions go with it (cascade)
        (await App.OutsideTheApp.ExecuteAsync("DELETE FROM \"Users\" WHERE \"Id\" = @p0", staff.UserId)).ShouldBe(1);

        await (await browser.GetAsync("/api/v1/me")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
        await (await browser.GetAsync("/api/v1/auth/contexts")).ShouldBeProblemAsync(HttpStatusCode.Unauthorized, "unauthorized");
    }
}
