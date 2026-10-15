using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access.Authorization;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.Roles.Commands.UpdateRole;

internal sealed class UpdateRoleCommandHandler(IAppDbContext db, IAccessCache accessCache, IPostCommitActions postCommit)
    : ICommandHandler<UpdateRoleCommand, RoleDto>
{
    public async Task<Result<RoleDto>> Handle(UpdateRoleCommand command, CancellationToken cancellationToken)
    {
        var role = await db.Roles.Include(r => r.Permissions)
            .FirstOrDefaultAsync(r => r.Id == command.Id, cancellationToken);
        if (role is null)
            return RoleErrors.NotFound;
        if (role.IsOwner)
            return RoleErrors.Locked;

        var name = command.Name.Trim();
        if (await db.Roles.WithName(name).AnyAsync(r => r.Id != role.Id, cancellationToken))
            return RoleErrors.NameTaken;

        // A rename is tracked on the row itself; when only the permission rows changed, the role's UpdatedAt moves too
        role.Name = name;
        if (RoleRules.SetPermissions(role, command.Permissions))
            db.Touch(role);
        await db.SaveChangesAsync(cancellationToken);

        // Design D3: its holders' permissions come from this role's cached entry
        var roleId = role.Id;
        await postCommit.AddAsync(token => accessCache.InvalidateRoleAsync(roleId, token));
        return role.ToDto(await db.StaffRoles.CountAsync(sr => sr.RoleId == roleId, cancellationToken));
    }
}
