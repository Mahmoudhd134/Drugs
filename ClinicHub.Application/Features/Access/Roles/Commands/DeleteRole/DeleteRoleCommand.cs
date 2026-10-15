using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Access.Roles.Commands.DeleteRole;

/// <summary>
/// A real delete (its permission rows go with it). Not the Owner role (<c>roleLocked</c>), nor one that staff hold,
/// active or not (<c>roleInUse</c>).
/// </summary>
public record DeleteRoleCommand(int Id) : ICommand;
