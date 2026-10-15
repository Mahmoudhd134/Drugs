using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Sessions.Commands.SwitchContext;

/// <summary>
/// <see cref="IdentityErrors.SessionEnded"/> when the session is gone, unless the cookie belongs to another live
/// session (<see cref="IdentityErrors.RefreshTokenRejected"/>: that cookie must not be cleared, e.g. the user logged
/// out in one tab and in again in another, then used the stale tab); <see cref="IdentityErrors.RefreshTokenRejected"/>
/// when the cookie is missing or another session's (<see cref="IdentityErrors.RefreshTokenRotated"/> when it was
/// just rotated); for a context the user can't enter, the most specific reason
/// (<see cref="IMembershipService.GetEntryRefusalAsync"/>: <see cref="AccessErrors.ClinicSuspended"/>,
/// <see cref="AccessErrors.StaffInactive"/>, <see cref="AccessErrors.NoAccess"/>).
/// </summary>
internal sealed class SwitchContextCommandHandler(
    IAppDbContext db,
    ISessionService sessions,
    IMembershipService memberships,
    ITokenService tokens,
    ICurrentUser currentUser) : ICommandHandler<SwitchContextCommand, SessionIssue>
{
    public async Task<Result<SessionIssue>> Handle(SwitchContextCommand command, CancellationToken cancellationToken)
    {
        if (currentUser.UserId is not { } userId || currentUser.SessionId is not { } sessionId)
            return CommonErrors.Unauthorized;
        var session = await db.Sessions.Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId, cancellationToken);
        if (session is null || !sessions.IsLive(session))
            return await IsAnotherLiveSessionsCookieAsync(command.RefreshToken, sessionId, cancellationToken)
                ? IdentityErrors.RefreshTokenRejected
                : IdentityErrors.SessionEnded;
        if (string.IsNullOrEmpty(command.RefreshToken))
            return IdentityErrors.RefreshTokenRejected;
        var hash = tokens.HashRefreshToken(command.RefreshToken);
        if (hash != session.RefreshTokenHash)
            return hash == session.PreviousRefreshTokenHash && session.RotatedAt > sessions.Now - SessionRules.RotationGrace
                ? IdentityErrors.RefreshTokenRotated
                : IdentityErrors.RefreshTokenRejected;

        var contexts = await sessions.GetContextsAsync(session.User, cancellationToken);
        var target = contexts.FirstOrDefault(c => c.Matches(command.Type, command.ClinicId));
        if (target is null)
            return await RefusalAsync(session.User, command, cancellationToken);

        SessionRules.SetContext(session, target);
        return await sessions.IssueAsync(session, session.User, contexts, cancellationToken);
    }

    /// <summary>
    /// True when the cookie is the current (or previous) refresh token of another live session: the browser's cookie
    /// is then that session's, and clearing it would log that session out too.
    /// </summary>
    private async Task<bool> IsAnotherLiveSessionsCookieAsync(string refreshToken, Guid sessionId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
            return false;
        var hash = tokens.HashRefreshToken(refreshToken);
        var now = sessions.Now;
        return await db.Sessions.AsNoTracking().AnyAsync(s => s.Id != sessionId
            && s.RevokedAt == null && s.ExpiresAt > now
            && (s.RefreshTokenHash == hash || s.PreviousRefreshTokenHash == hash), cancellationToken);
    }

    /// <summary>
    /// Why the requested context can't be entered: for a clinic, <see cref="IMembershipService.GetEntryRefusalAsync"/>
    /// (which leaves the template out: a super admin always has it among their contexts, anyone else gets
    /// <c>noAccess</c>); the platform → <c>noAccess</c>.
    /// </summary>
    private async Task<Error> RefusalAsync(User user, SwitchContextCommand command, CancellationToken cancellationToken) =>
        command.Type == ContextTypes.Clinic && command.ClinicId is { } clinicId
            ? await memberships.GetEntryRefusalAsync(user.Id, clinicId, cancellationToken)
            : AccessErrors.NoAccess;
}
