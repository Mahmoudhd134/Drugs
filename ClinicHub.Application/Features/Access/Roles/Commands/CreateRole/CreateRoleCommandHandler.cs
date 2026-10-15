using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Access;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.Roles.Commands.CreateRole;

/// <summary>No cache invalidation: the role is new and no staff holds it yet.</summary>
internal sealed class CreateRoleCommandHandler(IAppDbContext db) : ICommandHandler<CreateRoleCommand, RoleDto>
{
    public async Task<Result<RoleDto>> Handle(CreateRoleCommand command, CancellationToken cancellationToken)
    {
        var name = command.Name.Trim();
        if (RoleRules.IsOwnerLabel(name) || await db.Roles.WithName(name).AnyAsync(cancellationToken))
            return RoleErrors.NameTaken;

        var role = new Role { Name = name };
        RoleRules.SetPermissions(role, command.Permissions);
        db.Roles.Add(role);
        await db.SaveChangesAsync(cancellationToken);
        return role.ToDto(0);
    }
}
