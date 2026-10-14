using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access;
using ClinicHub.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Queries.GetMe;

internal sealed class GetMeQueryHandler(
    IAppDbContext db,
    SessionService sessions,
    ICurrentUser currentUser,
    IPermissionService permissions) : IQueryHandler<GetMeQuery, MeDto>
{
    public async Task<Result<MeDto>> Handle(GetMeQuery query, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == currentUser.UserId, cancellationToken);
        if (user is null)
            return CommonErrors.Unauthorized;

        var contexts = await sessions.GetContextsAsync(user, cancellationToken);
        var context = currentUser.IsClinic ? contexts.FirstOrDefault(c => c.Matches(ContextTypes.Clinic, currentUser.ClinicId))
            : currentUser.IsPlatform ? contexts.FirstOrDefault(c => c.Type == ContextTypes.Platform)
            : null;

        // The token's clinic is the request's clinic, so the normal clinic filter applies
        var staff = context is not null && currentUser.StaffId is { } staffId
            ? await db.Staff.AsNoTracking()
                .Where(s => s.Id == staffId && s.UserId == user.Id)
                .Select(s => new MeStaffDto(s.Id, s.FullName))
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        // Expanded keys in a clinic context (empty without access); none on the platform yet
        var permissionKeys = context is { Type: ContextTypes.Clinic }
            ? (await permissions.GetAsync(cancellationToken)).ToList()
            : [];
        return new MeDto(new MeUserDto(user.Id, user.Phone, user.IsSuperAdmin), context, staff, permissionKeys);
    }
}
