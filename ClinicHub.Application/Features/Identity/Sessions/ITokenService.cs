using ClinicHub.Domain.Identity;

namespace ClinicHub.Application.Features.Identity.Sessions;

/// <summary>
/// Access tokens (JWT) and refresh tokens (random, stored only as a hash). Implemented in
/// Infrastructure, which also owns the claim names.
/// </summary>
public interface ITokenService
{
    /// <summary>A token for the session's current context (none chosen yet → no context claim).</summary>
    (string Token, DateTime ExpiresAt) CreateAccessToken(User user, Session session, int? staffId);

    string NewRefreshToken();

    /// <summary>What is stored and compared: never the token itself.</summary>
    string HashRefreshToken(string token);
}
