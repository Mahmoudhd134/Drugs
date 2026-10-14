using System.Security.Cryptography;
using System.Text;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.Domain.Identity;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace ClinicHub.Infrastructure.Identity;

/// <summary>Access tokens (JWT, HS256) and refresh tokens (random, stored only as a SHA-256 hash).</summary>
public sealed class TokenService(AuthSettings settings, TimeProvider clock) : ITokenService
{
    private static readonly JsonWebTokenHandler Handler = new();
    private readonly SigningCredentials signingCredentials = new(JwtValidation.SigningKey(settings), SecurityAlgorithms.HmacSha256);

    public (string Token, DateTime ExpiresAt) CreateAccessToken(User user, Session session, int? staffId)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var expiresAt = now.AddMinutes(settings.AccessTokenMinutes);
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
            Issuer = settings.Jwt.Issuer,
            Audience = settings.Jwt.Audience,
            Claims = claims,
            IssuedAt = now,
            NotBefore = now,
            Expires = expiresAt,
            SigningCredentials = signingCredentials,
        });
        return (token, expiresAt);
    }

    public string NewRefreshToken() => Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));

    public string HashRefreshToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
