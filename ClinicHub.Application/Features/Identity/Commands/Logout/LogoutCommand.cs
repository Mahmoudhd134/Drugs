using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Identity.Commands.Logout;

/// <summary>Revokes the session of this refresh token, if any (always succeeds).</summary>
/// <param name="RefreshToken">From the refresh cookie (may be null).</param>
public record LogoutCommand(string RefreshToken) : ICommand;
