using ClinicHub.Application.Features.Access.Authorization;

namespace ClinicHub.Application.Features.Access.Roles;

/// <summary>
/// The roles every clinic starts with (HLD 6): names and permissions only. Used by clinic provisioning
/// (<c>DefaultRolesSeeder</c> creates them). Role names are clinic data (not translated), like drug names.
/// </summary>
public static class DefaultRoles
{
    public const string Owner = "Owner";
    public const string Doctor = "Doctor";
    public const string Assistant = "Assistant";

    /// <summary>
    /// How the SPA shows the Owner role (its only translated name: English, Arabic; M1.6.0). No other role may be
    /// named like one of them (<see cref="RoleRules.IsOwnerLabel"/>), so two roles never look the same.
    /// </summary>
    public static readonly IReadOnlyList<string> OwnerLabels = [Owner, "المالك"];

    private static readonly string[] AssistantDenied = [Permissions.Drugs.Delete, Permissions.Protocols.Delete];

    /// <summary>Name → permissions; null = the Owner role (every permission, no rows).</summary>
    public static readonly IReadOnlyList<(string Name, IReadOnlyList<string> Permissions)> Templates =
    [
        (Owner, null),
        (Doctor, PermissionCatalog.All.Select(p => p.Key).ToList()),
        (Assistant, PermissionCatalog.All.Select(p => p.Key).Except(AssistantDenied).ToList()),
    ];
}
