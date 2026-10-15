using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Access.Roles.Queries.GetRoles;

/// <summary>The current clinic's roles: the Owner first, then by name.</summary>
public record GetRolesQuery : IQuery<List<RoleDto>>;
