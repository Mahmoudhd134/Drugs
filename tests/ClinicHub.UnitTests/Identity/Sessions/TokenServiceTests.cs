using ClinicHub.Application.Common.Settings;
using ClinicHub.Domain.Identity;
using ClinicHub.Infrastructure.Identity;
using ClinicHub.UnitTests.TestSupport;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Shouldly;

namespace ClinicHub.UnitTests.Identity.Sessions;

/// <summary>
/// Access and refresh tokens (auth tech § Backend): JWT HS256 with the configured issuer/audience, 15 minutes, claims by
/// context; refresh tokens of 32 random bytes stored only as their SHA-256.
/// </summary>
[Trait("Area", "auth")]
public class TokenServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 15, 9, 30, 0, TimeSpan.Zero);

    private static readonly AuthSettings Settings = new()
    {
        Jwt = new JwtSettings
            { Issuer = "clinichub-test", Audience = "clinichub-test-spa", SigningKey = "unit-test-signing-key-of-32-bytes!!" },
    };

    private static TokenService Service() => new(Settings, new FixedClock(Now));

    private static JsonWebToken Read(string token) => new JsonWebTokenHandler().ReadJsonWebToken(token);

    private static readonly User Doctor = new() { Id = 42 };

    [Fact]
    [Trait("Case", "AUTH-043")]
    public void An_access_token_is_HS256_with_the_configured_issuer_and_audience_for_15_minutes()
    {
        var session = new Session { Id = Guid.NewGuid(), ContextType = ContextTypes.Clinic, ClinicId = 7 };

        var (token, expiresAt) = Service().CreateAccessToken(Doctor, session, staffId: 9);

        var jwt = Read(token);
        jwt.Alg.ShouldBe(SecurityAlgorithms.HmacSha256);
        jwt.Issuer.ShouldBe("clinichub-test");
        jwt.Audiences.ShouldBe(["clinichub-test-spa"]);
        jwt.IssuedAt.ShouldBe(Now.UtcDateTime);
        jwt.ValidTo.ShouldBe(Now.UtcDateTime.AddMinutes(15));
        expiresAt.ShouldBe(Now.UtcDateTime.AddMinutes(15));
    }

    [Fact]
    [Trait("Case", "AUTH-043")]
    public async Task The_token_is_signed_with_the_configured_key()
    {
        var (token, _) = Service().CreateAccessToken(Doctor, new Session { Id = Guid.NewGuid() }, null);
        var parameters = JwtValidation.ValidationParameters(Settings);
        parameters.ValidateLifetime = false; // the clock is fixed in the past; lifetime is asserted above

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(token, parameters);

        result.IsValid.ShouldBeTrue(result.Exception?.Message);
        var wrongKey = JwtValidation.ValidationParameters(new AuthSettings
            { Jwt = new JwtSettings { Issuer = "clinichub-test", Audience = "clinichub-test-spa", SigningKey = new string('k', 40) } });
        wrongKey.ValidateLifetime = false;
        (await new JsonWebTokenHandler().ValidateTokenAsync(token, wrongKey)).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void The_lifetime_follows_the_setting()
    {
        var settings = new AuthSettings { Jwt = Settings.Jwt, AccessTokenMinutes = 5 };

        var (token, expiresAt) = new TokenService(settings, new FixedClock(Now)).CreateAccessToken(Doctor, new Session(), null);

        expiresAt.ShouldBe(Now.UtcDateTime.AddMinutes(5));
        Read(token).ValidTo.ShouldBe(Now.UtcDateTime.AddMinutes(5));
    }

    [Fact]
    public void A_clinic_token_has_the_clinic_and_staff_claims_only()
    {
        var session = new Session { Id = Guid.NewGuid(), ContextType = ContextTypes.Clinic, ClinicId = 7 };
        var superAdmin = new User { Id = 42, IsSuperAdmin = true };

        var jwt = Read(Service().CreateAccessToken(superAdmin, session, staffId: 9).Token);

        jwt.GetClaim("sub").Value.ShouldBe("42");
        jwt.GetClaim("sid").Value.ShouldBe(session.Id.ToString());
        jwt.GetClaim("ctx").Value.ShouldBe("clinic");
        jwt.GetClaim("clinic_id").Value.ShouldBe("7");
        jwt.GetClaim("staff_id").Value.ShouldBe("9");
        jwt.TryGetClaim("super_admin", out _).ShouldBeFalse("only platform tokens say super_admin");
    }

    [Fact]
    public void The_template_context_has_no_staff_claim()
    {
        var session = new Session { Id = Guid.NewGuid(), ContextType = ContextTypes.Clinic, ClinicId = 1 };

        var jwt = Read(Service().CreateAccessToken(new User { Id = 1, IsSuperAdmin = true }, session, staffId: null).Token);

        jwt.GetClaim("clinic_id").Value.ShouldBe("1");
        jwt.TryGetClaim("staff_id", out _).ShouldBeFalse();
    }

    [Fact]
    public void A_platform_token_says_super_admin_and_no_clinic()
    {
        var session = new Session { Id = Guid.NewGuid(), ContextType = ContextTypes.Platform };

        var jwt = Read(Service().CreateAccessToken(new User { Id = 1, IsSuperAdmin = true }, session, staffId: 3).Token);

        jwt.GetClaim("ctx").Value.ShouldBe("platform");
        jwt.GetClaim("super_admin").Value.ShouldBe("true");
        jwt.TryGetClaim("clinic_id", out _).ShouldBeFalse();
        jwt.TryGetClaim("staff_id", out _).ShouldBeFalse();
    }

    [Fact]
    public void A_platform_token_of_a_user_no_longer_super_admin_does_not_say_so()
    {
        var session = new Session { Id = Guid.NewGuid(), ContextType = ContextTypes.Platform };

        var jwt = Read(Service().CreateAccessToken(new User { Id = 1 }, session, null).Token);

        jwt.TryGetClaim("super_admin", out _).ShouldBeFalse();
    }

    [Fact]
    public void A_token_before_a_context_is_chosen_has_no_context_claims()
    {
        var jwt = Read(Service().CreateAccessToken(Doctor, new Session { Id = Guid.NewGuid() }, staffId: 9).Token);

        jwt.GetClaim("sub").Value.ShouldBe("42");
        jwt.TryGetClaim("ctx", out _).ShouldBeFalse();
        jwt.TryGetClaim("clinic_id", out _).ShouldBeFalse();
        jwt.TryGetClaim("staff_id", out _).ShouldBeFalse();
        jwt.TryGetClaim("super_admin", out _).ShouldBeFalse();
    }

    [Fact]
    public void Refresh_tokens_are_32_random_bytes_in_base64url()
    {
        var service = Service();

        var tokens = Enumerable.Range(0, 20).Select(_ => service.NewRefreshToken()).ToList();

        tokens.ShouldBeUnique();
        tokens.ShouldAllBe(t => Base64UrlEncoder.DecodeBytes(t).Length == 32);
        tokens.ShouldAllBe(t => !t.Contains('+') && !t.Contains('/') && !t.Contains('='));
    }

    [Fact]
    public void Only_the_SHA256_of_a_refresh_token_is_stored()
    {
        // Reference value computed outside .NET (Python hashlib)
        Service().HashRefreshToken("refresh-token-1")
            .ShouldBe("154F43E8C9B56A01E25DCBA6F7AEF62D23A3E91264E818124F6ADF721D6A8E33");
    }
}
