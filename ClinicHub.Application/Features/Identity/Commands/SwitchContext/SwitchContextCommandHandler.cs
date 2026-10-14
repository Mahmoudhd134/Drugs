using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access;
using ClinicHub.Domain.Identity;
using ClinicHub.Domain.Platform;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Commands.SwitchContext;

/// <summary>
/// <see cref="IdentityErrors.SessionEnded"/> when the session is gone; <see cref="IdentityErrors.RefreshTokenRejected"/>
/// when the cookie is missing or another session's (<see cref="IdentityErrors.RefreshTokenRotated"/> when it was
/// just rotated); <see cref="AccessErrors.ClinicSuspended"/> or <see cref="AccessErrors.NoAccess"/> for a
/// context the user can't enter.
/// </summary>
internal sealed class SwitchContextCommandHandler(
    IAppDbContext db,
    SessionService sessions,
    MembershipService memberships,
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
            return IdentityErrors.SessionEnded;
        if (string.IsNullOrEmpty(command.RefreshToken))
            return IdentityErrors.RefreshTokenRejected;
        var hash = tokens.HashRefreshToken(command.RefreshToken);
        if (hash != session.RefreshTokenHash)
            return hash == session.PreviousRefreshTokenHash && session.RotatedAt > sessions.Now - SessionService.RotationGrace
                ? IdentityErrors.RefreshTokenRotated
                : IdentityErrors.RefreshTokenRejected;

        var contexts = await sessions.GetContextsAsync(session.User, cancellationToken);
        var target = contexts.FirstOrDefault(c => c.Matches(command.Type, command.ClinicId));
        if (target is null)
            return await IsSuspendedClinicOfAsync(session.User, command, cancellationToken)
                ? AccessErrors.ClinicSuspended
                : AccessErrors.NoAccess;

        SessionService.SetContext(session, target);
        return await sessions.IssueAsync(session, session.User, contexts, cancellationToken);
    }

    /// <summary>True when the requested clinic is one the user could enter, but it is suspended.</summary>
    private async Task<bool> IsSuspendedClinicOfAsync(User user, SwitchContextCommand command,
        CancellationToken cancellationToken)
    {
        if (command.Type != ContextTypes.Clinic || command.ClinicId is not { } clinicId)
            return false;
        var clinic = await db.Clinics.AsNoTracking().FirstOrDefaultAsync(c => c.Id == clinicId, cancellationToken);
        if (clinic is not { Status: ClinicStatus.Suspended })
            return false;
        return clinic.IsTemplate
            ? user.IsSuperAdmin
            : await memberships.IsActiveMemberAsync(user.Id, clinicId, cancellationToken);
    }
}
