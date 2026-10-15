using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Identity.Users;
using ClinicHub.Domain.Access;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.StaffMembers.Commands.AddStaff;

/// <summary>
/// 400 before 409: an unknown role (<c>roleNotFound</c>), then <c>staffExists</c>; only then is a new user created.
/// Accepted (design D5): two adds of the same new phone at the same moment hit a unique index, one answers 500.
/// </summary>
internal sealed class AddStaffCommandHandler(
    IAppDbContext db,
    IUserAccounts userAccounts,
    IPhoneNormalizer phoneNormalizer,
    PlatformSettings platform,
    IAccessCache accessCache,
    IPostCommitActions postCommit) : ICommandHandler<AddStaffCommand, StaffMemberDto>
{
    public async Task<Result<StaffMemberDto>> Handle(AddStaffCommand command, CancellationToken cancellationToken)
    {
        // Valid: checked by the validator
        var phone = phoneNormalizer.Normalize(command.Phone, platform.DefaultRegion);
        var roleIds = command.RoleIds.Distinct().ToList();
        var roles = await db.Roles.WithIds(roleIds).ToListAsync(cancellationToken);
        if (roles.Count != roleIds.Count)
            return StaffErrors.RoleNotFound;
        if (await db.Staff.AnyAsync(s => s.User.Phone == phone, cancellationToken))
            return StaffErrors.StaffExists;

        var user = await userAccounts.GetOrCreateAsync(phone, cancellationToken);
        var staff = new Staff
        {
            UserId = user.Id,
            FullName = command.FullName.Trim(),
            Roles = roles.Select(role => new StaffRole { Role = role }).ToList(),
        };
        db.Staff.Add(staff);
        await db.SaveChangesAsync(cancellationToken);

        // Design D3 (the id is new, so nothing is cached for it yet: kept for the rule "staff changed → invalidate")
        var staffId = staff.Id;
        await postCommit.AddAsync(token => accessCache.InvalidateStaffAsync(staffId, token));
        return await db.Staff.AsNoTracking().Where(s => s.Id == staffId).SelectDto().FirstAsync(cancellationToken);
    }
}
