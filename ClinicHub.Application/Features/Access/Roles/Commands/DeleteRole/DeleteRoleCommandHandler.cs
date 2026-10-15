using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access.Authorization;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.Roles.Commands.DeleteRole;

/// <summary>
/// Read, then write, no lock (accepted for the MVP, design § 6): a staff member given this role in the very same
/// instant would lose it again (the staff role's FK cascades). One super admin: not guarded.
/// </summary>
internal sealed class DeleteRoleCommandHandler(IAppDbContext db, IAccessCache accessCache, IPostCommitActions postCommit)
    : ICommandHandler<DeleteRoleCommand>
{
    public async Task<Result> Handle(DeleteRoleCommand command, CancellationToken cancellationToken)
    {
        var role = await db.Roles.FirstOrDefaultAsync(r => r.Id == command.Id, cancellationToken);
        if (role is null)
            return RoleErrors.NotFound;
        if (role.IsOwner)
            return RoleErrors.Locked;
        if (await db.StaffRoles.AnyAsync(sr => sr.RoleId == role.Id, cancellationToken))
            return RoleErrors.InUse;

        db.Roles.Remove(role);
        await db.SaveChangesAsync(cancellationToken);

        // Design D3: every entry of the clinic (its staff's role lists, the role's own entry)
        var clinicId = role.ClinicId;
        await postCommit.AddAsync(token => accessCache.InvalidateClinicAsync(clinicId, token));
        return Result.Success();
    }
}
