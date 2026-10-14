using System.Text.Json.Serialization;

namespace ClinicHub.Application.Features.Identity.Sessions;

/// <summary>
/// What a login, refresh or context switch hands back: the body, and the refresh token for the cookie
/// (set by the Api; never part of a JSON body).
/// </summary>
public record SessionIssue(
    AuthResult Result,
    [property: JsonIgnore] string RefreshToken,
    [property: JsonIgnore] DateTime RefreshExpiresAt);
