using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.Roles.Queries.GetRoles;

internal sealed class GetRolesQueryHandler(IAppDbContext db) : IQueryHandler<GetRolesQuery, List<RoleDto>>
{
    public async Task<Result<List<RoleDto>>> Handle(GetRolesQuery query, CancellationToken cancellationToken)
    {
        var roles = await db.Roles.AsNoTracking()
            .OrderByDescending(r => r.IsOwner).ThenBy(r => r.Name).ThenBy(r => r.Id)
            .Select(r => new
            {
                r.Id,
                r.Name,
                r.IsOwner,
                Keys = r.Permissions.Select(p => p.Permission).ToList(),
                StaffCount = db.StaffRoles.Count(sr => sr.RoleId == r.Id),
            })
            .ToListAsync(cancellationToken);
        return roles.Select(r => RoleMappings.ToRoleDto(r.Id, r.Name, r.IsOwner, r.Keys, r.StaffCount)).ToList();
    }
}
