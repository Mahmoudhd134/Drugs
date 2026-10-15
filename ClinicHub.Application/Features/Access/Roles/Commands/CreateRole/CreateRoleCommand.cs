using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Access.Roles.Commands.CreateRole;

/// <summary>
/// A new role in the current clinic. <paramref name="Permissions"/> are stored with their requirements (design D8);
/// an empty list is allowed (a role that grants nothing).
/// </summary>
public record CreateRoleCommand(string Name, List<string> Permissions) : ICommand<RoleDto>;
