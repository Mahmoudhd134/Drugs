using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Identity.Sessions.Commands.RefreshSession;

/// <summary>
/// Rotates the refresh token and re-checks the context. Commits on failure: a user who lost every
/// context gets their session revoked and a 401, and the revocation must stay.
/// </summary>
/// <param name="RefreshToken">From the refresh cookie (may be null).</param>
public record RefreshSessionCommand(string RefreshToken) : ICommand<SessionIssue>, ICommitOnFailure;
