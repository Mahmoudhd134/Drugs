using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Identity;

namespace ClinicHub.Application.Features.Identity.Sessions;

/// <summary>
/// What the session use cases share: the contexts a user may pick, and issuing tokens for a session.
/// The shared constants and the context setter are in <see cref="SessionRules"/>.
/// </summary>
internal interface ISessionService
{
    DateTime Now { get; }

    /// <summary>
    /// Each active clinic where the user is active staff (by name), then, for a super admin, the
    /// template clinic and the platform.
    /// </summary>
    Task<List<ContextDto>> GetContextsAsync(User user, CancellationToken cancellationToken);

    bool IsLive(Session session);

    /// <summary>
    /// Rotates the refresh token, slides the expiry, saves, and builds the access token.
    /// <see cref="IdentityErrors.RefreshTokenRotated"/> when another request rotated the same token first.
    /// </summary>
    Task<Result<SessionIssue>> IssueAsync(Session session, User user, List<ContextDto> contexts,
        CancellationToken cancellationToken);

    /// <summary>
    /// False when a concurrency token no longer matched (nothing was written). The transaction stays
    /// usable: EF found 0 rows, the database raised no error.
    /// </summary>
    Task<bool> TrySaveAsync(CancellationToken cancellationToken);
}
