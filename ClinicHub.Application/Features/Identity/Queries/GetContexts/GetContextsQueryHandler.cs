using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Queries.GetContexts;

internal sealed class GetContextsQueryHandler(IAppDbContext db, SessionService sessions, ICurrentUser currentUser)
    : IQueryHandler<GetContextsQuery, List<ContextDto>>
{
    public async Task<Result<List<ContextDto>>> Handle(GetContextsQuery query, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == currentUser.UserId, cancellationToken);
        if (user is null)
            return CommonErrors.Unauthorized;
        return await sessions.GetContextsAsync(user, cancellationToken);
    }
}
