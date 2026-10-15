using System.Text;
using System.Text.Json.Nodes;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Infrastructure.Identity;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// Hand-made access tokens for the authorization matrix ported from the M1.5 acceptance script: a real token's claims
/// changed, then signed with the app's key, another key, or not at all.
/// </summary>
public static class ForgedTokens
{
    /// <summary>The payload of <paramref name="token"/> changed by <paramref name="change"/>, signed with the app's key.</summary>
    public static string WithAppKey(AppFixture app, string token, Action<JsonObject> change = null) =>
        Sign(Change(token, change), JwtValidation.SigningKey(app.Factory.Services.GetRequiredService<AuthSettings>()));

    /// <summary>The same payload signed with another key.</summary>
    public static string WithOtherKey(string token) =>
        Sign(Change(token, null), new SymmetricSecurityKey(Encoding.UTF8.GetBytes("another-signing-key-that-is-long-enough-1234567890")));

    /// <summary>The same payload, <c>alg: none</c>, no signature.</summary>
    public static string Unsigned(string token) => new JsonWebTokenHandler().CreateToken(Change(token, null));

    private static string Change(string token, Action<JsonObject> change)
    {
        var payload = JsonNode.Parse(Base64UrlEncoder.Decode(new JsonWebToken(token).EncodedPayload)).AsObject();
        change?.Invoke(payload);
        return payload.ToJsonString();
    }

    private static string Sign(string payload, SecurityKey key) =>
        new JsonWebTokenHandler().CreateToken(payload, new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
}
