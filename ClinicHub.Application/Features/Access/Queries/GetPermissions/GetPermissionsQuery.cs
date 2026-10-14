using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Access.Queries.GetPermissions;

/// <summary>The permission catalog (labels are translated in the SPA).</summary>
public record GetPermissionsQuery : IQuery<IReadOnlyList<PermissionDefinition>>;
