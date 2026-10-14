using System.Text;
using ClinicHub.Application.Common.Settings;
using Microsoft.IdentityModel.Tokens;

namespace ClinicHub.Infrastructure.Identity;

/// <summary>The access token's key and validation, shared by <see cref="TokenService"/> and the Api's JwtBearer handler.</summary>
public static class JwtValidation
{
    internal static SymmetricSecurityKey SigningKey(AuthSettings settings) =>
        new(Encoding.UTF8.GetBytes(settings.Jwt.SigningKey));

    /// <summary>Validation used by the Api's JwtBearer handler.</summary>
    public static TokenValidationParameters ValidationParameters(AuthSettings settings) => new()
    {
        ValidIssuer = settings.Jwt.Issuer,
        ValidAudience = settings.Jwt.Audience,
        IssuerSigningKey = SigningKey(settings),
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = AuthClaims.UserId,
    };
}
