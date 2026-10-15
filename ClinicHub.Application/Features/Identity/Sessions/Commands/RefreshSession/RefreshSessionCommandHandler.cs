using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Sessions.Commands.RefreshSession;

/// <summary>
/// A lost context is cleared, or replaced when only one is left. <see cref="IdentityErrors.SessionEnded"/>
/// when the token is unknown, expired or revoked; <see cref="IdentityErrors.NoContexts"/> when the user has lost
/// every context (the session is then revoked); <see cref="IdentityErrors.RefreshTokenRotated"/> when a parallel
/// call rotated it moments ago.
/// </summary>
internal sealed class RefreshSessionCommandHandler(IAppDbContext db, ISessionService sessions, ITokenService tokens)
    : ICommandHandler<RefreshSessionCommand, SessionIssue>
{
    public async Task<Result<SessionIssue>> Handle(RefreshSessionCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(command.RefreshToken))
            return IdentityErrors.SessionEnded;
        var hash = tokens.HashRefreshToken(command.RefreshToken);
        var session = await db.Sessions.Include(s => s.User)
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == hash, cancellationToken);
        if (session is null)
            return await WasJustRotatedAsync(hash, cancellationToken)
                ? IdentityErrors.RefreshTokenRotated
                : IdentityErrors.SessionEnded;
        if (!sessions.IsLive(session))
            return IdentityErrors.SessionEnded;

        var contexts = await sessions.GetContextsAsync(session.User, cancellationToken);
        if (contexts.Count == 0)
        {
            // Kept although the command fails: it is ICommitOnFailure
            session.RevokedAt = sessions.Now;
            await sessions.TrySaveAsync(cancellationToken);
            return IdentityErrors.NoContexts;
        }

        var current = contexts.FirstOrDefault(c => c.Matches(session.ContextType, session.ClinicId));
        SessionRules.SetContext(session, current ?? (contexts.Count == 1 ? contexts[0] : null));
        return await sessions.IssueAsync(session, session.User, contexts, cancellationToken);
    }

    /// <summary>A live session rotated this token moments ago (a parallel call won the race).</summary>
    private Task<bool> WasJustRotatedAsync(string hash, CancellationToken cancellationToken)
    {
        var now = sessions.Now;
        var graceStart = now - SessionRules.RotationGrace;
        return db.Sessions.AnyAsync(s => s.PreviousRefreshTokenHash == hash && s.RotatedAt > graceStart
                                         && s.RevokedAt == null && s.ExpiresAt > now, cancellationToken);
    }
}
