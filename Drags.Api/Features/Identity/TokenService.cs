using System.Security.Cryptography;
using System.Text;
using Drags.Api.Models;
using Drags.Api.Shared;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Drags.Api.Features.Identity;

/// <summary>Access tokens (JWT, HS256) and refresh tokens (random, stored only as a SHA-256 hash).</summary>
public class TokenService(AppSettings settings, TimeProvider clock)
{
    private static readonly JsonWebTokenHandler Handler = new();
    private readonly SigningCredentials _signingCredentials = new(SigningKey(settings), SecurityAlgorithms.HmacSha256);

    public static SymmetricSecurityKey SigningKey(AppSettings settings) =>
        new(Encoding.UTF8.GetBytes(settings.Auth.Jwt.SigningKey));

    /// <summary>Validation used by the JwtBearer handler.</summary>
    public static TokenValidationParameters ValidationParameters(AppSettings settings) => new()
    {
        ValidIssuer = settings.Auth.Jwt.Issuer,
        ValidAudience = settings.Auth.Jwt.Audience,
        IssuerSigningKey = SigningKey(settings),
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        ClockSkew = TimeSpan.FromSeconds(30),
        NameClaimType = AuthClaims.UserId,
    };

    /// <summary>A token for the session's current context (none chosen yet → no <c>ctx</c> claim).</summary>
    public (string Token, DateTime ExpiresAt) CreateAccessToken(User user, Session session, int? staffId)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var expiresAt = now.AddMinutes(settings.Auth.AccessTokenMinutes);
        var claims = new Dictionary<string, object>
        {
            [AuthClaims.UserId] = user.Id.ToString(),
            [AuthClaims.SessionId] = session.Id.ToString(),
        };
        if (session.ContextType is not null)
            claims[AuthClaims.Context] = session.ContextType;
        if (session.ContextType == ContextTypes.Clinic)
        {
            claims[AuthClaims.ClinicId] = session.ClinicId.ToString();
            if (staffId is not null)
                claims[AuthClaims.StaffId] = staffId.ToString();
        }
        if (session.ContextType == ContextTypes.Platform && user.IsSuperAdmin)
            claims[AuthClaims.SuperAdmin] = "true";

        var token = Handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = settings.Auth.Jwt.Issuer,
            Audience = settings.Auth.Jwt.Audience,
            Claims = claims,
            IssuedAt = now,
            NotBefore = now,
            Expires = expiresAt,
            SigningCredentials = _signingCredentials,
        });
        return (token, expiresAt);
    }

    public static string NewRefreshToken() => Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));

    public static string HashRefreshToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
