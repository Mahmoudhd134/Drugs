using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Domain.Access;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.StaffMembers.Commands.UpdateStaff;

internal sealed class UpdateStaffCommandHandler(IAppDbContext db, IAccessCache accessCache, IPostCommitActions postCommit)
    : ICommandHandler<UpdateStaffCommand, StaffMemberDto>
{
    public async Task<Result<StaffMemberDto>> Handle(UpdateStaffCommand command, CancellationToken cancellationToken)
    {
        var staff = await db.Staff.WithRoles().FirstOrDefaultAsync(s => s.Id == command.Id, cancellationToken);
        if (staff is null)
            return StaffErrors.NotFound;
        var roleIds = command.RoleIds.Distinct().ToList();
        var roles = await db.Roles.WithIds(roleIds).ToListAsync(cancellationToken);
        if (roles.Count != roleIds.Count)
            return StaffErrors.RoleNotFound;

        // Valid: checked by the validator
        var isActive = command.IsActive!.Value;
        if (StaffRules.StopsBeingActiveOwner(staff, isActive && roles.Any(r => r.IsOwner))
            && !await db.Staff.ActiveOwners().AnyAsync(s => s.Id != staff.Id, cancellationToken))
            return StaffErrors.LastOwner;

        staff.FullName = command.FullName.Trim();
        staff.IsActive = isActive;
        // Only the changed rows (a role kept is neither deleted nor inserted again)
        var newIds = roles.Select(r => r.Id).ToHashSet();
        var currentIds = staff.Roles.Select(r => r.RoleId).ToHashSet();
        var removed = staff.Roles.Where(r => !newIds.Contains(r.RoleId)).ToList();
        var added = roles.Where(r => !currentIds.Contains(r.Id)).ToList();
        db.StaffRoles.RemoveRange(removed);
        staff.Roles.AddRange(added.Select(role => new StaffRole { Role = role }));
        // The staff row itself may be unchanged: its UpdatedAt moves anyway when its roles do
        if (removed.Count > 0 || added.Count > 0)
            db.Touch(staff);
        await db.SaveChangesAsync(cancellationToken);

        // Design D3: their next request reloads the active flag and the role list
        var staffId = staff.Id;
        await postCommit.AddAsync(token => accessCache.InvalidateStaffAsync(staffId, token));
        return await db.Staff.AsNoTracking().Where(s => s.Id == staffId).SelectDto().FirstAsync(cancellationToken);
    }
}
