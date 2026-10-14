using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Sessions.Commands.Logout;

internal sealed class LogoutCommandHandler(IAppDbContext db, ISessionService sessions, ITokenService tokens)
    : ICommandHandler<LogoutCommand>
{
    public async Task<Result> Handle(LogoutCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(command.RefreshToken))
            return Result.Success();
        var hash = tokens.HashRefreshToken(command.RefreshToken);
        var now = sessions.Now;
        // By id, without the token's concurrency check: a refresh rotating it meanwhile can't undo the logout
        var graceStart = now - SessionRules.RotationGrace;
        var sessionId = await db.Sessions
            .Where(s => s.RefreshTokenHash == hash
                        || (s.PreviousRefreshTokenHash == hash && s.RotatedAt > graceStart))
            .Select(s => (Guid?)s.Id).FirstOrDefaultAsync(cancellationToken);
        if (sessionId is not null)
            await db.Sessions.Where(s => s.Id == sessionId && s.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now).SetProperty(x => x.UpdatedAt, now),
                    cancellationToken);
        return Result.Success();
    }
}
