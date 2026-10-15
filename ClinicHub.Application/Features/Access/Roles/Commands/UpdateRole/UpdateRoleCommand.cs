using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Access.Roles.Commands.UpdateRole;

/// <summary>
/// Renames the role and replaces its permissions (stored with their requirements). The Owner role is locked
/// (<c>roleLocked</c>). Its holders get the change on their next request (post-commit invalidation).
/// </summary>
public record UpdateRoleCommand(int Id, string Name, List<string> Permissions) : ICommand<RoleDto>;
