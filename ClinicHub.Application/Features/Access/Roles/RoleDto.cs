using ClinicHub.Application.Features.Access.Authorization;
using ClinicHub.Domain.Access;

namespace ClinicHub.Application.Features.Access.Roles;

/// <param name="Permissions">
/// The role's keys in catalog order (stored keys no longer in the catalog are left out); for the Owner role, which
/// stores none, every key: what it really grants.
/// </param>
/// <param name="StaffCount">Staff holding the role, active or not (what <c>roleInUse</c> checks).</param>
public record RoleDto(int Id, string Name, bool IsOwner, List<string> Permissions, int StaffCount);

public static class RoleMappings
{
    internal static RoleDto ToRoleDto(int id, string name, bool isOwner, IEnumerable<string> storedKeys, int staffCount)
    {
        var keys = isOwner ? PermissionCatalog.Keys : storedKeys.ToHashSet();
        return new RoleDto(id, name, isOwner,
            PermissionCatalog.All.Select(p => p.Key).Where(keys.Contains).ToList(), staffCount);
    }

    /// <summary>A loaded role (its <see cref="Role.Permissions"/> included).</summary>
    public static RoleDto ToDto(this Role role, int staffCount) =>
        ToRoleDto(role.Id, role.Name, role.IsOwner, role.Permissions.Select(p => p.Permission), staffCount);
}
